/**
 * LAND8FIRE — DYNAMIC FOREST CONDITION PANEL (PHASE 3F)
 *
 * Location-dependent forest condition sampling and visualization control section.
 * Samples exact spatial datasets (ESA WorldCover water mask, Sentinel-2 BOA reflectance,
 * NDVI, NBR, and Land8Fire U-Net burned area predictions) at the user's selected coordinates.
 *
 * Strict Compliance:
 * - Visibly updates latitude/longitude and classification on every map click.
 * - Clears stale values while new query is in-flight.
 * - Displays distinct categories:
 *   HEALTHY VEGETATION, DRY / STRESSED VEGETATION, PREDICTED BURNED AREA,
 *   CONFIRMED BURNED AREA, WATER, NON-BURNABLE / URBAN, UNVERIFIED / INSUFFICIENT DATA.
 * - Separates vegetation greenness, physical burnability, and model prediction.
 * - Low NDVI is never conflated with fire damage without spectral burn confirmation.
 */

import React, { useState, useEffect } from 'react';
import { Info, ChevronDown, ChevronUp, Layers, Activity } from 'lucide-react';
import { ForestConditionLayerManager } from '../../cesium/forestConditionLayer';
import {
  ForestConditionCategory,
  INITIAL_FOREST_CONDITION_CLASSES
} from '../../classification/forestConditionTypes';
import { SelectedLocation } from '../../geospatial/coordinates';
import {
  forestConditionService,
  ForestConditionSampleResult
} from '../../geospatial/forestConditionService';

interface ForestConditionPanelProps {
  location?: SelectedLocation | null;
  hasActiveFireData?: boolean;
  hasBurnedAreaGroundTruth?: boolean;
}

