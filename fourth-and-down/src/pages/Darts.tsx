import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api';
import { useSocket } from '../lib/socket';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { Dartboard, type DartHit } from '../components/Dartboard';
import { dartGames, funTierGames, type DartGame } from '../data/dartGames';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

interface Player {
  id: number;
  name: string;
  color: string;
}

interface SessionPlayer {
  player_id: number;
  joined_at: string;
  left_at: string | null;
}

interface DartGameRecord {
  id: number;
  session_id: number;
  game_type: string;
  game_code: string;
  started_at: string;
  ended_at: string | null;
  winner_id: number | null;
  winner_name?: string;
  players?: { player_id: number; player_name: string; final_score: number | null }[];
}

interface PlayerStats {
  player_id: number;
  games_played: number;
  games_won: number;
  win_pct: number;
  favorite_game_type: string | null;
  avg_mpr: number | null;
  current_streak: number;
}

interface HeadToHead {
  player1_wins: number;
  player2_wins: number;
  total_games: number;
}

/* ================================================================== */
/*  Turn tracking                                                      */
/* ================================================================== */

interface TurnShot {
  dartNumber: number;
  hit: DartHit;
}

interface RoundRecord {
  turnNumber: number;
  playerId: number;
  shots: TurnShot[];
  totalScore: number;
}

/* ================================================================== */
/*  Cricket state                                                      */
/* ================================================================== */

const CRICKET_NUMBERS = [20, 19, 18, 17, 16, 15, 25]; // 25 = bull

interface CricketPlayerState {
  marks: Record<number, number>; // number -> mark count (0+)
  points: number;
}

/* ================================================================== */
/*  X01 state                                                          */
/* ================================================================== */

interface X01PlayerState {
  remaining: number;
  roundStartRemaining: number;
}

/* ================================================================== */
/*  localStorage persistence                                           */
/* ================================================================== */

const ACTIVE_GAME_KEY = 'darts:activeGame';

interface SavedGameState {
  gameId: number;
  currentPlayerIndex: number;
  dartNumber: number;
  turnNumber: number;
  turnShots: TurnShot[];
  x01State: Record<number, X01PlayerState>;
  cricketState: Record<number, CricketPlayerState>;
  roundSummaryVisible: boolean;
  roundHistory: RoundRecord[];
}

function saveGameState(state: SavedGameState) {
  try {
    localStorage.setItem(ACTIVE_GAME_KEY, JSON.stringify(state));
  } catch { /* noop */ }
}

