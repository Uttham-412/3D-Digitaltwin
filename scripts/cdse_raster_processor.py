"""
LAND8FIRE — COPERNICUS DATA SPACE ECOSYSTEM (CDSE) RASTER PROCESSOR (PHASE 3B)

Authoritative Python module for acquiring real Sentinel-2 Level-2A raster assets
from CDSE, resampling 10m/20m/60m bands onto a unified 256x256 spatial grid,
deriving spectral indices (NDVI, NBR, NDRI), scaling reflectance (DN / 10000.0),
checking NaN/Inf integrity, and building the exact 15-channel float32 tensor.

Strict Compliance:
- Inspects real CDSE STAC assets for Amazon product:
  S2B_MSIL2A_20261001T142709_N0513_R053_T20MRB_20261001T181049
- Checks for CDSE_CLIENT_ID / CDSE_CLIENT_SECRET environment variables.
- If credentials are not configured, returns:
  "CDSE RASTER ACCESS: BLOCKED — CREDENTIALS NOT CONFIGURED"
- Zero synthetic data, random tensors, or fake spectral bands.
- Checkpoint land8fire_15ch_unet_full_dataset_best.pth remains READ-ONLY and UNCHANGED.
"""

import os
import sys
import re
import json
import time
import zipfile
import shutil
import urllib.request
import urllib.parse
import functools
import threading
import tempfile
import requests
import numpy as np

try:
    from dotenv import load_dotenv
    _repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    load_dotenv(os.path.join(_repo_root, ".env.local"))
    load_dotenv(os.path.join(_repo_root, ".env"))
except ImportError:
    _repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

if _repo_root not in sys.path:
    sys.path.insert(0, _repo_root)
_scripts_dir = os.path.dirname(os.path.abspath(__file__))
if _scripts_dir not in sys.path:
    sys.path.insert(0, _scripts_dir)

# Prevent C: drive exhaustion by redirecting all temp file usage to D:\ scratch\tmp
_scratch_tmp = os.path.join(_repo_root, "scratch", "tmp")
os.makedirs(_scratch_tmp, exist_ok=True)
os.environ["TEMP"] = _scratch_tmp
os.environ["TMP"] = _scratch_tmp
tempfile.tempdir = _scratch_tmp

CDSE_CACHE_DIR = os.path.join(_repo_root, "scratch", "cache", "cdse")
CDSE_PROCESSED_DIR = os.path.join(CDSE_CACHE_DIR, "processed")
PUBLIC_DATA_DIR = os.path.join(_repo_root, "public", "data")
PUBLIC_DYNAMIC_DIR = os.path.join(PUBLIC_DATA_DIR, "dynamic")
os.makedirs(PUBLIC_DYNAMIC_DIR, exist_ok=True)


# Python 3.12 compatibility patch for affine 3.0.0 cached_property on slotted class
try:
    import affine
    for _prop_name in ['determinant', 'is_degenerate', 'is_proper', '_astuple']:
        _prop = getattr(affine.Affine, _prop_name, None)
        if isinstance(_prop, functools.cached_property):
            setattr(affine.Affine, _prop_name, property(_prop.func))
except ImportError:
    pass

try:
    import rasterio
    import rasterio.windows
    import rasterio.features
    import rasterio.warp
    from rasterio.windows import Window
    from rasterio.transform import Affine
    from rasterio.warp import reproject, Resampling
    HAS_RASTERIO = True
except ImportError:
    HAS_RASTERIO = False

# Verified 15-Channel Normalization Vectors (Land8Fire 5,431 Patch Dataset)
MEAN_15CH = np.array([
    0.054257, 0.067676, 0.091714, 0.107805, 0.143499,
    0.202211, 0.225245, 0.237767, 0.248593, 0.254053,
    0.240885, 0.173530, 0.368527, 0.120145, 0.320615
], dtype=np.float32).reshape(15, 1, 1)

STD_15CH = np.array([
    0.072358, 0.075483, 0.079899, 0.095268, 0.097878,
    0.107183, 0.115450, 0.122247, 0.122630, 0.140352,
    0.119594, 0.098965, 0.303724, 0.325588, 0.337697
], dtype=np.float32).reshape(15, 1, 1)

BAND_NATIVE_RESOLUTIONS = {
    "B01": 20, "B02": 10, "B03": 10, "B04": 10,
    "B05": 20, "B06": 20, "B07": 20, "B08": 10,
    "B08A": 20, "B09": 60, "B11": 20, "B12": 20
}

# Authoritative native target grid specification for Amazon study area
AMAZON_TARGET_GRID_10M = {
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
    "affine_transform": [10.0, 0.0, 829790.0, 0.0, -10.0, 9656060.0],
    "geographic_bounds_wgs84": {
        "west": -60.033188,
        "east": -60.010245,
        "south": -3.130641,
        "north": -3.107447
    }
}

def check_cdse_credentials():
    """
    Check if Copernicus Data Space Ecosystem credentials
    are configured in environment variables or .env.local/.env.
    Supports:
    1. OAuth2 Client Credentials (CDSE_CLIENT_ID + CDSE_CLIENT_SECRET)
    2. Standard Copernicus User Account (CDSE_USERNAME + CDSE_PASSWORD)
    3. S3 Access Keys (CDSE_S3_ACCESS_KEY + CDSE_S3_SECRET_KEY)
    """
    client_id = os.environ.get("CDSE_CLIENT_ID", "").strip()
    client_secret = os.environ.get("CDSE_CLIENT_SECRET", "").strip()
    username = os.environ.get("CDSE_USERNAME", "").strip()
    password = os.environ.get("CDSE_PASSWORD", "").strip()
    s3_access = os.environ.get("CDSE_S3_ACCESS_KEY", "").strip()
    s3_secret = os.environ.get("CDSE_S3_SECRET_KEY", "").strip()

    has_oauth = bool(client_id and client_secret)
    has_user = bool(username and password)
    has_s3 = bool(s3_access and s3_secret)

    if has_oauth:
        auth_method = "OAuth2 Client Credentials"
    elif has_user:
        auth_method = "Copernicus User Account (cdse-public)"
    elif has_s3:
        auth_method = "S3 Access Keys"
    else:
        auth_method = "NONE"

    return {
        "configured": has_oauth or has_user or has_s3,
        "auth_method": auth_method,
        "client_id_present": bool(client_id),
        "client_secret_present": bool(client_secret),
        "username_present": bool(username),
        "password_present": bool(password),
        "s3_configured": has_s3
    }

def get_cdse_token():
    """
    Retrieve OAuth2 Bearer Access Token from Copernicus Auth Server.
    Endpoint: https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token
    Supports both client_credentials and password grant (cdse-public).
    """
    creds = check_cdse_credentials()
    if not creds["configured"]:
        return None, "CDSE RASTER ACCESS: BLOCKED — CREDENTIALS NOT CONFIGURED"

    client_id = os.environ.get("CDSE_CLIENT_ID", "").strip()
    client_secret = os.environ.get("CDSE_CLIENT_SECRET", "").strip()
    username = os.environ.get("CDSE_USERNAME", "").strip()
    password = os.environ.get("CDSE_PASSWORD", "").strip()

    token_url = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"

    if client_id and client_secret:
        body_data = urllib.parse.urlencode({
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret
        }).encode("utf-8")
    elif username and password:
        body_data = urllib.parse.urlencode({
            "grant_type": "password",
            "client_id": "cdse-public",
            "username": username,
            "password": password
        }).encode("utf-8")
    else:
        return None, "CDSE TOKEN: Neither OAuth2 client nor user account configured"

    req = urllib.request.Request(token_url, data=body_data, headers={"Content-Type": "application/x-www-form-urlencoded"})

    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            token = data.get("access_token")
            return token, "OK"
    except Exception as e:
        return None, f"CDSE AUTHENTICATION ERROR: {str(e)}"

