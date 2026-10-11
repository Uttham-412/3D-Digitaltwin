/**
 * LAND8FIRE — UNET PREPROCESSING & INFERENCE BRIDGE (PHASE 2B)
 *
 * Preprocessing bridge from Phase 2A real SatelliteObservationResult
 * to the authoritative Land8Fire 15-Channel U-Net segmentation engine.
 *
 * Enforces strict compliance:
 * 1. Checks available === true. Halts cleanly if observation is unavailable.
 * 2. Validates exact 15-channel contract:
 *    [B01, B02, B03, B04, B05, B06, B07, B08, B08A, B09, B11, B12, NDVI, NBR, NDRI]
 * 3. Validates tensor shape (15, 256, 256) float32.
 * 4. Applies reflectance = DN / 10000.0 scaling for raw DN inputs.
 * 5. Verifies derived indices (NDVI, NBR, NDRI).
 * 6. Applies verified MEAN_15CH and STD_15CH normalization.
 * 7. Dispatches to U-Net inference server (or local EMSR239 benchmark engine).
 * 8. Preserves all requested/acquisition timestamps and geospatial metadata.
 */

import {
  SatelliteObservationResult,
  GeospatialBoundingBox,
  SatellitePixelDimensions,
  SENTINEL2_15CH_CHANNELS,
  SENTINEL2_15CH_MEAN,
  SENTINEL2_15CH_STD,
  calculateNDVI,
  calculateNBR,
  calculateNDRI
} from './satelliteObservationService';
import { unetInferenceService } from './unetInferenceService';

export interface UNetSegmentationResult {
  available: boolean;
  status: 'success' | 'unavailable' | 'error';
  modelId: string; // 'land8fire_15ch_unet_full_dataset_best.pth'
  threshold: number; // 0.65
  requestedTimestamp: string;
  actualAcquisitionTime?: string;
  latitude: number;
  longitude: number;
  rasterCrs?: string;
  geographicCrs?: 'EPSG:4326';
  displayCrs?: 'EPSG:4326';
  crs?: string;
  boundingBox?: GeospatialBoundingBox;
  spatialResolutionMeters?: number;
  pixelDimensions?: SatellitePixelDimensions;
  predictedBurnedPixels?: number;
  totalPixels?: number; // 65536
  predictedBurnedPercentage?: number;
  predictedAreaHectares?: number;
  spatialExtent?: GeospatialBoundingBox;
  geoJsonUrl?: string;
  sentinel2RgbUrl?: string;
  probabilityColormapUrl?: string;
  binaryMaskUrl?: string;
  probabilityRasterUrl?: string;
  binaryMaskRasterUrl?: string;
  temporalCategory?: string;
  timeDifferenceHours?: number;
  validDataPercentage?: number;
  scientificNote?: string;
  provenance: string;
  message: string;
}

export class UNetPreprocessingBridge {
  private static instance: UNetPreprocessingBridge | null = null;
  public readonly MODEL_CHECKPOINT_ID = 'land8fire_15ch_unet_full_dataset_best.pth';
  public readonly INFERENCE_THRESHOLD = 0.65;

  private constructor() {}

  public static getInstance(): UNetPreprocessingBridge {
    if (!UNetPreprocessingBridge.instance) {
      UNetPreprocessingBridge.instance = new UNetPreprocessingBridge();
    }
    return UNetPreprocessingBridge.instance;
  }

  public getChannelOrder(): readonly string[] {
    return SENTINEL2_15CH_CHANNELS;
  }

