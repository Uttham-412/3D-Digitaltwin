import json
import os

with open('scratch/test_extended_water.json') as f:
    data = json.load(f)

geojson = {
    'type': 'FeatureCollection',
    'name': 'ESA_WorldCover_Amazon_Extended_WaterMask',
    'crs': {
        'type': 'name',
        'properties': { 'name': 'urn:ogc:def:crs:OGC:1.3:CRS84' }
    },
    'metadata': {
        'dataset': 'ESA WorldCover 2021 v200',
        'crs': 'EPSG:4326',
        'resolutionMeters': 10,
        'classCode': 80,
        'className': 'Permanent water bodies',
        'bounds': [-60.30, -3.40, -59.70, -2.80],
        'featuresCount': len(data['features']),
        'source': 'AWS Open Data S3 Cloud-Optimized GeoTIFFs (S06W063, S06W060, S03W063, S03W060)'
    },
    'features': data['features']
}

out_path = 'public/data/amazon_water_mask.json'
with open(out_path, 'w') as f:
    json.dump(geojson, f)

sz = os.path.getsize(out_path) / (1024 * 1024)
print(f"Wrote {out_path}: {sz:.2f} MB, {len(data['features'])} features")
