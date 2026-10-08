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

                # Check if target is EMSR239 Spain event (~37.84° N, -6.00° W)
                is_emsr239 = (abs(lat - 37.8445) < 0.2 and abs(lng - (-6.0049)) < 0.2)

                if is_emsr239:
                    result = run_unet_inference_emsr239()
                else:
                    # Explicit validation error for coordinates where Sentinel-2 bands are not loaded
                    result = {
                        "status": "unavailable",
                        "message": f"U-Net inference unavailable: required Sentinel-2 15-channel multispectral bands are not currently cached or accessible for coordinates ({lat:.4f}°, {lng:.4f}°)."
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
