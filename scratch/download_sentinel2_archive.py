import os
import sys
import time
import zipfile
import requests
from dotenv import load_dotenv

# Ensure cache directory exists
CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scratch", "cache", "cdse")
os.makedirs(CACHE_DIR, exist_ok=True)

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env.local"))

PRODUCT_UUID = "72178af6-0ee1-4a6a-9345-d3f16d702deb"
PRODUCT_NAME = "S2B_MSIL2A_20261001T142709_N0513_R053_T20MRB_20261001T181049"
EXPECTED_SIZE = 375403577
OUTPUT_ZIP = os.path.join(CACHE_DIR, f"{PRODUCT_NAME}.zip")

def get_auth_token():
    client_id = os.environ.get("CDSE_CLIENT_ID", "").strip()
    client_secret = os.environ.get("CDSE_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        raise ValueError("CDSE_CLIENT_ID or CDSE_CLIENT_SECRET missing in .env.local")
    
    token_url = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
    data = {
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret
    }
    resp = requests.post(token_url, data=data, timeout=20)
    if resp.status_code != 200:
        raise RuntimeError(f"Authentication failed with status {resp.status_code}")
    return resp.json()["access_token"]

def download_product():
    print(f"=== INITIATING SENTINEL-2 PRODUCT DOWNLOAD ===")
    print(f"Product: {PRODUCT_NAME}")
    print(f"UUID: {PRODUCT_UUID}")
    print(f"Expected Size: {EXPECTED_SIZE} bytes (~{EXPECTED_SIZE / (1024**2):.1f} MB)")
    print(f"Target Path: {OUTPUT_ZIP}")
    
    # Check if existing archive is already fully downloaded and valid
    if os.path.exists(OUTPUT_ZIP):
        cur_size = os.path.getsize(OUTPUT_ZIP)
        if cur_size == EXPECTED_SIZE:
            print(f"Existing file found with matching size: {cur_size} bytes. Verifying ZIP integrity...")
            try:
                with zipfile.ZipFile(OUTPUT_ZIP, 'r') as zf:
                    bad = zf.testzip()
                    if bad is None:
                        print("✅ Archive integrity verified! Existing archive is intact.")
                        return OUTPUT_ZIP
                    else:
                        print(f"⚠️ Corrupted member in archive: {bad}. Re-downloading...")
            except Exception as e:
                print(f"⚠️ Archive verification error: {e}. Re-downloading...")
    
    token = get_auth_token()
    download_url = f"https://download.dataspace.copernicus.eu/odata/v1/Products({PRODUCT_UUID})/$value"
    headers = {"Authorization": f"Bearer {token}"}
    
    print("Connecting to Copernicus download service...")
    start_time = time.time()
    
    part_path = OUTPUT_ZIP + ".part"
    downloaded_bytes = 0
    
    # Check resume if part file exists
    resume_header = {}
    if os.path.exists(part_path):
        downloaded_bytes = os.path.getsize(part_path)
        if downloaded_bytes < EXPECTED_SIZE:
            resume_header["Range"] = f"bytes={downloaded_bytes}-"
            print(f"Resuming download from byte {downloaded_bytes}...")
        else:
            downloaded_bytes = 0
            
    headers.update(resume_header)
    
    response = requests.get(download_url, headers=headers, stream=True, allow_redirects=True, timeout=30)
    
    if response.status_code not in (200, 206):
        raise RuntimeError(f"Download request failed with HTTP status {response.status_code}: {response.text[:200]}")
    
    mode = "ab" if response.status_code == 206 else "wb"
    if response.status_code == 200:
        downloaded_bytes = 0
        
    last_print = time.time()
    with open(part_path, mode) as f:
        for chunk in response.iter_content(chunk_size=1024 * 1024): # 1 MB chunks
            if chunk:
                f.write(chunk)
                downloaded_bytes += len(chunk)
                now = time.time()
                if now - last_print >= 5: # update every 5 seconds
                    elapsed = now - start_time
                    speed_mbps = (downloaded_bytes / (1024 * 1024)) / elapsed if elapsed > 0 else 0
                    pct = (downloaded_bytes / EXPECTED_SIZE) * 100
                    print(f"  Progress: {downloaded_bytes / (1024**2):.1f} / {EXPECTED_SIZE / (1024**2):.1f} MB ({pct:.1f}%) | Speed: {speed_mbps:.2f} MB/s")
                    last_print = now
                    
    total_time = time.time() - start_time
    avg_speed = (downloaded_bytes / (1024 * 1024)) / total_time if total_time > 0 else 0
    print(f"Download completed in {total_time:.1f}s ({avg_speed:.2f} MB/s).")
    
    # Rename .part to .zip
    if os.path.exists(OUTPUT_ZIP):
        os.remove(OUTPUT_ZIP)
    os.rename(part_path, OUTPUT_ZIP)
    
    # Verify final archive integrity
    final_size = os.path.getsize(OUTPUT_ZIP)
    print(f"Final archive size: {final_size} bytes.")
    if final_size != EXPECTED_SIZE:
        raise ValueError(f"Size mismatch: expected {EXPECTED_SIZE}, got {final_size}")
        
    print("Testing ZIP integrity...")
    with zipfile.ZipFile(OUTPUT_ZIP, 'r') as zf:
        bad = zf.testzip()
        if bad is not None:
            raise ValueError(f"Corrupt file in archive: {bad}")
    print("✅ ZIP archive integrity verified successfully!")
    return OUTPUT_ZIP

if __name__ == "__main__":
    download_product()
