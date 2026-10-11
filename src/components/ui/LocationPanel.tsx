import React from 'react';
import { MapPin, X, Mountain, Crosshair, AlertTriangle, Satellite, Flame } from 'lucide-react';
import { SelectedLocation, formatCoordinates } from '../../geospatial/coordinates';
import { CesiumViewerManager } from '../../cesium/viewer';
import { isPointInAmazonStudyRegion } from '../../config/studyRegion';
import { waterMaskService } from '../../geospatial/waterMaskService';
import { ForestConditionPanel } from './ForestConditionPanel';
import { SimulationAssessmentRequest } from '../../services/simulationAssessmentCoordinator';

interface LocationPanelProps {
  location: SelectedLocation | null;
  onClear: () => void;
  onRunInference?: () => void;
  isSimulatedFireActive?: boolean;
  onCreateIgnition?: () => void;
  onRemoveFire?: () => void;
  onRunSpreadAnalysis?: () => void;
  ignitionRejectionMessage?: string | null;
  onOpenDetectionPanel?: () => void;
  assessmentRequest?: SimulationAssessmentRequest | null;
}

export const LocationPanel: React.FC<LocationPanelProps> = ({
  location,
  onClear,
  onRunInference,
  isSimulatedFireActive = false,
  onCreateIgnition,
  onRemoveFire,
  onRunSpreadAnalysis,
  ignitionRejectionMessage,
  onOpenDetectionPanel,
  assessmentRequest,
}) => {
  if (!location) return null;

  const isInAmazon = isPointInAmazonStudyRegion(location.latitude, location.longitude);
  const waterCheck = waterMaskService.checkPoint({ latitude: location.latitude, longitude: location.longitude });
  const isWater = waterCheck.surfaceClass === 'WATER';
  const isUnverified = waterCheck.surfaceClass === 'UNVERIFIED';

  const handleFlyTo = () => {
    const manager = CesiumViewerManager.getInstance();
    manager.flyToLocation(location.latitude, location.longitude, location.height);
  };

  const heightVal = location.height ?? 0;
  const isAssessmentCompleted = assessmentRequest?.status === 'COMPLETED' && assessmentRequest.georeferencedOutput;
  const isAssessmentLoading =
    assessmentRequest?.status === 'INITIALIZING' ||
    assessmentRequest?.status === 'DISCOVERING_OBSERVATION' ||
    assessmentRequest?.status === 'ACQUIRING_RASTER' ||
    assessmentRequest?.status === 'PREPROCESSING' ||
    assessmentRequest?.status === 'RUNNING_INFERENCE';

  return (
    <div
      className="glass-panel"
      style={{
        position: 'relative',
        width: '360px',
        maxWidth: 'calc(100vw - 32px)',
        padding: '14px 16px',
        zIndex: 35,
        borderRadius: 'var(--radius-md)',
        border: isSimulatedFireActive
          ? '1px solid rgba(249, 115, 22, 0.4)'
          : '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.55)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      {/* Location Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <MapPin
            size={16}
            color={isSimulatedFireActive ? '#f97316' : isInAmazon ? '#34d399' : '#fbbf24'}
            style={{ flexShrink: 0 }}
          />
          <div style={{ minWidth: 0 }}>
            <h2
              style={{
                fontSize: '0.88rem',
                fontWeight: 600,
                color: 'var(--text-primary)',
                margin: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {location.label || 'Selected Location'}
            </h2>
            <span
              style={{
                fontSize: '0.64rem',
                color: isInAmazon ? '#34d399' : '#fbbf24',
                fontWeight: 500,
              }}
            >
              {isInAmazon ? 'Amazon study region' : 'Outside study region'}
            </span>
          </div>
        </div>

        <button
          onClick={onClear}
          className="glass-button"
          style={{ width: '24px', height: '24px', borderRadius: '50%', padding: 0 }}
          title="Deselect location"
        >
          <X size={13} />
        </button>
      </div>

      {/* Telemetry (Coordinates & Elevation) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px',
          background: 'rgba(0, 0, 0, 0.25)',
          padding: '8px 10px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
        }}
      >
        <div>
          <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', display: 'block' }}>
            Coordinates
          </span>
          <span
            style={{
              fontSize: '0.74rem',
              fontWeight: 500,
              fontFamily: 'var(--font-mono)',
              color: 'var(--accent-cyan)',
            }}
          >
            {formatCoordinates(location.latitude, location.longitude)}
          </span>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <Mountain size={11} color="var(--text-muted)" />
            <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>Elevation</span>
          </div>
          <span
            style={{
              fontSize: '0.74rem',
              fontWeight: 500,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-primary)',
            }}
          >
            {heightVal.toLocaleString()} m
          </span>
        </div>
      </div>

      {/* Outside Study Region Notice */}
      {!isInAmazon && (
        <div
          style={{
            backgroundColor: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            borderRadius: 'var(--radius-sm)',
            padding: '8px 10px',
            color: '#fbbf24',
            fontSize: '0.70rem',
            lineHeight: 1.35,
          }}
        >
          Fire simulation and satellite assessment are restricted to the Amazon study region.
        </div>
      )}

      {/* Water Surface / Unverified Warning */}
      {isWater && (
        <div
          style={{
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#fca5a5',
            fontSize: '0.70rem',
            display: 'flex',
            gap: '6px',
            alignItems: 'center',
          }}
        >
          <AlertTriangle size={13} color="#ef4444" style={{ flexShrink: 0 }} />
          <span>Water surface: Wildfires cannot ignite on open water bodies.</span>
        </div>
      )}

      {isUnverified && (
        <div
          style={{
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            color: '#fde68a',
            fontSize: '0.70rem',
            display: 'flex',
            gap: '6px',
            alignItems: 'center',
          }}
        >
          <AlertTriangle size={13} color="#f59e0b" style={{ flexShrink: 0 }} />
          <span>Unverified surface: Coordinates are outside hydrography bounds.</span>
        </div>
      )}

      {ignitionRejectionMessage && (
        <div
          style={{
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#fca5a5',
            fontSize: '0.70rem',
          }}
        >
          {ignitionRejectionMessage}
        </div>
      )}

      {/* Primary Actions: Navigation & Single Consolidated Assessment Action */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={handleFlyTo}
          className="glass-button"
          style={{
            flex: 1,
            padding: '6px 10px',
            fontSize: '0.74rem',
            fontWeight: 500,
            gap: '5px',
          }}
        >
          <Crosshair size={13} color="var(--accent-cyan)" />
          Center
        </button>

        {/* Consolidated Assessment Action: ONE clear primary action */}
        {isAssessmentCompleted ? (
          <button
            onClick={onOpenDetectionPanel}
            className="glass-button"
            style={{
              flex: 1.5,
              padding: '6px 10px',
              fontSize: '0.74rem',
              fontWeight: 600,
              gap: '6px',
              color: '#34d399',
              borderColor: 'rgba(16, 185, 129, 0.35)',
              background: 'rgba(16, 185, 129, 0.12)',
            }}
            title="Open Fire Assessment Panel"
          >
            <Satellite size={13} />
            <span>View assessment</span>
          </button>
        ) : isAssessmentLoading ? (
          <button
            onClick={onOpenDetectionPanel}
            className="glass-button"
            style={{
              flex: 1.5,
              padding: '6px 10px',
              fontSize: '0.74rem',
              fontWeight: 600,
              gap: '6px',
              color: '#fbbf24',
              borderColor: 'rgba(245, 158, 11, 0.35)',
              background: 'rgba(245, 158, 11, 0.12)',
            }}
          >
            <Satellite size={13} />
            <span>Assessing...</span>
          </button>
        ) : (
          <button
            onClick={isInAmazon ? onRunInference : undefined}
            disabled={!isInAmazon}
            className="glass-button"
            style={{
              flex: 1.5,
              padding: '6px 10px',
              fontSize: '0.74rem',
              fontWeight: 600,
              gap: '6px',
              color: isInAmazon ? '#f87171' : '#64748b',
              borderColor: isInAmazon ? 'rgba(239, 68, 68, 0.35)' : 'rgba(255, 255, 255, 0.08)',
              background: isInAmazon ? 'rgba(239, 68, 68, 0.08)' : 'rgba(30, 41, 59, 0.3)',
              cursor: isInAmazon ? 'pointer' : 'not-allowed',
              opacity: isInAmazon ? 1 : 0.6,
            }}
            title={isInAmazon ? 'Run U-Net satellite assessment' : 'Restricted to Amazon study region'}
          >
            <Satellite size={13} />
            <span>Assess area</span>
          </button>
        )}
      </div>

      {/* Simulation Scenario Controls */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {!isSimulatedFireActive ? (
          <button
            onClick={isInAmazon && !isWater && !isUnverified ? onCreateIgnition : undefined}
            disabled={!isInAmazon || isWater || isUnverified}
            className="glass-button"
            style={{
              width: '100%',
              padding: '7px 10px',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: isInAmazon && !isWater && !isUnverified ? '#f97316' : '#64748b',
              borderColor: isInAmazon && !isWater && !isUnverified ? 'rgba(249, 115, 22, 0.4)' : 'rgba(255, 255, 255, 0.08)',
              background: isInAmazon && !isWater && !isUnverified ? 'rgba(249, 115, 22, 0.12)' : 'rgba(30, 41, 59, 0.3)',
              cursor: isInAmazon && !isWater && !isUnverified ? 'pointer' : 'not-allowed',
              gap: '6px',
            }}
          >
            <Flame size={13} />
            <span>Create fire scenario</span>
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
                  padding: '7px 10px',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  color: '#fdba74',
                  borderColor: 'rgba(249, 115, 22, 0.4)',
                  background: 'rgba(249, 115, 22, 0.15)',
                  gap: '5px',
                }}
              >
                <Flame size={13} />
                <span>Spread analysis</span>
              </button>
            )}
            {onRemoveFire && (
              <button
                onClick={onRemoveFire}
                className="glass-button"
                style={{
                  flex: 0.8,
                  padding: '7px 10px',
                  fontSize: '0.74rem',
                  fontWeight: 500,
                  color: '#94a3b8',
                }}
              >
                Clear fire
              </button>
            )}
          </>
        )}
      </div>

      {/* Forest Condition Section */}
      <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '6px' }}>
        <ForestConditionPanel
          location={location}
          hasActiveFireData={false}
          hasBurnedAreaGroundTruth={location.source === 'EMSR239_EVENT'}
        />
      </div>
    </div>
  );
};
