import { useState, useEffect, useCallback } from 'react';
import { StatusDot } from '../ui/StatusDot';
import { api } from '../../lib/api';
import { useSocket } from '../../lib/socket';

type DeviceStatus = 'connected' | 'disconnected' | 'connecting';

interface DevicesState {
  hue: DeviceStatus;
  nanoleaf: DeviceStatus;
  onkyo: DeviceStatus;
}

const defaultState: DevicesState = {
  hue: 'disconnected',
  nanoleaf: 'disconnected',
  onkyo: 'disconnected',
};

export function DeviceStatusBar() {
  const [devices, setDevices] = useState<DevicesState>(defaultState);

  const fetchStatus = useCallback(() => {
    api
      .get<DevicesState>('/devices/status')
      .then(setDevices)
      .catch(() => {
        /* server not ready yet */
      });
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 60_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  useSocket<Partial<DevicesState>>('device-update', (update) => {
    setDevices((prev) => ({ ...prev, ...update }));
  });

  return (
    <div className="h-[32px] bg-surface-900/80 backdrop-blur-sm flex items-center justify-end gap-5 px-4 border-b border-surface-700/50 shrink-0">
      <StatusDot status={devices.hue} label="Hue" />
      <StatusDot status={devices.nanoleaf} label="Nano" />
      <StatusDot status={devices.onkyo} label="Onkyo" />
    </div>
  );
}
