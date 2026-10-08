/**
 * LAND8FIRE — AMAZON RAINFOREST DIGITAL TWIN STUDY REGION CONFIGURATION
 *
 * Centralized scientific definition for the operational Amazon Digital Twin study region.
 *
 * SCIENTIFIC CLASSIFICATION:
 * Type: APPROXIMATE_OPERATIONAL_BOUNDING_BOX
 * Description: Operational geographic study region used by Land8Fire for Amazon Rainforest wildfire analysis.
 */

export interface StudyRegionMetadata {
  name: string;
  type: string;
  description: string;
  boundingBox: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
  center: {
    latitude: number;
    longitude: number;
    altitudeMeters: number;
  };
}

export const AMAZON_STUDY_REGION: StudyRegionMetadata = {
  name: 'Amazon Rainforest Digital Twin Study Region',
  type: 'APPROXIMATE_OPERATIONAL_BOUNDING_BOX',
  description:
    'Operational geographic study region used by Land8Fire for Amazon Rainforest wildfire analysis.',
  boundingBox: {
    west: -60.5,
    south: -3.5,
    east: -59.5,
    north: -2.5
  },
  center: {
    latitude: -3.119,
    longitude: -60.0217,
    altitudeMeters: 18000 // 18 km altitude for local study area view
  }
};

/**
 * Authoritative scientific gate to evaluate whether coordinates fall within
 * the operational Amazon Rainforest Digital Twin study region.
 */
export function isPointInAmazonStudyRegion(lat: number, lon: number): boolean {
  const bbox = AMAZON_STUDY_REGION.boundingBox;
  return (
    lat >= bbox.south &&
    lat <= bbox.north &&
    lon >= bbox.west &&
    lon <= bbox.east
  );
}
