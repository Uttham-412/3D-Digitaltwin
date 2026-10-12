import { useState, useCallback, useEffect, useRef } from 'react';
import { CesiumViewerComponent } from './components/map/CesiumViewer';
import { CameraControls } from './components/map/CameraControls';
import { Header } from './components/ui/Header';
import { LocationPanel } from './components/ui/LocationPanel';
import { ImageryToggle } from './components/ui/ImageryToggle';
import { FireObservationPanel } from './components/wildfire/FireObservationPanel';
import { EMSR239InfoPanel } from './components/ui/EMSR239InfoPanel';
import { EnvironmentalPanel } from './components/ui/EnvironmentalPanel';
import { EnvironmentalFocusControl } from './components/map/EnvironmentalFocusControl';
import { UNetDetectionPanel } from './components/ui/UNetDetectionPanel';
import { FireSpreadPanel } from './components/ui/FireSpreadPanel';
import { ComparisonPanel } from './components/ui/ComparisonPanel';
import { SelectedLocation } from './geospatial/coordinates';
import { SelectionMarkerManager } from './cesium/selectionMarker';
import { FireMarkerManager } from './cesium/fireMarker';
import { WildfireLayerManager } from './cesium/wildfireLayer';
import { SpreadLayerManager } from './cesium/spreadLayer';
import { StudyRegionLayerManager } from './cesium/studyRegionLayer';
import { uNetPredictionLayerManager, UNetVisualizationMode } from './cesium/unetPredictionLayer';
import { CesiumViewerManager } from './cesium/viewer';
import { ImageryType, setImageryLayer } from './cesium/imagery';
import { AMAZON_REAL_WILDFIRE_OBSERVATIONS } from './wildfire/fireObservation';
import { environmentalService } from './environmental/environmentalService';
import { EnvironmentalTimeline } from './environmental/environmentalTypes';
import { GeoreferencedUNetOutput } from './geospatial/unetResultGeoReference';
import { fireSimulationComparisonService, ComparisonMetrics } from './comparison/fireSimulationComparison';
import { simulationClockManager } from './simulation/simulationClock';
import { terrainService } from './geospatial/terrainService';
import { fuelService } from './geospatial/fuelService';
import { fireSpreadModel } from './simulation/fireSpreadModel';
import { Satellite } from 'lucide-react';
import {
  FireState,
  SpreadHorizon,
  SpreadSimulationResult
} from './simulation/fireScenarioTypes';
import {
  simulationAssessmentCoordinator,
  SimulationAssessmentRequest
} from './services/simulationAssessmentCoordinator';

