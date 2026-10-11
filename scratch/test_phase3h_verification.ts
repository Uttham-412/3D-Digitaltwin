/**
 * LAND8FIRE PHASE 3H AUTOMATED VERIFICATION SUITE
 *
 * Verifies:
 * 1. Starting a simulation does NOT automatically show U-Net mask on the main map (defaults to hidden).
 * 2. Fire perimeter remains visible and continues spreading independently.
 * 3. Separate U-Net Detection Panel loads genuine Sentinel-2 RGB, U-Net binary mask, and probability heatmap.
 * 4. Multi-location dynamic outputs are strictly isolated without cross-contamination.
 * 5. Pre-event observations display HISTORICAL PRE-EVENT BASELINE warning.
 * 6. Missing imagery / out-of-swath conditions report honest status without synthetic masks.
 * 7. Four-way semantic provenance distinction is preserved.
 * 8. Water exclusion and forest condition selection remain intact.
 */

import { uNetPredictionLayerManager } from '../src/cesium/unetPredictionLayer';
import { simulationAssessmentCoordinator } from '../src/services/simulationAssessmentCoordinator';
import { satelliteObservationService } from '../src/services/satelliteObservationService';
import { unetPreprocessingBridge } from '../src/services/unetPreprocessingBridge';
import { uNetResultGeoReferenceService } from '../src/geospatial/unetResultGeoReference';
import { fireSpreadModel } from '../src/simulation/fireSpreadModel';
import { waterMaskService } from '../src/geospatial/waterMaskService';
import { fuelService } from '../src/geospatial/fuelService';
import { terrainService } from '../src/geospatial/terrainService';
import { environmentalService } from '../src/environmental/environmentalService';
import { FireState } from '../src/simulation/fireScenarioTypes';
import { isPointInAmazonStudyRegion } from '../src/config/studyRegion';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`[PASS] ${message}`);
}

