// Sound effects engine — pre-loads audio for instant playback
// Duck music via MusicKit when playing prominent effects

import { duck, unduck } from './music';

const SOUNDS: Record<string, string> = {
  // Scene effects
  'thx': '/sounds/thx.mp3',
  'cinematic-boom': '/sounds/cinematic-boom.mp3',
  // Game sounds
  'correct': '/sounds/correct.mp3',
  'wrong': '/sounds/wrong.mp3',
  'fanfare': '/sounds/fanfare.mp3',
  'timer-buzz': '/sounds/timer-buzz.mp3',
  'blind-change': '/sounds/blind-change.mp3',
  // DJ
  'dj-hype': '/sounds/dj-hype.mp3',
  'dj-announce': '/sounds/dj-announce.mp3',
};

const audioCache: Record<string, HTMLAudioElement> = {};

// Pre-load all sounds
export function preloadSounds() {
  for (const [name, path] of Object.entries(SOUNDS)) {
    const audio = new Audio(path);
    audio.preload = 'auto';
    audioCache[name] = audio;
  }
  console.log('[Sounds] Pre-loaded', Object.keys(SOUNDS).length, 'sound effects');
}

export function playSound(name: string, volume = 1): Promise<void> {
  return new Promise((resolve) => {
    const audio = audioCache[name];
    if (!audio) { console.warn('[Sounds] Unknown:', name); resolve(); return; }
    const clone = audio.cloneNode() as HTMLAudioElement;
    clone.volume = volume;
    clone.play().catch(() => {});
    clone.onended = () => resolve();
    setTimeout(resolve, 10000); // safety timeout
  });
}

export async function playSoundWithDuck(name: string, volume = 1) {
  duck(0.15, 300);
  await playSound(name, volume);
  unduck(500);
}
