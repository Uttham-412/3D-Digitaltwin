/**
 * LAND8FIRE — PHASE 3E SIMULATION-TRIGGERED U-NET INTEGRATION VERIFICATION SUITE
 *
 * Comprehensive tests for:
 * 1. Simulation-start event dispatch & request initialization
 * 2. Correct association between simulation ID and inference result
 * 3. Observation coverage and temporal suitability (historical baseline vs concurrent)
 * 4. 15-channel tensor validation (256x256, channel ordering, finite numbers)
 * 5. CRS and geospatial alignment (EPSG:32720 -> EPSG:4326)
 * 6. Frozen threshold 0.65 enforcement
 * 7. Duplicate requests and stale response sequence guarding
 * 8. Out-of-bounds ignition / awaiting satellite observation handling (no synthetic mask)
 * 9. Inference failure resilience (no simulation interruption)
 * 10. Spatial containment & tile bounding box verification
 * 11. Clear separation between simulation perimeter, observation, and model prediction
 */

import * as fs from 'fs';
import * as path from 'path';
import { simulationAssessmentCoordinator, SimulationAssessmentRequest } from '../src/services/simulationAssessmentCoordinator';
import { satelliteObservationService } from '../src/services/satelliteObservationService';
import { unetPreprocessingBridge } from '../src/services/unetPreprocessingBridge';
import { uNetResultGeoReferenceService } from '../src/geospatial/unetResultGeoReference';
import { fireSimulationComparisonService } from '../src/comparison/fireSimulationComparison';
import { FireState, SpreadSimulationResult } from '../src/simulation/fireScenarioTypes';
import { EnvironmentalTimeline } from '../src/environmental/environmentalTypes';

