/**
 * LAND8FIRE — OBJECTIVE 2: EXPERIMENTAL DIRECTIONAL FIRE-SPREAD MODEL
 *
 * Sectoral Wave-Front Propagation Model:
 * Calculates directional rate of spread (ROS) across 36 radial sectors (Δθ = 10°)
 * incorporating environmental wind vectors, terrain slope/aspect gradients,
 * moisture/temperature damping, and land cover fuel burnability.
 *
 * Formulae:
 * 1. Wind Modifier:      Φ_wind(θ) = 1 + c_w * ||W|| * cos(θ - θ_wind_towards)
 * 2. Slope Modifier:     Φ_slope(θ) = 1 + c_s * tan(slope) * cos(θ - θ_uphill)
 * 3. Moisture Factor:    M_t = max(0.1, 1 - RH/120) * max(0.0, 1 - Precip/5) * max(0.5, 1 + (T-20)/40)
 * 4. Sector Rate of Spread: ROS_i = max(0.2, ROS_base * B * M_t * Φ_wind(θ_i) * Φ_slope(θ_i))
 * 5. Sector Radius:      r_i(t_k) = r_initial + ROS_i * (60 * hours_k)
 *
 * Provenance Label: "EXPERIMENTAL FIRE-SPREAD SIMULATION"
 */

import { Coordinates } from '../environmental/environmentalTypes';
import {
  FireState,
  TerrainData,
  FuelData,
  SpreadHorizon,
  SpreadTimestepResult,
  SpreadSimulationResult,
  SectorRadius,
  FireFrontGeometry
} from './fireScenarioTypes';
import { EnvironmentalTimeline, EnvironmentalObservation } from '../environmental/environmentalTypes';

export class FireSpreadModel {
  private static instance: FireSpreadModel;

  private constructor() {}

  public static getInstance(): FireSpreadModel {
    if (!FireSpreadModel.instance) {
      FireSpreadModel.instance = new FireSpreadModel();
    }
    return FireSpreadModel.instance;
  }

