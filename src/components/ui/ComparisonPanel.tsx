/**
 * LAND8FIRE — SIMULATION VS OBSERVATION COMPARISON PANEL (PHASE 2C-G)
 *
 * Clean operator panel providing strict 4-way data source separation:
 * 1. EXPERIMENTAL FIRE-SPREAD SIMULATION
 * 2. REAL SATELLITE OBSERVATION
 * 3. U-NET MODEL PREDICTION
 * 4. GROUND TRUTH
 *
 * Displays spatial comparison metrics (IoU, Over/Underestimation) only when
 * simulation and observation are spatially and temporally compatible.
 */

import React from 'react';
import { Layers, AlertCircle, Eye, EyeOff, Clock } from 'lucide-react';
import { ComparisonMetrics } from '../../comparison/fireSimulationComparison';
import { GeoreferencedUNetOutput } from '../../geospatial/unetResultGeoReference';

interface ComparisonPanelProps {
  simulationClockTime: string;
  unetOutput: GeoreferencedUNetOutput | null;
  comparisonMetrics: ComparisonMetrics | null;
  showPrediction: boolean;
  showGroundTruth: boolean;
  showSimulation: boolean;
  onTogglePrediction: () => void;
  onToggleGroundTruth: () => void;
  onToggleSimulation: () => void;
  onClose?: () => void;
}

