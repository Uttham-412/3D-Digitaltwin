/**
 * LAND8FIRE — CESIUM U-NET PREDICTION & QUALITY CONTROL LAYER MANAGER (PHASE 2C & PHASE 3D)
 *
 * Dedicated Cesium layer manager for georeferenced U-Net AI model predictions,
 * optical Sentinel-2 observations, continuous probability colormaps, binary masks,
 * and contextual land-cover / water masks.
 *
 * Strict Compliance:
 * - U-Net layer explicitly identified as "MODEL PREDICTION — Sentinel-2 L2A (1 Oct 2026)"
 * - NEVER labeled as "confirmed active fire" or "ground truth"
 * - Raw model output (probability raster & binary mask) is strictly preserved and never silently rewritten
 * - Reliable water/land-cover masks rendered as a SEPARATE contextual layer
 * - Fully transforms projected EPSG:32720 rasters into geographic WGS84 coordinates clamped to 3D terrain
 */

import * as Cesium from 'cesium';
import { GeoreferencedUNetOutput } from '../geospatial/unetResultGeoReference';

export type UNetVisualizationMode =
  | 'SENTINEL2_RGB'
  | 'PROBABILITY_HEATMAP'
  | 'BINARY_MASK'
  | 'QUALITY_CONTROL'
  | 'ALL_LAYERS';

export class UNetPredictionLayerManager {
  private static instance: UNetPredictionLayerManager | null = null;

  private predictionDataSource: Cesium.GeoJsonDataSource | null = null;
  private groundTruthDataSource: Cesium.GeoJsonDataSource | null = null;
  private waterContextDataSource: Cesium.GeoJsonDataSource | null = null;

  private boundaryEntity: Cesium.Entity | null = null;
  private sentinel2RgbEntity: Cesium.Entity | null = null;
  private probabilityHeatmapEntity: Cesium.Entity | null = null;
  private binaryMaskEntity: Cesium.Entity | null = null;

  private currentGeorefOutput: GeoreferencedUNetOutput | null = null;
  private currentMode: UNetVisualizationMode = 'QUALITY_CONTROL';
  private showPredictionOnMap: boolean = false;

  private constructor() {}

  public static getInstance(): UNetPredictionLayerManager {
    if (!UNetPredictionLayerManager.instance) {
      UNetPredictionLayerManager.instance = new UNetPredictionLayerManager();
    }
    return UNetPredictionLayerManager.instance;
  }

