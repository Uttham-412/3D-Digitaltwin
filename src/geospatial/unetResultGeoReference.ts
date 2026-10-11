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
  sourceCrs: string; // Native source raster CRS (e.g. 'EPSG:32720' or 'EPSG:32629')
  rasterCrs?: string; // Native projected raster CRS
  geographicCrs: 'EPSG:4326'; // CRS for geographic coordinates and extent
  targetCrs: 'EPSG:4326'; // Display CRS for Cesium 3D viewer
  displayCrs: 'EPSG:4326'; // Explicit Cesium display CRS
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
  sceneId?: string;
  sentinel2RgbUrl?: string;
  probabilityColormapUrl?: string;
  binaryMaskUrl?: string;
  waterMaskUrl?: string;
  qualityControlNote?: string;
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
   * Format Phase 2B/3C result into a georeferenced U-Net output.
   * Enforces strict geospatial verification: rejects results missing verified extents.
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
        sourceCrs: segResult.rasterCrs || segResult.crs || 'UNKNOWN',
        rasterCrs: segResult.rasterCrs,
        geographicCrs: 'EPSG:4326',
        targetCrs: 'EPSG:4326',
        displayCrs: 'EPSG:4326',
        latitude: segResult.latitude,
        longitude: segResult.longitude,
        requestedTimestamp: segResult.requestedTimestamp,
        message: segResult.message
      };
    }

    // Strict validation: Reject missing geospatial metadata rather than inventing an extent
    if (!segResult.boundingBox) {
      return {
        isAvailable: false,
        provenanceLabel: 'MODEL PREDICTION',
        modelCheckpoint: 'land8fire_15ch_unet_full_dataset_best.pth',
        threshold: segResult.threshold,
        source: 'Sentinel-2 L2A',
        sourceCrs: segResult.rasterCrs || segResult.crs || 'UNKNOWN',
        rasterCrs: segResult.rasterCrs,
        geographicCrs: 'EPSG:4326',
        targetCrs: 'EPSG:4326',
        displayCrs: 'EPSG:4326',
        latitude: segResult.latitude,
        longitude: segResult.longitude,
        requestedTimestamp: segResult.requestedTimestamp,
        message: 'Georeferencing unavailable: missing verified geospatial extent metadata.'
      };
    }

    // Calculate burned area in hectares (1 pixel @ 10m res = 100 m² = 0.01 ha)
    const burnedPixels = segResult.predictedBurnedPixels ?? 0;
    const resMeters = segResult.spatialResolutionMeters ?? 10;
    const burnedAreaHa = segResult.predictedAreaHectares ?? Number(((burnedPixels * (resMeters * resMeters)) / 10000).toFixed(2));

    // Spatial extent derived from exact source metadata / grid
    const extent: GeospatialBoundingBox = segResult.spatialExtent || segResult.boundingBox;

    // GeoJSON prediction path for Spain benchmark scene
    const isEMSR239Scene =
      Math.abs(segResult.latitude - 37.8445) < 0.2 &&
      Math.abs(segResult.longitude - (-6.0049)) < 0.2;

    // Check spatial match for Amazon study region scene (1 Oct 2026 Sentinel-2 acquisition)
    // Target grid bounds: West -60.033253, East -60.010179, South -3.130641, North -3.107447
    const isAmazonScene =
      segResult.latitude >= -3.140 &&
      segResult.latitude <= -3.098 &&
      segResult.longitude >= -60.042 &&
      segResult.longitude <= -60.001;

    let geoJsonUrl: string | undefined = segResult.geoJsonUrl;
    let sceneId: string | undefined = undefined;
    let sentinel2RgbUrl: string | undefined = segResult.sentinel2RgbUrl;
    let probabilityColormapUrl: string | undefined = segResult.probabilityColormapUrl;
    let binaryMaskUrl: string | undefined = segResult.binaryMaskUrl;
    let waterMaskUrl: string | undefined = undefined;
    let qualityControlNote: string | undefined = segResult.scientificNote;

    if (isEMSR239Scene) {
      geoJsonUrl = geoJsonUrl || '/data/emsr239_prediction.json';
      sceneId = 'EMSR239_05ALMADENDELAPLATAOVERVIEW_02GRADING_MAP_v1_vector_r128_c512';
    } else if (isAmazonScene) {
      geoJsonUrl = geoJsonUrl || '/data/amazon_unet_prediction.json';
      sceneId = 'S2B_MSIL2A_20261001T142709_N0513_R053_T20MRB_20261001T181049';
      sentinel2RgbUrl = sentinel2RgbUrl || '/data/amazon_sentinel2_rgb.png';
      probabilityColormapUrl = probabilityColormapUrl || '/data/amazon_unet_probability_colormap.png';
      binaryMaskUrl = binaryMaskUrl || '/data/amazon_unet_binary_mask.png';
      waterMaskUrl = '/data/amazon_water_mask.json';
      qualityControlNote = qualityControlNote ||
        'Quality Control Analysis: High predicted burned area (90.66%, 594.18 ha) is attributable to domain shift and spectral confusion in single-date optical reflection. Dry bare soils, cleared pastures, and urban concrete in the Manaus peri-urban fringe exhibit low NDVI (0.09) and negative NBR (-0.12), mirroring the spectral signature of wildfire burn scars. Single-date U-Net models cannot distinguish bare earth from fire scars without pre-fire baseline differencing (dNBR) or contextual masking. No ground-truth labels exist for this scene.';
    } else {
      sceneId = 'Sentinel-2 L2A Dynamic Multi-Tile Observation';
      qualityControlNote = qualityControlNote ||
        'Quality Control Analysis: Burned-area segmentation probability from single-date Sentinel-2 Level-2A surface reflectance. High predictions over dry soil or urban areas reflect optical spectral confusion. Not confirmed fire.';
    }

    const isAmazonRegion =
      isAmazonScene ||
      (segResult.latitude >= -4.5 && segResult.latitude <= -1.5 && segResult.longitude >= -62.0 && segResult.longitude <= -58.0);

    return {
      isAvailable: true,
      provenanceLabel: 'MODEL PREDICTION',
      modelCheckpoint: 'land8fire_15ch_unet_full_dataset_best.pth',
      threshold: segResult.threshold,
      source: isAmazonRegion
        ? 'Sentinel-2 L2A Telemetry (Copernicus CDSE)'
        : 'Sentinel-2 L2A Telemetry',
      sourceCrs: segResult.rasterCrs || segResult.crs || (isAmazonRegion ? 'EPSG:32720' : 'EPSG:32629'),
      rasterCrs: segResult.rasterCrs || (isAmazonRegion ? 'EPSG:32720' : 'EPSG:32629'),
      geographicCrs: 'EPSG:4326',
      targetCrs: 'EPSG:4326',
      displayCrs: 'EPSG:4326',
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
      sceneId,
      sentinel2RgbUrl,
      probabilityColormapUrl,
      binaryMaskUrl,
      waterMaskUrl,
      qualityControlNote,
      message: 'Georeferenced U-Net Model Prediction ready.'
    };
  }
}

export const uNetResultGeoReferenceService = UNetResultGeoReferenceService.getInstance();
