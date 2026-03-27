import { Router, Request, Response } from 'express';
import db from '../db.js';

const router = Router();

// List all configured devices
router.get('/api/devices', async (_req: Request, res: Response) => {
  try {
    const devices = db.prepare('SELECT * FROM device_config ORDER BY name').all();
    res.json(devices);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Save a new device
router.post('/api/devices', async (req: Request, res: Response) => {
  try {
    const { device_type, name, ip, auth_token, extra_config } = req.body;
    if (!device_type || !name || !ip) {
      return res.status(400).json({ error: 'device_type, name, and ip are required' });
    }
    const result = db
      .prepare(
        'INSERT INTO device_config (device_type, name, ip, auth_token, extra_config) VALUES (?, ?, ?, ?, ?)'
      )
      .run(
        device_type,
        name,
        ip,
        auth_token || null,
        extra_config ? JSON.stringify(extra_config) : null
      );
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update a device
router.put('/api/devices/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { device_type, name, ip, auth_token, extra_config } = req.body;

    const existing = db.prepare('SELECT * FROM device_config WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Device not found' });
    }

    db.prepare(
      'UPDATE device_config SET device_type = ?, name = ?, ip = ?, auth_token = ?, extra_config = ? WHERE id = ?'
    ).run(
      device_type ?? (existing as any).device_type,
      name ?? (existing as any).name,
      ip ?? (existing as any).ip,
      auth_token !== undefined ? auth_token : (existing as any).auth_token,
      extra_config ? JSON.stringify(extra_config) : (existing as any).extra_config,
      id
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a device
router.delete('/api/devices/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = db.prepare('DELETE FROM device_config WHERE id = ?').run(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Check connectivity of all configured devices
router.get('/api/devices/status', async (_req: Request, res: Response) => {
  try {
    const devices = db.prepare('SELECT * FROM device_config').all() as any[];
    const statuses = await Promise.all(
      devices.map(async (device) => {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3000);
          const response = await fetch(`http://${device.ip}`, {
            signal: controller.signal,
          });
          clearTimeout(timeout);
          return {
            id: device.id,
            name: device.name,
            device_type: device.device_type,
            online: response.ok || response.status < 500,
          };
        } catch {
          return {
            id: device.id,
            name: device.name,
            device_type: device.device_type,
            online: false,
          };
        }
      })
    );
    res.json(statuses);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
