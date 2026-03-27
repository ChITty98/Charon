import { useState, useEffect, useCallback, useRef } from 'react';
import { Card } from '../components/ui/Card';
import { api } from '../lib/api';
import { useSocket } from '../lib/socket';
import { OldFashionedLab } from './OldFashionedLab';

/* ---- Types ---- */

interface Player {
  id: number;
  name: string;
  color: string;
}

interface SessionPlayer extends Player {
  player_id: number;
}

interface DrinkCounts {
  [playerId: number]: {
    rocks_glass: number;
    beer: number;
    pellegrino: number;
    total: number;
  };
}

interface Session {
  id: number;
}

type DrinkType = 'rocks_glass' | 'beer' | 'pellegrino';

const DRINK_TYPES: { type: DrinkType; emoji: string; label: string }[] = [
  { type: 'rocks_glass', emoji: '\uD83E\uDD43', label: 'Neat' },
  { type: 'beer', emoji: '\uD83C\uDF7A', label: 'Beer' },
  { type: 'pellegrino', emoji: '\uD83D\uDCA7', label: 'Water' },
];

const COOLDOWN_MS = 60_000; // 1 minute

/* ---- Plus-one animation ---- */

function PlusOnePopup({ color }: { color: string }) {
  return (
    <span
      className="absolute -top-6 left-1/2 -translate-x-1/2 text-[16px] font-black pointer-events-none animate-[float-up_600ms_ease-out_forwards] whitespace-nowrap z-20"
      style={{ color }}
    >
      +1
    </span>
  );
}

/* ---- Component ---- */

type Tab = 'tracking' | 'lab';

