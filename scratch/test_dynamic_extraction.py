import os
import sys
import io
import time
import functools
import numpy as np

# Set temporary directory to D:\ scratch\tmp
_scratch_tmp = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scratch", "tmp")
os.makedirs(_scratch_tmp, exist_ok=True)
os.environ["TEMP"] = _scratch_tmp
os.environ["TMP"] = _scratch_tmp

# Affine compatibility patch
import affine
for _prop_name in ['determinant', 'is_degenerate', 'is_proper', '_astuple']:
    _prop = getattr(affine.Affine, _prop_name, None)
    if isinstance(_prop, functools.cached_property):
        setattr(affine.Affine, _prop_name, property(_prop.func))

import torch
import rasterio
import rasterio.warp
from rasterio.transform import Affine

_repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _repo_root not in sys.path:
    sys.path.insert(0, _repo_root)

from scripts.inference_server import UNet15
from scripts.cdse_raster_processor import (
    CDSE_CACHE_DIR,
    MEAN_15CH,
    STD_15CH,
    compute_spectral_indices,
    construct_15channel_tensor
)

# Test coordinate: rainforest location inside the Sentinel-2 orbit swath
# Coordinates: lat=-3.0500, lon=-60.1000 (about 12 km north of the original patch)
test_lat = -3.0500
test_lon = -60.1000

print(f"Testing dynamic extraction for coordinates: lat={test_lat}, lon={test_lon}")

# 1. Project to EPSG:32720
xs, ys = rasterio.warp.transform('EPSG:4326', 'EPSG:32720', [test_lon], [test_lat])
xc, yc = xs[0], ys[0]
print(f"Projected UTM coords: X={xc:.2f}, Y={yc:.2f}")

# Snap center to 10m grid
xc_snap = round(xc / 10.0) * 10.0
yc_snap = round(yc / 10.0) * 10.0

# 256x256 grid (2560m x 2560m)
half_span = 1280.0
grid_bounds = {
    "xMin": xc_snap - half_span,
    "xMax": xc_snap + half_span,
    "yMin": yc_snap - half_span,
    "yMax": yc_snap + half_span
}

target_grid = {
    "crs": "EPSG:32720",
    "width": 256,
    "height": 256,
    "resolution": 10.0,
    "bounds": grid_bounds,
    "affine_transform": [10.0, 0.0, grid_bounds["xMin"], 0.0, -10.0, grid_bounds["yMax"]]
}

print(f"Target grid bounds: {grid_bounds}")

# 2. Extract bands dynamically from zip
from scripts.cdse_raster_processor import extract_and_resample_bands
zip_path = os.path.join(CDSE_CACHE_DIR, "S2B_MSIL2A_20261001T142709_N0513_R053_T20MRB_20261001T181049.zip")

t0 = time.time()
raw_12_bands, prov = extract_and_resample_bands(zip_path, target_grid=target_grid)
t1 = time.time()
print(f"Extracted 12 bands in {t1 - t0:.2f}s")
for b in ["B02", "B03", "B04", "B08", "B12"]:
    print(f"  {b}: min={raw_12_bands[b].min()}, max={raw_12_bands[b].max()}, mean={raw_12_bands[b].mean():.1f}")

# 3. Construct 15-channel tensor
tensor_res = construct_15channel_tensor(raw_12_bands, width=256, height=256, is_raw_dn=True)
norm_arr = tensor_res["normalized_tensor"]
print(f"15-channel tensor constructed: shape={norm_arr.shape}, dtype={norm_arr.dtype}")
print(f"Any NaN: {tensor_res['has_nan']}, Any Inf: {tensor_res['has_inf']}")

# 4. Load verified model checkpoint
ckpt_path = os.path.join(CDSE_CACHE_DIR, "land8fire_15ch_unet_full_dataset_best.pth")
if not os.path.exists(ckpt_path):
    ckpt_path = r"G:\.shortcut-targets-by-id\1JR1Kj2BMHFHE8RVqogPyMglKE1YRaoOn\Land8Fire_From_Scratch\models\land8fire_15ch_unet_full_dataset_best.pth"

print(f"Loading checkpoint from: {ckpt_path}")
with open(ckpt_path, "rb") as f:
    buf = io.BytesIO(f.read())
ckpt = torch.load(buf, map_location="cpu", weights_only=False)

model = UNet15(in_channels=15, out_channels=1)
if "model_state_dict" in ckpt:
    model.load_state_dict(ckpt["model_state_dict"])
else:
    model.load_state_dict(ckpt)
model.eval()

# 5. Execute forward pass
input_bytes = bytearray(norm_arr.tobytes())
input_tensor = torch.frombuffer(input_bytes, dtype=torch.float32).reshape(1, 15, 256, 256)

with torch.no_grad():
    logits = model(input_tensor)
    probs_tensor = torch.sigmoid(logits).squeeze()

probs_bytes = bytes(probs_tensor.untyped_storage())
probs = np.frombuffer(probs_bytes, dtype=np.float32).reshape(256, 256)
binary_mask = (probs >= 0.65).astype(np.uint8)

burned_count = int(np.sum(binary_mask))
pct = (burned_count / (256 * 256)) * 100.0

print(f"\n========================================================")
print(f"INFERENCE SUCCESSFUL AT LOCATION: ({test_lat}, {test_lon})")
print(f"========================================================")
print(f"Probability range: [{probs.min():.4f}, {probs.max():.4f}], mean={probs.mean():.4f}, std={probs.std():.4f}")
print(f"Threshold: 0.65")
print(f"Burned pixels (threshold >= 0.65): {burned_count} / 65536 ({pct:.2f}%)")
print(f"Burned area: {burned_count * 0.01:.2f} ha ({burned_count * 100:,} m²)")
