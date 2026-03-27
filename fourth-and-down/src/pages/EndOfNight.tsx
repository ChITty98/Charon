import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';

/* ---- Types ---- */

interface GameBreakdown {
  darts: { played: number; won: number };
  pool: { played: number; won: number };
  blackjack: { played: number; won: number; busts: number };
  trivia: { answered: number; correct: number };
}

interface PlayerSummary {
  id: number;
  name: string;
  color: string;
  games: GameBreakdown;
  totalPlayed: number;
  totalWon: number;
  drinks: Record<string, number>;
  totalDrinks: number;
  highlight: string | null;
  lowlight: string | null;
  highlights: string[];
  lowlights: string[];
}

interface GroupSummary {
  totalGames: number;
  totalDrinks: number;
  mvp: { id: number; name: string; color: string; wins: number } | null;
  playerCount: number;
}

interface SessionSummary {
  session: { id: number; startedAt: string; endedAt: string | null; duration: number };
  players: PlayerSummary[];
  group: GroupSummary;
}

const DRINK_ICONS: Record<string, string> = {
  rocks_glass: '\u{1F943}',
  beer: '\u{1F37A}',
  pellegrino: '\u{1F4A7}',
};

const DRINK_LABELS: Record<string, string> = {
  rocks_glass: 'Old Fashioned',
  beer: 'Beer',
  pellegrino: 'Pellegrino',
};

/* ---- Component ---- */

