import React from 'react';
import { Trees } from 'lucide-react';
import { CesiumViewerManager } from '../../cesium/viewer';
import { SelectedLocation } from '../../geospatial/coordinates';
import { LayerDataType } from '../../wildfire/wildfireTypes';

interface AmazonRegionControlProps {
  onSelectLocation?: (loc: SelectedLocation) => void;
}

export const AmazonRegionControl: React.FC<AmazonRegionControlProps> = ({ onSelectLocation }) => {
  const handleFlyToAmazon = () => {
    const manager = CesiumViewerManager.getInstance();
    manager.flyToAmazonRegion(3.0);

    if (onSelectLocation) {
      onSelectLocation({
        id: `amazon_${Date.now()}`,
        latitude: -3.3842,
        longitude: -60.1985,
        height: 12000,
        source: 'AMAZON_REGION',
        label: 'Amazon Rainforest (Manaus Corridor, Brazil)',
        timestamp: new Date().toISOString(),
        classification: LayerDataType.OBSERVED
      });
    }
  };

  return (
    <button
      onClick={handleFlyToAmazon}
      className="glass-button"
      title="Fly to Amazon Rainforest 3D Digital Twin"
      style={{
        width: '40px',
        height: '40px',
        background: 'var(--accent-forest-subtle)',
        borderColor: 'var(--accent-forest-border)',
        color: 'var(--accent-forest)',
      }}
    >
      <Trees size={20} />
    </button>
  );
};
