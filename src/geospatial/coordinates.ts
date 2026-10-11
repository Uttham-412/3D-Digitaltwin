import { LayerDataType } from '../wildfire/wildfireTypes';

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface BoundingBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export type LocationSource =
  | 'GLOBE_CLICK'
  | 'FIRMS_FIRE'
  | 'AMAZON_REGION'
  | 'EMSR239_EVENT'
  | 'OTHER';

export interface SelectedLocation {
  id: string;
  latitude: number;
  longitude: number;
  height?: number; // Elevation in meters above WGS84 ellipsoid / terrain
  timestamp: string; // ISO string when selected
  eventDate?: string; // Optional historical/observed date (e.g. "2017-07-31" or "2024-08-23")
  source: LocationSource;
  label?: string; // Optional human readable location name (e.g. "Almadén de la Plata, Spain")
  classification?: LayerDataType;
}

export interface EventGeospatialMetadata {
  eventId: string;
  name: string;
  crs: string; // e.g. "EPSG:32630" (UTM Zone 30N) or "EPSG:4326"
  bounds: BoundingBox;
  resolution: [number, number]; // [xRes, yRes] in meters or degrees
  width: number;
  height: number;
  source: string;
  acquisitionTime?: string;
}

/**
 * Format latitude and longitude coordinates into a human-readable string.
 */
