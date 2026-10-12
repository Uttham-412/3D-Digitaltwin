/**
 * Automated Verification Script for Digital Twin 7 Required Tests
 * Tests:
 * 1. Location covered by cached Sentinel-2 raster
 * 2. Location inside study region but outside cached raster footprint
 * 3. Verified water location
 * 4. Verified burnable forest location
 * 5. Location inside study region but outside water-mask coverage
 * 6. Location outside study-region boundary
 * 7. Location with no suitable satellite product
 */

import { isPointInAmazonStudyRegion } from '../src/config/studyRegion';
import { waterMaskService } from '../src/geospatial/waterMaskService';
import { fuelService } from '../src/geospatial/fuelService';
import { forestConditionService } from '../src/geospatial/forestConditionService';
import { satelliteObservationService } from '../src/services/satelliteObservationService';
import { simulationAssessmentCoordinator } from '../src/services/simulationAssessmentCoordinator';

async function runAllTests() {
  console.log('================================================================');
  console.log('DIGITAL TWIN: 7 REQUIRED TESTS FOR HYDROGRAPHY, IGNITION & U-NET');
  console.log('================================================================\n');

  // Initialize water mask service
  await waterMaskService.waitUntilReady();
  const maskMeta = waterMaskService.getMetadata();
  console.log(`[INFO] Water mask ready: Bounds [${waterMaskService.verifiedBounds.west}, ${waterMaskService.verifiedBounds.south}, ${waterMaskService.verifiedBounds.east}, ${waterMaskService.verifiedBounds.north}], CRS: ${maskMeta?.crs || 'EPSG:4326'}\n`);

  // -------------------------------------------------------------------------
  // TEST 1: Location covered by existing cached Sentinel-2 raster
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 1: Location covered by existing cached Sentinel-2 raster');
  console.log('Coordinates: (-3.0500°, -60.1000°)');
  const loc1 = { latitude: -3.05, longitude: -60.10 };
  const inRegion1 = isPointInAmazonStudyRegion(loc1.latitude, loc1.longitude);
  const water1 = waterMaskService.checkPoint(loc1);
  const fuel1 = await fuelService.fetchFuelData(loc1);
  const ignition1 = fuelService.validateIgnition(loc1, fuel1);
  const obs1 = await satelliteObservationService.getObservation({
    latitude: loc1.latitude,
    longitude: loc1.longitude,
    requestedTimestamp: '2026-10-01T15:00:00Z'
  });

  console.log(`  Inside Study Region: ${inRegion1} (Expected: true)`);
  console.log(`  Water Surface Class: ${water1.surfaceClass} (Expected: LAND)`);
  console.log(`  Fuel Class: ${fuel1.fuelClass}`);
  console.log(`  Ignition Valid: ${ignition1.valid} (Code: ${ignition1.code}) (Expected: true / VALID)`);
  console.log(`  Satellite Observation Available: ${obs1.available} (Expected: true)`);
  console.log(`  15-Channel Ready: ${obs1.is15ChannelReady} (Expected: true)`);
  console.log(`  CDSE Item ID: ${obs1.cdseItemId}`);

  // Run Coordinator Assessment for Test 1
  const asm1 = await simulationAssessmentCoordinator.startAssessmentForSimulation({
    simulationId: 'test_sim_1',
    ignitionLat: loc1.latitude,
    ignitionLon: loc1.longitude,
    simulationStartTime: '2026-10-01T15:00:00Z',
    timelineTime: '2026-10-01T15:00:00Z',
    forceRefresh: true
  });
  console.log(`  Assessment Status: ${asm1.status} (Expected: COMPLETED)`);
  console.log(`  Predicted Burned: ${asm1.georeferencedOutput?.predictedBurnedPercentage}% (${asm1.georeferencedOutput?.predictedBurnedPixels} px)`);
  console.log(`  Assessment Message: ${asm1.statusMessage}`);
  const pass1 = inRegion1 && water1.surfaceClass === 'LAND' && ignition1.valid && obs1.is15ChannelReady && asm1.status === 'COMPLETED';
  console.log(`==> TEST 1 RESULT: ${pass1 ? 'PASS' : 'FAIL'}\n`);

  // -------------------------------------------------------------------------
  // TEST 2: Different location inside study region but outside cached raster
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 2: Location inside study region but outside cached raster footprint');
  console.log('Coordinates: (-2.8500°, -59.8500°)');
  const loc2 = { latitude: -2.85, longitude: -59.85 };
  const inRegion2 = isPointInAmazonStudyRegion(loc2.latitude, loc2.longitude);
  const water2 = waterMaskService.checkPoint(loc2);
  const fuel2 = await fuelService.fetchFuelData(loc2);
  const ignition2 = fuelService.validateIgnition(loc2, fuel2);
  const obs2 = await satelliteObservationService.getObservation({
    latitude: loc2.latitude,
    longitude: loc2.longitude,
    requestedTimestamp: '2026-10-01T15:00:00Z'
  });

  console.log(`  Inside Study Region: ${inRegion2} (Expected: true)`);
  console.log(`  Water Surface Class: ${water2.surfaceClass} (Expected: LAND)`);
  console.log(`  Ignition Valid: ${ignition2.valid} (Expected: true)`);
  console.log(`  Observation Source: ${obs2.source}`);
  console.log(`  CDSE Discovered Product: ${obs2.cdseItemId}`);
  console.log(`  Cloud Cover: ${obs2.cloudCoverPercentage}%`);
  console.log(`  Data Status: ${obs2.dataStatus}`);

  // Run Coordinator Assessment for Test 2
  const asm2 = await simulationAssessmentCoordinator.startAssessmentForSimulation({
    simulationId: 'test_sim_2',
    ignitionLat: loc2.latitude,
    ignitionLon: loc2.longitude,
    simulationStartTime: '2026-10-01T15:00:00Z',
    timelineTime: '2026-10-01T15:00:00Z',
    forceRefresh: true
  });
  console.log(`  Assessment Status: ${asm2.status}`);
  console.log(`  Assessment Failure/Status Message: ${asm2.statusMessage}`);
  console.log(`  Retry Action Available: ${asm2.canRetry}`);
  // Crucial check: never fabricates mask or reuses previous location's prediction!
  const notReused = asm2.assessmentId !== asm1.assessmentId && (!asm2.georeferencedOutput || asm2.status !== 'COMPLETED');
  const pass2 = inRegion2 && ignition2.valid && notReused && asm2.canRetry;
  console.log(`  No Fabricated Mask / No Unrelated Reuse: ${notReused}`);
  console.log(`==> TEST 2 RESULT: ${pass2 ? 'PASS' : 'FAIL'}\n`);

  // -------------------------------------------------------------------------
  // TEST 3: Verified water location
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 3: Verified water location (Rio Negro)');
  console.log('Coordinates: (-3.1500°, -60.0500°)');
  const loc3 = { latitude: -3.15, longitude: -60.05 };
  const inRegion3 = isPointInAmazonStudyRegion(loc3.latitude, loc3.longitude);
  const water3 = waterMaskService.checkPoint(loc3);
  const fuel3 = await fuelService.fetchFuelData(loc3);
  const ignition3 = fuelService.validateIgnition(loc3, fuel3);

  console.log(`  Inside Study Region: ${inRegion3} (Expected: true)`);
  console.log(`  Water Check: isWater=${water3.isWater}, surfaceClass=${water3.surfaceClass} (Expected: WATER)`);
  console.log(`  Ignition Valid: ${ignition3.valid} (Expected: false)`);
  console.log(`  Rejection Code: ${ignition3.code} (Expected: REJECTED_WATER)`);
  console.log(`  Rejection Message: ${ignition3.message}`);
  const pass3 = inRegion3 && water3.isWater && !ignition3.valid && ignition3.code === 'REJECTED_WATER';
  console.log(`==> TEST 3 RESULT: ${pass3 ? 'PASS' : 'FAIL'}\n`);

  // -------------------------------------------------------------------------
  // TEST 4: Verified burnable forest location
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 4: Verified burnable forest location');
  console.log('Coordinates: (-3.0500°, -60.1000°)');
  const loc4 = { latitude: -3.05, longitude: -60.10 };
  const forest4 = await forestConditionService.sampleCondition(loc4);
  const fuel4 = await fuelService.fetchFuelData(loc4);
  const ignition4 = fuelService.validateIgnition(loc4, fuel4);

  console.log(`  Forest Classification: ${forest4.classification} (Expected: HEALTHY VEGETATION)`);
  console.log(`  Burnability Factor: ${fuel4.burnabilityFactor}`);
  console.log(`  Ignition Valid: ${ignition4.valid} (Expected: true)`);
  console.log(`  Ignition Code: ${ignition4.code} (Expected: VALID)`);
  console.log(`  Ignition Message: ${ignition4.message}`);
  const pass4 = forest4.classification === 'HEALTHY VEGETATION' && ignition4.valid && ignition4.code === 'VALID';
  console.log(`==> TEST 4 RESULT: ${pass4 ? 'PASS' : 'FAIL'}\n`);

  // -------------------------------------------------------------------------
  // TEST 5: Location inside study region but outside water-mask coverage
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 5: Location inside study region but outside water-mask coverage');
  console.log('Coordinates: (-3.4500°, -60.4500°)');
  const loc5 = { latitude: -3.45, longitude: -60.45 };
  const inRegion5 = isPointInAmazonStudyRegion(loc5.latitude, loc5.longitude);
  const water5 = waterMaskService.checkPoint(loc5);
  const forest5 = await forestConditionService.sampleCondition(loc5);
  const fuel5 = await fuelService.fetchFuelData(loc5);
  const ignition5 = fuelService.validateIgnition(loc5, fuel5);

  console.log(`  Inside Study Region: ${inRegion5} (Expected: true)`);
  console.log(`  Water Check Verified: ${water5.isVerified} (Expected: false)`);
  console.log(`  Water Check Surface: ${water5.surfaceClass} (Expected: UNVERIFIED)`);
  console.log(`  Forest Classification: ${forest5.classification} (Expected: UNVERIFIED / INSUFFICIENT DATA)`);
  console.log(`  Ignition Valid: ${ignition5.valid} (Expected: false)`);
  console.log(`  Ignition Code: ${ignition5.code} (Expected: BLOCKED_UNVERIFIED_SURFACE)`);
  console.log(`  Ignition Message: ${ignition5.message}`);
  const pass5 = inRegion5 && !water5.isVerified && water5.surfaceClass === 'UNVERIFIED' && !ignition5.valid && ignition5.code === 'BLOCKED_UNVERIFIED_SURFACE';
  console.log(`==> TEST 5 RESULT: ${pass5 ? 'PASS' : 'FAIL'}\n`);

  // -------------------------------------------------------------------------
  // TEST 6: Location outside study-region boundary
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 6: Location outside study-region boundary');
  console.log('Coordinates: (-4.5000°, -62.0000°)');
  const loc6 = { latitude: -4.50, longitude: -62.00 };
  const inRegion6 = isPointInAmazonStudyRegion(loc6.latitude, loc6.longitude);
  const fuel6 = await fuelService.fetchFuelData(loc6);
  const ignition6 = fuelService.validateIgnition(loc6, fuel6);

  console.log(`  Inside Study Region: ${inRegion6} (Expected: false)`);
  console.log(`  Fuel Class: ${fuel6.fuelClass} (Expected: Outside Amazon Study Region)`);
  console.log(`  Ignition Valid: ${ignition6.valid} (Expected: false)`);
  console.log(`  Ignition Code: ${ignition6.code} (Expected: BLOCKED_UNVERIFIED_SURFACE)`);
  console.log(`  Ignition Message: ${ignition6.message}`);
  const pass6 = !inRegion6 && !ignition6.valid && fuel6.fuelClass === 'Outside Amazon Study Region';
  console.log(`==> TEST 6 RESULT: ${pass6 ? 'PASS' : 'FAIL'}\n`);

  // -------------------------------------------------------------------------
  // TEST 7: Location with no suitable satellite product
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 7: Location with no suitable satellite product');
  console.log('Coordinates: (-88.0000°, 0.0000°) [Antarctica Interior / Outside Sentinel-2 Orbit]');
  const loc7 = { latitude: -88.00, longitude: 0.00 };
  const obs7 = await satelliteObservationService.getObservation({
    latitude: loc7.latitude,
    longitude: loc7.longitude,
    requestedTimestamp: '2026-10-01T15:00:00Z'
  });
  const asm7 = await simulationAssessmentCoordinator.startAssessmentForSimulation({
    simulationId: 'test_sim_7',
    ignitionLat: loc7.latitude,
    ignitionLon: loc7.longitude,
    simulationStartTime: '2026-10-01T15:00:00Z',
    timelineTime: '2026-10-01T15:00:00Z',
    forceRefresh: true
  });

  console.log(`  Observation Available: ${obs7.available} (Expected: false)`);
  console.log(`  Observation Message: ${obs7.message}`);
  console.log(`  Assessment Status: ${asm7.status} (Expected: AWAITING_SATELLITE_OBSERVATION or OBSERVATION_UNSUITABLE)`);
  console.log(`  Assessment Status Message: ${asm7.statusMessage}`);
  console.log(`  Can Retry: ${asm7.canRetry} (Expected: true)`);
  const pass7 = !obs7.available && (asm7.status === 'AWAITING_SATELLITE_OBSERVATION' || asm7.status === 'OBSERVATION_UNSUITABLE') && asm7.canRetry === true;
  console.log(`==> TEST 7 RESULT: ${pass7 ? 'PASS' : 'FAIL'}\n`);

  // -------------------------------------------------------------------------
  // OVERALL SUMMARY
  // -------------------------------------------------------------------------
  console.log('================================================================');
  console.log('TEST SUITE EXECUTION SUMMARY');
  console.log('================================================================');
  console.log(`Test 1 (Cached Sentinel-2 Raster Inference):        ${pass1 ? 'PASSED' : 'FAILED'}`);
  console.log(`Test 2 (Outside Cached Footprint Discovery):        ${pass2 ? 'PASSED' : 'FAILED'}`);
  console.log(`Test 3 (Verified Water Exclusion):                  ${pass3 ? 'PASSED' : 'FAILED'}`);
  console.log(`Test 4 (Verified Burnable Forest Ignition):         ${pass4 ? 'PASSED' : 'FAILED'}`);
  console.log(`Test 5 (Inside Region, Outside Water Mask):         ${pass5 ? 'PASSED' : 'FAILED'}`);
  console.log(`Test 6 (Outside Study Region Boundary):             ${pass6 ? 'PASSED' : 'FAILED'}`);
  console.log(`Test 7 (No Suitable Satellite Product Handling):    ${pass7 ? 'PASSED' : 'FAILED'}`);
  const allPassed = pass1 && pass2 && pass3 && pass4 && pass5 && pass6 && pass7;
  console.log(`\nALL 7 TESTS PASSED: ${allPassed ? 'YES' : 'NO'}`);
  console.log('================================================================');
}

runAllTests().catch((err) => {
  console.error('Fatal error during test suite:', err);
  process.exit(1);
});
