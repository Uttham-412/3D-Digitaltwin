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
import json

url = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_S06W063_Map.tif"

# Extract water mask for the active Land8Fire study area around Manaus / Rio Negro
# Bounds: south=-3.30, west=-60.25, north=-3.05, east=-59.95
min_lon, min_lat, max_lon, max_lat = -60.25, -3.30, -59.95, -3.05

print(f"Reading ESA WorldCover window [{min_lon}, {min_lat}, {max_lon}, {max_lat}]...")
with rasterio.open(url) as src:
    window = from_bounds(min_lon, min_lat, max_lon, max_lat, src.transform)
    # Read the land cover classes
    arr = src.read(1, window=window)
    win_transform = src.window_transform(window)
    print("Array shape:", arr.shape)
    
    # Class 80 is permanent water body
    water_mask = (arr == 80).astype('uint8')
    water_pixel_count = (water_mask == 1).sum()
    total_pixels = arr.size
    print(f"Water pixels: {water_pixel_count} / {total_pixels} ({water_pixel_count/total_pixels*100:.1f}%)")
    
    # Vectorize the water bodies
    features = []
    for geom, val in shapes(water_mask, transform=win_transform):
        if val == 1:
            features.append({
                "type": "Feature",
                "properties": {
                    "class": 80,
                    "surface": "WATER",
                    "dataset": "ESA WorldCover 2021 v200 10m",
                    "crs": "EPSG:4326"
                },
                "geometry": geom
            })
    
    geojson = {
        "type": "FeatureCollection",
        "name": "ESA_WorldCover_Amazon_RioNegro_WaterMask",
        "crs": {
            "type": "name",
            "properties": { "name": "urn:ogc:def:crs:OGC:1.3:CRS84" }
        },
        "metadata": {
            "source": "ESA WorldCover 2021 v200",
            "resolution": "10m",
            "crs": "EPSG:4326",
            "bounds": [min_lon, min_lat, max_lon, max_lat]
        },
        "features": features
    }
    
    output_path = "public/data/amazon_water_mask.json"
    with open(output_path, "w") as f:
        json.dump(geojson, f)
    
    import os
    size_kb = os.path.getsize(output_path) / 1024
    print(f"Extracted {len(features)} water polygon features to {output_path} ({size_kb:.1f} KB)")
