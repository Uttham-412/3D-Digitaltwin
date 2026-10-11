/**
 * Part C Step 3: Spatial Behavior Verification Test Script
 */
import { forestConditionService } from '../src/geospatial/forestConditionService';
import { waterMaskService } from '../src/geospatial/waterMaskService';
import { fuelService } from '../src/geospatial/fuelService';
import { CDSEDiscoveryService } from '../src/services/cdseDiscoveryService';

async function runSpatialTests() {
  console.log('========================================================');
  console.log('=== PART C STEP 3: REAL SPATIAL BEHAVIOR TEST SUITE ===');
  console.log('========================================================\n');

  await forestConditionService.ensureDataLoaded();

  const testCases = [
    {
      name: 'Forest Location 1 (Inside 256x256 Satellite Patch)',
      coords: { latitude: -3.03, longitude: -60.05 },
    },
    {
      name: 'Forest Location 2 (Inside Amazon Region, Outside Local Patch)',
      coords: { latitude: -2.85, longitude: -59.85 },
    },
    {
      name: 'Verified Water Location (Rio Negro Hydrography)',
      coords: { latitude: -3.15, longitude: -60.05 },
    },
    {
      name: 'Urban / Non-Burnable Location (Manaus Core)',
      coords: { latitude: -3.119, longitude: -60.0217 },
    },
    {
      name: 'Inside Valid Sentinel-2 Orbital Swath',
      coords: { latitude: -3.05, longitude: -60.10 },
    },
    {
      name: 'Outside Cached Satellite Coverage / Study Bounds',
      coords: { latitude: -4.50, longitude: -62.00 },
    },
  ];

  for (const tc of testCases) {
    console.log(`--- Testing: ${tc.name} ---`);
    console.log(`Coordinates: (${tc.coords.latitude}, ${tc.coords.longitude})`);

    const condition = await forestConditionService.sampleCondition(tc.coords);
    const water = waterMaskService.checkPoint(tc.coords);
    const fuel = fuelService.checkBurnabilitySync(tc.coords);
    let cdseMessage = 'N/A';
    let cdseProduct = 'N/A';
    try {
      const cdse = await CDSEDiscoveryService.getInstance().discoverObservation({
        latitude: tc.coords.latitude,
        longitude: tc.coords.longitude,
        requestedTimestamp: '2026-10-11T12:00:00Z',
      });
      cdseMessage = `${cdse.available ? 'AVAILABLE' : 'UNAVAILABLE'} - ${cdse.message}`;
      cdseProduct = cdse.productId || 'None';
    } catch (e: any) {
      cdseMessage = `Discovery call: ${e.message}`;
    }

    console.log(`Classification: ${condition.classification}`);
    console.log(`Is Water: ${condition.isWater} (WaterMask: ${water.surfaceClass})`);
    console.log(`Is Burnable: ${condition.isBurnable} (Fuel: ${fuel.burnabilityStatus})`);
    console.log(`Source: ${condition.source}`);
    console.log(`Observation Date: ${condition.observationDate || 'N/A'}`);
    console.log(`Sampling Method: ${condition.samplingMethod}`);
    console.log(`Limitations: ${condition.limitationsNote || 'None'}`);
    console.log(`CDSE Discovery Status: ${cdseMessage}`);
    console.log(`CDSE Product: ${cdseProduct}`);
    console.log(`--------------------------------------------------------\n`);
  }
}

runSpatialTests().catch(console.error);
