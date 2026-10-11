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
  const isCompleted =
    (status === 'COMPLETED' || (!status && Boolean(georefOutput?.isAvailable))) &&
    Boolean(georefOutput && georefOutput.isAvailable);
  const isAwaiting = status === 'AWAITING_SATELLITE_OBSERVATION';
  const isFailed = status === 'FAILED';
  const isProgress =
    isLoading ||
    status === 'INITIALIZING' ||
    status === 'DISCOVERING_OBSERVATION' ||
    status === 'ACQUIRING_RASTER' ||
    status === 'PREPROCESSING' ||
    status === 'RUNNING_INFERENCE';

  const isLocationMismatch =
    currentIgnitionLat !== undefined &&
    currentIgnitionLon !== undefined &&
    assessmentRequest !== null &&
    (Math.abs(assessmentRequest.ignitionLat - currentIgnitionLat) > 0.05 ||
      Math.abs(assessmentRequest.ignitionLon - currentIgnitionLon) > 0.05);

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
    if (isCompleted) {
      return {
        label: 'Completed',
        color: '#34d399',
        bg: 'rgba(16, 185, 129, 0.12)',
        border: 'rgba(16, 185, 129, 0.3)',
      };
    }
    if (isProgress) {
      return {
        label: 'Processing',
        color: '#fbbf24',
        bg: 'rgba(245, 158, 11, 0.12)',
        border: 'rgba(245, 158, 11, 0.3)',
      };
    }
    if (isAwaiting) {
      return {
        label: 'Awaiting imagery',
        color: '#38bdf8',
        bg: 'rgba(56, 189, 248, 0.12)',
        border: 'rgba(56, 189, 248, 0.3)',
      };
    }
    if (isFailed) {
      return {
        label: 'Unavailable',
        color: '#f87171',
        bg: 'rgba(239, 68, 68, 0.12)',
        border: 'rgba(239, 68, 68, 0.3)',
      };
    }
    return {
      label: 'Ready',
      color: '#94a3b8',
      bg: 'rgba(148, 163, 184, 0.12)',
      border: 'rgba(148, 163, 184, 0.25)',
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
        backgroundColor: 'rgba(15, 20, 30, 0.95)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        boxShadow: '0 16px 40px rgba(0, 0, 0, 0.65)',
        zIndex: 45,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        color: '#f1f5f9',
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
          borderBottom: isMinimized ? 'none' : '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(255, 255, 255, 0.02)',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Satellite size={16} color="var(--accent-cyan)" />
          <h2
            style={{
              fontSize: '0.88rem',
              fontWeight: 600,
              letterSpacing: '0.01em',
              margin: 0,
              color: '#f8fafc',
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
              color: '#94a3b8',
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
              color: '#94a3b8',
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
              color: '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: '2px',
            }}
          >
            <span>
              Observed: <strong style={{ color: '#e2e8f0', fontWeight: 500 }}>{formattedAcquisition}</strong>
            </span>
            <span
              style={{
                fontSize: '0.68rem',
                color: isHistorical ? '#fbbf24' : '#34d399',
              }}
            >
              {isHistorical ? 'Historical baseline' : 'Temporally aligned'}
            </span>
          </div>

          {/* Location Context Notice (if active scenario differs) */}
          {isLocationMismatch && (
            <div
              style={{
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: '6px',
                padding: '8px 10px',
                fontSize: '0.72rem',
                color: '#fde68a',
                lineHeight: 1.4,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <AlertTriangle size={13} color="#f59e0b" style={{ flexShrink: 0 }} />
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
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
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
                  border: '2px solid rgba(255, 255, 255, 0.15)',
                  borderTopColor: 'var(--accent-cyan)',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                  marginBottom: '6px',
                }}
              />
              <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#f1f5f9' }}>
                Analyzing Sentinel-2 satellite data...
              </div>
              <div style={{ fontSize: '0.70rem', color: '#94a3b8', marginTop: '4px' }}>
                {assessmentRequest?.statusMessage || 'Acquiring multispectral bands and computing U-Net inference.'}
              </div>
            </div>
          )}

          {/* Awaiting Imagery State */}
          {!isProgress && isAwaiting && (
            <div
              style={{
                backgroundColor: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '0.74rem',
                lineHeight: 1.4,
                color: '#bae6fd',
              }}
            >
              <div>No local Sentinel-2 observation is currently cached for this coordinate.</div>
              <div style={{ marginTop: '4px', fontSize: '0.68rem', color: '#94a3b8' }}>
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
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '0.74rem',
                lineHeight: 1.4,
                color: '#fca5a5',
              }}
            >
              <div>Assessment unavailable: {assessmentRequest?.statusMessage || 'Unable to process raster data.'}</div>
              {onRetryAssessment && (
                <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={onRetryAssessment}
                    className="glass-button"
                    style={{ padding: '4px 10px', fontSize: '0.70rem', gap: '4px' }}
                  >
                    <RefreshCw size={11} /> Retry
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
                <span style={{ fontSize: '0.70rem', fontWeight: 600, color: '#94a3b8' }}>
                  Observation view
                </span>
                <div
                  role="tablist"
                  aria-label="View selection"
                  style={{
                    display: 'flex',
                    background: 'rgba(0, 0, 0, 0.35)',
                    borderRadius: '6px',
                    padding: '2px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
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
                        background: viewMode === tab.id ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                        color: viewMode === tab.id ? '#ffffff' : '#94a3b8',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '3px 8px',
                        fontSize: '0.67rem',
                        fontWeight: viewMode === tab.id ? 600 : 500,
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
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
                      background: 'rgba(0, 0, 0, 0.3)',
                      borderRadius: '6px',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        padding: '4px 8px',
                        fontSize: '0.66rem',
                        fontWeight: 600,
                        color: '#94a3b8',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                        background: 'rgba(255, 255, 255, 0.02)',
                      }}
                    >
                      Satellite image
                    </div>
                    <div style={{ height: '150px', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img
                        src={rgbUrl}
                        alt="Sentinel-2 Optical RGB"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                    <div style={{ padding: '4px 8px', fontSize: '0.62rem', color: '#64748b' }}>
                      Sentinel-2 True Color (10m)
                    </div>
                  </div>

                  {/* Right: Predicted mask */}
                  <div
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      borderRadius: '6px',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        padding: '4px 8px',
                        fontSize: '0.66rem',
                        fontWeight: 600,
                        color: '#f87171',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                        background: 'rgba(255, 255, 255, 0.02)',
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>Predicted mask</span>
                      <span style={{ color: '#94a3b8', fontWeight: 400 }}>τ = 0.65</span>
                    </div>
                    <div style={{ height: '150px', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img
                        src={binaryMaskUrl}
                        alt="U-Net Predicted Burned Area Mask"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                    <div style={{ padding: '4px 8px', fontSize: '0.62rem', color: '#f87171', fontWeight: 500 }}>
                      {burnedPercentage}% burn scar
                    </div>
                  </div>
                </div>
              )}

              {/* View 2: Single Satellite Image View */}
              {viewMode === 'IMAGE' && (
                <div
                  style={{
                    background: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ height: '220px', background: '#000' }}>
                    <img
                      src={rgbUrl}
                      alt="Sentinel-2 Optical RGB"
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  </div>
                  <div style={{ padding: '6px 10px', fontSize: '0.68rem', color: '#94a3b8' }}>
                    Copernicus Sentinel-2 Level-2A surface reflectance (B04, B03, B02).
                  </div>
                </div>
              )}

              {/* View 3: Single Predicted Mask View */}
              {viewMode === 'MASK' && (
                <div
                  style={{
                    background: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ height: '220px', background: '#000' }}>
                    <img
                      src={binaryMaskUrl}
                      alt="U-Net Predicted Mask"
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  </div>
                  <div style={{ padding: '6px 10px', fontSize: '0.68rem', color: '#f87171' }}>
                    Binary burned area segmentation mask at threshold τ = 0.65.
                  </div>
                </div>
              )}

              {/* View 4: Single Probability Heatmap View */}
              {viewMode === 'PROBABILITY' && (
                <div
                  style={{
                    background: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ height: '220px', background: '#000' }}>
                    <img
                      src={heatmapUrl}
                      alt="U-Net Probability Colormap"
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  </div>
                  <div style={{ padding: '6px 10px', fontSize: '0.68rem', color: '#fbbf24' }}>
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
                    background: 'rgba(255, 255, 255, 0.03)',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                  }}
                >
                  <span style={{ fontSize: '0.65rem', color: '#94a3b8', display: 'block' }}>
                    Predicted burned
                  </span>
                  <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f87171' }}>
                    {burnedPercentage}%
                  </span>
                </div>

                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                  }}
                >
                  <span style={{ fontSize: '0.65rem', color: '#94a3b8', display: 'block' }}>
                    Estimated area
                  </span>
                  <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f1f5f9' }}>
                    {burnedAreaHa} ha
                  </span>
                </div>
              </div>

              {/* 6. One Short Explanation of Temporal Suitability & Scientific Semantics */}
              <div
                style={{
                  backgroundColor: isHistorical ? 'rgba(245, 158, 11, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                  border: isHistorical ? '1px solid rgba(245, 158, 11, 0.25)' : '1px solid rgba(16, 185, 129, 0.25)',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  fontSize: '0.70rem',
                  lineHeight: 1.4,
                  color: isHistorical ? '#fde68a' : '#a7f3d0',
                }}
              >
                {isHistorical ? (
                  <>
                    <strong style={{ color: '#fbbf24' }}>Historical baseline: </strong>
                    Satellite imagery predates the simulation scenario and reflects pre-event surface conditions. The model identifies post-fire scars, not active flames.
                  </>
                ) : (
                  <>
                    <strong style={{ color: '#34d399' }}>Observation aligned: </strong>
                    Acquisition is temporally compatible with the event timeline. Model predictions identify burned area spectral signatures and are distinguished from confirmed observations.
                  </>
                )}
              </div>

              {/* 3D Map Overlay Control */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#f1f5f9' }}>
                    3D map overlay
                  </span>
                  <span style={{ fontSize: '0.64rem', color: '#94a3b8' }}>
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
                    color: showPredictionOnMap ? '#34d399' : '#94a3b8',
                    borderColor: showPredictionOnMap ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255, 255, 255, 0.1)',
                    background: showPredictionOnMap ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.04)',
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
                        background: visualizationMode === m.id ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                        border: visualizationMode === m.id ? '1px solid var(--accent-cyan)' : '1px solid rgba(255, 255, 255, 0.08)',
                        color: visualizationMode === m.id ? 'var(--accent-cyan)' : '#94a3b8',
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
                  borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                  paddingTop: '6px',
                }}
              >
                <button
                  onClick={() => setShowTechnicalDetails((prev) => !prev)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
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
                      background: 'rgba(0, 0, 0, 0.25)',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      fontSize: '0.66rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      color: '#94a3b8',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Checkpoint:</span>
                      <code style={{ color: '#cbd5e1' }}>land8fire_15ch_unet_full_dataset_best.pth</code>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Threshold:</span>
                      <span style={{ color: '#cbd5e1' }}>0.65</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>CRS:</span>
                      <span style={{ color: '#cbd5e1' }}>{georefOutput?.sourceCrs || 'EPSG:32720'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Grid size:</span>
                      <span style={{ color: '#cbd5e1' }}>256 × 256 px (10m resolution)</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Source product:</span>
                      <span style={{ color: '#cbd5e1' }}>Copernicus Sentinel-2 Level-2A</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Simulation ID:</span>
                      <code style={{ color: '#cbd5e1' }}>{assessmentRequest?.simulationId || 'sim_manual'}</code>
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
