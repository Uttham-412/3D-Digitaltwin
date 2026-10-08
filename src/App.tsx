import { useState, useCallback, useEffect } from 'react';
import { CesiumViewerComponent } from './components/map/CesiumViewer';
import { CameraControls } from './components/map/CameraControls';
import { Header } from './components/ui/Header';
import { LocationPanel } from './components/ui/LocationPanel';
import { ImageryToggle } from './components/ui/ImageryToggle';
import { AmazonInfoPanel } from './components/ui/AmazonInfoPanel';
import { FireObservationPanel } from './components/wildfire/FireObservationPanel';
import { EMSR239InfoPanel } from './components/ui/EMSR239InfoPanel';
import { EnvironmentalPanel } from './components/ui/EnvironmentalPanel';
import { EnvironmentalFocusControl } from './components/map/EnvironmentalFocusControl';
import { UNetInferencePanel } from './components/ui/UNetInferencePanel';
import { FireSpreadPanel } from './components/ui/FireSpreadPanel';
import { ComparisonPanel } from './components/ui/ComparisonPanel';
import { SelectedLocation } from './geospatial/coordinates';
import { SelectionMarkerManager } from './cesium/selectionMarker';
import { FireMarkerManager } from './cesium/fireMarker';
import { WildfireLayerManager } from './cesium/wildfireLayer';
import { SpreadLayerManager } from './cesium/spreadLayer';
import { StudyRegionLayerManager } from './cesium/studyRegionLayer';
import { uNetPredictionLayerManager } from './cesium/unetPredictionLayer';
import { CesiumViewerManager } from './cesium/viewer';
import { ImageryType, setImageryLayer } from './cesium/imagery';
import { AMAZON_REAL_WILDFIRE_OBSERVATIONS } from './wildfire/fireObservation';
import { environmentalService } from './environmental/environmentalService';
import { EnvironmentalTimeline } from './environmental/environmentalTypes';
import { UNetInferenceResponse } from './services/unetInferenceService';
import { satelliteObservationService } from './services/satelliteObservationService';
import { unetPreprocessingBridge } from './services/unetPreprocessingBridge';
import { uNetResultGeoReferenceService, GeoreferencedUNetOutput } from './geospatial/unetResultGeoReference';
import { fireSimulationComparisonService, ComparisonMetrics } from './comparison/fireSimulationComparison';
import { simulationClockManager } from './simulation/simulationClock';
import { terrainService } from './geospatial/terrainService';
import { fuelService } from './geospatial/fuelService';
import { fireSpreadModel } from './simulation/fireSpreadModel';
import {
  FireState,
  SpreadHorizon,
  SpreadSimulationResult
} from './simulation/fireScenarioTypes';

