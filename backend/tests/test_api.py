import json
import os
from pathlib import Path
import sqlite3
import subprocess
import time

import pytest
from fastapi.testclient import TestClient
from backend.main import create_app

ORIGIN = 'http://localhost:3000'
PASSWORD = 'test-password-long-12345'

@pytest.fixture
def env(tmp_path, monkeypatch):
    for key, val in {'NODE_ENV':'development','DATA_DIR':str(tmp_path), 'MAIL_PROVIDER':'file',
                     'APP_URL':ORIGIN,'PUBLIC_APP_URL':ORIGIN,'COOKIE_CROSS_SITE':'false'}.items():
        monkeypatch.setenv(key,val)
    return tmp_path

@pytest.fixture
def client(env):
    with TestClient(create_app(), headers={'Origin':ORIGIN}) as c:
        yield c

def signup(c, directory, email='person@example.test'):
    r = c.post('/api/auth/register',json={'email':email,'name':'Test','password':PASSWORD,'timeZone':'America/Chicago'})
    assert r.status_code == 202, r.text
    msg = None
    for _ in range(100):
        messages = [json.loads(p.read_text()) for p in (directory/'mail').glob('*.json')]
        msg = next((m for m in messages if m['to'] == email and m['subject'] == 'Confirm your Cash Diet email'), None)
        if msg:
            break
        time.sleep(.02)
    assert msg is not None
    token = msg['text'].split('#verify-email=')[1].split()[0]
    assert c.post('/api/auth/verify-email',json={'token':token,'password':PASSWORD}).status_code == 200
    assert c.post('/api/auth/login',json={'email':email,'password':PASSWORD}).status_code == 200
    return c.cookies.get('cashdiet_session')

def ledger(c):
    snap = c.get('/api/workspace').json()
    snap['ledger']['budgets'] = {'Food':{'id':'food','name':'Food','balance':420,'openingBalanceCents':50000,'created':'2026-01-01'}}
    from datetime import datetime
    from zoneinfo import ZoneInfo
    day = datetime.now(ZoneInfo('America/Chicago')).strftime('%Y-%m-%d')
    snap['ledger']['transactions'] = [{'id':'x','budget':'Food','budgetId':'food','type':'expense','amount':80,'date':day,'description':'Groceries','recurrence':'one-time','status':'posted'}]
    r = c.put('/api/workspace',json=snap)
    assert r.status_code == 200, r.text
    return r.json()

def test_auth_storage_alerts_and_conflict(client, env):
    c = client
    assert c.get('/api/health').json()['framework'] == 'fastapi'
    assert c.get('/api/workspace').status_code == 401
    signup(c,env)
    snap = ledger(c)
    initial = c.get('/api/spending-guard').json()
    assert initial['version'] == 0
    prefs = {'rules':{'food':{'limit':100,'reserve':450}},'acknowledged':[]}
    r = c.put('/api/spending-guard',json={'version':0,'preferences':prefs})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data['version'] == 1
    assert data['states'][0]['spent'] == 8000
    assert len(data['states'][0]['alerts']) == 2
    assert c.put('/api/spending-guard',json={'version':0,'preferences':prefs}).status_code == 409
    assert c.put('/api/workspace',json={**snap, 'version':1}).status_code == 409
    invalid = {'rules':{'food':{'limit':-1,'reserve':0}},'acknowledged':[]}
    assert c.put('/api/spending-guard',json={'version':1,'preferences':invalid}).status_code == 400
    # A second client with the same session reads preferences and authoritative alerts.
    session = c.cookies.get('cashdiet_session')
    c.cookies.clear()
    assert c.get('/api/spending-guard').status_code == 401
    c.cookies.set('cashdiet_session',session)
    assert c.get('/api/spending-guard').json()['preferences'] == prefs
    assert c.get('/api/spending-guard?roomId=personal:someone-else').status_code == 404
    response = c.get('/api/workspace')
    assert response.headers['cache-control'] == 'no-store'
    assert response.headers['referrer-policy'] == 'no-referrer'

def test_csrf_cors_payload_and_logout(client,env):
    c = client
    signup(c,env)
    assert c.put('/api/workspace',json={},headers={'Origin':'https://evil.example'}).status_code == 403
    assert c.post('/api/auth/logout',content='{}',headers={'Content-Type':'text/plain'}).status_code == 415
    assert c.post('/api/auth/logout',content='{',headers={'Content-Type':'application/json'}).status_code == 400
    assert c.post('/api/auth/login',content='x'*17000,headers={'Content-Type':'application/json'}).status_code == 413
    assert c.options('/api/workspace',headers={'Access-Control-Request-Method':'PUT'}).status_code == 204
    token = c.cookies.get('cashdiet_session')
    assert c.post('/api/auth/logout',headers={'Content-Type':'application/json'}).status_code == 200
    c.cookies.set('cashdiet_session',token)
    assert c.get('/api/workspace').status_code == 401