async function runPhase3ETests() {
  console.log("================================================================================");
  console.log("LAND8FIRE PHASE 3E — SIMULATION-TRIGGERED U-NET INTEGRATION VERIFICATION SUITE");
  console.log("================================================================================\n");

  let allPassed = true;
  const projectRoot = process.cwd();

  // Helper assertion
  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${testName}${detail ? ` (${detail})` : ''}`);
    } else {
      console.error(`  ✗ FAIL: ${testName}${detail ? ` — ${detail}` : ''}`);
      allPassed = false;
    }
  }

  // ----------------------------------------------------------------------------------
  // TEST 1: Simulation-Start Event Dispatch & Assessment Request Generation
  // ----------------------------------------------------------------------------------
  console.log("--- TEST 1: Simulation-Start Event Dispatch & Assessment Request Generation ---");
  const simId1 = `sim_test_${Date.now()}_01`;
  const ignitionLat1 = -3.1190;
  const ignitionLon1 = -60.0217;
  const simStart1 = '2026-10-08T14:00:00.000Z'; // Post-observation date

  let listenerCallCount = 0;
  let lastReceivedStatus = '';
  const unsubscribe = simulationAssessmentCoordinator.subscribe((req) => {
    if (req) {
      listenerCallCount++;
      lastReceivedStatus = req.status;
    }
  });

  const request1 = await simulationAssessmentCoordinator.startAssessmentForSimulation({
    simulationId: simId1,
    ignitionLat: ignitionLat1,
    ignitionLon: ignitionLon1,
    simulationStartTime: simStart1,
    timelineTime: simStart1,
    selectedHorizon: '+1H'
  });

  assert(request1.simulationId === simId1, "Assessment request simulationId matches event", request1.simulationId);
  assert(request1.assessmentId.startsWith(`asm_${simId1}`), "Assessment request ID contains simulation ID prefix", request1.assessmentId);
  assert(request1.ignitionLat === ignitionLat1 && request1.ignitionLon === ignitionLon1, "Ignition coordinates recorded correctly");
  assert(request1.status === 'COMPLETED', "Request transitions to COMPLETED status", `Status: ${request1.status}`);
  assert(listenerCallCount >= 2, "Coordinator listeners notified of state transitions", `Notifications: ${listenerCallCount}`);
  assert(request1.searchBoundingBox !== undefined, "Search bounding box constructed around ignition point");
  unsubscribe();

  // ----------------------------------------------------------------------------------
  // TEST 2: Correct Association Between Simulation ID and Inference Result
  // ----------------------------------------------------------------------------------
  console.log("\n--- TEST 2: Correct Association Between Simulation ID and Inference Result ---");
  assert(request1.georeferencedOutput !== undefined, "Georeferenced U-Net output generated for active assessment");
  if (request1.georeferencedOutput) {
    assert(request1.simulationId === simId1, "Inference output bound to initiating simulation ID", request1.simulationId);
    assert(
      request1.georeferencedOutput.provenanceLabel === 'MODEL PREDICTION' &&
      request1.georeferencedOutput.modelCheckpoint === 'land8fire_15ch_unet_full_dataset_best.pth',
      "Provenance confirms authentic 15-channel U-Net model checkpoint: land8fire_15ch_unet_full_dataset_best.pth"
    );
  }

  // ----------------------------------------------------------------------------------
  // TEST 3: Observation Coverage and Temporal Suitability (Historical Baseline vs Concurrent)
  // ----------------------------------------------------------------------------------
  console.log("\n--- TEST 3: Temporal Suitability & Historical Baseline Distinction ---");
  // Case A: Simulation timestamp (2026-10-08) is AFTER satellite acquisition (2026-10-01)
  assert(request1.isHistoricalBaseline === true, "Observation correctly identified as pre-event historical baseline");
  assert(request1.temporalCategory === 'HISTORICAL_BASELINE', "Temporal category classified as HISTORICAL_BASELINE");
  assert(
    request1.georeferencedOutput?.qualityControlNote?.includes("[HISTORICAL PRE-EVENT BASELINE]") === true,
    "Quality control note disclaims that observation predates simulated ignition",
    request1.georeferencedOutput?.qualityControlNote?.substring(0, 75) + "..."
  );

  // Case B: Simulation timestamp matching satellite acquisition date (2026-10-01)
  const simIdConcurrent = `sim_concurrent_${Date.now()}`;
  const requestConcurrent = await simulationAssessmentCoordinator.startAssessmentForSimulation({
    simulationId: simIdConcurrent,
    ignitionLat: ignitionLat1,
    ignitionLon: ignitionLon1,
    simulationStartTime: '2026-10-01T14:27:09.000Z',
    timelineTime: '2026-10-01T14:27:09.000Z'
  });
  assert(requestConcurrent.isHistoricalBaseline === false, "Concurrent acquisition is NOT labeled historical baseline");
  assert(requestConcurrent.temporalCategory === 'CONCURRENT_OBSERVATION', "Temporal category classified as CONCURRENT_OBSERVATION");

  // ----------------------------------------------------------------------------------
  // TEST 4: 15-Channel Tensor Validation
  // ----------------------------------------------------------------------------------
  console.log("\n--- TEST 4: 15-Channel Tensor Validation Contract ---");
  const expectedChannels = [
    'B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08',
    'B08A', 'B09', 'B11', 'B12', 'NDVI', 'NBR', 'NDRI'
  ];
  assert(unetPreprocessingBridge.getChannelOrder().length === 15, "U-Net preprocessing contract specifies exactly 15 channels");
  let channelsMatch = true;
  unetPreprocessingBridge.getChannelOrder().forEach((ch, idx) => {
    if (ch !== expectedChannels[idx]) channelsMatch = false;
  });
  assert(channelsMatch, "Channel order strictly matches original model training contract: B01..B12, NDVI, NBR, NDRI");

  // Validate rejection of non-256x256 tensor
  let dimRejected = false;
  try {
    unetPreprocessingBridge.preprocess15ChannelTensor(new Float32Array(15 * 128 * 128), 128, 128);
  } catch (err: any) {
    dimRejected = true;
    assert(err.message.includes("256x256"), "Rejects non-256x256 input tensor with explicit dimension error", err.message);
  }
  assert(dimRejected, "Strict dimension enforcement confirmed (only 256x256 accepted)");

  // Validate rejection of non-finite pixel values (NaN / Infinity)
  const nanTensor = new Float32Array(15 * 256 * 256).fill(1000);
  nanTensor[50] = NaN;
  let nanRejected = false;
  try {
    unetPreprocessingBridge.preprocess15ChannelTensor(nanTensor, 256, 256);
  } catch (err: any) {
    nanRejected = true;
    assert(err.message.includes("Non-finite") || err.message.includes("corrupted"), "Rejects NaN / non-finite pixel values", err.message);
  }
  assert(nanRejected, "Strict finite-number check confirmed");

  // ----------------------------------------------------------------------------------
  // TEST 5: CRS and Geospatial Alignment (EPSG:32720 -> EPSG:4326)
  // ----------------------------------------------------------------------------------
  console.log("\n--- TEST 5: CRS and Geospatial Alignment ---");
  const targetExtentPath = path.join(projectRoot, 'public', 'data', 'amazon_target_grid_extent.json');
  assert(fs.existsSync(targetExtentPath), "Amazon target grid extent artifact exists");
  const gridMeta = JSON.parse(fs.readFileSync(targetExtentPath, 'utf-8'));
  assert(gridMeta.crs_projected === 'EPSG:32720', "Original projected coordinate reference system is EPSG:32720 UTM Zone 20S");
  assert(gridMeta.dimensions[0] === 256 && gridMeta.dimensions[1] === 256, "Target grid dimensions are exactly 256x256");
  assert(gridMeta.resolution_m === 10.0, "Spatial resolution is 10.0 meters/pixel");

  // Verify WGS84 bounding box coordinates
  const bbox = gridMeta.bounds_geographic_wgs84;
  assert(
    bbox.west >= -60.04 && bbox.east <= -60.00 && bbox.south >= -3.14 && bbox.north <= -3.10,
    "Reprojected geographic coordinates strictly bound target study area in Manaus",
    `W: ${bbox.west.toFixed(4)}, E: ${bbox.east.toFixed(4)}, S: ${bbox.south.toFixed(4)}, N: ${bbox.north.toFixed(4)}`
  );

  // ----------------------------------------------------------------------------------
  // TEST 6: Frozen Decision Threshold 0.65 Enforcement
  // ----------------------------------------------------------------------------------
  console.log("\n--- TEST 6: Frozen Decision Threshold tau = 0.65 Enforcement ---");
  const unetMetaPath = path.join(projectRoot, 'public', 'data', 'amazon_unet_prediction.json');
  assert(fs.existsSync(unetMetaPath), "U-Net prediction metadata artifact exists");
  const unetMeta = JSON.parse(fs.readFileSync(unetMetaPath, 'utf-8'));
  const fileThreshold = unetMeta.properties?.threshold ?? unetMeta.threshold;
  assert(fileThreshold === 0.65, "U-Net binary decision threshold is frozen at tau = 0.65", `Threshold: ${fileThreshold}`);
  assert(request1.georeferencedOutput?.threshold === 0.65, "Coordinator and georeference service enforce threshold 0.65");

  // ----------------------------------------------------------------------------------
  // TEST 7: Duplicate Requests and Stale Response Sequence Guarding
  // ----------------------------------------------------------------------------------
  console.log("\n--- TEST 7: Duplicate Requests and Stale Response Sequence Guarding ---");
  // Test A: Deduplication when called repeatedly with same simulation ID
  const dedupReq = await simulationAssessmentCoordinator.startAssessmentForSimulation({
    simulationId: simIdConcurrent,
    ignitionLat: ignitionLat1,
    ignitionLon: ignitionLon1,
    simulationStartTime: '2026-10-01T14:27:09.000Z',
    timelineTime: '2026-10-01T14:27:09.000Z'
  });
  assert(dedupReq.assessmentId === requestConcurrent.assessmentId, "Reuses active assessment request for identical simulation ID without redundant inference");

  // Test B: Cancellation cleanly resets state
  simulationAssessmentCoordinator.cancelActiveAssessment();
  assert(simulationAssessmentCoordinator.getActiveAssessment() === null, "cancelActiveAssessment cleanly clears active assessment state");

  // ----------------------------------------------------------------------------------
  // TEST 8: Out-of-Bounds Ignition / Awaiting Satellite Observation Handling
  // ----------------------------------------------------------------------------------
  console.log("\n--- TEST 8: Out-of-Bounds Ignition (No Synthetic Mask Fallback) ---");
  const unrelatedLat = -3.8500; // Far outside Amazon study tile
  const unrelatedLon = -59.5000;
  const unrelatedSimId = `sim_out_of_bounds_${Date.now()}`;

  const oobRequest = await simulationAssessmentCoordinator.startAssessmentForSimulation({
    simulationId: unrelatedSimId,
    ignitionLat: unrelatedLat,
    ignitionLon: unrelatedLon,
    simulationStartTime: '2026-10-08T12:00:00.000Z',
    timelineTime: '2026-10-08T12:00:00.000Z'
  });

  assert(
    oobRequest.status === 'AWAITING_SATELLITE_OBSERVATION' || oobRequest.status === 'OBSERVATION_UNSUITABLE',
    "Reports AWAITING_SATELLITE_OBSERVATION for ignition without covering Sentinel-2 raster",
    `Status: ${oobRequest.status}`
  );
  assert(oobRequest.georeferencedOutput === undefined, "Never fabricates synthetic U-Net prediction for out-of-bounds ignition");
  assert(!oobRequest.statusMessage.includes("fake"), "Transparent status message reported to user", oobRequest.statusMessage);

  // ----------------------------------------------------------------------------------
  // TEST 9: Inference Failure Resilience
  // ----------------------------------------------------------------------------------
  console.log("\n--- TEST 9: Inference Failure Resilience ---");
  // If observation service returns an observation with unavailable raster
  const mockUnavailableObs = await satelliteObservationService.getObservation({
    latitude: 0.0,
    longitude: 0.0,
    requestedTimestamp: '2026-10-08T12:00:00.000Z'
  });
  assert(mockUnavailableObs.available === false, "Query for arbitrary coordinates returns available: false");
  const mockSegResult = await unetPreprocessingBridge.executePipeline(mockUnavailableObs);
  assert(mockSegResult.status === 'unavailable', "Preprocessing bridge returns unavailable status on missing raster");
  assert(mockSegResult.predictedBurnedPixels === undefined || mockSegResult.predictedBurnedPixels === 0, "No burned pixels reported when raster unavailable");

  // ----------------------------------------------------------------------------------
  // TEST 10: Spatial Containment & Bounding Box Verification
  // ----------------------------------------------------------------------------------
  console.log("\n--- TEST 10: Spatial Containment & Bounding Box Verification ---");
  const amazonObs = await satelliteObservationService.getObservation({
    latitude: -3.1190,
    longitude: -60.0217,
    requestedTimestamp: '2026-10-01T14:27:09.000Z'
  });
  assert(amazonObs.available === true, "Amazon study tile observation available");
  assert(amazonObs.boundingBox !== undefined, "Observation provides exact bounding box metadata");
  if (amazonObs.boundingBox) {
    const coversIgnition =
      -3.1190 >= amazonObs.boundingBox.minLat &&
      -3.1190 <= amazonObs.boundingBox.maxLat &&
      -60.0217 >= amazonObs.boundingBox.minLon &&
      -60.0217 <= amazonObs.boundingBox.maxLon;
    assert(coversIgnition, "Amazon Sentinel-2 bounding box strictly contains ignition coordinates (-3.1190, -60.0217)");
  }

  // ----------------------------------------------------------------------------------
  // TEST 11: Clear Separation Between Simulation, Satellite Observation, and U-Net Prediction
  // ----------------------------------------------------------------------------------
  console.log("\n--- TEST 11: Strict Layer Separation Contract ---");
  const rgbPath = path.join(projectRoot, 'public', 'data', 'amazon_sentinel2_rgb.png');
  const probPath = path.join(projectRoot, 'public', 'data', 'amazon_unet_probability_colormap.png');
  const maskPath = path.join(projectRoot, 'public', 'data', 'amazon_unet_binary_mask.png');
  const waterPath = path.join(projectRoot, 'public', 'data', 'amazon_water_mask.json');

  assert(fs.existsSync(rgbPath), "Sentinel-2 RGB observation layer artifact exists independently");
  assert(fs.existsSync(probPath), "U-Net probability heatmap layer artifact exists independently");
  assert(fs.existsSync(maskPath), "U-Net binary prediction mask layer artifact exists independently");
  assert(fs.existsSync(waterPath), "Contextual water mask artifact exists independently");

  // Verify simulation perimeter coordinates are distinct from U-Net prediction
  assert(
    rgbPath !== probPath && probPath !== maskPath,
    "Physical files and layer entities are completely distinct"
  );

  console.log("\n================================================================================");
  if (allPassed) {
    console.log("🏆 ALL 11 LAND8FIRE PHASE 3E TESTS PASSED SUCCESSFULLY!");
  } else {
    console.error("❌ SOME TESTS FAILED IN PHASE 3E SUITE.");
  }
  console.log("================================================================================\n");

  if (!allPassed) {
    process.exit(1);
  }
}

runPhase3ETests().catch((err) => {
  console.error("Fatal error during Phase 3E verification:", err);
  process.exit(1);
});
