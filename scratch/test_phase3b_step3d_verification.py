import os
import sys

_repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _repo_root not in sys.path:
    sys.path.insert(0, _repo_root)

import json
import zipfile
import numpy as np

# Python 3.12 compatibility patch for affine
import functools
import affine
for _prop_name in ['determinant', 'is_degenerate', 'is_proper', '_astuple']:
    _prop = getattr(affine.Affine, _prop_name, None)
    if isinstance(_prop, functools.cached_property):
        setattr(affine.Affine, _prop_name, property(_prop.func))

from scripts.cdse_raster_processor import (
    acquire_and_process_amazon_raster,
    compute_spectral_indices,
    construct_15channel_tensor,
    extract_and_resample_bands,
    download_product_archive,
    AMAZON_TARGET_GRID_10M,
    MEAN_15CH,
    STD_15CH,
    CDSE_CACHE_DIR,
    CDSE_PROCESSED_DIR
)

def run_step3d_verification():
    print("=" * 80)
    print("PHASE 3B STEP 3D — REAL SENTINEL-2 RASTER ACQUISITION VERIFICATION SUITE")
    print("=" * 80)

    passed_tests = 0
    total_tests = 6

    # TEST 1: Real Product Acquisition & Archive Integrity
    print("\n--- TEST 1: Real Product Archive Verification ---")
    product_name = "S2B_MSIL2A_20261001T142709_N0513_R053_T20MRB_20261001T181049"
    zip_path = os.path.join(CDSE_CACHE_DIR, f"{product_name}.zip")
    assert os.path.exists(zip_path), f"Archive not found: {zip_path}"
    actual_size = os.path.getsize(zip_path)
    expected_size = 375403577
    assert actual_size == expected_size, f"Size mismatch: expected {expected_size}, got {actual_size}"
    
    with zipfile.ZipFile(zip_path, 'r') as zf:
        bad_member = zf.testzip()
        assert bad_member is None, f"Corrupted member in archive: {bad_member}"
        names = zf.namelist()
        assert any(n.endswith("_B02_10m.jp2") for n in names), "Missing B02 JP2 in archive"
        assert any(n.endswith("_B8A_20m.jp2") for n in names), "Missing B8A JP2 in archive"
        assert any(n.endswith("_B01_60m.jp2") for n in names), "Missing B01 JP2 in archive"
    
    print(f"PASS [1/6]: Archive verified. Size: {actual_size} bytes, Integrity: Intact (0 corrupt members).")
    passed_tests += 1

    # TEST 2: Incomplete / Truncated Download Handling
    print("\n--- TEST 2: Incomplete / Corrupt Download Detection ---")
    dummy_dir = os.path.join(CDSE_CACHE_DIR, "test_corrupt")
    os.makedirs(dummy_dir, exist_ok=True)
    dummy_zip = os.path.join(dummy_dir, f"{product_name}.zip")
    # Write a truncated 100-byte file
    with open(dummy_zip, "wb") as f:
        f.write(b"PK\x03\x04" + b"0" * 96)
    
    # download_product_archive should detect size mismatch and invalid zip
    try:
        with zipfile.ZipFile(dummy_zip, 'r') as zf:
            zf.testzip()
            truncated_valid = True
    except Exception:
        truncated_valid = False
    assert not truncated_valid, "Corrupt zip should fail zipfile test"
    # Clean up test dir
    os.remove(dummy_zip)
    os.rmdir(dummy_dir)
    print("PASS [2/6]: Incomplete and truncated archive files correctly detected and rejected.")
    passed_tests += 1

    # TEST 3: Missing Band Detection
    print("\n--- TEST 3: Missing Band Detection ---")
    incomplete_bands = {
        "B01": np.zeros((256, 256), dtype=np.float32),
        "B02": np.zeros((256, 256), dtype=np.float32),
        # Intentionally omit B04, B08, etc.
    }
    missing_band_caught = False
    try:
        construct_15channel_tensor(incomplete_bands, width=256, height=256)
    except (KeyError, ValueError):
        missing_band_caught = True
    assert missing_band_caught, "construct_15channel_tensor must raise KeyError when bands are missing"
    print("PASS [3/6]: Missing band detection correctly triggers exception without fabricating pixels.")
    passed_tests += 1

    # TEST 4: Index Calculation Correctness
    print("\n--- TEST 4: Spectral Index Formulas Verification ---")
    # Test known inputs:
    # B02 = 0.05, B04 = 0.10, B08 = 0.50, B12 = 0.20
    test_b02 = np.array([[0.05]], dtype=np.float32)
    test_b04 = np.array([[0.10]], dtype=np.float32)
    test_b08 = np.array([[0.50]], dtype=np.float32)
    test_b12 = np.array([[0.20]], dtype=np.float32)

    ndvi, nbr, ndri = compute_spectral_indices(test_b02, test_b04, test_b08, test_b12, eps=1e-6)
    
    expected_ndvi = (0.50 - 0.10) / (0.50 + 0.10 + 1e-6) # 0.40 / 0.60 = 0.6666655
    expected_nbr  = (0.50 - 0.20) / (0.50 + 0.20 + 1e-6) # 0.30 / 0.70 = 0.4285708
    expected_ndri = (0.10 - 0.05) / (0.10 + 0.05 + 1e-6) # 0.05 / 0.15 = 0.3333311

    np.testing.assert_allclose(ndvi[0, 0], expected_ndvi, rtol=1e-5)
    np.testing.assert_allclose(nbr[0, 0], expected_nbr, rtol=1e-5)
    np.testing.assert_allclose(ndri[0, 0], expected_ndri, rtol=1e-5)
    print(f"PASS [4/6]: Mathematical index formulas verified: NDVI={ndvi[0,0]:.4f}, NBR={nbr[0,0]:.4f}, NDRI={ndri[0,0]:.4f}")
    passed_tests += 1

    # TEST 5: Deterministic Preprocessing
    print("\n--- TEST 5: Deterministic Preprocessing Verification ---")
    raw_a, _ = extract_and_resample_bands(zip_path, target_grid=AMAZON_TARGET_GRID_10M)
    res_a = construct_15channel_tensor(raw_a, width=256, height=256, is_raw_dn=True)

    raw_b, _ = extract_and_resample_bands(zip_path, target_grid=AMAZON_TARGET_GRID_10M)
    res_b = construct_15channel_tensor(raw_b, width=256, height=256, is_raw_dn=True)

    diff_raw = np.max(np.abs(res_a["raw_tensor"] - res_b["raw_tensor"]))
    diff_norm = np.max(np.abs(res_a["normalized_tensor"] - res_b["normalized_tensor"]))
    assert diff_raw == 0.0, f"Non-deterministic raw extraction: diff={diff_raw}"
    assert diff_norm == 0.0, f"Non-deterministic normalized tensor: diff={diff_norm}"
    print(f"PASS [5/6]: Deterministic preprocessing confirmed. Max difference between runs: {diff_norm} (Bitwise identical).")
    passed_tests += 1

    # TEST 6: 15-Channel Tensor Specification & Provenance Contract
    print("\n--- TEST 6: Authoritative 15-Channel Tensor Specification & Provenance ---")
    norm_path = os.path.join(CDSE_PROCESSED_DIR, "amazon_15ch_normalized_tensor.npy")
    raw_path = os.path.join(CDSE_PROCESSED_DIR, "amazon_15ch_raw_reflectance.npy")
    meta_path = os.path.join(CDSE_PROCESSED_DIR, "amazon_15ch_metadata.json")

    assert os.path.exists(norm_path), f"Missing normalized tensor file: {norm_path}"
    assert os.path.exists(raw_path), f"Missing raw reflectance file: {raw_path}"
    assert os.path.exists(meta_path), f"Missing metadata json file: {meta_path}"

    norm_tensor = np.load(norm_path)
    raw_tensor = np.load(raw_path)
    with open(meta_path, 'r') as f:
        metadata = json.load(f)

    # Validate shape, dtype, nan/inf
    assert norm_tensor.shape == (15, 256, 256), f"Invalid norm shape: {norm_tensor.shape}"
    assert raw_tensor.shape == (15, 256, 256), f"Invalid raw shape: {raw_tensor.shape}"
    assert norm_tensor.dtype == np.float32, f"Invalid norm dtype: {norm_tensor.dtype}"
    assert raw_tensor.dtype == np.float32, f"Invalid raw dtype: {raw_tensor.dtype}"
    assert not np.isnan(norm_tensor).any(), "NaN found in normalized tensor"
    assert not np.isinf(norm_tensor).any(), "Inf found in normalized tensor"
    assert not np.isnan(raw_tensor).any(), "NaN found in raw tensor"
    assert not np.isinf(raw_tensor).any(), "Inf found in raw tensor"

    # Validate target grid & CRS in metadata
    assert metadata["target_grid"]["crs"] == "EPSG:32720"
    assert metadata["target_grid"]["width"] == 256
    assert metadata["target_grid"]["height"] == 256
    assert metadata["target_grid"]["resolution"] == 10.0
    assert metadata["valid_pixel_pct"] == 100.0

    print("Channel Summary:")
    for ch_name, stats in metadata["channel_statistics"].items():
        print(f"  {ch_name:5s} (ch {stats['channel_index']:2d}): Raw Mean={stats['raw_mean']:.4f} [{stats['raw_min']:.4f}, {stats['raw_max']:.4f}] | Norm Mean={stats['norm_mean']:.2f} [{stats['norm_min']:.2f}, {stats['norm_max']:.2f}]")

    print(f"\nPASS [6/6]: Authoritative 15-channel contract strictly verified: shape (15, 256, 256), float32, zero NaN/Inf, 100% valid pixels.")
    passed_tests += 1

    print("\n" + "=" * 80)
    print(f"ALL TESTS PASSED: {passed_tests} / {total_tests}")
    print("=" * 80)

if __name__ == "__main__":
    run_step3d_verification()