export function App() {
  const [coordinates, setCoordinates] = useState<string>('---, ---');
  const [altitude, setAltitude] = useState<string>('---');
  const [isTerrainLoaded, setIsTerrainLoaded] = useState<boolean>(false);

  // Authoritative Global Selected Location State
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);
  const [currentImagery, setCurrentImagery] = useState<ImageryType>(ImageryType.SATELLITE);

  // Environmental Intelligence State
  const [envTimeline, setEnvTimeline] = useState<EnvironmentalTimeline | null>(null);
  const [isEnvPanelOpen, setIsEnvPanelOpen] = useState<boolean>(true);
  const [isEnvLoading, setIsEnvLoading] = useState<boolean>(false);

  // U-Net Inference & Observation Pipeline State (Phase 2A, 2B, 2C)
  const [inferenceResult, setInferenceResult] = useState<UNetInferenceResponse | null>(null);
  const [georefOutput, setGeorefOutput] = useState<GeoreferencedUNetOutput | null>(null);
  const [isInferenceLoading, setIsInferenceLoading] = useState<boolean>(false);

  // Layer Visibility Toggles (Phase 2C)
  const [showPredictionLayer, setShowPredictionLayer] = useState<boolean>(true);
  const [showGroundTruthLayer, setShowGroundTruthLayer] = useState<boolean>(true);
  const [showSimulationLayer, setShowSimulationLayer] = useState<boolean>(true);

  // Simulated Fire & Spread Scenario State (Phase 1)
  const [isSimulatedFireActive, setIsSimulatedFireActive] = useState<boolean>(false);
  const [spreadResult, setSpreadResult] = useState<SpreadSimulationResult | null>(null);
  const [selectedHorizon, setSelectedHorizon] = useState<SpreadHorizon>('+1H');
  const [isSpreadLoading, setIsSpreadLoading] = useState<boolean>(false);
  const [comparisonMetrics, setComparisonMetrics] = useState<ComparisonMetrics | null>(null);

  const activeFireObservation = AMAZON_REAL_WILDFIRE_OBSERVATIONS[0];

  const handleCoordinatesUpdate = useCallback((coords: string, alt: string) => {
    setCoordinates(coords);
    setAltitude(alt);
  }, []);

  const handleTerrainLoaded = useCallback((status: boolean) => {
    setIsTerrainLoaded(status);
  }, []);

  // Fetch real-time or historical weather when selected location changes
  const loadWeatherForLocation = useCallback(async (loc: SelectedLocation) => {
    setIsEnvLoading(true);
    setEnvTimeline(null);
    const timeline = await environmentalService.fetchEnvironmentalTimeline(
      { latitude: loc.latitude, longitude: loc.longitude },
      loc.label,
      loc.eventDate
    );
    setEnvTimeline(timeline);
    setIsEnvLoading(false);
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
    setInferenceResult(null);
    setGeorefOutput(null);
    setComparisonMetrics(null);
  }, []);

  const handleClearLocation = useCallback(() => {
    setSelectedLocation(null);
    setInferenceResult(null);
    setGeorefOutput(null);
    setComparisonMetrics(null);
    setIsSimulatedFireActive(false);
    setSpreadResult(null);
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
    setEnvTimeline((prev) => (prev ? { ...prev, selectedIndex: index } : null));
  }, []);

  // Execute Phase 2A -> Phase 2B -> Phase 2C Satellite U-Net Pipeline
  const handleRunInference = useCallback(async () => {
    if (!selectedLocation) return;
    setIsInferenceLoading(true);
    setInferenceResult(null);

    // Phase 2A: Fetch satellite observation metadata
    const obsResult = await satelliteObservationService.getObservation({
      latitude: selectedLocation.latitude,
      longitude: selectedLocation.longitude,
      requestedTimestamp: selectedLocation.timestamp || new Date().toISOString()
    });

    // Phase 2B: Preprocess 15-channel contract and execute U-Net inference
    const segResult = await unetPreprocessingBridge.executePipeline(obsResult);

    // Phase 2C-A: Format georeferenced output
    const georef = uNetResultGeoReferenceService.createGeoreferencedOutput(segResult);
    setGeorefOutput(georef);

    // Backward-compatible UNetInferenceResponse state
    setInferenceResult({
      status: segResult.status === 'success' ? 'success' : 'unavailable',
      latitude: segResult.latitude,
      longitude: segResult.longitude,
      acquisitionTime: segResult.actualAcquisitionTime,
      threshold: segResult.threshold,
      predictedBurnedPixels: segResult.predictedBurnedPixels,
      totalPixels: segResult.totalPixels,
      predictedBurnedPercentage: segResult.predictedBurnedPercentage,
      source: 'Land8Fire U-Net 15-Channel',
      provenance: segResult.provenance,
      message: segResult.message
    });

    // Phase 2C-B: Update Cesium 3D vector prediction & ground truth layers
    const manager = CesiumViewerManager.getInstance();
    const viewer = manager.getViewer();
    if (viewer) {
      await uNetPredictionLayerManager.updateLayers(viewer, georef, showGroundTruthLayer);
    }

    // Phase 2C-D: Evaluate comparison if simulation is also active
    if (spreadResult) {
      const comp = fireSimulationComparisonService.compareSimulationWithObservation(
        spreadResult,
        georef,
        selectedHorizon
      );
      setComparisonMetrics(comp);
    }

    setIsInferenceLoading(false);
  }, [selectedLocation, spreadResult, selectedHorizon, showGroundTruthLayer]);

  // Scenario Lifecycle: Create Ignition
  const handleCreateIgnition = useCallback(() => {
    setIsSimulatedFireActive(true);
    setSpreadResult(null);
    simulationClockManager.initializeClock(selectedLocation?.timestamp);
  }, [selectedLocation]);

  // Scenario Lifecycle: Remove Fire / Clear Scenario
  const handleRemoveFire = useCallback(() => {
    setIsSimulatedFireActive(false);
    setSpreadResult(null);
    setComparisonMetrics(null);
    simulationClockManager.stopPlayback();
    const manager = CesiumViewerManager.getInstance();
    const viewer = manager.getViewer();
    if (viewer) {
      SpreadLayerManager.getInstance().clearSpread(viewer);
    }
  }, []);

  // Scenario Lifecycle: Run Fire Spread Analysis
  const handleRunSpreadAnalysis = useCallback(async () => {
    if (!selectedLocation || !envTimeline) return;
    setIsSpreadLoading(true);

    const terrain = await terrainService.fetchTerrainData({
      latitude: selectedLocation.latitude,
      longitude: selectedLocation.longitude
    });

    const fuel = await fuelService.fetchFuelData({
      latitude: selectedLocation.latitude,
      longitude: selectedLocation.longitude
    });

    const initialFire: FireState = {
      id: `ign_${Date.now()}`,
      source: 'SIMULATED',
      latitude: selectedLocation.latitude,
      longitude: selectedLocation.longitude,
      radiusMeters: 150,
      areaHectares: 7.1,
      timestamp: selectedLocation.eventDate || new Date().toISOString(),
      provenance: 'EXPERIMENTAL FIRE-SPREAD SIMULATION'
    };

    const res = fireSpreadModel.runSimulation(initialFire, envTimeline, terrain, fuel);
    setSpreadResult(res);
    setIsSpreadLoading(false);

    // Update 3D spread visualization on Cesium for current horizon
    const manager = CesiumViewerManager.getInstance();
    const viewer = manager.getViewer();
    if (viewer && res.timesteps[selectedHorizon]) {
      SpreadLayerManager.getInstance().renderSpreadPrediction(viewer, res.timesteps[selectedHorizon]);
    }

    // Phase 2C-D: Evaluate simulation vs observation comparison
    if (georefOutput) {
      const comp = fireSimulationComparisonService.compareSimulationWithObservation(
        res,
        georefOutput,
        selectedHorizon
      );
      setComparisonMetrics(comp);
    }
  }, [selectedLocation, envTimeline, selectedHorizon, georefOutput]);

  // Update 3D spread visualization when forecast horizon tab changes
  const handleSelectHorizon = useCallback((h: SpreadHorizon) => {
    setSelectedHorizon(h);
    simulationClockManager.setHorizon(h);

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
  }, [spreadResult, georefOutput]);

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
              onTogglePrediction={handleTogglePredictionLayer}
              onToggleGroundTruth={handleToggleGroundTruthLayer}
              onToggleSimulation={handleToggleSimulationLayer}
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

        <div style={{ pointerEvents: 'auto' }}>
          <UNetInferencePanel
            response={inferenceResult}
            isLoading={isInferenceLoading}
            onClose={() => setInferenceResult(null)}
          />
        </div>

        {selectedLocation?.source === 'AMAZON_REGION' && (
          <div style={{ pointerEvents: 'auto' }}>
            <AmazonInfoPanel />
          </div>
        )}

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
    </div>
  );
}

export default App;
