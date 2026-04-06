import type { Server } from 'socket.io';
import { updateChannelColors, setAllChannels, isStreaming } from '../devices/hueEntertainment.js';

export function setupSocket(io: Server) {
  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Phone join — assigns to a game room
    socket.on('join-room', (roomCode: string) => {
      socket.join(roomCode);
      console.log(`[Socket] ${socket.id} joined room ${roomCode}`);
      socket.emit('room-joined', { room: roomCode });
    });

    // Relay device state changes to all connected clients
    socket.on('device-update', (data: any) => {
      socket.broadcast.emit('device-update', data);
    });

    // Scene events broadcast
    socket.on('scene-event', (data: any) => {
      io.emit('scene-event', data);
    });

    // Entertainment streaming — browser sends energy/color data
    socket.on('entertainment-colors', (data: { colors: Array<{ channel: number; r: number; g: number; b: number }> }) => {
      if (isStreaming() && data.colors) {
        updateChannelColors(data.colors);
      }
    });

    // Simplified: set all channels to same color (cinematic mode)
    let entAllLogCount = 0;
    socket.on('entertainment-all', (data: { r: number; g: number; b: number }) => {
      if (entAllLogCount < 5) {
        console.log(`[Socket] entertainment-all: r=${data.r} g=${data.g} b=${data.b}, streaming=${isStreaming()}`);
        entAllLogCount++;
      }
      if (isStreaming()) {
        setAllChannels(data.r, data.g, data.b);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });
}
