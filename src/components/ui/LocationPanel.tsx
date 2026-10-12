import React from 'react';
import { MapPin, X, Mountain, Crosshair, AlertTriangle, Satellite, Flame } from 'lucide-react';
import { SelectedLocation, formatCoordinates } from '../../geospatial/coordinates';
import { CesiumViewerManager } from '../../cesium/viewer';
import { isPointInAmazonStudyRegion } from '../../config/studyRegion';
import { waterMaskService } from '../../geospatial/waterMaskService';
import { fuelService } from '../../geospatial/fuelService';
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
  const isWaterUnverified = waterCheck.surfaceClass === 'UNVERIFIED';
  const burnability = fuelService.checkBurnabilitySync({ latitude: location.latitude, longitude: location.longitude });
  const isUrban = burnability.burnabilityStatus === 'NON_BURNABLE_URBAN';
  const isBurnable = burnability.isBurnable;

  const handleFlyTo = () => {
    const manager = CesiumViewerManager.getInstance();
    manager.flyToLocation(location.latitude, location.longitude, location.height);
  };

  const heightVal = location.height ?? 0;
  const isAssessmentCompleted = Boolean(assessmentRequest?.status === 'COMPLETED' && assessmentRequest.georeferencedOutput);
  const isAssessmentLoading = Boolean(
    assessmentRequest?.status === 'INITIALIZING' ||
    assessmentRequest?.status === 'DISCOVERING_OBSERVATION' ||
    assessmentRequest?.status === 'ACQUIRING_RASTER' ||
    assessmentRequest?.status === 'PREPROCESSING' ||
    assessmentRequest?.status === 'RUNNING_INFERENCE'
  );
  const hasAssessmentResult = Boolean(
    assessmentRequest && (
      (assessmentRequest.status === 'COMPLETED' && assessmentRequest.georeferencedOutput) ||
      assessmentRequest.status === 'AWAITING_SATELLITE_OBSERVATION' ||
      assessmentRequest.status === 'FAILED' ||
      assessmentRequest.status === 'OBSERVATION_UNSUITABLE'
    )
  );

  return (
    <div
      className="glass-panel"
      style={{
        position: 'relative',
        width: '360px',
        maxWidth: 'calc(100vw - 32px)',
        padding: '16px',
        zIndex: 35,
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-surface)',
        border: isSimulatedFireActive
          ? '1px solid var(--accent-fire)'
          : '1px solid var(--border-color)',
        boxShadow: 'var(--shadow-card)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
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
            color={isSimulatedFireActive ? 'var(--accent-fire)' : isInAmazon ? 'var(--accent-forest)' : 'var(--accent-amber)'}
            style={{ flexShrink: 0 }}
          />
          <div style={{ minWidth: 0 }}>
            <h2
              style={{
                fontSize: '0.90rem',
                fontWeight: 700,
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
                color: isInAmazon ? 'var(--accent-forest)' : 'var(--accent-amber)',
                fontWeight: 600,
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
          gap: '10px',
          background: 'var(--bg-surface-secondary)',
          padding: '9px 12px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-color)',
        }}
      >
        <div>
          <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 500 }}>
            Coordinates
          </span>
          <span
            style={{
              fontSize: '0.74rem',
              fontWeight: 600,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-primary)',
              display: 'block',
              marginTop: '1px',
            }}
          >
            {formatCoordinates(location.latitude, location.longitude)}
          </span>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Mountain size={11} color="var(--accent-forest)" />
            <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Elevation</span>
          </div>
          <span
            style={{
              fontSize: '0.74rem',
              fontWeight: 600,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-primary)',
              display: 'block',
              marginTop: '1px',
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
            backgroundColor: 'var(--status-warning-bg)',
            border: '1px solid var(--status-warning-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '8px 10px',
            color: 'var(--status-warning)',
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
            background: 'var(--status-error-bg)',
            border: '1px solid var(--status-error-border)',
            color: 'var(--status-error)',
            fontSize: '0.70rem',
            display: 'flex',
            gap: '6px',
            alignItems: 'center',
          }}
        >
          <AlertTriangle size={13} color="var(--accent-fire)" style={{ flexShrink: 0 }} />
          <span>Water surface: Wildfires cannot ignite on open water bodies.</span>
        </div>
      )}

      {isUrban && (
        <div
          style={{
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-surface-secondary)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-secondary)',
            fontSize: '0.70rem',
            display: 'flex',
            gap: '6px',
            alignItems: 'center',
          }}
        >
          <AlertTriangle size={13} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          <span>Urban surface: Wildfire ignition is prohibited in urban areas.</span>
        </div>
      )}

      {isInAmazon && isWaterUnverified && !isWater && (
        <div
          style={{
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--accent-blue-subtle)',
            border: '1px solid var(--accent-blue-border)',
            color: 'var(--accent-blue)',
            fontSize: '0.70rem',
            display: 'flex',
            gap: '6px',
            alignItems: 'center',
          }}
        >
          <AlertTriangle size={13} color="var(--accent-blue)" style={{ flexShrink: 0 }} />
          <span>Water status unverified</span>
        </div>
      )}

      {ignitionRejectionMessage && (
        <div
          style={{
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--status-error-bg)',
            border: '1px solid var(--status-error-border)',
            color: 'var(--status-error)',
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
            padding: '7px 10px',
            fontSize: '0.74rem',
            fontWeight: 500,
            gap: '5px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
          }}
        >
          <Crosshair size={13} color="var(--accent-blue)" />
          Center
        </button>

        {/* Consolidated Assessment Action: Forest-Green Primary Action */}
        {hasAssessmentResult ? (
          <button
            onClick={onOpenDetectionPanel}
            className="glass-button"
            style={{
              flex: 1.5,
              padding: '7px 10px',
              fontSize: '0.74rem',
              fontWeight: 600,
              gap: '6px',
              color: isAssessmentCompleted ? '#FFFFFF' : 'var(--status-warning)',
              borderColor: isAssessmentCompleted ? 'var(--accent-forest-dark)' : 'var(--status-warning-border)',
              background: isAssessmentCompleted ? 'var(--accent-forest)' : 'var(--status-warning-bg)',
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
              padding: '7px 10px',
              fontSize: '0.74rem',
              fontWeight: 600,
              gap: '6px',
              color: 'var(--status-warning)',
              borderColor: 'var(--status-warning-border)',
              background: 'var(--status-warning-bg)',
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
              padding: '7px 10px',
              fontSize: '0.74rem',
              fontWeight: 600,
              gap: '6px',
              color: isInAmazon ? '#FFFFFF' : 'var(--text-muted)',
              borderColor: isInAmazon ? 'var(--accent-forest-dark)' : 'var(--border-color)',
              background: isInAmazon ? 'var(--accent-forest)' : 'var(--bg-surface-secondary)',
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
            onClick={onCreateIgnition}
            className="glass-button"
            style={{
              width: '100%',
              padding: '8px 10px',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: isBurnable ? 'var(--accent-fire)' : 'var(--text-muted)',
              borderColor: isBurnable ? '#F0D59E' : 'var(--border-color)',
              background: isBurnable ? '#FAF0DC' : 'var(--bg-surface-secondary)',
              cursor: 'pointer',
              gap: '6px',
            }}
          >
            <Flame size={13} color={isBurnable ? 'var(--accent-fire)' : 'var(--text-muted)'} />
            <span>Simulate fire ignition</span>
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
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  color: 'var(--accent-fire)',
                  borderColor: '#F0D59E',
                  background: '#FAF0DC',
                  gap: '5px',
                }}
              >
                <Flame size={13} color="var(--accent-fire)" />
                <span>Spread analysis</span>
              </button>
            )}
            {onRemoveFire && (
              <button
                onClick={onRemoveFire}
                className="glass-button"
                style={{
                  flex: 0.8,
                  padding: '8px 10px',
                  fontSize: '0.74rem',
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                }}
              >
                Clear fire
              </button>
            )}
          </>
        )}
      </div>

      {/* Forest Condition Section */}
      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
        <ForestConditionPanel
          location={location}
          hasActiveFireData={false}
          hasBurnedAreaGroundTruth={location.source === 'EMSR239_EVENT'}
        />
      </div>
    </div>
  );
};