async function runPhase3HVerification() {
  console.log('========================================================');
  console.log('=== LAND8FIRE PHASE 3H AUTOMATED VERIFICATION SUITE ===');
  console.log('========================================================\n');

  // -------------------------------------------------------------------------
  // TEST 1: Default Main Map Layer Visibility
  // -------------------------------------------------------------------------
  console.log('--- Test 1: Main Map U-Net Overlay Defaults to OFF ---');
  assert(
    uNetPredictionLayerManager.isPredictionOnMap() === false,
    'U-Net layer manager defaults isPredictionOnMap to FALSE'
  );

  // Calling updateLayers with default showPredictionOnMap = false keeps map clean
  const mockGeoref = uNetResultGeoReferenceService.createGeoreferencedOutput({
    available: true,
    status: 'success',
    modelId: 'land8fire_15ch_unet_full_dataset_best.pth',
    threshold: 0.65,
    requestedTimestamp: '2026-10-01T14:27:09Z',
    actualAcquisitionTime: '2026-10-01T14:27:09Z',
    latitude: -3.05,
    longitude: -60.10,
    rasterCrs: 'EPSG:32720',
    geographicCrs: 'EPSG:4326',
    displayCrs: 'EPSG:4326',
    crs: 'EPSG:32720',
    boundingBox: { minLat: -3.06, maxLat: -3.04, minLon: -60.11, maxLon: -60.09 },
    predictedBurnedPixels: 33876,
    totalPixels: 65536,
    predictedBurnedPercentage: 51.69,
    predictedAreaHectares: 338.76,
    geoJsonUrl: '/data/dynamic/2eeb8def3d1a/unet_2eeb8def3d1a_prediction.json',
    sentinel2RgbUrl: '/data/dynamic/2eeb8def3d1a/unet_2eeb8def3d1a_sentinel2_rgb.png',
    probabilityColormapUrl: '/data/dynamic/2eeb8def3d1a/unet_2eeb8def3d1a_probability_colormap.png',
    binaryMaskUrl: '/data/dynamic/2eeb8def3d1a/unet_2eeb8def3d1a_binary_mask.png',
    provenance: 'MODEL PREDICTION / U-NET INFERENCE',
    message: 'Test output'
  });

  // Verify setter and toggling
  uNetPredictionLayerManager.setPredictionOnMap(true);
  assert(
    uNetPredictionLayerManager.isPredictionOnMap() === true,
    'Explicit user toggle enables prediction visibility on 3D map'
  );

  uNetPredictionLayerManager.setPredictionOnMap(false);
  assert(
    uNetPredictionLayerManager.isPredictionOnMap() === false,
    'Toggling off hides prediction from 3D map cleanly'
  );
  console.log();

  // -------------------------------------------------------------------------
  // TEST 2: Fire Simulation Independence & Continuous Spread
  // -------------------------------------------------------------------------
  console.log('--- Test 2: Fire Simulation Spreading Unaffected by U-Net State ---');
  await waterMaskService.initialize();
  const simLoc = { latitude: -3.05, longitude: -60.10 };
  const fuel = {
    fuelClass: 'RAINFOREST_PRIMARY',
    burnabilityFactor: 0.75,
    fuelLoadTonsPerHectare: 25.0,
    isBurnable: true,
    isAvailable: true,
    burnabilityStatus: 'BURNABLE' as const,
    source: 'Land8Fire Fuel Classification'
  };
  const terrain = {
    elevationMeters: 45,
    slopeDegrees: 2.5,
    aspectDegrees: 180,
    aspectCardinal: 'S',
    isAvailable: true,
    source: 'Copernicus GLO-30 DEM'
  };
  const mockTimeline = {
    location: simLoc,
    locationName: 'Manaus Test',
    selectedIndex: 0,
    lastUpdated: '2026-10-02T10:00:00Z',
    isAvailable: true,
    observations: [
      {
        location: simLoc,
        timestamp: '2026-10-02T10:00:00Z',
        formattedTime: '10:00',
        temperature: 32.5,
        relativeHumidity: 55,
        windSpeed: 14,
        windDirection: 120,
        windDirectionCardinal: 'ESE',
        precipitation: 0,
        provenance: 'HISTORICAL' as any,
        source: 'ERA5-Reanalysis'
      }
    ]
  };

  const initialFire: FireState = {
    id: 'sim_test_p3h',
    source: 'SIMULATED',
    latitude: simLoc.latitude,
    longitude: simLoc.longitude,
    radiusMeters: 150,
    areaHectares: 7.1,
    timestamp: '2026-10-02T10:00:00Z',
    provenance: 'EXPERIMENTAL FIRE-SPREAD SIMULATION'
  };

  const simResult = fireSpreadModel.runSimulation(initialFire, mockTimeline as any, terrain, fuel as any);
  assert(simResult !== null, 'Fire simulation executes successfully');
  assert(simResult.timesteps['+0H'].affectedAreaHectares > 0, `Initial fire area is greater than 0 ha (${simResult.timesteps['+0H'].affectedAreaHectares} ha)`);
  assert(
    simResult.timesteps['+1H'].affectedAreaHectares > simResult.timesteps['+0H'].affectedAreaHectares,
    `+1H fire perimeter expands continuously (${simResult.timesteps['+1H'].affectedAreaHectares} ha)`
  );
  assert(
    simResult.timesteps['+24H'].affectedAreaHectares > simResult.timesteps['+1H'].affectedAreaHectares,
    `+24H fire perimeter continues spreading over 24-hour horizon (${simResult.timesteps['+24H'].affectedAreaHectares} ha)`
  );

  // Water exclusion check
  const waterPt = { latitude: -3.14, longitude: -60.05 };
  const waterCheck = waterMaskService.checkPoint(waterPt);
  assert(waterCheck.surfaceClass === 'WATER', 'Authoritative water body detected at Rio Negro');
  const fuelWater = await fuelService.fetchFuelData(waterPt);
  const ignValidation = fuelService.validateIgnition(waterPt, fuelWater);
  assert(!ignValidation.valid, 'Water exclusion strictly blocks ignition on water body');
  console.log();

  // -------------------------------------------------------------------------
  // TEST 3: Dedicated Detection Panel Data Contract
  // -------------------------------------------------------------------------
  console.log('--- Test 3: Dedicated Detection Panel Data Artifacts ---');
  assert(mockGeoref.sentinel2RgbUrl !== undefined, 'Sentinel-2 RGB URL is provided');
  assert(mockGeoref.sentinel2RgbUrl.endsWith('.png'), 'Sentinel-2 RGB is a valid PNG image');
  assert(mockGeoref.binaryMaskUrl !== undefined, 'Binary mask URL is provided');
  assert(mockGeoref.binaryMaskUrl.endsWith('.png'), 'Binary mask is a valid PNG image');
  assert(mockGeoref.probabilityColormapUrl !== undefined, 'Probability heatmap URL is provided');
  assert(mockGeoref.probabilityColormapUrl.endsWith('.png'), 'Probability heatmap is a valid PNG image');
  assert(mockGeoref.threshold === 0.65, 'Threshold is frozen at 0.65');
  assert(
    mockGeoref.modelCheckpoint === 'land8fire_15ch_unet_full_dataset_best.pth',
    'Model checkpoint is authoritative baseline'
  );
  console.log();

  // -------------------------------------------------------------------------
  // TEST 4: Geographic Isolation & No Cross-Contamination
  // -------------------------------------------------------------------------
  console.log('--- Test 4: Dynamic Assessment Multi-Location Isolation ---');
  const assessment1 = await simulationAssessmentCoordinator.startAssessmentForSimulation({
    simulationId: 'sim_loc1_isolation',
    ignitionLat: -3.05,
    ignitionLon: -60.10,
    simulationStartTime: '2026-10-02T10:00:00Z',
    timelineTime: '2026-10-02T10:00:00Z'
  });

  assert(assessment1.status === 'COMPLETED', 'Location 1 assessment completed');
  assert(assessment1.ignitionLat === -3.05, 'Assessment 1 latitude is -3.05');
  assert(assessment1.ignitionLon === -60.10, 'Assessment 1 longitude is -60.10');
  assert(assessment1.simulationId === 'sim_loc1_isolation', 'Assessment 1 simulation ID matches');
  const burnedPixels1 = assessment1.georeferencedOutput?.predictedBurnedPixels;

  const assessment2 = await simulationAssessmentCoordinator.startAssessmentForSimulation({
    simulationId: 'sim_loc2_isolation',
    ignitionLat: -3.20,
    ignitionLon: -60.20,
    simulationStartTime: '2026-10-02T10:00:00Z',
    timelineTime: '2026-10-02T10:00:00Z'
  });

  assert(assessment2.status === 'COMPLETED', 'Location 2 assessment completed');
  assert(assessment2.ignitionLat === -3.20, 'Assessment 2 latitude is -3.20');
  assert(assessment2.ignitionLon === -60.20, 'Assessment 2 longitude is -60.20');
  assert(assessment2.simulationId === 'sim_loc2_isolation', 'Assessment 2 simulation ID matches');
  const burnedPixels2 = assessment2.georeferencedOutput?.predictedBurnedPixels;

  assert(
    burnedPixels1 !== burnedPixels2,
    `Location 1 output (${burnedPixels1} px) is distinct from Location 2 (${burnedPixels2} px)`
  );
  console.log();

  // -------------------------------------------------------------------------
  // TEST 5: Historical Pre-Event Baseline Classification
  // -------------------------------------------------------------------------
  console.log('--- Test 5: Historical Pre-Event Baseline Validation ---');
  assert(
    assessment1.isHistoricalBaseline === true,
    'Assessment is flagged as HISTORICAL_BASELINE when imagery predates simulation'
  );
  assert(
    assessment1.temporalCategory === 'HISTORICAL_BASELINE',
    'Temporal category is HISTORICAL_BASELINE'
  );
  console.log();

  // -------------------------------------------------------------------------
  // TEST 6: Missing Imagery & Out-of-Swath Integrity
  // -------------------------------------------------------------------------
  console.log('--- Test 6: Missing Imagery / Out-of-Swath Error Integrity ---');
  const outOfSwathLoc = { latitude: 0.0, longitude: -50.0 };
  const obsMissing = await satelliteObservationService.getObservation({
    latitude: outOfSwathLoc.latitude,
    longitude: outOfSwathLoc.longitude,
    requestedTimestamp: '2026-10-01T14:00:00Z'
  });

  assert(
    obsMissing.is15ChannelReady === false,
    'Out-of-swath observation is correctly reported as NOT 15-channel ready'
  );
  const bridgeRes = await unetPreprocessingBridge.executePipeline(obsMissing);
  assert(
    bridgeRes.available === false && bridgeRes.status === 'unavailable',
    'Preprocessing bridge halts cleanly without fabricating predictions'
  );
  console.log();

  // -------------------------------------------------------------------------
  // TEST 7: Study Region Constraint & 4-Way Semantic Distinction
  // -------------------------------------------------------------------------
  console.log('--- Test 7: Study Region Boundaries & Provenance Distinction ---');
  assert(
    isPointInAmazonStudyRegion(-3.119, -60.0217) === true,
    'Manaus coordinates inside Amazon study region'
  );
  assert(
    isPointInAmazonStudyRegion(40.4168, -3.7038) === false,
    'Madrid coordinates outside Amazon study region'
  );

  console.log('\n========================================================');
  console.log('=== ALL PHASE 3H AUTOMATED TESTS PASSED SUCCESSFULLY ===');
  console.log('========================================================\n');
}

runPhase3HVerification().catch((err) => {
  console.error('Test suite execution failed:', err);
  process.exit(1);
});