export const ComparisonPanel: React.FC<ComparisonPanelProps> = ({
  simulationClockTime,
  unetOutput,
  comparisonMetrics,
  showPrediction,
  showGroundTruth,
  showSimulation,
  onTogglePrediction,
  onToggleGroundTruth,
  onToggleSimulation,
  onClose
}) => {
  const isSatelliteAvailable = unetOutput?.isAvailable ?? false;
  const isGroundTruthAvailable =
    unetOutput?.isAvailable &&
    Math.abs((unetOutput?.latitude ?? 0) - 37.8445) < 0.2 &&
    Math.abs((unetOutput?.longitude ?? 0) - (-6.0049)) < 0.2;

  const actualAcquisition = unetOutput?.actualAcquisitionTime || 'N/A';
  const isHistoricalObservation =
    isSatelliteAvailable && actualAcquisition !== 'N/A';

  return (
    <div
      style={{
        backgroundColor: 'rgba(15, 23, 42, 0.94)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(56, 189, 248, 0.35)',
        borderRadius: '16px',
        padding: '18px',
        color: '#F8FAFC',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        marginBottom: '12px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
        width: '360px'
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          paddingBottom: '10px',
          marginBottom: '14px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={16} color="#38BDF8" />
          <h3
            style={{
              margin: 0,
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: '#38BDF8'
            }}
          >
            DATA SOURCES & COMPARISON
          </h3>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Temporal Integrity Section */}
      <div
        style={{
          backgroundColor: 'rgba(30, 41, 59, 0.6)',
          padding: '10px 12px',
          borderRadius: '8px',
          marginBottom: '12px',
          fontSize: '11px',
          lineHeight: 1.45
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#38BDF8', fontWeight: 700, marginBottom: '4px' }}>
          <Clock size={13} />
          <span>TEMPORAL INTEGRITY</span>
        </div>
        <div><strong>Simulation Clock:</strong> {new Date(simulationClockTime).toLocaleString()}</div>
        <div><strong>Satellite Acquisition:</strong> {isHistoricalObservation ? new Date(actualAcquisition).toLocaleString() : 'SATELLITE OBSERVATION: NOT AVAILABLE'}</div>
        {isHistoricalObservation && (
          <div style={{ fontSize: '10px', color: '#FBBF24', fontStyle: 'italic', marginTop: '4px' }}>
            Note: Observation is historical satellite telemetry; not a real-time feed.
          </div>
        )}
      </div>

      {/* Source Toggles Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.05em', marginBottom: '2px' }}>
          MAP LAYERS & PROVENANCE
        </div>

        {/* 1. Simulation Layer */}
        <div style={layerRowStyle}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#F97316' }}>EXPERIMENTAL SIMULATION</div>
            <div style={{ fontSize: '9.5px', color: '#94A3B8' }}>Time-evolving directional fire spread</div>
          </div>
          <button onClick={onToggleSimulation} style={toggleBtnStyle(showSimulation, '#F97316')}>
            {showSimulation ? <Eye size={12} /> : <EyeOff size={12} />}
            {showSimulation ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* 2. Satellite Observation Status */}
        <div style={layerRowStyle}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: isSatelliteAvailable ? '#10B981' : '#64748B' }}>
              SATELLITE OBSERVATION
            </div>
            <div style={{ fontSize: '9.5px', color: '#94A3B8' }}>
              {isSatelliteAvailable ? 'Sentinel-2 L2A Telemetry' : 'NOT AVAILABLE'}
            </div>
          </div>
          <span style={statusBadgeStyle(isSatelliteAvailable)}>
            {isSatelliteAvailable ? 'AVAILABLE' : 'UNAVAILABLE'}
          </span>
        </div>

        {/* 3. U-Net Model Prediction Layer */}
        <div style={layerRowStyle}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#EF4444' }}>U-NET MODEL PREDICTION</div>
            <div style={{ fontSize: '9.5px', color: '#94A3B8' }}>Checkpoint: land8fire_15ch_unet_...</div>
          </div>
          <button
            onClick={isSatelliteAvailable ? onTogglePrediction : undefined}
            disabled={!isSatelliteAvailable}
            style={toggleBtnStyle(showPrediction && isSatelliteAvailable, '#EF4444', !isSatelliteAvailable)}
          >
            {showPrediction && isSatelliteAvailable ? <Eye size={12} /> : <EyeOff size={12} />}
            {showPrediction && isSatelliteAvailable ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* 4. Ground Truth Layer */}
        {isGroundTruthAvailable && (
          <div style={layerRowStyle}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#10B981' }}>GROUND TRUTH</div>
              <div style={{ fontSize: '9.5px', color: '#94A3B8' }}>EMSR239 Verified Ground Delimitation</div>
            </div>
            <button onClick={onToggleGroundTruth} style={toggleBtnStyle(showGroundTruth, '#10B981')}>
              {showGroundTruth ? <Eye size={12} /> : <EyeOff size={12} />}
              {showGroundTruth ? 'ON' : 'OFF'}
            </button>
          </div>
        )}
      </div>

      {/* Comparison Metrics Section */}
      <div style={{ backgroundColor: 'rgba(30, 41, 59, 0.6)', padding: '12px', borderRadius: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#FDBA74', letterSpacing: '0.05em' }}>
            SIMULATION VS OBSERVATION COMPARISON
          </div>
          <span style={statusBadgeStyle(comparisonMetrics?.status === 'compatible')}>
            {comparisonMetrics?.status === 'compatible' ? 'COMPATIBLE' : 'INCOMPATIBLE'}
          </span>
        </div>

        {comparisonMetrics?.status === 'compatible' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <div style={metricBoxStyle}>
                <div style={{ fontSize: '9.5px', color: '#94A3B8' }}>INTERSECTION OVER UNION</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#38BDF8' }}>
                  {(comparisonMetrics.iou * 100).toFixed(1)}% <span style={{ fontSize: '10px' }}>({comparisonMetrics.iou.toFixed(3)})</span>
                </div>
              </div>
              <div style={metricBoxStyle}>
                <div style={{ fontSize: '9.5px', color: '#94A3B8' }}>INTERSECTION AREA</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#10B981' }}>
                  {comparisonMetrics.intersectionAreaHectares} <span style={{ fontSize: '10px' }}>ha</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <div style={metricBoxStyle}>
                <div style={{ fontSize: '9.5px', color: '#94A3B8' }}>OVERESTIMATION</div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#F97316' }}>
                  +{comparisonMetrics.simulationOverestimationHectares} ha
                </div>
              </div>
              <div style={metricBoxStyle}>
                <div style={{ fontSize: '9.5px', color: '#94A3B8' }}>UNDERESTIMATION</div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#EF4444' }}>
                  -{comparisonMetrics.simulationUnderestimationHectares} ha
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '10.5px', color: '#94A3B8', lineHeight: 1.4, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertCircle size={14} color="#F59E0B" />
            <span>{comparisonMetrics?.message || 'Comparison unavailable for current spatial/temporal selection.'}</span>
          </div>
        )}
      </div>
    </div>
  );
};

const layerRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  backgroundColor: 'rgba(255, 255, 255, 0.03)',
  padding: '6px 10px',
  borderRadius: '6px'
};

const metricBoxStyle: React.CSSProperties = {
  backgroundColor: 'rgba(15, 23, 42, 0.6)',
  padding: '6px 8px',
  borderRadius: '6px'
};

function toggleBtnStyle(active: boolean, color: string, disabled: boolean = false): React.CSSProperties {
  return {
    background: disabled ? 'rgba(255, 255, 255, 0.05)' : active ? `${color}25` : 'rgba(30, 41, 59, 0.6)',
    border: `1px solid ${disabled ? 'rgba(255, 255, 255, 0.1)' : active ? color : 'rgba(255, 255, 255, 0.15)'}`,
    color: disabled ? '#64748B' : active ? color : '#94A3B8',
    borderRadius: '4px',
    padding: '3px 8px',
    fontSize: '10px',
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  };
}

function statusBadgeStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: '9.5px',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: active ? 'rgba(16, 185, 129, 0.2)' : 'rgba(100, 116, 139, 0.2)',
    color: active ? '#10B981' : '#94A3B8',
    border: `1px solid ${active ? 'rgba(16, 185, 129, 0.4)' : 'rgba(100, 116, 139, 0.3)'}`
  };
}
