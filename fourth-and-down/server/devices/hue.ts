import db from '../db.js';

// CIE xy color conversion for Philips Hue
// RGB → XYZ → xy with gamut clamping

interface XYPoint { x: number; y: number }

// Gamut C (most modern Hue bulbs)
const GAMUT_C = {
  red: { x: 0.6915, y: 0.3083 },
  green: { x: 0.17, y: 0.7 },
  blue: { x: 0.1532, y: 0.0475 },
};

function crossProduct(p1: XYPoint, p2: XYPoint): number {
  return p1.x * p2.y - p1.y * p2.x;
}

function isPointInGamut(p: XYPoint, gamut = GAMUT_C): boolean {
  const { red: r, green: g, blue: b } = gamut;
  const v1 = { x: g.x - r.x, y: g.y - r.y };
  const v2 = { x: b.x - r.x, y: b.y - r.y };
  const q = { x: p.x - r.x, y: p.y - r.y };
  const s = crossProduct(q, v2) / crossProduct(v1, v2);
  const t = crossProduct(v1, q) / crossProduct(v1, v2);
  return s >= 0 && t >= 0 && s + t <= 1;
}

function closestPointOnLine(a: XYPoint, b: XYPoint, p: XYPoint): XYPoint {
  const ap = { x: p.x - a.x, y: p.y - a.y };
  const ab = { x: b.x - a.x, y: b.y - a.y };
  let t = (ap.x * ab.x + ap.y * ab.y) / (ab.x * ab.x + ab.y * ab.y);
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + ab.x * t, y: a.y + ab.y * t };
}

function clampToGamut(p: XYPoint, gamut = GAMUT_C): XYPoint {
  if (isPointInGamut(p, gamut)) return p;
  const { red: r, green: g, blue: b } = gamut;
  const candidates = [
    closestPointOnLine(r, g, p),
    closestPointOnLine(g, b, p),
    closestPointOnLine(b, r, p),
  ];
  let closest = candidates[0];
  let minDist = Infinity;
  for (const c of candidates) {
    const d = (c.x - p.x) ** 2 + (c.y - p.y) ** 2;
    if (d < minDist) { minDist = d; closest = c; }
  }
  return closest;
}

export function rgbToXY(r: number, g: number, b: number): [number, number] {
  // Apply gamma correction
  const gammaCorrect = (v: number) => {
    v = v / 255;
    return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92;
  };
  const rr = gammaCorrect(r);
  const gg = gammaCorrect(g);
  const bb = gammaCorrect(b);

  // Wide RGB D65 conversion
  const X = rr * 0.664511 + gg * 0.154324 + bb * 0.162028;
  const Y = rr * 0.283881 + gg * 0.668433 + bb * 0.047685;
  const Z = rr * 0.000088 + gg * 0.072310 + bb * 0.986039;

  const sum = X + Y + Z;
  if (sum === 0) return [0.3127, 0.3290]; // D65 white point
  const raw = { x: X / sum, y: Y / sum };
  const clamped = clampToGamut(raw);
  return [Math.round(clamped.x * 10000) / 10000, Math.round(clamped.y * 10000) / 10000];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = h / 360; s = s / 100; l = l / 100;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1/3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1/3) * 255),
  ];
}

export interface HueLight {
  id: string;
  name: string;
  on: boolean;
  brightness: number;
  hue?: number;
  saturation?: number;
  xy?: [number, number];
  colormode?: string;
  reachable: boolean;
  type: string;
}

export interface HueGroup {
  id: string;
  name: string;
  lights: string[];
  type: string;
  on: boolean;
  brightness: number;
}

export class HueBridge {
  private ip: string;
  private token: string;
  private lastRequest = 0;
  private requestQueue: Array<() => Promise<void>> = [];
  private processing = false;

  constructor(ip: string, token: string) {
    this.ip = ip;
    this.token = token;
  }

  getIp(): string { return this.ip; }
  getToken(): string { return this.token; }

  private get baseUrl() {
    return `http://${this.ip}/api/${this.token}`;
  }

