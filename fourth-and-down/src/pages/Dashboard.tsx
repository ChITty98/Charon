import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { api } from '../lib/api';
import { useSocket } from '../lib/socket';

/* ---- Scene tile data ---- */

interface SceneTile {
  id: string;
  name: string;
  subtitle: string;
  icon: React.ReactNode;
  color: string;       // tailwind bg class or gradient
  glowColor: string;   // hex for Card glow
}

const filmIcon = (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="2" />
    <path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5" />
  </svg>
);

const skullIcon = (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="10" r="8" />
    <circle cx="9" cy="9" r="1.5" fill="currentColor" />
    <circle cx="15" cy="9" r="1.5" fill="currentColor" />
    <path d="M9 18v4M12 18v4M15 18v4" />
    <path d="M8 14c1.3 1 2.5 1.5 4 1.5s2.7-.5 4-1.5" />
  </svg>
);

const musicIcon = (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

const cocktailIcon = (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 2h8l-4 9z" />
    <path d="M12 11v8" />
    <path d="M8 22h8" />
    <circle cx="16" cy="5" r="1" fill="currentColor" />
  </svg>
);

const qrIcon = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="8" height="8" rx="1" />
    <rect x="14" y="2" width="8" height="8" rx="1" />
    <rect x="2" y="14" width="8" height="8" rx="1" />
    <rect x="14" y="14" width="4" height="4" />
    <path d="M22 14h-4v4" />
    <path d="M18 22h4v-4" />
  </svg>
);

const scenes: SceneTile[] = [
  {
    id: 'movie-night',
    name: 'Family Movie Night',
    subtitle: 'Dim lights, warm tones, volume preset',
    icon: filmIcon,
    color: 'from-accent-blue/30 to-accent-blue/10',
    glowColor: '#3b82f6',
  },
  {
    id: 'john-wick',
    name: 'John Wick Mode',
    subtitle: 'Blood red everything. No mercy.',
    icon: skullIcon,
    color: 'from-accent-red/40 to-accent-red/10',
    glowColor: '#ef4444',
  },
  {
    id: 'party',
    name: 'Party Mode',
    subtitle: 'Color cycle, bass boost, full send',
    icon: musicIcon,
    color: 'from-accent-purple/30 via-accent-pink/20 to-accent-purple/10',
    glowColor: '#8b5cf6',
  },
  {
    id: 'bar',
    name: 'Bar Mode',
    subtitle: 'Warm amber glow, chill vibes',
    icon: cocktailIcon,
    color: 'from-accent-amber/30 to-accent-orange/10',
    glowColor: '#f59e0b',
  },
];

interface SessionPlayer {
  id: number;
  name: string;
  color: string;
}

interface DrinkCounts {
  [playerId: number]: {
    rocks_glass: number;
    beer: number;
    pellegrino: number;
    total: number;
  };
}

