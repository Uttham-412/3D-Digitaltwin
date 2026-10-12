/**
 * LAND8FIRE — AUTHORITATIVE SPATIAL WATER MASK SERVICE (PHASE C)
 *
 * Provides real, georeferenced water-exclusion checks using the authoritative
 * ESA WorldCover 2021 v200 (10-meter resolution) Permanent Water Bodies mask (Class 80)
 * covering the Rio Negro, Rio Solimões, Encontro das Águas, and Manaus study region.
 *
 * Native Dataset Metadata:
 * - Dataset: ESA WorldCover 2021 v200
 * - CRS: EPSG:4326 (WGS 84 geographic coordinates)
 * - Resolution: 10 meters (8.333e-5 degrees)
 * - Source: AWS Open Data S3 Cloud-Optimized GeoTIFFs (S06W063, S06W060, S03W063, S03W060)
 * - Bounding Extent: [-60.30° W, -3.40° S, -59.70° W, -2.80° S]
 * - Water Class Code: 80 (Permanent water bodies)
 *
 * Features:
 * - Ultra-fast O(1) bounding-box pre-filtering + exact ray-casting point-in-polygon
 * - Strict non-burnable surface enforcement: rejects water ignition and propagation
 * - Conservative unverified handling: coordinates outside the verified mask bounds
 *   are marked UNVERIFIED and blocked from ignition rather than assumed burnable.
 */

import { Coordinates } from '../environmental/environmentalTypes';

export interface WaterMaskFeature {
  type: string;
  bbox?: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
  properties?: Record<string, any>;
}

export interface WaterMaskMetadata {
  dataset: string;
  crs: string;
  resolutionMeters: number;
  classCode: number;
  className: string;
  bounds: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
}

export interface WaterCheckResult {
  isWater: boolean;
  isVerified: boolean;
  surfaceClass: 'WATER' | 'LAND' | 'UNVERIFIED';
  dataset: string;
  details: string;
}

export class WaterMaskService {
  private static instance: WaterMaskService | null = null;
  private features: WaterMaskFeature[] = [];
  private metadata: WaterMaskMetadata | null = null;
  private isLoaded: boolean = false;
  private loadPromise: Promise<void> | null = null;

  // Exact study area bounds covered by the authoritative ESA WorldCover mask
  public readonly verifiedBounds = {
    west: -60.30,
    south: -3.40,
    east: -59.70,
    north: -2.80
  };

  public getMetadata(): WaterMaskMetadata | null {
    return this.metadata;
  }

  private constructor() {
    // If in Node.js environment, load synchronously immediately
    const reqFn = typeof (globalThis as any).require === 'function' ? (globalThis as any).require : null;
    if (typeof process !== 'undefined' && process.versions && process.versions.node && reqFn) {
      try {
        const fs = reqFn('fs');
        const path = reqFn('path');
        const filePath = path.resolve(process.cwd(), 'public/data/amazon_water_mask.json');
        if (fs.existsSync(filePath)) {
          const raw = fs.readFileSync(filePath, 'utf-8');
          const data = JSON.parse(raw);
          this.loadData(data);
        }
      } catch {
        // Fall back to async initialize()
      }
    }
    if (!this.isLoaded) {
      this.loadPromise = this.initialize();
    }
  }

  public static getInstance(): WaterMaskService {
    if (!WaterMaskService.instance) {
      WaterMaskService.instance = new WaterMaskService();
    }
    return WaterMaskService.instance;
  }

