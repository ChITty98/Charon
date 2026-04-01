// Beat/light sync using Web Audio API
// Four modes: Beat Pulse, BPM Sync, Wave, Cinematic
// One in-flight Hue request at a time — no pile-up
// All modes go silent (no dot, no Hue calls) when energy is near-zero

import { api } from './api';

// ─── Types ──────────────────────────────────────────────────────────────────

export type BeatSyncMode = 'pulse' | 'bpm' | 'wave' | 'cinematic';

export interface BeatSyncConfig {
  mode: BeatSyncMode;
  sensitivity: number;
  zones: string[];
  pulseIntensity: number;
  baseBrightness: number;
  waveSpeed: number;
  waveBaseLevel: number;
  responsiveness: number;
}

type BeatCallback = (energy: number) => void;

// ─── State ──────────────────────────────────────────────────────────────────

let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
let currentAudioEl: HTMLAudioElement | null = null;
let isActive = false;
let activeMode: BeatSyncMode = 'pulse';
let config: BeatSyncConfig = {
  mode: 'pulse', sensitivity: 50, zones: [], pulseIntensity: 85,
  baseBrightness: 70, waveSpeed: 60, waveBaseLevel: 40, responsiveness: 50,
};
let animFrameId: number | null = null;
let watchdogId: ReturnType<typeof setInterval> | null = null;

// Silence detection — skip everything when no audio
const SILENCE_THRESHOLD = 3; // energy below this = silence
let silenceFrames = 0;
const SILENCE_GRACE = 30; // ~0.5s of silence before going quiet

// Hue request gate
let hueInFlight = false;

// Pulse state
const energyHistory: number[] = [];
const HISTORY_SIZE = 43;
const MIN_BEAT_INTERVAL = 200;
let lastBeatTime = 0;
let pulseIsDown = false;

// BPM state
let detectedBPM = 0;
let bpmLocked = false;
let bpmIntervalId: ReturnType<typeof setInterval> | null = null;
let lastBpmPulse = 0;
const autocorrBuffer: { energy: number; time: number }[] = [];
let bpmCalcCount = 0;
let bpmCandidates: number[] = [];

// Wave state
let waveLightIndex = 0;
let lastWaveStep = 0;
let wavePrevLight: string | null = null;

// Cinematic state
let cinematicEnergy = 0;
let lastCinematicUpdate = 0;
let lastCinematicBrightness = -1;
let energyMin = Infinity;
let energyMax = 0;

// Zone lights cache
const zoneLightsCache: Record<string, string[]> = {};
const beatCallbacks: BeatCallback[] = [];

// ─── Events ─────────────────────────────────────────────────────────────────

export function onBeatEvent(cb: BeatCallback) { beatCallbacks.push(cb); }
export function offBeatEvent(cb: BeatCallback) {
  const idx = beatCallbacks.indexOf(cb);
  if (idx >= 0) beatCallbacks.splice(idx, 1);
}
function emitBeat(energy: number) {
  for (const cb of beatCallbacks) { try { cb(energy); } catch (_) { /* */ } }
}

export function getDetectedBPM(): number { return detectedBPM; }
export function isBPMLocked(): boolean { return bpmLocked; }

// ─── Audio ──────────────────────────────────────────────────────────────────

function findAudioElement(): HTMLAudioElement | null {
  try {
    const mk = (window as any).MusicKit?.getInstance?.();
    if (mk) {
      const el = mk?._player?._mediaElement || mk?._player?.audio || mk?._audioElement;
      if (el instanceof HTMLAudioElement) return el;
    }
  } catch (_) { /* */ }
  return document.querySelector<HTMLAudioElement>('audio[src*="aod"]')
    || document.querySelector<HTMLAudioElement>('audio[src*="apple"]')
    || document.querySelector<HTMLAudioElement>('audio');
}