export function Drinks() {
  const [tab, setTab] = useState<Tab>('tracking');
  const [session, setSession] = useState<Session | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [drinks, setDrinks] = useState<DrinkCounts>({});
  const [popups, setPopups] = useState<{ id: number; playerId: number; type: DrinkType }[]>([]);
  const [cooldowns, setCooldowns] = useState<Map<string, number>>(new Map());
  const popupIdRef = useRef(0);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const currentSession = await api.get<Session | null>('/sessions/current');
      setSession(currentSession);

      if (currentSession) {
        const [sp, drinkData] = await Promise.all([
          api.get<SessionPlayer[]>('/sessions/current/players'),
          api.get<DrinkCounts>('/drinks/session'),
        ]);
        const activePlayers = sp
          .filter((p: any) => !p.left_at)
          .map((p: any) => ({
            id: p.player_id ?? p.id,
            name: p.name,
            color: p.color,
          }));
        setPlayers(activePlayers);
        setDrinks(drinkData ?? {});
      } else {
        setPlayers([]);
        setDrinks({});
      }
    } catch {
      // Server routes may not exist yet
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useSocket('session:update', fetchData);
  useSocket('drink:update', fetchData);

  // Tick cooldown timers every second
  useEffect(() => {
    cooldownTimerRef.current = setInterval(() => {
      setCooldowns(prev => {
        const now = Date.now();
        const next = new Map<string, number>();
        let changed = false;
        for (const [key, expiresAt] of prev) {
          if (expiresAt > now) {
            next.set(key, expiresAt);
          } else {
            changed = true;
          }
        }
        if (!changed && next.size === prev.size) return prev;
        return next;
      });
    }, 1000);
    return () => { if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current); };
  }, []);

  const logDrink = async (playerId: number, drinkType: DrinkType) => {
    const cooldownKey = `${playerId}-${drinkType}`;
    if (cooldowns.has(cooldownKey) && cooldowns.get(cooldownKey)! > Date.now()) return;

    try {
      await api.post('/drinks', { playerId, drinkType });

      // Optimistic update
      setDrinks(prev => {
        const playerDrinks = prev[playerId] ?? { rocks_glass: 0, beer: 0, pellegrino: 0, total: 0 };
        return {
          ...prev,
          [playerId]: {
            ...playerDrinks,
            [drinkType]: playerDrinks[drinkType] + 1,
            total: playerDrinks.total + 1,
          },
        };
      });

      // Show +1 popup
      const id = ++popupIdRef.current;
      setPopups(prev => [...prev, { id, playerId, type: drinkType }]);
      setTimeout(() => {
        setPopups(prev => prev.filter(p => p.id !== id));
      }, 700);

      // Cooldown
      setCooldowns(prev => {
        const next = new Map(prev);
        next.set(cooldownKey, Date.now() + COOLDOWN_MS);
        return next;
      });
    } catch { /* noop */ }
  };

  const getCooldownRemaining = (playerId: number, drinkType: DrinkType): number => {
    const key = `${playerId}-${drinkType}`;
    const expiresAt = cooldowns.get(key);
    if (!expiresAt) return 0;
    return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
  };

  // Sort players by total drinks (most first)
  const sortedPlayers = [...players].sort((a, b) => {
    const aTotal = drinks[a.id]?.total ?? 0;
    const bTotal = drinks[b.id]?.total ?? 0;
    return bTotal - aTotal;
  });

  // Session drink total
  const sessionTotal = Object.values(drinks).reduce((sum, d) => sum + d.total, 0);

  // No session state
  if (!session) {
    return (
      <div className="p-5 pb-2 animate-fade-in">
        <h1 className="text-[28px] font-bold text-text-primary mb-5">Drinks</h1>
        <Card className="flex items-center justify-center h-[120px]">
          <p className="text-text-muted text-[16px]">Start a session to track drinks</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-5 pb-2 animate-fade-in">
      {/* Keyframe for float-up animation */}
      <style>{`
        @keyframes float-up {
          0% { opacity: 1; transform: translate(-50%, 0); }
          100% { opacity: 0; transform: translate(-50%, -18px); }
        }
      `}</style>

      {/* Header with tabs */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-[28px] font-bold text-text-primary">Drinks</h1>
        {tab === 'tracking' && sessionTotal > 0 && (
          <span className="text-[18px] font-bold text-text-secondary">
            {sessionTotal} total
          </span>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setTab('tracking')}
          className={`flex-1 h-[40px] rounded-xl text-[15px] font-semibold transition-all ${
            tab === 'tracking'
              ? 'bg-blue-600 text-white'
              : 'bg-surface-700 text-text-secondary hover:bg-surface-600'
          }`}
        >
          🥃 Tracking
        </button>
        <button
          onClick={() => setTab('lab')}
          className={`flex-1 h-[40px] rounded-xl text-[15px] font-semibold transition-all ${
            tab === 'lab'
              ? 'bg-amber-600 text-white'
              : 'bg-surface-700 text-text-secondary hover:bg-surface-600'
          }`}
        >
          🧪 Drink Lab
        </button>
      </div>

      {/* Lab tab */}
      {tab === 'lab' && <OldFashionedLab />}

      {/* Tracking tab */}
      {tab === 'tracking' && <>

      {/* No players */}
      {players.length === 0 && (
        <Card className="flex items-center justify-center h-[120px]">
          <p className="text-text-muted text-[16px]">No players in session</p>
        </Card>
      )}

      {/* Player drink cards */}
      <div className="space-y-4">
        {sortedPlayers.map(player => {
          const playerDrinks = drinks[player.id] ?? { rocks_glass: 0, beer: 0, pellegrino: 0, total: 0 };

          return (
            <Card key={player.id} className="overflow-visible">
              {/* Player header */}
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-[44px] h-[44px] rounded-full flex items-center justify-center text-[20px] font-bold text-white shrink-0"
                  style={{ backgroundColor: player.color }}
                >
                  {player.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[18px] font-bold text-text-primary truncate">{player.name}</p>
                  {playerDrinks.total > 0 && (
                    <p className="text-[13px] text-text-muted">
                      {playerDrinks.rocks_glass > 0 && `${'\uD83E\uDD43'}${playerDrinks.rocks_glass} `}
                      {playerDrinks.beer > 0 && `${'\uD83C\uDF7A'}${playerDrinks.beer} `}
                      {playerDrinks.pellegrino > 0 && `${'\uD83D\uDCA7'}${playerDrinks.pellegrino}`}
                    </p>
                  )}
                </div>
                <div className="text-[24px] font-black text-text-secondary">
                  {playerDrinks.total}
                </div>
              </div>

              {/* Drink type buttons */}
              <div className="grid grid-cols-3 gap-3">
                {DRINK_TYPES.map(({ type, emoji, label }) => {
                  const remaining = getCooldownRemaining(player.id, type);
                  const isCooling = remaining > 0;

                  return (
                    <button
                      key={type}
                      onClick={() => logDrink(player.id, type)}
                      disabled={isCooling}
                      className={`relative h-[64px] rounded-xl flex flex-col items-center justify-center gap-1 transition-all
                        ${isCooling
                          ? 'bg-surface-700/50 opacity-50'
                          : 'bg-surface-700 hover:bg-surface-600 active:scale-95'
                        }`}
                      style={!isCooling ? { borderBottom: `3px solid ${player.color}40` } : undefined}
                    >
                      <span className="text-[24px] leading-none">{emoji}</span>
                      {isCooling ? (
                        <span className="text-[11px] text-text-muted font-mono">{remaining}s</span>
                      ) : (
                        <span className="text-[11px] text-text-muted font-medium">{label}</span>
                      )}
                      {popups
                        .filter(p => p.playerId === player.id && p.type === type)
                        .map(p => (
                          <PlusOnePopup key={p.id} color={player.color} />
                        ))}
                    </button>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
      </>}
    </div>
  );
}
