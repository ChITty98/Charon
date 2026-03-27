import { useState, useEffect } from 'react';

interface NewRecord {
  recordType: string;
  gameType: string;
  value: number;
  detail: string | null;
  previous: number | null;
}

interface PersonalRecordCelebrationProps {
  records: NewRecord[];
  playerColor?: string;
  onDismiss: () => void;
}

const RECORD_LABELS: Record<string, string> = {
  highest_ppr: 'Highest PPR',
  highest_mpr: 'Highest MPR',
  longest_win_streak: 'Longest Win Streak',
  most_bullseyes_game: 'Most Bullseyes (Game)',
  highest_score: 'Highest Score',
  best_correct_pct: 'Best Correct %',
  fastest_correct_answer: 'Fastest Answer',
  most_wins_session: 'Most Wins (Session)',
};

export function PersonalRecordCelebration({ records, playerColor = '#3B82F6', onDismiss }: PersonalRecordCelebrationProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300);
    }, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  if (records.length === 0) return null;

  return (
    <div
      className={[
        'fixed inset-0 z-[100] flex items-center justify-center transition-opacity duration-300',
        visible ? 'opacity-100' : 'opacity-0',
      ].join(' ')}
      onClick={() => {
        setVisible(false);
        setTimeout(onDismiss, 300);
      }}
      style={{ pointerEvents: 'auto' }}
    >
      {/* Dark backdrop with player color glow */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at center, ${playerColor}22 0%, rgba(0,0,0,0.85) 70%)`,
        }}
      />

      {/* Confetti particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `-5%`,
              backgroundColor: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'][i % 6],
              animation: `confetti-fall ${2 + Math.random() * 2}s linear ${Math.random() * 0.5}s infinite`,
              animationDelay: `${Math.random() * 1}s`,
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div className="relative text-center px-8" style={{ animation: 'record-scale-in 400ms ease-out' }}>
        {/* Trophy */}
        <div className="text-[64px] mb-4" style={{ animation: 'record-pulse 1.5s ease-in-out infinite' }}>
          {'\u{1F3C6}'}
        </div>

        {/* Title */}
        <h1
          className="text-[32px] font-black mb-6 uppercase tracking-wider"
          style={{
            color: '#FFD700',
            textShadow: '0 0 20px rgba(255, 215, 0, 0.5)',
            animation: 'record-pulse 1.5s ease-in-out infinite',
          }}
        >
          New Personal Record!
        </h1>

        {/* Records list */}
        <div className="space-y-3">
          {records.map((record, i) => (
            <div
              key={i}
              className="bg-surface-800/80 border border-yellow-500/30 rounded-xl px-6 py-4"
              style={{ animation: `record-slide-up 400ms ease-out ${i * 150}ms both` }}
            >
              <div className="text-accent-amber text-[14px] font-semibold uppercase tracking-wider mb-1">
                {RECORD_LABELS[record.recordType] || record.recordType.replace(/_/g, ' ')}
              </div>
              <div className="text-text-primary text-[24px] font-bold">
                {record.detail || record.value}
              </div>
              {record.previous !== null && (
                <div className="text-text-muted text-[13px] mt-1">
                  Previous: {record.previous}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Inline styles for animations */}
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
        @keyframes record-scale-in {
          0% { transform: scale(0.5); opacity: 0; }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes record-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes record-slide-up {
          0% { transform: translateY(20px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
