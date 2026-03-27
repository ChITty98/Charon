import { useState } from 'react';
import { api } from '../lib/api';
import { useSocket } from '../lib/socket';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

interface CardData {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  rank: string;
  value: number;
  faceDown?: boolean;
}

interface PlayerState {
  cards: CardData[];
  value: number;
  soft: boolean;
  bust: boolean;
  blackjack: boolean;
  doubled: boolean;
  stood: boolean;
  canSplit: boolean;
}

type PhonePhase = 'lobby' | 'playing' | 'waiting' | 'results';
type Outcome = 'win' | 'lose' | 'push' | 'blackjack' | null;

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

function PhoneCard({ card }: { card: CardData }) {
  return (
    <div className="w-[80px] h-[112px] rounded-lg bg-white flex flex-col items-center justify-between p-2 border border-surface-500 shadow-lg shrink-0">
      <div className="self-start text-[16px] font-bold leading-none" style={{ color: SUIT_COLORS[card.suit] }}>
        {card.rank}
      </div>
      <div className="text-[32px] leading-none" style={{ color: SUIT_COLORS[card.suit] }}>
        {SUIT_SYMBOLS[card.suit]}
      </div>
      <div className="self-end text-[16px] font-bold leading-none rotate-180" style={{ color: SUIT_COLORS[card.suit] }}>
        {card.rank}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */

export function BlackjackPhone() {
  const [phase, setPhase] = useState<PhonePhase>('lobby');
  const [hand, setHand] = useState<PlayerState>({
    cards: [],
    value: 0,
    soft: false,
    bust: false,
    blackjack: false,
    doubled: false,
    stood: false,
    canSplit: false,
  });
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [processing, setProcessing] = useState(false);

  /* ---- Socket events ---- */

  useSocket<any>('blackjack:deal', (data) => {
    if (data.myHand) {
      setHand(data.myHand);
      setPhase('playing');
      setOutcome(null);
      setIsMyTurn(data.isMyTurn ?? false);
    }
  });

  useSocket<any>('blackjack:update', (data) => {
    if (data.myHand) {
      setHand(data.myHand);
      setIsMyTurn(data.isMyTurn ?? false);
    }
    if (data.phase === 'results') {
      setPhase('results');
      setOutcome(data.myOutcome ?? null);
    } else if (data.phase === 'dealerTurn') {
      setPhase('waiting');
    }
  });

  /* ---- Player actions ---- */

  const doAction = async (action: string) => {
    if (processing) return;
    setProcessing(true);
    try {
      const data = await api.post<any>(`/blackjack/${action}`);
      if (data.myHand) {
        setHand(data.myHand);
        setIsMyTurn(data.isMyTurn ?? false);
      }
      if (data.phase === 'results') {
        setPhase('results');
        setOutcome(data.myOutcome ?? null);
      }
    } catch {
      // noop
    } finally {
      setProcessing(false);
    }
  };

  const joinGame = async () => {
    try {
      // Check if a game is running
      const state = await api.get<any>('/blackjack/state');
      if (state) setPhase('waiting');
    } catch {
      // noop
    }
  };

  /* ---- Outcome display ---- */

  const outcomeDisplay = () => {
    switch (outcome) {
      case 'blackjack': return { text: 'BLACKJACK!', color: '#f59e0b', sub: 'Pays 3:2' };
      case 'win': return { text: 'YOU WIN!', color: '#22c55e', sub: '' };
      case 'lose': return { text: 'YOU LOSE', color: '#ef4444', sub: '' };
      case 'push': return { text: 'PUSH', color: '#8888aa', sub: 'Bet returned' };
      default: return { text: '', color: '', sub: '' };
    }
  };

  /* ---- Render ---- */

  // Lobby — join game
  if (phase === 'lobby') {
    return (
      <div
        className="fixed inset-0 bg-surface-900 flex flex-col items-center justify-center p-8"
        style={{ touchAction: 'manipulation' }}
      >
        <div className="text-[32px] font-black text-text-primary mb-2">Blackjack</div>
        <div className="text-text-secondary text-[18px] mb-8 text-center">
          Join the table from your phone
        </div>
        <button
          onClick={joinGame}
          className="w-full max-w-sm h-[80px] rounded-2xl bg-accent-green text-white text-[24px] font-bold active:scale-95 transition-transform"
        >
          Join Table
        </button>
      </div>
    );
  }

  // Waiting for deal
  if (phase === 'waiting' && hand.cards.length === 0) {
    return (
      <div
        className="fixed inset-0 bg-surface-900 flex flex-col items-center justify-center p-8"
        style={{ touchAction: 'manipulation' }}
      >
        <div className="text-[24px] font-bold text-text-primary mb-4">Waiting for Deal...</div>
        <div className="w-16 h-16 border-4 border-accent-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Results screen
  if (phase === 'results' && outcome) {
    const display = outcomeDisplay();
    return (
      <div
        className="fixed inset-0 bg-surface-900 flex flex-col items-center justify-center p-8"
        style={{ touchAction: 'manipulation' }}
      >
        {/* Cards */}
        <div className="flex gap-2 mb-6 overflow-x-auto justify-center">
          {hand.cards.map((card, i) => (
            <PhoneCard key={i} card={card} />
          ))}
        </div>

        {/* Value */}
        <div className="text-text-primary text-[28px] font-bold mb-4">{hand.value}</div>

        {/* Outcome */}
        <div
          className="text-[48px] font-black mb-2"
          style={{ color: display.color }}
        >
          {display.text}
        </div>
        {display.sub && (
          <div className="text-text-secondary text-[18px] mb-6">{display.sub}</div>
        )}

        {/* Celebration animation for blackjack */}
        {outcome === 'blackjack' && (
          <div className="text-[64px] animate-bounce">
            {'\u2728'}
          </div>
        )}

        <button
          onClick={() => {
            setPhase('waiting');
            setHand({ cards: [], value: 0, soft: false, bust: false, blackjack: false, doubled: false, stood: false, canSplit: false });
            setOutcome(null);
          }}
          className="mt-8 w-full max-w-sm h-[70px] rounded-2xl bg-surface-700 text-text-primary text-[20px] font-bold active:scale-95 transition-transform"
        >
          Ready for Next Hand
        </button>
      </div>
    );
  }

  // Playing — show hand and action buttons
  const canAct = isMyTurn && !hand.bust && !hand.blackjack && !hand.stood && phase === 'playing';

  return (
    <div
      className="fixed inset-0 bg-surface-900 flex flex-col"
      style={{ touchAction: 'manipulation' }}
    >
      {/* Hand display */}
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        {/* Cards */}
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {hand.cards.map((card, i) => (
            <PhoneCard key={i} card={card} />
          ))}
        </div>

        {/* Hand value — BIG */}
        <div className="text-[72px] font-black text-text-primary leading-none">
          {hand.value}
          {hand.soft && hand.value <= 21 && (
            <span className="text-[24px] text-text-muted ml-2">soft</span>
          )}
        </div>

        {hand.bust && (
          <div className="text-[32px] font-black text-accent-red mt-2">BUST!</div>
        )}
        {hand.blackjack && (
          <div className="text-[32px] font-black text-accent-amber mt-2">BLACKJACK!</div>
        )}
        {!isMyTurn && !hand.bust && !hand.blackjack && phase === 'playing' && (
          <div className="text-text-muted text-[18px] mt-4">Waiting for your turn...</div>
        )}
        {phase === 'waiting' && (
          <div className="text-text-muted text-[18px] mt-4">Dealer is playing...</div>
        )}
      </div>

      {/* Action buttons — MASSIVE touch targets */}
      {canAct && (
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {/* HIT */}
            <button
              onClick={() => doAction('hit')}
              disabled={processing}
              className="h-[80px] rounded-2xl bg-accent-green text-white text-[24px] font-black active:scale-95 transition-transform disabled:opacity-50"
            >
              HIT
            </button>

            {/* STAND */}
            <button
              onClick={() => doAction('stand')}
              disabled={processing}
              className="h-[80px] rounded-2xl bg-accent-blue text-white text-[24px] font-black active:scale-95 transition-transform disabled:opacity-50"
            >
              STAND
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* DOUBLE */}
            <button
              onClick={() => doAction('double')}
              disabled={processing || hand.cards.length !== 2}
              className="h-[70px] rounded-2xl bg-accent-amber text-white text-[22px] font-bold active:scale-95 transition-transform disabled:opacity-30"
            >
              DOUBLE
            </button>

            {/* SPLIT — not implemented on server */}
          </div>
        </div>
      )}
    </div>
  );
}
