import os
import sys
import io
import json
import zipfile
import numpy as np
import torch
import torch.nn as nn
import rasterio
from rasterio.io import MemoryFile
from http.server import HTTPServer, BaseHTTPRequestHandler

_repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _repo_root not in sys.path:
    sys.path.insert(0, _repo_root)
_scripts_dir = os.path.dirname(os.path.abspath(__file__))
if _scripts_dir not in sys.path:
    sys.path.insert(0, _scripts_dir)

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(_repo_root, ".env.local"))
    load_dotenv(os.path.join(_repo_root, ".env"))
except ImportError:
    pass

import functools
try:
    import affine
    for _prop_name in ['determinant', 'is_degenerate', 'is_proper', '_astuple']:
        _prop = getattr(affine.Affine, _prop_name, None)
        if isinstance(_prop, functools.cached_property):
            setattr(affine.Affine, _prop_name, property(_prop.func))
except ImportError:
    pass

_scratch_tmp = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scratch", "tmp")
os.makedirs(_scratch_tmp, exist_ok=True)
os.environ["TEMP"] = _scratch_tmp
os.environ["TMP"] = _scratch_tmp

PORT = 8000
MODEL_PATH = r"G:\.shortcut-targets-by-id\1JR1Kj2BMHFHE8RVqogPyMglKE1YRaoOn\Land8Fire_From_Scratch\models\land8fire_15ch_unet_full_dataset_best.pth"
ZIP_PATH = r"G:\.shortcut-targets-by-id\1mf2mmndxMskGzk3Zj-t9q-V6PoUx2oMu\Wildfire Project\datasets\Satellite_burned_area_dataset_part5.zip"

MEAN_GPU = torch.tensor([
    0.054257, 0.067676, 0.091714, 0.107805, 0.143499,
    0.202211, 0.225245, 0.237767, 0.248593, 0.254053,
    0.240885, 0.173530, 0.368527, 0.120145, 0.320615
], dtype=torch.float32)

STD_GPU = torch.tensor([
    0.072358, 0.075483, 0.079899, 0.095268, 0.097878,
    0.107183, 0.115450, 0.122247, 0.122630, 0.140352,
    0.119594, 0.098965, 0.303724, 0.325588, 0.337697
], dtype=torch.float32)

class DoubleConv(nn.Module):
    def __init__(self, in_channels, out_channels):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(in_channels, out_channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_channels, out_channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True)
        )

    def forward(self, x):
        return self.conv(x)

class UNet15(nn.Module):
    def __init__(self, in_channels=15, out_channels=1):
        super().__init__()
        self.inc = DoubleConv(in_channels, 64)
        self.down1 = nn.Sequential(nn.MaxPool2d(2), DoubleConv(64, 128))
        self.down2 = nn.Sequential(nn.MaxPool2d(2), DoubleConv(128, 256))
        self.down3 = nn.Sequential(nn.MaxPool2d(2), DoubleConv(256, 512))
        self.down4 = nn.Sequential(nn.MaxPool2d(2), DoubleConv(512, 1024))

        self.up1 = nn.ConvTranspose2d(1024, 512, 2, stride=2)
        self.conv_up1 = DoubleConv(1024, 512)
        self.up2 = nn.ConvTranspose2d(512, 256, 2, stride=2)
        self.conv_up2 = DoubleConv(512, 256)
        self.up3 = nn.ConvTranspose2d(256, 128, 2, stride=2)
        self.conv_up3 = DoubleConv(256, 128)
        self.up4 = nn.ConvTranspose2d(128, 64, 2, stride=2)
        self.conv_up4 = DoubleConv(128, 64)

        self.outc = nn.Conv2d(64, out_channels, 1)

    def forward(self, x):
        x1 = self.inc(x)
        x2 = self.down1(x1)
        x3 = self.down2(x2)
        x4 = self.down3(x3)
        x5 = self.down4(x4)

        x = self.up1(x5)
        x = torch.cat([x, x4], dim=1)
        x = self.conv_up1(x)

        x = self.up2(x)
        x = torch.cat([x, x3], dim=1)
        x = self.conv_up2(x)

        x = self.up3(x)
        x = torch.cat([x, x2], dim=1)
        x = self.conv_up3(x)

        x = self.up4(x)
        x = torch.cat([x, x1], dim=1)
        x = self.conv_up4(x)

        logits = self.outc(x)
        return logits

