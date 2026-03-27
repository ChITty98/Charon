import { Router, Request, Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import SceneEngine from '../services/scene-engine.js';
import db from '../db.js';

const router = Router();

let sceneEngine: InstanceType<typeof SceneEngine> | null = null;

export function initSceneEngine(io: SocketIOServer) {
  sceneEngine = new SceneEngine({
    onEvent: (event: string, data: any) => {
      io.emit('scene:event', { event, data });
    },
  });
}

// List all scenes
router.get('/api/scenes', async (_req: Request, res: Response) => {
  try {
    const scenes = db.prepare('SELECT * FROM scenes ORDER BY name').all();
    res.json(scenes);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Activate a scene
router.post('/api/scenes/activate', async (req: Request, res: Response) => {
  try {
    if (!sceneEngine) {
      return res.status(500).json({ error: 'Scene engine not initialized' });
    }
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    await sceneEngine.activate(name);
    res.json({ ok: true, scene: name });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Cancel active scene
router.post('/api/scenes/cancel', async (_req: Request, res: Response) => {
  try {
    if (!sceneEngine) {
      return res.status(500).json({ error: 'Scene engine not initialized' });
    }
    await sceneEngine.cancel();
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get active scene
router.get('/api/scenes/active', async (_req: Request, res: Response) => {
  try {
    if (!sceneEngine) {
      return res.status(500).json({ error: 'Scene engine not initialized' });
    }
    const active = sceneEngine.getActive();
    res.json({ scene: active });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create a custom scene (admin)
router.post('/api/scenes', async (req: Request, res: Response) => {
  try {
    const { name, config, audio_file } = req.body;
    if (!name || !config) {
      return res.status(400).json({ error: 'name and config are required' });
    }
    const result = db
      .prepare('INSERT INTO scenes (name, config, audio_file) VALUES (?, ?, ?)')
      .run(name, JSON.stringify(config), audio_file || null);
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a custom scene (admin)
router.delete('/api/scenes/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = db.prepare('DELETE FROM scenes WHERE id = ?').run(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Scene not found' });
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
