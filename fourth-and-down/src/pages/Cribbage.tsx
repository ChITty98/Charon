import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { Toggle } from '../components/ui/Toggle';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

interface Player {
  id: number;
  name: string;
  color: string;
}

interface CribCard {
  rank: number; // 1=A, 2-10, 11=J, 12=Q, 13=K
  suit: 'h' | 'd' | 'c' | 's';
}

interface ScoreBreakdown {
  fifteens: { cards: number[]; count: number };
  pairs: { cards: number[]; count: number };
  runs: { cards: number[]; count: number };
  flush: number;
  nobs: number;
  total: number;
  details: string[];
}

interface HandRecord {
  id: number;
  hand_number: number;
  hand_score: number;
  hand_detail: string | null;
  is_crib: number;
  player_id: number;
}

interface CareerStats {
  gamesPlayed: number;
  wins: number;
  bestHand: number;
  avgHandScore: number;
}

type View = 'setup' | 'playing' | 'calculator' | 'tips';

/* ================================================================== */
/*  Card display helpers                                               */
/* ================================================================== */

const RANK_LABELS: Record<number, string> = {
  1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7',
  8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K',
};

const SUIT_SYMBOLS: Record<string, string> = { h: '\u2665', d: '\u2666', c: '\u2663', s: '\u2660' };
const SUIT_COLORS: Record<string, string> = { h: '#ef4444', d: '#ef4444', c: '#f0f0f5', s: '#f0f0f5' };

function MiniCard({ card, selected, onClick }: { card: CribCard; selected?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={[
        'w-[52px] h-[72px] rounded-lg flex flex-col items-center justify-center border-2 transition-all duration-150',
        selected
          ? 'border-accent-blue bg-accent-blue/20 scale-105'
          : 'border-surface-500 bg-surface-800 hover:border-surface-400',
      ].join(' ')}
    >
      <span className="text-[14px] font-bold leading-none" style={{ color: SUIT_COLORS[card.suit] }}>
        {RANK_LABELS[card.rank]}
      </span>
      <span className="text-[20px] leading-none" style={{ color: SUIT_COLORS[card.suit] }}>
        {SUIT_SYMBOLS[card.suit]}
      </span>
    </button>
  );
}

/* ================================================================== */
/*  Cribbage hand calculator (client-side)                             */
/* ================================================================== */

function cardValue(rank: number): number {
  return rank >= 10 ? 10 : rank;
}

