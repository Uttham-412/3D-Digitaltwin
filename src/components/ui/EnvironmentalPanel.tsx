import React from 'react';
import {
  EnvironmentalTimeline,
  EnvironmentalProvenance
} from '../../environmental/environmentalTypes';
import { computeEquilibriumMoistureContent } from '../../simulation/fireSpreadModel';

interface EnvironmentalPanelProps {
  timeline: EnvironmentalTimeline | null;
  onSelectIndex: (index: number) => void;
  isOpen: boolean;
  onClose: () => void;
  isLoading?: boolean;
}

export const EnvironmentalPanel: React.FC<EnvironmentalPanelProps> = ({
  timeline,
  onSelectIndex,
  isOpen,
  onClose,
  isLoading = false
}) => {
  if (!isOpen) return null;

  const currentObs =
    timeline && timeline.observations.length > 0 && timeline.selectedIndex >= 0
      ? timeline.observations[timeline.selectedIndex]
      : null;

  return (
    <aside
      aria-label="Environmental intelligence panel"
      className="glass-panel"
      style={{
        position: 'absolute',
        top: '80px',
        right: '20px',
        width: '360px',
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: 'calc(100vh - 120px)',
        overflowY: 'auto',
        backgroundColor: 'rgba(15, 20, 30, 0.95)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 16px 40px rgba(0, 0, 0, 0.65)',
        color: '#f8fafc',
        fontFamily: 'var(--font-sans)',
        zIndex: 50,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          paddingBottom: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3
            style={{
              margin: 0,
              fontSize: '0.85rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            Environmental intelligence
          </h3>
        </div>
        <button
          onClick={onClose}
          className="glass-button"
          style={{
            width: '24px',
            height: '24px',
            padding: 0,
          }}
          title="Close panel"
        >
          ✕
        </button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div
          style={{
            padding: '24px',
            textAlign: 'center',
            color: '#94A3B8',
            fontSize: '13px'
          }}
        >
          <div
            style={{
              display: 'inline-block',
              width: '24px',
              height: '24px',
              border: '2px solid rgba(56,189,248,0.2)',
              borderTopColor: '#38BDF8',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginBottom: '8px'
            }}
          />
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          <div>Fetching location weather observation...</div>
        </div>
      )}

      {/* Error state */}
      {!isLoading && timeline && !timeline.isAvailable && (
        <div
          style={{
            padding: '16px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            color: '#F87171',
            fontSize: '13px',
            textAlign: 'center'
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '4px' }}>
            ENVIRONMENTAL DATA UNAVAILABLE
          </div>
          <div style={{ fontSize: '11px', color: '#FCA5A5' }}>
            {timeline.errorMessage || 'Unable to connect to Open-Meteo weather service.'}
          </div>
        </div>
      )}

      {/* Content when data is available */}
      {!isLoading && timeline && timeline.isAvailable && currentObs && (
        <>
          {/* Location & Provenance bar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              padding: '8px 12px',
              borderRadius: '8px'
            }}
          >
            <div>
              <div style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase' }}>
                LOCATION & TIME
              </div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#E2E8F0' }}>
                {timeline.locationName || `Lat ${timeline.location.latitude.toFixed(2)}°, Lng ${timeline.location.longitude.toFixed(2)}°`}
              </div>
              <div style={{ fontSize: '10px', color: '#38BDF8', marginTop: '2px' }}>
                {new Date(currentObs.timestamp).toUTCString()}
              </div>
            </div>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '9999px',
                letterSpacing: '0.05em',
                backgroundColor:
                  currentObs.provenance === EnvironmentalProvenance.OBSERVED
                    ? 'rgba(16, 185, 129, 0.2)'
                    : 'rgba(245, 158, 11, 0.2)',
                color:
                  currentObs.provenance === EnvironmentalProvenance.OBSERVED
                    ? '#34D399'
                    : '#FBBF24',
                border:
                  currentObs.provenance === EnvironmentalProvenance.OBSERVED
                    ? '1px solid rgba(16, 185, 129, 0.4)'
                    : '1px solid rgba(245, 158, 11, 0.4)'
              }}
            >
              {currentObs.provenance}
            </span>
          </div>

          {/* Environmental Metrics Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px',
              marginBottom: '16px'
            }}
          >
            {/* Temperature */}
            <div
              style={{
                backgroundColor: 'rgba(30, 41, 59, 0.6)',
                padding: '12px',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.05)'
              }}
            >
              <div style={{ fontSize: '11px', color: '#94A3B8' }}>Temperature</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#F97316' }}>
                {currentObs.temperature.toFixed(1)} °C
              </div>
            </div>

            {/* Relative Humidity */}
            <div
              style={{
                backgroundColor: 'rgba(30, 41, 59, 0.6)',
                padding: '12px',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.05)'
              }}
            >
              <div style={{ fontSize: '11px', color: '#94A3B8' }}>Relative Humidity</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#06B6D4' }}>
                {Math.round(currentObs.relativeHumidity)} %
              </div>
            </div>

            {/* 1-Hour Dead Fuel Moisture (Simard EMC) */}
            <div
              style={{
                backgroundColor: 'rgba(30, 41, 59, 0.6)',
                padding: '12px',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.05)'
              }}
            >
              <div style={{ fontSize: '11px', color: '#94A3B8' }}>1-Hr Fuel Moisture</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#EAB308' }}>
                {computeEquilibriumMoistureContent(currentObs.temperature, currentObs.relativeHumidity).toFixed(1)} %
              </div>
              <div style={{ fontSize: '9px', color: '#64748B', marginTop: '2px' }}>
                Simard / Rothermel EMC
              </div>
            </div>

            {/* Precipitation */}
            <div
              style={{
                backgroundColor: 'rgba(30, 41, 59, 0.6)',
                padding: '12px',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.05)'
              }}
            >
              <div style={{ fontSize: '11px', color: '#94A3B8' }}>Precipitation</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#60A5FA' }}>
                {currentObs.precipitation.toFixed(1)} mm
              </div>
            </div>

            {/* Pressure */}
            <div
              style={{
                backgroundColor: 'rgba(30, 41, 59, 0.6)',
                padding: '12px',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.05)'
              }}
            >
              <div style={{ fontSize: '11px', color: '#94A3B8' }}>Surface Pressure</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#A7F3D0' }}>
                {Math.round(currentObs.surfacePressure || 1013)} hPa
              </div>
            </div>
          </div>

          {/* Wind Direction & Speed Visualization Box */}
          <div
            style={{
              backgroundColor: 'rgba(30, 41, 59, 0.8)',
              padding: '14px',
              borderRadius: '12px',
              border: '1px solid rgba(56, 189, 248, 0.2)',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div>
              <div style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase' }}>
                WIND VECTOR ({new Date(currentObs.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })} UTC)
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#38BDF8' }}>
                {currentObs.windSpeed.toFixed(1)} <span style={{ fontSize: '13px' }}>km/h</span>
              </div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#CBD5E1' }}>
                {currentObs.windDirectionCardinal} ({Math.round(currentObs.windDirection)}°)
              </div>
            </div>

            {/* Compass Wind Vector Indicator */}
            <div
              style={{
                position: 'relative',
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                border: '2px solid rgba(56, 189, 248, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '2px',
                  fontSize: '9px',
                  fontWeight: 800,
                  color: '#38BDF8'
                }}
              >
                N
              </div>
              <div
                style={{
                  position: 'absolute',
                  right: '4px',
                  fontSize: '8px',
                  color: '#64748B'
                }}
              >
                E
              </div>
              <div
                style={{
                  position: 'absolute',
                  bottom: '2px',
                  fontSize: '8px',
                  color: '#64748B'
                }}
              >
                S
              </div>
              <div
                style={{
                  position: 'absolute',
                  left: '4px',
                  fontSize: '8px',
                  color: '#64748B'
                }}
              >
                W
              </div>

              {/* Arrow pointing in wind direction */}
              <div
                style={{
                  width: '2px',
                  height: '36px',
                  transform: `rotate(${currentObs.windDirection}deg)`,
                  transformOrigin: 'center center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  transition: 'transform 0.3s ease'
                }}
              >
                <div
                  style={{
                    width: 0,
                    height: 0,
                    borderLeft: '4px solid transparent',
                    borderRight: '4px solid transparent',
                    borderBottom: '10px solid #F97316'
                  }}
                />
                <div style={{ width: '2px', height: '26px', backgroundColor: '#F97316' }} />
              </div>
            </div>
          </div>

          {/* Time Scrubber */}
          <div
            style={{
              backgroundColor: 'rgba(15, 23, 42, 0.6)',
              padding: '12px',
              borderRadius: '10px',
              marginBottom: '16px',
              border: '1px solid rgba(255, 255, 255, 0.05)'
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '11px',
                color: '#94A3B8',
                marginBottom: '8px'
              }}
            >
              <span>TIME SELECTION</span>
              <span style={{ color: '#F8FAFC', fontWeight: 600 }}>
                {currentObs.formattedTime} UTC
              </span>
            </div>

            <input
              type="range"
              min={0}
              max={timeline.observations.length - 1}
              value={timeline.selectedIndex}
              onChange={(e) => onSelectIndex(parseInt(e.target.value, 10))}
              style={{
                width: '100%',
                accentColor: '#38BDF8',
                cursor: 'pointer'
              }}
            />

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '10px',
                color: '#64748B',
                marginTop: '4px'
              }}
            >
              <span>{timeline.observations[0]?.formattedTime}</span>
              <span>NOW</span>
              <span>{timeline.observations[timeline.observations.length - 1]?.formattedTime}</span>
            </div>
          </div>

          {/* Provenance & Data Source Disclaimer */}
          <div
            style={{
              fontSize: '10px',
              color: '#64748B',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              paddingTop: '8px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <div>
              Source: <span style={{ color: '#94A3B8' }}>{currentObs.source}</span>
            </div>
            <div>Hourly UTC</div>
          </div>
        </>
      )}
    </aside>
  );
};
