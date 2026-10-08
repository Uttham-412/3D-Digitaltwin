/**
 * LAND8FIRE — OBJECTIVE 2: CESIUM FOREST CONDITION LAYER MANAGER
 *
 * Geospatial visualization layer manager for rendering validated Forest Condition data on the Cesium 3D Globe:
 * - Healthy Vegetation (#10B981)
 * - Dry Vegetation / Fuel (#F59E0B)
 * - Active Fire (#EF4444 — OBSERVED only)
 * - Burned Area (#991B1B — MODEL_PREDICTION vs GROUND_TRUTH)
 *
 * Architecture:
 * - Pure visualization layer. Receives external validated GeoJSON.
 * - DOES NOT generate, infer, or hard-code fake/synthetic spatial features.
 * - Maintains separate internal data sources for MODEL_PREDICTION and GROUND_TRUTH burned area.
 * - Integrates with Cesium's terrain ground clamping and requestRenderMode.
 */

import * as Cesium from 'cesium';
import {
  ForestConditionCategory,
  ForestConditionProvenance,
  INITIAL_FOREST_CONDITION_CLASSES
} from '../classification/forestConditionTypes';

export class ForestConditionLayerManager {
  private static instance: ForestConditionLayerManager | null = null;
  private viewer: Cesium.Viewer | null = null;

  // Separate DataSources for provenance separation and category visibility management
  private healthyDataSource: Cesium.GeoJsonDataSource | null = null;
  private dryDataSource: Cesium.GeoJsonDataSource | null = null;
  private activeFireDataSource: Cesium.GeoJsonDataSource | null = null;
  private burnedAreaPredictionDataSource: Cesium.GeoJsonDataSource | null = null;
  private burnedAreaGroundTruthDataSource: Cesium.GeoJsonDataSource | null = null;

  private categoryVisibility: Record<ForestConditionCategory, boolean> = {
    HEALTHY_VEGETATION: true,
    DRY_VEGETATION: true,
    ACTIVE_FIRE: true,
    BURNED_AREA: true
  };

  public static getInstance(): ForestConditionLayerManager {
    if (!ForestConditionLayerManager.instance) {
      ForestConditionLayerManager.instance = new ForestConditionLayerManager();
    }
    return ForestConditionLayerManager.instance;
  }

  /**
   * Bind manager to active Cesium Viewer instance.
   */
  public initialize(viewer: Cesium.Viewer): void {
    if (!viewer || viewer.isDestroyed()) return;
    this.viewer = viewer;
  }

  /**
   * Load validated Forest Condition GeoJSON FeatureCollection into Cesium 3D.
   * Filters and categorizes features into dedicated data sources for visualization.
   */
  public async loadClassificationGeoJSON(geoJson: any): Promise<void> {
    if (!this.viewer || this.viewer.isDestroyed()) {
      console.warn('[Land8Fire] Cesium viewer is not initialized for ForestConditionLayerManager.');
      return;
    }

    // Clear existing layers before loading new dataset
    this.clear();

    if (!geoJson || !Array.isArray(geoJson.features) || geoJson.features.length === 0) {
      console.log('[Land8Fire] No validated Forest Condition GeoJSON features supplied. Layer remains empty.');
      return;
    }

    // Separate features by category and provenance
    const healthyFeatures: any[] = [];
    const dryFeatures: any[] = [];
    const activeFireFeatures: any[] = [];
    const burnedPredictionFeatures: any[] = [];
    const burnedGroundTruthFeatures: any[] = [];

    geoJson.features.forEach((feature: any) => {
      const category: ForestConditionCategory = feature.properties?.category;
      const provenance: ForestConditionProvenance = feature.properties?.provenance;

      if (category === 'HEALTHY_VEGETATION') {
        healthyFeatures.push(feature);
      } else if (category === 'DRY_VEGETATION') {
        dryFeatures.push(feature);
      } else if (category === 'ACTIVE_FIRE') {
        // Active Fire is only loaded if explicitly present in validated input
        activeFireFeatures.push(feature);
      } else if (category === 'BURNED_AREA') {
        if (provenance === 'GROUND_TRUTH') {
          burnedGroundTruthFeatures.push(feature);
        } else {
          // Default burned area to MODEL_PREDICTION if ground truth is not explicitly flagged
          burnedPredictionFeatures.push(feature);
        }
      }
    });

    // Process each category subset into its dedicated Cesium GeoJsonDataSource
    if (healthyFeatures.length > 0) {
      this.healthyDataSource = await this.createCategoryDataSource(
        healthyFeatures,
        'HEALTHY_VEGETATION',
        'Healthy Vegetation Layer'
      );
    }

    if (dryFeatures.length > 0) {
      this.dryDataSource = await this.createCategoryDataSource(
        dryFeatures,
        'DRY_VEGETATION',
        'Dry Vegetation / Fuel Layer'
      );
    }

    if (activeFireFeatures.length > 0) {
      this.activeFireDataSource = await this.createCategoryDataSource(
        activeFireFeatures,
        'ACTIVE_FIRE',
        'Active Fire Observation Layer'
      );
    }

    if (burnedPredictionFeatures.length > 0) {
      this.burnedAreaPredictionDataSource = await this.createCategoryDataSource(
        burnedPredictionFeatures,
        'BURNED_AREA',
        'Burned Area (Land8Fire U-Net Model Prediction)',
        'MODEL_PREDICTION'
      );
    }

    if (burnedGroundTruthFeatures.length > 0) {
      this.burnedAreaGroundTruthDataSource = await this.createCategoryDataSource(
        burnedGroundTruthFeatures,
        'BURNED_AREA',
        'Burned Area (Copernicus EMS Ground Truth)',
        'GROUND_TRUTH'
      );
    }

    // Apply visibility rules to data sources
    this.updateDataSourcesVisibility();

    // Trigger Cesium scene render
    this.viewer.scene.requestRender();
    console.log('[Land8Fire] Forest Condition GeoJSON dataset successfully loaded into Cesium.');
  }

