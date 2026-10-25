"""FastAPI owns HTTP; a private stdio worker preserves the tested SQLite/auth core."""
import asyncio
from contextlib import asynccontextmanager
import json
import logging
import os
from pathlib import Path
import uuid

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent.parent
log = logging.getLogger('cashdiet')

class APIError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message

class Core:
    def __init__(self):
        self.lock = asyncio.Lock()
        self.process = None

    async def spawn(self):
        self.process = await asyncio.create_subprocess_exec(
            'node', str(ROOT / 'build/fastapi-worker.cjs'),
            cwd=ROOT, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
            limit=24 * 1024 * 1024,
        )

    async def start(self):
        await self.spawn()
        return await self.call('config')

    async def call(self, action, **kwargs):
        async with self.lock:
            if not self.process or self.process.returncode is not None:
                # Recover for the NEXT call; never replay a request with an uncertain outcome.
                await self.spawn()
            try:
                self.process.stdin.write((json.dumps({'action': action, **kwargs}) + '\n').encode())
                await self.process.stdin.drain()
                line = await asyncio.wait_for(self.process.stdout.readline(), timeout=40)
                if not line:
                    raise RuntimeError('Core disconnected')
                result = json.loads(line)
            except (asyncio.CancelledError, Exception) as exc:
                # An interrupted protocol exchange must never feed the next caller's response.
                if self.process.returncode is None:
                    self.process.kill()
                    await self.process.wait()
                if isinstance(exc, asyncio.CancelledError):
                    raise
                raise APIError(503, 'Account storage is unavailable. Retry after the service restarts.') from exc
            if 'error' in result:
                raise APIError(result.get('status', 500), result['error'])
            return result['data']

    async def close(self):
        if self.process and self.process.returncode is None:
            self.process.stdin.close()
            try:
                await asyncio.wait_for(self.process.wait(), 15)
            except asyncio.TimeoutError:
                self.process.kill()
                await self.process.wait()