def compute_spectral_indices(b02, b04, b08, b12, eps=1e-6):
    """
    Compute derived spectral indices using authoritative Land8Fire formulas:
    - NDVI = (B08 - B04) / (B08 + B04 + 1e-6)
    - NBR  = (B08 - B12) / (B08 + B12 + 1e-6)
    - NDRI = (B04 - B02) / (B04 + B02 + 1e-6)
    """
    ndvi_denom = b08 + b04 + eps
    ndvi = (b08 - b04) / ndvi_denom

    nbr_denom = b08 + b12 + eps
    nbr = (b08 - b12) / nbr_denom

    ndri_denom = b04 + b02 + eps
    ndri = (b04 - b02) / ndri_denom

    return ndvi, nbr, ndri

def construct_15channel_tensor(raw_12_bands_dict, width=256, height=256, is_raw_dn=True):
    """
    Construct, validate, and normalize exact (15, 256, 256) float32 U-Net input tensor.

    Order:
    0: B01, 1: B02, 2: B03, 3: B04, 4: B05, 5: B06, 6: B07, 7: B08,
    8: B08A, 9: B09, 10: B11, 11: B12, 12: NDVI, 13: NBR, 14: NDRI
    """
    scale = 10000.0 if is_raw_dn else 1.0

    b01 = raw_12_bands_dict["B01"].astype(np.float32) / scale
    b02 = raw_12_bands_dict["B02"].astype(np.float32) / scale
    b03 = raw_12_bands_dict["B03"].astype(np.float32) / scale
    b04 = raw_12_bands_dict["B04"].astype(np.float32) / scale
    b05 = raw_12_bands_dict["B05"].astype(np.float32) / scale
    b06 = raw_12_bands_dict["B06"].astype(np.float32) / scale
    b07 = raw_12_bands_dict["B07"].astype(np.float32) / scale
    b08 = raw_12_bands_dict["B08"].astype(np.float32) / scale
    b08a_data = raw_12_bands_dict.get("B08A") if "B08A" in raw_12_bands_dict else raw_12_bands_dict.get("B8A")
    if b08a_data is None:
        raise KeyError("Band B08A / B8A missing in raw_12_bands_dict")
    b08a = b08a_data.astype(np.float32) / scale
    b09 = raw_12_bands_dict["B09"].astype(np.float32) / scale
    b11 = raw_12_bands_dict["B11"].astype(np.float32) / scale
    b12 = raw_12_bands_dict["B12"].astype(np.float32) / scale

    ndvi, nbr, ndri = compute_spectral_indices(b02, b04, b08, b12)

    raw_15ch = np.stack([
        b01, b02, b03, b04, b05, b06, b07, b08,
        b08a, b09, b11, b12, ndvi, nbr, ndri
    ], axis=0) # Shape: (15, height, width)

    # Numerical integrity checks
    if np.isnan(raw_15ch).any():
        raise ValueError("NaN values detected in 15-channel raw array.")
    if np.isinf(raw_15ch).any():
        raise ValueError("Inf values detected in 15-channel raw array.")
    if raw_15ch.shape != (15, height, width):
        raise ValueError(f"Invalid shape: expected (15, {height}, {width}), got {raw_15ch.shape}")

    # Normalization: (X - MEAN_15CH) / (STD_15CH + 1e-6)
    normalized_15ch = (raw_15ch - MEAN_15CH) / (STD_15CH + 1e-6)

    return {
        "raw_tensor": raw_15ch,
        "normalized_tensor": normalized_15ch.astype(np.float32),
        "shape": list(normalized_15ch.shape),
        "dtype": str(normalized_15ch.dtype),
        "has_nan": bool(np.isnan(normalized_15ch).any()),
        "has_inf": bool(np.isinf(normalized_15ch).any())
    }

def validate_target_grid(source_metadata, target_grid=None):
    """
    Validate target grid candidate against real source STAC asset metadata and affine transform.
    Strictly enforces:
    1. Matching or compatible CRS (target requires EPSG:32720).
    2. Target bounding box is strictly within source raster extent.
    3. Target origin is integer pixel aligned with source origin.
    4. Target dimensions x resolution strictly equals bounding box span (2560m x 2560m).
    """
    if target_grid is None:
        target_grid = AMAZON_TARGET_GRID_10M

    target_crs = target_grid["crs"]
    t_bounds = target_grid["bounds"]
    t_width = target_grid["width"]
    t_height = target_grid["height"]
    t_res = target_grid["resolution"]

    src_crs = source_metadata.get("proj:code") or source_metadata.get("crs")
    if not src_crs and source_metadata.get("proj:epsg"):
        src_crs = f"EPSG:{source_metadata.get('proj:epsg')}"

    if src_crs != target_crs:
        return {
            "valid": False,
            "reason": f"CRS MISMATCH: Target grid requires {target_crs}, but source asset provides {src_crs}."
        }

    src_bbox = source_metadata.get("proj:bbox")
    if not src_bbox or len(src_bbox) != 4:
        return {
            "valid": False,
            "reason": "MISSING SOURCE BBOX: Source asset metadata lacks proj:bbox."
        }

    src_xmin, src_ymin, src_xmax, src_ymax = src_bbox
    if not (src_xmin <= t_bounds["xMin"] and t_bounds["xMax"] <= src_xmax and
            src_ymin <= t_bounds["yMin"] and t_bounds["yMax"] <= src_ymax):
        return {
            "valid": False,
            "reason": f"OUT OF BOUNDS: Target bounds {t_bounds} exceed source raster extent {src_bbox}."
        }

    src_transform = source_metadata.get("proj:transform")
    if not src_transform or len(src_transform) < 6:
        return {
            "valid": False,
            "reason": "MISSING SOURCE TRANSFORM: Source asset metadata lacks proj:transform."
        }

    src_px_w = src_transform[0]
    src_x0 = src_transform[2]
    src_px_h = src_transform[4] # usually -10, -20, or -60
    src_y0 = src_transform[5]

    # Check 10m alignment
    x_offset_dist = t_bounds["xMin"] - src_x0
    y_offset_dist = src_y0 - t_bounds["yMax"]

    if abs(x_offset_dist % t_res) > 1e-4:
        return {
            "valid": False,
            "reason": f"PIXEL MISALIGNMENT: X offset {x_offset_dist}m is not an integer multiple of {t_res}m."
        }
    if abs(y_offset_dist % t_res) > 1e-4:
        return {
            "valid": False,
            "reason": f"PIXEL MISALIGNMENT: Y offset {y_offset_dist}m is not an integer multiple of {t_res}m."
        }

    # Verify span
    span_x = t_bounds["xMax"] - t_bounds["xMin"]
    span_y = t_bounds["yMax"] - t_bounds["yMin"]
    expected_span_x = t_width * t_res
    expected_span_y = t_height * t_res

    if abs(span_x - expected_span_x) > 1e-4 or abs(span_y - expected_span_y) > 1e-4:
        return {
            "valid": False,
            "reason": f"SPAN MISMATCH: Target bounds span {span_x}x{span_y}m does not match dimensions {expected_span_x}x{expected_span_y}m."
        }

    col_off = int(round(x_offset_dist / t_res))
    row_off = int(round(y_offset_dist / t_res))

    return {
        "valid": True,
        "crs": target_crs,
        "col_offset_10m": col_off,
        "row_offset_10m": row_off,
        "width": t_width,
        "height": t_height,
        "projected_width_m": expected_span_x,
        "projected_height_m": expected_span_y,
        "resolution_m": t_res,
        "affine_transform": [t_res, 0.0, t_bounds["xMin"], 0.0, -t_res, t_bounds["yMax"]]
    }

