import React, { useState } from 'react';
import { Flame, ShieldCheck, Crosshair, AlertTriangle, ChevronUp, ChevronDown, Satellite, Thermometer, Zap } from 'lucide-react';
import { FireObservation } from '../../wildfire/fireObservation';
import { CesiumViewerManager } from '../../cesium/viewer';

interface FireObservationPanelProps {
  observation: FireObservation;
}

export const FireObservationPanel: React.FC<FireObservationPanelProps> = ({ observation }) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  const handleFocusFire = () => {
    CesiumViewerManager.getInstance().flyToFireObservation(observation, 2.5);
  };

  return (
    <div
      className="glass-panel"
      style={{
        position: 'absolute',
        top: '84px',
        right: '16px',
        width: '380px',
        maxWidth: 'calc(100vw - 32px)',
        padding: '16px',
        zIndex: 25,
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--status-error-border)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'var(--status-error-bg)',
              border: '1px solid var(--status-error-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Flame size={18} color="var(--status-error)" />
          </div>
          <div>
            <h2 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Active Fire Observation
            </h2>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              {observation.source}
            </p>
          </div>
        </div>

        <button
          className="glass-button"
          style={{ width: '26px', height: '26px', padding: 0 }}
          title={isExpanded ? 'Collapse Panel' : 'Expand Panel'}
        >
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {isExpanded && (
        <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--bg-surface-border)' }}>
          {/* Scientific Provenance Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--status-error-bg)',
              border: '1px solid var(--status-error-border)',
              marginBottom: '12px',
              fontSize: '0.72rem',
              color: 'var(--status-error)',
              fontWeight: 500,
            }}
          >
            <ShieldCheck size={14} />
            <span>Provenance: {observation.classification} / Thermal Observation</span>
          </div>

          {/* Telemetry Metrics */}
          <div
            style={{
              background: 'var(--bg-surface-subtle)',
              border: '1px solid var(--bg-surface-border)',
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              marginBottom: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              fontSize: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Satellite size={12} color="var(--accent-blue)" /> Satellite Instrument:
              </span>
              <strong style={{ color: 'var(--text-primary)' }}>{observation.satelliteInstrument}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Coordinates:</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)' }}>
                {Math.abs(observation.latitude).toFixed(4)}° S, {Math.abs(observation.longitude).toFixed(4)}° W
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Observation Time:</span>
              <span style={{ color: 'var(--text-secondary)' }}>
                {new Date(observation.observationTime).toUTCString()}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Thermometer size={12} color="var(--status-warning)" /> Brightness Temp:
              </span>
              <span style={{ color: 'var(--status-warning)', fontWeight: 600 }}>{observation.brightnessTempK} K</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Zap size={12} color="var(--status-error)" /> Fire Radiative Power (FRP):
              </span>
              <span style={{ color: 'var(--status-error)', fontWeight: 600 }}>{observation.frpMW} MW</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Detection Confidence:</span>
              <span style={{ color: 'var(--status-success)', fontWeight: 600 }}>{observation.confidence}</span>
            </div>
          </div>

          {/* AI Analysis Status Pill */}
          <div
            style={{
              padding: '8px 10px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--status-warning-bg)',
              border: '1px solid var(--status-warning-border)',
              marginBottom: '14px',
              fontSize: '0.72rem',
              color: 'var(--status-warning)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <AlertTriangle size={14} />
            <span>U-Net segmentation analysis: Not run</span>
          </div>

          {/* Action Trigger */}
          <button
            onClick={handleFocusFire}
            className="glass-button"
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: '0.78rem',
              fontWeight: 600,
              gap: '6px',
              background: 'var(--status-error-bg)',
              borderColor: 'var(--status-error-border)',
              color: 'var(--status-error)',
            }}
          >
            <Crosshair size={14} />
            Focus Camera on Fire Observation
          </button>
        </div>
      )}
    </div>
  );
};
