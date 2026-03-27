import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api';
import { useSocket } from '../lib/socket';

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

const DRINK_ICONS: { type: DrinkType; emoji: string }[] = [
  { type: 'rocks_glass', emoji: '\uD83E\uDD43' },  // rocks glass
  { type: 'beer', emoji: '\uD83C\uDF7A' },          // beer
  { type: 'pellegrino', emoji: '\uD83D\uDCA7' },    // water droplet
];

/* ---- Plus-one animation ---- */

function PlusOnePopup({ color }: { color: string }) {
  return (
    <span
      className="absolute -top-7 left-1/2 -translate-x-1/2 text-[13px] font-bold pointer-events-none animate-[float-up_600ms_ease-out_forwards] whitespace-nowrap z-20"
      style={{ color }}
    >
      +1
    </span>
  );
}

/* ---- Component ---- */

interface DrinkTrackerProps {
  layout?: 'horizontal' | 'vertical';
}

export function DrinkTracker({ layout = 'horizontal' }: DrinkTrackerProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [drinks, setDrinks] = useState<DrinkCounts>({});
  const [expandedPlayer, setExpandedPlayer] = useState<number | null>(null);
  const [popups, setPopups] = useState<{ id: number; playerId: number; type: DrinkType }[]>([]);
  const [cooldowns, setCooldowns] = useState<Set<string>>(new Set());
  const popupIdRef = useRef(0);

  const fetchData = useCallback(async () => {
    try {
      const currentSession = await api.get<Session | null>('/sessions/current');
      setSession(currentSession);

      if (currentSession) {
        const [sp, drinkData] = await Promise.all([
          api.get<SessionPlayer[]>('/sessions/current/players'),
          api.get<DrinkCounts>('/drinks/session'),
        ]);
        // Map session_players to Player shape
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

  const logDrink = async (playerId: number, drinkType: DrinkType) => {
    const cooldownKey = `${playerId}-${drinkType}`;
    if (cooldowns.has(cooldownKey)) return;

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

      // Cooldown: dim button for 2 seconds
      setCooldowns(prev => new Set(prev).add(cooldownKey));
      setTimeout(() => {
        setCooldowns(prev => {
          const next = new Set(prev);
          next.delete(cooldownKey);
          return next;
        });
      }, 2000);
    } catch { /* noop */ }
  };

  // Don't render if no active session or no players
  if (!session || players.length === 0) return null;

  const isVertical = layout === 'vertical';

  return (
    <>
      {/* Keyframe for float-up animation */}
      <style>{`
        @keyframes float-up {
          0% { opacity: 1; transform: translate(-50%, 0); }
          100% { opacity: 0; transform: translate(-50%, -18px); }
        }
      `}</style>

      <div className={
        isVertical
          ? 'h-full bg-surface-800 border-l border-surface-700 px-2 py-3 overflow-y-auto w-[72px]'
          : 'shrink-0 bg-surface-800 border-t border-surface-700 px-3 py-2'
      }>
        <div className={
          isVertical
            ? 'flex flex-col items-center gap-4'
            : 'flex items-center gap-3 overflow-x-auto'
        }>
          {players.map(player => {
            const playerDrinks = drinks[player.id] ?? { rocks_glass: 0, beer: 0, pellegrino: 0, total: 0 };
            const isExpanded = expandedPlayer === player.id;

            return (
              <div key={player.id} className="flex items-center gap-1.5 shrink-0">
                {/* Player circle -- tap to expand drink buttons */}
                <button
                  onClick={() => setExpandedPlayer(isExpanded ? null : player.id)}
                  className="relative w-[32px] h-[32px] rounded-full flex items-center justify-center text-[13px] font-bold text-white transition-transform active:scale-90 shrink-0"
                  style={{
                    backgroundColor: player.color,
                    boxShadow: isExpanded ? `0 0 10px ${player.color}80` : 'none',
                  }}
                >
                  {player.name.charAt(0).toUpperCase()}
                  {playerDrinks.total > 0 && (
                    <span className="absolute -top-1 -right-1 w-[16px] h-[16px] rounded-full bg-surface-600 border border-surface-500 text-[9px] text-text-primary font-bold flex items-center justify-center">
                      {playerDrinks.total}
                    </span>
                  )}
                </button>

                {/* Collapsed: show compact drink counts */}
                {!isExpanded && playerDrinks.total > 0 && (
                  <div className="flex items-center gap-1 text-[12px] leading-none">
                    {playerDrinks.rocks_glass > 0 && <span>{'\uD83E\uDD43'}{playerDrinks.rocks_glass}</span>}
                    {playerDrinks.beer > 0 && <span>{'\uD83C\uDF7A'}{playerDrinks.beer}</span>}
                    {playerDrinks.pellegrino > 0 && <span>{'\uD83D\uDCA7'}{playerDrinks.pellegrino}</span>}
                  </div>
                )}

                {/* Expanded: show tap targets only */}
                {isExpanded && (
                  <div className="flex gap-1">
                    {DRINK_ICONS.map(({ type, emoji }) => {
                      const cooldownKey = `${player.id}-${type}`;
                      const isCooling = cooldowns.has(cooldownKey);
                      return (
                        <button
                          key={type}
                          onClick={() => logDrink(player.id, type)}
                          disabled={isCooling}
                          className={`relative w-[48px] h-[40px] rounded-lg bg-surface-700 flex items-center justify-center text-[22px] transition-all active:scale-90 active:bg-surface-600 ${
                            isCooling ? 'opacity-40 pointer-events-none' : ''
                          }`}
                        >
                          {emoji}
                          {popups
                            .filter(p => p.playerId === player.id && p.type === type)
                            .map(p => (
                              <PlusOnePopup key={p.id} color={player.color} />
                            ))}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
