import requests
import json
from datetime import datetime, timedelta

def query_cdse_stac(lat, lon, start_date="2024-01-01", end_date="2024-10-08", max_cloud=30):
    url = "https://stac.dataspace.copernicus.eu/v1/search"

    # 0.05 degree bounding box around target coordinate (~5.5 km x 5.5 km)
    bbox = [lon - 0.05, lat - 0.05, lon + 0.05, lat + 0.05]

    payload = {
        "collections": ["sentinel-2-l2a"],
        "bbox": bbox,
        "datetime": f"{start_date}T00:00:00Z/{end_date}T23:59:59Z",
        "limit": 5,
        "query": {
            "eo:cloud_cover": {
                "lte": max_cloud
            }
        }
    }

    headers = {"Content-Type": "application/json"}

    print(f"=== QUERYING CDSE STAC CATALOGUE ===")
    print(f"Target: Lat {lat}, Lon {lon}")
    print(f"Time Range: {start_date} to {end_date}")
    print(f"Max Cloud Cover: {max_cloud}%")
    print(f"Endpoint: {url}\n")

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=15)
        print(f"HTTP Status Code: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            features = data.get("features", [])
            print(f"Found {len(features)} matching Sentinel-2 L2A items.\n")

            for idx, item in enumerate(features):
                item_id = item.get("id")
                props = item.get("properties", {})
                acq_time = props.get("datetime")
                cloud_cover = props.get("eo:cloud_cover")
                epsg = props.get("proj:epsg")
                assets = list(item.get("assets", {}).keys())

                print(f"--- ITEM [{idx + 1}] ---")
                print(f"Item ID: {item_id}")
                print(f"Acquisition Time: {acq_time}")
                print(f"Cloud Cover: {cloud_cover}%")
                print(f"CRS / EPSG: {epsg}")
                print(f"Assets Count: {len(assets)}")
                print(f"Sample Assets: {assets[:10]}")
                print()

            return features
        else:
            print(f"Error Response: {response.text[:200]}")
            return []
    except Exception as e:
        print(f"Exception during CDSE query: {e}")
        return []

if __name__ == "__main__":
    # Test 1: Amazon Manaus coordinates (-3.1190, -60.0217)
    print("--- TEST 1: Amazon Study Region (-3.1190° S, -60.0217° W) ---")
    query_cdse_stac(-3.1190, -60.0217, "2024-06-01", "2024-10-08", max_cloud=40)

    # Test 2: Spain EMSR239 coordinates (37.8445, -6.0049)
    print("--- TEST 2: Spain Almadén de la Plata (37.8445° N, -6.0049° W) ---")
    query_cdse_stac(37.8445, -6.0049, "2017-07-01", "2017-08-15", max_cloud=20)
