import React from 'react';
import { X } from 'lucide-react';
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
        top: '76px',
        right: '20px',
        width: '360px',
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: 'calc(100vh - 165px)',
        overflowY: 'auto',
        backgroundColor: 'var(--bg-surface)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-floating)',
        color: 'var(--text-primary)',
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
          borderBottom: '1px solid var(--border-color)',
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
              letterSpacing: '-0.01em',
            }}
          >
            Environmental Intelligence
          </h3>
        </div>
        <button
          onClick={onClose}
          className="glass-button"
          style={{
            width: '24px',
            height: '24px',
            padding: 0,
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-secondary)',
          }}
          title="Close panel"
        >
          <X size={14} />
        </button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div
          style={{
            padding: '24px',
            textAlign: 'center',
            color: 'var(--text-secondary)',
            fontSize: '13px'
          }}
        >
          <div
            style={{
              display: 'inline-block',
              width: '24px',
              height: '24px',
              border: '2px solid var(--border-color)',
              borderTopColor: 'var(--accent-forest)',
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
            padding: '14px',
            backgroundColor: 'var(--status-error-bg)',
            border: '1px solid var(--status-error-border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--status-error)',
            fontSize: '13px',
            textAlign: 'center'
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '4px', fontSize: '0.78rem' }}>
            ENVIRONMENTAL DATA UNAVAILABLE
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
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
              backgroundColor: 'var(--bg-surface-secondary)',
              border: '1px solid var(--border-color)',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <div>
              <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                LOCATION & TIME
              </div>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '1px' }}>
                {timeline.locationName || `Lat ${timeline.location.latitude.toFixed(2)}°, Lng ${timeline.location.longitude.toFixed(2)}°`}
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '1px' }}>
                {new Date(currentObs.timestamp).toUTCString()}
              </div>
            </div>
            <span
              style={{
                fontSize: '0.66rem',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                letterSpacing: '0.04em',
                backgroundColor:
                  currentObs.provenance === EnvironmentalProvenance.OBSERVED
                    ? 'var(--status-success-bg)'
                    : 'var(--status-warning-bg)',
                color:
                  currentObs.provenance === EnvironmentalProvenance.OBSERVED
                    ? 'var(--status-success)'
                    : 'var(--status-warning)',
                border:
                  currentObs.provenance === EnvironmentalProvenance.OBSERVED
                    ? '1px solid var(--status-success-border)'
                    : '1px solid var(--status-warning-border)',
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
              gap: '8px',
            }}
          >
            {/* Temperature */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface-secondary)',
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Temperature</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-fire)', marginTop: '2px' }}>
                {currentObs.temperature.toFixed(1)} °C
              </div>
            </div>

            {/* Relative Humidity */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface-secondary)',
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Relative Humidity</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent-blue)', marginTop: '2px' }}>
                {Math.round(currentObs.relativeHumidity)} %
              </div>
            </div>

            {/* 1-Hour Dead Fuel Moisture */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface-secondary)',
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 500 }}>1-Hr Fuel Moisture</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-dry)', marginTop: '2px' }}>
                {computeEquilibriumMoistureContent(currentObs.temperature, currentObs.relativeHumidity).toFixed(1)} %
              </div>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Simard / Rothermel EMC
              </div>
            </div>

            {/* Precipitation */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface-secondary)',
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Precipitation</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent-forest)', marginTop: '2px' }}>
                {currentObs.precipitation.toFixed(1)} mm
              </div>
            </div>

            {/* Pressure */}
            <div
              style={{
                gridColumn: 'span 2',
                backgroundColor: 'var(--bg-surface-secondary)',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Surface Pressure</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {Math.round(currentObs.surfacePressure || 1013)} hPa
              </div>
            </div>
          </div>

          {/* Wind Direction & Speed Visualization Box */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface-secondary)',
              padding: '12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                WIND VECTOR ({new Date(currentObs.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })} UTC)
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent-forest)', marginTop: '2px' }}>
                {currentObs.windSpeed.toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)' }}>km/h</span>
              </div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>
                {currentObs.windDirectionCardinal} ({Math.round(currentObs.windDirection)}°)
              </div>
            </div>

            {/* Compass Wind Vector Indicator */}
            <div
              style={{
                position: 'relative',
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                backgroundColor: 'var(--bg-surface)',
                border: '1.5px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '2px',
                  fontSize: '8px',
                  fontWeight: 700,
                  color: 'var(--accent-forest)',
                }}
              >
                N
              </div>
              <div
                style={{
                  position: 'absolute',
                  right: '3px',
                  fontSize: '7px',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                }}
              >
                E
              </div>
              <div
                style={{
                  position: 'absolute',
                  bottom: '2px',
                  fontSize: '7px',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                }}
              >
                S
              </div>
              <div
                style={{
                  position: 'absolute',
                  left: '3px',
                  fontSize: '7px',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                }}
              >
                W
              </div>

              {/* Arrow pointing in wind direction */}
              <div
                style={{
                  width: '2px',
                  height: '34px',
                  transform: `rotate(${currentObs.windDirection}deg)`,
                  transformOrigin: 'center center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  transition: 'transform 0.3s ease',
                }}
              >
                <div
                  style={{
                    width: 0,
                    height: 0,
                    borderLeft: '4px solid transparent',
                    borderRight: '4px solid transparent',
                    borderBottom: '9px solid var(--color-fire)',
                  }}
                />
                <div style={{ width: '2px', height: '25px', backgroundColor: 'var(--color-fire)' }} />
              </div>
            </div>
          </div>

          {/* Time Scrubber */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface-secondary)',
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.68rem',
                color: 'var(--text-secondary)',
                marginBottom: '6px',
                fontWeight: 500,
              }}
            >
              <span style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>TIME SELECTION</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
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
                accentColor: 'var(--accent-forest)',
                cursor: 'pointer',
              }}
            />

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.62rem',
                color: 'var(--text-secondary)',
                marginTop: '4px',
              }}
            >
              <span>{timeline.observations[0]?.formattedTime}</span>
              <span style={{ fontWeight: 600, color: 'var(--accent-forest)' }}>NOW</span>
              <span>{timeline.observations[timeline.observations.length - 1]?.formattedTime}</span>
            </div>
          </div>

          {/* Provenance & Data Source Disclaimer */}
          <div
            style={{
              fontSize: '0.66rem',
              color: 'var(--text-secondary)',
              borderTop: '1px solid var(--border-color)',
              paddingTop: '8px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              Source: <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{currentObs.source}</span>
            </div>
            <div>Hourly UTC</div>
          </div>
        </>
      )}
    </aside>
  );
};
