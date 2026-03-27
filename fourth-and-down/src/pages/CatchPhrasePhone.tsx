import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api';
import { socket, useSocket } from '../lib/socket';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

type PhonePhase = 'waiting' | 'describing' | 'roundEnd';

/* ================================================================== */
/*  Word banks (fallback if server unavailable)                        */
/* ================================================================== */

const FALLBACK_WORDS = [
  'Pizza', 'Basketball', 'Guitar', 'Dinosaur', 'Sunglasses',
  'Roller coaster', 'Fireworks', 'Skateboard', 'Penguin', 'Volcano',
  'Popcorn', 'Astronaut', 'Trampoline', 'Microphone', 'Snowboard',
  'Helicopter', 'Pineapple', 'Wrestling', 'Waterfall', 'Lightning',
  'Barbecue', 'Karate', 'Surfing', 'Campfire', 'Touchdown',
  'Elephant', 'Motorcycle', 'Tornado', 'Pirate', 'Bowling',
  'Chocolate', 'Marathon', 'Submarine', 'Juggling', 'Magician',
  'Taco', 'Skydiving', 'Lighthouse', 'Dodgeball', 'Blender',
  'Kangaroo', 'Spaghetti', 'Wrestling', 'Chainsaw', 'Avalanche',
  'Bubblegum', 'Hammock', 'Octopus', 'Jackhammer', 'Limousine',
];

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */

export function CatchPhrasePhone() {
  const [phase, setPhase] = useState<PhonePhase>('waiting');
  const [currentWord, setCurrentWord] = useState('');
  const [wordQueue, setWordQueue] = useState<string[]>([]);
  const [wordsGuessed, setWordsGuessed] = useState(0);
  const [wordsSkipped, setWordsSkipped] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const queueRef = useRef<string[]>([]);

  /* ---- Keep ref in sync ---- */
  useEffect(() => {
    queueRef.current = wordQueue;
  }, [wordQueue]);

  /* ---- Socket events ---- */

  useSocket<string>('catchphrase:phase', (newPhase) => {
    if (newPhase === 'playing') {
      setPhase('describing');
      loadWords();
    } else if (newPhase === 'roundEnd') {
      setPhase('roundEnd');
    }
  });

  /* ---- Load words ---- */

  const loadWords = useCallback(async () => {
    try {
      const data = await api.get<{ word: string }>('/catchphrase/word');
      if (data.word) {
        setWordQueue([data.word]);
        setCurrentWord(data.word);
        return;
      }
    } catch {
      // Fallback to local words
    }

    // Shuffle fallback words
    const shuffled = [...FALLBACK_WORDS].sort(() => Math.random() - 0.5);
    setWordQueue(shuffled);
    setCurrentWord(shuffled[0]);
  }, []);

  /* ---- Advance to next word ---- */

  const nextWord = useCallback((guessed: boolean) => {
    // Report result to surface display
    socket.emit('catchphrase:result', { word: currentWord, guessed });

    if (guessed) {
      setWordsGuessed(prev => prev + 1);
    } else {
      setWordsSkipped(prev => prev + 1);
    }

    // Advance queue
    const remaining = queueRef.current.slice(1);
    if (remaining.length === 0) {
      // Reload words
      const shuffled = [...FALLBACK_WORDS].sort(() => Math.random() - 0.5);
      setWordQueue(shuffled);
      setCurrentWord(shuffled[0]);
    } else {
      setWordQueue(remaining);
      setCurrentWord(remaining[0]);
    }

    // Broadcast new word to surface
    const next = remaining.length > 0 ? remaining[0] : FALLBACK_WORDS[0];
    socket.emit('catchphrase:word', { word: next });
  }, [currentWord]);

  /* ---- Touch handlers (tap = guessed, swipe down = skip) ---- */

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (phase !== 'describing') return;

    const touchEnd = e.changedTouches[0].clientY;
    const diff = touchEnd - (touchStart ?? 0);

    if (diff > 80) {
      // Swipe down = skip
      nextWord(false);
    } else {
      // Tap = guessed
      nextWord(true);
    }
    setTouchStart(null);
  };

  const handleClick = () => {
    if (phase !== 'describing') return;
    nextWord(true);
  };

  /* ---- Start describing (join game) ---- */

  const joinAsDescriber = () => {
    setPhase('describing');
    setWordsGuessed(0);
    setWordsSkipped(0);
    loadWords();
    socket.emit('catchphrase:phase', 'playing');
  };

  /* ---- Render ---- */

  // Waiting screen
  if (phase === 'waiting') {
    return (
      <div
        className="fixed inset-0 bg-surface-900 flex flex-col items-center justify-center p-8"
        style={{ touchAction: 'manipulation' }}
      >
        <div className="text-[28px] font-black text-text-primary mb-4 text-center">
          Catch Phrase
        </div>
        <div className="text-text-secondary text-[18px] mb-8 text-center">
          Ready to describe words?
        </div>
        <button
          onClick={joinAsDescriber}
          className="w-full max-w-sm h-[80px] rounded-2xl bg-accent-blue text-white text-[24px] font-bold active:scale-95 transition-transform"
        >
          I'm the Describer
        </button>
      </div>
    );
  }

  // Round end
  if (phase === 'roundEnd') {
    return (
      <div
        className="fixed inset-0 bg-surface-900 flex flex-col items-center justify-center p-8"
        style={{ touchAction: 'manipulation' }}
      >
        <div className="text-[36px] font-black text-accent-red mb-6">TIME'S UP!</div>
        <div className="flex gap-8 mb-8">
          <div className="text-center">
            <div className="text-[48px] font-black text-accent-green">{wordsGuessed}</div>
            <div className="text-text-muted text-[16px]">Guessed</div>
          </div>
          <div className="text-center">
            <div className="text-[48px] font-black text-accent-red">{wordsSkipped}</div>
            <div className="text-text-muted text-[16px]">Skipped</div>
          </div>
        </div>
        <button
          onClick={() => {
            setPhase('waiting');
            setWordsGuessed(0);
            setWordsSkipped(0);
          }}
          className="w-full max-w-sm h-[70px] rounded-2xl bg-surface-700 text-text-primary text-[20px] font-bold active:scale-95 transition-transform"
        >
          Done
        </button>
      </div>
    );
  }

  // Describing — full screen word display
  return (
    <div
      className="fixed inset-0 bg-surface-900 flex flex-col select-none"
      style={{ touchAction: 'manipulation' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={handleClick}
    >
      {/* Stats bar */}
      <div className="flex justify-between items-center px-6 py-4">
        <div className="flex gap-4">
          <span className="text-accent-green text-[18px] font-bold">{wordsGuessed} guessed</span>
          <span className="text-accent-red text-[18px] font-bold">{wordsSkipped} skipped</span>
        </div>
      </div>

      {/* Word display — massive, centered */}
      <div className="flex-1 flex items-center justify-center px-8">
        <div className="text-[56px] sm:text-[72px] font-black text-text-primary text-center leading-tight">
          {currentWord}
        </div>
      </div>

      {/* Instructions */}
      <div className="px-6 py-6 text-center">
        <div className="text-text-secondary text-[16px] mb-2">
          TAP anywhere = Guessed
        </div>
        <div className="text-text-muted text-[14px]">
          Swipe DOWN = Skip
        </div>
      </div>
    </div>
  );
}
