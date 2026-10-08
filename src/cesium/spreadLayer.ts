/**
 * LAND8FIRE — OBJECTIVE 2: CESIUM FIRE-SPREAD LAYER MANAGER
 *
 * Renders multi-ring dynamic fire-front polygon geometry on Cesium 3D Globe:
 * - Active Perimeter Polyline (Outer boundary contour, #EF4444)
 * - Hot Active Combustion Zone (Concentric ring, #F97316 fill with 0.45 alpha)
 * - Burned Interior Core Region (Dark charcoal #374151 fill with 0.55 alpha)
 * - All polygons clamped to Cesium 3D World Terrain DEM.
 * - Explicitly labeled as "EXPERIMENTAL FIRE-SPREAD SIMULATION".
 */

import * as Cesium from 'cesium';
import { SpreadTimestepResult } from '../simulation/fireScenarioTypes';

export class SpreadLayerManager {
  private static instance: SpreadLayerManager | null = null;

  private activePerimeterEntity: Cesium.Entity | null = null;
  private hotZoneEntity: Cesium.Entity | null = null;
  private burnedCoreEntity: Cesium.Entity | null = null;
  private ignitionMarkerEntity: Cesium.Entity | null = null;

  public static getInstance(): SpreadLayerManager {
    if (!SpreadLayerManager.instance) {
      SpreadLayerManager.instance = new SpreadLayerManager();
    }
    return SpreadLayerManager.instance;
  }

  /**
   * Render dynamic 36-sector fire front polygons on Cesium 3D Globe.
   */
  public renderSpreadPrediction(viewer: Cesium.Viewer, step: SpreadTimestepResult): void {
    if (!viewer || viewer.isDestroyed()) return;

    this.clearSpread(viewer);

    const geom = step.geometry;
    if (!geom || !geom.activePerimeterCoordinates || geom.activePerimeterCoordinates.length === 0) {
      return;
    }

    // Convert WGS84 Coordinates arrays to Cesium Cartesian3 arrays
    const perimeterCartesians = geom.activePerimeterCoordinates.map((c) =>
      Cesium.Cartesian3.fromDegrees(c.longitude, c.latitude)
    );

    const hotZoneCartesians = geom.hotZoneCoordinates.map((c) =>
      Cesium.Cartesian3.fromDegrees(c.longitude, c.latitude)
    );

    // 1. Burned Core Region Polygon (Inner core)
    this.burnedCoreEntity = viewer.entities.add({
      name: `Burned Interior Core (${step.horizon})`,
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(hotZoneCartesians),
        material: new Cesium.ColorMaterialProperty(
          Cesium.Color.fromCssColorString('#1F2937').withAlpha(0.65)
        ),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
      }
    });

    // 2. Active Hot Combustion Zone Polygon (Ring between inner core and perimeter)
    this.hotZoneEntity = viewer.entities.add({
      name: `Active Combustion Zone (${step.horizon})`,
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(perimeterCartesians),
        material: new Cesium.ColorMaterialProperty(
          Cesium.Color.fromCssColorString('#F97316').withAlpha(0.40)
        ),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#EF4444'),
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
      }
    });

    // 3. Active Fire Front Outer Perimeter Line
    this.activePerimeterEntity = viewer.entities.add({
      name: `Active Fire Front Perimeter (${step.horizon})`,
      polyline: {
        positions: perimeterCartesians,
        width: 3,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.25,
          taperPower: 1.0,
          color: Cesium.Color.fromCssColorString('#EF4444')
        }),
        clampToGround: true
      },
      description: `
        <div style="font-family: Inter, sans-serif; padding: 12px; min-width: 220px;">
          <h4 style="color: #F97316; margin: 0 0 6px 0; border-bottom: 1px solid #F97316; padding-bottom: 4px;">
            EXPERIMENTAL FIRE-SPREAD SIMULATION (${step.horizon})
          </h4>
          <p style="margin: 4px 0;"><strong>Horizon:</strong> ${step.horizon} (${step.hoursAhead} hours elapsed)</p>
          <p style="margin: 4px 0;"><strong>Affected Area:</strong> ${step.affectedAreaHectares} ha</p>
          <p style="margin: 4px 0;"><strong>Mean ROS:</strong> ${step.rateOfSpreadMetersPerMin} m/min</p>
          <p style="margin: 4px 0;"><strong>Dominant Vector:</strong> ${step.dominantFactor}</p>
          <p style="margin: 4px 0;"><strong>Wind:</strong> ${step.environmentalState.windSpeed} km/h from ${step.environmentalState.windDirectionCardinal}</p>
          <p style="margin: 4px 0; font-size: 0.75rem; color: #F59E0B;">
            <strong>Provenance:</strong> EXPERIMENTAL FIRE-SPREAD SIMULATION
          </p>
        </div>
      `
    });

    // 4. Initial Ignition Point Marker
    const centerPos = Cesium.Cartesian3.fromDegrees(
      step.centerCoordinates.longitude,
      step.centerCoordinates.latitude
    );

    this.ignitionMarkerEntity = viewer.entities.add({
      name: 'Simulated Fire Ignition Center',
      position: centerPos,
      point: {
        pixelSize: 10,
        color: Cesium.Color.fromCssColorString('#EF4444'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
      }
    });

    viewer.scene.requestRender();
  }

  /**
   * Clear active spread simulation layers from Cesium.
   */
  public clearSpread(viewer: Cesium.Viewer): void {
    if (!viewer || viewer.isDestroyed()) return;

    if (this.activePerimeterEntity) {
      viewer.entities.remove(this.activePerimeterEntity);
      this.activePerimeterEntity = null;
    }
    if (this.hotZoneEntity) {
      viewer.entities.remove(this.hotZoneEntity);
      this.hotZoneEntity = null;
    }
    if (this.burnedCoreEntity) {
      viewer.entities.remove(this.burnedCoreEntity);
      this.burnedCoreEntity = null;
    }
    if (this.ignitionMarkerEntity) {
      viewer.entities.remove(this.ignitionMarkerEntity);
      this.ignitionMarkerEntity = null;
    }

    viewer.scene.requestRender();
  }

  public setSpreadVisibility(viewer: Cesium.Viewer, visible: boolean): void {
    if (!viewer || viewer.isDestroyed()) return;
    if (this.activePerimeterEntity) this.activePerimeterEntity.show = visible;
    if (this.hotZoneEntity) this.hotZoneEntity.show = visible;
    if (this.burnedCoreEntity) this.burnedCoreEntity.show = visible;
    if (this.ignitionMarkerEntity) this.ignitionMarkerEntity.show = visible;
    viewer.scene.requestRender();
  }
}
