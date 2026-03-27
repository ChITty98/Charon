// MusicKit JS wrapper for Charon
// Handles initialization, auth, playback, search, queue management, and volume ducking

declare global {
  interface Window {
    MusicKit: any;
  }
}

let musicInstance: any = null;
let initialized = false;
let preduckedVolume = 1;

// ─── Ban List ────────────────────────────────────────────────────────────────

export interface MusicBan {
  id: number;
  ban_type: 'song' | 'artist';
  value: string;
  added_by: string | null;
  created_at: string;
}

let banList: MusicBan[] = [];
let banListLoaded = false;

export async function refreshBanList(): Promise<MusicBan[]> {
  try {
    const res = await fetch('/api/music/bans');
    if (res.ok) {
      banList = await res.json();
      banListLoaded = true;
    }
  } catch (e) {
    console.error('[MusicBans] Failed to fetch ban list:', e);
  }
  return banList;
}

export function getBanList(): MusicBan[] {
  return banList;
}

export function isBanned(title: string, artist: string): { banned: boolean; reason?: string } {
  const titleLower = title.toLowerCase();
  const artistLower = artist.toLowerCase();
  for (const ban of banList) {
    const valueLower = ban.value.toLowerCase();
    if (ban.ban_type === 'song' && titleLower.includes(valueLower)) {
      return { banned: true, reason: `Song "${ban.value}" is banned` };
    }
    if (ban.ban_type === 'artist' && artistLower.includes(valueLower)) {
      return { banned: true, reason: `Artist "${ban.value}" is banned` };
    }
  }
  return { banned: false };
}

// ─── EventEmitter ───────────────────────────────────────────────────────────

type EventHandler = (...args: any[]) => void;
const eventHandlers: Record<string, EventHandler[]> = {};

export function on(event: string, handler: EventHandler) {
  if (!eventHandlers[event]) eventHandlers[event] = [];
  eventHandlers[event].push(handler);
}

export function off(event: string, handler: EventHandler) {
  if (!eventHandlers[event]) return;
  eventHandlers[event] = eventHandlers[event].filter(h => h !== handler);
}

function emit(event: string, ...args: any[]) {
  if (eventHandlers[event]) {
    eventHandlers[event].forEach(h => h(...args));
  }
}

// ─── Queue Types ────────────────────────────────────────────────────────────

export interface QueueSong {
  songId: string;
  title: string;
  artist: string;
  artworkUrl: string;
  addedBy?: number; // playerId
  addedByName?: string;
}

export interface QueueState {
  mainQueue: QueueSong[];
  overrideQueue: QueueSong[];
  queuePosition: number;
  overridePosition: number;
  isOverrideActive: boolean;
  shuffleToggle: boolean;
  repeatToggle: 'off' | 'one' | 'all';
  playbackState: 'playing' | 'paused' | 'stopped' | 'loading';
  nowPlaying: NowPlayingInfo | null;
}

export interface NowPlayingInfo {
  title: string;
  artist: string;
  album: string;
  albumId: string;
  artworkUrl: string;
  duration: number;
  currentTime: number;
  releaseYear: string;
  songId: string;
}

// ─── Queue State ────────────────────────────────────────────────────────────

let mainQueue: QueueSong[] = [];
let overrideQueue: QueueSong[] = [];
let overrideLoop = false;
let overridePosition = 0;
let queuePosition = -1;
let savedMainPosition = -1;
let isOverrideActive = false;
let shuffleToggle = false;
let repeatToggle: 'off' | 'one' | 'all' = 'off';

// ─── Init & Auth ────────────────────────────────────────────────────────────