  /**
   * Initialize and load the authoritative ESA WorldCover water mask.
   * Supports both browser fetch and Node.js filesystem environments.
   */
  public async initialize(): Promise<void> {
    if (this.isLoaded) return;

    try {
      if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
        // Browser environment: load from Vite static public asset
        const res = await fetch('/data/amazon_water_mask.json');
        if (res.ok) {
          const data = await res.json();
          this.loadData(data);
          return;
        }
      } else {
        // Node.js / testing environment
        const fsMod = 'fs';
        const pathMod = 'path';
        const fs = await import(/* @vite-ignore */ fsMod);
        const path = await import(/* @vite-ignore */ pathMod);
        const filePath = path.resolve(process.cwd(), 'public/data/amazon_water_mask.json');
        if (fs.existsSync(filePath)) {
          const raw = fs.readFileSync(filePath, 'utf-8');
          const data = JSON.parse(raw);
          this.loadData(data);
          return;
        }
      }
    } catch (err) {
      console.warn('[WaterMaskService] Could not load water mask file:', err);
    }
  }

  /**
   * Ingest raw GeoJSON water mask data into memory with precomputed bounding boxes.
   */
  public loadData(geojson: any): void {
    if (!geojson || !geojson.features) return;
    this.metadata = geojson.metadata || null;
    this.features = geojson.features.map((feat: any) => {
      // Ensure bbox exists for O(1) filtering
      if (!feat.bbox) {
        feat.bbox = this.computeBbox(feat.geometry);
      }
      return feat;
    });
    this.isLoaded = true;
    console.info(`[WaterMaskService] Ingested ${this.features.length} authoritative ESA WorldCover water polygons.`);
  }

  public isReady(): boolean {
    return this.isLoaded && this.features.length > 0;
  }

  public async waitUntilReady(): Promise<void> {
    if (this.isLoaded) return;
    if (this.loadPromise) {
      await this.loadPromise;
    }
  }

  /**
   * Authoritative spatial point check: returns whether a coordinate is on water.
   * Synchronous execution for high-frequency fire spread ray stepping.
   */
  public checkPoint(coords: Coordinates): WaterCheckResult {
    const lat = coords.latitude;
    const lon = coords.longitude;

    // 1. Boundary check: ensure point falls within the verified ESA WorldCover mask extent
    const inVerifiedBounds =
      lon >= this.verifiedBounds.west &&
      lon <= this.verifiedBounds.east &&
      lat >= this.verifiedBounds.south &&
      lat <= this.verifiedBounds.north;

    if (!inVerifiedBounds) {
      return {
        isWater: false,
        isVerified: false,
        surfaceClass: 'UNVERIFIED',
        dataset: 'ESA WorldCover 2021 v200',
        details: `Coordinates (${lat.toFixed(4)}°, ${lon.toFixed(4)}°) are outside the verified Amazon Digital Twin hydrography mask bounds.`
      };
    }

    if (!this.isLoaded || this.features.length === 0) {
      // Conservative default if mask is not yet loaded: block ignition and mark UNVERIFIED
      return {
        isWater: false,
        isVerified: false,
        surfaceClass: 'UNVERIFIED',
        dataset: 'ESA WorldCover 2021 v200 (Initializing)',
        details: 'Authoritative water mask is still initializing. Surface is UNVERIFIED.'
      };
    }

    // 2. Spatial Query: Check bounding boxes first (O(1) rejection), then exact point-in-polygon
    for (let i = 0; i < this.features.length; i++) {
      const feat = this.features[i];
      const bbox = feat.bbox;
      if (bbox) {
        // [minLon, minLat, maxLon, maxLat]
        if (lon < bbox[0] || lon > bbox[2] || lat < bbox[1] || lat > bbox[3]) {
          continue; // Point is outside this feature's bounding box
        }
      }

      // Point is within bounding box; evaluate polygon geometry
      const geom = feat.geometry;
      if (geom.type === 'Polygon') {
        if (this.pointInPolygonWithHoles(lon, lat, geom.coordinates as number[][][])) {
          return {
            isWater: true,
            isVerified: true,
            surfaceClass: 'WATER',
            dataset: 'ESA WorldCover 2021 v200 10m (Class 80 Permanent Water)',
            details: `Coordinates (${lat.toFixed(4)}°, ${lon.toFixed(4)}°) fall inside an authoritative open water body (Rio Negro / Amazon River hydrography).`
          };
        }
      } else if (geom.type === 'MultiPolygon') {
        const polyList = geom.coordinates as number[][][][];
        for (let p = 0; p < polyList.length; p++) {
          if (this.pointInPolygonWithHoles(lon, lat, polyList[p])) {
            return {
              isWater: true,
              isVerified: true,
              surfaceClass: 'WATER',
              dataset: 'ESA WorldCover 2021 v200 10m (Class 80 Permanent Water)',
              details: `Coordinates (${lat.toFixed(4)}°, ${lon.toFixed(4)}°) fall inside an authoritative open water body (Rio Negro / Amazon River hydrography).`
            };
          }
        }
      }
    }

    // Point is inside verified bounds and does not intersect any water polygon
    return {
      isWater: false,
      isVerified: true,
      surfaceClass: 'LAND',
      dataset: 'ESA WorldCover 2021 v200 10m',
      details: `Coordinates (${lat.toFixed(4)}°, ${lon.toFixed(4)}°) are verified terrestrial land cover.`
    };
  }

  /**
   * Ray-casting point-in-polygon algorithm considering exterior ring and interior holes.
   */
  private pointInPolygonWithHoles(lon: number, lat: number, rings: number[][][]): boolean {
    if (!rings || rings.length === 0) return false;

    // Check exterior ring (rings[0])
    if (!this.rayCastingPointInRing(lon, lat, rings[0])) {
      return false;
    }

    // Check interior holes (rings[1...])
    for (let h = 1; h < rings.length; h++) {
      if (this.rayCastingPointInRing(lon, lat, rings[h])) {
        return false; // Point is inside a hole (e.g. island in the river)
      }
    }

    return true;
  }

  /**
   * Standard Jordan curve theorem ray-casting algorithm for a single coordinate ring.
   */
  private rayCastingPointInRing(x: number, y: number, ring: number[][]): boolean {
    let inside = false;
    const n = ring.length;
    if (n < 3) return false;

    let p1x = ring[0][0];
    let p1y = ring[0][1];

    for (let i = 1; i <= n; i++) {
      const p2 = ring[i % n];
      const p2x = p2[0];
      const p2y = p2[1];

      if (y > Math.min(p1y, p2y)) {
        if (y <= Math.max(p1y, p2y)) {
          if (x <= Math.max(p1x, p2x)) {
            if (p1y !== p2y) {
              const xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x;
              if (p1x === p2x || x <= xinters) {
                inside = !inside;
              }
            }
          }
        }
      }
      p1x = p2x;
      p1y = p2y;
    }

    return inside;
  }

  /**
   * Compute bounding box [minLon, minLat, maxLon, maxLat] for geometry.
   */
  private computeBbox(geom: any): [number, number, number, number] {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const processRing = (ring: number[][]) => {
      for (let i = 0; i < ring.length; i++) {
        const x = ring[i][0];
        const y = ring[i][1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    };

    if (geom.type === 'Polygon') {
      for (const ring of geom.coordinates) {
        processRing(ring);
      }
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates) {
        for (const ring of poly) {
          processRing(ring);
        }
      }
    }

    return [minX, minY, maxX, maxY];
  }
}

export const waterMaskService = WaterMaskService.getInstance();
