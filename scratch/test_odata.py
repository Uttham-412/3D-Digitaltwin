import requests

url = "https://catalogue.dataspace.copernicus.eu/odata/v1/Products"
# Test querying by Name
for name_variant in [
    "S2B_MSIL2A_20261001T142709_N0513_R053_T20MRB_20261001T181049.SAFE",
    "S2B_MSIL2A_20261001T142709_N0513_R053_T20MQB_20261001T181049.SAFE"
]:
    params = {"$filter": f"Name eq '{name_variant}'"}
    r = requests.get(url, params=params, timeout=15)
    print(f"Query {name_variant} -> HTTP {r.status_code}")
    if r.status_code == 200:
        val = r.json().get("value", [])
        print(f"Found {len(val)} items")
        for item in val:
            print(f"  ID: {item.get('Id')} | Name: {item.get('Name')} | Size: {item.get('ContentLength')}")