export async function initMusicKit(): Promise<boolean> {
  if (initialized) return true;
  try {
    const res = await fetch('/api/musickit/token');
    const { token } = await res.json();
    if (!token) return false;

    // Wait for MusicKit to be available
    if (!window.MusicKit) {
      await new Promise<void>((resolve) => {
        document.addEventListener('musickitloaded', () => resolve(), { once: true });
        // Timeout after 5 seconds
        setTimeout(resolve, 5000);
      });
    }
    if (!window.MusicKit) return false;

    musicInstance = await window.MusicKit.configure({
      developerToken: token,
      app: { name: 'Fourth & Down', build: '1.0.0' },
    });
    initialized = true;
    console.log('[MusicKit] Initialized');

    // Load ban list on init
    if (!banListLoaded) refreshBanList();

    // Listen for song end to auto-advance queue
    musicInstance.addEventListener('playbackStateDidChange', handlePlaybackStateChange);
    musicInstance.addEventListener('nowPlayingItemDidChange', () => {
      emit('nowPlayingChange');
    });
    // Fallback: poll for song end
    let lastEndedSongId = '';
    let lastLoggedState = -1;
    let lastSongId = '';
    let stoppedSince = 0;
    setInterval(() => {
      if (!musicInstance) return;
      const state = musicInstance.playbackState;
      const states = window.MusicKit.PlaybackStates;
      const songId = musicInstance.nowPlayingItem?.id || '';
      const duration = musicInstance.nowPlayingItem?.attributes?.durationInMillis || 0;
      const current = (musicInstance.currentPlaybackTime || 0) * 1000;
      const isPlaying = state === states.playing;

      // Log state changes for debugging
      if (state !== lastLoggedState || songId !== lastSongId) {
        console.log('[MusicKit] State:', state, 'Song:', songId?.substring(0, 15), 'Time:', Math.round(current), '/', duration);
        lastLoggedState = state;
        lastSongId = songId;
      }

      // Track how long we've been stopped
      if (isPlaying) {
        stoppedSince = 0;
      } else if (stoppedSince === 0 && !isPlaying && songId) {
        stoppedSince = Date.now();
      }

      // Detect song end: not playing for 1.5+ seconds, song exists, not already handled
      if (!isPlaying && songId && songId !== lastEndedSongId && stoppedSince > 0 && Date.now() - stoppedSince > 1500) {
        // Confirm it's a real end (near end of song, or time reset, or completed state)
        const nearEnd = duration > 0 && (duration - current < 3000 || current < 500);
        const isStopped = state === states.completed || state === states.ended ||
                          state === states.stopped || state === states.none;
        if (nearEnd || isStopped) {
          console.log('[MusicKit] Song ended (poll):', songId, 'state:', state);
          lastEndedSongId = songId;
          stoppedSince = 0;
          handleSongEnded();
        }
      }
    }, 500);

    return true;
  } catch (e) {
    console.error('[MusicKit] Init failed:', e);
    return false;
  }
}

export function getInstance() { return musicInstance; }
export function isInitialized() { return initialized; }

export async function authorize(): Promise<boolean> {
  if (!musicInstance) return false;
  try {
    await musicInstance.authorize();
    console.log('[MusicKit] Authorized');
    return true;
  } catch (e) {
    console.error('[MusicKit] Auth failed:', e);
    return false;
  }
}

export function isAuthorized(): boolean {
  return musicInstance?.isAuthorized ?? false;
}

// ─── Playback Controls ─────────────────────────────────────────────────────

export async function play() { if (musicInstance) await musicInstance.play(); }
export async function pause() { if (musicInstance) await musicInstance.pause(); }
export async function stop() { if (musicInstance) await musicInstance.stop(); }

export async function skipToNext() {
  await playNextInQueue();
}

export async function skipToPrevious() {
  await playPreviousInQueue();
}

export function getNowPlaying(): NowPlayingInfo | null {
  if (!musicInstance?.nowPlayingItem) return null;
  const item = musicInstance.nowPlayingItem;
  const artwork = item.attributes?.artwork;
  const releaseDate = item.attributes?.releaseDate || '';
  const releaseYear = releaseDate ? releaseDate.substring(0, 4) : '';
  const albumId = item.relationships?.albums?.data?.[0]?.id || item.attributes?.playParams?.catalogId || '';
  return {
    title: item.attributes?.name || 'Unknown',
    artist: item.attributes?.artistName || 'Unknown',
    album: item.attributes?.albumName || '',
    albumId,
    artworkUrl: artwork ? window.MusicKit.formatArtworkURL(artwork, 200, 200) : '',
    duration: item.attributes?.durationInMillis || 0,
    currentTime: (musicInstance.currentPlaybackTime || 0) * 1000,
    releaseYear,
    songId: item.id || '',
  };
}