  /**
   * Load U-Net Model Prediction, Sentinel-2 Optical RGB, Probability Heatmap,
   * Binary Mask, and Contextual Water vectors into Cesium 3D map.
   * By default showPredictionOnMap is false to avoid obscuring the fire simulation.
   */
  public async updateLayers(
    viewer: Cesium.Viewer,
    georefOutput: GeoreferencedUNetOutput,
    showGroundTruth: boolean = true,
    initialMode: UNetVisualizationMode = 'QUALITY_CONTROL',
    showPredictionOnMap: boolean = false
  ): Promise<void> {
    if (!viewer || viewer.isDestroyed()) return;

    this.clearLayers(viewer);
    this.currentGeorefOutput = georefOutput;
    this.currentMode = initialMode;
    this.showPredictionOnMap = showPredictionOnMap;

    // If satellite observation / U-Net result is unavailable, do NOT load prediction layer
    if (!georefOutput.isAvailable) {
      console.log('[Land8Fire Cesium] Satellite observation unavailable. Model prediction layer hidden.');
      return;
    }

    try {
      const extent = georefOutput.spatialExtent;
      const rect = extent
        ? Cesium.Rectangle.fromDegrees(extent.minLon, extent.minLat, extent.maxLon, extent.maxLat)
        : null;

      // 1. Load True-Color Sentinel-2 Optical RGB Layer (Clamped to Ground)
      if (georefOutput.sentinel2RgbUrl && rect) {
        this.sentinel2RgbEntity = viewer.entities.add({
          name: 'SENTINEL-2 OPTICAL RGB OBSERVATION (1 OCT 2026)',
          rectangle: {
            coordinates: rect,
            material: new Cesium.ImageMaterialProperty({
              image: georefOutput.sentinel2RgbUrl,
              transparent: false
            }),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
          }
        });
      }

      // 2. Load Unmodified U-Net Probability Heatmap Colormap Layer (Clamped to Ground)
      if (georefOutput.probabilityColormapUrl && rect) {
        this.probabilityHeatmapEntity = viewer.entities.add({
          name: 'UNET BURN PROBABILITY HEATMAP (0.0 - 1.0)',
          rectangle: {
            coordinates: rect,
            material: new Cesium.ImageMaterialProperty({
              image: georefOutput.probabilityColormapUrl,
              transparent: true
            }),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
          }
        });
      }

      // 3. Load Unmodified Binary Prediction Mask Raster Layer (Clamped to Ground)
      if (georefOutput.binaryMaskUrl && rect) {
        this.binaryMaskEntity = viewer.entities.add({
          name: 'UNET BINARY PREDICTION MASK (THRESHOLD >= 0.65)',
          rectangle: {
            coordinates: rect,
            material: new Cesium.ImageMaterialProperty({
              image: georefOutput.binaryMaskUrl,
              transparent: true
            }),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
          }
        });
      }

      // 4. Load U-Net Model Prediction GeoJSON Polygons (Clamped to Ground)
      if (georefOutput.geoJsonUrl) {
        this.predictionDataSource = await Cesium.GeoJsonDataSource.load(georefOutput.geoJsonUrl, {
          stroke: Cesium.Color.fromCssColorString('#EF4444'),
          fill: Cesium.Color.fromCssColorString('#EF4444').withAlpha(0.4),
          strokeWidth: 2,
          clampToGround: true
        });
        this.predictionDataSource.name = `MODEL PREDICTION — ${georefOutput.modelCheckpoint}`;
        viewer.dataSources.add(this.predictionDataSource);
      }

      // 5. Load Contextual Water Mask Layer (Separate Contextual Layer — Does NOT modify prediction)
      if (georefOutput.waterMaskUrl) {
        try {
          this.waterContextDataSource = await Cesium.GeoJsonDataSource.load(georefOutput.waterMaskUrl, {
            stroke: Cesium.Color.fromCssColorString('#00E5FF'),
            fill: Cesium.Color.fromCssColorString('#0284C7').withAlpha(0.28),
            strokeWidth: 1.5,
            clampToGround: true
          });
          this.waterContextDataSource.name = 'CONTEXTUAL WATER MASK — ESA WorldCover 10m';
          viewer.dataSources.add(this.waterContextDataSource);
        } catch (waterErr) {
          console.warn('[Land8Fire Cesium] Contextual water mask failed to load:', waterErr);
        }
      }

      // 6. Load Ground Truth GeoJSON Layer (if scene matches EMSR239 benchmark)
      const isEMSR239Benchmark =
        Math.abs(georefOutput.latitude - 37.8445) < 0.2 &&
        Math.abs(georefOutput.longitude - (-6.0049)) < 0.2;

      if (isEMSR239Benchmark && showGroundTruth) {
        this.groundTruthDataSource = await Cesium.GeoJsonDataSource.load('/data/emsr239_ground_truth.json', {
          stroke: Cesium.Color.fromCssColorString('#10B981'),
          fill: Cesium.Color.fromCssColorString('#10B981').withAlpha(0.35),
          strokeWidth: 2,
          clampToGround: true
        });
        this.groundTruthDataSource.name = 'GROUND TRUTH — EMSR239 Delimitation';
        viewer.dataSources.add(this.groundTruthDataSource);
      }

      // 7. Add Target Grid Scene Extent Boundary Rectangle
      if (rect) {
        this.boundaryEntity = viewer.entities.add({
          name: 'SENTINEL-2 TILE BOUNDARY (MODEL PREDICTION)',
          rectangle: {
            coordinates: rect,
            material: Cesium.Color.TRANSPARENT,
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString('#00E5FF'),
            outlineWidth: 3,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
          }
        });
      }

      // Apply initial visualization mode
      this.applyVisualizationMode(this.currentMode);

      viewer.scene.requestRender();
      console.log(`[Land8Fire Cesium] U-Net Model Prediction and QC layers loaded successfully into Cesium.`);
    } catch (err) {
      console.error('[Land8Fire Cesium] Error rendering U-Net prediction layer:', err);
    }
  }

  /**
   * Set and apply visualization mode across all raster, vector, and contextual layers.
   */
  public setVisualizationMode(mode: UNetVisualizationMode): void {
    this.currentMode = mode;
    this.applyVisualizationMode(mode);
  }