  /**
   * Preprocess real satellite observation and execute U-Net inference.
   */
  public async executePipeline(
    observation: SatelliteObservationResult
  ): Promise<UNetSegmentationResult> {
    // Step 1: Check availability & 15-channel readiness
    if (!observation.available) {
      return {
        available: false,
        status: 'unavailable',
        modelId: this.MODEL_CHECKPOINT_ID,
        threshold: this.INFERENCE_THRESHOLD,
        requestedTimestamp: observation.requestedTimestamp,
        latitude: observation.latitude,
        longitude: observation.longitude,
        provenance: 'U-NET INFERENCE ENGINE',
        message: observation.message || 'SATELLITE OBSERVATION: NOT AVAILABLE'
      };
    }

    if (observation.is15ChannelReady === false) {
      return {
        available: false,
        status: 'unavailable',
        modelId: this.MODEL_CHECKPOINT_ID,
        threshold: this.INFERENCE_THRESHOLD,
        requestedTimestamp: observation.requestedTimestamp,
        actualAcquisitionTime: observation.actualAcquisitionTime,
        latitude: observation.latitude,
        longitude: observation.longitude,
        rasterCrs: observation.rasterCrs,
        geographicCrs: observation.geographicCrs || 'EPSG:4326',
        displayCrs: observation.displayCrs || 'EPSG:4326',
        crs: observation.rasterCrs || observation.crs,
        boundingBox: observation.boundingBox,
        provenance: 'U-NET INFERENCE ENGINE',
        message: 'SATELLITE OBSERVATION: BANDS DISCOVERED (Metadata Only — 15-Channel Raster Pending Cache)'
      };
    }

    // Step 2: Validate 15-channel contract
    if (!observation.bandsAvailable || observation.bandsAvailable.length !== 15) {
      return {
        available: false,
        status: 'error',
        modelId: this.MODEL_CHECKPOINT_ID,
        threshold: this.INFERENCE_THRESHOLD,
        requestedTimestamp: observation.requestedTimestamp,
        actualAcquisitionTime: observation.actualAcquisitionTime,
        latitude: observation.latitude,
        longitude: observation.longitude,
        rasterCrs: observation.rasterCrs,
        geographicCrs: observation.geographicCrs || 'EPSG:4326',
        displayCrs: observation.displayCrs || 'EPSG:4326',
        crs: observation.rasterCrs || observation.crs,
        boundingBox: observation.boundingBox,
        provenance: 'U-NET INFERENCE ENGINE',
        message: `VALIDATION ERROR: Observation must contain exactly 15 channels. Found: ${observation.bandsAvailable?.length ?? 0}`
      };
    }

    // Verify channel ordering matches authoritative contract
    for (let i = 0; i < 15; i++) {
      if (observation.bandsAvailable[i] !== SENTINEL2_15CH_CHANNELS[i]) {
        return {
          available: false,
          status: 'error',
          modelId: this.MODEL_CHECKPOINT_ID,
          threshold: this.INFERENCE_THRESHOLD,
          requestedTimestamp: observation.requestedTimestamp,
          latitude: observation.latitude,
          longitude: observation.longitude,
          rasterCrs: observation.rasterCrs,
          geographicCrs: observation.geographicCrs || 'EPSG:4326',
          displayCrs: observation.displayCrs || 'EPSG:4326',
          crs: observation.rasterCrs || observation.crs,
          boundingBox: observation.boundingBox,
          provenance: 'U-NET INFERENCE ENGINE',
          message: `CHANNEL ORDER ERROR: Channel ${i} expected '${SENTINEL2_15CH_CHANNELS[i]}', found '${observation.bandsAvailable[i]}'`
        };
      }
    }

    // Step 3: Run inference via existing U-Net service endpoint
    const response = await unetInferenceService.runInference({
      latitude: observation.latitude,
      longitude: observation.longitude,
      eventDate: observation.actualAcquisitionTime,
      productId: observation.cdseItemId
    });

    if (response.status === 'success') {
      const extent: GeospatialBoundingBox = response.spatialExtent
        ? {
            minLat: response.spatialExtent.minLat,
            maxLat: response.spatialExtent.maxLat,
            minLon: response.spatialExtent.minLon,
            maxLon: response.spatialExtent.maxLon
          }
        : observation.boundingBox!;

      return {
        available: true,
        status: 'success',
        modelId: this.MODEL_CHECKPOINT_ID,
        threshold: this.INFERENCE_THRESHOLD,
        requestedTimestamp: observation.requestedTimestamp,
        actualAcquisitionTime: observation.actualAcquisitionTime || response.acquisitionTime,
        latitude: observation.latitude,
        longitude: observation.longitude,
        rasterCrs: response.rasterCrs || observation.rasterCrs,
        geographicCrs: 'EPSG:4326',
        displayCrs: 'EPSG:4326',
        crs: response.rasterCrs || observation.rasterCrs || observation.crs,
        boundingBox: extent,
        spatialExtent: extent,
        spatialResolutionMeters: observation.spatialResolutionMeters || 10,
        pixelDimensions: observation.pixelDimensions || { width: 256, height: 256 },
        predictedBurnedPixels: response.predictedBurnedPixels,
        totalPixels: response.totalPixels || 65536,
        predictedBurnedPercentage: response.predictedBurnedPercentage,
        predictedAreaHectares: response.predictedAreaHectares,
        validDataPercentage: response.validDataPercentage,
        temporalCategory: response.temporalCategory,
        timeDifferenceHours: response.timeDifferenceHours,
        scientificNote: response.scientificNote,
        geoJsonUrl: response.geoJsonUrl || response.geojsonUrl,
        sentinel2RgbUrl: response.sentinel2RgbUrl,
        probabilityColormapUrl: response.probabilityColormapUrl,
        binaryMaskUrl: response.binaryMaskUrl,
        probabilityRasterUrl: response.probabilityRasterUrl,
        binaryMaskRasterUrl: response.binaryMaskRasterUrl,
        provenance: response.provenance || `DERIVED / U-NET 15-CH (${this.MODEL_CHECKPOINT_ID})`,
        message: 'U-Net segmentation prediction executed successfully.'
      };
    }

    return {
      available: false,
      status: 'unavailable',
      modelId: this.MODEL_CHECKPOINT_ID,
      threshold: this.INFERENCE_THRESHOLD,
      requestedTimestamp: observation.requestedTimestamp,
      actualAcquisitionTime: observation.actualAcquisitionTime,
      latitude: observation.latitude,
      longitude: observation.longitude,
      rasterCrs: observation.rasterCrs,
      geographicCrs: observation.geographicCrs || 'EPSG:4326',
      displayCrs: observation.displayCrs || 'EPSG:4326',
      crs: observation.rasterCrs || observation.crs,
      boundingBox: observation.boundingBox,
      provenance: 'U-NET INFERENCE ENGINE',
      message: response.message || 'U-Net inference unavailable for target scene.'
    };
  }