function connectAudio(): boolean {
  const audioEl = findAudioElement();
  if (!audioEl) return false;
  if (audioEl === currentAudioEl && sourceNode && analyser) return true;
  try {
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new AudioContext(); analyser = null; sourceNode = null;
    }
    if (!analyser) {
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.3;
    }
    if (audioEl !== currentAudioEl) {
      try {
        if (sourceNode) try { sourceNode.disconnect(); } catch (_) { /* */ }
        sourceNode = audioContext.createMediaElementSource(audioEl);
        sourceNode.connect(analyser);
        analyser.connect(audioContext.destination);
        currentAudioEl = audioEl;
      } catch (e: any) {
        if (e.name === 'InvalidStateError') currentAudioEl = audioEl;
        else throw e;
      }
    }
    if (audioContext.state === 'suspended') audioContext.resume();
    return true;
  } catch (e) { console.error('[BeatSync] Connection failed:', e); return false; }
}

function getEnergy(): number {
  if (!analyser || !audioContext) return 0;
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(dataArray);
  const bassEnd = Math.max(1, Math.floor(200 / (audioContext.sampleRate / analyser.fftSize)));
  let energy = 0;
  for (let i = 0; i < bassEnd; i++) energy += dataArray[i] * dataArray[i];
  return Math.sqrt(energy / bassEnd);
}

// ─── Hue ────────────────────────────────────────────────────────────────────

// Bridge health tracking
const hueResponseTimes: number[] = [];
const hueCallTimestamps: number[] = []; // track calls per second
let bridgeOverloaded = false;
type BridgeHealthCallback = (avgMs: number, overloaded: boolean, callsPerSec: number) => void;
const bridgeHealthCallbacks: BridgeHealthCallback[] = [];

export function onBridgeHealth(cb: BridgeHealthCallback) { bridgeHealthCallbacks.push(cb); }
export function offBridgeHealth(cb: BridgeHealthCallback) {
  const idx = bridgeHealthCallbacks.indexOf(cb);
  if (idx >= 0) bridgeHealthCallbacks.splice(idx, 1);
}

let hueInFlightTimeout: ReturnType<typeof setTimeout> | null = null;

function hueCall(endpoint: string, body: Record<string, unknown>): Promise<void> {
  if (hueInFlight || !isActive) return Promise.resolve();
  hueInFlight = true;
  if (hueInFlightTimeout) clearTimeout(hueInFlightTimeout);
  hueInFlightTimeout = setTimeout(() => { hueInFlight = false; }, 2000);
  const start = Date.now();
  // Track call rate
  hueCallTimestamps.push(start);
  // Prune timestamps older than 2 seconds
  while (hueCallTimestamps.length > 0 && start - hueCallTimestamps[0] > 2000) hueCallTimestamps.shift();
  const callsPerSec = Math.round(hueCallTimestamps.length / 2);

  return api.put(endpoint, body).catch(() => {}).finally(() => {
    hueInFlight = false;
    if (hueInFlightTimeout) { clearTimeout(hueInFlightTimeout); hueInFlightTimeout = null; }
    const elapsed = Date.now() - start;
    hueResponseTimes.push(elapsed);
    if (hueResponseTimes.length > 20) hueResponseTimes.shift();
    const avg = Math.round(hueResponseTimes.reduce((s, t) => s + t, 0) / hueResponseTimes.length);
    bridgeOverloaded = callsPerSec > 10 || avg > 500;
    for (const cb of bridgeHealthCallbacks) { try { cb(avg, bridgeOverloaded, callsPerSec); } catch (_) { /* */ } }
  });
}

function getAllLights(): string[] {
  const all: string[] = [];
  for (const zoneId of config.zones) {
    const lights = zoneLightsCache[zoneId];
    if (lights) all.push(...lights);
  }
  return all;
}

// ─── Pending restore timeouts ───────────────────────────────────────────────

const pendingRestores: ReturnType<typeof setTimeout>[] = [];

function clearPendingRestores() {
  for (const t of pendingRestores) clearTimeout(t);
  pendingRestores.length = 0;
}

// ─── Silence Check ──────────────────────────────────────────────────────────

