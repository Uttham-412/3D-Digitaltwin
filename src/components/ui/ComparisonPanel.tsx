import React, { useState } from 'react';
import { Layers, AlertCircle, Eye, EyeOff, ChevronDown, ChevronRight, X } from 'lucide-react';
import { ComparisonMetrics } from '../../comparison/fireSimulationComparison';
import { GeoreferencedUNetOutput } from '../../geospatial/unetResultGeoReference';

interface ComparisonPanelProps {
  simulationClockTime: string;
  unetOutput: GeoreferencedUNetOutput | null;
  comparisonMetrics: ComparisonMetrics | null;
  showPrediction: boolean;
  showGroundTruth: boolean;
  showSimulation: boolean;
  showWaterContext?: boolean;
  onTogglePrediction: () => void;
  onToggleGroundTruth: () => void;
  onToggleSimulation: () => void;
  onToggleWaterContext?: () => void;
  onClose?: () => void;
}

export const ComparisonPanel: React.FC<ComparisonPanelProps> = ({
  simulationClockTime,
  unetOutput,
  comparisonMetrics,
  showPrediction,
  showGroundTruth,
  showSimulation,
  showWaterContext = true,
  onTogglePrediction,
  onToggleGroundTruth,
  onToggleSimulation,
  onToggleWaterContext,
  onClose,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  const isSatelliteAvailable = unetOutput?.isAvailable ?? false;
  const isGroundTruthAvailable =
    unetOutput?.isAvailable &&
    Math.abs((unetOutput?.latitude ?? 0) - 37.8445) < 0.2 &&
    Math.abs((unetOutput?.longitude ?? 0) - (-6.0049)) < 0.2;

  const actualAcquisition = unetOutput?.actualAcquisitionTime || 'N/A';
  const isHistoricalObservation = isSatelliteAvailable && actualAcquisition !== 'N/A';

  return (
    <div
      className="glass-panel"
      style={{
        width: '360px',
        maxWidth: 'calc(100vw - 32px)',
        padding: '12px 14px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.55)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Layers size={14} color="var(--accent-cyan)" />
          <h3
            style={{
              margin: 0,
              fontSize: '0.80rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            Map layers & comparison
          </h3>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center' }}>
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
          {onClose && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="glass-button"
              style={{ width: '20px', height: '20px', padding: 0 }}
              title="Close panel"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <>
          {/* Observation vs Clock Timing Line */}
          <div
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.25)',
              padding: '8px 10px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.68rem',
              lineHeight: 1.4,
              color: '#94a3b8',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Simulation time:</span>
              <span style={{ color: '#e2e8f0' }}>{new Date(simulationClockTime).toLocaleTimeString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Acquisition:</span>
              <span style={{ color: isHistoricalObservation ? '#fbbf24' : '#64748b' }}>
                {isHistoricalObservation ? 'Historical pre-event baseline' : 'Unavailable'}
              </span>
            </div>
          </div>

          {/* Map Layer Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {/* 1. Fire Simulation Layer */}
            <div style={layerRowStyle}>
              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#f97316' }}>
                  Fire simulation
                </span>
                <span style={{ fontSize: '0.62rem', color: '#94a3b8', display: 'block' }}>
                  Evolving perimeter
                </span>
              </div>
              <button onClick={onToggleSimulation} style={toggleBtnStyle(showSimulation, '#f97316')}>
                {showSimulation ? <Eye size={11} /> : <EyeOff size={11} />}
                <span>{showSimulation ? 'Visible' : 'Hidden'}</span>
              </button>
            </div>

            {/* 2. U-Net Model Prediction Layer */}
            <div style={layerRowStyle}>
              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#ef4444' }}>
                  U-Net prediction
                </span>
                <span style={{ fontSize: '0.62rem', color: '#94a3b8', display: 'block' }}>
                  Burned area mask (τ = 0.65)
                </span>
              </div>
              <button
                onClick={isSatelliteAvailable ? onTogglePrediction : undefined}
                disabled={!isSatelliteAvailable}
                style={toggleBtnStyle(showPrediction && isSatelliteAvailable, '#ef4444', !isSatelliteAvailable)}
              >
                {showPrediction && isSatelliteAvailable ? <Eye size={11} /> : <EyeOff size={11} />}
                <span>{showPrediction && isSatelliteAvailable ? 'Visible' : 'Hidden'}</span>
              </button>
            </div>

            {/* 3. Water Mask Layer */}
            {unetOutput?.waterMaskUrl && onToggleWaterContext && (
              <div style={layerRowStyle}>
                <div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#00e5ff' }}>
                    Water boundaries
                  </span>
                  <span style={{ fontSize: '0.62rem', color: '#94a3b8', display: 'block' }}>
                    ESA WorldCover 10m
                  </span>
                </div>
                <button onClick={onToggleWaterContext} style={toggleBtnStyle(showWaterContext, '#00e5ff')}>
                  {showWaterContext ? <Eye size={11} /> : <EyeOff size={11} />}
                  <span>{showWaterContext ? 'Visible' : 'Hidden'}</span>
                </button>
              </div>
            )}

            {/* 4. Ground Truth Layer (if benchmark scene) */}
            {isGroundTruthAvailable && (
              <div style={layerRowStyle}>
                <div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#10b981' }}>
                    Ground truth
                  </span>
                  <span style={{ fontSize: '0.62rem', color: '#94a3b8', display: 'block' }}>
                    Copernicus EMS delimitation
                  </span>
                </div>
                <button onClick={onToggleGroundTruth} style={toggleBtnStyle(showGroundTruth, '#10b981')}>
                  {showGroundTruth ? <Eye size={11} /> : <EyeOff size={11} />}
                  <span>{showGroundTruth ? 'Visible' : 'Hidden'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Comparison Metrics */}
          {comparisonMetrics && (
            <div
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.25)',
                padding: '8px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '6px',
                }}
              >
                <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#94a3b8' }}>
                  Spatial overlap
                </span>
                <span
                  style={{
                    fontSize: '0.60rem',
                    fontWeight: 600,
                    padding: '1px 5px',
                    borderRadius: '3px',
                    backgroundColor:
                      comparisonMetrics.status === 'compatible'
                        ? 'rgba(16, 185, 129, 0.15)'
                        : 'rgba(100, 116, 139, 0.15)',
                    color: comparisonMetrics.status === 'compatible' ? '#34d399' : '#94a3b8',
                  }}
                >
                  {comparisonMetrics.status === 'compatible' ? 'Compatible' : 'Incompatible'}
                </span>
              </div>

              {comparisonMetrics.status === 'compatible' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <div style={metricBoxStyle}>
                    <span style={{ fontSize: '0.60rem', color: '#94a3b8', display: 'block' }}>IoU overlap</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#38bdf8' }}>
                      {(comparisonMetrics.iou * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div style={metricBoxStyle}>
                    <span style={{ fontSize: '0.60rem', color: '#94a3b8', display: 'block' }}>Intersection</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#34d399' }}>
                      {comparisonMetrics.intersectionAreaHectares} ha
                    </span>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    fontSize: '0.66rem',
                    color: '#94a3b8',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <AlertCircle size={12} color="#f59e0b" />
                  <span>{comparisonMetrics.message || 'Comparison unavailable for current selection.'}</span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

const layerRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  backgroundColor: 'rgba(255, 255, 255, 0.02)',
  padding: '5px 8px',
  borderRadius: '4px',
};

const metricBoxStyle: React.CSSProperties = {
  backgroundColor: 'rgba(255, 255, 255, 0.03)',
  padding: '4px 6px',
  borderRadius: '4px',
};

function toggleBtnStyle(active: boolean, color: string, disabled: boolean = false): React.CSSProperties {
  return {
    background: disabled ? 'rgba(255, 255, 255, 0.02)' : active ? `${color}20` : 'transparent',
    border: `1px solid ${disabled ? 'rgba(255, 255, 255, 0.08)' : active ? color : 'rgba(255, 255, 255, 0.12)'}`,
    color: disabled ? '#64748b' : active ? color : '#94a3b8',
    borderRadius: '4px',
    padding: '2px 6px',
    fontSize: '0.64rem',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
  };
}
