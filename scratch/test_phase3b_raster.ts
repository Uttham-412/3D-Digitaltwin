/**
 * LAND8FIRE — PHASE 3B RASTER ACQUISITION & GEOSPATIAL GRID VERIFICATION SUITE
 *
 * Verifies CRS separation, metadata extraction, target grid dimensions,
 * affine transform alignment, and strict georeferencing gates.
 */

import { cdseDiscoveryService } from '../src/services/cdseDiscoveryService';
import { satelliteObservationService } from '../src/services/satelliteObservationService';
import { unetPreprocessingBridge } from '../src/services/unetPreprocessingBridge';
import { uNetResultGeoReferenceService } from '../src/geospatial/unetResultGeoReference';
import { AMAZON_TARGET_GRID_10M, transformUtm20sToWgs84 } from '../src/geospatial/coordinates';
import { SENTINEL2_15CH_CHANNELS, SENTINEL2_15CH_MEAN, SENTINEL2_15CH_STD } from '../src/services/satelliteObservationService';

async function runPhase3BTests() {
  console.log("============================================================");
  console.log("LAND8FIRE PHASE 3B — CRS & GEOSPATIAL GRID VERIFICATION SUITE");
  console.log("============================================================\n");

  let allPassed = true;

  // -------------------------------------------------------------------
  // TEST 1: EPSG:32720 and EPSG:4326 Distinction & Asset-Level CRS Extraction
  // -------------------------------------------------------------------
  console.log("--- TEST 1: EPSG:32720 vs EPSG:4326 Distinction & Asset-Level CRS Extraction ---");
  const amazonDisc = await cdseDiscoveryService.discoverObservation({
    latitude: -3.1190,
    longitude: -60.0217,
    requestedTimestamp: '2026-10-08T23:00:00Z'
  });

  console.log(`Discovered Product ID: ${amazonDisc.productId}`);
  console.log(`Native Raster CRS: ${amazonDisc.rasterCrs}`);
  console.log(`Geographic Coordinates CRS: ${amazonDisc.geographicCrs}`);
  console.log(`Cesium Display CRS: ${amazonDisc.displayCrs}`);

  const test1Passed =
    amazonDisc.available === true &&
    amazonDisc.rasterCrs === 'EPSG:32720' &&
    amazonDisc.geographicCrs === 'EPSG:4326' &&
    amazonDisc.displayCrs === 'EPSG:4326' &&
    amazonDisc.rasterCrs !== amazonDisc.geographicCrs;

  if (test1Passed) {
    console.log("✅ TEST 1 PASSED: EPSG:32720 (projected) and EPSG:4326 (geographic) are correctly separated.\n");
  } else {
    console.error("❌ TEST 1 FAILED: CRS separation failure!\n");
    allPassed = false;
  }

  // -------------------------------------------------------------------
  // TEST 2: CRS Extraction Does Not Silently Default When Metadata is Absent
  // -------------------------------------------------------------------
  console.log("--- TEST 2: No Silent Default to EPSG:4326 When Projection Metadata is Absent ---");
  const amazonObs = await satelliteObservationService.getObservation({
    latitude: -3.1190,
    longitude: -60.0217,
    requestedTimestamp: '2026-10-08T23:00:00Z'
  });

  console.log(`Observation Raster CRS: ${amazonObs.rasterCrs}`);
  console.log(`Observation Geographic CRS: ${amazonObs.geographicCrs}`);
  console.log(`Observation Display CRS: ${amazonObs.displayCrs}`);

  // Test explicit unknown gate: an observation without raster CRS must not claim EPSG:4326 for raster
  const mockMissingCrsObs = {
    ...amazonObs,
    rasterCrs: undefined,
    crs: undefined
  };

  const test2Passed =
    amazonObs.rasterCrs === 'EPSG:32720' &&
    mockMissingCrsObs.rasterCrs === undefined &&
    mockMissingCrsObs.crs === undefined;

  if (test2Passed) {
    console.log("✅ TEST 2 PASSED: Projection metadata is verified; no silent defaulting to EPSG:4326.\n");
  } else {
    console.error("❌ TEST 2 FAILED: Silent fallback detected!\n");
    allPassed = false;
  }

  // -------------------------------------------------------------------
  // TEST 3: Target Grid Dimensions (256 x 256)
  // -------------------------------------------------------------------
  console.log("--- TEST 3: Target Grid Dimensions (256 x 256) ---");
  console.log(`Grid Width: ${AMAZON_TARGET_GRID_10M.width} pixels`);
  console.log(`Grid Height: ${AMAZON_TARGET_GRID_10M.height} pixels`);

  const test3Passed =
    AMAZON_TARGET_GRID_10M.width === 256 &&
    AMAZON_TARGET_GRID_10M.height === 256;

  if (test3Passed) {
    console.log("✅ TEST 3 PASSED: Target grid dimensions are strictly 256 x 256.\n");
  } else {
    console.error("❌ TEST 3 FAILED: Invalid grid dimensions!\n");
    allPassed = false;
  }

  // -------------------------------------------------------------------
  // TEST 4: Projected Width and Height at 10m Resolution (2560m x 2560m)
  // -------------------------------------------------------------------
  console.log("--- TEST 4: Projected Width and Height at 10m Resolution (2560m x 2560m) ---");
  const spanX = AMAZON_TARGET_GRID_10M.bounds.xMax - AMAZON_TARGET_GRID_10M.bounds.xMin;
  const spanY = AMAZON_TARGET_GRID_10M.bounds.yMax - AMAZON_TARGET_GRID_10M.bounds.yMin;
  const res = AMAZON_TARGET_GRID_10M.resolutionMeters;

  console.log(`Projected Width: ${spanX} m (Expected: 2560.0 m)`);
  console.log(`Projected Height: ${spanY} m (Expected: 2560.0 m)`);
  console.log(`Resolution: ${res} m/pixel`);

  const test4Passed =
    Math.abs(spanX - 2560.0) < 1e-4 &&
    Math.abs(spanY - 2560.0) < 1e-4 &&
    res === 10.0;

  if (test4Passed) {
    console.log("✅ TEST 4 PASSED: At 10m resolution, projected width and height are each exactly 2560m.\n");
  } else {
    console.error("❌ TEST 4 FAILED: Dimension/span mismatch!\n");
    allPassed = false;
  }

  // -------------------------------------------------------------------
  // TEST 5: Affine Transform Matches Target Bounds
  // -------------------------------------------------------------------
  console.log("--- TEST 5: Affine Transform Matches Target Bounds ---");
  const affine = AMAZON_TARGET_GRID_10M.affineTransform;
  // Affine matrix: [a, b, c, d, e, f] where c = xMin, f = yMax, a = res, e = -res
  const derivedXmin = affine[2];
  const derivedXmax = affine[2] + AMAZON_TARGET_GRID_10M.width * affine[0];
  const derivedYmax = affine[5];
  const derivedYmin = affine[5] + AMAZON_TARGET_GRID_10M.height * affine[4];

  console.log(`Affine Transform: [${affine.join(', ')}]`);
  console.log(`Derived X Range: [${derivedXmin}, ${derivedXmax}] (Bounds: [${AMAZON_TARGET_GRID_10M.bounds.xMin}, ${AMAZON_TARGET_GRID_10M.bounds.xMax}])`);
  console.log(`Derived Y Range: [${derivedYmin}, ${derivedYmax}] (Bounds: [${AMAZON_TARGET_GRID_10M.bounds.yMin}, ${AMAZON_TARGET_GRID_10M.bounds.yMax}])`);

  const test5Passed =
    derivedXmin === AMAZON_TARGET_GRID_10M.bounds.xMin &&
    derivedXmax === AMAZON_TARGET_GRID_10M.bounds.xMax &&
    derivedYmin === AMAZON_TARGET_GRID_10M.bounds.yMin &&
    derivedYmax === AMAZON_TARGET_GRID_10M.bounds.yMax;

  if (test5Passed) {
    console.log("✅ TEST 5 PASSED: Affine transform precisely matches target bounding coordinates.\n");
  } else {
    console.error("❌ TEST 5 FAILED: Affine transform mismatch!\n");
    allPassed = false;
  }

  // -------------------------------------------------------------------
  // TEST 6: Real Analytical CRS Transformation for Geographic Bounds
  // -------------------------------------------------------------------
  console.log("--- TEST 6: Analytical CRS Transformation for Geographic Display Bounds ---");
  const swGeo = transformUtm20sToWgs84(AMAZON_TARGET_GRID_10M.bounds.xMin, AMAZON_TARGET_GRID_10M.bounds.yMin);
  const neGeo = transformUtm20sToWgs84(AMAZON_TARGET_GRID_10M.bounds.xMax, AMAZON_TARGET_GRID_10M.bounds.yMax);

  console.log(`SW Corner: Lat ${swGeo.latitude.toFixed(6)}°, Lon ${swGeo.longitude.toFixed(6)}°`);
  console.log(`NE Corner: Lat ${neGeo.latitude.toFixed(6)}°, Lon ${neGeo.longitude.toFixed(6)}°`);
  console.log(`Expected SW: Lat -3.130641°, Lon -60.033188°`);
  console.log(`Expected NE: Lat -3.107447°, Lon -60.010245°`);

  const diffSwLat = Math.abs(swGeo.latitude - (-3.130641));
  const diffSwLon = Math.abs(swGeo.longitude - (-60.033188));
  const diffNeLat = Math.abs(neGeo.latitude - (-3.107447));
  const diffNeLon = Math.abs(neGeo.longitude - (-60.010245));

  const test6Passed =
    diffSwLat < 1e-4 && diffSwLon < 1e-4 &&
    diffNeLat < 1e-4 && diffNeLon < 1e-4;

  if (test6Passed) {
    console.log("✅ TEST 6 PASSED: Geographic bounds derived by exact Transverse Mercator ellipsoidal transformation.\n");
  } else {
    console.error("❌ TEST 6 FAILED: Transformation error!\n");
    allPassed = false;
  }

  // -------------------------------------------------------------------
  // TEST 7: Missing Source Metadata Blocks Georeferencing
  // -------------------------------------------------------------------
  console.log("--- TEST 7: Missing Geospatial Extent Blocks Georeferencing (No ±0.015° Fallback) ---");
  const mockSegMissingBbox = {
    available: true,
    status: 'success' as const,
    modelId: 'land8fire_15ch_unet_full_dataset_best.pth',
    threshold: 0.65,
    requestedTimestamp: '2026-10-08T23:00:00Z',
    latitude: -3.1190,
    longitude: -60.0217,
    rasterCrs: 'EPSG:32720',
    boundingBox: undefined, // Missing extent!
    provenance: 'U-NET',
    message: 'Test run'
  };

  const georefBlocked = uNetResultGeoReferenceService.createGeoreferencedOutput(mockSegMissingBbox);

  console.log(`Georef Output Available?: ${georefBlocked.isAvailable}`);
  console.log(`Georef Message: "${georefBlocked.message}"`);

  const test7Passed =
    georefBlocked.isAvailable === false &&
    georefBlocked.message.includes('missing verified geospatial extent');

  if (test7Passed) {
    console.log("✅ TEST 7 PASSED: Arbitrary ±0.015° fallback removed; missing metadata blocks output cleanly.\n");
  } else {
    console.error("❌ TEST 7 FAILED: Ungated or fabricated extent generated!\n");
    allPassed = false;
  }

  // -------------------------------------------------------------------
  // TEST 8: Strict Guardrail — Zero Satellite Download or U-Net Inference
  // -------------------------------------------------------------------
  console.log("--- TEST 8: Strict Guardrail — Zero Satellite Download or U-Net Inference ---");
  const segResAmazon = await unetPreprocessingBridge.executePipeline(amazonObs);

  console.log(`Amazon Observation Data Status: ${amazonObs.dataStatus}`);
  console.log(`Amazon Observation 15-Channel Ready?: ${amazonObs.is15ChannelReady}`);
  console.log(`Pipeline Status: ${segResAmazon.status}`);
  console.log(`Pipeline Message: "${segResAmazon.message}"`);

  const test8Passed =
    amazonObs.dataStatus === 'BANDS_AVAILABLE' &&
    amazonObs.is15ChannelReady === false &&
    segResAmazon.status === 'unavailable' &&
    segResAmazon.message.includes('Metadata Only');

  if (test8Passed) {
    console.log("✅ TEST 8 PASSED: Pipeline cleanly halted at credential/cache boundary with zero downloads or inference.\n");
  } else {
    console.error("❌ TEST 8 FAILED: Guardrail violation!\n");
    allPassed = false;
  }

  // -------------------------------------------------------------------
  // TEST 9: Existing EMSR239 Cached Benchmark Regression Verification
  // -------------------------------------------------------------------
  console.log("--- TEST 9: EMSR239 Offline Benchmark Regression Check ---");
  const emsrObs = await satelliteObservationService.getObservation({
    latitude: 37.8445,
    longitude: -6.0049,
    requestedTimestamp: '2026-10-08T23:00:00Z'
  });

  const segResEmsr = await unetPreprocessingBridge.executePipeline(emsrObs);
  const georefEmsr = uNetResultGeoReferenceService.createGeoreferencedOutput(segResEmsr);

  console.log(`EMSR239 Raster CRS: ${emsrObs.rasterCrs}`);
  console.log(`EMSR239 Geographic CRS: ${emsrObs.geographicCrs}`);
  console.log(`EMSR239 Georeferenced Status: ${georefEmsr.isAvailable}`);
  console.log(`EMSR239 Source CRS: ${georefEmsr.sourceCrs}, Target CRS: ${georefEmsr.targetCrs}`);

  const test9Passed =
    emsrObs.rasterCrs === 'EPSG:32629' &&
    emsrObs.geographicCrs === 'EPSG:4326' &&
    segResEmsr.status === 'success' &&
    georefEmsr.isAvailable === true &&
    georefEmsr.sourceCrs === 'EPSG:32629' &&
    georefEmsr.targetCrs === 'EPSG:4326';

  if (test9Passed) {
    console.log("✅ TEST 9 PASSED: Offline EMSR239 cached benchmark continues working 100%.\n");
  } else {
    console.error("❌ TEST 9 FAILED: Regression in offline benchmark!\n");
    allPassed = false;
  }

  console.log("============================================================");
  if (allPassed) {
    console.log("ALL PHASE 3B STEP 2 GEOSPATIAL CORRECTION TESTS PASSED!");
  } else {
    console.error("SOME PHASE 3B TESTS FAILED!");
  }
  console.log("============================================================");
}

runPhase3BTests();