def derive_band_window_spec(band_name, source_asset_metadata, target_grid=None):
    """
    Derive deterministic pixel-aligned raster extraction window and reprojection spec
    for a Sentinel-2 band from source asset metadata and approved target grid.
    Does NOT download or fabricate pixel data.
    """
    if target_grid is None:
        target_grid = AMAZON_TARGET_GRID_10M

    native_res = BAND_NATIVE_RESOLUTIONS.get(band_name, 10)
    t_bounds = target_grid["bounds"]
    t_res = target_grid["resolution"]
    t_width = target_grid["width"]
    t_height = target_grid["height"]

    src_transform = source_asset_metadata.get("proj:transform", [native_res, 0.0, 799980.0, 0.0, -native_res, 9700000.0])
    src_crs = source_asset_metadata.get("proj:code", target_grid["crs"])
    src_shape = source_asset_metadata.get("proj:shape", [int(10980 * 10 / native_res), int(10980 * 10 / native_res)])

    src_x0 = src_transform[2]
    src_y0 = src_transform[5]

    # Calculate exact bounding envelope in source pixel space
    col_start_exact = (t_bounds["xMin"] - src_x0) / float(native_res)
    col_end_exact = (t_bounds["xMax"] - src_x0) / float(native_res)
    row_start_exact = (src_y0 - t_bounds["yMax"]) / float(native_res)
    row_end_exact = (src_y0 - t_bounds["yMin"]) / float(native_res)

    # Integer enclosing read window
    col_int_start = int(np.floor(col_start_exact))
    col_int_end = int(np.ceil(col_end_exact))
    row_int_start = int(np.floor(row_start_exact))
    row_int_end = int(np.ceil(row_end_exact))

    read_window = {
        "col_off": col_int_start,
        "row_off": row_int_start,
        "width": col_int_end - col_int_start,
        "height": row_int_end - row_int_start
    }

    requires_reprojection = (native_res != int(t_res)) or (col_start_exact != col_int_start) or (row_start_exact != row_int_start)
    resampling_method = "bilinear" if requires_reprojection else "nearest"

    return {
        "band": band_name,
        "source_crs": src_crs,
        "source_affine": src_transform,
        "source_dimensions": src_shape,
        "source_resolution": float(native_res),
        "target_crs": target_grid["crs"],
        "target_affine": [t_res, 0.0, t_bounds["xMin"], 0.0, -t_res, t_bounds["yMax"]],
        "target_dimensions": [t_height, t_width],
        "target_resolution": t_res,
        "resampling_method": resampling_method,
        "requires_reprojection": requires_reprojection,
        "source_read_window": read_window,
        "window_exact_coords": {
            "col_start": col_start_exact,
            "col_end": col_end_exact,
            "row_start": row_start_exact,
            "row_end": row_end_exact
        }
    }

def resample_band_to_target_grid(src_array, src_transform, src_crs, target_grid=None, resampling_method="bilinear"):
    """
    Geospatial resampling API for resampling real raster arrays onto the target grid.
    NOTE: Real band alignment verification is deferred until real raster pixels
    are acquired under authenticated CDSE credentials.
    """
    if not HAS_RASTERIO:
        raise ImportError("rasterio is required for raster resampling.")

    if target_grid is None:
        target_grid = AMAZON_TARGET_GRID_10M

    dst_crs = target_grid["crs"]
    dst_width = target_grid["width"]
    dst_height = target_grid["height"]
    t_bounds = target_grid["bounds"]
    t_res = target_grid["resolution"]
    dst_transform = Affine(t_res, 0.0, t_bounds["xMin"], 0.0, -t_res, t_bounds["yMax"])

    dst_array = np.zeros((dst_height, dst_width), dtype=np.float32)

    resample_enum = Resampling.bilinear if resampling_method == "bilinear" else Resampling.nearest

    reproject(
        source=src_array.astype(np.float32),
        destination=dst_array,
        src_transform=src_transform if isinstance(src_transform, Affine) else Affine(*src_transform[:6]),
        src_crs=src_crs,
        dst_transform=dst_transform,
        dst_crs=dst_crs,
        resampling=resample_enum
    )

    return dst_array

S2_BAND_INTERNAL_SUFFIXES = {
    "B01": "R60m/T20MRB_20261001T142709_B01_60m.jp2",
    "B02": "R10m/T20MRB_20261001T142709_B02_10m.jp2",
    "B03": "R10m/T20MRB_20261001T142709_B03_10m.jp2",
    "B04": "R10m/T20MRB_20261001T142709_B04_10m.jp2",
    "B05": "R20m/T20MRB_20261001T142709_B05_20m.jp2",
    "B06": "R20m/T20MRB_20261001T142709_B06_20m.jp2",
    "B07": "R20m/T20MRB_20261001T142709_B07_20m.jp2",
    "B08": "R10m/T20MRB_20261001T142709_B08_10m.jp2",
    "B08A": "R20m/T20MRB_20261001T142709_B8A_20m.jp2",
    "B09": "R60m/T20MRB_20261001T142709_B09_60m.jp2",
    "B11": "R20m/T20MRB_20261001T142709_B11_20m.jp2",
    "B12": "R20m/T20MRB_20261001T142709_B12_20m.jp2",
}

def find_band_paths_in_archive(zf):
    """
    Dynamically locate the internal file paths for all 12 multispectral Sentinel-2 bands
    in any Sentinel-2 L2A .SAFE zip archive across any tile ID or orbit swath.
    """
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
    """
    Derive an integer pixel-aligned target grid in target_crs.
    If bbox is provided, encloses the bbox and snaps to 10m grid (minimum 256x256 pixels).
    If only (lat, lon) is provided, centers a 256x256 patch (2560m x 2560m).
    """
    if bbox is not None and isinstance(bbox, dict):
        min_lon = bbox.get("minLon", bbox.get("min_lon", lon - 0.012))
        max_lon = bbox.get("maxLon", bbox.get("max_lon", lon + 0.012))
        min_lat = bbox.get("minLat", bbox.get("min_lat", lat - 0.012))
        max_lat = bbox.get("maxLat", bbox.get("max_lat", lat + 0.012))
        xs, ys = rasterio.warp.transform('EPSG:4326', target_crs, [min_lon, max_lon], [min_lat, max_lat])
        x_min, x_max = min(xs), max(xs)
        y_min, y_max = min(ys), max(ys)

        x_min = np.floor(x_min / res) * res
        x_max = np.ceil(x_max / res) * res
        y_min = np.floor(y_min / res) * res
        y_max = np.ceil(y_max / res) * res

        span_x = x_max - x_min
        span_y = y_max - y_min

        # Ensure at least 256x256 pixels
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

    # Transform corners to WGS84
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

