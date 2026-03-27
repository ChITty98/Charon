import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

/* ---- Types ---- */

interface OverallEntry {
  id: number;
  name: string;
  color: string;
  score: number;
  dartsWinPct: number;
  poolWinPct: number;
  triviaPct: number;
  bjWinPct: number;
  totalGames: number;
  sessions: number;
}

interface GameEntry {
  id: number;
  name: string;
  color: string;
  games: number;
  wins: number;
  winPct: number;
  stat: string;
  points?: number;
}

interface TonightEntry {
  id: number;
  name: string;
  color: string;
  gamesPlayed: number;
  gamesWon: number;
  drinks: Record<string, number>;
  totalDrinks: number;
  dartsPlayed: number;
  dartsWon: number;
  poolPlayed: number;
  poolWon: number;
  bjTotal: number;
  bjWins: number;
}

interface Achievement {
  id: number;
  player_id: number;
  achievement_key: string;
  game_type: string | null;
  value: string | null;
  unlocked_at: string;
  player_name: string;
  player_color: string;
}

type TabKey = 'overall' | 'darts' | 'pool' | 'trivia' | 'blackjack' | 'tonight' | 'achievements';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overall', label: 'Overall' },
  { key: 'darts', label: 'Darts' },
  { key: 'pool', label: 'Pool' },
  { key: 'trivia', label: 'Trivia' },
  { key: 'blackjack', label: 'Blackjack' },
  { key: 'tonight', label: 'Tonight' },
  { key: 'achievements', label: 'Achievements' },
];

const ACHIEVEMENT_LABELS: Record<string, { label: string; icon: string; description: string }> = {
  triple_crown: { label: 'Triple Crown', icon: '\u{1F451}', description: 'Win darts + pool + trivia in one session' },
  on_fire: { label: 'On Fire', icon: '\u{1F525}', description: '5+ game win streak in any game' },
  trivia_master: { label: 'Trivia Master', icon: '\u{1F9E0}', description: '80%+ correct in a trivia session (10+ questions)' },
  designated_driver: { label: 'Designated Driver', icon: '\u{1F697}', description: 'Most pellegrinos in a session' },
  iron_liver: { label: 'Iron Liver', icon: '\u{1F3CB}', description: '10+ drinks in a session' },
};

const DRINK_ICONS: Record<string, string> = {
  rocks_glass: '\u{1F943}',
  beer: '\u{1F37A}',
  pellegrino: '\u{1F4A7}',
};

function rankBadge(index: number): string {
  if (index === 0) return '\u{1F3C6}';
  if (index === 1) return '\u{1F948}';
  if (index === 2) return '\u{1F949}';
  return `#${index + 1}`;
}

/* ---- Component ---- */

