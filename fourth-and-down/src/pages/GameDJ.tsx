import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { Toggle } from '../components/ui/Toggle';
import { PinPad } from '../components/ui/PinPad';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

interface DJConfig {
  id: number;
  game_type: string;
  enabled: number;
  min_players: number;
  max_players: number | null;
}

interface DJSuggestion {
  gameType: string;
  gameName: string;
  suggestedPlayers: { id: number; name: string; color: string }[];
  teams?: { name: string; players: { id: number; name: string; color: string }[] }[] | null;
  reason: string;
}

interface Player {
  id: number;
  name: string;
  color: string;
}

type View = 'dj' | 'config';

/* ================================================================== */
/*  Game display names and routes                                      */
/* ================================================================== */

const GAME_DISPLAY: Record<string, { name: string; icon: string; route: string; type: string }> = {
  darts: { name: 'Darts', icon: '\uD83C\uDFAF', route: '/darts', type: 'physical' },
  trivia: { name: 'Trivia', icon: '\uD83E\uDDE0', route: '/trivia', type: 'digital' },
  catchphrase: { name: 'Catch Phrase', icon: '\uD83D\uDCAC', route: '/catchphrase', type: 'digital' },
  blackjack: { name: 'Blackjack', icon: '\uD83C\uDCCF', route: '/blackjack', type: 'digital' },
  pool: { name: 'Pool', icon: '\uD83C\uDFB1', route: '/pool', type: 'physical' },
  cribbage: { name: 'Cribbage', icon: '\uD83C\uDCA0', route: '/cribbage', type: 'card' },
  dominoes: { name: 'Dominoes', icon: '\u25A0\u25A0', route: '/dominoes', type: 'physical' },
  farkle: { name: 'Farkle', icon: '\uD83C\uDFB2', route: '/dice', type: 'digital' },
  yahtzee: { name: 'Yahtzee', icon: '\uD83C\uDFB2', route: '/dice', type: 'digital' },
  ship_captain_crew: { name: 'Ship Captain Crew', icon: '\u2693', route: '/dice', type: 'digital' },
  poker: { name: 'Poker', icon: '\u2660\uFE0F', route: '/poker', type: 'card' },
};

const TYPE_COLORS: Record<string, string> = {
  physical: '#ef4444',
  digital: '#8b5cf6',
  card: '#22c55e',
};

const TYPE_LABELS: Record<string, string> = {
  physical: 'Physical',
  digital: 'Digital',
  card: 'Card',
};

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */

