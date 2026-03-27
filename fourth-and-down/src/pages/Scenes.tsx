import { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Toggle } from '../components/ui/Toggle';
import { Slider } from '../components/ui/Slider';
import { api } from '../lib/api';
import { useSocket } from '../lib/socket';
import { pushOverride, popOverride, type QueueSong } from '../lib/music';

/* ---- Icons ---- */

const filmIcon = (
  <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="2" />
    <path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5" />
  </svg>
);

const skullIcon = (
  <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="10" r="8" />
    <circle cx="9" cy="9" r="1.5" fill="currentColor" />
    <circle cx="15" cy="9" r="1.5" fill="currentColor" />
    <path d="M9 18v4M12 18v4M15 18v4" />
    <path d="M8 14c1.3 1 2.5 1.5 4 1.5s2.7-.5 4-1.5" />
  </svg>
);

const musicIcon = (
  <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

const cocktailIcon = (
  <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 2h8l-4 9z" />
    <path d="M12 11v8" />
    <path d="M8 22h8" />
    <circle cx="16" cy="5" r="1" fill="currentColor" />
  </svg>
);

const stopIcon = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <rect x="4" y="4" width="16" height="16" rx="2" />
  </svg>
);

const plusIcon = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

/* ---- Scene definitions ---- */

interface SceneDef {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  icon: React.ReactNode;
  gradient: string;
  glowColor: string;
}

const builtInScenes: SceneDef[] = [
  {
    id: 'movie-night',
    name: 'Family Movie Night',
    subtitle: 'Dim lights, warm tones, volume preset',
    description: 'Dims all lights to 15%, sets warm white, receiver to Apple TV input at volume 35',
    icon: filmIcon,
    gradient: 'from-accent-blue/30 to-accent-blue/10',
    glowColor: '#3b82f6',
  },
  {
    id: 'john-wick',
    name: 'John Wick Mode',
    subtitle: 'Blood red everything. No mercy.',
    description: 'All lights deep red, Nanoleaf flame effect, receiver bass boost, volume 50',
    icon: skullIcon,
    gradient: 'from-accent-red/40 to-red-900/20',
    glowColor: '#ef4444',
  },
  {
    id: 'party',
    name: 'Party Mode',
    subtitle: 'Color cycle, bass boost, full send',
    description: 'Rainbow cycle on Hue, Nanoleaf rhythm mode, receiver party EQ, volume 60',
    icon: musicIcon,
    gradient: 'from-accent-purple/30 via-accent-pink/20 to-accent-purple/10',
    glowColor: '#8b5cf6',
  },
  {
    id: 'bar',
    name: 'Bar Mode',
    subtitle: 'Warm amber glow, chill vibes',
    description: 'Amber lights at 40%, Nanoleaf warm glow, receiver at volume 25 with jazz EQ',
    icon: cocktailIcon,
    gradient: 'from-accent-amber/30 to-accent-orange/10',
    glowColor: '#f59e0b',
  },
];

interface ZoneConfig {
  zoneId: string;
  zoneName: string;
  brightness: number;
  color: string;
}

interface NanoleafConfig {
  available: boolean;
  on: boolean;
  effect: string;
  effects: string[];
}

interface OnkyoConfig {
  available: boolean;
  on: boolean;
  input: string;
  volume: number;
}

interface CustomScene {
  id: number;
  name: string;
}

const ONKYO_INPUTS = [
  { id: 'appletv', name: 'Apple TV' },
  { id: 'bluetooth', name: 'Bluetooth' },
  { id: 'game', name: 'Game' },
  { id: 'tv', name: 'TV' },
  { id: 'pc', name: 'PC' },
];

const COLOR_SWATCHES = ['#ffffff','#ff8c00','#ff4444','#ff00ff','#8b5cf6','#3b82f6','#06b6d4','#22c55e','#f59e0b'];

