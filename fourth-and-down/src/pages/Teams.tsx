import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
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

interface TeamPairing {
  team: [Player, Player];
  teamId?: number;
  stats?: {
    gamesPlayed: number;
    gamesWon: number;
    synergyScore: number;
  };
}

interface TeamRecord {
  id: number;
  player1: Player;
  player2: Player;
  gamesPlayed: number;
  gamesWon: number;
  synergyScore: number;
}

type FormationMode = 'fair' | 'synergy' | 'shake' | 'random';
type View = 'form' | 'records';

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */

export function Teams() {
  const [view, setView] = useState<View>('form');
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  // Formation
  const [mode, setMode] = useState<FormationMode>('random');
  const [pairings, setPairings] = useState<TeamPairing[]>([]);
  const [forming, setForming] = useState(false);
  const [locked, setLocked] = useState(false);

  // Records
  const [records, setRecords] = useState<TeamRecord[]>([]);

  /* ---- Load players ---- */
  useEffect(() => {
    (async () => {
      try {
        const sp = await api.get<any[]>('/sessions/current/players').catch(() => api.get<any[]>('/players'));
        setPlayers(sp.map((p: any) => ({ id: p.player_id ?? p.id, name: p.name, color: p.color })));
      } catch { /* */ }
      finally { setLoading(false); }
    })();
  }, []);

  /* ---- Load records ---- */
  const loadRecords = useCallback(async () => {
    try {
      const data = await api.get<TeamRecord[]>('/teams');
      setRecords(data);
    } catch {
      setRecords([]);
    }
  }, []);

  useEffect(() => {
    if (view === 'records') loadRecords();
  }, [view, loadRecords]);

  /* ---- Form teams ---- */
  const formTeams = useCallback(async () => {
    if (players.length < 2) return;
    setForming(true);
    setLocked(false);

    try {
      const res = await api.post<{ pairings: TeamPairing[] }>('/teams/form', {
        playerIds: players.map(p => p.id),
        mode,
      });
      // Map player IDs back to full player objects
      const mapped = res.pairings.map((pair: any) => ({
        ...pair,
        team: pair.team.map((pid: any) => {
          if (typeof pid === 'number') return players.find(p => p.id === pid) || { id: pid, name: `Player ${pid}`, color: '#888' };
          return pid;
        }),
      }));
      setPairings(mapped);
    } catch {
      // Fallback: local random pairing
      const shuffled = [...players].sort(() => Math.random() - 0.5);
      const pairs: TeamPairing[] = [];
      for (let i = 0; i < shuffled.length - 1; i += 2) {
        pairs.push({ team: [shuffled[i], shuffled[i + 1]] });
      }
      setPairings(pairs);
    }
    setForming(false);
  }, [players, mode]);

  /* ---- Lock teams ---- */
  const lockTeams = useCallback(() => {
    setLocked(true);
  }, []);

  const modeOptions: { mode: FormationMode; name: string; desc: string; icon: string }[] = [
    { mode: 'fair', name: 'Fair Match', desc: 'Balance by win %', icon: '\u2696\uFE0F' },
    { mode: 'synergy', name: 'Best Synergy', desc: 'Highest team chemistry', icon: '\u26A1' },
    { mode: 'shake', name: 'Shake It Up', desc: 'Rare pairings first', icon: '\uD83C\uDF00' },
    { mode: 'random', name: 'Random', desc: 'Pure random', icon: '\uD83C\uDFB2' },
  ];

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
        <h1 className="text-[28px] font-bold text-text-primary">Teams</h1>
        <div className="flex gap-2">
          {(['form', 'records'] as View[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={[
                'px-4 py-2 rounded-lg text-[14px] font-semibold transition-colors',
                view === v ? 'bg-accent-blue text-white' : 'bg-surface-700 text-text-secondary hover:bg-surface-600',
              ].join(' ')}
            >
              {v === 'form' ? 'Form Teams' : 'Records'}
            </button>
          ))}
        </div>
      </div>

      {/* ---- FORMATION VIEW ---- */}
      {view === 'form' && (
        <div className="space-y-5">
          {/* Players in session */}
          <Card>
            <h2 className="text-[18px] font-bold text-text-primary mb-3">
              Players ({players.length})
            </h2>
            <div className="flex gap-3 flex-wrap">
              {players.map(p => (
                <div key={p.id} className="flex items-center gap-2 bg-surface-700 rounded-full px-4 py-2">
                  <div className="w-[28px] h-[28px] rounded-full" style={{ backgroundColor: p.color }} />
                  <span className="text-[16px] font-medium text-text-primary">{p.name}</span>
                </div>
              ))}
            </div>
            {players.length < 2 && (
              <p className="text-[14px] text-accent-red mt-2">Need at least 2 players</p>
            )}
            {players.length % 2 !== 0 && (
              <p className="text-[14px] text-accent-amber mt-2">Odd number of players - one will sit out</p>
            )}
          </Card>

          {/* Formation modes */}
          <Card>
            <h2 className="text-[18px] font-bold text-text-primary mb-3">Formation Mode</h2>
            <div className="grid grid-cols-2 gap-3">
              {modeOptions.map(opt => (
                <button
                  key={opt.mode}
                  onClick={() => setMode(opt.mode)}
                  className={[
                    'flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all',
                    mode === opt.mode
                      ? 'border-accent-blue bg-accent-blue/10'
                      : 'border-surface-500 bg-surface-700 hover:border-surface-400',
                  ].join(' ')}
                >
                  <span className="text-[28px]">{opt.icon}</span>
                  <span className="text-[16px] font-bold text-text-primary">{opt.name}</span>
                  <span className="text-[12px] text-text-muted">{opt.desc}</span>
                </button>
              ))}
            </div>
          </Card>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              fullWidth
              size="lg"
              disabled={players.length < 2 || forming}
              onClick={formTeams}
            >
              {pairings.length > 0 ? 'Shuffle Again' : 'Form Teams'}
            </Button>
            {pairings.length > 0 && !locked && (
              <Button fullWidth size="lg" variant="secondary" onClick={lockTeams}>
                Lock Teams
              </Button>
            )}
          </div>

          {/* Formed teams */}
          {pairings.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-[20px] font-bold text-text-primary">
                {locked ? 'Teams (Locked)' : 'Teams'}
              </h2>
              {pairings.map((pair, i) => (
                <Card
                  key={i}
                  glow={locked ? pair.team[0].color : undefined}
                >
                  <div className="flex items-center justify-center gap-4">
                    {/* Player 1 */}
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-[48px] h-[48px] rounded-full" style={{ backgroundColor: pair.team[0].color }} />
                      <span className="text-[16px] font-semibold text-text-primary">{pair.team[0].name}</span>
                    </div>

                    {/* Divider */}
                    <span className="text-[24px] text-text-muted font-bold">&</span>

                    {/* Player 2 */}
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-[48px] h-[48px] rounded-full" style={{ backgroundColor: pair.team[1].color }} />
                      <span className="text-[16px] font-semibold text-text-primary">{pair.team[1].name}</span>
                    </div>
                  </div>

                  {/* Stats if available */}
                  {pair.stats && (
                    <div className="flex justify-center gap-6 mt-3 text-[13px] text-text-muted">
                      <span>{pair.stats.gamesPlayed} games</span>
                      <span>{pair.stats.gamesWon} wins</span>
                      <span>Synergy: {pair.stats.synergyScore.toFixed(1)}</span>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---- RECORDS VIEW ---- */}
      {view === 'records' && (
        <div className="space-y-3">
          {records.length === 0 ? (
            <Card>
              <div className="text-center py-8">
                <span className="text-[48px] opacity-30">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto">
                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 00-3-3.87" />
                    <path d="M16 3.13a4 4 0 010 7.75" />
                  </svg>
                </span>
                <p className="text-[18px] text-text-muted mt-3">No team records yet</p>
                <p className="text-[14px] text-text-muted mt-1">Play team games to build records</p>
              </div>
            </Card>
          ) : (
            records
              .sort((a, b) => b.synergyScore - a.synergyScore)
              .map((rec, i) => (
              <Card key={rec.id}>
                <div className="flex items-center gap-4">
                  <span className={[
                    'text-[18px] font-bold w-[28px]',
                    i === 0 ? 'text-accent-amber' : i === 1 ? 'text-text-secondary' : i === 2 ? 'text-accent-orange' : 'text-text-muted',
                  ].join(' ')}>
                    #{i + 1}
                  </span>

                  <div className="flex items-center gap-2 flex-1">
                    <div className="w-[24px] h-[24px] rounded-full" style={{ backgroundColor: rec.player1.color }} />
                    <span className="text-[16px] font-medium text-text-primary">{rec.player1.name}</span>
                    <span className="text-text-muted">&</span>
                    <div className="w-[24px] h-[24px] rounded-full" style={{ backgroundColor: rec.player2.color }} />
                    <span className="text-[16px] font-medium text-text-primary">{rec.player2.name}</span>
                  </div>

                  <div className="text-right">
                    <div className="text-[18px] font-bold text-accent-green">{rec.gamesWon}/{rec.gamesPlayed}</div>
                    <div className="text-[12px] text-text-muted">
                      Synergy: {rec.synergyScore.toFixed(1)}
                    </div>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
