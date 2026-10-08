import * as Cesium from 'cesium';
import { SelectedLocation } from '../geospatial/coordinates';
import { LayerDataType } from '../wildfire/wildfireTypes';
import { AMAZON_RAINFOREST_REGION } from '../regions/amazon/amazonRegion';
import { FireObservation } from '../wildfire/fireObservation';

export interface CesiumInitOptions {
  container: HTMLDivElement;
}

export class CesiumViewerManager {
  private static instance: CesiumViewerManager | null = null;
  private viewer: Cesium.Viewer | null = null;
  private clickHandler: Cesium.ScreenSpaceEventHandler | null = null;

  public static getInstance(): CesiumViewerManager {
    if (!CesiumViewerManager.instance) {
      CesiumViewerManager.instance = new CesiumViewerManager();
    }
    return CesiumViewerManager.instance;
  }

  public initialize({ container }: CesiumInitOptions): Cesium.Viewer {
    if (this.viewer && !this.viewer.isDestroyed()) {
      return this.viewer;
    }

    // Configure Cesium Ion Access Token safely from environment
    const ionToken = import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN;
    if (ionToken && ionToken.trim().length > 0) {
      Cesium.Ion.defaultAccessToken = ionToken.trim();
    } else {
      console.warn(
        '[Land8Fire] No VITE_CESIUM_ION_ACCESS_TOKEN found in environment. Baseline imagery enabled. Add your token to .env.local for full 3D World Terrain and high-resolution satellite imagery.'
      );
    }

    // Initialize Cesium Viewer with clean, uncluttered custom UI settings
    this.viewer = new Cesium.Viewer(container, {
      animation: false,
      timeline: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      baseLayerPicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: true,
      selectionIndicator: false, // We use custom 3D SelectionMarkerManager
      requestRenderMode: true, // Optimizes performance by rendering on demand
      maximumRenderTimeChange: Infinity,
    });

    // Configure atmospheric & lighting visual quality
    const scene = this.viewer.scene;
    scene.globe.enableLighting = true;
    scene.globe.depthTestAgainstTerrain = true;
    scene.globe.showGroundAtmosphere = true;

    // Enable high-DPI scaling for sharp rendering on retina screens
    this.viewer.resolutionScale = window.devicePixelRatio || 1.0;

    // Set initial camera view directly to local Amazon forest study area (Manaus & Anavilhanas Reserve)
    this.resetCameraToDefault();

    return this.viewer;
  }

  public getViewer(): Cesium.Viewer | null {
    return this.viewer;
  }

  public resetCameraToDefault(): void {
    if (!this.viewer || this.viewer.isDestroyed()) return;

    // Realistic tilted 3D perspective over Manaus & Anavilhanas Rainforest Reserve
    this.viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(
        AMAZON_RAINFOREST_REGION.longitude,
        AMAZON_RAINFOREST_REGION.latitude,
        AMAZON_RAINFOREST_REGION.viewingHeight
      ),
      orientation: {
        heading: Cesium.Math.toRadians(AMAZON_RAINFOREST_REGION.headingDegrees),
        pitch: Cesium.Math.toRadians(AMAZON_RAINFOREST_REGION.pitchDegrees),
        roll: 0,
      },
    });
  }

  public flyToAmazonRegion(duration: number = 3.0): void {
    if (!this.viewer || this.viewer.isDestroyed()) return;

    // Smooth cinematic fly-to target over Manaus / Anavilhanas Amazon Rainforest
    this.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        AMAZON_RAINFOREST_REGION.longitude,
        AMAZON_RAINFOREST_REGION.latitude,
        AMAZON_RAINFOREST_REGION.viewingHeight
      ),
      orientation: {
        heading: Cesium.Math.toRadians(AMAZON_RAINFOREST_REGION.headingDegrees),
        pitch: Cesium.Math.toRadians(AMAZON_RAINFOREST_REGION.pitchDegrees),
        roll: 0,
      },
      duration: duration,
    });
  }

  public flyToFireObservation(fire: FireObservation, duration: number = 2.5): void {
    if (!this.viewer || this.viewer.isDestroyed()) return;

    // Smooth camera fly-to target directly to verified fire observation coordinates
    this.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(fire.longitude, fire.latitude, 12000), // Height 12 km
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-50), // 50 degree tilt for 3D observation
        roll: 0,
      },
      duration: duration,
    });
  }

  public flyToEMSR239Event(duration: number = 2.5): void {
    if (!this.viewer || this.viewer.isDestroyed()) return;

    // Fly camera directly to Patch 433 center (-6.004920° W, 37.844474° N) in Spain
    this.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(-6.00492, 37.844474, 8500), // Height 8.5 km for patch overview
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-45),
        roll: 0,
      },
      duration: duration,
    });
  }

  public flyToLocation(latitude: number, longitude: number, height: number = 15000): void {
    if (!this.viewer || this.viewer.isDestroyed()) return;

    this.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, Math.max(height * 2.5, 5000)),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-50),
        roll: 0,
      },
      duration: 2.0,
    });
  }

  public registerClickListener(onSelectLocation: (location: SelectedLocation) => void): void {
    if (!this.viewer || this.viewer.isDestroyed()) return;

    if (this.clickHandler) {
      this.clickHandler.destroy();
    }

    this.clickHandler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);
    
    this.clickHandler.setInputAction((click: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      if (!this.viewer) return;

      const scene = this.viewer.scene;
      let cartesian: Cesium.Cartesian3 | undefined;

      // 1. Attempt exact ray pick on 3D terrain / tiles if depth test is active
      if (scene.pickPositionSupported) {
        cartesian = scene.pickPosition(click.position);
      }

      // 2. Fallback to ellipsoid pick if pickPosition returns undefined
      if (!cartesian || !Cesium.defined(cartesian)) {
        cartesian = this.viewer.camera.pickEllipsoid(click.position, scene.globe.ellipsoid);
      }

      if (cartesian && Cesium.defined(cartesian)) {
        const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
        const lat = Cesium.Math.toDegrees(cartographic.latitude);
        const lng = Cesium.Math.toDegrees(cartographic.longitude);
        const height = Math.max(0, cartographic.height);

        const selectedLocation: SelectedLocation = {
          id: `loc_${Date.now()}`,
          latitude: parseFloat(lat.toFixed(6)),
          longitude: parseFloat(lng.toFixed(6)),
          height: parseFloat(height.toFixed(1)),
          timestamp: new Date().toISOString(),
          source: 'GLOBE_CLICK',
          classification: LayerDataType.OBSERVED,
        };

        onSelectLocation(selectedLocation);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  public destroy(): void {
    if (this.clickHandler) {
      this.clickHandler.destroy();
      this.clickHandler = null;
    }

    if (this.viewer && !this.viewer.isDestroyed()) {
      this.viewer.destroy();
      this.viewer = null;
    }
  }
}