def test_room_permissions_and_individual_preferences(client, env):
    c = client
    owner = signup(c,env)
    snap = ledger(c)
    room = c.post('/api/rooms',json={'ledger':snap['ledger']}).json()
    rid, invitation = room['roomId'], room['invitation'].split('.')[1]
    c.cookies.clear()
    signup(c,env,'other@example.test')
    assert c.get(f'/api/rooms/{rid}').status_code == 404
    assert c.post(f'/api/rooms/{rid}/join',json={'token':'0'*64}).status_code == 403
    assert c.post(f'/api/rooms/{rid}/join',json={'token':invitation}).status_code == 200
    prefs = {'rules':{'food':{'limit':90,'reserve':0}},'acknowledged':[]}
    assert c.put('/api/spending-guard?roomId='+rid,json={'version':0,'preferences':prefs}).status_code == 200
    member = c.get('/api/auth/me').json()['user']['id']
    member_token = c.cookies.get('cashdiet_session')
    c.cookies.clear(); c.cookies.set('cashdiet_session',owner)
    assert c.get('/api/spending-guard?roomId='+rid).json()['version'] == 0
    assert c.request('DELETE',f'/api/rooms/{rid}/members/{member}',json={}).status_code == 200
    c.cookies.clear();c.cookies.set('cashdiet_session',member_token)
    assert c.get('/api/spending-guard?roomId='+rid).status_code == 404

def test_restart_preserves_accounts_sessions_and_preferences(env):
    with TestClient(create_app(),headers={'Origin':ORIGIN}) as c:
        token = signup(c,env)
        ledger(c)
        prefs = {'rules':{'food':{'limit':100,'reserve':0}},'acknowledged':[]}
        assert c.put('/api/spending-guard',json={'version':0,'preferences':prefs}).status_code == 200
    with TestClient(create_app(),headers={'Origin':ORIGIN}) as c:
        c.cookies.set('cashdiet_session',token)
        assert c.get('/api/spending-guard').json()['preferences'] == prefs
        assert c.get('/api/workspace').json()['ledger']['budgets']['Food']['balance'] == 420
    assert env.joinpath('cash-diet.sqlite').stat().st_mode & 0o777 == 0o600

def test_existing_express_database_is_compatible(env):
    script = """
    import {Store} from './server/store.ts';
    const s = new Store(process.env.DATA_DIR+'/cash-diet.sqlite');
    const u = await s.register('legacy@example.test','Legacy','test-password-long-12345','UTC');
    s.db.prepare('UPDATE users SET verified_at=1 WHERE id=?').run(u.id);
    const token = s.session(u.id);
    console.log(token);s.close();
    """
    token = subprocess.check_output(['node','--import','tsx','--input-type=module','-e',script],text=True).strip()
    before = sqlite3.connect(env/'cash-diet.sqlite').execute('SELECT password FROM users').fetchone()[0]
    with TestClient(create_app(),headers={'Origin':ORIGIN}) as c:
        c.cookies.set('cashdiet_session',token)
        assert c.get('/api/auth/me').json()['user']['email'] == 'legacy@example.test'
        assert c.post('/api/auth/login',json={'email':'legacy@example.test','password':PASSWORD}).status_code == 200
        assert c.get('/api/spending-guard').json()['version'] == 0
    assert sqlite3.connect(env/'cash-diet.sqlite').execute('SELECT password FROM users').fetchone()[0] == before


def test_production_headers_and_origin_gate(env, monkeypatch):
    monkeypatch.setenv('NODE_ENV','production')
    monkeypatch.setenv('APP_URL','https://cash.example')
    monkeypatch.setenv('PUBLIC_APP_URL','https://cash.example')
    monkeypatch.setenv('MAIL_PROVIDER','resend')
    monkeypatch.setenv('RESEND_API_KEY','test-not-used')
    monkeypatch.setenv('MAIL_FROM','security@example.test')
    with TestClient(create_app()) as c:
        r = c.get('/api/ready')
        assert r.status_code == 200
        assert "frame-ancestors 'none'" in r.headers['content-security-policy']
        assert 'includeSubDomains' in r.headers['strict-transport-security']
        assert c.post('/api/auth/logout',json={}).status_code == 403
        assert c.get('/api/workspace').status_code == 401
