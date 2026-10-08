import { satelliteObservationService, calculateNDVI, calculateNBR, calculateNDRI, SENTINEL2_15CH_MEAN, SENTINEL2_15CH_STD } from '../src/services/satelliteObservationService';

async function runTests() {
  console.log("=== PHASE 2A SATELLITE OBSERVATION SERVICE TESTS ===");

  // Test 1: Unconfigured Amazon location (e.g. 3.1190° S, 60.0217° W)
  const query1 = {
    latitude: -3.1190,
    longitude: -60.0217,
    requestedTimestamp: '2026-10-08T12:00:00Z'
  };

  const res1 = await satelliteObservationService.getObservation(query1);
  console.log("\n[TEST 1] Unconfigured Amazon Location:");
  console.log("Available:", res1.available);
  console.log("Message:", res1.message);
  console.log("Source:", res1.source);
  console.log("Requested Timestamp:", res1.requestedTimestamp);
  console.log("Raw Tensor attached?:", res1.raw15ChannelTensor !== undefined);

  if (res1.available === false && res1.message === 'SATELLITE OBSERVATION: NOT AVAILABLE' && res1.raw15ChannelTensor === undefined) {
    console.log("✅ TEST 1 PASSED: Unconfigured location correctly returned SATELLITE OBSERVATION: NOT AVAILABLE without fake data.");
  } else {
    console.error("❌ TEST 1 FAILED!");
  }

  // Test 2: Real cached EMSR239 Spain benchmark scene (37.8445° N, -6.0049° W)
  const query2 = {
    latitude: 37.8445,
    longitude: -6.0049,
    requestedTimestamp: '2026-10-08T12:00:00Z'
  };

  const res2 = await satelliteObservationService.getObservation(query2);
  console.log("\n[TEST 2] Configured Real EMSR239 Scene:");
  console.log("Available:", res2.available);
  console.log("Message:", res2.message);
  console.log("Source:", res2.source);
  console.log("Requested Timestamp:", res2.requestedTimestamp);
  console.log("Actual Acquisition Time:", res2.actualAcquisitionTime);
  console.log("Pixel Dimensions:", res2.pixelDimensions);
  console.log("CRS:", res2.crs);
  console.log("Bands Count:", res2.bandsAvailable?.length);

  if (res2.available === true && res2.actualAcquisitionTime === '2017-07-31T00:00:00Z' && res2.bandsAvailable?.length === 15) {
    console.log("✅ TEST 2 PASSED: Real cached scene returned acquisition metadata with exact 15 channels.");
  } else {
    console.error("❌ TEST 2 FAILED!");
  }

  // Test 3: Verify index calculations
  const ndvi = calculateNDVI(0.25, 0.08);
  const nbr = calculateNBR(0.25, 0.14);
  const ndri = calculateNDRI(0.08, 0.06);
  console.log("\n[TEST 3] Derived Spectral Indices Math:");
  console.log(`NDVI: (0.25 - 0.08) / (0.25 + 0.08 + 1e-6) = ${ndvi.toFixed(4)}`);
  console.log(`NBR:  (0.25 - 0.14) / (0.25 + 0.14 + 1e-6) = ${nbr.toFixed(4)}`);
  console.log(`NDRI: (0.08 - 0.06) / (0.08 + 0.06 + 1e-6) = ${ndri.toFixed(4)}`);
  console.log(`MEAN_15CH length: ${SENTINEL2_15CH_MEAN.length}, STD_15CH length: ${SENTINEL2_15CH_STD.length}`);

  if (Math.abs(ndvi - 0.51515) < 0.001 && SENTINEL2_15CH_MEAN.length === 15 && SENTINEL2_15CH_STD.length === 15) {
    console.log("✅ TEST 3 PASSED: Spectral indices and 15-channel normalization vectors verified.");
  } else {
    console.error("❌ TEST 3 FAILED!");
  }
}

runTests();
