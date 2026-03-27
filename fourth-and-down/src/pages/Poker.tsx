import { useState, useEffect, useCallback, useRef } from 'react';
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

interface BlindLevel {
  sb: number;
  bb: number;
  dur: number;
}

interface LedgerEntry {
  totalBuyIn: number;
  cashOut: number | null;
  handsWon: number;
}

interface PokerState {
  dbId: number;
  players: Player[];
  dealerIndex: number;
  sbIndex: number;
  bbIndex: number;
  blindLevel: number;
  sb: number;
  bb: number;
  timerRemaining: number;
  timerPaused: boolean;
  handNumber: number;
  dealFlowStep: number;
  gameType: string;
  chipSet: string;
  buyInAmount: number;
  blindStructure: BlindLevel[];
  ledger: Record<number, LedgerEntry>;
}

interface CareerRow {
  id: number;
  name: string;
  color: string;
  sessions_played: number;
  total_hands_won: number;
  total_buy_in: number;
  total_cash_out: number;
  net_profit: number;
}

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */

const DEAL_FLOW_STEPS = ['Pre-Flop', 'Burn + Flop', 'Burn + Turn', 'Burn + River', 'Showdown'];

const MONTE_CARLO_CHIPS = [
  { color: '#FFFFFF', border: '#ccc', value: 1, label: '$1' },
  { color: '#ef4444', border: '#b91c1c', value: 5, label: '$5' },
  { color: '#3b82f6', border: '#1d4ed8', value: 10, label: '$10' },
  { color: '#22c55e', border: '#15803d', value: 25, label: '$25' },
  { color: '#111111', border: '#555', value: 100, label: '$100' },
];

const HAND_RANKINGS = [
  { name: 'Royal Flush', desc: 'A, K, Q, J, 10 of same suit' },
  { name: 'Straight Flush', desc: 'Five sequential cards of same suit' },
  { name: 'Four of a Kind', desc: 'Four cards of same rank' },
  { name: 'Full House', desc: 'Three of a kind + a pair' },
  { name: 'Flush', desc: 'Five cards of same suit' },
  { name: 'Straight', desc: 'Five sequential cards' },
  { name: 'Three of a Kind', desc: 'Three cards of same rank' },
  { name: 'Two Pair', desc: 'Two different pairs' },
  { name: 'One Pair', desc: 'Two cards of same rank' },
  { name: 'High Card', desc: 'Highest card plays' },
];

const BUY_IN_PRESETS = [
  { amount: 20, chips: '10 White, 2 Red' },
  { amount: 40, chips: '15 White, 3 Red, 1 Green' },
];

/* ================================================================== */
/*  Chip Reference Strip                                               */
/* ================================================================== */

