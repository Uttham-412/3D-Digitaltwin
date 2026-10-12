import React from 'react';
import { Plus, Minus, Compass, Move3d } from 'lucide-react';
import { CesiumViewerManager } from '../../cesium/viewer';
import { AmazonRegionControl } from './AmazonRegionControl';
import { FireFocusControl } from './FireFocusControl';
import { SelectedLocation } from '../../geospatial/coordinates';
import * as Cesium from 'cesium';

interface CameraControlsProps {
  onSelectLocation?: (loc: SelectedLocation) => void;
}

export const CameraControls: React.FC<CameraControlsProps> = ({ onSelectLocation }) => {
  const manager = CesiumViewerManager.getInstance();

  const handleZoomIn = () => {
    const viewer = manager.getViewer();
    if (!viewer) return;
    viewer.camera.zoomIn(viewer.camera.positionCartographic.height * 0.3);
    viewer.scene.requestRender();
  };

  const handleZoomOut = () => {
    const viewer = manager.getViewer();
    if (!viewer) return;
    viewer.camera.zoomOut(viewer.camera.positionCartographic.height * 0.3);
    viewer.scene.requestRender();
  };

  const handleResetCamera = () => {
    manager.resetCameraToDefault();
  };

  const handleToggleTilt = () => {
    const viewer = manager.getViewer();
    if (!viewer) return;

    const currentPitch = Cesium.Math.toDegrees(viewer.camera.pitch);
    const targetPitch = currentPitch < -75 ? -45 : -89; // Toggle between 3D tilt perspective and top-down orthographic perspective

    viewer.camera.flyTo({
      destination: Cesium.Cartographic.toCartesian(viewer.camera.positionCartographic),
      orientation: {
        heading: viewer.camera.heading,
        pitch: Cesium.Math.toRadians(targetPitch),
        roll: 0,
      },
      duration: 1.0,
    });
  };

  return (
    <div
      style={{
        position: 'absolute',
        right: '20px',
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        zIndex: 20,
      }}
    >
      <button
        onClick={handleZoomIn}
        className="glass-button"
        title="Zoom In"
        style={{ width: '40px', height: '40px', fontSize: '1.2rem' }}
      >
        <Plus size={20} />
      </button>

      <button
        onClick={handleZoomOut}
        className="glass-button"
        title="Zoom Out"
        style={{ width: '40px', height: '40px', fontSize: '1.2rem' }}
      >
        <Minus size={20} />
      </button>

      <div style={{ height: '1px', background: 'var(--bg-surface-border)', margin: '4px 0' }} />

      <button
        onClick={handleResetCamera}
        className="glass-button"
        title="Reset View to Default Globe"
        style={{ width: '40px', height: '40px' }}
      >
        <Compass size={20} color="var(--accent-blue)" />
      </button>

      <button
        onClick={handleToggleTilt}
        className="glass-button"
        title="Toggle 3D Perspective Tilt"
        style={{ width: '40px', height: '40px' }}
      >
        <Move3d size={20} />
      </button>

      <div style={{ height: '1px', background: 'var(--bg-surface-border)', margin: '4px 0' }} />

      <AmazonRegionControl onSelectLocation={onSelectLocation} />
      <FireFocusControl onSelectLocation={onSelectLocation} />
    </div>
  );
};