export function EndOfNight() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    api.get<SessionSummary>(`/sessions/${sessionId || 'current'}/summary`)
      .then(setSummary)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalSlides = summary ? summary.players.length + 1 : 0; // +1 for group summary

  const advance = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % totalSlides);
  }, [totalSlides]);

  useEffect(() => {
    if (totalSlides === 0 || isPaused) return;
    const timer = setInterval(advance, 5000);
    return () => clearInterval(timer);
  }, [totalSlides, advance, isPaused]);

  const handleTap = () => {
    setIsPaused(true);
    advance();
    // Resume auto-advance after 10s of no tapping
    const timer = setTimeout(() => setIsPaused(false), 10000);
    return () => clearTimeout(timer);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-surface-900 flex items-center justify-center z-50">
        <div className="text-text-secondary text-[24px] animate-pulse">Loading recap...</div>
      </div>
    );
  }

  if (!summary || summary.players.length === 0) {
    return (
      <div className="fixed inset-0 bg-surface-900 flex flex-col items-center justify-center z-50 p-6">
        <p className="text-text-muted text-[20px] mb-6">No session data to recap</p>
        <Button variant="secondary" size="lg" onClick={() => navigate('/')}>
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const isGroupSlide = activeIndex >= summary.players.length;
  const player = !isGroupSlide ? summary.players[activeIndex] : null;
  const group = summary.group;

  return (
    <div
      className="fixed inset-0 bg-surface-900 z-50 flex flex-col items-center justify-center select-none"
      onClick={handleTap}
    >
      {/* Progress dots */}
      <div className="absolute top-6 left-0 right-0 flex justify-center gap-2">
        {Array.from({ length: totalSlides }).map((_, i) => (
          <div
            key={i}
            className={[
              'h-[4px] rounded-full transition-all duration-300',
              i === activeIndex ? 'w-[32px] bg-accent-blue' : 'w-[12px] bg-surface-600',
            ].join(' ')}
          />
        ))}
      </div>

      {/* Player card */}
      {player && (
        <div
          className="w-full max-w-md mx-auto px-6 animate-fade-in"
          key={`player-${player.id}-${activeIndex}`}
        >
          {/* Avatar + name */}
          <div className="flex flex-col items-center mb-8">
            <div
              className="w-[80px] h-[80px] rounded-full flex items-center justify-center text-[36px] font-bold text-white mb-3"
              style={{
                backgroundColor: player.color,
                boxShadow: `0 0 40px ${player.color}66`,
              }}
            >
              {player.name.charAt(0).toUpperCase()}
            </div>
            <h2 className="text-text-primary text-[28px] font-bold">{player.name}</h2>
          </div>

          {/* W-L record */}
          <div className="flex justify-center gap-6 mb-6">
            <div className="text-center">
              <div className="text-green-400 text-[36px] font-bold">{player.totalWon}</div>
              <div className="text-text-muted text-[14px]">Wins</div>
            </div>
            <div className="text-text-muted text-[36px] font-light">/</div>
            <div className="text-center">
              <div className="text-red-400 text-[36px] font-bold">{player.totalPlayed - player.totalWon}</div>
              <div className="text-text-muted text-[14px]">Losses</div>
            </div>
          </div>

          {/* Game breakdown */}
          <div className="space-y-2 mb-6">
            {player.games.darts.played > 0 && (
              <div className="flex items-center justify-between bg-surface-800 rounded-xl px-4 py-3">
                <span className="text-[20px]">{'\u{1F3AF}'}</span>
                <span className="text-text-secondary text-[16px]">Darts</span>
                <span className="text-text-primary text-[18px] font-semibold ml-auto">
                  {player.games.darts.won}W - {player.games.darts.played - player.games.darts.won}L
                </span>
              </div>
            )}
            {player.games.pool.played > 0 && (
              <div className="flex items-center justify-between bg-surface-800 rounded-xl px-4 py-3">
                <span className="text-[20px]">{'\u{1F3B1}'}</span>
                <span className="text-text-secondary text-[16px]">Pool</span>
                <span className="text-text-primary text-[18px] font-semibold ml-auto">
                  {player.games.pool.won}W - {player.games.pool.played - player.games.pool.won}L
                </span>
              </div>
            )}
            {player.games.blackjack.played > 0 && (
              <div className="flex items-center justify-between bg-surface-800 rounded-xl px-4 py-3">
                <span className="text-[20px]">{'\u{1F0CF}'}</span>
                <span className="text-text-secondary text-[16px]">Blackjack</span>
                <span className="text-text-primary text-[18px] font-semibold ml-auto">
                  {player.games.blackjack.won}W - {player.games.blackjack.played - player.games.blackjack.won}L
                </span>
              </div>
            )}
            {player.games.trivia.answered > 0 && (
              <div className="flex items-center justify-between bg-surface-800 rounded-xl px-4 py-3">
                <span className="text-[20px]">{'\u{1F9E0}'}</span>
                <span className="text-text-secondary text-[16px]">Trivia</span>
                <span className="text-text-primary text-[18px] font-semibold ml-auto">
                  {player.games.trivia.correct}/{player.games.trivia.answered} correct
                </span>
              </div>
            )}
          </div>

          {/* Drinks */}
          {player.totalDrinks > 0 && (
            <div className="flex justify-center gap-4 mb-6">
              {Object.entries(player.drinks).map(([type, count]) => (
                <div key={type} className="flex items-center gap-1 bg-surface-800 rounded-lg px-3 py-2">
                  <span className="text-[20px]">{DRINK_ICONS[type] || type}</span>
                  <span className="text-text-primary text-[18px] font-semibold">{count}</span>
                  <span className="text-text-muted text-[12px]">{DRINK_LABELS[type] || type}</span>
                </div>
              ))}
            </div>
          )}

          {/* Highlight / Lowlight */}
          {player.highlight && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 mb-2 text-center">
              <span className="text-green-400 text-[16px]">{'\u{2B50}'} {player.highlight}</span>
            </div>
          )}
          {player.lowlight && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-center">
              <span className="text-red-400 text-[16px]">{'\u{1F4A9}'} {player.lowlight}</span>
            </div>
          )}
        </div>
      )}

      {/* Group summary */}
      {isGroupSlide && (
        <div
          className="w-full max-w-md mx-auto px-6 animate-fade-in"
          key="group-summary"
        >
          <h2 className="text-text-primary text-[32px] font-bold text-center mb-8">
            {'\u{1F3C1}'} Tonight's Recap
          </h2>

          {/* MVP */}
          {group.mvp && (
            <div className="flex flex-col items-center mb-8">
              <div className="text-[16px] text-accent-amber font-semibold mb-2">
                {'\u{1F3C6}'} MVP
              </div>
              <div
                className="w-[64px] h-[64px] rounded-full flex items-center justify-center text-[28px] font-bold text-white mb-2"
                style={{
                  backgroundColor: group.mvp.color,
                  boxShadow: `0 0 30px ${group.mvp.color}66`,
                }}
              >
                {group.mvp.name.charAt(0).toUpperCase()}
              </div>
              <div className="text-text-primary text-[24px] font-bold">{group.mvp.name}</div>
              <div className="text-text-muted text-[16px]">{group.mvp.wins} wins</div>
            </div>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-surface-800 rounded-xl p-4 text-center">
              <div className="text-text-primary text-[28px] font-bold">{group.totalGames}</div>
              <div className="text-text-muted text-[14px]">Games</div>
            </div>
            <div className="bg-surface-800 rounded-xl p-4 text-center">
              <div className="text-text-primary text-[28px] font-bold">{group.totalDrinks}</div>
              <div className="text-text-muted text-[14px]">Drinks</div>
            </div>
            <div className="bg-surface-800 rounded-xl p-4 text-center">
              <div className="text-text-primary text-[28px] font-bold">{group.playerCount}</div>
              <div className="text-text-muted text-[14px]">Players</div>
            </div>
          </div>

          {/* Duration */}
          {summary.session.duration > 0 && (
            <div className="text-center text-text-muted text-[16px] mb-8">
              Session duration: {Math.floor(summary.session.duration / 60)}h {summary.session.duration % 60}m
            </div>
          )}
        </div>
      )}

      {/* Done button */}
      <div className="absolute bottom-8 left-0 right-0 flex justify-center">
        <Button
          variant="secondary"
          size="lg"
          onClick={(e) => {
            e.stopPropagation();
            navigate('/');
          }}
        >
          Done
        </Button>
      </div>

      {/* Tap hint */}
      <div className="absolute bottom-24 left-0 right-0 text-center">
        <span className="text-text-muted text-[13px] opacity-50">Tap to advance</span>
      </div>
    </div>
  );
}