  /**
   * Execute dynamic directional fire-spread simulation across 36 sectors for horizons (+0H to +24H).
   */
  public runSimulation(
    initialFire: FireState,
    envTimeline: EnvironmentalTimeline,
    terrain: TerrainData,
    fuel: FuelData
  ): SpreadSimulationResult {
    const horizons: { horizon: SpreadHorizon; hours: number }[] = [
      { horizon: '+0H', hours: 0 },
      { horizon: '+1H', hours: 1 },
      { horizon: '+2H', hours: 2 },
      { horizon: '+6H', hours: 6 },
      { horizon: '+12H', hours: 12 },
      { horizon: '+24H', hours: 24 }
    ];

    const timesteps: Record<string, SpreadTimestepResult> = {};
    const obsList = envTimeline.observations;

    horizons.forEach(({ horizon, hours }) => {
      // Find matching hourly weather observation for (t0 + hours)
      const baseMs = new Date(initialFire.timestamp).getTime();
      const targetMs = baseMs + hours * 3600 * 1000;

      let envObs: EnvironmentalObservation = obsList[envTimeline.selectedIndex] || obsList[0];
      if (obsList.length > 0) {
        let minDiff = Infinity;
        obsList.forEach((obs) => {
          const diff = Math.abs(new Date(obs.timestamp).getTime() - targetMs);
          if (diff < minDiff) {
            minDiff = diff;
            envObs = obs;
          }
        });
      }

      // 1. Environmental Wind Vector Projection
      const windTowardsDeg = (envObs.windDirection + 180) % 360;
      const windSpeed = envObs.windSpeed;
      const c_w = 0.08;

      // 2. Terrain Slope & Aspect Gradient Projection
      const slopeDeg = terrain.isAvailable && terrain.slopeDegrees !== null ? terrain.slopeDegrees : 0;
      const aspectDeg = terrain.isAvailable && terrain.aspectDegrees !== null ? terrain.aspectDegrees : 0;
      const slopeRad = (slopeDeg * Math.PI) / 180;
      const c_s = 0.60;

      // 3. Moisture & Temperature Damping Factor
      const humidityFactor = Math.max(0.1, 1 - envObs.relativeHumidity / 120);
      const precipDamping = Math.max(0.0, 1 - envObs.precipitation / 5);
      const tempBoost = Math.max(0.5, 1 + (envObs.temperature - 20) / 40);
      const moistureFactor = humidityFactor * precipDamping * tempBoost;

      // 4. Fuel Burnability Factor
      const burnability = fuel.isAvailable && fuel.burnabilityFactor !== null ? fuel.burnabilityFactor : 0.70;
      const baseROS = 2.5; // m/min base

      // 5. Compute 36 Directional Sector Radii (Δθ = 10°)
      const numSectors = 36;
      const sectorRadii: SectorRadius[] = [];
      const activePerimeterCoords: Coordinates[] = [];
      const hotZoneCoords: Coordinates[] = [];
      const burnedAreaCoords: Coordinates[] = [];

      const lat0 = initialFire.latitude;
      const lng0 = initialFire.longitude;
      const initialRadius = initialFire.radiusMeters || 100;

      let totalROS = 0;
      let maxRadius = 0;

      for (let i = 0; i < numSectors; i++) {
        const thetaDeg = i * 10;
        const thetaRad = (thetaDeg * Math.PI) / 180;

        // Directional Wind Modifier
        const windCos = Math.cos(((thetaDeg - windTowardsDeg) * Math.PI) / 180);
        const phiWind = Math.max(0.1, 1 + c_w * windSpeed * windCos);

        // Directional Slope Modifier (Fire spreads faster uphill)
        const slopeCos = Math.cos(((thetaDeg - aspectDeg) * Math.PI) / 180);
        const phiSlope = Math.max(0.2, 1 + c_s * Math.tan(slopeRad) * slopeCos);

        // Sector Rate of Spread (m/min)
        const rosSector = Math.max(0.2, baseROS * burnability * moistureFactor * phiWind * phiSlope);
        totalROS += rosSector;

        // Sector Radius (m) for current horizon hours
        const expansionMeters = hours === 0 ? 0 : rosSector * 60 * hours;
        const radiusSector = Math.round(initialRadius + expansionMeters);
        const hotRadius = Math.round(radiusSector * 0.85);

        maxRadius = Math.max(maxRadius, radiusSector);

        // Georeference Sector Point along azimuth thetaDeg
        const deltaLat = (radiusSector * Math.cos(thetaRad)) / 111320;
        const deltaLng = (radiusSector * Math.sin(thetaRad)) / (111320 * Math.cos((lat0 * Math.PI) / 180));

        const ptCoords: Coordinates = {
          latitude: parseFloat((lat0 + deltaLat).toFixed(6)),
          longitude: parseFloat((lng0 + deltaLng).toFixed(6))
        };

        const deltaLatHot = (hotRadius * Math.cos(thetaRad)) / 111320;
        const deltaLngHot = (hotRadius * Math.sin(thetaRad)) / (111320 * Math.cos((lat0 * Math.PI) / 180));

        const ptHotCoords: Coordinates = {
          latitude: parseFloat((lat0 + deltaLatHot).toFixed(6)),
          longitude: parseFloat((lng0 + deltaLngHot).toFixed(6))
        };

        sectorRadii.push({
          angleDegrees: thetaDeg,
          radiusMeters: radiusSector,
          rosMetersPerMin: Math.round(rosSector * 10) / 10,
          coordinates: ptCoords
        });

        activePerimeterCoords.push(ptCoords);
        hotZoneCoords.push(ptHotCoords);
        burnedAreaCoords.push(ptHotCoords);
      }

      // Close polygon rings
      if (activePerimeterCoords.length > 0) {
        activePerimeterCoords.push(activePerimeterCoords[0]);
        hotZoneCoords.push(hotZoneCoords[0]);
        burnedAreaCoords.push(burnedAreaCoords[0]);
      }

      const meanROS = Math.round((totalROS / numSectors) * 10) / 10;

      // Calculate approximate area of 36-sector polygon (ha)
      let areaMetersSq = 0;
      for (let i = 0; i < numSectors; i++) {
        const r1 = sectorRadii[i].radiusMeters;
        const r2 = sectorRadii[(i + 1) % numSectors].radiusMeters;
        const dThetaRad = (10 * Math.PI) / 180;
        areaMetersSq += 0.5 * r1 * r2 * Math.sin(dThetaRad);
      }
      const affectedAreaHectares = Math.round((areaMetersSq / 10000) * 10) / 10;

      // Net Vector Orientation (Dominant propagation bearing)
      const netWindRad = (windTowardsDeg * Math.PI) / 180;
      const netX = windSpeed * Math.sin(netWindRad) + slopeDeg * 0.6 * Math.sin((aspectDeg * Math.PI) / 180);
      const netY = windSpeed * Math.cos(netWindRad) + slopeDeg * 0.6 * Math.cos((aspectDeg * Math.PI) / 180);
      let netOrientationDeg = Math.round((Math.atan2(netX, netY) * 180) / Math.PI);
      if (netOrientationDeg < 0) netOrientationDeg += 360;

      // Shifted center along net propagation vector
      const shiftMeters = hours * meanROS * 60 * 0.25;
      const deltaLatCenter = (shiftMeters * Math.cos((netOrientationDeg * Math.PI) / 180)) / 111320;
      const deltaLngCenter = (shiftMeters * Math.sin((netOrientationDeg * Math.PI) / 180)) / (111320 * Math.cos((lat0 * Math.PI) / 180));

      const centerCoordinates: Coordinates = {
        latitude: parseFloat((lat0 + deltaLatCenter).toFixed(6)),
        longitude: parseFloat((lng0 + deltaLngCenter).toFixed(6))
      };

      let dominantFactor = 'Environmental Wind Vector';
      if (!terrain.isAvailable || terrain.slopeDegrees === null) {
        dominantFactor = 'Environmental Wind Vector (Terrain Slope Unavailable)';
      } else if (slopeDeg * 0.6 > windSpeed) {
        dominantFactor = 'Terrain Slope & Aspect Gradient Vector';
      }

      const geometry: FireFrontGeometry = {
        activePerimeterCoordinates: activePerimeterCoords,
        hotZoneCoordinates: hotZoneCoords,
        burnedAreaCoordinates: burnedAreaCoords,
        sectorRadii
      };

      timesteps[horizon] = {
        horizon,
        hoursAhead: hours,
        timestamp: new Date(targetMs).toISOString(),
        centerCoordinates,
        majorAxisMeters: maxRadius,
        minorAxisMeters: Math.round(maxRadius * 0.65),
        orientationDegrees: netOrientationDeg,
        affectedAreaHectares,
        rateOfSpreadMetersPerMin: meanROS,
        dominantFactor,
        environmentalState: envObs,
        geometry
      };
    });

    return {
      scenarioId: `spread_${Date.now()}`,
      initialFireState: initialFire,
      terrain,
      fuel,
      timesteps: timesteps as Record<SpreadHorizon, SpreadTimestepResult>,
      provenance: 'EXPERIMENTAL FIRE-SPREAD SIMULATION',
      disclaimer:
        'This is an experimental directional propagation model based on weather, terrain DEM gradients, and land cover features. It is not an operational emergency wildfire forecast.'
    };
  }
}

export const fireSpreadModel = FireSpreadModel.getInstance();