  // Rate limiter: max 10 requests per second
  private async throttledFetch(url: string, options?: RequestInit): Promise<Response> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequest;
    if (timeSinceLastRequest < 100) {
      await new Promise(r => setTimeout(r, 100 - timeSinceLastRequest));
    }
    this.lastRequest = Date.now();
    return fetch(url, options);
  }

  static async discover(): Promise<string | null> {
    try {
      // Try N-UPnP (Hue cloud discovery)
      const res = await fetch('https://discovery.meethue.com/');
      const bridges = await res.json();
      if (Array.isArray(bridges) && bridges.length > 0) {
        return bridges[0].internalipaddress;
      }
    } catch {
      // Fall through to null
    }
    return null;
  }

  static async authenticate(ip: string): Promise<{ username: string; clientkey: string } | null> {
    try {
      const res = await fetch(`http://${ip}/api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devicetype: 'fourth-and-down#surface', generateclientkey: true }),
      });
      const data = await res.json();
      if (Array.isArray(data) && data[0]?.success?.username) {
        return {
          username: data[0].success.username,
          clientkey: data[0].success.clientkey || '',
        };
      }
      // Link button not pressed — data[0].error.type === 101
      return null;
    } catch {
      return null;
    }
  }

  async getLights(): Promise<HueLight[]> {
    const res = await this.throttledFetch(`${this.baseUrl}/lights`);
    const data = await res.json();
    return Object.entries(data).map(([id, light]: [string, any]) => ({
      id,
      name: light.name,
      on: light.state.on,
      brightness: Math.round((light.state.bri / 254) * 100),
      hue: light.state.hue,
      saturation: light.state.sat,
      xy: light.state.xy,
      colormode: light.state.colormode,
      reachable: light.state.reachable,
      type: light.type,
    }));
  }

  async getGroups(): Promise<HueGroup[]> {
    const res = await this.throttledFetch(`${this.baseUrl}/groups`);
    const data = await res.json();
    return Object.entries(data).map(([id, group]: [string, any]) => ({
      id,
      name: group.name,
      lights: group.lights,
      type: group.type,
      on: group.action?.on ?? false,
      brightness: group.action?.bri ? Math.round((group.action.bri / 254) * 100) : 0,
    }));
  }

  async setLightState(lightId: string, state: {
    on?: boolean;
    bri?: number; // 0-100, converted to 1-254
    xy?: [number, number];
    transitiontime?: number; // in 100ms units
  }): Promise<void> {
    const body: Record<string, any> = {};
    if (state.on !== undefined) body.on = state.on;
    if (state.bri !== undefined) body.bri = Math.max(1, Math.round((state.bri / 100) * 254));
    if (state.xy) body.xy = state.xy;
    if (state.transitiontime !== undefined) body.transitiontime = state.transitiontime;
    await this.throttledFetch(`${this.baseUrl}/lights/${lightId}/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async setGroupState(groupId: string, state: {
    on?: boolean;
    bri?: number;
    xy?: [number, number];
    transitiontime?: number;
  }): Promise<void> {
    const body: Record<string, any> = {};
    if (state.on !== undefined) body.on = state.on;
    if (state.bri !== undefined) body.bri = Math.max(1, Math.round((state.bri / 100) * 254));
    if (state.xy) body.xy = state.xy;
    if (state.transitiontime !== undefined) body.transitiontime = state.transitiontime;
    await this.throttledFetch(`${this.baseUrl}/groups/${groupId}/action`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async setAllLights(state: { on?: boolean; bri?: number; xy?: [number, number]; transitiontime?: number }): Promise<void> {
    // Group 0 is always "all lights"
    await this.setGroupState('0', state);
  }

  // Entertainment API — fetch entertainment configurations
  async getEntertainmentAreas(): Promise<Array<{ id: string; name: string; channels: Array<{ id: number; lightId: string }> }>> {
    // Use CLIP v2 API for entertainment configs
    const res = await fetch(`https://${this.ip}/clip/v2/resource/entertainment_configuration`, {
      headers: { 'hue-application-key': this.token },
      // Bridge uses self-signed cert
      ...(typeof process !== 'undefined' ? {} : {}),
    });
    const data = await res.json();
    if (!data.data) return [];
    return data.data.map((area: any) => ({
      id: area.id,
      name: area.metadata?.name || area.name || 'Unknown',
      channels: (area.channels || []).map((ch: any) => ({
        id: ch.channel_id,
        lightId: ch.members?.[0]?.service?.rid || '',
      })),
    }));
  }

  // Activate entertainment area for streaming
  async activateEntertainment(areaId: string): Promise<boolean> {
    try {
      const res = await fetch(`https://${this.ip}/clip/v2/resource/entertainment_configuration/${areaId}`, {
        method: 'PUT',
        headers: {
          'hue-application-key': this.token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'start' }),
      });
      const data = await res.json();
      return !data.errors?.length;
    } catch (e) {
      console.error('[Hue] Entertainment activate failed:', e);
      return false;
    }
  }

  // Deactivate entertainment area
  async deactivateEntertainment(areaId: string): Promise<void> {
    try {
      await fetch(`https://${this.ip}/clip/v2/resource/entertainment_configuration/${areaId}`, {
        method: 'PUT',
        headers: {
          'hue-application-key': this.token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'stop' }),
      });
    } catch (e) {
      console.error('[Hue] Entertainment deactivate failed:', e);
    }
  }
}

// Singleton management
let bridgeInstance: HueBridge | null = null;

export function getHueBridge(): HueBridge | null {
  if (bridgeInstance) return bridgeInstance;
  const config = db.prepare(
    "SELECT ip, auth_token FROM device_config WHERE device_type = 'hue' LIMIT 1"
  ).get() as { ip: string; auth_token: string } | undefined;
  if (config?.ip && config?.auth_token) {
    bridgeInstance = new HueBridge(config.ip, config.auth_token);
  }
  return bridgeInstance;
}

export function setHueBridge(ip: string, token: string): HueBridge {
  bridgeInstance = new HueBridge(ip, token);
  return bridgeInstance;
}

export function clearHueBridge(): void {
  bridgeInstance = null;
}