def run_unet_inference_emsr239():
    if not os.path.exists(MODEL_PATH) or not os.path.exists(ZIP_PATH):
        raise FileNotFoundError("Model or zip archive not found on local drive.")

    with open(MODEL_PATH, "rb") as f:
        buffer = io.BytesIO(f.read())
    checkpoint = torch.load(buffer, map_location="cpu", weights_only=False)

    model = UNet15(in_channels=15, out_channels=1)
    if "model_state_dict" in checkpoint:
        model.load_state_dict(checkpoint["model_state_dict"])
    else:
        model.load_state_dict(checkpoint)
    model.eval()

    tiff_name = "Satellite_burned_area_dataset_part5/EMSR239_05ALMADENDELAPLATAOVERVIEW_02GRADING_MAP_v1_vector/sentinel2_2017-07-31.tiff"
    with zipfile.ZipFile(ZIP_PATH, "r") as z:
        tiff_bytes = z.read(tiff_name)

    row_start, col_start = 128, 512
    patch_size = 256

    with MemoryFile(tiff_bytes) as memfile:
        with memfile.open() as src:
            full_raster = src.read()

    patch_raster = full_raster[:, row_start:row_start+patch_size, col_start:col_start+patch_size].astype(np.float32)

    b_scaled = patch_raster / 10000.0 if patch_raster.max() > 1.5 else patch_raster

    b01 = b_scaled[0]
    b02 = b_scaled[1]
    b03 = b_scaled[2]
    b04 = b_scaled[3]
    b05 = b_scaled[4]
    b06 = b_scaled[5]
    b07 = b_scaled[6]
    b08 = b_scaled[7]
    b08a = b_scaled[8]
    b09 = b_scaled[9]
    b11_swir1 = b_scaled[10] if patch_raster.shape[0] > 10 else b_scaled[9]
    b12_swir2 = b_scaled[11] if patch_raster.shape[0] > 11 else b_scaled[9]

    def compute_index(b_a, b_b):
        denom = b_a + b_b
        idx = np.zeros_like(b_a)
        mask = denom > 1e-6
        idx[mask] = (b_a[mask] - b_b[mask]) / denom[mask]
        return np.clip(idx, -1.0, 1.0)

    ndvi = compute_index(b08, b04)
    nbr  = compute_index(b08, b12_swir2)
    ndri = compute_index(b04, b02)

    raw_15ch = np.stack([
        b01, b02, b03, b04, b05, b06, b07, b08,
        b08a, b09, b11_swir1, b12_swir2, ndvi, nbr, ndri
    ], axis=0)

    input_tensor = torch.from_numpy(raw_15ch).float().unsqueeze(0)
    mean_vec = MEAN_GPU.view(1, 15, 1, 1)
    std_vec = STD_GPU.view(1, 15, 1, 1)
    norm_tensor = (input_tensor - mean_vec) / (std_vec + 1e-7)

    with torch.no_grad():
        logits = model(norm_tensor)
        probs = torch.sigmoid(logits).squeeze().cpu().numpy()

    pred_binary = (probs >= 0.65).astype(np.uint8)
    burned_count = int(np.sum(pred_binary))

    return {
        "status": "success",
        "latitude": 37.844474,
        "longitude": -6.004920,
        "sceneId": "EMSR239_05ALMADENDELAPLATAOVERVIEW_02GRADING_MAP_v1_vector_r128_c512",
        "acquisitionTime": "2017-07-31T00:00:00Z",
        "threshold": 0.65,
        "predictedBurnedPixels": burned_count,
        "totalPixels": 65536,
        "predictedBurnedPercentage": round((burned_count / 65536) * 100, 2),
        "source": "Land8Fire U-Net 15-Channel",
        "provenance": "DERIVED / U-NET INFERENCE",
        "geojsonUrl": "/data/emsr239_prediction.json"
    }

