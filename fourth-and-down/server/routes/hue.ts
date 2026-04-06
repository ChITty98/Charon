import { Router, Request, Response } from 'express';
import { getHueBridge, setHueBridge, HueBridge, rgbToXY } from '../devices/hue.js';
import { startEntertainment, stopEntertainment, isStreaming, getActiveAreaId, getChannelCount } from '../devices/hueEntertainment.js';
import db from '../db.js';

const router = Router();

// Discover Hue bridge on local network
router.get('/api/hue/discover', async (_req: Request, res: Response) => {
  try {
    const ip = await HueBridge.discover();
    res.json(ip ? { ip } : null);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Authenticate with Hue bridge (user must press button)
router.post('/api/hue/auth', async (req: Request, res: Response) => {
  try {
    const { ip } = req.body;
    if (!ip) {
      return res.status(400).json({ error: 'ip is required' });
    }
    const result = await HueBridge.authenticate(ip);
    if (result) {
      setHueBridge(ip, result.username);
      // Store clientkey in extra_config for entertainment API
      const extraConfig = JSON.stringify({ clientkey: result.clientkey });
      db.prepare("DELETE FROM device_config WHERE device_type = 'hue'").run();
      db.prepare("INSERT INTO device_config (device_type, name, ip, auth_token, extra_config) VALUES (?, ?, ?, ?, ?)").run(
        'hue', 'Hue Bridge', ip, result.username, extraConfig
      );
      res.json({ token: result.username, clientkey: result.clientkey });
    } else {
      res.json({ error: 'press_button' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get all lights
router.get('/api/hue/lights', async (_req: Request, res: Response) => {
  try {
    const bridge = getHueBridge();
    if (!bridge) {
      return res.status(400).json({ error: 'Hue bridge not connected' });
    }
    const lights = await bridge.getLights();
    res.json(lights);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get all groups/rooms
router.get('/api/hue/groups', async (_req: Request, res: Response) => {
  try {
    const bridge = getHueBridge();
    if (!bridge) {
      return res.status(400).json({ error: 'Hue bridge not connected' });
    }
    const groups = await bridge.getGroups();
    res.json(groups);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Set individual light state
router.put('/api/hue/lights/:id', async (req: Request, res: Response) => {
  try {
    const bridge = getHueBridge();
    if (!bridge) {
      return res.status(400).json({ error: 'Hue bridge not connected' });
    }
    const { id } = req.params;
    const { on, brightness, color } = req.body;

    const state: Record<string, any> = {};
    if (on !== undefined) state.on = on;
    if (brightness !== undefined) state.bri = Math.round((brightness / 100) * 254);
    if (color) {
      const [x, y] = rgbToXY(color);
      state.xy = [x, y];
    }

    await bridge.setLightState(id, state);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Set group state
router.put('/api/hue/groups/:id', async (req: Request, res: Response) => {
  try {
    const bridge = getHueBridge();
    if (!bridge) {
      return res.status(400).json({ error: 'Hue bridge not connected' });
    }
    const { id } = req.params;
    const { on, brightness, color } = req.body;

    const state: Record<string, any> = {};
    if (on !== undefined) state.on = on;
    if (brightness !== undefined) state.bri = Math.round((brightness / 100) * 254);
    if (color) {
      const [x, y] = rgbToXY(color);
      state.xy = [x, y];
    }

    await bridge.setGroupState(id, state);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Set all lights
router.put('/api/hue/all', async (req: Request, res: Response) => {
  try {
    const bridge = getHueBridge();
    if (!bridge) {
      return res.status(400).json({ error: 'Hue bridge not connected' });
    }
    const { on, brightness, color } = req.body;

    const state: Record<string, any> = {};
    if (on !== undefined) state.on = on;
    if (brightness !== undefined) state.bri = Math.round((brightness / 100) * 254);
    if (color) {
      const [x, y] = rgbToXY(color);
      state.xy = [x, y];
    }

    await bridge.setAllLights(state);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get entertainment areas
router.get('/api/hue/entertainment', async (_req: Request, res: Response) => {
  try {
    const bridge = getHueBridge();
    if (!bridge) {
      return res.status(400).json({ error: 'Hue bridge not connected' });
    }
    const areas = await bridge.getEntertainmentAreas();
    res.json(areas);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get stored clientkey
router.get('/api/hue/clientkey', async (_req: Request, res: Response) => {
  try {
    const row = db.prepare(
      "SELECT extra_config FROM device_config WHERE device_type = 'hue' LIMIT 1"
    ).get() as { extra_config: string } | undefined;
    if (row?.extra_config) {
      const config = JSON.parse(row.extra_config);
      res.json({ clientkey: config.clientkey || null });
    } else {
      res.json({ clientkey: null });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Start entertainment streaming
router.post('/api/hue/entertainment/start', async (req: Request, res: Response) => {
  try {
    const { areaId } = req.body;
    if (!areaId) return res.status(400).json({ error: 'areaId is required' });
    const result = await startEntertainment(areaId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Stop entertainment streaming
router.post('/api/hue/entertainment/stop', async (_req: Request, res: Response) => {
  try {
    await stopEntertainment();
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Check entertainment status
router.get('/api/hue/entertainment/status', (_req: Request, res: Response) => {
  res.json({ streaming: isStreaming(), areaId: getActiveAreaId(), channelCount: getChannelCount() });
});

export default router;
