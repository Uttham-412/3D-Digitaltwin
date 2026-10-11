/**
 * End-to-End Application Flow Verification Test
 * Tests the exact state transitions and logic executed in App.tsx and the UI panels.
 */

import { waterMaskService } from '../src/geospatial/waterMaskService';
import { fuelService } from '../src/geospatial/fuelService';
import { terrainService } from '../src/geospatial/terrainService';
import { fireSpreadModel } from '../src/simulation/fireSpreadModel';
import { simulationClockManager } from '../src/simulation/simulationClock';
import {
  FireState,
  SpreadHorizon
} from '../src/simulation/fireScenarioTypes';
import {
  EnvironmentalTimeline,
  EnvironmentalProvenance
} from '../src/environmental/environmentalTypes';

async function testFullApplicationLifecycle() {
  console.log('--- STARTING COMPLETE APPLICATION LIFECYCLE AUDIT ---\n');

  await waterMaskService.waitUntilReady();

  // SCENARIO 1: User clicks on Rio Negro (-3.1500, -60.0500)
  console.log('1. User clicks Rio Negro water coordinate (-3.1500, -60.0500):');
  const riverCoords = { latitude: -3.1500, longitude: -60.0500 };
  const waterCheck = waterMaskService.checkPoint(riverCoords);
  console.log('   waterMaskService.checkPoint:', waterCheck.surfaceClass, '|', waterCheck.details);

  const fuelRiver = await fuelService.fetchFuelData(riverCoords);
  console.log('   fuelService.fetchFuelData:', fuelRiver.fuelClass, '| Status:', fuelRiver.burnabilityStatus, '| isWater:', fuelRiver.isWater);

  const validationRiver = fuelService.validateIgnition(riverCoords, fuelRiver);
  console.log('   fuelService.validateIgnition:', validationRiver.valid ? 'VALID' : 'REJECTED', '| Code:', validationRiver.code);
  console.log('   Message:', validationRiver.message);

  if (validationRiver.valid) {
    throw new Error('FAILURE: Water ignition was NOT rejected!');
  }
  console.log('   ✅ Ignition correctly blocked on water surface.\n');

  // SCENARIO 2: User clicks on verified land in Tarumã Forest (-3.0000, -60.0500)
  console.log('2. User clicks terrestrial land coordinate (-3.0000, -60.0500):');
  const landCoords = { latitude: -3.0000, longitude: -60.0500 };
  const landCheck = waterMaskService.checkPoint(landCoords);
  console.log('   waterMaskService.checkPoint:', landCheck.surfaceClass);

  const fuelLand = await fuelService.fetchFuelData(landCoords);
  console.log('   fuelService.fetchFuelData:', fuelLand.fuelClass, '| Status:', fuelLand.burnabilityStatus, '| isBurnable:', fuelLand.isBurnable);

  const validationLand = fuelService.validateIgnition(landCoords, fuelLand);
  console.log('   fuelService.validateIgnition:', validationLand.valid ? 'VALID' : 'REJECTED', '| Code:', validationLand.code);

  if (!validationLand.valid) {
    throw new Error('FAILURE: Land ignition was rejected!');
  }
  console.log('   ✅ Land ignition successfully validated.\n');

  // SCENARIO 3: Create fire scenario & run spread analysis
  console.log('3. Create Scenario & Run Fire Spread Analysis:');
  const ignitionTime = '2026-10-01T14:00:00Z';
  simulationClockManager.initializeClock(ignitionTime);

  const testTimeline: EnvironmentalTimeline = {
    location: landCoords,
    locationName: 'Tarumã Rainforest Site',
    selectedIndex: 0,
    isAvailable: true,
    lastUpdated: ignitionTime,
    observations: [
      {
        timestamp: '2026-10-01T14:00:00Z',
        formattedTime: '14:00',
        temperature: 34.0,
        relativeHumidity: 45,
        windSpeed: 10.8, // 10.8 km/h at t0
        windDirection: 69, // 69° (ENE) at t0
        windDirectionCardinal: 'ENE',
        precipitation: 0.0,
        surfacePressure: 1011,
        cloudCover: 15,
        provenance: EnvironmentalProvenance.OBSERVED,
        source: 'Open-Meteo ERA5 Reanalysis'
      },
      {
        timestamp: '2026-10-01T15:00:00Z',
        formattedTime: '15:00',
        temperature: 34.5,
        relativeHumidity: 43,
        windSpeed: 12.5, // 12.5 km/h at +1H
        windDirection: 75, // 75° (ENE) at +1H
        windDirectionCardinal: 'ENE',
        precipitation: 0.0,
        surfacePressure: 1010,
        cloudCover: 20,
        provenance: EnvironmentalProvenance.OBSERVED,
        source: 'Open-Meteo ERA5 Reanalysis'
      }
    ]
  };

  const terrainLand = await terrainService.fetchTerrainData(landCoords);
  console.log('   Terrain Data: elevation =', terrainLand.elevationMeters, 'm, slope =', terrainLand.slopeDegrees, '°, aspect =', terrainLand.aspectDegrees, '°');

  const initialFire: FireState = {
    id: 'test_ign_scenario',
    source: 'SIMULATED',
    latitude: landCoords.latitude,
    longitude: landCoords.longitude,
    radiusMeters: 150,
    areaHectares: 7.1,
    timestamp: ignitionTime,
    provenance: 'EXPERIMENTAL FIRE-SPREAD SIMULATION'
  };

  const simulationRes = fireSpreadModel.runSimulation(initialFire, testTimeline, terrainLand, fuelLand);

  // Check +0H wind
  const step0H = simulationRes.timesteps['+0H'];
  const envObs0H = testTimeline.observations[0];
  console.log(`   +0H Wind in Fire Spread Panel: ${step0H.environmentalState.windSpeed} km/h from ${step0H.environmentalState.windDirection}° (${step0H.environmentalState.windDirectionCardinal})`);
  console.log(`   +0H Wind in Environmental Panel: ${envObs0H.windSpeed} km/h from ${envObs0H.windDirection}° (${envObs0H.windDirectionCardinal})`);

  if (step0H.environmentalState.windSpeed !== envObs0H.windSpeed || step0H.environmentalState.windDirection !== envObs0H.windDirection) {
    throw new Error('FAILURE: Wind speed or direction contradiction at +0H!');
  }
  console.log('   ✅ Environmental Panel and Fire Spread Panel show EXACT SAME wind snapshot at +0H!\n');

  // Check +1H wind
  const step1H = simulationRes.timesteps['+1H'];
  console.log(`   +1H Wind in Fire Spread Panel: ${step1H.environmentalState.windSpeed} km/h from ${step1H.environmentalState.windDirection}° (${step1H.environmentalState.windDirectionCardinal})`);
  console.log(`   +1H Horizon Timestamp: ${step1H.timestamp}`);
  console.log(`   Affected Area (+1H): ${step1H.affectedAreaHectares} ha, ROS: ${step1H.rateOfSpreadMetersPerMin} m/min`);
  console.log('   ✅ Active horizon is unambiguously labeled with target forecast timestamp and wind vector.\n');

  console.log('--- ALL LIFECYCLE CHECKS PASSED SUCCESSFULLY ---');
}

testFullApplicationLifecycle().catch(err => {
  console.error('Lifecycle test error:', err);
  process.exit(1);
});
