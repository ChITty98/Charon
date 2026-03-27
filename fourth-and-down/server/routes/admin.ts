import { Router, Request, Response } from 'express';
import db from '../db.js';

const router = Router();

// Verify admin PIN
router.post('/api/admin/verify-pin', async (req: Request, res: Response) => {
  try {
    const { pin } = req.body;
    if (!pin) {
      return res.status(400).json({ error: 'pin is required' });
    }
    const row = db
      .prepare("SELECT value FROM admin_config WHERE key = 'admin_pin'")
      .get() as { value: string } | undefined;
    const storedPin = row?.value ?? '1234';
    res.json({ valid: pin === storedPin });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Change admin PIN
router.put('/api/admin/pin', async (req: Request, res: Response) => {
  try {
    const { currentPin, newPin } = req.body;
    if (!currentPin || !newPin) {
      return res.status(400).json({ error: 'currentPin and newPin are required' });
    }

    const row = db
      .prepare("SELECT value FROM admin_config WHERE key = 'admin_pin'")
      .get() as { value: string } | undefined;
    const storedPin = row?.value ?? '1234';

    if (currentPin !== storedPin) {
      return res.status(400).json({ error: 'Current PIN is incorrect' });
    }

    db.prepare(
      "INSERT INTO admin_config (key, value) VALUES ('admin_pin', ?) ON CONFLICT(key) DO UPDATE SET value = ?"
    ).run(newPin, newPin);

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get all admin config key-values
router.get('/api/admin/config', async (_req: Request, res: Response) => {
  try {
    const rows = db.prepare('SELECT key, value FROM admin_config').all() as {
      key: string;
      value: string;
    }[];
    const config: Record<string, string> = {};
    for (const row of rows) {
      config[row.key] = row.value;
    }
    res.json(config);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Set a config value
router.put('/api/admin/config', async (req: Request, res: Response) => {
  try {
    const { key, value } = req.body;
    if (!key || value === undefined) {
      return res.status(400).json({ error: 'key and value are required' });
    }
    db.prepare(
      'INSERT INTO admin_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
    ).run(key, value, value);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
