import type { Server } from 'socket.io';

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

    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });
}
