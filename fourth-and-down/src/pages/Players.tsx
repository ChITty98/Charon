import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useSocket } from '../lib/socket';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';

/* ---- Types ---- */

interface Player {
  id: number;
  name: string;
  color: string;
  created_at: string;
  session_count?: number;
}

interface Session {
  id: number;
  date: string;
  scene_mode: string | null;
  started_at: string;
  ended_at: string | null;
}


/* ---- Preset colors ---- */

const PRESET_COLORS = [
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Purple', hex: '#8b5cf6' },
  { name: 'Pink', hex: '#ec4899' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Green', hex: '#22c55e' },
  { name: 'Red', hex: '#ef4444' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Cyan', hex: '#06b6d4' },
  { name: 'Lime', hex: '#84cc16' },
  { name: 'Teal', hex: '#14b8a6' },
  { name: 'Rose', hex: '#f43f5e' },
  { name: 'Indigo', hex: '#6366f1' },
];

/* ---- Component ---- */

export function Players() {
  const navigate = useNavigate();
  const [players, setPlayers] = useState<Player[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionPlayerIds, setSessionPlayerIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0].hex);
  const [deleteTarget, setDeleteTarget] = useState<Player | null>(null);
  const [adminMode, setAdminMode] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');

  /* ---- Data fetching ---- */

  const fetchAll = useCallback(async () => {
    try {
      const [playerList, currentSession] = await Promise.all([
        api.get<Player[]>('/players'),
        api.get<Session | null>('/sessions/current'),
      ]);
      setPlayers(playerList);
      setSession(currentSession);

      if (currentSession) {
        const sp = await api.get<Player[]>('/sessions/current/players');
        setSessionPlayerIds(new Set(sp.map(p => p.id)));
      } else {
        setSessionPlayerIds(new Set());
      }
    } catch {
      // Server may not have routes yet — fail gracefully
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Live updates via socket — only refresh player list, not session state
  // (session state is updated optimistically by togglePlayer)
  useSocket('player:update', async () => {
    try {
      const playerList = await api.get<Player[]>('/players');
      setPlayers(playerList);
    } catch { /* */ }
  });

  /* ---- Actions ---- */

  const startSession = async () => {
    try {
      const s = await api.post<Session>('/sessions');
      setSession(s);
      setSessionPlayerIds(new Set());
    } catch { /* noop */ }
  };

  const togglePlayer = async (playerId: number) => {
    // Auto-start session if none exists
    let activeSession = session;
    if (!activeSession) {
      try {
        const s = await api.post<Session>('/sessions');
        setSession(s);
        activeSession = s;
        setSessionPlayerIds(new Set());
      } catch { return; }
    }

    const inSession = sessionPlayerIds.has(playerId);
    try {
      if (inSession) {
        await api.post('/sessions/current/leave', { playerId });
        setSessionPlayerIds(prev => {
          const next = new Set(prev);
          next.delete(playerId);
          return next;
        });
      } else {
        await api.post('/sessions/current/join', { playerId });
        setSessionPlayerIds(prev => new Set(prev).add(playerId));
      }
    } catch(e) {
      console.error('Toggle player failed:', e);
    }
  };

  const endSession = async () => {
    try {
      await api.post('/sessions/end');
      setSession(null);
      setSessionPlayerIds(new Set());
    } catch { /* noop */ }
  };

  const deletePlayer = async (player: Player) => {
    try {
      await api.delete(`/players/${player.id}`);
      setPlayers(prev => prev.filter(p => p.id !== player.id));
      setSessionPlayerIds(prev => {
        const next = new Set(prev);
        next.delete(player.id);
        return next;
      });
      setDeleteTarget(null);
    } catch { /* noop */ }
  };

  const createPlayer = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      const p = await api.post<Player>('/players', { name: trimmed, color: newColor });
      setPlayers(prev => [...prev, p]);
      // Auto-join session if active
      if (session) {
        await api.post('/sessions/current/join', { playerId: p.id });
        setSessionPlayerIds(prev => new Set(prev).add(p.id));
      }
      setModalOpen(false);
      setNewName('');
      setNewColor(PRESET_COLORS[0].hex);
    } catch { /* noop */ }
  };


  /* ---- Admin PIN ---- */
  const [pinError, setPinError] = useState(false); void pinError;

  const verifyPin = async () => {
    try {
      const res = await api.post<{ valid: boolean }>('/admin/verify-pin', { pin: pinInput });
      if (res.valid) {
        setAdminMode(true);
        setShowPinModal(false);
        setPinInput('');
        setPinError(false);
      } else {
        setPinInput('');
        setPinError(true);
      }
    } catch {
      // Fallback: hardcoded PIN if server doesn't have route
      if (pinInput === '1234') {
        setAdminMode(true);
        setShowPinModal(false);
        setPinInput('');
        setPinError(false);
      } else {
        setPinInput('');
        setPinError(true);
      }
    }
  };

  const toggleAdmin = () => {
    if (adminMode) {
      setAdminMode(false);
    } else {
      setShowPinModal(true);
      setPinInput('');
    }
  };

  /* ---- Derived data ---- */

  const activePlayers = players.filter(p => sessionPlayerIds.has(p.id));
  const allSorted = [...players].sort((a, b) => a.name.localeCompare(b.name));

  /* ---- Render ---- */

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-text-secondary text-[20px] animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-5 pb-8 space-y-6 max-w-2xl mx-auto">

      {/* ---- Player Roster (always visible) ---- */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[24px] font-bold text-text-primary">Players</h2>
          <div className="flex gap-2">
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
            <Button size="sm" variant="secondary" onClick={() => setModalOpen(true)}>
              + New Player
            </Button>
          </div>
        </div>

        {allSorted.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-text-secondary text-[18px] mb-4">No players yet</p>
            <Button size="lg" fullWidth onClick={() => setModalOpen(true)}>
              Create First Player
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {allSorted.map(p => {
              const active = sessionPlayerIds.has(p.id);
              return (
                <div key={p.id} className="relative">
                  <button
                    onClick={() => session ? togglePlayer(p.id) : undefined}
                    className={[
                      'relative w-full flex items-center gap-3 p-4 rounded-xl bg-surface-800 transition-all duration-150 select-none min-h-[68px]',
                      session ? 'active:scale-[0.96] cursor-pointer' : 'cursor-default',
                    ].join(' ')}
                    style={{
                      border: active ? `2px solid ${p.color}` : '2px solid transparent',
                      boxShadow: active ? `0 0 16px ${p.color}50` : 'none',
                    }}
                  >
                    {/* Color dot */}
                    <div
                      className="w-[40px] h-[40px] rounded-full shrink-0 flex items-center justify-center text-[18px] font-bold text-white"
                      style={{ backgroundColor: p.color }}
                    >
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="text-left min-w-0">
                      <div className="text-text-primary text-[18px] font-semibold truncate">
                        {p.name}
                      </div>
                      {p.session_count !== undefined && (
                        <div className="text-text-muted text-[14px]">
                          {p.session_count} session{p.session_count !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                    {/* Active check */}
                    {active && (
                      <div className="absolute top-2 right-2 text-[18px]">{'\u2713'}</div>
                    )}
                  </button>
                  {/* Delete button — only visible in admin mode */}
                  {adminMode && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(p); }}
                      className="absolute -top-2 -left-2 w-[24px] h-[24px] rounded-full bg-surface-600 border border-surface-500 flex items-center justify-center text-text-muted hover:text-accent-red hover:bg-surface-500 transition-colors z-10"
                      aria-label={`Delete ${p.name}`}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ---- Career Stats link ---- */}
      <button
        onClick={() => navigate('/career-stats')}
        className="w-full flex items-center justify-between px-4 py-3 bg-surface-800 rounded-xl border border-surface-600 hover:border-accent-blue/50 transition-all"
      >
        <div className="flex items-center gap-3">
          <span className="text-[22px]">{'\u{1F4CA}'}</span>
          <span className="text-text-primary text-[16px] font-semibold">Career Stats</span>
        </div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-text-muted">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>

      {/* ---- Tonight's Session ---- */}
      <section>
        <h2 className="text-[20px] font-bold text-text-primary mb-4">Tonight's Session</h2>

        {!session ? (
          <div className="text-center py-6">
            <p className="text-text-muted text-[16px] mb-4">No session running</p>
            <Button size="lg" fullWidth onClick={startSession}>
              Start Session
            </Button>
            <p className="text-text-muted text-[13px] mt-2">Start a session, then tap players above to add them</p>
          </div>
        ) : activePlayers.length === 0 ? (
          <div className="text-center py-5">
            <p className="text-text-secondary text-[16px]">Session active — tap players above to add them</p>
            <div className="mt-4">
              <Button variant="danger" size="sm" onClick={endSession}>
                End Session
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-4 justify-center">
              {activePlayers.map(p => (
                <div key={p.id} className="flex flex-col items-center gap-1.5">
                  <div
                    className="w-[56px] h-[56px] rounded-full flex items-center justify-center text-[22px] font-bold text-white shadow-lg"
                    style={{
                      backgroundColor: p.color,
                      boxShadow: `0 0 16px ${p.color}60`,
                    }}
                  >
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-text-primary text-[14px] font-semibold">{p.name}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-center">
              <Button variant="danger" size="sm" onClick={endSession}>
                End Session
              </Button>
            </div>
          </>
        )}
      </section>

      {/* ---- New Player Modal ---- */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Player" size="sm">
        <div className="space-y-5">
          {/* Name input */}
          <div>
            <label className="block text-text-secondary text-[16px] mb-2">Name</label>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Enter name..."
              autoFocus
              className="w-full h-[56px] px-4 text-[20px] bg-surface-700 text-text-primary rounded-xl border border-surface-500 focus:border-accent-blue focus:outline-none placeholder:text-text-muted"
              onKeyDown={e => {
                if (e.key === 'Enter') createPlayer();
              }}
            />
          </div>

          {/* Color grid */}
          <div>
            <label className="block text-text-secondary text-[16px] mb-2">Color</label>
            <div className="grid grid-cols-6 gap-3">
              {PRESET_COLORS.map(c => (
                <button
                  key={c.hex}
                  onClick={() => setNewColor(c.hex)}
                  className="w-[48px] h-[48px] rounded-full transition-transform duration-100 active:scale-90"
                  style={{
                    backgroundColor: c.hex,
                    border: newColor === c.hex ? '3px solid white' : '3px solid transparent',
                    boxShadow: newColor === c.hex ? `0 0 12px ${c.hex}80` : 'none',
                  }}
                  aria-label={c.name}
                />
              ))}
            </div>
          </div>

          {/* Save */}
          <Button
            size="lg"
            fullWidth
            onClick={createPlayer}
            disabled={!newName.trim()}
          >
            Add Player
          </Button>
        </div>
      </Modal>

      {/* ---- Delete Player Confirmation ---- */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Player" size="sm">
        {deleteTarget && (
          <div className="space-y-5">
            <p className="text-text-secondary text-[16px] text-center">
              Delete <strong className="text-text-primary">{deleteTarget.name}</strong>? This removes all their stats.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" fullWidth onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button variant="danger" fullWidth onClick={() => deletePlayer(deleteTarget)}>
                Delete
              </Button>
            </div>
          </div>
        )}
      </Modal>


      {/* ---- Admin PIN Modal ---- */}
      <Modal open={showPinModal} onClose={() => { setShowPinModal(false); setPinInput(''); }} title="Admin PIN" size="sm">
        <div className="space-y-5">
          <p className="text-text-secondary text-[16px] text-center">
            Enter PIN to unlock admin mode
          </p>
          {pinError && (
            <p className="text-accent-red text-[14px] text-center">Wrong PIN. Try again.</p>
          )}
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
            onKeyDown={e => {
              if (e.key === 'Enter') verifyPin();
            }}
          />
          <Button
            size="lg"
            fullWidth
            onClick={verifyPin}
            disabled={!pinInput}
          >
            Unlock
          </Button>
        </div>
      </Modal>
    </div>
  );
}
