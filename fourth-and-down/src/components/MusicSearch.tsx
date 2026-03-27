import { useState, useRef, useCallback } from 'react';
import { Modal } from './ui/Modal';
import { searchCatalog, searchAlbums, getAlbumTracks, playSong, addToQueue, playNow, isBanned } from '../lib/music';

interface SearchResult {
  id: string;
  title: string;
  artist: string;
  album: string;
  artworkUrl: string;
  durationMs: number;
}

interface MusicSearchProps {
  open: boolean;
  onClose: () => void;
  /** If provided, songs are added via this callback instead of playing immediately */
  onAddSong?: (song: SearchResult) => void;
  /** If true, show "Add to Queue" button instead of direct play */
  queueMode?: boolean;
}

const musicNoteSmall = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

const addIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const checkIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function MusicSearch({ open, onClose, onAddSong, queueMode }: MusicSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [blockedCount, setBlockedCount] = useState(0);
  const [albums, setAlbums] = useState<any[]>([]);
  const [expandedAlbum, setExpandedAlbum] = useState<string | null>(null);
  const [albumTracks, setAlbumTracks] = useState<SearchResult[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [searchTab, setSearchTab] = useState<'songs' | 'albums'>('songs');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (term: string) => {
    if (!term.trim()) { setResults([]); setAlbums([]); setBlockedCount(0); return; }
    setLoading(true);
    const [songs, albumResults] = await Promise.all([searchCatalog(term), searchAlbums(term)]);
    const filtered = songs.filter((s: SearchResult) => !isBanned(s.title, s.artist).banned);
    setBlockedCount(songs.length - filtered.length);
    setResults(filtered);
    setAlbums(albumResults);
    setLoading(false);
  }, []);

  const handleExpandAlbum = async (albumId: string) => {
    if (expandedAlbum === albumId) { setExpandedAlbum(null); return; }
    setExpandedAlbum(albumId);
    setLoadingTracks(true);
    const tracks = await getAlbumTracks(albumId);
    setAlbumTracks(tracks);
    setLoadingTracks(false);
  };

  const handleAddAllTracks = () => {
    albumTracks.forEach(track => {
      if (!isBanned(track.title, track.artist).banned) {
        if (onAddSong) {
          onAddSong(track);
        } else {
          addToQueue({ songId: track.id, title: track.title, artist: track.artist, artworkUrl: track.artworkUrl });
        }
      }
    });
    markAdded(expandedAlbum || 'all');
  };

  const handleInput = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  };

  const handlePlay = async (song: SearchResult) => {
    if (onAddSong) {
      onAddSong(song);
      markAdded(song.id);
      return;
    }
    setPlayingId(song.id);
    await playSong(song.id);
    setPlayingId(null);
    onClose();
  };

  const handleAddToQueue = (song: SearchResult) => {
    if (onAddSong) {
      onAddSong(song);
      markAdded(song.id);
      return;
    }
    addToQueue({
      songId: song.id,
      title: song.title,
      artist: song.artist,
      artworkUrl: song.artworkUrl,
    });
    markAdded(song.id);
  };

  const handlePlayNow = (song: SearchResult) => {
    playNow({
      songId: song.id,
      title: song.title,
      artist: song.artist,
      artworkUrl: song.artworkUrl,
    });
    onClose();
  };

  const markAdded = (id: string) => {
    setAddedIds(prev => new Set(prev).add(id));
    setTimeout(() => {
      setAddedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 2000);
  };

  const handleClose = () => {
    setQuery('');
    setResults([]);
    onClose();
  };

  const useQueueButtons = queueMode || onAddSong;

  return (
    <Modal open={open} onClose={handleClose} title="Search Music" size="lg">
      {/* Search input */}
      <input
        type="text"
        placeholder="Search songs, artists, albums..."
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        autoFocus
        className="w-full h-[52px] bg-surface-700 border border-surface-500 rounded-xl px-4 text-text-primary text-[16px] placeholder:text-text-muted mb-4 focus:outline-none focus:border-accent-pink"
      />

      {/* Tabs: Songs / Albums */}
      {(results.length > 0 || albums.length > 0) && (
        <div className="flex gap-1 mb-3">
          <button
            onClick={() => setSearchTab('songs')}
            className={`px-4 py-2 rounded-lg text-[14px] font-semibold transition-colors ${searchTab === 'songs' ? 'bg-accent-blue text-white' : 'bg-surface-700 text-text-muted hover:text-text-secondary'}`}
          >
            Songs ({results.length})
          </button>
          <button
            onClick={() => setSearchTab('albums')}
            className={`px-4 py-2 rounded-lg text-[14px] font-semibold transition-colors ${searchTab === 'albums' ? 'bg-accent-blue text-white' : 'bg-surface-700 text-text-muted hover:text-text-secondary'}`}
          >
            Albums ({albums.length})
          </button>
        </div>
      )}

      {/* Results */}
      <div className="max-h-[400px] overflow-y-auto space-y-1">
        {loading && (
          <p className="text-text-muted text-center py-8">Searching...</p>
        )}

        {!loading && query && results.length === 0 && albums.length === 0 && (
          <p className="text-text-muted text-center py-8">No results found</p>
        )}

        {!loading && blockedCount > 0 && searchTab === 'songs' && (
          <p className="text-red-400 text-[13px] text-center py-1 mb-1">
            {blockedCount} result{blockedCount > 1 ? 's' : ''} blocked by ban list
          </p>
        )}

        {/* Song results */}
        {!loading && searchTab === 'songs' && results.map((song) => (
          <div
            key={song.id}
            className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-600 transition-colors"
          >
            <button
              onClick={() => useQueueButtons ? handlePlayNow(song) : handlePlay(song)}
              disabled={playingId === song.id}
              className="shrink-0"
            >
              {song.artworkUrl ? (
                <img src={song.artworkUrl} alt={song.album} className="w-[48px] h-[48px] rounded-lg object-cover" />
              ) : (
                <div className="w-[48px] h-[48px] rounded-lg bg-surface-600 flex items-center justify-center text-text-muted">{musicNoteSmall}</div>
              )}
            </button>
            <button
              onClick={() => useQueueButtons ? handleAddToQueue(song) : handlePlay(song)}
              disabled={playingId === song.id}
              className="flex-1 min-w-0 text-left"
            >
              <p className="text-text-primary text-[15px] font-semibold truncate">
                {playingId === song.id ? 'Loading...' : song.title}
              </p>
              <p className="text-text-secondary text-[13px] truncate">
                {song.artist} {song.album && `\u2022 ${song.album}`}
              </p>
            </button>
            <span className="text-text-muted text-[13px] shrink-0">{formatDuration(song.durationMs)}</span>
            {useQueueButtons && (
              <button
                onClick={() => handleAddToQueue(song)}
                className={`w-[40px] h-[40px] rounded-full flex items-center justify-center transition-all shrink-0 ${addedIds.has(song.id) ? 'bg-green-600/20 text-green-400' : 'bg-surface-600 text-text-secondary hover:bg-accent-blue hover:text-white'}`}
                title="Add to queue"
              >
                {addedIds.has(song.id) ? checkIcon : addIcon}
              </button>
            )}
          </div>
        ))}

        {/* Album results */}
        {!loading && searchTab === 'albums' && albums.map((album) => (
          <div key={album.id} className="rounded-xl overflow-hidden">
            <button
              onClick={() => handleExpandAlbum(album.id)}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surface-600 transition-colors text-left"
            >
              {album.artworkUrl ? (
                <img src={album.artworkUrl} alt={album.name} className="w-[56px] h-[56px] rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-[56px] h-[56px] rounded-lg bg-surface-600 flex items-center justify-center text-text-muted shrink-0">{musicNoteSmall}</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-text-primary text-[15px] font-semibold truncate">{album.name}</p>
                <p className="text-text-secondary text-[13px] truncate">{album.artist}</p>
                <p className="text-text-muted text-[12px]">{album.trackCount} tracks {album.releaseDate && `\u2022 ${album.releaseDate.substring(0, 4)}`}</p>
              </div>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted shrink-0">
                <path d={expandedAlbum === album.id ? 'M6 9l6 6 6-6' : 'M9 18l6-6-6-6'} />
              </svg>
            </button>

            {expandedAlbum === album.id && (
              <div className="bg-surface-700/50 p-2 space-y-1">
                {loadingTracks ? (
                  <p className="text-text-muted text-center py-4 text-[14px]">Loading tracks...</p>
                ) : (
                  <>
                    <button
                      onClick={handleAddAllTracks}
                      className={`w-full h-[40px] rounded-lg text-[14px] font-semibold flex items-center justify-center gap-2 mb-2 transition-colors ${addedIds.has(album.id) ? 'bg-green-600/20 text-green-400' : 'bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30'}`}
                    >
                      {addedIds.has(album.id) ? <>{checkIcon} Added!</> : <>{addIcon} Add All Tracks</>}
                    </button>
                    {albumTracks.map((track) => (
                      <div key={track.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-600 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="text-text-primary text-[14px] truncate">{track.title}</p>
                          <p className="text-text-secondary text-[12px] truncate">{track.artist}</p>
                        </div>
                        <span className="text-text-muted text-[12px] shrink-0">{formatDuration(track.durationMs)}</span>
                        <button
                          onClick={() => {
                            if (onAddSong) { onAddSong(track); } else { handleAddToQueue(track); }
                            markAdded(track.id);
                          }}
                          className={`w-[36px] h-[36px] rounded-full flex items-center justify-center transition-all shrink-0 ${addedIds.has(track.id) ? 'bg-green-600/20 text-green-400' : 'bg-surface-600 text-text-secondary hover:bg-accent-blue hover:text-white'}`}
                        >
                          {addedIds.has(track.id) ? checkIcon : addIcon}
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