export function getPlaybackState(): 'playing' | 'paused' | 'stopped' | 'loading' {
  if (!musicInstance) return 'stopped';
  const states = window.MusicKit.PlaybackStates;
  const s = musicInstance.playbackState;
  if (s === states.playing) return 'playing';
  if (s === states.paused) return 'paused';
  if (s === states.loading || s === states.waiting || s === states.seeking) return 'loading';
  return 'stopped';
}

export async function searchCatalog(term: string): Promise<any[]> {
  if (!musicInstance) return [];
  try {
    const result = await musicInstance.api.music(`/v1/catalog/us/search`, { term, types: ['songs', 'albums', 'playlists'], limit: 20 });
    const songs = result?.data?.results?.songs?.data || [];
    return songs.map((s: any) => ({
      id: s.id,
      type: 'song',
      title: s.attributes?.name,
      artist: s.attributes?.artistName,
      album: s.attributes?.albumName,
      artworkUrl: s.attributes?.artwork ? window.MusicKit.formatArtworkURL(s.attributes.artwork, 100, 100) : '',
      durationMs: s.attributes?.durationInMillis,
    }));
  } catch (e) {
    console.error('[MusicKit] Search failed:', e);
    return [];
  }
}

export async function searchAlbums(term: string): Promise<any[]> {
  if (!musicInstance) return [];
  try {
    const result = await musicInstance.api.music(`/v1/catalog/us/search`, { term, types: ['albums'], limit: 10 });
    const albums = result?.data?.results?.albums?.data || [];
    return albums.map((a: any) => ({
      id: a.id,
      type: 'album',
      name: a.attributes?.name,
      artist: a.attributes?.artistName,
      artworkUrl: a.attributes?.artwork ? window.MusicKit.formatArtworkURL(a.attributes.artwork, 100, 100) : '',
      trackCount: a.attributes?.trackCount,
      releaseDate: a.attributes?.releaseDate,
    }));
  } catch (e) {
    console.error('[MusicKit] Album search failed:', e);
    return [];
  }
}

export async function getAlbumTracks(albumId: string): Promise<any[]> {
  if (!musicInstance) return [];
  try {
    const result = await musicInstance.api.music(`/v1/catalog/us/albums/${albumId}/tracks`);
    const tracks = result?.data?.data || [];
    return tracks.map((s: any) => ({
      id: s.id,
      type: 'song',
      title: s.attributes?.name,
      artist: s.attributes?.artistName,
      album: s.attributes?.albumName,
      artworkUrl: s.attributes?.artwork ? window.MusicKit.formatArtworkURL(s.attributes.artwork, 100, 100) : '',
      durationMs: s.attributes?.durationInMillis,
    }));
  } catch (e) {
    console.error('[MusicKit] Album tracks failed:', e);
    return [];
  }
}

export async function playSong(songId: string) {
  if (!musicInstance) return;
  try {
    await musicInstance.setQueue({ song: songId });
    await musicInstance.play();
  } catch (e) {
    console.error('[MusicKit] playSong error:', e);
  }
}

export async function playPlaylist(playlistId: string) {
  if (!musicInstance) return;
  await musicInstance.setQueue({ playlists: [playlistId] });
  await musicInstance.play();
}

export async function playAlbum(albumId: string) {
  if (!musicInstance) return;
  await musicInstance.setQueue({ albums: [albumId] });
  await musicInstance.play();
}

// ─── Queue Management ───────────────────────────────────────────────────────

export function addToQueue(song: QueueSong): boolean {
  const check = isBanned(song.title, song.artist);
  if (check.banned) {
    console.warn('[MusicBans] Blocked from queue:', check.reason);
    return false;
  }
  mainQueue.push(song);
  emit('queueChange');
  return true;
}

export function insertNext(song: QueueSong): boolean {
  const check = isBanned(song.title, song.artist);
  if (check.banned) {
    console.warn('[MusicBans] Blocked from queue:', check.reason);
    return false;
  }
  const insertAt = queuePosition + 1;
  mainQueue.splice(insertAt, 0, song);
  emit('queueChange');
  return true;
}

export function removeFromQueue(index: number) {
  if (index < 0 || index >= mainQueue.length) return;
  mainQueue.splice(index, 1);
  // Adjust position if needed
  if (index < queuePosition) {
    queuePosition--;
  } else if (index === queuePosition) {
    // Currently playing song removed, play next
    queuePosition--;
    playNextInQueue();
  }
  emit('queueChange');
}

