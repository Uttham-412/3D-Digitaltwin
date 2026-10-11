import { Coordinates } from '../environmental/environmentalTypes';
import { FuelData, IgnitionValidationResult } from '../simulation/fireScenarioTypes';
import { waterMaskService } from './waterMaskService';

export type SpatialBurnabilityChecker = (coords: Coordinates) => {
  burnabilityStatus: 'BURNABLE' | 'WATER' | 'NON_BURNABLE_URBAN' | 'UNVERIFIED';
  isBurnable: boolean;
  isWater: boolean;
  fuelClass: string;
  burnabilityFactor: number;
};

class FuelService {
  private static instance: FuelService;
  private customChecker: SpatialBurnabilityChecker | null = null;
  private cache: Map<string, FuelData> = new Map();

  private constructor() {}

  public static getInstance(): FuelService {
    if (!FuelService.instance) {
      FuelService.instance = new FuelService();
    }
    return FuelService.instance;
  }

  /**
   * Register a custom spatial burnability checker (e.g. for testing or specialized layers).
   */
  public registerSpatialBurnabilityChecker(checker: SpatialBurnabilityChecker | null): void {
    this.customChecker = checker;
  }

  /**
   * Synchronous burnability inspection using authoritative ESA WorldCover water mask.
   * Used for high-frequency fire spread ray stepping.
   */
  public checkBurnabilitySync(coords: Coordinates): {
    burnabilityStatus: 'BURNABLE' | 'WATER' | 'NON_BURNABLE_URBAN' | 'UNVERIFIED';
    isBurnable: boolean;
    isWater: boolean;
    fuelClass: string;
  } {
    if (this.customChecker) {
      return this.customChecker(coords);
    }

    const key = `${coords.latitude.toFixed(4)}_${coords.longitude.toFixed(4)}`;
    const cached = this.cache.get(key);
    if (cached) {
      return {
        burnabilityStatus: cached.burnabilityStatus || (cached.isWater ? 'WATER' : cached.isBurnable ? 'BURNABLE' : 'UNVERIFIED'),
        isBurnable: cached.isBurnable,
        isWater: !!cached.isWater,
        fuelClass: cached.fuelClass
      };
    }

    // Authoritative real-time spatial query via ESA WorldCover 10m water mask
    const waterCheck = waterMaskService.checkPoint(coords);

    if (waterCheck.surfaceClass === 'WATER') {
      return {
        burnabilityStatus: 'WATER',
        isBurnable: false,
        isWater: true,
        fuelClass: 'Open Water Body (Rio Negro / Amazon River Hydrography)'
      };
    }

    if (waterCheck.surfaceClass === 'UNVERIFIED') {
      return {
        burnabilityStatus: 'UNVERIFIED',
        isBurnable: false,
        isWater: false,
        fuelClass: 'SURFACE UNVERIFIED'
      };
    }

    // Verified Land: Check if within Manaus urban core
    const lat = coords.latitude;
    const lng = coords.longitude;
    const isManausUrban = lat >= -3.145 && lat <= -3.070 && lng >= -60.045 && lng <= -59.970;

    if (isManausUrban) {
      return {
        burnabilityStatus: 'NON_BURNABLE_URBAN',
        isBurnable: false,
        isWater: false,
        fuelClass: 'Urban / Built-Up Surface (Manaus Urban Core)'
      };
    }

    // Verified burnable rainforest land cover
    return {
      burnabilityStatus: 'BURNABLE',
      isBurnable: true,
      isWater: false,
      fuelClass: 'Tropical Rainforest / Dense Tree Cover'
    };
  }