export const ForestConditionPanel: React.FC<ForestConditionPanelProps> = ({
  location,
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
  const [showScientificDetails, setShowScientificDetails] = useState<boolean>(false);
  const [sampleResult, setSampleResult] = useState<ForestConditionSampleResult | null>(null);
  const [isSamplingLoading, setIsSamplingLoading] = useState<boolean>(false);

  // Dynamic spatial sampling on location coordinate change
  useEffect(() => {
    if (!location) {
      setSampleResult(null);
      setIsSamplingLoading(false);
      return;
    }

    let isMounted = true;
    // Clear previous location values immediately to prevent displaying stale data
    setIsSamplingLoading(true);
    setSampleResult(null);

    forestConditionService
      .sampleCondition(
        { latitude: location.latitude, longitude: location.longitude },
        location.source
      )
      .then((res) => {
        if (isMounted) {
          setSampleResult(res);
          setIsSamplingLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsSamplingLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [location?.latitude, location?.longitude, location?.source]);

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
      {/* Section Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '2px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Activity size={13} color="#10B981" />
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)'
            }}
          >
            FOREST CONDITION & SURFACE DATA
          </span>
        </div>
        {location && (
          <span
            style={{
              fontSize: '0.64rem',
              fontFamily: 'monospace',
              color: '#94A3B8'
            }}
          >
            {location.latitude.toFixed(4)}°, {location.longitude.toFixed(4)}°
          </span>
        )}
      </div>

      {/* Dynamic Location-Dependent Surface Sample Card */}
      <div
        style={{
          padding: '10px',
          borderRadius: 'var(--radius-sm)',
          background: 'rgba(15, 23, 42, 0.75)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px'
        }}
      >
        {isSamplingLoading ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 0',
              color: '#94A3B8',
              fontSize: '0.68rem'
            }}
          >
            <div
              style={{
                width: '12px',
                height: '12px',
                border: '2px solid rgba(56, 189, 248, 0.2)',
                borderTopColor: '#38BDF8',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}
            />
            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
            <span>Sampling spatial rasters at selected coordinates...</span>
          </div>
        ) : sampleResult ? (
          <>
            {/* Classification Badge & Confidence */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: sampleResult.color,
                    boxShadow: `0 0 6px ${sampleResult.color}`
                  }}
                />
                <span
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    color: sampleResult.color,
                    textTransform: 'uppercase'
                  }}
                >
                  {sampleResult.classification}
                </span>
              </div>
              {sampleResult.classification === 'UNVERIFIED / INSUFFICIENT DATA' && (
                <span
                  style={{
                    fontSize: '0.62rem',
                    fontWeight: 600,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    color: '#CBD5E1'
                  }}
                >
                  UNVERIFIED
                </span>
              )}
            </div>

            {/* Description */}
            <p
              style={{
                margin: '2px 0 0 0',
                fontSize: '0.68rem',
                color: '#CBD5E1',
                lineHeight: 1.35
              }}
            >
              {sampleResult.description}
            </p>

            {/* Metadata Provenance Line */}
            <div
              style={{
                fontSize: '0.62rem',
                color: '#64748B',
                borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                paddingTop: '4px',
                marginTop: '2px',
                display: 'flex',
                justifyContent: 'space-between'
              }}
            >
              <span>Source: {sampleResult.source}</span>
              {sampleResult.observationDate && (
                <span>Acq: {sampleResult.observationDate.split('T')[0]}</span>
              )}
            </div>

            {/* Scientific Limitation Callout */}
            {sampleResult.limitationsNote && (
              <div
                style={{
                  fontSize: '0.60rem',
                  color: '#94A3B8',
                  fontStyle: 'italic',
                  lineHeight: 1.25
                }}
              >
                * {sampleResult.limitationsNote}
              </div>
            )}
          </>
        ) : (
          <span style={{ fontSize: '0.68rem', color: '#94A3B8' }}>
            Click anywhere on the 3D globe to sample spatial forest condition.
          </span>
        )}
      </div>

      {/* Layer Visibility Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
        <Layers size={11} color="#94A3B8" />
        <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#94A3B8' }}>
          3D MAP LAYER VISIBILITY
        </span>
      </div>

      {/* Category Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {/* 1. Healthy Vegetation */}
        <div
          onClick={() => handleCategoryToggle('HEALTHY_VEGETATION')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '5px 8px',
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
            <span style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-primary)' }}>
              Healthy Vegetation
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
            padding: '5px 8px',
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
            <span style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-primary)' }}>
              Dry / Stressed Vegetation
            </span>
          </div>
          <input
            type="checkbox"
            checked={categories.DRY_VEGETATION}
            onChange={() => {}}
            style={{ accentColor: INITIAL_FOREST_CONDITION_CLASSES.DRY_VEGETATION.color, cursor: 'pointer' }}
          />
        </div>

        {/* 3. Burned Area */}
        <div
          onClick={() => handleCategoryToggle('BURNED_AREA')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '5px 8px',
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
            <span style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-primary)' }}>
              Burned Area Overlay
            </span>
            <span style={{ fontSize: '0.60rem', color: 'var(--text-muted)', fontWeight: 600 }}>
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
          <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 500 }}>
            Burned Area Source:
          </span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleBurnedAreaSourceChange('MODEL_PREDICTION');
              }}
              style={{
                padding: '2px 7px',
                fontSize: '0.64rem',
                fontWeight: 600,
                borderRadius: '4px',
                border: 'none',
                background: burnedAreaSource === 'MODEL_PREDICTION' ? 'rgba(239, 68, 68, 0.3)' : 'transparent',
                color: burnedAreaSource === 'MODEL_PREDICTION' ? '#F87171' : 'var(--text-muted)',
                cursor: 'pointer'
              }}
            >
              U-Net (τ=0.65)
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
                padding: '2px 7px',
                fontSize: '0.64rem',
                fontWeight: 600,
                borderRadius: '4px',
                border: 'none',
                background: burnedAreaSource === 'GROUND_TRUTH' ? 'rgba(16, 185, 129, 0.3)' : 'transparent',
                color: burnedAreaSource === 'GROUND_TRUTH' ? '#34D399' : 'var(--text-muted)',
                cursor: hasBurnedAreaGroundTruth ? 'pointer' : 'not-allowed',
                opacity: hasBurnedAreaGroundTruth ? 1 : 0.4
              }}
            >
              EMS Reference
            </button>
          </div>
        </div>
      )}

      {/* Scientific Semantics & Limitations Toggle */}
      <button
        onClick={() => setShowScientificDetails((prev) => !prev)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '4px 6px',
          background: 'transparent',
          border: 'none',
          color: '#94A3B8',
          fontSize: '0.65rem',
          cursor: 'pointer',
          marginTop: '2px'
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Info size={11} color="#38BDF8" />
          <span>Scientific Semantics & Limitations</span>
        </span>
        {showScientificDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {showScientificDetails && (
        <div
          style={{
            padding: '6px 8px',
            background: 'rgba(15, 23, 42, 0.7)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid rgba(56, 189, 248, 0.2)',
            fontSize: '0.63rem',
            color: '#CBD5E1',
            lineHeight: 1.35,
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          }}
        >
          <div>
            <strong style={{ color: '#10B981' }}>Healthy Vegetation (NDVI ≥ 0.50): </strong>
            Chlorophyll-dense canopy. <em>Separated from burnability:</em> high biomass can still burn during severe drought or crown fires.
          </div>
          <div>
            <strong style={{ color: '#F59E0B' }}>Dry Vegetation (NDVI 0.15–0.49): </strong>
            Moisture-stressed foliage. Represents potential fine fuel availability, <em>not active burning</em>.
          </div>
          <div>
            <strong style={{ color: '#94A3B8' }}>Sparse Vegetation / Bare Soil (NDVI &lt; 0.15): </strong>
            A low NDVI value alone <em>does not classify a point as burned</em> without spectral burn scar evidence.
          </div>
          <div>
            <strong style={{ color: '#EF4444' }}>Predicted Burned Area: </strong>
            U-Net 15-channel AI segmentation (τ = 0.65). Predicts burned scar patterns, not active flame front.
          </div>
          <div>
            <strong style={{ color: '#38BDF8' }}>Water: </strong>
            ESA WorldCover 10m permanent water bodies. Physical fire ignition and spread strictly prohibited.
          </div>
        </div>
      )}
    </div>
  );
};
