import { Coordinates, degreesToCardinal } from '../environmental/environmentalTypes';
import { TerrainData } from '../simulation/fireScenarioTypes';
import { CesiumViewerManager } from '../cesium/viewer';
import * as Cesium from 'cesium';

class TerrainService {
  private static instance: TerrainService;
  private cache: Map<string, TerrainData> = new Map();

  private constructor() {}

  public static getInstance(): TerrainService {
    if (!TerrainService.instance) {
      TerrainService.instance = new TerrainService();
    }
    return TerrainService.instance;
  }

  /**
   * Extract real terrain elevation, slope, and aspect for specified coordinates.
   * Queries Copernicus DEM (90m resolution) via Open-Meteo Elevation API using a 5-point stencil
   * (Center, North, South, East, West) to compute genuine elevation and central-difference gradient.
   */
  public async fetchTerrainData(coords: Coordinates): Promise<TerrainData> {
    const lat = coords.latitude;
    const lng = coords.longitude;
    const key = `${lat.toFixed(4)}_${lng.toFixed(4)}`;

    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    // Delta ~90m at equator (0.0008 degrees)
    const deltaDeg = 0.0008;
    const latN = lat + deltaDeg;
    const latS = lat - deltaDeg;
    const lngE = lng + deltaDeg;
    const lngW = lng - deltaDeg;

    // 1. Primary: Query Copernicus DEM 90m via Open-Meteo Elevation API
    try {
      const lats = `${lat.toFixed(5)},${latN.toFixed(5)},${latS.toFixed(5)},${lat.toFixed(5)},${lat.toFixed(5)}`;
      const lons = `${lng.toFixed(5)},${lng.toFixed(5)},${lng.toFixed(5)},${lngE.toFixed(5)},${lngW.toFixed(5)}`;
      const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.elevation && Array.isArray(data.elevation) && data.elevation.length >= 5) {
          const [elevCenter, elevNorth, elevSouth, elevEast, elevWest] = data.elevation;

          const latRad = (lat * Math.PI) / 180;
          const dy = 2 * deltaDeg * 111320; // Distance North to South in meters
          const dx = 2 * deltaDeg * 111320 * Math.cos(latRad); // Distance East to West in meters

          const dz_dy = (elevNorth - elevSouth) / dy;
          const dz_dx = (elevEast - elevWest) / dx;

          const slopeRad = Math.atan(Math.sqrt(dz_dx * dz_dx + dz_dy * dz_dy));
          const slope = Math.round(((slopeRad * 180) / Math.PI) * 10) / 10;

          let aspect = 0;
          let aspectCardinal = 'N';

          if (Math.abs(dz_dx) > 1e-5 || Math.abs(dz_dy) > 1e-5) {
            const aspectRad = Math.atan2(dz_dx, dz_dy);
            aspect = Math.round((((aspectRad * 180) / Math.PI) + 360) % 360);
            aspectCardinal = degreesToCardinal(aspect);
          }

          const terrain: TerrainData = {
            elevationMeters: Math.round(elevCenter),
            slopeDegrees: slope,
            aspectDegrees: aspect,
            aspectCardinal,
            isAvailable: true,
            source: 'Copernicus DEM 90m (Open-Meteo Elevation API)'
          };

          this.cache.set(key, terrain);
          return terrain;
        }
      }
    } catch {
      // Network failure; fall back to Cesium scene if available
    }

    // 2. Secondary: Sample from Cesium 3D scene if loaded
    try {
      const manager = CesiumViewerManager.getInstance();
      const viewer = manager.getViewer();

      if (viewer && !viewer.isDestroyed()) {
        const globe = viewer.scene.globe;
        const cartCenter = Cesium.Cartographic.fromDegrees(lng, lat);
        const sampledHeight = globe.getHeight(cartCenter);

        if (sampledHeight !== undefined && sampledHeight !== null && !isNaN(sampledHeight)) {
          const elevation = Math.round(sampledHeight);
          const pN = globe.getHeight(Cesium.Cartographic.fromDegrees(lng, lat + 0.0005));
          const pS = globe.getHeight(Cesium.Cartographic.fromDegrees(lng, lat - 0.0005));
          const pE = globe.getHeight(Cesium.Cartographic.fromDegrees(lng + 0.0005, lat));
          const pW = globe.getHeight(Cesium.Cartographic.fromDegrees(lng - 0.0005, lat));

          let slope: number | null = null;
          let aspect: number | null = null;
          let aspectCardinal: string | null = null;

          if (pN !== undefined && pS !== undefined && pE !== undefined && pW !== undefined) {
            const dz_dx = (pE - pW) / 110.0;
            const dz_dy = (pN - pS) / 110.0;
            const slopeRad = Math.atan(Math.sqrt(dz_dx * dz_dx + dz_dy * dz_dy));
            slope = Math.round(Cesium.Math.toDegrees(slopeRad) * 10) / 10;

            if (dz_dx !== 0 || dz_dy !== 0) {
              const aspectRad = Math.atan2(dz_dx, dz_dy);
              aspect = Math.round((Cesium.Math.toDegrees(aspectRad) + 360) % 360);
              aspectCardinal = degreesToCardinal(aspect);
            } else {
              aspect = 0;
              aspectCardinal = 'N';
            }
          }

          const terrain: TerrainData = {
            elevationMeters: elevation,
            slopeDegrees: slope,
            aspectDegrees: aspect,
            aspectCardinal,
            isAvailable: true,
            source: 'Cesium WGS84 3D World Terrain DEM'
          };
          this.cache.set(key, terrain);
          return terrain;
        }
      }
    } catch {
      // Cesium sampling unavailable
    }

    return {
      elevationMeters: null,
      slopeDegrees: null,
      aspectDegrees: null,
      aspectCardinal: null,
      isAvailable: false,
      source: 'Copernicus DEM 90m (Open-Meteo)',
      statusMessage: 'TERRAIN ELEVATION DATA UNAVAILABLE'
    };
  }
}

export const terrainService = TerrainService.getInstance();
