import os
import zipfile
import functools
import affine
import numpy as np

# Python 3.12 compatibility patch for affine
for _prop_name in ['determinant', 'is_degenerate', 'is_proper', '_astuple']:
    _prop = getattr(affine.Affine, _prop_name, None)
    if isinstance(_prop, functools.cached_property):
        setattr(affine.Affine, _prop_name, property(_prop.func))

import rasterio
from rasterio.windows import Window
from rasterio.warp import reproject, Resampling

ZIP_PATH = "scratch/cache/cdse/S2B_MSIL2A_20261001T142709_N0513_R053_T20MRB_20261001T181049.zip"

TARGET_GRID = {
    "crs": "EPSG:32720",
    "width": 256,
    "height": 256,
    "resolution": 10.0,
    "bounds": {
        "xMin": 829790.0,
        "xMax": 832350.0,
        "yMin": 9653500.0,
        "yMax": 9656060.0
    },
    "transform": rasterio.Affine(10.0, 0.0, 829790.0, 0.0, -10.0, 9656060.0)
}

BAND_FILES = {
    "B01": "R60m/T20MRB_20261001T142709_B01_60m.jp2",
    "B02": "R10m/T20MRB_20261001T142709_B02_10m.jp2",
    "B03": "R10m/T20MRB_20261001T142709_B03_10m.jp2",
    "B04": "R10m/T20MRB_20261001T142709_B04_10m.jp2",
    "B05": "R20m/T20MRB_20261001T142709_B05_20m.jp2",
    "B06": "R20m/T20MRB_20261001T142709_B06_20m.jp2",
    "B07": "R20m/T20MRB_20261001T142709_B07_20m.jp2",
    "B08": "R10m/T20MRB_20261001T142709_B08_10m.jp2",
    "B8A": "R20m/T20MRB_20261001T142709_B8A_20m.jp2",
    "B09": "R60m/T20MRB_20261001T142709_B09_60m.jp2",
    "B11": "R20m/T20MRB_20261001T142709_B11_20m.jp2",
    "B12": "R20m/T20MRB_20261001T142709_B12_20m.jp2",
}

print("=== TESTING RASTER EXTRACTION & RESAMPLING ON TARGET GRID ===")

with zipfile.ZipFile(ZIP_PATH, 'r') as zf:
    namelist = zf.namelist()
    extracted_bands = {}
    
    dst_transform = TARGET_GRID["transform"]
    dst_crs = TARGET_GRID["crs"]
    
    for band_name, suffix in BAND_FILES.items():
        matched = [n for n in namelist if n.endswith(suffix)][0]
        vsi_path = f"/vsizip/{os.path.abspath(ZIP_PATH)}/{matched}"
        
        with rasterio.open(vsi_path) as src:
            src_res = src.res[0]
            if src_res == 10.0:
                # Direct integer window extraction
                window = Window(col_off=2981, row_off=4394, width=256, height=256)
                data = src.read(1, window=window).astype(np.float32)
            else:
                # Reproject / resample from bounding window
                # To be fast and exact: calculate window in source pixel space with 2 pixel buffer
                inv_trans = ~src.transform
                c_min, r_min = inv_trans * (TARGET_GRID["bounds"]["xMin"], TARGET_GRID["bounds"]["yMax"])
                c_max, r_max = inv_trans * (TARGET_GRID["bounds"]["xMax"], TARGET_GRID["bounds"]["yMin"])
                
                c_start = max(0, int(np.floor(min(c_min, c_max))) - 2)
                c_end = min(src.width, int(np.ceil(max(c_min, c_max))) + 2)
                r_start = max(0, int(np.floor(min(r_min, r_max))) - 2)
                r_end = min(src.height, int(np.ceil(max(r_min, r_max))) + 2)
                
                sub_window = Window(col_off=c_start, row_off=r_start, width=c_end - c_start, height=r_end - r_start)
                sub_data = src.read(1, window=sub_window).astype(np.float32)
                sub_transform = rasterio.windows.transform(sub_window, src.transform)
                
                data = np.zeros((256, 256), dtype=np.float32)
                reproject(
                    source=sub_data,
                    destination=data,
                    src_transform=sub_transform,
                    src_crs=src.crs,
                    dst_transform=dst_transform,
                    dst_crs=dst_crs,
                    resampling=Resampling.bilinear
                )
            
            extracted_bands[band_name] = data
            print(f"Band {band_name:4s}: shape={data.shape}, min={data.min():.1f}, max={data.max():.1f}, mean={data.mean():.1f}, non-zero={(data > 0).sum()}/{data.size}")
