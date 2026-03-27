import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useSocket } from '../lib/socket';
import { Button } from '../components/ui/Button';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

interface CardData {
  suit: string;
  rank: string;
  value?: number;
  faceDown?: boolean;
}

interface Player {
  id: number;
  name: string;
  color: string;
}

interface BJPlayer {
  id: number;
  cards: CardData[];
  value: number;
  status: 'playing' | 'stood' | 'busted';
  result: string | null;
}

interface DealResponse {
  dealer: { cards: CardData[]; value: number };
  players: BJPlayer[];
  phase: string;
}

interface ActionResponse {
  playerId: number;
  card?: CardData;
  playerValue: number;
  playerStatus: string;
  phase: string;
  doubleDown?: boolean;
  dealer?: { cards: CardData[]; value: number };
  results?: BJPlayer[];
}

/* ================================================================== */
/*  Card rendering                                                     */
/* ================================================================== */

const SUIT_SYMBOLS: Record<string, string> = {
  hearts: '\u2665',
  diamonds: '\u2666',
  clubs: '\u2663',
  spades: '\u2660',
};

const SUIT_COLORS: Record<string, string> = {
  hearts: '#ef4444',
  diamonds: '#ef4444',
  clubs: '#f0f0f5',
  spades: '#f0f0f5',
};

function PlayingCard({ card, index, animate }: { card: CardData; index: number; animate?: boolean }) {
  if (card.faceDown || card.suit === 'hidden') {
    return (
      <div
        className="w-[72px] h-[100px] rounded-lg bg-accent-blue flex items-center justify-center border-2 border-accent-blue/50 shadow-lg"
        style={{
          transform: `translateX(${index * -20}px)`,
          animation: animate ? 'deal-in 0.3s ease-out forwards' : undefined,
        }}
      >
        <div className="w-[56px] h-[84px] rounded border border-white/20 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(255,255,255,0.1)_4px,rgba(255,255,255,0.1)_8px)]" />
      </div>
    );
  }

  return (
    <div
      className="w-[72px] h-[100px] rounded-lg bg-white flex flex-col items-center justify-between p-1.5 border border-surface-500 shadow-lg"
      style={{
        transform: `translateX(${index * -20}px)`,
        animation: animate ? 'deal-in 0.3s ease-out forwards' : undefined,
      }}
    >
      <div className="self-start text-[14px] font-bold leading-none" style={{ color: SUIT_COLORS[card.suit] || '#888' }}>
        {card.rank}
      </div>
      <div className="text-[28px] leading-none" style={{ color: SUIT_COLORS[card.suit] || '#888' }}>
        {SUIT_SYMBOLS[card.suit] || '?'}
      </div>
      <div className="self-end text-[14px] font-bold leading-none rotate-180" style={{ color: SUIT_COLORS[card.suit] || '#888' }}>
        {card.rank}
      </div>
    </div>
  );
}

function HandDisplay({ cards, animate }: { cards: CardData[]; animate?: boolean }) {
  return (
    <div className="flex items-center justify-center" style={{ paddingRight: `${Math.max(0, (cards.length - 1) * 20)}px` }}>
      {cards.map((card, i) => (
        <PlayingCard key={i} card={card} index={i} animate={animate && i === cards.length - 1} />
      ))}
    </div>
  );
}

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */

