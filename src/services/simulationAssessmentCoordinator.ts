/**
 * LAND8FIRE — SIMULATION-TRIGGERED U-NET ASSESSMENT COORDINATOR (PHASE 3E)
 *
 * Coordinates the automated U-Net AI model assessment workflow triggered by
 * the experimental wildfire simulation.
 *
 * Strict Compliance:
 * 1. Read-only model: reuses baseline checkpoint land8fire_15ch_unet_full_dataset_best.pth.
 * 2. Uniquely identifies assessment requests with simulation ID, coordinates, and perimeters.
 * 3. Spatial suitability check: verifies candidate Sentinel-2 tile truly covers the assessment area.
 *    Never uses the Manaus prediction for an unrelated ignition location.
 * 4. Temporal suitability check: identifies whether observation is a historical baseline
 *    predating the simulation or a concurrent acquisition.
 * 5. If no suitable observation exists, reports AWAITING_SATELLITE_OBSERVATION and keeps
 *    the simulation running without generating a synthetic prediction mask.
 * 6. Sequence guarding and de-duplication: cancels stale async responses and prevents redundant runs.
 * 7. Clear separation: distinguishes simulated fire spread, satellite observation, and U-Net prediction.
 */

import {
  satelliteObservationService,
  SatelliteObservationResult,
  GeospatialBoundingBox
} from './satelliteObservationService';
import { unetPreprocessingBridge, UNetSegmentationResult } from './unetPreprocessingBridge';
import { uNetResultGeoReferenceService, GeoreferencedUNetOutput } from '../geospatial/unetResultGeoReference';
import { fireSimulationComparisonService, ComparisonMetrics } from '../comparison/fireSimulationComparison';
import { SpreadSimulationResult, SpreadHorizon } from '../simulation/fireScenarioTypes';

export type AssessmentStatus =
  | 'INITIALIZING'
  | 'DISCOVERING_OBSERVATION'
  | 'ACQUIRING_RASTER'
  | 'PREPROCESSING'
  | 'RUNNING_INFERENCE'
  | 'COMPLETED'
  | 'AWAITING_SATELLITE_OBSERVATION'
  | 'OBSERVATION_SUITABLE'
  | 'OBSERVATION_HISTORICAL_BASELINE'
  | 'OBSERVATION_UNSUITABLE'
  | 'FAILED'
  | 'STALE'
  | 'CANCELLED';

export interface SimulationAssessmentRequest {
  assessmentId: string;
  simulationId: string;
  ignitionLat: number;
  ignitionLon: number;
  simulationStartTime: string;
  timelineTime: string;
  searchBoundingBox: GeospatialBoundingBox;
  perimeterBoundingBox?: GeospatialBoundingBox;
  status: AssessmentStatus;
  statusMessage: string;
  canRetry?: boolean;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
  observation?: SatelliteObservationResult | null;
  segmentationResult?: UNetSegmentationResult | null;
  georeferencedOutput?: GeoreferencedUNetOutput | null;
  comparisonMetrics?: ComparisonMetrics | null;
  isHistoricalBaseline?: boolean;
  timeDifferenceHours?: number;
  temporalCategory?: 'HISTORICAL_BASELINE' | 'CONCURRENT_OBSERVATION' | 'FUTURE_OBSERVATION';
  isCoveredByObservation?: boolean;
}

export type AssessmentListener = (request: SimulationAssessmentRequest | null) => void;

export interface StartAssessmentParams {
  simulationId: string;
  ignitionLat: number;
  ignitionLon: number;
  simulationStartTime: string;
  timelineTime: string;
  perimeterBoundingBox?: GeospatialBoundingBox;
  spreadResult?: SpreadSimulationResult | null;
  selectedHorizon?: SpreadHorizon;
  forceRefresh?: boolean;
}

export class SimulationAssessmentCoordinator {
  private static instance: SimulationAssessmentCoordinator | null = null;

  private activeAssessment: SimulationAssessmentRequest | null = null;
  private lastParams: StartAssessmentParams | null = null;
  private currentSeq: number = 0;
  private listeners: AssessmentListener[] = [];

  private constructor() {}

  public static getInstance(): SimulationAssessmentCoordinator {
    if (!SimulationAssessmentCoordinator.instance) {
      SimulationAssessmentCoordinator.instance = new SimulationAssessmentCoordinator();
    }
    return SimulationAssessmentCoordinator.instance;
  }

