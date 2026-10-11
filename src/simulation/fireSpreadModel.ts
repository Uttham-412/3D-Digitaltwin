/**
 * LAND8FIRE — OBJECTIVE 2: TIME-AWARE DIRECTIONAL FIRE-SPREAD MODEL
 *
 * Sectoral Wave-Front Propagation Model:
 * Calculates directional rate of spread (ROS) across 36 radial sectors (Δθ = 10°)
 * incorporating:
 * 1. Environmental wind vectors projected along sector azimuths
 * 2. Terrain DEM slope and aspect gradients
 * 3. Documented Dead Fuel Moisture Content (Simard 1968 / Rothermel 1972 EMC)
 * 4. Rothermel (1972) Fuel Moisture Damping Coefficient eta_M
 * 5. Spatial land-cover & water barrier exclusion (clamping sector propagation at water bodies)
 * 6. Temporal weather interpolation for forecast horizons (+0H to +24H)
 *
 * Provenance Label: "EXPERIMENTAL FIRE-SPREAD SIMULATION"
 */

import { Coordinates, EnvironmentalTimeline, EnvironmentalObservation, degreesToCardinal, EnvironmentalProvenance } from '../environmental/environmentalTypes';
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
import { fuelService, SpatialBurnabilityChecker } from '../geospatial/fuelService';

/**
 * Compute 1-hour dead fuel Equilibrium Moisture Content (EMC, %)
 * using authoritative Simard (1968) / Rothermel (1972) formulations.
 *
 * Inputs:
 * - tempC: Dry-bulb ambient air temperature (°C)
 * - rh: Relative humidity (%, 0-100)
 *
 * Returns: Equilibrium moisture content percentage (typically 1.0% to 35.0%)
 */
export function computeEquilibriumMoistureContent(tempC: number, rh: number): number {
  const rhClamped = Math.max(1, Math.min(100, rh));
  const tempF = tempC * 1.8 + 32;

  let emc: number;
  if (rhClamped < 10) {
    emc = 0.03229 + 0.281073 * rhClamped - 0.000578 * rhClamped * tempF;
  } else if (rhClamped < 50) {
    emc = 2.22749 + 0.160107 * rhClamped - 0.014784 * tempF;
  } else {
    emc = 21.0606 + 0.005565 * (rhClamped ** 2) - 0.00035 * rhClamped * tempF - 0.483199 * rhClamped;
  }
  return Math.max(1.0, Math.min(35.0, parseFloat(emc.toFixed(2))));
}

/**
 * Compute Rothermel (1972) dead fuel moisture damping coefficient eta_M.
 *
 * Formula:
 * eta_M = 1 - 2.59 * (Mf/Mx) + 5.11 * (Mf/Mx)^2 - 3.52 * (Mf/Mx)^3
 * where:
 * - Mf = effective dead fuel moisture (EMC + precipitation effect)
 * - Mx = moisture of extinction (default 30% for standard 1-hour/10-hour forest fuels)
 *
 * When Mf >= Mx, eta_M drops to 0.0 (fire spread ceases).
 */
export function computeMoistureDampingFactor(
  fuelMoisturePercent: number,
  precipMm: number,
  mxPercent: number = 30.0
): number {
  // Rain adds surface moisture film
  const effectiveMoisture = Math.min(mxPercent, fuelMoisturePercent + precipMm * 2.0);
  const rm = effectiveMoisture / mxPercent;

  if (rm >= 1.0) {
    return 0.0; // Extinguished / non-propagating at or above extinction moisture
  }

  const etaM = 1.0 - 2.59 * rm + 5.11 * (rm ** 2) - 3.52 * (rm ** 3);
  const precipFactor = precipMm > 0 ? Math.exp(-0.6 * precipMm) : 1.0;
  return Math.max(0.0, Math.min(1.0, parseFloat((etaM * precipFactor).toFixed(4))));
}

/**
 * Interpolate weather observation for a future simulation timestamp (t0 + hours)
 * from an ordered hourly EnvironmentalTimeline.
 */
