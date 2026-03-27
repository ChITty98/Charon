import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

interface Player {
  id: number;
  name: string;
  color: string;
}

interface RoundScore {
  [playerId: number]: number; // pip count per player
}

interface RoundRecord {
  roundNumber: number;
  scores: RoundScore;
  winnerId: number | null; // who went out
}

type GameType = 'mexican_train' | 'block';
type View = 'setup' | 'playing' | 'results';

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */

export function Dominoes() {
  const [view, setView] = useState<View>('setup');
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  // Setup
  const [gameType, setGameType] = useState<GameType>('mexican_train');
  const [selectedPlayers, setSelectedPlayers] = useState<number[]>([]);

  // Game state
  const [gameId, setGameId] = useState<number | null>(null);
  const [gamePlayers, setGamePlayers] = useState<Player[]>([]);
  const [rounds, setRounds] = useState<RoundRecord[]>([]);
  const [trainOpen, setTrainOpen] = useState<Record<number, boolean>>({});
  const [targetScore, setTargetScore] = useState(200);

  // Round entry modal
  const [roundModal, setRoundModal] = useState(false);
  const [roundScores, setRoundScores] = useState<RoundScore>({});
  const [roundWinner, setRoundWinner] = useState<number | null>(null);

  // Results
  const [gameWinner, setGameWinner] = useState<Player | null>(null);

  /* ---- Load players ---- */
  useEffect(() => {
    (async () => {
      try {
        const sp = await api.get<any[]>('/sessions/current/players').catch(() => api.get<any[]>('/players'));
        setAllPlayers(sp.map((p: any) => ({ id: p.player_id ?? p.id, name: p.name, color: p.color })));
      } catch { /* no session */ }
      finally { setLoading(false); }
    })();
  }, []);

  /* ---- Player selection ---- */
  const togglePlayer = useCallback((id: number) => {
    setSelectedPlayers(prev => {
      if (prev.includes(id)) return prev.filter(p => p !== id);
      const max = gameType === 'block' ? 2 : 8;
      if (prev.length >= max) return prev;
      return [...prev, id];
    });
  }, [gameType]);

  /* ---- Start game ---- */
  const startGame = useCallback(async () => {
    const minPlayers = gameType === 'block' ? 2 : 2;
    if (selectedPlayers.length < minPlayers) return;

    try {
      const res = await api.post<{ id: number }>('/dominoes/start', {
        gameType,
        playerIds: selectedPlayers,
      });
      setGameId(res.id);
      setGamePlayers(allPlayers.filter(p => selectedPlayers.includes(p.id)));
      setRounds([]);
      setTrainOpen(Object.fromEntries(selectedPlayers.map(id => [id, false])));
      setGameWinner(null);
      setView('playing');
    } catch (e) {
      console.error('Failed to start dominoes game', e);
    }
  }, [gameType, selectedPlayers, allPlayers]);

  /* ---- Totals ---- */
  const getTotals = useCallback((): Record<number, number> => {
    const totals: Record<number, number> = {};
    for (const p of gamePlayers) totals[p.id] = 0;
    for (const r of rounds) {
      for (const [pid, score] of Object.entries(r.scores)) {
        totals[Number(pid)] = (totals[Number(pid)] || 0) + score;
      }
    }
    return totals;
  }, [gamePlayers, rounds]);

  /* ---- Open round entry ---- */
  const openRoundEntry = useCallback(() => {
    setRoundScores(Object.fromEntries(gamePlayers.map(p => [p.id, 0])));
    setRoundWinner(null);
    setRoundModal(true);
  }, [gamePlayers]);

  /* ---- Submit round ---- */
  const submitRound = useCallback(async () => {
    if (!gameId) return;
    const roundNumber = rounds.length + 1;

    // The winner (who went out) has 0 pips
    const finalScores = { ...roundScores };
    if (roundWinner) finalScores[roundWinner] = 0;

    try {
      await api.post('/dominoes/score-round', {
        gameId,
        roundNumber,
        scores: finalScores,
        winnerId: roundWinner,
      });

      const newRound: RoundRecord = { roundNumber, scores: finalScores, winnerId: roundWinner };
      const updatedRounds = [...rounds, newRound];
      setRounds(updatedRounds);
      setRoundModal(false);

      // Check if any player hit target (for block game) — lowest total wins
      if (gameType === 'block') {
        const totals: Record<number, number> = {};
        for (const p of gamePlayers) totals[p.id] = 0;
        for (const r of updatedRounds) {
          for (const [pid, score] of Object.entries(r.scores)) {
            totals[Number(pid)] = (totals[Number(pid)] || 0) + score;
          }
        }
        const anyOverTarget = Object.values(totals).some(t => t >= targetScore);
        if (anyOverTarget) {
          // Game over — lowest total wins
          const winner = gamePlayers.reduce((best, p) => totals[p.id] < totals[best.id] ? p : best, gamePlayers[0]);
          setGameWinner(winner);
          await api.post('/dominoes/end', { gameId }).catch(() => {});
          setView('results');
        }
      }
    } catch (e) {
      console.error('Failed to submit round', e);
    }
  }, [gameId, rounds, roundScores, roundWinner, gamePlayers, gameType, targetScore]);

  /* ---- End game manually ---- */
  const endGame = useCallback(async () => {
    if (!gameId) return;
    const totals = getTotals();
    const winner = gamePlayers.reduce((best, p) => totals[p.id] < totals[best.id] ? p : best, gamePlayers[0]);
    setGameWinner(winner);
    await api.post('/dominoes/end', { gameId }).catch(() => {});
    setView('results');
  }, [gameId, gamePlayers, getTotals]);

  /* ---- Helpers ---- */
  const getPlayer = (id: number) => allPlayers.find(p => p.id === id);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-text-muted text-[20px]">Loading...</div>
      </div>
    );
  }

  const totals = getTotals();

  /* ================================================================== */
  /*  Render                                                             */
  /* ================================================================== */

  return (
    <div className="p-5 pb-2 animate-fade-in">
      <h1 className="text-[28px] font-bold text-text-primary mb-5">Dominoes</h1>

      {/* ---- SETUP VIEW ---- */}
      {view === 'setup' && (
        <div className="space-y-5">
          {/* Game type */}
          <Card>
            <h2 className="text-[20px] font-bold text-text-primary mb-3">Game Type</h2>
            <div className="grid grid-cols-2 gap-3">
              {([
                { type: 'mexican_train' as GameType, name: 'Mexican Train', desc: '2-8 players', icon: '\uD83D\uDE82' },
                { type: 'block' as GameType, name: 'Block', desc: '2 players', icon: '\u25A0\u25A0' },
              ]).map(g => (
                <button
                  key={g.type}
                  onClick={() => { setGameType(g.type); setSelectedPlayers([]); }}
                  className={[
                    'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all',
                    gameType === g.type
                      ? 'border-accent-blue bg-accent-blue/10'
                      : 'border-surface-500 bg-surface-700 hover:border-surface-400',
                  ].join(' ')}
                >
                  <span className="text-[32px]">{g.icon}</span>
                  <span className="text-[18px] font-bold text-text-primary">{g.name}</span>
                  <span className="text-[13px] text-text-muted">{g.desc}</span>
                </button>
              ))}
            </div>
          </Card>

          {/* Player selection */}
          <Card>
            <h2 className="text-[20px] font-bold text-text-primary mb-3">
              Players ({selectedPlayers.length}/{gameType === 'block' ? 2 : 8})
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {allPlayers.map(p => {
                const selected = selectedPlayers.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePlayer(p.id)}
                    className={[
                      'h-[52px] rounded-xl flex items-center gap-3 px-4 border-2 transition-all',
                      selected
                        ? 'border-accent-blue bg-accent-blue/20'
                        : 'border-transparent bg-surface-700 hover:border-surface-500',
                    ].join(' ')}
                  >
                    <div className="w-[24px] h-[24px] rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="text-[16px] font-medium text-text-primary">{p.name}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Target score (block only) */}
          {gameType === 'block' && (
            <Card>
              <h2 className="text-[20px] font-bold text-text-primary mb-3">Play To</h2>
              <div className="flex gap-2">
                {[100, 200, 300].map(t => (
                  <button
                    key={t}
                    onClick={() => setTargetScore(t)}
                    className={[
                      'flex-1 h-[48px] rounded-xl text-[18px] font-bold transition-all',
                      targetScore === t ? 'bg-accent-blue text-white' : 'bg-surface-700 text-text-secondary',
                    ].join(' ')}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Card>
          )}

          <Button
            fullWidth
            size="lg"
            disabled={selectedPlayers.length < 2 || (gameType === 'block' && selectedPlayers.length !== 2)}
            onClick={startGame}
          >
            Start Game
          </Button>
        </div>
      )}

      {/* ---- PLAYING VIEW ---- */}
      {view === 'playing' && (
        <div className="space-y-4">
          {/* Scoreboard */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[18px] font-bold text-text-primary">
                {gameType === 'mexican_train' ? 'Mexican Train' : 'Block'} - Round {rounds.length + 1}
              </h2>
              <button
                onClick={endGame}
                className="text-[14px] text-accent-red hover:underline"
              >
                End Game
              </button>
            </div>

            {/* Player scores */}
            <div className="space-y-2">
              {gamePlayers
                .slice()
                .sort((a, b) => (totals[a.id] || 0) - (totals[b.id] || 0))
                .map((p, rank) => (
                <div key={p.id} className="flex items-center gap-3 bg-surface-700 rounded-xl px-4 py-3">
                  <span className="text-[14px] text-text-muted w-[20px]">#{rank + 1}</span>
                  <div className="w-[28px] h-[28px] rounded-full" style={{ backgroundColor: p.color }} />
                  <span className="text-[16px] font-medium text-text-primary flex-1">{p.name}</span>

                  {/* Train status (Mexican Train only) */}
                  {gameType === 'mexican_train' && (
                    <button
                      onClick={() => setTrainOpen(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                      className={[
                        'px-3 py-1 rounded-full text-[12px] font-bold transition-all',
                        trainOpen[p.id]
                          ? 'bg-accent-red/20 text-accent-red'
                          : 'bg-accent-green/20 text-accent-green',
                      ].join(' ')}
                    >
                      {trainOpen[p.id] ? 'OPEN' : 'CLOSED'}
                    </button>
                  )}

                  <span className="text-[24px] font-bold text-text-primary min-w-[60px] text-right">
                    {totals[p.id] || 0}
                  </span>
                </div>
              ))}
            </div>

            <p className="text-[13px] text-text-muted mt-2 text-center">Lowest score wins</p>
          </Card>

          {/* Score round button */}
          <Button fullWidth size="lg" onClick={openRoundEntry}>
            Score Round
          </Button>

          {/* Round history */}
          {rounds.length > 0 && (
            <Card>
              <h3 className="text-[18px] font-bold text-text-primary mb-3">Round History</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-[14px]">
                  <thead>
                    <tr className="border-b border-surface-600">
                      <th className="py-2 px-2 text-left text-text-muted font-medium">Rd</th>
                      {gamePlayers.map(p => (
                        <th key={p.id} className="py-2 px-2 text-center text-text-muted font-medium">{p.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rounds.map(r => (
                      <tr key={r.roundNumber} className="border-b border-surface-700">
                        <td className="py-2 px-2 text-text-secondary">{r.roundNumber}</td>
                        {gamePlayers.map(p => (
                          <td key={p.id} className={[
                            'py-2 px-2 text-center font-medium',
                            r.winnerId === p.id ? 'text-accent-green' : 'text-text-primary',
                          ].join(' ')}>
                            {r.scores[p.id] ?? '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {/* Totals row */}
                    <tr className="bg-surface-700">
                      <td className="py-2 px-2 text-text-primary font-bold">Total</td>
                      {gamePlayers.map(p => (
                        <td key={p.id} className="py-2 px-2 text-center font-bold text-text-primary">
                          {totals[p.id] || 0}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Round entry modal */}
          <Modal open={roundModal} onClose={() => setRoundModal(false)} title={`Round ${rounds.length + 1} Scores`}>
            <div className="space-y-4">
              <p className="text-[14px] text-text-muted">
                Enter remaining pip count for each player. The winner (who went out) gets 0.
              </p>

              {/* Winner selection */}
              <div>
                <p className="text-[14px] text-text-muted mb-2">Who went out?</p>
                <div className="flex gap-2 flex-wrap">
                  {gamePlayers.map(p => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setRoundWinner(p.id);
                        setRoundScores(prev => ({ ...prev, [p.id]: 0 }));
                      }}
                      className={[
                        'px-4 py-2 rounded-lg text-[14px] font-medium transition-all border-2',
                        roundWinner === p.id
                          ? 'border-accent-green bg-accent-green/20 text-accent-green'
                          : 'border-transparent bg-surface-700 text-text-secondary',
                      ].join(' ')}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pip counts */}
              {gamePlayers.map(p => (
                <div key={p.id} className="flex items-center gap-3">
                  <div className="w-[24px] h-[24px] rounded-full" style={{ backgroundColor: p.color }} />
                  <span className="text-[16px] text-text-primary flex-1">{p.name}</span>
                  {roundWinner === p.id ? (
                    <span className="text-[18px] font-bold text-accent-green">0</span>
                  ) : (
                    <input
                      type="number"
                      min="0"
                      value={roundScores[p.id] || ''}
                      onChange={e => setRoundScores(prev => ({ ...prev, [p.id]: parseInt(e.target.value) || 0 }))}
                      placeholder="0"
                      className="w-[80px] h-[48px] bg-surface-700 border border-surface-500 rounded-xl text-center text-[20px] font-bold text-text-primary focus:outline-none focus:border-accent-blue"
                    />
                  )}
                </div>
              ))}

              <Button fullWidth onClick={submitRound}>
                Save Round
              </Button>
            </div>
          </Modal>
        </div>
      )}

      {/* ---- RESULTS VIEW ---- */}
      {view === 'results' && (
        <div className="space-y-4">
          <Card>
            <div className="text-center py-4">
              <div className="text-[20px] text-text-muted mb-2">Winner</div>
              {gameWinner && (
                <>
                  <div className="w-[64px] h-[64px] rounded-full mx-auto mb-3" style={{ backgroundColor: gameWinner.color }} />
                  <div className="text-[32px] font-bold text-accent-green">{gameWinner.name}</div>
                  <div className="text-[18px] text-text-muted mt-1">Score: {totals[gameWinner.id] || 0}</div>
                </>
              )}
            </div>
          </Card>

          {/* Final standings */}
          <Card>
            <h3 className="text-[18px] font-bold text-text-primary mb-3">Final Standings</h3>
            <div className="space-y-2">
              {gamePlayers
                .slice()
                .sort((a, b) => (totals[a.id] || 0) - (totals[b.id] || 0))
                .map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 bg-surface-700 rounded-xl px-4 py-3">
                  <span className={[
                    'text-[18px] font-bold w-[28px]',
                    i === 0 ? 'text-accent-green' : 'text-text-muted',
                  ].join(' ')}>
                    #{i + 1}
                  </span>
                  <div className="w-[28px] h-[28px] rounded-full" style={{ backgroundColor: p.color }} />
                  <span className="text-[16px] font-medium text-text-primary flex-1">{p.name}</span>
                  <span className="text-[20px] font-bold text-text-primary">{totals[p.id] || 0}</span>
                </div>
              ))}
            </div>
          </Card>

          <Button fullWidth size="lg" onClick={() => { setView('setup'); setGameId(null); setRounds([]); }}>
            New Game
          </Button>
        </div>
      )}
    </div>
  );
}