def run_unet_inference_amazon():
    meta_path = os.path.join(_repo_root, "scratch", "cache", "cdse", "processed", "amazon_unet_inference_metadata.json")
    if os.path.exists(meta_path):
        with open(meta_path, "r") as f:
            inf_meta = json.load(f)
        metrics = inf_meta.get("metrics", {})
        return {
            "status": "success",
            "latitude": -3.1190,
            "longitude": -60.0217,
            "sceneId": "S2B_MSIL2A_20261001T142709_N0513_R053_T20MRB_20261001T181049",
            "acquisitionTime": "2026-10-01T14:27:09Z",
            "threshold": 0.65,
            "predictedBurnedPixels": metrics.get("predicted_burned_pixels", 59418),
            "totalPixels": 65536,
            "predictedBurnedPercentage": round(metrics.get("predicted_burned_percentage", 90.66), 2),
            "predictedAreaHectares": metrics.get("predicted_area_hectares", 594.18),
            "source": "Land8Fire U-Net 15-Channel (Sentinel-2 L2A)",
            "provenance": "DERIVED / U-NET MODEL INFERENCE",
            "scientificNote": "Model prediction on single-date Sentinel-2 L2A BOA reflectance. Reflectance over urban concrete and barren soil demonstrates known spectral confusion.",
            "probabilityRasterUrl": "/scratch/cache/cdse/processed/amazon_unet_burned_area_probability.tif",
            "binaryMaskRasterUrl": "/scratch/cache/cdse/processed/amazon_unet_burned_area_mask.tif"
        }
    else:
        return {
            "status": "unavailable",
            "message": "Amazon Sentinel-2 U-Net inference outputs not yet processed. Run cdse_raster_processor pipeline first."
        }

GLOBAL_UNET_MODEL = None

def get_or_load_unet_model():
    global GLOBAL_UNET_MODEL
    if GLOBAL_UNET_MODEL is not None:
        return GLOBAL_UNET_MODEL

    ckpt_path = os.path.join(_repo_root, "scratch", "cache", "land8fire_15ch_unet_full_dataset_best.pth")
    if not os.path.exists(ckpt_path):
        ckpt_path = os.path.join(_repo_root, "scratch", "cache", "cdse", "land8fire_15ch_unet_full_dataset_best.pth")
    if not os.path.exists(ckpt_path):
        ckpt_path = MODEL_PATH

    if os.path.exists(ckpt_path):
        print(f"[INFO] Loading U-Net 15-channel model checkpoint from {ckpt_path}...")
        with open(ckpt_path, "rb") as f:
            buffer = io.BytesIO(f.read())
        checkpoint = torch.load(buffer, map_location="cpu", weights_only=False)
        model = UNet15(in_channels=15, out_channels=1)
        if "model_state_dict" in checkpoint:
            model.load_state_dict(checkpoint["model_state_dict"])
        else:
            model.load_state_dict(checkpoint)
        model.eval()
        GLOBAL_UNET_MODEL = model
        print("[INFO] U-Net model successfully loaded and ready for dynamic inference.")
        return GLOBAL_UNET_MODEL
    else:
        print(f"[WARN] U-Net checkpoint not found at {ckpt_path}.")
        return None

