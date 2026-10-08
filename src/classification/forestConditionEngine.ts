/**
 * LAND8FIRE — OBJECTIVE 2: FOREST CONDITION CLASSIFICATION ENGINE
 *
 * Modular, pure TypeScript classification engine for categorizing forest conditions:
 * 1. Healthy Vegetation (DERIVED)
 * 2. Dry Vegetation / Fuel (DERIVED)
 * 3. Active Fire (OBSERVED — Requires spatially/temporally verified FIRMS observation)
 * 4. Burned Area (MODEL_PREDICTION or GROUND_TRUTH)
 *
 * Pure design: Independent of React, Cesium, DOM, HTTP, and filesystem.
 */

import {
  ForestConditionCategory,
  ForestConditionClass,
  ForestConditionClassificationResult,
  INITIAL_FOREST_CONDITION_CLASSES
} from './forestConditionTypes';

export interface ForestConditionInput {
  latitude: number;
  longitude: number;
  timestamp?: string;
  red?: number;
  nir?: number;
  swir1?: number;
  swir2?: number;
  ndvi?: number;
  nbr?: number;
  ndmi?: number;
  landCover?: string;
  burnedAreaPrediction?: boolean;
  burnedAreaGroundTruth?: boolean;
  activeFireObserved?: boolean;
  activeFireCompatible?: boolean;
}

export interface ForestClassificationConfig {
  healthyVegetation: {
    ndviMin: number;
    ndviMax: number;
    ndmiMin?: number;
  };
  dryVegetation: {
    ndviMin: number;
    ndviMax: number;
    ndmiMax?: number;
    nbrMax?: number;
  };
  burnedArea: {
    predictionThreshold?: number;
    useGroundTruthIfAvailable?: boolean;
  };
  activeFire: {
    requireSpatialTemporalVerification: boolean;
  };
}

/**
 * Default configurable classification thresholds.
 * Thresholds can be updated after empirical dataset calibration.
 */
export const DEFAULT_FOREST_CLASSIFICATION_CONFIG: ForestClassificationConfig = {
  healthyVegetation: {
    ndviMin: 0.50,
    ndviMax: 1.00,
    ndmiMin: 0.10
  },
  dryVegetation: {
    ndviMin: 0.15,
    ndviMax: 0.49,
    ndmiMax: 0.05
  },
  burnedArea: {
    predictionThreshold: 0.65,
    useGroundTruthIfAvailable: true
  },
  activeFire: {
    requireSpatialTemporalVerification: true
  }
};

/**
 * PURE FUNCTION: Compute Normalized Difference Vegetation Index (NDVI)
 * Formula: (NIR - RED) / (NIR + RED + EPS)
 */
export function computeNDVI(nir: number, red: number, eps: number = 1e-7): number {
  const denom = nir + red;
  if (Math.abs(denom) < eps) {
    return 0.0;
  }
  const ndvi = (nir - red) / (denom + eps);
  return Math.max(-1.0, Math.min(1.0, parseFloat(ndvi.toFixed(4))));
}

/**
 * PURE FUNCTION: Compute Normalized Burn Ratio (NBR)
 * Formula: (NIR - SWIR2) / (NIR + SWIR2 + EPS)
 */
export function computeNBR(nir: number, swir2: number, eps: number = 1e-7): number {
  const denom = nir + swir2;
  if (Math.abs(denom) < eps) {
    return 0.0;
  }
  const nbr = (nir - swir2) / (denom + eps);
  return Math.max(-1.0, Math.min(1.0, parseFloat(nbr.toFixed(4))));
}

/**
 * PURE FUNCTION: Compute Normalized Difference Moisture Index (NDMI)
 * Formula: (NIR - SWIR1) / (NIR + SWIR1 + EPS)
 */
export function computeNDMI(nir: number, swir1: number, eps: number = 1e-7): number {
  const denom = nir + swir1;
  if (Math.abs(denom) < eps) {
    return 0.0;
  }
  const ndmi = (nir - swir1) / (denom + eps);
  return Math.max(-1.0, Math.min(1.0, parseFloat(ndmi.toFixed(4))));
}

export class ForestConditionEngine {
  private config: ForestClassificationConfig;

  constructor(config: ForestClassificationConfig = DEFAULT_FOREST_CLASSIFICATION_CONFIG) {
    this.config = config;
  }

