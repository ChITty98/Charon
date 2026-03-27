import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useSocket } from '../lib/socket';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

interface Player {
  id: number;
  name: string;
  color?: string;
}

type DiceGameType = 'farkle' | 'yahtzee' | 'ship_captain_crew';

interface YahtzeeCard {
  ones: number | null;
  twos: number | null;
  threes: number | null;
  fours: number | null;
  fives: number | null;
  sixes: number | null;
  threeOfKind: number | null;
  fourOfKind: number | null;
  fullHouse: number | null;
  smallStraight: number | null;
  largeStraight: number | null;
  yahtzee: number | null;
  chance: number | null;
  yahtzeeBonus: number;
}

interface DiceState {
  dbId: number;
  type: DiceGameType;
  players: Player[];
  currentPlayerIndex: number;
  round: number;
  scores: Record<number, number>;
  yahtzeeCards?: Record<number, YahtzeeCard>;
}

/* ================================================================== */
/*  Game Info                                                          */
/* ================================================================== */

const GAME_INFO: Record<DiceGameType, { name: string; hook: string; dice: number; icon: string; players: string }> = {
  farkle: {
    name: 'Farkle',
    hook: 'Push your luck -- score big or lose it all!',
    dice: 6,
    icon: '🎲',
    players: '2-6 players',
  },
  yahtzee: {
    name: 'Yahtzee',
    hook: 'Fill your scorecard -- strategy meets luck!',
    dice: 5,
    icon: '📋',
    players: '1-6 players',
  },
  ship_captain_crew: {
    name: 'Ship Captain Crew',
    hook: 'Find your captain, crew, and cargo -- fast!',
    dice: 5,
    icon: '⚓',
    players: '2-6 players',
  },
};

/* ================================================================== */
/*  Instructions                                                       */
/* ================================================================== */

