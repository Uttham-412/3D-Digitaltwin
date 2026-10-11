import functools
try:
    import affine
    for _prop_name in ['determinant', 'is_degenerate', 'is_proper', '_astuple']:
        _prop = getattr(affine.Affine, _prop_name, None)
        if isinstance(_prop, functools.cached_property):
            setattr(affine.Affine, _prop_name, property(_prop.func))
except ImportError:
    pass

import rasterio
from rasterio.windows import from_bounds

url = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_S06W063_Map.tif"

print("Testing direct COG access to ESA WorldCover on AWS S3...")
try:
    with rasterio.open(url) as src:
        print("CRS:", src.crs)
        print("Bounds:", src.bounds)
        print("Width:", src.width, "Height:", src.height)
        print("Resolution:", src.res)
        
        # Test sample points:
        # 1. Point in Manaus land: -3.10, -60.02
        # 2. Point in Rio Negro river: -3.15, -60.05
        for name, lat, lon in [("Manaus Land", -3.10, -60.02), ("Rio Negro River", -3.15, -60.05)]:
            row, col = src.index(lon, lat)
            val = src.read(1, window=((row, row+1), (col, col+1)))[0, 0]
            print(f"{name} ({lat}, {lon}) -> Pixel Class: {val} (80 = Water, 10 = Tree, 50 = Built-up)")
except Exception as e:
    print("COG error:", e)