function ChipStrip() {
  return (
    <div className="flex items-center justify-center gap-4 py-3 px-4 bg-surface-900 rounded-xl border border-surface-600">
      {MONTE_CARLO_CHIPS.map((chip) => (
        <div key={chip.value} className="flex items-center gap-1.5">
          <div
            className="w-[28px] h-[28px] rounded-full border-2 shadow-md flex items-center justify-center"
            style={{ backgroundColor: chip.color, borderColor: chip.border }}
          >
            {chip.value >= 100 && <span className="text-[9px] font-bold text-white">100</span>}
          </div>
          <span className="text-text-secondary text-[14px] font-medium">{chip.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */

export function Poker() {
  const [sessionPlayers, setSessionPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  // Views: setup | playing | ledger | career
  const [view, setView] = useState<'setup' | 'playing' | 'ledger' | 'career'>('setup');

  // Setup state
  const [gameType, setGameType] = useState<'cash' | 'tournament'>('cash');
  const [chipSet, setChipSet] = useState<'monte_carlo' | 'standard'>('monte_carlo');
  const [buyInAmount, setBuyInAmount] = useState(20);
  const [customBuyIn, setCustomBuyIn] = useState('');
  const [blindDuration, setBlindDuration] = useState(15);
  const [selectedPlayers, setSelectedPlayers] = useState<number[]>([]);

  // Playing state
  const [pokerState, setPokerState] = useState<PokerState | null>(null);
  const [timerRemaining, setTimerRemaining] = useState(0);
  const [timerPaused, setTimerPaused] = useState(false);
  const [currentBlindLevel, setCurrentBlindLevel] = useState(0);
  const [currentSB, setCurrentSB] = useState(1);
  const [currentBB, setCurrentBB] = useState(2);
  const [dealFlowStep, setDealFlowStep] = useState(0);

  // Modals
  const [showWinner, setShowWinner] = useState(false);
  const [showRankings, setShowRankings] = useState(false);
  const [showRebuy, setShowRebuy] = useState<Player | null>(null);
  const [showCashOut, setShowCashOut] = useState<Player | null>(null);
  const [cashOutAmount, setCashOutAmount] = useState('');
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  // Career
  const [careerData, setCareerData] = useState<CareerRow[]>([]);

  // Ref for polling
  const stateRef = useRef(pokerState);
  stateRef.current = pokerState;

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
        const state = await api.get<PokerState | null>('/poker/state');
        if (state) {
          setPokerState(state);
          setTimerRemaining(state.timerRemaining);
          setTimerPaused(state.timerPaused);
          setCurrentBlindLevel(state.blindLevel);
          setCurrentSB(state.sb);
          setCurrentBB(state.bb);
          setDealFlowStep(state.dealFlowStep);
          setView('playing');
        }
      } catch {
        // No game
      }
    })();
  }, []);

  /* ---- Socket events ---- */
  useSocket('poker:timer', (data: any) => {
    setTimerRemaining(data.remaining);
    setCurrentBlindLevel(data.level);
    setCurrentSB(data.sb);
    setCurrentBB(data.bb);
  });

  useSocket('poker:blinds-up', (data: any) => {
    setCurrentBlindLevel(data.level);
    setCurrentSB(data.sb);
    setCurrentBB(data.bb);
  });

  useSocket('poker:timer-toggle', (data: any) => {
    setTimerPaused(data.paused);
  });

  useSocket('poker:hand-won', (data: any) => {
    setPokerState(prev => prev ? {
      ...prev,
      handNumber: data.handNumber,
      dealerIndex: data.dealerIndex,
      dealFlowStep: 0,
    } : prev);
    setDealFlowStep(0);
    refreshState();
  });

  useSocket('poker:deal-flow', (data: any) => {
    setDealFlowStep(data.stepIndex);
  });

  useSocket('poker:update', () => {
    refreshState();
  });

  useSocket('poker:ended', () => {
    setPokerState(null);
    setView('setup');
  });

  /* ---- Refresh state ---- */
  const refreshState = useCallback(async () => {
    try {
      const state = await api.get<PokerState | null>('/poker/state');
      if (state) setPokerState(state);
    } catch { /* ignore */ }
  }, []);

  /* ---- Start game ---- */
  const handleStart = async () => {
    if (selectedPlayers.length < 2) return;
    const amount = customBuyIn ? parseInt(customBuyIn) : buyInAmount;
    try {
      await api.post('/poker/start', {
        playerIds: selectedPlayers,
        gameType,
        chipSet,
        buyInAmount: amount,
        blindDuration,
      });
      const state = await api.get<PokerState | null>('/poker/state');
      if (state) {
        setPokerState(state);
        setTimerRemaining(state.timerRemaining);
        setCurrentBlindLevel(state.blindLevel);
        setCurrentSB(state.sb);
        setCurrentBB(state.bb);
        setDealFlowStep(0);
        setView('playing');
      }
    } catch (err) {
      console.error('Failed to start poker:', err);
    }
  };

  /* ---- Deal flow ---- */
  const advanceDealFlow = async () => {
    try {
      const res = await api.post<{ stepIndex: number }>('/poker/deal-flow');
      setDealFlowStep(res.stepIndex);
    } catch { /* ignore */ }
  };

  /* ---- Hand won ---- */
  const handleWinner = async (winnerId: number) => {
    try {
      await api.post('/poker/hand-won', { winnerId });
      setShowWinner(false);
      refreshState();
    } catch { /* ignore */ }
  };

  /* ---- Timer toggle ---- */
  const toggleTimer = async () => {
    try {
      const res = await api.post<{ paused: boolean }>('/poker/timer/toggle');
      setTimerPaused(res.paused);
    } catch { /* ignore */ }
  };

  /* ---- Buy-in / Cash-out ---- */
  const handleRebuy = async (player: Player) => {
    const amount = pokerState?.buyInAmount || 20;
    try {
      await api.post('/poker/buy-in', { playerId: player.id, amount });
      setShowRebuy(null);
      refreshState();
    } catch { /* ignore */ }
  };

  const handleCashOut = async (player: Player) => {
    const amount = parseInt(cashOutAmount);
    if (isNaN(amount) || amount < 0) return;
    try {
      await api.post('/poker/cash-out', { playerId: player.id, amount });
      setShowCashOut(null);
      setCashOutAmount('');
      refreshState();
    } catch { /* ignore */ }
  };

  /* ---- End game ---- */
  const handleEnd = async () => {
    try {
      await api.post('/poker/end');
      setPokerState(null);
      setView('setup');
      setShowEndConfirm(false);
    } catch { /* ignore */ }
  };

  /* ---- Career ---- */
  const loadCareer = async () => {
    try {
      const data = await api.get<CareerRow[]>('/poker/career');
      setCareerData(data);
      setView('career');
    } catch { /* ignore */ }
  };

  /* ---- Format timer ---- */
  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  /* ---- Toggle player selection ---- */
  const togglePlayer = (id: number) => {
    setSelectedPlayers(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
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
          <h1 className="text-[28px] font-black text-text-primary">Poker</h1>
          <p className="text-text-muted text-[14px]">
            {view === 'setup' ? 'Set up your game' : view === 'career' ? 'Lifetime stats' : 'Companion app for live poker'}
          </p>
        </div>
        <div className="flex gap-2">
          {view === 'playing' && (
            <>
              <button
                onClick={() => setView('ledger')}
                className="h-[44px] px-4 rounded-xl bg-surface-600 text-text-primary text-[16px] font-semibold"
              >
                Ledger
              </button>
              <button
                onClick={loadCareer}
                className="h-[44px] px-4 rounded-xl bg-surface-600 text-text-primary text-[16px] font-semibold"
              >
                Career
              </button>
            </>
          )}
          {(view === 'ledger' || view === 'career') && pokerState && (
            <button
              onClick={() => setView('playing')}
              className="h-[44px] px-4 rounded-xl bg-accent-blue text-white text-[16px] font-semibold"
            >
              Back to Game
            </button>
          )}
          {view === 'career' && !pokerState && (
            <button
              onClick={() => setView('setup')}
              className="h-[44px] px-4 rounded-xl bg-surface-600 text-text-primary text-[16px] font-semibold"
            >
              Back
            </button>
          )}
        </div>
      </div>

      {/* ============================================ */}
      {/* SETUP VIEW                                    */}
      {/* ============================================ */}
      {view === 'setup' && (
        <div className="space-y-5">
          {/* Game Type */}
          <Card>
            <div className="text-text-secondary text-[14px] font-medium mb-3">GAME TYPE</div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setGameType('cash')}
                className={`h-[56px] rounded-xl text-[18px] font-bold transition-all ${
                  gameType === 'cash'
                    ? 'bg-accent-blue text-white shadow-[0_0_15px_rgba(59,130,246,0.4)]'
                    : 'bg-surface-600 text-text-secondary'
                }`}
              >
                Cash Game
              </button>
              <button
                onClick={() => setGameType('tournament')}
                className={`h-[56px] rounded-xl text-[18px] font-bold transition-all ${
                  gameType === 'tournament'
                    ? 'bg-accent-blue text-white shadow-[0_0_15px_rgba(59,130,246,0.4)]'
                    : 'bg-surface-600 text-text-secondary'
                }`}
              >
                Tournament
              </button>
            </div>
          </Card>

          {/* Chip Set */}
          <Card>
            <div className="text-text-secondary text-[14px] font-medium mb-3">CHIP SET</div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setChipSet('monte_carlo')}
                className={`h-[56px] rounded-xl text-[18px] font-bold transition-all ${
                  chipSet === 'monte_carlo'
                    ? 'bg-accent-green text-white shadow-[0_0_15px_rgba(34,197,94,0.4)]'
                    : 'bg-surface-600 text-text-secondary'
                }`}
              >
                Monte Carlo
              </button>
              <button
                onClick={() => setChipSet('standard')}
                className={`h-[56px] rounded-xl text-[18px] font-bold transition-all ${
                  chipSet === 'standard'
                    ? 'bg-accent-green text-white shadow-[0_0_15px_rgba(34,197,94,0.4)]'
                    : 'bg-surface-600 text-text-secondary'
                }`}
              >
                Standard
              </button>
            </div>
            {chipSet === 'monte_carlo' && (
              <div className="mt-3">
                <ChipStrip />
              </div>
            )}
          </Card>

          {/* Buy-in */}
          <Card>
            <div className="text-text-secondary text-[14px] font-medium mb-3">BUY-IN AMOUNT</div>
            <div className="space-y-3">
              {BUY_IN_PRESETS.map((preset) => (
                <button
                  key={preset.amount}
                  onClick={() => { setBuyInAmount(preset.amount); setCustomBuyIn(''); }}
                  className={`w-full h-[60px] rounded-xl text-left px-5 transition-all flex items-center justify-between ${
                    buyInAmount === preset.amount && !customBuyIn
                      ? 'bg-accent-amber/20 border-2 border-accent-amber text-text-primary'
                      : 'bg-surface-600 text-text-secondary'
                  }`}
                >
                  <span className="text-[20px] font-bold">${preset.amount}</span>
                  <span className="text-[14px] text-text-muted">{preset.chips}</span>
                </button>
              ))}
              <div className="flex items-center gap-3">
                <span className="text-text-secondary text-[16px]">Custom:</span>
                <input
                  type="number"
                  value={customBuyIn}
                  onChange={(e) => setCustomBuyIn(e.target.value)}
                  placeholder="$"
                  className="flex-1 h-[48px] rounded-xl bg-surface-600 border border-surface-500 text-text-primary text-[18px] px-4 text-center"
                />
              </div>
            </div>
          </Card>

          {/* Blind Duration (tournaments) */}
          {gameType === 'tournament' && (
            <Card>
              <div className="text-text-secondary text-[14px] font-medium mb-3">BLIND LEVEL DURATION</div>
              <div className="grid grid-cols-2 gap-3">
                {[15, 20].map((min) => (
                  <button
                    key={min}
                    onClick={() => setBlindDuration(min)}
                    className={`h-[56px] rounded-xl text-[18px] font-bold transition-all ${
                      blindDuration === min
                        ? 'bg-accent-purple text-white'
                        : 'bg-surface-600 text-text-secondary'
                    }`}
                  >
                    {min} min
                  </button>
                ))}
              </div>
            </Card>
          )}

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

          {/* Start Button */}
          <Button
            size="lg"
            fullWidth
            disabled={selectedPlayers.length < 2}
            onClick={handleStart}
          >
            Start Poker
          </Button>

          {/* Career button */}
          <button
            onClick={loadCareer}
            className="w-full h-[48px] rounded-xl bg-surface-700 text-text-secondary text-[16px] font-medium"
          >
            View Career Stats
          </button>
        </div>
      )}

      {/* ============================================ */}
      {/* PLAYING VIEW                                  */}
      {/* ============================================ */}
      {view === 'playing' && pokerState && (
        <div className="space-y-4">
          {/* Blind Timer */}
          <Card padding="lg">
            <div className="text-center">
              <div className="text-text-muted text-[12px] font-medium tracking-wider mb-1">
                LEVEL {currentBlindLevel + 1}
              </div>
              <div className="text-[32px] font-black text-text-primary mb-1">
                Blinds: ${currentSB} / ${currentBB}
              </div>
              <button
                onClick={toggleTimer}
                className={`text-[48px] font-mono font-black tabular-nums tracking-wider ${
                  timerRemaining < 120 && !timerPaused ? 'text-accent-amber animate-pulse' : 'text-text-primary'
                }`}
              >
                {formatTimer(timerRemaining)}
              </button>
              <div className="flex gap-3 justify-center mt-2">
                <button
                  onClick={toggleTimer}
                  className="h-[40px] px-5 rounded-lg bg-surface-600 text-text-primary text-[14px] font-semibold"
                >
                  {timerPaused ? 'Resume' : 'Pause'}
                </button>
                <button
                  onClick={async () => {
                    try { await api.post('/poker/advance-blinds'); } catch {}
                  }}
                  className="h-[40px] px-5 rounded-lg bg-surface-600 text-text-secondary text-[14px] font-semibold"
                >
                  Skip Level
                </button>
              </div>
            </div>
          </Card>

          {/* Player Ring */}
          <Card>
            <div className="text-text-muted text-[12px] font-medium tracking-wider mb-3 text-center">
              HAND #{pokerState.handNumber + 1}
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              {pokerState.players.map((player, idx) => {
                const numPlayers = pokerState.players.length;
                const dealerIdx = pokerState.dealerIndex % numPlayers;
                const sbIdx = numPlayers === 2 ? dealerIdx : (dealerIdx + 1) % numPlayers;
                const bbIdx = numPlayers === 2 ? (dealerIdx + 1) % 2 : (dealerIdx + 2) % numPlayers;
                const isDealer = idx === dealerIdx;
                const isSB = idx === sbIdx;
                const isBB = idx === bbIdx;
                const pColor = player.color || sessionPlayers.find(sp => sp.id === player.id)?.color || '#888';
                const marker = isDealer ? 'D' : isSB ? 'SB' : isBB ? 'BB' : null;
                const markerColor = isDealer ? '#f59e0b' : isSB ? '#3b82f6' : '#ef4444';

                return (
                  <div key={player.id} className="flex flex-col items-center gap-1 w-[80px]">
                    <div className="relative">
                      <div
                        className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-[20px] font-bold text-white border-3"
                        style={{
                          backgroundColor: pColor,
                          borderColor: isDealer ? '#f59e0b' : 'transparent',
                          borderWidth: isDealer ? '3px' : '0',
                        }}
                      >
                        {player.name.charAt(0).toUpperCase()}
                      </div>
                      {marker && (
                        <div
                          className="absolute -bottom-1 -right-1 w-[24px] h-[24px] rounded-full flex items-center justify-center text-[10px] font-black text-white"
                          style={{ backgroundColor: markerColor }}
                        >
                          {marker}
                        </div>
                      )}
                    </div>
                    <span className="text-text-primary text-[13px] font-medium text-center truncate w-full">
                      {player.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Deal Flow */}
          <Card padding="none">
            <button
              onClick={advanceDealFlow}
              className="w-full py-4 px-5 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                {DEAL_FLOW_STEPS.map((step, i) => (
                  <span
                    key={step}
                    className={`text-[14px] font-semibold px-2 py-1 rounded ${
                      i === dealFlowStep
                        ? 'bg-accent-blue text-white'
                        : i < dealFlowStep
                        ? 'text-accent-green'
                        : 'text-text-muted'
                    }`}
                  >
                    {step}
                  </span>
                ))}
              </div>
              <span className="text-text-muted text-[20px]">&rsaquo;</span>
            </button>
          </Card>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              size="md"
              fullWidth
              onClick={() => setShowWinner(true)}
            >
              Who Won?
            </Button>
            <Button
              size="md"
              fullWidth
              variant="secondary"
              onClick={() => setShowRankings(true)}
            >
              Hand Rankings
            </Button>
          </div>

          {/* Chip Strip */}
          <ChipStrip />

          {/* End Game */}
          <button
            onClick={() => setShowEndConfirm(true)}
            className="w-full h-[44px] rounded-xl bg-surface-700 text-accent-red text-[14px] font-medium"
          >
            End Session
          </button>
        </div>
      )}

      {/* ============================================ */}
      {/* LEDGER VIEW                                   */}
      {/* ============================================ */}
      {view === 'ledger' && pokerState && (
        <div className="space-y-4">
          <Card>
            <div className="text-text-secondary text-[14px] font-medium mb-4">SESSION LEDGER</div>
            <div className="space-y-3">
              {pokerState.players.map((player) => {
                const entry = pokerState.ledger[player.id] || { totalBuyIn: 0, cashOut: null, handsWon: 0 };
                const pColor = player.color || sessionPlayers.find(sp => sp.id === player.id)?.color || '#888';
                const pnl = entry.cashOut !== null ? entry.cashOut - entry.totalBuyIn : null;

                return (
                  <div key={player.id} className="bg-surface-700 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-[32px] h-[32px] rounded-full flex items-center justify-center text-[14px] font-bold text-white"
                          style={{ backgroundColor: pColor }}
                        >
                          {player.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-text-primary text-[18px] font-bold">{player.name}</span>
                      </div>
                      <span className="text-text-muted text-[14px]">{entry.handsWon} wins</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center mb-3">
                      <div>
                        <div className="text-text-muted text-[12px]">Buy-in</div>
                        <div className="text-text-primary text-[18px] font-bold">${entry.totalBuyIn}</div>
                      </div>
                      <div>
                        <div className="text-text-muted text-[12px]">Cash Out</div>
                        <div className="text-text-primary text-[18px] font-bold">
                          {entry.cashOut !== null ? `$${entry.cashOut}` : '--'}
                        </div>
                      </div>
                      <div>
                        <div className="text-text-muted text-[12px]">P&L</div>
                        <div className={`text-[18px] font-bold ${
                          pnl === null ? 'text-text-muted' : pnl >= 0 ? 'text-accent-green' : 'text-accent-red'
                        }`}>
                          {pnl === null ? '--' : pnl >= 0 ? `+$${pnl}` : `-$${Math.abs(pnl)}`}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowRebuy(player)}
                        className="flex-1 h-[44px] rounded-lg bg-accent-blue/20 text-accent-blue text-[14px] font-semibold"
                      >
                        Rebuy
                      </button>
                      <button
                        onClick={() => { setShowCashOut(player); setCashOutAmount(''); }}
                        className="flex-1 h-[44px] rounded-lg bg-accent-green/20 text-accent-green text-[14px] font-semibold"
                      >
                        Cash Out
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* ============================================ */}
      {/* CAREER VIEW                                   */}
      {/* ============================================ */}
      {view === 'career' && (
        <div className="space-y-4">
          <Card>
            <div className="text-text-secondary text-[14px] font-medium mb-4">LIFETIME POKER STATS</div>
            {careerData.length === 0 ? (
              <div className="text-text-muted text-[16px] text-center py-6">No poker history yet</div>
            ) : (
              <div className="space-y-3">
                {careerData.map((row) => (
                  <div key={row.id} className="bg-surface-700 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-[28px] h-[28px] rounded-full flex items-center justify-center text-[12px] font-bold text-white"
                          style={{ backgroundColor: row.color || '#888' }}
                        >
                          {row.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-text-primary text-[18px] font-bold">{row.name}</span>
                      </div>
                      <span className={`text-[20px] font-black ${
                        row.net_profit >= 0 ? 'text-accent-green' : 'text-accent-red'
                      }`}>
                        {row.net_profit >= 0 ? `+$${row.net_profit}` : `-$${Math.abs(row.net_profit)}`}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-text-muted text-[12px]">Sessions</div>
                        <div className="text-text-primary text-[16px] font-bold">{row.sessions_played}</div>
                      </div>
                      <div>
                        <div className="text-text-muted text-[12px]">Hands Won</div>
                        <div className="text-text-primary text-[16px] font-bold">{row.total_hands_won || 0}</div>
                      </div>
                      <div>
                        <div className="text-text-muted text-[12px]">Total In</div>
                        <div className="text-text-primary text-[16px] font-bold">${row.total_buy_in}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ============================================ */}
      {/* MODALS                                        */}
      {/* ============================================ */}

      {/* Winner Modal */}
      <Modal open={showWinner} onClose={() => setShowWinner(false)} title="Who Won This Hand?">
        <div className="space-y-2">
          {pokerState?.players.map((player) => {
            const pColor = player.color || sessionPlayers.find(sp => sp.id === player.id)?.color || '#888';
            return (
              <button
                key={player.id}
                onClick={() => handleWinner(player.id)}
                className="w-full h-[60px] rounded-xl bg-surface-700 flex items-center gap-3 px-4 active:scale-[0.97] transition-all"
              >
                <div
                  className="w-[40px] h-[40px] rounded-full flex items-center justify-center text-[18px] font-bold text-white"
                  style={{ backgroundColor: pColor }}
                >
                  {player.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-text-primary text-[18px] font-semibold">{player.name}</span>
              </button>
            );
          })}
        </div>
      </Modal>

      {/* Hand Rankings Modal */}
      <Modal open={showRankings} onClose={() => setShowRankings(false)} title="Hand Rankings" size="sm">
        <div className="space-y-2">
          {HAND_RANKINGS.map((hand, i) => (
            <div key={hand.name} className="flex items-center justify-between py-2 px-3 rounded-lg bg-surface-700">
              <div className="flex items-center gap-2">
                <span className="text-text-muted text-[13px] w-[20px]">{i + 1}.</span>
                <span className="text-text-primary text-[15px] font-semibold">{hand.name}</span>
              </div>
              <span className="text-text-muted text-[13px]">{hand.desc}</span>
            </div>
          ))}
        </div>
      </Modal>

      {/* Rebuy Modal */}
      <Modal open={!!showRebuy} onClose={() => setShowRebuy(null)} title={`Rebuy for ${showRebuy?.name}?`} size="sm">
        <div className="text-center">
          <div className="text-text-primary text-[24px] font-bold mb-4">
            ${pokerState?.buyInAmount || 20}
          </div>
          <Button size="lg" fullWidth onClick={() => showRebuy && handleRebuy(showRebuy)}>
            Confirm Rebuy
          </Button>
        </div>
      </Modal>

      {/* Cash Out Modal */}
      <Modal open={!!showCashOut} onClose={() => setShowCashOut(null)} title={`Cash Out ${showCashOut?.name}`} size="sm">
        <div className="space-y-4">
          <input
            type="number"
            value={cashOutAmount}
            onChange={(e) => setCashOutAmount(e.target.value)}
            placeholder="Enter chip value..."
            className="w-full h-[56px] rounded-xl bg-surface-600 border border-surface-500 text-text-primary text-[22px] px-4 text-center"
            autoFocus
          />
          <Button
            size="lg"
            fullWidth
            disabled={!cashOutAmount || parseInt(cashOutAmount) < 0}
            onClick={() => showCashOut && handleCashOut(showCashOut)}
          >
            Confirm Cash Out
          </Button>
        </div>
      </Modal>

      {/* End Confirm Modal */}
      <Modal open={showEndConfirm} onClose={() => setShowEndConfirm(false)} title="End Poker Session?" size="sm">
        <div className="space-y-4">
          <p className="text-text-secondary text-[16px] text-center">
            Make sure all players have cashed out before ending.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" size="md" fullWidth onClick={() => setShowEndConfirm(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="md" fullWidth onClick={handleEnd}>
              End Session
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
