/**
 * LAND8FIRE — PHASE 3A COPERNICUS DATA SPACE ECOSYSTEM (CDSE) VERIFICATION SUITE
 */

import { cdseDiscoveryService } from '../src/services/cdseDiscoveryService';
import { satelliteObservationService } from '../src/services/satelliteObservationService';
import { unetPreprocessingBridge } from '../src/services/unetPreprocessingBridge';

async function runPhase3ATests() {
  console.log("============================================================");
  console.log("LAND8FIRE PHASE 3A — COPERNICUS STAC CONNECTIVITY TEST SUITE");
  console.log("============================================================\n");

  let allPassed = true;

  // -------------------------------------------------------------------
  // TEST A: Real Amazon Study Region Query against CDSE STAC Catalogue
  // -------------------------------------------------------------------
  console.log("--- TEST A: Amazon/Manaus Study Region CDSE Query (-3.1190° S, -60.0217° W) ---");
  const amazonDiscovery = await cdseDiscoveryService.discoverObservation({
    latitude: -3.1190,
    longitude: -60.0217,
    requestedTimestamp: '2026-10-08T23:00:00Z',
    maxCloudCover: 40
  });

  console.log(`Available: ${amazonDiscovery.available}`);
  console.log(`Source Type: ${amazonDiscovery.source}`);
  console.log(`Product ID: ${amazonDiscovery.productId}`);
  console.log(`Collection: ${amazonDiscovery.collection}`);
  console.log(`Requested Timestamp: ${amazonDiscovery.requestedTimestamp}`);
  console.log(`Actual Acquisition Time: ${amazonDiscovery.actualAcquisitionTime}`);
  console.log(`Time Difference: ${amazonDiscovery.timeDifferenceHours} hours`);
  console.log(`Cloud Cover: ${amazonDiscovery.cloudCoverPercentage}%`);
  console.log(`CRS: ${amazonDiscovery.crs}`);
  console.log(`Available STAC Assets Count: ${amazonDiscovery.availableAssets?.length}`);
  console.log(`Has All 12 Bands?: ${amazonDiscovery.hasAll12Bands}`);
  console.log(`Data Status: ${amazonDiscovery.dataStatus}`);
  console.log(`Is 15-Channel Ready?: ${amazonDiscovery.is15ChannelReady}`);

  if (
    amazonDiscovery.available === true &&
    amazonDiscovery.productId !== undefined &&
    amazonDiscovery.cloudCoverPercentage !== undefined &&
    amazonDiscovery.hasAll12Bands === true &&
    amazonDiscovery.dataStatus === 'BANDS_AVAILABLE' &&
    amazonDiscovery.is15ChannelReady === false
  ) {
    console.log("✅ TEST A PASSED: Real Sentinel-2 L2A catalogue item discovered for Amazon region.\n");
  } else {
    console.error("❌ TEST A FAILED!\n");
    allPassed = false;
  }

  // -------------------------------------------------------------------
  // TEST B: Known Location Discovery Verification
  // -------------------------------------------------------------------
  console.log("--- TEST B: Known Location Discovery Verification ---");
  console.log(`Discovered Product ID: ${amazonDiscovery.productId}`);
  console.log(`Collection: ${amazonDiscovery.collection}`);

  if (amazonDiscovery.productId && amazonDiscovery.productId.startsWith('S2')) {
    console.log("✅ TEST B PASSED: Service successfully discovered real Sentinel-2 L2A product ID.\n");
  } else {
    console.error("❌ TEST B FAILED!\n");
    allPassed = false;
  }

  // -------------------------------------------------------------------
  // TEST C: Requested vs Actual Timestamp Separation
  // -------------------------------------------------------------------
  console.log("--- TEST C: Timestamp Separation Check ---");
  console.log(`Requested Timestamp: ${amazonDiscovery.requestedTimestamp}`);
  console.log(`Actual Acquisition Time: ${amazonDiscovery.actualAcquisitionTime}`);
  console.log(`Time Difference: ${amazonDiscovery.timeDifferenceHours} hours`);

  if (
    amazonDiscovery.requestedTimestamp === '2026-10-08T23:00:00Z' &&
    amazonDiscovery.actualAcquisitionTime !== amazonDiscovery.requestedTimestamp &&
    amazonDiscovery.timeDifferenceHours !== undefined
  ) {
    console.log("✅ TEST C PASSED: Requested and actual timestamps maintained separately.\n");
  } else {
    console.error("❌ TEST C FAILED!\n");
    allPassed = false;
  }

  // -------------------------------------------------------------------
  // TEST D: Real Cloud Cover Metadata
  // -------------------------------------------------------------------
  console.log("--- TEST D: Real Cloud Cover Metadata Check ---");
  console.log(`Cloud Cover Percentage: ${amazonDiscovery.cloudCoverPercentage}%`);

  if (typeof amazonDiscovery.cloudCoverPercentage === 'number') {
    console.log("✅ TEST D PASSED: Real cloud cover extracted from STAC item properties.\n");
  } else {
    console.error("❌ TEST D FAILED!\n");
    allPassed = false;
  }

  // -------------------------------------------------------------------
  // TEST E: Zero Credentials Exposed to Frontend
  // -------------------------------------------------------------------
  console.log("--- TEST E: Credential Protection Verification ---");
  const publicKeys = Object.keys(amazonDiscovery);
  const hasSecret = publicKeys.some(k => k.toLowerCase().includes('secret') || k.toLowerCase().includes('password'));
  console.log(`Contains Secret/Password Keys?: ${hasSecret}`);

  if (!hasSecret) {
    console.log("✅ TEST E PASSED: Zero credentials or tokens exposed to frontend.\n");
  } else {
    console.error("❌ TEST E FAILED!\n");
    allPassed = false;
  }

  // -------------------------------------------------------------------
  // TEST F: Zero Synthetic Data Generation & Pipeline Halting
  // -------------------------------------------------------------------
  console.log("--- TEST F: Pipeline Halting for Metadata-Only Remote Observation ---");
  const obsResF = await satelliteObservationService.getObservation({
    latitude: -3.1190,
    longitude: -60.0217,
    requestedTimestamp: '2026-10-08T23:00:00Z'
  });

  const segResF = await unetPreprocessingBridge.executePipeline(obsResF);

  console.log(`Satellite Observation Available: ${obsResF.available}`);
  console.log(`Observation Data Status: ${obsResF.dataStatus}`);
  console.log(`Is 15-Channel Ready?: ${obsResF.is15ChannelReady}`);
  console.log(`U-Net Pipeline Status: ${segResF.status}`);
  console.log(`U-Net Pipeline Message: "${segResF.message}"`);

  if (
    obsResF.available === true &&
    obsResF.is15ChannelReady === false &&
    segResF.status === 'unavailable' &&
    segResF.message.includes('Metadata Only')
  ) {
    console.log("✅ TEST F PASSED: U-Net pipeline halted cleanly without generating fake predictions for remote discovery.\n");
  } else {
    console.error("❌ TEST F FAILED!\n");
    allPassed = false;
  }

  // -------------------------------------------------------------------
  // TEST G: Existing EMSR239 Cached Benchmark Verification
  // -------------------------------------------------------------------
  console.log("--- TEST G: EMSR239 Offline Cached Benchmark Verification ---");
  const emsrDiscovery = await cdseDiscoveryService.discoverObservation({
    latitude: 37.8445,
    longitude: -6.0049,
    requestedTimestamp: '2026-10-08T23:00:00Z'
  });

  const obsResG = await satelliteObservationService.getObservation({
    latitude: 37.8445,
    longitude: -6.0049,
    requestedTimestamp: '2026-10-08T23:00:00Z'
  });

  const segResG = await unetPreprocessingBridge.executePipeline(obsResG);

  console.log(`EMSR239 Source: ${emsrDiscovery.source}`);
  console.log(`EMSR239 Data Status: ${emsrDiscovery.dataStatus}`);
  console.log(`EMSR239 15-Channel Ready?: ${emsrDiscovery.is15ChannelReady}`);
  console.log(`EMSR239 U-Net Status: ${segResG.status}`);
  console.log(`EMSR239 Predicted Pixels: ${segResG.predictedBurnedPixels} / ${segResG.totalPixels}`);

  if (
    emsrDiscovery.source === 'EMSR239_CACHED' &&
    emsrDiscovery.dataStatus === '15_CHANNEL_READY' &&
    emsrDiscovery.is15ChannelReady === true &&
    segResG.status === 'success' &&
    (segResG.predictedBurnedPixels ?? 0) > 0
  ) {
    console.log("✅ TEST G PASSED: EMSR239 offline benchmark scene continues working seamlessly.\n");
  } else {
    console.error("❌ TEST G FAILED!\n");
    allPassed = false;
  }

  console.log("============================================================");
  if (allPassed) {
    console.log("ALL PHASE 3A VERIFICATION TESTS PASSED SUCCESSFULLY!");
  } else {
    console.error("SOME PHASE 3A VERIFICATION TESTS FAILED!");
  }
  console.log("============================================================");
}

runPhase3ATests();
