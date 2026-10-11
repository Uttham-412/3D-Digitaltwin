import os
import sys
import io
import json
import time
import functools
import numpy as np

# Affine compatibility patch
import affine
for _prop_name in ['determinant', 'is_degenerate', 'is_proper', '_astuple']:
    _prop = getattr(affine.Affine, _prop_name, None)
    if isinstance(_prop, functools.cached_property):
        setattr(affine.Affine, _prop_name, property(_prop.func))

import torch
import torch.nn as nn
import rasterio
from rasterio.transform import Affine

_repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _repo_root not in sys.path:
    sys.path.insert(0, _repo_root)

from scripts.inference_server import UNet15, MODEL_PATH
from scripts.cdse_raster_processor import CDSE_PROCESSED_DIR, AMAZON_TARGET_GRID_10M

THRESHOLD = 0.65 # Documented Land8Fire baseline decision threshold

def execute_amazon_unet_inference():
    print("=" * 80)
    print("STAGE 2 & 3 — RUN AUTHORITATIVE U-NET INFERENCE ON REAL AMAZON TENSOR")
    print("=" * 80)

    # 1. Load Preprocessed 15-Channel Tensor
    norm_path = os.path.join(CDSE_PROCESSED_DIR, "amazon_15ch_normalized_tensor.npy")
    raw_path = os.path.join(CDSE_PROCESSED_DIR, "amazon_15ch_raw_reflectance.npy")
    input_meta_path = os.path.join(CDSE_PROCESSED_DIR, "amazon_15ch_metadata.json")

    assert os.path.exists(norm_path), f"Normalized tensor not found at {norm_path}"
    assert os.path.exists(MODEL_PATH), f"Model checkpoint not found at {MODEL_PATH}"

    norm_arr = np.load(norm_path)
    with open(input_meta_path, 'r') as f:
        input_meta = json.load(f)

    print(f"Loaded normalized tensor: {norm_path}")
    print(f"Shape: {norm_arr.shape}, Dtype: {norm_arr.dtype}")
    print(f"Product ID: {input_meta.get('product_id')}")

    # 2. Instantiate and Load Unchanged Baseline Checkpoint
    print(f"\nLoading baseline model checkpoint: {MODEL_PATH}")
    t_load_start = time.time()
    with open(MODEL_PATH, "rb") as f:
        ckpt = torch.load(f, map_location="cpu", weights_only=False)

    model = UNet15(in_channels=15, out_channels=1)
    if "model_state_dict" in ckpt:
        model.load_state_dict(ckpt["model_state_dict"])
    else:
        model.load_state_dict(ckpt)
    model.eval()
    print(f"Model loaded and set to eval() mode in {time.time() - t_load_start:.2f}s.")

    # 3. Convert input array to PyTorch Tensor using byte buffer (NumPy 2.x safe)
    input_bytes = bytearray(norm_arr.tobytes())
    input_tensor = torch.frombuffer(input_bytes, dtype=torch.float32).reshape(1, 15, 256, 256)

    # 4. Run Model Forward Pass
    print("\nExecuting U-Net inference forward pass...")
    t_inf_start = time.time()
    with torch.no_grad():
        logits = model(input_tensor)
        probs_tensor = torch.sigmoid(logits).squeeze()
    inf_duration = time.time() - t_inf_start
    print(f"Inference completed in {inf_duration:.3f}s on CPU.")

    # Convert probability tensor back to float32 NumPy array
    probs_bytes = bytes(probs_tensor.untyped_storage())
    probs = np.frombuffer(probs_bytes, dtype=np.float32).reshape(256, 256)

    # 5. Apply Documented Threshold (0.65)
    binary_mask = (probs >= THRESHOLD).astype(np.uint8)

    # 6. Numerical & Statistical Validations
    assert probs.shape == (256, 256), f"Invalid probability shape: {probs.shape}"
    assert binary_mask.shape == (256, 256), f"Invalid mask shape: {binary_mask.shape}"
    assert probs.dtype == np.float32, f"Invalid probability dtype: {probs.dtype}"
    assert binary_mask.dtype == np.uint8, f"Invalid mask dtype: {binary_mask.dtype}"
    assert not np.isnan(probs).any(), "NaN found in predicted probabilities"
    assert not np.isinf(probs).any(), "Inf found in predicted probabilities"
    assert (probs >= 0.0).all() and (probs <= 1.0).all(), "Probabilities outside [0.0, 1.0]"

    total_pixels = 256 * 256 # 65,536
    predicted_burned_pixels = int(np.sum(binary_mask))
    pixel_area_m2 = 10.0 * 10.0 # 100 m^2 per pixel at 10m resolution
    predicted_area_m2 = predicted_burned_pixels * pixel_area_m2
    predicted_area_ha = predicted_area_m2 / 10000.0 # 1 ha = 10,000 m^2
    predicted_pct = float((predicted_burned_pixels / total_pixels) * 100.0)

    print("\nInference Output Numerical Summary:")
    print(f"  Probability Range: [{probs.min():.6f}, {probs.max():.6f}], Mean: {probs.mean():.6f}, Std: {probs.std():.6f}")
    print(f"  Threshold: {THRESHOLD}")
    print(f"  Total Pixels: {total_pixels}")
    print(f"  Predicted Burned Pixels: {predicted_burned_pixels} / {total_pixels} ({predicted_pct:.2f}%)")
    print(f"  Predicted Burned Area: {predicted_area_ha:.2f} ha ({predicted_area_m2:,.0f} m²)")

    # 7. Save Output Files in scratch/cache/cdse/processed/
    prob_npy_path = os.path.join(CDSE_PROCESSED_DIR, "amazon_unet_burned_area_probability.npy")
    mask_npy_path = os.path.join(CDSE_PROCESSED_DIR, "amazon_unet_burned_area_mask.npy")
    prob_tif_path = os.path.join(CDSE_PROCESSED_DIR, "amazon_unet_burned_area_probability.tif")
    mask_tif_path = os.path.join(CDSE_PROCESSED_DIR, "amazon_unet_burned_area_mask.tif")
    out_meta_path = os.path.join(CDSE_PROCESSED_DIR, "amazon_unet_inference_metadata.json")

    np.save(prob_npy_path, probs)
    np.save(mask_npy_path, binary_mask)

    # Save Georeferenced GeoTIFFs
    t_bounds = AMAZON_TARGET_GRID_10M["bounds"]
    t_res = AMAZON_TARGET_GRID_10M["resolution"]
    dst_transform = Affine(t_res, 0.0, t_bounds["xMin"], 0.0, -t_res, t_bounds["yMax"])
    dst_crs = AMAZON_TARGET_GRID_10M["crs"]

    geotiff_profile = {
        "driver": "GTiff",
        "height": 256,
        "width": 256,
        "count": 1,
        "crs": dst_crs,
        "transform": dst_transform,
        "nodata": None
    }

    with rasterio.open(prob_tif_path, "w", dtype=rasterio.float32, **geotiff_profile) as dst:
        dst.write(probs, 1)

    with rasterio.open(mask_tif_path, "w", dtype=rasterio.uint8, **geotiff_profile) as dst:
        dst.write(binary_mask, 1)

    inference_metadata = {
        "status": "success",
        "model_architecture": "Land8Fire 15-Channel U-Net (DoubleConv / MaxPool2d / ConvTranspose2d)",
        "checkpoint_file": MODEL_PATH,
        "checkpoint_epoch": ckpt.get("epoch"),
        "best_val_dice": ckpt.get("best_val_dice"),
        "decision_threshold": THRESHOLD,
        "inference_timestamp_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "input_product": {
            "product_id": input_meta.get("product_id"),
            "product_uuid": input_meta.get("product_uuid"),
            "acquisition_date": input_meta.get("acquisition_date"),
            "raw_tensor": input_meta.get("output_files", {}).get("raw_tensor"),
            "normalized_tensor": input_meta.get("output_files", {}).get("normalized_tensor")
        },
        "target_grid": AMAZON_TARGET_GRID_10M,
        "output_dimensions": [256, 256],
        "output_crs": dst_crs,
        "output_affine_transform": [10.0, 0.0, t_bounds["xMin"], 0.0, -10.0, t_bounds["yMax"]],
        "metrics": {
            "total_pixels": total_pixels,
            "predicted_burned_pixels": predicted_burned_pixels,
            "predicted_burned_percentage": predicted_pct,
            "pixel_resolution_m": t_res,
            "pixel_area_m2": pixel_area_m2,
            "predicted_area_m2": predicted_area_m2,
            "predicted_area_hectares": predicted_area_ha,
            "probability_statistics": {
                "min": float(probs.min()),
                "max": float(probs.max()),
                "mean": float(probs.mean()),
                "std": float(probs.std())
            }
        },
        "scientific_interpretation": (
            "Model prediction of burned-area segmentation probability from single-date Sentinel-2 L2A BOA reflectance. "
            "This output represents deep-learning model inference and MUST NOT be conflated with active fire detection or verified ground truth. "
            "Accuracy/Dice/IoU metrics cannot be computed without compatible independent ground-truth labels for this scene."
        ),
        "output_files": {
            "probability_npy": os.path.relpath(prob_npy_path, _repo_root),
            "binary_mask_npy": os.path.relpath(mask_npy_path, _repo_root),
            "probability_geotiff": os.path.relpath(prob_tif_path, _repo_root),
            "binary_mask_geotiff": os.path.relpath(mask_tif_path, _repo_root),
            "metadata_json": os.path.relpath(out_meta_path, _repo_root)
        }
    }

    with open(out_meta_path, "w") as f:
        json.dump(inference_metadata, f, indent=2)

    print("\nSaved output artifacts:")
    for k, p in inference_metadata["output_files"].items():
        print(f"  {k:20s}: {p}")

    print("\n" + "=" * 80)
    print("STAGE 2 & 3 COMPLETED SUCCESSFULLY.")
    print("=" * 80)
    return inference_metadata

if __name__ == "__main__":
    execute_amazon_unet_inference()
