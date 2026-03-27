import { Router, Request, Response } from 'express';
import { getOnkyoReceiver, setOnkyoReceiver, OnkyoReceiver } from '../devices/onkyo.js';

const router = Router();

// Connect to Onkyo receiver
router.post('/api/onkyo/connect', async (req: Request, res: Response) => {
  try {
    const { ip } = req.body;
    if (!ip) {
      return res.status(400).json({ error: 'ip is required' });
    }
    const receiver = new OnkyoReceiver(ip);
    await receiver.connect();
    setOnkyoReceiver(receiver);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get current receiver state
router.get('/api/onkyo/state', async (_req: Request, res: Response) => {
  try {
    const receiver = getOnkyoReceiver();
    if (!receiver) {
      return res.status(400).json({ error: 'Onkyo receiver not connected' });
    }
    const state = await receiver.getState();
    res.json(state);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Set power state
router.put('/api/onkyo/power', async (req: Request, res: Response) => {
  try {
    const receiver = getOnkyoReceiver();
    if (!receiver) {
      return res.status(400).json({ error: 'Onkyo receiver not connected' });
    }
    const { on } = req.body;
    if (on === undefined) {
      return res.status(400).json({ error: 'on is required' });
    }
    await receiver.setPower(on);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Set volume level (0-80)
router.put('/api/onkyo/volume', async (req: Request, res: Response) => {
  try {
    const receiver = getOnkyoReceiver();
    if (!receiver) {
      return res.status(400).json({ error: 'Onkyo receiver not connected' });
    }
    const { level } = req.body;
    if (level === undefined) {
      return res.status(400).json({ error: 'level is required' });
    }
    if (level < 0 || level > 80) {
      return res.status(400).json({ error: 'level must be between 0 and 80' });
    }
    await receiver.setVolume(level);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Set input source
router.put('/api/onkyo/input', async (req: Request, res: Response) => {
  try {
    const receiver = getOnkyoReceiver();
    if (!receiver) {
      return res.status(400).json({ error: 'Onkyo receiver not connected' });
    }
    const { input } = req.body;
    if (!input) {
      return res.status(400).json({ error: 'input is required' });
    }
    await receiver.setInput(input);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Set mute state
router.put('/api/onkyo/mute', async (req: Request, res: Response) => {
  try {
    const receiver = getOnkyoReceiver();
    if (!receiver) {
      return res.status(400).json({ error: 'Onkyo receiver not connected' });
    }
    const { muted } = req.body;
    if (muted === undefined) {
      return res.status(400).json({ error: 'muted is required' });
    }
    await receiver.setMute(muted);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Set listening mode
router.put('/api/onkyo/mode', async (req: Request, res: Response) => {
  try {
    const receiver = getOnkyoReceiver();
    if (!receiver) {
      return res.status(400).json({ error: 'Onkyo receiver not connected' });
    }
    const { mode } = req.body;
    if (!mode) {
      return res.status(400).json({ error: 'mode is required' });
    }
    await receiver.setListeningMode(mode);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get available inputs
router.get('/api/onkyo/inputs', async (_req: Request, res: Response) => {
  try {
    const receiver = getOnkyoReceiver();
    if (!receiver) {
      return res.status(400).json({ error: 'Onkyo receiver not connected' });
    }
    const inputs = await receiver.getInputs();
    res.json(inputs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get available listening modes
router.get('/api/onkyo/modes', async (_req: Request, res: Response) => {
  try {
    const receiver = getOnkyoReceiver();
    if (!receiver) {
      return res.status(400).json({ error: 'Onkyo receiver not connected' });
    }
    const modes = await receiver.getListeningModes();
    res.json(modes);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
