import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api';
import { useSocket } from '../lib/socket';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import {
  customCategories,
  otdbCategories,
  type TriviaCategory,
} from '../data/triviaCategories';
import { pushOverride, popOverride, type QueueSong } from '../lib/music';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

interface Player {
  id: number;
  name: string;
  color: string;
}

interface TriviaQuestion {
  question: string;
  answers: string[];
  correct_answer?: string; // only present for revealed questions
  category: string;
  difficulty: string;
  source?: string; // 'api' (OpenTDB), 'ai' (generated), 'custom' (user-added)
}

interface TriviaState {
  id: string;
  questions: TriviaQuestion[];
  currentIndex: number;
  scores: Record<number, number>; // playerId -> score
  answers: Record<number, Record<number, { answer: string; isCorrect: boolean; points: number; responseTimeMs: number }>>;
  phase: 'active' | 'ended';
  timerSeconds: number;
  timerEnd: string | null;
  revealed: boolean;
  questionCount: number;
}

type GameView = 'setup' | 'game' | 'results';
type GamePhase = 'question' | 'playerTurn' | 'reveal' | 'scores';

/* ---- Answer quadrant colors ---- */
const ANSWER_COLORS = ['#3b82f6', '#22c55e', '#f97316', '#ec4899']; // A=blue, B=green, C=orange, D=pink
const ANSWER_LABELS = ['A', 'B', 'C', 'D'];

/* ---- John Wick CSS animations & custom elements ---- */
const JW_STYLES = `
@keyframes jw-neon-flicker {
  0%, 100% { opacity: 1; }
  92% { opacity: 1; }
  93% { opacity: 0.3; }
  94% { opacity: 1; }
  96% { opacity: 0.7; }
  97% { opacity: 1; }
}
@keyframes jw-pulse-red {
  0%, 100% { box-shadow: 0 0 20px rgba(255,0,0,0.3), inset 0 0 60px rgba(255,0,0,0.05); }
  50% { box-shadow: 0 0 40px rgba(255,0,0,0.5), inset 0 0 80px rgba(255,0,0,0.1); }
}
@keyframes jw-vignette-pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 0.8; }
}
@keyframes jw-gold-shine {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}
@keyframes jw-slide-in {
  0% { transform: translateY(20px); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}
`;

/* Gold coin SVG for score display */
function GoldCoin({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="11" fill="url(#coinGrad)" stroke="#8B6914" strokeWidth="1.5"/>
      <circle cx="12" cy="12" r="8" fill="none" stroke="#8B6914" strokeWidth="0.5" opacity="0.5"/>
      <text x="12" y="16" textAnchor="middle" fill="#8B6914" fontSize="10" fontWeight="bold" fontFamily="serif">W</text>
      <defs>
        <radialGradient id="coinGrad" cx="0.35" cy="0.35" r="0.65">
          <stop offset="0%" stopColor="#FFD700"/>
          <stop offset="50%" stopColor="#DAA520"/>
          <stop offset="100%" stopColor="#B8860B"/>
        </radialGradient>
      </defs>
    </svg>
  );
}

/* JW-themed decorative separator */
function JWDivider() {
  return (
    <div className="flex items-center justify-center gap-3 py-1" style={{ opacity: 0.3 }}>
      <div style={{ width: 40, height: 1, background: 'linear-gradient(90deg, transparent, #ff0000)' }}/>
      <span style={{ color: '#ff0000', fontSize: 8 }}>{'\u2666'}</span>
      <div style={{ width: 40, height: 1, background: 'linear-gradient(90deg, #ff0000, transparent)' }}/>
    </div>
  );
}

/* ---- John Wick catchphrases with movie reference ---- */
const JW_QUOTES: { text: string; film: string }[] = [
  // ---- Chapter 1 (2014) ----
  { text: 'Yeah.', film: 'Ch. 1' },
  { text: 'I\'m thinking I\'m back.', film: 'Ch. 1' },
  { text: 'It\'s not what you did, son. It\'s who you did it to.', film: 'Ch. 1' },
  { text: 'A man of focus, commitment, sheer will.', film: 'Ch. 1' },
  { text: 'He was the one you sent to kill the Boogeyman.', film: 'Ch. 1' },
  { text: 'I once saw him kill three men... with a pencil.', film: 'Ch. 1' },
  { text: 'The stories have been watered down.', film: 'Ch. 1' },
  { text: 'Noise complaint?', film: 'Ch. 1' },
  { text: 'Evening, Jimmy.', film: 'Ch. 1' },
  { text: 'People keep asking if I\'m back.', film: 'Ch. 1' },
  { text: 'John will come for you. And you will do nothing.', film: 'Ch. 1' },
  { text: 'They call him Baba Yaga.', film: 'Ch. 1' },
  { text: 'That nobody... is John Wick.', film: 'Ch. 1' },
  { text: 'I\'ll kill them. I\'ll kill them all.', film: 'Ch. 1' },
  { text: 'You stabbed the devil in the back.', film: 'Ch. 1' },
  { text: 'This isn\'t vengeance. This is justice.', film: 'Ch. 1' },
  { text: 'He was an associate of ours.', film: 'Ch. 1' },
  // ---- Chapter 2 (2017) ----
  { text: 'You working again, John?', film: 'Ch. 2' },
  { text: 'You don\'t want me owing you.', film: 'Ch. 2' },
  { text: 'Consider this a professional courtesy.', film: 'Ch. 2' },
  { text: 'Somebody please get this man a gun.', film: 'Ch. 2' },
  { text: 'Rules. Without them, we live with the animals.', film: 'Ch. 2' },
  { text: 'What did he say? ...Enough.', film: 'Ch. 2' },
  { text: 'You wanted me back. I\'m back.', film: 'Ch. 2' },
  { text: 'Are you pissed, John?', film: 'Ch. 2' },
  { text: 'Consequences.', film: 'Ch. 2' },
  { text: 'Under the table or on top of it.', film: 'Ch. 2' },
  // ---- Chapter 3: Parabellum (2019) ----
  { text: 'Si vis pacem, para bellum.', film: 'Ch. 3' },
  { text: 'Guns. Lots of guns.', film: 'Ch. 3' },
  { text: 'Tell them all. Whoever comes, I\'ll kill them all.', film: 'Ch. 3' },
  { text: 'He\'s the one you send to kill the Boogeyman.', film: 'Ch. 3' },
  { text: 'You want a war, or just give me a gun?', film: 'Ch. 3' },
  { text: 'Be seeing you.', film: 'Ch. 3' },
  { text: 'I have served. I will be of service.', film: 'Ch. 3' },
  // ---- Chapter 4 (2023) ----
  { text: 'How you do anything is how you do everything.', film: 'Ch. 4' },
  { text: 'Friendship means little when it\'s convenient.', film: 'Ch. 4' },
  { text: 'People don\'t change. Times, they do.', film: 'Ch. 4' },
  { text: 'Those who cling to death, live.', film: 'Ch. 4' },
  { text: 'Fools talk. Cowards are silent. Wise men listen.', film: 'Ch. 4' },
  { text: 'Finally, something we can agree on.', film: 'Ch. 4' },
  { text: 'A good death only comes after a good life.', film: 'Ch. 4' },
  { text: 'No one escapes the Table.', film: 'Ch. 4' },
  { text: 'The Baba Yaga.', film: 'Ch. 4' },
];

