import { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Slider } from '../components/ui/Slider';
import { api } from '../lib/api';
import { useSocket } from '../lib/socket';
import { useNavigate } from 'react-router-dom';

/* ---- Tone +/- Button Component ---- */

function ToneControl({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-secondary text-[16px] font-semibold w-[80px]">{label}</span>
      <div className="flex items-center gap-4">
        <button
          onClick={() => onChange(Math.max(-10, value - 1))}
          className="w-[56px] h-[56px] rounded-2xl bg-surface-600 flex items-center justify-center text-text-primary text-[28px] font-bold active:scale-95 transition-transform"
        >
          −
        </button>
        <span className="text-[32px] font-black tabular-nums text-text-primary w-[60px] text-center">
          {value > 0 ? '+' : ''}{value}
        </span>
        <button
          onClick={() => onChange(Math.min(10, value + 1))}
          className="w-[56px] h-[56px] rounded-2xl bg-surface-600 flex items-center justify-center text-text-primary text-[28px] font-bold active:scale-95 transition-transform"
        >
          +
        </button>
      </div>
    </div>
  );
}

/* ---- Types ---- */

interface OnkyoState {
  power: boolean;
  volume: number;
  muted: boolean;
  input: string;
  listeningMode: string;
  bass?: number;
  treble?: number;
  center?: number;
}

/* ---- Icons ---- */

const powerIcon = (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18.36 6.64A9 9 0 115.64 6.64" />
    <line x1="12" y1="2" x2="12" y2="12" />
  </svg>
);

const volumeUpIcon = (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M19 12h4M21 10v4" />
  </svg>
);

const volumeDownIcon = (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M19 12h4" />
  </svg>
);

const muteIcon = (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <line x1="23" y1="9" x2="17" y2="15" />
    <line x1="17" y1="9" x2="23" y2="15" />
  </svg>
);

const speakerIcon = (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.54 8.46a5 5 0 010 7.07" />
  </svg>
);

const INPUT_MAP: Record<string, string> = {
  '01': 'Apple TV', '02': 'Game', '03': 'AUX', '05': 'PC',
  '10': 'Blu-ray', '12': 'TV', '2E': 'Bluetooth', '2B': 'Network', '2D': 'AirPlay',
};

const INPUTS = [
  { id: 'appletv', code: '01', name: 'Apple TV' },
  { id: 'bluetooth', code: '2E', name: 'Bluetooth' },
  { id: 'game', code: '02', name: 'Game' },
  { id: 'tv', code: '12', name: 'TV' },
  { id: 'pc', code: '05', name: 'PC' },
  { id: 'aux', code: '03', name: 'AUX' },
  { id: 'network', code: '2B', name: 'Network' },
];

const MOVIE_MODES = [
  { id: 'dolby_surround', name: 'Dolby Surround' },
  { id: 'dolby_atmos', name: 'Dolby Atmos' },
  { id: 'dts_surround', name: 'DTS Surround' },
  { id: 'dts_neo6_cinema', name: 'DTS Neo:6 Cinema' },
  { id: 'multichannel', name: 'Multichannel' },
];

const MUSIC_MODES = [
  { id: 'stereo', name: 'Stereo' },
  { id: 'direct', name: 'Direct' },
  { id: 'all_stereo', name: 'All Ch Stereo' },
  { id: 'dts_neo6_music', name: 'DTS Neo:6 Music' },
];


/* ---- Component ---- */

