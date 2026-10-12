import React from 'react';
import { Globe, Mountain, Key, MapPin } from 'lucide-react';
import { SelectedLocation } from '../../geospatial/coordinates';

interface HeaderProps {
  coordinates?: string;
  altitude?: string;
  isTerrainLoaded?: boolean;
  selectedLocation?: SelectedLocation | null;
}

export const Header: React.FC<HeaderProps> = ({
  coordinates = '---, ---',
  altitude = '---',
  isTerrainLoaded = false,
  selectedLocation = null,
}) => {
  const hasToken = Boolean(
    import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN &&
      import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN.trim().length > 0
  );

  return (
    <header
      className="glass-panel"
      style={{
        position: 'absolute',
        top: '16px',
        left: '16px',
        right: '16px',
        height: '56px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        zIndex: 30,
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-surface)',
        borderColor: 'var(--border-color)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      {/* Brand Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div>
          <h1
            style={{
              fontSize: '1.02rem',
              fontWeight: 700,
              letterSpacing: '-0.015em',
              lineHeight: 1.2,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              margin: 0,
              color: 'var(--text-primary)',
            }}
          >
            Digital Twin
            <span
              style={{
                fontSize: '0.62rem',
                fontWeight: 600,
                color: 'var(--accent-forest-dark)',
                border: '1px solid var(--accent-forest-border)',
                background: 'var(--accent-forest-subtle)',
                padding: '2px 8px',
                borderRadius: '4px',
                letterSpacing: '0.02em',
              }}
            >
              Study Region Active
            </span>
          </h1>
          <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', margin: 0, marginTop: '2px', fontWeight: 400 }}>
            Geospatial Wildfire Monitoring & Simulation
          </p>
        </div>
      </div>

      {/* Real-time Telemetry & Engine Status Pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Coordinates Readout */}
        <div
          className="glass-panel"
          style={{
            padding: '5px 12px',
            fontSize: '0.74rem',
            fontFamily: 'var(--font-mono)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-secondary)',
            boxShadow: 'var(--shadow-sm)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <Globe size={13} color="var(--accent-forest)" />
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{coordinates}</span>
          <span style={{ color: 'var(--border-color-strong)' }}>|</span>
          <span style={{ color: 'var(--text-secondary)' }}>ALT {altitude}</span>
        </div>

        {/* Terrain Status */}
        <div
          className="glass-panel hide-on-mobile"
          style={{
            padding: '5px 10px',
            fontSize: '0.70rem',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: isTerrainLoaded ? 'var(--status-success-bg)' : 'var(--status-warning-bg)',
            borderColor: isTerrainLoaded ? 'var(--status-success-border)' : 'var(--status-warning-border)',
            color: isTerrainLoaded ? 'var(--status-success)' : 'var(--status-warning)',
            boxShadow: 'none',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <Mountain size={13} />
          <span>{isTerrainLoaded ? '3D Terrain Active' : 'Ellipsoid Baseline'}</span>
        </div>

        {/* Selected Location Target Indicator */}
        {selectedLocation && (
          <div
            className="glass-panel hide-on-mobile"
            style={{
              padding: '5px 10px',
              fontSize: '0.70rem',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--accent-blue-subtle)',
              borderColor: 'var(--accent-blue-border)',
              color: 'var(--accent-blue)',
              boxShadow: 'none',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <MapPin size={13} />
            <span>Target Selected</span>
          </div>
        )}

        {/* Cesium Ion Token Indicator */}
        <div
          className="glass-panel hide-on-mobile"
          style={{
            padding: '5px 10px',
            fontSize: '0.70rem',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: hasToken ? 'var(--bg-surface-secondary)' : 'var(--bg-surface)',
            borderColor: 'var(--border-color)',
            color: hasToken ? 'var(--text-primary)' : 'var(--text-muted)',
            boxShadow: 'none',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <Key size={13} />
          <span>{hasToken ? 'Ion Connected' : 'Ion Pending'}</span>
        </div>
      </div>
    </header>
  );
};
