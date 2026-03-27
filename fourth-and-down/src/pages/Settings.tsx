import { useState, useEffect, useCallback, useRef } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusDot } from '../components/ui/StatusDot';
import { Modal } from '../components/ui/Modal';
import { PinPad } from '../components/ui/PinPad';
import { Toggle } from '../components/ui/Toggle';
import { Slider } from '../components/ui/Slider';
import { api } from '../lib/api';
import { initMusicKit, isAuthorized, authorize, isInitialized, searchCatalog, refreshBanList, type MusicBan } from '../lib/music';

/* ---- Types ---- */

type DeviceStatus = 'connected' | 'disconnected' | 'connecting';

interface DeviceInfo {
  name: string;
  type: string;
  ip?: string;
  status: DeviceStatus;
}

/* ---- Icons ---- */

const plusIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const searchIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
);

const linkIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
  </svg>
);

const lockIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0110 0v4" />
  </svg>
);

const unlockIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 019.9-1" />
  </svg>
);

const qrIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="8" height="8" rx="1" />
    <rect x="14" y="2" width="8" height="8" rx="1" />
    <rect x="2" y="14" width="8" height="8" rx="1" />
    <rect x="14" y="14" width="4" height="4" />
    <path d="M22 14h-4v4M18 22h4v-4" />
  </svg>
);

/* ---- Component ---- */