  private applyVisualizationMode(mode: UNetVisualizationMode): void {
    if (!this.showPredictionOnMap) {
      if (this.sentinel2RgbEntity) this.sentinel2RgbEntity.show = false;
      if (this.probabilityHeatmapEntity) this.probabilityHeatmapEntity.show = false;
      if (this.binaryMaskEntity) this.binaryMaskEntity.show = false;
      if (this.predictionDataSource) this.predictionDataSource.show = false;
      if (this.waterContextDataSource) this.waterContextDataSource.show = false;
      if (this.boundaryEntity) this.boundaryEntity.show = false;
      return;
    }

    if (this.boundaryEntity) this.boundaryEntity.show = true;
    switch (mode) {
      case 'SENTINEL2_RGB':
        // Show true-color optical Sentinel-2 scene only
        if (this.sentinel2RgbEntity) this.sentinel2RgbEntity.show = true;
        if (this.probabilityHeatmapEntity) this.probabilityHeatmapEntity.show = false;
        if (this.binaryMaskEntity) this.binaryMaskEntity.show = false;
        if (this.predictionDataSource) this.predictionDataSource.show = false;
        if (this.waterContextDataSource) this.waterContextDataSource.show = false;
        break;

      case 'PROBABILITY_HEATMAP':
        // Show continuous unadulterated probability heatmap
        if (this.sentinel2RgbEntity) this.sentinel2RgbEntity.show = false;
        if (this.probabilityHeatmapEntity) this.probabilityHeatmapEntity.show = true;
        if (this.binaryMaskEntity) this.binaryMaskEntity.show = false;
        if (this.predictionDataSource) this.predictionDataSource.show = false;
        if (this.waterContextDataSource) this.waterContextDataSource.show = false;
        break;

      case 'BINARY_MASK':
        // Show raw binary prediction mask (raster or vector)
        if (this.sentinel2RgbEntity) this.sentinel2RgbEntity.show = false;
        if (this.probabilityHeatmapEntity) this.probabilityHeatmapEntity.show = false;
        if (this.binaryMaskEntity) this.binaryMaskEntity.show = true;
        if (this.predictionDataSource) this.predictionDataSource.show = true;
        if (this.waterContextDataSource) this.waterContextDataSource.show = false;
        break;

      case 'QUALITY_CONTROL':
        // Quality Control view: Sentinel-2 RGB + Binary prediction + Water contextual boundary
        if (this.sentinel2RgbEntity) this.sentinel2RgbEntity.show = true;
        if (this.probabilityHeatmapEntity) this.probabilityHeatmapEntity.show = false;
        if (this.binaryMaskEntity) this.binaryMaskEntity.show = true;
        if (this.predictionDataSource) this.predictionDataSource.show = true;
        if (this.waterContextDataSource) this.waterContextDataSource.show = true;
        break;

      case 'ALL_LAYERS':
      default:
        // Everything visible
        if (this.sentinel2RgbEntity) this.sentinel2RgbEntity.show = true;
        if (this.probabilityHeatmapEntity) this.probabilityHeatmapEntity.show = true;
        if (this.binaryMaskEntity) this.binaryMaskEntity.show = true;
        if (this.predictionDataSource) this.predictionDataSource.show = true;
        if (this.waterContextDataSource) this.waterContextDataSource.show = true;
        break;
    }
  }

  public getVisualizationMode(): UNetVisualizationMode {
    return this.currentMode;
  }

  public setPredictionOnMap(visible: boolean): void {
    this.showPredictionOnMap = visible;
    this.applyVisualizationMode(this.currentMode);
  }

  public isPredictionOnMap(): boolean {
    return this.showPredictionOnMap;
  }

  public setPredictionVisibility(visible: boolean): void {
    this.showPredictionOnMap = visible;
    this.applyVisualizationMode(this.currentMode);
  }

  public setProbabilityVisibility(visible: boolean): void {
    if (this.probabilityHeatmapEntity) {
      this.probabilityHeatmapEntity.show = visible;
    }
  }

  public setSentinel2RgbVisibility(visible: boolean): void {
    if (this.sentinel2RgbEntity) {
      this.sentinel2RgbEntity.show = visible;
    }
  }

  public setWaterContextVisibility(visible: boolean): void {
    if (this.waterContextDataSource) {
      this.waterContextDataSource.show = visible;
    }
  }

  public setGroundTruthVisibility(visible: boolean): void {
    if (this.groundTruthDataSource) {
      this.groundTruthDataSource.show = visible;
    }
  }

  public setBoundaryVisibility(visible: boolean): void {
    if (this.boundaryEntity) {
      this.boundaryEntity.show = visible;
    }
  }

  public clearLayers(viewer: Cesium.Viewer): void {
    if (!viewer || viewer.isDestroyed()) return;

    if (this.predictionDataSource) {
      viewer.dataSources.remove(this.predictionDataSource, true);
      this.predictionDataSource = null;
    }
    if (this.groundTruthDataSource) {
      viewer.dataSources.remove(this.groundTruthDataSource, true);
      this.groundTruthDataSource = null;
    }
    if (this.waterContextDataSource) {
      viewer.dataSources.remove(this.waterContextDataSource, true);
      this.waterContextDataSource = null;
    }
    if (this.boundaryEntity) {
      viewer.entities.remove(this.boundaryEntity);
      this.boundaryEntity = null;
    }
    if (this.sentinel2RgbEntity) {
      viewer.entities.remove(this.sentinel2RgbEntity);
      this.sentinel2RgbEntity = null;
    }
    if (this.probabilityHeatmapEntity) {
      viewer.entities.remove(this.probabilityHeatmapEntity);
      this.probabilityHeatmapEntity = null;
    }
    if (this.binaryMaskEntity) {
      viewer.entities.remove(this.binaryMaskEntity);
      this.binaryMaskEntity = null;
    }
    this.currentGeorefOutput = null;
  }

  public getCurrentOutput(): GeoreferencedUNetOutput | null {
    return this.currentGeorefOutput;
  }
}

export const uNetPredictionLayerManager = UNetPredictionLayerManager.getInstance();
