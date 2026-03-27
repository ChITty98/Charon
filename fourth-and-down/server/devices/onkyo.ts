import db from '../db.js';

// eISCP commands for Onkyo TX-NR545
// The eiscp package handles the protocol framing

interface OnkyoState {
  power: boolean;
  volume: number;       // 0-80 (hex 00-50)
  muted: boolean;
  input: string;
  listeningMode: string;
}

const INPUT_MAP: Record<string, string> = {
  'appletv': '01',      // CBL/SAT (typical Apple TV input)
  'cbl_sat': '01',
  'game': '02',
  'aux': '03',
  'pc': '05',
  'bluray': '10',       // BD/DVD
  'strm_box': '11',
  'tv': '12',
  'bluetooth': '2E',
  'network': '2B',
  'usb': '29',
  'airplay': '2D',
};

const INPUT_NAME_MAP: Record<string, string> = {
  '01': 'Apple TV',
  '02': 'Game',
  '03': 'AUX',
  '05': 'PC',
  '10': 'Blu-ray',
  '11': 'Streaming',
  '12': 'TV',
  '2E': 'Bluetooth',
  '2B': 'Network',
  '29': 'USB',
  '2D': 'AirPlay',
};

const LISTENING_MODES: Record<string, string> = {
  'stereo': '00',
  'direct': '01',
  'surround': '02',
  'all_stereo': '0C',
  'theater_dimensional': '0D',
  'mono': '0F',
  'game_rpg': '11',
  'game_action': '12',
  'game_rock': '13',
  'game_sports': '14',
};

export class OnkyoReceiver {
  private ip: string;
  private eiscp: any = null;
  private state: OnkyoState = {
    power: false,
    volume: 30,
    muted: false,
    input: '01',
    listeningMode: '00',
  };
  private connected = false;
  private onStateChange?: (state: OnkyoState) => void;

  constructor(ip: string) {
    this.ip = ip;
  }

  async connect(): Promise<boolean> {
    try {
      // Dynamic import since eiscp is CommonJS
      const eiscp = await import('eiscp');
      this.eiscp = eiscp.default || eiscp;
      return new Promise((resolve) => {
        this.eiscp.connect({ host: this.ip, reconnect: true, model: 'TX-NR545' });
        this.eiscp.on('connect', () => {
          this.connected = true;
          // Query initial state
          this.sendRaw('PWRQSTN');
          this.sendRaw('MVLQSTN');
          this.sendRaw('SLIQSTN');
          resolve(true);
        });
        this.eiscp.on('error', () => {
          this.connected = false;
          resolve(false);
        });
        this.eiscp.on('data', (data: any) => {
          this.handleResponse(data);
        });
        // Timeout after 5 seconds
        setTimeout(() => {
          if (!this.connected) resolve(false);
        }, 5000);
      });
    } catch {
      return false;
    }
  }

  private handleResponse(data: any) {
    const cmd = typeof data === 'string' ? data : data?.command;
    if (!cmd) return;
    if (cmd.startsWith('PWR')) {
      this.state.power = cmd === 'PWR01';
    } else if (cmd.startsWith('MVL')) {
      const hex = cmd.slice(3);
      this.state.volume = parseInt(hex, 16);
    } else if (cmd.startsWith('AMT')) {
      this.state.muted = cmd === 'AMT01';
    } else if (cmd.startsWith('SLI')) {
      this.state.input = cmd.slice(3);
    } else if (cmd.startsWith('LMD')) {
      this.state.listeningMode = cmd.slice(3);
    }
    this.onStateChange?.(this.getState());
  }

  private sendRaw(cmd: string): void {
    if (!this.connected || !this.eiscp) return;
    try {
      this.eiscp.raw(cmd);
    } catch {
      // Ignore send errors
    }
  }

  onUpdate(callback: (state: OnkyoState) => void): void {
    this.onStateChange = callback;
  }

  getState(): OnkyoState {
    return { ...this.state };
  }

  isConnected(): boolean {
    return this.connected;
  }

  setPower(on: boolean): void {
    this.sendRaw(on ? 'PWR01' : 'PWR00');
  }

  setVolume(level: number): void {
    // Clamp 0-80, convert to hex
    level = Math.max(0, Math.min(80, level));
    this.sendRaw(`MVL${level.toString(16).toUpperCase().padStart(2, '0')}`);
  }

  volumeUp(): void {
    this.sendRaw('MVLUP');
  }

  volumeDown(): void {
    this.sendRaw('MVLDOWN');
  }

  setMute(muted: boolean): void {
    this.sendRaw(muted ? 'AMT01' : 'AMT00');
  }

  toggleMute(): void {
    this.sendRaw('AMTTG');
  }

  setInput(input: string): void {
    const code = INPUT_MAP[input.toLowerCase()] || input;
    this.sendRaw(`SLI${code}`);
  }

  setListeningMode(mode: string): void {
    const code = LISTENING_MODES[mode] || mode;
    this.sendRaw(`LMD${code}`);
  }

  disconnect(): void {
    if (this.eiscp) {
      try { this.eiscp.close(); } catch { /* */ }
    }
    this.connected = false;
  }

  static getInputList(): Array<{ id: string; name: string }> {
    return Object.entries(INPUT_NAME_MAP).map(([id, name]) => ({ id, name }));
  }

  static getListeningModes(): Array<{ id: string; name: string }> {
    return Object.entries(LISTENING_MODES).map(([name, id]) => ({
      id,
      name: name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    }));
  }
}

// Singleton
let onkyoInstance: OnkyoReceiver | null = null;

export function getOnkyo(): OnkyoReceiver | null {
  if (onkyoInstance) return onkyoInstance;
  const config = db.prepare(
    "SELECT ip FROM device_config WHERE device_type = 'onkyo' LIMIT 1"
  ).get() as { ip: string } | undefined;
  if (config?.ip) {
    onkyoInstance = new OnkyoReceiver(config.ip);
  }
  return onkyoInstance;
}

export function setOnkyo(ip: string): OnkyoReceiver {
  onkyoInstance = new OnkyoReceiver(ip);
  return onkyoInstance;
}

export function clearOnkyo(): void {
  onkyoInstance?.disconnect();
  onkyoInstance = null;
}
