import { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { api } from '../lib/api';
import { MusicSearch } from '../components/MusicSearch';
import {
  initMusicKit,
  isAuthorized,
  authorize,
  play,
  pause,
  getNowPlaying,
  getPlaybackState,
  getQueueState,
  getQueueLength,
  addToQueue,
  removeFromQueue,
  reorderQueue,
  clearQueue,
  playQueueAtIndex,
  playNow,
  playPlayerPlaylist,
  setShuffleToggle,
  setRepeatToggle,
  skipToNext,
  skipToPrevious,
  searchCatalog,
  getVolume,
  setVolume,
  on,
  off,
  type QueueSong,
  type QueueState,
  getInstance,
  getAlbumTracks,
} from '../lib/music';
import {
  startBeatSync,
  stopBeatSync,
  isBeatSyncActive,
  setBeatSyncConfig,
  setZoneLights,
  onBeatEvent,
  offBeatEvent,
  onBridgeHealth,
  offBridgeHealth,
  getDetectedBPM,
  type BeatSyncMode,
} from '../lib/beatSync';

/* ---- Icons ---- */

const playIcon = (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const pauseIcon = (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
  </svg>
);

const skipNextIcon = (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
  </svg>
);

const skipPrevIcon = (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
  </svg>
);

const shuffleIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 3 21 3 21 8" />
    <line x1="4" y1="20" x2="21" y2="3" />
    <polyline points="21 16 21 21 16 21" />
    <line x1="15" y1="15" x2="21" y2="21" />
    <line x1="4" y1="4" x2="9" y2="9" />
  </svg>
);

const repeatIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="17 1 21 5 17 9" />
    <path d="M3 11V9a4 4 0 014-4h14" />
    <polyline points="7 23 3 19 7 15" />
    <path d="M21 13v2a4 4 0 01-4 4H3" />
  </svg>
);

const searchIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
);

const musicNoteIcon = (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

const musicNoteSmall = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

const xIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

const volumeIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.54 8.46a5 5 0 010 7.07" />
  </svg>
);

const addToQueueIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const dragIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" opacity="0.4">
    <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
    <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
    <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
  </svg>
);

/* ---- Helpers ---- */

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

type Tab = 'playing' | 'queue' | 'search' | 'categories' | 'playlists';

interface MusicCategory {
  id: number;
  name: string;
  icon: string;
  song_count?: number;
}

interface CategorySong {
  id: number;
  song_id: string;
  title: string;
  artist: string;
  artwork_url: string;
}

interface PlayerWithPlaylist {
  id: number;
  name: string;
  color: string;
  playlist_count: number;
}

interface PlaylistSong {
  id: number;
  song_id: string;
  title: string;
  artist: string;
  artwork_url: string;
}

interface SearchResult {
  id: string;
  title: string;
  artist: string;
  album: string;
  artworkUrl: string;
  durationMs: number;
}

/* ---- Component ---- */

