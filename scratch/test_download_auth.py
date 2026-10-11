import os
import requests
from dotenv import load_dotenv

load_dotenv('.env.local')

client_id = os.environ.get('CDSE_CLIENT_ID', '').strip()
client_secret = os.environ.get('CDSE_CLIENT_SECRET', '').strip()

token_url = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token'
data = {
    'grant_type': 'client_credentials',
    'client_id': client_id,
    'client_secret': client_secret
}
resp = requests.post(token_url, data=data, timeout=15)
if resp.status_code != 200:
    print('Failed to get token:', resp.status_code, resp.text)
    exit(1)

token = resp.json()['access_token']
product_uuid = '72178af6-0ee1-4a6a-9345-d3f16d702deb'
val = '$value'
dl_url = f'https://download.dataspace.copernicus.eu/odata/v1/Products({product_uuid})/{val}'
headers = {'Authorization': f'Bearer {token}'}

print('Requesting with stream=True, allow_redirects=False...')
r = requests.get(dl_url, headers=headers, stream=True, allow_redirects=False, timeout=15)
print('Status:', r.status_code)
for k, v in r.headers.items():
    if k.lower() in ['location', 'content-length', 'content-type', 'content-disposition']:
        print(f'  {k}: {v}')

if r.status_code == 200:
    chunk = next(r.iter_content(chunk_size=1024))
    print('First 4 bytes:', chunk[:4])
    print('Is PK zip archive?:', chunk[:2] == b'PK')
elif r.status_code in [301, 302, 303, 307]:
    loc = r.headers.get('Location')
    print('Redirect target:', loc)
    if loc:
        # Note: when redirected (often to S3 presigned URL or zipper), Authorization header is not forwarded to avoid 400
        r2 = requests.get(loc, stream=True, timeout=15)
        print('Redirected GET Status:', r2.status_code)
        for k, v in r2.headers.items():
            if k.lower() in ['content-length', 'content-type', 'content-disposition']:
                print(f'  Redirected {k}: {v}')
        if r2.status_code == 200:
            chunk2 = next(r2.iter_content(chunk_size=1024))
            print('First 4 bytes of stream:', chunk2[:4])
            print('Is PK zip archive?:', chunk2[:2] == b'PK')