export function Leaderboard() {
  const [activeTab, setActiveTab] = useState<TabKey>('overall');
  const [overallData, setOverallData] = useState<OverallEntry[]>([]);
  const [gameData, setGameData] = useState<GameEntry[]>([]);
  const [tonightData, setTonightData] = useState<TonightEntry[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    if (activeTab === 'overall') {
      api.get<OverallEntry[]>('/leaderboard/overall').then(setOverallData).catch(() => {}).finally(() => setLoading(false));
    } else if (activeTab === 'tonight') {
      api.get<TonightEntry[]>('/leaderboard/tonight').then(setTonightData).catch(() => {}).finally(() => setLoading(false));
    } else if (activeTab === 'achievements') {
      api.get<Achievement[]>('/achievements').then(setAchievements).catch(() => {}).finally(() => setLoading(false));
    } else {
      api.get<GameEntry[]>(`/leaderboard/${activeTab}`).then(setGameData).catch(() => {}).finally(() => setLoading(false));
    }
  }, [activeTab]);

  return (
    <div className="p-5 pb-8 max-w-2xl mx-auto animate-fade-in">
      <h1 className="text-[28px] font-bold text-text-primary mb-4">Leaderboard</h1>

      {/* Tab bar — scrollable */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-4 -mx-1 px-1 scrollbar-hide">
        {TABS.map((tab) => (
          <Button
            key={tab.key}
            variant={activeTab === tab.key ? 'primary' : 'secondary'}
            size="sm"
            className="shrink-0 whitespace-nowrap"
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-[200px]">
          <div className="text-text-secondary text-[20px] animate-pulse">Loading...</div>
        </div>
      ) : (
        <>
          {/* Overall tab */}
          {activeTab === 'overall' && (
            <div className="space-y-3">
              {overallData.length === 0 && (
                <p className="text-text-muted text-[18px] text-center py-8">
                  Play at least 3 games to appear on the leaderboard
                </p>
              )}
              {overallData.map((p, i) => (
                <Card key={p.id} glow={i === 0 ? '#FFD700' : undefined} padding="md">
                  <div className="flex items-center gap-4">
                    <div className="text-[28px] font-bold w-[48px] text-center shrink-0">
                      {rankBadge(i)}
                    </div>
                    <div
                      className="w-[48px] h-[48px] rounded-full shrink-0 flex items-center justify-center text-[20px] font-bold text-white"
                      style={{ backgroundColor: p.color }}
                    >
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-text-primary text-[20px] font-semibold truncate">{p.name}</div>
                      <div className="text-text-muted text-[14px]">
                        {p.totalGames} games &middot; {p.sessions} sessions
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-accent-amber text-[24px] font-bold">{p.score}</div>
                      <div className="text-text-muted text-[12px]">score</div>
                    </div>
                  </div>
                  {/* Breakdown bar */}
                  <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[12px]">
                    <div>
                      <div className="text-text-primary font-semibold text-[16px]">{p.dartsWinPct}%</div>
                      <div className="text-text-muted">Darts</div>
                    </div>
                    <div>
                      <div className="text-text-primary font-semibold text-[16px]">{p.poolWinPct}%</div>
                      <div className="text-text-muted">Pool</div>
                    </div>
                    <div>
                      <div className="text-text-primary font-semibold text-[16px]">{p.triviaPct}%</div>
                      <div className="text-text-muted">Trivia</div>
                    </div>
                    <div>
                      <div className="text-text-primary font-semibold text-[16px]">{p.bjWinPct}%</div>
                      <div className="text-text-muted">BJ</div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Per-game tabs */}
          {(activeTab === 'darts' || activeTab === 'pool' || activeTab === 'trivia' || activeTab === 'blackjack') && (
            <div className="space-y-3">
              {gameData.length === 0 && (
                <p className="text-text-muted text-[18px] text-center py-8">No games played yet</p>
              )}
              {gameData.map((p, i) => (
                <Card key={p.id} glow={i === 0 ? '#FFD700' : undefined} padding="md">
                  <div className="flex items-center gap-4">
                    <div className="text-[28px] font-bold w-[48px] text-center shrink-0">
                      {rankBadge(i)}
                    </div>
                    <div
                      className="w-[48px] h-[48px] rounded-full shrink-0 flex items-center justify-center text-[20px] font-bold text-white"
                      style={{ backgroundColor: p.color }}
                    >
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-text-primary text-[20px] font-semibold truncate">{p.name}</div>
                      <div className="text-text-muted text-[14px]">{p.stat}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-accent-green text-[22px] font-bold">{p.wins}W</div>
                      <div className="text-text-muted text-[13px]">{p.games} played</div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Tonight tab */}
          {activeTab === 'tonight' && (
            <div className="space-y-3">
              {tonightData.length === 0 && (
                <p className="text-text-muted text-[18px] text-center py-8">
                  No active session &mdash; start one from the dashboard
                </p>
              )}
              {tonightData.map((p, i) => (
                <Card key={p.id} glow={i === 0 && p.gamesWon > 0 ? '#FFD700' : undefined} padding="md">
                  <div className="flex items-center gap-4">
                    <div
                      className="w-[48px] h-[48px] rounded-full shrink-0 flex items-center justify-center text-[20px] font-bold text-white"
                      style={{ backgroundColor: p.color }}
                    >
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-text-primary text-[20px] font-semibold truncate">{p.name}</div>
                      <div className="text-text-muted text-[14px]">
                        {p.gamesPlayed} played &middot; {p.gamesWon} won
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-accent-amber text-[20px] font-bold">
                        {Object.entries(p.drinks).map(([type, count]) => (
                          <span key={type} className="ml-1">
                            {DRINK_ICONS[type] || type}{count}
                          </span>
                        ))}
                        {p.totalDrinks === 0 && <span className="text-text-muted text-[16px]">sober</span>}
                      </div>
                    </div>
                  </div>
                  {/* Game breakdown */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {p.dartsPlayed > 0 && (
                      <span className="px-3 py-1 rounded-full text-[13px] font-medium bg-surface-700 text-text-secondary">
                        {'\u{1F3AF}'} {p.dartsWon}/{p.dartsPlayed}
                      </span>
                    )}
                    {p.poolPlayed > 0 && (
                      <span className="px-3 py-1 rounded-full text-[13px] font-medium bg-surface-700 text-text-secondary">
                        {'\u{1F3B1}'} {p.poolWon}/{p.poolPlayed}
                      </span>
                    )}
                    {p.bjTotal > 0 && (
                      <span className="px-3 py-1 rounded-full text-[13px] font-medium bg-surface-700 text-text-secondary">
                        {'\u{1F0CF}'} {p.bjWins}/{p.bjTotal}
                      </span>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Achievements tab */}
          {activeTab === 'achievements' && (
            <div className="space-y-3">
              {achievements.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-text-muted text-[18px] mb-4">No achievements unlocked yet</p>
                  <div className="space-y-2">
                    {Object.entries(ACHIEVEMENT_LABELS).map(([key, ach]) => (
                      <div key={key} className="flex items-center gap-3 bg-surface-800 rounded-xl p-3 opacity-50">
                        <span className="text-[24px]">{ach.icon}</span>
                        <div className="flex-1">
                          <div className="text-text-secondary text-[16px] font-semibold">{ach.label}</div>
                          <div className="text-text-muted text-[13px]">{ach.description}</div>
                        </div>
                        <span className="text-text-muted text-[24px]">{'\u{1F512}'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {achievements.length > 0 && achievements.map((a) => {
                const def = ACHIEVEMENT_LABELS[a.achievement_key] || { label: a.achievement_key, icon: '\u{2B50}', description: '' };
                return (
                  <Card key={a.id} padding="md">
                    <div className="flex items-center gap-4">
                      <span className="text-[32px] shrink-0">{def.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-text-primary text-[18px] font-semibold">{def.label}</div>
                        <div className="text-text-muted text-[13px]">{def.description}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div
                          className="w-[32px] h-[32px] rounded-full flex items-center justify-center text-[14px] font-bold text-white"
                          style={{ backgroundColor: a.player_color }}
                        >
                          {a.player_name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-text-secondary text-[14px]">{a.player_name}</span>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
