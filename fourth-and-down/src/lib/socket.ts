import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

// Auto-detect server URL from current page location
const url = `${window.location.protocol}//${window.location.host}`;

export const socket: Socket = io(url, {
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: Infinity,
});

/**
 * Subscribe to a socket.io event inside a React component.
 * Automatically cleans up when the component unmounts.
 */
export function useSocket<T = unknown>(
  event: string,
  handler: (data: T) => void,
) {
  const savedHandler = useRef(handler);
  savedHandler.current = handler;

  useEffect(() => {
    const listener = (data: T) => savedHandler.current(data);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [event]);
}