function getJWQuote(seed: number): { text: string; film: string } {
  return JW_QUOTES[seed % JW_QUOTES.length];
}

/* ---- Category themes ---- */
interface CategoryTheme {
  bg: string;       // background color/gradient
  accent: string;   // primary accent
  accent2: string;  // secondary accent
  text: string;     // text color override
  answerColors: string[]; // themed answer button colors
  icon: string;     // decorative icon
  name: string;     // display name
  headerStyle?: React.CSSProperties; // extra header styles
  questionStyle?: React.CSSProperties; // extra question text styles
  timerBarBg?: string; // custom timer bar background
}

const CATEGORY_THEMES: Record<string, CategoryTheme> = {
  'custom-john-wick': {
    bg: 'linear-gradient(180deg, #000000 0%, #1a0000 20%, #0d0000 50%, #001111 80%, #000000 100%)',
    accent: '#ff0000',   // hard neon red
    accent2: '#00ffcc',  // neon teal/cyan
    text: '#ffffff',
    answerColors: ['#b91c1c', '#0d9488', '#7c3aed', '#c2410c'], // deep red, teal, purple, burnt orange
    icon: '\uD83D\uDDE1\uFE0F', // dagger
    name: 'JOHN WICK',
    headerStyle: {
      background: 'linear-gradient(90deg, transparent 0%, rgba(255,0,0,0.12) 20%, rgba(0,255,204,0.08) 50%, rgba(255,0,0,0.12) 80%, transparent 100%)',
      borderBottom: '1px solid rgba(255,0,0,0.4)',
      borderTop: '1px solid rgba(0,255,204,0.2)',
    },
    questionStyle: {
      textShadow: '0 0 30px rgba(255,0,0,0.15)',
    },
    timerBarBg: 'linear-gradient(90deg, #1a0000, #0d0d0d)',
  },
  'custom-vikings': {
    bg: 'linear-gradient(180deg, #1a0a2e 0%, #2d1052 50%, #1a0a2e 100%)',
    accent: '#fbbf24',   // gold
    accent2: '#7c3aed',  // purple
    text: '#f5f5f5',
    answerColors: ['#7c3aed', '#fbbf24', '#dc2626', '#22c55e'],
    icon: '\u2694\uFE0F', // swords
    name: 'Minnesota Vikings',
  },
  'custom-packers': {
    bg: 'linear-gradient(180deg, #0a1a0a 0%, #14291a 50%, #0a1a0a 100%)',
    accent: '#fbbf24',   // gold/yellow
    accent2: '#16a34a',  // green
    text: '#f5f5f5',
    answerColors: ['#16a34a', '#fbbf24', '#dc2626', '#3b82f6'],
    icon: '\uD83E\uDDC0', // cheese
    name: 'Green Bay Packers',
  },
  'custom-nfc-north': {
    bg: 'linear-gradient(180deg, #0a0f1a 0%, #1a1a2e 50%, #0a0f1a 100%)',
    accent: '#f59e0b',   // amber/gold
    accent2: '#3b82f6',  // blue
    text: '#f5f5f5',
    answerColors: ['#3b82f6', '#22c55e', '#f97316', '#ec4899'],
    icon: '\uD83C\uDFC8', // football
    name: 'NFC North',
  },
  'custom-gophers': {
    bg: 'linear-gradient(180deg, #1a0508 0%, #3d0c14 50%, #1a0508 100%)',
    accent: '#fbbf24',   // gold
    accent2: '#991b1b',  // maroon
    text: '#f5f5f5',
    answerColors: ['#991b1b', '#fbbf24', '#1d4ed8', '#16a34a'],
    icon: '\uD83D\uDC3F\uFE0F', // chipmunk
    name: 'MN Gophers',
  },
};

function getActiveTheme(categories: Set<string>): CategoryTheme | null {
  // If exactly one themed category is selected, use its theme
  const themed = Array.from(categories).filter(c => CATEGORY_THEMES[c]);
  if (themed.length === 1) return CATEGORY_THEMES[themed[0]];
  // If multiple themed categories, no special theme
  return null;
}

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */

