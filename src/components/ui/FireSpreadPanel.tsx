/**
 * LAND8FIRE — OBJECTIVE 2: FIRE SPREAD ANALYSIS PANEL
 *
 * Operator panel for the EXPERIMENTAL DIRECTIONAL FIRE-SPREAD MODEL:
 * - Time horizon step controls (+0H, +1H, +2H, +6H, +12H, +24H)
 * - Simulation clock play/pause animation toggle
 * - Dynamic 36-sector perimeter area and mean rate-of-spread readouts
 * - Scientific provenance label: "EXPERIMENTAL FIRE-SPREAD SIMULATION"
 * - Environmental, terrain DEM gradient, and fuel vector breakdowns
 */

import React, { useState, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';
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
  const [showExplanation, setShowExplanation] = useState<boolean>(true);
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
      style={{
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(249, 115, 22, 0.4)',
        borderRadius: '16px',
        padding: '20px',
        color: '#F8FAFC',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        marginBottom: '12px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
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
          <div
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: '#F97316',
              boxShadow: '0 0 10px #F97316'
            }}
          />
          <h3
            style={{
              margin: 0,
              fontSize: '13px',
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: '#F97316'
            }}
          >
            EXPERIMENTAL FIRE SPREAD
          </h3>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#94A3B8',
            cursor: 'pointer',
            fontSize: '16px',
            lineHeight: 1
          }}
        >
          ✕
        </button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div style={{ textAlign: 'center', padding: '16px 0', color: '#94A3B8', fontSize: '13px' }}>
          <div
            style={{
              display: 'inline-block',
              width: '24px',
              height: '24px',
              border: '2px solid rgba(249, 115, 22, 0.2)',
              borderTopColor: '#F97316',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginBottom: '8px'
            }}
          />
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          <div>CALCULATING SPREAD SIMULATION...</div>
          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
            Evaluating wind vector, slope, aspect, humidity & fuel factors
          </div>
        </div>
      )}

      {!isLoading && simulationResult && currentStep && (
        <>
          {/* Provenance & Horizon Bar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              padding: '8px 12px',
              borderRadius: '8px',
              marginBottom: '14px'
            }}
          >
            <div>
              <div style={{ fontSize: '10px', color: '#94A3B8' }}>PROVENANCE</div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#FDBA74' }}>
                EXPERIMENTAL FIRE-SPREAD SIMULATION
              </div>
            </div>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: '9999px',
                backgroundColor: 'rgba(249, 115, 22, 0.2)',
                color: '#F97316',
                border: '1px solid rgba(249, 115, 22, 0.4)'
              }}
            >
              SIMULATION
            </span>
          </div>

          {/* Time Horizon Step Controls & Playback */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <div style={{ fontSize: '10px', color: '#94A3B8' }}>SIMULATION TIME HORIZON</div>
              <button
                onClick={handleTogglePlayback}
                style={{
                  background: clockState.isPlaying ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                  border: `1px solid ${clockState.isPlaying ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
                  color: clockState.isPlaying ? '#EF4444' : '#10B981',
                  borderRadius: '4px',
                  padding: '2px 8px',
                  fontSize: '10px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                {clockState.isPlaying ? <Pause size={10} /> : <Play size={10} />}
                {clockState.isPlaying ? 'PAUSE' : 'PLAY'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '4px' }}>
              {(['+0H', '+1H', '+2H', '+6H', '+12H', '+24H'] as SpreadHorizon[]).map((h) => (
                <button
                  key={h}
                  onClick={() => handleHorizonClick(h)}
                  style={{
                    flex: 1,
                    padding: '6px 0',
                    fontSize: '10.5px',
                    fontWeight: 700,
                    borderRadius: '6px',
                    border:
                      selectedHorizon === h
                        ? '1px solid #F97316'
                        : '1px solid rgba(255, 255, 255, 0.1)',
                    backgroundColor:
                      selectedHorizon === h ? 'rgba(249, 115, 22, 0.25)' : 'rgba(30, 41, 59, 0.6)',
                    color: selectedHorizon === h ? '#F97316' : '#94A3B8',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
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
              gap: '8px',
              marginBottom: '14px'
            }}
          >
            <div
              style={{
                backgroundColor: 'rgba(30, 41, 59, 0.6)',
                padding: '10px',
                borderRadius: '8px'
              }}
            >
              <div style={{ fontSize: '10px', color: '#94A3B8' }}>AFFECTED AREA</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#F97316' }}>
                {currentStep.affectedAreaHectares} <span style={{ fontSize: '12px' }}>ha</span>
              </div>
            </div>

            <div
              style={{
                backgroundColor: 'rgba(30, 41, 59, 0.6)',
                padding: '10px',
                borderRadius: '8px'
              }}
            >
              <div style={{ fontSize: '10px', color: '#94A3B8' }}>RATE OF SPREAD</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#FDBA74' }}>
                {currentStep.rateOfSpreadMetersPerMin} <span style={{ fontSize: '12px' }}>m/min</span>
              </div>
            </div>
          </div>

          {/* Scenario Details Section */}
          <div style={{ backgroundColor: 'rgba(30, 41, 59, 0.6)', padding: '10px', borderRadius: '8px', marginBottom: '10px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#FDBA74', letterSpacing: '0.05em', marginBottom: '4px' }}>
              SCENARIO — SIMULATED IGNITION
            </div>
            <div style={{ fontSize: '11px', color: '#CBD5E1', lineHeight: 1.4 }}>
              <div><strong>Location:</strong> {simulationResult.initialFireState.latitude.toFixed(4)}° N, {simulationResult.initialFireState.longitude.toFixed(4)}° E</div>
              <div><strong>Clock Time:</strong> {new Date(currentStep.timestamp).toLocaleString()}</div>
              <div><strong>Provenance:</strong> {simulationResult.initialFireState.provenance}</div>
            </div>
          </div>

          {/* Expandable Explanation Section */}
          <div
            style={{
              backgroundColor: 'rgba(30, 41, 59, 0.8)',
              borderRadius: '10px',
              border: '1px solid rgba(249, 115, 22, 0.2)',
              marginBottom: '12px',
              overflow: 'hidden'
            }}
          >
            <button
              onClick={() => setShowExplanation((prev) => !prev)}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'none',
                border: 'none',
                color: '#F97316',
                fontWeight: 700,
                fontSize: '11px',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <span>ENVIRONMENTAL & TERRAIN INFLUENCE</span>
              <span>{showExplanation ? '▲' : '▼'}</span>
            </button>

            {showExplanation && (
              <div
                style={{
                  padding: '0 12px 12px 12px',
                  fontSize: '11px',
                  color: '#CBD5E1',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  lineHeight: 1.4
                }}
              >
                <div>
                  <strong style={{ color: '#38BDF8' }}>WIND VECTOR:</strong>{' '}
                  {currentStep.environmentalState.windSpeed} km/h from {currentStep.environmentalState.windDirectionCardinal} ({currentStep.environmentalState.windDirection}°). Pushes fire toward {((currentStep.environmentalState.windDirection + 180) % 360).toFixed(0)}°.
                </div>
                <div>
                  <strong style={{ color: '#A7F3D0' }}>TERRAIN GRADIENT:</strong>{' '}
                  {simulationResult.terrain.isAvailable && simulationResult.terrain.slopeDegrees !== null
                    ? `${simulationResult.terrain.slopeDegrees}° slope toward ${simulationResult.terrain.aspectCardinal}. Fire advances faster uphill along slope gradient.`
                    : 'TERRAIN SLOPE DATA UNAVAILABLE (Computed on flat baseline)'}
                </div>
                <div>
                  <strong style={{ color: '#FDBA74' }}>MOISTURE & HUMIDITY:</strong>{' '}
                  {currentStep.environmentalState.relativeHumidity}% RH with {currentStep.environmentalState.precipitation}mm precip. Lower moisture increases fuel flammability.
                </div>
                <div>
                  <strong style={{ color: '#F472B6' }}>FUEL AVAILABILITY:</strong>{' '}
                  {simulationResult.fuel.isAvailable
                    ? `${simulationResult.fuel.fuelClass} (Burnability ${simulationResult.fuel.burnabilityFactor ?? 'N/A'})`
                    : 'FUEL DATA UNAVAILABLE (Baseline vegetation coefficient applied)'}
                </div>
              </div>
            )}
          </div>

          {/* Model Limitation Disclaimer */}
          <div
            style={{
              fontSize: '10px',
              color: '#64748B',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              paddingTop: '10px',
              lineHeight: 1.4,
              fontStyle: 'italic'
            }}
          >
            "{simulationResult.disclaimer}"
          </div>
        </>
      )}
    </div>
  );
};
