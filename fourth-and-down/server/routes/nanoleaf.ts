import { Router, Request, Response } from 'express';
import { getNanoleafClient, setNanoleafClient, NanoleafClient } from '../devices/nanoleaf.js';

const router = Router();

// Authenticate with Nanoleaf (hold power button for 5-7s first)
router.post('/api/nanoleaf/auth', async (req: Request, res: Response) => {
  try {
    const { ip } = req.body;
    if (!ip) {
      return res.status(400).json({ error: 'ip is required' });
    }
    const token = await NanoleafClient.authenticate(ip);
    if (token) {
      const client = new NanoleafClient(ip, token);
      setNanoleafClient(client);
      res.json({ token });
    } else {
      res.status(400).json({ error: 'Authentication failed. Hold power button for 5-7 seconds first.' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get panel info
router.get('/api/nanoleaf/info', async (_req: Request, res: Response) => {
  try {
    const client = getNanoleafClient();
    if (!client) {
      return res.status(400).json({ error: 'Nanoleaf not connected' });
    }
    const info = await client.getInfo();
    res.json(info);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get effects list
router.get('/api/nanoleaf/effects', async (_req: Request, res: Response) => {
  try {
    const client = getNanoleafClient();
    if (!client) {
      return res.status(400).json({ error: 'Nanoleaf not connected' });
    }
    const effects = await client.getEffects();
    res.json(effects);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Set panel state
router.put('/api/nanoleaf/state', async (req: Request, res: Response) => {
  try {
    const client = getNanoleafClient();
    if (!client) {
      return res.status(400).json({ error: 'Nanoleaf not connected' });
    }
    const { power, brightness, hue, saturation, effect } = req.body;

    if (power !== undefined) {
      await client.setPower(power);
    }
    if (brightness !== undefined) {
      await client.setBrightness(brightness);
    }
    if (hue !== undefined) {
      await client.setHue(hue);
    }
    if (saturation !== undefined) {
      await client.setSaturation(saturation);
    }
    if (effect !== undefined) {
      await client.setEffect(effect);
    }

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Identify/flash panels
router.post('/api/nanoleaf/identify', async (_req: Request, res: Response) => {
  try {
    const client = getNanoleafClient();
    if (!client) {
      return res.status(400).json({ error: 'Nanoleaf not connected' });
    }
    await client.identify();
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
