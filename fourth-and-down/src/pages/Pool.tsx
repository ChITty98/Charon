import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useSocket } from '../lib/socket';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

interface Player {
  id: number;
  name: string;
  color: string;
}

interface PoolGame {
  id: number;
  winner_id: number;
  winner_name: string;
  loser_id: number | null;
  loser_name: string | null;
  breaker_id: number | null;
  breaker_name: string | null;
  solids_player_id: number | null;
  balls_remaining: number | null;
  played_at?: string;
  timestamp?: string;
}

interface PlayerStats {
  playerId: number;
  playerName: string;
  playerColor: string;
  gamesPlayed: number;
  gamesWon: number;
  winPct: number;
  currentStreak: number; // positive = winning, negative = losing
}

interface HeadToHead {
  player1Id: number;
  player1Name: string;
  player1Wins: number;
  player2Id: number;
  player2Name: string;
  player2Wins: number;
  total: number;
}

type View = 'play' | 'stats';
type GameStep = 'winner' | 'loser' | 'breaker' | 'solids' | 'balls' | 'confirm';

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */

export function Pool() {
  const [view, setView] = useState<View>('play');
  const [players, setPlayers] = useState<Player[]>([]);
  const [recentGames, setRecentGames] = useState<PoolGame[]>([]);
  const [stats, setStats] = useState<PlayerStats[]>([]);
  const [headToHead, setHeadToHead] = useState<HeadToHead[]>([]);
  const [loading, setLoading] = useState(true);

  // Game logging state
  const [selectedWinner, setSelectedWinner] = useState<number | null>(null);
  const [selectedLoser, setSelectedLoser] = useState<number | null>(null);
  const [selectedBreaker, setSelectedBreaker] = useState<number | null>(null);
  const [solidsPlayerId, setSolidsPlayerId] = useState<number | null>(null);
  const [ballsRemaining, setBallsRemaining] = useState<number>(0);
  const [step, setStep] = useState<GameStep>('winner');
  const [saving, setSaving] = useState(false);

  /* ---- Data fetching ---- */

  const fetchAll = useCallback(async () => {
    try {
      const [playerList, games] = await Promise.all([
        api.get<Player[]>('/sessions/current/players').catch(() => api.get<Player[]>('/players')),
        api.get<PoolGame[]>('/pool/games').catch(() => [] as PoolGame[]),
      ]);

      // Normalize player data
      const normalized = playerList.map((p: any) => ({
        id: p.player_id ?? p.id,
        name: p.name,
        color: p.color,
      }));
      setPlayers(normalized);
      setRecentGames(Array.isArray(games) ? games : []);

      // Compute stats from games
      computeStats(normalized, Array.isArray(games) ? games : []);
    } catch {
      // Server routes may not exist yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useSocket('pool:update', fetchAll);
  useSocket('session:update', fetchAll);

  /* ---- Compute stats locally ---- */

  const computeStats = (playerList: Player[], games: PoolGame[]) => {
    const statsMap = new Map<number, PlayerStats>();

    playerList.forEach(p => {
      statsMap.set(p.id, {
        playerId: p.id,
        playerName: p.name,
        playerColor: p.color,
        gamesPlayed: 0,
        gamesWon: 0,
        winPct: 0,
        currentStreak: 0,
      });
    });

    // Process games (oldest first for streak tracking)
    const sorted = [...games].sort((a, b) =>
      new Date(a.timestamp || a.played_at || 0).getTime() - new Date(b.timestamp || b.played_at || 0).getTime()
    );

    // Reset streaks
    const streaks = new Map<number, number>();

    sorted.forEach(g => {
      const winnerStats = statsMap.get(g.winner_id);
      if (winnerStats) {
        winnerStats.gamesPlayed++;
        winnerStats.gamesWon++;
        const prev = streaks.get(g.winner_id) ?? 0;
        streaks.set(g.winner_id, prev > 0 ? prev + 1 : 1);
      }

      if (g.loser_id) {
        const loserStats = statsMap.get(g.loser_id);
        if (loserStats) {
          loserStats.gamesPlayed++;
          const prev = streaks.get(g.loser_id) ?? 0;
          streaks.set(g.loser_id, prev < 0 ? prev - 1 : -1);
        }
      }
    });

    // Apply streaks and win percentages
    statsMap.forEach((s, id) => {
      s.currentStreak = streaks.get(id) ?? 0;
      s.winPct = s.gamesPlayed > 0 ? Math.round((s.gamesWon / s.gamesPlayed) * 100) : 0;
    });

    setStats(Array.from(statsMap.values()).filter(s => s.gamesPlayed > 0).sort((a, b) => b.winPct - a.winPct));

    // Head to head
    const h2hMap = new Map<string, HeadToHead>();
    games.forEach(g => {
      if (!g.loser_id) return;
      const key = [Math.min(g.winner_id, g.loser_id), Math.max(g.winner_id, g.loser_id)].join('-');
      if (!h2hMap.has(key)) {
        const p1 = playerList.find(p => p.id === Math.min(g.winner_id, g.loser_id!));
        const p2 = playerList.find(p => p.id === Math.max(g.winner_id, g.loser_id!));
        h2hMap.set(key, {
          player1Id: Math.min(g.winner_id, g.loser_id),
          player1Name: p1?.name ?? '?',
          player1Wins: 0,
          player2Id: Math.max(g.winner_id, g.loser_id),
          player2Name: p2?.name ?? '?',
          player2Wins: 0,
          total: 0,
        });
      }
      const h2h = h2hMap.get(key)!;
      h2h.total++;
      if (g.winner_id === h2h.player1Id) h2h.player1Wins++;
      else h2h.player2Wins++;
    });

    setHeadToHead(Array.from(h2hMap.values()).sort((a, b) => b.total - a.total));
  };

  /* ---- Log a game ---- */

  const logGame = async () => {
    if (!selectedWinner) return;
    setSaving(true);
    try {
      await api.post('/pool/games', {
        winnerId: selectedWinner,
        loserId: selectedLoser,
        breakerId: selectedBreaker,
        solidsPlayerId: solidsPlayerId,
        ballsRemaining: ballsRemaining,
      });
      // Reset
      setSelectedWinner(null);
      setSelectedLoser(null);
      setSelectedBreaker(null);
      setSolidsPlayerId(null);
      setBallsRemaining(0);
      setStep('winner');
      fetchAll();
    } catch {
      // noop
    } finally {
      setSaving(false);
    }
  };

  /* ---- Helpers ---- */

  const getPlayer = (id: number) => players.find(p => p.id === id);

  const streakText = (streak: number) => {
    if (streak === 0) return '';
    const abs = Math.abs(streak);
    if (streak > 0) return `${abs}W streak`;
    return `${abs}L streak`;
  };

  const streakColor = (streak: number) => {
    if (streak > 0) return '#22c55e';
    if (streak < 0) return '#ef4444';
    return '#555577';
  };

  /* ---- Render ---- */

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-text-secondary text-[20px] animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-5 pb-8 animate-fade-in max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-[28px] font-black text-text-primary">Pool</h1>
          <p className="text-text-muted text-[14px]">8-Ball Tracker</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setView(view === 'play' ? 'stats' : 'play')}
        >
          {view === 'play' ? 'Stats' : 'Log Game'}
        </Button>
      </div>

      {/* ============ PLAY VIEW ============ */}
      {view === 'play' && (
        <div className="space-y-6">
          {players.length < 2 ? (
            <Card className="text-center py-8">
              <div className="text-text-muted text-[18px]">
                Need at least 2 players in session
              </div>
            </Card>
          ) : (
            <>
              {/* Step: Pick winner */}
              {step === 'winner' && (
                <section>
                  <h2 className="text-[20px] font-bold text-text-primary mb-3">Who Won?</h2>
                  <div className="grid grid-cols-2 gap-3">
                    {players.map(p => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setSelectedWinner(p.id);
                          setStep('loser');
                        }}
                        className="h-[80px] rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95"
                        style={{
                          backgroundColor: p.color + '20',
                          border: `2px solid ${p.color}`,
                        }}
                      >
                        <div
                          className="w-[44px] h-[44px] rounded-full flex items-center justify-center text-[20px] font-bold text-white"
                          style={{ backgroundColor: p.color }}
                        >
                          {p.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-text-primary text-[20px] font-bold">{p.name}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Step: Pick loser */}
              {step === 'loser' && selectedWinner && (
                <section>
                  <h2 className="text-[20px] font-bold text-text-primary mb-1">
                    <span style={{ color: getPlayer(selectedWinner)?.color }}>
                      {getPlayer(selectedWinner)?.name}
                    </span>{' '}
                    won!
                  </h2>
                  <p className="text-text-muted text-[14px] mb-3">Who did they beat?</p>
                  <div className="grid grid-cols-2 gap-3">
                    {players.filter(p => p.id !== selectedWinner).map(p => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setSelectedLoser(p.id);
                          setStep('breaker');
                        }}
                        className="h-[80px] rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95"
                        style={{
                          backgroundColor: p.color + '20',
                          border: `2px solid ${p.color}`,
                        }}
                      >
                        <div
                          className="w-[44px] h-[44px] rounded-full flex items-center justify-center text-[20px] font-bold text-white"
                          style={{ backgroundColor: p.color }}
                        >
                          {p.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-text-primary text-[20px] font-bold">{p.name}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => { setStep('breaker'); setSelectedLoser(null); }}
                    className="mt-3 w-full h-[56px] rounded-xl bg-surface-700 text-text-muted text-[16px] active:scale-95 transition-transform"
                  >
                    Skip (solo practice)
                  </button>
                  <button
                    onClick={() => { setSelectedWinner(null); setStep('winner'); }}
                    className="mt-2 w-full h-[44px] text-text-muted text-[14px]"
                  >
                    Back
                  </button>
                </section>
              )}

              {/* Step: Who broke? (optional) */}
              {step === 'breaker' && selectedWinner && (
                <section>
                  <h2 className="text-[20px] font-bold text-text-primary mb-1">Who broke?</h2>
                  <p className="text-text-muted text-[14px] mb-3">Optional</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[selectedWinner, selectedLoser].filter(Boolean).map(id => {
                      const p = getPlayer(id!);
                      if (!p) return null;
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            setSelectedBreaker(p.id);
                            setStep('solids');
                          }}
                          className="h-[70px] rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95"
                          style={{
                            backgroundColor: p.color + '20',
                            border: `2px solid ${p.color}`,
                          }}
                        >
                          <span className="text-text-primary text-[18px] font-bold">{p.name}</span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => { setSelectedBreaker(null); setStep('solids'); }}
                    className="mt-3 w-full h-[56px] rounded-xl bg-surface-700 text-text-muted text-[16px] active:scale-95 transition-transform"
                  >
                    Skip
                  </button>
                  <button
                    onClick={() => setStep('loser')}
                    className="mt-2 w-full h-[44px] text-text-muted text-[14px]"
                  >
                    Back
                  </button>
                </section>
              )}

              {/* Step: Solids/Stripes — who had solids? */}
              {step === 'solids' && selectedWinner && (
                <section>
                  <h2 className="text-[20px] font-bold text-text-primary mb-1">Who had Solids?</h2>
                  <p className="text-text-muted text-[14px] mb-3">Optional</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[selectedWinner, selectedLoser].filter(Boolean).map(id => {
                      const p = getPlayer(id!);
                      if (!p) return null;
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            setSolidsPlayerId(p.id);
                            setStep('balls');
                          }}
                          className="h-[70px] rounded-2xl flex flex-col items-center justify-center gap-1 transition-all active:scale-95"
                          style={{
                            backgroundColor: p.color + '20',
                            border: `2px solid ${p.color}`,
                          }}
                        >
                          <span className="text-text-primary text-[18px] font-bold">{p.name}</span>
                          <span className="text-text-muted text-[13px]">Solids (1-7)</span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => { setSolidsPlayerId(null); setStep('balls'); }}
                    className="mt-3 w-full h-[56px] rounded-xl bg-surface-700 text-text-muted text-[16px] active:scale-95 transition-transform"
                  >
                    Skip
                  </button>
                  <button
                    onClick={() => setStep('breaker')}
                    className="mt-2 w-full h-[44px] text-text-muted text-[14px]"
                  >
                    Back
                  </button>
                </section>
              )}

              {/* Step: Opponent balls remaining */}
              {step === 'balls' && selectedWinner && (
                <section>
                  <h2 className="text-[20px] font-bold text-text-primary mb-1">Opponent balls left?</h2>
                  <p className="text-text-muted text-[14px] mb-3">How many balls did the loser still have on the table?</p>
                  <div className="grid grid-cols-4 gap-3">
                    {[0, 1, 2, 3, 4, 5, 6, 7].map(n => (
                      <button
                        key={n}
                        onClick={() => {
                          setBallsRemaining(n);
                          setStep('confirm');
                        }}
                        className={[
                          'h-[60px] rounded-xl text-[22px] font-bold transition-all active:scale-95',
                          ballsRemaining === n
                            ? 'bg-accent-blue text-white'
                            : 'bg-surface-700 text-text-secondary hover:bg-surface-600',
                        ].join(' ')}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => { setBallsRemaining(0); setStep('confirm'); }}
                    className="mt-3 w-full h-[56px] rounded-xl bg-surface-700 text-text-muted text-[16px] active:scale-95 transition-transform"
                  >
                    Skip
                  </button>
                  <button
                    onClick={() => setStep('solids')}
                    className="mt-2 w-full h-[44px] text-text-muted text-[14px]"
                  >
                    Back
                  </button>
                </section>
              )}

              {/* Step: Confirm */}
              {step === 'confirm' && selectedWinner && (
                <section className="text-center space-y-4">
                  <div className="text-[20px] font-bold text-text-primary">Confirm Result</div>
                  <Card>
                    <div className="space-y-2 text-[18px]">
                      <div>
                        <span className="text-text-muted">Winner: </span>
                        <span className="font-bold" style={{ color: getPlayer(selectedWinner)?.color }}>
                          {getPlayer(selectedWinner)?.name}
                        </span>
                      </div>
                      {selectedLoser && (
                        <div>
                          <span className="text-text-muted">Loser: </span>
                          <span className="font-bold" style={{ color: getPlayer(selectedLoser)?.color }}>
                            {getPlayer(selectedLoser)?.name}
                          </span>
                        </div>
                      )}
                      {selectedBreaker && (
                        <div>
                          <span className="text-text-muted">Broke: </span>
                          <span className="font-bold">{getPlayer(selectedBreaker)?.name}</span>
                        </div>
                      )}
                      {solidsPlayerId && (
                        <div>
                          <span className="text-text-muted">Solids: </span>
                          <span className="font-bold">{getPlayer(solidsPlayerId)?.name}</span>
                          <span className="text-text-muted"> / Stripes: </span>
                          <span className="font-bold">
                            {selectedLoser && solidsPlayerId === selectedWinner
                              ? getPlayer(selectedLoser)?.name
                              : getPlayer(selectedWinner)?.name}
                          </span>
                        </div>
                      )}
                      {ballsRemaining > 0 && (
                        <div>
                          <span className="text-text-muted">Balls left: </span>
                          <span className="font-bold">{ballsRemaining}</span>
                        </div>
                      )}
                    </div>
                  </Card>
                  <Button size="lg" fullWidth onClick={logGame} disabled={saving}>
                    {saving ? 'Saving...' : 'Log Game'}
                  </Button>
                  <button
                    onClick={() => setStep('balls')}
                    className="w-full h-[44px] text-text-muted text-[14px]"
                  >
                    Back
                  </button>
                </section>
              )}
            </>
          )}

          {/* Recent Games */}
          {recentGames.length > 0 && (
            <section>
              <h2 className="text-[18px] font-bold text-text-primary mb-3">Recent Games</h2>
              <div className="space-y-2">
                {recentGames.slice(0, 10).map(g => (
                  <div
                    key={g.id}
                    className="flex items-center justify-between px-4 py-3 rounded-xl bg-surface-800"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-accent-green font-bold text-[16px]">
                        {g.winner_name}
                      </span>
                      {g.loser_name && (
                        <>
                          <span className="text-text-muted text-[14px]">beat</span>
                          <span className="text-accent-red font-bold text-[16px]">
                            {g.loser_name}
                          </span>
                        </>
                      )}
                    </div>
                    {g.breaker_name && (
                      <span className="text-text-muted text-[12px]">
                        {g.breaker_name} broke
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ============ STATS VIEW ============ */}
      {view === 'stats' && (
        <div className="space-y-6">
          {/* Career Stats */}
          <section>
            <h2 className="text-[20px] font-bold text-text-primary mb-3">Career Stats</h2>
            {stats.length === 0 ? (
              <Card className="text-center py-6">
                <div className="text-text-muted text-[18px]">No games played yet</div>
              </Card>
            ) : (
              <div className="space-y-3">
                {stats.map((s, i) => (
                  <Card key={s.playerId}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="text-[20px] font-bold text-text-muted w-[28px]">
                          #{i + 1}
                        </div>
                        <div
                          className="w-[40px] h-[40px] rounded-full flex items-center justify-center text-[18px] font-bold text-white"
                          style={{ backgroundColor: s.playerColor }}
                        >
                          {s.playerName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-text-primary text-[18px] font-semibold">
                            {s.playerName}
                          </div>
                          <div className="text-text-muted text-[13px]">
                            {s.gamesWon}W - {s.gamesPlayed - s.gamesWon}L
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[24px] font-black text-text-primary">
                          {s.winPct}%
                        </div>
                        {s.currentStreak !== 0 && (
                          <div
                            className="text-[13px] font-bold"
                            style={{ color: streakColor(s.currentStreak) }}
                          >
                            {streakText(s.currentStreak)}
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* Head to Head */}
          {headToHead.length > 0 && (
            <section>
              <h2 className="text-[20px] font-bold text-text-primary mb-3">Head to Head</h2>
              <div className="space-y-3">
                {headToHead.map((h, i) => (
                  <Card key={i}>
                    <div className="flex items-center justify-between">
                      <span className="text-text-primary text-[16px] font-semibold">
                        {h.player1Name}
                      </span>
                      <div className="flex items-center gap-2 text-[20px] font-black">
                        <span className={h.player1Wins > h.player2Wins ? 'text-accent-green' : 'text-text-muted'}>
                          {h.player1Wins}
                        </span>
                        <span className="text-text-muted text-[14px]">-</span>
                        <span className={h.player2Wins > h.player1Wins ? 'text-accent-green' : 'text-text-muted'}>
                          {h.player2Wins}
                        </span>
                      </div>
                      <span className="text-text-primary text-[16px] font-semibold">
                        {h.player2Name}
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
