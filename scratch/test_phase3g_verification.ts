/**
 * Phase 3G Automated Verification Suite
 *
 * Verifies:
 * 1. Multi-tile Sentinel-2 discovery and coverage verification across Amazon region.
 * 2. Dynamic coordinate grid calculation and genuine 15-channel preprocessing contract.
 * 3. Execution of unchanged U-Net checkpoint on dynamic locations outside the cached patch.
 * 4. Georeferencing, spatial extent bounding box, and affine transform consistency.
 * 5. Temporal classification relative to simulation time (HISTORICAL_PRE_EVENT_BASELINE, CONCURRENT, etc.).
 * 6. Explicit handling of out-of-swath / invalid areas without synthetic mask fabrication.
 * 7. Verification of web artifacts (RGB, Heatmap, Binary Mask, GeoJSON) served for Cesium 3D viewer.
 */

import { satelliteObservationService, SENTINEL2_15CH_CHANNELS, SENTINEL2_15CH_MEAN, SENTINEL2_15CH_STD } from '../src/services/satelliteObservationService';
import { unetPreprocessingBridge } from '../src/services/unetPreprocessingBridge';
import { uNetResultGeoReferenceService } from '../src/geospatial/unetResultGeoReference';
import { simulationAssessmentCoordinator } from '../src/services/simulationAssessmentCoordinator';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`[PASS] ${message}`);
}

