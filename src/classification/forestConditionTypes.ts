/**
 * LAND8FIRE — OBJECTIVE 2: FOREST CONDITION CLASSIFICATION TYPES
 *
 * Strongly-typed definitions and metadata structures for 4 forest condition categories:
 * 1. Healthy Vegetation
 * 2. Dry Vegetation / Fuel
 * 3. Active Fire
 * 4. Burned Area
 */

export type ForestConditionCategory =
  | 'HEALTHY_VEGETATION'
  | 'DRY_VEGETATION'
  | 'ACTIVE_FIRE'
  | 'BURNED_AREA';

export type ForestConditionProvenance =
  | 'DERIVED'
  | 'OBSERVED'
  | 'GROUND_TRUTH'
  | 'MODEL_PREDICTION'
  | 'UNVERIFIED';

export interface ForestConditionClass {
  id: ForestConditionCategory;
  displayName: string;
  description?: string;
  color: string;
  provenance: ForestConditionProvenance;
  source: string;
  verified: boolean;
  confidence?: number;
  areaHectares?: number;
  percentage?: number;
  timestamp?: string;
}

export interface ForestConditionClassificationResult {
  locationId: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  classes: Record<ForestConditionCategory, ForestConditionClass>;
  indices?: {
    ndvi?: number;
    nbr?: number;
    ndmi?: number;
  };
  totalAreaHectares?: number;
  isAvailable: boolean;
  statusMessage?: string;
}

/**
 * Initial scientific class definitions for Objectives 1 & 2 categories.
 */
export const INITIAL_FOREST_CONDITION_CLASSES: Record<ForestConditionCategory, ForestConditionClass> = {
  HEALTHY_VEGETATION: {
    id: 'HEALTHY_VEGETATION',
    displayName: 'Healthy Vegetation',
    description: 'Dense, vigorous photosynthetic canopy identified through multispectral vegetation analysis.',
    color: '#159B72',
    provenance: 'DERIVED',
    source: 'Multispectral vegetation analysis',
    verified: false
  },
  DRY_VEGETATION: {
    id: 'DRY_VEGETATION',
    displayName: 'Dry Vegetation / Fuel',
    description: 'Stressed, moisture-depleted vegetation biomass posing elevated wildfire fuel vulnerability.',
    color: '#D99118',
    provenance: 'DERIVED',
    source: 'Vegetation stress / fuel indicators',
    verified: false
  },
  ACTIVE_FIRE: {
    id: 'ACTIVE_FIRE',
    displayName: 'Active Fire',
    description: 'Satellite thermal anomaly detections from thermal infrared sensors.',
    color: '#B84A45',
    provenance: 'OBSERVED',
    source: 'NASA FIRMS satellite thermal observations',
    verified: false
  },
  BURNED_AREA: {
    id: 'BURNED_AREA',
    displayName: 'Burned Area',
    description: 'Land8Fire 15-channel PyTorch U-Net satellite burned-area segmentation output.',
    color: '#B84A45',
    provenance: 'MODEL_PREDICTION',
    source: 'Land8Fire PyTorch U-Net segmentation',
    verified: false
  }
};