export function Music() {
  const [activeTab, setActiveTab] = useState<Tab>('playing');
  const [ready, setReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [queueState, setQueueState] = useState<QueueState | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check admin status from localStorage (shared with Players page PIN)
  useEffect(() => {
    const adminUnlocked = localStorage.getItem('charon_admin') === 'true';
    setIsAdmin(adminUnlocked);
    const handler = () => setIsAdmin(localStorage.getItem('charon_admin') === 'true');
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  // Initialize
  useEffect(() => {
    initMusicKit().then((ok) => {
      setReady(ok);
      if (ok) setAuthorized(isAuthorized());
    });
  }, []);

  // Subscribe to queue and playback changes
  useEffect(() => {
    if (!ready) return;
    const updateState = () => setQueueState(getQueueState());
    updateState();
    on('queueChange', updateState);
    on('playbackChange', updateState);
    on('nowPlayingChange', updateState);
    return () => {
      off('queueChange', updateState);
      off('playbackChange', updateState);
      off('nowPlayingChange', updateState);
    };
  }, [ready]);

  // Poll progress while playing
  useEffect(() => {
    const state = queueState?.playbackState;
    if (state === 'playing') {
      pollRef.current = setInterval(() => {
        setQueueState(getQueueState());
      }, 1000);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [queueState?.playbackState]);

  const handleAuth = async () => {
    const ok = await authorize();
    setAuthorized(ok);
  };

  if (!ready || !authorized) {
    return (
      <div className="p-5 pb-8">
        <h1 className="text-[28px] font-black text-text-primary mb-4">Music</h1>
        <Card>
          <div className="flex flex-col items-center gap-4 py-8">
            <span className="text-accent-pink">{musicNoteIcon}</span>
            <p className="text-text-secondary text-[16px]">
              {!ready ? 'Loading Apple Music...' : 'Sign in to Apple Music to use the music player'}
            </p>
            {ready && !authorized && (
              <Button variant="primary" onClick={handleAuth}>
                Sign In to Apple Music
              </Button>
            )}
          </div>
        </Card>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'playing', label: 'Now Playing' },
    { id: 'queue', label: 'Queue' },
    { id: 'search', label: 'Search' },
    { id: 'categories', label: 'Categories' },
    { id: 'playlists', label: 'Playlists' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="shrink-0 flex border-b border-surface-700 bg-surface-800 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              'flex-1 min-w-0 py-3 px-2 text-[14px] font-semibold text-center whitespace-nowrap transition-colors relative',
              activeTab === tab.id
                ? 'text-accent-blue'
                : 'text-text-muted hover:text-text-secondary',
            ].join(' ')}
          >
            {tab.label}
            {tab.id === 'queue' && queueState && queueState.mainQueue.length > 0 && (
              <span className="ml-1 text-[12px] bg-accent-blue/20 text-accent-blue px-1.5 py-0.5 rounded-full">
                {queueState.mainQueue.length}
              </span>
            )}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-[3px] bg-accent-blue rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab === 'playing' && <NowPlayingTab queueState={queueState} isAdmin={isAdmin} />}
        {activeTab === 'queue' && <QueueTab queueState={queueState} />}
        {activeTab === 'search' && <SearchTab />}
        {activeTab === 'categories' && <CategoriesTab isAdmin={isAdmin} />}
        {activeTab === 'playlists' && <PlaylistsTab />}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   NOW PLAYING TAB
   ────────────────────────────────────────────────────────────────────────── */

function NowPlayingTab({ queueState, isAdmin }: { queueState: QueueState | null; isAdmin: boolean }) {
  const np = queueState?.nowPlaying;
  const state = queueState?.playbackState || 'stopped';
  const [vol, setVol] = useState(getVolume());
  const [categories, setCategories] = useState<MusicCategory[]>([]);
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [addedToCat, setAddedToCat] = useState<string | null>(null);
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  const [addedToPlaylist, setAddedToPlaylist] = useState<string | null>(null);
  const [npPlayers, setNpPlayers] = useState<Array<{ id: number; name: string; color: string }>>([]);

  useEffect(() => {
    api.get<any[]>('/players').then(setNpPlayers).catch(() => {});
  }, []);
  const [showAlbumView, setShowAlbumView] = useState<string | null>(null);
  const [albumViewTracks, setAlbumViewTracks] = useState<any[]>([]);
  const [albumViewLoading, setAlbumViewLoading] = useState(false);

  useEffect(() => {
    if (!showAlbumView) return;
    setAlbumViewLoading(true);
    getAlbumTracks(showAlbumView).then(tracks => {
      setAlbumViewTracks(tracks);
      setAlbumViewLoading(false);
    });
  }, [showAlbumView]);
  const [ratings, setRatings] = useState<Array<{ player_id: number; name: string; color: string; rating: number }>>([]);
  const [sessionPlayers, setSessionPlayers] = useState<Array<{ id: number; name: string; color: string }>>([]);
  const [lastRatedSongId, setLastRatedSongId] = useState<string | null>(null);

  useEffect(() => {
    if (isAdmin) {
      api.get<MusicCategory[]>('/music/categories').then(setCategories).catch(() => {});
    }
  }, [isAdmin]);

  // Load session players for ratings
  useEffect(() => {
    api.get<any[]>('/sessions/current/players').then(sp => {
      setSessionPlayers(sp.filter((p: any) => !p.left_at).map((p: any) => ({ id: p.player_id ?? p.id, name: p.name, color: p.color })));
    }).catch(() => {});
  }, []);

  // Load ratings when song changes
  useEffect(() => {
    const songId = np?.songId;
    if (songId && songId !== lastRatedSongId) {
      setLastRatedSongId(songId);
      api.get<any[]>(`/music/ratings/${songId}`).then(setRatings).catch(() => setRatings([]));
    }
  }, [np?.songId]);

  const rateSong = async (playerId: number, rating: number) => {
    if (!np?.songId) return;
    try {
      const updated = await api.post<any[]>('/music/ratings', { songId: np.songId, playerId, rating, title: np.title, artist: np.artist });
      setRatings(updated);
    } catch { /* */ }
  };

  const addNowPlayingToCategory = async (catId: number, catName: string) => {
    if (!np) return;
    const instance = getInstance();
    const songId = instance?.nowPlayingItem?.id;
    if (!songId) return;
    try {
      await api.post(`/music/categories/${catId}/songs`, {
        songId,
        title: np.title,
        artist: np.artist,
        artworkUrl: np.artworkUrl,
      });
      setAddedToCat(catName);
      setShowCatPicker(false);
      setTimeout(() => setAddedToCat(null), 2000);
    } catch { /* */ }
  };

  const progress = np && np.duration > 0 ? (np.currentTime / np.duration) * 100 : 0;

  const handlePlayPause = async () => {
    if (state === 'playing') await pause();
    else await play();
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVol(v);
    setVolume(v);
  };

  // ─── Album Art → Hue Lights ───
  const [hueZones, setHueZones] = useState<Array<{ zone: string; groupId: string; name: string; lights: string[] }>>([]);
  const [showRoomPicker, setShowRoomPicker] = useState(false);
  const [hueConfirmation, setHueConfirmation] = useState('');
  const [autoHue, setAutoHue] = useState(false);
  const [hueBrightness, setHueBrightness] = useState(70);
  const lastAutoHueArt = useRef('');
  const [beatSyncMode, setBeatSyncMode] = useState<BeatSyncMode | null>(null);
  const [beatSensitivity, setBeatSensitivity] = useState(70);
  const [beatPulseIntensity, setBeatPulseIntensity] = useState(30);
  const [beatWaveSpeed, setBeatWaveSpeed] = useState(60);
  const [waveBaseLevel, setWaveBaseLevel] = useState(40);
  const [beatResponsiveness, setBeatResponsiveness] = useState(50);
  const [beatFlash, setBeatFlash] = useState(false);
  const [bridgeAvgMs, setBridgeAvgMs] = useState(0);
  const [bridgeWarning, setBridgeWarning] = useState(false);
  const [bridgeCallsPerSec, setBridgeCallsPerSec] = useState(0);

  useEffect(() => {
    api.get<Array<{ zone: string; groupId: string; name: string; lights: string[] }>>('/hue/zones')
      .then(setHueZones).catch(() => {});
  }, []);

  // Auto-update lights when song changes
  useEffect(() => {
    if (!autoHue || !np?.artworkUrl || np.artworkUrl === lastAutoHueArt.current || hueZones.length === 0) return;
    lastAutoHueArt.current = np.artworkUrl;
    applyAlbumColors('all');
  }, [autoHue, np?.artworkUrl]);

  async function extractDominantColors(imageUrl: string): Promise<Array<[number, number]>> {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 50;
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        // Bucket colors
        const buckets: Record<string, { r: number; g: number; b: number; count: number }> = {};
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i+1], b = data[i+2];
          // Skip near-black and near-white
          if (r + g + b < 60 || r + g + b > 700) continue;
          const key = `${Math.floor(r/32)}-${Math.floor(g/32)}-${Math.floor(b/32)}`;
          if (!buckets[key]) buckets[key] = { r: 0, g: 0, b: 0, count: 0 };
          buckets[key].r += r; buckets[key].g += g; buckets[key].b += b; buckets[key].count++;
        }
        const sorted = Object.values(buckets).sort((a, b) => b.count - a.count).slice(0, 8);
        const colors = sorted.map(b => {
          const r = b.r / b.count, g = b.g / b.count, bl = b.b / b.count;
          // RGB to CIE xy
          let R = r / 255, G = g / 255, B = bl / 255;
          R = R > 0.04045 ? Math.pow((R + 0.055) / 1.055, 2.4) : R / 12.92;
          G = G > 0.04045 ? Math.pow((G + 0.055) / 1.055, 2.4) : G / 12.92;
          B = B > 0.04045 ? Math.pow((B + 0.055) / 1.055, 2.4) : B / 12.92;
          const X = R * 0.664511 + G * 0.154324 + B * 0.162028;
          const Y = R * 0.283881 + G * 0.668433 + B * 0.047685;
          const Z = R * 0.000088 + G * 0.072310 + B * 0.986039;
          const sum = X + Y + Z;
          return sum === 0 ? [0.3127, 0.3290] as [number, number] : [X / sum, Y / sum] as [number, number];
        });
        resolve(colors.length > 0 ? colors : [[0.3127, 0.3290]]);
      };
      img.onerror = () => resolve([[0.3127, 0.3290]]);
      img.src = imageUrl.replace(/\d+x\d+/, '100x100');
    });
  }

  async function applyAlbumColors(target: string) {
    if (!np?.artworkUrl) return;
    const colors = await extractDominantColors(np.artworkUrl);

    // Collect all lights from target zones
    const targetZones = target === 'all' ? hueZones : hueZones.filter(z => z.groupId === target);
    const allLights: string[] = [];
    for (const zone of targetZones) {
      allLights.push(...zone.lights);
    }

    if (allLights.length === 0) return;

    // Shuffle light order for variety on resample
    const shuffledLights = [...allLights];
    for (let i = shuffledLights.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledLights[i], shuffledLights[j]] = [shuffledLights[j], shuffledLights[i]];
    }

    // Spread colors across individual lights
    for (let i = 0; i < shuffledLights.length; i++) {
      const colorIdx = i % colors.length;
      api.put(`/hue/lights/${shuffledLights[i]}`, { on: true, brightness: hueBrightness, xy: colors[colorIdx] }).catch(() => {});
      // Small delay to avoid overwhelming the Hue bridge (rate limited)
      if (i < shuffledLights.length - 1) {
        await new Promise(r => setTimeout(r, 50));
      }
    }
    setHueConfirmation('Colors set!');
    setShowRoomPicker(false);
    setTimeout(() => setHueConfirmation(''), 2000);
  }

  async function adjustHueBrightness(delta: number) {
    const newBri = Math.max(10, Math.min(100, hueBrightness + delta));
    setHueBrightness(newBri);
    // Apply to all mapped lights
    const allLights: string[] = [];
    for (const zone of hueZones) allLights.push(...zone.lights);
    for (let i = 0; i < allLights.length; i++) {
      api.put(`/hue/lights/${allLights[i]}`, { brightness: newBri }).catch(() => {});
      if (i < allLights.length - 1) await new Promise(r => setTimeout(r, 30));
    }
  }

  // ─── Beat Sync ───
  // Cache zone lights whenever hueZones changes
  useEffect(() => {
    for (const zone of hueZones) {
      setZoneLights(zone.groupId, zone.lights);
    }
  }, [hueZones]);

  // Subscribe to beat events for the visual indicator
  useEffect(() => {
    const onBeat = () => {
      setBeatFlash(true);
      setTimeout(() => setBeatFlash(false), 120);
    };
    onBeatEvent(onBeat);
    const onHealth = (avgMs: number, overloaded: boolean, _callsPerSec?: number) => {
      setBridgeAvgMs(avgMs);
      setBridgeWarning(overloaded);
      if (_callsPerSec !== undefined) setBridgeCallsPerSec(_callsPerSec);
    };
    onBridgeHealth(onHealth);
    return () => { offBeatEvent(onBeat); offBridgeHealth(onHealth); };
  }, []);

  // Update beat sync config live when sliders change
  useEffect(() => {
    if (beatSyncMode) {
      setBeatSyncConfig({ sensitivity: beatSensitivity, pulseIntensity: beatPulseIntensity, baseBrightness: hueBrightness, waveSpeed: beatWaveSpeed, waveBaseLevel, responsiveness: beatResponsiveness });
    }
  }, [beatSensitivity, beatPulseIntensity, hueBrightness, beatSyncMode, beatWaveSpeed, waveBaseLevel, beatResponsiveness]);

  function activateMode(mode: BeatSyncMode) {
    if (beatSyncMode === mode) {
      stopBeatSync();
      setBeatSyncMode(null);
      return;
    }
    stopBeatSync();
    const allGroupIds = hueZones.map(z => z.groupId);
    const ok = startBeatSync({
      mode,
      sensitivity: beatSensitivity,
      zones: allGroupIds,
      pulseIntensity: beatPulseIntensity,
      baseBrightness: hueBrightness,
      waveSpeed: beatWaveSpeed,
      waveBaseLevel,
      responsiveness: beatResponsiveness,
    });
    setBeatSyncMode(ok ? mode : null);
  }

  if (!np) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <span className="text-text-muted opacity-30 mb-4">{musicNoteIcon}</span>
        <p className="text-text-secondary text-[18px] font-semibold mb-2">Nothing Playing</p>
        <p className="text-text-muted text-[14px]">Search for music or pick a category to get started</p>
      </div>
    );
  }

  return (
    <div className="flex gap-6 p-4 w-full max-w-[1200px] mx-auto overflow-hidden">
      {/* Left side: Album art */}
      <div className="shrink-0 w-[min(40vw,400px)]">
        {np.artworkUrl ? (
          <img
            src={np.artworkUrl.replace(/200x200/, '600x600')}
            alt={np.album}
            className="w-full aspect-square rounded-2xl object-cover shadow-2xl"
          />
        ) : (
          <div className="w-full aspect-square rounded-2xl bg-surface-700 flex items-center justify-center text-text-muted">
            {musicNoteIcon}
          </div>
        )}

        {/* Room Colors — under album art */}
        {hueZones.length > 0 && (
          <div className="mt-3 w-full">
            {hueConfirmation && (
              <p className="text-green-400 text-[14px] text-center mb-2 font-semibold">{hueConfirmation}</p>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowRoomPicker(!showRoomPicker)}
                className="flex-1 h-[44px] rounded-xl bg-surface-700 text-text-secondary text-[14px] font-semibold hover:bg-surface-600 transition-colors flex items-center justify-center gap-2"
              >
                💡 Set Room Colors
              </button>
              <button
                onClick={() => applyAlbumColors('all')}
                className="h-[44px] px-3 rounded-xl text-[13px] font-semibold bg-surface-700 text-text-muted hover:bg-surface-600 transition-colors"
                title="Resample colors and shuffle light assignments"
              >
                🔄
              </button>
              <button
                onClick={() => setAutoHue(!autoHue)}
                className={`h-[44px] px-3 rounded-xl text-[13px] font-semibold transition-colors ${autoHue ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/40' : 'bg-surface-700 text-text-muted hover:bg-surface-600'}`}
                title="Auto-update lights when song changes"
              >
                Auto
              </button>
            </div>
            {showRoomPicker && (
              <div className="mt-2 bg-surface-700 rounded-xl p-2 space-y-1">
                <button
                  onClick={() => applyAlbumColors('all')}
                  className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-surface-600 transition-colors text-left"
                >
                  <span className="text-[16px]">🏠</span>
                  <span className="text-text-primary text-[14px] font-medium">All Game Night Zones</span>
                </button>
                {hueZones.map(zone => (
                  <button
                    key={zone.groupId}
                    onClick={() => applyAlbumColors(zone.groupId)}
                    className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-surface-600 transition-colors text-left"
                  >
                    <span className="text-[16px]">💡</span>
                    <span className="text-text-primary text-[14px] font-medium">{zone.name}</span>
                    <span className="text-text-muted text-[12px] ml-auto">{zone.lights.length} lights</span>
                  </button>
                ))}
              </div>
            )}
            {/* Brightness +/- */}
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={() => adjustHueBrightness(-10)}
                className="w-[44px] h-[44px] rounded-xl bg-surface-700 text-text-primary text-[20px] font-bold hover:bg-surface-600 transition-colors active:scale-95 flex items-center justify-center"
              >
                −
              </button>
              <div className="flex-1 text-center">
                <span className="text-text-muted text-[12px]">Brightness</span>
                <span className="text-text-primary text-[16px] font-bold ml-2">{hueBrightness}%</span>
              </div>
              <button
                onClick={() => adjustHueBrightness(10)}
                className="w-[44px] h-[44px] rounded-xl bg-surface-700 text-text-primary text-[20px] font-bold hover:bg-surface-600 transition-colors active:scale-95 flex items-center justify-center"
              >
                +
              </button>
            </div>
            {/* Light Sync Modes */}
            <div className="mt-2">
              <div className="flex items-center gap-2">
                {(['pulse', 'bpm', 'wave', 'cinematic'] as BeatSyncMode[]).map(mode => (
                  <button
                    key={mode}
                    onClick={() => activateMode(mode)}
                    className={`flex-1 h-[40px] rounded-xl text-[13px] font-semibold transition-colors ${
                      beatSyncMode === mode
                        ? mode === 'cinematic' ? 'bg-red-900/40 text-red-400 border border-red-500/40'
                        : 'bg-accent-blue/20 text-accent-blue border border-accent-blue/40'
                        : 'bg-surface-700 text-text-muted hover:bg-surface-600'
                    }`}
                  >
                    {mode === 'pulse' ? 'Pulse' : mode === 'bpm' ? 'BPM' : mode === 'wave' ? 'Wave' : 'Cinematic'}
                  </button>
                ))}
                <div
                  className="w-[12px] h-[12px] rounded-full transition-transform duration-75 flex-shrink-0"
                  style={{
                    backgroundColor: beatSyncMode ? (beatSyncMode === 'cinematic' ? '#ef4444' : '#f472b6') : '#374151',
                    opacity: beatSyncMode ? (beatFlash ? 1 : 0.4) : 0.3,
                    transform: beatFlash ? 'scale(1.6)' : 'scale(1)',
                  }}
                />
              </div>
              {beatSyncMode && bridgeWarning && (
                <div className="mt-1 px-3 py-1 bg-red-900/40 border border-red-500/40 rounded-lg text-red-400 text-[12px] text-center">
                  Bridge overloaded — {bridgeCallsPerSec} calls/sec, {bridgeAvgMs}ms avg
                </div>
              )}
              {beatSyncMode && !bridgeWarning && bridgeAvgMs > 0 && (
                <div className="mt-1 text-text-muted text-[11px] text-center">
                  Bridge: {bridgeCallsPerSec}/sec, {bridgeAvgMs}ms avg
                </div>
              )}
            </div>
            {(beatSyncMode === 'pulse' || beatSyncMode === 'bpm') && (
              <div className="mt-2 space-y-2 bg-surface-700 rounded-xl p-3">
                {beatSyncMode === 'bpm' && (
                  <div className="text-center mb-2">
                    <span className="text-text-muted text-[12px]">Detected BPM: </span>
                    <span className="text-accent-blue text-[16px] font-bold">{getDetectedBPM() || '...'}</span>
                  </div>
                )}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-text-muted text-[12px]">Sensitivity</span>
                    <span className="text-text-primary text-[12px] font-bold">{beatSensitivity}%</span>
                  </div>
                  <input type="range" min={30} max={100} value={beatSensitivity}
                    onChange={e => setBeatSensitivity(Number(e.target.value))}
                    className="w-full h-1.5 rounded-full appearance-none bg-surface-600 accent-accent-blue" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-text-muted text-[12px]">Pulse Intensity</span>
                    <span className="text-text-primary text-[12px] font-bold">{beatPulseIntensity}%</span>
                  </div>
                  <input type="range" min={20} max={100} value={beatPulseIntensity}
                    onChange={e => setBeatPulseIntensity(Number(e.target.value))}
                    className="w-full h-1.5 rounded-full appearance-none bg-surface-600 accent-accent-blue" />
                </div>
              </div>
            )}
            {beatSyncMode === 'wave' && (
              <div className="mt-2 space-y-2 bg-surface-700 rounded-xl p-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-text-muted text-[12px]">Wave Speed</span>
                    <span className="text-text-primary text-[12px] font-bold">{beatWaveSpeed}%</span>
                  </div>
                  <input type="range" min={30} max={100} value={beatWaveSpeed}
                    onChange={e => setBeatWaveSpeed(Number(e.target.value))}
                    className="w-full h-1.5 rounded-full appearance-none bg-surface-600 accent-accent-blue" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-text-muted text-[12px]">Intensity</span>
                    <span className="text-text-primary text-[12px] font-bold">{beatPulseIntensity}%</span>
                  </div>
                  <input type="range" min={20} max={100} value={beatPulseIntensity}
                    onChange={e => setBeatPulseIntensity(Number(e.target.value))}
                    className="w-full h-1.5 rounded-full appearance-none bg-surface-600 accent-accent-blue" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-text-muted text-[12px]">Base Light Level</span>
                    <span className="text-text-primary text-[12px] font-bold">{waveBaseLevel}%</span>
                  </div>
                  <input type="range" min={0} max={70} value={waveBaseLevel}
                    onChange={e => setWaveBaseLevel(Number(e.target.value))}
                    className="w-full h-1.5 rounded-full appearance-none bg-surface-600 accent-accent-blue" />
                </div>
              </div>
            )}
            {beatSyncMode === 'cinematic' && (
              <div className="mt-2 space-y-2 bg-surface-700 rounded-xl p-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-text-muted text-[12px]">Responsiveness</span>
                    <span className="text-text-primary text-[12px] font-bold">{beatResponsiveness}%</span>
                  </div>
                  <input type="range" min={30} max={100} value={beatResponsiveness}
                    onChange={e => setBeatResponsiveness(Number(e.target.value))}
                    className="w-full h-1.5 rounded-full appearance-none bg-surface-600 accent-red-500" />
                </div>
                <p className="text-text-muted text-[11px]">Room breathes with the music. Deep red swells to hot red on crescendos.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right side: Controls */}
      <div className="flex-1 flex flex-col justify-center gap-4 min-w-0">
        {/* Song info */}
        <div>
          <p className="text-text-primary text-[28px] font-bold truncate">{np.title}</p>
          <p className="text-text-secondary text-[18px] truncate mt-1">{np.artist}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {np.album && (
              <button
                onClick={() => np.albumId && setShowAlbumView(np.albumId)}
                className={`text-[14px] truncate transition-colors ${np.albumId ? 'text-accent-blue hover:text-accent-blue/80 underline underline-offset-2 cursor-pointer' : 'text-text-muted cursor-default'}`}
              >
                {np.album}
              </button>
            )}
            {np.releaseYear && <span className="text-text-muted text-[13px]">({np.releaseYear})</span>}
          </div>
        </div>

        {/* Progress bar (seekable) */}
        <div className="w-full">
          <div
            className="w-full h-[10px] bg-surface-600 rounded-full overflow-hidden cursor-pointer relative group"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              const seekTime = pct * (np.duration / 1000);
              const instance = getInstance();
              if (instance) instance.seekToTime(seekTime);
            }}
          >
            <div
              className="h-full bg-accent-pink rounded-full transition-[width] duration-1000 ease-linear pointer-events-none"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-text-muted text-[12px]">{formatTime(np.currentTime)}</span>
            <span className="text-text-muted text-[12px]">{formatTime(np.duration)}</span>
          </div>
        </div>

        {/* Transport controls */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              const next: Record<string, string> = { off: 'all', all: 'one', one: 'off' };
              setRepeatToggle(next[queueState?.repeatToggle || 'off'] as any);
            }}
            className={[
              'w-[44px] h-[44px] rounded-full flex items-center justify-center transition-colors relative',
              queueState?.repeatToggle !== 'off' ? 'text-accent-blue' : 'text-text-muted hover:text-text-secondary',
            ].join(' ')}
          >
            {repeatIcon}
            {queueState?.repeatToggle === 'one' && (
              <span className="absolute -top-0.5 -right-0.5 text-[10px] font-bold text-accent-blue bg-surface-800 rounded-full w-4 h-4 flex items-center justify-center">1</span>
            )}
          </button>

          <button
            onClick={() => skipToPrevious()}
            className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-text-primary hover:bg-surface-700 transition-colors active:scale-90"
          >
            {skipPrevIcon}
          </button>

          <button
            onClick={handlePlayPause}
            className="w-[64px] h-[64px] rounded-full bg-accent-pink flex items-center justify-center text-white hover:brightness-110 transition-all active:scale-90 shadow-lg"
          >
            {state === 'playing' ? pauseIcon : playIcon}
          </button>

          <button
            onClick={() => skipToNext()}
            className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-text-primary hover:bg-surface-700 transition-colors active:scale-90"
          >
            {skipNextIcon}
          </button>

          <button
            onClick={() => setShuffleToggle(!queueState?.shuffleToggle)}
            className={[
              'w-[44px] h-[44px] rounded-full flex items-center justify-center transition-colors',
              queueState?.shuffleToggle ? 'text-accent-blue' : 'text-text-muted hover:text-text-secondary',
            ].join(' ')}
          >
            {shuffleIcon}
          </button>
        </div>

        {/* Volume */}
        <div className="flex items-center gap-3">
          <span className="text-text-muted">{volumeIcon}</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={vol}
            onChange={handleVolumeChange}
            className="flex-1 h-[6px] appearance-none bg-surface-600 rounded-full accent-accent-pink"
          />
        </div>

        {/* Per-user song ratings */}
        {sessionPlayers.length > 0 && (
          <div>
            <div className="flex items-center gap-3 mb-2">
              <p className="text-text-muted text-[12px] font-semibold uppercase tracking-wider">Rate this song</p>
              {(() => {
                const rated = ratings.filter(r => r.rating > 0);
                if (rated.length === 0) return null;
                const avg = (rated.reduce((s, r) => s + r.rating, 0) / rated.length).toFixed(1);
                return (
                  <span className="text-yellow-400 text-[14px] font-bold">
                    ★ {avg} <span className="text-text-muted text-[12px] font-normal">({rated.length} rating{rated.length !== 1 ? 's' : ''})</span>
                  </span>
                );
              })()}
            </div>
            <div className="flex flex-wrap gap-3">
              {sessionPlayers.map(player => {
                const playerRating = ratings.find(r => r.player_id === player.id);
                const currentRating = playerRating?.rating || 0;
                return (
                  <div key={player.id} className="flex items-center gap-2">
                    <div
                      className="w-[28px] h-[28px] rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0"
                      style={{ backgroundColor: player.color }}
                    >
                      {player.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-text-secondary text-[13px] truncate">{player.name}</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(star => (
                        <button
                          key={star}
                          onClick={() => rateSong(player.id, star)}
                          className={`text-[28px] w-[36px] h-[36px] flex items-center justify-center transition-colors ${star <= currentRating ? 'text-yellow-400' : 'text-surface-600 hover:text-yellow-400/50'}`}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Admin: Add to Category */}
      {isAdmin && np && (
        <div className="w-full">
          {addedToCat && (
            <p className="text-green-400 text-[14px] text-center mb-2 font-semibold">Added to {addedToCat}!</p>
          )}
          {showCatPicker ? (
            <div className="bg-surface-700 rounded-xl p-3 space-y-2">
              <p className="text-text-secondary text-[13px] font-semibold mb-1">Add to category:</p>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => addNowPlayingToCategory(cat.id, cat.name)}
                  className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-surface-600 transition-colors text-left"
                >
                  <span className="text-[18px]">{cat.icon}</span>
                  <span className="text-text-primary text-[14px] font-medium">{cat.name}</span>
                </button>
              ))}
              <button
                onClick={() => setShowCatPicker(false)}
                className="w-full text-text-muted text-[13px] py-1 hover:text-text-secondary"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowCatPicker(true)}
              className="w-full h-[40px] rounded-xl bg-surface-700 text-text-secondary text-[14px] font-semibold hover:bg-surface-600 transition-colors flex items-center justify-center gap-2"
            >
              <span className="text-[16px]">+</span> Add to Category
            </button>
          )}
        </div>
      )}

        {/* Add to Player Playlist */}
        {np && (
          <div className="w-full">
            {addedToPlaylist && (
              <p className="text-green-400 text-[14px] text-center mb-2 font-semibold">Added to {addedToPlaylist}'s playlist!</p>
            )}
            {showPlaylistPicker ? (
              <div className="bg-surface-700 rounded-xl p-3 space-y-2">
                <p className="text-text-secondary text-[13px] font-semibold mb-1">Add to playlist:</p>
                {npPlayers.map(p => (
                  <button
                    key={p.id}
                    onClick={async () => {
                      try {
                        await api.post(`/music/player/${p.id}/playlist`, {
                          songId: np.songId,
                          title: np.title,
                          artist: np.artist,
                          artworkUrl: np.artworkUrl,
                        });
                        setAddedToPlaylist(p.name);
                        setShowPlaylistPicker(false);
                        setTimeout(() => setAddedToPlaylist(null), 2000);
                      } catch { /* */ }
                    }}
                    className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-surface-600 transition-colors text-left"
                  >
                    <div className="w-[28px] h-[28px] rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0" style={{ backgroundColor: p.color }}>
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-text-primary text-[14px] font-medium">{p.name}</span>
                  </button>
                ))}
                <button onClick={() => setShowPlaylistPicker(false)} className="w-full text-text-muted text-[13px] py-1 hover:text-text-secondary">Cancel</button>
              </div>
            ) : (
              <button
                onClick={() => setShowPlaylistPicker(true)}
                className="w-full h-[40px] rounded-xl bg-surface-700 text-text-secondary text-[14px] font-semibold hover:bg-surface-600 transition-colors flex items-center justify-center gap-2"
              >
                <span className="text-[16px]">+</span> Add to Playlist
              </button>
            )}
          </div>
        )}

        {/* Override indicator */}
        {queueState?.isOverrideActive && (
          <div className="bg-accent-amber/20 border border-accent-amber/40 rounded-xl px-4 py-2 text-accent-amber text-[14px] font-semibold">
            Override Queue Active (Game/Scene Music)
          </div>
        )}
      </div>

      {/* Album view modal */}
      <Modal open={!!showAlbumView} onClose={() => setShowAlbumView(null)} title={np?.album || 'Album'} size="lg">
        {albumViewLoading ? (
          <p className="text-text-muted text-center py-8">Loading tracks...</p>
        ) : (
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            <button
              onClick={() => {
                albumViewTracks.forEach(t => addToQueue({ songId: t.id, title: t.title, artist: t.artist, artworkUrl: t.artworkUrl || '' }));
              }}
              className="w-full h-[44px] rounded-xl bg-accent-blue/20 text-accent-blue text-[14px] font-semibold hover:bg-accent-blue/30 transition-colors flex items-center justify-center gap-2 mb-3"
            >
              + Add All to Queue
            </button>
            {albumViewTracks.map((track, i) => (
              <div key={track.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-600 transition-colors">
                <span className="text-text-muted text-[13px] w-[24px] text-right shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-[14px] truncate ${track.id === np?.songId ? 'text-accent-pink font-bold' : 'text-text-primary'}`}>{track.title}</p>
                  <p className="text-text-secondary text-[12px] truncate">{track.artist}</p>
                </div>
                <span className="text-text-muted text-[12px] shrink-0">{track.durationMs ? `${Math.floor(track.durationMs / 60000)}:${String(Math.floor((track.durationMs % 60000) / 1000)).padStart(2, '0')}` : ''}</span>
                <button
                  onClick={() => addToQueue({ songId: track.id, title: track.title, artist: track.artist, artworkUrl: track.artworkUrl || '' })}
                  className="w-[36px] h-[36px] rounded-full bg-surface-600 text-text-secondary hover:bg-accent-blue hover:text-white flex items-center justify-center transition-all shrink-0"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   QUEUE TAB
   ────────────────────────────────────────────────────────────────────────── */

function QueueTab({ queueState }: { queueState: QueueState | null }) {
  const queue = queueState?.mainQueue || [];
  const pos = queueState?.queuePosition ?? -1;
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  const upcoming = queue.slice(pos + 1);
  const played = queue.slice(0, pos + 1);

  const handleDragStart = (index: number) => setDragFrom(index);
  const handleDrop = (toIndex: number) => {
    if (dragFrom !== null && dragFrom !== toIndex) {
      reorderQueue(dragFrom, toIndex);
    }
    setDragFrom(null);
  };

  return (
    <div className="p-4 space-y-4">
      {/* Controls row */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShuffleToggle(!queueState?.shuffleToggle)}
          className={[
            'flex items-center gap-1.5 px-3 py-2 rounded-lg text-[14px] font-semibold transition-colors',
            queueState?.shuffleToggle
              ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/40'
              : 'bg-surface-700 text-text-muted hover:bg-surface-600',
          ].join(' ')}
        >
          {shuffleIcon}
          Shuffle
        </button>

        <button
          onClick={() => {
            const next: Record<string, string> = { off: 'all', all: 'one', one: 'off' };
            setRepeatToggle(next[queueState?.repeatToggle || 'off'] as any);
          }}
          className={[
            'flex items-center gap-1.5 px-3 py-2 rounded-lg text-[14px] font-semibold transition-colors',
            queueState?.repeatToggle !== 'off'
              ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/40'
              : 'bg-surface-700 text-text-muted hover:bg-surface-600',
          ].join(' ')}
        >
          {repeatIcon}
          {queueState?.repeatToggle === 'one' ? 'Repeat 1' : queueState?.repeatToggle === 'all' ? 'Repeat All' : 'Repeat'}
        </button>

        <div className="flex-1" />

        {queue.length > 0 && (
          <button
            onClick={clearQueue}
            className="px-3 py-2 rounded-lg text-[14px] font-semibold bg-surface-700 text-accent-red hover:bg-surface-600 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Queue list */}
      {queue.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-text-muted text-[16px]">Queue is empty</p>
          <p className="text-text-muted text-[14px] mt-1">Search for music to add songs</p>
        </div>
      ) : (
        <div className="space-y-1">
          {/* Override queue — shown on top when active */}
          {queueState?.isOverrideActive && queueState.overrideQueue.length > 0 && (() => {
            const oPos = queueState.overridePosition ?? 0;
            const overridePlayed = queueState.overrideQueue.slice(0, oPos);
            const overrideCurrent = queueState.overrideQueue[oPos];
            const overrideUpcoming = queueState.overrideQueue.slice(oPos + 1);
            return (
              <div className="mb-4 bg-accent-amber/5 border border-accent-amber/20 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-accent-amber text-[13px] font-bold uppercase tracking-wider">Override Queue (Scene/Game)</p>
                  <span className="text-accent-amber/70 text-[12px]">{oPos + 1} / {queueState.overrideQueue.length}</span>
                </div>

                {/* Played override songs */}
                {overridePlayed.length > 0 && (
                  <div className="mb-2 opacity-40">
                    {overridePlayed.map((song, i) => (
                      <div key={`op-${i}`} className="flex items-center gap-3 p-1.5 rounded-lg">
                        {song.artworkUrl ? (
                          <img src={song.artworkUrl} alt="" className="w-[32px] h-[32px] rounded object-cover shrink-0" />
                        ) : (
                          <div className="w-[32px] h-[32px] rounded bg-surface-600 shrink-0" />
                        )}
                        <p className="text-text-muted text-[13px] truncate line-through">{song.title}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Currently playing override */}
                {overrideCurrent && (
                  <div className="flex items-center gap-3 p-2 rounded-lg bg-accent-amber/15 border border-accent-amber/30 mb-1">
                    {overrideCurrent.artworkUrl ? (
                      <img src={overrideCurrent.artworkUrl} alt="" className="w-[44px] h-[44px] rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-[44px] h-[44px] rounded-lg bg-surface-600 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-text-primary text-[14px] font-bold truncate">{overrideCurrent.title}</p>
                      <p className="text-text-secondary text-[12px] truncate">{overrideCurrent.artist}</p>
                    </div>
                    <span className="text-accent-amber text-[12px] font-bold shrink-0 animate-pulse">Now Playing</span>
                  </div>
                )}

                {/* Upcoming override songs */}
                {overrideUpcoming.length > 0 && (
                  <div className="mt-1">
                    {overrideUpcoming.map((song, i) => (
                      <div key={`ou-${i}`} className="flex items-center gap-3 p-1.5 rounded-lg">
                        {song.artworkUrl ? (
                          <img src={song.artworkUrl} alt="" className="w-[32px] h-[32px] rounded object-cover shrink-0" />
                        ) : (
                          <div className="w-[32px] h-[32px] rounded bg-surface-600 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-text-primary text-[13px] truncate">{song.title}</p>
                          <p className="text-text-secondary text-[11px] truncate">{song.artist}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-accent-amber/50 text-[11px] mt-2 text-center">
                  Resumes regular queue after {overrideUpcoming.length + (overrideCurrent ? 1 : 0)} more song{overrideUpcoming.length > 0 ? 's' : ''}
                </p>
              </div>
            );
          })()}

          {/* Main queue — now playing or on hold */}
          <p className="text-text-muted text-[12px] font-semibold uppercase tracking-wider mb-2">
            {queueState?.isOverrideActive ? 'Regular Queue (On Hold)' : 'Now Playing'}
          </p>
          {pos >= 0 && pos < queue.length && (
            <div className={`mb-3 ${queueState?.isOverrideActive ? 'opacity-60' : ''}`}>
              <QueueItem song={queue[pos]} index={pos} isCurrent={!queueState?.isOverrideActive} onRemove={() => removeFromQueue(pos)} />
            </div>
          )}

          {/* Up next */}
          {upcoming.length > 0 && (
            <>
              <p className="text-text-muted text-[12px] font-semibold uppercase tracking-wider mb-2">
                Up Next ({upcoming.length})
              </p>
              {upcoming.map((song, i) => {
                const realIndex = pos + 1 + i;
                return (
                  <QueueItem
                    key={`${song.songId}-${realIndex}`}
                    song={song}
                    index={realIndex}
                    onRemove={() => removeFromQueue(realIndex)}
                    onPlay={() => playQueueAtIndex(realIndex)}
                    draggable
                    onDragStart={() => handleDragStart(realIndex)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(realIndex)}
                  />
                );
              })}
            </>
          )}

          {/* Previously played */}
          {played.length > 1 && (
            <>
              <p className="text-text-muted text-[12px] font-semibold uppercase tracking-wider mt-4 mb-2">
                Previously Played ({played.length - 1})
              </p>
              {played.slice(0, -1).map((song, i) => (
                <QueueItem
                  key={`played-${song.songId}-${i}`}
                  song={song}
                  index={i}
                  isPlayed
                  onPlay={() => playQueueAtIndex(i)}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function QueueItem({
  song,
  index,
  isCurrent,
  isPlayed,
  onRemove,
  onPlay,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  song: QueueSong;
  index: number;
  isCurrent?: boolean;
  isPlayed?: boolean;
  onRemove?: () => void;
  onPlay?: () => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
}) {
  return (
    <div
      className={[
        'flex items-center gap-3 p-2.5 rounded-xl transition-colors',
        isCurrent ? 'bg-accent-blue/10 border border-accent-blue/30' : '',
        isPlayed ? 'opacity-50' : '',
        onPlay ? 'cursor-pointer hover:bg-surface-700' : '',
      ].join(' ')}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onPlay}
    >
      {draggable && (
        <span className="cursor-grab active:cursor-grabbing shrink-0">
          {dragIcon}
        </span>
      )}

      {song.artworkUrl ? (
        <img src={song.artworkUrl} alt="" className="w-[48px] h-[48px] rounded-lg object-cover shrink-0" />
      ) : (
        <div className="w-[48px] h-[48px] rounded-lg bg-surface-600 flex items-center justify-center text-text-muted shrink-0">
          {musicNoteSmall}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-text-primary text-[15px] font-semibold truncate">{song.title}</p>
        <p className="text-text-secondary text-[13px] truncate">
          {song.artist}
          {song.addedByName && (
            <span className="text-text-muted"> &middot; Added by {song.addedByName}</span>
          )}
        </p>
      </div>

      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="w-[36px] h-[36px] rounded-full flex items-center justify-center text-text-muted hover:text-accent-red hover:bg-surface-600 transition-colors shrink-0"
        >
          {xIcon}
        </button>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   SEARCH TAB
   ────────────────────────────────────────────────────────────────────────── */

function SearchTab() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (term: string) => {
    if (!term.trim()) { setResults([]); return; }
    setLoading(true);
    const songs = await searchCatalog(term);
    setResults(songs);
    setLoading(false);
  }, []);

  const handleInput = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  };

  const handleAddToQueue = (song: SearchResult) => {
    addToQueue({
      songId: song.id,
      title: song.title,
      artist: song.artist,
      artworkUrl: song.artworkUrl,
    });
    setAddedIds(prev => new Set(prev).add(song.id));
    setTimeout(() => {
      setAddedIds(prev => {
        const next = new Set(prev);
        next.delete(song.id);
        return next;
      });
    }, 2000);
  };

  const handlePlayNow = (song: SearchResult) => {
    playNow({
      songId: song.id,
      title: song.title,
      artist: song.artist,
      artworkUrl: song.artworkUrl,
    });
  };

  return (
    <div className="p-4">
      {/* Search input */}
      <input
        type="text"
        placeholder="Search songs, artists, albums..."
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        autoFocus
        className="w-full h-[52px] bg-surface-700 border border-surface-500 rounded-xl px-4 text-text-primary text-[16px] placeholder:text-text-muted mb-4 focus:outline-none focus:border-accent-pink"
      />

      {/* Results */}
      <div className="space-y-1">
        {loading && (
          <p className="text-text-muted text-center py-8">Searching...</p>
        )}

        {!loading && query && results.length === 0 && (
          <p className="text-text-muted text-center py-8">No results found</p>
        )}

        {!loading && results.map((song) => (
          <div
            key={song.id}
            className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-700 transition-colors"
          >
            {/* Thumbnail */}
            {song.artworkUrl ? (
              <img src={song.artworkUrl} alt="" className="w-[48px] h-[48px] rounded-lg object-cover shrink-0" />
            ) : (
              <div className="w-[48px] h-[48px] rounded-lg bg-surface-600 flex items-center justify-center text-text-muted shrink-0">
                {musicNoteSmall}
              </div>
            )}

            {/* Song info */}
            <div className="flex-1 min-w-0">
              <p className="text-text-primary text-[15px] font-semibold truncate">{song.title}</p>
              <p className="text-text-secondary text-[13px] truncate">
                {song.artist} {song.album && `\u2022 ${song.album}`}
              </p>
            </div>

            {/* Duration */}
            <span className="text-text-muted text-[13px] shrink-0">
              {formatTime(song.durationMs)}
            </span>

            {/* Add to queue button */}
            <button
              onClick={() => handleAddToQueue(song)}
              className={[
                'w-[40px] h-[40px] rounded-full flex items-center justify-center transition-all shrink-0',
                addedIds.has(song.id)
                  ? 'bg-green-600/20 text-green-400'
                  : 'bg-surface-600 text-text-secondary hover:bg-accent-blue hover:text-white',
              ].join(' ')}
              title="Add to queue"
            >
              {addedIds.has(song.id) ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                addToQueueIcon
              )}
            </button>

            {/* Play now button */}
            <button
              onClick={() => handlePlayNow(song)}
              className="w-[40px] h-[40px] rounded-full flex items-center justify-center bg-surface-600 text-text-secondary hover:bg-accent-pink hover:text-white transition-all shrink-0"
              title="Play now"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   CATEGORIES TAB
   ────────────────────────────────────────────────────────────────────────── */

function CategoriesTab({ isAdmin }: { isAdmin: boolean }) {
  const [categories, setCategories] = useState<MusicCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [categorySongs, setCategorySongs] = useState<CategorySong[]>([]);
  const [loadingSongs, setLoadingSongs] = useState(false);
  const [showAddSearch, setShowAddSearch] = useState(false);

  useEffect(() => {
    api.get<MusicCategory[]>('/music/categories')
      .then(setCategories)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadCategorySongs = async (catId: number) => {
    if (expandedId === catId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(catId);
    setLoadingSongs(true);
    try {
      const songs = await api.get<CategorySong[]>(`/music/categories/${catId}/songs`);
      setCategorySongs(songs);
    } catch {
      setCategorySongs([]);
    }
    setLoadingSongs(false);
  };

  const playCategory = async (catId: number) => {
    try {
      const songs = await api.get<CategorySong[]>(`/music/categories/${catId}/songs`);
      if (songs.length === 0) return;
      const queueSongs: QueueSong[] = songs.map(s => ({
        songId: s.song_id,
        title: s.title,
        artist: s.artist || '',
        artworkUrl: s.artwork_url || '',
      }));
      playPlayerPlaylist(queueSongs, true);
    } catch { /* */ }
  };

  if (loading) {
    return <div className="p-4 text-center text-text-muted py-12">Loading categories...</div>;
  }

  return (
    <div className="p-4">
      <div className="grid grid-cols-2 gap-3">
        {categories.map(cat => (
          <div key={cat.id}>
            <Card
              onClick={() => loadCategorySongs(cat.id)}
              className="h-[100px] flex flex-col items-center justify-center gap-2 cursor-pointer"
            >
              <span className="text-[32px]">{cat.icon}</span>
              <span className="text-text-primary text-[15px] font-semibold">{cat.name}</span>
              {cat.song_count !== undefined && cat.song_count > 0 && (
                <span className="text-text-muted text-[12px]">{cat.song_count} songs</span>
              )}
            </Card>

            {expandedId === cat.id && (
              <div className="mt-2 mb-3 bg-surface-800 rounded-xl border border-surface-600 p-3">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-text-secondary text-[14px] font-semibold">{cat.name}</span>
                  <div className="flex gap-2">
                    {isAdmin && (
                      <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); setShowAddSearch(true); }}>
                        + Add
                      </Button>
                    )}
                    <Button size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); playCategory(cat.id); }}>
                      Play All
                    </Button>
                  </div>
                </div>
                {loadingSongs ? (
                  <p className="text-text-muted text-[14px] text-center py-4">Loading...</p>
                ) : categorySongs.length === 0 ? (
                  <p className="text-text-muted text-[14px] text-center py-4">No songs in this category yet.</p>
                ) : (
                  <div className="space-y-1 max-h-[300px] overflow-y-auto">
                    {categorySongs.map(song => (
                      <button
                        key={song.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          addToQueue({
                            songId: song.song_id,
                            title: song.title,
                            artist: song.artist || '',
                            artworkUrl: song.artwork_url || '',
                          });
                        }}
                        className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-surface-700 transition-colors text-left"
                      >
                        {song.artwork_url ? (
                          <img src={song.artwork_url} alt="" className="w-[40px] h-[40px] rounded-lg object-cover shrink-0" />
                        ) : (
                          <div className="w-[40px] h-[40px] rounded-lg bg-surface-600 flex items-center justify-center text-text-muted shrink-0">
                            {musicNoteSmall}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-text-primary text-[14px] font-semibold truncate">{song.title}</p>
                          <p className="text-text-secondary text-[12px] truncate">{song.artist}</p>
                        </div>
                        <span className="text-text-muted shrink-0">{addToQueueIcon}</span>
                        {isAdmin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              api.delete(`/music/categories/${cat.id}/songs/${song.song_id}`).then(() => {
                                setCategorySongs(prev => prev.filter(s => s.id !== song.id));
                              }).catch(() => {});
                            }}
                            className="w-[28px] h-[28px] rounded-full flex items-center justify-center text-text-muted hover:text-red-400 hover:bg-surface-600 transition-colors shrink-0"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                          </button>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {categories.length === 0 && (
        <div className="text-center py-12">
          <p className="text-text-muted text-[16px]">No categories configured</p>
          <p className="text-text-muted text-[14px] mt-1">Add categories in Settings</p>
        </div>
      )}

      {/* Admin: Add songs to category search modal */}
      {isAdmin && expandedId && (
        <MusicSearch
          open={showAddSearch}
          onClose={() => setShowAddSearch(false)}
          onAddSong={async (song) => {
            try {
              await api.post(`/music/categories/${expandedId}/songs`, {
                songId: song.id,
                title: song.title,
                artist: song.artist,
                artworkUrl: song.artworkUrl,
              });
              // Reload songs
              const songs = await api.get<CategorySong[]>(`/music/categories/${expandedId}/songs`);
              setCategorySongs(songs);
            } catch { /* */ }
          }}
          queueMode
        />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   PLAYER PLAYLISTS TAB
   ────────────────────────────────────────────────────────────────────────── */

function PlaylistsTab() {
  const [players, setPlayers] = useState<PlayerWithPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [playlistSongs, setPlaylistSongs] = useState<PlaylistSong[]>([]);
  const [loadingSongs, setLoadingSongs] = useState(false);

  useEffect(() => {
    // Get all players, then their playlist counts
    api.get<any[]>('/players')
      .then(async (playerList) => {
        const withCounts: PlayerWithPlaylist[] = [];
        for (const p of playerList) {
          try {
            const playlist = await api.get<any[]>(`/music/player/${p.id}/playlist`);
            withCounts.push({ id: p.id, name: p.name, color: p.color, playlist_count: playlist.length });
          } catch {
            withCounts.push({ id: p.id, name: p.name, color: p.color, playlist_count: 0 });
          }
        }
        setPlayers(withCounts);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadPlaylist = async (playerId: number) => {
    if (expandedId === playerId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(playerId);
    setLoadingSongs(true);
    try {
      const songs = await api.get<PlaylistSong[]>(`/music/player/${playerId}/playlist`);
      setPlaylistSongs(songs);
    } catch {
      setPlaylistSongs([]);
    }
    setLoadingSongs(false);
  };

  const playAll = (shuffle = false) => {
    if (playlistSongs.length === 0) return;
    const queueSongs: QueueSong[] = playlistSongs.map(s => ({
      songId: s.song_id,
      title: s.title,
      artist: s.artist || '',
      artworkUrl: s.artwork_url || '',
    }));
    playPlayerPlaylist(queueSongs, shuffle);
  };

  const [showPlaylistSearch, setShowPlaylistSearch] = useState(false);

  const addSongToPlaylist = async (song: any) => {
    console.log('[Playlist] addSongToPlaylist called, expandedId:', expandedId, 'song:', song);
    if (!expandedId) { console.log('[Playlist] No expandedId, aborting'); return; }
    try {
      const payload = {
        songId: song.id,
        title: song.name || song.title || '',
        artist: song.artistName || song.artist || '',
        artworkUrl: song.artworkUrl || '',
      };
      console.log('[Playlist] POST payload:', payload);
      const result = await api.post(`/music/player/${expandedId}/playlist`, payload);
      console.log('[Playlist] POST result:', result);
      loadPlaylist(expandedId);
      // Update count in player list
      setPlayers(prev => prev.map(p => p.id === expandedId ? { ...p, playlist_count: p.playlist_count + 1 } : p));
    } catch (e) { console.error('[Playlist] POST failed:', e); }
  };

  const removeFromPlaylist = async (songDbId: number) => {
    if (!expandedId) return;
    try {
      await api.delete(`/music/player/${expandedId}/playlist/${songDbId}`);
      loadPlaylist(expandedId);
    } catch { /* ignore */ }
  };

  if (loading) {
    return <div className="p-4 text-center text-text-muted py-12">Loading players...</div>;
  }

  return (
    <div className="p-4 space-y-3">
      {players.length === 0 && (
        <div className="text-center py-12">
          <p className="text-text-muted text-[16px]">No players found</p>
        </div>
      )}

      {players.map(player => (
        <div key={player.id}>
          <button
            onClick={() => loadPlaylist(player.id)}
            className="w-full flex items-center gap-3 p-4 rounded-xl bg-surface-800 border border-surface-600 hover:border-surface-500 transition-all text-left"
          >
            <div
              className="w-[44px] h-[44px] rounded-full flex items-center justify-center text-[18px] font-bold text-white shrink-0"
              style={{ backgroundColor: player.color }}
            >
              {player.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-text-primary text-[16px] font-semibold truncate">{player.name}</p>
              <p className="text-text-muted text-[13px]">
                {player.playlist_count} song{player.playlist_count !== 1 ? 's' : ''}
              </p>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-text-muted">
              <path d={expandedId === player.id ? 'M6 9l6 6 6-6' : 'M9 18l6-6-6-6'} />
            </svg>
          </button>

          {expandedId === player.id && (
            <div className="mt-2 bg-surface-800 rounded-xl border border-surface-600 p-3">
              {loadingSongs ? (
                <p className="text-text-muted text-[14px] text-center py-4">Loading...</p>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    {playlistSongs.length > 0 && (
                      <>
                        <Button size="sm" variant="primary" onClick={() => playAll(false)}>
                          Play All
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => playAll(true)}>
                          Shuffle
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="secondary" onClick={() => setShowPlaylistSearch(true)}>
                      + Add Songs
                    </Button>
                  </div>
                  {playlistSongs.length === 0 && (
                    <p className="text-text-muted text-[14px] text-center py-2">No songs yet — tap "Add Songs" to build your playlist</p>
                  )}
                  <div className="space-y-1 max-h-[300px] overflow-y-auto">
                    {playlistSongs.map(song => (
                      <button
                        key={song.id}
                        onClick={() => addToQueue({
                          songId: song.song_id,
                          title: song.title,
                          artist: song.artist || '',
                          artworkUrl: song.artwork_url || '',
                          addedBy: expandedId ?? undefined,
                        })}
                        className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-surface-700 transition-colors text-left"
                      >
                        {song.artwork_url ? (
                          <img src={song.artwork_url} alt="" className="w-[40px] h-[40px] rounded-lg object-cover shrink-0" />
                        ) : (
                          <div className="w-[40px] h-[40px] rounded-lg bg-surface-600 flex items-center justify-center text-text-muted shrink-0">
                            {musicNoteSmall}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-text-primary text-[14px] font-semibold truncate">{song.title}</p>
                          <p className="text-text-secondary text-[12px] truncate">{song.artist}</p>
                        </div>
                        <span className="text-text-muted shrink-0">{addToQueueIcon}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeFromPlaylist(song.id); }}
                          className="text-red-400 hover:text-red-300 shrink-0 p-1"
                          title="Remove from playlist"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                      </button>
                    ))}
                  </div>
                </>
              )}
              <MusicSearch
                open={showPlaylistSearch}
                onClose={() => setShowPlaylistSearch(false)}
                queueMode
                onAddSong={(song) => addSongToPlaylist(song)}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