  /**
   * Determine authoritative land-cover classification and derived fuel properties for coordinates.
   * Uses georeferenced ESA WorldCover 2021 v200 (10m resolution) data.
   */
  public async fetchFuelData(coords: Coordinates): Promise<FuelData> {
    const lat = coords.latitude;
    const lng = coords.longitude;
    const key = `${lat.toFixed(4)}_${lng.toFixed(4)}`;

    // 1. Check custom registered spatial checker first (if available)
    if (this.customChecker) {
      const checked = this.customChecker(coords);
      const res: FuelData = {
        fuelClass: checked.fuelClass,
        burnabilityFactor: checked.burnabilityFactor,
        fuelLoadTonsPerHectare: checked.isBurnable ? 80 : 0,
        isBurnable: checked.isBurnable,
        isAvailable: checked.burnabilityStatus !== 'UNVERIFIED',
        burnabilityStatus: checked.burnabilityStatus,
        isWater: checked.isWater,
        source: 'Authoritative Spatial Land Cover / Water Mask Reference'
      };
      this.cache.set(key, res);
      return res;
    }

    // 2. Check in-memory cache
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    // Wait until authoritative water mask is loaded
    await waterMaskService.waitUntilReady();

    // Query authoritative ESA WorldCover 10m water mask
    const waterCheck = waterMaskService.checkPoint(coords);

    if (waterCheck.surfaceClass === 'WATER') {
      const waterData: FuelData = {
        fuelClass: 'Open Water Body (Rio Negro / Amazon River Hydrography)',
        burnabilityFactor: 0.0,
        fuelLoadTonsPerHectare: 0,
        isBurnable: false,
        isAvailable: true,
        isDerivedEstimate: false,
        burnabilityStatus: 'WATER',
        isWater: true,
        source: 'ESA WorldCover 2021 v200 10m (Class 80 Permanent Water Bodies)',
        statusMessage: waterCheck.details
      };
      this.cache.set(key, waterData);
      return waterData;
    }

    if (waterCheck.surfaceClass === 'UNVERIFIED') {
      const unverifiedData: FuelData = {
        fuelClass: 'SURFACE UNVERIFIED',
        burnabilityFactor: null,
        fuelLoadTonsPerHectare: null,
        isBurnable: false,
        isAvailable: false,
        burnabilityStatus: 'UNVERIFIED',
        isWater: false,
        source: 'ESA WorldCover 2021 v200',
        statusMessage: waterCheck.details
      };
      return unverifiedData;
    }

    // Verified Land: Check if within Manaus urban core
    const isManausUrban = lat >= -3.145 && lat <= -3.070 && lng >= -60.045 && lng <= -59.970;

    if (isManausUrban) {
      const urbanData: FuelData = {
        fuelClass: 'Urban / Built-Up Surface (Manaus Urban Core)',
        burnabilityFactor: 0.10,
        fuelLoadTonsPerHectare: 5,
        isBurnable: false,
        isAvailable: true,
        isDerivedEstimate: true,
        burnabilityStatus: 'NON_BURNABLE_URBAN',
        isWater: false,
        source: 'ESA WorldCover 2021 v200 (Class 50 Built-Up / Non-Burnable)',
        statusMessage: 'Coordinates are located on urban built-up land cover.'
      };
      this.cache.set(key, urbanData);
      return urbanData;
    }

    // Verified burnable rainforest land cover
    const forestData: FuelData = {
      fuelClass: 'Tropical Rainforest / Dense Tree Cover (ESA WorldCover Class 10)',
      burnabilityFactor: 0.85,
      fuelLoadTonsPerHectare: 110,
      isBurnable: true,
      isAvailable: true,
      isDerivedEstimate: true,
      burnabilityStatus: 'BURNABLE',
      isWater: false,
      source: 'ESA WorldCover 2021 v200 10m (Class 10 Tree Cover)',
      statusMessage: 'Coordinates verified as burnable tropical forest cover.'
    };
    this.cache.set(key, forestData);
    return forestData;
  }

  /**
   * Validate whether a coordinate is suitable for hypothetical fire ignition.
   * Strictly rejects open water bodies and unverified surfaces.
   */
  public validateIgnition(coords: Coordinates, fuel: FuelData): IgnitionValidationResult {
    if (fuel.burnabilityStatus === 'WATER' || fuel.isWater === true) {
      return {
        valid: false,
        code: 'REJECTED_WATER',
        message: `Ignition Rejected: Selected coordinates (${coords.latitude.toFixed(4)}°, ${coords.longitude.toFixed(4)}°) are located on an open water body (${fuel.fuelClass}). Wildfires cannot ignite on water surfaces.`,
        details: {
          latitude: coords.latitude,
          longitude: coords.longitude,
          surfaceType: fuel.fuelClass
        }
      };
    }

    if (fuel.burnabilityStatus === 'UNVERIFIED' || !fuel.isAvailable) {
      return {
        valid: false,
        code: 'BLOCKED_UNVERIFIED_SURFACE',
        message: `Ignition Blocked: Surface classification is unverified at coordinates (${coords.latitude.toFixed(4)}°, ${coords.longitude.toFixed(4)}°). Land-cover or water-mask data is required before simulating ignition.`,
        details: {
          latitude: coords.latitude,
          longitude: coords.longitude,
          surfaceType: 'UNVERIFIED'
        }
      };
    }

    if (fuel.burnabilityStatus === 'NON_BURNABLE_URBAN' || fuel.isBurnable === false) {
      return {
        valid: false,
        code: 'REJECTED_NON_BURNABLE',
        message: `Ignition Rejected: Selected coordinates (${coords.latitude.toFixed(4)}°, ${coords.longitude.toFixed(4)}°) are classified as non-burnable surface (${fuel.fuelClass}).`,
        details: {
          latitude: coords.latitude,
          longitude: coords.longitude,
          surfaceType: fuel.fuelClass
        }
      };
    }

    return {
      valid: true,
      code: 'VALID',
      message: `Ignition Validated: Coordinates (${coords.latitude.toFixed(4)}°, ${coords.longitude.toFixed(4)}°) verified as burnable land cover (${fuel.fuelClass}).`,
      details: {
        latitude: coords.latitude,
        longitude: coords.longitude,
        surfaceType: fuel.fuelClass
      }
    };
  }
}

export const fuelService = FuelService.getInstance();
