import urllib.request
import json

req_body = {
    'latitude': -3.05,
    'longitude': -60.10,
    'simulationTime': '2026-10-01T16:00:00Z'
}

req = urllib.request.Request(
    'http://127.0.0.1:8000/api/unet-inference',
    data=json.dumps(req_body).encode('utf-8'),
    headers={'Content-Type': 'application/json'}
)

try:
    with urllib.request.urlopen(req, timeout=30) as res:
        data = json.loads(res.read().decode('utf-8'))
        print("=== U-NET INFERENCE SERVER RESPONSE ===")
        print("Status:", data.get("status"))
        print("Scene:", data.get("sceneId"))
        print(f"Burned Pixels: {data.get('predictedBurnedPixels')} / {data.get('totalPixels')} ({data.get('predictedBurnedPercentage')}%)")
        print("Burned Area:", data.get("predictedAreaHectares"), "ha")
        print("Temporal Category:", data.get("temporalCategory"))
        print("Time Diff Hours:", data.get("timeDifferenceHours"))
        print("GeoJSON URL:", data.get("geoJsonUrl"))
        print("Sentinel-2 RGB URL:", data.get("sentinel2RgbUrl"))
        print("Probability Heatmap URL:", data.get("probabilityColormapUrl"))
        print("Binary Mask URL:", data.get("binaryMaskUrl"))
        print("Spatial Extent:", data.get("spatialExtent"))
except Exception as e:
    print("Error calling endpoint:", e)
