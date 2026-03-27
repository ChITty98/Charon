import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

// Import database (auto-initializes schema + seeds)
import './db.js';

// Import routes
import hueRoutes from './routes/hue.js';
import nanoleafRoutes from './routes/nanoleaf.js';
import onkyoRoutes from './routes/onkyo.js';
import scenesRoutes, { initSceneEngine } from './routes/scenes.js';
import devicesRoutes from './routes/devices.js';
import adminRoutes from './routes/admin.js';

// Import socket handler
import { setupSocket } from './socket/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3001');
const HOST = '0.0.0.0'; // Listen on all interfaces for LAN access

const app = express();
const server = createServer(app);

// Socket.io — allow connections from any origin on LAN
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use(hueRoutes);
app.use(nanoleafRoutes);
app.use(onkyoRoutes);
app.use(scenesRoutes);
app.use(devicesRoutes);
app.use(adminRoutes);

// Initialize scene engine with Socket.io
initSceneEngine(io);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// QR code for phone join URL
app.get('/api/qr', async (_req, res) => {
  try {
    const QRCode = await import('qrcode');
    const os = await import('os');
    const interfaces = os.networkInterfaces();
    let localIp = 'localhost';

    // Find LAN IP
    for (const iface of Object.values(interfaces)) {
      if (!iface) continue;
      for (const entry of iface) {
        if (entry.family === 'IPv4' && !entry.internal) {
          localIp = entry.address;
          break;
        }
      }
      if (localIp !== 'localhost') break;
    }

    const url = `http://${localIp}:${PORT}/join`;
    const qr = await QRCode.toDataURL(url, { width: 300, margin: 2 });
    res.json({ url, qr });
  } catch {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// Serve static frontend in production
const distPath = join(__dirname, '..', 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  // SPA fallback — serve index.html for all non-API routes
  app.get('*', (_req, res) => {
    res.sendFile(join(distPath, 'index.html'));
  });
}

// Setup WebSocket handlers
setupSocket(io);

// mDNS advertisement — lowerlevel.local
async function startMDNS() {
  try {
    const { Bonjour } = await import('bonjour-service');
    const bonjour = new Bonjour();
    bonjour.publish({
      name: 'Fourth & Down',
      type: 'http',
      port: PORT,
      host: 'lowerlevel.local',
    });
    console.log(`[mDNS] Advertising as lowerlevel.local:${PORT}`);
  } catch (err) {
    console.log('[mDNS] Could not start mDNS:', err);
  }
}

// Start server
server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  ╔═══════════════════════════════════════╗');
  console.log('  ║         FOURTH & DOWN                 ║');
  console.log('  ║         Entertainment Hub             ║');
  console.log(`  ║         http://localhost:${PORT}         ║`);
  console.log('  ╚═══════════════════════════════════════╝');
  console.log('');
  startMDNS();
});

export { io };