function calculateCribbageHand(hand: CribCard[], cut: CribCard): ScoreBreakdown {
  const all = [...hand, cut];
  const details: string[] = [];
  let total = 0;

  // --- Fifteens ---
  let fifteenCount = 0;
  const fifteenCards: number[] = [];
  // Check all subsets of 2-5 cards from the 5 cards
  for (let mask = 1; mask < 32; mask++) {
    const subset: number[] = [];
    let sum = 0;
    for (let i = 0; i < 5; i++) {
      if (mask & (1 << i)) {
        subset.push(i);
        sum += cardValue(all[i].rank);
      }
    }
    if (sum === 15) {
      fifteenCount++;
      fifteenCards.push(...subset);
    }
  }
  if (fifteenCount > 0) {
    const pts = fifteenCount * 2;
    total += pts;
    details.push(`Fifteens: ${fifteenCount} combo${fifteenCount > 1 ? 's' : ''} = ${pts} pts`);
  }

  // --- Pairs ---
  let pairCount = 0;
  const pairCards: number[] = [];
  for (let i = 0; i < 5; i++) {
    for (let j = i + 1; j < 5; j++) {
      if (all[i].rank === all[j].rank) {
        pairCount++;
        pairCards.push(i, j);
      }
    }
  }
  if (pairCount > 0) {
    const pts = pairCount * 2;
    total += pts;
    details.push(`Pairs: ${pairCount} pair${pairCount > 1 ? 's' : ''} = ${pts} pts`);
  }

  // --- Runs ---
  let runPoints = 0;
  const runCards: number[] = [];
  // Get unique ranks sorted, find longest consecutive sequence,
  // then multiply by product of counts per rank (handles double/triple/quadruple runs)
  const uniqueRanks = [...new Set(all.map(c => c.rank))].sort((a, b) => a - b);

  // Find longest consecutive sequence among unique ranks
  let bestStart = 0;
  let bestLen = 1;
  let curStart = 0;
  let curLen = 1;
  for (let i = 1; i < uniqueRanks.length; i++) {
    if (uniqueRanks[i] === uniqueRanks[i - 1] + 1) {
      curLen++;
    } else {
      if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; }
      curStart = i;
      curLen = 1;
    }
  }
  if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; }

  if (bestLen >= 3) {
    const runRanks = uniqueRanks.slice(bestStart, bestStart + bestLen);
    // Count how many cards match each rank in the run
    let multiplier = 1;
    for (const r of runRanks) {
      const count = all.filter(c => c.rank === r).length;
      multiplier *= count;
    }
    runPoints = bestLen * multiplier;
    total += runPoints;
    const numRuns = multiplier;
    details.push(`Runs: ${numRuns} run${numRuns > 1 ? 's' : ''} of ${bestLen} = ${runPoints} pts`);
    // Mark all cards in the run ranks
    for (let i = 0; i < all.length; i++) {
      if (runRanks.includes(all[i].rank)) runCards.push(i);
    }
  }

  // --- Flush ---
  let flushPoints = 0;
  const handSuit = hand[0].suit;
  const handFlush = hand.every(c => c.suit === handSuit);
  if (handFlush) {
    if (cut.suit === handSuit) {
      flushPoints = 5;
      details.push('Flush: 5 cards = 5 pts');
    } else {
      flushPoints = 4;
      details.push('Flush: 4 cards = 4 pts');
    }
    total += flushPoints;
  }

  // --- Nobs (Jack of cut suit) ---
  let nobsPoints = 0;
  for (const c of hand) {
    if (c.rank === 11 && c.suit === cut.suit) {
      nobsPoints = 1;
      total += 1;
      details.push('Nobs: Jack of cut suit = 1 pt');
      break;
    }
  }

  return {
    fifteens: { cards: fifteenCards, count: fifteenCount },
    pairs: { cards: pairCards, count: pairCount },
    runs: { cards: runCards, count: runPoints > 0 ? runPoints / (bestLen || 1) : 0 },
    flush: flushPoints,
    nobs: nobsPoints,
    total,
    details,
  };
}

function isConsecutive(sorted: number[]): boolean {
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) return false;
  }
  return true;
}

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */

