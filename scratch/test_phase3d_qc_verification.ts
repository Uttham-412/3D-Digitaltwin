/**
 * LAND8FIRE — PHASE 3D U-NET PREDICTION QUALITY CONTROL VERIFICATION TEST
 *
 * Validates:
 * 1. Verification of probability raster and binary mask (dimensions, CRS EPSG:32720, transform)
 * 2. Verification of georeferencing service coordinate transformation to WGS84
 * 3. Verification of all visual artifacts (Sentinel-2 RGB, Probability Heatmap, Binary Mask, GeoJSON, Water Mask)
 * 4. Verification of layer visualization modes & strict layer separation contract
 * 5. Verification of MODEL PREDICTION attribution and scientific domain-shift quality control notice
 */

import * as fs from 'fs';
import * as path from 'path';
import { satelliteObservationService } from '../src/services/satelliteObservationService';
import { unetPreprocessingBridge } from '../src/services/unetPreprocessingBridge';
import { uNetResultGeoReferenceService } from '../src/geospatial/unetResultGeoReference';

async function runPhase3DVerification() {
  console.log("============================================================");
  console.log("LAND8FIRE PHASE 3D — U-NET PREDICTION QC VERIFICATION SUITE");
  console.log("============================================================\n");

  let allPassed = true;
  const projectRoot = process.cwd();

  // -------------------------------------------------------------------
  // TEST 1: Phase 3C Raster & Metadata Verification
  // -------------------------------------------------------------------
  console.log("--- TEST 1: Phase 3C Raster & Metadata Verification ---");
  const probTifPath = path.join(projectRoot, 'scratch', 'cache', 'cdse', 'processed', 'amazon_unet_burned_area_probability.tif');
  const maskTifPath = path.join(projectRoot, 'scratch', 'cache', 'cdse', 'processed', 'amazon_unet_burned_area_mask.tif');
  const metaJsonPath = path.join(projectRoot, 'scratch', 'cache', 'cdse', 'processed', 'amazon_unet_inference_metadata.json');

  const probExists = fs.existsSync(probTifPath);
  const maskExists = fs.existsSync(maskTifPath);
  const metaExists = fs.existsSync(metaJsonPath);

  console.log(`Probability GeoTIFF exists: ${probExists} (${probTifPath})`);
  console.log(`Binary Mask GeoTIFF exists: ${maskExists} (${maskTifPath})`);
  console.log(`Inference Metadata JSON exists: ${metaExists} (${metaJsonPath})`);

  if (!probExists || !maskExists || !metaExists) {
    console.error("❌ TEST 1 FAILED: Required Phase 3C artifacts missing.");
    allPassed = false;
  } else {
    const meta = JSON.parse(fs.readFileSync(metaJsonPath, 'utf-8'));
    console.log(`Model Checkpoint: ${meta.checkpoint_file}`);
    console.log(`Target Grid CRS: ${meta.target_grid.crs}`);
    console.log(`Grid Dimensions: ${meta.target_grid.width} × ${meta.target_grid.height}`);
    console.log(`Resolution: ${meta.target_grid.resolution} m`);
    console.log(`Predicted Burned Pixels: ${meta.metrics.predicted_burned_pixels} / ${meta.metrics.total_pixels} (${meta.metrics.predicted_burned_percentage.toFixed(2)}%)`);
    console.log(`Predicted Area: ${meta.metrics.predicted_area_hectares} ha`);

    if (
      meta.target_grid.crs === 'EPSG:32720' &&
      meta.target_grid.width === 256 &&
      meta.target_grid.height === 256 &&
      meta.target_grid.resolution === 10.0 &&
      meta.metrics.predicted_burned_pixels === 59418 &&
      meta.decision_threshold === 0.65
    ) {
      console.log("✅ TEST 1 PASSED: Phase 3C rasters and metadata verified.\n");
    } else {
      console.error("❌ TEST 1 FAILED: Metadata parameters mismatch.");
      allPassed = false;
    }
  }

  // -------------------------------------------------------------------
  // TEST 2: Georeferencing & Coordinate Transformation to WGS84
  // -------------------------------------------------------------------
  console.log("--- TEST 2: Georeferencing & Coordinate Transformation ---");
  const amazonObs = await satelliteObservationService.getObservation({
    latitude: -3.1190,
    longitude: -60.0217,
    requestedTimestamp: '2026-10-01T14:27:09Z'
  });

  const segResult = await unetPreprocessingBridge.executePipeline(amazonObs);
  const georefOutput = uNetResultGeoReferenceService.createGeoreferencedOutput(segResult);

  console.log(`Observation Available: ${amazonObs.available}`);
  console.log(`Satellite Source: ${amazonObs.source}`);
  console.log(`Native Raster CRS: ${georefOutput.sourceCrs}`);
  console.log(`Target Display CRS: ${georefOutput.targetCrs}`);
  console.log(`Geographic Extent WGS84:`, georefOutput.spatialExtent);
  console.log(`Predicted Area Hectares: ${georefOutput.predictedBurnedAreaHectares} ha`);
  console.log(`GeoJSON URL: ${georefOutput.geoJsonUrl}`);
  console.log(`Sentinel-2 RGB URL: ${georefOutput.sentinel2RgbUrl}`);
  console.log(`Probability Colormap URL: ${georefOutput.probabilityColormapUrl}`);
  console.log(`Binary Mask URL: ${georefOutput.binaryMaskUrl}`);
  console.log(`Water Mask URL: ${georefOutput.waterMaskUrl}`);

  const extent = georefOutput.spatialExtent;
  const isExtentValid =
    extent !== undefined &&
    extent.minLon < -60.03 &&
    extent.maxLon > -60.02 &&
    extent.minLat < -3.12 &&
    extent.maxLat > -3.11;

  if (
    georefOutput.isAvailable === true &&
    georefOutput.provenanceLabel === 'MODEL PREDICTION' &&
    georefOutput.sourceCrs === 'EPSG:32720' &&
    georefOutput.targetCrs === 'EPSG:4326' &&
    isExtentValid &&
    georefOutput.geoJsonUrl === '/data/amazon_unet_prediction.json' &&
    georefOutput.sentinel2RgbUrl === '/data/amazon_sentinel2_rgb.png' &&
    georefOutput.probabilityColormapUrl === '/data/amazon_unet_probability_colormap.png' &&
    georefOutput.binaryMaskUrl === '/data/amazon_unet_binary_mask.png' &&
    georefOutput.waterMaskUrl === '/data/amazon_water_mask.json'
  ) {
    console.log("✅ TEST 2 PASSED: Coordinate transformation to WGS84 and georeferencing verified.\n");
  } else {
    console.error("❌ TEST 2 FAILED: Georeferencing output mismatch.");
    allPassed = false;
  }

  // -------------------------------------------------------------------
  // TEST 3: Visual & Contextual Public Data Assets Integrity
  // -------------------------------------------------------------------
  console.log("--- TEST 3: Visual & Contextual Public Data Assets Integrity ---");
  const publicDataDir = path.join(projectRoot, 'public', 'data');
  const requiredFiles = [
    'amazon_sentinel2_rgb.png',
    'amazon_unet_probability_colormap.png',
    'amazon_unet_binary_mask.png',
    'amazon_unet_prediction.json',
    'amazon_water_mask.json',
    'amazon_target_grid_extent.json'
  ];

  let filesOk = true;
  for (const file of requiredFiles) {
    const fullPath = path.join(publicDataDir, file);
    const exists = fs.existsSync(fullPath);
    const size = exists ? fs.statSync(fullPath).size : 0;
    console.log(`Asset: ${file} | Exists: ${exists} | Size: ${(size / 1024).toFixed(1)} KB`);
    if (!exists || size === 0) {
      filesOk = false;
    }
  }

  if (filesOk) {
    console.log("✅ TEST 3 PASSED: All visual and contextual public data assets present and non-empty.\n");
  } else {
    console.error("❌ TEST 3 FAILED: One or more public data assets missing or empty.");
    allPassed = false;
  }

  // -------------------------------------------------------------------
  // TEST 4: Layer Mode Configuration & Separate Layer Contract
  // -------------------------------------------------------------------
  console.log("--- TEST 4: Layer Mode Configuration & Separate Layer Contract ---");
  const layerFile = path.join(projectRoot, 'src', 'cesium', 'unetPredictionLayer.ts');
  const layerCode = fs.readFileSync(layerFile, 'utf-8');

  const hasModes =
    layerCode.includes('SENTINEL2_RGB') &&
    layerCode.includes('PROBABILITY_HEATMAP') &&
    layerCode.includes('BINARY_MASK') &&
    layerCode.includes('QUALITY_CONTROL');

  const hasWaterSeparation =
    layerCode.includes('waterContextDataSource') &&
    layerCode.includes('CONTEXTUAL WATER MASK — ESA WorldCover 10m');

  const hasGroundClamping =
    layerCode.includes('Cesium.HeightReference.CLAMP_TO_GROUND');

  const hasModelLabel =
    layerCode.includes('MODEL PREDICTION');

  console.log(`Visualization modes present: ${hasModes}`);
  console.log(`Separate contextual water mask layer: ${hasWaterSeparation}`);
  console.log(`Terrain ground clamping enabled: ${hasGroundClamping}`);
  console.log(`Strict MODEL PREDICTION labeling: ${hasModelLabel}`);

  if (hasModes && hasWaterSeparation && hasGroundClamping && hasModelLabel) {
    console.log("✅ TEST 4 PASSED: Layer manager contract and strict layer separation verified.\n");
  } else {
    console.error("❌ TEST 4 FAILED: Layer manager contract violated.");
    allPassed = false;
  }

  // -------------------------------------------------------------------
  // TEST 5: Attribution & Quality Control Notice Integrity
  // -------------------------------------------------------------------
  console.log("--- TEST 5: Attribution & Quality Control Notice Integrity ---");
  console.log(`Provenance Label: "${georefOutput.provenanceLabel}"`);
  console.log(`Observation Source: "${georefOutput.source}"`);
  console.log(`QC Advisory Note: "${georefOutput.qualityControlNote?.slice(0, 100)}..."`);

  const hasStrictLabel = georefOutput.provenanceLabel === 'MODEL PREDICTION';
  const hasDateAttribution = georefOutput.source.includes('1 Oct 2026') || georefOutput.actualAcquisitionTime?.includes('2026-10-01');
  const hasDomainShiftExplanation =
    Boolean(georefOutput.qualityControlNote?.includes('domain shift')) &&
    Boolean(georefOutput.qualityControlNote?.includes('bare soil'));

  if (hasStrictLabel && hasDateAttribution && hasDomainShiftExplanation) {
    console.log("✅ TEST 5 PASSED: Attribution strictly verified as MODEL PREDICTION from 1 Oct 2026 with scientific domain-shift explanation.\n");
  } else {
    console.error("❌ TEST 5 FAILED: Attribution or quality control notice incomplete.");
    allPassed = false;
  }

  console.log("============================================================");
  if (allPassed) {
    console.log("ALL PHASE 3D VERIFICATION TESTS PASSED SUCCESSFULLY! (5/5)");
  } else {
    console.error("SOME PHASE 3D VERIFICATION TESTS FAILED!");
  }
  console.log("============================================================\n");

  return allPassed;
}

runPhase3DVerification().then((passed) => {
  if (!passed) process.exit(1);
});