function FarkleInstructions({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  return (
    <Card>
      <button onClick={onToggle} className="w-full flex items-center justify-between">
        <div>
          <div className="text-text-primary text-[18px] font-bold">Farkle Rules</div>
          <div className="text-text-muted text-[14px]">Push your luck -- score big or lose it all!</div>
        </div>
        <span className="text-text-muted text-[20px]">{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>
      {expanded && (
        <div className="mt-4 space-y-3">
          <div className="bg-surface-700 rounded-lg p-3 text-[14px] text-text-primary mb-2">
            <span className="font-bold">Push-your-luck dice game.</span> Roll your real dice — the app tracks running scores and turn totals. Tap "Bank" to lock in points or "Farkle" when you bust.
          </div>
          <div className="text-text-secondary text-[14px] font-medium">HOW TO PLAY</div>
          <ol className="text-text-secondary text-[15px] space-y-2 list-decimal pl-5">
            <li><span className="font-semibold text-text-primary">Roll all 6 dice.</span> Set aside any dice that score (see chart below).</li>
            <li><span className="font-semibold text-text-primary">Keep rolling or bank.</span> After setting aside scoring dice, roll the remaining ones for more points — or bank what you have.</li>
            <li><span className="font-semibold text-text-primary">FARKLE!</span> If you roll and NO dice score, you lose ALL points from that turn. Ouch.</li>
            <li><span className="font-semibold text-text-primary">Hot Dice!</span> If all 6 dice score, pick them all up and keep rolling with all 6 again.</li>
            <li><span className="font-semibold text-text-primary">First to 10,000 wins!</span> But once someone hits 10K, everyone else gets one final turn to try to beat them.</li>
          </ol>
          <div className="text-text-secondary text-[14px] font-medium mt-3">SCORING</div>
          <div className="grid grid-cols-2 gap-1 text-[14px]">
            <div className="text-text-secondary">Single 1</div><div className="text-text-primary font-bold">100</div>
            <div className="text-text-secondary">Single 5</div><div className="text-text-primary font-bold">50</div>
            <div className="text-text-secondary">Three 1s</div><div className="text-text-primary font-bold">1,000</div>
            <div className="text-text-secondary">Three 2s</div><div className="text-text-primary font-bold">200</div>
            <div className="text-text-secondary">Three 3s</div><div className="text-text-primary font-bold">300</div>
            <div className="text-text-secondary">Three 4s</div><div className="text-text-primary font-bold">400</div>
            <div className="text-text-secondary">Three 5s</div><div className="text-text-primary font-bold">500</div>
            <div className="text-text-secondary">Three 6s</div><div className="text-text-primary font-bold">600</div>
            <div className="text-text-secondary">Four of a Kind</div><div className="text-text-primary font-bold">1,000</div>
            <div className="text-text-secondary">Five of a Kind</div><div className="text-text-primary font-bold">2,000</div>
            <div className="text-text-secondary">Six of a Kind</div><div className="text-text-primary font-bold">3,000</div>
            <div className="text-text-secondary">Straight (1-6)</div><div className="text-text-primary font-bold">1,500</div>
            <div className="text-text-secondary">Three Pairs</div><div className="text-text-primary font-bold">1,500</div>
            <div className="text-text-secondary">Two Triplets</div><div className="text-text-primary font-bold">2,500</div>
          </div>
          <div className="text-text-secondary text-[14px] font-medium mt-3">EXAMPLE</div>
          <div className="text-text-secondary text-[14px] bg-surface-700 rounded-lg p-3">
            Roll: <span className="text-text-primary font-mono">1 3 3 3 5 2</span> — Three 3s (300) + single 1 (100) + single 5 (50) = <span className="text-accent-green font-bold">450</span><br/>
            Set aside the 1, 3s, and 5. Re-roll the 2. Or bank 450 and pass.
          </div>
          <div className="bg-accent-amber/10 rounded-lg p-3 text-[14px] text-accent-amber">
            Pro tip: Bank early if you're close to 10,000. Only 1s and 5s score as singles — 2, 3, 4, 6 are worthless alone. Greed is the #1 cause of Farkle heartbreak.
          </div>
        </div>
      )}
    </Card>
  );
}

function YahtzeeInstructions({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  return (
    <Card>
      <button onClick={onToggle} className="w-full flex items-center justify-between">
        <div>
          <div className="text-text-primary text-[18px] font-bold">Yahtzee Rules</div>
          <div className="text-text-muted text-[14px]">Fill your scorecard -- strategy meets luck!</div>
        </div>
        <span className="text-text-muted text-[20px]">{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>
      {expanded && (
        <div className="mt-4 space-y-3">
          <div className="text-text-secondary text-[14px] font-medium">HOW TO PLAY</div>
          <div className="bg-surface-700 rounded-lg p-3 text-[14px] text-text-primary mb-2">
            <span className="font-bold">Using this app:</span> Roll your real dice, then tap a category on your scorecard below to enter your score. The app tracks scores and totals for everyone.
          </div>
          <ol className="text-text-secondary text-[15px] space-y-1 list-decimal pl-5">
            <li>Roll 5 dice up to 3 times per turn, keeping any dice between rolls.</li>
            <li>After rolling, choose a category on your scorecard to fill.</li>
            <li>Each category can only be used once.</li>
            <li>Game ends when all 13 categories are filled. Highest score wins!</li>
          </ol>
          <div className="text-text-secondary text-[14px] font-medium mt-3">SCORING</div>
          <div className="text-[14px] space-y-1">
            <div className="text-text-muted font-medium">Upper Section (sum of that number):</div>
            <div className="text-text-secondary pl-3">Ones through Sixes. Bonus: 35 pts if total &ge; 63</div>
            <div className="text-text-muted font-medium mt-2">Lower Section:</div>
            <div className="grid grid-cols-2 gap-1 pl-3">
              <div className="text-text-secondary">3 of a Kind</div><div className="text-text-primary font-bold">Sum all</div>
              <div className="text-text-secondary">4 of a Kind</div><div className="text-text-primary font-bold">Sum all</div>
              <div className="text-text-secondary">Full House</div><div className="text-text-primary font-bold">25</div>
              <div className="text-text-secondary">Sm. Straight</div><div className="text-text-primary font-bold">30</div>
              <div className="text-text-secondary">Lg. Straight</div><div className="text-text-primary font-bold">40</div>
              <div className="text-text-secondary">Yahtzee</div><div className="text-text-primary font-bold">50</div>
              <div className="text-text-secondary">Chance</div><div className="text-text-primary font-bold">Sum all</div>
              <div className="text-text-secondary">Yahtzee Bonus</div><div className="text-text-primary font-bold">+100 each</div>
            </div>
          </div>
          <div className="bg-accent-blue/10 rounded-lg p-3 text-[14px] text-accent-blue">
            Pro tip: Aim for the upper bonus early. Getting 3 of each number in the upper section hits 63 exactly.
          </div>
        </div>
      )}
    </Card>
  );
}

function ShipCaptainCrewInstructions({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  return (
    <Card>
      <button onClick={onToggle} className="w-full flex items-center justify-between">
        <div>
          <div className="text-text-primary text-[18px] font-bold">Ship Captain Crew Rules</div>
          <div className="text-text-muted text-[14px]">Find your captain, crew, and cargo -- fast!</div>
        </div>
        <span className="text-text-muted text-[20px]">{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>
      {expanded && (
        <div className="mt-4 space-y-3">
          <div className="bg-surface-700 rounded-lg p-3 text-[14px] text-text-primary mb-2">
            <span className="font-bold">Classic bar dice game.</span> Roll your real dice — the app tracks who has Captain/Mate/Crew and compares cargo scores.
          </div>
          <div className="text-text-secondary text-[14px] font-medium">HOW TO PLAY</div>
          <ol className="text-text-secondary text-[15px] space-y-2 list-decimal pl-5">
            <li><span className="font-semibold text-text-primary">Roll 5 dice.</span> You get up to 3 rolls total per turn.</li>
            <li><span className="font-semibold text-text-primary">Find the Ship (6).</span> You MUST set aside a 6 first — this is your Captain. Can't keep anything else until you have a 6.</li>
            <li><span className="font-semibold text-text-primary">Find the Captain (5).</span> After keeping the 6, set aside a 5. Must be in order — no skipping ahead to the 4.</li>
            <li><span className="font-semibold text-text-primary">Find the Crew (4).</span> After keeping 6 and 5, set aside a 4.</li>
            <li><span className="font-semibold text-text-primary">Cargo = remaining dice.</span> Once you have 6-5-4, your last two dice are your cargo. Sum them up — highest cargo wins!</li>
            <li><span className="font-semibold text-text-primary">Can't complete the set?</span> If after 3 rolls you don't have 6-5-4, you score 0 cargo.</li>
          </ol>
          <div className="text-text-secondary text-[14px] font-medium mt-3">EXAMPLE</div>
          <div className="text-text-secondary text-[14px] bg-surface-700 rounded-lg p-3">
            Roll 1: <span className="text-text-primary font-mono">6 3 5 2 1</span> — Keep the 6 (Ship!) and 5 (Captain!). Re-roll 3, 2, 1.<br/>
            Roll 2: <span className="text-text-primary font-mono">4 6 3</span> — Keep the 4 (Crew!). Your cargo is 6 + 3 = <span className="text-accent-green font-bold">9</span>.<br/>
            You can re-roll cargo dice for a better score, or keep them!
          </div>
          <div className="text-text-secondary text-[14px] font-medium mt-3">TIES</div>
          <div className="text-text-secondary text-[14px]">Tied cargo? Both players roll again (sudden death). At the bar, loser typically buys the round.</div>
          <div className="bg-accent-green/10 rounded-lg p-3 text-[14px] text-accent-green">
            Pro tip: If you roll 6-5-4 on your first roll, you still have 2 re-rolls to improve your cargo dice. Always re-roll low cargo!
          </div>
        </div>
      )}
    </Card>
  );
}

/* ================================================================== */
/*  Yahtzee Scorecard                                                  */
/* ================================================================== */

const YAHTZEE_UPPER = [
  { key: 'ones', label: 'Ones', desc: 'Sum of 1s' },
  { key: 'twos', label: 'Twos', desc: 'Sum of 2s' },
  { key: 'threes', label: 'Threes', desc: 'Sum of 3s' },
  { key: 'fours', label: 'Fours', desc: 'Sum of 4s' },
  { key: 'fives', label: 'Fives', desc: 'Sum of 5s' },
  { key: 'sixes', label: 'Sixes', desc: 'Sum of 6s' },
];

const YAHTZEE_LOWER = [
  { key: 'threeOfKind', label: '3 of a Kind', desc: 'Sum all' },
  { key: 'fourOfKind', label: '4 of a Kind', desc: 'Sum all' },
  { key: 'fullHouse', label: 'Full House', desc: '25 pts' },
  { key: 'smallStraight', label: 'Sm. Straight', desc: '30 pts' },
  { key: 'largeStraight', label: 'Lg. Straight', desc: '40 pts' },
  { key: 'yahtzee', label: 'Yahtzee', desc: '50 pts' },
  { key: 'chance', label: 'Chance', desc: 'Sum all' },
];

function calcYahtzeeTotal(card: YahtzeeCard): number {
  const upper = (card.ones || 0) + (card.twos || 0) + (card.threes || 0) +
    (card.fours || 0) + (card.fives || 0) + (card.sixes || 0);
  const upperBonus = upper >= 63 ? 35 : 0;
  const lower = (card.threeOfKind || 0) + (card.fourOfKind || 0) + (card.fullHouse || 0) +
    (card.smallStraight || 0) + (card.largeStraight || 0) + (card.yahtzee || 0) + (card.chance || 0);
  return upper + upperBonus + lower + (card.yahtzeeBonus || 0);
}

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */

export function DiceGames() {
  const [sessionPlayers, setSessionPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  // Views: select | setup | playing | results
  const [view, setView] = useState<'select' | 'setup' | 'playing' | 'results'>('select');
  const [selectedGame, setSelectedGame] = useState<DiceGameType | null>(null);
  const [selectedPlayers, setSelectedPlayers] = useState<number[]>([]);
  const [diceState, setDiceState] = useState<DiceState | null>(null);

  // Score entry
  const [showScoreEntry, setShowScoreEntry] = useState(false);
  const [scoreInput, setScoreInput] = useState('');
  const [scoreDetail, setScoreDetail] = useState('');

  // Yahtzee
  const [yahtzeeScoreModal, setYahtzeeScoreModal] = useState(false);
  const [yahtzeeDiceInput, setYahtzeeDiceInput] = useState('');

  // SCC
  const [sccState, setSccState] = useState<Record<number, { captain: boolean; mate: boolean; crew: boolean; cargo: number | null }>>({});

  // Farkle
  const [farkleTurnScore, setFarkleTurnScore] = useState(0);

  // Instructions
  const [showInstructions, setShowInstructions] = useState(true);

  // End game
  const [showEndModal, setShowEndModal] = useState(false);

  // Farkle target
  const [farkleTarget, _setFarkleTarget] = useState(10000);
  void _setFarkleTarget; // configurable later

  /* ---- Load session players ---- */
  useEffect(() => {
    (async () => {
      try {
        const sp = await api.get<any[]>('/sessions/current/players');
        setSessionPlayers(sp.map((p: any) => ({ id: p.player_id ?? p.id, name: p.name, color: p.color })));
      } catch {
        // No session
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ---- Check for existing game ---- */
  useEffect(() => {
    (async () => {
      try {
        const state = await api.get<DiceState | null>('/dice/state');
        if (state) {
          setDiceState(state);
          setSelectedGame(state.type);
          setView('playing');
        }
      } catch {
        // No game
      }
    })();
  }, []);

  /* ---- Socket events ---- */
  useSocket('dice:scored', (data: any) => {
    refreshState();
  });

  useSocket('dice:ended', () => {
    setDiceState(null);
    setView('select');
  });

  /* ---- Refresh state ---- */
  const refreshState = useCallback(async () => {
    try {
      const state = await api.get<DiceState | null>('/dice/state');
      if (state) setDiceState(state);
    } catch { /* ignore */ }
  }, []);

  /* ---- Toggle player ---- */
  const togglePlayer = (id: number) => {
    setSelectedPlayers(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  /* ---- Start game ---- */
  const handleStart = async () => {
    if (!selectedGame || selectedPlayers.length < 1) return;
    try {
      await api.post('/dice/start', { gameType: selectedGame, playerIds: selectedPlayers });
      const state = await api.get<DiceState | null>('/dice/state');
      if (state) {
        setDiceState(state);
        if (selectedGame === 'ship_captain_crew') {
          const scc: Record<number, any> = {};
          for (const pid of selectedPlayers) {
            scc[pid] = { captain: false, mate: false, crew: false, cargo: null };
          }
          setSccState(scc);
        }
        setView('playing');
      }
    } catch (err) {
      console.error('Failed to start dice game:', err);
    }
  };

  /* ---- Submit score ---- */
  const submitScore = async (playerId: number, score: number, detail?: string, category?: string) => {
    try {
      await api.post('/dice/score', {
        playerId,
        roundNumber: diceState?.round || 1,
        score,
        detail: detail || undefined,
        category: category || undefined,
      });
      setShowScoreEntry(false);
      setScoreInput('');
      setScoreDetail('');
      setFarkleTurnScore(0);
      refreshState();
    } catch (err) {
      console.error('Failed to submit score:', err);
    }
  };

  /* ---- End game ---- */
  const handleEndGame = async () => {
    if (!diceState) return;
    // Find winner (highest score)
    let winnerId: number | null = null;
    let maxScore = -1;
    for (const p of diceState.players) {
      const s = diceState.scores[p.id] || 0;
      if (s > maxScore) { maxScore = s; winnerId = p.id; }
    }
    try {
      await api.post('/dice/end', { winnerId });
      setDiceState(null);
      setView('select');
      setShowEndModal(false);
    } catch { /* ignore */ }
  };

  /* ---- Current player ---- */
  const getCurrentPlayer = (): Player | null => {
    if (!diceState) return null;
    return diceState.players[diceState.currentPlayerIndex] || null;
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
          <h1 className="text-[28px] font-black text-text-primary">Dice Games</h1>
          <p className="text-text-muted text-[14px]">
            {view === 'select' ? 'Choose your game' :
             view === 'setup' ? `Set up ${GAME_INFO[selectedGame!]?.name}` :
             `${GAME_INFO[diceState?.type || 'farkle']?.name} -- Round ${diceState?.round || 1}`}
          </p>
        </div>
        {view === 'playing' && (
          <button
            onClick={() => setShowEndModal(true)}
            className="h-[40px] px-4 rounded-xl bg-surface-600 text-accent-red text-[14px] font-semibold"
          >
            End Game
          </button>
        )}
        {view === 'setup' && (
          <button
            onClick={() => { setView('select'); setSelectedGame(null); }}
            className="h-[40px] px-4 rounded-xl bg-surface-600 text-text-primary text-[14px] font-semibold"
          >
            Back
          </button>
        )}
      </div>

      {/* ============================================ */}
      {/* GAME SELECTION VIEW                           */}
      {/* ============================================ */}
      {view === 'select' && (
        <div className="space-y-4">
          {(Object.keys(GAME_INFO) as DiceGameType[]).map((type) => {
            const info = GAME_INFO[type];
            return (
              <Card
                key={type}
                onClick={() => { setSelectedGame(type); setView('setup'); }}
                padding="lg"
              >
                <div className="flex items-center gap-4">
                  <div className="text-[40px]">{info.icon}</div>
                  <div className="flex-1">
                    <div className="text-text-primary text-[20px] font-bold">{info.name}</div>
                    <div className="text-text-muted text-[14px]">{info.hook}</div>
                    <div className="text-text-secondary text-[13px] mt-1">{info.dice} dice &middot; {info.players}</div>
                  </div>
                  <span className="text-text-muted text-[24px]">&rsaquo;</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ============================================ */}
      {/* SETUP VIEW                                    */}
      {/* ============================================ */}
      {view === 'setup' && selectedGame && (
        <div className="space-y-5">
          {/* Player Selection */}
          <Card>
            <div className="text-text-secondary text-[14px] font-medium mb-3">
              PLAYERS ({selectedPlayers.length} selected)
            </div>
            {sessionPlayers.length === 0 ? (
              <div className="text-text-muted text-[16px] text-center py-4">
                No players in session. Add players first!
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {sessionPlayers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => togglePlayer(p.id)}
                    className={`h-[52px] rounded-xl flex items-center gap-2 px-4 transition-all ${
                      selectedPlayers.includes(p.id)
                        ? 'bg-accent-blue/20 border-2 border-accent-blue'
                        : 'bg-surface-600 border-2 border-transparent'
                    }`}
                  >
                    <div
                      className="w-[32px] h-[32px] rounded-full flex items-center justify-center text-[14px] font-bold text-white"
                      style={{ backgroundColor: p.color || '#888' }}
                    >
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-text-primary text-[16px] font-medium">{p.name}</span>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Button
            size="lg"
            fullWidth
            disabled={selectedPlayers.length < (selectedGame === 'yahtzee' ? 1 : 2)}
            onClick={handleStart}
          >
            Start {GAME_INFO[selectedGame].name}
          </Button>
        </div>
      )}

      {/* ============================================ */}
      {/* PLAYING VIEW                                  */}
      {/* ============================================ */}
      {view === 'playing' && diceState && (
        <div className="space-y-4">
          {/* Instructions */}
          {diceState.type === 'farkle' && (
            <FarkleInstructions expanded={showInstructions} onToggle={() => setShowInstructions(!showInstructions)} />
          )}
          {diceState.type === 'yahtzee' && (
            <YahtzeeInstructions expanded={showInstructions} onToggle={() => setShowInstructions(!showInstructions)} />
          )}
          {diceState.type === 'ship_captain_crew' && (
            <ShipCaptainCrewInstructions expanded={showInstructions} onToggle={() => setShowInstructions(!showInstructions)} />
          )}

          {/* Current Player Indicator */}
          {(() => {
            const current = getCurrentPlayer();
            if (!current) return null;
            const pColor = current.color || sessionPlayers.find(sp => sp.id === current.id)?.color || '#888';
            return (
              <Card padding="lg">
                <div className="text-center">
                  <div className="text-text-muted text-[12px] font-medium tracking-wider mb-2">CURRENT TURN</div>
                  <div className="flex items-center justify-center gap-3">
                    <div
                      className="w-[48px] h-[48px] rounded-full flex items-center justify-center text-[20px] font-bold text-white"
                      style={{ backgroundColor: pColor }}
                    >
                      {current.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-text-primary text-[24px] font-black">{current.name}</span>
                  </div>
                </div>
              </Card>
            );
          })()}

          {/* Game-specific UI */}
          {diceState.type === 'farkle' && (
            <FarkleUI
              diceState={diceState}
              sessionPlayers={sessionPlayers}
              onScore={submitScore}
              farkleTurnScore={farkleTurnScore}
              setFarkleTurnScore={setFarkleTurnScore}
              farkleTarget={farkleTarget}
            />
          )}

          {diceState.type === 'yahtzee' && (
            <YahtzeeUI
              diceState={diceState}
              sessionPlayers={sessionPlayers}
              onScore={submitScore}
            />
          )}

          {diceState.type === 'ship_captain_crew' && (
            <ShipCaptainCrewUI
              diceState={diceState}
              sessionPlayers={sessionPlayers}
              sccState={sccState}
              setSccState={setSccState}
              onScore={submitScore}
            />
          )}

          {/* Scoreboard */}
          <Card>
            <div className="text-text-secondary text-[14px] font-medium mb-3">SCOREBOARD</div>
            <div className="space-y-2">
              {[...diceState.players]
                .sort((a, b) => (diceState.scores[b.id] || 0) - (diceState.scores[a.id] || 0))
                .map((player, idx) => {
                  const pColor = player.color || sessionPlayers.find(sp => sp.id === player.id)?.color || '#888';
                  const score = diceState.type === 'yahtzee' && diceState.yahtzeeCards?.[player.id]
                    ? calcYahtzeeTotal(diceState.yahtzeeCards[player.id])
                    : (diceState.scores[player.id] || 0);
                  const isCurrentPlayer = diceState.players[diceState.currentPlayerIndex]?.id === player.id;
                  return (
                    <div
                      key={player.id}
                      className={`flex items-center justify-between py-3 px-4 rounded-xl ${
                        isCurrentPlayer ? 'bg-accent-blue/10 border border-accent-blue/30' : 'bg-surface-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-text-muted text-[14px] w-[20px]">{idx + 1}.</span>
                        <div
                          className="w-[28px] h-[28px] rounded-full flex items-center justify-center text-[12px] font-bold text-white"
                          style={{ backgroundColor: pColor }}
                        >
                          {player.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-text-primary text-[16px] font-semibold">{player.name}</span>
                      </div>
                      <span className="text-text-primary text-[20px] font-black tabular-nums">
                        {score.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
            </div>
          </Card>
        </div>
      )}

      {/* End Game Modal */}
      <Modal open={showEndModal} onClose={() => setShowEndModal(false)} title="End Game?" size="sm">
        <div className="space-y-4">
          <p className="text-text-secondary text-[16px] text-center">
            This will finalize scores and end the current game.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" size="md" fullWidth onClick={() => setShowEndModal(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="md" fullWidth onClick={handleEndGame}>
              End Game
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ================================================================== */
/*  Farkle UI                                                          */
/* ================================================================== */

function FarkleUI({
  diceState,
  sessionPlayers,
  onScore,
  farkleTurnScore,
  setFarkleTurnScore,
  farkleTarget,
}: {
  diceState: DiceState;
  sessionPlayers: Player[];
  onScore: (playerId: number, score: number, detail?: string) => void;
  farkleTurnScore: number;
  setFarkleTurnScore: (v: number) => void;
  farkleTarget: number;
}) {
  const [turnInput, setTurnInput] = useState('');
  const currentPlayer = diceState.players[diceState.currentPlayerIndex];
  if (!currentPlayer) return null;

  return (
    <Card>
      <div className="text-text-secondary text-[14px] font-medium mb-3">
        SCORE ENTRY -- {currentPlayer.name}'s turn
      </div>
      <div className="space-y-3">
        <div className="text-center">
          <div className="text-text-muted text-[12px]">Turn Score</div>
          <div className="text-text-primary text-[28px] font-black">{farkleTurnScore.toLocaleString()}</div>
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            value={turnInput}
            onChange={(e) => setTurnInput(e.target.value)}
            placeholder="Points from this roll..."
            className="flex-1 h-[56px] rounded-xl bg-surface-600 border border-surface-500 text-text-primary text-[20px] px-4 text-center"
          />
          <button
            onClick={() => {
              const pts = parseInt(turnInput);
              if (!isNaN(pts) && pts > 0) {
                setFarkleTurnScore(farkleTurnScore + pts);
                setTurnInput('');
              }
            }}
            className="h-[56px] px-6 rounded-xl bg-accent-blue text-white text-[16px] font-bold"
          >
            Add
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => {
              onScore(currentPlayer.id, farkleTurnScore, 'banked');
              setTurnInput('');
            }}
            disabled={farkleTurnScore === 0}
            className="h-[56px] rounded-xl bg-accent-green text-white text-[18px] font-bold disabled:opacity-40"
          >
            Bank ({farkleTurnScore})
          </button>
          <button
            onClick={() => {
              onScore(currentPlayer.id, 0, 'FARKLE');
              setFarkleTurnScore(0);
              setTurnInput('');
            }}
            className="h-[56px] rounded-xl bg-accent-red text-white text-[18px] font-bold"
          >
            FARKLE!
          </button>
        </div>
        <div className="text-center text-text-muted text-[13px]">
          Target: {farkleTarget.toLocaleString()} points
        </div>
      </div>
    </Card>
  );
}

/* ================================================================== */
/*  Yahtzee UI                                                         */
/* ================================================================== */

function YahtzeeUI({
  diceState,
  sessionPlayers,
  onScore,
}: {
  diceState: DiceState;
  sessionPlayers: Player[];
  onScore: (playerId: number, score: number, detail?: string, category?: string) => void;
}) {
  const [scoreInput, setScoreInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const currentPlayer = diceState.players[diceState.currentPlayerIndex];
  if (!currentPlayer) return null;

  const card = diceState.yahtzeeCards?.[currentPlayer.id];
  if (!card) return null;

  const upperTotal = (card.ones || 0) + (card.twos || 0) + (card.threes || 0) +
    (card.fours || 0) + (card.fives || 0) + (card.sixes || 0);
  const hasUpperBonus = upperTotal >= 63;

  const handleCategoryScore = (category: string) => {
    setSelectedCategory(category);
    setScoreInput('');
  };

  const confirmScore = () => {
    if (!selectedCategory) return;
    const score = parseInt(scoreInput);
    if (isNaN(score) || score < 0) return;
    onScore(currentPlayer.id, score, selectedCategory, selectedCategory);
    setSelectedCategory(null);
    setScoreInput('');
  };

  return (
    <Card>
      <div className="text-text-secondary text-[14px] font-medium mb-3">
        {currentPlayer.name}'s SCORECARD
      </div>

      {/* Upper Section */}
      <div className="text-text-muted text-[12px] font-medium mb-2">UPPER SECTION</div>
      <div className="space-y-1 mb-2">
        {YAHTZEE_UPPER.map(({ key, label, desc }) => {
          const val = card[key as keyof YahtzeeCard] as number | null;
          const isUsed = val !== null;
          const isSelected = selectedCategory === key;
          return (
            <button
              key={key}
              onClick={() => !isUsed && handleCategoryScore(key)}
              disabled={isUsed}
              className={`w-full flex items-center justify-between py-2 px-3 rounded-lg transition-all ${
                isSelected ? 'bg-accent-blue/20 border border-accent-blue' :
                isUsed ? 'bg-surface-700 opacity-50' : 'bg-surface-700 active:bg-surface-600'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-text-primary text-[15px] font-medium">{label}</span>
                <span className="text-text-muted text-[12px]">{desc}</span>
              </div>
              <span className={`text-[16px] font-bold ${isUsed ? 'text-text-primary' : 'text-text-muted'}`}>
                {isUsed ? val : '--'}
              </span>
            </button>
          );
        })}
        <div className="flex items-center justify-between py-1 px-3">
          <span className="text-text-muted text-[13px]">
            Upper Total: {upperTotal}/63 {hasUpperBonus ? '(+35 bonus!)' : `(need ${63 - upperTotal} more)`}
          </span>
        </div>
      </div>

      {/* Lower Section */}
      <div className="text-text-muted text-[12px] font-medium mb-2">LOWER SECTION</div>
      <div className="space-y-1 mb-3">
        {YAHTZEE_LOWER.map(({ key, label, desc }) => {
          const val = card[key as keyof YahtzeeCard] as number | null;
          const isUsed = val !== null;
          const isSelected = selectedCategory === key;
          return (
            <button
              key={key}
              onClick={() => !isUsed && handleCategoryScore(key)}
              disabled={isUsed}
              className={`w-full flex items-center justify-between py-2 px-3 rounded-lg transition-all ${
                isSelected ? 'bg-accent-blue/20 border border-accent-blue' :
                isUsed ? 'bg-surface-700 opacity-50' : 'bg-surface-700 active:bg-surface-600'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-text-primary text-[15px] font-medium">{label}</span>
                <span className="text-text-muted text-[12px]">{desc}</span>
              </div>
              <span className={`text-[16px] font-bold ${isUsed ? 'text-text-primary' : 'text-text-muted'}`}>
                {isUsed ? val : '--'}
              </span>
            </button>
          );
        })}
        {card.yahtzeeBonus > 0 && (
          <div className="text-accent-amber text-[14px] font-bold text-center py-1">
            Yahtzee Bonus: +{card.yahtzeeBonus}
          </div>
        )}
      </div>

      {/* Score Entry */}
      {selectedCategory && (
        <div className="bg-surface-700 rounded-xl p-4 space-y-3">
          <div className="text-text-primary text-[16px] font-bold text-center">
            Score for: {YAHTZEE_UPPER.find(u => u.key === selectedCategory)?.label ||
              YAHTZEE_LOWER.find(l => l.key === selectedCategory)?.label}
          </div>
          <input
            type="number"
            value={scoreInput}
            onChange={(e) => setScoreInput(e.target.value)}
            placeholder="Enter score (0 for scratch)"
            className="w-full h-[56px] rounded-xl bg-surface-600 border border-surface-500 text-text-primary text-[22px] px-4 text-center"
            autoFocus
          />
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => { setSelectedCategory(null); setScoreInput(''); }}
              className="h-[48px] rounded-xl bg-surface-600 text-text-primary text-[16px] font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={confirmScore}
              disabled={scoreInput === ''}
              className="h-[48px] rounded-xl bg-accent-blue text-white text-[16px] font-bold disabled:opacity-40"
            >
              Confirm
            </button>
          </div>
        </div>
      )}

      {/* Yahtzee Bonus Button */}
      {card.yahtzee !== null && card.yahtzee > 0 && (
        <button
          onClick={() => onScore(currentPlayer.id, 100, 'Yahtzee Bonus', 'yahtzeeBonus')}
          className="w-full h-[48px] rounded-xl bg-accent-amber/20 text-accent-amber text-[16px] font-bold mt-2"
        >
          + Yahtzee Bonus (+100)
        </button>
      )}

      <div className="text-center text-text-primary text-[18px] font-bold mt-3">
        Total: {calcYahtzeeTotal(card)}
      </div>
    </Card>
  );
}

/* ================================================================== */
/*  Ship Captain Crew UI                                               */
/* ================================================================== */

function ShipCaptainCrewUI({
  diceState,
  sessionPlayers,
  sccState,
  setSccState,
  onScore,
}: {
  diceState: DiceState;
  sessionPlayers: Player[];
  sccState: Record<number, { captain: boolean; mate: boolean; crew: boolean; cargo: number | null }>;
  setSccState: (s: Record<number, any>) => void;
  onScore: (playerId: number, score: number, detail?: string) => void;
}) {
  const [cargoInput, setCargoInput] = useState('');
  const currentPlayer = diceState.players[diceState.currentPlayerIndex];
  if (!currentPlayer) return null;

  const playerScc = sccState[currentPlayer.id] || { captain: false, mate: false, crew: false, cargo: null };

  const togglePart = (part: 'captain' | 'mate' | 'crew') => {
    const updated = { ...sccState };
    if (!updated[currentPlayer.id]) {
      updated[currentPlayer.id] = { captain: false, mate: false, crew: false, cargo: null };
    }
    // Enforce order: captain before mate before crew
    if (part === 'captain') {
      updated[currentPlayer.id].captain = !updated[currentPlayer.id].captain;
      if (!updated[currentPlayer.id].captain) {
        updated[currentPlayer.id].mate = false;
        updated[currentPlayer.id].crew = false;
      }
    } else if (part === 'mate') {
      if (!updated[currentPlayer.id].captain) return;
      updated[currentPlayer.id].mate = !updated[currentPlayer.id].mate;
      if (!updated[currentPlayer.id].mate) {
        updated[currentPlayer.id].crew = false;
      }
    } else if (part === 'crew') {
      if (!updated[currentPlayer.id].mate) return;
      updated[currentPlayer.id].crew = !updated[currentPlayer.id].crew;
    }
    setSccState(updated);
  };

  const submitCargo = () => {
    const cargo = parseInt(cargoInput);
    if (isNaN(cargo) || cargo < 0) return;
    const detail = `Captain:${playerScc.captain ? 'Y' : 'N'} Mate:${playerScc.mate ? 'Y' : 'N'} Crew:${playerScc.crew ? 'Y' : 'N'} Cargo:${cargo}`;
    const score = playerScc.captain && playerScc.mate && playerScc.crew ? cargo : 0;
    onScore(currentPlayer.id, score, detail);
    setCargoInput('');
    // Reset SCC for next player
    const updated = { ...sccState };
    updated[currentPlayer.id] = { captain: false, mate: false, crew: false, cargo: null };
    setSccState(updated);
  };

  return (
    <Card>
      <div className="text-text-secondary text-[14px] font-medium mb-3">
        {currentPlayer.name}'s ROLL
      </div>
      <div className="space-y-4">
        {/* Status */}
        <div className="grid grid-cols-3 gap-3">
          {([
            { key: 'captain' as const, label: 'Captain', value: '6', emoji: '⚓' },
            { key: 'mate' as const, label: 'First Mate', value: '5', emoji: '🧭' },
            { key: 'crew' as const, label: 'Crew', value: '4', emoji: '🫡' },
          ]).map(({ key, label, value, emoji }) => {
            const isSet = playerScc[key];
            const canToggle = key === 'captain' || (key === 'mate' && playerScc.captain) || (key === 'crew' && playerScc.mate);
            return (
              <button
                key={key}
                onClick={() => togglePart(key)}
                disabled={!canToggle}
                className={`py-4 rounded-xl text-center transition-all ${
                  isSet
                    ? 'bg-accent-green/20 border-2 border-accent-green'
                    : canToggle
                    ? 'bg-surface-600 border-2 border-transparent active:bg-surface-500'
                    : 'bg-surface-700 border-2 border-transparent opacity-40'
                }`}
              >
                <div className="text-[24px]">{emoji}</div>
                <div className="text-text-primary text-[14px] font-bold">{label}</div>
                <div className="text-text-muted text-[12px]">Need a {value}</div>
                <div className={`text-[14px] font-bold mt-1 ${isSet ? 'text-accent-green' : 'text-text-muted'}`}>
                  {isSet ? '\u2713' : '\u2717'}
                </div>
              </button>
            );
          })}
        </div>

        {/* Cargo */}
        {playerScc.captain && playerScc.mate && playerScc.crew ? (
          <div className="space-y-3">
            <div className="text-text-secondary text-[14px] font-medium text-center">
              CARGO (sum of remaining 2 dice)
            </div>
            <input
              type="number"
              value={cargoInput}
              onChange={(e) => setCargoInput(e.target.value)}
              placeholder="2-12"
              className="w-full h-[56px] rounded-xl bg-surface-600 border border-surface-500 text-text-primary text-[24px] px-4 text-center"
              autoFocus
            />
            <Button size="md" fullWidth onClick={submitCargo} disabled={!cargoInput}>
              Submit Cargo Score
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-text-muted text-[14px] text-center">
              Tap each item as you roll it. Must be in order: Captain (6) &rarr; Mate (5) &rarr; Crew (4)
            </div>
            <button
              onClick={() => {
                onScore(currentPlayer.id, 0, 'Did not complete set');
                const updated = { ...sccState };
                updated[currentPlayer.id] = { captain: false, mate: false, crew: false, cargo: null };
                setSccState(updated);
              }}
              className="w-full h-[48px] rounded-xl bg-accent-red/20 text-accent-red text-[16px] font-semibold"
            >
              Failed (no score)
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}