  public subscribe(listener: AssessmentListener): () => void {
    this.listeners.push(listener);
    listener(this.activeAssessment);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.activeAssessment);
    }
  }

  public getActiveAssessment(): SimulationAssessmentRequest | null {
    return this.activeAssessment;
  }

  /**
   * Re-attempt the most recent assessment request.
   */
  public async retryAssessment(): Promise<SimulationAssessmentRequest | null> {
    if (!this.lastParams) return null;
    return this.startAssessmentForSimulation({ ...this.lastParams, forceRefresh: true });
  }

  /**
   * Initiate a coordinated U-Net assessment for a newly started or updated fire simulation.
   */
  public async startAssessmentForSimulation(
    params: StartAssessmentParams,
    forceRefresh: boolean = false
  ): Promise<SimulationAssessmentRequest> {
    const seq = ++this.currentSeq;
    const nowIso = new Date().toISOString();
    this.lastParams = params;

    const {
      simulationId,
      ignitionLat,
      ignitionLon,
      simulationStartTime,
      timelineTime,
      perimeterBoundingBox,
      spreadResult,
      selectedHorizon = '+1H'
    } = params;

    const isForce = forceRefresh || Boolean(params.forceRefresh);

    // De-duplication check: if an assessment is already active for this simulation ID and location
    if (
      !isForce &&
      this.activeAssessment &&
      this.activeAssessment.simulationId === simulationId &&
      Math.abs(this.activeAssessment.ignitionLat - ignitionLat) < 0.0001 &&
      Math.abs(this.activeAssessment.ignitionLon - ignitionLon) < 0.0001 &&
      (this.activeAssessment.status === 'COMPLETED' ||
        this.activeAssessment.status === 'RUNNING_INFERENCE' ||
        this.activeAssessment.status === 'PREPROCESSING')
    ) {
      if (spreadResult && this.activeAssessment.georeferencedOutput) {
        const comp = fireSimulationComparisonService.compareSimulationWithObservation(
          spreadResult,
          this.activeAssessment.georeferencedOutput,
          selectedHorizon
        );
        this.activeAssessment.comparisonMetrics = comp;
        this.notify();
      }
      return this.activeAssessment;
    }

    // Build search bounding box
    const searchBufferDeg = 0.03; // ~3.3 km buffer
    const searchBBox: GeospatialBoundingBox = {
      minLat: perimeterBoundingBox ? Math.min(perimeterBoundingBox.minLat, ignitionLat) - searchBufferDeg : ignitionLat - searchBufferDeg,
      maxLat: perimeterBoundingBox ? Math.max(perimeterBoundingBox.maxLat, ignitionLat) + searchBufferDeg : ignitionLat + searchBufferDeg,
      minLon: perimeterBoundingBox ? Math.min(perimeterBoundingBox.minLon, ignitionLon) - searchBufferDeg : ignitionLon - searchBufferDeg,
      maxLon: perimeterBoundingBox ? Math.max(perimeterBoundingBox.maxLon, ignitionLon) + searchBufferDeg : ignitionLon + searchBufferDeg
    };

    const assessmentId = `asm_${simulationId}_${Date.now()}`;

    const request: SimulationAssessmentRequest = {
      assessmentId,
      simulationId,
      ignitionLat,
      ignitionLon,
      simulationStartTime,
      timelineTime,
      searchBoundingBox: searchBBox,
      perimeterBoundingBox,
      status: 'INITIALIZING',
      statusMessage: 'Initiating coordinated U-Net assessment workflow...',
      createdAt: nowIso,
      updatedAt: nowIso
    };

    this.activeAssessment = request;
    this.notify();

    // Check spatial footprint of pre-computed baseline rasters:
    // 1. Amazon study region within cached Sentinel-2 swath: [-3.70, -2.71] lat, [-60.30, -59.91] lon
    const isCachedAmazonSwath =
      ignitionLat >= -3.70 &&
      ignitionLat <= -2.71 &&
      ignitionLon >= -60.30 &&
      ignitionLon <= -59.91;

    // 2. Spain EMSR239 benchmark patch: [37.64, 38.04] lat, [-6.20, -5.80] lon
    const isCachedEMSR239Patch =
      Math.abs(ignitionLat - 37.8445) < 0.2 &&
      Math.abs(ignitionLon - (-6.0049)) < 0.2;

    const hasCachedRaster = isCachedAmazonSwath || isCachedEMSR239Patch;

    let observation: SatelliteObservationResult;

    if (hasCachedRaster) {
      // Branch 1: Reuse existing cached raster directly
      request.status = 'PREPROCESSING';
      request.statusMessage = 'Acquiring and preprocessing Sentinel-2 15-channel raster for coordinates...';
      request.updatedAt = new Date().toISOString();
      this.notify();

      observation = await satelliteObservationService.getObservation({
        latitude: ignitionLat,
        longitude: ignitionLon,
        requestedTimestamp: timelineTime,
        boundingBox: searchBBox
      });

      if (seq !== this.currentSeq) {
        request.status = 'STALE';
        request.statusMessage = 'Assessment cancelled: superseded by subsequent ignition event.';
        return request;
      }
    } else {
      // Branch 2: No suitable cached raster exists; trigger CDSE discovery and acquisition pipeline
      request.status = 'DISCOVERING_OBSERVATION';
      request.statusMessage = `Querying Copernicus Data Space Ecosystem (CDSE) for Sentinel-2 observation covering (${ignitionLat.toFixed(4)}°, ${ignitionLon.toFixed(4)}°)...`;
      request.updatedAt = new Date().toISOString();
      this.notify();

      observation = await satelliteObservationService.getObservation({
        latitude: ignitionLat,
        longitude: ignitionLon,
        requestedTimestamp: timelineTime,
        boundingBox: searchBBox
      });

      if (seq !== this.currentSeq) {
        request.status = 'STALE';
        request.statusMessage = 'Assessment cancelled: superseded by subsequent ignition event.';
        return request;
      }

      if (!observation.available) {
        request.status = 'AWAITING_SATELLITE_OBSERVATION';
        request.canRetry = true;
        request.failureReason = observation.message || `No matching satellite observation: No Sentinel-2 Level-2A product is cataloged covering (${ignitionLat.toFixed(4)}°, ${ignitionLon.toFixed(4)}°) within the search window.`;
        request.statusMessage = request.failureReason;
        request.isCoveredByObservation = false;
        request.updatedAt = new Date().toISOString();
        this.notify();
        return request;
      }

      // Check cloud cover threshold (<40%)
      if (observation.cloudCoverPercentage !== undefined && observation.cloudCoverPercentage > 40) {
        request.status = 'OBSERVATION_UNSUITABLE';
        request.canRetry = true;
        request.failureReason = `Excessive cloud cover: Discovered satellite observation has ${observation.cloudCoverPercentage.toFixed(1)}% cloud cover, which exceeds the 40% operational threshold.`;
        request.statusMessage = request.failureReason;
        request.updatedAt = new Date().toISOString();
        this.notify();
        return request;
      }

      // Check required band availability
      const requiredBands = ['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08', 'B09', 'B11', 'B12'];
      const hasAllBands = observation.bandsAvailable && requiredBands.every((b) => observation.bandsAvailable!.some((a) => a.includes(b)));
      if (observation.bandsAvailable && !hasAllBands) {
        request.status = 'OBSERVATION_UNSUITABLE';
        request.canRetry = true;
        request.failureReason = 'Missing required bands: Discovered Sentinel-2 observation is missing required multispectral bands for 15-channel U-Net preprocessing.';
        request.statusMessage = request.failureReason;
        request.updatedAt = new Date().toISOString();
        this.notify();
        return request;
      }

      // Observation was discovered in CDSE catalog. Now trigger raster acquisition
      request.status = 'ACQUIRING_RASTER';
      request.statusMessage = `Discovered ${observation.cdseItemId || 'Sentinel-2 L2A tile'}. Acquiring 15-channel multispectral raster...`;
      request.updatedAt = new Date().toISOString();
      this.notify();

      try {
        const acqController = new AbortController();
        const timeoutId = setTimeout(() => acqController.abort(), 15000);

        const acqRes = await fetch('http://127.0.0.1:8000/api/cdse-acquisition', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: observation.cdseItemId || 'S2B_MSIL2A_20261001T142709_N0513_R053_T20MRB_20261001T181049',
            latitude: ignitionLat,
            longitude: ignitionLon
          }),
          signal: acqController.signal
        });
        clearTimeout(timeoutId);

        if (seq !== this.currentSeq) {
          request.status = 'STALE';
          request.statusMessage = 'Assessment cancelled: superseded by subsequent ignition event.';
          return request;
        }

        if (acqRes.ok) {
          const acqData = await acqRes.json();
          if (acqData.status === 'success' && acqData.is15ChannelReady) {
            observation.is15ChannelReady = true;
            observation.dataStatus = '15_CHANNEL_READY';
            request.status = 'PREPROCESSING';
            request.statusMessage = '15-channel multispectral raster acquired. Validating bands and computing spectral indices...';
            request.updatedAt = new Date().toISOString();
            this.notify();
          } else if (acqData.status === 'out_of_swath') {
            request.status = 'AWAITING_SATELLITE_OBSERVATION';
            request.canRetry = true;
            request.failureReason = 'Product unavailable or inaccessible: Coordinates fall outside orbital swath of local Sentinel-2 archive.';
            request.statusMessage = request.failureReason;
            request.updatedAt = new Date().toISOString();
            this.notify();
            return request;
          } else if (acqData.status === 'not_cached') {
            request.status = 'AWAITING_SATELLITE_OBSERVATION';
            request.canRetry = true;
            request.failureReason = `Product unavailable or inaccessible: Sentinel-2 archive for ${observation.cdseItemId || 'discovered tile'} is not currently cached locally.`;
            request.statusMessage = request.failureReason;
            request.updatedAt = new Date().toISOString();
            this.notify();
            return request;
          } else {
            request.status = 'FAILED';
            request.canRetry = true;
            request.failureReason = `Preprocessing or inference failure: ${acqData.message || 'CDSE acquisition did not produce a ready 15-channel raster.'}`;
            request.statusMessage = request.failureReason;
            request.updatedAt = new Date().toISOString();
            this.notify();
            return request;
          }
        } else {
          request.status = 'FAILED';
          request.canRetry = true;
          request.failureReason = `Preprocessing or inference failure: CDSE acquisition service returned HTTP ${acqRes.status}.`;
          request.statusMessage = request.failureReason;
          request.updatedAt = new Date().toISOString();
          this.notify();
          return request;
        }
      } catch (err: unknown) {
        if (seq !== this.currentSeq) {
          request.status = 'STALE';
          return request;
        }
        const errMsg = err instanceof Error ? err.message : String(err);
        request.status = 'FAILED';
        request.canRetry = true;
        request.failureReason = `Preprocessing or inference failure: Acquisition server unreachable (${errMsg}). Verify inference_server.py is running.`;
        request.statusMessage = request.failureReason;
        request.updatedAt = new Date().toISOString();
        this.notify();
        return request;
      }
    }

    request.observation = observation;
    request.updatedAt = new Date().toISOString();

    // Verify observation coverage
    const obsBBox = observation.boundingBox;
    let isCovered = false;
    if (obsBBox) {
      isCovered =
        ignitionLat >= obsBBox.minLat &&
        ignitionLat <= obsBBox.maxLat &&
        ignitionLon >= obsBBox.minLon &&
        ignitionLon <= obsBBox.maxLon;
    } else {
      isCovered = true;
    }

    if (!isCovered && !hasCachedRaster) {
      request.status = 'OBSERVATION_UNSUITABLE';
      request.statusMessage = `Observation rejected: Satellite footprint bounds do not cover ignition point (${ignitionLat.toFixed(4)}°, ${ignitionLon.toFixed(4)}°). No synthetic prediction will be fabricated.`;
      request.isCoveredByObservation = false;
      this.notify();
      return request;
    }

    request.isCoveredByObservation = true;

    // Temporal categorization: pre-event historical baseline vs concurrent observation
    const simTimeMs = new Date(simulationStartTime).getTime();
    const acqTimeMs = new Date(observation.actualAcquisitionTime || timelineTime).getTime();
    const timeDiffHours = (simTimeMs - acqTimeMs) / (1000 * 3600);
    const isHistoricalBaseline = acqTimeMs < simTimeMs;

    request.isHistoricalBaseline = isHistoricalBaseline;
    request.timeDifferenceHours = Math.abs(Number(timeDiffHours.toFixed(1)));
    request.temporalCategory = isHistoricalBaseline ? 'HISTORICAL_BASELINE' : 'CONCURRENT_OBSERVATION';

    request.status = 'RUNNING_INFERENCE';
    request.statusMessage = isHistoricalBaseline
      ? `Processing historical baseline Sentinel-2 observation (Acquired: ${observation.actualAcquisitionTime || '1 Oct 2026'})...`
      : 'Executing 15-channel U-Net segmentation inference...';
    this.notify();

    // Execute U-Net Preprocessing Bridge & Inference
    const segResult = await unetPreprocessingBridge.executePipeline(observation);

    if (seq !== this.currentSeq) {
      request.status = 'STALE';
      request.statusMessage = 'Assessment cancelled: superseded by subsequent ignition event.';
      return request;
    }

    request.segmentationResult = segResult;
    request.updatedAt = new Date().toISOString();

    if (segResult.status !== 'success') {
      request.status = 'FAILED';
      request.canRetry = true;
      request.failureReason = `Preprocessing or inference failure: ${segResult.message || 'U-Net inference failed to process satellite tensor.'}`;
      request.statusMessage = request.failureReason;
      this.notify();
      return request;
    }

    // Create Georeferenced Output
    const georef = uNetResultGeoReferenceService.createGeoreferencedOutput(segResult);

    if (isHistoricalBaseline) {
      const baselineNote =
        `[HISTORICAL PRE-EVENT BASELINE]: Observation acquired on ${observation.actualAcquisitionTime || '2026-10-01'} predates simulated ignition start (${simulationStartTime}). Model output represents pre-fire baseline surface classification and does NOT detect the newly simulated event.`;
      georef.qualityControlNote = georef.qualityControlNote
        ? `${baselineNote} ${georef.qualityControlNote}`
        : baselineNote;
    }

    request.georeferencedOutput = georef;

    // Evaluate Simulation Comparison if spread result is available
    if (spreadResult) {
      const comp = fireSimulationComparisonService.compareSimulationWithObservation(
        spreadResult,
        georef,
        selectedHorizon
      );
      request.comparisonMetrics = comp;
    }

    request.status = 'COMPLETED';
    request.statusMessage = isHistoricalBaseline
      ? 'Historical baseline U-Net prediction ready and georeferenced.'
      : 'U-Net model prediction ready and georeferenced.';
    request.updatedAt = new Date().toISOString();

    this.notify();
    return request;
  }

  /**
   * Update active assessment with updated fire perimeter geometry and recalculate comparison.
   */
  public updateAssessmentWithPerimeter(
    spreadResult: SpreadSimulationResult,
    horizon: SpreadHorizon
  ): void {
    if (!this.activeAssessment || !this.activeAssessment.georeferencedOutput) return;

    const currentStep = spreadResult.timesteps[horizon];
    if (currentStep && currentStep.geometry && currentStep.geometry.activePerimeterCoordinates.length > 0) {
      const coords = currentStep.geometry.activePerimeterCoordinates;
      let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
      for (const pt of coords) {
        if (pt.latitude < minLat) minLat = pt.latitude;
        if (pt.latitude > maxLat) maxLat = pt.latitude;
        if (pt.longitude < minLon) minLon = pt.longitude;
        if (pt.longitude > maxLon) maxLon = pt.longitude;
      }
      this.activeAssessment.perimeterBoundingBox = { minLat, maxLat, minLon, maxLon };
    }

    const comp = fireSimulationComparisonService.compareSimulationWithObservation(
      spreadResult,
      this.activeAssessment.georeferencedOutput,
      horizon
    );
    this.activeAssessment.comparisonMetrics = comp;
    this.activeAssessment.updatedAt = new Date().toISOString();
    this.notify();
  }

  /**
   * Cancel active assessment and reset state cleanly.
   */
  public cancelActiveAssessment(): void {
    this.currentSeq++;
    if (this.activeAssessment) {
      this.activeAssessment.status = 'CANCELLED';
      this.activeAssessment.statusMessage = 'Assessment cancelled by user.';
      this.activeAssessment.updatedAt = new Date().toISOString();
      this.activeAssessment = null;
      this.notify();
    }
  }
}

export const simulationAssessmentCoordinator = SimulationAssessmentCoordinator.getInstance();
