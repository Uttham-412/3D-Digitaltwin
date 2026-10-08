/**
 * LAND8FIRE — GEOSPATIAL U-NET RESULT GEOREFERENCE SERVICE (PHASE 2C-A)
 *
 * Takes Phase 2B U-Net segmentation result and satellite observation metadata,
 * preserves CRS transformations, spatial resolution, and geographic extent,
 * and formats a georeferenced output explicitly labeled as "MODEL PREDICTION".
 */

import {
  GeospatialBoundingBox,
  SatellitePixelDimensions
} from '../services/satelliteObservationService';
import { UNetSegmentationResult } from '../services/unetPreprocessingBridge';

export interface GeoreferencedUNetOutput {
  isAvailable: boolean;
  provenanceLabel: 'MODEL PREDICTION';
  modelCheckpoint: 'land8fire_15ch_unet_full_dataset_best.pth';
  threshold: number; // 0.65
  source: string; // 'Sentinel-2 L2A Telemetry'
  sourceCrs: string; // e.g. 'EPSG:32629' or 'EPSG:4326'
  targetCrs: 'EPSG:4326';
  latitude: number;
  longitude: number;
  spatialExtent?: GeospatialBoundingBox;
  spatialResolutionMeters?: number;
  pixelDimensions?: SatellitePixelDimensions;
  predictedBurnedPixels?: number;
  totalPixels?: number;
  predictedBurnedPercentage?: number;
  predictedBurnedAreaHectares?: number;
  requestedTimestamp: string;
  actualAcquisitionTime?: string;
  geoJsonUrl?: string;
  message: string;
}

export class UNetResultGeoReferenceService {
  private static instance: UNetResultGeoReferenceService | null = null;

  private constructor() {}

  public static getInstance(): UNetResultGeoReferenceService {
    if (!UNetResultGeoReferenceService.instance) {
      UNetResultGeoReferenceService.instance = new UNetResultGeoReferenceService();
    }
    return UNetResultGeoReferenceService.instance;
  }

  /**
   * Format Phase 2B result into a georeferenced U-Net output.
   */
  public createGeoreferencedOutput(
    segResult: UNetSegmentationResult
  ): GeoreferencedUNetOutput {
    if (!segResult.available || segResult.status !== 'success') {
      return {
        isAvailable: false,
        provenanceLabel: 'MODEL PREDICTION',
        modelCheckpoint: 'land8fire_15ch_unet_full_dataset_best.pth',
        threshold: segResult.threshold,
        source: 'Sentinel-2 L2A',
        sourceCrs: segResult.crs || 'EPSG:4326',
        targetCrs: 'EPSG:4326',
        latitude: segResult.latitude,
        longitude: segResult.longitude,
        requestedTimestamp: segResult.requestedTimestamp,
        message: segResult.message
      };
    }

    // Calculate burned area in hectares (1 pixel @ 10m res = 100 m² = 0.01 ha)
    const burnedPixels = segResult.predictedBurnedPixels ?? 0;
    const resMeters = segResult.spatialResolutionMeters ?? 10;
    const burnedAreaHa = Number(((burnedPixels * (resMeters * resMeters)) / 10000).toFixed(2));

    // Spatial extent / bounding box
    const extent: GeospatialBoundingBox = segResult.boundingBox || {
      minLat: segResult.latitude - 0.015,
      maxLat: segResult.latitude + 0.015,
      minLon: segResult.longitude - 0.015,
      maxLon: segResult.longitude + 0.015
    };

    // GeoJSON prediction path for Spain benchmark scene
    const isEMSR239Scene =
      Math.abs(segResult.latitude - 37.8445) < 0.2 &&
      Math.abs(segResult.longitude - (-6.0049)) < 0.2;

    const geoJsonUrl = isEMSR239Scene ? '/data/emsr239_prediction.json' : undefined;

    return {
      isAvailable: true,
      provenanceLabel: 'MODEL PREDICTION',
      modelCheckpoint: 'land8fire_15ch_unet_full_dataset_best.pth',
      threshold: segResult.threshold,
      source: 'Sentinel-2 L2A Telemetry',
      sourceCrs: segResult.crs || 'EPSG:32629',
      targetCrs: 'EPSG:4326',
      latitude: segResult.latitude,
      longitude: segResult.longitude,
      spatialExtent: extent,
      spatialResolutionMeters: resMeters,
      pixelDimensions: segResult.pixelDimensions || { width: 256, height: 256 },
      predictedBurnedPixels: burnedPixels,
      totalPixels: segResult.totalPixels || 65536,
      predictedBurnedPercentage: segResult.predictedBurnedPercentage,
      predictedBurnedAreaHectares: burnedAreaHa,
      requestedTimestamp: segResult.requestedTimestamp,
      actualAcquisitionTime: segResult.actualAcquisitionTime,
      geoJsonUrl,
      message: 'Georeferenced U-Net Model Prediction ready.'
    };
  }
}

export const uNetResultGeoReferenceService = UNetResultGeoReferenceService.getInstance();