export function Trivia() {
  /* ---- Top-level state ---- */
  const [view, setView] = useState<GameView>('setup');
  const [sessionPlayers, setSessionPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  // Shuffle player order for fair turn rotation
  const shufflePlayerOrder = useCallback(() => {
    const indices = sessionPlayers.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    setPlayerOrder(indices);
    setCurrentPlayerIdx(0);
  }, [sessionPlayers]);

  // Historical trivia stats
  const [triviaHistory, setTriviaHistory] = useState<Record<string, { games: number; highScore: number | null; avgScore: number | null; bestPct: number | null; avgPct: number | null }>>({});

  /* ---- Setup state ---- */
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard' | 'mixed'>('mixed');
  const [questionCount, setQuestionCount] = useState(15);
  const [timerSeconds, setTimerSeconds] = useState(20);

  /* ---- Game state ---- */
  const [, setGameId] = useState<string | null>(null);
  const [triviaState, setTriviaState] = useState<TriviaState | null>(null);
  const [phase, setPhase] = useState<GamePhase>('question');
  const [timeLeft, setTimeLeft] = useState(0);
  const [localScores, setLocalScores] = useState<Record<number, number>>({});
  const [localCorrect, setLocalCorrect] = useState<Record<number, number>>({});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const questionStartRef = useRef<number>(0);

  /* ---- Surface-only answer state ---- */
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);
  const [playerOrder, setPlayerOrder] = useState<number[]>([]); // shuffled indices into sessionPlayers
  const [playerAnswers, setPlayerAnswers] = useState<Map<number, { answer: string; answerIdx: number; isCorrect: boolean; points: number }>>(new Map());
  const [revealedCorrect, setRevealedCorrect] = useState<string | null>(null);
  const [readyPlayerIds, setReadyPlayerIds] = useState<Set<number>>(new Set());

  // Active theme based on selected categories
  const activeTheme = getActiveTheme(selectedCategories);
  const themeAnswerColors = activeTheme?.answerColors || ANSWER_COLORS;

  /* ---- Load players from tonight's session ---- */
  useEffect(() => {
    (async () => {
      try {
        const sp = await api.get<Player[]>('/sessions/current/players');
        setSessionPlayers(sp);
      } catch {
        // No active session
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ---- Socket listeners ---- */
  useSocket('trivia:start', () => {
    // Another client started a game — fetch state
    fetchGameState();
  });

  useSocket('trivia:question', () => {
    fetchGameState();
  });

  useSocket('trivia:reveal', () => {
    fetchGameState();
  });

  // Listen for answers from phones — update Surface playerAnswers state
  useSocket<{ playerId: number; questionIndex: number; isCorrect: boolean; points: number; totalScore: number }>('trivia:answer', (data) => {
    if (!triviaState || data.questionIndex !== triviaState.currentIndex) return;
    setPlayerAnswers(prev => {
      const next = new Map(prev);
      if (!next.has(data.playerId)) {
        next.set(data.playerId, { answer: '', answerIdx: -1, isCorrect: data.isCorrect, points: data.points });
      }
      return next;
    });
    setLocalScores(prev => ({ ...prev, [data.playerId]: data.totalScore }));
    if (data.isCorrect) {
      setLocalCorrect(prev => ({ ...prev, [data.playerId]: (prev[data.playerId] || 0) + 1 }));
    }
  });

  useSocket('trivia:end', () => {
    fetchGameState();
  });

  /* ---- Fetch game state from server ---- */
  const fetchGameState = useCallback(async () => {
    try {
      const state = await api.get<TriviaState | null>('/trivia/state');
      if (state) {
        setTriviaState(state);
        if (state.scores) setLocalScores(state.scores);
      }
      return state;
    } catch {
      return null;
    }
  }, []);

  /* ---- Timer logic ---- */
  const startTimer = useCallback(() => {
    stopTimer();
    setTimeLeft(timerSeconds);
    questionStartRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          stopTimer();
          // Auto-reveal when timer hits 0
          api.post('/trivia/reveal').catch(() => {});
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  }, [timerSeconds]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => stopTimer(), [stopTimer]);

  /* ---- Category toggle ---- */
  const toggleCategory = (id: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /* ---- Start game ---- */
  const startGame = async () => {
    if (selectedCategories.size === 0) return;
    try {
      const res = await api.post<{ id: string; questionCount: number }>('/trivia/start', {
        categories: Array.from(selectedCategories),
        difficulty,
        questionCount,
        timerSeconds,
      });
      setGameId(res.id);

      // Fetch the full game state (with questions)
      const state = await fetchGameState();
      if (state) {
        setTriviaState(state);
        setLocalScores({});
        setLocalCorrect({});
        setView('game');
        setPhase('playerTurn');
        shufflePlayerOrder();
        setPlayerAnswers(new Map());
        setRevealedCorrect(null);
        setReadyPlayerIds(new Set());
        startTimer();

        // Trigger category music if configured
        const catNames = Array.from(selectedCategories).map(id => {
          const cat = [...customCategories, ...otdbCategories].find(c => c.id === id);
          return cat?.name;
        }).filter(Boolean);
        // Try each selected category for music
        for (const catName of catNames) {
          try {
            const songs = await api.get<Array<{ song_id: string; title: string; artist: string; artwork_url: string }>>(`/music/game/trivia?categoryKey=${encodeURIComponent(catName!)}`);
            if (songs.length > 0) {
              const queueSongs: QueueSong[] = songs.map(s => ({
                songId: s.song_id,
                title: s.title,
                artist: s.artist || '',
                artworkUrl: s.artwork_url || '',
              }));
              pushOverride(queueSongs, true);
              break; // Use first category with music
            }
          } catch { /* no music configured */ }
        }
      }
    } catch (err) {
      console.error('Failed to start trivia:', err);
    }
  };

  /* ---- Submit answer for a player (Surface-only) ---- */
  const submitPlayerAnswer = async (playerId: number, answerText: string, answerIdx: number) => {
    if (!triviaState) return;
    const responseTimeMs = Date.now() - questionStartRef.current;

    try {
      const res = await api.post<{ isCorrect: boolean; points: number; totalScore: number }>('/trivia/answer', {
        playerId,
        questionIndex: triviaState.currentIndex,
        answer: answerText,
        responseTimeMs,
      });

      setPlayerAnswers((prev) => {
        const next = new Map(prev);
        next.set(playerId, { answer: answerText, answerIdx, isCorrect: res.isCorrect, points: res.points });
        return next;
      });

      setLocalScores((prev) => ({ ...prev, [playerId]: res.totalScore }));
      if (res.isCorrect) {
        setLocalCorrect((prev) => ({ ...prev, [playerId]: (prev[playerId] || 0) + 1 }));
      }

      // Move to next player or finish question
      const nextIdx = currentPlayerIdx + 1;
      if (nextIdx < sessionPlayers.length) {
        setCurrentPlayerIdx(nextIdx);
      } else {
        // All players answered — reveal
        stopTimer();
        await revealAnswer();
      }
    } catch (err) {
      console.error('Answer submit failed:', err);
      // Still advance to avoid getting stuck
      const nextIdx = currentPlayerIdx + 1;
      if (nextIdx < sessionPlayers.length) {
        setCurrentPlayerIdx(nextIdx);
      } else {
        stopTimer();
        await revealAnswer();
      }
    }
  };

  // Listen for player ready signals from phones
  useSocket<{ playerId: number; readyCount: number }>('trivia:player-ready', (data) => {
    setReadyPlayerIds(prev => new Set(prev).add(data.playerId));
  });

  // Auto-advance when all players are ready
  useEffect(() => {
    if (phase === 'reveal' && sessionPlayers.length > 0 && readyPlayerIds.size >= sessionPlayers.length) {
      // 3 second pause so everyone can see the answer and ratings before advancing
      const t = setTimeout(() => nextQuestion(), 3000);
      return () => clearTimeout(t);
    }
  }, [readyPlayerIds.size, phase, sessionPlayers.length]);

  // Auto-reveal when all players have answered (including phone answers)
  useEffect(() => {
    if (phase === 'playerTurn' && sessionPlayers.length > 0 && playerAnswers.size >= sessionPlayers.length) {
      stopTimer();
      revealAnswer();
    }
  }, [playerAnswers.size, phase, sessionPlayers.length]);

  /* ---- Timer expired — reveal without all answers ---- */
  const handleTimerExpired = useCallback(async () => {
    stopTimer();
    await revealAnswer();
  }, [triviaState]);

  // When timeLeft hits 0 during playerTurn, reveal
  useEffect(() => {
    if (timeLeft === 0 && phase === 'playerTurn' && triviaState) {
      handleTimerExpired();
    }
  }, [timeLeft, phase]);

  /* ---- Reveal answer ---- */
  const revealAnswer = async () => {
    try {
      const res = await api.post<{ correct_answer: string; scores: Record<number, number> }>('/trivia/reveal');
      setRevealedCorrect(res.correct_answer);
      if (res.scores) setLocalScores(res.scores);
      setPhase('reveal');
    } catch {
      // If reveal fails, just transition anyway
      setPhase('reveal');
    }
  };

  /* ---- Next question ---- */
  const nextQuestion = async () => {
    try {
      const res = await api.post<{ phase: string; currentIndex?: number; scores?: Record<number, number> }>('/trivia/next');
      if (res.scores) setLocalScores(res.scores);

      if (res.phase === 'ended') {
        // Game over — fetch historical stats
        setView('results');
        stopTimer();
        const pids = sessionPlayers.map(p => p.id).join(',');
        api.get<Record<string, any>>(`/trivia/history?players=${pids}`)
          .then(h => setTriviaHistory(h)).catch(() => {});
        return;
      }

      // Fetch updated state for the new question
      const state = await fetchGameState();
      if (state) {
        setTriviaState(state);
        setPhase('playerTurn');
        shufflePlayerOrder();
        setPlayerAnswers(new Map());
        setRevealedCorrect(null);
        setReadyPlayerIds(new Set());
        startTimer();
      }
    } catch (err) {
      console.error('Next question failed:', err);
    }
  };

  /* ---- End game early ---- */
  const endGameEarly = async () => {
    try {
      const res = await api.post<{ phase: string; scores?: Record<number, number> }>('/trivia/end');
      if (res.scores) setLocalScores(res.scores);
      setView('results');
      stopTimer();
      const pids = sessionPlayers.map(p => p.id).join(',');
      api.get<Record<string, any>>(`/trivia/history?players=${pids}`)
        .then(h => setTriviaHistory(h)).catch(() => {});
    } catch (err) {
      console.error('End game failed:', err);
    }
  };

  /* ---- Play again ---- */
  const playAgain = () => {
    setView('setup');
    setGameId(null);
    setTriviaState(null);
    setPhase('question');
    setLocalScores({});
    setLocalCorrect({});
    setPlayerAnswers(new Map());
    setRevealedCorrect(null);
  };

  /* ================================================================== */
  /*  SETUP VIEW                                                         */
  /* ================================================================== */

  if (view === 'setup') {
    return (
      <div className="p-4 pb-8 space-y-6 max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-text-primary text-center">Trivia Night</h1>
        <p className="text-text-secondary text-center text-lg">Pick categories, set the rules, let's go!</p>

        {/* ---- Custom categories ---- */}
        <div>
          <h2 className="text-xl font-semibold text-text-primary mb-3">House Categories</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {customCategories.map((cat) => (
              <CategoryTile
                key={cat.id}
                category={cat}
                selected={selectedCategories.has(cat.id)}
                onToggle={() => toggleCategory(cat.id)}
              />
            ))}
          </div>
        </div>

        {/* ---- OTDB categories ---- */}
        <div>
          <h2 className="text-xl font-semibold text-text-primary mb-3">Open Trivia DB</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {otdbCategories.map((cat) => (
              <CategoryTile
                key={cat.id}
                category={cat}
                selected={selectedCategories.has(cat.id)}
                onToggle={() => toggleCategory(cat.id)}
              />
            ))}
          </div>
        </div>

        {/* ---- Difficulty ---- */}
        <div>
          <h2 className="text-xl font-semibold text-text-primary mb-3">Difficulty</h2>
          <div className="flex gap-3 flex-wrap">
            {(['easy', 'medium', 'hard', 'mixed'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={[
                  'h-[60px] px-6 rounded-xl text-lg font-semibold transition-all capitalize select-none',
                  difficulty === d
                    ? 'bg-accent-purple text-white shadow-[0_0_15px_rgba(139,92,246,0.5)]'
                    : 'bg-surface-700 text-text-secondary hover:bg-surface-600',
                ].join(' ')}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* ---- Question count ---- */}
        <div>
          <h2 className="text-xl font-semibold text-text-primary mb-3">Questions</h2>
          <div className="flex gap-3 flex-wrap">
            {[10, 15, 20, 25].map((n) => (
              <button
                key={n}
                onClick={() => setQuestionCount(n)}
                className={[
                  'h-[60px] w-[80px] rounded-xl text-xl font-bold transition-all select-none',
                  questionCount === n
                    ? 'bg-accent-blue text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]'
                    : 'bg-surface-700 text-text-secondary hover:bg-surface-600',
                ].join(' ')}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* ---- Timer ---- */}
        <div>
          <h2 className="text-xl font-semibold text-text-primary mb-3">Timer (seconds)</h2>
          <div className="flex gap-3 flex-wrap">
            {[15, 20, 25, 30].map((s) => (
              <button
                key={s}
                onClick={() => setTimerSeconds(s)}
                className={[
                  'h-[60px] w-[80px] rounded-xl text-xl font-bold transition-all select-none',
                  timerSeconds === s
                    ? 'bg-accent-orange text-white shadow-[0_0_15px_rgba(249,115,22,0.5)]'
                    : 'bg-surface-700 text-text-secondary hover:bg-surface-600',
                ].join(' ')}
              >
                {s}s
              </button>
            ))}
          </div>
        </div>

        {/* ---- Players ---- */}
        <div>
          <h2 className="text-xl font-semibold text-text-primary mb-3">
            Players ({sessionPlayers.length})
          </h2>
          {sessionPlayers.length === 0 ? (
            <p className="text-text-muted">No players in tonight's session. Add players on the Players page first!</p>
          ) : (
            <div className="flex gap-3 flex-wrap">
              {sessionPlayers.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 bg-surface-700 rounded-xl px-4 py-3"
                >
                  <span
                    className="w-4 h-4 rounded-full shrink-0"
                    style={{ backgroundColor: p.color }}
                  />
                  <span className="text-text-primary font-medium text-lg">{p.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ---- QR Code ---- */}
        <Card className="text-center">
          <p className="text-text-secondary mb-2">Phone players join at:</p>
          <p className="text-accent-cyan text-xl font-mono font-bold">
            {window.location.origin}/trivia/play
          </p>
          <p className="text-text-muted text-sm mt-2">Or play Surface-only — everyone answers on this screen!</p>
        </Card>

        {/* ---- Start ---- */}
        <Button
          size="lg"
          fullWidth
          disabled={selectedCategories.size === 0 || sessionPlayers.length === 0}
          onClick={startGame}
        >
          Start Trivia ({selectedCategories.size} {selectedCategories.size === 1 ? 'category' : 'categories'})
        </Button>
      </div>
    );
  }

  /* ================================================================== */
  /*  GAME VIEW                                                          */
  /* ================================================================== */

  if (view === 'game' && triviaState) {
    const currentQ = triviaState.questions[triviaState.currentIndex];
    const totalQ = triviaState.questionCount;

    /* ---- PLAYER TURN phase — each player picks an answer on Surface ---- */
    if (phase === 'playerTurn' && currentQ) {
      const timerPct = (timeLeft / timerSeconds) * 100;
      const activePlayer = playerOrder.length > 0 ? sessionPlayers[playerOrder[currentPlayerIdx]] : sessionPlayers[currentPlayerIdx];
      const answeredIds = new Set(playerAnswers.keys());

      return (
        <div
          className="h-full flex flex-col relative"
          style={activeTheme ? { background: activeTheme.bg } : undefined}
        >
          {/* JW cinematic styles & vignette overlay */}
          {activeTheme === CATEGORY_THEMES['custom-john-wick'] && (
            <>
              <style>{JW_STYLES}</style>
              {/* Vignette overlay */}
              <div
                className="absolute inset-0 pointer-events-none z-10"
                style={{
                  background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)',
                  animation: 'jw-vignette-pulse 6s ease-in-out infinite',
                }}
              />
              {/* Top red accent line */}
              <div className="absolute top-0 left-0 right-0 h-[2px] z-20" style={{ background: 'linear-gradient(90deg, transparent 10%, #ff0000 50%, transparent 90%)' }} />
            </>
          )}
          {/* Theme header */}
          {activeTheme && (
            <div
              className="flex items-center justify-center gap-3 py-2 shrink-0"
              style={activeTheme.headerStyle || {
                borderBottom: `2px solid ${activeTheme.accent}50`,
                background: `linear-gradient(90deg, transparent 0%, ${activeTheme.accent}15 50%, transparent 100%)`,
              }}
            >
              <span className="text-[20px] inline-block" style={{ filter: `drop-shadow(0 0 6px ${activeTheme.accent})`, transform: 'scale(-1, 1)' }}>{activeTheme.icon}</span>
              <div className="flex flex-col items-center">
                <span
                  className="text-[16px] font-black uppercase tracking-[0.4em]"
                  style={{
                    color: activeTheme.accent,
                    textShadow: `0 0 12px ${activeTheme.accent}, 0 0 30px ${activeTheme.accent}60, 0 0 60px ${activeTheme.accent}30`,
                  }}
                >
                  {activeTheme.name}
                </span>
              </div>
              <span className="text-[20px]" style={{ filter: `drop-shadow(0 0 6px ${activeTheme.accent})` }}>{activeTheme.icon}</span>
            </div>
          )}
          {/* Timer bar */}
          {(() => {
            // For JW: bar GROWS (0→100%) as time runs out — bullet streaks left to right
            const isJW = activeTheme === CATEGORY_THEMES['custom-john-wick'];
            const barPct = isJW ? (100 - timerPct) : timerPct;
            const barColor = isJW
              ? `linear-gradient(90deg, #7c3aed, ${barPct > 75 ? '#ff0000' : barPct > 50 ? '#cc0066' : '#8800ff'})`
              : undefined;
            const barBgColor = !isJW
              ? (activeTheme
                ? (timerPct > 50 ? activeTheme.accent2 : timerPct > 25 ? '#f59e0b' : activeTheme.accent)
                : (timerPct > 50 ? '#22c55e' : timerPct > 25 ? '#f59e0b' : '#ef4444'))
              : undefined;
            return (
          <div className="relative h-3 shrink-0 overflow-visible" style={{ background: activeTheme?.timerBarBg || '#374151' }}>
            <div
              className="h-full transition-all duration-1000 ease-linear rounded-r-full"
              style={{
                width: `${barPct}%`,
                background: barColor,
                backgroundColor: barBgColor,
              }}
            />
            {/* Themed timer icon at the leading edge */}
            {isJW ? (
              /* CSS bullet for John Wick — rides the growing bar */
              <div
                className="absolute top-1/2 transition-all duration-1000 ease-linear pointer-events-none"
                style={{
                  left: `${barPct}%`,
                  transform: 'translate(-50%, -50%)',
                  filter: barPct > 75 ? 'drop-shadow(0 0 8px #ef4444) drop-shadow(0 0 16px #ef444488)' : 'drop-shadow(0 0 6px #8800ff)',
                }}
              >
                <div className="flex items-center">
                  {/* Bullet: casing then tip, flipped so tip points right */}
                  <div style={{ width: 10, height: 14, backgroundColor: '#d4a017', borderRadius: '2px 2px 1px 1px' }} />
                  <div style={{ width: 8, height: 10, backgroundColor: '#c87533', borderRadius: '0 6px 6px 0', marginLeft: -1 }} />
                </div>
              </div>
            ) : activeTheme ? (
              <span
                className="absolute top-1/2 -translate-y-1/2 text-[18px] transition-all duration-1000 ease-linear pointer-events-none"
                style={{
                  left: `${barPct}%`,
                  transform: 'translate(-50%, -50%)',
                  filter: timerPct < 25 ? 'drop-shadow(0 0 6px #ef4444)' : `drop-shadow(0 0 4px ${activeTheme.accent2})`,
                }}
              >
                {activeTheme.icon}
              </span>
            ) : null}
          </div>
            );
          })()}

          {/* Question number + category + timer */}
          <div
            className="flex items-center justify-between px-6 py-3 shrink-0"
            style={activeTheme === CATEGORY_THEMES['custom-john-wick'] ? {
              borderBottom: '1px solid rgba(255,0,0,0.15)',
            } : undefined}
          >
            <span className="text-text-secondary text-lg" style={activeTheme ? { color: activeTheme.accent2 } : undefined}>
              Q{triviaState.currentIndex + 1}/{totalQ}
            </span>
            {/* JW themed decorative icons */}
            {activeTheme === CATEGORY_THEMES['custom-john-wick'] ? (
              <div className="flex items-center gap-1.5 text-[12px]">
                <GoldCoin size={16} />
                <span style={{ color: '#00ffcc80', fontSize: 10 }}>{'\u2666'}</span>
                <span
                  className="uppercase tracking-wider font-semibold"
                  style={{
                    color: '#00ffcc',
                    textShadow: '0 0 8px rgba(0,255,204,0.4)',
                    fontSize: 13,
                    animation: 'jw-neon-flicker 4s ease-in-out infinite',
                  }}
                >
                  {currentQ.category || 'John Wick'}
                </span>
                <span style={{ color: '#00ffcc80', fontSize: 10 }}>{'\u2666'}</span>
                <GoldCoin size={16} />
              </div>
            ) : (
              <span className="text-text-muted text-lg">
                {currentQ.category}
                {currentQ.source && (
                  <span className="ml-1.5 text-[11px] text-text-muted/40 uppercase">
                    {currentQ.source === 'api' ? 'OTDB' : currentQ.source === 'ai' ? 'AI' : currentQ.source}
                  </span>
                )}
              </span>
            )}
            <span
              className="text-2xl font-bold font-mono"
              style={activeTheme ? {
                color: timeLeft > 10 ? activeTheme.accent2 : timeLeft > 5 ? '#f59e0b' : activeTheme.accent,
                textShadow: timeLeft <= 5 ? `0 0 10px ${activeTheme.accent}` : 'none',
              } : { color: 'var(--text-secondary)' }}
            >
              {timeLeft}s
            </span>
          </div>

          {/* Question text */}
          <div className="px-6 py-3 shrink-0">
            <h2
              className="text-2xl md:text-3xl font-bold text-text-primary text-center leading-tight"
              style={activeTheme?.questionStyle}
              dangerouslySetInnerHTML={{ __html: decodeHTML(currentQ.question) }}
            />
          </div>

          {/* Active player indicator */}
          {activePlayer && (
            <div className="flex items-center justify-center gap-3 py-2 shrink-0">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold text-white shadow-lg"
                style={{
                  backgroundColor: activePlayer.color,
                  boxShadow: `0 0 20px ${activePlayer.color}80`,
                }}
              >
                {activePlayer.name.charAt(0)}
              </div>
              <span className="text-2xl font-bold" style={{ color: activePlayer.color }}>
                {activePlayer.name}'s turn
              </span>
            </div>
          )}

          {/* 4 big tappable answer buttons */}
          <div className="grid grid-cols-2 grid-rows-2 gap-3 p-3 flex-1 min-h-0">
            {currentQ.answers.map((ans, i) => (
              <button
                key={i}
                onClick={() => {
                  if (activePlayer) {
                    submitPlayerAnswer(activePlayer.id, ans, i);
                  }
                }}
                className="rounded-2xl flex items-center justify-center px-4 py-3 text-center transition-all active:scale-95 select-none cursor-pointer overflow-hidden"
                style={{
                  backgroundColor: themeAnswerColors[i],
                  boxShadow: activeTheme === CATEGORY_THEMES['custom-john-wick']
                    ? `0 0 20px ${themeAnswerColors[i]}50, 0 0 40px ${themeAnswerColors[i]}20, inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -2px 4px rgba(0,0,0,0.3)`
                    : undefined,
                  border: activeTheme === CATEGORY_THEMES['custom-john-wick']
                    ? `1px solid ${themeAnswerColors[i]}80`
                    : undefined,
                  animation: activeTheme === CATEGORY_THEMES['custom-john-wick'] && timerPct < 25
                    ? 'jw-pulse-red 1s ease-in-out infinite'
                    : undefined,
                  position: 'relative' as const,
                  zIndex: 20,
                }}
              >
                <span className="text-white font-bold text-lg md:text-xl leading-tight line-clamp-3">
                  <span className="opacity-60 mr-2">{ANSWER_LABELS[i]}.</span>
                  <span dangerouslySetInnerHTML={{ __html: decodeHTML(ans) }} />
                </span>
              </button>
            ))}
          </div>

          {/* Who has answered */}
          <div className="flex items-center justify-center gap-2 px-4 py-3 shrink-0">
            {sessionPlayers.map((p) => (
              <div
                key={p.id}
                className={[
                  'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white transition-all',
                  answeredIds.has(p.id) ? 'scale-110' : 'opacity-30',
                ].join(' ')}
                style={{ backgroundColor: p.color }}
              >
                {p.name.charAt(0)}
              </div>
            ))}
          </div>
        </div>
      );
    }

    /* ---- REVEAL phase ---- */
    if (phase === 'reveal' && currentQ) {
      const correctAnswer = revealedCorrect || currentQ.correct_answer || '';
      const correctIdx = currentQ.answers.findIndex((a) => a === correctAnswer);

      return (
        <div className="h-full flex flex-col relative" style={activeTheme ? { background: activeTheme.bg } : undefined}>
          {activeTheme === CATEGORY_THEMES['custom-john-wick'] && (
            <>
              <style>{JW_STYLES}</style>
              <div className="absolute inset-0 pointer-events-none z-10" style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)' }} />
            </>
          )}
          {/* Question */}
          <div className="px-6 py-4 shrink-0">
            <p className="text-text-secondary text-lg text-center">
              Q{triviaState.currentIndex + 1}/{totalQ} -- {currentQ.category}
              {currentQ.source && (
                <span className="ml-2 text-[11px] text-text-muted/50 uppercase">
                  {currentQ.source === 'api' ? 'OTDB' : currentQ.source === 'ai' ? 'AI' : currentQ.source}
                </span>
              )}
            </p>
            <h2
              className="text-2xl md:text-3xl font-bold text-text-primary text-center mt-2"
              dangerouslySetInnerHTML={{ __html: decodeHTML(currentQ.question) }}
            />
          </div>

          {/* Answers with correct/wrong highlights */}
          <div className="grid grid-cols-2 gap-3 p-3 shrink-0">
            {currentQ.answers.map((ans, i) => {
              const isCorrect = i === correctIdx;
              return (
                <div
                  key={i}
                  className={[
                    'h-[100px] md:h-[120px] rounded-2xl flex items-center justify-center px-4 text-center transition-all border-4',
                    isCorrect
                      ? 'border-accent-green shadow-[0_0_20px_rgba(34,197,94,0.5)]'
                      : 'border-transparent opacity-40',
                  ].join(' ')}
                  style={{
                    backgroundColor: isCorrect ? '#22c55e' : '#ef4444',
                  }}
                >
                  <span className="text-white font-bold text-xl md:text-2xl leading-tight">
                    <span className="opacity-60 mr-2">{ANSWER_LABELS[i]}.</span>
                    <span dangerouslySetInnerHTML={{ __html: decodeHTML(ans) }} />
                  </span>
                </div>
              );
            })}
          </div>

          {/* Who got it right/wrong */}
          <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
            <div className="flex flex-wrap gap-3 justify-center">
              {sessionPlayers.map((p) => {
                const pa = playerAnswers.get(p.id);
                if (!pa) return (
                  <div key={p.id} className="flex items-center gap-2 px-4 py-2 rounded-xl text-lg font-semibold bg-surface-700 text-text-muted">
                    <span className="w-6 h-6 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                    {p.name} (no answer)
                  </div>
                );
                return (
                  <div
                    key={p.id}
                    className={[
                      'flex items-center gap-2 px-4 py-2 rounded-xl text-lg font-semibold transition-all',
                      pa.isCorrect
                        ? 'bg-accent-green/20 text-accent-green'
                        : 'bg-accent-red/20 text-accent-red',
                    ].join(' ')}
                  >
                    <span className="w-6 h-6 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                    {p.name}
                    {pa.isCorrect ? ' +' + pa.points : ' wrong'}
                  </div>
                );
              })}
            </div>
          </div>

          {/* JW quote — centered in the reveal */}
          {activeTheme === CATEGORY_THEMES['custom-john-wick'] && triviaState && (
            <div className="flex-1 flex items-center justify-center shrink-0" style={{ position: 'relative', zIndex: 20 }}>
              <div className="text-center">
                <p className="text-[20px] italic font-semibold" style={{ color: '#ff0000cc', textShadow: '0 0 15px rgba(255,0,0,0.3)' }}>
                  "{getJWQuote(triviaState.currentIndex + 7).text}"
                </p>
                <p className="text-[14px] mt-1" style={{ color: '#00ffcc80' }}>
                  — {getJWQuote(triviaState.currentIndex + 7).film}
                </p>
              </div>
            </div>
          )}

          {/* Rate + Ready — compact row */}
          <div className="flex items-center justify-between px-4 py-1.5 shrink-0" style={{ position: 'relative', zIndex: 20 }}>
            {/* Ready status (left) — hidden in single player */}
            <div className="flex items-center gap-1.5">
              {sessionPlayers.length > 1 && sessionPlayers.map(p => (
                <div
                  key={p.id}
                  className={`flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold transition-all ${
                    readyPlayerIds.has(p.id) ? 'bg-accent-green/20 text-accent-green' : 'bg-surface-700 text-text-muted'
                  }`}
                >
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                  {readyPlayerIds.has(p.id) ? 'Ready' : '...'}
                </div>
              ))}
            </div>
            {/* Rating buttons (right) */}
            <div className="flex items-center gap-2">
              <span className="text-text-muted text-[12px]">Rate:</span>
              <button
                onClick={() => api.post('/trivia/rate', { questionIndex: triviaState.currentIndex, rating: 'up' }).then(() => console.log('[Trivia] Rated UP')).catch(e => console.error('[Trivia] Rate failed:', e))}
                className="w-[36px] h-[36px] rounded-lg bg-surface-700 flex items-center justify-center text-[20px] active:scale-90 active:bg-accent-green/20 transition-all"
              >
                👍
              </button>
              <button
                onClick={() => api.post('/trivia/rate', { questionIndex: triviaState.currentIndex, rating: 'down' }).then(() => console.log('[Trivia] Rated DOWN')).catch(e => console.error('[Trivia] Rate failed:', e))}
                className="w-[36px] h-[36px] rounded-lg bg-surface-700 flex items-center justify-center text-[20px] active:scale-90 active:bg-accent-red/20 transition-all"
              >
                👎
              </button>
            </div>
          </div>

          {/* Next / End buttons */}
          <div className="flex gap-3 p-4 shrink-0">
            <Button
              size="lg"
              fullWidth
              onClick={nextQuestion}
              disabled={readyPlayerIds.size < sessionPlayers.length && readyPlayerIds.size > 0}
            >
              {triviaState.currentIndex < totalQ - 1
                ? readyPlayerIds.size > 0 && readyPlayerIds.size < sessionPlayers.length
                  ? `Waiting (${readyPlayerIds.size}/${sessionPlayers.length})`
                  : 'Next Question'
                : 'See Results'}
            </Button>
            {triviaState.currentIndex < totalQ - 1 && (
              <button
                onClick={endGameEarly}
                className="px-5 py-3 rounded-xl bg-surface-700 text-text-muted font-semibold text-lg hover:bg-surface-600 active:scale-95 transition-all shrink-0"
              >
                End Game
              </button>
            )}
          </div>
        </div>
      );
    }

    /* ---- SCORES phase (between questions) ---- */
    if (phase === 'scores') {
      const sortedScores = sessionPlayers
        .map((p) => ({ ...p, score: localScores[p.id] || 0 }))
        .sort((a, b) => b.score - a.score);

      return (
        <div className="h-full flex flex-col items-center justify-center px-6">
          <h2 className="text-3xl font-bold text-text-primary mb-8">Scoreboard</h2>
          <div className="w-full max-w-md space-y-3">
            {sortedScores.map((s, rank) => (
              <div
                key={s.id}
                className={[
                  'flex items-center gap-4 px-6 py-4 rounded-2xl transition-all',
                  rank === 0 ? 'bg-surface-600 scale-105' : 'bg-surface-700',
                ].join(' ')}
              >
                <span className="text-2xl font-bold text-text-muted w-8">{rank + 1}</span>
                <span className="w-8 h-8 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-xl font-semibold text-text-primary flex-1">{s.name}</span>
                <span className="text-2xl font-bold text-accent-blue">{s.score.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
  }

  /* ================================================================== */
  /*  RESULTS VIEW                                                       */
  /* ================================================================== */

  if (view === 'results') {
    const sortedScores = sessionPlayers
      .map((p) => ({
        playerId: p.id,
        playerName: p.name,
        playerColor: p.color,
        score: localScores[p.id] || 0,
        correctCount: localCorrect[p.id] || 0,
      }))
      .sort((a, b) => b.score - a.score);

    const mvp = sortedScores[0];
    const totalQ = triviaState?.questionCount || questionCount;

    return (
      <div className="p-4 pb-8 max-w-lg mx-auto space-y-6">
        {/* MVP */}
        {mvp && (
          <div className="text-center py-6">
            <div className="text-6xl mb-4">&#127942;</div>
            <h1 className="text-4xl font-bold text-accent-amber mb-2">MVP</h1>
            <div className="flex items-center justify-center gap-3">
              <span className="w-8 h-8 rounded-full" style={{ backgroundColor: mvp.playerColor }} />
              <span className="text-3xl font-bold text-text-primary">{mvp.playerName}</span>
            </div>
            <p className="text-2xl text-accent-blue font-bold mt-2">
              {mvp.score.toLocaleString()} pts
            </p>
            <p className="text-text-secondary mt-1">
              {mvp.correctCount}/{totalQ} correct
            </p>
          </div>
        )}

        {/* Rankings */}
        <div className="space-y-3">
          {sortedScores.map((s, rank) => {
            const medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
            return (
              <Card key={s.playerId} className="flex items-center gap-4">
                <span className="text-2xl w-10 text-center">
                  {rank < 3 ? medals[rank] : `#${rank + 1}`}
                </span>
                <span className="w-8 h-8 rounded-full shrink-0" style={{ backgroundColor: s.playerColor }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xl font-semibold text-text-primary">{s.playerName}</p>
                  <p className="text-text-secondary text-sm">
                    {s.correctCount}/{totalQ} correct
                  </p>
                </div>
                <span className="text-xl font-bold text-accent-blue">
                  {s.score.toLocaleString()}
                </span>
              </Card>
            );
          })}
        </div>

        {/* Historical comparison */}
        {Object.keys(triviaHistory).length > 0 && (
          <div className="space-y-2">
            {sortedScores.map(s => {
              const hist = triviaHistory[s.playerId] || triviaHistory[String(s.playerId)];
              if (!hist || hist.games < 1) return null;
              const correctPct = totalQ > 0 ? Math.round((s.correctCount / totalQ) * 100) : 0;
              const isHighScore = hist.highScore !== null && s.score > hist.highScore;
              const isBestPct = hist.bestPct !== null && correctPct > hist.bestPct;
              return (
                <div key={s.playerId} className="bg-surface-800 rounded-xl px-4 py-2.5 border border-surface-600">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-5 h-5 rounded-full shrink-0" style={{ backgroundColor: s.playerColor }} />
                    <span className="text-white text-[14px] font-semibold">{s.playerName}</span>
                    {isHighScore && <span className="text-accent-amber text-[12px] font-bold">{'\uD83C\uDFC6'} New High Score!</span>}
                    {!isHighScore && isBestPct && <span className="text-accent-green text-[12px] font-bold">{'\u2B50'} Best Accuracy!</span>}
                  </div>
                  <div className="flex gap-4 text-[12px] pl-7">
                    <span className="text-text-secondary">
                      High: <span className="text-white font-semibold">{hist.highScore?.toLocaleString()}</span>
                    </span>
                    <span className="text-text-secondary">
                      Avg: <span className="text-white font-semibold">{hist.avgScore?.toLocaleString()}</span>
                    </span>
                    <span className="text-text-secondary">
                      Best %: <span className="text-white font-semibold">{hist.bestPct}%</span>
                    </span>
                    <span className="text-text-secondary">
                      ({hist.games} game{hist.games !== 1 ? 's' : ''})
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Game info — categories & difficulty */}
        <div className="bg-surface-800 rounded-xl px-4 py-3 space-y-2">
          <div className="flex items-center gap-2 text-text-muted text-[14px]">
            <span className="font-semibold text-text-secondary">Difficulty:</span>
            <span className="capitalize">{difficulty}</span>
          </div>
          <div className="flex items-start gap-2 text-text-muted text-[14px]">
            <span className="font-semibold text-text-secondary shrink-0">Categories:</span>
            <div className="flex flex-wrap gap-1.5">
              {Array.from(selectedCategories).map(catId => {
                const allCats = [...customCategories, ...otdbCategories];
                const cat = allCats.find(c => c.id === catId);
                return (
                  <span
                    key={catId}
                    className="px-2 py-0.5 rounded-md text-[12px] font-medium"
                    style={{
                      backgroundColor: (cat?.color || '#6366f1') + '25',
                      color: cat?.color || '#6366f1',
                    }}
                  >
                    {cat?.icon} {cat?.name || catId}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button variant="secondary" size="lg" fullWidth onClick={playAgain}>
            Play Again
          </Button>
          <Button
            variant="ghost"
            size="lg"
            fullWidth
            onClick={playAgain}
          >
            Back to Menu
          </Button>
        </div>
      </div>
    );
  }

  /* ---- Loading / fallback ---- */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-text-secondary text-xl">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full text-text-secondary text-xl">
      Loading...
    </div>
  );
}

/* ================================================================== */
/*  Sub-components                                                     */
/* ================================================================== */

function CategoryTile({
  category,
  selected,
  onToggle,
}: {
  category: TriviaCategory;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={[
        'h-[70px] rounded-2xl flex items-center gap-3 px-4 transition-all duration-200 select-none border-2',
        selected
          ? 'border-current shadow-[0_0_20px_var(--glow)]'
          : 'border-surface-600 hover:border-surface-500',
      ].join(' ')}
      style={
        selected
          ? ({
              backgroundColor: `${category.color}22`,
              color: category.color,
              '--glow': `${category.color}44`,
            } as React.CSSProperties)
          : { backgroundColor: '#1a1a2e' }
      }
    >
      <span className="text-2xl">{category.icon}</span>
      <span
        className={[
          'text-lg font-semibold truncate',
          selected ? '' : 'text-text-secondary',
        ].join(' ')}
      >
        {category.name}
      </span>
    </button>
  );
}

/* ---- Decode HTML entities from Open Trivia DB ---- */
function decodeHTML(html: string): string {
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
}
