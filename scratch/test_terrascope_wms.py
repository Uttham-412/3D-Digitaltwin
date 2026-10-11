import urllib.request
import urllib.parse
import json

# Test ESA WorldCover WMS GetFeatureInfo or GetCapabilities on Terrascope
url = "https://services.terrascope.be/wms/v2?service=WMS&request=GetCapabilities"
req = urllib.request.Request(url, headers={'User-Agent': 'Land8Fire/1.0'})
try:
    with urllib.request.urlopen(req, timeout=15) as res:
        content = res.read(1000).decode('utf-8', errors='ignore')
        print("Terrascope WMS GetCapabilities Success!")
        print(content[:300])
except Exception as e:
    print("Terrascope WMS error:", e)
