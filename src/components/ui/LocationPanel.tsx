import React from 'react';
import { MapPin, X, Mountain, ShieldCheck, Crosshair, ExternalLink, AlertTriangle } from 'lucide-react';
import { SelectedLocation, formatCoordinates } from '../../geospatial/coordinates';
import { CesiumViewerManager } from '../../cesium/viewer';
import { isPointInAmazonStudyRegion } from '../../config/studyRegion';
import { ForestConditionPanel } from './ForestConditionPanel';

interface LocationPanelProps {
  location: SelectedLocation | null;
  onClear: () => void;
  onRunInference?: () => void;
  isSimulatedFireActive?: boolean;
  onCreateIgnition?: () => void;
  onRemoveFire?: () => void;
  onRunSpreadAnalysis?: () => void;
}

export const LocationPanel: React.FC<LocationPanelProps> = ({
  location,
  onClear,
  onRunInference,
  isSimulatedFireActive = false,
  onCreateIgnition,
  onRemoveFire,
  onRunSpreadAnalysis
}) => {
  if (!location) return null;

  const isInAmazon = isPointInAmazonStudyRegion(location.latitude, location.longitude);

  const handleFlyTo = () => {
    const manager = CesiumViewerManager.getInstance();
    manager.flyToLocation(location.latitude, location.longitude, location.height);
  };

  const heightVal = location.height ?? 0;
  const elevationFeet = (heightVal * 3.28084).toFixed(0);

  return (
    <div
      className="glass-panel"
      style={{
        position: 'relative',
        width: '380px',
        maxWidth: 'calc(100vw - 48px)',
        padding: '20px',
        zIndex: 35,
        borderRadius: 'var(--radius-lg)',
        border: isSimulatedFireActive
          ? '1px solid rgba(249, 115, 22, 0.5)'
          : isInAmazon
          ? '1px solid rgba(16, 185, 129, 0.4)'
          : '1px solid rgba(245, 158, 11, 0.4)',
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6)',
        animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: isSimulatedFireActive
                ? 'rgba(249, 115, 22, 0.15)'
                : isInAmazon
                ? 'rgba(16, 185, 129, 0.15)'
                : 'rgba(245, 158, 11, 0.15)',
              border: isSimulatedFireActive
                ? '1px solid #F97316'
                : isInAmazon
                ? '1px solid #10B981'
                : '1px solid #F59E0B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MapPin size={18} color={isSimulatedFireActive ? '#F97316' : isInAmazon ? '#10B981' : '#F59E0B'} />
          </div>
          <div>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {location.label || 'Selected Location'}
            </h2>
            <span style={{ fontSize: '0.7rem', color: isInAmazon ? '#34D399' : '#FBBF24', fontWeight: 600 }}>
              {isInAmazon ? 'AMAZON DIGITAL TWIN STUDY REGION' : 'GLOBAL CONTEXT MODE (OUTSIDE STUDY REGION)'}
            </span>
          </div>
        </div>

        <button
          onClick={onClear}
          className="glass-button"
          style={{ width: '28px', height: '28px', borderRadius: '50%' }}
          title="Deselect Location"
        >
          <X size={16} />
        </button>
      </div>

      {/* Provenance & Study Region Status Badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          borderRadius: 'var(--radius-sm)',
          background: isSimulatedFireActive
            ? 'rgba(249, 115, 22, 0.15)'
            : isInAmazon
            ? 'rgba(16, 185, 129, 0.12)'
            : 'rgba(245, 158, 11, 0.12)',
          border: isSimulatedFireActive
            ? '1px solid rgba(249, 115, 22, 0.35)'
            : isInAmazon
            ? '1px solid rgba(16, 185, 129, 0.25)'
            : '1px solid rgba(245, 158, 11, 0.25)',
          marginBottom: '14px',
          fontSize: '0.72rem',
          color: isSimulatedFireActive ? '#FDBA74' : isInAmazon ? '#34d399' : '#fbbf24',
          fontWeight: 600,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ShieldCheck size={14} />
          <span>PROVENANCE: {isSimulatedFireActive ? 'SIMULATED / USER-DEFINED SCENARIO' : `${location.classification || 'OBSERVED'} / USER_SELECTED`}</span>
        </div>
      </div>

      {/* Telemetry Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '10px',
          marginBottom: '14px',
        }}
      >
        {/* Coordinates */}
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.35)',
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
            COORDINATES (WGS84)
          </span>
          <span
            style={{
              fontSize: '0.82rem',
              fontWeight: 600,
              fontFamily: 'var(--font-mono)',
              color: 'var(--accent-cyan)',
            }}
          >
            {formatCoordinates(location.latitude, location.longitude)}
          </span>
        </div>

        {/* Elevation */}
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.35)',
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
            <Mountain size={12} color="var(--text-muted)" />
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>TERRAIN ELEVATION</span>
          </div>
          <span
            style={{
              fontSize: '0.82rem',
              fontWeight: 600,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-primary)',
            }}
          >
            {heightVal.toLocaleString()} m{' '}
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>
              ({elevationFeet} ft)
            </span>
          </span>
        </div>
      </div>

      {/* Outside Amazon Restriction Warning Banner */}
      {!isInAmazon && (
        <div
          style={{
            backgroundColor: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 12px',
            marginBottom: '14px',
            color: '#FBBF24',
            fontSize: '0.72rem',
            lineHeight: 1.45
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, marginBottom: '4px' }}>
            <AlertTriangle size={14} color="#FBBF24" />
            <span>AMAZON STUDY REGION ONLY</span>
          </div>
          <div>
            Wildfire analysis, scenario creation, U-Net AI inference, and fire-spread simulation are restricted to the Land8Fire Amazon Rainforest Digital Twin study region.
          </div>
        </div>
      )}

      {/* Action Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleFlyTo}
            className="glass-button"
            style={{
              flex: 1,
              padding: '8px 12px',
              fontSize: '0.78rem',
              fontWeight: 500,
              gap: '6px',
            }}
          >
            <Crosshair size={14} color="var(--accent-cyan)" />
            Center Camera
          </button>

          {onRunInference && (
            <button
              onClick={isInAmazon ? onRunInference : undefined}
              disabled={!isInAmazon}
              className="glass-button"
              style={{
                flex: 1.4,
                padding: '8px 12px',
                fontSize: '0.78rem',
                fontWeight: 600,
                gap: '6px',
                color: isInAmazon ? '#EF4444' : '#64748B',
                borderColor: isInAmazon ? 'rgba(239, 68, 68, 0.4)' : 'rgba(255, 255, 255, 0.1)',
                background: isInAmazon ? 'rgba(239, 68, 68, 0.1)' : 'rgba(30, 41, 59, 0.4)',
                cursor: isInAmazon ? 'pointer' : 'not-allowed',
                opacity: isInAmazon ? 1 : 0.6
              }}
              title={isInAmazon ? "Run U-Net AI Burned-Area Segmentation Inference" : "Restricted to Amazon Study Region"}
            >
              <ExternalLink size={14} color={isInAmazon ? "#EF4444" : "#64748B"} />
              Analyze with U-Net AI
            </button>
          )}
        </div>

        {/* U-Net Scientific Semantics Note */}
        {isInAmazon && (
          <div
            style={{
              fontSize: '0.66rem',
              color: '#94A3B8',
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              padding: '6px 8px',
              borderRadius: 'var(--radius-sm)',
              borderLeft: '2px solid #38BDF8',
              lineHeight: 1.35
            }}
          >
            <strong>Scientific Note:</strong> The user-defined ignition establishes a hypothetical scenario condition. U-Net analysis independently processes available real Sentinel-2 multispectral satellite imagery.
          </div>
        )}

        {/* Divider */}
        <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', margin: '4px 0' }} />

        {/* Forest Condition Section */}
        <ForestConditionPanel
          hasActiveFireData={false}
          hasBurnedAreaGroundTruth={location.source === 'EMSR239_EVENT'}
        />

        {/* Divider */}
        <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', margin: '4px 0' }} />

        {/* Scenario Ignition & Spread Analysis Controls */}
        <div style={{ display: 'flex', gap: '8px', paddingTop: '4px' }}>
          {!isSimulatedFireActive ? (
            <button
              onClick={isInAmazon ? onCreateIgnition : undefined}
              disabled={!isInAmazon}
              className="glass-button"
              style={{
                flex: 1,
                padding: '8px 12px',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: isInAmazon ? '#F97316' : '#64748B',
                borderColor: isInAmazon ? 'rgba(249, 115, 22, 0.5)' : 'rgba(255, 255, 255, 0.1)',
                background: isInAmazon ? 'rgba(249, 115, 22, 0.15)' : 'rgba(30, 41, 59, 0.4)',
                cursor: isInAmazon ? 'pointer' : 'not-allowed',
                opacity: isInAmazon ? 1 : 0.6
              }}
              title={isInAmazon ? "Place a hypothetical ignition point at selected location" : "Restricted to Amazon Study Region"}
            >
              🔥 CREATE FIRE SCENARIO
            </button>
          ) : (
            <>
              {onRunSpreadAnalysis && (
                <button
                  onClick={isInAmazon ? onRunSpreadAnalysis : undefined}
                  disabled={!isInAmazon}
                  className="glass-button"
                  style={{
                    flex: 1.2,
                    padding: '8px 10px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: isInAmazon ? '#FDBA74' : '#64748B',
                    borderColor: isInAmazon ? 'rgba(249, 115, 22, 0.6)' : 'rgba(255, 255, 255, 0.1)',
                    background: isInAmazon ? 'rgba(249, 115, 22, 0.25)' : 'rgba(30, 41, 59, 0.4)',
                    cursor: isInAmazon ? 'pointer' : 'not-allowed',
                    opacity: isInAmazon ? 1 : 0.6
                  }}
                  title={isInAmazon ? "Calculate fire spread simulation based on environmental & terrain vectors" : "Restricted to Amazon Study Region"}
                >
                  ⚡ SPREAD ANALYSIS
                </button>
              )}
              {onRemoveFire && (
                <button
                  onClick={onRemoveFire}
                  className="glass-button"
                  style={{
                    flex: 0.8,
                    padding: '8px 10px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#94A3B8',
                    borderColor: 'rgba(255, 255, 255, 0.15)',
                    background: 'rgba(30, 41, 59, 0.6)'
                  }}
                  title="Remove simulated fire ignition and clear scenario"
                >
                  REMOVE FIRE
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
