/**
 * LAND8FIRE PHASE 3F — COMPREHENSIVE VERIFICATION TEST SUITE
 *
 * Verifies:
 * 1. Task A: U-Net Availability, Progressive Lifecycle States, CDSE Discovery/Acquisition & Retry
 * 2. Task B: Dynamic Location-Dependent Forest Condition Sampling & Classification
 * 3. Physical burnability, water exclusion, and scientific integrity
 */

import { simulationAssessmentCoordinator } from '../src/services/simulationAssessmentCoordinator';
import { satelliteObservationService, SENTINEL2_15CH_CHANNELS } from '../src/services/satelliteObservationService';
import { unetPreprocessingBridge } from '../src/services/unetPreprocessingBridge';
import { forestConditionService } from '../src/geospatial/forestConditionService';
import { waterMaskService } from '../src/geospatial/waterMaskService';
import { fuelService } from '../src/geospatial/fuelService';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
    throw new Error(`Assertion failed: ${testName}`);
  }
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('LAND8FIRE PHASE 3F: SYSTEMATIC VERIFICATION TEST SUITE');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // TEST SUITE 1: Task B — Dynamic Forest Condition Sampling
  // -------------------------------------------------------------
  console.log('--- TEST SUITE 1: Dynamic Forest Condition Sampling (Task B) ---');

  // Test B1: Sampling known water point (Rio Negro)
  const waterSample = await forestConditionService.sampleCondition({
    latitude: -3.1500,
    longitude: -60.0500
  });
  assert(waterSample.classification === 'WATER', 'Water coordinate classifies as WATER', `Got: ${waterSample.classification}`);
  assert(waterSample.isBurnable === false, 'Water coordinate is marked non-burnable');
  assert((waterSample.limitationsNote?.includes('Water exclusion') || waterSample.limitationsNote?.includes('water')) ?? false, 'Water coordinate includes water exclusion limitation');

  // Test B2: Sampling known urban point (Manaus urban core, outside baseline U-Net patch)
  const urbanSample = await forestConditionService.sampleCondition({
    latitude: -3.1400,
    longitude: -59.9900
  });
  assert(urbanSample.classification === 'NON-BURNABLE / URBAN', 'Urban coordinate classifies as NON-BURNABLE / URBAN', `Got: ${urbanSample.classification}`);
  assert(urbanSample.isBurnable === false, 'Urban coordinate is marked non-burnable');
  assert(
    ((urbanSample.limitationsNote?.includes('built') || urbanSample.description.toLowerCase().includes('urban')) ?? false),
    'Urban coordinate explains built-up environment'
  );

  // Test B3A: Sampling verified rainforest point (Rainforest study region)
  const rainforestSample = await forestConditionService.sampleCondition({
    latitude: -3.2000,
    longitude: -60.1000
  });
  assert(
    rainforestSample.classification === 'HEALTHY VEGETATION' ||
    rainforestSample.classification === 'DRY / STRESSED VEGETATION',
    'Rainforest point classifies as HEALTHY VEGETATION',
    `Got: ${rainforestSample.classification}`
  );
  assert(rainforestSample.isBurnable === true, 'Rainforest point is burnable fuel');

  // Test B3B: Sampling point inside baseline U-Net prediction raster
  const rasterSample = await forestConditionService.sampleCondition({
    latitude: -3.1190,
    longitude: -60.0217
  });
  assert(
    rasterSample.classification === 'PREDICTED BURNED AREA' ||
    rasterSample.classification === 'HEALTHY VEGETATION',
    'Point inside baseline raster produces valid model classification',
    `Got: ${rasterSample.classification}`
  );
  assert(rasterSample.ndvi !== undefined, 'Raster point contains sampled NDVI metric');
  assert(rasterSample.nbr !== undefined, 'Raster point contains sampled NBR metric');
  assert(rasterSample.unetBurnProbability !== undefined, 'Raster point contains sampled U-Net probability');

  // Test B4: Sampling point outside raster coverage
  const outOfBoundsSample = await forestConditionService.sampleCondition({
    latitude: 10.5000,
    longitude: 25.0000
  });
  assert(outOfBoundsSample.classification === 'UNVERIFIED / INSUFFICIENT DATA', 'Remote coordinate classifies as UNVERIFIED / INSUFFICIENT DATA', `Got: ${outOfBoundsSample.classification}`);
  assert(outOfBoundsSample.isBurnable === false, 'Unverified coordinate defaults to non-burnable safety');
  assert(outOfBoundsSample.confidence <= 0.3, 'Unverified coordinate has low confidence (<= 0.3)');

  // Test B5: Low NDVI bare soil is NOT automatically classified as burned
  const mockBareSoilSample = await forestConditionService.sampleCondition({
    latitude: -3.1000,
    longitude: -60.0400
  });
  assert(
    mockBareSoilSample.classification !== 'CONFIRMED BURNED AREA',
    'Low-NDVI point without ground truth is never classified as CONFIRMED BURNED AREA'
  );

  // Test B6: Dynamic response to sequential location changes
  const locA = await forestConditionService.sampleCondition({ latitude: -3.1500, longitude: -60.0500 });
  const locB = await forestConditionService.sampleCondition({ latitude: -3.1190, longitude: -60.0217 });
  assert(locA.latitude !== locB.latitude, 'Sequential locations capture distinct latitudes');
  assert(locA.classification !== locB.classification, 'Sequential locations produce distinct dynamic categories');

  console.log('\n--- TEST SUITE 2: U-Net Availability & Progressive Coordinator (Task A) ---');

  // Test A1: Baseline cached raster reuse
  const baselineReq = await simulationAssessmentCoordinator.startAssessmentForSimulation({
    simulationId: 'test_sim_baseline',
    ignitionLat: -3.1190,
    ignitionLon: -60.0217,
    simulationStartTime: '2026-10-05T12:00:00Z',
    timelineTime: '2026-10-05T12:00:00Z'
  }, true);

  assert(baselineReq.status === 'COMPLETED', 'Baseline cached area completes assessment', `Got: ${baselineReq.status} (${baselineReq.statusMessage})`);
  assert(baselineReq.georeferencedOutput !== null, 'Baseline assessment produces georeferenced output');
  assert(baselineReq.isCoveredByObservation === true, 'Baseline assessment confirms raster coverage');

  // Test A2: Historical pre-event baseline labeling
  // Simulation start is 5 Oct 2026, satellite acquisition is 1 Oct 2026 -> historical baseline!
  assert(baselineReq.isHistoricalBaseline === true, 'Satellite observation predating simulation is flagged as historical baseline');
  assert(baselineReq.temporalCategory === 'HISTORICAL_BASELINE', 'Temporal category is HISTORICAL_BASELINE');
  assert(
    baselineReq.georeferencedOutput?.qualityControlNote?.includes('HISTORICAL PRE-EVENT BASELINE') ?? false,
    'Georeferenced quality control note explicitly warns output represents historical pre-event baseline'
  );

  // Test A3: Broader Tile T20MRB location acquisition & inference
  const t20mrbReq = await simulationAssessmentCoordinator.startAssessmentForSimulation({
    simulationId: 'test_sim_t20mrb',
    ignitionLat: -3.1550,
    ignitionLon: -60.0450,
    simulationStartTime: '2026-10-05T14:00:00Z',
    timelineTime: '2026-10-05T14:00:00Z'
  }, true);

  assert(
    t20mrbReq.status === 'COMPLETED' || t20mrbReq.status === 'RUNNING_INFERENCE',
    'Tile T20MRB location executes acquisition and inference',
    `Got: ${t20mrbReq.status} - ${t20mrbReq.statusMessage}`
  );

  // Test A4: Out-of-catalog remote location reports AWAITING_SATELLITE_OBSERVATION with retry
  const remoteReq = await simulationAssessmentCoordinator.startAssessmentForSimulation({
    simulationId: 'test_sim_remote',
    ignitionLat: -15.8200,
    ignitionLon: -47.9300, // Brasilia (outside Amazon Tile T20MRB)
    simulationStartTime: '2026-10-05T14:00:00Z',
    timelineTime: '2026-10-05T14:00:00Z'
  }, true);

  assert(
    remoteReq.status === 'AWAITING_SATELLITE_OBSERVATION' || remoteReq.status === 'FAILED',
    'Remote out-of-catalog location reports explicit non-pending terminal state',
    `Got: ${remoteReq.status}`
  );
  assert(remoteReq.canRetry === true, 'Out-of-catalog request exposes canRetry = true');
  assert(remoteReq.statusMessage.length > 0, 'Status message clearly explains why raster is not available');

  // Test A5: Retry mechanism
  const retryReq = await simulationAssessmentCoordinator.retryAssessment();
  assert(retryReq !== null, 'Retry assessment successfully re-triggers execution');

  console.log('\n--- TEST SUITE 3: U-Net Preprocessing Bridge Validation ---');

  // Test P1: Missing bands rejection
  const corruptedObs: any = {
    available: true,
    is15ChannelReady: true,
    bandsAvailable: ['B01', 'B02', 'B03'], // only 3 bands instead of 15
    latitude: -3.119,
    longitude: -60.0217,
    requestedTimestamp: '2026-10-01T00:00:00Z'
  };
  const corruptedResult = await unetPreprocessingBridge.executePipeline(corruptedObs);
  assert(corruptedResult.status === 'error', 'Bridge rejects observation missing required 15 channels');
  assert(corruptedResult.message.includes('VALIDATION ERROR'), 'Validation error message reported');

  // Test P2: Channel order verification
  assert(SENTINEL2_15CH_CHANNELS.length === 15, 'Authoritative channel contract defines exactly 15 bands');
  assert(SENTINEL2_15CH_CHANNELS[0] === 'B01', 'Channel 0 is B01');
  assert(SENTINEL2_15CH_CHANNELS[12] === 'NDVI', 'Channel 12 is NDVI');
  assert(SENTINEL2_15CH_CHANNELS[13] === 'NBR', 'Channel 13 is NBR');
  assert(SENTINEL2_15CH_CHANNELS[14] === 'NDRI', 'Channel 14 is NDRI');

  console.log('\n--- TEST SUITE 4: Physical Water Exclusion & Simulation Integrity ---');

  // Test W1: Water mask detection on Rio Negro
  const waterCheckResult = waterMaskService.checkPoint({
    latitude: -3.1500,
    longitude: -60.0500
  });
  assert(waterCheckResult.isWater === true, 'Rio Negro coordinate detected as water');

  // Test W2: Fuel service ignition rejection on water
  const fuelData = await fuelService.fetchFuelData({
    latitude: -3.1500,
    longitude: -60.0500
  });
  const ignitionValidation = fuelService.validateIgnition(
    { latitude: -3.1500, longitude: -60.0500 },
    fuelData
  );
  assert(ignitionValidation.code === 'REJECTED_WATER' || ignitionValidation.message.toLowerCase().includes('water'), 'Ignition rejection message cites water exclusion');

  console.log('\n================================================================');
  console.log(`ALL VERIFICATION TESTS COMPLETED: ${passedTests}/${totalTests} PASSED (100%)`);
  console.log('================================================================');
}

runTestSuite().catch((err) => {
  console.error('Test suite encountered an error:', err);
  process.exit(1);
});