function isSilent(energy: number): boolean {
  if (energy < SILENCE_THRESHOLD) {
    silenceFrames++;
    if (silenceFrames === SILENCE_GRACE + 1) {
      // Just went silent — cancel all pending restore calls and reset bridge state
      clearPendingRestores();
      hueInFlight = false;
      pulseIsDown = false;
    }
    return silenceFrames > SILENCE_GRACE;
  }
  silenceFrames = 0;
  return false;
}

// ─── Mode: Pulse ────────────────────────────────────────────────────────────

function detectPulse() {
  if (!isActive || activeMode !== 'pulse') return;

  const energy = getEnergy();
  if (isSilent(energy)) { animFrameId = requestAnimationFrame(detectPulse); return; }

  energyHistory.push(energy);
  if (energyHistory.length > HISTORY_SIZE) energyHistory.shift();

  const avgEnergy = energyHistory.reduce((s, e) => s + e, 0) / energyHistory.length;
  const threshold = 1.0 + (100 - config.sensitivity) / 100;
  const now = performance.now();

  if (
    energy > avgEnergy * threshold &&
    now - lastBeatTime > MIN_BEAT_INTERVAL &&
    energyHistory.length >= HISTORY_SIZE / 2 &&
    !pulseIsDown
  ) {
    lastBeatTime = now;
    emitBeat(energy);
    pulseIsDown = true;

    const pulseBri = Math.max(0, config.baseBrightness - config.pulseIntensity);
    for (const zoneId of config.zones) hueCall(`/hue/groups/${zoneId}`, { brightness: pulseBri });
    const restoreId = setTimeout(() => {
      for (const zoneId of config.zones) hueCall(`/hue/groups/${zoneId}`, { brightness: config.baseBrightness });
      pulseIsDown = false;
    }, 100);
    pendingRestores.push(restoreId);
    // Safety: force unlock after 300ms
    const safetyId = setTimeout(() => { pulseIsDown = false; }, 300);
    pendingRestores.push(safetyId);
  }

  animFrameId = requestAnimationFrame(detectPulse);
}

// ─── Mode: BPM ──────────────────────────────────────────────────────────────

function detectBPM() {
  if (!isActive || activeMode !== 'bpm') return;

  const energy = getEnergy();
  const now = performance.now();

  if (isSilent(energy)) { animFrameId = requestAnimationFrame(detectBPM); return; }

  // Store energy with real timestamp (not frame count)
  autocorrBuffer.push({ energy, time: now });
  // Keep ~10 seconds of data
  while (autocorrBuffer.length > 0 && now - autocorrBuffer[0].time > 10000) autocorrBuffer.shift();

  // Recalculate BPM every ~2 seconds if not locked
  bpmCalcCount++;
  if (!bpmLocked && bpmCalcCount >= 120 && autocorrBuffer.length >= 200) {
    bpmCalcCount = 0;
    const bpm = calculateBPMFromTimestamps();
    if (bpm > 0) {
      bpmCandidates.push(bpm);
      if (bpmCandidates.length > 5) bpmCandidates.shift();

      if (bpmCandidates.length >= 3) {
        const sorted = [...bpmCandidates].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        const consistent = bpmCandidates.filter(b => Math.abs(b - median) <= 5);
        if (consistent.length >= 3) {
          detectedBPM = Math.round(consistent.reduce((s, b) => s + b, 0) / consistent.length);
          bpmLocked = true;
          console.log(`[BeatSync] BPM locked at ${detectedBPM}`);
        } else {
          detectedBPM = Math.round(median);
        }
      } else {
        detectedBPM = bpm;
      }
    }
  }

  animFrameId = requestAnimationFrame(detectBPM);
}

