import os
import sys
import json
import functools
import numpy as np

# Affine patch
import affine
for _prop_name in ['determinant', 'is_degenerate', 'is_proper', '_astuple']:
    _prop = getattr(affine.Affine, _prop_name, None)
    if isinstance(_prop, functools.cached_property):
        setattr(affine.Affine, _prop_name, property(_prop.func))

import rasterio
import rasterio.features
import rasterio.warp
from PIL import Image

_repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROCESSED_DIR = os.path.join(_repo_root, "scratch", "cache", "cdse", "processed")
PUBLIC_DATA_DIR = os.path.join(_repo_root, "public", "data")
os.makedirs(PUBLIC_DATA_DIR, exist_ok=True)

# Target Grid Specification
X_MIN = 829790.0
X_MAX = 832350.0
Y_MIN = 9653500.0
Y_MAX = 9656060.0
RES = 10.0
SRC_CRS = "EPSG:32720"

# Target transform (Affine)
GRID_TRANSFORM = rasterio.Affine(RES, 0.0, X_MIN, 0.0, -RES, Y_MAX)

def generate_visual_artifacts():
    print("=== GENERATING PHASE 3D QUALITY CONTROL & VISUALIZATION ARTIFACTS ===")

    # 1. Load Raw 15-Channel Reflectance & Probabilities
    raw_path = os.path.join(PROCESSED_DIR, "amazon_15ch_raw_reflectance.npy")
    prob_path = os.path.join(PROCESSED_DIR, "amazon_unet_burned_area_probability.npy")
    mask_path = os.path.join(PROCESSED_DIR, "amazon_unet_burned_area_mask.npy")
    meta_path = os.path.join(PROCESSED_DIR, "amazon_unet_inference_metadata.json")

    assert os.path.exists(raw_path), f"Missing raw reflectance: {raw_path}"
    assert os.path.exists(prob_path), f"Missing probabilities: {prob_path}"
    assert os.path.exists(mask_path), f"Missing mask: {mask_path}"

    raw_15ch = np.load(raw_path)
    probs = np.load(prob_path)
    mask = np.load(mask_path)
    with open(meta_path, 'r') as f:
        meta = json.load(f)

    # 2. Generate True-Color Sentinel-2 RGB Image (B04=Red, B03=Green, B02=Blue)
    # Channels in raw_15ch: 1: B02, 2: B03, 3: B04
    r_band = raw_15ch[3] # B04
    g_band = raw_15ch[2] # B03
    b_band = raw_15ch[1] # B02

    # Robust 2% - 98% percentile linear stretch for clear visualization
    def stretch_channel(ch):
        p2, p98 = np.percentile(ch, (2, 98))
        if p98 > p2:
            scaled = (ch - p2) / (p98 - p2)
        else:
            scaled = np.zeros_like(ch)
        return np.clip(scaled * 255.0, 0, 255).astype(np.uint8)

    rgb_img = np.stack([
        stretch_channel(r_band),
        stretch_channel(g_band),
        stretch_channel(b_band)
    ], axis=-1)

    rgb_out_path = os.path.join(PUBLIC_DATA_DIR, "amazon_sentinel2_rgb.png")
    Image.fromarray(rgb_img, mode="RGB").save(rgb_out_path)
    print(f"Generated Sentinel-2 True Color RGB: {rgb_out_path}")

    # 3. Generate Unmodified U-Net Probability Colormap PNG (RGBA)
    # Inferno-style scientific gradient:
    # 0.0 -> Transparent Black
    # 0.3 -> Deep Purple
    # 0.65 -> Bright Orange (Decision Threshold)
    # 1.0 -> High-Intensity Yellow
    h, w = probs.shape
    prob_rgba = np.zeros((h, w, 4), dtype=np.uint8)

    for r in range(h):
        for c in range(w):
            p = float(probs[r, c])
            if p < 0.1:
                # Near zero: very faint/transparent
                prob_rgba[r, c] = [20, 10, 40, int(p * 200)]
            elif p < 0.4:
                # Low prob: Purple / Violet
                t = (p - 0.1) / 0.3
                prob_rgba[r, c] = [int(40 + t * 60), int(15 + t * 20), int(80 + t * 60), int(100 + t * 40)]
            elif p < 0.65:
                # Moderate prob (below threshold): Red / Amber
                t = (p - 0.4) / 0.25
                prob_rgba[r, c] = [int(100 + t * 130), int(35 + t * 50), int(140 - t * 100), int(140 + t * 30)]
            else:
                # High prob (above threshold >= 0.65): Bright Orange to Fluorescent Yellow
                t = (p - 0.65) / 0.35
                prob_rgba[r, c] = [int(230 + t * 25), int(85 + t * 165), int(40 - t * 30), int(170 + t * 65)]

    prob_out_path = os.path.join(PUBLIC_DATA_DIR, "amazon_unet_probability_colormap.png")
    Image.fromarray(prob_rgba, mode="RGBA").save(prob_out_path)
    print(f"Generated U-Net Probability Colormap: {prob_out_path}")

    # 4. Generate Unmodified Binary Mask PNG (RGBA)
    # Threshold 0.65: Bright Crimson (#FF1744) with 50% opacity where mask==1, 0% opacity where mask==0
    mask_rgba = np.zeros((h, w, 4), dtype=np.uint8)
    mask_pixels = (mask == 1)
    mask_rgba[mask_pixels] = [239, 68, 68, 160] # #EF4444 with alpha 160/255

    mask_out_path = os.path.join(PUBLIC_DATA_DIR, "amazon_unet_binary_mask.png")
    Image.fromarray(mask_rgba, mode="RGBA").save(mask_out_path)
    print(f"Generated U-Net Binary Prediction Mask: {mask_out_path}")

    # 5. Generate Vectorized GeoJSON (EPSG:4326) of the Unmodified Binary Prediction Mask
    shapes = rasterio.features.shapes(mask, mask=(mask == 1), transform=GRID_TRANSFORM)
    features = []
    
    for geom, val in shapes:
        # Re-project geometry coordinates from EPSG:32720 to EPSG:4326
        geom_wgs84 = rasterio.warp.transform_geom(SRC_CRS, "EPSG:4326", geom)
        features.append({
            "type": "Feature",
            "properties": {
                "source": "Sentinel-2 L2A (S2B_MSIL2A_20261001T142709)",
                "acquisitionDate": "2026-10-01T14:27:09Z",
                "model": "Land8Fire U-Net 15-Channel",
                "modelCheckpoint": "land8fire_15ch_unet_full_dataset_best.pth",
                "classification": "MODEL_PREDICTION",
                "threshold": 0.65,
                "burnProbability": ">= 0.65",
                "scientificNote": "Model prediction from single-date optical reflection. Not confirmed active fire or ground truth."
            },
            "geometry": geom_wgs84
        })

    geojson_doc = {
        "type": "FeatureCollection",
        "name": "Land8Fire U-Net 15-Channel Burned Area Prediction (Amazon)",
        "crs": {
            "type": "name",
            "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}
        },
        "properties": {
            "productId": meta["input_product"]["product_id"],
            "productUuid": meta["input_product"]["product_uuid"],
            "acquisitionDate": "2026-10-01T14:27:09Z",
            "modelCheckpoint": "land8fire_15ch_unet_full_dataset_best.pth",
            "threshold": 0.65,
            "totalPixels": 65536,
            "predictedBurnedPixels": int(np.sum(mask)),
            "predictedBurnedAreaHectares": float(np.sum(mask) * 0.01),
            "targetGridCrs": "EPSG:32720",
            "provenance": "DERIVED / U-NET MODEL INFERENCE"
        },
        "features": features
    }

    geojson_out_path = os.path.join(PUBLIC_DATA_DIR, "amazon_unet_prediction.json")
    with open(geojson_out_path, "w") as f:
        json.dump(geojson_doc, f, indent=2)
    print(f"Generated Vectorized WGS84 GeoJSON ({len(features)} features): {geojson_out_path}")

    # 6. Verify Geographic Extents of the Target Grid
    corners_x = [X_MIN, X_MAX]
    corners_y = [Y_MAX, Y_MIN]
    lons, lats = rasterio.warp.transform(SRC_CRS, "EPSG:4326", corners_x, corners_y)

    extent_summary = {
        "crs_projected": SRC_CRS,
        "crs_geographic": "EPSG:4326",
        "bounds_projected_utm20s": {
            "xMin": X_MIN,
            "xMax": X_MAX,
            "yMin": Y_MIN,
            "yMax": Y_MAX
        },
        "bounds_geographic_wgs84": {
            "west": lons[0],
            "north": lats[0],
            "east": lons[1],
            "south": lats[1]
        },
        "dimensions": [256, 256],
        "resolution_m": RES
    }

    extent_out_path = os.path.join(PUBLIC_DATA_DIR, "amazon_target_grid_extent.json")
    with open(extent_out_path, "w") as f:
        json.dump(extent_summary, f, indent=2)
    print(f"Generated Grid Extent Metadata: {extent_out_path}")

    print("\nAll visualization artifacts generated successfully.")

if __name__ == "__main__":
    generate_visual_artifacts()