export function Cribbage() {
  const [view, setView] = useState<View>('setup');
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  // Setup state
  const [player1, setPlayer1] = useState<number | null>(null);
  const [player2, setPlayer2] = useState<number | null>(null);
  const [targetScore, setTargetScore] = useState(121);

  // Game state
  const [gameId, setGameId] = useState<number | null>(null);
  const [scores, setScores] = useState<Record<number, number>>({});
  const [hands, setHands] = useState<HandRecord[]>([]);
  const [handNumber, setHandNumber] = useState(1);
  const [scoreModal, setScoreModal] = useState<number | null>(null); // playerId
  const [scoreInput, setScoreInput] = useState('');
  const [isCrib, setIsCrib] = useState(false);
  const [gameOver, setGameOver] = useState(false);

  // Calculator state
  const [calcHand, setCalcHand] = useState<CribCard[]>([]);
  const [calcCut, setCalcCut] = useState<CribCard | null>(null);
  const [calcResult, setCalcResult] = useState<ScoreBreakdown | null>(null);
  const [selectingCut, setSelectingCut] = useState(false);

  // Tips state
  const [expandedTip, setExpandedTip] = useState<number | null>(null);

  // Career stats
  const [careerPlayer, setCareerPlayer] = useState<number | null>(null);
  const [career, setCareer] = useState<CareerStats | null>(null);

  /* ---- Load players ---- */
  useEffect(() => {
    (async () => {
      try {
        const sp = await api.get<any[]>('/sessions/current/players').catch(() => api.get<any[]>('/players'));
        setPlayers(sp.map((p: any) => ({ id: p.player_id ?? p.id, name: p.name, color: p.color })));
      } catch { /* no session */ }
      finally { setLoading(false); }
    })();
  }, []);

  /* ---- Start game ---- */
  const startGame = useCallback(async () => {
    if (!player1 || !player2) return;
    try {
      const res = await api.post<{ id: number }>('/cribbage/start', {
        player1Id: player1,
        player2Id: player2,
        targetScore,
      });
      setGameId(res.id);
      setScores({ [player1]: 0, [player2]: 0 });
      setHands([]);
      setHandNumber(1);
      setGameOver(false);
      setView('playing');
    } catch (e) {
      console.error('Failed to start cribbage game', e);
    }
  }, [player1, player2, targetScore]);

  /* ---- Add score ---- */
  const submitScore = useCallback(async () => {
    if (!gameId || !scoreModal || !scoreInput) return;
    const score = parseInt(scoreInput);
    if (isNaN(score) || score < 0) return;

    try {
      await api.post('/cribbage/score', {
        gameId,
        playerId: scoreModal,
        handNumber,
        score,
        isCrib,
        detail: '',
      });

      setScores(prev => {
        const newScores = { ...prev, [scoreModal]: (prev[scoreModal] || 0) + score };
        // Check for winner
        if (newScores[scoreModal] >= targetScore) {
          setGameOver(true);
          api.post('/cribbage/end', {
            gameId,
            winnerId: scoreModal,
            finalScores: newScores,
          }).catch(() => {});
        }
        return newScores;
      });

      setHands(prev => [...prev, {
        id: Date.now(),
        hand_number: handNumber,
        hand_score: score,
        hand_detail: null,
        is_crib: isCrib ? 1 : 0,
        player_id: scoreModal,
      }]);

      setHandNumber(prev => prev + 1);
      setScoreModal(null);
      setScoreInput('');
      setIsCrib(false);
    } catch (e) {
      console.error('Failed to submit score', e);
    }
  }, [gameId, scoreModal, scoreInput, handNumber, isCrib, targetScore]);

  /* ---- Calculator ---- */
  const toggleCalcCard = useCallback((card: CribCard) => {
    if (selectingCut) {
      setCalcCut(card);
      setSelectingCut(false);
      return;
    }

    setCalcHand(prev => {
      const idx = prev.findIndex(c => c.rank === card.rank && c.suit === card.suit);
      if (idx >= 0) return prev.filter((_, i) => i !== idx);
      if (prev.length >= 4) return prev;
      return [...prev, card];
    });
  }, [selectingCut]);

  const runCalculation = useCallback(() => {
    if (calcHand.length !== 4 || !calcCut) return;
    const result = calculateCribbageHand(calcHand, calcCut);
    setCalcResult(result);
  }, [calcHand, calcCut]);

  const resetCalc = useCallback(() => {
    setCalcHand([]);
    setCalcCut(null);
    setCalcResult(null);
    setSelectingCut(false);
  }, []);

  /* ---- Career stats ---- */
  const loadCareer = useCallback(async (playerId: number) => {
    setCareerPlayer(playerId);
    try {
      const stats = await api.get<CareerStats>(`/cribbage/career/${playerId}`);
      setCareer(stats);
    } catch {
      setCareer({ gamesPlayed: 0, wins: 0, bestHand: 0, avgHandScore: 0 });
    }
  }, []);

  /* ---- Helpers ---- */
  const getPlayer = (id: number) => players.find(p => p.id === id);

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
      {/* Header with view tabs */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-[28px] font-bold text-text-primary">Cribbage</h1>
        {view !== 'setup' && (
          <div className="flex gap-2">
            {(['playing', 'calculator', 'tips'] as View[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={[
                  'px-3 py-2 rounded-lg text-[14px] font-semibold transition-colors',
                  view === v ? 'bg-accent-blue text-white' : 'bg-surface-700 text-text-secondary hover:bg-surface-600',
                ].join(' ')}
              >
                {v === 'playing' ? 'Score' : v === 'calculator' ? 'Calc' : 'Tips'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ---- SETUP VIEW ---- */}
      {view === 'setup' && (
        <div className="space-y-6">
          <Card>
            <h2 className="text-[20px] font-bold text-text-primary mb-4">Select Players</h2>
            <div className="grid grid-cols-2 gap-4">
              {[1, 2].map(num => (
                <div key={num}>
                  <p className="text-[14px] text-text-muted mb-2">Player {num}</p>
                  <div className="space-y-2">
                    {players.map(p => (
                      <button
                        key={p.id}
                        onClick={() => num === 1 ? setPlayer1(p.id) : setPlayer2(p.id)}
                        disabled={(num === 1 && p.id === player2) || (num === 2 && p.id === player1)}
                        className={[
                          'w-full h-[48px] rounded-xl flex items-center gap-3 px-4 transition-all',
                          (num === 1 ? player1 : player2) === p.id
                            ? 'bg-accent-blue/20 border-2 border-accent-blue'
                            : 'bg-surface-700 border-2 border-transparent hover:border-surface-500',
                          'disabled:opacity-30',
                        ].join(' ')}
                      >
                        <div className="w-[28px] h-[28px] rounded-full" style={{ backgroundColor: p.color }} />
                        <span className="text-[16px] font-medium text-text-primary">{p.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="text-[20px] font-bold text-text-primary mb-4">Target Score</h2>
            <div className="flex gap-3">
              {[121, 61].map(t => (
                <button
                  key={t}
                  onClick={() => setTargetScore(t)}
                  className={[
                    'flex-1 h-[56px] rounded-xl text-[20px] font-bold transition-all',
                    targetScore === t
                      ? 'bg-accent-blue text-white'
                      : 'bg-surface-700 text-text-secondary hover:bg-surface-600',
                  ].join(' ')}
                >
                  {t} {t === 121 ? '(Standard)' : '(Short)'}
                </button>
              ))}
            </div>
          </Card>

          <Button
            fullWidth
            size="lg"
            disabled={!player1 || !player2}
            onClick={startGame}
          >
            Start Game
          </Button>

          {/* Quick career stats */}
          {players.length > 0 && (
            <Card>
              <h2 className="text-[20px] font-bold text-text-primary mb-3">Career Stats</h2>
              <div className="flex gap-2 mb-3">
                {players.map(p => (
                  <button
                    key={p.id}
                    onClick={() => loadCareer(p.id)}
                    className={[
                      'px-4 py-2 rounded-lg text-[14px] font-medium transition-all',
                      careerPlayer === p.id ? 'bg-accent-blue text-white' : 'bg-surface-700 text-text-secondary',
                    ].join(' ')}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              {career && careerPlayer && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-surface-700 rounded-xl p-3 text-center">
                    <div className="text-[24px] font-bold text-text-primary">{career.gamesPlayed}</div>
                    <div className="text-[12px] text-text-muted">Games</div>
                  </div>
                  <div className="bg-surface-700 rounded-xl p-3 text-center">
                    <div className="text-[24px] font-bold text-accent-green">{career.wins}</div>
                    <div className="text-[12px] text-text-muted">Wins</div>
                  </div>
                  <div className="bg-surface-700 rounded-xl p-3 text-center">
                    <div className="text-[24px] font-bold text-accent-amber">{career.bestHand}</div>
                    <div className="text-[12px] text-text-muted">Best Hand</div>
                  </div>
                  <div className="bg-surface-700 rounded-xl p-3 text-center">
                    <div className="text-[24px] font-bold text-accent-blue">{career.avgHandScore.toFixed(1)}</div>
                    <div className="text-[12px] text-text-muted">Avg Hand</div>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* ---- PLAYING VIEW ---- */}
      {view === 'playing' && player1 && player2 && (
        <div className="space-y-4">
          {gameOver && (
            <div className="bg-accent-green/20 border border-accent-green rounded-xl p-4 text-center">
              <div className="text-[24px] font-bold text-accent-green mb-1">Game Over!</div>
              <div className="text-[18px] text-text-primary">
                {getPlayer(scores[player1] >= targetScore ? player1 : player2)?.name} wins!
              </div>
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => { setView('setup'); setGameId(null); }}>
                New Game
              </Button>
            </div>
          )}

          {/* Score columns */}
          <div className="grid grid-cols-2 gap-4">
            {[player1, player2].map(pid => {
              const p = getPlayer(pid);
              if (!p) return null;
              const score = scores[pid] || 0;
              const pct = Math.min(100, (score / targetScore) * 100);

              return (
                <Card key={pid}>
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex items-center gap-2">
                      <div className="w-[24px] h-[24px] rounded-full" style={{ backgroundColor: p.color }} />
                      <span className="text-[16px] font-semibold text-text-primary">{p.name}</span>
                    </div>

                    <div className="text-[48px] font-bold text-text-primary leading-none">{score}</div>

                    {/* Progress bar */}
                    <div className="w-full h-[8px] bg-surface-600 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: p.color }}
                      />
                    </div>
                    <div className="text-[12px] text-text-muted">{score} / {targetScore}</div>

                    {!gameOver && (
                      <Button
                        size="sm"
                        fullWidth
                        onClick={() => { setScoreModal(pid); setScoreInput(''); setIsCrib(false); }}
                      >
                        + Score
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Hand history */}
          {hands.length > 0 && (
            <Card>
              <h3 className="text-[18px] font-bold text-text-primary mb-3">Hand History</h3>
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {[...hands].reverse().map(h => {
                  const p = getPlayer(h.player_id);
                  return (
                    <div key={h.id} className="flex items-center justify-between bg-surface-700 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-[16px] h-[16px] rounded-full" style={{ backgroundColor: p?.color }} />
                        <span className="text-[14px] text-text-primary">{p?.name}</span>
                        {h.is_crib === 1 && (
                          <span className="text-[11px] bg-accent-purple/30 text-accent-purple px-2 py-0.5 rounded-full">CRIB</span>
                        )}
                      </div>
                      <span className="text-[16px] font-bold text-accent-green">+{h.hand_score}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Score entry modal */}
          <Modal open={scoreModal !== null} onClose={() => setScoreModal(null)} title="Enter Hand Score">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[16px] text-text-primary">Player: {getPlayer(scoreModal || 0)?.name}</span>
                <Toggle checked={isCrib} onChange={setIsCrib} label="Crib" size="md" />
              </div>

              {/* Number input */}
              <div className="flex items-center justify-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="29"
                  value={scoreInput}
                  onChange={e => setScoreInput(e.target.value)}
                  placeholder="0"
                  className="w-[120px] h-[64px] bg-surface-700 border border-surface-500 rounded-xl text-center text-[32px] font-bold text-text-primary focus:outline-none focus:border-accent-blue"
                />
              </div>

              {/* Quick score buttons */}
              <div className="grid grid-cols-5 gap-2">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 24].map(n => (
                  <button
                    key={n}
                    onClick={() => setScoreInput(String(n))}
                    className="h-[44px] rounded-lg bg-surface-700 text-[16px] font-semibold text-text-primary hover:bg-surface-600 active:scale-95 transition-all"
                  >
                    {n}
                  </button>
                ))}
              </div>

              <Button fullWidth onClick={submitScore} disabled={!scoreInput}>
                Add Score
              </Button>
            </div>
          </Modal>
        </div>
      )}

      {/* ---- CALCULATOR VIEW ---- */}
      {view === 'calculator' && (
        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[20px] font-bold text-text-primary">Hand Calculator</h2>
              <button onClick={resetCalc} className="text-[14px] text-accent-blue hover:underline">Reset</button>
            </div>

            {/* Selected cards display */}
            <div className="flex items-center gap-4 mb-4">
              <div>
                <p className="text-[12px] text-text-muted mb-1">Hand ({calcHand.length}/4)</p>
                <div className="flex gap-1">
                  {calcHand.map((c, i) => (
                    <MiniCard
                      key={i}
                      card={c}
                      selected
                      onClick={() => setCalcHand(prev => prev.filter((_, idx) => idx !== i))}
                    />
                  ))}
                  {Array.from({ length: 4 - calcHand.length }).map((_, i) => (
                    <div key={`empty-${i}`} className="w-[52px] h-[72px] rounded-lg border-2 border-dashed border-surface-500" />
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[12px] text-text-muted mb-1">Cut</p>
                <div className="flex gap-1">
                  {calcCut ? (
                    <MiniCard card={calcCut} selected onClick={() => setCalcCut(null)} />
                  ) : (
                    <button
                      onClick={() => setSelectingCut(true)}
                      className={[
                        'w-[52px] h-[72px] rounded-lg border-2 border-dashed flex items-center justify-center text-[12px] text-text-muted',
                        selectingCut ? 'border-accent-orange bg-accent-orange/10' : 'border-surface-500',
                      ].join(' ')}
                    >
                      {selectingCut ? 'Pick' : 'Cut'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Mode indicator */}
            {selectingCut && (
              <div className="bg-accent-orange/20 border border-accent-orange rounded-lg px-3 py-2 text-[14px] text-accent-orange mb-3">
                Tap a card below to set as the cut card
              </div>
            )}

            {/* Card grid */}
            <div className="space-y-2">
              {(['h', 'd', 'c', 's'] as const).map(suit => (
                <div key={suit} className="flex gap-1 flex-wrap">
                  {Array.from({ length: 13 }, (_, i) => i + 1).map(rank => {
                    const card: CribCard = { rank, suit };
                    const inHand = calcHand.some(c => c.rank === rank && c.suit === suit);
                    const isCutCard = calcCut?.rank === rank && calcCut?.suit === suit;
                    const disabled = inHand || isCutCard;

                    return (
                      <button
                        key={`${rank}-${suit}`}
                        onClick={() => !disabled && toggleCalcCard(card)}
                        disabled={disabled}
                        className={[
                          'w-[38px] h-[44px] rounded flex flex-col items-center justify-center text-[11px] font-bold transition-all',
                          disabled
                            ? 'bg-accent-blue/30 border border-accent-blue opacity-50'
                            : 'bg-surface-700 border border-surface-500 hover:border-surface-400 active:scale-95',
                        ].join(' ')}
                      >
                        <span style={{ color: SUIT_COLORS[suit] }}>{RANK_LABELS[rank]}</span>
                        <span className="text-[10px]" style={{ color: SUIT_COLORS[suit] }}>{SUIT_SYMBOLS[suit]}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <Button
              fullWidth
              className="mt-4"
              disabled={calcHand.length !== 4 || !calcCut}
              onClick={runCalculation}
            >
              Calculate Score
            </Button>
          </Card>

          {/* Results */}
          {calcResult && (
            <Card glow={calcResult.total >= 12 ? '#22c55e' : undefined}>
              <div className="text-center mb-4">
                <div className="text-[48px] font-bold text-accent-green leading-none">{calcResult.total}</div>
                <div className="text-[14px] text-text-muted">points</div>
              </div>
              <div className="space-y-2">
                {calcResult.details.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 bg-surface-700 rounded-lg px-3 py-2">
                    <span className="text-[14px] text-text-primary">{d}</span>
                  </div>
                ))}
                {calcResult.details.length === 0 && (
                  <div className="text-center text-[16px] text-text-muted py-2">No scoring combinations</div>
                )}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ---- TIPS VIEW ---- */}
      {view === 'tips' && (
        <div className="space-y-3">
          {[
            {
              title: 'What to Keep',
              content: 'Keep cards that make 15s together. Keep pairs for 2 points each. Keep sequential cards (e.g., 5-6-7) for run potential. Keep cards that work with each other in multiple ways.',
            },
            {
              title: 'What to Throw to Crib',
              content: 'If it\'s YOUR crib: throw cards that pair well together (5s are gold, face cards with 5s). If it\'s OPPONENT\'S crib: throw wide cards like K-A, avoid throwing 5s, and don\'t throw pairs or cards adding to 15.',
            },
            {
              title: 'Pegging Tips',
              content: 'Lead with low cards (not 5s). Pair when safe, but avoid giving runs. Play cards that make the count hard to hit 15 or 31. Trail with a high card when losing.',
            },
            {
              title: 'Magic Numbers',
              content: '15 = most common scoring combo (2 pts). 31 = bonus point for hitting exactly. 5 = most dangerous card to discard to opponent\'s crib. 29 = perfect hand (three 5s + J of cut suit + 5 cut). Average hand score is about 4.7 points.',
            },
          ].map((tip, i) => (
            <Card key={i} onClick={() => setExpandedTip(expandedTip === i ? null : i)}>
              <div className="flex items-center justify-between">
                <h3 className="text-[18px] font-bold text-text-primary">{tip.title}</h3>
                <span className="text-text-muted text-[20px]">{expandedTip === i ? '\u25B2' : '\u25BC'}</span>
              </div>
              {expandedTip === i && (
                <p className="mt-3 text-[16px] text-text-secondary leading-relaxed">{tip.content}</p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
