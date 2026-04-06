// Hue Entertainment API — DTLS streaming for real-time light control
// Sends HueStream V1 packets over DTLS to the bridge at ~25fps

import { dtls } from 'node-dtls-client';
import { getHueBridge } from './hue.js';
import db from '../db.js';

let dtlsSocket: any = null;
let activeAreaId: string | null = null;
let streamInterval: ReturnType<typeof setInterval> | null = null;
let lastFrame: Buffer | null = null;
let channelCount = 0;

// Current color state per channel (updated by WebSocket messages from browser)
const channelColors: Map<number, { r: number; g: number; b: number }> = new Map();

function getClientKey(): string | null {
  const row = db.prepare(
    "SELECT extra_config FROM device_config WHERE device_type = 'hue' LIMIT 1"
  ).get() as { extra_config: string } | undefined;
  if (!row?.extra_config) return null;
  try {
    const config = JSON.parse(row.extra_config);
    return config.clientkey || null;
  } catch {
    return null;
  }
}

let frameSequence = 0;

function buildHueStreamFrame(): Buffer {
  // HueStream V2 header (16 bytes base + 36 byte entertainment config UUID)
  const base = Buffer.from([
    0x48, 0x75, 0x65, 0x53, 0x74, 0x72, 0x65, 0x61, 0x6d, // "HueStream"
    0x02, 0x00,  // version 2.0
    frameSequence & 0xFF,  // sequence number (wraps at 255)
    0x00, 0x00,  // reserved
    0x00,        // 0x00 = RGB mode
    0x00,        // reserved
  ]);
  frameSequence = (frameSequence + 1) & 0xFF;

  // Entertainment configuration ID as 36-byte ASCII UUID (required for V2)
  const configId = Buffer.from(activeAreaId || '', 'ascii');

  const channels: Buffer[] = [];
  for (const [channelId, color] of channelColors) {
    channels.push(Buffer.from([
      channelId & 0xFF,            // channel ID (1 byte)
      color.r, color.r,            // R as 16-bit (duplicated byte)
      color.g, color.g,            // G as 16-bit
      color.b, color.b,            // B as 16-bit
    ]));
  }

  return Buffer.concat([base, configId, ...channels]);
}

export async function startEntertainment(areaId: string): Promise<{ ok: boolean; error?: string }> {
  // Always clean up any existing state
  if (dtlsSocket) {
    if (streamInterval) { clearInterval(streamInterval); streamInterval = null; }
    try { dtlsSocket.close(); } catch (_) { /* */ }
    dtlsSocket = null;
  }

  const bridge = getHueBridge();
  if (!bridge) return { ok: false, error: 'Hue bridge not connected' };

  const clientkey = getClientKey();
  if (!clientkey) return { ok: false, error: 'No clientkey — re-pair your Hue bridge in Settings' };

  const ip = bridge.getIp();
  const username = bridge.getToken();

  // Always deactivate first — bridge may still think a previous session is active
  await bridge.deactivateEntertainment(areaId).catch(() => {});
  channelColors.clear();
  activeAreaId = null;
  frameSequence = 0;

  // Activate the entertainment area via REST
  const activated = await bridge.activateEntertainment(areaId);
  if (!activated) return { ok: false, error: 'Failed to activate entertainment area' };

  // Fetch channel info
  try {
    const areas = await bridge.getEntertainmentAreas();
    const area = areas.find(a => a.id === areaId);
    if (area) {
      channelCount = area.channels.length;
      // Initialize all channels to dim warm white
      for (const ch of area.channels) {
        channelColors.set(ch.id, { r: 30, g: 20, b: 10 });
      }
      console.log(`[Entertainment] Initialized ${channelCount} channels: IDs = [${area.channels.map(c => c.id).join(', ')}]`);
    } else {
      console.log(`[Entertainment] Area ${areaId} not found in ${areas.length} areas`);
    }
  } catch (e) {
    console.error('[Entertainment] Failed to fetch area channels:', e);
  }

  // Open DTLS connection
  return new Promise((resolve) => {
    const pskIdentity = username;
    const pskKey = Buffer.from(clientkey, 'hex');

    try {
      const socket = dtls.createSocket({
        type: 'udp4',
        address: ip,
        port: 2100,
        psk: { [pskIdentity]: pskKey },
        ciphers: ['TLS_PSK_WITH_AES_128_GCM_SHA256'],
        timeout: 10000,
      });

      socket.on('connected', () => {
        console.log('[Entertainment] DTLS connected to', ip);
        dtlsSocket = socket;
        activeAreaId = areaId;

        // Stream at 25fps — send current color state continuously
        streamInterval = setInterval(() => {
          if (!dtlsSocket) return;
          try {
            const frame = buildHueStreamFrame();
            lastFrame = frame;
            dtlsSocket.send(frame);
          } catch (e) {
            console.error('[Entertainment] Send error:', e);
          }
        }, 40);

        resolve({ ok: true });
      });

      socket.on('error', (err: Error) => {
        console.error('[Entertainment] DTLS error:', err.message);
        cleanupSocket();
        resolve({ ok: false, error: `DTLS error: ${err.message}` });
      });

      socket.on('close', () => {
        console.log('[Entertainment] DTLS connection closed');
        cleanupSocket();
      });
    } catch (e: any) {
      console.error('[Entertainment] Failed to create DTLS socket:', e);
      resolve({ ok: false, error: e.message });
    }
  });
}

export async function stopEntertainment(): Promise<void> {
  if (streamInterval) {
    clearInterval(streamInterval);
    streamInterval = null;
  }
  if (dtlsSocket) {
    try { dtlsSocket.close(); } catch (_) { /* */ }
    dtlsSocket = null;
  }
  if (activeAreaId) {
    const bridge = getHueBridge();
    if (bridge) {
      await bridge.deactivateEntertainment(activeAreaId);
    }
    activeAreaId = null;
  }
  channelColors.clear();
  lastFrame = null;
  console.log('[Entertainment] Stopped');
}

// Called by Socket.IO when browser sends energy data
export function updateChannelColors(colors: Array<{ channel: number; r: number; g: number; b: number }>) {
  for (const c of colors) {
    channelColors.set(c.channel, { r: c.r, g: c.g, b: c.b });
  }
}

// Set all channels to the same color (simplified API for cinematic)
export function setAllChannels(r: number, g: number, b: number) {
  for (const [channelId] of channelColors) {
    channelColors.set(channelId, { r, g, b });
  }
}

export function isStreaming(): boolean {
  return dtlsSocket !== null && activeAreaId !== null;
}

export function getActiveAreaId(): string | null {
  return activeAreaId;
}

export function getChannelCount(): number {
  return channelCount;
}

function cleanupSocket() {
  if (streamInterval) { clearInterval(streamInterval); streamInterval = null; }
  dtlsSocket = null;
  activeAreaId = null;
}
