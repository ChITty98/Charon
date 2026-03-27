import { type ReactNode, useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  getNowPlaying,
  play,
  pause,
  getPlaybackState,
  on,
  off,
  initMusicKit,
} from '../../lib/music';

/* ---- Inline SVG icons (simple, no library) ---- */

const icons = {
  home: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  ),
  players: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  ),
  darts: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
      <line x1="22" y1="2" x2="14.5" y2="9.5" />
      <line x1="18" y1="2" x2="22" y2="2" />
      <line x1="22" y1="2" x2="22" y2="6" />
    </svg>
  ),
  drinks: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2h8l-1 10H9L8 2z" />
      <path d="M12 12v6" />
      <path d="M8 22h8" />
      <path d="M7 2h10" />
    </svg>
  ),
  speaker: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 010 7.07" />
      <path d="M19.07 4.93a10 10 0 010 14.14" />
    </svg>
  ),
  gear: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1.08-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1.08 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001.08 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1.08z" />
    </svg>
  ),
};

/* ---- Now Playing mini icons ---- */

const miniPlayIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const miniPauseIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
  </svg>
);

const miniMusicNote = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

interface NavItem {
  to: string;
  icon: ReactNode;
  label: string;
}

const navItems: NavItem[] = [
  { to: '/', icon: icons.home, label: 'Home' },
  { to: '/players', icon: icons.players, label: 'Players' },
  { to: '/games', icon: icons.darts, label: 'Activities' },
  { to: '/drinks', icon: icons.drinks, label: 'Drinks' },
  { to: '/music', icon: icons.speaker, label: 'Music' },
  { to: '/settings', icon: icons.gear, label: 'Settings' },
];


/* ---- Now Playing Bar ---- */

function NowPlayingBar() {
  const navigate = useNavigate();
  const [state, setState] = useState<'playing' | 'paused' | 'stopped' | 'loading'>(() => getPlaybackState());
  const [nowPlaying, setNowPlaying] = useState(() => getNowPlaying());

  useEffect(() => {
    const handlePlayback = () => {
      setState(getPlaybackState());
      setNowPlaying(getNowPlaying());
    };
    const handleNowPlaying = () => {
      setNowPlaying(getNowPlaying());
    };
    on('playbackChange', handlePlayback);
    on('nowPlayingChange', handleNowPlaying);
    return () => {
      off('playbackChange', handlePlayback);
      off('nowPlayingChange', handleNowPlaying);
    };
  }, []);

  // Poll progress while playing so artwork stays current
  useEffect(() => {
    if (state !== 'playing') return;
    const id = setInterval(() => setNowPlaying(getNowPlaying()), 1000);
    return () => clearInterval(id);
  }, [state]);

  const isVisible = state === 'playing' || state === 'paused' || state === 'loading';
  if (!isVisible || !nowPlaying) return null;

  const handlePlayPause = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (state === 'playing') {
      await pause();
    } else {
      await play();
    }
  };

  return (
    <div className="shrink-0 h-[40px] bg-gray-800/90 backdrop-blur flex items-center px-3 gap-2 border-t border-white/5">
      {/* Tappable song info area -> navigate to /music */}
      <button
        onClick={() => navigate('/music')}
        className="flex items-center gap-2 flex-1 min-w-0"
      >
        {/* Album art or fallback */}
        {nowPlaying.artworkUrl ? (
          <img
            src={nowPlaying.artworkUrl}
            alt=""
            className="w-[32px] h-[32px] rounded shrink-0 object-cover"
          />
        ) : (
          <div className="w-[32px] h-[32px] rounded bg-surface-600 flex items-center justify-center text-text-muted shrink-0">
            {miniMusicNote}
          </div>
        )}

        {/* Title & Artist */}
        <div className="flex-1 min-w-0 text-left">
          <p className="text-white text-[13px] font-medium truncate leading-tight">
            {nowPlaying.title}
          </p>
          <p className="text-gray-400 text-[11px] truncate leading-tight">
            {nowPlaying.artist}
          </p>
        </div>
      </button>

      {/* Play / Pause */}
      <button
        onClick={handlePlayPause}
        className="w-[32px] h-[32px] rounded-full flex items-center justify-center text-white hover:bg-white/10 transition-colors active:scale-90 shrink-0"
      >
        {state === 'playing' ? miniPauseIcon : miniPlayIcon}
      </button>
    </div>
  );
}


/* ---- Shell ---- */

export function Shell({ children }: { children?: ReactNode }) {
  // Initialize MusicKit on app load so scenes can play music immediately
  useEffect(() => {
    initMusicKit().then(ok => {
      if (ok) console.log('[Shell] MusicKit initialized on startup');
    });
  }, []);

  return (
    <div className="h-full flex flex-col bg-surface-900">

      {/* Main content */}
      <main className="flex-1 min-h-0 scroll-area">
        {children ?? <Outlet />}
      </main>

      {/* Now Playing bar — shown when music is playing */}
      <NowPlayingBar />

      {/* Bottom navigation */}
      <nav className="shrink-0 bg-surface-800 border-t border-surface-700 flex">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              [
                'flex-1 flex flex-col items-center justify-center gap-1 h-[70px] transition-colors duration-150 relative',
                isActive
                  ? 'text-accent-blue'
                  : 'text-text-muted hover:text-text-secondary',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-[3px] bg-accent-blue rounded-b-full" />
                )}
                {item.icon}
                <span className="text-[12px] font-medium">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