function calculateBPMFromTimestamps(): number {
  const buf = autocorrBuffer;
  if (buf.length < 100) return 0;

  // Resample to uniform intervals (~16ms = 60fps equivalent)
  const startTime = buf[0].time;
  const endTime = buf[buf.length - 1].time;
  const duration = endTime - startTime;
  if (duration < 3000) return 0; // need at least 3 seconds

  const sampleRate = 60; // resample to 60 samples/sec
  const numSamples = Math.floor(duration / 1000 * sampleRate);
  const resampled: number[] = [];

  let bufIdx = 0;
  for (let i = 0; i < numSamples; i++) {
    const t = startTime + (i / sampleRate) * 1000;
    while (bufIdx < buf.length - 1 && buf[bufIdx + 1].time <= t) bufIdx++;
    resampled.push(buf[bufIdx].energy);
  }

  // Subtract mean
  const mean = resampled.reduce((s, v) => s + v, 0) / resampled.length;
  const normalized = resampled.map(v => v - mean);

  // Autocorrelation for lags: 40-180 BPM at 60 samples/sec
  // 40 BPM = 1.5s = 90 samples, 180 BPM = 0.333s = 20 samples
  const minLag = 20;
  const maxLag = Math.min(90, Math.floor(normalized.length / 2));
  let bestLag = 0;
  let bestCorr = -Infinity;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < normalized.length - lag; i++) {
      corr += normalized[i] * normalized[i + lag];
    }
    corr /= (normalized.length - lag);
    if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
  }

  if (bestLag === 0 || bestCorr <= 0) return 0;

  // Also check top 3 candidates to avoid false peaks
  const candidates: { lag: number; corr: number; bpm: number }[] = [];
  const tempCorrs: { lag: number; corr: number }[] = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < normalized.length - lag; i++) corr += normalized[i] * normalized[i + lag];
    corr /= (normalized.length - lag);
    tempCorrs.push({ lag, corr });
  }
  tempCorrs.sort((a, b) => b.corr - a.corr);
  for (const tc of tempCorrs.slice(0, 5)) {
    let b = Math.round((sampleRate * 60) / tc.lag);
    while (b > 160) b = Math.round(b / 2);
    while (b < 50 && b > 0) b *= 2;
    candidates.push({ lag: tc.lag, corr: tc.corr, bpm: b });
  }
  console.log('[BeatSync] BPM candidates:', candidates.map(c => `${c.bpm}bpm(lag=${c.lag},corr=${c.corr.toFixed(1)})`).join(', '));

  // Convert: BPM = 60 / (lag / sampleRate)
  let bpm = Math.round((sampleRate * 60) / bestLag);

  // Prefer 60-160 range
  while (bpm > 160) bpm = Math.round(bpm / 2);
  while (bpm < 50 && bpm > 0) bpm *= 2;

  return bpm;
}

// Phase tracking — find when beats actually land in the audio
let bpmPhaseAnchor = 0; // timestamp of a confirmed beat peak
let bpmPhaseSet = false;

function startBPMPulser() {
  bpmIntervalId = setInterval(() => {
    if (!isActive || activeMode !== 'bpm' || detectedBPM < 40) return;
    const currentEnergy = getEnergy();
    if (currentEnergy < SILENCE_THRESHOLD) return;

    const intervalMs = 60000 / detectedBPM;
    const now = performance.now();

    if (!bpmPhaseSet) {
      // Wait for a strong energy peak to anchor the phase
      const avgEnergy = energyHistory.length > 0
        ? energyHistory.reduce((s, e) => s + e, 0) / energyHistory.length : 0;
      if (currentEnergy > avgEnergy * 1.3 && now - lastBpmPulse > intervalMs * 0.5) {
        bpmPhaseAnchor = now;
        bpmPhaseSet = true;
        lastBpmPulse = now;
        fireBpmPulse(intervalMs);
      }
      return;
    }

    // Fire on the grid: anchor + N * interval
    const elapsed = now - bpmPhaseAnchor;
    const beatsSinceAnchor = Math.floor(elapsed / intervalMs);
    const nextBeatTime = bpmPhaseAnchor + (beatsSinceAnchor + 1) * intervalMs;
    const timeToBeat = nextBeatTime - now;

    // Fire when we're within 30ms of a beat grid point
    if (timeToBeat < 30 && now - lastBpmPulse > intervalMs * 0.7) {
      lastBpmPulse = now;

      // Re-anchor phase periodically using actual energy peaks
      const avgEnergy = energyHistory.length > 0
        ? energyHistory.reduce((s, e) => s + e, 0) / energyHistory.length : 0;
      if (currentEnergy > avgEnergy * 1.3) {
        // Nudge anchor toward the actual peak (weighted average)
        bpmPhaseAnchor = bpmPhaseAnchor * 0.8 + (now - beatsSinceAnchor * intervalMs) * 0.2;
      }

      fireBpmPulse(intervalMs);
    }
  }, 15); // Check every 15ms for tighter timing
}

