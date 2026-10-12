import React, { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { CesiumViewerManager } from '../../cesium/viewer';
import { enableWorldTerrain } from '../../cesium/terrain';
import { formatCoordinates, SelectedLocation } from '../../geospatial/coordinates';
import 'cesium/Build/Cesium/Widgets/widgets.css';

interface CesiumViewerProps {
  onCoordinatesUpdate?: (coords: string, altitude: string) => void;
  onTerrainLoaded?: (status: boolean) => void;
  onSelectLocation?: (location: SelectedLocation) => void;
}

export const CesiumViewerComponent: React.FC<CesiumViewerProps> = ({
  onCoordinatesUpdate,
  onTerrainLoaded,
  onSelectLocation,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;

    const manager = CesiumViewerManager.getInstance();
    const viewer = manager.initialize({ container: containerRef.current });

    setIsInitializing(false);

    // Initialize 3D terrain asynchronously
    enableWorldTerrain(viewer).then((loaded) => {
      if (onTerrainLoaded) onTerrainLoaded(loaded);
    });

    // Register globe click listener for real-world location selection
    if (onSelectLocation) {
      manager.registerClickListener(onSelectLocation);
    }

    // Handle cursor movement for real-time lat/lng & elevation readout
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
      if (!onCoordinatesUpdate) return;

      const cartesian = viewer.camera.pickEllipsoid(
        movement.endPosition,
        viewer.scene.globe.ellipsoid
      );

      if (cartesian) {
        const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
        const lat = Cesium.Math.toDegrees(cartographic.latitude);
        const lng = Cesium.Math.toDegrees(cartographic.longitude);
        const alt = viewer.camera.positionCartographic.height;

        const formattedCoords = formatCoordinates(lat, lng);
        const formattedAlt = alt > 1000 ? `${(alt / 1000).toFixed(1)} km` : `${alt.toFixed(0)} m`;

        onCoordinatesUpdate(formattedCoords, formattedAlt);
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    return () => {
      handler.destroy();
      manager.destroy();
    };
  }, [onCoordinatesUpdate, onTerrainLoaded]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} className="cesium-viewer" />
      {isInitializing && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg-dark)',
            color: 'var(--text-secondary)',
            zIndex: 10,
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                width: 36,
                height: 36,
                border: '3px solid var(--bg-surface-border)',
                borderTopColor: 'var(--accent-forest)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 12px auto',
              }}
            />
            <p style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>
              Initializing 3D terrain and globe...
            </p>
          </div>
          <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </div>
  );
};
