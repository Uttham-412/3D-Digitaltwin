/**
 * LAND8FIRE — DIGITAL TWIN SIMULATION CLOCK MANAGER
 *
 * Authoritative clock manager for synchronizing Digital Twin scenario time progression:
 * - Ignition timestamp (t₀)
 * - Current simulation timestamp (tₖ = t₀ + Δt)
 * - Active horizon selection (+0H, +1H, +2H, +6H, +12H, +24H)
 * - Animated playback controls (play, pause, speed multiplier)
 * - Reactive event subscriptions for UI & Cesium layers
 */

import { SpreadHorizon } from './fireScenarioTypes';

export interface SimulationClockState {
  simulationStartTime: string;
  currentSimulationTime: string;
  elapsedHours: number;
  activeHorizon: SpreadHorizon;
  isPlaying: boolean;
  playbackSpeed: number; // 1x, 2x, 5x
}

export type ClockListener = (state: SimulationClockState) => void;

export class SimulationClockManager {
  private static instance: SimulationClockManager | null = null;

  private startTime: Date = new Date();
  private elapsedHours: number = 0;
  private activeHorizon: SpreadHorizon = '+0H';
  private isPlaying: boolean = false;
  private playbackSpeed: number = 1;
  private timerId: NodeJS.Timeout | null = null;
  private listeners: Set<ClockListener> = new Set();

  private readonly horizonsMap: Record<SpreadHorizon, number> = {
    '+0H': 0,
    '+1H': 1,
    '+2H': 2,
    '+6H': 6,
    '+12H': 12,
    '+24H': 24
  };

  private readonly availableHorizons: SpreadHorizon[] = ['+0H', '+1H', '+2H', '+6H', '+12H', '+24H'];

  private constructor() {}

  public static getInstance(): SimulationClockManager {
    if (!SimulationClockManager.instance) {
      SimulationClockManager.instance = new SimulationClockManager();
    }
    return SimulationClockManager.instance;
  }

  /**
   * Initialize simulation clock with ignition timestamp.
   */
  public initializeClock(ignitionIsoTime?: string): void {
    this.stopPlayback();
    this.startTime = ignitionIsoTime ? new Date(ignitionIsoTime) : new Date();
    this.elapsedHours = 0;
    this.activeHorizon = '+0H';
    this.notify();
  }

  /**
   * Set specific horizon (+0H, +1H, +2H, +6H, +12H, +24H).
   */
  public setHorizon(horizon: SpreadHorizon): void {
    if (this.horizonsMap[horizon] !== undefined) {
      this.activeHorizon = horizon;
      this.elapsedHours = this.horizonsMap[horizon];
      this.notify();
    }
  }

  /**
   * Set numeric elapsed hours.
   */
  public setElapsedHours(hours: number): void {
    this.elapsedHours = Math.max(0, Math.min(24, hours));
    // Find closest matching horizon tag
    let closestHorizon: SpreadHorizon = '+0H';
    let minDiff = Infinity;
    this.availableHorizons.forEach((h) => {
      const diff = Math.abs(this.horizonsMap[h] - this.elapsedHours);
      if (diff < minDiff) {
        minDiff = diff;
        closestHorizon = h;
      }
    });
    this.activeHorizon = closestHorizon;
    this.notify();
  }

  /**
   * Start automated time playback.
   */
  public startPlayback(): void {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.notify();

    this.timerId = setInterval(() => {
      // Step to next horizon index
      const currentIndex = this.availableHorizons.indexOf(this.activeHorizon);
      const nextIndex = (currentIndex + 1) % this.availableHorizons.length;
      this.setHorizon(this.availableHorizons[nextIndex]);
    }, 2500 / this.playbackSpeed);
  }

  /**
   * Pause automated time playback.
   */
  public stopPlayback(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.isPlaying = false;
    this.notify();
  }

  public togglePlayback(): void {
    if (this.isPlaying) {
      this.stopPlayback();
    } else {
      this.startPlayback();
    }
  }

  public setPlaybackSpeed(speed: number): void {
    this.playbackSpeed = speed;
    if (this.isPlaying) {
      this.stopPlayback();
      this.startPlayback();
    }
  }

  /**
   * Retrieve current clock state.
   */
  public getState(): SimulationClockState {
    const currentMs = this.startTime.getTime() + this.elapsedHours * 3600 * 1000;
    return {
      simulationStartTime: this.startTime.toISOString(),
      currentSimulationTime: new Date(currentMs).toISOString(),
      elapsedHours: this.elapsedHours,
      activeHorizon: this.activeHorizon,
      isPlaying: this.isPlaying,
      playbackSpeed: this.playbackSpeed
    };
  }

  /**
   * Subscribe to clock state changes.
   */
  public subscribe(listener: ClockListener): () => void {
    this.listeners.add(listener);
    // Immediately trigger with current state
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
  }
}

export const simulationClockManager = SimulationClockManager.getInstance();