function fireBpmPulse(intervalMs: number) {
  emitBeat(detectedBPM);
  const pulseBri = Math.max(0, config.baseBrightness - config.pulseIntensity);
  for (const zoneId of config.zones) hueCall(`/hue/groups/${zoneId}`, { brightness: pulseBri });
  const restoreId = setTimeout(() => {
    for (const zoneId of config.zones) hueCall(`/hue/groups/${zoneId}`, { brightness: config.baseBrightness });
  }, Math.min(100, intervalMs * 0.25));
  pendingRestores.push(restoreId);
}

// ─── Mode: Wave ─────────────────────────────────────────────────────────────

function detectWave() {
  if (!isActive || activeMode !== 'wave') return;

  const energy = getEnergy();
  if (isSilent(energy)) { animFrameId = requestAnimationFrame(detectWave); return; }

  const now = performance.now();
  const allLights = getAllLights();
  const stepInterval = Math.max(150, 600 - config.waveSpeed * 4.5);

  if (now - lastWaveStep > stepInterval && allLights.length > 0 && !hueInFlight) {
    lastWaveStep = now;

    const normalized = Math.min(1, energy / 150);
    const crestBri = Math.max(10, Math.round(normalized * config.baseBrightness));
    const baseBri = Math.max(0, Math.round(config.baseBrightness * (config.waveBaseLevel / 100)));

    const currentIdx = waveLightIndex % allLights.length;
    const currentLight = allLights[currentIdx];

    emitBeat(energy);

    if (wavePrevLight && wavePrevLight !== currentLight) {
      hueCall(`/hue/lights/${wavePrevLight}`, { brightness: baseBri }).then(() => {
        hueCall(`/hue/lights/${currentLight}`, { brightness: crestBri });
      });
    } else {
      hueCall(`/hue/lights/${currentLight}`, { brightness: crestBri });
    }

    wavePrevLight = currentLight;
    waveLightIndex++;
  }

  animFrameId = requestAnimationFrame(detectWave);
}

// ─── Mode: Cinematic ────────────────────────────────────────────────────────
// Uses 4 individual lights (not group) — each can be at different brightness

let cinematicLights: string[] = []; // max 4 lights picked from zone
let cinematicLightIdx = 0;

function detectCinematic() {
  if (!isActive || activeMode !== 'cinematic') return;

  const energy = getEnergy();
  if (isSilent(energy)) { animFrameId = requestAnimationFrame(detectCinematic); return; }

  if (energy > 1) {
    energyMax = Math.max(energyMax, energy);
    energyMin = Math.min(energyMin, energy);
    energyMax *= 0.9995;
    energyMin = energyMin * 0.9995 + energy * 0.0005;
  }

  const alpha = 0.02 + (config.responsiveness / 100) * 0.13;
  cinematicEnergy = cinematicEnergy * (1 - alpha) + energy * alpha;

  const range = Math.max(10, energyMax - energyMin);
  const normalized = Math.min(1, Math.max(0, (cinematicEnergy - energyMin) / range));
  const targetBri = Math.max(5, Math.round(5 + normalized * (config.baseBrightness - 5)));

  const now = performance.now();
  const briChanged = Math.abs(targetBri - lastCinematicBrightness) >= 2;
  if (briChanged && !hueInFlight && now - lastCinematicUpdate > 500) {
    lastCinematicUpdate = now;
    emitBeat(energy);
    lastCinematicBrightness = targetBri;

    const xy: [number, number] = [
      0.675 - normalized * 0.075,
      0.322 + normalized * 0.028,
    ];

    // Pick 4 lights from zone, cycle through them one call at a time
    if (cinematicLights.length === 0) {
      cinematicLights = getAllLights().slice(0, 4);
    }
    if (cinematicLights.length > 0) {
      const lightId = cinematicLights[cinematicLightIdx % cinematicLights.length];
      cinematicLightIdx++;
      hueCall(`/hue/lights/${lightId}`, { brightness: targetBri, xy });
    }
  }

  animFrameId = requestAnimationFrame(detectCinematic);
}

