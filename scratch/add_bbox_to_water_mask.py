import json

with open("public/data/amazon_water_mask.json") as f:
    geojson = json.load(f)

for feat in geojson["features"]:
    geom = feat["geometry"]
    all_pts = []
    if geom["type"] == "Polygon":
        for ring in geom["coordinates"]:
            all_pts.extend(ring)
    elif geom["type"] == "MultiPolygon":
        for poly in geom["coordinates"]:
            for ring in poly:
                all_pts.extend(ring)
    
    if all_pts:
        xs = [p[0] for p in all_pts]
        ys = [p[1] for p in all_pts]
        feat["bbox"] = [min(xs), min(ys), max(xs), max(ys)]

with open("public/data/amazon_water_mask.json", "w") as f:
    json.dump(geojson, f)

print(f"Added bounding boxes to {len(geojson['features'])} features in public/data/amazon_water_mask.json")
