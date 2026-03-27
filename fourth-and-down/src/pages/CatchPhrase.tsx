import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api';
import { useSocket } from '../lib/socket';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

interface Team {
  name: string;
  score: number;
  color: string;
}

interface Round {
  id?: number;
  teamIndex: number;
  describerName: string;
  wordsGuessed: number;
  skipped: number;
}

interface WordResult {
  word: string;
  guessed: boolean;
  rating?: 'up' | 'down';
}

type GamePhase = 'setup' | 'playing' | 'roundEnd' | 'gameOver';

const CATEGORIES = [
  'Everything',
  'Pop Culture',
  'Food & Drink',
  'Animals',
  'People & Places',
  'Actions',
  'Objects',
];

const DEFAULT_TIMER = 60;
const DEBOUNCE_MS = 500;

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */

export function CatchPhrase() {
  const [phase, setPhase] = useState<GamePhase>('setup');
  const [teams, setTeams] = useState<Team[]>([
    { name: 'Team 1', score: 0, color: '#3b82f6' },
    { name: 'Team 2', score: 0, color: '#ef4444' },
  ]);
  const [category, setCategory] = useState('Everything');
  const [timerDuration, setTimerDuration] = useState(DEFAULT_TIMER);
  const [timeLeft, setTimeLeft] = useState(DEFAULT_TIMER);
  const [currentTeamIndex, setCurrentTeamIndex] = useState(0);
  const [currentWord, setCurrentWord] = useState('');
  const [roundWords, setRoundWords] = useState<WordResult[]>([]);
  const [, setRoundHistory] = useState<Round[]>([]);
  const [winScore, setWinScore] = useState(7);
  const [showRoundReview, setShowRoundReview] = useState(false);
  const [editingTeam, setEditingTeam] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const buzzerRef = useRef<AudioContext | null>(null);
  const lastActionRef = useRef<number>(0); // debounce tracker

  /* ---- Socket events from phone controller ---- */

  useSocket<{ word: string }>('catchphrase:word', (data) => {
    setCurrentWord(data.word);
  });

  useSocket<{ timeLeft: number }>('catchphrase:timer', (data) => {
    setTimeLeft(data.timeLeft);
  });

  useSocket<{ guessed: boolean; word: string }>('catchphrase:result', (data) => {
    setRoundWords(prev => [...prev, { word: data.word, guessed: data.guessed }]);
    if (data.guessed) {
      setCurrentWord('');
    }
  });

  useSocket<string>('catchphrase:phase', (newPhase) => {
    if (newPhase === 'roundEnd' || newPhase === 'playing') {
      setPhase(newPhase as GamePhase);
    }
  });

  /* ---- Debounce helper ---- */
  const isDebounced = (): boolean => {
    const now = Date.now();
    if (now - lastActionRef.current < DEBOUNCE_MS) return true;
    lastActionRef.current = now;
    return false;
  };

  /* ---- Timer logic ---- */

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(timerDuration);

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          playBuzzer();
          // Call round-end on server
          api.post('/catchphrase/round-end', {}).catch(() => {});
          setPhase('roundEnd');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [timerDuration]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  /* ---- Buzzer sound ---- */

  const playBuzzer = () => {
    try {
      const ctx = buzzerRef.current || new AudioContext();
      buzzerRef.current = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 200;
      osc.type = 'square';
      gain.gain.value = 0.3;
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
      osc.stop(ctx.currentTime + 0.8);
    } catch {
      // Audio not available
    }
  };

  /* ---- Game actions ---- */

  const startGame = async () => {
    setPhase('playing');
    setCurrentTeamIndex(0);
    setTeams(prev => prev.map(t => ({ ...t, score: 0 })));
    setRoundWords([]);
    setRoundHistory([]);

    try {
      await api.post('/catchphrase/start', { category, timerSeconds: timerDuration });
      // Fetch first word
      const wordRes = await api.get<{ word: string }>('/catchphrase/word');
      if (wordRes.word) setCurrentWord(wordRes.word);
    } catch {
      // Server may not have route yet
    }

    startTimer();
  };

  /* ---- Surface-only: Got It! ---- */
  const handleGotIt = async () => {
    if (isDebounced()) return;
    const guessedWord = currentWord;
    setRoundWords(prev => [...prev, { word: guessedWord, guessed: true }]);

    try {
      const res = await api.post<{ nextWord: string }>('/catchphrase/got-it');
      if (res.nextWord) {
        setCurrentWord(res.nextWord);
      } else {
        // Fetch next word as fallback
        const wordRes = await api.get<{ word: string }>('/catchphrase/word');
        if (wordRes.word) setCurrentWord(wordRes.word);
      }
    } catch {
      // Fallback: fetch next word
      try {
        const wordRes = await api.get<{ word: string }>('/catchphrase/word');
        if (wordRes.word) setCurrentWord(wordRes.word);
      } catch { /* */ }
    }
  };

  /* ---- Surface-only: Skip ---- */
  const handleSkip = async () => {
    if (isDebounced()) return;
    const skippedWord = currentWord;
    setRoundWords(prev => [...prev, { word: skippedWord, guessed: false }]);

    try {
      const res = await api.post<{ nextWord: string }>('/catchphrase/skip');
      if (res.nextWord) {
        setCurrentWord(res.nextWord);
      } else {
        const wordRes = await api.get<{ word: string }>('/catchphrase/word');
        if (wordRes.word) setCurrentWord(wordRes.word);
      }
    } catch {
      try {
        const wordRes = await api.get<{ word: string }>('/catchphrase/word');
        if (wordRes.word) setCurrentWord(wordRes.word);
      } catch { /* */ }
    }
  };

  const endRound = (scoringTeamIndex: number) => {
    const guessedCount = roundWords.filter(w => w.guessed).length;
    const skippedCount = roundWords.filter(w => !w.guessed).length;

    setTeams(prev => prev.map((t, i) =>
      i === scoringTeamIndex ? { ...t, score: t.score + 1 } : t
    ));

    setRoundHistory(prev => [...prev, {
      teamIndex: scoringTeamIndex,
      describerName: teams[scoringTeamIndex].name,
      wordsGuessed: guessedCount,
      skipped: skippedCount,
    }]);

    // Check for winner
    const newScore = teams[scoringTeamIndex].score + 1;
    if (newScore >= winScore) {
      setPhase('gameOver');
      return;
    }

    setShowRoundReview(true);
  };

  const nextRound = async () => {
    setShowRoundReview(false);
    setRoundWords([]);
    setCurrentWord('');
    setCurrentTeamIndex(prev => (prev + 1) % teams.length);
    setPhase('playing');

    // Fetch next word for Surface-only mode
    try {
      const wordRes = await api.get<{ word: string }>('/catchphrase/word');
      if (wordRes.word) setCurrentWord(wordRes.word);
    } catch { /* */ }

    startTimer();
  };

  const resetGame = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setPhase('setup');
    setTeams(prev => prev.map(t => ({ ...t, score: 0 })));
    setRoundWords([]);
    setRoundHistory([]);
    setCurrentWord('');
    setTimeLeft(timerDuration);
  };

  /* ---- Timer color ---- */

  const timerColor = timeLeft > timerDuration * 0.5
    ? '#22c55e'
    : timeLeft > timerDuration * 0.2
      ? '#f59e0b'
      : '#ef4444';

  const timerPct = (timeLeft / timerDuration) * 100;

  /* ---- Render ---- */

  return (
    <div className="p-5 pb-8 animate-fade-in max-w-2xl mx-auto">
      <h1 className="text-[28px] font-black text-text-primary mb-1">Catch Phrase</h1>
      <p className="text-text-muted text-[14px] mb-6">Get your team to guess the word!</p>

      {/* ============ SETUP ============ */}
      {phase === 'setup' && (
        <div className="space-y-6">
          {/* How to Play */}
          <Card className="border border-surface-600">
            <h2 className="text-[18px] font-bold text-text-primary mb-3 flex items-center gap-2">
              <span className="text-[22px]">{'\uD83C\uDFAF'}</span> How to Play
            </h2>
            <div className="space-y-2 text-[15px] text-text-secondary">
              <div className="flex gap-2">
                <span className="text-accent-blue font-bold shrink-0">1.</span>
                <span>Split into <strong className="text-text-primary">two teams</strong> and sit so teams alternate around the room.</span>
              </div>
              <div className="flex gap-2">
                <span className="text-accent-blue font-bold shrink-0">2.</span>
                <span>A <strong className="text-text-primary">word or phrase</strong> appears on screen. The describer gives clues — <strong className="text-accent-red">no saying the word, rhyming, or "starts with..."</strong></span>
              </div>
              <div className="flex gap-2">
                <span className="text-accent-blue font-bold shrink-0">3.</span>
                <span>Tap <strong className="text-accent-green">Got It</strong> when your team guesses correctly, or <strong className="text-text-muted">Skip</strong> to pass.</span>
              </div>
              <div className="flex gap-2">
                <span className="text-accent-blue font-bold shrink-0">4.</span>
                <span>When the <strong className="text-accent-amber">timer runs out</strong>, the OTHER team gets the point. Pass to the next describer.</span>
              </div>
              <div className="flex gap-2">
                <span className="text-accent-blue font-bold shrink-0">5.</span>
                <span>First team to the <strong className="text-text-primary">target score</strong> wins!</span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-surface-600 text-[13px] text-accent-amber">
              Pro tip: Be animated! Use gestures, act it out, give multiple clues fast. The best describers keep talking.
            </div>
          </Card>

          {/* Teams */}
          <section>
            <h2 className="text-[18px] font-bold text-text-primary mb-3">Teams</h2>
            <div className="grid grid-cols-2 gap-3">
              {teams.map((team, i) => (
                <Card
                  key={i}
                  onClick={() => { setEditingTeam(i); setEditName(team.name); }}
                  className="text-center"
                >
                  <div
                    className="w-[48px] h-[48px] rounded-full mx-auto mb-2 flex items-center justify-center text-[24px] font-bold text-white"
                    style={{ backgroundColor: team.color }}
                  >
                    {i + 1}
                  </div>
                  <div className="text-text-primary text-[18px] font-semibold">{team.name}</div>
                  <div className="text-text-muted text-[13px] mt-1">Tap to rename</div>
                </Card>
              ))}
            </div>
          </section>

          {/* Category */}
          <section>
            <h2 className="text-[18px] font-bold text-text-primary mb-3">Category</h2>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={[
                    'px-4 py-2 rounded-xl text-[16px] font-medium transition-all active:scale-95',
                    category === cat
                      ? 'bg-accent-blue text-white'
                      : 'bg-surface-700 text-text-secondary hover:bg-surface-600',
                  ].join(' ')}
                >
                  {cat}
                </button>
              ))}
            </div>
          </section>

          {/* Timer Duration */}
          <section>
            <h2 className="text-[18px] font-bold text-text-primary mb-3">
              Round Timer: {timerDuration}s
            </h2>
            <div className="flex gap-3">
              {[45, 60, 75, 90].map(t => (
                <button
                  key={t}
                  onClick={() => { setTimerDuration(t); setTimeLeft(t); }}
                  className={[
                    'flex-1 h-[56px] rounded-xl text-[18px] font-bold transition-all active:scale-95',
                    timerDuration === t
                      ? 'bg-accent-purple text-white'
                      : 'bg-surface-700 text-text-secondary',
                  ].join(' ')}
                >
                  {t}s
                </button>
              ))}
            </div>
          </section>

          {/* Win Score */}
          <section>
            <h2 className="text-[18px] font-bold text-text-primary mb-3">
              Play to: {winScore} points
            </h2>
            <div className="flex gap-3">
              {[5, 7, 10].map(s => (
                <button
                  key={s}
                  onClick={() => setWinScore(s)}
                  className={[
                    'flex-1 h-[56px] rounded-xl text-[18px] font-bold transition-all active:scale-95',
                    winScore === s
                      ? 'bg-accent-green text-white'
                      : 'bg-surface-700 text-text-secondary',
                  ].join(' ')}
                >
                  {s}
                </button>
              ))}
            </div>
          </section>

          {/* Start */}
          <Button size="lg" fullWidth onClick={startGame}>
            Start Game
          </Button>
        </div>
      )}

      {/* ============ PLAYING ============ */}
      {phase === 'playing' && (
        <div className="space-y-6">
          {/* Scoreboard */}
          <div className="grid grid-cols-2 gap-4">
            {teams.map((team, i) => (
              <Card
                key={i}
                className={`text-center ${i === currentTeamIndex ? 'ring-2' : 'opacity-60'}`}
                glow={i === currentTeamIndex ? team.color : undefined}
              >
                <div className="text-[14px] text-text-secondary font-medium">{team.name}</div>
                <div className="text-[48px] font-black" style={{ color: team.color }}>
                  {team.score}
                </div>
              </Card>
            ))}
          </div>

          {/* Timer */}
          <div className="text-center">
            <div
              className="text-[96px] font-black leading-none transition-colors duration-300"
              style={{ color: timerColor }}
            >
              {timeLeft}
            </div>
            {/* Timer bar */}
            <div className="w-full h-3 bg-surface-700 rounded-full mt-4 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000 ease-linear"
                style={{
                  width: `${timerPct}%`,
                  backgroundColor: timerColor,
                }}
              />
            </div>
          </div>

          {/* Current turn info */}
          <div className="text-center">
            <div className="text-[20px] font-bold" style={{ color: teams[currentTeamIndex].color }}>
              {teams[currentTeamIndex].name}'s Turn
            </div>
          </div>

          {/* Current word — Surface-only display */}
          <Card className="text-center" glow={teams[currentTeamIndex].color}>
            <div className="text-text-muted text-[14px] mb-2">Current Word</div>
            <div className="text-[42px] font-black text-text-primary leading-tight min-h-[60px]">
              {currentWord || '...'}
            </div>
          </Card>

          {/* Surface-only action buttons: Got It! and Skip */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleGotIt}
              className="h-[80px] rounded-2xl bg-accent-green text-white text-[24px] font-black active:scale-95 transition-all select-none shadow-lg"
            >
              Got It!
            </button>
            <button
              onClick={handleSkip}
              className="h-[80px] rounded-2xl bg-surface-600 text-text-secondary text-[24px] font-bold active:scale-95 transition-all select-none border-2 border-surface-500"
            >
              Skip
            </button>
          </div>

          {/* Round stats */}
          <div className="flex justify-center gap-8">
            <div className="text-center">
              <div className="text-[28px] font-bold text-accent-green">
                {roundWords.filter(w => w.guessed).length}
              </div>
              <div className="text-text-muted text-[13px]">Guessed</div>
            </div>
            <div className="text-center">
              <div className="text-[28px] font-bold text-accent-red">
                {roundWords.filter(w => !w.guessed).length}
              </div>
              <div className="text-text-muted text-[13px]">Skipped</div>
            </div>
          </div>
        </div>
      )}

      {/* ============ ROUND END ============ */}
      {phase === 'roundEnd' && (
        <div className="space-y-6">
          <div className="text-center">
            <div className="text-[48px] font-black text-accent-red mb-2">TIME'S UP!</div>
            <div className="text-text-secondary text-[18px]">
              Which team gets the point?
            </div>
          </div>

          {/* Scoreboard */}
          <div className="grid grid-cols-2 gap-4">
            {teams.map((team, i) => (
              <Card key={i} className="text-center">
                <div className="text-[14px] text-text-secondary font-medium">{team.name}</div>
                <div className="text-[36px] font-black" style={{ color: team.color }}>
                  {team.score}
                </div>
              </Card>
            ))}
          </div>

          {/* Award point buttons */}
          <div className="grid grid-cols-2 gap-3">
            {teams.map((team, i) => (
              <Button
                key={i}
                size="lg"
                fullWidth
                color={team.color}
                onClick={() => endRound(i)}
              >
                {team.name} +1
              </Button>
            ))}
          </div>

          {/* Word review */}
          {roundWords.length > 0 && (
            <section>
              <h3 className="text-[16px] font-bold text-text-primary mb-2">This Round</h3>
              <div className="space-y-2">
                {roundWords.map((w, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-4 py-2 rounded-xl bg-surface-800"
                  >
                    <span className="text-text-primary text-[16px]">{w.word}</span>
                    <span className={w.guessed ? 'text-accent-green' : 'text-accent-red'}>
                      {w.guessed ? 'Guessed' : 'Skipped'}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ============ ROUND REVIEW MODAL ============ */}
      {showRoundReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <Card className="w-full max-w-md text-center p-6">
            <div className="text-[24px] font-bold text-text-primary mb-4">Round Complete</div>
            <div className="grid grid-cols-2 gap-4 mb-6">
              {teams.map((team, i) => (
                <div key={i}>
                  <div className="text-[14px] text-text-secondary">{team.name}</div>
                  <div className="text-[36px] font-black" style={{ color: team.color }}>
                    {team.score}
                  </div>
                </div>
              ))}
            </div>
            <Button size="lg" fullWidth onClick={nextRound}>
              Next Round
            </Button>
          </Card>
        </div>
      )}

      {/* ============ GAME OVER ============ */}
      {phase === 'gameOver' && (() => {
        const winner = teams.reduce((a, b) => a.score > b.score ? a : b);
        return (
          <div className="space-y-6 text-center">
            <div
              className="text-[48px] font-black"
              style={{ color: winner.color }}
            >
              {winner.name} Wins!
            </div>
            <div className="text-[72px] font-black text-text-primary">
              {winner.score} - {teams.find(t => t !== winner)?.score ?? 0}
            </div>

            <div className="flex gap-3 mt-8">
              <Button size="lg" fullWidth onClick={resetGame}>
                New Game
              </Button>
            </div>
          </div>
        );
      })()}

      {/* ============ TEAM NAME EDIT MODAL ============ */}
      <Modal
        open={editingTeam !== null}
        onClose={() => setEditingTeam(null)}
        title="Rename Team"
        size="sm"
      >
        <div className="space-y-4">
          <input
            type="text"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            autoFocus
            className="w-full h-[56px] px-4 text-[20px] bg-surface-700 text-text-primary rounded-xl border border-surface-500 focus:border-accent-blue focus:outline-none placeholder:text-text-muted"
            onKeyDown={e => {
              if (e.key === 'Enter' && editName.trim()) {
                setTeams(prev => prev.map((t, i) =>
                  i === editingTeam ? { ...t, name: editName.trim() } : t
                ));
                setEditingTeam(null);
              }
            }}
          />
          <Button
            size="lg"
            fullWidth
            disabled={!editName.trim()}
            onClick={() => {
              setTeams(prev => prev.map((t, i) =>
                i === editingTeam ? { ...t, name: editName.trim() } : t
              ));
              setEditingTeam(null);
            }}
          >
            Save
          </Button>
        </div>
      </Modal>
    </div>
  );
}