export function interpolateWeatherForTimestamp(
  targetMs: number,
  envTimeline: EnvironmentalTimeline
): { obs: EnvironmentalObservation; status: 'EXACT' | 'INTERPOLATED' | 'EXTRAPOLATED_OUT_OF_BOUNDS' | 'MISSING' } {
  const obsList = envTimeline.observations;

  if (!obsList || obsList.length === 0) {
    // Missing weather fallback
    const dummyObs: EnvironmentalObservation = {
      location: envTimeline.location,
      timestamp: new Date(targetMs).toISOString(),
      formattedTime: 'N/A',
      temperature: 20,
      relativeHumidity: 50,
      windSpeed: 0,
      windDirection: 0,
      windDirectionCardinal: 'N',
      precipitation: 0,
      provenance: EnvironmentalProvenance.DERIVED,
      source: 'UNAVAILABLE'
    };
    return { obs: dummyObs, status: 'MISSING' };
  }

  // Sort chronologically if needed
  const times = obsList.map((o) => new Date(o.timestamp).getTime());
  const minTime = times[0];
  const maxTime = times[times.length - 1];

  // Check exact boundary or extrapolation
  if (targetMs <= minTime) {
    const isExact = Math.abs(targetMs - minTime) < 60000;
    return { obs: obsList[0], status: isExact ? 'EXACT' : 'EXTRAPOLATED_OUT_OF_BOUNDS' };
  }
  if (targetMs >= maxTime) {
    const isExact = Math.abs(targetMs - maxTime) < 60000;
    return { obs: obsList[obsList.length - 1], status: isExact ? 'EXACT' : 'EXTRAPOLATED_OUT_OF_BOUNDS' };
  }

  // Find bracketing interval [i, i+1]
  let idx = 0;
  for (let i = 0; i < times.length - 1; i++) {
    if (times[i] <= targetMs && targetMs <= times[i + 1]) {
      idx = i;
      break;
    }
  }

  const o1 = obsList[idx];
  const o2 = obsList[idx + 1];
  const t1 = times[idx];
  const t2 = times[idx + 1];

  if (t2 === t1) {
    return { obs: o1, status: 'EXACT' };
  }

  const alpha = (targetMs - t1) / (t2 - t1);

  // Linear interpolation for continuous variables
  const temp = o1.temperature + alpha * (o2.temperature - o1.temperature);
  const rh = o1.relativeHumidity + alpha * (o2.relativeHumidity - o1.relativeHumidity);
  const windSpeed = o1.windSpeed + alpha * (o2.windSpeed - o1.windSpeed);
  const precip = o1.precipitation + alpha * (o2.precipitation - o1.precipitation);
  const pressure = (o1.surfacePressure ?? 1013) + alpha * ((o2.surfacePressure ?? 1013) - (o1.surfacePressure ?? 1013));
  const cloud = (o1.cloudCover ?? 0) + alpha * ((o2.cloudCover ?? 0) - (o1.cloudCover ?? 0));

  // Circular interpolation for wind direction degrees
  const dTheta = (((o2.windDirection - o1.windDirection + 540) % 360) - 180);
  const windDir = Math.round((o1.windDirection + alpha * dTheta + 360) % 360);

  const dateObj = new Date(targetMs);
  const formattedTime = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const formattedDate = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });

  const interpolated: EnvironmentalObservation = {
    location: o1.location,
    locationName: o1.locationName,
    timestamp: dateObj.toISOString(),
    formattedTime: `${formattedDate}, ${formattedTime}`,
    temperature: parseFloat(temp.toFixed(1)),
    relativeHumidity: parseFloat(rh.toFixed(1)),
    windSpeed: parseFloat(windSpeed.toFixed(1)),
    windDirection: windDir,
    windDirectionCardinal: degreesToCardinal(windDir),
    precipitation: parseFloat(precip.toFixed(2)),
    surfacePressure: Math.round(pressure),
    cloudCover: Math.round(cloud),
    provenance: EnvironmentalProvenance.DERIVED,
    source: `${o1.source} (Hourly Interpolation)`
  };

  return { obs: interpolated, status: alpha < 0.05 ? 'EXACT' : 'INTERPOLATED' };
}

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
   *
   * @param initialFire Initial ignition state
   * @param envTimeline Time-aware environmental weather timeline
   * @param terrain Terrain DEM elevation, slope, and aspect
   * @param fuel Fuel burnability and land-cover data
   * @param spatialBurnability Optional spatial checker for water / non-burnable cell detection along sector rays
   */
  public runSimulation(
    initialFire: FireState,
    envTimeline: EnvironmentalTimeline,
    terrain: TerrainData,
    fuel: FuelData,
    spatialBurnability?: SpatialBurnabilityChecker
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
    const lat0 = initialFire.latitude;
    const lng0 = initialFire.longitude;
    const numSectors = 36;
    let anyWaterClamping = false;

    // Check if initial ignition point itself is water, unverified, or non-burnable
    const ignitionBurnability = spatialBurnability
      ? spatialBurnability({ latitude: lat0, longitude: lng0 })
      : fuelService.checkBurnabilitySync({ latitude: lat0, longitude: lng0 });

    const isIgnitionOnWater = ignitionBurnability.isWater || fuel.burnabilityStatus === 'WATER';
    const isIgnitionBlocked =
      isIgnitionOnWater ||
      ignitionBurnability.burnabilityStatus === 'UNVERIFIED' ||
      fuel.burnabilityStatus === 'UNVERIFIED' ||
      ignitionBurnability.isBurnable === false ||
      fuel.isBurnable === false;

    // If ignition is on water or non-burnable surface, zero out all spread and initial radius
    const baseROS = isIgnitionBlocked ? 0.0 : 2.5; // m/min base
    const effectiveInitialRadius = isIgnitionBlocked ? 0 : (initialFire.radiusMeters || 100);

    horizons.forEach(({ horizon, hours }) => {
      // Authoritative future simulation timestamp = t_ignition + hours
      const baseMs = new Date(initialFire.timestamp).getTime();
      const targetMs = baseMs + hours * 3600 * 1000;

      // 1. Time-aware weather interpolation
      const { obs: envObs, status: weatherStatus } = interpolateWeatherForTimestamp(targetMs, envTimeline);

      // 2. Dead Fuel Moisture & Rothermel Damping Factor
      const fuelMoistureEMC = computeEquilibriumMoistureContent(envObs.temperature, envObs.relativeHumidity);
      const moistureDamping = computeMoistureDampingFactor(fuelMoistureEMC, envObs.precipitation);

      // 3. Ambient Temperature Boost (preheating of fine fuel beds)
      const tempBoost = Math.max(0.5, 1 + (envObs.temperature - 20) / 40);

      // 4. Combined Moisture-Temperature Multiplier
      const combinedMoistureFactor = moistureDamping * tempBoost;

      // 5. Environmental Wind Vector Projection
      const windTowardsDeg = (envObs.windDirection + 180) % 360;
      const windSpeed = envObs.windSpeed;
      const c_w = 0.08;

      // 6. Terrain Slope & Aspect Gradient Projection
      const slopeDeg = terrain.isAvailable && terrain.slopeDegrees !== null ? terrain.slopeDegrees : 0;
      const aspectDeg = terrain.isAvailable && terrain.aspectDegrees !== null ? terrain.aspectDegrees : 0;
      const slopeRad = (slopeDeg * Math.PI) / 180;
      const c_s = 0.60;

      // 7. Fuel Burnability Factor
      const burnability = fuel.isAvailable && fuel.burnabilityFactor !== null ? fuel.burnabilityFactor : 0.70;

      // 8. 36 Directional Sector Radii with Spatial Water Exclusion
      const sectorRadii: SectorRadius[] = [];
      const activePerimeterCoords: Coordinates[] = [];
      const hotZoneCoords: Coordinates[] = [];
      const burnedAreaCoords: Coordinates[] = [];
      const waterExclusionSectors: number[] = [];

      let totalROS = 0;
      let maxRadius = 0;

      for (let i = 0; i < numSectors; i++) {
        const thetaDeg = i * 10;
        const thetaRad = (thetaDeg * Math.PI) / 180;

        // Directional Wind Modifier along sector azimuth theta
        const windCos = Math.cos(((thetaDeg - windTowardsDeg) * Math.PI) / 180);
        const phiWind = Math.max(0.1, 1 + c_w * windSpeed * windCos);

        // Directional Slope Modifier (Fire spreads faster uphill)
        const slopeCos = Math.cos(((thetaDeg - aspectDeg) * Math.PI) / 180);
        const phiSlope = Math.max(0.2, 1 + c_s * Math.tan(slopeRad) * slopeCos);

        // Unobstructed Sector Rate of Spread (m/min)
        const rosSector = isIgnitionBlocked
          ? 0.0
          : Math.max(0.0, baseROS * burnability * combinedMoistureFactor * phiWind * phiSlope);

        totalROS += rosSector;

        // Unobstructed target radius for horizon hours
        const expansionMeters = hours === 0 ? 0 : rosSector * 60 * hours;
        let intendedRadius = Math.round(effectiveInitialRadius + expansionMeters);

        // 9. Spatial Water Barrier Check along Sector Ray
        // Step along the ray from center to intendedRadius to detect water bodies or non-burnable cells
        let isWaterBlocked = false;
        let clampedRadius = intendedRadius;

        if (!isIgnitionBlocked && intendedRadius > 0) {
          const stepSizeMeters = Math.max(25, Math.min(100, Math.round(intendedRadius / 15)));
          for (let dist = stepSizeMeters; dist <= intendedRadius; dist += stepSizeMeters) {
            const dLat = (dist * Math.cos(thetaRad)) / 111320;
            const dLng = (dist * Math.sin(thetaRad)) / (111320 * Math.cos((lat0 * Math.PI) / 180));
            const checkPt: Coordinates = {
              latitude: parseFloat((lat0 + dLat).toFixed(6)),
              longitude: parseFloat((lng0 + dLng).toFixed(6))
            };

            const cellBurnability = spatialBurnability
              ? spatialBurnability(checkPt)
              : fuelService.checkBurnabilitySync(checkPt);

            const isCellBlocked =
              cellBurnability.isWater ||
              cellBurnability.burnabilityStatus === 'WATER' ||
              cellBurnability.burnabilityStatus === 'NON_BURNABLE_URBAN' ||
              cellBurnability.burnabilityStatus === 'UNVERIFIED' ||
              cellBurnability.isBurnable === false;

            if (isCellBlocked) {
              // Clamp propagation at the water / non-burnable boundary!
              clampedRadius = Math.max(0, dist - stepSizeMeters);
              isWaterBlocked = true;
              waterExclusionSectors.push(i);
              anyWaterClamping = true;
              break;
            }
          }
        } else if (isIgnitionBlocked) {
          clampedRadius = 0;
          isWaterBlocked = true;
          waterExclusionSectors.push(i);
          anyWaterClamping = true;
        }

        const finalRadius = clampedRadius;
        const hotRadius = Math.round(finalRadius * 0.85);
        maxRadius = Math.max(maxRadius, finalRadius);

        // Georeference Sector Point
        const deltaLat = (finalRadius * Math.cos(thetaRad)) / 111320;
        const deltaLng = (finalRadius * Math.sin(thetaRad)) / (111320 * Math.cos((lat0 * Math.PI) / 180));

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
          radiusMeters: finalRadius,
          rosMetersPerMin: isWaterBlocked && finalRadius === 0 ? 0 : Math.round(rosSector * 10) / 10,
          coordinates: ptCoords,
          isWaterBlocked
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

      const meanROS = isIgnitionOnWater ? 0 : Math.round((totalROS / numSectors) * 10) / 10;

      // Calculate area of 36-sector polygon (ha)
      let areaMetersSq = 0;
      for (let i = 0; i < numSectors; i++) {
        const r1 = sectorRadii[i].radiusMeters;
        const r2 = sectorRadii[(i + 1) % numSectors].radiusMeters;
        const dThetaRad = (10 * Math.PI) / 180;
        areaMetersSq += 0.5 * r1 * r2 * Math.sin(dThetaRad);
      }
      const affectedAreaHectares = Math.round((areaMetersSq / 10000) * 10) / 10;

      // Net Vector Orientation
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
      if (isIgnitionOnWater) {
        dominantFactor = 'Blocked: Water Body Surface';
      } else if (!terrain.isAvailable || terrain.slopeDegrees === null) {
        dominantFactor = 'Environmental Wind Vector (Terrain DEM Unavailable)';
      } else if (slopeDeg * 0.6 > windSpeed) {
        dominantFactor = 'Terrain Slope & Aspect Gradient Vector';
      }

      if (waterExclusionSectors.length > 0) {
        dominantFactor += ` (Water Barrier Exclusion: ${waterExclusionSectors.length} sectors)`;
      }

      const geometry: FireFrontGeometry = {
        activePerimeterCoordinates: activePerimeterCoords,
        hotZoneCoordinates: hotZoneCoords,
        burnedAreaCoordinates: burnedAreaCoords,
        sectorRadii,
        waterExclusionSectors
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
        geometry,
        fuelMoistureContentPercent: fuelMoistureEMC,
        fuelMoistureDampingFactor: moistureDamping,
        weatherInterpolationStatus: weatherStatus,
        waterExclusionCount: waterExclusionSectors.length
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
        'This is an experimental directional propagation model based on weather, terrain DEM gradients, and land cover features. It is not an operational emergency wildfire forecast.',
      waterExclusionActive: anyWaterClamping
    };
  }
}

export const fireSpreadModel = FireSpreadModel.getInstance();
