import db from '../db.js';
import { getHueBridge, rgbToXY } from '../devices/hue.js';
import { getNanoleaf } from '../devices/nanoleaf.js';
import { getOnkyo } from '../devices/onkyo.js';

interface SceneConfig {
  sequence?: boolean;
  steps?: SceneStep[];
  theater_lights?: LightCommand;
  rec_room_lights?: LightCommand;
  bar_lights?: LightCommand;
  pool_lights?: LightCommand;
  nanoleaf?: NanoleafCommand;
  onkyo?: OnkyoCommand;
  mode?: string;
}

interface LightCommand {
  power?: boolean;
  brightness?: number;
  color?: string;
}

interface NanoleafCommand {
  power?: boolean;
  brightness?: number;
  effect?: string;
  color?: string;
}

interface OnkyoCommand {
  power?: boolean;
  input?: string;
  volume?: number;
}

interface SceneStep {
  type: string;
  delay: number;
  [key: string]: any;
}

type SceneEventCallback = (event: string, data: any) => void;

function hexToRgb(hex: string): [number, number, number] {
  hex = hex.replace('#', '');
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

export class SceneEngine {
  private onEvent?: SceneEventCallback;
  private activeScene: string | null = null;
  private abortController: AbortController | null = null;

  constructor(onEvent?: SceneEventCallback) {
    this.onEvent = onEvent;
  }

  private emit(event: string, data: any = {}) {
    this.onEvent?.(event, data);
  }

  async activateScene(sceneName: string): Promise<void> {
    // Cancel any running scene
    this.abortController?.abort();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    const scene = db.prepare('SELECT * FROM scenes WHERE name = ?').get(sceneName) as any;
    if (!scene) {
      this.emit('scene:error', { message: `Scene "${sceneName}" not found` });
      return;
    }

    this.activeScene = sceneName;
    this.emit('scene:activating', { name: sceneName });

    const config: SceneConfig = JSON.parse(scene.config);

    if (config.sequence && config.steps) {
      await this.runSequence(config.steps, signal);
    } else {
      await this.runParallel(config);
    }

    if (!signal.aborted) {
      this.emit('scene:active', { name: sceneName, mode: config.mode });
    }
  }

  private async runSequence(steps: SceneStep[], signal: AbortSignal): Promise<void> {
    for (const step of steps) {
      if (signal.aborted) return;
      if (step.delay > 0) {
        await this.delay(step.delay, signal);
        if (signal.aborted) return;
      }
      this.emit('scene:step', { type: step.type, ...step });
      await this.executeStep(step);
    }
  }

  private async runParallel(config: SceneConfig): Promise<void> {
    const tasks: Promise<void>[] = [];

    if (config.theater_lights) tasks.push(this.applyLightZone('theater', config.theater_lights));
    if (config.rec_room_lights) tasks.push(this.applyLightZone('rec_room', config.rec_room_lights));
    if (config.bar_lights) tasks.push(this.applyLightZone('bar', config.bar_lights));
    if (config.pool_lights) tasks.push(this.applyLightZone('pool', config.pool_lights));
    if (config.nanoleaf) tasks.push(this.applyNanoleaf(config.nanoleaf));
    if (config.onkyo) tasks.push(this.applyOnkyo(config.onkyo));

    await Promise.allSettled(tasks);
  }

  private async executeStep(step: SceneStep): Promise<void> {
    switch (step.type) {
      case 'audio':
        this.emit('scene:audio', { file: step.file });
        break;
      case 'lights':
        await this.applyLightZone(step.target, {
          brightness: step.brightness,
          color: step.color,
          power: step.brightness !== undefined ? step.brightness > 0 : undefined,
        });
        break;
      case 'nanoleaf':
        await this.applyNanoleaf(step);
        break;
      case 'onkyo':
        await this.applyOnkyo(step);
        break;
    }
  }

  private async applyLightZone(zone: string, cmd: LightCommand): Promise<void> {
    const hue = getHueBridge();
    if (!hue) {
      this.emit('scene:device-unavailable', { device: 'hue', zone });
      return;
    }

    try {
      // Get lights mapped to this zone
      const mappings = db.prepare(
        "SELECT light_id FROM light_zone_mapping WHERE zone = ? AND device_type = 'hue'"
      ).all(zone) as Array<{ light_id: string }>;

      const state: any = {};
      if (cmd.power !== undefined) state.on = cmd.power;
      if (cmd.brightness !== undefined) state.bri = cmd.brightness;
      if (cmd.color) {
        const [r, g, b] = hexToRgb(cmd.color);
        state.xy = rgbToXY(r, g, b);
      }

      if (mappings.length > 0) {
        // Apply to specific mapped lights
        for (const m of mappings) {
          await hue.setLightState(m.light_id, state);
        }
      } else if (zone === 'all') {
        // Apply to all lights
        await hue.setAllLights(state);
      }
    } catch (err) {
      this.emit('scene:error', { device: 'hue', zone, error: String(err) });
    }
  }

  private async applyNanoleaf(cmd: NanoleafCommand): Promise<void> {
    const nl = getNanoleaf();
    if (!nl) {
      this.emit('scene:device-unavailable', { device: 'nanoleaf' });
      return;
    }

    try {
      if (cmd.power !== undefined) await nl.setPower(cmd.power);
      if (cmd.brightness !== undefined) await nl.setBrightness(cmd.brightness);
      if (cmd.effect) await nl.setEffect(cmd.effect);
      if (cmd.color) {
        // Convert hex to HSL for Nanoleaf
        const [r, g, b] = hexToRgb(cmd.color);
        const max = Math.max(r, g, b) / 255;
        const min = Math.min(r, g, b) / 255;
        const l = (max + min) / 2;
        let h = 0, s = 0;
        if (max !== min) {
          const d = max - min;
          s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
          const rn = r / 255, gn = g / 255, bn = b / 255;
          if (rn === max) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
          else if (gn === max) h = ((bn - rn) / d + 2) * 60;
          else h = ((rn - gn) / d + 4) * 60;
        }
        await nl.setHueSat(Math.round(h), Math.round(s * 100));
      }
    } catch (err) {
      this.emit('scene:error', { device: 'nanoleaf', error: String(err) });
    }
  }

  private async applyOnkyo(cmd: OnkyoCommand): Promise<void> {
    const receiver = getOnkyo();
    if (!receiver) {
      this.emit('scene:device-unavailable', { device: 'onkyo' });
      return;
    }

    try {
      if (!receiver.isConnected()) {
        await receiver.connect();
      }
      if (cmd.power !== undefined) receiver.setPower(cmd.power);
      if (cmd.input) receiver.setInput(cmd.input);
      if (cmd.volume !== undefined) receiver.setVolume(cmd.volume);
    } catch (err) {
      this.emit('scene:error', { device: 'onkyo', error: String(err) });
    }
  }

  private delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  cancelScene(): void {
    this.abortController?.abort();
    this.activeScene = null;
    this.emit('scene:cancelled', {});
  }

  getActiveScene(): string | null {
    return this.activeScene;
  }
}
