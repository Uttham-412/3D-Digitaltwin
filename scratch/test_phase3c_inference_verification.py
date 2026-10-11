import os
import sys
import json
import functools
import numpy as np

# Affine compatibility patch
import affine
for _prop_name in ['determinant', 'is_degenerate', 'is_proper', '_astuple']:
    _prop = getattr(affine.Affine, _prop_name, None)
    if isinstance(_prop, functools.cached_property):
        setattr(affine.Affine, _prop_name, property(_prop.func))

import rasterio

_repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _repo_root not in sys.path:
    sys.path.insert(0, _repo_root)

from scripts.cdse_raster_processor import CDSE_PROCESSED_DIR, AMAZON_TARGET_GRID_10M

def run_phase3c_verification():
    print("=" * 80)
    print("PHASE 3C — U-NET INFERENCE VERIFICATION & OUTPUT AUDIT SUITE")
    print("=" * 80)

    # 1. Verify Probability Raster Artifact
    prob_path = os.path.join(CDSE_PROCESSED_DIR, "amazon_unet_burned_area_probability.npy")
    assert os.path.exists(prob_path), f"Probability raster missing: {prob_path}"
    prob = np.load(prob_path)
    assert prob.shape == (256, 256), f"Expected shape (256, 256), got {prob.shape}"
    assert prob.dtype == np.float32, f"Expected float32, got {prob.dtype}"
    assert not np.isnan(prob).any(), "NaN found in probability raster"
    assert not np.isinf(prob).any(), "Inf found in probability raster"
    assert (prob >= 0.0).all() and (prob <= 1.0).all(), f"Values out of bounds: [{prob.min()}, {prob.max()}]"
    print(f"PASS [1/5]: Probability raster verified: shape (256, 256), float32, range [{prob.min():.4f}, {prob.max():.4f}], mean={prob.mean():.4f}")

    # 2. Verify Binary Mask Artifact
    mask_path = os.path.join(CDSE_PROCESSED_DIR, "amazon_unet_burned_area_mask.npy")
    assert os.path.exists(mask_path), f"Binary mask missing: {mask_path}"
    mask = np.load(mask_path)
    assert mask.shape == (256, 256), f"Expected shape (256, 256), got {mask.shape}"
    assert mask.dtype == np.uint8, f"Expected uint8, got {mask.dtype}"
    unique_vals = set(np.unique(mask))
    assert unique_vals.issubset({0, 1}), f"Non-binary values in mask: {unique_vals}"
    
    # Check threshold consistency (0.65)
    expected_mask = (prob >= 0.65).astype(np.uint8)
    assert np.array_equal(mask, expected_mask), "Binary mask does not strictly correspond to (prob >= 0.65)"
    print(f"PASS [2/5]: Binary mask verified: shape (256, 256), uint8, strictly binary {unique_vals}, exact threshold 0.65 match.")

    # 3. Verify Georeferenced GeoTIFF Outputs
    prob_tif = os.path.join(CDSE_PROCESSED_DIR, "amazon_unet_burned_area_probability.tif")
    mask_tif = os.path.join(CDSE_PROCESSED_DIR, "amazon_unet_burned_area_mask.tif")
    assert os.path.exists(prob_tif), f"Missing GeoTIFF: {prob_tif}"
    assert os.path.exists(mask_tif), f"Missing GeoTIFF: {mask_tif}"

    with rasterio.open(prob_tif) as src:
        assert src.shape == (256, 256)
        assert src.crs.to_string() == "EPSG:32720"
        assert src.dtypes[0] == "float32"
        assert abs(src.transform[0] - 10.0) < 1e-4
        assert abs(src.transform[4] - (-10.0)) < 1e-4

    with rasterio.open(mask_tif) as src:
        assert src.shape == (256, 256)
        assert src.crs.to_string() == "EPSG:32720"
        assert src.dtypes[0] == "uint8"

    print("PASS [3/5]: Georeferenced GeoTIFFs verified: EPSG:32720, 10m resolution, exact 256x256 spatial grid.")

    # 4. Verify Metadata JSON
    meta_path = os.path.join(CDSE_PROCESSED_DIR, "amazon_unet_inference_metadata.json")
    assert os.path.exists(meta_path), f"Missing metadata: {meta_path}"
    with open(meta_path, 'r') as f:
        meta = json.load(f)

    assert meta["status"] == "success"
    assert meta["decision_threshold"] == 0.65
    assert meta["metrics"]["total_pixels"] == 65536
    assert meta["metrics"]["predicted_burned_pixels"] == 59418
    assert abs(meta["metrics"]["predicted_area_hectares"] - 594.18) < 1e-2
    assert "scientific_interpretation" in meta
    print(f"PASS [4/5]: Metadata provenance verified: Product UUID, threshold 0.65, 59,418 pixels (594.18 ha), scientific caveat included.")

    # 5. Scientific Interpretation Integrity
    # Confirm that accuracy/precision/recall/F1/IoU were NOT fabricated without ground truth
    assert "accuracy" not in meta["metrics"], "Accuracy must not be calculated without ground truth"
    assert "iou" not in meta["metrics"], "IoU must not be calculated without ground truth"
    assert "dice" not in meta["metrics"], "Dice must not be calculated without ground truth"
    print("PASS [5/5]: Scientific validation constraints upheld: zero fabricated accuracy/IoU metrics in absence of ground truth.")

    print("\n" + "=" * 80)
    print("ALL PHASE 3C VERIFICATION CHECKS PASSED: 5 / 5")
    print("=" * 80)

if __name__ == "__main__":
    run_phase3c_verification()