def create_app():
    core = Core()
    @asynccontextmanager
    async def lifespan(app):
        try:
            app.state.config = await core.start()
            yield
        finally:
            await core.close()

    app = FastAPI(title='Cash Diet API', version='1.0.0', lifespan=lifespan,
                  docs_url=None, redoc_url=None, openapi_url=None)
    app.state.core = core

    @app.exception_handler(APIError)
    async def error_handler(request, exc):
        return JSONResponse({'error': exc.message}, status_code=exc.status)

    @app.middleware('http')
    async def security(request: Request, call_next):
        config = app.state.config
        origin = request.headers.get('origin')
        allowed = {config['origin'], *config['cors']}
        api = request.url.path.startswith('/api/') or request.url.path == '/api'
        try:
            if api:
                if origin and origin not in allowed:
                    raise APIError(403, 'Origin is not permitted.')
                if request.method == 'OPTIONS':
                    response = JSONResponse({}, status_code=204)
                else:
                    if request.method not in ('GET', 'HEAD'):
                        if origin not in allowed:
                            raise APIError(403, 'A trusted request origin is required.')
                        if request.headers.get('content-type', '').split(';')[0].strip() != 'application/json':
                            raise APIError(415, 'Use application/json.')
                    # Bound streamed bodies as well as Content-Length. Do not trust proxies/client headers.
                    if request.method not in ('GET', 'HEAD'):
                        size, chunks = 0, []
                        limit = 16 * 1024 if request.url.path.startswith('/api/auth/') else 10 * 1024 * 1024
                        async for chunk in request.stream():
                            size += len(chunk)
                            if size > limit:
                                raise APIError(413, 'Request is too large.')
                            chunks.append(chunk)
                        request._body = b''.join(chunks)
                    response = await call_next(request)
            else:
                response = await call_next(request)
        except APIError as exc:
            response = JSONResponse({'error': exc.message}, status_code=exc.status)
        except Exception:
            log.error('request_failed')  # Never log bodies, passwords, cookies or email links.
            response = JSONResponse({'error': 'The server could not save this change.'}, status_code=500)
        response.headers.update({
            'X-Request-Id': str(uuid.uuid4()), 'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
            'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        })
        if api:
            response.headers['Cache-Control'] = 'no-store'
            if origin in allowed:
                response.headers.update({'Access-Control-Allow-Origin': origin,
                    'Access-Control-Allow-Credentials': 'true', 'Vary': 'Origin',
                    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'})
        if config['production']:
            response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
            response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        return response

    async def invoke(request, action, args=None):
        try:
            raw = await request.body() if request.method not in ('GET', 'HEAD') else b''
            body = json.loads(raw) if raw else {}
        except (ValueError, UnicodeError):
            raise APIError(400, 'Use valid JSON.')
        if not isinstance(body, dict):
            raise APIError(400, 'Use a JSON object.')
        return await core.call(action, body=body, args=args or {},
            token=request.cookies.get('cashdiet_session', ''),
            ip=request.client.host if request.client else 'unknown')

    def cookie(response, value, clear=False):
        config = app.state.config
        response.set_cookie('cashdiet_session', value, httponly=True, path='/',
            secure=config['production'], samesite='none' if config['crossSite'] else 'lax',
            max_age=0 if clear else 604800)

    @app.get('/api/health')
    async def health():
        return {'ok': True, 'framework': 'fastapi'}

    @app.get('/api/ready')
    async def ready():
        try:
            result = await core.call('health')
            return JSONResponse(result, status_code=200 if result['ok'] else 503)
        except APIError:
            return JSONResponse({'ok': False}, status_code=503)

    @app.api_route('/api/auth/{action}', methods=['GET', 'POST'])
    async def auth(action: str, request: Request):
        if request.method == 'GET':
            if action != 'me':
                raise APIError(404, 'API route not found.')
            return await invoke(request, 'me')
        if action not in ('register', 'login', 'logout', 'forgot-password', 'resend-verification', 'verify-email', 'reset-password'):
            raise APIError(404, 'API route not found.')
        result = await invoke(request, action)
        if action in ('forgot-password', 'resend-verification'):
            await asyncio.sleep(.15)
        session = result.pop('session', None)
        response = JSONResponse(result, status_code=202 if action in ('register', 'forgot-password', 'resend-verification') else 200)
        if session:
            cookie(response, session)
        elif action in ('logout', 'verify-email', 'reset-password'):
            cookie(response, '', clear=True)
        return response

    @app.api_route('/api/workspace', methods=['GET', 'PUT'])
    async def workspace(request: Request):
        return await invoke(request, 'read' if request.method == 'GET' else 'write')

    @app.api_route('/api/spending-guard', methods=['GET', 'PUT'])
    async def spending(request: Request, roomId: str | None = None):
        return await invoke(request, 'spending-read' if request.method == 'GET' else 'spending-write', {'roomId': roomId})

    @app.api_route('/api/rooms', methods=['GET', 'POST'])
    async def rooms(request: Request):
        return await invoke(request, 'rooms' if request.method == 'GET' else 'create-room')

    @app.api_route('/api/rooms/{room_id}', methods=['GET', 'PUT'])
    async def room(room_id: str, request: Request):
        return await invoke(request, 'read' if request.method == 'GET' else 'write', {'roomId': room_id})

    @app.post('/api/rooms/{room_id}/{action}')
    async def room_action(room_id: str, action: str, request: Request):
        if action not in ('join', 'invite'):
            raise APIError(404, 'API route not found.')
        return await invoke(request, action, {'roomId': room_id})

    @app.get('/api/rooms/{room_id}/members')
    async def members(room_id: str, request: Request):
        return await invoke(request, 'members', {'roomId': room_id})

    @app.delete('/api/rooms/{room_id}/members/{user_id}')
    async def revoke(room_id: str, user_id: str, request: Request):
        return await invoke(request, 'revoke', {'roomId': room_id, 'userId': user_id})

    @app.api_route('/api/{rest:path}', methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])
    async def unknown(rest: str):
        raise APIError(404, 'API route not found.')

    if (ROOT / 'dist/assets').is_dir():
        app.mount('/assets', StaticFiles(directory=ROOT / 'dist/assets'), name='assets')

    @app.get('/{rest:path}')
    async def frontend(rest: str):
        dist = ROOT / 'dist'
        target = (dist / rest).resolve()
        if target.is_relative_to(dist.resolve()) and target.is_file():
            return FileResponse(target)
        if (dist / 'index.html').is_file():
            return FileResponse(dist / 'index.html')
        raise APIError(404, 'Build the React frontend first.')

    return app

app = create_app()