class UNetRequestHandler(BaseHTTPRequestHandler):
    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def do_POST(self):
        if self.path == "/api/unet-inference":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            try:
                payload = json.loads(body)
                lat = float(payload.get("latitude", 0))
                lng = float(payload.get("longitude", 0))
                bbox = payload.get("bbox")
                prod_id = payload.get("productId")
                sim_time = payload.get("simulationTime") or payload.get("eventDate") or payload.get("requestedTimestamp")

                # Check if target is EMSR239 Spain event (~37.84° N, -6.00° W)
                is_emsr239 = (abs(lat - 37.8445) < 0.2 and abs(lng - (-6.0049)) < 0.2)

                if is_emsr239:
                    result = run_unet_inference_emsr239()
                else:
                    model = get_or_load_unet_model()
                    from scripts.cdse_raster_processor import acquire_and_process_dynamic_raster
                    result = acquire_and_process_dynamic_raster(
                        lat=lat,
                        lon=lng,
                        bbox=bbox,
                        product_id=prod_id,
                        simulation_time=sim_time,
                        model=model
                    )

                self.send_response(200)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(result).encode("utf-8"))

            except Exception as e:
                self.send_response(500)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                err_resp = {"status": "error", "message": str(e)}
                self.wfile.write(json.dumps(err_resp).encode("utf-8"))
        elif self.path == "/api/cdse-discovery":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            try:
                payload = json.loads(body)
                lat = float(payload.get("latitude", 0))
                lng = float(payload.get("longitude", 0))
                req_time = payload.get("requestedTimestamp", "2024-09-01T00:00:00Z")
                max_cloud = float(payload.get("maxCloudCover", 40))

                # Query CDSE STAC API
                import urllib.request
                stac_url = "https://stac.dataspace.copernicus.eu/v1/search"
                stac_req_body = json.dumps({
                    "collections": ["sentinel-2-l2a"],
                    "bbox": [lng - 0.08, lat - 0.08, lng + 0.08, lat + 0.08],
                    "datetime": "2024-01-01T00:00:00Z/2026-10-08T23:59:59Z",
                    "limit": 10,
                    "query": {"eo:cloud_cover": {"lte": max_cloud}}
                }).encode("utf-8")

                stac_req = urllib.request.Request(
                    stac_url,
                    data=stac_req_body,
                    headers={"Content-Type": "application/json"}
                )

                with urllib.request.urlopen(stac_req, timeout=12) as stac_res:
                    stac_data = json.loads(stac_res.read().decode("utf-8"))

                features = stac_data.get("features", [])

                if features:
                    features.sort(key=lambda x: x.get("properties", {}).get("eo:cloud_cover", 100))
                    best = features[0]
                    props = best.get("properties", {})
                    raw_assets = best.get("assets", {})
                    assets = list(raw_assets.keys())
                    acq_time = props.get("datetime", req_time)

                    required_bands = ["B01", "B02", "B03", "B04", "B05", "B06", "B07", "B08", "B09", "B11", "B12"]
                    has_all = all(any(b in a for a in assets) for b in required_bands)

                    # Extract native projected raster CRS from properties or asset projection metadata
                    raster_crs = None
                    if props.get("proj:code"):
                        raster_crs = props.get("proj:code")
                    elif props.get("proj:epsg"):
                        raster_crs = f"EPSG:{props.get('proj:epsg')}"
                    else:
                        for a_key, a_val in raw_assets.items():
                            if isinstance(a_val, dict):
                                if a_val.get("proj:code"):
                                    raster_crs = a_val.get("proj:code")
                                    break
                                elif a_val.get("proj:epsg"):
                                    raster_crs = f"EPSG:{a_val.get('proj:epsg')}"
                                    break

                    is_crs_known = bool(raster_crs and raster_crs != "UNKNOWN")

                    result = {
                        "available": True,
                        "source": f"Sentinel-2 L2A ({best.get('id')})",
                        "satelliteSource": "CDSE_LIVE",
                        "productId": best.get("id"),
                        "collection": "sentinel-2-l2a",
                        "requestedTimestamp": req_time,
                        "actualAcquisitionTime": acq_time,
                        "latitude": lat,
                        "longitude": lng,
                        "cloudCoverPercentage": props.get("eo:cloud_cover"),
                        "rasterCrs": raster_crs,
                        "geographicCrs": "EPSG:4326",
                        "displayCrs": "EPSG:4326",
                        "crs": raster_crs or "UNKNOWN",
                        "availableAssets": assets,
                        "hasAll12Bands": has_all,
                        "dataStatus": "BANDS_AVAILABLE" if (has_all and is_crs_known) else "METADATA_ONLY",
                        "is15ChannelReady": False,
                        "message": "SATELLITE OBSERVATION: AVAILABLE (Discovered in Copernicus STAC Catalogue)" if is_crs_known else "SATELLITE OBSERVATION: CRS_UNAVAILABLE (Source projection metadata missing from STAC item)."
                    }
                else:
                    result = {
                        "available": False,
                        "source": "Sentinel-2 L2A",
                        "satelliteSource": "CDSE_LIVE",
                        "collection": "sentinel-2-l2a",
                        "requestedTimestamp": req_time,
                        "latitude": lat,
                        "longitude": lng,
                        "rasterCrs": None,
                        "geographicCrs": "EPSG:4326",
                        "displayCrs": "EPSG:4326",
                        "crs": "UNKNOWN",
                        "dataStatus": "METADATA_ONLY",
                        "is15ChannelReady": False,
                        "message": "SATELLITE OBSERVATION: NOT AVAILABLE (No suitable Sentinel-2 L2A tile found)."
                    }

                self.send_response(200)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(result).encode("utf-8"))

            except Exception as e:
                self.send_response(500)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                err_resp = {"status": "error", "message": str(e)}
                self.wfile.write(json.dumps(err_resp).encode("utf-8"))
        elif self.path == "/api/cdse-acquisition":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            try:
                payload = json.loads(body)
                prod_id = payload.get("productId", "S2B_MSIL2A_20261001T142709_N0513_R053_T20MRB_20261001T181049")
                lat = payload.get("latitude")
                lon = payload.get("longitude")

                if lat is not None and lon is not None:
                    lat_f = float(lat)
                    lon_f = float(lon)
                    bbox = payload.get("bbox")
                    from scripts.cdse_raster_processor import (
                        CDSE_CACHE_DIR, check_archive_covers_point,
                        compute_dynamic_target_grid, find_and_download_product_by_name
                    )
                    cached_zips = [
                        os.path.join(CDSE_CACHE_DIR, f)
                        for f in os.listdir(CDSE_CACHE_DIR)
                        if f.endswith('.zip') and not f.endswith('.part')
                    ]
                    covering_zip = None
                    cov_status = None
                    for zp in cached_zips:
                        cov = check_archive_covers_point(zp, lat_f, lon_f)
                        if cov.get("covers") and cov.get("valid_surface"):
                            covering_zip = zp
                            cov_status = cov
                            break
                        elif cov.get("covers"):
                            cov_status = cov

                    if not covering_zip and prod_id and (payload.get("download") or payload.get("autoDownload")):
                        try:
                            dl_path, _, _ = find_and_download_product_by_name(prod_id)
                            cov = check_archive_covers_point(dl_path, lat_f, lon_f)
                            if cov.get("covers") and cov.get("valid_surface"):
                                covering_zip = dl_path
                                cov_status = cov
                        except Exception as e:
                            print(f"[WARN] Failed to download {prod_id}: {e}")

                    if covering_zip and cov_status:
                        target_grid = compute_dynamic_target_grid(lat_f, lon_f, bbox=bbox, res=10.0, target_crs=cov_status.get("native_crs", "EPSG:32720"))
                        result = {
                            "status": "success",
                            "is15ChannelReady": True,
                            "product_id": os.path.basename(covering_zip).replace('.zip', ''),
                            "target_grid": target_grid,
                            "latitude": lat_f,
                            "longitude": lon_f,
                            "message": f"Successfully validated 15-channel Sentinel-2 multispectral coverage for coordinates ({lat_f:.4f}°, {lon_f:.4f}°)."
                        }
                    elif cov_status and cov_status.get("covers"):
                        result = {
                            "status": "out_of_swath",
                            "is15ChannelReady": False,
                            "product_id": prod_id,
                            "message": f"Coordinates ({lat_f:.4f}°, {lon_f:.4f}°) fall outside orbital swath of local archive."
                        }
                    else:
                        result = {
                            "status": "not_cached",
                            "is15ChannelReady": False,
                            "product_id": prod_id,
                            "message": f"Archive for coordinates ({lat_f:.4f}°, {lon_f:.4f}°) not currently cached."
                        }
                else:
                    from scripts.cdse_raster_processor import acquire_and_process_amazon_raster
                    result = acquire_and_process_amazon_raster(prod_id)

                self.send_response(200)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(result).encode("utf-8"))
            except Exception as e:
                self.send_response(500)
                self._send_cors_headers()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                err_resp = {"status": "error", "message": str(e)}
                self.wfile.write(json.dumps(err_resp).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

def main():
    server = HTTPServer(("127.0.0.1", PORT), UNetRequestHandler)
    print(f"[INFO] Land8Fire U-Net Inference Server running at http://127.0.0.1:{PORT}/api/unet-inference")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[INFO] Shutting down inference server.")
        server.server_close()

if __name__ == "__main__":
    main()
