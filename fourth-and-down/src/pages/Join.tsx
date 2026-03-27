import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useSocket } from '../lib/socket';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

interface Player {
  id: number;
  name: string;
  color: string;
  player_id?: number;
}

interface DrinkCounts {
  rocks_glass: number;
  beer: number;
  pellegrino: number;
  total: number;
}

interface Session {
  id: number;
}

interface ActiveGame {
  type: string;
  status: string;
}

type DrinkType = 'rocks_glass' | 'beer' | 'pellegrino';

const DRINK_BUTTONS: { type: DrinkType; emoji: string; label: string }[] = [
  { type: 'rocks_glass', emoji: '\uD83E\uDD43', label: 'Neat' },
  { type: 'beer', emoji: '\uD83C\uDF7A', label: 'Beer' },
  { type: 'pellegrino', emoji: '\uD83D\uDCA7', label: 'Water' },
];

const GAME_BUTTONS = [
  { name: 'Trivia', route: '/trivia/play', emoji: '\uD83E\uDDE0', color: '#8b5cf6' },
  { name: 'Catch Phrase', route: '/catchphrase/play', emoji: '\uD83D\uDCAC', color: '#f97316' },
  { name: 'Blackjack', route: '/blackjack/play', emoji: '\uD83C\uDCCF', color: '#22c55e' },
];

const LS_KEY = 'charon_selectedPlayer';

/* ================================================================== */
/*  Player Selection Screen                                            */
/* ================================================================== */