export function Receiver() {
  const navigate = useNavigate();
  const [state, setState] = useState<OnkyoState | null>(null);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if Onkyo is configured
    api.get<Array<{ device_type: string }>>('/devices')
      .then((devices) => {
        const hasOnkyo = devices.some(d => d.device_type === 'onkyo');
        setConfigured(hasOnkyo);
        if (hasOnkyo) {
          // Fetch current state
          return api.get<OnkyoState>('/onkyo/state').then(setState);
        }
      })
      .catch(() => setConfigured(false))
      .finally(() => setLoading(false));
  }, []);

  // Live updates from Onkyo
  useSocket<{ type: string; state: OnkyoState }>('device-update', (data) => {
    if (data.type === 'onkyo') {
      setState(data.state);
    }
  });

  const setPower = async (on: boolean) => {
    setState(prev => prev ? { ...prev, power: on } : prev);
    await api.put('/onkyo/power', { on }).catch(() => {});
  };

  const setVolume = async (level: number) => {
    setState(prev => prev ? { ...prev, volume: level } : prev);
    await api.put('/onkyo/volume', { level }).catch(() => {});
  };

  const setMute = async (muted: boolean) => {
    setState(prev => prev ? { ...prev, muted } : prev);
    await api.put('/onkyo/mute', { muted }).catch(() => {});
  };

  const setInput = async (input: string) => {
    setState(prev => prev ? { ...prev, input } : prev);
    await api.put('/onkyo/input', { input }).catch(() => {});
  };

  const setMode = async (mode: string) => {
    setState(prev => prev ? { ...prev, listeningMode: mode } : prev);
    await api.put('/onkyo/mode', { mode }).catch(() => {});
  };

  if (loading) {
    return (
      <div className="p-5 animate-fade-in">
        <h1 className="text-[28px] font-bold text-text-primary mb-5">Receiver</h1>
        <p className="text-text-muted text-center py-10">Loading...</p>
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="p-5 animate-fade-in">
        <h1 className="text-[28px] font-bold text-text-primary mb-5">Receiver</h1>
        <Card className="text-center py-10">
          <div className="flex justify-center text-text-muted mb-3">{speakerIcon}</div>
          <h3 className="text-[20px] font-bold text-text-primary mb-2">Connect Receiver</h3>
          <p className="text-text-secondary text-[16px] mb-5">Set up your Onkyo receiver in Settings</p>
          <Button variant="primary" size="sm" onClick={() => navigate('/settings')}>Go to Settings</Button>
        </Card>
      </div>
    );
  }

  const currentInput = INPUT_MAP[state?.input || ''] || 'Unknown';

  return (
    <div className="p-5 pb-2 animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-[28px] font-bold text-text-primary">Receiver</h1>
        <div className={`flex items-center gap-2 text-[14px] ${state ? 'text-accent-green' : 'text-accent-amber'}`}>
          <span className={`w-2.5 h-2.5 rounded-full ${state ? 'bg-accent-green' : 'bg-accent-amber animate-pulse'}`} />
          {state ? `Connected — ${currentInput}` : 'Connecting...'}
        </div>
      </div>

      {/* Power toggle */}
      <Card className="mb-5">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPower(!state?.power)}
            className={`w-[72px] h-[72px] rounded-2xl flex items-center justify-center transition-all duration-200 ${
              state?.power
                ? 'bg-accent-green/20 text-accent-green shadow-[0_0_20px_rgba(34,197,94,0.3)]'
                : 'bg-surface-600 text-text-muted'
            }`}
          >
            {powerIcon}
          </button>
          <span className={`text-[22px] font-bold ${state?.power ? 'text-accent-green' : 'text-text-muted'}`}>
            {state?.power ? 'ON' : 'OFF'}
          </span>
        </div>
      </Card>

      {/* Volume section */}
      <Card className={`mb-5 ${!state?.power ? 'opacity-40 pointer-events-none' : ''}`}>
        <h2 className="text-[18px] font-bold text-text-primary mb-4">Volume</h2>

        <div className="flex items-center justify-center gap-6 mb-5">
          <button
            onClick={() => setVolume(Math.max(0, (state?.volume || 0) - 2))}
            className="w-[64px] h-[64px] rounded-2xl bg-surface-600 flex items-center justify-center text-text-primary active:scale-95 transition-transform"
          >
            {volumeDownIcon}
          </button>

          <div className="text-center">
            <span className={`text-[64px] font-black tabular-nums leading-none ${state?.muted ? 'text-accent-red line-through' : 'text-text-primary'}`}>
              {state?.volume || 0}
            </span>
            <p className="text-[14px] text-text-muted mt-1">/ 80</p>
          </div>

          <button
            onClick={() => setVolume(Math.min(80, (state?.volume || 0) + 2))}
            className="w-[64px] h-[64px] rounded-2xl bg-surface-600 flex items-center justify-center text-text-primary active:scale-95 transition-transform"
          >
            {volumeUpIcon}
          </button>
        </div>

        <Slider
          value={state?.volume || 0}
          onChange={setVolume}
          max={80}
          color={state?.muted ? '#ef4444' : '#3b82f6'}
          showValue={false}
        />

        <div className="mt-4 flex justify-center">
          <Button
            variant={state?.muted ? 'danger' : 'secondary'}
            size="sm"
            icon={muteIcon}
            onClick={() => setMute(!state?.muted)}
          >
            {state?.muted ? 'Unmute' : 'Mute'}
          </Button>
        </div>
      </Card>

      {/* Bass / Treble / Center */}
      <Card className={`mb-5 ${!state?.power ? 'opacity-40 pointer-events-none' : ''}`}>
        <h2 className="text-[18px] font-bold text-text-primary mb-4">Tone</h2>
        <div className="space-y-5">
          <ToneControl
            label="Bass"
            value={state?.bass ?? 0}
            onChange={(val) => {
              setState(prev => prev ? { ...prev, bass: val } : prev);
              api.put('/onkyo/tone', { bass: val }).catch(() => {});
            }}
          />
          <ToneControl
            label="Treble"
            value={state?.treble ?? 0}
            onChange={(val) => {
              setState(prev => prev ? { ...prev, treble: val } : prev);
              api.put('/onkyo/tone', { treble: val }).catch(() => {});
            }}
          />
          <ToneControl
            label="Center"
            value={state?.center ?? 0}
            onChange={(val) => {
              setState(prev => prev ? { ...prev, center: val } : prev);
              api.put('/onkyo/tone', { center: val }).catch(() => {});
            }}
          />
        </div>
      </Card>

      {/* Input selector */}
      <Card className={`mb-5 ${!state?.power ? 'opacity-40 pointer-events-none' : ''}`}>
        <h2 className="text-[18px] font-bold text-text-primary mb-4">Input</h2>
        <div className="grid grid-cols-3 lg:grid-cols-4 gap-3">
          {INPUTS.map((input) => (
            <button
              key={input.id}
              onClick={() => setInput(input.id)}
              className={[
                'flex flex-col items-center justify-center gap-2 h-[70px] rounded-xl transition-all duration-150 text-[14px] font-semibold',
                state?.input === input.code
                  ? 'bg-accent-blue/20 border-2 border-accent-blue text-accent-blue'
                  : 'bg-surface-600 border-2 border-transparent text-text-secondary hover:text-text-primary',
              ].join(' ')}
            >
              {input.name}
            </button>
          ))}
        </div>
      </Card>

      {/* Listening mode — Movie/TV */}
      <Card className={`mb-5 ${!state?.power ? 'opacity-40 pointer-events-none' : ''}`}>
        <h2 className="text-[18px] font-bold text-text-primary mb-4">Movie / TV Modes</h2>
        <div className="flex flex-wrap gap-2">
          {MOVIE_MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => setMode(mode.id)}
              className={[
                'h-[44px] px-5 rounded-xl text-[15px] font-semibold transition-all duration-150',
                state?.listeningMode === mode.id
                  ? 'bg-accent-purple/20 border-2 border-accent-purple text-accent-purple'
                  : 'bg-surface-600 border-2 border-transparent text-text-secondary',
              ].join(' ')}
            >
              {mode.name}
            </button>
          ))}
        </div>
      </Card>

      {/* Listening mode — Music */}
      <Card className={`mb-5 ${!state?.power ? 'opacity-40 pointer-events-none' : ''}`}>
        <h2 className="text-[18px] font-bold text-text-primary mb-4">Music Modes</h2>
        <div className="flex flex-wrap gap-2">
          {MUSIC_MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => setMode(mode.id)}
              className={[
                'h-[44px] px-5 rounded-xl text-[15px] font-semibold transition-all duration-150',
                state?.listeningMode === mode.id
                  ? 'bg-accent-purple/20 border-2 border-accent-purple text-accent-purple'
                  : 'bg-surface-600 border-2 border-transparent text-text-secondary',
              ].join(' ')}
            >
              {mode.name}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