def download_product_archive(
    product_uuid="72178af6-0ee1-4a6a-9345-d3f16d702deb",
    product_name="S2B_MSIL2A_20261001T142709_N0513_R053_T20MRB_20261001T181049",
    expected_size=375403577,
    cache_dir=None
):
    """
    Download real Sentinel-2 Level-2A product archive from Copernicus Data Space Ecosystem (CDSE).
    Verifies archive integrity and confines storage to scratch/cache/cdse/ (Git-ignored).
    """
    if cache_dir is None:
        cache_dir = CDSE_CACHE_DIR
    os.makedirs(cache_dir, exist_ok=True)

    # Disk space pre-flight: ensure >= 2GB free
    total_b, used_b, free_b = shutil.disk_usage(cache_dir)
    if free_b < 2 * (1024**3):
        raise RuntimeError(f"INSUFFICIENT DISK SPACE: {free_b / (1024**3):.2f} GB free, minimum 2.0 GB required.")

    zip_path = os.path.join(cache_dir, f"{product_name}.zip")

    # Check if complete archive already exists and passes integrity check
    if os.path.exists(zip_path):
        cur_size = os.path.getsize(zip_path)
        if expected_size is None or cur_size == expected_size:
            try:
                with zipfile.ZipFile(zip_path, 'r') as zf:
                    if zf.testzip() is None:
                        return zip_path, cur_size, "VERIFIED_EXISTING"
            except Exception:
                pass # corrupted or partial, re-download

    token, auth_status = get_cdse_token()
    if not token:
        raise PermissionError(f"CDSE AUTHENTICATION FAILED: {auth_status}")

    val_param = "$value"
    download_url = f"https://download.dataspace.copernicus.eu/odata/v1/Products({product_uuid})/{val_param}"
    headers = {"Authorization": f"Bearer {token}"}

    part_path = zip_path + ".part"
    downloaded_bytes = 0
    resume_headers = dict(headers)

    if os.path.exists(part_path):
        cur_part = os.path.getsize(part_path)
        if expected_size is None or cur_part < expected_size:
            downloaded_bytes = cur_part
            resume_headers["Range"] = f"bytes={downloaded_bytes}-"
        else:
            downloaded_bytes = 0

    resp = requests.get(download_url, headers=resume_headers, stream=True, allow_redirects=True, timeout=60)
    if resp.status_code not in (200, 206):
        raise RuntimeError(f"CDSE DOWNLOAD HTTP ERROR {resp.status_code}: {resp.text[:300]}")

    mode = "ab" if resp.status_code == 206 else "wb"
    if resp.status_code == 200:
        downloaded_bytes = 0

    with open(part_path, mode) as f:
        for chunk in resp.iter_content(chunk_size=1024 * 1024):
            if chunk:
                f.write(chunk)
                downloaded_bytes += len(chunk)

    if os.path.exists(zip_path):
        os.remove(zip_path)
    os.rename(part_path, zip_path)

    final_size = os.path.getsize(zip_path)
    if expected_size is not None and final_size != expected_size:
        raise ValueError(f"DOWNLOAD CORRUPTION: Size mismatch (expected {expected_size}, got {final_size}).")
    if final_size == 0:
        raise ValueError("DOWNLOAD CORRUPTION: Downloaded archive is 0 bytes.")

    with zipfile.ZipFile(zip_path, 'r') as zf:
        bad = zf.testzip()
        if bad is not None:
            raise ValueError(f"CORRUPT ZIP ARCHIVE MEMBER: {bad}")

    return zip_path, final_size, "DOWNLOADED_AND_VERIFIED"

def find_and_download_product_by_name(product_name, cache_dir=None):
    """
    Search CDSE OData catalogue for product by name, extract its UUID and size,
    and download it to cache_dir with integrity verification.
    """
    if cache_dir is None:
        cache_dir = CDSE_CACHE_DIR
    clean_name = product_name.replace(".SAFE", "").replace(".zip", "")
    zip_path = os.path.join(cache_dir, f"{clean_name}.zip")

    # Check if already cached
    if os.path.exists(zip_path):
        try:
            with zipfile.ZipFile(zip_path, 'r') as zf:
                if zf.testzip() is None:
                    return zip_path, os.path.getsize(zip_path), "VERIFIED_EXISTING"
        except Exception:
            pass

    # Query CDSE OData for UUID
    url = "https://catalogue.dataspace.copernicus.eu/odata/v1/Products"
    params = {"$filter": f"Name eq '{clean_name}.SAFE'"}
    resp = requests.get(url, params=params, timeout=25)
    if resp.status_code != 200:
        raise RuntimeError(f"CDSE OData query failed (HTTP {resp.status_code}): {resp.text[:200]}")

    items = resp.json().get("value", [])
    if not items:
        # Try without .SAFE suffix
        params = {"$filter": f"Name eq '{clean_name}'"}
        resp = requests.get(url, params=params, timeout=25)
        items = resp.json().get("value", []) if resp.status_code == 200 else []

    if not items:
        raise FileNotFoundError(f"Product '{clean_name}' not found in Copernicus CDSE OData catalogue.")

    item = items[0]
    uuid = item.get("Id")
    content_len = item.get("ContentLength")

    return download_product_archive(
        product_uuid=uuid,
        product_name=clean_name,
        expected_size=content_len,
        cache_dir=cache_dir
    )