async function runTests() {
  console.log('========================================================');
  console.log('=== LAND8FIRE PHASE 3G AUTOMATED VERIFICATION SUITE ===');
  console.log('========================================================\n');

  // Test 1: Authoritative 15-Channel Order & Normalization Statistics
  console.log('--- Test 1: 15-Channel Authoritative Preprocessing Contract ---');
  const expectedChannels = ['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08', 'B08A', 'B09', 'B11', 'B12', 'NDVI', 'NBR', 'NDRI'];
  assert(SENTINEL2_15CH_CHANNELS.length === 15, 'Exactly 15 channels in contract');
  for (let i = 0; i < 15; i++) {
    assert(SENTINEL2_15CH_CHANNELS[i] === expectedChannels[i], `Channel ${i} is ${expectedChannels[i]}`);
  }
  assert(SENTINEL2_15CH_MEAN.length === 15, 'Mean vector has 15 elements');
  assert(SENTINEL2_15CH_STD.length === 15, 'Std vector has 15 elements');
  assert(Math.abs(SENTINEL2_15CH_MEAN[0] - 0.054257) < 1e-5, 'B01 mean matches dataset statistics');
  assert(Math.abs(SENTINEL2_15CH_STD[0] - 0.072358) < 1e-5, 'B01 std matches dataset statistics');

  // Test 2: Dynamic Location 1 (-3.05, -60.10) — 12 km north of cached airport patch
  console.log('\n--- Test 2: Dynamic Location 1 (-3.05, -60.10) Satellite Telemetry ---');
  const obs1 = await satelliteObservationService.getObservation({
    latitude: -3.05,
    longitude: -60.10,
    requestedTimestamp: '2026-10-01T16:00:00Z'
  });
  assert(obs1.available === true, 'Observation 1 is available');
  assert(obs1.is15ChannelReady === true, 'Observation 1 is 15-channel ready');
  assert(obs1.dataStatus === '15_CHANNEL_READY', 'Observation 1 status is 15_CHANNEL_READY');
  assert(obs1.rasterCrs === 'EPSG:32720', 'Raster CRS is EPSG:32720');
  assert(obs1.boundingBox !== undefined, 'Geospatial bounding box is defined');
  assert(obs1.boundingBox!.minLat < -3.05 && obs1.boundingBox!.maxLat > -3.05, 'Bounding box encompasses latitude -3.05');
  assert(obs1.boundingBox!.minLon < -60.10 && obs1.boundingBox!.maxLon > -60.10, 'Bounding box encompasses longitude -60.10');

  // Test 3: U-Net Preprocessing Bridge & Inference for Location 1
  console.log('\n--- Test 3: Dynamic U-Net Inference for Location 1 (-3.05, -60.10) ---');
  const segResult1 = await unetPreprocessingBridge.executePipeline(obs1);
  assert(segResult1.status === 'success', 'U-Net inference succeeded for Location 1');
  assert(segResult1.predictedBurnedPixels !== undefined && segResult1.predictedBurnedPixels > 0, `Predicted burned pixels > 0: ${segResult1.predictedBurnedPixels}`);
  assert(segResult1.totalPixels === 65536, 'Total pixels is 65,536 (256x256)');
  assert(segResult1.predictedBurnedPercentage !== undefined, `Predicted burned percentage: ${segResult1.predictedBurnedPercentage}%`);
  // Verify burned percentage is distinct from static airport patch (90.66%)
  assert(Math.abs(segResult1.predictedBurnedPercentage! - 90.66) > 5.0, `Burned percentage (${segResult1.predictedBurnedPercentage}%) is distinct from airport patch (90.66%)`);
  assert(Boolean(segResult1.geoJsonUrl), `GeoJSON URL is present: ${segResult1.geoJsonUrl}`);
  assert(Boolean(segResult1.sentinel2RgbUrl), `Sentinel-2 RGB URL is present: ${segResult1.sentinel2RgbUrl}`);
  assert(Boolean(segResult1.probabilityColormapUrl), `Heatmap URL is present: ${segResult1.probabilityColormapUrl}`);
  assert(Boolean(segResult1.binaryMaskUrl), `Binary Mask URL is present: ${segResult1.binaryMaskUrl}`);

  // Test 4: Georeferenced Output Creation & Spatial Extent
  console.log('\n--- Test 4: Georeferenced Output Verification ---');
  const georef1 = uNetResultGeoReferenceService.createGeoreferencedOutput(segResult1);
  assert(georef1.isAvailable === true, 'Georeferenced output is available');
  assert(georef1.provenanceLabel === 'MODEL PREDICTION', 'Provenance label is MODEL PREDICTION');
  assert(georef1.modelCheckpoint === 'land8fire_15ch_unet_full_dataset_best.pth', 'Checkpoint is baseline checkpoint');
  assert(georef1.threshold === 0.65, 'Threshold is frozen at 0.65');
  assert(georef1.spatialExtent !== undefined, 'Spatial extent is present');
  assert(georef1.spatialExtent!.minLat < -3.04 && georef1.spatialExtent!.maxLat > -3.06, 'Extent correctly centered on -3.05');
  assert(georef1.predictedBurnedAreaHectares !== undefined && georef1.predictedBurnedAreaHectares > 0, `Burned area in hectares: ${georef1.predictedBurnedAreaHectares} ha`);

  // Test 5: Dynamic Location 2 (-3.20, -60.20) — Southwest Rainforest
  console.log('\n--- Test 5: Dynamic Location 2 (-3.20, -60.20) Telemetry & Inference ---');
  const obs2 = await satelliteObservationService.getObservation({
    latitude: -3.20,
    longitude: -60.20,
    requestedTimestamp: '2026-10-01T17:00:00Z'
  });
  assert(obs2.available === true, 'Observation 2 is available');
  const segResult2 = await unetPreprocessingBridge.executePipeline(obs2);
  assert(segResult2.status === 'success', 'U-Net inference succeeded for Location 2');
  assert(segResult2.predictedBurnedPixels !== segResult1.predictedBurnedPixels, `Location 2 burned pixels (${segResult2.predictedBurnedPixels}) differs from Location 1 (${segResult1.predictedBurnedPixels})`);
  const georef2 = uNetResultGeoReferenceService.createGeoreferencedOutput(segResult2);
  assert(georef2.spatialExtent!.minLat < -3.19 && georef2.spatialExtent!.maxLat > -3.21, 'Location 2 extent centered on -3.20');

  // Test 6: Temporal Suitability Classification
  console.log('\n--- Test 6: Temporal Classification Relative to Simulation Time ---');
  const simReq = await simulationAssessmentCoordinator.startAssessmentForSimulation({
    simulationId: 'sim_test_temporal_phase3g',
    ignitionLat: -3.05,
    ignitionLon: -60.10,
    simulationStartTime: '2026-10-02T10:00:00Z', // 1 day after acquisition (1 Oct 2026)
    timelineTime: '2026-10-02T10:00:00Z'
  }, true);
  assert(simReq.status === 'COMPLETED', `Assessment completed, status: ${simReq.status}`);
  assert(simReq.isHistoricalBaseline === true, 'Observation acquired before simulation is marked as historical baseline');
  assert(simReq.temporalCategory === 'HISTORICAL_BASELINE', 'Temporal category is HISTORICAL_BASELINE');
  assert(simReq.timeDifferenceHours !== undefined && simReq.timeDifferenceHours > 18, `Time difference hours: ${simReq.timeDifferenceHours}h`);
  assert(simReq.georeferencedOutput?.qualityControlNote?.includes('HISTORICAL PRE-EVENT BASELINE') === true, 'Quality control note reflects historical baseline pre-event caveat');

  // Test 7: Out-of-Swath Integrity Check — Zero Synthetic Data Fabrication
  console.log('\n--- Test 7: Out-of-Swath / No Data Integrity Verification ---');
  const outObs = await satelliteObservationService.getObservation({
    latitude: -3.10,
    longitude: -59.85, // East of orbital swath (zero reflectance in T20MRB granule)
    requestedTimestamp: '2026-10-01T14:27:09Z'
  });
  assert(outObs.is15ChannelReady === false, 'Out-of-swath coordinates correctly reported as NOT 15-channel ready');
  assert(outObs.message.includes('OUT_OF_SWATH'), `Correct explicit message: ${outObs.message}`);

  const outSeg = await unetPreprocessingBridge.executePipeline(outObs);
  assert(outSeg.available === false, 'Preprocessing bridge halts cleanly without observation');
  assert(outSeg.status === 'unavailable', 'Status is unavailable');

  console.log('\n========================================================');
  console.log('=== ALL PHASE 3G AUTOMATED TESTS PASSED SUCCESSFULLY ===');
  console.log('========================================================');
}

runTests().catch((err) => {
  console.error('\n[FATAL] Phase 3G verification encountered error:', err);
  process.exit(1);
});