export function GameDJ() {
  const navigate = useNavigate();
  const [view, setView] = useState<View>('dj');
  const [players, setPlayers] = useState<Player[]>([]);
  const [config, setConfig] = useState<DJConfig[]>([]);
  const [loading, setLoading] = useState(true);

  // DJ state
  const [suggestion, setSuggestion] = useState<DJSuggestion | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [revealStep, setRevealStep] = useState(0);
  const revealTimer = useRef<number | null>(null);

  // Config auth
  const [showPin, setShowPin] = useState(false);
  const [configAuthed, setConfigAuthed] = useState(false);
  const [editingGame, setEditingGame] = useState<DJConfig | null>(null);

  /* ---- Load data ---- */
  useEffect(() => {
    (async () => {
      try {
        const [sp, cfg] = await Promise.all([
          api.get<any[]>('/sessions/current/players').catch(() => api.get<any[]>('/players')),
          api.get<DJConfig[]>('/dj/config').catch(() => [] as DJConfig[]),
        ]);
        setPlayers(sp.map((p: any) => ({ id: p.player_id ?? p.id, name: p.name, color: p.color })));
        setConfig(cfg);
      } catch { /* */ }
      finally { setLoading(false); }
    })();
  }, []);

  /* ---- Reveal animation ---- */
  const startReveal = useCallback(async () => {
    setRevealing(true);
    setRevealed(false);
    setRevealStep(0);

    // Fetch next suggestion
    try {
      const next = await api.post<DJSuggestion>('/dj/next', { playerIds: players.map(p => p.id) });
      setSuggestion(next);
    } catch {
      setSuggestion({
        gameType: 'darts',
        gameName: 'Darts',
        suggestedPlayers: players.slice(0, 2),
        reason: 'Random pick',
      });
    }

    // Dramatic countdown
    let step = 0;
    const interval = setInterval(() => {
      step++;
      setRevealStep(step);
      if (step >= 6) {
        clearInterval(interval);
        setRevealing(false);
        setRevealed(true);
      }
    }, 500);
    revealTimer.current = interval as unknown as number;
  }, [players]);

  const skipGame = useCallback(async () => {
    setRevealed(false);
    setSuggestion(null);
    try {
      const next = await api.post<DJSuggestion>('/dj/skip', { playerIds: players.map(p => p.id) });
      setSuggestion(next);
      setRevealed(true);
    } catch { /* */ }
  }, [players]);

  const confirmGame = useCallback(async () => {
    if (!suggestion) return;
    try {
      await api.post('/dj/played', {
        gameType: suggestion.gameType,
        playerIds: suggestion.suggestedPlayers.map(p => p.id),
      });
    } catch { /* */ }

    const gameInfo = GAME_DISPLAY[suggestion.gameType];
    if (gameInfo?.route) navigate(gameInfo.route);
  }, [suggestion, navigate]);

  /* ---- Config auth ---- */
  const handlePinSubmit = useCallback(async (pin: string) => {
    try {
      const res = await api.post<{ valid: boolean }>('/admin/verify-pin', { pin });
      if (!res.valid) throw new Error('invalid');
      setConfigAuthed(true);
      setShowPin(false);
      setView('config');
    } catch {
      (window as any).__pinPadShake?.();
    }
  }, []);

  const openConfig = useCallback(() => {
    if (configAuthed) {
      setView('config');
    } else {
      setShowPin(true);
    }
  }, [configAuthed]);

  /* ---- Update config ---- */
  const updateConfig = useCallback(async (gameType: string, updates: Partial<DJConfig>) => {
    try {
      await api.put(`/dj/config/${gameType}`, updates);
      setConfig(prev => prev.map(c => c.game_type === gameType ? { ...c, ...updates } as DJConfig : c));
    } catch (e) {
      console.error('Failed to update DJ config', e);
    }
  }, []);

  /* ---- Cleanup ---- */
  useEffect(() => {
    return () => {
      if (revealTimer.current) clearInterval(revealTimer.current);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-text-muted text-[20px]">Loading...</div>
      </div>
    );
  }

  /* ================================================================== */
  /*  Render                                                             */
  /* ================================================================== */

  return (
    <div className="p-5 pb-2 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-[28px] font-bold text-text-primary">Game DJ</h1>
        <button
          onClick={() => view === 'config' ? setView('dj') : openConfig()}
          className="px-4 py-2 rounded-lg text-[14px] font-semibold bg-surface-700 text-text-secondary hover:bg-surface-600 transition-colors"
        >
          {view === 'config' ? 'Back to DJ' : 'Config'}
        </button>
      </div>

      {/* PIN modal */}
      <Modal open={showPin} onClose={() => setShowPin(false)}>
        <PinPad onSubmit={handlePinSubmit} onCancel={() => setShowPin(false)} title="Admin PIN" />
      </Modal>

      {/* ---- DJ VIEW ---- */}
      {view === 'dj' && (
        <div className="space-y-5">
          {/* Reveal area */}
          {!revealing && !revealed && (
            <div className="flex flex-col items-center gap-6 py-10">
              <div className="text-[64px] opacity-50">
                <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
              </div>
              <p className="text-[18px] text-text-muted text-center">
                {players.length} player{players.length !== 1 ? 's' : ''} in session
              </p>
              <Button size="lg" onClick={startReveal} className="px-12">
                NEXT GAME
              </Button>
            </div>
          )}

          {/* Revealing animation */}
          {revealing && (
            <div className="flex flex-col items-center justify-center py-16">
              <div
                className="relative w-[200px] h-[200px] flex items-center justify-center"
                style={{
                  animation: 'spin 1s linear infinite',
                }}
              >
                {/* Spinning circles */}
                {[0, 1, 2, 3, 4, 5].map(i => (
                  <div
                    key={i}
                    className="absolute w-[16px] h-[16px] rounded-full"
                    style={{
                      backgroundColor: i <= revealStep ? '#3b82f6' : '#222240',
                      top: `${50 + 40 * Math.sin((i * Math.PI * 2) / 6 - Math.PI / 2)}%`,
                      left: `${50 + 40 * Math.cos((i * Math.PI * 2) / 6 - Math.PI / 2)}%`,
                      transform: 'translate(-50%, -50%)',
                      transition: 'background-color 200ms',
                    }}
                  />
                ))}
                <div className="text-[24px] font-bold text-text-muted">
                  {revealStep < 3 ? 'Mixing...' : revealStep < 5 ? 'Almost...' : 'Ready!'}
                </div>
              </div>
            </div>
          )}

          {/* Revealed game */}
          {revealed && suggestion && (
            <div className="space-y-4">
              {/* Game name with glow */}
              <div
                className="flex flex-col items-center gap-4 py-8 rounded-2xl border border-surface-500"
                style={{
                  background: 'radial-gradient(ellipse at center, rgba(59,130,246,0.15) 0%, rgba(13,13,26,0.95) 70%)',
                  boxShadow: `0 0 60px ${TYPE_COLORS[GAME_DISPLAY[suggestion.gameType]?.type || 'digital']}33`,
                  animation: 'fade-in 0.5s ease-out',
                }}
              >
                <span className="text-[72px]">{GAME_DISPLAY[suggestion.gameType]?.icon || '\uD83C\uDFAE'}</span>
                <h2 className="text-[36px] font-bold text-text-primary">{suggestion.gameName}</h2>

                {/* Type badge */}
                <span
                  className="px-4 py-1 rounded-full text-[14px] font-bold text-white"
                  style={{ backgroundColor: TYPE_COLORS[GAME_DISPLAY[suggestion.gameType]?.type || 'digital'] }}
                >
                  {TYPE_LABELS[GAME_DISPLAY[suggestion.gameType]?.type || 'digital']}
                </span>

                <p className="text-[14px] text-text-muted">{suggestion.reason}</p>
              </div>

              {/* Teams or suggested players */}
              {suggestion.teams && suggestion.teams.length > 0 ? (
                <Card>
                  <h3 className="text-[16px] font-bold text-text-primary mb-3">Teams</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {suggestion.teams.map((team, ti) => (
                      <div key={ti} className="bg-surface-700 rounded-xl p-3">
                        <div className="text-[14px] font-bold text-text-secondary mb-2">{team.name}</div>
                        <div className="space-y-1.5">
                          {team.players.map(p => (
                            <div key={p.id} className="flex items-center gap-2">
                              <div className="w-[20px] h-[20px] rounded-full" style={{ backgroundColor: p.color }} />
                              <span className="text-[15px] text-text-primary">{p.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              ) : suggestion.suggestedPlayers.length > 0 && (
                <Card>
                  <h3 className="text-[16px] font-bold text-text-primary mb-3">Suggested Players</h3>
                  <div className="flex gap-3 flex-wrap">
                    {suggestion.suggestedPlayers.map(p => (
                      <div key={p.id} className="flex items-center gap-2 bg-surface-700 rounded-full px-4 py-2">
                        <div className="w-[24px] h-[24px] rounded-full" style={{ backgroundColor: p.color }} />
                        <span className="text-[16px] font-medium text-text-primary">{p.name}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-3">
                <Button variant="secondary" size="lg" onClick={skipGame}>
                  Skip
                </Button>
                <Button size="lg" onClick={confirmGame}>
                  Let's Play!
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- CONFIG VIEW ---- */}
      {view === 'config' && (
        <div className="space-y-3">
          <p className="text-[14px] text-text-muted mb-2">Toggle games in/out of the DJ rotation</p>

          {config.map(c => {
            const gameInfo = GAME_DISPLAY[c.game_type];
            const typeBadgeColor = TYPE_COLORS[gameInfo?.type || 'digital'];
            return (
              <Card key={c.game_type}>
                <div className="flex items-center gap-3">
                  <span className="text-[28px] w-[40px] text-center">{gameInfo?.icon || '\uD83C\uDFAE'}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[18px] font-bold text-text-primary">{gameInfo?.name || c.game_type}</span>
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                        style={{ backgroundColor: typeBadgeColor }}
                      >
                        {TYPE_LABELS[gameInfo?.type || 'digital']}
                      </span>
                    </div>
                    <span className="text-[13px] text-text-muted">
                      {c.min_players}-{c.max_players || '\u221E'} players
                    </span>
                  </div>
                  <Toggle
                    checked={c.enabled === 1}
                    onChange={checked => updateConfig(c.game_type, { enabled: checked ? 1 : 0 })}
                    size="md"
                  />
                </div>

                {/* Edit min/max */}
                <button
                  onClick={() => setEditingGame(editingGame?.game_type === c.game_type ? null : c)}
                  className="text-[12px] text-accent-blue mt-2 hover:underline"
                >
                  {editingGame?.game_type === c.game_type ? 'Close' : 'Edit players'}
                </button>

                {editingGame?.game_type === c.game_type && (
                  <div className="flex gap-3 mt-2">
                    <div>
                      <label className="text-[12px] text-text-muted">Min</label>
                      <input
                        type="number"
                        min="1"
                        max="8"
                        value={c.min_players}
                        onChange={e => updateConfig(c.game_type, { min_players: parseInt(e.target.value) || 1 })}
                        className="w-[60px] h-[40px] bg-surface-700 border border-surface-500 rounded-lg text-center text-[16px] text-text-primary focus:outline-none focus:border-accent-blue"
                      />
                    </div>
                    <div>
                      <label className="text-[12px] text-text-muted">Max</label>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={c.max_players || ''}
                        onChange={e => updateConfig(c.game_type, { max_players: parseInt(e.target.value) || null })}
                        className="w-[60px] h-[40px] bg-surface-700 border border-surface-500 rounded-lg text-center text-[16px] text-text-primary focus:outline-none focus:border-accent-blue"
                      />
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Spin animation keyframes */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