function loadGameState(): SavedGameState | null {
  try {
    const raw = localStorage.getItem(ACTIVE_GAME_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearGameState() {
  try {
    localStorage.removeItem(ACTIVE_GAME_KEY);
  } catch { /* noop */ }
}

/* ================================================================== */
/*  NumPad Component                                                   */
/* ================================================================== */

function NumPad({
  value,
  onChange,
  allowDecimal = true,
}: {
  value: string;
  onChange: (v: string) => void;
  allowDecimal?: boolean;
}) {
  const handlePress = (key: string) => {
    if (key === 'back') {
      onChange(value.slice(0, -1));
    } else if (key === '.') {
      if (!allowDecimal || value.includes('.')) return;
      onChange(value + '.');
    } else {
      onChange(value + key);
    }
  };

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'];

  return (
    <div className="grid grid-cols-3 gap-1.5 w-full" style={{ maxWidth: 200 }}>
      {keys.map(k => (
        <button
          key={k}
          type="button"
          onClick={() => handlePress(k)}
          className={[
            'w-[56px] h-[56px] rounded-xl flex items-center justify-center text-[20px] font-bold transition-all duration-100 active:scale-90 select-none',
            k === 'back'
              ? 'bg-red-900/50 text-red-300 hover:bg-red-800/60'
              : k === '.'
                ? (!allowDecimal || value.includes('.'))
                  ? 'bg-surface-800 text-text-muted opacity-40 pointer-events-none'
                  : 'bg-surface-700 text-text-primary hover:bg-surface-600'
                : 'bg-surface-700 text-text-primary hover:bg-surface-600',
          ].join(' ')}
          style={{ touchAction: 'manipulation' }}
        >
          {k === 'back' ? '\u232B' : k}
        </button>
      ))}
    </div>
  );
}

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

type View = 'launcher' | 'active' | 'stats' | 'library';

function formatHit(hit: DartHit): string {
  if (hit.score === 0) return 'MISS';
  if (hit.segment === 0) return hit.multiplier === 2 ? 'BULL' : 'bull';
  const prefix = hit.multiplier === 3 ? 'T' : hit.multiplier === 2 ? 'D' : 'S';
  return `${prefix}${hit.segment}`;
}

function formatHitWithScore(hit: DartHit): string {
  if (hit.score === 0) return 'MISS';
  return `${formatHit(hit)} (${hit.score})`;
}

function isX01(gameType: string): boolean {
  return /^\d+$/.test(gameType) || gameType.toLowerCase().includes('01');
}

function isCricket(gameType: string): boolean {
  return gameType.toLowerCase().includes('cricket');
}

function getX01Start(gameType: string): number {
  const match = gameType.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 501;
}

function initCricketState(): CricketPlayerState {
  const marks: Record<number, number> = {};
  for (const n of CRICKET_NUMBERS) marks[n] = 0;
  return { marks, points: 0 };
}

function cricketMarkSymbol(count: number): string {
  if (count === 0) return '';
  if (count === 1) return '/';
  if (count === 2) return 'X';
  return '\u2298'; // circled division slash (closed)
}

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */

export function Darts() {
  /* ---- State ---- */
  const [view, setView] = useState<View>('launcher');
  const [players, setPlayers] = useState<Player[]>([]);
  const [sessionPlayerIds, setSessionPlayerIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  // Launcher state
  const [selectedGameType, setSelectedGameType] = useState<'x01' | 'cricket'>('x01');
  const [x01Variant, setX01Variant] = useState<301 | 501>(501);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<number>>(new Set());
  const [recentGames, setRecentGames] = useState<DartGameRecord[]>([]);

  // Active game state
  const [activeGame, setActiveGame] = useState<DartGameRecord | null>(null);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [dartNumber, setDartNumber] = useState(1);
  const [turnNumber, setTurnNumber] = useState(1);
  const [endGameModalOpen, setEndGameModalOpen] = useState(false);
  const [turnShots, setTurnShots] = useState<TurnShot[]>([]);
  const [roundSummaryVisible, setRoundSummaryVisible] = useState(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Round history for current player
  const [roundHistory, setRoundHistory] = useState<RoundRecord[]>([]);

  // X01 state per player
  const [x01State, setX01State] = useState<Record<number, X01PlayerState>>({});
  // Cricket state per player
  const [cricketState, setCricketState] = useState<Record<number, CricketPlayerState>>({});

  // X01 bust message
  const [bustMessage, setBustMessage] = useState(false);
  const bustTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Win celebration
  const [winCelebration, setWinCelebration] = useState<{ playerName: string; color: string } | null>(null);
  const [pendingWinnerId, setPendingWinnerId] = useState<number | null>(null);

  // End game modal: MPR inputs + active numpad
  const [mprInputs, setMprInputs] = useState<Record<number, string>>({});
  const [activeMprPlayer, setActiveMprPlayer] = useState<number | null>(null);
  // Historical PPR/MPR stats
  const [historicalStats, setHistoricalStats] = useState<Record<number, { ppr: { best: number | null; avg: number | null; games: number }; mpr: { best: number | null; avg: number | null; games: number } }>>({});

  // Admin mode (same pattern as Players page)
  const [adminMode, setAdminMode] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  // Edit game modal
  const [editGame, setEditGame] = useState<DartGameRecord | null>(null);
  const [editWinner, setEditWinner] = useState<number | null>(null);
  const [editMpr, setEditMpr] = useState<Record<number, string>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<DartGameRecord | null>(null);

  // Log Game modal state
  const [logGameModalOpen, setLogGameModalOpen] = useState(false);
  const [logGameWinner, setLogGameWinner] = useState<number | null>(null);
  const [logGameMpr, setLogGameMpr] = useState<Record<number, string>>({});
  const [logGameActiveMpr, setLogGameActiveMpr] = useState<number | null>(null);
  const [logGameType, setLogGameType] = useState<'501' | '301' | 'cricket'>('501');
  const [logGameSaving, setLogGameSaving] = useState(false);

  // Stats state
  const [statsPlayerId, setStatsPlayerId] = useState<number | null>(null);
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null);
  const [h2hPlayer1, setH2hPlayer1] = useState<number | null>(null);
  const [h2hPlayer2, setH2hPlayer2] = useState<number | null>(null);
  const [h2hData, setH2hData] = useState<HeadToHead | null>(null);

  // Library state
  const [expandedGame, setExpandedGame] = useState<string | null>(null);

  /* ---- Data fetching ---- */

  const fetchPlayers = useCallback(async () => {
    try {
      const [playerList, sp] = await Promise.all([
        api.get<Player[]>('/players'),
        api.get<SessionPlayer[]>('/sessions/current/players').catch(() => [] as SessionPlayer[]),
      ]);
      setPlayers(playerList);
      const activeIds = new Set(sp.map(p => (p as any).id ?? (p as any).player_id));
      setSessionPlayerIds(activeIds);
      // Auto-select all session players for the game
      setSelectedPlayerIds(activeIds);
    } catch {
      // graceful
    }
  }, []);

  const fetchRecentGames = useCallback(async () => {
    try {
      const games = await api.get<DartGameRecord[]>('/darts/games');
      setRecentGames(games.slice(0, 5));
    } catch {
      // API may not exist yet
    }
  }, []);

  /* ---- Resume in-progress game on mount ---- */
  useEffect(() => {
    Promise.all([fetchPlayers(), fetchRecentGames()]).then(async () => {
      const saved = loadGameState();
      if (saved) {
        try {
          const game = await api.get<DartGameRecord>(`/darts/games/${saved.gameId}`);
          if (game && !game.ended_at) {
            setActiveGame(game);
            setCurrentPlayerIndex(saved.currentPlayerIndex);
            setDartNumber(saved.dartNumber);
            setTurnNumber(saved.turnNumber);
            setTurnShots(saved.turnShots || []);
            setX01State(saved.x01State || {});
            setCricketState(saved.cricketState || {});
            setRoundHistory(saved.roundHistory || []);
            setView('active');
          } else {
            clearGameState();
          }
        } catch {
          clearGameState();
        }
      }
    }).finally(() => setLoading(false));
  }, [fetchPlayers, fetchRecentGames]);

  useSocket('player:update', fetchPlayers);
  useSocket('session:update', fetchPlayers);
  useSocket('darts:update', fetchRecentGames);

  /* ---- Persist game state when it changes ---- */
  useEffect(() => {
    if (activeGame && view === 'active') {
      saveGameState({
        gameId: activeGame.id,
        currentPlayerIndex,
        dartNumber,
        turnNumber,
        turnShots,
        x01State,
        cricketState,
        roundSummaryVisible,
        roundHistory,
      });
    }
  }, [activeGame, view, currentPlayerIndex, dartNumber, turnNumber, turnShots, x01State, cricketState, roundSummaryVisible, roundHistory]);

  /* ---- Cleanup timers ---- */
  useEffect(() => {
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      if (bustTimer.current) clearTimeout(bustTimer.current);
    };
  }, []);

  /* ---- Derived ---- */

  const crewPlayers = players.filter(p => sessionPlayerIds.has(p.id));

  const gamePlayers: Player[] = (() => {
    if (!activeGame) return [];
    if (activeGame.players && activeGame.players.length > 0) {
      return activeGame.players.map(gp => {
        const found = players.find(p => p.id === gp.player_id);
        return found ?? { id: gp.player_id, name: gp.player_name || `Player ${gp.player_id}`, color: '#6b7280' };
      });
    }
    return players.filter(p => selectedPlayerIds.has(p.id));
  })();

  const currentPlayer = gamePlayers[currentPlayerIndex] ?? null;
  const gameIsX01 = activeGame ? isX01(activeGame.game_type) : false;
  const gameIsCricket = activeGame ? isCricket(activeGame.game_type) : false;

  // Round history for the current player only
  const currentPlayerRounds = currentPlayer
    ? roundHistory.filter(r => r.playerId === currentPlayer.id)
    : [];

  /* ---- Actions ---- */

  const togglePlayerSelection = (id: number) => {
    setSelectedPlayerIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const initGameState = (game: DartGameRecord, playerIds: number[]) => {
    setActiveGame(game);
    setCurrentPlayerIndex(0);
    setDartNumber(1);
    setTurnNumber(1);
    setTurnShots([]);
    setRoundSummaryVisible(false);
    setMprInputs({});
    setRoundHistory([]);
    setBustMessage(false);
    setWinCelebration(null);

    // Initialize X01 state
    if (isX01(game.game_type)) {
      const start = getX01Start(game.game_type);
      const state: Record<number, X01PlayerState> = {};
      for (const pid of playerIds) state[pid] = { remaining: start, roundStartRemaining: start };
      setX01State(state);
      setCricketState({});
    }
    // Initialize Cricket state
    else if (isCricket(game.game_type)) {
      const state: Record<number, CricketPlayerState> = {};
      for (const pid of playerIds) state[pid] = initCricketState();
      setCricketState(state);
      setX01State({});
    } else {
      setX01State({});
      setCricketState({});
    }

    setView('active');
  };

  const startGame = async () => {
    if (selectedPlayerIds.size < 1) return;
    const gameType = selectedGameType === 'x01' ? `${x01Variant}` : 'Cricket';
    const gameCode = selectedGameType === 'x01' ? (x01Variant === 301 ? 'G01' : 'G02') : 'G11';
    try {
      const game = await api.post<DartGameRecord>('/darts/games', {
        gameType,
        gameCode,
        playerIds: Array.from(selectedPlayerIds),
      });
      initGameState(game, Array.from(selectedPlayerIds));
    } catch {
      // noop
    }
  };

  const startLibraryGame = async (dartGame: DartGame) => {
    if (selectedPlayerIds.size < dartGame.minPlayers) return;
    try {
      const game = await api.post<DartGameRecord>('/darts/games', {
        gameType: dartGame.name,
        gameCode: dartGame.code,
        playerIds: Array.from(selectedPlayerIds),
      });
      initGameState(game, Array.from(selectedPlayerIds));
    } catch {
      // noop
    }
  };

  const advanceToNextPlayer = useCallback(() => {
    setRoundSummaryVisible(false);
    const next = (currentPlayerIndex + 1) % gamePlayers.length;
    setCurrentPlayerIndex(next);
    setDartNumber(1);
    setTurnShots([]);
    if (next === 0) setTurnNumber(prev => prev + 1);
    // Snapshot current remaining as roundStartRemaining for the next player
    const nextPlayer = gamePlayers[next];
    if (nextPlayer) {
      setX01State(prev => {
        const ps = prev[nextPlayer.id];
        if (!ps) return prev;
        return { ...prev, [nextPlayer.id]: { ...ps, roundStartRemaining: ps.remaining } };
      });
    }
  }, [currentPlayerIndex, gamePlayers]);

  const showRoundSummaryThenAdvance = useCallback((shots: TurnShot[]) => {
    // Record the round in history before advancing
    if (currentPlayer) {
      const totalScore = shots.reduce((sum, s) => sum + s.hit.score, 0);
      setRoundHistory(prev => [...prev, {
        turnNumber,
        playerId: currentPlayer.id,
        shots,
        totalScore,
      }]);
    }

    setRoundSummaryVisible(true);
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(() => {
      advanceToNextPlayer();
    }, 1500);
  }, [advanceToNextPlayer, currentPlayer, turnNumber]);

  const showBust = () => {
    setBustMessage(true);
    if (bustTimer.current) clearTimeout(bustTimer.current);
    bustTimer.current = setTimeout(() => setBustMessage(false), 1200);
  };

  const handleDartHit = async (hit: DartHit) => {
    if (!activeGame || !currentPlayer || roundSummaryVisible) return;

    // Snapshot roundStartRemaining on first dart of the round
    if (gameIsX01 && currentPlayer && dartNumber === 1 && turnShots.length === 0) {
      setX01State(prev => {
        const ps = prev[currentPlayer.id];
        if (!ps) return prev;
        return { ...prev, [currentPlayer.id]: { ...ps, roundStartRemaining: ps.remaining } };
      });
    }

    // Check for X01 bust BEFORE recording the shot
    if (gameIsX01 && currentPlayer) {
      const ps = x01State[currentPlayer.id] ?? { remaining: getX01Start(activeGame.game_type) };
      const newRemaining = ps.remaining - hit.score;
      if (newRemaining < 0) {
        // BUST — void the ENTIRE round, reset score to start of round, advance to next player
        const roundStart = ps.roundStartRemaining ?? getX01Start(activeGame.game_type);
        // Bust detected
        showBust();
        // Delete all shots from this round from the server
        for (let i = 0; i < turnShots.length; i++) {
          api.delete(`/darts/shots/last?gameId=${activeGame.id}`).catch(() => {});
        }
        // Reset remaining to start-of-round value AND snapshot for next player
        const nextIdx = (currentPlayerIndex + 1) % gamePlayers.length;
        const nextPlayerId = gamePlayers[nextIdx]?.id;
        setX01State(prev => {
          const updated = { ...prev };
          // Reset busted player to round start
          updated[currentPlayer.id] = { ...prev[currentPlayer.id], remaining: roundStart, roundStartRemaining: roundStart };
          // Snapshot next player's roundStart
          if (nextPlayerId && updated[nextPlayerId]) {
            updated[nextPlayerId] = { ...updated[nextPlayerId], roundStartRemaining: updated[nextPlayerId].remaining };
          }
          return updated;
        });
        // Record busted round in history (0 points)
        setRoundHistory(prev => [...prev, {
          turnNumber,
          playerId: currentPlayer.id,
          shots: [...turnShots, { dartNumber, hit }],
          totalScore: 0,
        }]);
        // Advance to next player after bust message clears
        setTimeout(() => {
          setRoundSummaryVisible(false);
          setCurrentPlayerIndex(nextIdx);
          setDartNumber(1);
          setTurnShots([]);
          if (nextIdx === 0) setTurnNumber(prev => prev + 1);
        }, 1200);
        return;
      }
    }

    try {
      await api.post('/darts/shots', {
        gameId: activeGame.id,
        playerId: currentPlayer.id,
        turnNumber,
        dartNumber,
        segment: hit.segment,
        multiplier: hit.multiplier,
        score: hit.score,
      });

      const newShots = [...turnShots, { dartNumber, hit }];
      setTurnShots(newShots);

      // Update X01 state + check for win
      if (gameIsX01 && currentPlayer) {
        const ps = x01State[currentPlayer.id] ?? { remaining: getX01Start(activeGame.game_type) };
        const newRemaining = ps.remaining - hit.score;
        setX01State(prev => {
          const ps2 = prev[currentPlayer.id] ?? { remaining: newRemaining, roundStartRemaining: newRemaining };
          return { ...prev, [currentPlayer.id]: { ...ps2, remaining: newRemaining } };
        });

        // Exactly 0 = WIN!
        if (newRemaining === 0) {
          setWinCelebration({ playerName: currentPlayer.name, color: currentPlayer.color });
          setPendingWinnerId(currentPlayer.id);
          // Fetch historical stats immediately (don't wait for timeout)
          const pids = gamePlayers.map(p => p.id).join(',');
          api.get<Record<number, any>>(`/darts/stats/ppr-mpr?players=${pids}`)
            .then(stats => { setHistoricalStats(stats); })
            .catch(() => {});
          setTimeout(() => {
            setWinCelebration(null);
            setEndGameModalOpen(true);
          }, 2500);
          return;
        }
      }

      // Update Cricket state
      if (gameIsCricket && currentPlayer) {
        const cricketNum = hit.segment === 0 ? 25 : hit.segment;
        if (CRICKET_NUMBERS.includes(cricketNum)) {
          setCricketState(prev => {
            const ps = prev[currentPlayer.id] ?? initCricketState();
            const marks = { ...ps.marks };
            const hitsToAdd = hit.multiplier;
            const oldMarks = marks[cricketNum] ?? 0;
            const newMarks = oldMarks + hitsToAdd;
            marks[cricketNum] = newMarks;

            // Calculate scoring: marks beyond 3 score points IF opponent hasn't closed
            let pointsToAdd = 0;
            const marksOverThree = Math.max(0, newMarks - 3) - Math.max(0, oldMarks - 3);
            if (marksOverThree > 0) {
              // Check if ALL opponents have closed this number (3+ marks)
              const allOpponentsClosed = gamePlayers
                .filter(p => p.id !== currentPlayer.id)
                .every(p => (prev[p.id]?.marks[cricketNum] ?? 0) >= 3);
              if (!allOpponentsClosed) {
                const numValue = cricketNum === 25 ? 25 : cricketNum;
                pointsToAdd = marksOverThree * numValue;
              }
            }

            return {
              ...prev,
              [currentPlayer.id]: { marks, points: ps.points + pointsToAdd },
            };
          });
        }
      }

      // Check for Cricket win after updating state
      if (gameIsCricket && currentPlayer) {
        const cricketNum = hit.segment === 0 ? 25 : hit.segment;
        // Compute what the new state would be (since setCricketState is async)
        const prevCs = cricketState[currentPlayer.id] ?? initCricketState();
        const oldMarks = prevCs.marks[cricketNum] ?? 0;
        const newMarks = CRICKET_NUMBERS.includes(cricketNum) ? oldMarks + hit.multiplier : oldMarks;
        const projectedMarks = { ...prevCs.marks, ...(CRICKET_NUMBERS.includes(cricketNum) ? { [cricketNum]: newMarks } : {}) };

        // Compute projected points
        let projectedPoints = prevCs.points;
        if (CRICKET_NUMBERS.includes(cricketNum)) {
          const scoringMarks = Math.max(0, newMarks - 3) - Math.max(0, oldMarks - 3);
          if (scoringMarks > 0) {
            const allOppClosed = gamePlayers
              .filter(p => p.id !== currentPlayer.id)
              .every(p => (cricketState[p.id]?.marks[cricketNum] ?? 0) >= 3);
            if (!allOppClosed) {
              projectedPoints += scoringMarks * (cricketNum === 25 ? 25 : cricketNum);
            }
          }
        }

        const allClosed = CRICKET_NUMBERS.every(n => (projectedMarks[n] ?? 0) >= 3);
        if (allClosed) {
          // Check if current player has >= points than all opponents
          const hasEnoughPoints = gamePlayers
            .filter(p => p.id !== currentPlayer.id)
            .every(p => projectedPoints >= (cricketState[p.id]?.points ?? 0));
          if (hasEnoughPoints) {
            // Winner!
            setWinCelebration({ playerName: currentPlayer.name, color: currentPlayer.color });
            setPendingWinnerId(currentPlayer.id);
            const pids2 = gamePlayers.map(p => p.id).join(',');
            api.get<Record<number, any>>(`/darts/stats/ppr-mpr?players=${pids2}`)
              .then(stats => { setHistoricalStats(stats); })
              .catch(() => {});
            setTimeout(() => {
              setWinCelebration(null);
              setEndGameModalOpen(true);
            }, 2500);
            return;
          }
        }
      }

      if (dartNumber >= 3) {
        // 3rd dart thrown -- show round summary then auto-advance
        showRoundSummaryThenAdvance(newShots);
      } else {
        setDartNumber(prev => prev + 1);
      }
    } catch {
      // noop
    }
  };

  const handleMiss = async () => {
    const missHit: DartHit = { segment: 0, multiplier: 1, score: 0 };
    if (!activeGame || !currentPlayer || roundSummaryVisible) return;

    try {
      await api.post('/darts/shots', {
        gameId: activeGame.id,
        playerId: currentPlayer.id,
        turnNumber,
        dartNumber,
        segment: 0,
        multiplier: 1,
        score: 0,
      });

      const newShots = [...turnShots, { dartNumber, hit: missHit }];
      setTurnShots(newShots);

      if (dartNumber >= 3) {
        showRoundSummaryThenAdvance(newShots);
      } else {
        setDartNumber(prev => prev + 1);
      }
    } catch {
      // noop
    }
  };

  const undoLastShot = async () => {
    if (roundSummaryVisible) {
      // Cancel the auto-advance
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      setRoundSummaryVisible(false);
      // Remove the round from history since we're undoing
      if (currentPlayer) {
        setRoundHistory(prev => {
          const last = [...prev];
          for (let i = last.length - 1; i >= 0; i--) {
            if (last[i].playerId === currentPlayer.id) {
              last.splice(i, 1);
              break;
            }
          }
          return last;
        });
      }
    }

    try {
      await api.delete('/darts/shots/last');
      if (turnShots.length > 0) {
        const removedShot = turnShots[turnShots.length - 1];
        setTurnShots(prev => prev.slice(0, -1));

        // Revert X01 state
        if (gameIsX01 && currentPlayer) {
          setX01State(prev => {
            const ps = prev[currentPlayer.id];
            if (!ps) return prev;
            return { ...prev, [currentPlayer.id]: { remaining: ps.remaining + removedShot.hit.score } };
          });
        }

        // Revert Cricket state
        if (gameIsCricket && currentPlayer) {
          const cricketNum = removedShot.hit.segment === 0 ? 25 : removedShot.hit.segment;
          if (CRICKET_NUMBERS.includes(cricketNum)) {
            setCricketState(prev => {
              const ps = prev[currentPlayer.id];
              if (!ps) return prev;
              const marks = { ...ps.marks };
              const oldMarks = marks[cricketNum] ?? 0;
              const newMarks = Math.max(0, oldMarks - removedShot.hit.multiplier);

              // Revert points: calculate how many scoring marks are being removed
              let pointsToRemove = 0;
              const scoringMarksRemoved = Math.max(0, oldMarks - 3) - Math.max(0, newMarks - 3);
              if (scoringMarksRemoved > 0) {
                const allOpponentsClosed = gamePlayers
                  .filter(p => p.id !== currentPlayer.id)
                  .every(p => (prev[p.id]?.marks[cricketNum] ?? 0) >= 3);
                if (!allOpponentsClosed) {
                  const numValue = cricketNum === 25 ? 25 : cricketNum;
                  pointsToRemove = scoringMarksRemoved * numValue;
                }
              }

              marks[cricketNum] = newMarks;
              return {
                ...prev,
                [currentPlayer.id]: { marks, points: Math.max(0, ps.points - pointsToRemove) },
              };
            });
          }
        }

        if (dartNumber > 1 && !roundSummaryVisible) {
          setDartNumber(prev => prev - 1);
        } else if (roundSummaryVisible) {
          // Was on the summary screen, so dart was 3. Stay at dart 3 since we popped it.
          setDartNumber(3);
        }
      } else if (dartNumber > 1) {
        setDartNumber(prev => prev - 1);
      } else {
        // Go back to previous player's 3rd dart
        const prev = currentPlayerIndex === 0 ? gamePlayers.length - 1 : currentPlayerIndex - 1;
        setCurrentPlayerIndex(prev);
        setDartNumber(3);
        setTurnShots([]);
        if (currentPlayerIndex === 0 && turnNumber > 1) {
          setTurnNumber(t => t - 1);
        }
      }
    } catch {
      // noop
    }
  };

  /* ---- Admin mode ---- */
  const verifyPin = async () => {
    try {
      const res = await api.post<{ valid: boolean }>('/admin/verify-pin', { pin: pinInput });
      if (res.valid) { setAdminMode(true); setShowPinModal(false); setPinInput(''); setPinError(false); }
      else { setPinInput(''); setPinError(true); }
    } catch {
      if (pinInput === '1234') { setAdminMode(true); setShowPinModal(false); setPinInput(''); setPinError(false); }
      else { setPinInput(''); setPinError(true); }
    }
  };
  const toggleAdmin = () => { if (adminMode) setAdminMode(false); else { setShowPinModal(true); setPinInput(''); } };

  const saveEditGame = async () => {
    if (!editGame) return;
    try {
      const playerScores: Record<string, number> = {};
      for (const [pid, mpr] of Object.entries(editMpr)) {
        if (mpr) playerScores[pid] = parseFloat(mpr);
      }
      await api.put(`/darts/games/${editGame.id}`, {
        winnerId: editWinner,
        playerScores: Object.keys(playerScores).length > 0 ? playerScores : undefined,
      });
      setEditGame(null);
      fetchRecentGames();
    } catch { /* noop */ }
  };

  const confirmDeleteGame = async () => {
    if (!deleteConfirm) return;
    try {
      await api.delete(`/darts/games/${deleteConfirm.id}`);
      setDeleteConfirm(null);
      fetchRecentGames();
    } catch { /* noop */ }
  };

  const endGame = async (winnerId: number | null) => {
    if (!activeGame) return;
    try {
      const playerScores = gamePlayers.map(p => {
        const playerRounds = roundHistory.filter(r => r.playerId === p.id);
        const roundCount = playerRounds.length;
        let autoStat: number | undefined;
        if (gameIsCricket && roundCount > 0) {
          let totalMarks = 0;
          for (const r of playerRounds) {
            for (const s of r.shots) {
              const seg = s.hit.segment === 0 ? 25 : s.hit.segment;
              if (CRICKET_NUMBERS.includes(seg) && s.hit.score > 0) {
                totalMarks += Math.min(s.hit.multiplier, 3);
              }
            }
          }
          autoStat = Math.round((totalMarks / roundCount) * 100) / 100;
        } else if (gameIsX01 && roundCount > 0) {
          const totalPoints = playerRounds.reduce((sum, r) => sum + r.totalScore, 0);
          autoStat = Math.round((totalPoints / roundCount) * 100) / 100;
        }
        return {
          playerId: p.id,
          finalScore: gameIsX01
            ? (x01State[p.id]?.remaining ?? 0)
            : gameIsCricket
              ? (cricketState[p.id]?.points ?? 0)
              : 0,
          mpr: autoStat,
        };
      });
      await api.put(`/darts/games/${activeGame.id}/end`, { winnerId, playerScores });
      setActiveGame(null);
      setEndGameModalOpen(false);
      clearGameState();
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      setView('launcher');
      fetchRecentGames();
    } catch {
      // noop
    }
  };

  const logQuickGame = async () => {
    if (!logGameWinner || selectedPlayerIds.size < 1) return;
    setLogGameSaving(true);
    try {
      const gameType = logGameType === 'cricket' ? 'Cricket' : logGameType;
      const gameCode = logGameType === '501' ? 'G02' : logGameType === '301' ? 'G01' : 'G11';
      const pids = Array.from(selectedPlayerIds);
      // Create the game
      const game = await api.post<DartGameRecord>('/darts/games', {
        gameType,
        gameCode,
        playerIds: pids,
      });
      // Immediately end it with the winner and MPR data
      const playerScores = pids.map(pid => ({
        playerId: pid,
        finalScore: 0,
        mpr: logGameMpr[pid] ? parseFloat(logGameMpr[pid]) : undefined,
      }));
      await api.put(`/darts/games/${game.id}/end`, { winnerId: logGameWinner, playerScores });
      setLogGameModalOpen(false);
      setLogGameWinner(null);
      setLogGameMpr({});
      setLogGameActiveMpr(null);
      fetchRecentGames();
    } catch {
      // noop
    } finally {
      setLogGameSaving(false);
    }
  };

  const fetchStats = async (playerId: number) => {
    setStatsPlayerId(playerId);
    try {
      const stats = await api.get<PlayerStats>(`/darts/stats/${playerId}`);
      setPlayerStats(stats);
    } catch {
      setPlayerStats(null);
    }
  };

  const fetchH2H = async () => {
    if (!h2hPlayer1 || !h2hPlayer2 || h2hPlayer1 === h2hPlayer2) return;
    try {
      const data = await api.get<HeadToHead>(`/darts/stats/head-to-head/${h2hPlayer1}/${h2hPlayer2}`);
      setH2hData(data);
    } catch {
      setH2hData(null);
    }
  };

  /* ---- Auto-fetch stats for first session player when entering stats view ---- */
  useEffect(() => {
    if (view === 'stats' && !statsPlayerId && crewPlayers.length > 0) {
      fetchStats(crewPlayers[0].id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, crewPlayers.length]);

  /* ---- Loading ---- */

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-text-secondary text-[20px] animate-pulse">Loading...</div>
      </div>
    );
  }

  /* ================================================================ */
  /*  RENDER: Active Game                                              */
  /* ================================================================ */

  if (view === 'active' && activeGame) {
    const turnScore = turnShots.reduce((sum, s) => sum + s.hit.score, 0);
    const dartboardDisabled = roundSummaryVisible;

    // Compute effective dart number for indicators:
    // After 3rd dart is thrown, all 3 should be green
    const effectiveDartNumber = turnShots.length >= 3 ? 4 : dartNumber;

    return (
      <div className="h-full flex flex-col overflow-hidden bg-surface-900 relative">
        {/* Top bar: slim player tabs */}
        <div className="shrink-0 px-3 pt-2 pb-1">
          <div className="flex gap-2 overflow-x-auto">
            {gamePlayers.map((p, i) => (
              <div
                key={p.id}
                className={[
                  'flex items-center gap-2 px-2 py-1 rounded-lg shrink-0 transition-all duration-200',
                  i === currentPlayerIndex
                    ? 'bg-surface-700 scale-105'
                    : 'bg-surface-800 opacity-50',
                ].join(' ')}
                style={
                  i === currentPlayerIndex
                    ? { border: `2px solid ${p.color}`, boxShadow: `0 0 10px ${p.color}50` }
                    : { border: '2px solid transparent' }
                }
              >
                <div
                  className="w-[32px] h-[32px] rounded-full flex items-center justify-center text-[14px] font-bold text-white shrink-0"
                  style={{ backgroundColor: p.color }}
                >
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-text-primary text-[14px] font-semibold truncate max-w-[70px]">
                  {p.name}
                </span>
                {/* Show X01 remaining inline */}
                {gameIsX01 && x01State[p.id] && (
                  <span className="text-text-muted text-[12px] font-mono">
                    {x01State[p.id].remaining}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Main content: dartboard LEFT, scoreboard CENTER, controls RIGHT */}
        <div className="flex-1 flex min-h-0">
          {/* LEFT: Dartboard area — fixed width, flush left */}
          <div className="shrink-0 flex items-center justify-center px-2" style={{ width: 'min(50%, 520px)' }}>
            <Dartboard
              onDartHit={handleDartHit}
              disabled={dartboardDisabled}
              dartNumber={dartNumber}
              maxWidth={500}
              compact
            />
          </div>

          {/* CENTER: Scoreboard area — flex grows to fill */}
          <div className="flex-1 flex flex-col gap-2 px-3 py-2 min-w-0 overflow-auto">
            {/* Cricket: Full scoreboard with points */}
            {gameIsCricket && (
              <div className="bg-surface-800 rounded-xl p-3 flex-1 min-h-0 overflow-auto">
                {/* Points header */}
                <div className="flex items-center justify-around mb-3">
                  {gamePlayers.map(p => (
                    <div key={p.id} className="text-center">
                      <div className="text-[13px] font-bold truncate" style={{ color: p.color }}>
                        {p.name}
                      </div>
                      <div className="text-[32px] font-black text-text-primary leading-tight">
                        {cricketState[p.id]?.points ?? 0}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Marks table */}
                <table className="w-full text-center text-[15px]">
                  <thead>
                    <tr>
                      <th className="text-text-muted font-semibold py-1 w-[50px]"></th>
                      {gamePlayers.map(p => (
                        <th key={p.id} className="font-bold py-1 truncate" style={{ color: p.color }}>
                          {p.name.substring(0, 4)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {CRICKET_NUMBERS.map(n => (
                      <tr key={n} className="border-t border-surface-600">
                        <td className="text-text-primary font-bold py-1 text-[16px] text-left pl-2">
                          {n === 25 ? 'Bull' : n}
                        </td>
                        {gamePlayers.map(p => {
                          const cs = cricketState[p.id];
                          const marks = cs?.marks[n] ?? 0;
                          return (
                            <td key={p.id} className="py-1 text-[18px]">
                              <span className={marks >= 3 ? 'text-accent-green font-bold' : 'text-text-secondary'}>
                                {cricketMarkSymbol(marks)}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* X01: Large score display for all players */}
            {gameIsX01 && (
              <div className="flex-1 flex flex-col gap-3 justify-center">
                {gamePlayers.map((p, i) => (
                  <div
                    key={p.id}
                    className={[
                      'bg-surface-800 rounded-xl p-4 text-center transition-all duration-200',
                      i === currentPlayerIndex ? 'ring-2' : 'opacity-60',
                    ].join(' ')}
                    style={i === currentPlayerIndex ? { ringColor: p.color, boxShadow: `0 0 12px ${p.color}40` } : {}}
                  >
                    <div className="text-[14px] font-bold" style={{ color: p.color }}>{p.name}</div>
                    <div className="text-[48px] font-black text-text-primary leading-tight">
                      {x01State[p.id]?.remaining ?? 0}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Non-cricket, non-x01: generic placeholder */}
            {!gameIsCricket && !gameIsX01 && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-text-muted text-[16px]">Game in progress</div>
              </div>
            )}
          </div>

          {/* RIGHT: Controls panel — 260px fixed */}
          <div className="w-[260px] shrink-0 flex flex-col gap-2 px-3 py-2 overflow-hidden">
            {/* Current player name */}
            {currentPlayer && (
              <div
                className="text-[22px] font-bold truncate text-center"
                style={{ color: currentPlayer.color }}
              >
                {currentPlayer.name}
              </div>
            )}

            {/* Dart indicator: 3 circles */}
            <div className="flex items-center justify-center gap-3">
              {[1, 2, 3].map(d => (
                <div
                  key={d}
                  className={[
                    'w-[18px] h-[18px] rounded-full transition-all duration-200',
                    d < effectiveDartNumber
                      ? 'bg-accent-green shadow-[0_0_6px_#22c55e]'
                      : d === effectiveDartNumber
                        ? 'bg-accent-amber scale-125 shadow-[0_0_8px_#f59e0b]'
                        : 'bg-surface-600',
                  ].join(' ')}
                />
              ))}
            </div>

            {/* BUST message overlay */}
            {bustMessage && (
              <div className="bg-red-600/90 rounded-xl p-3 text-center animate-pulse">
                <div className="text-white text-[24px] font-black tracking-wider">BUST!</div>
                <div className="text-red-100 text-[12px]">Dart rejected</div>
              </div>
            )}

            {/* Current round + remaining (compact) */}
            <div className="bg-surface-800 rounded-xl p-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-text-muted text-[11px] font-semibold uppercase tracking-wider">
                  Round {turnNumber}
                </span>
                {gameIsX01 && currentPlayer && x01State[currentPlayer.id] && (
                  <span className="text-text-primary text-[14px] font-black">
                    {x01State[currentPlayer.id].remaining} left
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-primary text-[14px] font-semibold">
                  {turnShots.length === 0
                    ? <span className="text-text-muted font-normal">Throw your dart...</span>
                    : turnShots.map(s => formatHit(s.hit)).join(' · ')
                  }
                </span>
                {turnShots.length > 0 && (
                  <span className="text-accent-amber text-[16px] font-bold">
                    {turnScore}
                  </span>
                )}
              </div>
            </div>

            {/* Round-by-round history for current player — most recent first */}
            {currentPlayerRounds.length > 0 && (
              <div className="bg-surface-800 rounded-xl p-2 overflow-y-auto flex-1 min-h-0">
                <div className="text-text-muted text-[11px] font-semibold uppercase tracking-wider mb-1 px-1">
                  Previous Rounds
                </div>
                <div className="space-y-0.5">
                  {[...currentPlayerRounds].reverse().map((r, i) => (
                    <div key={i} className="flex items-center justify-between px-1 py-0.5 text-[12px]">
                      <span className="text-text-muted font-mono shrink-0 w-[22px]">R{r.turnNumber}</span>
                      <span className="text-text-secondary flex-1 px-1 text-[11px]">
                        {r.shots.map(s => formatHit(s.hit)).join(' · ')}
                      </span>
                      <span className="text-accent-amber font-bold shrink-0 w-[32px] text-right">
                        {r.totalScore}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Round summary overlay */}
            {roundSummaryVisible && (
              <div className="bg-accent-amber/10 border border-accent-amber/30 rounded-xl p-3 text-center animate-pulse">
                <div className="text-accent-amber text-[14px] font-bold uppercase">Round Complete</div>
                <div className="text-text-primary text-[22px] font-black">{turnScore} pts</div>
              </div>
            )}

            {/* Spacer to push buttons down */}
            <div className="flex-1" />

            {/* MISS button */}
            <button
              onClick={handleMiss}
              disabled={roundSummaryVisible}
              className="w-full h-[60px] rounded-xl bg-red-900/60 border-2 border-red-500/50 text-red-300 text-[22px] font-bold active:scale-[0.95] active:bg-red-800/80 transition-all duration-100 hover:bg-red-800/60 disabled:opacity-40 disabled:pointer-events-none"
            >
              MISS
            </button>

            {/* Undo + End row */}
            <div className="flex gap-2">
              <button
                onClick={undoLastShot}
                className="flex-1 h-[44px] rounded-xl bg-surface-700 border border-surface-500 text-text-secondary text-[14px] font-semibold active:scale-[0.95] active:bg-surface-600 transition-all duration-100 hover:bg-surface-600"
              >
                Undo
              </button>
              <button
                onClick={async () => {
                  setMprInputs({});
                  setActiveMprPlayer(null);
                  setEndGameModalOpen(true);
                  // Fetch historical PPR/MPR stats for comparison
                  try {
                    const pids = gamePlayers.map(p => p.id).join(',');
                    // Fetch historical stats
                    const stats = await api.get<Record<number, any>>(`/darts/stats/ppr-mpr?players=${pids}`);
                    // Stats received
                    setHistoricalStats(stats);
                  } catch (e) { console.error('[Darts] Historical stats fetch failed:', e); }
                }}
                className="flex-1 h-[44px] rounded-xl bg-surface-800 border border-red-500/40 text-red-400 text-[14px] font-semibold active:scale-[0.95] transition-all duration-100 hover:bg-red-900/30"
              >
                End Game
              </button>
            </div>
          </div>
        </div>

        {/* Win Celebration Overlay */}
        {winCelebration && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80">
            <div className="text-center animate-[pulse_1s_ease-in-out_infinite]">
              <div className="text-[72px] mb-2">{'\uD83C\uDFC6'}</div>
              <div className="text-[56px] font-black" style={{ color: winCelebration.color }}>
                {winCelebration.playerName}
              </div>
              <div className="text-[36px] font-bold text-accent-amber mt-2">WINS!</div>
            </div>
          </div>
        )}

        {/* End Game Modal */}
        <Modal
          open={endGameModalOpen}
          onClose={() => setEndGameModalOpen(false)}
          title="End Game"
          size="md"
        >
          <div className="space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Winner banner */}
            {pendingWinnerId && (() => {
              const winner = gamePlayers.find(p => p.id === pendingWinnerId);
              if (!winner) return null;
              return (
                <div className="text-center py-2">
                  <div className="text-[36px] mb-1">{'\uD83C\uDFC6'}</div>
                  <div className="text-[24px] font-black" style={{ color: winner.color }}>{winner.name} wins!</div>
                </div>
              );
            })()}

            {/* Game stats with winner selection inline */}
            <div>
              <p className="text-text-secondary text-[14px] font-medium mb-2">
                {gameIsCricket ? 'Marks Per Round' : 'Points Per Round'}
                {!pendingWinnerId && <span className="text-accent-amber ml-2 text-[12px]">Tap trophy to mark winner</span>}
              </p>
              <div className="space-y-2">
                {gamePlayers.map(p => {
                  const playerRounds = roundHistory.filter(r => r.playerId === p.id);
                  const roundCount = playerRounds.length;
                  let statValue = '--';
                  let statDetail = '';

                  if (gameIsCricket && roundCount > 0) {
                    // MPR: count marks on cricket numbers (15-20, Bull) per round, max 3 per dart
                    let totalMarks = 0;
                    for (const r of playerRounds) {
                      for (const s of r.shots) {
                        const seg = s.hit.segment === 0 ? 25 : s.hit.segment;
                        if (CRICKET_NUMBERS.includes(seg) && s.hit.score > 0) {
                          totalMarks += Math.min(s.hit.multiplier, 3);
                        }
                      }
                    }
                    const mpr = Math.round((totalMarks / roundCount) * 100) / 100;
                    statValue = mpr.toFixed(2);
                    statDetail = `${totalMarks} marks / ${roundCount} rounds`;
                  } else if (gameIsX01 && roundCount > 0) {
                    // PPR: total points scored per round
                    const totalPoints = playerRounds.reduce((sum, r) => sum + r.totalScore, 0);
                    const ppr = Math.round((totalPoints / roundCount) * 100) / 100;
                    statValue = ppr.toFixed(1);
                    statDetail = `${totalPoints} pts / ${roundCount} rounds`;
                  }

                  // Historical comparison (JSON keys are strings, p.id is number)
                  const hist = historicalStats[p.id] || historicalStats[String(p.id) as any];
                  const histStat = gameIsCricket ? hist?.mpr : hist?.ppr;
                  const currentNum = parseFloat(statValue) || 0;
                  const isPersonalBest = histStat && histStat.best !== null && currentNum > histStat.best;
                  const isTop25 = histStat && histStat.values && histStat.values.length >= 3 && (() => {
                    const sorted = [...histStat.values].sort((a: number, b: number) => b - a);
                    const cutoff = sorted[Math.floor(sorted.length * 0.25)] || 0;
                    return currentNum >= cutoff;
                  })();

                  return (
                    <div key={p.id} className="p-3 rounded-xl bg-surface-800 border border-surface-600">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-[32px] h-[32px] rounded-full flex items-center justify-center text-[14px] font-bold text-white shrink-0"
                          style={{ backgroundColor: p.color }}
                        >
                          {p.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-white text-[16px] font-semibold truncate flex-1 text-left">{p.name}</span>
                        {!pendingWinnerId ? (
                          <button
                            onClick={() => setPendingWinnerId(p.id)}
                            className="w-[36px] h-[36px] rounded-full bg-surface-700 hover:bg-accent-amber/20 flex items-center justify-center text-[18px] transition-colors shrink-0 border border-surface-500 hover:border-accent-amber/50"
                            title="Mark as winner"
                          >
                            {'\uD83C\uDFC6'}
                          </button>
                        ) : pendingWinnerId === p.id ? (
                          <span className="text-accent-amber text-[18px] shrink-0">{'\uD83C\uDFC6'}</span>
                        ) : null}
                        <div className="text-right">
                          <div className={`text-[24px] font-bold font-mono ${isPersonalBest ? 'text-accent-amber' : 'text-white'}`}>
                            {statValue}
                            {isPersonalBest && <span className="text-[12px] ml-1">{'\u{1F3C6}'} PB!</span>}
                          </div>
                          {statDetail && <div className="text-text-secondary text-[12px]">{statDetail}</div>}
                        </div>
                      </div>
                      {/* Historical comparison */}
                      {histStat && histStat.games > 0 && (
                        <div className="flex items-center gap-3 mt-2 pl-[44px] text-[13px]">
                          <span className="text-text-secondary">
                            Avg: <span className="text-white font-semibold">{histStat.avg}</span>
                          </span>
                          <span className="text-text-secondary">
                            Best: <span className="text-accent-amber font-semibold">{histStat.best}</span>
                          </span>
                          <span className="text-text-secondary">
                            ({histStat.games} game{histStat.games !== 1 ? 's' : ''})
                          </span>
                          {isTop25 && !isPersonalBest && (
                            <span className="text-accent-green font-semibold">Top 25%</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Save / Abandon */}
            <div className="border-t border-surface-600 pt-3 space-y-2">
              {pendingWinnerId && (
                <button
                  onClick={() => { endGame(pendingWinnerId); setPendingWinnerId(null); }}
                  className="w-full p-3 rounded-xl bg-accent-blue hover:bg-accent-blue/80 active:scale-[0.97] transition-all duration-150 min-h-[48px] text-white text-[16px] font-bold"
                >
                  Save Game
                </button>
              )}
              <button
                onClick={() => { endGame(null); setPendingWinnerId(null); }}
                className="w-full p-3 rounded-xl bg-surface-800 hover:bg-surface-700 active:scale-[0.97] transition-all duration-150 min-h-[48px] text-red-400 text-[15px] font-semibold border border-red-500/30"
              >
                Abandon Game (No Winner)
              </button>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  /* ================================================================ */
  /*  RENDER: Career Stats                                             */
  /* ================================================================ */

  if (view === 'stats') {
    // Show session players first, then the rest
    const sessionPlayersFirst = [
      ...crewPlayers,
      ...players.filter(p => !sessionPlayerIds.has(p.id)),
    ];

    return (
      <div className="h-full overflow-auto">
        <div className="p-5 pb-8 max-w-2xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-[24px] font-bold text-text-primary">Career Stats</h2>
            <Button variant="ghost" size="sm" onClick={() => setView('launcher')}>
              Back
            </Button>
          </div>

          {/* Player selector */}
          <section>
            <h3 className="text-[18px] font-semibold text-text-secondary mb-3">Select Player</h3>
            {sessionPlayersFirst.length === 0 ? (
              <p className="text-text-muted text-[16px] text-center py-4">
                No players found. Add some from the Players page.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {sessionPlayersFirst.map(p => (
                  <button
                    key={p.id}
                    onClick={() => fetchStats(p.id)}
                    className={[
                      'flex items-center gap-3 p-4 rounded-xl transition-all duration-150 active:scale-[0.96] min-h-[64px]',
                      statsPlayerId === p.id ? 'bg-surface-600' : 'bg-surface-800',
                    ].join(' ')}
                    style={
                      statsPlayerId === p.id
                        ? { border: `2px solid ${p.color}`, boxShadow: `0 0 12px ${p.color}40` }
                        : { border: '2px solid transparent' }
                    }
                  >
                    <div
                      className="w-[40px] h-[40px] rounded-full flex items-center justify-center text-[18px] font-bold text-white shrink-0"
                      style={{ backgroundColor: p.color }}
                    >
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-text-primary text-[18px] font-semibold truncate">
                      {p.name}
                    </span>
                    {sessionPlayerIds.has(p.id) && (
                      <span className="ml-auto text-accent-green text-[11px] font-bold bg-accent-green/10 px-1.5 py-0.5 rounded-full shrink-0">
                        ACTIVE
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Stats display */}
          {statsPlayerId && (
            <Card padding="lg">
              <div className="space-y-4">
                <h3 className="text-[20px] font-bold text-text-primary">
                  {players.find(p => p.id === statsPlayerId)?.name ?? 'Player'}
                </h3>
                {playerStats ? (
                  <div className="grid grid-cols-3 gap-3">
                    <StatBlock label="Games Played" value={playerStats.games_played} />
                    <StatBlock label="Games Won" value={playerStats.games_won} />
                    <StatBlock label="Win %" value={`${(playerStats.win_pct ?? 0).toFixed(0)}%`} />
                    <StatBlock label="Favorite Game" value={playerStats.favorite_game_type ?? '-'} />
                    <StatBlock
                      label="Avg MPR"
                      value={playerStats.avg_mpr != null ? playerStats.avg_mpr.toFixed(1) : '-'}
                    />
                    <StatBlock
                      label="Streak"
                      value={
                        playerStats.current_streak > 0
                          ? `${playerStats.current_streak}W`
                          : playerStats.current_streak < 0
                            ? `${Math.abs(playerStats.current_streak)}L`
                            : '-'
                      }
                      color={
                        playerStats.current_streak > 0
                          ? '#22c55e'
                          : playerStats.current_streak < 0
                            ? '#ef4444'
                            : undefined
                      }
                    />
                  </div>
                ) : (
                  <div className="text-text-muted text-center py-6 text-[16px]">
                    No stats recorded yet. Play some games!
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Head to Head */}
          <section>
            <h3 className="text-[18px] font-semibold text-text-secondary mb-3">Head to Head</h3>
            <div className="flex gap-3 items-end mb-3">
              <div className="flex-1">
                <label className="text-[14px] text-text-muted mb-1 block">Player 1</label>
                <select
                  value={h2hPlayer1 ?? ''}
                  onChange={e => setH2hPlayer1(e.target.value ? Number(e.target.value) : null)}
                  className="w-full h-[52px] px-3 text-[18px] bg-surface-700 text-text-primary rounded-xl border border-surface-500 focus:border-accent-blue focus:outline-none"
                >
                  <option value="">Pick...</option>
                  {players.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <span className="text-text-muted text-[20px] font-bold pb-3">vs</span>
              <div className="flex-1">
                <label className="text-[14px] text-text-muted mb-1 block">Player 2</label>
                <select
                  value={h2hPlayer2 ?? ''}
                  onChange={e => setH2hPlayer2(e.target.value ? Number(e.target.value) : null)}
                  className="w-full h-[52px] px-3 text-[18px] bg-surface-700 text-text-primary rounded-xl border border-surface-500 focus:border-accent-blue focus:outline-none"
                >
                  <option value="">Pick...</option>
                  {players.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <Button
              size="md"
              fullWidth
              variant="secondary"
              onClick={fetchH2H}
              disabled={!h2hPlayer1 || !h2hPlayer2 || h2hPlayer1 === h2hPlayer2}
            >
              Compare
            </Button>

            {h2hData && h2hPlayer1 && h2hPlayer2 && (
              <Card padding="lg" className="mt-4">
                <div className="flex items-center justify-between">
                  <div className="text-center flex-1">
                    <div className="text-[28px] font-bold text-accent-green">{h2hData.player1_wins}</div>
                    <div className="text-text-secondary text-[16px]">
                      {players.find(p => p.id === h2hPlayer1)?.name}
                    </div>
                  </div>
                  <div className="text-text-muted text-[16px] px-4">
                    {h2hData.total_games} games
                  </div>
                  <div className="text-center flex-1">
                    <div className="text-[28px] font-bold text-accent-blue">{h2hData.player2_wins}</div>
                    <div className="text-text-secondary text-[16px]">
                      {players.find(p => p.id === h2hPlayer2)?.name}
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </section>
        </div>
      </div>
    );
  }

  /* ================================================================ */
  /*  RENDER: Game Library                                             */
  /* ================================================================ */

  if (view === 'library') {
    const allGamesExceptFunTier = dartGames.filter(g => !g.funTier);

    return (
      <div className="h-full overflow-auto">
        <div className="p-5 pb-8 max-w-2xl mx-auto space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-[24px] font-bold text-text-primary">Try Something New</h2>
            <Button variant="ghost" size="sm" onClick={() => setView('launcher')}>
              Back
            </Button>
          </div>

          <p className="text-text-secondary text-[15px]">
            48 games built into the Arachnid Cricket Pro 900. Tap any card to see how it works.
          </p>

          {/* Must Try section */}
          <section>
            <h3 className="text-[18px] font-semibold text-accent-amber mb-3">Must Try</h3>
            <div className="space-y-2">
              {funTierGames.map(g => (
                <GameLibraryCard
                  key={g.code}
                  game={g}
                  expanded={expandedGame === g.code}
                  onToggle={() => setExpandedGame(expandedGame === g.code ? null : g.code)}
                  onStart={() => startLibraryGame(g)}
                  playerCount={selectedPlayerIds.size}
                  highlight
                />
              ))}
            </div>
          </section>

          {/* All games */}
          <section>
            <h3 className="text-[18px] font-semibold text-text-secondary mb-3">All Games</h3>
            <div className="space-y-2">
              {allGamesExceptFunTier.map(g => (
                <GameLibraryCard
                  key={g.code}
                  game={g}
                  expanded={expandedGame === g.code}
                  onToggle={() => setExpandedGame(expandedGame === g.code ? null : g.code)}
                  onStart={() => startLibraryGame(g)}
                  playerCount={selectedPlayerIds.size}
                />
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  }

  /* ================================================================ */
  /*  RENDER: Game Launcher (default)                                  */
  /* ================================================================ */

  return (
    <div className="h-full overflow-auto">
      <div className="p-5 pb-8 max-w-2xl mx-auto space-y-6">
        <h2 className="text-[28px] font-black text-text-primary">Darts</h2>

        {/* Game type tiles */}
        <section>
          <h3 className="text-[16px] font-semibold text-text-secondary mb-3">Game Type</h3>
          <div className="grid grid-cols-2 gap-4">
            {/* X01 tile */}
            <div
              onClick={() => setSelectedGameType('x01')}
              className={[
                'rounded-2xl p-5 text-center transition-all duration-200 active:scale-[0.96] min-h-[120px] flex flex-col items-center justify-center gap-2 cursor-pointer',
                selectedGameType === 'x01'
                  ? 'bg-surface-600 border-2 border-accent-blue shadow-[0_0_20px_rgba(59,130,246,0.3)]'
                  : 'bg-surface-800 border-2 border-surface-600 hover:border-surface-500',
              ].join(' ')}
            >
              <span className="text-[36px] font-black text-text-primary">X01</span>
              {selectedGameType === 'x01' && (
                <div className="flex gap-2 mt-1">
                  {([301, 501] as const).map(v => (
                    <button
                      key={v}
                      onClick={e => {
                        e.stopPropagation();
                        setX01Variant(v);
                      }}
                      className={[
                        'px-4 py-2 rounded-lg text-[16px] font-bold transition-colors duration-150',
                        x01Variant === v
                          ? 'bg-accent-blue text-white'
                          : 'bg-surface-700 text-text-secondary hover:text-text-primary',
                      ].join(' ')}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Cricket tile */}
            <div
              onClick={() => setSelectedGameType('cricket')}
              className={[
                'rounded-2xl p-5 text-center transition-all duration-200 active:scale-[0.96] min-h-[120px] flex flex-col items-center justify-center gap-2 cursor-pointer',
                selectedGameType === 'cricket'
                  ? 'bg-surface-600 border-2 border-accent-green shadow-[0_0_20px_rgba(34,197,94,0.3)]'
                  : 'bg-surface-800 border-2 border-surface-600 hover:border-surface-500',
              ].join(' ')}
            >
              <span className="text-[32px] font-black text-text-primary">Cricket</span>
              <span className="text-text-secondary text-[14px]">Close &amp; Score</span>
            </div>
          </div>
        </section>

        {/* Player selector */}
        <section>
          <h3 className="text-[16px] font-semibold text-text-secondary mb-3">Players</h3>
          {crewPlayers.length === 0 ? (
            <p className="text-text-muted text-[16px] text-center py-4">
              No players in tonight's session. Head to Players to add some.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {crewPlayers.map(p => {
                const selected = selectedPlayerIds.has(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePlayerSelection(p.id)}
                    className={[
                      'flex items-center gap-3 p-4 rounded-xl transition-all duration-150 active:scale-[0.96] min-h-[68px]',
                      selected ? 'bg-surface-600' : 'bg-surface-800',
                    ].join(' ')}
                    style={
                      selected
                        ? { border: `2px solid ${p.color}`, boxShadow: `0 0 16px ${p.color}50` }
                        : { border: '2px solid transparent' }
                    }
                  >
                    <div
                      className="w-[44px] h-[44px] rounded-full flex items-center justify-center text-[20px] font-bold text-white shrink-0"
                      style={{ backgroundColor: p.color }}
                    >
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-text-primary text-[18px] font-semibold truncate">
                      {p.name}
                    </span>
                    {selected && (
                      <span className="ml-auto text-[20px] text-accent-green shrink-0">
                        &#x2713;
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Start button */}
        <Button
          size="lg"
          fullWidth
          onClick={startGame}
          disabled={selectedPlayerIds.size < 1}
        >
          Start Game
        </Button>

        {/* Log Game Result button */}
        <Button
          variant="secondary"
          size="md"
          fullWidth
          onClick={() => {
            setLogGameWinner(null);
            setLogGameMpr({});
            setLogGameActiveMpr(null);
            setLogGameType(selectedGameType === 'x01' ? (x01Variant === 301 ? '301' : '501') : 'cricket');
            setLogGameModalOpen(true);
          }}
          disabled={selectedPlayerIds.size < 1}
        >
          Log Game Result
        </Button>

        {/* Secondary actions row */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="secondary"
            size="md"
            fullWidth
            onClick={() => setView('library')}
          >
            Try Something New
          </Button>
          <Button
            variant="secondary"
            size="md"
            fullWidth
            onClick={() => setView('stats')}
          >
            Career Stats
          </Button>
        </div>

        {/* Recent games */}
        {recentGames.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[16px] font-semibold text-text-secondary">Recent Games</h3>
              <button
                onClick={toggleAdmin}
                className={[
                  'px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all',
                  adminMode
                    ? 'bg-accent-red/20 text-accent-red border border-accent-red/40'
                    : 'bg-surface-700 text-text-muted hover:bg-surface-600',
                ].join(' ')}
              >
                {adminMode ? 'Admin ON' : 'Admin'}
              </button>
            </div>
            <div className="space-y-2">
              {recentGames.map(g => {
                const winner = g.winner_name ?? (g.winner_id ? `Player ${g.winner_id}` : null);
                const time = g.started_at
                  ? new Date(g.started_at + 'Z').toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                  : '';
                return (
                  <Card key={g.id} padding="md">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-text-primary text-[18px] font-semibold">
                          {g.game_type}
                        </div>
                        <div className="text-text-muted text-[14px]">{time}</div>
                      </div>
                      {winner && (
                        <div className="text-accent-amber text-[16px] font-semibold">
                          {winner} won
                        </div>
                      )}
                      {!winner && g.ended_at && (
                        <div className="text-text-muted text-[14px]">No winner</div>
                      )}
                      {!g.ended_at && (
                        <button
                          onClick={async () => {
                            try {
                              const game = await api.get<DartGameRecord>(`/darts/games/${g.id}`);
                              if (game && !game.ended_at) {
                                const pids = game.players?.map(gp => gp.player_id) ?? [];
                                initGameState(game, pids);
                              }
                            } catch { /* noop */ }
                          }}
                          className="text-accent-green text-[14px] font-semibold px-3 py-1 rounded-lg bg-accent-green/10 hover:bg-accent-green/20 active:scale-95 transition-all"
                        >
                          Resume
                        </button>
                      )}
                    </div>
                    {/* Admin: edit/delete buttons */}
                    {adminMode && g.ended_at && (
                      <div className="flex gap-2 mt-2 pt-2 border-t border-surface-600">
                        <button
                          onClick={() => {
                            setEditGame(g);
                            setEditWinner(g.winner_id ?? null);
                            setEditMpr({});
                          }}
                          className="flex-1 text-[13px] font-semibold text-accent-blue bg-accent-blue/10 rounded-lg py-1.5 hover:bg-accent-blue/20 active:scale-95 transition-all"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(g)}
                          className="flex-1 text-[13px] font-semibold text-accent-red bg-accent-red/10 rounded-lg py-1.5 hover:bg-accent-red/20 active:scale-95 transition-all"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* Log Game Modal */}
      <Modal
        open={logGameModalOpen}
        onClose={() => setLogGameModalOpen(false)}
        title="Log Game Result"
        size="md"
      >
        <div className="space-y-4">
          {/* Game type quick pick */}
          <div className="flex gap-2">
            {(['501', '301', 'cricket'] as const).map(t => (
              <button
                key={t}
                onClick={() => setLogGameType(t)}
                className={[
                  'flex-1 py-2 rounded-xl text-[16px] font-bold transition-all duration-150',
                  logGameType === t
                    ? 'bg-accent-blue text-white'
                    : 'bg-surface-700 text-text-secondary hover:text-text-primary',
                ].join(' ')}
              >
                {t === 'cricket' ? 'Cricket' : t}
              </button>
            ))}
          </div>

          {/* Winner selection */}
          <div>
            <p className="text-text-secondary text-[14px] font-medium mb-2">Who won?</p>
            <div className="grid grid-cols-2 gap-3">
              {crewPlayers.filter(p => selectedPlayerIds.has(p.id)).map(p => (
                <button
                  key={p.id}
                  onClick={() => setLogGameWinner(logGameWinner === p.id ? null : p.id)}
                  className={[
                    'flex items-center gap-2 p-3 rounded-xl transition-all duration-150 active:scale-[0.97] min-h-[52px]',
                    logGameWinner === p.id
                      ? 'bg-accent-amber/20 border-2 border-accent-amber'
                      : 'bg-surface-700 border-2 border-transparent hover:border-surface-500',
                  ].join(' ')}
                >
                  <div
                    className="w-[32px] h-[32px] rounded-full flex items-center justify-center text-[14px] font-bold text-white shrink-0"
                    style={{ backgroundColor: p.color }}
                  >
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-text-primary text-[16px] font-semibold truncate">
                    {p.name}
                  </span>
                  {logGameWinner === p.id && (
                    <span className="ml-auto text-accent-amber text-[18px]">&#x2713;</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* MPR per player with NumPad */}
          <div className="border-t border-surface-600 pt-3">
            <p className="text-text-secondary text-[14px] font-medium mb-2">
              MPR / PPR (optional)
            </p>
            <div className="space-y-2">
              {crewPlayers.filter(p => selectedPlayerIds.has(p.id)).map(p => (
                <div key={p.id}>
                  <button
                    type="button"
                    onClick={() => setLogGameActiveMpr(logGameActiveMpr === p.id ? null : p.id)}
                    className={[
                      'flex items-center gap-2 w-full p-2 rounded-xl transition-all duration-150',
                      logGameActiveMpr === p.id ? 'bg-surface-600 border-2 border-accent-blue/50' : 'bg-surface-700 border-2 border-transparent',
                    ].join(' ')}
                  >
                    <div
                      className="w-[24px] h-[24px] rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                      style={{ backgroundColor: p.color }}
                    >
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-text-secondary text-[14px] truncate flex-1 text-left">{p.name}</span>
                    <span className="text-text-primary text-[18px] font-bold font-mono min-w-[50px] text-right">
                      {logGameMpr[p.id] || '--'}
                    </span>
                  </button>
                  {logGameActiveMpr === p.id && (
                    <div className="flex justify-center mt-2">
                      <NumPad
                        value={logGameMpr[p.id] ?? ''}
                        onChange={v => setLogGameMpr(prev => ({ ...prev, [p.id]: v }))}
                        allowDecimal
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Save button */}
          <Button
            size="lg"
            fullWidth
            onClick={logQuickGame}
            disabled={!logGameWinner || logGameSaving}
          >
            {logGameSaving ? 'Saving...' : 'Save Game'}
          </Button>
        </div>
      </Modal>

      {/* Admin PIN Modal */}
      <Modal open={showPinModal} onClose={() => { setShowPinModal(false); setPinInput(''); }} title="Admin PIN" size="sm">
        <div className="space-y-5">
          <p className="text-text-secondary text-[16px] text-center">Enter PIN to unlock admin mode</p>
          {pinError && <p className="text-accent-red text-[14px] text-center">Wrong PIN. Try again.</p>}
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            value={pinInput}
            onChange={e => { setPinInput(e.target.value.replace(/\D/g, '')); setPinError(false); }}
            placeholder="Enter PIN..."
            autoFocus
            className={[
              'w-full h-[56px] px-4 text-[24px] text-center tracking-[0.5em] bg-surface-700 text-text-primary rounded-xl border focus:outline-none placeholder:text-text-muted placeholder:tracking-normal placeholder:text-[16px]',
              pinError ? 'border-accent-red' : 'border-surface-500 focus:border-accent-blue',
            ].join(' ')}
            onKeyDown={e => { if (e.key === 'Enter') verifyPin(); }}
          />
          <Button size="lg" fullWidth onClick={verifyPin} disabled={!pinInput}>Unlock</Button>
        </div>
      </Modal>

      {/* Edit Game Modal */}
      <Modal open={!!editGame} onClose={() => setEditGame(null)} title="Edit Game" size="sm">
        {editGame && (
          <div className="space-y-5">
            <div className="text-text-secondary text-center text-[14px]">
              {editGame.game_type} — {editGame.started_at ? new Date(editGame.started_at + 'Z').toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
            </div>

            {/* Winner selector */}
            <div>
              <label className="block text-text-secondary text-[14px] font-semibold mb-2">Winner</label>
              <div className="grid grid-cols-2 gap-2">
                {(editGame.players || []).map(gp => {
                  const p = players.find(pl => pl.id === gp.player_id);
                  if (!p) return null;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setEditWinner(editWinner === p.id ? null : p.id)}
                      className={[
                        'flex items-center gap-2 p-3 rounded-xl transition-all active:scale-95',
                        editWinner === p.id
                          ? 'bg-accent-amber/20 border-2 border-accent-amber'
                          : 'bg-surface-700 border-2 border-transparent',
                      ].join(' ')}
                    >
                      <div className="w-8 h-8 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                      <span className="text-text-primary text-[14px] font-semibold truncate">{p.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* MPR inputs */}
            <div>
              <label className="block text-text-secondary text-[14px] font-semibold mb-2">MPR / PPR (optional)</label>
              <div className="space-y-2">
                {(editGame.players || []).map(gp => {
                  const p = players.find(pl => pl.id === gp.player_id);
                  if (!p) return null;
                  return (
                    <div key={p.id} className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                      <span className="text-text-secondary text-[14px] flex-1">{p.name}</span>
                      <input
                        type="number"
                        step="0.01"
                        value={editMpr[p.id] ?? ''}
                        onChange={e => setEditMpr(prev => ({ ...prev, [p.id]: e.target.value }))}
                        className="w-[80px] h-[36px] bg-surface-700 border border-surface-500 rounded-lg px-2 text-text-primary text-[16px] text-center"
                        placeholder="--"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <Button size="lg" fullWidth onClick={saveEditGame}>Save Changes</Button>
          </div>
        )}
      </Modal>

      {/* Delete Game Confirm Modal */}
      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Game" size="sm">
        {deleteConfirm && (
          <div className="space-y-5">
            <p className="text-text-secondary text-[16px] text-center">
              Delete this <strong className="text-text-primary">{deleteConfirm.game_type}</strong> game? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" fullWidth onClick={() => setDeleteConfirm(null)}>Cancel</Button>
              <Button variant="danger" fullWidth onClick={confirmDeleteGame}>Delete</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ================================================================== */
/*  Sub-components                                                     */
/* ================================================================== */

function StatBlock({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="bg-surface-700 rounded-xl p-3 text-center">
      <div
        className="text-[22px] font-bold"
        style={{ color: color ?? '#f0f0f5' }}
      >
        {value}
      </div>
      <div className="text-text-muted text-[12px]">{label}</div>
    </div>
  );
}

function GameLibraryCard({
  game,
  expanded,
  onToggle,
  onStart,
  playerCount,
  highlight,
}: {
  game: DartGame;
  expanded: boolean;
  onToggle: () => void;
  onStart: () => void;
  playerCount: number;
  highlight?: boolean;
}) {
  const canStart = playerCount >= game.minPlayers && playerCount <= game.maxPlayers;

  return (
    <div
      className={[
        'rounded-xl overflow-hidden transition-all duration-200',
        highlight ? 'border border-accent-amber/40' : 'border border-surface-600',
        expanded ? 'bg-surface-700' : 'bg-surface-800',
      ].join(' ')}
    >
      <button
        onClick={onToggle}
        className="w-full text-left p-4 flex items-center gap-3 active:scale-[0.99] transition-transform duration-100 min-h-[64px]"
      >
        <span className="text-text-muted text-[14px] font-mono shrink-0 w-[36px]">
          {game.code}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-text-primary text-[18px] font-semibold truncate">
              {game.name}
            </span>
            {highlight && (
              <span className="text-accent-amber text-[12px] font-bold bg-accent-amber/15 px-2 py-0.5 rounded-full shrink-0">
                PICK
              </span>
            )}
          </div>
          <p className="text-text-secondary text-[14px] truncate">{game.hook}</p>
        </div>
        <span className="text-text-muted text-[20px] shrink-0">
          {expanded ? '\u25B2' : '\u25BC'}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Instructions */}
          <ol className="space-y-1.5 pl-1">
            {game.instructions.map((step, i) => (
              <li key={i} className="flex gap-2 text-text-primary text-[15px]">
                <span className="text-accent-blue font-bold shrink-0">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          {/* Meta info */}
          <div className="flex flex-wrap gap-3 text-[13px] text-text-muted">
            <span>Players: {game.minPlayers}-{game.maxPlayers}</span>
            <span>|</span>
            <span>Board: {game.boardSetup}</span>
          </div>

          {/* Start button */}
          <Button
            size="md"
            fullWidth
            disabled={!canStart}
            onClick={e => {
              e.stopPropagation();
              onStart();
            }}
          >
            {canStart
              ? `Start ${game.name}`
              : `Need ${game.minPlayers}-${game.maxPlayers} players`}
          </Button>
        </div>
      )}
    </div>
  );
}