export function Scenes() {
  const [activeScene, setActiveScene] = useState<string | null>(null);
  const [activating, setActivating] = useState<string | null>(null);

  // Create scene modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [sceneName, setSceneName] = useState('');
  const [zoneConfigs, setZoneConfigs] = useState<ZoneConfig[]>([]);
  const [nanoleafConfig, setNanoleafConfig] = useState<NanoleafConfig>({ available: false, on: false, effect: '', effects: [] });
  const [onkyoConfig, setOnkyoConfig] = useState<OnkyoConfig>({ available: false, on: false, input: 'appletv', volume: 30 });
  const [customScenes, setCustomScenes] = useState<CustomScene[]>([]);
  const [savingScene, setSavingScene] = useState(false);

  const openCreateModal = async () => {
    setSceneName('');
    setSavingScene(false);
    setZoneConfigs([]);
    setNanoleafConfig({ available: false, on: false, effect: '', effects: [] });
    setOnkyoConfig({ available: false, on: false, input: 'appletv', volume: 30 });

    // Open modal immediately — load data in background
    setShowCreateModal(true);

    // Fetch zones (non-blocking)
    api.get<Record<string, string>>('/zones').then(async (zoneMappings) => {
      try {
        const groups = await api.get<Array<{ id: string; name: string }>>('/hue/groups');
        const groupMap = new Map(groups.map(g => [g.id, g.name]));
        const configs: ZoneConfig[] = [];
        for (const [zoneId, groupId] of Object.entries(zoneMappings)) {
          if (groupId) {
            configs.push({ zoneId, zoneName: groupMap.get(groupId) || zoneId, brightness: 100, color: '#ffffff' });
          }
        }
        setZoneConfigs(configs);
      } catch { setZoneConfigs([]); }
    }).catch(() => setZoneConfigs([]));

    // Check nanoleaf (non-blocking)
    api.get<{ on: boolean; brightness: number }>('/nanoleaf/info').then(async (info) => {
      if (info) {
        const effects = await api.get<string[]>('/nanoleaf/effects').catch(() => [] as string[]);
        setNanoleafConfig({ available: true, on: false, effect: effects[0] || '', effects });
      }
    }).catch(() => {});

    // Check onkyo (non-blocking)
    api.get<Array<{ device_type: string }>>('/devices').then((devices) => {
      const hasOnkyo = devices.some(d => d.device_type === 'onkyo');
      setOnkyoConfig({ available: hasOnkyo, on: false, input: 'appletv', volume: 30 });
    }).catch(() => {});
  };

  const saveScene = async () => {
    if (!sceneName.trim()) return;
    setSavingScene(true);
    try {
      const config: Record<string, any> = {};
      // Zones
      for (const z of zoneConfigs) {
        config[z.zoneId] = { brightness: z.brightness, color: z.color };
      }
      // Nanoleaf
      if (nanoleafConfig.available) {
        config.nanoleaf = { on: nanoleafConfig.on, effect: nanoleafConfig.effect };
      }
      // Onkyo
      if (onkyoConfig.available) {
        config.onkyo = { on: onkyoConfig.on, input: onkyoConfig.input, volume: onkyoConfig.volume };
      }
      const result = await api.post<{ id: number; name: string }>('/scenes', { name: sceneName.trim(), config });
      setCustomScenes(prev => [...prev, { id: result.id, name: result.name }]);
      setShowCreateModal(false);
    } catch { /* noop */ }
    setSavingScene(false);
  };

  // Fetch custom scenes on mount
  useEffect(() => {
    api.get<CustomScene[]>('/scenes')
      .then(scenes => { if (Array.isArray(scenes)) setCustomScenes(scenes); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    api
      .get<{ activeScene: string | null }>('/scenes/active')
      .then((data) => setActiveScene(data.activeScene))
      .catch(() => {});
  }, []);

  useSocket<{ sceneId: string | null }>('scene-changed', (data) => {
    setActiveScene(data.sceneId);
  });

  const activateScene = async (sceneId: string) => {
    setActivating(sceneId);
    try {
      const scene = builtInScenes.find(s => s.id === sceneId);
      const sceneName = scene?.name || sceneId;
      await api.post('/scenes/activate-full', { name: sceneName });
      setActiveScene(sceneId);

      // Load and play scene music if configured
      try {
        const songs = await api.get<Array<{ song_id: string; title: string; artist: string; artwork_url: string }>>(`/music/game/scene?categoryKey=${encodeURIComponent(sceneName)}`);
        if (songs.length > 0) {
          const queueSongs: QueueSong[] = songs.map(s => ({
            songId: s.song_id,
            title: s.title,
            artist: s.artist || '',
            artworkUrl: s.artwork_url || '',
          }));
          pushOverride(queueSongs, true);
        }
      } catch { /* no music configured */ }
    } catch {
      // TODO: toast
    } finally {
      setActivating(null);
    }
  };

  const stopScene = async () => {
    try {
      await api.post('/scenes/stop');
      setActiveScene(null);
      popOverride(); // Stop scene music, resume regular queue
    } catch {
      // TODO: toast
    }
  };

  return (
    <div className="p-5 pb-2 animate-fade-in">
      <h1 className="text-[28px] font-bold text-text-primary mb-5">Scenes</h1>

      {/* Active scene banner */}
      {activeScene && (
        <div className="mb-5">
          <Button
            variant="danger"
            fullWidth
            icon={stopIcon}
            onClick={stopScene}
          >
            Stop Active Scene
          </Button>
        </div>
      )}

      {/* Built-in scenes — 2-col grid on landscape/wide, stacked on narrow */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        {builtInScenes.map((scene) => {
          const isActive = activeScene === scene.id;
          return (
            <Card
              key={scene.id}
              padding="none"
              glow={isActive ? scene.glowColor : undefined}
              onClick={() => activateScene(scene.id)}
              className={`bg-gradient-to-br ${scene.gradient} overflow-hidden relative ${
                scene.id === 'john-wick' ? 'border-accent-red/40' : ''
              }`}
            >
              <div className="p-5 flex items-start gap-5">
                <span
                  className={`text-text-primary opacity-60 shrink-0 ${
                    activating === scene.id ? 'animate-pulse' : ''
                  }`}
                >
                  {scene.icon}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[20px] font-bold text-text-primary">
                      {scene.name}
                    </h3>
                    {isActive && (
                      <span className="text-[12px] font-semibold bg-accent-green/20 text-accent-green px-2 py-0.5 rounded-full">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <p className="text-[14px] text-text-secondary mt-1">
                    {scene.subtitle}
                  </p>
                  <p className="text-[13px] text-text-muted mt-2 leading-relaxed">
                    {scene.description}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Custom scenes */}
      <h2 className="text-[22px] font-bold text-text-primary mb-4">
        Custom Scenes
      </h2>
      {customScenes.length === 0 ? (
        <Card className="flex items-center justify-center h-[100px] mb-4">
          <p className="text-text-muted text-[16px]">
            No custom scenes yet
          </p>
        </Card>
      ) : (
        <div className="space-y-3 mb-4">
          {customScenes.map(scene => (
            <Card
              key={scene.id}
              onClick={() => {
                setActivating(scene.name);
                api.post('/scenes/activate-full', { name: scene.name })
                  .then(() => setActiveScene(scene.name))
                  .catch(() => {})
                  .finally(() => setActivating(null));
              }}
              className="cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-[18px] font-bold text-text-primary">{scene.name}</h3>
                {activeScene === scene.name && (
                  <span className="text-[12px] font-semibold bg-accent-green/20 text-accent-green px-2 py-0.5 rounded-full">ACTIVE</span>
                )}
                {activating === scene.name && (
                  <span className="text-text-muted text-[14px] animate-pulse">Activating...</span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Button variant="secondary" fullWidth icon={plusIcon} onClick={openCreateModal}>
        Create Scene
      </Button>

      {/* Create Scene Modal */}
      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create Scene" size="lg">
        <div className="space-y-5">
          {/* Scene name */}
          <div>
            <label className="block text-text-secondary text-[14px] font-semibold mb-2">Scene Name</label>
            <input
              type="text"
              value={sceneName}
              onChange={(e) => setSceneName(e.target.value)}
              placeholder="e.g. Poker Night"
              className="w-full h-[48px] bg-surface-700 border border-surface-500 rounded-xl px-4 text-text-primary text-[16px] placeholder:text-text-muted"
            />
          </div>

          {/* Zone configs */}
          {zoneConfigs.length > 0 && (
            <div>
              <label className="block text-text-secondary text-[14px] font-semibold mb-3">Light Zones</label>
              <div className="space-y-4">
                {zoneConfigs.map((zone, i) => (
                  <div key={zone.zoneId} className="bg-surface-700 rounded-xl p-4 space-y-3">
                    <h4 className="text-[15px] font-bold text-text-primary">{zone.zoneName}</h4>
                    <Slider
                      value={zone.brightness}
                      onChange={(v) => {
                        setZoneConfigs(prev => prev.map((z, idx) => idx === i ? { ...z, brightness: v } : z));
                      }}
                      label="Brightness"
                      color="#3b82f6"
                    />
                    <div className="flex gap-2 flex-wrap">
                      {COLOR_SWATCHES.map(c => (
                        <button
                          key={c}
                          onClick={() => {
                            setZoneConfigs(prev => prev.map((z, idx) => idx === i ? { ...z, color: c } : z));
                          }}
                          className={`w-[30px] h-[30px] rounded-full border-2 active:scale-90 transition-transform ${
                            zone.color === c ? 'border-white' : 'border-surface-500'
                          }`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Nanoleaf */}
          {nanoleafConfig.available && (
            <div className="bg-surface-700 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-[15px] font-bold text-text-primary">Nanoleaf</h4>
                <Toggle
                  checked={nanoleafConfig.on}
                  onChange={(on) => setNanoleafConfig(prev => ({ ...prev, on }))}
                  size="md"
                />
              </div>
              {nanoleafConfig.on && nanoleafConfig.effects.length > 0 && (
                <select
                  value={nanoleafConfig.effect}
                  onChange={(e) => setNanoleafConfig(prev => ({ ...prev, effect: e.target.value }))}
                  className="w-full h-[44px] bg-surface-600 border border-surface-500 rounded-xl px-4 text-text-primary text-[15px] appearance-none"
                >
                  {nanoleafConfig.effects.map(fx => (
                    <option key={fx} value={fx}>{fx}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Onkyo */}
          {onkyoConfig.available && (
            <div className="bg-surface-700 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-[15px] font-bold text-text-primary">Receiver</h4>
                <Toggle
                  checked={onkyoConfig.on}
                  onChange={(on) => setOnkyoConfig(prev => ({ ...prev, on }))}
                  size="md"
                />
              </div>
              {onkyoConfig.on && (
                <>
                  <div>
                    <span className="text-[13px] text-text-secondary block mb-2">Input</span>
                    <div className="flex flex-wrap gap-2">
                      {ONKYO_INPUTS.map(inp => (
                        <button
                          key={inp.id}
                          onClick={() => setOnkyoConfig(prev => ({ ...prev, input: inp.id }))}
                          className={[
                            'px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all',
                            onkyoConfig.input === inp.id
                              ? 'bg-accent-blue/20 border border-accent-blue text-accent-blue'
                              : 'bg-surface-600 border border-transparent text-text-secondary',
                          ].join(' ')}
                        >
                          {inp.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-text-secondary">Volume</span>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setOnkyoConfig(prev => ({ ...prev, volume: Math.max(0, prev.volume - 2) }))}
                        className="w-[36px] h-[36px] rounded-lg bg-surface-600 flex items-center justify-center text-text-primary text-[18px] font-bold active:scale-95"
                      >−</button>
                      <span className="text-[20px] font-black tabular-nums text-text-primary w-[36px] text-center">{onkyoConfig.volume}</span>
                      <button
                        onClick={() => setOnkyoConfig(prev => ({ ...prev, volume: Math.min(80, prev.volume + 2) }))}
                        className="w-[36px] h-[36px] rounded-lg bg-surface-600 flex items-center justify-center text-text-primary text-[18px] font-bold active:scale-95"
                      >+</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Save */}
          <Button
            variant="primary"
            fullWidth
            size="lg"
            disabled={!sceneName.trim() || savingScene}
            onClick={saveScene}
          >
            {savingScene ? 'Saving...' : 'Save Scene'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