def extract_and_resample_bands(zip_path, target_grid=None):
    """
    Extract and resample the required 12 Sentinel-2 bands directly onto target grid.
    Enforces CRS (EPSG:32720), bounding extents, pixel alignment and radiometric integrity.
    """
    if target_grid is None:
        target_grid = AMAZON_TARGET_GRID_10M

    dst_crs = target_grid["crs"]
    t_bounds = target_grid["bounds"]
    t_res = target_grid["resolution"]
    dst_width = target_grid["width"]
    dst_height = target_grid["height"]
    dst_transform = Affine(t_res, 0.0, t_bounds["xMin"], 0.0, -t_res, t_bounds["yMax"])

    raw_bands = {}
    band_provenance = {}

    with zipfile.ZipFile(zip_path, 'r') as zf:
        namelist = zf.namelist()
        found_paths = find_band_paths_in_archive(zf)

        required_band_keys = ["B01", "B02", "B03", "B04", "B05", "B06", "B07", "B08", "B08A", "B09", "B11", "B12"]
        for band_key in required_band_keys:
            internal_path = found_paths.get(band_key)
            if not internal_path and band_key == "B08A":
                internal_path = found_paths.get("B8A")
            if not internal_path:
                suffix = S2_BAND_INTERNAL_SUFFIXES.get(band_key, "")
                matched = [n for n in namelist if n.endswith(suffix)]
                if matched:
                    internal_path = matched[0]
                else:
                    raise ValueError(f"MISSING BAND IN ARCHIVE: Required band {band_key} not found in {os.path.basename(zip_path)}.")

            vsi_path = f"/vsizip/{os.path.abspath(zip_path)}/{internal_path}"

            with rasterio.open(vsi_path) as src:
                src_crs_str = f"EPSG:{src.crs.to_epsg()}" if src.crs.to_epsg() else str(src.crs)
                if src_crs_str != dst_crs:
                    raise ValueError(f"CRS MISMATCH: Band {band_key} has CRS {src_crs_str}, target requires {dst_crs}.")

                s_bounds = src.bounds
                # Intersect check: ensure target bounds intersect source granule footprint
                if (t_bounds["xMax"] < s_bounds.left or t_bounds["xMin"] > s_bounds.right or
                    t_bounds["yMax"] < s_bounds.bottom or t_bounds["yMin"] > s_bounds.top):
                    raise ValueError(f"EXTENT OUT OF BOUNDS: Target bounds completely outside source raster footprint for band {band_key}.")

                src_res = src.res[0]

                if src_res == t_res:
                    # 10m native bands: exact integer pixel window read (with boundless edge support)
                    col_offset = int(round((t_bounds["xMin"] - src.transform[2]) / t_res))
                    row_offset = int(round((src.transform[5] - t_bounds["yMax"]) / t_res))
                    win = Window(col_off=col_offset, row_off=row_offset, width=dst_width, height=dst_height)
                    band_data = src.read(1, window=win, boundless=True, fill_value=0).astype(np.float32)
                    resampling_applied = "native_integer_window_10m"
                else:
                    # 20m / 60m bands: window read with margin + bilinear reprojection
                    inv = ~src.transform
                    c_min, r_min = inv * (t_bounds["xMin"], t_bounds["yMax"])
                    c_max, r_max = inv * (t_bounds["xMax"], t_bounds["yMin"])
                    c_start = int(np.floor(min(c_min, c_max))) - 2
                    c_end = int(np.ceil(max(c_min, c_max))) + 2
                    r_start = int(np.floor(min(r_min, r_max))) - 2
                    r_end = int(np.ceil(max(r_min, r_max))) + 2

                    sub_win = Window(col_off=c_start, row_off=r_start, width=c_end - c_start, height=r_end - r_start)
                    sub_data = src.read(1, window=sub_win, boundless=True, fill_value=0).astype(np.float32)
                    sub_trans = rasterio.windows.transform(sub_win, src.transform)

                    band_data = np.zeros((dst_height, dst_width), dtype=np.float32)
                    reproject(
                        source=sub_data,
                        destination=band_data,
                        src_transform=sub_trans,
                        src_crs=src.crs,
                        dst_transform=dst_transform,
                        dst_crs=dst_crs,
                        resampling=Resampling.bilinear
                    )
                    resampling_applied = f"bilinear_from_{int(src_res)}m"

                raw_bands[band_key] = band_data
                band_provenance[band_key] = {
                    "internal_file": internal_path,
                    "native_resolution_m": float(src_res),
                    "resampling": resampling_applied,
                    "min_dn": float(band_data.min()),
                    "max_dn": float(band_data.max()),
                    "mean_dn": float(band_data.mean())
                }

    return raw_bands, band_provenance

def acquire_and_process_amazon_raster(
    product_id="S2B_MSIL2A_20261001T142709_N0513_R053_T20MRB_20261001T181049",
    product_uuid="72178af6-0ee1-4a6a-9345-d3f16d702deb",
    target_grid=None
):
    """
    Authoritative acquisition and 15-channel raster pipeline for Amazon Sentinel-2 product:
    1. Checks CDSE credentials and disk capacity.
    2. Downloads and verifies real Sentinel-2 L2A archive.
    3. Extracts and resamples 12 multispectral bands onto target grid (EPSG:32720, 256x256, 10m).
    4. Scales reflectance (DN / 10000.0).
    5. Computes spectral indices (NDVI, NBR, NDRI).
    6. Constructs normalized 15-channel float32 tensor matching Land8Fire dataset contract.
    7. Persists processed arrays to scratch/cache/cdse/processed/ (Git-ignored).
    """
    if target_grid is None:
        target_grid = AMAZON_TARGET_GRID_10M

    creds = check_cdse_credentials()
    if not creds["configured"]:
        return {
            "status": "blocked",
            "reason": "CDSE RASTER ACCESS: BLOCKED — CREDENTIALS NOT CONFIGURED",
            "is15ChannelReady": False,
            "product_id": product_id
        }

    # 1. Download / Verify Archive
    zip_path, archive_size, dl_status = download_product_archive(
        product_uuid=product_uuid,
        product_name=product_id,
        expected_size=375403577,
        cache_dir=CDSE_CACHE_DIR
    )

    # 2. Extract and Resample 12 Bands
    raw_12_bands, band_prov = extract_and_resample_bands(zip_path, target_grid=target_grid)

    # 3. Construct 15-Channel Tensor
    tensor_result = construct_15channel_tensor(
        raw_12_bands,
        width=target_grid["width"],
        height=target_grid["height"],
        is_raw_dn=True
    )

    raw_15ch = tensor_result["raw_tensor"]
    norm_15ch = tensor_result["normalized_tensor"]

    # 4. Valid pixel analysis
    total_pixels = int(target_grid["width"] * target_grid["height"])
    # In L2A BOA reflectance, valid surface pixels have B02, B03, B04 > 0
    valid_mask = (raw_12_bands["B02"] > 0) & (raw_12_bands["B03"] > 0) & (raw_12_bands["B04"] > 0)
    valid_pixels = int(valid_mask.sum())
    valid_pct = float(valid_pixels / total_pixels * 100.0)

    # 5. Persist output artifacts to scratch/cache/cdse/processed/
    os.makedirs(CDSE_PROCESSED_DIR, exist_ok=True)
    raw_tensor_path = os.path.join(CDSE_PROCESSED_DIR, "amazon_15ch_raw_reflectance.npy")
    norm_tensor_path = os.path.join(CDSE_PROCESSED_DIR, "amazon_15ch_normalized_tensor.npy")
    metadata_path = os.path.join(CDSE_PROCESSED_DIR, "amazon_15ch_metadata.json")

    np.save(raw_tensor_path, raw_15ch)
    np.save(norm_tensor_path, norm_15ch)

    channel_names = ["B01", "B02", "B03", "B04", "B05", "B06", "B07", "B08", "B08A", "B09", "B11", "B12", "NDVI", "NBR", "NDRI"]
    channel_stats = {}
    for idx, cname in enumerate(channel_names):
        r_slice = raw_15ch[idx]
        n_slice = norm_15ch[idx]
        channel_stats[cname] = {
            "channel_index": idx,
            "raw_min": float(r_slice.min()),
            "raw_max": float(r_slice.max()),
            "raw_mean": float(r_slice.mean()),
            "raw_std": float(r_slice.std()),
            "norm_min": float(n_slice.min()),
            "norm_max": float(n_slice.max()),
            "norm_mean": float(n_slice.mean()),
            "norm_std": float(n_slice.std())
        }

    summary_metadata = {
        "product_id": product_id,
        "product_uuid": product_uuid,
        "acquisition_date": "2026-10-01T14:27:09Z",
        "archive_size_bytes": archive_size,
        "archive_status": dl_status,
        "target_grid": target_grid,
        "tensor_shape": list(norm_15ch.shape),
        "dtype": str(norm_15ch.dtype),
        "channels": channel_names,
        "total_pixels": total_pixels,
        "valid_pixels": valid_pixels,
        "valid_pixel_pct": valid_pct,
        "has_nan": tensor_result["has_nan"],
        "has_inf": tensor_result["has_inf"],
        "channel_statistics": channel_stats,
        "band_extraction_provenance": band_prov,
        "output_files": {
            "raw_tensor": os.path.relpath(raw_tensor_path, _repo_root),
            "normalized_tensor": os.path.relpath(norm_tensor_path, _repo_root),
            "metadata_json": os.path.relpath(metadata_path, _repo_root)
        }
    }

    with open(metadata_path, 'w') as mf:
        json.dump(summary_metadata, mf, indent=2)

    return {
        "status": "success",
        "reason": "OK",
        "is15ChannelReady": True,
        "product_id": product_id,
        "archive_size_bytes": archive_size,
        "archive_status": dl_status,
        "tensor_shape": list(norm_15ch.shape),
        "dtype": str(norm_15ch.dtype),
        "valid_pixel_pct": valid_pct,
        "has_nan": tensor_result["has_nan"],
        "has_inf": tensor_result["has_inf"],
        "output_files": summary_metadata["output_files"],
        "channel_statistics": channel_stats
    }