export function Blackjack() {
  const [sessionPlayers, setSessionPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  // Game state
  const [gamePhase, setGamePhase] = useState<'idle' | 'playing' | 'results'>('idle');
  const [dealerHand, setDealerHand] = useState<{ cards: CardData[]; value: number }>({ cards: [], value: 0 });
  const [playerHands, setPlayerHands] = useState<BJPlayer[]>([]);
  const [activePlayerIdx, setActivePlayerIdx] = useState(0);
  const [message, setMessage] = useState('');
  const [_showStats, _setShowStats] = useState(false); void _showStats; void _setShowStats;

  /* ---- Load session players ---- */
  useEffect(() => {
    (async () => {
      try {
        const sp = await api.get<Player[]>('/sessions/current/players');
        setSessionPlayers(sp.map((p: any) => ({ id: p.player_id ?? p.id, name: p.name, color: p.color })));
      } catch {
        // No session
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ---- Socket events ---- */
  useSocket('blackjack:update', (data: any) => {
    if (data.dealer) setDealerHand(data.dealer);
    if (data.results) {
      setPlayerHands(data.results);
      setGamePhase('results');
    } else if (data.playerId) {
      // Update specific player
      setPlayerHands(prev => prev.map(p =>
        p.id == data.playerId
          ? { ...p, cards: data.card ? [...p.cards, data.card] : p.cards, value: data.playerValue, status: data.playerStatus }
          : p
      ));
      // Advance active player if current one is done
      if (data.playerStatus !== 'playing') {
        advanceActivePlayer();
      }
    }
    if (data.phase) {
      if (data.phase === 'done' || data.phase === 'results' || data.phase === 'complete') setGamePhase('results');
    }
  });

  useSocket('blackjack:deal', (data: DealResponse) => {
    setDealerHand(data.dealer);
    setPlayerHands(data.players);
    setGamePhase('playing');
    setActivePlayerIdx(0);
    setMessage('');
  });

  /* ---- Find next active player ---- */
  const advanceActivePlayer = () => {
    setActivePlayerIdx(prev => prev + 1);
  };

  /* ---- Deal: start game + deal cards ---- */
  const handleDeal = async () => {
    if (sessionPlayers.length === 0) {
      setMessage('No players in session. Add players first!');
      return;
    }

    try {
      // Start game with session player IDs
      await api.post('/blackjack/start', {
        playerIds: sessionPlayers.map(p => p.id),
      });

      // Deal cards
      const dealRes = await api.post<DealResponse>('/blackjack/deal');
      setDealerHand(dealRes.dealer);
      setPlayerHands(dealRes.players);
      setGamePhase('playing');
      setActivePlayerIdx(0);
      setMessage('');
    } catch (err) {
      console.error('Deal failed:', err);
      setMessage('Failed to deal. Try again.');
    }
  };

  /* ---- Player actions ---- */
  const handleHit = async (playerId: number) => {
    try {
      const res = await api.post<ActionResponse>('/blackjack/hit', { playerId });
      // Update player hand
      setPlayerHands(prev => prev.map(p =>
        p.id == playerId
          ? { ...p, cards: res.card ? [...p.cards, res.card] : p.cards, value: res.playerValue, status: res.playerStatus as BJPlayer['status'] }
          : p
      ));

      if (res.dealer) setDealerHand(res.dealer);
      if (res.results) {
        setPlayerHands(res.results);
        setGamePhase('results');
      } else if (res.playerStatus !== 'playing') {
        setActivePlayerIdx(prev => prev + 1);
      }
    } catch (err) {
      console.error('Hit failed:', err);
    }
  };

  const handleStand = async (playerId: number) => {
    try {
      const res = await api.post<ActionResponse>('/blackjack/stand', { playerId });
      setPlayerHands(prev => prev.map(p =>
        p.id == playerId ? { ...p, status: 'stood' } : p
      ));

      if (res.dealer) setDealerHand(res.dealer);
      if (res.results) {
        setPlayerHands(res.results);
        setGamePhase('results');
      } else {
        setActivePlayerIdx(prev => prev + 1);
      }
    } catch (err) {
      console.error('Stand failed:', err);
    }
  };

  const handleDouble = async (playerId: number) => {
    try {
      const res = await api.post<ActionResponse>('/blackjack/double', { playerId });
      setPlayerHands(prev => prev.map(p =>
        p.id == playerId
          ? { ...p, cards: res.card ? [...p.cards, res.card] : p.cards, value: res.playerValue, status: res.playerStatus as BJPlayer['status'] }
          : p
      ));

      if (res.dealer) setDealerHand(res.dealer);
      if (res.results) {
        setPlayerHands(res.results);
        setGamePhase('results');
      } else {
        setActivePlayerIdx(prev => prev + 1);
      }
    } catch (err) {
      console.error('Double failed:', err);
    }
  };

  /* ---- New round ---- */
  const handleNewRound = async () => {
    try {
      await api.post('/blackjack/new-round');
      // Deal again
      const dealRes = await api.post<DealResponse>('/blackjack/deal');
      setDealerHand(dealRes.dealer);
      setPlayerHands(dealRes.players);
      setGamePhase('playing');
      setActivePlayerIdx(0);
      setMessage('');
    } catch (err) {
      console.error('New round failed:', err);
    }
  };

  /* ---- Result text ---- */
  const resultText = (result: string | null) => {
    switch (result) {
      case 'win': return { label: 'WIN', color: '#22c55e' };
      case 'loss':
      case 'lose': return { label: 'LOSE', color: '#ef4444' };
      case 'bust': return { label: 'BUST', color: '#ef4444' };
      case 'push': return { label: 'PUSH', color: '#8888aa' };
      case 'blackjack': return { label: 'BLACKJACK!', color: '#f59e0b' };
      default: return { label: '', color: '#8888aa' };
    }
  };

  /* ---- Render ---- */

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-text-secondary text-[20px] animate-pulse">Loading...</div>
      </div>
    );
  }

  const getPlayerInfo = (id: number) => sessionPlayers.find(p => p.id === id);

  return (
    <div className="p-5 pb-8 animate-fade-in max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-[28px] font-black text-text-primary">Blackjack</h1>
          <p className="text-text-muted text-[14px]">Dealer hits on soft 17</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Dealer area */}
        <section className="text-center">
          <div className="text-text-secondary text-[14px] font-medium mb-2">DEALER</div>
          {dealerHand.cards.length > 0 ? (
            <>
              <HandDisplay cards={dealerHand.cards} animate />
              <div className="mt-2 text-[20px] font-bold text-text-primary">
                {dealerHand.cards.some(c => c.suit === 'hidden') ? '?' : dealerHand.value}
                {dealerHand.value > 21 && !dealerHand.cards.some(c => c.suit === 'hidden') && (
                  <span className="text-accent-red ml-2">BUST</span>
                )}
              </div>
            </>
          ) : (
            <div className="h-[100px] flex items-center justify-center">
              <div className="text-text-muted text-[16px]">Waiting for deal...</div>
            </div>
          )}
        </section>

        {/* Divider */}
        <div className="border-t border-surface-600" />

        {/* Player hands */}
        {playerHands.length > 0 ? (
          <div className="space-y-6">
            {playerHands.map((player, pIdx) => {
              const info = getPlayerInfo(player.id);
              const isActive = gamePhase === 'playing' && pIdx === activePlayerIdx && player.status === 'playing';
              const playerName = info?.name || `Player ${player.id}`;
              const playerColor = info?.color || '#888';
              const result = resultText(player.result);

              return (
                <section key={player.id} className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <div
                      className="w-[28px] h-[28px] rounded-full flex items-center justify-center text-[14px] font-bold text-white"
                      style={{ backgroundColor: playerColor }}
                    >
                      {playerName.charAt(0).toUpperCase()}
                    </div>
                    <span
                      className="text-[16px] font-semibold"
                      style={{ color: isActive ? playerColor : '#8888aa' }}
                    >
                      {playerName}
                      {isActive && ' (playing)'}
                    </span>
                  </div>

                  <HandDisplay cards={player.cards} animate />

                  <div className="mt-2 text-[20px] font-bold text-text-primary">
                    {player.value}
                    {player.status === 'busted' && <span className="text-accent-red ml-2">BUST</span>}
                    {player.value === 21 && player.cards.length === 2 && (
                      <span className="text-accent-amber ml-2">BLACKJACK!</span>
                    )}
                    {player.status === 'stood' && <span className="text-text-muted ml-2">(stood)</span>}
                  </div>

                  {/* Result badge in results phase */}
                  {gamePhase === 'results' && player.result && (
                    <div className="mt-2 text-[24px] font-black" style={{ color: result.color }}>
                      {result.label}
                    </div>
                  )}

                  {/* Surface action buttons for active player */}
                  {isActive && (
                    <div className="flex gap-3 mt-4 justify-center">
                      <button
                        onClick={() => handleHit(player.id)}
                        className="h-[60px] px-8 rounded-xl bg-accent-green text-white text-[20px] font-bold active:scale-95 transition-all"
                      >
                        HIT
                      </button>
                      <button
                        onClick={() => handleStand(player.id)}
                        className="h-[60px] px-8 rounded-xl bg-accent-red text-white text-[20px] font-bold active:scale-95 transition-all"
                      >
                        STAND
                      </button>
                      {player.cards.length === 2 && (
                        <button
                          onClick={() => handleDouble(player.id)}
                          className="h-[60px] px-8 rounded-xl bg-accent-purple text-white text-[20px] font-bold active:scale-95 transition-all"
                        >
                          DOUBLE
                        </button>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-6">
            <div className="text-text-muted text-[18px]">
              {sessionPlayers.length > 0
                ? `${sessionPlayers.length} players ready`
                : 'No players in session. Add players first!'}
            </div>
            {sessionPlayers.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-center mt-3">
                {sessionPlayers.map(p => (
                  <div key={p.id} className="flex items-center gap-1 px-3 py-1 rounded-lg bg-surface-700">
                    <span className="w-4 h-4 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="text-text-primary text-[14px]">{p.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Message */}
        {message && (
          <div className="text-center text-text-secondary text-[16px]">{message}</div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          {gamePhase === 'idle' && (
            <Button size="lg" fullWidth onClick={handleDeal}>
              Deal
            </Button>
          )}
          {gamePhase === 'results' && (
            <Button size="lg" fullWidth onClick={handleNewRound}>
              New Round
            </Button>
          )}
        </div>
      </div>

      {/* Card deal animation keyframes */}
      <style>{`
        @keyframes deal-in {
          from { opacity: 0; transform: translateY(-40px) rotate(-10deg); }
          to { opacity: 1; transform: translateY(0) rotate(0deg); }
        }
      `}</style>
    </div>
  );
}
