import React, { useState, useEffect } from 'react';
import { Play, Pause, ChevronDown, ChevronRight, X, Flame } from 'lucide-react';
import {
  SpreadSimulationResult,
  SpreadHorizon
} from '../../simulation/fireScenarioTypes';
import { simulationClockManager, SimulationClockState } from '../../simulation/simulationClock';

interface FireSpreadPanelProps {
  simulationResult: SpreadSimulationResult | null;
  selectedHorizon: SpreadHorizon;
  onSelectHorizon: (h: SpreadHorizon) => void;
  onClose: () => void;
  isLoading?: boolean;
}

export const FireSpreadPanel: React.FC<FireSpreadPanelProps> = ({
  simulationResult,
  selectedHorizon,
  onSelectHorizon,
  onClose,
  isLoading = false
}) => {
  const [showExplanation, setShowExplanation] = useState<boolean>(false);
  const [clockState, setClockState] = useState<SimulationClockState>(simulationClockManager.getState());

  useEffect(() => {
    const unsubscribe = simulationClockManager.subscribe((state) => {
      setClockState(state);
    });
    return unsubscribe;
  }, []);

  if (!isLoading && !simulationResult) return null;

  const currentStep = simulationResult?.timesteps[selectedHorizon];

  const handleHorizonClick = (horizon: SpreadHorizon) => {
    simulationClockManager.setHorizon(horizon);
    onSelectHorizon(horizon);
  };

  const handleTogglePlayback = () => {
    simulationClockManager.togglePlayback();
  };

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
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Flame size={14} color="#f97316" />
          <h3
            style={{
              margin: 0,
              fontSize: '0.80rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            Fire spread simulation
          </h3>
        </div>

        <button
          onClick={onClose}
          className="glass-button"
          style={{ width: '20px', height: '20px', padding: 0 }}
          title="Clear simulation"
        >
          <X size={12} />
        </button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div style={{ textAlign: 'center', padding: '12px 0', color: '#94a3b8', fontSize: '0.72rem' }}>
          <div
            style={{
              display: 'inline-block',
              width: '18px',
              height: '18px',
              border: '2px solid rgba(249, 115, 22, 0.2)',
              borderTopColor: '#f97316',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginBottom: '6px'
            }}
          />
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          <div>Computing spread physics...</div>
        </div>
      )}

      {!isLoading && simulationResult && currentStep && (
        <>
          {/* Horizon Step Buttons & Playback Toggle */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.66rem', color: '#94a3b8' }}>Time horizon</span>
              <button
                onClick={handleTogglePlayback}
                style={{
                  background: clockState.isPlaying ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                  border: `1px solid ${clockState.isPlaying ? 'rgba(239, 68, 68, 0.35)' : 'rgba(16, 185, 129, 0.35)'}`,
                  color: clockState.isPlaying ? '#f87171' : '#34d399',
                  borderRadius: '4px',
                  padding: '2px 7px',
                  fontSize: '0.62rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                {clockState.isPlaying ? <Pause size={9} /> : <Play size={9} />}
                <span>{clockState.isPlaying ? 'Pause' : 'Play'}</span>
              </button>
            </div>

            <div style={{ display: 'flex', gap: '3px' }}>
              {(['+0H', '+1H', '+2H', '+6H', '+12H', '+24H'] as SpreadHorizon[]).map((h) => (
                <button
                  key={h}
                  onClick={() => handleHorizonClick(h)}
                  style={{
                    flex: 1,
                    padding: '4px 0',
                    fontSize: '0.66rem',
                    fontWeight: 600,
                    borderRadius: '4px',
                    border:
                      selectedHorizon === h
                        ? '1px solid #f97316'
                        : '1px solid rgba(255, 255, 255, 0.08)',
                    backgroundColor:
                      selectedHorizon === h ? 'rgba(249, 115, 22, 0.2)' : 'rgba(0, 0, 0, 0.25)',
                    color: selectedHorizon === h ? '#f97316' : '#94a3b8',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>

          {/* Primary Metrics Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '6px',
            }}
          >
            <div
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.25)',
                padding: '8px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
              }}
            >
              <span style={{ fontSize: '0.62rem', color: '#94a3b8', display: 'block' }}>Affected area</span>
              <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f97316' }}>
                {currentStep.affectedAreaHectares} <span style={{ fontSize: '0.70rem', fontWeight: 400 }}>ha</span>
              </span>
            </div>

            <div
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.25)',
                padding: '8px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
              }}
            >
              <span style={{ fontSize: '0.62rem', color: '#94a3b8', display: 'block' }}>Rate of spread</span>
              <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fdba74' }}>
                {currentStep.rateOfSpreadMetersPerMin} <span style={{ fontSize: '0.70rem', fontWeight: 400 }}>m/min</span>
              </span>
            </div>
          </div>

          {/* Expandable Environmental & Terrain Breakdown */}
          <div
            style={{
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              paddingTop: '6px',
            }}
          >
            <button
              onClick={() => setShowExplanation((prev) => !prev)}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                fontSize: '0.66rem',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 0',
              }}
            >
              {showExplanation ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span>Environmental factors ({selectedHorizon})</span>
            </button>

            {showExplanation && (
              <div
                style={{
                  marginTop: '6px',
                  backgroundColor: 'rgba(0, 0, 0, 0.25)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '8px 10px',
                  fontSize: '0.64rem',
                  color: '#cbd5e1',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  lineHeight: 1.35
                }}
              >
                <div>
                  <strong style={{ color: '#38bdf8' }}>Wind:</strong>{' '}
                  {currentStep.environmentalState.windSpeed} km/h from {currentStep.environmentalState.windDirectionCardinal} ({currentStep.environmentalState.windDirection}°).
                </div>
                <div>
                  <strong style={{ color: '#a7f3d0' }}>Terrain:</strong>{' '}
                  {simulationResult.terrain.isAvailable && simulationResult.terrain.slopeDegrees !== null
                    ? `${simulationResult.terrain.slopeDegrees}° slope towards ${simulationResult.terrain.aspectCardinal}.`
                    : 'Flat baseline.'}
                </div>
                <div>
                  <strong style={{ color: '#fdba74' }}>Moisture:</strong>{' '}
                  {currentStep.environmentalState.relativeHumidity}% RH, {currentStep.environmentalState.precipitation} mm precip.
                </div>
                <div>
                  <strong style={{ color: '#f472b6' }}>Fuel:</strong>{' '}
                  {simulationResult.fuel.isAvailable ? simulationResult.fuel.fuelClass : 'Baseline coefficient.'}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
