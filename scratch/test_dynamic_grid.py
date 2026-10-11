import os
import sys
import re
import zipfile
import functools
import numpy as np

# Affine patch
import affine
for _p in ['determinant', 'is_degenerate', 'is_proper', '_astuple']:
    prop = getattr(affine.Affine, _p, None)
    if isinstance(prop, functools.cached_property):
        setattr(affine.Affine, _p, property(prop.func))

import rasterio
import rasterio.warp
import rasterio.features
from rasterio.windows import Window
from rasterio.transform import Affine
from rasterio.warp import reproject, Resampling
from PIL import Image

_repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CDSE_CACHE_DIR = os.path.join(_repo_root, "scratch", "cache", "cdse")

def find_band_paths_in_archive(zf):
    namelist = zf.namelist()
    patterns = {
        "B01": [r'R60m/.*_B01_.*\.jp2$', r'R20m/.*_B01_.*\.jp2$', r'_B01_60m\.jp2$', r'_B01\.jp2$'],
        "B02": [r'R10m/.*_B02_.*\.jp2$', r'_B02_10m\.jp2$', r'_B02\.jp2$'],
        "B03": [r'R10m/.*_B03_.*\.jp2$', r'_B03_10m\.jp2$', r'_B03\.jp2$'],
        "B04": [r'R10m/.*_B04_.*\.jp2$', r'_B04_10m\.jp2$', r'_B04\.jp2$'],
        "B05": [r'R20m/.*_B05_.*\.jp2$', r'_B05_20m\.jp2$', r'_B05\.jp2$'],
        "B06": [r'R20m/.*_B06_.*\.jp2$', r'_B06_20m\.jp2$', r'_B06\.jp2$'],
        "B07": [r'R20m/.*_B07_.*\.jp2$', r'_B07_20m\.jp2$', r'_B07\.jp2$'],
        "B08": [r'R10m/.*_B08_.*\.jp2$', r'_B08_10m\.jp2$', r'_B08\.jp2$'],
        "B08A": [r'R20m/.*_B8A_.*\.jp2$', r'R20m/.*_B08A_.*\.jp2$', r'_B8A_20m\.jp2$', r'_B8A\.jp2$'],
        "B09": [r'R60m/.*_B09_.*\.jp2$', r'_B09_60m\.jp2$', r'_B09\.jp2$'],
        "B11": [r'R20m/.*_B11_.*\.jp2$', r'_B11_20m\.jp2$', r'_B11\.jp2$'],
        "B12": [r'R20m/.*_B12_.*\.jp2$', r'_B12_20m\.jp2$', r'_B12\.jp2$']
    }
    found = {}
    for band_key, pat_list in patterns.items():
        for pat in pat_list:
            matches = [n for n in namelist if re.search(pat, n, re.IGNORECASE)]
            if matches:
                found[band_key] = matches[0]
                break
    return found

def compute_dynamic_target_grid(lat, lon, bbox=None, res=10.0, target_crs="EPSG:32720"):
    if bbox is not None and isinstance(bbox, dict):
        min_lon = bbox.get("minLon", bbox.get("min_lon", lon - 0.012))
        max_lon = bbox.get("maxLon", bbox.get("max_lon", lon + 0.012))
        min_lat = bbox.get("minLat", bbox.get("min_lat", lat - 0.012))
        max_lat = bbox.get("maxLat", bbox.get("max_lat", lat + 0.012))
        xs, ys = rasterio.warp.transform('EPSG:4326', target_crs, [min_lon, max_lon], [min_lat, max_lat])
        x_min, x_max = min(xs), max(xs)
        y_min, y_max = min(ys), max(ys)
        
        # Snap to resolution
        x_min = np.floor(x_min / res) * res
        x_max = np.ceil(x_max / res) * res
        y_min = np.floor(y_min / res) * res
        y_max = np.ceil(y_max / res) * res

        span_x = x_max - x_min
        span_y = y_max - y_min

        # Ensure at least 256 pixels
        if span_x < 2560.0:
            pad = (2560.0 - span_x) / 2.0
            x_min = np.floor((x_min - pad) / res) * res
            x_max = x_min + 2560.0
        if span_y < 2560.0:
            pad = (2560.0 - span_y) / 2.0
            y_min = np.floor((y_min - pad) / res) * res
            y_max = y_min + 2560.0
    else:
        xs, ys = rasterio.warp.transform('EPSG:4326', target_crs, [lon], [lat])
        xc = round(xs[0] / res) * res
        yc = round(ys[0] / res) * res
        x_min = xc - 1280.0
        x_max = xc + 1280.0
        y_min = yc - 1280.0
        y_max = yc + 1280.0

    width = int(round((x_max - x_min) / res))
    height = int(round((y_max - y_min) / res))

    # Calculate geographic bounds in WGS84
    c_lons, c_lats = rasterio.warp.transform(target_crs, 'EPSG:4326', [x_min, x_max], [y_min, y_max])
    geo_bbox = {
        "west": float(min(c_lons)),
        "east": float(max(c_lons)),
        "south": float(min(c_lats)),
        "north": float(max(c_lats)),
        "minLon": float(min(c_lons)),
        "maxLon": float(max(c_lons)),
        "minLat": float(min(c_lats)),
        "maxLat": float(max(c_lats))
    }

    return {
        "crs": target_crs,
        "width": width,
        "height": height,
        "resolution": float(res),
        "bounds": {
            "xMin": float(x_min),
            "xMax": float(x_max),
            "yMin": float(y_min),
            "yMax": float(y_max)
        },
        "affine_transform": [float(res), 0.0, float(x_min), 0.0, -float(res), float(y_max)],
        "geographic_bounds_wgs84": geo_bbox
    }

# Quick test of target grid
tg = compute_dynamic_target_grid(-3.05, -60.10)
print("Dynamic target grid for (-3.05, -60.10):")
print("  Width x Height:", tg["width"], "x", tg["height"])
print("  Projected bounds:", tg["bounds"])
print("  Geographic bounds:", tg["geographic_bounds_wgs84"])
