import os
import uvicorn

if __name__ == '__main__':
    # Access logs intentionally omit account-link fragments and query strings.
    uvicorn.run('backend.main:app', host='0.0.0.0', port=int(os.environ.get('PORT', '3000')),
                workers=1, access_log=False, proxy_headers=os.environ.get('TRUST_PROXY') == '1',
                forwarded_allow_ips=os.environ.get('TRUSTED_PROXY_IPS', '127.0.0.1'))
