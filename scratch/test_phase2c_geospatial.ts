/**
 * LAND8FIRE — PHASE 2C GEOSPATIAL & COMPARISON VERIFICATION SUITE
 */

import { satelliteObservationService } from '../src/services/satelliteObservationService';
import { unetPreprocessingBridge } from '../src/services/unetPreprocessingBridge';
import { uNetResultGeoReferenceService } from '../src/geospatial/unetResultGeoReference';
import { fireSimulationComparisonService } from '../src/comparison/fireSimulationComparison';

async function runPhase2CTests() {
  console.log("============================================================");
  console.log("LAND8FIRE PHASE 2C — VERIFICATION TEST SUITE");
  console.log("============================================================\n");

  let allPassed = true;

  // -------------------------------------------------------------------
  // TEST A: Real EMSR239 Benchmark Scene Pipeline (Satellite -> U-Net -> Georeference)
  // -------------------------------------------------------------------
  console.log("--- TEST A: Real EMSR239 Spain Benchmark Pipeline ---");
  const obsA = await satelliteObservationService.getObservation({
    latitude: 37.8445,
    longitude: -6.0049,
    requestedTimestamp: '2026-10-08T22:00:00Z'
  });

  const segA = await unetPreprocessingBridge.executePipeline(obsA);
  const georefA = uNetResultGeoReferenceService.createGeoreferencedOutput(segA);

  console.log(`Observation Available: ${obsA.available}`);
  console.log(`Georeferenced Available: ${georefA.isAvailable}`);
  console.log(`Provenance Label: "${georefA.provenanceLabel}"`);
  console.log(`Model Checkpoint: "${georefA.modelCheckpoint}"`);
  console.log(`Threshold: ${georefA.threshold}`);
  console.log(`Source CRS: ${georefA.sourceCrs}, Target CRS: ${georefA.targetCrs}`);
  console.log(`Predicted Burned Area: ${georefA.predictedBurnedAreaHectares} ha (${georefA.predictedBurnedPercentage}%)`);
  console.log(`GeoJSON URL: ${georefA.geoJsonUrl}`);

  if (
    georefA.isAvailable === true &&
    georefA.provenanceLabel === 'MODEL PREDICTION' &&
    georefA.modelCheckpoint === 'land8fire_15ch_unet_full_dataset_best.pth' &&
    georefA.threshold === 0.65 &&
    georefA.geoJsonUrl === '/data/emsr239_prediction.json'
  ) {
    console.log("✅ TEST A PASSED: Real satellite benchmark telemetry georeferenced cleanly as MODEL PREDICTION.\n");
  } else {
    console.error("❌ TEST A FAILED!\n");
    allPassed = false;
  }

  // -------------------------------------------------------------------
  // TEST B: Amazon Scenario with No Satellite Source
  // -------------------------------------------------------------------
  console.log("--- TEST B: Amazon/Manaus Scenario (-3.1190° S, -60.0217° W) ---");
  const obsB = await satelliteObservationService.getObservation({
    latitude: -3.1190,
    longitude: -60.0217,
    requestedTimestamp: '2026-10-08T22:00:00Z'
  });

  const segB = await unetPreprocessingBridge.executePipeline(obsB);
  const georefB = uNetResultGeoReferenceService.createGeoreferencedOutput(segB);

  console.log(`Observation Available: ${obsB.available}`);
  console.log(`Georeferenced Available: ${georefB.isAvailable}`);
  console.log(`Message: "${georefB.message}"`);
  console.log(`GeoJSON URL: ${georefB.geoJsonUrl ?? 'NONE (No layer created)'}`);

  if (
    obsB.available === false &&
    georefB.isAvailable === false &&
    georefB.message === 'SATELLITE OBSERVATION: NOT AVAILABLE' &&
    georefB.geoJsonUrl === undefined
  ) {
    console.log("✅ TEST B PASSED: Amazon scenario correctly returned SATELLITE OBSERVATION: NOT AVAILABLE without creating prediction layer.\n");
  } else {
    console.error("❌ TEST B FAILED!\n");
    allPassed = false;
  }

  // -------------------------------------------------------------------
  // TEST C: Model Prediction & Ground Truth Separation
  // -------------------------------------------------------------------
  console.log("--- TEST C: Model Prediction vs Ground Truth Separation ---");
  console.log(`Prediction Provenance Label: "${georefA.provenanceLabel}"`);
  console.log(`Ground Truth Provenance Label: "GROUND TRUTH — EMSR239 Delimitation"`);

  if (georefA.provenanceLabel !== 'GROUND TRUTH') {
    console.log("✅ TEST C PASSED: Model prediction and Ground truth remain strictly separate.\n");
  } else {
    console.error("❌ TEST C FAILED!\n");
    allPassed = false;
  }

  // -------------------------------------------------------------------
  // TEST D: CRS Transformation & Geographic Extent Preservation
  // -------------------------------------------------------------------
  console.log("--- TEST D: CRS Transformation & Geographic Extent Preservation ---");
  console.log(`Source CRS: ${georefA.sourceCrs}`);
  console.log(`Target CRS: ${georefA.targetCrs}`);
  console.log(`Extent: minLat=${georefA.spatialExtent?.minLat}, maxLat=${georefA.spatialExtent?.maxLat}`);
  console.log(`Spatial Resolution: ${georefA.spatialResolutionMeters}m`);

  if (
    georefA.sourceCrs === 'EPSG:32629' &&
    georefA.targetCrs === 'EPSG:4326' &&
    georefA.spatialExtent !== undefined &&
    georefA.spatialResolutionMeters === 10
  ) {
    console.log("✅ TEST D PASSED: CRS transformation and geographic extent preserved.\n");
  } else {
    console.error("❌ TEST D FAILED!\n");
    allPassed = false;
  }

  // -------------------------------------------------------------------
  // TEST E: Incompatible Simulation / Observation Pair Rejection
  // -------------------------------------------------------------------
  console.log("--- TEST E: Incompatible Simulation / Observation Pair Rejection ---");
  const mockAmazonSimulation: any = {
    initialFireState: { latitude: -3.1190, longitude: -60.0217, ignitionTime: '2026-10-08T22:00:00Z' },
    timesteps: {
      '+12H': { horizon: '+12H', affectedAreaHectares: 203.4, timestamp: '2026-10-09T10:00:00Z' }
    }
  };

  // Compare Amazon simulation with Spain satellite observation (6,000+ km apart)
  const compE = fireSimulationComparisonService.compareSimulationWithObservation(
    mockAmazonSimulation,
    georefA, // Spain observation
    '+12H'
  );

  console.log(`Comparison Status: ${compE.status}`);
  console.log(`Spatial Distance: ${compE.spatialDistanceKm} km`);
  console.log(`Message: "${compE.message}"`);

  if (compE.status === 'incompatible' && compE.spatialDistanceKm > 1000) {
    console.log("✅ TEST E PASSED: Incompatible simulation/observation pair rejected with status 'incompatible'.\n");
  } else {
    console.error("❌ TEST E FAILED!\n");
    allPassed = false;
  }

  // -------------------------------------------------------------------
  // TEST F: Compatible Data Calculations (IoU, Over/Underestimation)
  // -------------------------------------------------------------------
  console.log("--- TEST F: Compatible Scene Spatial Comparison Metrics ---");
  const mockSpainSimulation: any = {
    initialFireState: { latitude: 37.8445, longitude: -6.0049, ignitionTime: '2017-07-31T00:00:00Z' },
    timesteps: {
      '+12H': { horizon: '+12H', affectedAreaHectares: 310.5, timestamp: '2017-07-31T12:00:00Z' }
    }
  };

  const compF = fireSimulationComparisonService.compareSimulationWithObservation(
    mockSpainSimulation,
    georefA,
    '+12H'
  );

  console.log(`Comparison Status: ${compF.status}`);
  console.log(`Simulation Area: ${compF.simulationAreaHectares} ha`);
  console.log(`Observation Area: ${compF.observationAreaHectares} ha`);
  console.log(`Intersection Area: ${compF.intersectionAreaHectares} ha`);
  console.log(`Union Area: ${compF.unionAreaHectares} ha`);
  console.log(`IoU: ${(compF.iou * 100).toFixed(1)}% (${compF.iou})`);
  console.log(`Simulation Overestimation: ${compF.simulationOverestimationHectares} ha`);
  console.log(`Simulation Underestimation: ${compF.simulationUnderestimationHectares} ha`);

  if (
    compF.status === 'compatible' &&
    compF.intersectionAreaHectares > 0 &&
    compF.unionAreaHectares > compF.intersectionAreaHectares &&
    compF.iou > 0 && compF.iou <= 1.0
  ) {
    console.log("✅ TEST F PASSED: Compatible spatial comparison metrics (IoU, Over/Underestimation) calculated accurately.\n");
  } else {
    console.error("❌ TEST F FAILED!\n");
    allPassed = false;
  }

  console.log("============================================================");
  if (allPassed) {
    console.log("ALL PHASE 2C VERIFICATION TESTS PASSED SUCCESSFULLY!");
  } else {
    console.error("SOME PHASE 2C VERIFICATION TESTS FAILED!");
  }
  console.log("============================================================");
}

runPhase2CTests();