def check_archive_covers_point(zip_path, lat, lon):
    """
    Check if a Sentinel-2 archive covers (lat, lon) with valid non-zero surface data.
    Returns dict with { "covers": bool, "native_crs": str, "x_utm": float, "y_utm": float, "valid_surface": bool }
    """
    if not os.path.exists(zip_path):
        return {"covers": False, "reason": "Archive not found"}

    try:
        with zipfile.ZipFile(zip_path, 'r') as zf:
            found_paths = find_band_paths_in_archive(zf)
            b02_path = found_paths.get("B02")
            if not b02_path:
                return {"covers": False, "reason": "B02 band not found in archive"}

            vsi_path = f"/vsizip/{os.path.abspath(zip_path)}/{b02_path}"
            with rasterio.open(vsi_path) as src:
                src_crs = f"EPSG:{src.crs.to_epsg()}" if src.crs.to_epsg() else str(src.crs)
                xs, ys = rasterio.warp.transform('EPSG:4326', src_crs, [lon], [lat])
                xc, yc = xs[0], ys[0]
                s_bounds = src.bounds

                if not (s_bounds.left <= xc <= s_bounds.right and s_bounds.bottom <= yc <= s_bounds.top):
                    return {
                        "covers": False,
                        "native_crs": src_crs,
                        "x_utm": xc,
                        "y_utm": yc,
                        "reason": "Coordinates outside tile footprint"
                    }

                # Check integer pixel coordinates to verify if within valid swath
                col = int(round((xc - src.transform[2]) / src.res[0]))
                row = int(round((src.transform[5] - yc) / src.res[1]))

                if 0 <= col < src.width and 0 <= row < src.height:
                    # Read a 5x5 sample around coordinates to check validity
                    win = Window(col_off=max(0, col - 2), row_off=max(0, row - 2),
                                 width=min(5, src.width - max(0, col - 2)),
                                 height=min(5, src.height - max(0, row - 2)))
                    sample = src.read(1, window=win)
                    has_valid = bool((sample > 0).any())
                    return {
                        "covers": True,
                        "valid_surface": has_valid,
                        "native_crs": src_crs,
                        "x_utm": xc,
                        "y_utm": yc,
                        "reason": "OK" if has_valid else "Coordinates outside orbital swath (zero reflectance)"
                    }
                else:
                    return {"covers": False, "native_crs": src_crs, "reason": "Pixel coordinates out of range"}
    except Exception as e:
        return {"covers": False, "reason": str(e)}

def run_tiled_unet_inference(model, norm_tensor_15ch, threshold=0.65, patch_size=256, stride=192):
    """
    Executes model inference over an arbitrary (15, H, W) normalized float32 tensor.
    If H == 256 and W == 256: single pass.
    If larger: sliding window with 32-64px overlap and 2D Hann blending weights.
    Returns: (probs, binary_mask) where probs in [0.0, 1.0] float32 and binary_mask in {0, 1} uint8.
    """
    import torch

    _, H, W = norm_tensor_15ch.shape

    if H == patch_size and W == patch_size:
        # Single patch pass
        input_bytes = bytearray(norm_tensor_15ch.tobytes())
        input_t = torch.frombuffer(input_bytes, dtype=torch.float32).reshape(1, 15, patch_size, patch_size)
        with torch.no_grad():
            logits = model(input_t)
            probs_t = torch.sigmoid(logits).squeeze()
        probs_bytes = bytes(probs_t.untyped_storage())
        probs = np.frombuffer(probs_bytes, dtype=np.float32).reshape(H, W)
    else:
        # Tiled sliding window with 2D Hann blending
        r_starts = list(range(0, H - patch_size + 1, stride))
        if not r_starts or r_starts[-1] + patch_size < H:
            r_starts.append(H - patch_size)
        c_starts = list(range(0, W - patch_size + 1, stride))
        if not c_starts or c_starts[-1] + patch_size < W:
            c_starts.append(W - patch_size)

        hann_1d = np.hanning(patch_size).astype(np.float32)
        hann_2d = np.outer(hann_1d, hann_1d)
        hann_2d = np.maximum(hann_2d, 0.05) # Minimum weight to prevent zero division

        accum = np.zeros((H, W), dtype=np.float32)
        weights = np.zeros((H, W), dtype=np.float32)

        for r in r_starts:
            for c in c_starts:
                patch = norm_tensor_15ch[:, r:r+patch_size, c:c+patch_size]
                p_bytes = bytearray(patch.tobytes())
                p_tensor = torch.frombuffer(p_bytes, dtype=torch.float32).reshape(1, 15, patch_size, patch_size)
                with torch.no_grad():
                    p_logits = model(p_tensor)
                    p_prob_t = torch.sigmoid(p_logits).squeeze()
                p_prob_b = bytes(p_prob_t.untyped_storage())
                p_prob = np.frombuffer(p_prob_b, dtype=np.float32).reshape(patch_size, patch_size)

                accum[r:r+patch_size, c:c+patch_size] += p_prob * hann_2d
                weights[r:r+patch_size, c:c+patch_size] += hann_2d

        probs = accum / np.maximum(weights, 1e-6)

    binary_mask = (probs >= threshold).astype(np.uint8)
    return probs, binary_mask