export function reorderQueue(fromIndex: number, toIndex: number) {
  if (fromIndex < 0 || fromIndex >= mainQueue.length) return;
  if (toIndex < 0 || toIndex >= mainQueue.length) return;
  const [item] = mainQueue.splice(fromIndex, 1);
  mainQueue.splice(toIndex, 0, item);
  // Adjust current position
  if (fromIndex === queuePosition) {
    queuePosition = toIndex;
  } else if (fromIndex < queuePosition && toIndex >= queuePosition) {
    queuePosition--;
  } else if (fromIndex > queuePosition && toIndex <= queuePosition) {
    queuePosition++;
  }
  emit('queueChange');
}

export function clearQueue() {
  mainQueue = [];
  queuePosition = -1;
  emit('queueChange');
}

export function playPlayerPlaylist(songs: QueueSong[], shuffle = false) {
  let toAdd = [...songs];
  if (shuffle) {
    // Fisher-Yates shuffle
    for (let i = toAdd.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [toAdd[i], toAdd[j]] = [toAdd[j], toAdd[i]];
    }
  }
  // Append to existing queue instead of replacing
  mainQueue.push(...toAdd);
  emit('queueChange');
  // If nothing is playing, start the first added song
  if (queuePosition < 0 || queuePosition >= mainQueue.length - toAdd.length) {
    playNextInQueue();
  }
}

export function pushOverride(songs: QueueSong[], loop = false) {
  savedMainPosition = queuePosition;
  overrideQueue = [...songs];
  overrideLoop = loop;
  overridePosition = -1;
  isOverrideActive = true;
  emit('queueChange');
  playNextInQueue();
}

export function popOverride() {
  overrideQueue = [];
  overrideLoop = false;
  overridePosition = -1;
  isOverrideActive = false;
  queuePosition = savedMainPosition;
  savedMainPosition = -1;
  emit('queueChange');
  // Resume main queue
  playNextInQueue();
}

export function setShuffleToggle(value: boolean) {
  shuffleToggle = value;
  emit('queueChange');
}

export function setRepeatToggle(value: 'off' | 'one' | 'all') {
  repeatToggle = value;
  emit('queueChange');
}

export function getQueueState(): QueueState {
  return {
    mainQueue: [...mainQueue],
    overrideQueue: [...overrideQueue],
    queuePosition,
    overridePosition,
    isOverrideActive,
    shuffleToggle,
    repeatToggle,
    playbackState: getPlaybackState(),
    nowPlaying: getNowPlaying(),
  };
}

export function getQueueLength(): number {
  return mainQueue.length;
}

// ─── Internal Queue Playback ────────────────────────────────────────────────

let lastPlaybackState: number | null = null;

function handlePlaybackStateChange() {
  const states = window.MusicKit.PlaybackStates;
  const current = musicInstance.playbackState;

  emit('playbackChange', getPlaybackState());

  // Detect song ended — MusicKit may transition to completed, ended, stopped, or paused at end
  if (lastPlaybackState === states.playing && (
    current === states.completed ||
    current === states.ended ||
    current === states.stopped ||
    current === states.none
  )) {
    // Verify it's actually a song end, not a user stop
    const remaining = musicInstance.currentPlaybackTimeRemaining;
    if (remaining === undefined || remaining <= 1) {
      handleSongEnded();
    }
  }
  lastPlaybackState = current;
}

async function handleSongEnded() {
  if (repeatToggle === 'one') {
    // Replay current song
    const queue = isOverrideActive ? overrideQueue : mainQueue;
    const pos = isOverrideActive ? overridePosition : queuePosition;
    if (pos >= 0 && pos < queue.length) {
      await playSong(queue[pos].songId);
    }
    return;
  }
  await playNextInQueue();
}

