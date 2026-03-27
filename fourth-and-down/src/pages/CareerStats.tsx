import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Card } from '../components/ui/Card';

/* ---- Personal Records Types ---- */

interface PersonalRecord {
  id: number;
  player_id: number;
  record_type: string;
  game_type: string;
  value: number;
  detail: string | null;
  set_at: string;
}

/* ---- Types ---- */

interface H2HRecord {
  oppId: number;
  oppName: string;
  oppColor: string;
  wins: number;
  losses: number;
  total: number;
}

interface PlayerStats {
  id: number;
  name: string;
  color: string;
  sessions: number;
  darts: {
    games: number;
    wins: number;
    winPct: number;
    favoriteGame: string | null;
    recentForm: string[];
  };
  pool: {
    games: number;
    wins: number;
    winPct: number;
  };
  blackjack: {
    hands: number;
    breakdown: Record<string, number>;
  };
  trivia: {
    games: number;
    questions: number;
    correct: number;
    correctPct: number;
    totalPoints: number;
    avgResponseMs: number;
    categories: { category: string; total: number; correct: number; pct: number }[];
  };
  drinks: Record<string, number>;
  drinkCorrelation?: {
    darts?: { drinks: number; games: number; wins: number }[];
  };
  h2h: {
    darts: H2HRecord[];
    pool: H2HRecord[];
  };
}

/* ---- Helpers ---- */

const DRINK_LABELS: Record<string, string> = {
  rocks_glass: 'Old Fashioned',
  beer: 'Beer',
  pellegrino: 'Pellegrino',
};

const DRINK_ICONS: Record<string, string> = {
  rocks_glass: '\u{1F943}',
  beer: '\u{1F37A}',
  pellegrino: '\u{1F4A7}',
};

const RECORD_LABELS: Record<string, string> = {
  highest_ppr: 'Highest PPR',
  highest_mpr: 'Highest MPR',
  longest_win_streak: 'Longest Win Streak',
  most_bullseyes_game: 'Most Bullseyes (Game)',
  highest_score: 'Highest Score',
  best_correct_pct: 'Best Correct %',
  fastest_correct_answer: 'Fastest Answer',
  most_wins_session: 'Most Wins (Session)',
};

function FormPills({ form }: { form: string[] }) {
  if (form.length === 0) return null;
  return (
    <div className="flex gap-1 mt-1">
      {form.map((r, i) => (
        <span
          key={i}
          className={[
            'w-[22px] h-[22px] rounded-full text-[11px] font-bold flex items-center justify-center',
            r === 'W'
              ? 'bg-green-500/20 text-green-400'
              : 'bg-red-500/20 text-red-400',
          ].join(' ')}
        >
          {r}
        </span>
      ))}
    </div>
  );
}

/* ---- Component ---- */