def generate_prediction_web_artifacts(
    probs,
    binary_mask,
    raw_12_bands,
    target_grid,
    output_dir,
    prefix="prediction",
    metadata=None
):
    """
    Generate georeferenced GeoTIFFs, true-color RGB PNG, continuous probability heatmap PNG,
    binary prediction mask PNG, and vectorized WGS84 GeoJSON polygons for Cesium display.
    """
    from PIL import Image
    os.makedirs(output_dir, exist_ok=True)

    H, W = probs.shape
    t_bounds = target_grid["bounds"]
    t_res = target_grid["resolution"]
    dst_crs = target_grid["crs"]
    grid_transform = rasterio.Affine(t_res, 0.0, t_bounds["xMin"], 0.0, -t_res, t_bounds["yMax"])

    # 1. Save Georeferenced GeoTIFFs
    prob_tif_path = os.path.join(output_dir, f"{prefix}_probability.tif")
    mask_tif_path = os.path.join(output_dir, f"{prefix}_mask.tif")

    geotiff_profile = {
        "driver": "GTiff",
        "height": H,
        "width": W,
        "count": 1,
        "crs": dst_crs,
        "transform": grid_transform,
        "nodata": None
    }

    with rasterio.open(prob_tif_path, "w", dtype=rasterio.float32, **geotiff_profile) as dst:
        dst.write(probs, 1)

    with rasterio.open(mask_tif_path, "w", dtype=rasterio.uint8, **geotiff_profile) as dst:
        dst.write(binary_mask, 1)

    # 2. True-Color Sentinel-2 RGB Image (B04=Red, B03=Green, B02=Blue)
    r_band = raw_12_bands.get("B04", np.zeros((H, W), dtype=np.float32))
    g_band = raw_12_bands.get("B03", np.zeros((H, W), dtype=np.float32))
    b_band = raw_12_bands.get("B02", np.zeros((H, W), dtype=np.float32))

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

    rgb_png_path = os.path.join(output_dir, f"{prefix}_sentinel2_rgb.png")
    Image.fromarray(rgb_img, mode="RGB").save(rgb_png_path)

    # 3. Probability Heatmap PNG (Inferno scientific gradient with alpha)
    prob_rgba = np.zeros((H, W, 4), dtype=np.uint8)
    for r in range(H):
        for c in range(W):
            p = float(probs[r, c])
            if p < 0.15:
                prob_rgba[r, c] = [20, 10, 40, int(p * 200)]
            elif p < 0.45:
                t = (p - 0.15) / 0.30
                prob_rgba[r, c] = [int(40 + t * 60), int(15 + t * 20), int(80 + t * 60), int(100 + t * 40)]
            elif p < 0.65:
                t = (p - 0.45) / 0.20
                prob_rgba[r, c] = [int(100 + t * 130), int(35 + t * 50), int(140 - t * 100), int(140 + t * 30)]
            else:
                t = (p - 0.65) / 0.35
                prob_rgba[r, c] = [int(230 + t * 25), int(85 + t * 165), int(40 - t * 30), int(170 + t * 65)]

    prob_png_path = os.path.join(output_dir, f"{prefix}_probability_colormap.png")
    Image.fromarray(prob_rgba, mode="RGBA").save(prob_png_path)

    # 4. Binary Prediction Mask PNG (Bright Crimson #EF4444 with alpha 160)
    mask_rgba = np.zeros((H, W, 4), dtype=np.uint8)
    mask_pixels = (binary_mask == 1)
    mask_rgba[mask_pixels] = [239, 68, 68, 160]

    mask_png_path = os.path.join(output_dir, f"{prefix}_binary_mask.png")
    Image.fromarray(mask_rgba, mode="RGBA").save(mask_png_path)

    # 5. Vectorized GeoJSON of the Unmodified Binary Prediction Mask
    shapes = rasterio.features.shapes(binary_mask, mask=(binary_mask == 1), transform=grid_transform)
    features = []
    prod_id = metadata.get("product_id", "Sentinel-2 L2A") if metadata else "Sentinel-2 L2A"
    acq_date = metadata.get("acquisition_date", "2026-10-01T14:27:09Z") if metadata else "2026-10-01T14:27:09Z"

    for geom, val in shapes:
        geom_wgs84 = rasterio.warp.transform_geom(dst_crs, "EPSG:4326", geom)
        features.append({
            "type": "Feature",
            "properties": {
                "source": f"Sentinel-2 L2A ({prod_id})",
                "acquisitionDate": acq_date,
                "model": "Land8Fire U-Net 15-Channel",
                "modelCheckpoint": "land8fire_15ch_unet_full_dataset_best.pth",
                "classification": "MODEL_PREDICTION",
                "threshold": 0.65,
                "burnProbability": ">= 0.65",
                "scientificNote": "Model prediction from single-date optical reflection. Not confirmed active fire or ground truth."
            },
            "geometry": geom_wgs84
        })

    total_pixels = int(H * W)
    burned_pixels = int(np.sum(binary_mask))
    burned_pct = float(burned_pixels / total_pixels * 100.0)
    burned_ha = float(burned_pixels * (t_res * t_res) / 10000.0)

    geojson_doc = {
        "type": "FeatureCollection",
        "name": f"Land8Fire U-Net 15-Channel Burned Area Prediction ({prefix})",
        "crs": {
            "type": "name",
            "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}
        },
        "properties": {
            "productId": prod_id,
            "acquisitionDate": acq_date,
            "modelCheckpoint": "land8fire_15ch_unet_full_dataset_best.pth",
            "threshold": 0.65,
            "totalPixels": total_pixels,
            "predictedBurnedPixels": burned_pixels,
            "predictedBurnedPercentage": round(burned_pct, 2),
            "predictedBurnedAreaHectares": round(burned_ha, 2),
            "targetGridCrs": dst_crs,
            "provenance": "DERIVED / U-NET MODEL INFERENCE"
        },
        "features": features
    }

    geojson_path = os.path.join(output_dir, f"{prefix}_prediction.json")
    with open(geojson_path, "w") as f:
        json.dump(geojson_doc, f, indent=2)

    return {
        "probability_tif": prob_tif_path,
        "mask_tif": mask_tif_path,
        "sentinel2_rgb_png": rgb_png_path,
        "probability_colormap_png": prob_png_path,
        "binary_mask_png": mask_png_path,
        "geojson": geojson_path,
        "burned_pixels": burned_pixels,
        "total_pixels": total_pixels,
        "burned_percentage": round(burned_pct, 2),
        "burned_hectares": round(burned_ha, 2),
        "num_vector_polygons": len(features)
    }