async function playNextInQueue() {
  if (isOverrideActive) {
    overridePosition++;
    if (overridePosition >= overrideQueue.length) {
      // If main queue has songs waiting, stop override and play them
      if (mainQueue.length > 0 && savedMainPosition < mainQueue.length - 1) {
        popOverride();
        return;
      }
      if (overrideLoop) {
        overridePosition = 0;
      } else {
        // Override finished, return to main queue
        popOverride();
        return;
      }
    }
    if (overridePosition < overrideQueue.length) {
      const song = overrideQueue[overridePosition];
      emit('queueChange');
      await playSong(song.songId);
    }
    return;
  }

  // Main queue
  let nextPos = queuePosition + 1;

  if (shuffleToggle && mainQueue.length > 1) {
    // Pick a random song that isn't the current one
    let rand;
    do {
      rand = Math.floor(Math.random() * mainQueue.length);
    } while (rand === queuePosition && mainQueue.length > 1);
    nextPos = rand;
  }

  if (nextPos >= mainQueue.length) {
    if (repeatToggle === 'all') {
      nextPos = 0;
    } else {
      // Queue finished
      queuePosition = mainQueue.length;
      emit('queueChange');
      return;
    }
  }

  queuePosition = nextPos;
  if (queuePosition < mainQueue.length) {
    const song = mainQueue[queuePosition];
    emit('queueChange');
    await playSong(song.songId);
  }
}

async function playPreviousInQueue() {
  if (isOverrideActive) return; // No prev in override mode

  // If more than 3 seconds into the song, restart it
  if (musicInstance && musicInstance.currentPlaybackTime > 3) {
    await musicInstance.seekToTime(0);
    return;
  }

  if (queuePosition > 0) {
    queuePosition--;
    const song = mainQueue[queuePosition];
    emit('queueChange');
    await playSong(song.songId);
  }
}

export async function playQueueAtIndex(index: number) {
  if (index < 0 || index >= mainQueue.length) return;
  queuePosition = index;
  const song = mainQueue[queuePosition];
  emit('queueChange');
  await playSong(song.songId);
}

export async function playNow(song: QueueSong): Promise<boolean> {
  const check = isBanned(song.title, song.artist);
  if (check.banned) {
    console.warn('[MusicBans] Blocked from playing:', check.reason);
    return false;
  }
  // Insert at current position + 1 and play it
  const insertAt = queuePosition + 1;
  mainQueue.splice(insertAt, 0, song);
  queuePosition = insertAt;
  emit('queueChange');
  await playSong(song.songId);
  return true;
}

// ─── Volume Ducking ─────────────────────────────────────────────────────────

export function duck(targetVolume = 0.2, fadeMs = 300) {
  if (!musicInstance) return;
  preduckedVolume = musicInstance.volume;
  const steps = 10;
  const stepMs = fadeMs / steps;
  const delta = (preduckedVolume - targetVolume) / steps;
  let current = preduckedVolume;
  const interval = setInterval(() => {
    current -= delta;
    if (current <= targetVolume) {
      musicInstance.volume = targetVolume;
      clearInterval(interval);
    } else {
      musicInstance.volume = current;
    }
  }, stepMs);
}

export function unduck(fadeMs = 500) {
  if (!musicInstance) return;
  const target = preduckedVolume;
  const current = musicInstance.volume;
  const steps = 10;
  const stepMs = fadeMs / steps;
  const delta = (target - current) / steps;
  let vol = current;
  const interval = setInterval(() => {
    vol += delta;
    if (vol >= target) {
      musicInstance.volume = target;
      clearInterval(interval);
    } else {
      musicInstance.volume = vol;
    }
  }, stepMs);
}

// ─── Event Listener Helpers (backward compat) ──────────────────────────────

export function onPlaybackChange(callback: (state: string) => void): () => void {
  if (!musicInstance) return () => {};
  const handler = () => callback(getPlaybackState());
  musicInstance.addEventListener('playbackStateDidChange', handler);
  return () => musicInstance.removeEventListener('playbackStateDidChange', handler);
}

export function onNowPlayingChange(callback: () => void): () => void {
  if (!musicInstance) return () => {};
  musicInstance.addEventListener('nowPlayingItemDidChange', callback);
  return () => musicInstance.removeEventListener('nowPlayingItemDidChange', callback);
}

export function getVolume(): number {
  return musicInstance?.volume ?? 1;
}

export function setVolume(vol: number) {
  if (musicInstance) musicInstance.volume = Math.max(0, Math.min(1, vol));
}