export function formatCoordinates(lat: number, lng: number): string {
  const latStr = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}`;
  const lngStr = `${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? 'E' : 'W'}`;
  return `${latStr}, ${lngStr}`;
}

/**
 * Authoritative native target grid definition for Amazon Sentinel-2 tile T20MRB.
 * Validated against source asset metadata:
 * - Native CRS: EPSG:32720 (WGS 84 / UTM Zone 20S)
 * - Resolution: 10.0 m
 * - Dimensions: 256 x 256 pixels
 * - Projected Width / Height: 2560.0 m x 2560.0 m
 */
export interface ProjectedGridSpec {
  crs: 'EPSG:32720';
  width: 256;
  height: 256;
  resolutionMeters: 10.0;
  bounds: {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
  };
  affineTransform: [number, number, number, number, number, number];
  geographicBoundsWgs84: {
    minLon: number;
    maxLon: number;
    minLat: number;
    maxLat: number;
  };
}

export const AMAZON_TARGET_GRID_10M: ProjectedGridSpec = {
  crs: 'EPSG:32720',
  width: 256,
  height: 256,
  resolutionMeters: 10.0,
  bounds: {
    xMin: 829790.0,
    xMax: 832350.0,
    yMin: 9653500.0,
    yMax: 9656060.0
  },
  affineTransform: [10.0, 0.0, 829790.0, 0.0, -10.0, 9656060.0],
  geographicBoundsWgs84: {
    minLon: -60.033188,
    maxLon: -60.010245,
    minLat: -3.130641,
    maxLat: -3.107447
  }
};

/**
 * Exact Transverse Mercator inverse projection from UTM Zone 20S (EPSG:32720)
 * to WGS 84 geographic latitude and longitude (EPSG:4326).
 */
export function transformUtm20sToWgs84(easting: number, northing: number): LatLng {
  const a = 6378137.0; // WGS84 semi-major axis
  const f = 1.0 / 298.257223563;
  const e2 = 2.0 * f - f * f;
  const ePrime2 = e2 / (1.0 - e2);
  const k0 = 0.9996;
  const lon0 = (-63.0 * Math.PI) / 180.0; // Central meridian for UTM Zone 20
  const falseEasting = 500000.0;
  const falseNorthing = 10000000.0; // Southern hemisphere

  const xAdj = easting - falseEasting;
  const yAdj = northing - falseNorthing;

  const m = yAdj / k0;
  const mu = m / (a * (1.0 - e2 / 4.0 - (3.0 * e2 * e2) / 64.0 - (5.0 * Math.pow(e2, 3)) / 256.0));
  const e1 = (1.0 - Math.sqrt(1.0 - e2)) / (1.0 + Math.sqrt(1.0 - e2));

  const phi1 =
    mu +
    ((3.0 * e1) / 2.0 - (27.0 * Math.pow(e1, 3)) / 32.0) * Math.sin(2.0 * mu) +
    ((21.0 * e1 * e1) / 16.0 - (55.0 * Math.pow(e1, 4)) / 32.0) * Math.sin(4.0 * mu) +
    ((151.0 * Math.pow(e1, 3)) / 96.0) * Math.sin(6.0 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);

  const n1 = a / Math.sqrt(1.0 - e2 * sinPhi1 * sinPhi1);
  const t1 = tanPhi1 * tanPhi1;
  const c1 = ePrime2 * cosPhi1 * cosPhi1;
  const r1 = (a * (1.0 - e2)) / Math.pow(1.0 - e2 * sinPhi1 * sinPhi1, 1.5);
  const d = xAdj / (n1 * k0);

  const latRad =
    phi1 -
    ((n1 * tanPhi1) / r1) *
      ((d * d) / 2.0 -
        (5.0 + 3.0 * t1 + 10.0 * c1 - 4.0 * c1 * c1 - 9.0 * ePrime2) * (Math.pow(d, 4) / 24.0) +
        (61.0 + 90.0 * t1 + 298.0 * c1 + 45.0 * t1 * t1 - 252.0 * ePrime2 - 3.0 * c1 * c1) *
          (Math.pow(d, 6) / 720.0));

  const lonRad =
    lon0 +
    (d -
      (1.0 + 2.0 * t1 + c1) * (Math.pow(d, 3) / 6.0) +
      (5.0 - 2.0 * c1 + 28.0 * t1 - 3.0 * c1 * c1 + 8.0 * ePrime2 + 24.0 * t1 * t1) *
        (Math.pow(d, 5) / 120.0)) /
      cosPhi1;

  return {
    latitude: (latRad * 180.0) / Math.PI,
    longitude: (lonRad * 180.0) / Math.PI
  };
}

export interface UtmCoordinate {
  easting: number;
  northing: number;
  zone: number;
  hemisphere: 'N' | 'S';
}

/**
 * Exact Transverse Mercator forward projection from WGS 84 geographic latitude
 * and longitude (EPSG:4326) to UTM Zone 20S (EPSG:32720).
 */
export function transformWgs84ToUtm20s(lat: number, lon: number): UtmCoordinate {
  const a = 6378137.0;
  const f = 1.0 / 298.257223563;
  const e2 = 2.0 * f - f * f;
  const ePrime2 = e2 / (1.0 - e2);
  const k0 = 0.9996;
  const lon0 = (-63.0 * Math.PI) / 180.0; // Central meridian for UTM Zone 20
  const latRad = (lat * Math.PI) / 180.0;
  const lonRad = (lon * Math.PI) / 180.0;

  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const tanLat = Math.tan(latRad);

  const N = a / Math.sqrt(1.0 - e2 * sinLat * sinLat);
  const T = tanLat * tanLat;
  const C = ePrime2 * cosLat * cosLat;
  const A = (lonRad - lon0) * cosLat;

  const M =
    a *
    ((1.0 - e2 / 4.0 - (3.0 * e2 * e2) / 64.0 - (5.0 * Math.pow(e2, 3)) / 256.0) * latRad -
      ((3.0 * e2) / 8.0 + (3.0 * e2 * e2) / 32.0 + (45.0 * Math.pow(e2, 3)) / 1024.0) *
        Math.sin(2.0 * latRad) +
      ((15.0 * e2 * e2) / 256.0 + (45.0 * Math.pow(e2, 3)) / 1024.0) * Math.sin(4.0 * latRad) -
      ((35.0 * Math.pow(e2, 3)) / 3072.0) * Math.sin(6.0 * latRad));

  const x =
    k0 *
      N *
      (A +
        ((1.0 - T + C) * Math.pow(A, 3)) / 6.0 +
        ((5.0 - 18.0 * T + T * T + 72.0 * C - 58.0 * ePrime2) * Math.pow(A, 5)) / 120.0) +
    500000.0;

  const y =
    k0 *
      (M +
        N *
          tanLat *
          ((A * A) / 2.0 +
            ((5.0 - T + 9.0 * C + 4.0 * C * C) * Math.pow(A, 4)) / 24.0 +
            ((61.0 - 58.0 * T + T * T + 600.0 * C - 330.0 * ePrime2) * Math.pow(A, 6)) / 720.0)) +
    10000000.0; // Southern hemisphere false northing

  return {
    easting: x,
    northing: y,
    zone: 20,
    hemisphere: 'S'
  };
}

export interface GridPixelSample {
  col: number;
  row: number;
  pixelCenterX: number;
  pixelCenterY: number;
  isInsideGrid: boolean;
}

/**
 * Convert WGS 84 geographic coordinates to the target 256x256 10m raster grid pixel.
 * Respects affine transform and pixel center alignment (col + 0.5, row + 0.5).
 */
export function wgs84ToTargetGridPixel(lat: number, lon: number): GridPixelSample {
  const utm = transformWgs84ToUtm20s(lat, lon);
  const spec = AMAZON_TARGET_GRID_10M;

  // Affine transform: x = a*col + b*row + c, y = d*col + e*row + f
  // [10.0, 0.0, 829790.0, 0.0, -10.0, 9656060.0]
  // col = (x - c) / a = (easting - 829790.0) / 10.0
  // row = (y - f) / e = (northing - 9656060.0) / -10.0 = (9656060.0 - northing) / 10.0
  const colFloat = (utm.easting - spec.bounds.xMin) / spec.resolutionMeters;
  const rowFloat = (spec.bounds.yMax - utm.northing) / spec.resolutionMeters;

  const col = Math.floor(colFloat);
  const row = Math.floor(rowFloat);

  const isInside = col >= 0 && col < spec.width && row >= 0 && row < spec.height;

  // Pixel center in projected UTM 20S meters
  const pixelCenterX = spec.bounds.xMin + (col + 0.5) * spec.resolutionMeters;
  const pixelCenterY = spec.bounds.yMax - (row + 0.5) * spec.resolutionMeters;

  return {
    col,
    row,
    pixelCenterX,
    pixelCenterY,
    isInsideGrid: isInside
  };
}