export function CareerStats() {
  const [stats, setStats] = useState<PlayerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [records, setRecords] = useState<Record<number, PersonalRecord[]>>({});

  useEffect(() => {
    api
      .get<PlayerStats[]>('/career-stats')
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Fetch personal records when a player card is expanded
  useEffect(() => {
    if (expandedId && !records[expandedId]) {
      api.get<PersonalRecord[]>(`/records/${expandedId}`)
        .then(recs => setRecords(prev => ({ ...prev, [expandedId]: recs })))
        .catch(() => {});
    }
  }, [expandedId, records]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-text-secondary text-[20px] animate-pulse">Loading...</div>
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-text-secondary text-[18px]">No players yet</p>
      </div>
    );
  }

  return (
    <div className="p-5 pb-8 space-y-5 max-w-2xl mx-auto animate-fade-in">
      <h1 className="text-[28px] font-bold text-text-primary">Career Stats</h1>

      {stats.map((p) => {
        const expanded = expandedId === p.id;
        const hasAnyStats =
          p.darts.games > 0 ||
          p.pool.games > 0 ||
          p.blackjack.hands > 0 ||
          (p.trivia && p.trivia.questions > 0) ||
          Object.keys(p.drinks).length > 0;

        return (
          <Card key={p.id} padding="none" className="overflow-hidden">
            {/* Header — always visible */}
            <button
              onClick={() => setExpandedId(expanded ? null : p.id)}
              className="w-full flex items-center gap-4 p-4 text-left"
            >
              <div
                className="w-[52px] h-[52px] rounded-full shrink-0 flex items-center justify-center text-[22px] font-bold text-white"
                style={{ backgroundColor: p.color }}
              >
                {p.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-text-primary text-[20px] font-semibold truncate">
                  {p.name}
                </div>
                <div className="text-text-muted text-[14px]">
                  {p.sessions} session{p.sessions !== 1 ? 's' : ''}
                  {!hasAnyStats && ' \u2014 no games yet'}
                </div>
              </div>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className={`text-text-muted transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {/* Expanded detail */}
            {expanded && hasAnyStats && (
              <div className="border-t border-surface-600 p-4 space-y-5">
                {/* Darts */}
                {p.darts.games > 0 && (
                  <section>
                    <h3 className="text-[16px] font-semibold text-text-primary mb-2 flex items-center gap-2">
                      <span className="text-[20px]">{'\u{1F3AF}'}</span> Darts
                    </h3>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <StatBox label="Played" value={p.darts.games} />
                      <StatBox label="Wins" value={p.darts.wins} />
                      <StatBox label="Win %" value={`${p.darts.winPct}%`} />
                    </div>
                    {p.darts.favoriteGame && (
                      <div className="mt-2 text-text-muted text-[13px]">
                        Favorite: <span className="text-text-secondary">{p.darts.favoriteGame}</span>
                      </div>
                    )}
                    {p.darts.recentForm.length > 0 && (
                      <div className="mt-2">
                        <span className="text-text-muted text-[13px]">Last {p.darts.recentForm.length}: </span>
                        <FormPills form={p.darts.recentForm} />
                      </div>
                    )}
                  </section>
                )}

                {/* Pool */}
                {p.pool.games > 0 && (
                  <section>
                    <h3 className="text-[16px] font-semibold text-text-primary mb-2 flex items-center gap-2">
                      <span className="text-[20px]">{'\u{1F3B1}'}</span> Pool
                    </h3>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <StatBox label="Played" value={p.pool.games} />
                      <StatBox label="Wins" value={p.pool.wins} />
                      <StatBox label="Win %" value={`${p.pool.winPct}%`} />
                    </div>
                  </section>
                )}

                {/* Blackjack */}
                {p.blackjack.hands > 0 && (
                  <section>
                    <h3 className="text-[16px] font-semibold text-text-primary mb-2 flex items-center gap-2">
                      <span className="text-[20px]">{'\u{1F0CF}'}</span> Blackjack
                    </h3>
                    <div className="text-text-muted text-[14px] mb-2">
                      {p.blackjack.hands} hand{p.blackjack.hands !== 1 ? 's' : ''} played
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(['win', 'blackjack', 'push', 'loss', 'bust'] as const).map((r) => {
                        const count = p.blackjack.breakdown[r] || 0;
                        if (count === 0) return null;
                        const colors: Record<string, string> = {
                          win: 'bg-green-500/20 text-green-400',
                          blackjack: 'bg-yellow-500/20 text-yellow-400',
                          push: 'bg-blue-500/20 text-blue-300',
                          loss: 'bg-red-500/20 text-red-400',
                          bust: 'bg-red-800/20 text-red-500',
                        };
                        return (
                          <span
                            key={r}
                            className={`px-3 py-1 rounded-full text-[13px] font-medium ${colors[r]}`}
                          >
                            {r === 'blackjack' ? 'BJ' : r.charAt(0).toUpperCase() + r.slice(1)} {count}
                          </span>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* Trivia */}
                {p.trivia && p.trivia.questions > 0 && (
                  <section>
                    <h3 className="text-[16px] font-semibold text-text-primary mb-2 flex items-center gap-2">
                      <span className="text-[20px]">{'\u{1F9E0}'}</span> Trivia
                    </h3>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div className="bg-surface-700 rounded-lg p-2 text-center">
                        <div className="text-text-primary text-[18px] font-bold">{p.trivia.games}</div>
                        <div className="text-text-muted text-[11px]">Games</div>
                      </div>
                      <div className="bg-surface-700 rounded-lg p-2 text-center">
                        <div className="text-accent-green text-[18px] font-bold">{p.trivia.correctPct}%</div>
                        <div className="text-text-muted text-[11px]">{p.trivia.correct}/{p.trivia.questions}</div>
                      </div>
                      <div className="bg-surface-700 rounded-lg p-2 text-center">
                        <div className="text-accent-amber text-[18px] font-bold">{p.trivia.totalPoints.toLocaleString()}</div>
                        <div className="text-text-muted text-[11px]">Points</div>
                      </div>
                    </div>
                    {p.trivia.avgResponseMs > 0 && (
                      <div className="text-text-muted text-[13px] mb-2">
                        Avg response: {(p.trivia.avgResponseMs / 1000).toFixed(1)}s
                      </div>
                    )}
                    {p.trivia.categories.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-text-secondary text-[12px] font-semibold uppercase tracking-wider">Best Categories</div>
                        {p.trivia.categories.slice(0, 5).map(cat => (
                          <div key={cat.category} className="flex items-center justify-between text-[13px]">
                            <span className="text-text-primary">{cat.category}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-text-muted">{cat.correct}/{cat.total}</span>
                              <span className={cat.pct >= 70 ? 'text-accent-green font-bold' : cat.pct >= 40 ? 'text-accent-amber' : 'text-accent-red'}>
                                {cat.pct}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                {/* Drinks */}
                {Object.keys(p.drinks).length > 0 && (
                  <section>
                    <h3 className="text-[16px] font-semibold text-text-primary mb-2 flex items-center gap-2">
                      <span className="text-[20px]">{'\u{1F943}'}</span> Drinks (All-Time)
                    </h3>
                    <div className="flex flex-wrap gap-3">
                      {Object.entries(p.drinks).map(([type, count]) => (
                        <div key={type} className="flex items-center gap-2 bg-surface-700 rounded-lg px-3 py-2">
                          <span className="text-[18px]">{DRINK_ICONS[type] || type}</span>
                          <span className="text-text-secondary text-[14px]">
                            {DRINK_LABELS[type] || type}
                          </span>
                          <span className="text-text-primary text-[16px] font-semibold">{count}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Head-to-Head */}
                {(p.h2h.darts.length > 0 || p.h2h.pool.length > 0) && (
                  <section>
                    <h3 className="text-[16px] font-semibold text-text-primary mb-3">
                      Head-to-Head
                    </h3>

                    {p.h2h.darts.length > 0 && (
                      <div className="mb-3">
                        <div className="text-text-muted text-[13px] mb-2">Darts</div>
                        <div className="space-y-2">
                          {p.h2h.darts.map((h) => (
                            <H2HRow key={h.oppId} record={h} />
                          ))}
                        </div>
                      </div>
                    )}

                    {p.h2h.pool.length > 0 && (
                      <div>
                        <div className="text-text-muted text-[13px] mb-2">Pool</div>
                        <div className="space-y-2">
                          {p.h2h.pool.map((h) => (
                            <H2HRow key={h.oppId} record={h} />
                          ))}
                        </div>
                      </div>
                    )}
                  </section>
                )}

                {/* Personal Records */}
                {records[p.id] && records[p.id].length > 0 && (
                  <section>
                    <h3 className="text-[16px] font-semibold text-text-primary mb-2 flex items-center gap-2">
                      <span className="text-[20px]">{'\u{1F3C6}'}</span> Personal Records
                    </h3>
                    <div className="space-y-2">
                      {records[p.id].map((rec) => (
                        <div key={rec.id} className="flex items-center justify-between bg-surface-700 rounded-lg px-3 py-2">
                          <div>
                            <div className="text-text-secondary text-[14px] font-medium">
                              {RECORD_LABELS[rec.record_type] || rec.record_type.replace(/_/g, ' ')}
                            </div>
                            <div className="text-text-muted text-[11px] capitalize">{rec.game_type}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-accent-amber text-[16px] font-bold">
                              {rec.detail || rec.value}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/* ---- Subcomponents ---- */

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface-700 rounded-lg py-2 px-3">
      <div className="text-text-primary text-[20px] font-bold">{value}</div>
      <div className="text-text-muted text-[12px]">{label}</div>
    </div>
  );
}

function H2HRow({ record }: { record: H2HRecord }) {
  const winPct = record.total > 0 ? Math.round((record.wins / record.total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 bg-surface-700 rounded-lg px-3 py-2">
      <div
        className="w-[28px] h-[28px] rounded-full shrink-0 flex items-center justify-center text-[13px] font-bold text-white"
        style={{ backgroundColor: record.oppColor }}
      >
        {record.oppName.charAt(0).toUpperCase()}
      </div>
      <span className="text-text-secondary text-[14px] flex-1 truncate">{record.oppName}</span>
      <span className="text-green-400 text-[14px] font-semibold">{record.wins}W</span>
      <span className="text-text-muted text-[12px]">-</span>
      <span className="text-red-400 text-[14px] font-semibold">{record.losses}L</span>
      <span className="text-text-muted text-[12px] ml-1">({winPct}%)</span>
    </div>
  );
}