def acquire_and_process_dynamic_raster(lat, lon, bbox=None, product_id=None, simulation_time=None, model=None):
    """
    Complete dynamic raster acquisition, 15-channel preprocessing, U-Net inference,
    and georeferenced asset generation for arbitrary map coordinates and perimeters.
    """
    import hashlib
    import torch
    try:
        from scripts.inference_server import UNet15
    except ImportError:
        from inference_server import UNet15

    # 1. Identify covering Sentinel-2 archive
    # First inspect locally cached archives in CDSE_CACHE_DIR
    cached_zips = [
        os.path.join(CDSE_CACHE_DIR, f)
        for f in os.listdir(CDSE_CACHE_DIR)
        if f.endswith('.zip') and not f.endswith('.part')
    ]

    selected_zip = None
    cov_info = None

    for zp in cached_zips:
        cov = check_archive_covers_point(zp, lat, lon)
        if cov.get("covers") and cov.get("valid_surface"):
            selected_zip = zp
            cov_info = cov
            break

    if not selected_zip and product_id:
        try:
            dl_path, _, _ = find_and_download_product_by_name(product_id)
            cov = check_archive_covers_point(dl_path, lat, lon)
            if cov.get("covers") and cov.get("valid_surface"):
                selected_zip = dl_path
                cov_info = cov
        except Exception as e:
            print(f"[WARN] Failed to download product {product_id}: {e}")

    if not selected_zip:
        # Check if coordinates fall within known tile bounds even if outside current swath
        for zp in cached_zips:
            cov = check_archive_covers_point(zp, lat, lon)
            if cov.get("covers"):
                return {
                    "status": "unavailable",
                    "reason": f"SATELLITE OBSERVATION: OUT_OF_SWATH (Coordinates {lat:.4f}°, {lon:.4f}° fall outside orbital acquisition swath of local Sentinel-2 archive). Zero synthetic data will be fabricated.",
                    "message": f"SATELLITE OBSERVATION: OUT_OF_SWATH (Coordinates {lat:.4f}°, {lon:.4f}° fall outside orbital swath).",
                    "temporalCategory": "AWAITING_SATELLITE_OBSERVATION"
                }

        # Query CDSE STAC Catalogue for products covering this location
        return {
            "status": "unavailable",
            "reason": f"SATELLITE OBSERVATION: NOT_CACHED (No downloaded Sentinel-2 L2A archive currently covers coordinates {lat:.4f}°, {lon:.4f}°). Discovered tile pending CDSE download.",
            "message": f"SATELLITE OBSERVATION: NOT_CACHED (No downloaded Sentinel-2 L2A archive currently covers coordinates {lat:.4f}°, {lon:.4f}°).",
            "temporalCategory": "AWAITING_SATELLITE_OBSERVATION"
        }

    # Extract Product ID and timestamp from archive filename
    prod_name = os.path.basename(selected_zip).replace('.zip', '')
    native_crs = cov_info.get("native_crs", "EPSG:32720")

    # 2. Derive dynamic pixel-aligned target grid
    target_grid = compute_dynamic_target_grid(lat, lon, bbox=bbox, res=10.0, target_crs=native_crs)

    # 3. Extract and resample 12 bands
    raw_12_bands, prov = extract_and_resample_bands(selected_zip, target_grid=target_grid)

    # Check valid pixel percentage
    b02 = raw_12_bands["B02"]
    valid_pixels = int(((b02 > 0) & (raw_12_bands["B03"] > 0) & (raw_12_bands["B04"] > 0)).sum())
    total_pixels = int(target_grid["width"] * target_grid["height"])
    valid_pct = (valid_pixels / total_pixels) * 100.0

    if valid_pct < 5.0:
        return {
            "status": "unavailable",
            "reason": f"SATELLITE OBSERVATION: NODATA (Only {valid_pct:.1f}% valid reflectance coverage across target grid). Zero synthetic data will be fabricated.",
            "message": f"SATELLITE OBSERVATION: NODATA ({valid_pct:.1f}% valid reflectance coverage).",
            "temporalCategory": "AWAITING_SATELLITE_OBSERVATION"
        }

    # 4. Construct authoritative 15-channel normalized tensor
    tensor_res = construct_15channel_tensor(raw_12_bands, width=target_grid["width"], height=target_grid["height"], is_raw_dn=True)
    norm_15ch = tensor_res["normalized_tensor"]

    # 5. Load model if not provided
    if model is None:
        ckpt_path = os.path.join(CDSE_CACHE_DIR, "land8fire_15ch_unet_full_dataset_best.pth")
        if not os.path.exists(ckpt_path):
            ckpt_path = os.path.join(_repo_root, "scratch", "cache", "land8fire_15ch_unet_full_dataset_best.pth")
        if not os.path.exists(ckpt_path):
            ckpt_path = r"G:\.shortcut-targets-by-id\1JR1Kj2BMHFHE8RVqogPyMglKE1YRaoOn\Land8Fire_From_Scratch\models\land8fire_15ch_unet_full_dataset_best.pth"

        with open(ckpt_path, "rb") as f:
            buf = io.BytesIO(f.read())
        ckpt = torch.load(buf, map_location="cpu", weights_only=False)
        model = UNet15(in_channels=15, out_channels=1)
        if "model_state_dict" in ckpt:
            model.load_state_dict(ckpt["model_state_dict"])
        else:
            model.load_state_dict(ckpt)
        model.eval()

    # 6. Execute U-Net inference (supports single 256x256 patch or tiled sliding window)
    probs, binary_mask = run_tiled_unet_inference(model, norm_15ch, threshold=0.65, patch_size=256, stride=192)

    # 7. Generate Georeferenced Web Artifacts
    # Build unique hash ID for coordinate & grid extent
    hash_str = f"{prod_name}_{target_grid['bounds']['xMin']:.0f}_{target_grid['bounds']['yMax']:.0f}_{target_grid['width']}_{target_grid['height']}"
    hash_id = hashlib.md5(hash_str.encode()).hexdigest()[:12]

    out_dynamic_dir = os.path.join(PUBLIC_DYNAMIC_DIR, hash_id)
    os.makedirs(out_dynamic_dir, exist_ok=True)

    # Extract acquisition date from product name (e.g. 20261001T142709)
    date_match = re.search(r'_(\d{8}T\d{6})_', prod_name)
    if date_match:
        ds = date_match.group(1)
        acq_time_iso = f"{ds[:4]}-{ds[4:6]}-{ds[6:8]}T{ds[9:11]}:{ds[11:13]}:{ds[13:15]}Z"
    else:
        acq_time_iso = "2026-10-01T14:27:09Z"

    prod_meta = {
        "product_id": prod_name,
        "acquisition_date": acq_time_iso,
        "target_grid": target_grid
    }

    art_res = generate_prediction_web_artifacts(
        probs, binary_mask, raw_12_bands, target_grid, out_dynamic_dir,
        prefix=f"unet_{hash_id}", metadata=prod_meta
    )

    # 8. Determine Temporal Classification
    sim_time_iso = simulation_time or "2026-10-01T15:00:00Z"
    try:
        t_acq = time.mktime(time.strptime(acq_time_iso[:19], "%Y-%m-%dT%H:%M:%S"))
        t_sim = time.mktime(time.strptime(sim_time_iso[:19], "%Y-%m-%dT%H:%M:%S"))
        diff_hours = abs(t_sim - t_acq) / 3600.0

        if t_acq < t_sim:
            temporal_category = "HISTORICAL_PRE_EVENT_BASELINE"
        elif diff_hours <= 24.0:
            temporal_category = "CONCURRENT_OBSERVATION"
        else:
            temporal_category = "POST_EVENT_OBSERVATION"
    except Exception:
        temporal_category = "HISTORICAL_PRE_EVENT_BASELINE"
        diff_hours = 0.0

    return {
        "status": "success",
        "latitude": lat,
        "longitude": lon,
        "sceneId": prod_name,
        "acquisitionTime": acq_time_iso,
        "simulationTime": sim_time_iso,
        "temporalCategory": temporal_category,
        "timeDifferenceHours": round(diff_hours, 1),
        "threshold": 0.65,
        "predictedBurnedPixels": art_res["burned_pixels"],
        "totalPixels": art_res["total_pixels"],
        "predictedBurnedPercentage": art_res["burned_percentage"],
        "predictedAreaHectares": art_res["burned_hectares"],
        "validDataPercentage": round(valid_pct, 1),
        "targetGrid": target_grid,
        "spatialExtent": target_grid["geographic_bounds_wgs84"],
        "rasterCrs": target_grid["crs"],
        "geographicCrs": "EPSG:4326",
        "displayCrs": "EPSG:4326",
        "source": f"Land8Fire U-Net 15-Channel ({prod_name})",
        "provenance": "DERIVED / U-NET MODEL INFERENCE",
        "scientificNote": (
            "Burned-area segmentation probability from single-date Sentinel-2 Level-2A surface reflectance. "
            "High predictions over dry soil or urban areas reflect optical spectral confusion. Not confirmed fire."
        ),
        "geoJsonUrl": f"/data/dynamic/{hash_id}/unet_{hash_id}_prediction.json",
        "sentinel2RgbUrl": f"/data/dynamic/{hash_id}/unet_{hash_id}_sentinel2_rgb.png",
        "probabilityColormapUrl": f"/data/dynamic/{hash_id}/unet_{hash_id}_probability_colormap.png",
        "binaryMaskUrl": f"/data/dynamic/{hash_id}/unet_{hash_id}_binary_mask.png",
        "probabilityRasterUrl": f"/data/dynamic/{hash_id}/unet_{hash_id}_probability.tif",
        "binaryMaskRasterUrl": f"/data/dynamic/{hash_id}/unet_{hash_id}_mask.tif"
    }

if __name__ == "__main__":
    print("=== EXECUTING AUTHORITATIVE CDSE RASTER ACQUISITION PIPELINE ===")
    res = acquire_and_process_amazon_raster()
    print("Acquisition & Processing Result:")
    # Print summary without excessive noise
    print(json.dumps({k: v for k, v in res.items() if k != "channel_statistics"}, indent=2))

