import React from 'react';
import { Flame } from 'lucide-react';
import { AMAZON_REAL_WILDFIRE_OBSERVATIONS } from '../../wildfire/fireObservation';
import { CesiumViewerManager } from '../../cesium/viewer';
import { SelectedLocation } from '../../geospatial/coordinates';
import { LayerDataType } from '../../wildfire/wildfireTypes';

interface FireFocusControlProps {
  onSelectLocation?: (loc: SelectedLocation) => void;
}

export const FireFocusControl: React.FC<FireFocusControlProps> = ({ onSelectLocation }) => {
  const activeFire = AMAZON_REAL_WILDFIRE_OBSERVATIONS[0];

  const handleFocusFire = () => {
    if (activeFire) {
      CesiumViewerManager.getInstance().flyToFireObservation(activeFire, 2.5);

      if (onSelectLocation) {
        onSelectLocation({
          id: `firms_${activeFire.id}`,
          latitude: activeFire.latitude,
          longitude: activeFire.longitude,
          height: 12000,
          source: 'FIRMS_FIRE',
          label: 'NASA FIRMS VIIRS Active Fire Observation',
          timestamp: new Date().toISOString(),
          eventDate: activeFire.observationTime,
          classification: LayerDataType.OBSERVED
        });
      }
    }
  };

  return (
    <button
      onClick={handleFocusFire}
      className="glass-button"
      title="Focus Camera on Active Fire Observation"
      style={{
        width: '40px',
        height: '40px',
        background: 'var(--status-error-bg)',
        borderColor: 'var(--status-error-border)',
        color: 'var(--status-error)',
      }}
    >
      <Flame size={20} />
    </button>
  );
};
