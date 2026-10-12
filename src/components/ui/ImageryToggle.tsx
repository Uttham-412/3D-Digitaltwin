import React from 'react';
import { Layers, Map, Satellite } from 'lucide-react';
import { ImageryType } from '../../cesium/imagery';

interface ImageryToggleProps {
  currentType: ImageryType;
  onSelectType: (type: ImageryType) => void;
}

export const ImageryToggle: React.FC<ImageryToggleProps> = ({
  currentType,
  onSelectType,
}) => {
  return (
    <div
      className="glass-panel"
      style={{
        position: 'absolute',
        bottom: '24px',
        right: '24px',
        display: 'flex',
        alignItems: 'center',
        padding: '4px',
        gap: '4px',
        zIndex: 25,
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-floating)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '0 8px',
          color: 'var(--text-secondary)',
          fontSize: '0.72rem',
          fontWeight: 600,
          letterSpacing: '0.04em',
        }}
      >
        <Layers size={14} color="var(--accent-forest)" />
      </div>

      <button
        onClick={() => onSelectType(ImageryType.SATELLITE)}
        className="glass-button"
        style={{
          padding: '6px 12px',
          fontSize: '0.75rem',
          fontWeight: currentType === ImageryType.SATELLITE ? 600 : 500,
          gap: '6px',
          background:
            currentType === ImageryType.SATELLITE
              ? 'var(--accent-forest-subtle)'
              : 'transparent',
          borderColor:
            currentType === ImageryType.SATELLITE
              ? 'var(--accent-forest-border)'
              : 'transparent',
          color:
            currentType === ImageryType.SATELLITE
              ? 'var(--accent-forest-dark)'
              : 'var(--text-secondary)',
        }}
      >
        <Satellite size={14} />
        Satellite
      </button>

      <button
        onClick={() => onSelectType(ImageryType.OPEN_STREET_MAP)}
        className="glass-button"
        style={{
          padding: '6px 12px',
          fontSize: '0.75rem',
          fontWeight: currentType === ImageryType.OPEN_STREET_MAP ? 600 : 500,
          gap: '6px',
          background:
            currentType === ImageryType.OPEN_STREET_MAP
              ? 'var(--accent-forest-subtle)'
              : 'transparent',
          borderColor:
            currentType === ImageryType.OPEN_STREET_MAP
              ? 'var(--accent-forest-border)'
              : 'transparent',
          color:
            currentType === ImageryType.OPEN_STREET_MAP
              ? 'var(--accent-forest-dark)'
              : 'var(--text-secondary)',
        }}
      >
        <Map size={14} />
        Vector GIS
      </button>
    </div>
  );
};