export function Dashboard() {
  const navigate = useNavigate();
  const [activating, setActivating] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [crewPlayers, setCrewPlayers] = useState<SessionPlayer[]>([]);
  const [version, setVersion] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [qrData, setQrData] = useState<{ url: string; qr: string } | null>(null);
  const [sessionDrinks, setSessionDrinks] = useState<DrinkCounts>({});

  const openQrModal = async () => {
    try {
      const data = await api.get<{ url: string; qr: string }>('/qr');
      setQrData(data);
      setShowQr(true);
    } catch { /* noop */ }
  };

  useEffect(() => {
    api.get<{ version?: string }>('/health').then(h => { if (h.version) setVersion(h.version); }).catch(() => {});
    api.get<any>('/sessions/current').then((session) => {
      if (session) {
        setHasSession(true);
        api.get<SessionPlayer[]>('/sessions/current/players').then(setCrewPlayers).catch(() => {});
        api.get<DrinkCounts>('/drinks/session').then(d => setSessionDrinks(d ?? {})).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  // Live drink updates
  const fetchDrinks = () => {
    if (hasSession) {
      api.get<DrinkCounts>('/drinks/session').then(d => setSessionDrinks(d ?? {})).catch(() => {});
    }
  };
  useSocket('drink:update', fetchDrinks);

  const activateScene = async (sceneId: string) => {
    setActivating(sceneId);
    try {
      // Find the scene display name — that's what the DB stores
      const scene = scenes.find(s => s.id === sceneId);
      const result = await api.post<{ ok: boolean; music?: Array<{ song_id: string; title: string; artist: string; artwork_url: string }> }>('/scenes/activate-full', { name: scene?.name || sceneId });
      // Trigger scene music if configured
      if (result.music && result.music.length > 0) {
        const { pushOverride } = await import('../lib/music');
        const songs = result.music.map((s: any) => ({
          songId: s.song_id,
          title: s.title,
          artist: s.artist || '',
          artworkUrl: s.artwork_url || '',
        }));
        pushOverride(songs, true); // loop scene music
      }
    } catch {
      // TODO: toast error
    } finally {
      setActivating(null);
    }
  };

  return (
    <div className="p-5 pb-2 animate-fade-in">
      {/* Title */}
      <h1 className="text-[36px] font-black tracking-tight text-text-primary mb-1">
        CHARON
      </h1>
      <p className="text-text-muted text-[16px] mb-6">
        Setting the Mood{version && <span className="text-text-muted/50 ml-2">v{version}</span>}
      </p>

      {/* Scene grid */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        {scenes.map((scene) => (
          <Card
            key={scene.id}
            padding="none"
            onClick={() => activateScene(scene.id)}
            className={`h-[180px] bg-gradient-to-br ${scene.color} overflow-hidden relative ${
              scene.id === 'john-wick' ? 'border-accent-red/40' : ''
            }`}
          >
            <div className="p-5 h-full flex flex-col justify-between relative z-10">
              <span className={`text-text-primary opacity-70 ${
                activating === scene.id ? 'animate-pulse' : ''
              }`}>
                {scene.icon}
              </span>
              <div>
                <h3 className="text-[18px] font-bold text-text-primary leading-tight">
                  {scene.name}
                </h3>
                <p className="text-[13px] text-text-secondary mt-1 leading-snug">
                  {scene.subtitle}
                </p>
              </div>
            </div>
            {/* Extra dramatic backdrop for John Wick */}
            {scene.id === 'john-wick' && (
              <div className="absolute inset-0 bg-gradient-to-t from-red-900/30 to-transparent pointer-events-none" />
            )}
          </Card>
        ))}
      </div>

      {/* Share QR Code */}
      <div className="flex justify-center mb-6">
        <Button
          variant="ghost"
          size="sm"
          icon={qrIcon}
          onClick={openQrModal}
        >
          Share QR Code
        </Button>
      </div>

      {/* Tonight's Crew */}
      <div className="mb-6">
        <h2 className="text-[20px] font-bold text-text-primary mb-3">
          Tonight's Crew
        </h2>
        {hasSession && crewPlayers.length > 0 ? (
          <Card onClick={() => navigate('/players')} className="cursor-pointer">
            <div className="flex items-center gap-3 flex-wrap">
              {crewPlayers.map(p => (
                <div key={p.id} className="flex items-center gap-2">
                  <div
                    className="w-[40px] h-[40px] rounded-full flex items-center justify-center text-[18px] font-bold text-white"
                    style={{ backgroundColor: p.color }}
                  >
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-text-primary text-[16px] font-medium">{p.name}</span>
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <Card onClick={() => navigate('/players')} className="flex items-center justify-center h-[80px] cursor-pointer">
            <p className="text-text-muted text-[16px]">
              {hasSession ? 'Tap to add players' : 'Tap to start a session'}
            </p>
          </Card>
        )}
      </div>

      {/* Tonight's Drinks — only shown during active session with drinks */}
      {hasSession && Object.values(sessionDrinks).some(d => d.total > 0) && (
        <div className="mb-6">
          <h2 className="text-[20px] font-bold text-text-primary mb-3">
            Tonight's Drinks
          </h2>
          <Card>
            <div className="space-y-3">
              {crewPlayers.map(p => {
                const d = sessionDrinks[p.id];
                if (!d || d.total === 0) return null;
                return (
                  <div key={p.id} className="flex items-center justify-between">
                    <span className="text-[16px] font-semibold" style={{ color: p.color }}>
                      {p.name}
                    </span>
                    <div className="flex items-center gap-2 text-[14px]">
                      {d.rocks_glass > 0 && <span>{'\uD83E\uDD43'}{d.rocks_glass}</span>}
                      {d.beer > 0 && <span>{'\uD83C\uDF7A'}{d.beer}</span>}
                      {d.pellegrino > 0 && <span>{'\uD83D\uDCA7'}{d.pellegrino}</span>}
                      <span className="text-text-muted ml-1">({d.total})</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* QR Code Modal */}
      <Modal open={showQr} onClose={() => setShowQr(false)} title="Share QR Code" size="sm">
        {qrData && (
          <div className="flex flex-col items-center gap-4 py-2">
            <img src={qrData.qr} alt="QR Code" className="w-[250px] h-[250px]" />
            <p className="text-text-secondary text-[14px] font-mono text-center break-all px-2">
              {qrData.url}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
