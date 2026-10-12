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
        border: '1px solid var(--bg-surface-border)',
        boxShadow: 'var(--shadow-card)',
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
          <Layers size={14} color="var(--accent-blue)" />
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
          <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
          {onClose && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="glass-button"
              style={{ width: '20px', height: '20px', padding: 0, color: 'var(--text-secondary)' }}
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
              backgroundColor: '#f8fafc',
              border: '1px solid var(--bg-surface-border)',
              padding: '8px 10px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.68rem',
              lineHeight: 1.4,
              color: 'var(--text-muted)',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Simulation time:</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{new Date(simulationClockTime).toLocaleTimeString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Acquisition:</span>
              <span style={{ color: isHistoricalObservation ? 'var(--status-warning)' : 'var(--text-muted)', fontWeight: 500 }}>
                {isHistoricalObservation ? 'Historical pre-event baseline' : 'Unavailable'}
              </span>
            </div>
          </div>

          {/* Map Layer Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {/* 1. Fire Simulation Layer */}
            <div style={layerRowStyle}>
              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#ea580c' }}>
                  Fire simulation
                </span>
                <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block' }}>
                  Evolving perimeter
                </span>
              </div>
              <button onClick={onToggleSimulation} style={toggleBtnStyle(showSimulation, '#ea580c')}>
                {showSimulation ? <Eye size={11} /> : <EyeOff size={11} />}
                <span>{showSimulation ? 'Visible' : 'Hidden'}</span>
              </button>
            </div>

            {/* 2. U-Net Model Prediction Layer */}
            <div style={layerRowStyle}>
              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#dc2626' }}>
                  U-Net prediction
                </span>
                <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block' }}>
                  Burned area mask (τ = 0.65)
                </span>
              </div>
              <button
                onClick={isSatelliteAvailable ? onTogglePrediction : undefined}
                disabled={!isSatelliteAvailable}
                style={toggleBtnStyle(showPrediction && isSatelliteAvailable, '#dc2626', !isSatelliteAvailable)}
              >
                {showPrediction && isSatelliteAvailable ? <Eye size={11} /> : <EyeOff size={11} />}
                <span>{showPrediction && isSatelliteAvailable ? 'Visible' : 'Hidden'}</span>
              </button>
            </div>

            {/* 3. Water Mask Layer */}
            {unetOutput?.waterMaskUrl && onToggleWaterContext && (
              <div style={layerRowStyle}>
                <div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--accent-blue)' }}>
                    Water boundaries
                  </span>
                  <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block' }}>
                    ESA WorldCover 10m
                  </span>
                </div>
                <button onClick={onToggleWaterContext} style={toggleBtnStyle(showWaterContext, 'var(--accent-blue)')}>
                  {showWaterContext ? <Eye size={11} /> : <EyeOff size={11} />}
                  <span>{showWaterContext ? 'Visible' : 'Hidden'}</span>
                </button>
              </div>
            )}

            {/* 4. Ground Truth Layer (if benchmark scene) */}
            {isGroundTruthAvailable && (
              <div style={layerRowStyle}>
                <div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--accent-forest)' }}>
                    Ground truth
                  </span>
                  <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block' }}>
                    Copernicus EMS delimitation
                  </span>
                </div>
                <button onClick={onToggleGroundTruth} style={toggleBtnStyle(showGroundTruth, 'var(--accent-forest)')}>
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
                backgroundColor: '#f8fafc',
                border: '1px solid var(--bg-surface-border)',
                padding: '8px 10px',
                borderRadius: 'var(--radius-sm)',
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
                <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)' }}>
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
                        ? 'var(--status-success-bg)'
                        : '#f1f5f9',
                    color: comparisonMetrics.status === 'compatible' ? 'var(--status-success)' : 'var(--text-muted)',
                    border: comparisonMetrics.status === 'compatible' ? '1px solid var(--status-success-border)' : '1px solid #cbd5e1',
                  }}
                >
                  {comparisonMetrics.status === 'compatible' ? 'Compatible' : 'Incompatible'}
                </span>
              </div>

              {comparisonMetrics.status === 'compatible' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <div style={metricBoxStyle}>
                    <span style={{ fontSize: '0.60rem', color: 'var(--text-muted)', display: 'block' }}>IoU overlap</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-blue)' }}>
                      {(comparisonMetrics.iou * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div style={metricBoxStyle}>
                    <span style={{ fontSize: '0.60rem', color: 'var(--text-muted)', display: 'block' }}>Intersection</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-forest)' }}>
                      {comparisonMetrics.intersectionAreaHectares} ha
                    </span>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    fontSize: '0.66rem',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <AlertCircle size={12} color="var(--accent-amber)" />
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
  backgroundColor: '#ffffff',
  border: '1px solid var(--bg-surface-border)',
  boxShadow: 'var(--shadow-sm)',
  padding: '6px 10px',
  borderRadius: 'var(--radius-sm)',
};

const metricBoxStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid var(--bg-surface-border)',
  boxShadow: 'var(--shadow-sm)',
  padding: '5px 8px',
  borderRadius: 'var(--radius-sm)',
};

function toggleBtnStyle(active: boolean, _color: string, disabled: boolean = false): React.CSSProperties {
  return {
    background: disabled ? '#f8fafc' : active ? 'var(--status-success-bg)' : '#ffffff',
    border: `1px solid ${disabled ? 'var(--bg-surface-border)' : active ? 'var(--status-success-border)' : 'var(--bg-surface-border-strong)'}`,
    color: disabled ? 'var(--text-muted)' : active ? 'var(--status-success)' : 'var(--text-secondary)',
    borderRadius: '4px',
    padding: '2px 7px',
    fontSize: '0.64rem',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  };
}
