import os
import requests
import json

def inspect_cdse_assets():
    print("=== INSPECTING CDSE STAC ASSETS FOR AMAZON PRODUCT ===")

    url = "https://stac.dataspace.copernicus.eu/v1/search"
    bbox = [-60.0717, -3.169, -59.9717, -3.069] # Manaus study area

    payload = {
        "collections": ["sentinel-2-l2a"],
        "bbox": bbox,
        "datetime": "2024-06-01T00:00:00Z/2026-10-08T23:59:59Z",
        "limit": 1,
        "query": {"eo:cloud_cover": {"lte": 20}}
    }

    res = requests.post(url, json=payload, timeout=15)
    if res.status_code != 200:
        print(f"Failed to query STAC search: {res.status_code}")
        return

    features = res.json().get("features", [])
    if not features:
        print("No feature found.")
        return

    item = features[0]
    print(f"Discovered Item ID: {item.get('id')}")
    print(f"Acquisition Date: {item.get('properties', {}).get('datetime')}")
    print(f"Cloud Cover: {item.get('properties', {}).get('eo:cloud_cover')}%")
    print(f"STAC Item Bounding Box: {item.get('bbox')}")

    assets = item.get("assets", {})
    print(f"\nTotal STAC Assets: {len(assets)}")
    print("Sample 12 Multispectral Band Asset HREFs:")

    required_band_keys = ["B01_20m", "B02_10m", "B03_10m", "B04_10m", "B05_20m", "B06_20m", "B07_20m", "B08_10m", "B8A_20m", "B09_60m", "B11_20m", "B12_20m"]

    for b in required_band_keys:
        asset_info = assets.get(b, {})
        href = asset_info.get("href", "NOT_FOUND")
        asset_type = asset_info.get("type", "unknown")
        print(f"  - {b:10s}: type={asset_type}, href={href}")

    # Check OAuth2 token requirement for direct asset download
    print("\n=== TESTING DIRECT HTTP ACCESS TO ASSET HREF ===")
    sample_href = assets.get("B02_10m", {}).get("href")
    if sample_href:
        try:
            head_res = requests.head(sample_href, timeout=10, allow_redirects=True)
            print(f"HEAD Status for {sample_href[:60]}... -> {head_res.status_code}")
            if head_res.status_code == 401 or head_res.status_code == 403:
                print("🔒 Access requires CDSE OAuth2 Authentication.")
            elif head_res.status_code == 200:
                print("🔓 Direct public access available!")
        except Exception as e:
            print(f"Access test exception: {e}")

    # Check Environment credentials
    client_id = os.environ.get("CDSE_CLIENT_ID", "")
    client_secret = os.environ.get("CDSE_CLIENT_SECRET", "")
    print(f"\nEnvironment Credentials Check:")
    print(f"  CDSE_CLIENT_ID configured?: {bool(client_id)}")
    print(f"  CDSE_CLIENT_SECRET configured?: {bool(client_secret)}")

if __name__ == "__main__":
    inspect_cdse_assets()
