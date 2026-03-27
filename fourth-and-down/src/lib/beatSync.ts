// Beat detection using Web Audio API
// Connects to MusicKit's audio output via AudioContext and pulses Hue lights on beats

import { api } from './api';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BeatSyncConfig {
  sensitivity: number;      // 0-100, default 50
  zones: string[];           // Hue zone groupIds to pulse
  pulseIntensity: number;    // how much brightness drops on beat (10-50%)
  baseBrightness: number;    // steady-state brightness (from Music.tsx hueBrightness)
}

type BeatCallback = () => void;

// ─── State ──────────────────────────────────────────────────────────────────

let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let isActive = false;
let config: BeatSyncConfig = { sensitivity: 50, zones: [], pulseIntensity: 30, baseBrightness: 100 };
let animFrameId: number | null = null;
let mediaSourceCreated = false;

// Beat detection state
const energyHistory: number[] = [];
const HISTORY_SIZE = 43; // ~0.7 seconds at 60fps
const MIN_BEAT_INTERVAL = 200; // ms
let lastBeatTime = 0;

// Light rotation
let lightIndex = 0;

// Zone lights cache: zoneId -> lightIds
const zoneLightsCache: Record<string, string[]> = {};

// Beat event subscribers
const beatCallbacks: BeatCallback[] = [];

// ─── Beat Event ─────────────────────────────────────────────────────────────

export function onBeatEvent(cb: BeatCallback) {
  beatCallbacks.push(cb);
}

export function offBeatEvent(cb: BeatCallback) {
  const idx = beatCallbacks.indexOf(cb);
  if (idx >= 0) beatCallbacks.splice(idx, 1);
}

function emitBeat() {
  for (const cb of beatCallbacks) {
    try { cb(); } catch (_) { /* ignore */ }
  }
}

// ─── Audio Element Discovery ────────────────────────────────────────────────

function findAudioElement(): HTMLAudioElement | null {
  // Try common MusicKit audio element selectors
  const el =
    document.querySelector<HTMLAudioElement>('audio[src*="aod-ssl.itunes.apple.com"]') ||
    document.querySelector<HTMLAudioElement>('#apple-music-player audio') ||
    document.querySelector<HTMLAudioElement>('audio');

  if (el) return el;

  // Try MusicKit internal player reference
  try {
    const mk = (window as any).MusicKit?.getInstance?.();
    const audioEl = mk?._player?._mediaElement || mk?._player?.audio;
    if (audioEl instanceof HTMLAudioElement) return audioEl;
  } catch (_) { /* ignore */ }

  return null;
}

// ─── Beat Detection Loop ────────────────────────────────────────────────────

function detectBeat() {
  if (!isActive || !analyser || !audioContext) return;

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);

  // Bass energy (first bins up to ~200Hz)
  const bassEnd = Math.max(1, Math.floor(200 / (audioContext.sampleRate / analyser.fftSize)));
  let energy = 0;
  for (let i = 0; i < bassEnd; i++) {
    energy += dataArray[i] * dataArray[i];
  }
  energy = Math.sqrt(energy / bassEnd);

  energyHistory.push(energy);
  if (energyHistory.length > HISTORY_SIZE) energyHistory.shift();

  const avgEnergy = energyHistory.reduce((s, e) => s + e, 0) / energyHistory.length;
  // sensitivity 50 -> threshold 1.5, sensitivity 100 -> threshold 1.0, sensitivity 0 -> threshold 2.0
  const threshold = 1.0 + (100 - config.sensitivity) / 100;

  const now = performance.now();
  if (
    energy > avgEnergy * threshold &&
    now - lastBeatTime > MIN_BEAT_INTERVAL &&
    energyHistory.length >= HISTORY_SIZE / 2
  ) {
    lastBeatTime = now;
    emitBeat();
    pulseLights();
  }

  // Log energy periodically for debugging (every ~2 seconds)
  if (Math.floor(now / 2000) !== Math.floor((now - 500) / 2000)) {
    console.log(`[BeatSync] energy: ${energy.toFixed(1)} avg: ${avgEnergy.toFixed(1)} threshold: ${(avgEnergy * threshold).toFixed(1)} sensitivity: ${config.sensitivity}`);
  }

  animFrameId = requestAnimationFrame(detectBeat);
}

// ─── Light Pulsing ──────────────────────────────────────────────────────────

function pulseLights() {
  // Collect all lights from configured zones
  const allLights: string[] = [];
  for (const zoneId of config.zones) {
    const lights = zoneLightsCache[zoneId];
    if (lights) allLights.push(...lights);
  }

  if (allLights.length === 0) return;

  // Pick next light to pulse (rotate to stay under Hue bridge rate limit)
  const lightId = allLights[lightIndex % allLights.length];
  lightIndex++;

  const pulseBri = Math.max(10, config.baseBrightness - config.pulseIntensity);

  // Pulse down
  api.put(`/hue/lights/${lightId}`, { brightness: pulseBri }).catch(() => {});

  // Pulse back up after 100ms
  setTimeout(() => {
    api.put(`/hue/lights/${lightId}`, { brightness: config.baseBrightness }).catch(() => {});
  }, 100);
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function startBeatSync(cfg: BeatSyncConfig): Promise<boolean> {
  if (isActive) return true;

  const audioEl = findAudioElement();
  if (!audioEl) {
    console.warn('[BeatSync] No audio element found');
    return false;
  }

  config = { ...cfg };

  try {
    console.log('[BeatSync] Audio element found:', audioEl.src?.substring(0, 60) || 'no src');

    if (!audioContext) {
      audioContext = new AudioContext();
      console.log('[BeatSync] AudioContext created, sampleRate:', audioContext.sampleRate);
    }

    // Only create analyser and source once — reconnecting breaks it
    if (!analyser) {
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.3;
      console.log('[BeatSync] Analyser created, fftSize:', analyser.fftSize);
    }

    // MediaElementSource can only be created once per audio element
    if (!mediaSourceCreated) {
      try {
        const source = audioContext.createMediaElementSource(audioEl);
        source.connect(analyser);
        analyser.connect(audioContext.destination);
        mediaSourceCreated = true;
        console.log('[BeatSync] MediaElementSource connected');
      } catch (e) {
        console.warn('[BeatSync] MediaElementSource failed (may already exist):', e);
        // If it fails, the element might already be connected — try using existing analyser
        mediaSourceCreated = true;
      }
    }

    // Resume AudioContext (required after user gesture)
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
      console.log('[BeatSync] AudioContext resumed');
    }

    // Reset detection state
    energyHistory.length = 0;
    lastBeatTime = 0;
    lightIndex = 0;
    isActive = true;

    // Start detection loop
    animFrameId = requestAnimationFrame(detectBeat);
    console.log('[BeatSync] Started, zones:', config.zones, 'sensitivity:', config.sensitivity);
    return true;
  } catch (e) {
    console.error('[BeatSync] Failed to start:', e);
    return false;
  }
}

export function stopBeatSync(): void {
  isActive = false;
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  // Don't disconnect MediaElementSource -- it can only be created once
  // Just stop the detection loop
  energyHistory.length = 0;
  console.log('[BeatSync] Stopped');
}

export function isBeatSyncActive(): boolean {
  return isActive;
}

export function setBeatSyncConfig(cfg: Partial<BeatSyncConfig>): void {
  Object.assign(config, cfg);
}

export function setZoneLights(zoneId: string, lightIds: string[]): void {
  zoneLightsCache[zoneId] = lightIds;
}
