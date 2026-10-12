import React, { useState } from 'react';
import {
  Satellite,
  Eye,
  EyeOff,
  AlertTriangle,
  RefreshCw,
  X,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { SimulationAssessmentRequest } from '../../services/simulationAssessmentCoordinator';
import { GeoreferencedUNetOutput } from '../../geospatial/unetResultGeoReference';
import { UNetVisualizationMode } from '../../cesium/unetPredictionLayer';

export interface UNetDetectionPanelProps {
  isOpen: boolean;
  onClose: () => void;
  assessmentRequest: SimulationAssessmentRequest | null;
  georefOutput: GeoreferencedUNetOutput | null;
  currentIgnitionLat?: number;
  currentIgnitionLon?: number;
  isSimulatedFireActive?: boolean;
  showPredictionOnMap: boolean;
  onTogglePredictionOnMap: () => void;
  visualizationMode: UNetVisualizationMode;
  onSelectVisualizationMode: (mode: UNetVisualizationMode) => void;
  onRetryAssessment?: () => void;
  isLoading?: boolean;
}

type ViewMode = 'SIDE_BY_SIDE' | 'IMAGE' | 'MASK' | 'PROBABILITY';

export const UNetDetectionPanel: React.FC<UNetDetectionPanelProps> = ({
  isOpen,
  onClose,
  assessmentRequest,
  georefOutput,
  currentIgnitionLat,
  currentIgnitionLon,
  showPredictionOnMap,
  onTogglePredictionOnMap,
  visualizationMode,
  onSelectVisualizationMode,
  onRetryAssessment,
  isLoading = false,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('SIDE_BY_SIDE');
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState<boolean>(false);

  if (!isOpen) return null;

  const status = assessmentRequest?.status;

  const isLocationMismatch =
    currentIgnitionLat !== undefined &&
    currentIgnitionLon !== undefined &&
    assessmentRequest !== null &&
    (Math.abs(assessmentRequest.ignitionLat - currentIgnitionLat) > 0.005 ||
      Math.abs(assessmentRequest.ignitionLon - currentIgnitionLon) > 0.005);

  const isCompleted =
    !isLocationMismatch &&
    status === 'COMPLETED' &&
    Boolean(georefOutput && georefOutput.isAvailable);

  const isSearching = status === 'DISCOVERING_OBSERVATION';
  const isAcquiring = status === 'ACQUIRING_RASTER';
  const isPreprocessing = status === 'PREPROCESSING';
  const isRunningInference = status === 'RUNNING_INFERENCE';
  const isProgress =
    !isLocationMismatch &&
    (isLoading ||
      status === 'INITIALIZING' ||
      isSearching ||
      isAcquiring ||
      isPreprocessing ||
      isRunningInference);

  const isUnavailable =
    !isLocationMismatch &&
    (status === 'AWAITING_SATELLITE_OBSERVATION' ||
      status === 'OBSERVATION_UNSUITABLE');

  const isFailed = !isLocationMismatch && status === 'FAILED';

  const isHistorical =
    assessmentRequest?.isHistoricalBaseline ||
    assessmentRequest?.temporalCategory === 'HISTORICAL_BASELINE';

  const rgbUrl = georefOutput?.sentinel2RgbUrl || '/data/amazon_sentinel2_rgb.png';
  const binaryMaskUrl = georefOutput?.binaryMaskUrl || '/data/amazon_unet_binary_mask.png';
  const heatmapUrl = georefOutput?.probabilityColormapUrl || '/data/amazon_unet_probability_colormap.png';

  const rawAcquisitionTime =
    assessmentRequest?.observation?.actualAcquisitionTime ||
    georefOutput?.actualAcquisitionTime ||
    '2026-10-01T14:27:09Z';

  // Format date cleanly e.g. "01 Oct 2026, 14:27 UTC"
  let formattedAcquisition = rawAcquisitionTime;
  try {
    const d = new Date(rawAcquisitionTime);
    if (!isNaN(d.getTime())) {
      formattedAcquisition = `${d.toUTCString().replace('GMT', 'UTC').replace(/^..., /, '')}`;
    }
  } catch {
    // Keep raw string
  }

  const burnedPercentage = georefOutput?.predictedBurnedPercentage ?? 0;
  const burnedPixels = georefOutput?.predictedBurnedPixels ?? 0;
  const burnedAreaHa =
    georefOutput?.predictedBurnedAreaHectares ??
    (burnedPixels > 0 ? (burnedPixels * 0.01).toFixed(2) : '0.00');

  const getStatusBadge = () => {
    if (isLocationMismatch) {
      return {
        label: 'Ready to assess',
        color: '#475569',
        bg: '#f1f5f9',
        border: '#cbd5e1',
      };
    }
    if (isCompleted) {
      return {
        label: 'Assessment completed',
        color: 'var(--status-success)',
        bg: 'var(--status-success-bg)',
        border: 'var(--status-success-border)',
      };
    }
    if (isSearching) {
      return {
        label: 'Searching for imagery',
        color: 'var(--accent-blue)',
        bg: 'var(--accent-blue-subtle)',
        border: 'var(--accent-blue-border)',
      };
    }
    if (isAcquiring) {
      return {
        label: 'Acquiring imagery',
        color: 'var(--accent-blue)',
        bg: 'var(--accent-blue-subtle)',
        border: 'var(--accent-blue-border)',
      };
    }
    if (isPreprocessing) {
      return {
        label: 'Preparing model input',
        color: 'var(--status-warning)',
        bg: 'var(--status-warning-bg)',
        border: 'var(--status-warning-border)',
      };
    }
    if (isRunningInference) {
      return {
        label: 'Running U-Net inference',
        color: 'var(--status-warning)',
        bg: 'var(--status-warning-bg)',
        border: 'var(--status-warning-border)',
      };
    }
    if (isUnavailable) {
      return {
        label: 'Imagery unavailable',
        color: 'var(--accent-blue)',
        bg: 'var(--accent-blue-subtle)',
        border: 'var(--accent-blue-border)',
      };
    }
    if (isFailed) {
      return {
        label: 'Assessment failed',
        color: 'var(--status-error)',
        bg: 'var(--status-error-bg)',
        border: 'var(--status-error-border)',
      };
    }
    return {
      label: 'Ready to assess',
      color: '#475569',
      bg: '#f1f5f9',
      border: '#cbd5e1',
    };
  };

  const statusBadge = getStatusBadge();

  return (
    <aside
      aria-label="Fire assessment panel"
      style={{
        position: 'fixed',
        top: '80px',
        right: '24px',
        width: isMinimized ? '340px' : '520px',
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: isMinimized ? '52px' : 'calc(100vh - 100px)',
        backgroundColor: 'var(--bg-surface)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid var(--border-color)',
        borderRadius: '12px',
        boxShadow: 'var(--shadow-floating)',
        zIndex: 45,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-sans)',
        transition: 'width 0.2s ease, max-height 0.2s ease',
        pointerEvents: 'auto',
      }}
    >
      {/* 1. Simple Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: isMinimized ? 'none' : '1px solid var(--border-color)',
          background: 'var(--bg-surface)',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Satellite size={16} color="var(--accent-blue)" />
          <h2
            style={{
              fontSize: '0.88rem',
              fontWeight: 600,
              letterSpacing: '-0.01em',
              margin: 0,
              color: 'var(--text-primary)',
            }}
          >
            Fire assessment
          </h2>
          <span
            style={{
              fontSize: '0.65rem',
              fontWeight: 600,
              padding: '2px 7px',
              borderRadius: '9999px',
              color: statusBadge.color,
              background: statusBadge.bg,
              border: `1px solid ${statusBadge.border}`,
            }}
          >
            {statusBadge.label}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={() => setIsMinimized((prev) => !prev)}
            className="glass-button"
            style={{
              width: '24px',
              height: '24px',
              padding: 0,
              color: 'var(--text-secondary)',
            }}
            title={isMinimized ? 'Expand panel' : 'Minimize panel'}
          >
            {isMinimized ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
          </button>

          <button
            onClick={onClose}
            className="glass-button"
            style={{
              width: '24px',
              height: '24px',
              padding: 0,
              color: 'var(--text-secondary)',
            }}
            title="Close panel"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {!isMinimized && (
        <div
          style={{
            padding: '14px 16px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {/* 2. One Concise Observation-Time Line */}
          <div
            style={{
              fontSize: '0.74rem',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: '2px',
            }}
          >
            <span>
              Observed: <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formattedAcquisition}</strong>
            </span>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 600,
                color: isHistorical ? 'var(--status-warning)' : 'var(--status-success)',
              }}
            >
              {isHistorical ? 'Historical baseline' : 'Temporally aligned'}
            </span>
          </div>

          {/* Location Context Notice (if active scenario differs) */}
          {isLocationMismatch && (
            <div
              style={{
                backgroundColor: 'var(--status-warning-bg)',
                border: '1px solid var(--status-warning-border)',
                borderRadius: '6px',
                padding: '8px 10px',
                fontSize: '0.72rem',
                color: 'var(--status-warning)',
                lineHeight: 1.4,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <AlertTriangle size={13} color="var(--accent-amber)" style={{ flexShrink: 0 }} />
              <span>
                Assessment corresponds to scenario at (
                {assessmentRequest?.ignitionLat.toFixed(3)}°, {assessmentRequest?.ignitionLon.toFixed(3)}°).
              </span>
            </div>
          )}

          {/* In-Progress State */}
          {isProgress && (
            <div
              style={{
                backgroundColor: '#f8fafc',
                border: '1px solid var(--bg-surface-border)',
                borderRadius: '8px',
                padding: '14px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  display: 'inline-block',
                  width: '20px',
                  height: '20px',
                  border: '2px solid #e2e8f0',
                  borderTopColor: 'var(--accent-blue)',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                  marginBottom: '6px',
                }}
              />
              <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {isSearching
                  ? 'Searching for Sentinel-2 imagery...'
                  : isAcquiring
                  ? 'Acquiring multispectral raster...'
                  : isPreprocessing
                  ? 'Preparing 15-channel model input...'
                  : isRunningInference
                  ? 'Running U-Net inference...'
                  : 'Analyzing Sentinel-2 satellite data...'}
              </div>
              <div style={{ fontSize: '0.70rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                {assessmentRequest?.statusMessage || 'Acquiring multispectral bands and computing U-Net inference.'}
              </div>
            </div>
          )}

          {/* Imagery Unavailable State */}
          {!isProgress && isUnavailable && (
            <div
              style={{
                backgroundColor: 'var(--accent-blue-subtle)',
                border: '1px solid var(--accent-blue-border)',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '0.74rem',
                lineHeight: 1.4,
                color: '#0369a1',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '2px' }}>Imagery unavailable</div>
              <div>{assessmentRequest?.statusMessage || 'No suitable Sentinel-2 Level-2A observation could be acquired for this coordinate.'}</div>
              <div style={{ marginTop: '4px', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                Simulated fire spread continues on the 3D map.
              </div>
              {onRetryAssessment && (
                <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={onRetryAssessment}
                    className="glass-button"
                    style={{ padding: '4px 10px', fontSize: '0.70rem', gap: '4px' }}
                  >
                    <RefreshCw size={11} /> Retry acquisition
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Failed State */}
          {!isProgress && isFailed && (
            <div
              style={{
                backgroundColor: 'var(--status-error-bg)',
                border: '1px solid var(--status-error-border)',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '0.74rem',
                lineHeight: 1.4,
                color: 'var(--status-error)',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '2px' }}>Assessment failed</div>
              <div>{assessmentRequest?.statusMessage || 'Unable to process raster data or run model inference.'}</div>
              {onRetryAssessment && (
                <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={onRetryAssessment}
                    className="glass-button"
                    style={{ padding: '4px 10px', fontSize: '0.70rem', gap: '4px' }}
                  >
                    <RefreshCw size={11} /> Retry assessment
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 3 & 4. Primary Views & Segmented Control */}
          {isCompleted && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Segmented Control */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ fontSize: '0.70rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Observation view
                </span>
                <div
                  role="tablist"
                  aria-label="View selection"
                  style={{
                    display: 'flex',
                    background: 'var(--bg-surface-secondary)',
                    borderRadius: '6px',
                    padding: '2px',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  {(
                    [
                      { id: 'SIDE_BY_SIDE', label: 'Side by side' },
                      { id: 'IMAGE', label: 'Image' },
                      { id: 'MASK', label: 'Mask' },
                      { id: 'PROBABILITY', label: 'Probability' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      role="tab"
                      aria-selected={viewMode === tab.id}
                      onClick={() => setViewMode(tab.id)}
                      style={{
                        background: viewMode === tab.id ? 'var(--bg-surface)' : 'transparent',
                        color: viewMode === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '3px 8px',
                        fontSize: '0.67rem',
                        fontWeight: viewMode === tab.id ? 600 : 500,
                        cursor: 'pointer',
                        boxShadow: viewMode === tab.id ? 'var(--shadow-sm)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* View 1: Side by Side (Satellite Image & Predicted Mask) */}
              {viewMode === 'SIDE_BY_SIDE' && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px',
                  }}
                >
                  {/* Left: Satellite image */}
                  <div
                    style={{
                      background: 'var(--bg-surface-secondary)',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        padding: '5px 8px',
                        fontSize: '0.66rem',
                        fontWeight: 600,
                        color: 'var(--text-secondary)',
                        borderBottom: '1px solid var(--border-color)',
                        background: 'var(--bg-surface)',
                      }}
                    >
                      Satellite image
                    </div>
                    <div style={{ height: '150px', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img
                        src={rgbUrl}
                        alt="Sentinel-2 Optical RGB"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                    <div style={{ padding: '4px 8px', fontSize: '0.62rem', color: 'var(--text-secondary)' }}>
                      Sentinel-2 True Color (10m)
                    </div>
                  </div>

                  {/* Right: Predicted mask */}
                  <div
                    style={{
                      background: 'var(--bg-surface-secondary)',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        padding: '5px 8px',
                        fontSize: '0.66rem',
                        fontWeight: 600,
                        color: 'var(--status-error)',
                        borderBottom: '1px solid var(--border-color)',
                        background: 'var(--bg-surface)',
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>Predicted mask</span>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>τ = 0.65</span>
                    </div>
                    <div style={{ height: '150px', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img
                        src={binaryMaskUrl}
                        alt="U-Net Predicted Burned Area Mask"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                    <div style={{ padding: '4px 8px', fontSize: '0.62rem', color: 'var(--status-error)', fontWeight: 600 }}>
                      {burnedPercentage}% burn scar
                    </div>
                  </div>
                </div>
              )}

              {/* View 2: Single Satellite Image View */}
              {viewMode === 'IMAGE' && (
                <div
                  style={{
                    background: '#f8fafc',
                    borderRadius: '6px',
                    border: '1px solid var(--bg-surface-border)',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ height: '220px', background: '#0f172a' }}>
                    <img
                      src={rgbUrl}
                      alt="Sentinel-2 Optical RGB"
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  </div>
                  <div style={{ padding: '6px 10px', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    Copernicus Sentinel-2 Level-2A surface reflectance (B04, B03, B02).
                  </div>
                </div>
              )}

              {/* View 3: Single Predicted Mask View */}
              {viewMode === 'MASK' && (
                <div
                  style={{
                    background: '#f8fafc',
                    borderRadius: '6px',
                    border: '1px solid var(--bg-surface-border)',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ height: '220px', background: '#0f172a' }}>
                    <img
                      src={binaryMaskUrl}
                      alt="U-Net Predicted Mask"
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  </div>
                  <div style={{ padding: '6px 10px', fontSize: '0.68rem', color: 'var(--status-error)' }}>
                    Binary burned area segmentation mask at threshold τ = 0.65.
                  </div>
                </div>
              )}

              {/* View 4: Single Probability Heatmap View */}
              {viewMode === 'PROBABILITY' && (
                <div
                  style={{
                    background: '#f8fafc',
                    borderRadius: '6px',
                    border: '1px solid var(--bg-surface-border)',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ height: '220px', background: '#0f172a' }}>
                    <img
                      src={heatmapUrl}
                      alt="U-Net Probability Colormap"
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  </div>
                  <div style={{ padding: '6px 10px', fontSize: '0.68rem', color: 'var(--status-warning)' }}>
                    Continuous sigmoid confidence colormap (0.0 unburnt to 1.0 high-confidence scar).
                  </div>
                </div>
              )}

              {/* 5. Compact Result Summary */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px',
                  marginTop: '2px',
                }}
              >
                <div
                  style={{
                    background: 'var(--bg-surface-secondary)',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'block' }}>
                    Predicted burned
                  </span>
                  <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-fire)' }}>
                    {burnedPercentage}%
                  </span>
                </div>

                <div
                  style={{
                    background: 'var(--bg-surface-secondary)',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'block' }}>
                    Estimated area
                  </span>
                  <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {burnedAreaHa} ha
                  </span>
                </div>
              </div>


              {/* 3D Map Overlay Control */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  background: 'var(--bg-surface-secondary)',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    3D map overlay
                  </span>
                  <span style={{ fontSize: '0.64rem', color: 'var(--text-secondary)' }}>
                    Off by default to keep simulation unobstructed
                  </span>
                </div>

                <button
                  onClick={onTogglePredictionOnMap}
                  className="glass-button"
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.70rem',
                    fontWeight: 600,
                    gap: '6px',
                    color: showPredictionOnMap ? 'var(--status-success)' : 'var(--text-secondary)',
                    borderColor: showPredictionOnMap ? 'var(--status-success-border)' : 'var(--border-color)',
                    background: showPredictionOnMap ? 'var(--status-success-bg)' : 'var(--bg-surface)',
                  }}
                >
                  {showPredictionOnMap ? <Eye size={12} /> : <EyeOff size={12} />}
                  <span>{showPredictionOnMap ? 'Showing on map' : 'Hidden on map'}</span>
                </button>
              </div>

              {/* If map overlay is ON, show clean mode switcher */}
              {showPredictionOnMap && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '4px',
                  }}
                >
                  {(
                    [
                      { id: 'QUALITY_CONTROL', label: 'QC view' },
                      { id: 'SENTINEL2_RGB', label: 'RGB' },
                      { id: 'BINARY_MASK', label: 'Mask' },
                      { id: 'PROBABILITY_HEATMAP', label: 'Heatmap' },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      onClick={() => onSelectVisualizationMode(m.id)}
                      style={{
                        background: visualizationMode === m.id ? 'var(--accent-forest-subtle)' : 'var(--bg-surface)',
                        border: visualizationMode === m.id ? '1px solid var(--accent-forest)' : '1px solid var(--border-color)',
                        color: visualizationMode === m.id ? 'var(--accent-forest-dark)' : 'var(--text-secondary)',
                        borderRadius: '4px',
                        padding: '3px 6px',
                        fontSize: '0.64rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}

              {/* 7. Collapsible Technical Details Section */}
              <div
                style={{
                  borderTop: '1px solid var(--border-color)',
                  paddingTop: '6px',
                }}
              >
                <button
                  onClick={() => setShowTechnicalDetails((prev) => !prev)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    fontSize: '0.68rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 0',
                  }}
                >
                  {showTechnicalDetails ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <span>Technical details</span>
                </button>

                {showTechnicalDetails && (
                  <div
                    style={{
                      marginTop: '6px',
                      background: 'var(--bg-surface-secondary)',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      fontSize: '0.66rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Checkpoint:</span>
                      <code style={{ color: 'var(--text-primary)' }}>land8fire_15ch_unet_full_dataset_best.pth</code>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Threshold:</span>
                      <span style={{ color: 'var(--text-primary)' }}>0.65</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>CRS:</span>
                      <span style={{ color: 'var(--text-primary)' }}>{georefOutput?.sourceCrs || 'EPSG:32720'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Grid size:</span>
                      <span style={{ color: 'var(--text-primary)' }}>256 × 256 px (10m resolution)</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Source product:</span>
                      <span style={{ color: 'var(--text-primary)' }}>Copernicus Sentinel-2 Level-2A</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Simulation ID:</span>
                      <code style={{ color: 'var(--text-primary)' }}>{assessmentRequest?.simulationId || 'sim_manual'}</code>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
