import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';

/* ---- Game tiles ---- */

interface GameTile {
  id: string;
  name: string;
  subtitle: string;
  icon: string;
  route: string;
  color: string;
  ready: boolean;
}

const games: GameTile[] = [
  {
    id: 'darts',
    name: 'Darts',
    subtitle: 'X01, Cricket & 48 more',
    icon: '🎯',
    route: '/darts',
    color: '#ef4444',
    ready: true,
  },
  {
    id: 'trivia',
    name: 'Trivia',
    subtitle: 'Phone buzzers, custom categories',
    icon: '🧠',
    route: '/trivia',
    color: '#8b5cf6',
    ready: true,
  },
  {
    id: 'catchphrase',
    name: 'Catch Phrase',
    subtitle: 'Word guessing, phone passing',
    icon: '💬',
    route: '/catchphrase',
    color: '#f97316',
    ready: true,
  },
  {
    id: 'blackjack',
    name: 'Blackjack',
    subtitle: 'Digital dealer, phone hands',
    icon: '🃏',
    route: '/blackjack',
    color: '#22c55e',
    ready: true,
  },
  {
    id: 'pool',
    name: 'Pool',
    subtitle: '8-ball tracking & stats',
    icon: '🎱',
    route: '/pool',
    color: '#3b82f6',
    ready: true,
  },
  {
    id: 'poker',
    name: 'Poker',
    subtitle: 'Tournament & cash games',
    icon: '♠️',
    route: '/poker',
    color: '#06b6d4',
    ready: true,
  },
  {
    id: 'dice',
    name: 'Dice Games',
    subtitle: 'Farkle, Yahtzee, Ship Captain',
    icon: '🎲',
    route: '/dice',
    color: '#ec4899',
    ready: true,
  },
  {
    id: 'cribbage',
    name: 'Cribbage',
    subtitle: 'Score tracker & hand calculator',
    icon: '🃏',
    route: '/cribbage',
    color: '#10b981',
    ready: true,
  },
  {
    id: 'dominoes',
    name: 'Dominoes',
    subtitle: 'Mexican Train & Block',
    icon: '🁣',
    route: '/dominoes',
    color: '#f59e0b',
    ready: true,
  },
  {
    id: 'dj',
    name: 'Game DJ',
    subtitle: 'Smart game rotation',
    icon: '🎵',
    route: '/dj',
    color: '#8b5cf6',
    ready: true,
  },
  {
    id: 'teams',
    name: 'Teams',
    subtitle: 'Team formation & records',
    icon: '👥',
    route: '/teams',
    color: '#3b82f6',
    ready: true,
  },
  {
    id: 'scenes',
    name: 'Scenes',
    subtitle: 'Lighting & ambiance presets',
    icon: '🎬',
    route: '/scenes',
    color: '#6366f1',
    ready: true,
  },
];

/* ---- Component ---- */

export function Games() {
  const navigate = useNavigate();

  return (
    <div className="p-5 pb-2 animate-fade-in">
      <h1 className="text-[28px] font-bold text-text-primary mb-5">Activities</h1>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {games.map((game) => (
          <Card
            key={game.id}
            onClick={game.ready ? () => navigate(game.route) : undefined}
            className={`relative overflow-hidden ${!game.ready ? 'opacity-40' : 'cursor-pointer'}`}
          >
            <div className="flex flex-col items-center text-center py-4 gap-3">
              <span className="text-[48px]">{game.icon}</span>
              <div>
                <h3 className="text-[20px] font-bold text-text-primary">
                  {game.name}
                </h3>
                <p className="text-[14px] text-text-muted mt-1">
                  {game.subtitle}
                </p>
              </div>
              {!game.ready && (
                <span className="text-[12px] text-text-muted bg-surface-600 px-3 py-1 rounded-full">
                  Coming Soon
                </span>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