  /**
   * Evaluate forest condition categorization for specified input telemetry.
   */
  public classify(input: ForestConditionInput): ForestConditionClassificationResult {
    const lat = input.latitude;
    const lng = input.longitude;
    const timestamp = input.timestamp || new Date().toISOString();

    // Compute spectral indices if band reflectances are provided
    const computedNDVI =
      input.ndvi !== undefined
        ? input.ndvi
        : input.nir !== undefined && input.red !== undefined
        ? computeNDVI(input.nir, input.red)
        : undefined;

    const computedNBR =
      input.nbr !== undefined
        ? input.nbr
        : input.nir !== undefined && input.swir2 !== undefined
        ? computeNBR(input.nir, input.swir2)
        : undefined;

    const computedNDMI =
      input.ndmi !== undefined
        ? input.ndmi
        : input.nir !== undefined && input.swir1 !== undefined
        ? computeNDMI(input.nir, input.swir1)
        : undefined;

    const classes: Record<ForestConditionCategory, ForestConditionClass> = {
      HEALTHY_VEGETATION: { ...INITIAL_FOREST_CONDITION_CLASSES.HEALTHY_VEGETATION },
      DRY_VEGETATION: { ...INITIAL_FOREST_CONDITION_CLASSES.DRY_VEGETATION },
      ACTIVE_FIRE: { ...INITIAL_FOREST_CONDITION_CLASSES.ACTIVE_FIRE },
      BURNED_AREA: { ...INITIAL_FOREST_CONDITION_CLASSES.BURNED_AREA }
    };

    // 1. ACTIVE FIRE (OBSERVED): Requires verified spatial/temporal FIRMS observation
    if (input.activeFireObserved === true && input.activeFireCompatible === true) {
      classes.ACTIVE_FIRE.verified = true;
      classes.ACTIVE_FIRE.confidence = 0.95;
      classes.ACTIVE_FIRE.timestamp = timestamp;
    } else {
      classes.ACTIVE_FIRE.verified = false;
      classes.ACTIVE_FIRE.description =
        'Active fire observations require spatially and temporally verified satellite thermal detection (NASA FIRMS).';
    }

    // 2. BURNED AREA: Supports GROUND_TRUTH (EMS reference) or MODEL_PREDICTION (Land8Fire U-Net)
    if (input.burnedAreaGroundTruth === true && this.config.burnedArea.useGroundTruthIfAvailable) {
      classes.BURNED_AREA.provenance = 'GROUND_TRUTH';
      classes.BURNED_AREA.source = 'Copernicus EMS Ground-Truth Vector Mask';
      classes.BURNED_AREA.verified = true;
      classes.BURNED_AREA.confidence = 1.0;
      classes.BURNED_AREA.timestamp = timestamp;
    } else if (input.burnedAreaPrediction === true) {
      classes.BURNED_AREA.provenance = 'MODEL_PREDICTION';
      classes.BURNED_AREA.source = 'Land8Fire PyTorch 15-channel U-Net Segmentation';
      classes.BURNED_AREA.verified = false;
      classes.BURNED_AREA.confidence = 0.85;
      classes.BURNED_AREA.timestamp = timestamp;
    }

    // 3. HEALTHY VEGETATION (DERIVED): Evaluated via NDVI & NDMI thresholds
    if (computedNDVI !== undefined) {
      const isHealthy =
        computedNDVI >= this.config.healthyVegetation.ndviMin &&
        computedNDVI <= this.config.healthyVegetation.ndviMax &&
        (computedNDMI === undefined || computedNDMI >= (this.config.healthyVegetation.ndmiMin ?? -1.0));

      if (isHealthy) {
        classes.HEALTHY_VEGETATION.confidence = parseFloat(computedNDVI.toFixed(2));
        classes.HEALTHY_VEGETATION.timestamp = timestamp;
      }
    }

    // 4. DRY VEGETATION / FUEL (DERIVED): Evaluated via vegetation stress indices
    if (computedNDVI !== undefined) {
      const isDry =
        computedNDVI >= this.config.dryVegetation.ndviMin &&
        computedNDVI <= this.config.dryVegetation.ndviMax &&
        (computedNDMI === undefined || computedNDMI <= (this.config.dryVegetation.ndmiMax ?? 1.0)) &&
        (computedNBR === undefined || computedNBR <= (this.config.dryVegetation.nbrMax ?? 1.0));

      if (isDry) {
        classes.DRY_VEGETATION.confidence = parseFloat((1.0 - computedNDVI).toFixed(2));
        classes.DRY_VEGETATION.timestamp = timestamp;
      }
    }

    return {
      locationId: `class_${lat.toFixed(4)}_${lng.toFixed(4)}`,
      latitude: lat,
      longitude: lng,
      timestamp,
      indices: {
        ndvi: computedNDVI,
        nbr: computedNBR,
        ndmi: computedNDMI
      },
      classes,
      isAvailable: true
    };
  }
}

/**
 * Step 2H Deterministic Validation Suite:
 * Validates spectral index calculations and division-by-zero safeguards.
 */
export function validateSpectralCalculations(): { passed: boolean; results: Record<string, string> } {
  const results: Record<string, string> = {};

  // Test 1: Standard NDVI calculation (RED = 0.2, NIR = 0.6) -> (0.6 - 0.2)/(0.6 + 0.2) = 0.5
  const ndviStd = computeNDVI(0.6, 0.2);
  const pass1 = Math.abs(ndviStd - 0.5) < 1e-4;
  results['NDVI Standard (0.6, 0.2)'] = pass1 ? `PASS (${ndviStd})` : `FAIL (${ndviStd} vs expected 0.5)`;

  // Test 2: Standard NBR calculation (NIR = 0.6, SWIR2 = 0.2) -> 0.5
  const nbrStd = computeNBR(0.6, 0.2);
  const pass2 = Math.abs(nbrStd - 0.5) < 1e-4;
  results['NBR Standard (0.6, 0.2)'] = pass2 ? `PASS (${nbrStd})` : `FAIL (${nbrStd} vs expected 0.5)`;

  // Test 3: Standard NDMI calculation (NIR = 0.6, SWIR1 = 0.3) -> (0.6 - 0.3)/(0.6 + 0.3) = 0.3333
  const ndmiStd = computeNDMI(0.6, 0.3);
  const pass3 = Math.abs(ndmiStd - 0.3333) < 1e-3;
  results['NDMI Standard (0.6, 0.3)'] = pass3 ? `PASS (${ndmiStd})` : `FAIL (${ndmiStd} vs expected 0.3333)`;

  // Test 4: Division by Zero protection (RED = 0.0, NIR = 0.0) -> returns 0.0 safely
  const ndviDivZero = computeNDVI(0.0, 0.0);
  const pass4 = ndviDivZero === 0.0;
  results['NDVI Zero Denominator Safeguard'] = pass4 ? `PASS (${ndviDivZero})` : `FAIL (${ndviDivZero})`;

  const allPassed = pass1 && pass2 && pass3 && pass4;
  return { passed: allPassed, results };
}