export function Settings() {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [hueIp, setHueIp] = useState('');
  const [hueAuthState, setHueAuthState] = useState<'idle' | 'waiting' | 'success' | 'error'>('idle');
  const [nanoleafIp, setNanoleafIp] = useState('');
  const [nanoleafState, setNanoleafState] = useState<'idle' | 'waiting' | 'success' | 'error'>('idle');
  const [nanoleafError, setNanoleafError] = useState('');
  const [onkyoIp, setOnkyoIp] = useState('');
  const [onkyoState, setOnkyoState] = useState<'idle' | 'waiting' | 'success' | 'error'>('idle');
  const [onkyoError, setOnkyoError] = useState('');
  const [lutronIp, setLutronIp] = useState('');
  const [lutronState, setLutronState] = useState<'idle' | 'waiting' | 'success' | 'error'>('idle');
  const [lutronError, setLutronError] = useState('');
  const [lutronDevices, setLutronDevices] = useState<Array<{ name: string; type: string }>>([]);
  const [serverUrl, setServerUrl] = useState('');

  // Zone mapping state
  interface HueGroupOption { id: string; name: string; type: string; lightCount: number }
  const [hueGroups, setHueGroups] = useState<HueGroupOption[]>([]);
  const ZONES = [
    { id: 'theater', label: 'Theater', description: 'Projection room lights' },
    { id: 'theater_bias', label: 'Theater Bias Lighting', description: 'Backlighting behind the screen' },
    { id: 'rec_room', label: 'Rec Room', description: 'Main hangout area' },
    { id: 'bar', label: 'Bar Area', description: 'Wet bar lighting' },
    { id: 'pool', label: 'Pool Table', description: 'Overhead pool table lights' },
  ] as const;
  const [zoneMappings, setZoneMappings] = useState<Record<string, string>>({});
  const [zoneSaving, setZoneSaving] = useState(false);

  // QR code state
  const [showQr, setShowQr] = useState(false);
  const [qrData, setQrData] = useState<{ url: string; qr: string } | null>(null);

  const openQrModal = async () => {
    try {
      const data = await api.get<{ url: string; qr: string }>('/qr');
      setQrData(data);
      setShowQr(true);
    } catch { /* noop */ }
  };

  // Inline Light Controls state
  const [lightsExpanded, setLightsExpanded] = useState(false);
  const [lightGroups, setLightGroups] = useState<Array<{ id: string; name: string; on: boolean; brightness: number }>>([]);
  const [lightsLoading, setLightsLoading] = useState(false);

  // Inline Receiver Controls state
  const [receiverExpanded, setReceiverExpanded] = useState(false);
  const [receiverState, setReceiverState] = useState<{ power: boolean; volume: number; muted: boolean; input: string; listeningMode: string } | null>(null);
  const [receiverLoading, setReceiverLoading] = useState(false);

  const RECEIVER_INPUTS = [
    { id: 'appletv', code: '01', name: 'Apple TV' },
    { id: 'bluetooth', code: '2E', name: 'Bluetooth' },
    { id: 'game', code: '02', name: 'Game' },
    { id: 'tv', code: '12', name: 'TV' },
    { id: 'pc', code: '05', name: 'PC' },
  ];

  const RECEIVER_MODES = [
    { id: 'stereo', name: 'Stereo' },
    { id: 'dolby_surround', name: 'Dolby Surround' },
    { id: 'all_stereo', name: 'All Ch Stereo' },
    { id: 'direct', name: 'Direct' },
  ];

  const COLOR_SWATCHES = ['#ffffff','#ff8c00','#ff4444','#ff00ff','#8b5cf6','#3b82f6','#06b6d4','#22c55e','#f59e0b'];

  // PIN state
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinPurpose, setPinPurpose] = useState<'unlock' | 'change-verify' | 'change-new' | 'change-confirm'>('unlock');
  const [newPinValue, setNewPinValue] = useState('');
  const [currentPinValue, setCurrentPinValue] = useState('');
  const [pinError, setPinError] = useState('');

  // Apple Music state
  const [musicReady, setMusicReady] = useState(false);
  const [musicAuthorized, setMusicAuthorized] = useState(false);
  const [musicLoading, setMusicLoading] = useState(false);
  const [musicTokenOk, setMusicTokenOk] = useState<boolean | null>(null);

  // Music ban list state
  const [banList, setBanList] = useState<MusicBan[]>([]);
  const [banTab, setBanTab] = useState<'song' | 'artist'>('song');
  const [banInput, setBanInput] = useState('');
  const [banLoading, setBanLoading] = useState(false);

  // Music categories state
  interface MusicCategory { id: number; name: string; icon: string; song_count?: number }
  interface CategorySong { id: number; song_id: string; title: string; artist: string; artwork_url: string }
  const [musicCategories, setMusicCategories] = useState<MusicCategory[]>([]);
  const [expandedCategoryId, setExpandedCategoryId] = useState<number | null>(null);
  const [categorySongs, setCategorySongs] = useState<CategorySong[]>([]);
  const [catSongsLoading, setCatSongsLoading] = useState(false);
  const [showCatSearch, setShowCatSearch] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('');
  const [showNewCatModal, setShowNewCatModal] = useState(false);

  // Game/Scene music state
  interface GameMusicSong { id: number; song_id: string; title: string; artist: string; artwork_url: string }
  const [gameMusicType, setGameMusicType] = useState<string | null>(null);
  const [gameMusicKey, setGameMusicKey] = useState<string | null>(null);
  const [gameMusicSongs, setGameMusicSongs] = useState<GameMusicSong[]>([]);
  const [gameMusicLoading, setGameMusicLoading] = useState(false);
  const [showGameMusicSearch, setShowGameMusicSearch] = useState(false);

  // Category search state
  const [catSearchQuery, setCatSearchQuery] = useState('');
  const [catSearchResults, setCatSearchResults] = useState<any[]>([]);
  const [catSearchLoading, setCatSearchLoading] = useState(false);
  const catSearchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadCategories = useCallback(() => {
    api.get<MusicCategory[]>('/music/categories').then(setMusicCategories).catch(() => {});
  }, []);

  const loadCategorySongs = async (catId: number) => {
    if (expandedCategoryId === catId) { setExpandedCategoryId(null); return; }
    setExpandedCategoryId(catId);
    setCatSongsLoading(true);
    try {
      const songs = await api.get<CategorySong[]>(`/music/categories/${catId}/songs`);
      setCategorySongs(songs);
    } catch { setCategorySongs([]); }
    setCatSongsLoading(false);
  };

  const addSongToCategory = async (catId: number, song: { id: string; title: string; artist: string; artworkUrl: string }) => {
    try {
      const saved = await api.post<CategorySong>(`/music/categories/${catId}/songs`, {
        songId: song.id, title: song.title, artist: song.artist, artworkUrl: song.artworkUrl,
      });
      setCategorySongs(prev => [...prev, saved]);
      loadCategories();
    } catch { /* */ }
  };

  const removeSongFromCategory = async (catId: number, songId: string) => {
    try {
      await api.delete(`/music/categories/${catId}/songs/${songId}`);
      setCategorySongs(prev => prev.filter(s => s.song_id !== songId));
      loadCategories();
    } catch { /* */ }
  };

  const createCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    try {
      await api.post('/music/categories', { name, icon: newCatIcon || undefined });
      setNewCatName('');
      setNewCatIcon('');
      setShowNewCatModal(false);
      loadCategories();
    } catch { /* */ }
  };

  const deleteCategory = async (catId: number) => {
    try {
      await api.delete(`/music/categories/${catId}`);
      if (expandedCategoryId === catId) setExpandedCategoryId(null);
      loadCategories();
    } catch { /* */ }
  };

  // Game music helpers
  const loadGameMusic = async (gameType: string, categoryKey?: string) => {
    setGameMusicType(gameType);
    setGameMusicKey(categoryKey || null);
    setGameMusicLoading(true);
    try {
      const url = categoryKey
        ? `/music/game/${gameType}?categoryKey=${encodeURIComponent(categoryKey)}`
        : `/music/game/${gameType}`;
      const songs = await api.get<GameMusicSong[]>(url);
      setGameMusicSongs(songs);
    } catch { setGameMusicSongs([]); }
    setGameMusicLoading(false);
  };

  const addGameMusicSong = async (song: { id: string; title: string; artist: string; artworkUrl: string }) => {
    if (!gameMusicType) return;
    try {
      const saved = await api.post<GameMusicSong>(`/music/game/${gameMusicType}`, {
        categoryKey: gameMusicKey, songId: song.id, title: song.title, artist: song.artist, artworkUrl: song.artworkUrl,
      });
      setGameMusicSongs(prev => [...prev, saved]);
    } catch { /* */ }
  };

  const removeGameMusicSong = async (songId: string) => {
    if (!gameMusicType) return;
    try {
      await api.delete(`/music/game/${gameMusicType}/${songId}`);
      setGameMusicSongs(prev => prev.filter(s => s.song_id !== songId));
    } catch { /* */ }
  };

  // Category song search
  const doCatSearch = async (term: string) => {
    if (!term.trim()) { setCatSearchResults([]); return; }
    setCatSearchLoading(true);
    const songs = await searchCatalog(term);
    setCatSearchResults(songs);
    setCatSearchLoading(false);
  };

  const handleCatSearchInput = (value: string) => {
    setCatSearchQuery(value);
    if (catSearchDebounce.current) clearTimeout(catSearchDebounce.current);
    catSearchDebounce.current = setTimeout(() => doCatSearch(value), 300);
  };

  // Ban list helpers
  const loadBanList = async () => {
    try {
      const bans = await api.get<MusicBan[]>('/music/bans');
      setBanList(bans);
      await refreshBanList(); // also refresh the in-memory cache in music.ts
    } catch { /* */ }
  };

  const addBan = async () => {
    const val = banInput.trim();
    if (!val) return;
    setBanLoading(true);
    try {
      await api.post('/music/bans', { banType: banTab, value: val });
      setBanInput('');
      await loadBanList();
    } catch { /* */ }
    setBanLoading(false);
  };

  const removeBan = async (id: number) => {
    try {
      await api.delete(`/music/bans/${id}`);
      await loadBanList();
    } catch { /* */ }
  };

  useEffect(() => {
    // Initialize MusicKit
    initMusicKit().then((ok) => {
      setMusicReady(ok);
      if (ok) setMusicAuthorized(isAuthorized());
    });
    // Check token endpoint
    fetch('/api/musickit/token')
      .then(r => r.json())
      .then(d => setMusicTokenOk(!!d.token))
      .catch(() => setMusicTokenOk(false));
    // Load music categories
    loadCategories();
    // Load music ban list
    loadBanList();
  }, [loadCategories]);

  useEffect(() => {
    // Load saved device configs so state survives navigation
    api
      .get<Array<{ device_type: string; name: string; ip: string; auth_token: string }>>('/devices')
      .then((saved) => {
        const infos: DeviceInfo[] = [];
        for (const d of saved) {
          if (d.device_type === 'hue') {
            setHueIp(d.ip);
            setHueAuthState('success');
          }
          if (d.device_type === 'nanoleaf') { setNanoleafIp(d.ip); setNanoleafState('success'); }
          if (d.device_type === 'onkyo') { setOnkyoIp(d.ip); setOnkyoState('success'); }
          if (d.device_type === 'lutron') { setLutronIp(d.ip); setLutronState('success'); }
          infos.push({
            name: d.name,
            type: d.device_type,
            ip: d.ip,
            status: 'connected', // assume connected if saved
          });
        }
        setDevices(infos);
      })
      .catch(() => {});

    setServerUrl(`${window.location.protocol}//${window.location.host}`);

    // Load Lutron devices if paired
    api.get<Array<{ name: string; type: string }>>('/lutron/devices')
      .then(setLutronDevices)
      .catch(() => {});

    // Load Hue groups for zone mapping
    api.get<Array<{ id: string; name: string; type: string; lights: string[] }>>('/hue/groups')
      .then((groups) => {
        setHueGroups(groups.map(g => ({ id: g.id, name: g.name, type: g.type, lightCount: g.lights.length })));
      })
      .catch(() => {});

    // Load existing zone mappings
    api.get<Record<string, string>>('/zones')
      .then(setZoneMappings)
      .catch(() => {});
  }, []);

  const discoverHue = async () => {
    try {
      const result = await api.get<{ ip: string }>('/hue/discover');
      setHueIp(result.ip);
    } catch {
      // no bridge found
    }
  };

  const authHue = async () => {
    setHueAuthState('waiting');
    // Poll for up to 30 seconds (user needs to press bridge button)
    const maxAttempts = 15;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const result = await api.post<{ token?: string; error?: string }>('/hue/auth', { ip: hueIp });
        if (result.token) {
          setHueAuthState('success');
          // Refresh device list
          const saved = await api.get<Array<{ device_type: string; name: string; ip: string }>>('/devices');
          setDevices(saved.map(d => ({ name: d.name, type: d.device_type, ip: d.ip, status: 'connected' as DeviceStatus })));
          return;
        }
        // Not yet — wait 2 seconds and retry
        await new Promise(r => setTimeout(r, 2000));
      } catch {
        setHueAuthState('error');
        return;
      }
    }
    setHueAuthState('error');
  };

  const connectNanoleaf = async () => {
    setNanoleafState('waiting');
    setNanoleafError('');
    try {
      const result = await api.post<{ token?: string; error?: string }>('/nanoleaf/auth', { ip: nanoleafIp });
      if (result.token) {
        setNanoleafState('success');
      } else {
        setNanoleafState('error');
        setNanoleafError(result.error || 'Hold the power button on Nanoleaf and try again');
      }
    } catch (e: any) {
      setNanoleafState('error');
      setNanoleafError(e?.message || 'Connection failed. Check IP and make sure Nanoleaf is on.');
    }
  };

  const connectOnkyo = async () => {
    setOnkyoState('waiting');
    setOnkyoError('');
    try {
      const result = await api.post<{ ok?: boolean; error?: string }>('/onkyo/connect', { ip: onkyoIp });
      if (result.ok) {
        setOnkyoState('success');
      } else {
        setOnkyoState('error');
        setOnkyoError(result.error || 'Connection failed');
      }
    } catch (e: any) {
      setOnkyoState('error');
      // Try to extract error message from response
      let msg = 'Connection failed. Check IP and make sure receiver is powered on.';
      try { const body = JSON.parse(e?.message || ''); if (body.error) msg = body.error; } catch { if (e?.message) msg = e.message; }
      setOnkyoError(msg);
    }
  };

  const connectLutron = async () => {
    setLutronState('waiting');
    setLutronError('');
    try {
      const result = await api.post<{ ok?: boolean; error?: string; devices?: Array<{ name: string; type: string }> }>('/lutron/pair', { ip: lutronIp });
      if (result.ok) {
        setLutronState('success');
        if (result.devices) setLutronDevices(result.devices);
      } else {
        setLutronState('error');
        setLutronError(result.error || 'Pairing failed');
      }
    } catch (e: any) {
      setLutronState('error');
      setLutronError(e?.message || 'Connection failed. Press the button on the back of the bridge and try again.');
    }
  };

  // Inline Lights helpers
  const loadLightGroups = async () => {
    setLightsLoading(true);
    try {
      const [groupsData, zoneMappings] = await Promise.all([
        api.get<Array<{ id: string; name: string; on: boolean; brightness: number; lights: string[]; type: string }>>('/hue/groups'),
        api.get<Record<string, string>>('/zones'),
      ]);
      const assignedGroupIds = new Set(Object.values(zoneMappings).filter(Boolean));
      const rooms = groupsData
        .filter(g => assignedGroupIds.has(g.id))
        .map(g => ({ id: g.id, name: g.name, on: g.on, brightness: g.brightness }));
      setLightGroups(rooms);
    } catch { /* noop */ }
    setLightsLoading(false);
  };

  const toggleLightsSection = () => {
    const next = !lightsExpanded;
    setLightsExpanded(next);
    if (next && lightGroups.length === 0) loadLightGroups();
  };

  const setGroupBrightness = async (groupId: string, brightness: number) => {
    setLightGroups(prev => prev.map(g => g.id === groupId ? { ...g, brightness } : g));
    await api.put(`/hue/groups/${groupId}`, { brightness }).catch(() => {});
  };

  const toggleGroupPower = async (groupId: string, on: boolean) => {
    setLightGroups(prev => prev.map(g => g.id === groupId ? { ...g, on } : g));
    await api.put(`/hue/groups/${groupId}`, { on }).catch(() => {});
  };

  const setGroupColor = async (groupId: string, color: string) => {
    await api.put(`/hue/groups/${groupId}`, { color }).catch(() => {});
  };

  // Inline Receiver helpers
  const loadReceiverState = async () => {
    setReceiverLoading(true);
    try {
      const s = await api.get<{ power: boolean; volume: number; muted: boolean; input: string; listeningMode: string }>('/onkyo/state');
      setReceiverState(s);
    } catch { /* noop */ }
    setReceiverLoading(false);
  };

  const toggleReceiverSection = () => {
    const next = !receiverExpanded;
    setReceiverExpanded(next);
    if (next && !receiverState) loadReceiverState();
  };

  const setReceiverPower = async (on: boolean) => {
    setReceiverState(prev => prev ? { ...prev, power: on } : prev);
    await api.put('/onkyo/power', { on }).catch(() => {});
  };

  const setReceiverVolume = async (delta: number) => {
    if (!receiverState) return;
    const next = Math.max(0, Math.min(80, receiverState.volume + delta));
    setReceiverState(prev => prev ? { ...prev, volume: next } : prev);
    await api.put('/onkyo/volume', { level: next }).catch(() => {});
  };

  const setReceiverInput = async (inputId: string) => {
    setReceiverState(prev => prev ? { ...prev, input: inputId } : prev);
    await api.put('/onkyo/input', { input: inputId }).catch(() => {});
  };

  const setReceiverMode = async (mode: string) => {
    setReceiverState(prev => prev ? { ...prev, listeningMode: mode } : prev);
    await api.put('/onkyo/mode', { mode }).catch(() => {});
  };

  // PIN handlers
  const requestUnlock = () => {
    setPinPurpose('unlock');
    setPinError('');
    setShowPinModal(true);
  };

  const requestChangePin = () => {
    setPinPurpose('change-verify');
    setPinError('');
    setShowPinModal(true);
  };

  const handlePinSubmit = async (pin: string) => {
    if (pinPurpose === 'unlock') {
      try {
        const result = await api.post<{ valid: boolean }>('/admin/verify-pin', { pin });
        if (result.valid) {
          setAdminUnlocked(true);
          setShowPinModal(false);
          setPinError('');
        } else {
          setPinError('Wrong PIN');
          (window as any).__pinPadShake?.();
        }
      } catch {
        setPinError('Connection error');
        (window as any).__pinPadShake?.();
      }
    } else if (pinPurpose === 'change-verify') {
      // Verify current PIN first
      try {
        const result = await api.post<{ valid: boolean }>('/admin/verify-pin', { pin });
        if (result.valid) {
          setCurrentPinValue(pin);
          setPinPurpose('change-new');
          setPinError('');
        } else {
          setPinError('Wrong PIN');
          (window as any).__pinPadShake?.();
        }
      } catch {
        setPinError('Connection error');
        (window as any).__pinPadShake?.();
      }
    } else if (pinPurpose === 'change-new') {
      // Store the new PIN, ask to confirm
      setNewPinValue(pin);
      setPinPurpose('change-confirm');
      setPinError('');
    } else if (pinPurpose === 'change-confirm') {
      // Confirm matches
      if (pin === newPinValue) {
        try {
          // Use the admin verify to get current pin, then change
          // We already verified current pin in change-verify step
          await api.put('/admin/pin', { currentPin: currentPinValue, newPin: pin });
          setShowPinModal(false);
          setPinError('');
          setNewPinValue('');
        } catch {
          // Fallback: try with empty currentPin (server might accept since we already verified)
          setPinError('Failed to save. Try again.');
          (window as any).__pinPadShake?.();
        }
      } else {
        setPinError("PINs don't match");
        setPinPurpose('change-new');
        (window as any).__pinPadShake?.();
      }
    }
  };

  const pinTitle = () => {
    switch (pinPurpose) {
      case 'unlock': return 'Enter Admin PIN';
      case 'change-verify': return 'Enter Current PIN';
      case 'change-new': return 'Enter New PIN';
      case 'change-confirm': return 'Confirm New PIN';
    }
  };

  // If not unlocked, show the gate
  if (!adminUnlocked) {
    return (
      <div className="p-5 pb-2 animate-fade-in">
        <h1 className="text-[28px] font-bold text-text-primary mb-5">
          Settings
        </h1>

        <Card className="flex flex-col items-center justify-center py-12 gap-6">
          <div className="text-text-muted">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </div>
          <p className="text-text-secondary text-[18px]">
            Admin PIN required
          </p>
          <Button variant="primary" size="lg" icon={unlockIcon} onClick={requestUnlock}>
            Unlock Settings
          </Button>
        </Card>

        {/* Device controls — always visible, no PIN needed */}
        <div className="space-y-4 mt-5">
          {/* Light Controls — expandable */}
          <Card>
            <button onClick={toggleLightsSection} className="w-full flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-[28px]">💡</span>
                <div className="text-left">
                  <h3 className="text-[16px] font-bold text-text-primary">Light Controls</h3>
                  <p className="text-text-muted text-[13px]">Brightness & colors</p>
                </div>
              </div>
              <span className="text-text-muted transition-transform" style={{ transform: lightsExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
              </span>
            </button>
            {lightsExpanded && (
              <div className="mt-4 pt-4 border-t border-surface-600 space-y-4 animate-fade-in">
                {lightsLoading ? (
                  <p className="text-text-muted text-center py-4">Loading lights...</p>
                ) : lightGroups.length === 0 ? (
                  <p className="text-text-muted text-center py-4">No rooms configured. Set up Hue and zone mappings first.</p>
                ) : (
                  lightGroups.map(group => (
                    <div key={group.id} className="bg-surface-700 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[16px] font-bold text-text-primary">{group.name}</h4>
                        <Toggle checked={group.on} onChange={(on) => toggleGroupPower(group.id, on)} size="md" />
                      </div>
                      <Slider
                        value={group.brightness}
                        onChange={(v) => setGroupBrightness(group.id, v)}
                        color="#3b82f6"
                        disabled={!group.on}
                      />
                      {group.on && (
                        <div className="flex gap-2 flex-wrap">
                          {COLOR_SWATCHES.map(c => (
                            <button
                              key={c}
                              onClick={() => setGroupColor(group.id, c)}
                              className="w-[32px] h-[32px] rounded-full border-2 border-surface-500 active:scale-90 transition-transform"
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </Card>

          {/* Receiver Controls — expandable */}
          <Card>
            <button onClick={toggleReceiverSection} className="w-full flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-[28px]">🔊</span>
                <div className="text-left">
                  <h3 className="text-[16px] font-bold text-text-primary">Receiver Controls</h3>
                  <p className="text-text-muted text-[13px]">Volume, input & modes</p>
                </div>
              </div>
              <span className="text-text-muted transition-transform" style={{ transform: receiverExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
              </span>
            </button>
            {receiverExpanded && (
              <div className="mt-4 pt-4 border-t border-surface-600 space-y-4 animate-fade-in">
                {receiverLoading ? (
                  <p className="text-text-muted text-center py-4">Loading receiver...</p>
                ) : !receiverState ? (
                  <p className="text-text-muted text-center py-4">Receiver not configured. Set up Onkyo in Settings.</p>
                ) : (
                  <>
                    {/* Power toggle */}
                    <div className="flex items-center justify-between">
                      <span className="text-[16px] font-bold text-text-primary">Power</span>
                      <Toggle checked={receiverState.power} onChange={setReceiverPower} size="md" />
                    </div>
                    {/* Volume +/- */}
                    <div className={`flex items-center justify-between ${!receiverState.power ? 'opacity-40 pointer-events-none' : ''}`}>
                      <span className="text-[16px] font-bold text-text-primary">Volume</span>
                      <div className="flex items-center gap-3">
                        <button onClick={() => setReceiverVolume(-2)} className="w-[40px] h-[40px] rounded-xl bg-surface-600 flex items-center justify-center text-text-primary text-[20px] font-bold active:scale-95">−</button>
                        <span className="text-[24px] font-black tabular-nums text-text-primary w-[40px] text-center">{receiverState.volume}</span>
                        <button onClick={() => setReceiverVolume(2)} className="w-[40px] h-[40px] rounded-xl bg-surface-600 flex items-center justify-center text-text-primary text-[20px] font-bold active:scale-95">+</button>
                      </div>
                    </div>
                    {/* Input selector */}
                    <div className={!receiverState.power ? 'opacity-40 pointer-events-none' : ''}>
                      <span className="text-[14px] font-semibold text-text-secondary block mb-2">Input</span>
                      <div className="flex flex-wrap gap-2">
                        {RECEIVER_INPUTS.map(inp => (
                          <button
                            key={inp.id}
                            onClick={() => setReceiverInput(inp.id)}
                            className={[
                              'px-3 py-2 rounded-xl text-[13px] font-semibold transition-all',
                              receiverState.input === inp.code
                                ? 'bg-accent-blue/20 border border-accent-blue text-accent-blue'
                                : 'bg-surface-600 border border-transparent text-text-secondary',
                            ].join(' ')}
                          >
                            {inp.name}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Mode selector */}
                    <div className={!receiverState.power ? 'opacity-40 pointer-events-none' : ''}>
                      <span className="text-[14px] font-semibold text-text-secondary block mb-2">Mode</span>
                      <div className="flex flex-wrap gap-2">
                        {RECEIVER_MODES.map(mode => (
                          <button
                            key={mode.id}
                            onClick={() => setReceiverMode(mode.id)}
                            className={[
                              'px-3 py-2 rounded-xl text-[13px] font-semibold transition-all',
                              receiverState.listeningMode === mode.id
                                ? 'bg-accent-purple/20 border border-accent-purple text-accent-purple'
                                : 'bg-surface-600 border border-transparent text-text-secondary',
                            ].join(' ')}
                          >
                            {mode.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* Network info is always visible (not admin-locked) */}
        <Card className="mt-5">
          <h2 className="text-[20px] font-bold text-text-primary mb-4">
            Network
          </h2>
          <div className="space-y-3">
            <div>
              <label className="block text-text-muted text-[14px] mb-1">
                Server URL
              </label>
              <p className="text-text-primary text-[16px] font-mono bg-surface-700 rounded-lg px-3 py-2">
                {serverUrl}
              </p>
            </div>
            <Button variant="secondary" fullWidth icon={qrIcon} onClick={openQrModal}>
              Show QR Code for Phone Access
            </Button>
          </div>
        </Card>

        {/* QR Code Modal */}
        <Modal open={showQr} onClose={() => setShowQr(false)} title="Phone Access" size="sm">
          {qrData && (
            <div className="flex flex-col items-center gap-4 py-2">
              <img src={qrData.qr} alt="QR Code" className="w-[250px] h-[250px]" />
              <p className="text-text-secondary text-[14px] font-mono text-center break-all px-2">
                {qrData.url}
              </p>
            </div>
          )}
        </Modal>

        {/* PIN Modal */}
        <Modal open={showPinModal} onClose={() => setShowPinModal(false)} size="sm">
          <PinPad
            title={pinTitle()}
            onSubmit={handlePinSubmit}
            onCancel={() => setShowPinModal(false)}
          />
          {pinError && (
            <p className="text-accent-red text-[14px] text-center mt-4">{pinError}</p>
          )}
        </Modal>
      </div>
    );
  }

  // Unlocked — full settings
  return (
    <div className="p-5 pb-2 animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-[28px] font-bold text-text-primary">
          Settings
        </h1>
        <div className="flex items-center gap-2 text-accent-green text-[14px]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 019.9-1" />
          </svg>
          Unlocked
        </div>
      </div>

      {/* Inline Light and Receiver controls */}
      <div className="space-y-4 mb-5">
        {/* Light Controls — expandable */}
        <Card>
          <button onClick={toggleLightsSection} className="w-full flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-[28px]">💡</span>
              <div className="text-left">
                <h3 className="text-[16px] font-bold text-text-primary">Light Controls</h3>
                <p className="text-text-muted text-[13px]">Brightness & colors</p>
              </div>
            </div>
            <span className="text-text-muted transition-transform" style={{ transform: lightsExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
            </span>
          </button>
          {lightsExpanded && (
            <div className="mt-4 pt-4 border-t border-surface-600 space-y-4 animate-fade-in">
              {lightsLoading ? (
                <p className="text-text-muted text-center py-4">Loading lights...</p>
              ) : lightGroups.length === 0 ? (
                <p className="text-text-muted text-center py-4">No rooms configured. Set up Hue and zone mappings first.</p>
              ) : (
                lightGroups.map(group => (
                  <div key={group.id} className="bg-surface-700 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[16px] font-bold text-text-primary">{group.name}</h4>
                      <Toggle checked={group.on} onChange={(on) => toggleGroupPower(group.id, on)} size="md" />
                    </div>
                    <Slider
                      value={group.brightness}
                      onChange={(v) => setGroupBrightness(group.id, v)}
                      color="#3b82f6"
                      disabled={!group.on}
                    />
                    {group.on && (
                      <div className="flex gap-2 flex-wrap">
                        {COLOR_SWATCHES.map(c => (
                          <button
                            key={c}
                            onClick={() => setGroupColor(group.id, c)}
                            className="w-[32px] h-[32px] rounded-full border-2 border-surface-500 active:scale-90 transition-transform"
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </Card>

        {/* Receiver Controls — expandable */}
        <Card>
          <button onClick={toggleReceiverSection} className="w-full flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-[28px]">🔊</span>
              <div className="text-left">
                <h3 className="text-[16px] font-bold text-text-primary">Receiver Controls</h3>
                <p className="text-text-muted text-[13px]">Volume, input & modes</p>
              </div>
            </div>
            <span className="text-text-muted transition-transform" style={{ transform: receiverExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
            </span>
          </button>
          {receiverExpanded && (
            <div className="mt-4 pt-4 border-t border-surface-600 space-y-4 animate-fade-in">
              {receiverLoading ? (
                <p className="text-text-muted text-center py-4">Loading receiver...</p>
              ) : !receiverState ? (
                <p className="text-text-muted text-center py-4">Receiver not configured. Set up Onkyo in Settings.</p>
              ) : (
                <>
                  {/* Power toggle */}
                  <div className="flex items-center justify-between">
                    <span className="text-[16px] font-bold text-text-primary">Power</span>
                    <Toggle checked={receiverState.power} onChange={setReceiverPower} size="md" />
                  </div>
                  {/* Volume +/- */}
                  <div className={`flex items-center justify-between ${!receiverState.power ? 'opacity-40 pointer-events-none' : ''}`}>
                    <span className="text-[16px] font-bold text-text-primary">Volume</span>
                    <div className="flex items-center gap-3">
                      <button onClick={() => setReceiverVolume(-2)} className="w-[40px] h-[40px] rounded-xl bg-surface-600 flex items-center justify-center text-text-primary text-[20px] font-bold active:scale-95">−</button>
                      <span className="text-[24px] font-black tabular-nums text-text-primary w-[40px] text-center">{receiverState.volume}</span>
                      <button onClick={() => setReceiverVolume(2)} className="w-[40px] h-[40px] rounded-xl bg-surface-600 flex items-center justify-center text-text-primary text-[20px] font-bold active:scale-95">+</button>
                    </div>
                  </div>
                  {/* Input selector */}
                  <div className={!receiverState.power ? 'opacity-40 pointer-events-none' : ''}>
                    <span className="text-[14px] font-semibold text-text-secondary block mb-2">Input</span>
                    <div className="flex flex-wrap gap-2">
                      {RECEIVER_INPUTS.map(inp => (
                        <button
                          key={inp.id}
                          onClick={() => setReceiverInput(inp.id)}
                          className={[
                            'px-3 py-2 rounded-xl text-[13px] font-semibold transition-all',
                            receiverState.input === inp.code
                              ? 'bg-accent-blue/20 border border-accent-blue text-accent-blue'
                              : 'bg-surface-600 border border-transparent text-text-secondary',
                          ].join(' ')}
                        >
                          {inp.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Mode selector */}
                  <div className={!receiverState.power ? 'opacity-40 pointer-events-none' : ''}>
                    <span className="text-[14px] font-semibold text-text-secondary block mb-2">Mode</span>
                    <div className="flex flex-wrap gap-2">
                      {RECEIVER_MODES.map(mode => (
                        <button
                          key={mode.id}
                          onClick={() => setReceiverMode(mode.id)}
                          className={[
                            'px-3 py-2 rounded-xl text-[13px] font-semibold transition-all',
                            receiverState.listeningMode === mode.id
                              ? 'bg-accent-purple/20 border border-accent-purple text-accent-purple'
                              : 'bg-surface-600 border border-transparent text-text-secondary',
                          ].join(' ')}
                        >
                          {mode.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Devices overview */}
      <Card className="mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[20px] font-bold text-text-primary">Devices</h2>
          <Button variant="ghost" size="sm" icon={plusIcon}>
            Add Device
          </Button>
        </div>
        {devices.length > 0 ? (
          <div className="space-y-3">
            {devices.map((device) => (
              <div
                key={device.name}
                className="flex items-center justify-between py-2"
              >
                <div>
                  <p className="text-[16px] text-text-primary font-medium">
                    {device.name}
                  </p>
                  {device.ip && (
                    <p className="text-[14px] text-text-muted">{device.ip}</p>
                  )}
                </div>
                <StatusDot status={device.status} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-text-muted text-[16px]">No devices configured</p>
        )}
      </Card>

      {/* Device setup cards — 2-col grid on wide screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">

      {/* Hue Bridge */}
      <Card>
        <h2 className="text-[20px] font-bold text-text-primary mb-4">
          Hue Bridge
        </h2>
        <div className="space-y-3">
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Bridge IP address"
              value={hueIp}
              onChange={(e) => setHueIp(e.target.value)}
              className="flex-1 h-[48px] bg-surface-700 border border-surface-500 rounded-xl px-4 text-text-primary text-[16px] placeholder:text-text-muted"
            />
            <Button variant="secondary" size="sm" icon={searchIcon} onClick={discoverHue}>
              Discover
            </Button>
          </div>
          <Button
            variant="primary"
            fullWidth
            icon={linkIcon}
            onClick={authHue}
            disabled={!hueIp}
          >
            {hueAuthState === 'waiting'
              ? 'Press the bridge button...'
              : hueAuthState === 'success'
                ? 'Connected!'
                : 'Authenticate'}
          </Button>
          {hueAuthState === 'waiting' && (
            <p className="text-accent-amber text-[14px] text-center">
              Press the button on your Hue Bridge, then wait...
            </p>
          )}
          {hueAuthState === 'error' && (
            <p className="text-accent-red text-[14px] text-center">
              Authentication failed. Make sure you pressed the bridge button.
            </p>
          )}
        </div>
      </Card>

      {/* Nanoleaf */}
      <Card>
        <h2 className="text-[20px] font-bold text-text-primary mb-4">
          Nanoleaf
        </h2>
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Nanoleaf IP address"
            value={nanoleafIp}
            onChange={(e) => setNanoleafIp(e.target.value)}
            className="w-full h-[48px] bg-surface-700 border border-surface-500 rounded-xl px-4 text-text-primary text-[16px] placeholder:text-text-muted"
          />
          <p className="text-text-muted text-[14px]">
            Hold the power button on your Nanoleaf for 5 seconds until the LEDs
            flash, then tap Pair.
          </p>
          <Button
            variant="primary"
            fullWidth
            icon={linkIcon}
            onClick={connectNanoleaf}
            disabled={!nanoleafIp || nanoleafState === 'waiting'}
          >
            {nanoleafState === 'waiting' ? 'Pairing...'
              : nanoleafState === 'success' ? 'Connected!'
              : 'Pair Nanoleaf'}
          </Button>
          {nanoleafState === 'error' && (
            <p className="text-accent-red text-[14px] text-center">{nanoleafError}</p>
          )}
          {nanoleafState === 'success' && (
            <p className="text-accent-green text-[14px] text-center">Nanoleaf paired and saved</p>
          )}
        </div>
      </Card>

      {/* Onkyo Receiver */}
      <Card>
        <h2 className="text-[20px] font-bold text-text-primary mb-4">
          Onkyo Receiver
        </h2>
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Receiver IP address"
            value={onkyoIp}
            onChange={(e) => setOnkyoIp(e.target.value)}
            className="w-full h-[48px] bg-surface-700 border border-surface-500 rounded-xl px-4 text-text-primary text-[16px] placeholder:text-text-muted"
          />
          <Button
            variant="primary"
            fullWidth
            icon={linkIcon}
            onClick={connectOnkyo}
            disabled={!onkyoIp || onkyoState === 'waiting'}
          >
            {onkyoState === 'waiting' ? 'Connecting (up to 8 sec)...'
              : onkyoState === 'success' ? 'Connected!'
              : 'Connect'}
          </Button>
          {onkyoState === 'error' && (
            <p className="text-accent-red text-[14px] text-center">{onkyoError}</p>
          )}
          {onkyoState === 'success' && (
            <p className="text-accent-green text-[14px] text-center">Receiver connected and saved</p>
          )}
        </div>
      </Card>

      {/* Lutron Caseta */}
      <Card>
        <h2 className="text-[20px] font-bold text-text-primary mb-4">
          Lutron Caseta
        </h2>
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Caseta Bridge IP (e.g. 192.168.50.x)"
            value={lutronIp}
            onChange={(e) => setLutronIp(e.target.value)}
            className="w-full h-[48px] bg-surface-700 border border-surface-500 rounded-xl px-4 text-text-primary text-[16px] placeholder:text-text-muted"
          />
          <p className="text-text-muted text-[14px]">
            Press the small button on the back of the Caseta bridge, then tap Pair within 30 seconds.
          </p>
          <Button
            variant="primary"
            fullWidth
            icon={linkIcon}
            onClick={connectLutron}
            disabled={!lutronIp || lutronState === 'waiting'}
          >
            {lutronState === 'waiting' ? 'Pairing (press bridge button)...'
              : lutronState === 'success' ? 'Paired!'
              : 'Pair Lutron'}
          </Button>
          {lutronState === 'error' && (
            <p className="text-accent-red text-[14px] text-center">{lutronError}</p>
          )}
          {lutronState === 'success' && lutronDevices.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-accent-green text-[14px]">Found {lutronDevices.length} device(s):</p>
              {lutronDevices.map((d, i) => (
                <div key={i} className="flex items-center justify-between py-1 px-3 bg-surface-700 rounded-lg">
                  <span className="text-text-primary text-[15px]">{d.name}</span>
                  <span className="text-text-muted text-[13px]">{d.type}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Apple Music */}
      <Card>
        <h2 className="text-[20px] font-bold text-text-primary mb-4">
          Apple Music
        </h2>
        <div className="space-y-3">
          {/* Token status */}
          <div className="flex items-center justify-between">
            <span className="text-text-secondary text-[14px]">Developer Token</span>
            <StatusDot status={musicTokenOk === true ? 'connected' : musicTokenOk === false ? 'disconnected' : 'connecting'} label={musicTokenOk === true ? 'Valid' : musicTokenOk === false ? 'Missing' : 'Checking...'} />
          </div>

          {/* MusicKit status */}
          <div className="flex items-center justify-between">
            <span className="text-text-secondary text-[14px]">MusicKit</span>
            <StatusDot status={musicReady ? 'connected' : 'disconnected'} label={musicReady ? 'Ready' : 'Not loaded'} />
          </div>

          {/* Authorization status */}
          <div className="flex items-center justify-between">
            <span className="text-text-secondary text-[14px]">Apple Music Account</span>
            <StatusDot status={musicAuthorized ? 'connected' : 'disconnected'} />
          </div>

          {/* Sign In / Sign Out button */}
          {musicAuthorized ? (
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                // MusicKit v3 doesn't have a proper sign-out — reload clears it
                setMusicAuthorized(false);
              }}
            >
              Sign Out
            </Button>
          ) : (
            <Button
              variant="primary"
              fullWidth
              icon={linkIcon}
              disabled={!musicReady || musicLoading}
              onClick={async () => {
                setMusicLoading(true);
                const ok = await authorize();
                setMusicAuthorized(ok);
                setMusicLoading(false);
              }}
            >
              {musicLoading ? 'Signing In...' : 'Sign In to Apple Music'}
            </Button>
          )}
        </div>
      </Card>

      </div>{/* end device setup grid */}

      {/* Banned Music */}
      <Card className="mb-5">
        <h2 className="text-[20px] font-bold text-text-primary mb-1">Banned Music</h2>
        <p className="text-text-muted text-[14px] mb-4">
          Block songs or artists from being queued or played
        </p>

        {/* Song / Artist toggle tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setBanTab('song')}
            className={`flex-1 h-[44px] rounded-xl text-[15px] font-semibold transition-colors ${
              banTab === 'song'
                ? 'bg-red-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Songs
          </button>
          <button
            onClick={() => setBanTab('artist')}
            className={`flex-1 h-[44px] rounded-xl text-[15px] font-semibold transition-colors ${
              banTab === 'artist'
                ? 'bg-red-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Artists
          </button>
        </div>

        {/* Add ban input — type to search, or enter manually */}
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            placeholder={banTab === 'song' ? 'Search or type song title...' : 'Search or type artist name...'}
            value={banInput}
            onChange={(e) => setBanInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addBan(); }}
            className="flex-1 h-[48px] bg-gray-800 border border-gray-700 rounded-xl px-4 text-text-primary text-[16px] placeholder:text-text-muted focus:outline-none focus:border-red-500"
          />
          <button
            onClick={addBan}
            disabled={banLoading || !banInput.trim()}
            className="h-[48px] px-5 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white rounded-xl text-[15px] font-semibold transition-colors shrink-0"
          >
            {banLoading ? '...' : 'Ban'}
          </button>
        </div>
        <p className="text-text-muted text-[12px] mb-4">Type a name and tap Ban — uses partial matching (e.g. "Taylor" blocks all Taylor Swift)</p>

        {/* Current bans list */}
        <div className="space-y-2">
          {banList
            .filter(b => b.ban_type === banTab)
            .map((ban) => (
              <div
                key={ban.id}
                className="flex items-center justify-between px-4 py-3 bg-gray-800 border border-red-900/50 rounded-xl"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-red-400 text-[15px] font-medium truncate">{ban.value}</p>
                  <p className="text-text-muted text-[12px]">
                    {ban.ban_type === 'song' ? 'Song' : 'Artist'}
                    {ban.added_by ? ` \u2022 added by ${ban.added_by}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => removeBan(ban.id)}
                  className="w-[36px] h-[36px] rounded-full bg-red-900/30 hover:bg-red-800/50 text-red-400 flex items-center justify-center transition-colors shrink-0 ml-3"
                  title="Remove ban"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          {banList.filter(b => b.ban_type === banTab).length === 0 && (
            <p className="text-text-muted text-[14px] text-center py-4">
              No banned {banTab === 'song' ? 'songs' : 'artists'} yet
            </p>
          )}
        </div>
      </Card>

      {/* Music Categories */}
      <Card className="mb-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-[20px] font-bold text-text-primary">Music Categories</h2>
            <p className="text-text-muted text-[14px] mt-1">Organize songs into categories for quick access</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setShowNewCatModal(true)}>
            + New
          </Button>
        </div>
        <div className="space-y-2">
          {musicCategories.map(cat => (
            <div key={cat.id}>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-700 hover:bg-surface-600 transition-colors">
                <span className="text-[24px]">{cat.icon}</span>
                <button
                  onClick={() => loadCategorySongs(cat.id)}
                  className="flex-1 text-left min-w-0"
                >
                  <p className="text-text-primary text-[16px] font-semibold">{cat.name}</p>
                  <p className="text-text-muted text-[13px]">
                    {cat.song_count || 0} song{cat.song_count !== 1 ? 's' : ''}
                  </p>
                </button>
                <button
                  onClick={() => deleteCategory(cat.id)}
                  className="w-[32px] h-[32px] rounded-full flex items-center justify-center text-text-muted hover:text-accent-red hover:bg-surface-600 transition-colors shrink-0"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>

              {/* Expanded category songs */}
              {expandedCategoryId === cat.id && (
                <div className="ml-4 mt-2 mb-2 p-3 bg-surface-800 rounded-xl border border-surface-600">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-text-secondary text-[14px] font-semibold">Songs in {cat.name}</span>
                    <Button size="sm" variant="secondary" onClick={() => { setShowCatSearch(true); setCatSearchQuery(''); setCatSearchResults([]); }}>
                      + Add Songs
                    </Button>
                  </div>
                  {catSongsLoading ? (
                    <p className="text-text-muted text-[14px] text-center py-4">Loading...</p>
                  ) : categorySongs.length === 0 ? (
                    <p className="text-text-muted text-[14px] text-center py-4">No songs yet</p>
                  ) : (
                    <div className="space-y-1 max-h-[250px] overflow-y-auto">
                      {categorySongs.map(song => (
                        <div key={song.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-700 transition-colors">
                          {song.artwork_url ? (
                            <img src={song.artwork_url} alt="" className="w-[36px] h-[36px] rounded-lg object-cover shrink-0" />
                          ) : (
                            <div className="w-[36px] h-[36px] rounded-lg bg-surface-600 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-text-primary text-[14px] font-semibold truncate">{song.title}</p>
                            <p className="text-text-secondary text-[12px] truncate">{song.artist}</p>
                          </div>
                          <button
                            onClick={() => removeSongFromCategory(cat.id, song.song_id)}
                            className="w-[28px] h-[28px] rounded-full flex items-center justify-center text-text-muted hover:text-accent-red transition-colors shrink-0"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Trivia Music */}
      <Card className="mb-5">
        <h2 className="text-[20px] font-bold text-text-primary mb-2">Trivia Music</h2>
        <p className="text-text-muted text-[14px] mb-4">Music that plays during trivia games by category</p>
        <div className="space-y-2">
          {['John Wick', 'NFC North', 'Classic Rock', '90s Rap', 'General Sports', 'Movies & TV', 'Food & Drink', 'Green Bay Packers', 'Minnesota Vikings', 'MN Gophers', 'General Knowledge'].map(key => (
            <div key={key} className="flex items-center justify-between p-3 rounded-xl bg-surface-700">
              <div>
                <p className="text-text-primary text-[15px] font-semibold">{key}</p>
                <p className="text-text-muted text-[12px]">
                  {gameMusicType === 'trivia' && gameMusicKey === key ? `${gameMusicSongs.length} songs` : 'Tap to configure'}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => loadGameMusic('trivia', key)}
              >
                {gameMusicType === 'trivia' && gameMusicKey === key ? 'Editing' : 'Assign Music'}
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {/* Scene Music */}
      <Card className="mb-5">
        <h2 className="text-[20px] font-bold text-text-primary mb-2">Scene Music</h2>
        <p className="text-text-muted text-[14px] mb-4">Music that plays when a scene is activated</p>
        <div className="space-y-2">
          {['Party Mode', 'Bar Mode', 'John Wick Mode', 'Family Movie Night'].map(scene => (
            <div key={scene} className="flex items-center justify-between p-3 rounded-xl bg-surface-700">
              <div>
                <p className="text-text-primary text-[15px] font-semibold">{scene}</p>
                <p className="text-text-muted text-[12px]">
                  {gameMusicType === 'scene' && gameMusicKey === scene ? `${gameMusicSongs.length} songs` : 'Tap to configure'}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => loadGameMusic('scene', scene)}
              >
                {gameMusicType === 'scene' && gameMusicKey === scene ? 'Editing' : 'Assign Music'}
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {/* Game/Scene Music Editor — shown when a game music config is being edited */}
      {gameMusicType && (
        <Card className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[18px] font-bold text-text-primary">
              {gameMusicKey || gameMusicType} Songs
            </h3>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setShowGameMusicSearch(true)}>
                + Add
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setGameMusicType(null); setGameMusicKey(null); }}>
                Done
              </Button>
            </div>
          </div>
          {gameMusicLoading ? (
            <p className="text-text-muted text-center py-4">Loading...</p>
          ) : gameMusicSongs.length === 0 ? (
            <p className="text-text-muted text-center py-4">No songs assigned yet</p>
          ) : (
            <div className="space-y-1 max-h-[300px] overflow-y-auto">
              {gameMusicSongs.map(song => (
                <div key={song.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-700 transition-colors">
                  {song.artwork_url ? (
                    <img src={song.artwork_url} alt="" className="w-[36px] h-[36px] rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-[36px] h-[36px] rounded-lg bg-surface-600 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-text-primary text-[14px] font-semibold truncate">{song.title}</p>
                    <p className="text-text-secondary text-[12px] truncate">{song.artist}</p>
                  </div>
                  <button
                    onClick={() => removeGameMusicSong(song.song_id)}
                    className="w-[28px] h-[28px] rounded-full flex items-center justify-center text-text-muted hover:text-accent-red transition-colors shrink-0"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Zone Mapping — which Hue groups belong to which room */}
      {hueAuthState === 'success' && hueGroups.length > 0 && (
        <Card className="mb-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[20px] font-bold text-text-primary">Room Zones</h2>
              <p className="text-text-muted text-[14px] mt-1">
                Assign your Hue rooms to zones so scenes know which lights to control
              </p>
            </div>
          </div>
          <div className="space-y-4">
            {ZONES.map((zone) => (
              <div key={zone.id}>
                <label className="block text-text-secondary text-[16px] font-medium mb-2">
                  {zone.label}
                  <span className="text-text-muted text-[13px] font-normal ml-2">{zone.description}</span>
                </label>
                <select
                  value={zoneMappings[zone.id] || ''}
                  onChange={(e) => {
                    setZoneMappings(prev => ({ ...prev, [zone.id]: e.target.value }));
                  }}
                  className="w-full h-[52px] bg-surface-700 border border-surface-500 rounded-xl px-4 text-text-primary text-[16px] appearance-none cursor-pointer"
                >
                  <option value="">— Not assigned —</option>
                  {hueGroups
                    .filter(g => g.type === 'Room' || g.type === 'LightGroup')
                    .map(g => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.lightCount} lights)
                      </option>
                    ))
                  }
                </select>
              </div>
            ))}
          </div>
          <Button
            variant="primary"
            fullWidth
            className="mt-5"
            disabled={zoneSaving}
            onClick={async () => {
              setZoneSaving(true);
              try {
                await api.put('/zones', zoneMappings);
              } catch { /* */ }
              setZoneSaving(false);
            }}
          >
            {zoneSaving ? 'Saving...' : 'Save Zone Mappings'}
          </Button>
        </Card>
      )}

      {/* Admin & Network — 2-col on wide */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">

      {/* Admin */}
      <Card>
        <h2 className="text-[20px] font-bold text-text-primary mb-4">Admin</h2>
        <Button variant="secondary" fullWidth icon={lockIcon} onClick={requestChangePin}>
          Change PIN
        </Button>
      </Card>

      {/* Network */}
      <Card>
        <h2 className="text-[20px] font-bold text-text-primary mb-4">
          Network
        </h2>
        <div className="space-y-3">
          <div>
            <label className="block text-text-muted text-[14px] mb-1">
              Server URL
            </label>
            <p className="text-text-primary text-[16px] font-mono bg-surface-700 rounded-lg px-3 py-2">
              {serverUrl}
            </p>
          </div>
          <Button variant="secondary" fullWidth icon={qrIcon} onClick={openQrModal}>
            Show QR Code for Phone Access
          </Button>
        </div>
      </Card>

      </div>{/* end admin/network grid */}

      {/* PIN Modal for Change PIN flow */}
      <Modal open={showPinModal} onClose={() => setShowPinModal(false)} size="sm">
        <PinPad
          title={pinTitle()}
          onSubmit={handlePinSubmit}
          onCancel={() => setShowPinModal(false)}
        />
        {pinError && (
          <p className="text-accent-red text-[14px] text-center mt-4">{pinError}</p>
        )}
      </Modal>

      {/* QR Code Modal (unlocked view) */}
      <Modal open={showQr} onClose={() => setShowQr(false)} title="Phone Access" size="sm">
        {qrData && (
          <div className="flex flex-col items-center gap-4 py-2">
            <img src={qrData.qr} alt="QR Code" className="w-[250px] h-[250px]" />
            <p className="text-text-secondary text-[14px] font-mono text-center break-all px-2">
              {qrData.url}
            </p>
          </div>
        )}
      </Modal>

      {/* New Category Modal */}
      <Modal open={showNewCatModal} onClose={() => setShowNewCatModal(false)} title="New Category" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-text-secondary text-[14px] mb-2">Name</label>
            <input
              type="text"
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              placeholder="e.g. House Music"
              autoFocus
              className="w-full h-[48px] px-4 text-[16px] bg-surface-700 text-text-primary rounded-xl border border-surface-500 focus:border-accent-blue focus:outline-none placeholder:text-text-muted"
              onKeyDown={e => { if (e.key === 'Enter') createCategory(); }}
            />
          </div>
          <div>
            <label className="block text-text-secondary text-[14px] mb-2">Icon (emoji)</label>
            <input
              type="text"
              value={newCatIcon}
              onChange={e => setNewCatIcon(e.target.value)}
              placeholder={'\uD83C\uDFB6'}
              className="w-full h-[48px] px-4 text-[20px] bg-surface-700 text-text-primary rounded-xl border border-surface-500 focus:border-accent-blue focus:outline-none placeholder:text-text-muted"
            />
          </div>
          <Button fullWidth onClick={createCategory} disabled={!newCatName.trim()}>
            Create Category
          </Button>
        </div>
      </Modal>

      {/* Category Song Search Modal */}
      <Modal
        open={showCatSearch}
        onClose={() => { setShowCatSearch(false); setCatSearchQuery(''); setCatSearchResults([]); }}
        title={expandedCategoryId ? 'Add Songs to Category' : 'Search Songs'}
        size="lg"
      >
        <input
          type="text"
          placeholder="Search songs, artists..."
          value={catSearchQuery}
          onChange={e => handleCatSearchInput(e.target.value)}
          autoFocus
          className="w-full h-[48px] bg-surface-700 border border-surface-500 rounded-xl px-4 text-text-primary text-[16px] placeholder:text-text-muted mb-4 focus:outline-none focus:border-accent-pink"
        />
        <div className="max-h-[350px] overflow-y-auto space-y-1">
          {catSearchLoading && <p className="text-text-muted text-center py-6">Searching...</p>}
          {!catSearchLoading && catSearchQuery && catSearchResults.length === 0 && (
            <p className="text-text-muted text-center py-6">No results</p>
          )}
          {!catSearchLoading && catSearchResults.map((song: any) => (
            <button
              key={song.id}
              onClick={() => expandedCategoryId && addSongToCategory(expandedCategoryId, song)}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface-600 transition-colors text-left"
            >
              {song.artworkUrl ? (
                <img src={song.artworkUrl} alt="" className="w-[40px] h-[40px] rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-[40px] h-[40px] rounded-lg bg-surface-600 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-text-primary text-[14px] font-semibold truncate">{song.title}</p>
                <p className="text-text-secondary text-[12px] truncate">{song.artist}</p>
              </div>
              <span className="text-accent-blue shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              </span>
            </button>
          ))}
        </div>
      </Modal>

      {/* Game Music Search Modal */}
      <Modal
        open={showGameMusicSearch}
        onClose={() => { setShowGameMusicSearch(false); setCatSearchQuery(''); setCatSearchResults([]); }}
        title={`Add Songs to ${gameMusicKey || gameMusicType || ''}`}
        size="lg"
      >
        <input
          type="text"
          placeholder="Search songs, artists..."
          value={catSearchQuery}
          onChange={e => handleCatSearchInput(e.target.value)}
          autoFocus
          className="w-full h-[48px] bg-surface-700 border border-surface-500 rounded-xl px-4 text-text-primary text-[16px] placeholder:text-text-muted mb-4 focus:outline-none focus:border-accent-pink"
        />
        <div className="max-h-[350px] overflow-y-auto space-y-1">
          {catSearchLoading && <p className="text-text-muted text-center py-6">Searching...</p>}
          {!catSearchLoading && catSearchQuery && catSearchResults.length === 0 && (
            <p className="text-text-muted text-center py-6">No results</p>
          )}
          {!catSearchLoading && catSearchResults.map((song: any) => (
            <button
              key={song.id}
              onClick={() => addGameMusicSong(song)}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface-600 transition-colors text-left"
            >
              {song.artworkUrl ? (
                <img src={song.artworkUrl} alt="" className="w-[40px] h-[40px] rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-[40px] h-[40px] rounded-lg bg-surface-600 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-text-primary text-[14px] font-semibold truncate">{song.title}</p>
                <p className="text-text-secondary text-[12px] truncate">{song.artist}</p>
              </div>
              <span className="text-accent-blue shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              </span>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
