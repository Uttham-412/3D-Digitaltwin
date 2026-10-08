/**
 * LAND8FIRE — PHASE 2B PREPROCESSING & UNET PIPELINE VERIFICATION SUITE
 */

import { satelliteObservationService } from '../src/services/satelliteObservationService';
import { unetPreprocessingBridge } from '../src/services/unetPreprocessingBridge';
import { SENTINEL2_15CH_CHANNELS, SENTINEL2_15CH_MEAN, SENTINEL2_15CH_STD } from '../src/services/satelliteObservationService';

async function runPhase2BTests() {
  console.log("============================================================");
  console.log("LAND8FIRE PHASE 2B — VERIFICATION TEST SUITE");
  console.log("============================================================\n");

  let allPassed = true;

  // -------------------------------------------------------------------
  // TEST A: Real EMSR239 Benchmark Telemetry Pipeline Execution
  // -------------------------------------------------------------------
  console.log("--- TEST A: Real EMSR239 Benchmark Scene (Spain ~37.8445° N, -6.0049° W) ---");
  const emsr239Obs = await satelliteObservationService.getObservation({
    latitude: 37.8445,
    longitude: -6.0049,
    requestedTimestamp: '2026-10-08T22:00:00Z'
  });

  console.log(`Phase 2A Observation Available: ${emsr239Obs.available}`);
  console.log(`Source: ${emsr239Obs.source}`);

  const segResultA = await unetPreprocessingBridge.executePipeline(emsr239Obs);
  console.log(`Status: ${segResultA.status}`);
  console.log(`Model Checkpoint ID: ${segResultA.modelId}`);
  console.log(`Inference Threshold: ${segResultA.threshold}`);
  console.log(`Predicted Burned Pixels: ${segResultA.predictedBurnedPixels} / ${segResultA.totalPixels}`);
  console.log(`Burned Area Percentage: ${segResultA.predictedBurnedPercentage}%`);
  console.log(`Provenance: ${segResultA.provenance}`);

  if (
    segResultA.available === true &&
    segResultA.status === 'success' &&
    segResultA.modelId === 'land8fire_15ch_unet_full_dataset_best.pth' &&
    segResultA.threshold === 0.65 &&
    (segResultA.predictedBurnedPixels ?? 0) > 0
  ) {
    console.log("✅ TEST A PASSED: Real cached benchmark telemetry executed through U-Net pipeline cleanly.\n");
  } else {
    console.error("❌ TEST A FAILED!\n");
    allPassed = false;
  }

  // -------------------------------------------------------------------
  // TEST B: Unavailable Amazon Coordinates
  // -------------------------------------------------------------------
  console.log("--- TEST B: Unavailable Amazon Coordinates (-3.1190° S, -60.0217° W) ---");
  const amazonObs = await satelliteObservationService.getObservation({
    latitude: -3.1190,
    longitude: -60.0217,
    requestedTimestamp: '2026-10-08T22:00:00Z'
  });

  const segResultB = await unetPreprocessingBridge.executePipeline(amazonObs);
  console.log(`Available: ${segResultB.available}`);
  console.log(`Status: ${segResultB.status}`);
  console.log(`Message: "${segResultB.message}"`);
  console.log(`Predicted Burned Pixels: ${segResultB.predictedBurnedPixels ?? 'NONE (Halted cleanly)'}`);

  if (
    segResultB.available === false &&
    segResultB.status === 'unavailable' &&
    segResultB.message === 'SATELLITE OBSERVATION: NOT AVAILABLE' &&
    segResultB.predictedBurnedPixels === undefined
  ) {
    console.log("✅ TEST B PASSED: Pipeline halted cleanly without fake prediction when observation is unavailable.\n");
  } else {
    console.error("❌ TEST B FAILED!\n");
    allPassed = false;
  }

  // -------------------------------------------------------------------
  // TEST C: Tensor Shape, Dtype, NaN & Inf Check
  // -------------------------------------------------------------------
  console.log("--- TEST C: Tensor Shape (15, 256, 256), Float32 & Numerical Integrity ---");
  const rawSampleBands = new Float32Array(15 * 256 * 256);
  // Fill sample raw DN values (e.g. 1000 DN = 0.10 reflectance)
  for (let i = 0; i < rawSampleBands.length; i++) {
    rawSampleBands[i] = 1000 + (i % 500);
  }

  const { normalizedTensor, shape } = unetPreprocessingBridge.preprocess15ChannelTensor(rawSampleBands);
  console.log(`Tensor Shape: [${shape.join(', ')}]`);
  console.log(`Tensor Length: ${normalizedTensor.length}`);
  console.log(`Tensor Data Type: ${normalizedTensor.constructor.name}`);

  let hasNaN = false;
  let hasInf = false;
  for (let i = 0; i < normalizedTensor.length; i++) {
    if (isNaN(normalizedTensor[i])) hasNaN = true;
    if (!isFinite(normalizedTensor[i])) hasInf = true;
  }
  console.log(`Contains NaN?: ${hasNaN}`);
  console.log(`Contains Inf?: ${hasInf}`);

  if (
    shape[0] === 15 && shape[1] === 256 && shape[2] === 256 &&
    normalizedTensor.length === 983040 &&
    !hasNaN && !hasInf
  ) {
    console.log("✅ TEST C PASSED: (15, 256, 256) Float32 tensor constructed with zero NaN or Inf.\n");
  } else {
    console.error("❌ TEST C FAILED!\n");
    allPassed = false;
  }

  // -------------------------------------------------------------------
  // TEST D: Authoritative Channel Ordering Verification
  // -------------------------------------------------------------------
  console.log("--- TEST D: Authoritative 15-Channel Ordering Contract ---");
  const expectedChannels = [
    'B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08',
    'B08A', 'B09', 'B11', 'B12', 'NDVI', 'NBR', 'NDRI'
  ];
  let channelMatch = true;
  for (let i = 0; i < 15; i++) {
    const isMatch = SENTINEL2_15CH_CHANNELS[i] === expectedChannels[i];
    if (!isMatch) channelMatch = false;
    console.log(`Ch ${i.toString().padStart(2, '0')}: ${SENTINEL2_15CH_CHANNELS[i]} (Expected: ${expectedChannels[i]}) ${isMatch ? '✓' : '✗'}`);
  }

  if (channelMatch && SENTINEL2_15CH_CHANNELS.length === 15) {
    console.log("✅ TEST D PASSED: 15-channel ordering strictly matches verified contract.\n");
  } else {
    console.error("❌ TEST D FAILED!\n");
    allPassed = false;
  }

  // -------------------------------------------------------------------
  // TEST E: Normalization Constants Verification
  // -------------------------------------------------------------------
  console.log("--- TEST E: Verified 15-Channel Mean & Std Constants ---");
  const expectedMean = [
    0.054257, 0.067676, 0.091714, 0.107805, 0.143499, 0.202211,
    0.225245, 0.237767, 0.248593, 0.254053, 0.240885, 0.173530,
    0.368527, 0.120145, 0.320615
  ];
  const expectedStd = [
    0.072358, 0.075483, 0.079899, 0.095268, 0.097878, 0.107183,
    0.115450, 0.122247, 0.122630, 0.140352, 0.119594, 0.098965,
    0.303724, 0.325588, 0.337697
  ];

  let normMatch = true;
  for (let i = 0; i < 15; i++) {
    if (Math.abs(SENTINEL2_15CH_MEAN[i] - expectedMean[i]) > 1e-6) normMatch = false;
    if (Math.abs(SENTINEL2_15CH_STD[i] - expectedStd[i]) > 1e-6) normMatch = false;
  }
  console.log(`MEAN_15CH length: ${SENTINEL2_15CH_MEAN.length}, matches expected?: ${normMatch}`);
  console.log(`STD_15CH length: ${SENTINEL2_15CH_STD.length}, matches expected?: ${normMatch}`);

  if (normMatch) {
    console.log("✅ TEST E PASSED: Normalization vectors match verified 15-channel dataset statistics.\n");
  } else {
    console.error("❌ TEST E FAILED!\n");
    allPassed = false;
  }

  // -------------------------------------------------------------------
  // TEST F: Geospatial Metadata & Timestamps Preservation
  // -------------------------------------------------------------------
  console.log("--- TEST F: Geospatial Metadata & Timestamp Preservation ---");
  console.log(`Requested Timestamp: ${segResultA.requestedTimestamp}`);
  console.log(`Actual Acquisition Timestamp: ${segResultA.actualAcquisitionTime}`);
  console.log(`CRS: ${segResultA.crs}`);
  console.log(`Spatial Resolution: ${segResultA.spatialResolutionMeters}m`);
  console.log(`Pixel Dimensions: ${segResultA.pixelDimensions?.width}x${segResultA.pixelDimensions?.height}`);
  console.log(`Bounding Box: minLat=${segResultA.boundingBox?.minLat}, maxLat=${segResultA.boundingBox?.maxLat}`);

  if (
    segResultA.requestedTimestamp === '2026-10-08T22:00:00Z' &&
    segResultA.actualAcquisitionTime === '2017-07-31T00:00:00Z' &&
    segResultA.crs === 'EPSG:32629' &&
    segResultA.spatialResolutionMeters === 10
  ) {
    console.log("✅ TEST F PASSED: Requested/actual timestamps and geospatial metadata preserved.\n");
  } else {
    console.error("❌ TEST F FAILED!\n");
    allPassed = false;
  }

  console.log("============================================================");
  if (allPassed) {
    console.log("ALL PHASE 2B VERIFICATION TESTS PASSED SUCCESSFULLY!");
  } else {
    console.error("SOME PHASE 2B VERIFICATION TESTS FAILED!");
  }
  console.log("============================================================");
}

runPhase2BTests();
