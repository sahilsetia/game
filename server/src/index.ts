import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { Server } from 'socket.io';

/** first non-internal IPv4 address — used so share links never say "localhost" */
function lanIp(): string | null {
  for (const ifList of Object.values(networkInterfaces())) {
    for (const i of ifList ?? []) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return null;
}
import { newGame, applyAction, currentPlayer, type Game, type Action } from '../../shared/src/index.js';

const PORT = Number(process.env.PORT ?? 3005);

interface Room {
  code: string;
  count: number;
  turnLimit: number;
  names: string[];
  sockets: string[]; // socket id per player index
  game: Game | null;
}

const rooms = new Map<string, Room>();

function makeCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

const httpServer = createServer();
const io = new Server(httpServer, { cors: { origin: '*' } });

io.on('connection', (socket) => {
  socket.on('create', ({ name, count, turnLimit }: { name: string; count: number; turnLimit: number }, cb) => {
    const code = makeCode();
    const room: Room = { code, count: Math.min(4, Math.max(2, count)), turnLimit: turnLimit || 30, names: [String(name).slice(0, 14)], sockets: [socket.id], game: null };
    rooms.set(code, room);
    socket.join(code);
    cb({ code, hostIp: lanIp() });
    io.to(code).emit('lobby', { code, names: room.names, count: room.count });
  });

  socket.on('join', ({ code, name }: { code: string; name: string }, cb) => {
    const room = rooms.get(String(code).toUpperCase());
    if (!room) return cb({ ok: false, error: 'Room not found' });
    if (room.game) return cb({ ok: false, error: 'Game already started' });
    if (room.names.length >= room.count) return cb({ ok: false, error: 'Room is full' });
    const id = room.names.length;
    room.names.push(String(name).slice(0, 14));
    room.sockets.push(socket.id);
    socket.join(room.code);
    cb({ ok: true, id });
    io.to(room.code).emit('lobby', { code: room.code, names: room.names, count: room.count });
    if (room.names.length === room.count) {
      room.game = newGame(room.names, room.names.map(() => false), room.turnLimit);
      room.game.log.unshift(`Playing with friends — room code ${room.code}.`);
      io.to(room.code).emit('state', { code: room.code, game: room.game });
    }
  });

  socket.on('action', ({ code, action }: { code: string; action: Action }) => {
    const room = rooms.get(String(code).toUpperCase());
    if (!room || !room.game) return;
    const g = room.game;
    // only the player whose move it is may act
    const actorId =
      g.phase === 'deciding' && action.type === 'decideRoll' ? action.player : g.order.length > 0 ? currentPlayer(g).id : -1;
    if (room.sockets[actorId] !== socket.id) {
      socket.emit('errorMsg', 'Not your turn');
      return;
    }
    try {
      room.game = applyAction(g, action);
      io.to(room.code).emit('state', { code: room.code, game: room.game });
    } catch (e) {
      socket.emit('errorMsg', (e as Error).message);
    }
  });

  socket.on('disconnect', () => {
    for (const room of rooms.values()) {
      const idx = room.sockets.indexOf(socket.id);
      if (idx >= 0 && !room.game) {
        room.names.splice(idx, 1);
        room.sockets.splice(idx, 1);
        io.to(room.code).emit('lobby', { code: room.code, names: room.names, count: room.count });
      }
    }
  });
});

httpServer.listen(PORT, () => console.log(`Business India server on :${PORT}`));
