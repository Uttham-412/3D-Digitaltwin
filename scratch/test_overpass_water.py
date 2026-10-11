import urllib.request
import urllib.parse
import json

query = """[out:json][timeout:20];
(
  way["natural"="water"](-3.25,-60.15,-3.05,-59.95);
  way["waterway"="riverbank"](-3.25,-60.15,-3.05,-59.95);
);
out geom;"""

url = 'https://overpass-api.de/api/interpreter'
req = urllib.request.Request(
    url,
    data=urllib.parse.urlencode({'data': query}).encode('utf-8'),
    headers={'User-Agent': 'Land8Fire/1.0 (Digital Twin)'}
)
try:
    with urllib.request.urlopen(req, timeout=25) as res:
        data = json.loads(res.read())
        print('SUCCESS! elements count:', len(data.get('elements', [])))
        if data.get('elements'):
            print('First element tags:', data['elements'][0].get('tags'))
            with open('scratch/osm_water_ways.json', 'w') as f:
                json.dump(data, f)
except Exception as e:
    print('ERROR:', e)