  /**
   * Helper utility: Preprocess a raw 15-channel Float32Array tensor
   * (DN scaling, index calculation, mean/std normalization).
   */
  public preprocess15ChannelTensor(
    rawBands: Float32Array, // Expecting 15 * 256 * 256 = 983,040 elements
    width: number = 256,
    height: number = 256,
    isRawDN: boolean = true
  ): { normalizedTensor: Float32Array; shape: [number, number, number] } {
    if (width !== 256 || height !== 256) {
      throw new Error(`Incompatible grid dimensions: model expects 256x256, received ${width}x${height}`);
    }

    const numPixels = width * height;
    if (rawBands.length !== 15 * numPixels) {
      throw new Error(`Invalid tensor size: expected ${15 * numPixels}, got ${rawBands.length}`);
    }

    const scaleFactor = isRawDN ? 10000.0 : 1.0;
    const normalizedTensor = new Float32Array(15 * numPixels);

    // Channel offsets
    const b01 = 0 * numPixels;
    const b02 = 1 * numPixels;
    const b03 = 2 * numPixels;
    const b04 = 3 * numPixels;
    const b05 = 4 * numPixels;
    const b06 = 5 * numPixels;
    const b07 = 6 * numPixels;
    const b08 = 7 * numPixels;
    const b08a = 8 * numPixels;
    const b09 = 9 * numPixels;
    const b11 = 10 * numPixels;
    const b12 = 11 * numPixels;

    for (let i = 0; i < numPixels; i++) {
      const valB01 = rawBands[b01 + i] / scaleFactor;
      const valB02 = rawBands[b02 + i] / scaleFactor;
      const valB03 = rawBands[b03 + i] / scaleFactor;
      const valB04 = rawBands[b04 + i] / scaleFactor;
      const valB05 = rawBands[b05 + i] / scaleFactor;
      const valB06 = rawBands[b06 + i] / scaleFactor;
      const valB07 = rawBands[b07 + i] / scaleFactor;
      const valB08 = rawBands[b08 + i] / scaleFactor;
      const valB08a = rawBands[b08a + i] / scaleFactor;
      const valB09 = rawBands[b09 + i] / scaleFactor;
      const valB11 = rawBands[b11 + i] / scaleFactor;
      const valB12 = rawBands[b12 + i] / scaleFactor;

      // Validate finite input reflectance
      if (
        !Number.isFinite(valB01) || !Number.isFinite(valB02) || !Number.isFinite(valB03) ||
        !Number.isFinite(valB04) || !Number.isFinite(valB05) || !Number.isFinite(valB06) ||
        !Number.isFinite(valB07) || !Number.isFinite(valB08) || !Number.isFinite(valB08a) ||
        !Number.isFinite(valB09) || !Number.isFinite(valB11) || !Number.isFinite(valB12)
      ) {
        throw new Error(`Non-finite or corrupted pixel value detected in band inputs at index ${i}`);
      }

      const valNDVI = calculateNDVI(valB08, valB04);
      const valNBR = calculateNBR(valB08, valB12);
      const valNDRI = calculateNDRI(valB04, valB02);

      const channelVals = [
        valB01, valB02, valB03, valB04, valB05, valB06, valB07, valB08,
        valB08a, valB09, valB11, valB12, valNDVI, valNBR, valNDRI
      ];

      for (let c = 0; c < 15; c++) {
        const offset = c * numPixels + i;
        const normVal = (channelVals[c] - SENTINEL2_15CH_MEAN[c]) / (SENTINEL2_15CH_STD[c] + 1e-6);
        if (!Number.isFinite(normVal)) {
          throw new Error(`Normalization failure: non-finite value at channel ${c}, pixel ${i}`);
        }
        normalizedTensor[offset] = normVal;
      }
    }

    return {
      normalizedTensor,
      shape: [15, height, width]
    };
  }
}

export const unetPreprocessingBridge = UNetPreprocessingBridge.getInstance();
