import functools
try:
    import affine
    for _prop_name in ['determinant', 'is_degenerate', 'is_proper', '_astuple']:
        _prop = getattr(affine.Affine, _prop_name, None)
        if isinstance(_prop, functools.cached_property):
            setattr(affine.Affine, _prop_name, property(_prop.func))
except ImportError:
    pass

import rasterio
from rasterio.windows import from_bounds
from rasterio.features import shapes
import numpy as np
import json
import os

# Study Region bounds around Manaus, Rio Negro, Rio Solimoes, and Encontro das Aguas:
# Longitude: -60.25 to -59.85
# Latitude:  -3.35 to -2.95
bounds = {
    'west': -60.25,
    'south': -3.35,
    'east': -59.85,
    'north': -2.95
}

# The 4 tiles intersecting this boundary box at (-3.0, -60.0)
tile_configs = [
    ('S06W063', bounds['west'], bounds['south'], -60.0, -3.0),
    ('S06W060', -60.0, bounds['south'], bounds['east'], -3.0),
    ('S03W063', bounds['west'], -3.0, -60.0, bounds['north']),
    ('S03W060', -60.0, -3.0, bounds['east'], bounds['north']),
]

all_features = []
total_water_pixels = 0
total_queried_pixels = 0

print("Extracting multi-quadrant ESA WorldCover 10m water masks...")

for tile_name, sub_w, sub_s, sub_e, sub_n in tile_configs:
    if sub_w >= sub_e or sub_s >= sub_n:
        continue
    url = f"https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{tile_name}_Map.tif"
    print(f"Reading {tile_name} window [{sub_w}, {sub_s}, {sub_e}, {sub_n}]...")
    with rasterio.open(url) as src:
        window = from_bounds(sub_w, sub_s, sub_e, sub_n, src.transform)
        arr = src.read(1, window=window)
        win_transform = src.window_transform(window)
        
        # In ESA WorldCover, Class 80 = Permanent water bodies
        water_mask = (arr == 80).astype('uint8')
        w_count = int((water_mask == 1).sum())
        total_water_pixels += w_count
        total_queried_pixels += arr.size
        print(f"  {tile_name}: {w_count} water pixels / {arr.size} ({w_count / arr.size * 100:.1f}%)")
        
        for geom, val in shapes(water_mask, transform=win_transform):
            if val == 1:
                # Filter out tiny noise polygons (< 4 pixels = 400 m²) to keep GeoJSON optimal
                coords = geom.get('coordinates', [])
                if len(coords) > 0 and len(coords[0]) >= 4:
                    all_features.append({
                        "type": "Feature",
                        "properties": {
                            "class": 80,
                            "surface": "WATER",
                            "source": "ESA WorldCover 2021 v200",
                            "resolution": "10m",
                            "tile": tile_name
                        },
                        "geometry": geom
                    })

geojson = {
    "type": "FeatureCollection",
    "name": "ESA_WorldCover_Manaus_RioNegro_Solimoes_WaterMask",
    "crs": {
        "type": "name",
        "properties": { "name": "urn:ogc:def:crs:OGC:1.3:CRS84" }
    },
    "metadata": {
        "dataset": "ESA WorldCover 2021 v200",
        "crs": "EPSG:4326",
        "resolutionMeters": 10,
        "classCode": 80,
        "className": "Permanent water bodies",
        "bounds": [bounds['west'], bounds['south'], bounds['east'], bounds['north']],
        "waterPixelCount": total_water_pixels,
        "totalPixels": total_queried_pixels,
        "waterPercentage": round(total_water_pixels / total_queried_pixels * 100, 2)
    },
    "features": all_features
}

output_path = "public/data/amazon_water_mask.json"
with open(output_path, "w") as f:
    json.dump(geojson, f)

size_mb = os.path.getsize(output_path) / (1024 * 1024)
print(f"Successfully generated {output_path}!")
print(f"Total features: {len(all_features)}, Size: {size_mb:.2f} MB")
print(f"Water coverage: {geojson['metadata']['waterPercentage']}% of study area.")