// ─── Watchdog ───────────────────────────────────────────────────────────────

function startWatchdog() {
  if (watchdogId) return;
  watchdogId = setInterval(() => {
    if (!isActive) return;
    // Only reconnect if we've had sustained zero energy AND music should be playing
    const newEl = findAudioElement();
    if (newEl && newEl !== currentAudioEl) {
      if (sourceNode) try { sourceNode.disconnect(); } catch (_) { /* */ }
      sourceNode = null; analyser = null;
      if (audioContext) try { audioContext.close(); } catch (_) { /* */ }
      audioContext = null; currentAudioEl = null;
      connectAudio();
    }
  }, 5000);
}

function stopWatchdog() {
  if (watchdogId) { clearInterval(watchdogId); watchdogId = null; }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function startBeatSync(cfg: BeatSyncConfig): Promise<boolean> {
  if (isActive) stopBeatSync();
  config = { ...cfg };
  activeMode = cfg.mode;
  if (!connectAudio()) return false;

  energyHistory.length = 0;
  autocorrBuffer.length = 0;
  lastBeatTime = 0;
  silenceFrames = 0;
  hueInFlight = false;
  pulseIsDown = false;
  detectedBPM = 0;
  bpmLocked = false;
  bpmCandidates = [];
  bpmCalcCount = 0;
  lastBpmPulse = 0;
  bpmPhaseAnchor = 0;
  bpmPhaseSet = false;
  waveLightIndex = 0;
  lastWaveStep = 0;
  wavePrevLight = null;
  cinematicEnergy = 0;
  lastCinematicBrightness = -1;
  lastCinematicUpdate = 0;
  cinematicLights = [];
  cinematicLightIdx = 0;
  energyMin = Infinity;
  energyMax = 0;
  hueResponseTimes.length = 0;
  bridgeOverloaded = false;
  isActive = true;

  switch (activeMode) {
    case 'pulse': animFrameId = requestAnimationFrame(detectPulse); break;
    case 'bpm': animFrameId = requestAnimationFrame(detectBPM); startBPMPulser(); break;
    case 'wave': animFrameId = requestAnimationFrame(detectWave); break;
    case 'cinematic': animFrameId = requestAnimationFrame(detectCinematic); break;
  }

  startWatchdog();
  console.log(`[BeatSync] Started in ${activeMode} mode`);
  return true;
}

export function stopBeatSync(): void {
  isActive = false;
  clearPendingRestores();
  if (animFrameId !== null) { cancelAnimationFrame(animFrameId); animFrameId = null; }
  if (bpmIntervalId !== null) { clearInterval(bpmIntervalId); bpmIntervalId = null; }
  stopWatchdog();
  energyHistory.length = 0;
  autocorrBuffer.length = 0;
  hueInFlight = false;
  pulseIsDown = false;
  cinematicLights = [];
  cinematicLightIdx = 0;
  hueResponseTimes.length = 0;
  bridgeOverloaded = false;
  console.log('[BeatSync] Stopped');
}

export function isBeatSyncActive(): boolean { return isActive; }
export function getActiveMode(): BeatSyncMode | null { return isActive ? activeMode : null; }
export function setBeatSyncConfig(cfg: Partial<BeatSyncConfig>): void { Object.assign(config, cfg); }
export function setZoneLights(zoneId: string, lightIds: string[]): void { zoneLightsCache[zoneId] = lightIds; }
