/**
 * LAND8FIRE — CESIUM U-NET PREDICTION & GROUND TRUTH LAYER MANAGER (PHASE 2C-B & 2C-C)
 *
 * Dedicated Cesium layer manager for georeferenced U-Net AI model predictions
 * and ground truth vectors.
 *
 * Strict Compliance:
 * - U-Net layer explicitly identified as "MODEL PREDICTION"
 * - Ground Truth layer explicitly identified as "GROUND TRUTH"
 * - Keeps prediction and ground truth completely separate
 * - Does not show predictions when satellite observation is unavailable
 */

import * as Cesium from 'cesium';
import { GeoreferencedUNetOutput } from '../geospatial/unetResultGeoReference';

export class UNetPredictionLayerManager {
  private static instance: UNetPredictionLayerManager | null = null;

  private predictionDataSource: Cesium.GeoJsonDataSource | null = null;
  private groundTruthDataSource: Cesium.GeoJsonDataSource | null = null;
  private boundaryEntity: Cesium.Entity | null = null;
  private currentGeorefOutput: GeoreferencedUNetOutput | null = null;

  private constructor() {}

  public static getInstance(): UNetPredictionLayerManager {
    if (!UNetPredictionLayerManager.instance) {
      UNetPredictionLayerManager.instance = new UNetPredictionLayerManager();
    }
    return UNetPredictionLayerManager.instance;
  }

  /**
   * Load U-Net Model Prediction & Ground Truth vectors into Cesium 3D map.
   */
  public async updateLayers(
    viewer: Cesium.Viewer,
    georefOutput: GeoreferencedUNetOutput,
    showGroundTruth: boolean = true
  ): Promise<void> {
    if (!viewer || viewer.isDestroyed()) return;

    this.clearLayers(viewer);
    this.currentGeorefOutput = georefOutput;

    // If satellite observation / U-Net result is unavailable, do NOT load prediction layer
    if (!georefOutput.isAvailable || !georefOutput.geoJsonUrl) {
      console.log('[Land8Fire Cesium] Satellite observation unavailable. Model prediction layer hidden.');
      return;
    }

    try {
      // 1. Load U-Net Model Prediction GeoJSON Layer
      this.predictionDataSource = await Cesium.GeoJsonDataSource.load(georefOutput.geoJsonUrl, {
        stroke: Cesium.Color.fromCssColorString('#EF4444'),
        fill: Cesium.Color.fromCssColorString('#EF4444').withAlpha(0.45),
        strokeWidth: 2,
        clampToGround: true
      });
      this.predictionDataSource.name = `MODEL PREDICTION — ${georefOutput.modelCheckpoint}`;
      viewer.dataSources.add(this.predictionDataSource);

      // 2. Load Ground Truth GeoJSON Layer (if scene matches EMSR239 benchmark)
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

      // 3. Add Scene Extent Boundary Rectangle
      if (georefOutput.spatialExtent) {
        const { minLat, maxLat, minLon, maxLon } = georefOutput.spatialExtent;
        this.boundaryEntity = viewer.entities.add({
          name: 'SENTINEL-2 TILE BOUNDARY (MODEL PREDICTION)',
          rectangle: {
            coordinates: Cesium.Rectangle.fromDegrees(minLon, minLat, maxLon, maxLat),
            material: Cesium.Color.TRANSPARENT,
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString('#00E5FF'),
            outlineWidth: 3,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
          }
        });
      }

      viewer.scene.requestRender();
      console.log(`[Land8Fire Cesium] U-Net Model Prediction loaded successfully into Cesium.`);
    } catch (err) {
      console.error('[Land8Fire Cesium] Error rendering U-Net prediction layer:', err);
    }
  }

  public setPredictionVisibility(visible: boolean): void {
    if (this.predictionDataSource) {
      this.predictionDataSource.show = visible;
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
    if (this.boundaryEntity) {
      viewer.entities.remove(this.boundaryEntity);
      this.boundaryEntity = null;
    }
    this.currentGeorefOutput = null;
  }

  public getCurrentOutput(): GeoreferencedUNetOutput | null {
    return this.currentGeorefOutput;
  }
}

export const uNetPredictionLayerManager = UNetPredictionLayerManager.getInstance();
