import React, { useState } from 'react';
import { Cpu, ShieldCheck, Crosshair, ChevronDown, ChevronUp, Info, CheckSquare, Square } from 'lucide-react';
import { CesiumViewerManager } from '../../cesium/viewer';
import { WildfireLayerManager } from '../../cesium/wildfireLayer';

export const EMSR239InfoPanel: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [showPrediction, setShowPrediction] = useState<boolean>(true);
  const [showGroundTruth, setShowGroundTruth] = useState<boolean>(true);
  const [showBoundary, setShowBoundary] = useState<boolean>(true);

  const handleFlyToEvent = () => {
    CesiumViewerManager.getInstance().flyToEMSR239Event(2.5);
  };

  const togglePrediction = () => {
    const next = !showPrediction;
    setShowPrediction(next);
    WildfireLayerManager.getInstance().setPredictionVisibility(next);
  };

  const toggleGroundTruth = () => {
    const next = !showGroundTruth;
    setShowGroundTruth(next);
    WildfireLayerManager.getInstance().setGroundTruthVisibility(next);
  };

  const toggleBoundary = () => {
    const next = !showBoundary;
    setShowBoundary(next);
    WildfireLayerManager.getInstance().setBoundaryVisibility(next);
  };

  return (
    <div
      className="glass-panel"
      style={{
        position: 'relative',
        width: '360px',
        maxWidth: 'calc(100vw - 32px)',
        padding: '16px',
        zIndex: 25,
        borderRadius: 'var(--radius-md)',
        border: '1px solid rgba(245, 158, 11, 0.35)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
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
              background: 'rgba(245, 158, 11, 0.2)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 12px rgba(245, 158, 11, 0.3)',
            }}
          >
            <Cpu size={18} color="#f59e0b" />
          </div>
          <div>
            <h2 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              AI Wildfire Layer — EMSR239
            </h2>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Almadén de la Plata, Spain (Patch 433)
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
        <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {/* Provenance Pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              marginBottom: '12px',
              fontSize: '0.72rem',
              color: '#f59e0b',
              fontWeight: 500,
            }}
          >
            <ShieldCheck size={14} />
            <span>PROVENANCE: DERIVED / 15-CHANNEL U-NET INFERENCE</span>
          </div>

          {/* Model Specification Grid */}
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.35)',
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.75rem',
              marginBottom: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>AI Model:</span>
              <strong style={{ color: 'var(--text-primary)' }}>15-ch U-Net (Epoch 8)</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Inference Threshold:</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>
                0.65 (Frozen)
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Patch ID:</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                r128_c512 (Patch 433)
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Geospatial CRS:</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                EPSG:4326 / WGS84
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>AI Prediction Density:</span>
              <span style={{ color: '#ef4444', fontWeight: 600 }}>
                36.33% (23,811 pixels)
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Observed Ground Truth:</span>
              <span style={{ color: '#34d399', fontWeight: 600 }}>
                36.88% (24,172 pixels)
              </span>
            </div>
          </div>

          {/* Layer Visibility Toggles */}
          <div style={{ marginBottom: '14px' }}>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 600,
                color: 'var(--text-muted)',
                letterSpacing: '0.05em',
                display: 'block',
                marginBottom: '8px',
                textTransform: 'uppercase',
              }}
            >
              GIS Layer Controls
            </span>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.76rem' }}>
              <button
                onClick={togglePrediction}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                {showPrediction ? <CheckSquare size={16} color="#ef4444" /> : <Square size={16} color="var(--text-muted)" />}
                <span>AI Predicted Burned Area (Amber/Red)</span>
              </button>

              <button
                onClick={toggleGroundTruth}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                {showGroundTruth ? <CheckSquare size={16} color="#10b981" /> : <Square size={16} color="var(--text-muted)" />}
                <span>Observed Ground Truth (Green)</span>
              </button>

              <button
                onClick={toggleBoundary}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                {showBoundary ? <CheckSquare size={16} color="var(--accent-cyan)" /> : <Square size={16} color="var(--text-muted)" />}
                <span>Patch 433 Boundary Outline (Cyan)</span>
              </button>
            </div>
          </div>

          {/* Scientific Disclaimer */}
          <div
            style={{
              padding: '8px 10px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(59, 130, 246, 0.12)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              marginBottom: '14px',
              fontSize: '0.7rem',
              color: '#60a5fa',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '6px',
              lineHeight: 1.4,
            }}
          >
            <Info size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>
              This U-Net output represents historical burned-area segmentation. It is not future fire-spread prediction.
            </span>
          </div>

          {/* Action Button */}
          <button
            onClick={handleFlyToEvent}
            className="glass-button"
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: '0.78rem',
              fontWeight: 600,
              gap: '6px',
              background: 'rgba(245, 158, 11, 0.15)',
              borderColor: 'rgba(245, 158, 11, 0.35)',
              color: '#f59e0b',
            }}
          >
            <Crosshair size={14} />
            Center EMSR239 Event Scene
          </button>
        </div>
      )}
    </div>
  );
};