function PlayerSelect({
  players,
  onSelect,
}: {
  players: Player[];
  onSelect: (p: Player) => void;
}) {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6">
      <h1 className="text-[32px] font-black text-white mb-2">CHARON</h1>
      <p className="text-gray-400 text-[18px] mb-8">Who are you?</p>

      {players.length === 0 ? (
        <div className="text-gray-500 text-[16px] text-center">
          <p>No active session found.</p>
          <p className="mt-2 text-[14px]">Ask the host to start a session and add players.</p>
        </div>
      ) : (
        <div className="w-full max-w-sm grid grid-cols-2 gap-4">
          {players.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelect(p)}
              className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-gray-800/80 border-2 border-gray-700 p-5 active:scale-[0.95] transition-transform"
            >
              {/* Avatar circle */}
              <div
                className="w-[64px] h-[64px] rounded-full flex items-center justify-center text-[28px] font-black text-white shadow-lg"
                style={{
                  backgroundColor: p.color,
                  boxShadow: `0 0 20px ${p.color}40`,
                }}
              >
                {p.name.charAt(0).toUpperCase()}
              </div>
              <span className="text-white text-[18px] font-bold">{p.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Cooldown Timer Display                                             */
/* ================================================================== */

function CooldownTimer({ seconds }: { seconds: number }) {
  return (
    <span className="text-[14px] font-medium text-gray-400">
      Wait {seconds}s
    </span>
  );
}

/* ================================================================== */
/*  Phone Hub (post-selection)                                         */
/* ================================================================== */

function PhoneHub({
  player,
  onChangePlayer,
}: {
  player: Player;
  onChangePlayer: () => void;
}) {
  const navigate = useNavigate();
  const [drinks, setDrinks] = useState<DrinkCounts>({ rocks_glass: 0, beer: 0, pellegrino: 0, total: 0 });
  const [cooldowns, setCooldowns] = useState<Record<DrinkType, number>>({
    rocks_glass: 0,
    beer: 0,
    pellegrino: 0,
  });
  const [activeGames, setActiveGames] = useState<ActiveGame[]>([]);
  const [popups, setPopups] = useState<{ id: number; type: DrinkType }[]>([]);
  const popupIdRef = useRef(0);
  const intervalsRef = useRef<Record<DrinkType, ReturnType<typeof setInterval> | null>>({
    rocks_glass: null,
    beer: null,
    pellegrino: null,
  });

  const fetchDrinks = useCallback(async () => {
    try {
      const data = await api.get<Record<number, DrinkCounts>>('/drinks/session');
      if (data && data[player.id]) {
        setDrinks(data[player.id]);
      }
    } catch { /* noop */ }
  }, [player.id]);

  const fetchGames = useCallback(async () => {
    try {
      const data = await api.get<ActiveGame[]>('/games/active');
      setActiveGames(Array.isArray(data) ? data : []);
    } catch {
      setActiveGames([]);
    }
  }, []);

  useEffect(() => {
    fetchDrinks();
    fetchGames();
  }, [fetchDrinks, fetchGames]);

  useSocket('drink:update', fetchDrinks);
  useSocket('session:update', fetchDrinks);
  useSocket('game:update', fetchGames);

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      Object.values(intervalsRef.current).forEach((iv) => {
        if (iv) clearInterval(iv);
      });
    };
  }, []);

  const startCooldown = (type: DrinkType) => {
    // Clear any existing interval for this type
    if (intervalsRef.current[type]) {
      clearInterval(intervalsRef.current[type]!);
    }

    setCooldowns((prev) => ({ ...prev, [type]: 60 }));

    const iv = setInterval(() => {
      setCooldowns((prev) => {
        const next = prev[type] - 1;
        if (next <= 0) {
          clearInterval(iv);
          intervalsRef.current[type] = null;
          return { ...prev, [type]: 0 };
        }
        return { ...prev, [type]: next };
      });
    }, 1000);

    intervalsRef.current[type] = iv;
  };

  const logDrink = async (type: DrinkType) => {
    if (cooldowns[type] > 0) return;

    try {
      await api.post('/drinks', { playerId: player.id, drinkType: type });

      // Optimistic update
      setDrinks((prev) => ({
        ...prev,
        [type]: (prev[type] || 0) + 1,
        total: (prev.total || 0) + 1,
      }));

      // Show +1 popup
      const id = ++popupIdRef.current;
      setPopups((prev) => [...prev, { id, type }]);
      setTimeout(() => {
        setPopups((prev) => prev.filter((p) => p.id !== id));
      }, 800);

      // Start 60s cooldown for this drink type
      startCooldown(type);
    } catch { /* noop */ }
  };

  const totalDrinks = (drinks.rocks_glass || 0) + (drinks.beer || 0) + (drinks.pellegrino || 0);

  const hasActiveGame = (gameType: string) => {
    return activeGames.some(
      (g) => g.type === gameType && (g.status === 'active' || g.status === 'playing')
    );
  };

  return (
    <div className="h-screen bg-gray-950 flex flex-col overflow-hidden">
      {/* Animations */}
      <style>{`
        @keyframes float-up {
          0% { opacity: 1; transform: translate(-50%, 0) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -30px) scale(1.3); }
        }
        @keyframes tap-pop {
          0% { transform: scale(1); }
          50% { transform: scale(0.9); }
          100% { transform: scale(1); }
        }
      `}</style>

      {/* Header */}
      <div className="shrink-0 px-5 pt-6 pb-4 flex items-center gap-4">
        <div
          className="w-[48px] h-[48px] rounded-full flex items-center justify-center text-[22px] font-black text-white shadow-lg"
          style={{
            backgroundColor: player.color,
            boxShadow: `0 0 16px ${player.color}50`,
          }}
        >
          {player.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
          <h1 className="text-[22px] font-bold text-white leading-tight">{player.name}</h1>
          <button
            onClick={onChangePlayer}
            className="text-gray-500 text-[14px] hover:text-gray-400 active:text-gray-300 transition-colors"
          >
            Not you?
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-6">

        {/* Drink Count Display */}
        <div className="rounded-2xl bg-gray-900 border border-gray-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-gray-400 text-[16px] font-medium">Drinks Tonight</span>
            <span
              className="text-[36px] font-black leading-none"
              style={{ color: player.color }}
            >
              {totalDrinks}
            </span>
          </div>

          {/* Per-type counts */}
          <div className="flex items-center gap-4 text-[14px] text-gray-400 mb-5">
            <span>{'\uD83E\uDD43'} {drinks.rocks_glass || 0}</span>
            <span>{'\uD83C\uDF7A'} {drinks.beer || 0}</span>
            <span>{'\uD83D\uDCA7'} {drinks.pellegrino || 0}</span>
          </div>

          {/* Big Drink Buttons */}
          <div className="grid grid-cols-3 gap-3">
            {DRINK_BUTTONS.map(({ type, emoji, label }) => {
              const onCooldown = cooldowns[type] > 0;
              const btnPopups = popups.filter((p) => p.type === type);

              return (
                <button
                  key={type}
                  onClick={() => logDrink(type)}
                  disabled={onCooldown}
                  className={[
                    'relative flex flex-col items-center justify-center rounded-2xl h-[80px] transition-all',
                    onCooldown
                      ? 'bg-gray-800/50 opacity-60'
                      : 'bg-gray-800 active:scale-[0.92] active:bg-gray-700',
                  ].join(' ')}
                  style={{
                    borderWidth: 2,
                    borderColor: onCooldown ? '#374151' : player.color + '40',
                    minHeight: 80,
                  }}
                >
                  <span className="text-[32px] leading-none">{emoji}</span>
                  {onCooldown ? (
                    <CooldownTimer seconds={cooldowns[type]} />
                  ) : (
                    <span className="text-[14px] font-semibold text-gray-300 mt-1">{label}</span>
                  )}

                  {/* +1 popup */}
                  {btnPopups.map((p) => (
                    <span
                      key={p.id}
                      className="absolute -top-4 left-1/2 text-[18px] font-black pointer-events-none whitespace-nowrap z-20"
                      style={{
                        color: player.color,
                        animation: 'float-up 800ms ease-out forwards',
                      }}
                    >
                      +1
                    </span>
                  ))}
                </button>
              );
            })}
          </div>
        </div>

        {/* Drink Lab Button */}
        <button
          onClick={() => navigate('/join/drinks')}
          className="w-full h-[64px] rounded-2xl bg-gradient-to-r from-amber-600 to-orange-600 flex items-center justify-center gap-3 text-[20px] font-bold text-white active:scale-[0.96] transition-transform shadow-lg"
          style={{ boxShadow: '0 4px 20px rgba(245, 158, 11, 0.25)' }}
        >
          <span className="text-[28px]">{'\uD83C\uDF78'}</span>
          Drink Lab
        </button>

        {/* Game Buttons */}
        <div className="space-y-3">
          <h2 className="text-gray-500 text-[14px] font-semibold uppercase tracking-wider">Games</h2>
          {GAME_BUTTONS.map((g) => {
            // Games are always shown but only enabled when a game of that type is active
            // For now, always enable them since users navigate to game pages
            return (
              <button
                key={g.route}
                onClick={() => navigate(g.route)}
                className="w-full h-[64px] rounded-2xl flex items-center justify-center gap-3 text-[20px] font-bold text-white active:scale-[0.96] transition-transform"
                style={{ backgroundColor: g.color }}
              >
                <span className="text-[28px]">{g.emoji}</span>
                {g.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Main Join Component                                                */
/* ================================================================== */

export function Join() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPlayers = useCallback(async () => {
    try {
      // Try to get session players first
      const sessionPlayers = await api.get<Player[]>('/sessions/current/players');
      if (Array.isArray(sessionPlayers) && sessionPlayers.length > 0) {
        const mapped = sessionPlayers.map((p: any) => ({
          id: p.player_id ?? p.id,
          name: p.name,
          color: p.color,
        }));
        setPlayers(mapped);
      } else {
        // Fall back to all players
        const allPlayers = await api.get<Player[]>('/players');
        setPlayers(
          Array.isArray(allPlayers)
            ? allPlayers.map((p: any) => ({ id: p.id, name: p.name, color: p.color }))
            : []
        );
      }
    } catch {
      setPlayers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Restore from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.id && parsed.name) {
          setSelectedPlayer(parsed);
        }
      } catch { /* noop */ }
    }
    fetchPlayers();
  }, [fetchPlayers]);

  useSocket('session:update', fetchPlayers);

  // Verify stored player is still in the session
  useEffect(() => {
    if (selectedPlayer && players.length > 0) {
      const stillExists = players.some((p) => p.id === selectedPlayer.id);
      if (!stillExists) {
        setSelectedPlayer(null);
        localStorage.removeItem(LS_KEY);
      }
    }
  }, [selectedPlayer, players]);

  const handleSelect = (p: Player) => {
    setSelectedPlayer(p);
    localStorage.setItem(LS_KEY, JSON.stringify(p));
  };

  const handleChangePlayer = () => {
    setSelectedPlayer(null);
    localStorage.removeItem(LS_KEY);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-500 text-[20px] animate-pulse">Loading...</div>
      </div>
    );
  }

  if (!selectedPlayer) {
    return <PlayerSelect players={players} onSelect={handleSelect} />;
  }

  return <PhoneHub player={selectedPlayer} onChangePlayer={handleChangePlayer} />;
}
