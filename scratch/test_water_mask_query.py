import json

with open("public/data/amazon_water_mask.json") as f:
    geojson = json.load(f)

def point_in_polygon(x, y, poly_coords):
    n = len(poly_coords)
    inside = False
    p1x, p1y = poly_coords[0]
    for i in range(1, n + 1):
        p2x, p2y = poly_coords[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside

def test_polygon_with_holes(lon, lat, coords_list):
    # coords_list[0] is exterior, coords_list[1:] are holes
    if point_in_polygon(lon, lat, coords_list[0]):
        for hole in coords_list[1:]:
            if point_in_polygon(lon, lat, hole):
                return False
        return True
    return False

def is_water(lon, lat):
    for feat in geojson["features"]:
        geom = feat["geometry"]
        gtype = geom["type"]
        if gtype == "Polygon":
            if test_polygon_with_holes(lon, lat, geom["coordinates"]):
                return True
        elif gtype == "MultiPolygon":
            for poly_coords in geom["coordinates"]:
                if test_polygon_with_holes(lon, lat, poly_coords):
                    return True
    return False

test_points = [
    ("Manaus Centro (Land)", -60.0217, -3.1190),
    ("Rio Negro Deep Channel (Water)", -60.0500, -3.1500),
    ("Rio Negro south of port (Water)", -60.0400, -3.1450),
    ("Solimoes River (Water)", -59.9700, -3.1700),
    ("Taruma forest (Land)", -60.0500, -3.0700)
]

for name, lon, lat in test_points:
    res = is_water(lon, lat)
    print(f"{name} ({lat}, {lon}) -> Water?: {res}")