export function App() {
  const [coordinates, setCoordinates] = useState<string>('---, ---');
  const [altitude, setAltitude] = useState<string>('---');
  const [isTerrainLoaded, setIsTerrainLoaded] = useState<boolean>(false);

  // Authoritative Global Selected Location State
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);
  const [currentImagery, setCurrentImagery] = useState<ImageryType>(ImageryType.SATELLITE);

  // Environmental Intelligence State
  const [envTimeline, setEnvTimeline] = useState<EnvironmentalTimeline | null>(null);
  const [isEnvPanelOpen, setIsEnvPanelOpen] = useState<boolean>(false);
  const [isEnvLoading, setIsEnvLoading] = useState<boolean>(false);

  // U-Net Inference & Observation Pipeline State
  const [georefOutput, setGeorefOutput] = useState<GeoreferencedUNetOutput | null>(null);
  const [isInferenceLoading, setIsInferenceLoading] = useState<boolean>(false);

  // Layer Visibility Toggles (Phase 3H: Prediction mask defaults to OFF on 3D globe)
  const [showPredictionLayer, setShowPredictionLayer] = useState<boolean>(false);
  const [showGroundTruthLayer, setShowGroundTruthLayer] = useState<boolean>(true);
  const [showSimulationLayer, setShowSimulationLayer] = useState<boolean>(true);
  const [showWaterContextLayer, setShowWaterContextLayer] = useState<boolean>(true);
  const [visualizationMode, setVisualizationMode] = useState<UNetVisualizationMode>('QUALITY_CONTROL');

  // Simulation-Triggered U-Net Assessment & Dedicated Detection Panel State (Phase 3H)
  const [assessmentRequest, setAssessmentRequest] = useState<SimulationAssessmentRequest | null>(null);
  const [isDetectionPanelOpen, setIsDetectionPanelOpen] = useState<boolean>(false);

  // Subscribe to simulation-triggered assessment coordinator updates (Phase 3E & 3H)
  useEffect(() => {
    const unsubscribe = simulationAssessmentCoordinator.subscribe((req) => {
      setAssessmentRequest(req);
      if (req && req.status === 'COMPLETED' && req.georeferencedOutput) {
        setGeorefOutput(req.georeferencedOutput);
        // Phase 3H: Open dedicated detection panel upon assessment completion without blocking simulation
        setIsDetectionPanelOpen(true);
        if (req.comparisonMetrics) {
          setComparisonMetrics(req.comparisonMetrics);
        }
        const manager = CesiumViewerManager.getInstance();
        const viewer = manager.getViewer();
        if (viewer) {
          // Phase 3H: Update layers in Cesium respecting showPredictionLayer (defaults to false)
          uNetPredictionLayerManager.updateLayers(
            viewer,
            req.georeferencedOutput,
            showGroundTruthLayer,
            visualizationMode,
            showPredictionLayer
          );
        }
      } else if (
        req &&
        (req.status === 'AWAITING_SATELLITE_OBSERVATION' ||
          req.status === 'FAILED' ||
          req.status === 'OBSERVATION_UNSUITABLE' ||
          req.status === 'DISCOVERING_OBSERVATION' ||
          req.status === 'ACQUIRING_RASTER' ||
          req.status === 'PREPROCESSING')
      ) {
        setGeorefOutput(null);
        const manager = CesiumViewerManager.getInstance();
        const viewer = manager.getViewer();
        if (viewer) {
          uNetPredictionLayerManager.clearLayers(viewer);
        }
      } else if (req && req.status === 'CANCELLED') {
        const manager = CesiumViewerManager.getInstance();
        const viewer = manager.getViewer();
        if (viewer) {
          uNetPredictionLayerManager.clearLayers(viewer);
        }
        setGeorefOutput(null);
        setIsDetectionPanelOpen(false);
      }
    });
    return unsubscribe;
  }, [showGroundTruthLayer, visualizationMode, showPredictionLayer]);

  // Simulated Fire & Spread Scenario State (Phase 1)
  const [isSimulatedFireActive, setIsSimulatedFireActive] = useState<boolean>(false);
  const [spreadResult, setSpreadResult] = useState<SpreadSimulationResult | null>(null);
  const [selectedHorizon, setSelectedHorizon] = useState<SpreadHorizon>('+1H');
  const [isSpreadLoading, setIsSpreadLoading] = useState<boolean>(false);
  const [comparisonMetrics, setComparisonMetrics] = useState<ComparisonMetrics | null>(null);
  const [ignitionRejectionMessage, setIgnitionRejectionMessage] = useState<string | null>(null);
  const weatherReqSeqRef = useRef<number>(0);

  const activeFireObservation = AMAZON_REAL_WILDFIRE_OBSERVATIONS[0];

  const handleCoordinatesUpdate = useCallback((coords: string, alt: string) => {
    setCoordinates(coords);
    setAltitude(alt);
  }, []);

  const handleTerrainLoaded = useCallback((status: boolean) => {
    setIsTerrainLoaded(status);
  }, []);

  // Fetch real-time or historical weather when selected location changes with request sequence guarding
  const loadWeatherForLocation = useCallback(async (loc: SelectedLocation) => {
    const seq = ++weatherReqSeqRef.current;
    setIsEnvLoading(true);
    setEnvTimeline(null);
    try {
      const timeline = await environmentalService.fetchEnvironmentalTimeline(
        { latitude: loc.latitude, longitude: loc.longitude },
        loc.label,
        loc.eventDate
      );
      if (seq === weatherReqSeqRef.current) {
        setEnvTimeline(timeline);
        setIsEnvLoading(false);
      }
    } catch {
      if (seq === weatherReqSeqRef.current) {
        setIsEnvLoading(false);
      }
    }
  }, []);

  // Initial Location & Weather Load (Amazon Rainforest Study Region)
  useEffect(() => {
    const defaultLoc: SelectedLocation = {
      id: 'default_amazon',
      latitude: -3.119,
      longitude: -60.0217,
      height: 18000,
      source: 'AMAZON_REGION',
      label: 'Manaus & Anavilhanas Rainforest Reserve, Brazil',
      timestamp: new Date().toISOString()
    };
    setSelectedLocation(defaultLoc);
    loadWeatherForLocation(defaultLoc);
  }, [loadWeatherForLocation]);

  // Update weather whenever authoritative selectedLocation state changes
  useEffect(() => {
    if (selectedLocation) {
      loadWeatherForLocation(selectedLocation);
    }
  }, [selectedLocation, loadWeatherForLocation]);

  // Update 3D selection pin marker in Cesium when location state changes
  useEffect(() => {
    const manager = CesiumViewerManager.getInstance();
    const viewer = manager.getViewer();
    if (viewer) {
      SelectionMarkerManager.getInstance().updateMarker(viewer, selectedLocation);
    }
  }, [selectedLocation]);

  // Render real active fire observation marker, EMSR239 U-Net AI GeoJSON layers, and Amazon Study Region boundary in Cesium
  useEffect(() => {
    const timer = setTimeout(() => {
      const manager = CesiumViewerManager.getInstance();
      const viewer = manager.getViewer();
      if (viewer) {
        FireMarkerManager.getInstance().renderFireObservations(viewer, AMAZON_REAL_WILDFIRE_OBSERVATIONS);
        WildfireLayerManager.getInstance().loadEMSR239Layers(viewer);
        StudyRegionLayerManager.getInstance().renderStudyRegionBoundary(viewer);
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, []);

  // Initial cinematic fly-to to Amazon Rainforest region on load
  useEffect(() => {
    const timer = setTimeout(() => {
      const manager = CesiumViewerManager.getInstance();
      manager.flyToAmazonRegion(3.5);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  // Handle globe click selection callback registration
  const handleSelectLocation = useCallback((location: SelectedLocation) => {
    setSelectedLocation(location);
    setGeorefOutput(null);
    setComparisonMetrics(null);
    setIgnitionRejectionMessage(null);
    setIsSimulatedFireActive(false);
    setSpreadResult(null);
    setIsDetectionPanelOpen(false);
    simulationAssessmentCoordinator.cancelActiveAssessment();
    const manager = CesiumViewerManager.getInstance();
    const viewer = manager.getViewer();
    if (viewer) {
      SpreadLayerManager.getInstance().clearSpread(viewer);
      uNetPredictionLayerManager.clearLayers(viewer);
    }
  }, []);

  const handleClearLocation = useCallback(() => {
    setSelectedLocation(null);
    setGeorefOutput(null);
    setComparisonMetrics(null);
    setIsSimulatedFireActive(false);
    setSpreadResult(null);
    setIgnitionRejectionMessage(null);
    setIsDetectionPanelOpen(false);
    simulationAssessmentCoordinator.cancelActiveAssessment();
    const manager = CesiumViewerManager.getInstance();
    const viewer = manager.getViewer();
    if (viewer) {
      SelectionMarkerManager.getInstance().clear(viewer);
      SpreadLayerManager.getInstance().clearSpread(viewer);
      uNetPredictionLayerManager.clearLayers(viewer);
    }
  }, []);

  const handleSelectImagery = useCallback((type: ImageryType) => {
    setCurrentImagery(type);
    const manager = CesiumViewerManager.getInstance();
    const viewer = manager.getViewer();
    if (viewer) {
      setImageryLayer(viewer, type);
    }
  }, []);

  const handleSelectEnvIndex = useCallback((index: number) => {
    setEnvTimeline((prev) => {
      if (!prev) return null;
      const updated = { ...prev, selectedIndex: index };
      const selectedObs = updated.observations[index];
      if (selectedObs) {
        simulationClockManager.setAuthoritativeTime(selectedObs.timestamp);
      }
      return updated;
    });
  }, []);

  // Execute Phase 2A -> Phase 2B -> Phase 2C Satellite U-Net Pipeline via Assessment Coordinator
  const handleRunInference = useCallback(async () => {
    if (!selectedLocation) return;
    setIsInferenceLoading(true);
    setIsDetectionPanelOpen(true);

    const authTimestamp = (envTimeline && envTimeline.observations[envTimeline.selectedIndex])
      ? envTimeline.observations[envTimeline.selectedIndex].timestamp
      : (selectedLocation.timestamp || new Date().toISOString());

    const simId = isSimulatedFireActive ? `sim_${Date.now()}` : `assess_${Date.now()}`;

    try {
      await simulationAssessmentCoordinator.startAssessmentForSimulation({
        simulationId: simId,
        ignitionLat: selectedLocation.latitude,
        ignitionLon: selectedLocation.longitude,
        simulationStartTime: authTimestamp,
        timelineTime: authTimestamp,
        selectedHorizon: selectedHorizon,
        spreadResult: spreadResult,
        forceRefresh: true
      });
    } catch (err) {
      console.error('[App] Assessment execution error:', err);
    } finally {
      setIsInferenceLoading(false);
    }
  }, [selectedLocation, envTimeline, isSimulatedFireActive, selectedHorizon, spreadResult]);

  // Scenario Lifecycle: Create Ignition with surface burnability & water validation
  const handleCreateIgnition = useCallback(async () => {
    if (!selectedLocation) return;
    setIgnitionRejectionMessage(null);

    const fuel = await fuelService.fetchFuelData({
      latitude: selectedLocation.latitude,
      longitude: selectedLocation.longitude
    });

    const validation = fuelService.validateIgnition(
      { latitude: selectedLocation.latitude, longitude: selectedLocation.longitude },
      fuel
    );

    if (!validation.valid) {
      setIgnitionRejectionMessage(validation.message);
      setIsSimulatedFireActive(false);
      setSpreadResult(null);
      const manager = CesiumViewerManager.getInstance();
      const viewer = manager.getViewer();
      if (viewer) {
        SpreadLayerManager.getInstance().clearSpread(viewer);
      }
      return;
    }

    setIgnitionRejectionMessage(null);
    setIsSimulatedFireActive(true);
    setSpreadResult(null);

    const authTimestamp = (envTimeline && envTimeline.observations[envTimeline.selectedIndex])
      ? envTimeline.observations[envTimeline.selectedIndex].timestamp
      : (selectedLocation.timestamp || new Date().toISOString());

    simulationClockManager.initializeClock(authTimestamp);

    // Phase 3E: Automatically initiate coordinated U-Net assessment workflow for newly started simulation
    const simId = `sim_${Date.now()}`;
    simulationAssessmentCoordinator.startAssessmentForSimulation({
      simulationId: simId,
      ignitionLat: selectedLocation.latitude,
      ignitionLon: selectedLocation.longitude,
      simulationStartTime: authTimestamp,
      timelineTime: authTimestamp,
      selectedHorizon: selectedHorizon
    });
  }, [selectedLocation, envTimeline, selectedHorizon]);

  // Scenario Lifecycle: Remove Fire / Clear Scenario
  const handleRemoveFire = useCallback(() => {
    setIsSimulatedFireActive(false);
    setSpreadResult(null);
    setComparisonMetrics(null);
    setIgnitionRejectionMessage(null);
    setIsDetectionPanelOpen(false);
    simulationClockManager.stopPlayback();
    simulationAssessmentCoordinator.cancelActiveAssessment();
    const manager = CesiumViewerManager.getInstance();
    const viewer = manager.getViewer();
    if (viewer) {
      SpreadLayerManager.getInstance().clearSpread(viewer);
      uNetPredictionLayerManager.clearLayers(viewer);
    }
  }, []);

  // Core fire-spread calculation function
  const executeSpreadSimulation = useCallback(async (
    timeline: EnvironmentalTimeline,
    loc: SelectedLocation,
    horizon: SpreadHorizon
  ) => {
    setIsSpreadLoading(true);
    setIgnitionRejectionMessage(null);

    const fuel = await fuelService.fetchFuelData({
      latitude: loc.latitude,
      longitude: loc.longitude
    });

    const validation = fuelService.validateIgnition(
      { latitude: loc.latitude, longitude: loc.longitude },
      fuel
    );

    if (!validation.valid) {
      setIgnitionRejectionMessage(validation.message);
      setIsSpreadLoading(false);
      setIsSimulatedFireActive(false);
      setSpreadResult(null);
      const manager = CesiumViewerManager.getInstance();
      const viewer = manager.getViewer();
      if (viewer) {
        SpreadLayerManager.getInstance().clearSpread(viewer);
      }
      return null;
    }

    const terrain = await terrainService.fetchTerrainData({
      latitude: loc.latitude,
      longitude: loc.longitude
    });

    const authTimestamp = (timeline.observations[timeline.selectedIndex])
      ? timeline.observations[timeline.selectedIndex].timestamp
      : (loc.eventDate || new Date().toISOString());

    const initialFire: FireState = {
      id: `ign_${Date.now()}`,
      source: 'SIMULATED',
      latitude: loc.latitude,
      longitude: loc.longitude,
      radiusMeters: 150,
      areaHectares: 7.1,
      timestamp: authTimestamp,
      provenance: 'EXPERIMENTAL FIRE-SPREAD SIMULATION'
    };

    const res = fireSpreadModel.runSimulation(initialFire, timeline, terrain, fuel);
    setSpreadResult(res);
    setIsSpreadLoading(false);

    // Update 3D spread visualization on Cesium for horizon
    const manager = CesiumViewerManager.getInstance();
    const viewer = manager.getViewer();
    if (viewer && res.timesteps[horizon]) {
      SpreadLayerManager.getInstance().renderSpreadPrediction(viewer, res.timesteps[horizon]);
    }

    // Phase 3E: Update active assessment with simulated fire perimeter
    simulationAssessmentCoordinator.updateAssessmentWithPerimeter(res, horizon);

    // Phase 2C-D: Evaluate simulation vs observation comparison
    if (georefOutput) {
      const comp = fireSimulationComparisonService.compareSimulationWithObservation(
        res,
        georefOutput,
        horizon
      );
      setComparisonMetrics(comp);
    }

    return res;
  }, [georefOutput]);

  // Scenario Lifecycle: Run Fire Spread Analysis
  const handleRunSpreadAnalysis = useCallback(async () => {
    if (!selectedLocation || !envTimeline) return;
    await executeSpreadSimulation(envTimeline, selectedLocation, selectedHorizon);
  }, [selectedLocation, envTimeline, selectedHorizon, executeSpreadSimulation]);

  // Recompute spread dynamically when user scrubs timeline slider during an active simulation
  useEffect(() => {
    if (isSimulatedFireActive && spreadResult && selectedLocation && envTimeline) {
      executeSpreadSimulation(envTimeline, selectedLocation, selectedHorizon);
    }
  }, [envTimeline?.selectedIndex]);

  // Update 3D spread visualization and synchronize timeline when forecast horizon tab changes
  const handleSelectHorizon = useCallback((h: SpreadHorizon) => {
    setSelectedHorizon(h);
    simulationClockManager.setHorizon(h);

    const horizonHoursMap: Record<SpreadHorizon, number> = {
      '+0H': 0,
      '+1H': 1,
      '+2H': 2,
      '+6H': 6,
      '+12H': 12,
      '+24H': 24
    };
    const offsetHours = horizonHoursMap[h] ?? 0;

    // Synchronize EnvironmentalPanel timeline index with selected horizon
    if (envTimeline && envTimeline.observations && envTimeline.observations.length > 0) {
      const ignitionTime = spreadResult?.initialFireState?.timestamp || envTimeline.observations[0]?.timestamp;
      const ignitionMs = new Date(ignitionTime).getTime();
      const targetMs = ignitionMs + offsetHours * 3600 * 1000;

      let closestIdx = 0;
      let minDiff = Infinity;
      envTimeline.observations.forEach((obs, idx) => {
        const diff = Math.abs(new Date(obs.timestamp).getTime() - targetMs);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = idx;
        }
      });

      setEnvTimeline((prev) => (prev ? { ...prev, selectedIndex: closestIdx } : null));
    }

    if (spreadResult && spreadResult.timesteps[h]) {
      const manager = CesiumViewerManager.getInstance();
      const viewer = manager.getViewer();
      if (viewer) {
        SpreadLayerManager.getInstance().renderSpreadPrediction(viewer, spreadResult.timesteps[h]);
      }
    }

    if (spreadResult && georefOutput) {
      const comp = fireSimulationComparisonService.compareSimulationWithObservation(
        spreadResult,
        georefOutput,
        h
      );
      setComparisonMetrics(comp);
    }
  }, [spreadResult, georefOutput, envTimeline]);

  // Handle Layer Visibility Toggles
  const handleTogglePredictionLayer = useCallback(() => {
    setShowPredictionLayer((prev) => {
      const next = !prev;
      uNetPredictionLayerManager.setPredictionVisibility(next);
      return next;
    });
  }, []);

  const handleToggleGroundTruthLayer = useCallback(() => {
    setShowGroundTruthLayer((prev) => {
      const next = !prev;
      uNetPredictionLayerManager.setGroundTruthVisibility(next);
      return next;
    });
  }, []);

  const handleToggleSimulationLayer = useCallback(() => {
    setShowSimulationLayer((prev) => {
      const next = !prev;
      const manager = CesiumViewerManager.getInstance();
      const viewer = manager.getViewer();
      if (viewer) {
        SpreadLayerManager.getInstance().setSpreadVisibility(viewer, next);
      }
      return next;
    });
  }, []);

  const handleToggleWaterContextLayer = useCallback(() => {
    setShowWaterContextLayer((prev) => {
      const next = !prev;
      uNetPredictionLayerManager.setWaterContextVisibility(next);
      return next;
    });
  }, []);

  const handleSelectVisualizationMode = useCallback((mode: UNetVisualizationMode) => {
    setVisualizationMode(mode);
    uNetPredictionLayerManager.setVisualizationMode(mode);
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      {/* Top Header */}
      <Header
        coordinates={coordinates}
        altitude={altitude}
        isTerrainLoaded={isTerrainLoaded}
        selectedLocation={selectedLocation}
      />

      {/* Main 3D Cesium Map Canvas */}
      <CesiumViewerComponent
        onCoordinatesUpdate={handleCoordinatesUpdate}
        onTerrainLoaded={handleTerrainLoaded}
        onSelectLocation={handleSelectLocation}
      />

      {/* Responsive Non-Overlapping Left Sidebar Dock (Collision-Aware) */}
      <div
        style={{
          position: 'absolute',
          top: '80px',
          left: '20px',
          width: '380px',
          maxWidth: 'calc(50vw - 40px)',
          maxHeight: 'calc(100vh - 120px)',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          zIndex: 35,
          pointerEvents: 'none'
        }}
      >
        <div style={{ pointerEvents: 'auto' }}>
          <LocationPanel
            location={selectedLocation}
            onClear={handleClearLocation}
            onRunInference={handleRunInference}
            isSimulatedFireActive={isSimulatedFireActive}
            onCreateIgnition={handleCreateIgnition}
            onRemoveFire={handleRemoveFire}
            onRunSpreadAnalysis={handleRunSpreadAnalysis}
            ignitionRejectionMessage={ignitionRejectionMessage}
            onOpenDetectionPanel={() => setIsDetectionPanelOpen(true)}
            assessmentRequest={assessmentRequest}
          />
        </div>

        {/* Phase 2C Comparison & Source Panel */}
        {(georefOutput || spreadResult) && (
          <div style={{ pointerEvents: 'auto' }}>
            <ComparisonPanel
              simulationClockTime={simulationClockManager.getState().currentSimulationTime}
              unetOutput={georefOutput}
              comparisonMetrics={comparisonMetrics}
              showPrediction={showPredictionLayer}
              showGroundTruth={showGroundTruthLayer}
              showSimulation={showSimulationLayer}
              showWaterContext={showWaterContextLayer}
              onTogglePrediction={handleTogglePredictionLayer}
              onToggleGroundTruth={handleToggleGroundTruthLayer}
              onToggleSimulation={handleToggleSimulationLayer}
              onToggleWaterContext={handleToggleWaterContextLayer}
            />
          </div>
        )}

        <div style={{ pointerEvents: 'auto' }}>
          <FireSpreadPanel
            simulationResult={spreadResult}
            selectedHorizon={selectedHorizon}
            onSelectHorizon={handleSelectHorizon}
            onClose={() => handleRemoveFire()}
            isLoading={isSpreadLoading}
          />
        </div>


        {selectedLocation?.source === 'EMSR239_EVENT' && (
          <div style={{ pointerEvents: 'auto' }}>
            <EMSR239InfoPanel />
          </div>
        )}

        {selectedLocation?.source === 'FIRMS_FIRE' && activeFireObservation && (
          <div style={{ pointerEvents: 'auto' }}>
            <FireObservationPanel observation={activeFireObservation} />
          </div>
        )}
      </div>

      {/* Time-Aware Environmental Intelligence Panel */}
      <EnvironmentalPanel
        timeline={envTimeline}
        onSelectIndex={handleSelectEnvIndex}
        isOpen={isEnvPanelOpen}
        onClose={() => setIsEnvPanelOpen(false)}
        isLoading={isEnvLoading}
      />

      {/* Floating Navigation Controls */}
      <CameraControls onSelectLocation={handleSelectLocation} />

      {/* Quick Action Button to Toggle Environmental Intelligence Panel */}
      <div style={{ position: 'absolute', bottom: '24px', left: '20px', zIndex: 20 }}>
        <EnvironmentalFocusControl
          isOpen={isEnvPanelOpen}
          onToggle={() => setIsEnvPanelOpen((prev) => !prev)}
        />
      </div>

      {/* Basemap Imagery Layer Switcher */}
      <ImageryToggle
        currentType={currentImagery}
        onSelectType={handleSelectImagery}
      />

      {/* Dedicated Separate U-Net Detection Panel (Phase 3H) */}
      <UNetDetectionPanel
        isOpen={isDetectionPanelOpen}
        onClose={() => setIsDetectionPanelOpen(false)}
        assessmentRequest={assessmentRequest}
        georefOutput={georefOutput}
        currentIgnitionLat={selectedLocation?.latitude}
        currentIgnitionLon={selectedLocation?.longitude}
        isSimulatedFireActive={isSimulatedFireActive}
        showPredictionOnMap={showPredictionLayer}
        onTogglePredictionOnMap={handleTogglePredictionLayer}
        visualizationMode={visualizationMode}
        onSelectVisualizationMode={handleSelectVisualizationMode}
        onRetryAssessment={() => simulationAssessmentCoordinator.retryAssessment()}
        isLoading={isInferenceLoading}
      />

      {/* Floating Action Button to View Fire Assessment */}
      {assessmentRequest && !isDetectionPanelOpen && (
        <div style={{ position: 'absolute', top: '80px', right: '24px', zIndex: 40 }}>
          <button
            onClick={() => setIsDetectionPanelOpen(true)}
            className="glass-button"
            style={{
              padding: '7px 12px',
              fontSize: '0.74rem',
              fontWeight: 600,
              color: '#f8fafc',
              borderColor: 'rgba(255, 255, 255, 0.12)',
              background: 'rgba(15, 20, 30, 0.92)',
              backdropFilter: 'blur(16px)',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
            }}
          >
            <Satellite size={14} color="var(--accent-cyan)" />
            <span>Fire assessment</span>
            <span
              style={{
                fontSize: '0.62rem',
                fontWeight: 600,
                padding: '2px 6px',
                borderRadius: '4px',
                background: assessmentRequest.status === 'COMPLETED' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(56, 189, 248, 0.2)',
                color: assessmentRequest.status === 'COMPLETED' ? '#34d399' : '#7dd3fc',
              }}
            >
              {assessmentRequest.status === 'COMPLETED' ? 'Ready' : 'In progress'}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
