import os
import zipfile
import functools
import affine

# Python 3.12 compatibility patch for affine 3.0.0 cached_property on slotted class
for _prop_name in ['determinant', 'is_degenerate', 'is_proper', '_astuple']:
    _prop = getattr(affine.Affine, _prop_name, None)
    if isinstance(_prop, functools.cached_property):
        setattr(affine.Affine, _prop_name, property(_prop.func))

import rasterio

ZIP_PATH = "scratch/cache/cdse/S2B_MSIL2A_20261001T142709_N0513_R053_T20MRB_20261001T181049.zip"

BAND_SPECS = {
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

print("=== INSPECTING SENTINEL-2 BANDS VIA RASTERIO ===")
with zipfile.ZipFile(ZIP_PATH, 'r') as zf:
    namelist = zf.namelist()
    for band, suffix in BAND_SPECS.items():
        matched = [n for n in namelist if n.endswith(suffix)]
        if not matched:
            print(f"ERROR: Band {band} not found for pattern {suffix}")
            continue
        zip_internal_path = matched[0]
        vsi_path = f"/vsizip/{os.path.abspath(ZIP_PATH)}/{zip_internal_path}"
        try:
            with rasterio.open(vsi_path) as src:
                print(f"Band {band:4s}:")
                print(f"  Internal Path: {suffix}")
                print(f"  Shape: {src.shape} (h={src.height}, w={src.width})")
                print(f"  CRS: {src.crs}")
                print(f"  Bounds: {src.bounds}")
                print(f"  Resolution: {src.res}")
                print(f"  Affine: {src.transform}")
                print(f"  Nodata: {src.nodata}")
                print(f"  Dtype: {src.dtypes[0]}")
        except Exception as e:
            print(f"  Failed to open {band} via vsizip: {e}")