  /**
   * Alias for loadClassificationGeoJSON.
   */
  public async loadGeoJSON(geoJson: any): Promise<void> {
    return this.loadClassificationGeoJSON(geoJson);
  }

  /**
   * Internal helper to build and style a Cesium GeoJsonDataSource for a category subset.
   */
  private async createCategoryDataSource(
    features: any[],
    category: ForestConditionCategory,
    sourceName: string,
    forcedProvenance?: ForestConditionProvenance
  ): Promise<Cesium.GeoJsonDataSource> {
    const classDef = INITIAL_FOREST_CONDITION_CLASSES[category];
    const colorHex = classDef ? classDef.color : '#9CA3AF';

    const featureCollection = {
      type: 'FeatureCollection',
      features
    };

    const dataSource = await Cesium.GeoJsonDataSource.load(featureCollection, {
      stroke: Cesium.Color.fromCssColorString(colorHex),
      fill: Cesium.Color.fromCssColorString(colorHex).withAlpha(0.4),
      strokeWidth: 2,
      clampToGround: true
    });

    dataSource.name = sourceName;

    // Enhance entity descriptions with strict provenance metadata
    dataSource.entities.values.forEach((entity) => {
      const props = entity.properties ? entity.properties.getValue(Cesium.JulianDate.now()) : {};
      const provenance: ForestConditionProvenance =
        forcedProvenance || props.provenance || classDef.provenance || 'DERIVED';
      const verified = props.verified === true || props.verified === 'true';
      const confidence = props.confidence !== undefined ? props.confidence : classDef.confidence;
      const source = props.source || classDef.source || 'Unknown';
      const areaHectares = props.areaHectares;
      const percentage = props.percentage;

      entity.description = new Cesium.ConstantProperty(`
        <div style="font-family: Inter, sans-serif; padding: 12px; min-width: 220px;">
          <h4 style="color: ${colorHex}; margin: 0 0 8px 0; border-bottom: 1px solid ${colorHex}; padding-bottom: 4px;">
            ${props.displayName || classDef.displayName}
          </h4>
          <p style="margin: 4px 0;"><strong>Category:</strong> ${category}</p>
          <p style="margin: 4px 0;"><strong>Provenance:</strong> <span style="font-weight: bold; color: ${provenance === 'GROUND_TRUTH' ? '#10B981' : '#F59E0B'};">${provenance}</span></p>
          <p style="margin: 4px 0;"><strong>Verification Status:</strong> ${verified ? '✅ Verified Ground-Truth / Telemetry' : '⚠️ Unverified / Model Output'}</p>
          ${confidence !== undefined ? `<p style="margin: 4px 0;"><strong>Confidence:</strong> ${(Number(confidence) * 100).toFixed(1)}%</p>` : ''}
          ${areaHectares !== undefined ? `<p style="margin: 4px 0;"><strong>Area:</strong> ${areaHectares} ha</p>` : ''}
          ${percentage !== undefined ? `<p style="margin: 4px 0;"><strong>Coverage:</strong> ${percentage}%</p>` : ''}
          <p style="margin: 4px 0; font-size: 0.9em; color: #9CA3AF;"><strong>Source:</strong> ${source}</p>
        </div>
      `);
    });

    if (this.viewer && !this.viewer.isDestroyed()) {
      this.viewer.dataSources.add(dataSource);
    }

    return dataSource;
  }

