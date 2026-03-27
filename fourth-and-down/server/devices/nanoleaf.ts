import db from '../db.js';

export interface NanoleafInfo {
  name: string;
  serialNo: string;
  manufacturer: string;
  firmwareVersion: string;
  model: string;
  state: {
    on: boolean;
    brightness: number;
    hue: number;
    saturation: number;
    colorTemperature: number;
    colorMode: string;
  };
  effects: {
    select: string;
    effectsList: string[];
  };
  panelLayout: {
    numPanels: number;
  };
}

export class NanoleafClient {
  private ip: string;
  private token: string;

  constructor(ip: string, token: string) {
    this.ip = ip;
    this.token = token;
  }

  private get baseUrl() {
    return `http://${this.ip}:16021/api/v1/${this.token}`;
  }

  static async authenticate(ip: string): Promise<string | null> {
    try {
      const res = await fetch(`http://${ip}:16021/api/v1/new`, { method: 'POST' });
      const data = await res.json();
      if (data.auth_token) return data.auth_token;
      return null;
    } catch {
      return null;
    }
  }

  async getInfo(): Promise<NanoleafInfo> {
    const res = await fetch(this.baseUrl);
    return res.json();
  }

  async setPower(on: boolean): Promise<void> {
    await fetch(`${this.baseUrl}/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ on: { value: on } }),
    });
  }

  async setBrightness(value: number, duration = 0): Promise<void> {
    await fetch(`${this.baseUrl}/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brightness: { value: Math.max(0, Math.min(100, value)), duration } }),
    });
  }

  async setHueSat(hue: number, saturation: number): Promise<void> {
    await fetch(`${this.baseUrl}/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hue: { value: Math.max(0, Math.min(360, hue)) },
        sat: { value: Math.max(0, Math.min(100, saturation)) },
      }),
    });
  }

  async setColorTemperature(value: number): Promise<void> {
    await fetch(`${this.baseUrl}/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ct: { value: Math.max(1200, Math.min(6500, value)) } }),
    });
  }

  async getEffects(): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/effects/effectsList`);
    return res.json();
  }

  async setEffect(name: string): Promise<void> {
    await fetch(`${this.baseUrl}/effects`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ select: name }),
    });
  }

  async identify(): Promise<void> {
    await fetch(`${this.baseUrl}/identify`, { method: 'PUT' });
  }
}

// Singleton
let nanoleafInstance: NanoleafClient | null = null;

export function getNanoleaf(): NanoleafClient | null {
  if (nanoleafInstance) return nanoleafInstance;
  const config = db.prepare(
    "SELECT ip, auth_token FROM device_config WHERE device_type = 'nanoleaf' LIMIT 1"
  ).get() as { ip: string; auth_token: string } | undefined;
  if (config?.ip && config?.auth_token) {
    nanoleafInstance = new NanoleafClient(config.ip, config.auth_token);
  }
  return nanoleafInstance;
}

export function setNanoleaf(ip: string, token: string): NanoleafClient {
  nanoleafInstance = new NanoleafClient(ip, token);
  return nanoleafInstance;
}

export function clearNanoleaf(): void {
  nanoleafInstance = null;
}
