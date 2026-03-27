import { Router, Request, Response } from 'express';
import { getHueBridge, setHueBridge, HueBridge, rgbToXY } from '../devices/hue.js';

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
    const token = await HueBridge.authenticate(ip);
    if (token) {
      const bridge = new HueBridge(ip, token);
      setHueBridge(bridge);
      res.json({ token });
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

export default router;