  /**
   * Toggle visibility of a specific forest condition category.
   */
  public setCategoryVisible(category: ForestConditionCategory, visible: boolean): void {
    this.categoryVisibility[category] = visible;
    this.updateDataSourcesVisibility();
    if (this.viewer && !this.viewer.isDestroyed()) {
      this.viewer.scene.requestRender();
    }
  }

  /**
   * Set visibility for all categories simultaneously.
   */
  public setAllCategoriesVisible(visible: boolean): void {
    (Object.keys(this.categoryVisibility) as ForestConditionCategory[]).forEach((cat) => {
      this.categoryVisibility[cat] = visible;
    });
    this.updateDataSourcesVisibility();
    if (this.viewer && !this.viewer.isDestroyed()) {
      this.viewer.scene.requestRender();
    }
  }

  /**
   * Check if a specific category is visible.
   */
  public isCategoryVisible(category: ForestConditionCategory): boolean {
    return this.categoryVisibility[category] ?? false;
  }

  /**
   * Toggle burned area prediction layer specifically.
   */
  public setBurnedAreaPredictionVisibility(visible: boolean): void {
    if (this.burnedAreaPredictionDataSource) {
      this.burnedAreaPredictionDataSource.show = visible && this.categoryVisibility.BURNED_AREA;
    }
    if (this.viewer && !this.viewer.isDestroyed()) {
      this.viewer.scene.requestRender();
    }
  }

  /**
   * Toggle burned area ground truth layer specifically.
   */
  public setBurnedAreaGroundTruthVisibility(visible: boolean): void {
    if (this.burnedAreaGroundTruthDataSource) {
      this.burnedAreaGroundTruthDataSource.show = visible && this.categoryVisibility.BURNED_AREA;
    }
    if (this.viewer && !this.viewer.isDestroyed()) {
      this.viewer.scene.requestRender();
    }
  }

  /**
   * Update show properties across all internal data sources.
   */
  private updateDataSourcesVisibility(): void {
    if (this.healthyDataSource) {
      this.healthyDataSource.show = this.categoryVisibility.HEALTHY_VEGETATION;
    }
    if (this.dryDataSource) {
      this.dryDataSource.show = this.categoryVisibility.DRY_VEGETATION;
    }
    if (this.activeFireDataSource) {
      this.activeFireDataSource.show = this.categoryVisibility.ACTIVE_FIRE;
    }
    if (this.burnedAreaPredictionDataSource) {
      this.burnedAreaPredictionDataSource.show = this.categoryVisibility.BURNED_AREA;
    }
    if (this.burnedAreaGroundTruthDataSource) {
      this.burnedAreaGroundTruthDataSource.show = this.categoryVisibility.BURNED_AREA;
    }
  }

  /**
   * Remove all loaded forest condition data sources from Cesium.
   */
  public clear(): void {
    if (!this.viewer || this.viewer.isDestroyed()) return;

    if (this.healthyDataSource) {
      this.viewer.dataSources.remove(this.healthyDataSource, true);
      this.healthyDataSource = null;
    }
    if (this.dryDataSource) {
      this.viewer.dataSources.remove(this.dryDataSource, true);
      this.dryDataSource = null;
    }
    if (this.activeFireDataSource) {
      this.viewer.dataSources.remove(this.activeFireDataSource, true);
      this.activeFireDataSource = null;
    }
    if (this.burnedAreaPredictionDataSource) {
      this.viewer.dataSources.remove(this.burnedAreaPredictionDataSource, true);
      this.burnedAreaPredictionDataSource = null;
    }
    if (this.burnedAreaGroundTruthDataSource) {
      this.viewer.dataSources.remove(this.burnedAreaGroundTruthDataSource, true);
      this.burnedAreaGroundTruthDataSource = null;
    }

    this.viewer.scene.requestRender();
  }

  /**
   * Clean up data sources and unbind viewer.
   */
  public destroy(): void {
    this.clear();
    this.viewer = null;
  }

  public cleanup(): void {
    this.destroy();
  }
}
