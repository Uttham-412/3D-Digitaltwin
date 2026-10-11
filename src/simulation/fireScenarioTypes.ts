import { Coordinates } from '../environmental/environmentalTypes';
import { EnvironmentalObservation } from '../environmental/environmentalTypes';

export type SpreadHorizon = '+0H' | '+1H' | '+2H' | '+6H' | '+12H' | '+24H';

export interface FireState {
  id: string;
  source: 'FIRMS' | 'UNET' | 'SIMULATED';
  latitude: number;
  longitude: number;
  radiusMeters: number;
  areaHectares: number;
  timestamp: string;
  provenance: string; // "SIMULATED / USER-DEFINED SCENARIO"
}

export interface TerrainData {
  elevationMeters: number | null;
  slopeDegrees: number | null;
  aspectDegrees: number | null;
  aspectCardinal: string | null;
  isAvailable: boolean;
  source: string;
  statusMessage?: string;
}

export interface FuelData {
  fuelClass: string;
  burnabilityFactor: number | null;
  fuelLoadTonsPerHectare: number | null;
  isBurnable: boolean;
  isAvailable: boolean;
  isDerivedEstimate?: boolean;
  source: string;
  statusMessage?: string;
  burnabilityStatus?: 'BURNABLE' | 'WATER' | 'NON_BURNABLE_URBAN' | 'UNVERIFIED';
  isWater?: boolean;
}

export interface SectorRadius {
  angleDegrees: number; // 0 to 350 in steps of 10
  radiusMeters: number;
  rosMetersPerMin: number;
  coordinates: Coordinates;
  isWaterBlocked?: boolean;
}

export interface FireFrontGeometry {
  activePerimeterCoordinates: Coordinates[]; // 36 boundary polygon coordinates
  hotZoneCoordinates: Coordinates[];          // Inner ring boundary (0.85 * r)
  burnedAreaCoordinates: Coordinates[];        // Core burned region boundary
  sectorRadii: SectorRadius[];                 // 36 radial readings
  waterExclusionSectors?: number[];            // Indices of sectors stopped by water
}

export interface SpreadTimestepResult {
  horizon: SpreadHorizon;
  hoursAhead: number;
  timestamp: string;
  centerCoordinates: Coordinates;
  majorAxisMeters: number;
  minorAxisMeters: number;
  orientationDegrees: number;
  affectedAreaHectares: number;
  rateOfSpreadMetersPerMin: number;
  dominantFactor: string;
  environmentalState: EnvironmentalObservation;
  geometry: FireFrontGeometry;
  fuelMoistureContentPercent?: number;        // Simard (1968) / Rothermel (1972) EMC %
  fuelMoistureDampingFactor?: number;         // Rothermel eta_M moisture damping (0.0 to 1.0)
  weatherInterpolationStatus?: 'EXACT' | 'INTERPOLATED' | 'EXTRAPOLATED_OUT_OF_BOUNDS' | 'MISSING';
  waterExclusionCount?: number;               // Number of sectors clamped by water boundaries
}

export interface IgnitionValidationResult {
  valid: boolean;
  code: 'VALID' | 'REJECTED_WATER' | 'BLOCKED_UNVERIFIED_SURFACE' | 'REJECTED_NON_BURNABLE';
  message: string;
  details?: {
    latitude: number;
    longitude: number;
    surfaceType?: string;
  };
}

export interface SpreadSimulationResult {
  scenarioId: string;
  initialFireState: FireState;
  terrain: TerrainData;
  fuel: FuelData;
  timesteps: Record<SpreadHorizon, SpreadTimestepResult>;
  provenance: string; // "EXPERIMENTAL FIRE-SPREAD SIMULATION"
  disclaimer: string;
  waterExclusionActive?: boolean;
}
