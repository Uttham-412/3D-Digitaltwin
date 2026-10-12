import React from 'react';

interface EnvironmentalFocusControlProps {
  isOpen: boolean;
  onToggle: () => void;
}

export const EnvironmentalFocusControl: React.FC<EnvironmentalFocusControlProps> = ({
  isOpen,
  onToggle
}) => {
  return (
    <button
      onClick={onToggle}
      className="glass-button"
      style={{
        backgroundColor: isOpen ? 'var(--accent-forest-subtle)' : 'var(--bg-surface)',
        border: isOpen
          ? '1px solid var(--accent-forest-border)'
          : '1px solid var(--border-color)',
        borderRadius: 'var(--radius-md)',
        padding: '8px 14px',
        color: isOpen ? 'var(--accent-forest-dark)' : 'var(--text-primary)',
        fontSize: '0.78rem',
        fontWeight: 600,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        boxShadow: 'var(--shadow-card)',
        transition: 'all 0.15s ease-in-out'
      }}
      title="Toggle Time-Aware Environmental Intelligence Panel"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke={isOpen ? 'var(--accent-forest-dark)' : 'var(--accent-forest)'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" />
        <path d="M9.6 4.6A2 2 0 1 1 11 8H2" />
        <path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
      </svg>
      <span>Weather & Wind</span>
    </button>
  );
};
