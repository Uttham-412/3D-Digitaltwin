/**
 * LAND8FIRE — OBJECTIVE 2: FOREST CONDITION CONTROL SECTION
 *
 * Compact sidebar control section for the Forest Condition layer, integrated directly
 * into the main Location Control Panel hierarchy.
 *
 * Provides:
 * - Category visibility toggles (Healthy Vegetation, Dry Vegetation / Fuel, Active Fire, Burned Area)
 * - Color swatches from forestConditionTypes.ts
 * - Provenance indicators (DERIVED, OBSERVED, U-NET, EMS, UNAVAILABLE)
 * - Burned area source selector (U-Net Model Prediction vs EMS Ground Truth)
 *
 * No fake statistics, no fake charts, no floating dashboards.
 */

import React, { useState } from 'react';
import { ForestConditionLayerManager } from '../../cesium/forestConditionLayer';
import {
  ForestConditionCategory,
  INITIAL_FOREST_CONDITION_CLASSES
} from '../../classification/forestConditionTypes';

interface ForestConditionPanelProps {
  hasActiveFireData?: boolean;
  hasBurnedAreaGroundTruth?: boolean;
}

export const ForestConditionPanel: React.FC<ForestConditionPanelProps> = ({
  hasActiveFireData = false,
  hasBurnedAreaGroundTruth = false
}) => {
  const layerManager = ForestConditionLayerManager.getInstance();

  const [categories, setCategories] = useState<Record<ForestConditionCategory, boolean>>({
    HEALTHY_VEGETATION: true,
    DRY_VEGETATION: true,
    ACTIVE_FIRE: false,
    BURNED_AREA: true
  });

  const [burnedAreaSource, setBurnedAreaSource] = useState<'MODEL_PREDICTION' | 'GROUND_TRUTH'>('MODEL_PREDICTION');

  const handleCategoryToggle = (category: ForestConditionCategory) => {
    if (category === 'ACTIVE_FIRE' && !hasActiveFireData) return;
    const nextState = !categories[category];
    setCategories((prev) => ({ ...prev, [category]: nextState }));
    layerManager.setCategoryVisible(category, nextState);
  };

  const handleBurnedAreaSourceChange = (source: 'MODEL_PREDICTION' | 'GROUND_TRUTH') => {
    setBurnedAreaSource(source);
    if (source === 'MODEL_PREDICTION') {
      layerManager.setBurnedAreaPredictionVisibility(true);
      layerManager.setBurnedAreaGroundTruthVisibility(false);
    } else {
      layerManager.setBurnedAreaPredictionVisibility(false);
      layerManager.setBurnedAreaGroundTruthVisibility(true);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Section Title */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '2px'
        }}
      >
        <span
          style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)'
          }}
        >
          FOREST CONDITION
        </span>
      </div>

      {/* Category Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {/* 1. Healthy Vegetation */}
        <div
          onClick={() => handleCategoryToggle('HEALTHY_VEGETATION')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 8px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(0, 0, 0, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.04)',
            cursor: 'pointer'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: INITIAL_FOREST_CONDITION_CLASSES.HEALTHY_VEGETATION.color,
                display: 'inline-block'
              }}
            />
            <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-primary)' }}>
              Healthy Vegetation
            </span>
            <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              DERIVED
            </span>
          </div>
          <input
            type="checkbox"
            checked={categories.HEALTHY_VEGETATION}
            onChange={() => {}}
            style={{ accentColor: INITIAL_FOREST_CONDITION_CLASSES.HEALTHY_VEGETATION.color, cursor: 'pointer' }}
          />
        </div>

        {/* 2. Dry Vegetation / Fuel */}
        <div
          onClick={() => handleCategoryToggle('DRY_VEGETATION')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 8px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(0, 0, 0, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.04)',
            cursor: 'pointer'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: INITIAL_FOREST_CONDITION_CLASSES.DRY_VEGETATION.color,
                display: 'inline-block'
              }}
            />
            <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-primary)' }}>
              Dry Vegetation / Fuel
            </span>
            <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              DERIVED
            </span>
          </div>
          <input
            type="checkbox"
            checked={categories.DRY_VEGETATION}
            onChange={() => {}}
            style={{ accentColor: INITIAL_FOREST_CONDITION_CLASSES.DRY_VEGETATION.color, cursor: 'pointer' }}
          />
        </div>

        {/* 3. Active Fire (Unavailable) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 8px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(0, 0, 0, 0.15)',
            border: '1px solid rgba(255, 255, 255, 0.03)',
            opacity: hasActiveFireData ? 1 : 0.55
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: INITIAL_FOREST_CONDITION_CLASSES.ACTIVE_FIRE.color,
                display: 'inline-block'
              }}
            />
            <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
              Active Fire
            </span>
            <span style={{ fontSize: '0.62rem', color: '#94A3B8', fontWeight: 600 }}>
              {hasActiveFireData ? 'OBSERVED' : 'UNAVAILABLE'}
            </span>
          </div>
          <input
            type="checkbox"
            checked={categories.ACTIVE_FIRE && hasActiveFireData}
            disabled={!hasActiveFireData}
            readOnly
            style={{ accentColor: INITIAL_FOREST_CONDITION_CLASSES.ACTIVE_FIRE.color, cursor: 'not-allowed' }}
          />
        </div>

        {/* 4. Burned Area */}
        <div
          onClick={() => handleCategoryToggle('BURNED_AREA')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 8px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(0, 0, 0, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.04)',
            cursor: 'pointer'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: INITIAL_FOREST_CONDITION_CLASSES.BURNED_AREA.color,
                display: 'inline-block'
              }}
            />
            <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-primary)' }}>
              Burned Area
            </span>
            <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              {burnedAreaSource === 'MODEL_PREDICTION' ? 'U-NET' : 'EMS'}
            </span>
          </div>
          <input
            type="checkbox"
            checked={categories.BURNED_AREA}
            onChange={() => {}}
            style={{ accentColor: INITIAL_FOREST_CONDITION_CLASSES.BURNED_AREA.color, cursor: 'pointer' }}
          />
        </div>
      </div>

      {/* Burned Area Source Segmented Controls */}
      {categories.BURNED_AREA && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '2px',
            padding: '4px 6px',
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid rgba(255, 255, 255, 0.05)'
          }}
        >
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 500 }}>
            Burned Area Source:
          </span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleBurnedAreaSourceChange('MODEL_PREDICTION');
              }}
              style={{
                padding: '3px 8px',
                fontSize: '0.65rem',
                fontWeight: 600,
                borderRadius: '4px',
                border: 'none',
                background: burnedAreaSource === 'MODEL_PREDICTION' ? 'rgba(239, 68, 68, 0.3)' : 'transparent',
                color: burnedAreaSource === 'MODEL_PREDICTION' ? '#F87171' : 'var(--text-muted)',
                cursor: 'pointer'
              }}
            >
              U-Net
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (hasBurnedAreaGroundTruth) {
                  handleBurnedAreaSourceChange('GROUND_TRUTH');
                }
              }}
              disabled={!hasBurnedAreaGroundTruth}
              style={{
                padding: '3px 8px',
                fontSize: '0.65rem',
                fontWeight: 600,
                borderRadius: '4px',
                border: 'none',
                background: burnedAreaSource === 'GROUND_TRUTH' ? 'rgba(16, 185, 129, 0.3)' : 'transparent',
                color: burnedAreaSource === 'GROUND_TRUTH' ? '#34D399' : 'var(--text-muted)',
                cursor: hasBurnedAreaGroundTruth ? 'pointer' : 'not-allowed',
                opacity: hasBurnedAreaGroundTruth ? 1 : 0.4
              }}
            >
              EMS
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
