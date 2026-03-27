import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import {
  initMusicKit,
  isAuthorized,
  authorize,
  play,
  pause,
  skipToNext,
  skipToPrevious,
  getNowPlaying,
  getPlaybackState,
  getQueueLength,
  onPlaybackChange,
  onNowPlayingChange,
  on,
  off,
} from '../lib/music';
import { MusicSearch } from './MusicSearch';

/* ---- Icons ---- */

const playIcon = (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const pauseIcon = (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
  </svg>
);

const skipNextIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
  </svg>
);

const skipPrevIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
  </svg>
);

const searchIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
);

const musicNoteIcon = (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

const queueIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function MusicWidget() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [state, setState] = useState<'playing' | 'paused' | 'stopped' | 'loading'>('stopped');
  const [nowPlaying, setNowPlaying] = useState<ReturnType<typeof getNowPlaying>>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize MusicKit on mount
  useEffect(() => {
    initMusicKit().then((ok) => {
      setReady(ok);
      if (ok) setAuthorized(isAuthorized());
    });
  }, []);

  // Listen for playback and now-playing changes
  useEffect(() => {
    if (!ready) return;
    const unsub1 = onPlaybackChange((s) => {
      setState(s as any);
      setNowPlaying(getNowPlaying());
    });
    const unsub2 = onNowPlayingChange(() => {
      setNowPlaying(getNowPlaying());
    });
    // Listen for queue changes
    const updateQueue = () => setQueueCount(getQueueLength());
    on('queueChange', updateQueue);
    updateQueue();
    return () => {
      unsub1();
      unsub2();
      off('queueChange', updateQueue);
    };
  }, [ready]);

  // Poll progress while playing
  useEffect(() => {
    if (state === 'playing') {
      pollRef.current = setInterval(() => {
        setNowPlaying(getNowPlaying());
      }, 1000);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [state]);

  const handleAuth = async () => {
    const ok = await authorize();
    setAuthorized(ok);
  };

  const handlePlayPause = async () => {
    if (state === 'playing') {
      await pause();
    } else {
      await play();
    }
  };

  // Not ready — show nothing or a subtle placeholder
  if (!ready) {
    return (
      <Card className="mb-8">
        <div className="flex items-center gap-3 py-2">
          <span className="text-text-muted opacity-50">{musicNoteIcon}</span>
          <div>
            <p className="text-text-secondary text-[16px] font-medium">Apple Music</p>
            <p className="text-text-muted text-[13px]">Loading...</p>
          </div>
        </div>
      </Card>
    );
  }

  // Not authorized — show sign-in prompt
  if (!authorized) {
    return (
      <Card className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-accent-pink">{musicNoteIcon}</span>
            <div>
              <p className="text-text-primary text-[16px] font-bold">Apple Music</p>
              <p className="text-text-muted text-[13px]">Sign in to play music</p>
            </div>
          </div>
          <Button variant="primary" size="sm" onClick={handleAuth}>
            Sign In
          </Button>
        </div>
      </Card>
    );
  }

  // Authorized — show Now Playing or idle state
  const progress = nowPlaying && nowPlaying.duration > 0
    ? (nowPlaying.currentTime / nowPlaying.duration) * 100
    : 0;

  return (
    <>
      <Card className="mb-8 overflow-hidden">
        {nowPlaying ? (
          <div className="flex gap-4">
            {/* Album art — tap to go to music page */}
            <button onClick={() => navigate('/music')} className="shrink-0">
              {nowPlaying.artworkUrl ? (
                <img
                  src={nowPlaying.artworkUrl}
                  alt={nowPlaying.album}
                  className="w-[80px] h-[80px] rounded-xl object-cover"
                />
              ) : (
                <div className="w-[80px] h-[80px] rounded-xl bg-surface-600 flex items-center justify-center text-text-muted">
                  {musicNoteIcon}
                </div>
              )}
            </button>

            {/* Info + controls */}
            <div className="flex-1 min-w-0">
              <p className="text-text-primary text-[16px] font-bold truncate">{nowPlaying.title}</p>
              <p className="text-text-secondary text-[13px] truncate">{nowPlaying.artist}</p>

              {/* Progress bar */}
              <div className="mt-2 mb-2">
                <div className="w-full h-[4px] bg-surface-600 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent-pink rounded-full transition-[width] duration-1000 ease-linear"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-text-muted text-[11px]">{formatTime(nowPlaying.currentTime)}</span>
                  <span className="text-text-muted text-[11px]">{formatTime(nowPlaying.duration)}</span>
                </div>
              </div>

              {/* Controls row */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => skipToPrevious()}
                  className="w-[36px] h-[36px] rounded-full flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-600 transition-colors active:scale-90"
                >
                  {skipPrevIcon}
                </button>
                <button
                  onClick={handlePlayPause}
                  className="w-[52px] h-[52px] rounded-full bg-accent-pink flex items-center justify-center text-white hover:brightness-110 transition-all active:scale-90"
                >
                  {state === 'playing' ? pauseIcon : playIcon}
                </button>
                <button
                  onClick={() => skipToNext()}
                  className="w-[36px] h-[36px] rounded-full flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-600 transition-colors active:scale-90"
                >
                  {skipNextIcon}
                </button>
                <div className="flex-1" />
                {/* Queue button with count */}
                <button
                  onClick={() => navigate('/music')}
                  className="relative w-[36px] h-[36px] rounded-full flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-600 transition-colors active:scale-90"
                >
                  {queueIcon}
                  {queueCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-accent-blue text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                      {queueCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setShowSearch(true)}
                  className="w-[36px] h-[36px] rounded-full flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-600 transition-colors active:scale-90"
                >
                  {searchIcon}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Idle — no song playing */
          <div className="flex items-center justify-between">
            <button onClick={() => navigate('/music')} className="flex items-center gap-3">
              <span className="text-accent-pink">{musicNoteIcon}</span>
              <div className="text-left">
                <p className="text-text-primary text-[16px] font-bold">Apple Music</p>
                <p className="text-text-muted text-[13px]">
                  {state === 'loading' ? 'Loading...' : 'Nothing playing'}
                </p>
              </div>
            </button>
            <div className="flex items-center gap-2">
              {queueCount > 0 && (
                <button
                  onClick={() => navigate('/music')}
                  className="relative w-[36px] h-[36px] rounded-full flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-600 transition-colors"
                >
                  {queueIcon}
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-accent-blue text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                    {queueCount}
                  </span>
                </button>
              )}
              <Button variant="secondary" size="sm" icon={searchIcon} onClick={() => setShowSearch(true)}>
                Search
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Search modal */}
      <MusicSearch open={showSearch} onClose={() => setShowSearch(false)} />
    </>
  );
}
