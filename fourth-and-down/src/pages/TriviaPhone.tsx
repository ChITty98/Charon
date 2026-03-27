import { useState, useEffect } from 'react';
import { socket, useSocket } from '../lib/socket';
import { api } from '../lib/api';

/* ---- John Wick quotes for themed waiting screens ---- */
const JW_PHONE_QUOTES = [
  { text: 'Yeah.', film: 'Ch. 1' },
  { text: 'I\'m thinking I\'m back.', film: 'Ch. 1' },
  { text: 'A man of focus, commitment, sheer will.', film: 'Ch. 1' },
  { text: 'They call him Baba Yaga.', film: 'Ch. 1' },
  { text: 'I once saw him kill three men... with a pencil.', film: 'Ch. 1' },
  { text: 'That nobody... is John Wick.', film: 'Ch. 1' },
  { text: 'Evening, Jimmy.', film: 'Ch. 1' },
  { text: 'Noise complaint?', film: 'Ch. 1' },
  { text: 'Rules. Without them, we live with the animals.', film: 'Ch. 2' },
  { text: 'Somebody please get this man a gun.', film: 'Ch. 2' },
  { text: 'Consider this a professional courtesy.', film: 'Ch. 2' },
  { text: 'You wanted me back. I\'m back.', film: 'Ch. 2' },
  { text: 'Consequences.', film: 'Ch. 2' },
  { text: 'You don\'t want me owing you.', film: 'Ch. 2' },
  { text: 'Si vis pacem, para bellum.', film: 'Ch. 3' },
  { text: 'Guns. Lots of guns.', film: 'Ch. 3' },
  { text: 'Tell them all. Whoever comes, I\'ll kill them all.', film: 'Ch. 3' },
  { text: 'Be seeing you.', film: 'Ch. 3' },
  { text: 'You want a war, or just give me a gun?', film: 'Ch. 3' },
  { text: 'How you do anything is how you do everything.', film: 'Ch. 4' },
  { text: 'Those who cling to death, live.', film: 'Ch. 4' },
  { text: 'Fools talk. Cowards are silent. Wise men listen.', film: 'Ch. 4' },
  { text: 'People don\'t change. Times, they do.', film: 'Ch. 4' },
  { text: 'No one escapes the Table.', film: 'Ch. 4' },
];

function isJohnWickGame(category: string | undefined): boolean {
  const c = (category || '').toLowerCase();
  return c.includes('john wick') || c.includes('john-wick');
}

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

interface TriviaSessionQuestion {
  index: number;
  question: string;
  answers: string[];
  correct: number;
  category: string;
  difficulty: string;
}

interface ScoreEntry {
  playerId: number;
  playerName: string;
  playerColor: string;
  score: number;
  streak: number;
  correctCount: number;
}

type PhonePhase = 'lobby' | 'question' | 'locked' | 'reveal' | 'scores' | 'results';

/* ---- Answer quadrant colors ---- */
const ANSWER_COLORS = ['#3b82f6', '#22c55e', '#f97316', '#ec4899'];
const ANSWER_LABELS = ['A', 'B', 'C', 'D'];

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */

export function TriviaPhone() {
  const [phase, setPhase] = useState<PhonePhase>('lobby');
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [playerColor, setPlayerColor] = useState('#3b82f6');
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [joined, setJoined] = useState(false);

  /* ---- Game state ---- */
  const [currentQuestion, setCurrentQuestion] = useState<TriviaSessionQuestion | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answerCorrect, setAnswerCorrect] = useState<boolean | null>(null);
  const [correctIndex, setCorrectIndex] = useState<number | null>(null);
  const [myScore, setMyScore] = useState(0);
  const [myRank, setMyRank] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [, setQuestionCount] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [answerStartTime, setAnswerStartTime] = useState(0);
  const [finalScores, setFinalScores] = useState<ScoreEntry[]>([]);

  /* ---- Join the session ---- */
  const joinSession = async () => {
    try {
      // Try to get current trivia session
      const res = await api.get<{
        id: string;
        questionCount: number;
        phase: string;
      } | null>('/trivia/state');

      if (res) {
        setSessionId(res.id as any);
        setQuestionCount(res.questionCount);
      }

      // If player already identified
      if (playerId && res) {
        socket.emit('trivia:join', { sessionId: res.id, playerId });
        setJoined(true);
      }
    } catch {
      // Session not started yet
    }
  };

  /* ---- Pick player identity ---- */
  const [availablePlayers, setAvailablePlayers] = useState<
    { id: number; name: string; color: string }[]
  >([]);

  useEffect(() => {
    (async () => {
      // Check localStorage for player selected on Join page
      try {
        const saved = localStorage.getItem('charon_selectedPlayer');
        if (saved) {
          const p = JSON.parse(saved);
          if (p.id && p.name) {
            setPlayerId(p.id);
            setPlayerName(p.name);
            setPlayerColor(p.color || '#3b82f6');
          }
        }
      } catch { /* ignore */ }

      try {
        const session = await api.get<{ id: number } | null>('/sessions/current');
        if (session) {
          const players = await api.get<{ id: number; name: string; color: string }[]>('/sessions/current/players');
          setAvailablePlayers(players);
        }
      } catch {
        // no session
      }
      joinSession();
    })();
  }, []);

  const selectPlayer = async (p: { id: number; name: string; color: string }) => {
    setPlayerId(p.id);
    setPlayerName(p.name);
    setPlayerColor(p.color);
    setJoined(true);
    // Check if a game is already running
    try {
      const state = await api.get<any>('/trivia/state');
      if (state && state.questions && state.questions.length > 0) {
        const q = state.questions[state.currentIndex];
        if (q) {
          setCurrentQuestion({
            index: state.currentIndex,
            question: q.question,
            answers: q.answers || [],
            correct: -1,
            category: q.category || '',
            difficulty: q.difficulty || '',
          });
          setQuestionIndex(state.currentIndex);
          setQuestionCount(state.questionCount || state.questions.length);
          setTimeLeft(state.timerSeconds || 20);
          setAnswerStartTime(Date.now());
          setPhase(state.revealed ? 'reveal' : 'question');
          return;
        }
      }
    } catch { /* no game running yet */ }
  };

  /* ---- Fetch current question from server state ---- */
  const fetchCurrentQuestion = async () => {
    try {
      const state = await api.get<any>('/trivia/state');
      if (!state) return;
      const q = state.questions?.[state.currentIndex];
      if (!q) return;
      setCurrentQuestion({
        index: state.currentIndex,
        question: q.question,
        answers: q.answers || [],
        correct: -1, // hidden until reveal
        category: q.category || '',
        difficulty: q.difficulty || '',
      });
      setQuestionIndex(state.currentIndex);
      setQuestionCount(state.questionCount || state.questions?.length || 0);
      setTimeLeft(state.timerSeconds || 20);
      setAnswerStartTime(Date.now());
      setSelectedAnswer(null);
      setAnswerCorrect(null);
      setCorrectIndex(null);
      setPhase('question');
    } catch { /* noop */ }
  };

  /* ---- Socket events (aligned with server) ---- */
  useSocket('trivia:start', () => {
    console.log('[TriviaPhone] trivia:start received — fetching question');
    fetchCurrentQuestion();
  });

  useSocket('trivia:question', () => {
    console.log('[TriviaPhone] trivia:question received — fetching question');
    fetchCurrentQuestion();
  });

  useSocket<any>('trivia:reveal', (data) => {
    // Find correct answer index
    if (currentQuestion && data.correct_answer) {
      const idx = currentQuestion.answers.findIndex(a => a === data.correct_answer);
      setCorrectIndex(idx >= 0 ? idx : null);
    }
    // Check if this player got it right
    const myResult = data.playerResults?.[playerId ?? -1];
    setAnswerCorrect(myResult?.isCorrect ?? null);
    // Update score
    if (data.scores && playerId && data.scores[playerId] !== undefined) {
      setMyScore(data.scores[playerId]);
    }
    setPhase('reveal');
  });

  useSocket<any>('trivia:end', (data) => {
    if (data.scores && playerId && data.scores[playerId] !== undefined) {
      setMyScore(data.scores[playerId]);
    }
    setPhase('results');
  });

  /* ---- Timer countdown ---- */
  useEffect(() => {
    if (phase !== 'question' || timeLeft <= 0) return;
    const t = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(t);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase, timeLeft > 0]);

  /* ---- Submit answer ---- */
  const submitAnswer = async (answerIndex: number) => {
    if (selectedAnswer !== null || !currentQuestion) return;
    const responseTimeMs = Date.now() - answerStartTime;
    setSelectedAnswer(answerIndex);
    setPhase('locked');

    const answerText = currentQuestion.answers[answerIndex];
    try {
      const res = await api.post<{ isCorrect: boolean; points: number; totalScore: number }>('/trivia/answer', {
        playerId,
        questionIndex,
        answer: answerText,
        responseTimeMs,
      });
      setAnswerCorrect(res.isCorrect);
      setMyScore(res.totalScore);
    } catch {
      // Already answered or game ended
    }
  };

  /* ================================================================== */
  /*  PLAYER SELECT (not yet joined)                                     */
  /* ================================================================== */

  if (!joined) {
    return (
      <div className="min-h-screen bg-surface-900 flex flex-col items-center justify-center p-6">
        <h1 className="text-3xl font-bold text-text-primary mb-2">Trivia Night</h1>
        <p className="text-text-secondary text-lg mb-8">Tap your name to join</p>

        {availablePlayers.length === 0 ? (
          <p className="text-text-muted text-center">
            No active session found. Start a session on the main screen first!
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 w-full max-w-sm">
            {availablePlayers.map((p) => (
              <button
                key={p.id}
                onClick={() => selectPlayer(p)}
                className="h-[80px] rounded-2xl flex items-center gap-4 px-6 transition-all active:scale-95 select-none"
                style={{
                  backgroundColor: `${p.color}22`,
                  borderLeft: `6px solid ${p.color}`,
                }}
              >
                <span
                  className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-white text-xl font-bold"
                  style={{ backgroundColor: p.color }}
                >
                  {p.name.charAt(0)}
                </span>
                <span className="text-2xl font-bold text-text-primary">{p.name}</span>
              </button>
            ))}
          </div>
        )}

        <button
          onClick={joinSession}
          className="mt-8 px-6 py-3 rounded-xl bg-surface-700 text-text-secondary text-lg font-semibold hover:bg-surface-600 active:scale-95 transition-all"
        >
          Refresh
        </button>
      </div>
    );
  }

  /* ================================================================== */
  /*  LOBBY — waiting for game to start                                  */
  /* ================================================================== */

  if (phase === 'lobby') {
    return (
      <div className="min-h-screen bg-surface-900 flex flex-col items-center justify-center p-6">
        <div
          className="w-20 h-20 rounded-full mb-6 flex items-center justify-center text-4xl font-bold text-white"
          style={{ backgroundColor: playerColor }}
        >
          {playerName.charAt(0)}
        </div>
        <h1 className="text-3xl font-bold text-text-primary mb-2">{playerName}</h1>
        <p className="text-text-secondary text-xl">Waiting for the game to start...</p>
        <div className="mt-8 flex gap-2">
          <span className="w-3 h-3 rounded-full bg-accent-blue animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-3 h-3 rounded-full bg-accent-purple animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-3 h-3 rounded-full bg-accent-pink animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    );
  }

  /* ================================================================== */
  /*  QUESTION — 4 huge answer buttons                                   */
  /* ================================================================== */

  if (phase === 'question' && currentQuestion) {
    return (
      <div className="min-h-screen bg-surface-900 flex flex-col">
        {/* Timer + question number */}
        <div className="flex items-center justify-between px-4 py-3 shrink-0">
          <span className="text-text-secondary text-lg font-semibold">
            Q{questionIndex + 1}
          </span>
          <span
            className="text-2xl font-bold font-mono"
            style={{
              color: timeLeft > 10 ? '#22c55e' : timeLeft > 5 ? '#f59e0b' : '#ef4444',
            }}
          >
            {timeLeft}s
          </span>
        </div>

        {/* 4 massive answer buttons — 2x2 grid filling the screen */}
        {(() => {
          const isJW = isJohnWickGame(currentQuestion.category);
          const jwColors = ['#b91c1c', '#0d9488', '#7c3aed', '#c2410c'];
          const colors = isJW ? jwColors : ANSWER_COLORS;
          return (
        <div
          className="flex-1 grid grid-cols-2 grid-rows-2 gap-2 p-2"
          style={isJW ? { background: 'linear-gradient(180deg, #000000, #0d0000, #001111)' } : undefined}
        >
          {currentQuestion.answers.map((ans, i) => (
            <button
              key={i}
              onClick={() => submitAnswer(i)}
              className="rounded-2xl flex flex-col items-center justify-center p-3 transition-all active:scale-95 select-none"
              style={{
                backgroundColor: colors[i],
                boxShadow: isJW ? `0 0 20px ${colors[i]}50, inset 0 1px 0 rgba(255,255,255,0.15)` : undefined,
                border: isJW ? `1px solid ${colors[i]}80` : undefined,
              }}
            >
              <span className="text-white/60 text-2xl font-bold mb-1">
                {ANSWER_LABELS[i]}
              </span>
              <span
                className="text-white font-bold text-lg md:text-xl text-center leading-tight"
                dangerouslySetInnerHTML={{ __html: decodeHTML(ans) }}
              />
            </button>
          ))}
        </div>
          );
        })()}
      </div>
    );
  }

  /* ================================================================== */
  /*  LOCKED IN — waiting for reveal                                     */
  /* ================================================================== */

  if (phase === 'locked') {
    const isJW = isJohnWickGame(currentQuestion?.category);
    const jwq2 = isJW ? JW_PHONE_QUOTES[(questionIndex + 3) % JW_PHONE_QUOTES.length] : null;
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6"
        style={isJW ? { background: 'linear-gradient(180deg, #000000, #0d0000, #001111)' } : { background: 'var(--surface-900)' }}
      >
        <div
          className="w-32 h-32 rounded-3xl flex items-center justify-center mb-6"
          style={{
            backgroundColor: selectedAnswer !== null ? ANSWER_COLORS[selectedAnswer] : '#555',
            boxShadow: isJW && selectedAnswer !== null ? `0 0 30px ${ANSWER_COLORS[selectedAnswer]}60` : undefined,
          }}
        >
          <span className="text-white text-5xl font-bold">
            {selectedAnswer !== null ? ANSWER_LABELS[selectedAnswer] : '?'}
          </span>
        </div>
        <h2 className="text-3xl font-bold text-text-primary mb-2">Locked In!</h2>
        <p className="text-text-secondary text-xl">Waiting for everyone...</p>
        {isJW && jwq2 && (
          <div className="mt-6 text-center px-6">
            <p className="text-[14px] italic" style={{ color: '#00ffcc70' }}>
              "{jwq2.text}"
            </p>
            <p className="text-[10px] mt-1" style={{ color: '#ffffff25' }}>— {jwq2.film}</p>
          </div>
        )}
      </div>
    );
  }

  /* ================================================================== */
  /*  REVEAL — correct/wrong                                             */
  /* ================================================================== */

  if (phase === 'reveal') {
    const wasCorrect = answerCorrect === true;
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6"
        style={{
          backgroundColor: wasCorrect ? '#052e16' : '#350a0a',
        }}
      >
        <div className="text-8xl mb-6">{wasCorrect ? '\u2713' : '\u2717'}</div>
        <h2
          className="text-4xl font-bold mb-4"
          style={{ color: wasCorrect ? '#22c55e' : '#ef4444' }}
        >
          {wasCorrect ? 'Correct!' : 'Wrong!'}
        </h2>
        {correctIndex !== null && currentQuestion && (
          <p className="text-text-secondary text-xl text-center mb-8">
            Answer:{' '}
            <span className="text-text-primary font-semibold">
              {ANSWER_LABELS[correctIndex]}.{' '}
              <span dangerouslySetInnerHTML={{ __html: decodeHTML(currentQuestion.answers[correctIndex]) }} />
            </span>
          </p>
        )}
        <button
          onClick={() => {
            socket.emit('trivia:ready', { playerId });
            setPhase('scores');
          }}
          className="w-full max-w-sm h-[64px] rounded-2xl bg-accent-blue text-white text-2xl font-bold active:scale-95 transition-all"
        >
          Ready for Next
        </button>
        {isJohnWickGame(currentQuestion?.category) && (() => {
          const q = JW_PHONE_QUOTES[(questionIndex + 5) % JW_PHONE_QUOTES.length];
          return (
            <div className="mt-6 text-center px-6">
              <p className="text-[16px] italic font-semibold" style={{ color: '#00ffcc90', textShadow: '0 0 8px rgba(0,255,204,0.2)' }}>
                "{q.text}"
              </p>
              <p className="text-[12px] mt-1" style={{ color: '#ffffff40' }}>— {q.film}</p>
            </div>
          );
        })()}
      </div>
    );
  }

  /* ================================================================== */
  /*  SCORES — between questions                                         */
  /* ================================================================== */

  if (phase === 'scores') {
    const isJW = isJohnWickGame(currentQuestion?.category);
    const jwq = isJW ? JW_PHONE_QUOTES[Math.floor(Math.random() * JW_PHONE_QUOTES.length)] : null;
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6"
        style={isJW ? { background: 'linear-gradient(180deg, #000000, #1a0000, #000000)' } : { background: 'var(--surface-900)' }}
      >
        <h2 className="text-2xl font-semibold text-text-secondary mb-4">Your Score</h2>
        <p className="text-6xl font-bold mb-4" style={isJW ? { color: '#00ffcc', textShadow: '0 0 20px rgba(0,255,204,0.4)' } : { color: 'var(--accent-blue)' }}>
          {myScore.toLocaleString()}
        </p>
        {isJW && jwq && (
          <div className="mt-4 mb-4 text-center px-6">
            <p className="text-[15px] italic" style={{ color: '#ff000099', textShadow: '0 0 8px rgba(255,0,0,0.2)' }}>
              "{jwq.text}"
            </p>
            <p className="text-[11px] mt-1" style={{ color: '#ffffff30' }}>— {jwq.film}</p>
          </div>
        )}
        <p className="text-text-muted text-lg mt-2">Waiting for next question...</p>
        <div className="mt-4 flex gap-2">
          <span className="w-3 h-3 rounded-full animate-bounce" style={{ backgroundColor: isJW ? '#ff0000' : 'var(--accent-blue)', animationDelay: '0ms' }} />
          <span className="w-3 h-3 rounded-full animate-bounce" style={{ backgroundColor: isJW ? '#8800ff' : 'var(--accent-purple)', animationDelay: '150ms' }} />
          <span className="w-3 h-3 rounded-full animate-bounce" style={{ backgroundColor: isJW ? '#00ffcc' : 'var(--accent-pink)', animationDelay: '300ms' }} />
        </div>
      </div>
    );
  }

  /* ================================================================== */
  /*  RESULTS — final screen                                             */
  /* ================================================================== */

  if (phase === 'results') {
    const sorted = [...finalScores].sort((a, b) => b.score - a.score);
    const myRankFinal = sorted.findIndex((s) => s.playerId === playerId) + 1;
    const isWinner = myRankFinal === 1;

    return (
      <div className="min-h-screen bg-surface-900 flex flex-col items-center justify-center p-6">
        <div className="text-6xl mb-4">{isWinner ? '🏆' : '🎉'}</div>
        <h1 className="text-3xl font-bold text-text-primary mb-2">
          {isWinner ? 'You Won!' : 'Game Over!'}
        </h1>
        <p className="text-5xl font-bold text-accent-blue mb-2">
          {myScore.toLocaleString()}
        </p>
        <p className="text-text-secondary text-xl mb-8">
          {myRankFinal === 1
            ? '1st Place!'
            : myRankFinal === 2
              ? '2nd Place!'
              : myRankFinal === 3
                ? '3rd Place!'
                : `#${myRankFinal} out of ${sorted.length}`}
        </p>

        {/* Mini leaderboard */}
        <div className="w-full max-w-sm space-y-2">
          {sorted.slice(0, 5).map((s, i) => (
            <div
              key={s.playerId}
              className={[
                'flex items-center gap-3 px-4 py-3 rounded-xl',
                s.playerId === playerId ? 'bg-surface-600' : 'bg-surface-700',
              ].join(' ')}
            >
              <span className="text-lg font-bold text-text-muted w-6">{i + 1}</span>
              <span
                className="w-6 h-6 rounded-full shrink-0"
                style={{ backgroundColor: s.playerColor }}
              />
              <span className="text-lg text-text-primary flex-1">{s.playerName}</span>
              <span className="text-lg font-bold text-accent-blue">
                {s.score.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ---- Fallback ---- */
  return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center">
      <p className="text-text-secondary text-xl">Connecting...</p>
    </div>
  );
}

/* ---- Decode HTML entities from Open Trivia DB ---- */
function decodeHTML(html: string): string {
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
}
