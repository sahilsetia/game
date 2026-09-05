import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { randomUUID } from 'node:crypto';
import { Server } from 'socket.io';
import {
  newGame,
  applyAction,
  currentPlayer,
  aiChooseAction,
  rollDie,
  type Game,
  type Action,
} from '../../shared/src/index.js';

/** first non-internal IPv4 address — used so share links never say "localhost" */
function lanIp(): string | null {
  for (const ifList of Object.values(networkInterfaces())) {
    for (const i of ifList ?? []) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return null;
}

const PORT = Number(process.env.PORT ?? 3005);
/** how long a disconnected player's seat is held before the computer takes over */
const TAKEOVER_MS = Number(process.env.TAKEOVER_MS ?? 60_000);
const AI_STEP_MS = Number(process.env.AI_STEP_MS ?? 1400);

interface Room {
  code: string;
  count: number;
  turnLimit: number;
  names: string[];
  sockets: string[]; // live socket id per player index
  keys: string[]; // secret rejoin key per player index
  connected: boolean[];
  ai: boolean[]; // true = computer is standing in for this seat
  deadlines: Record<number, number>; // playerId -> epoch ms when the computer takes over
  takeoverTimers: Map<number, NodeJS.Timeout>;
  aiTimer: NodeJS.Timeout | null;
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

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Business India server is running');
});
const io = new Server(httpServer, { cors: { origin: '*' } });

function broadcastConn(room: Room) {
  io.to(room.code).emit('conn', {
    code: room.code,
    connected: room.connected,
    ai: room.ai,
    deadlines: room.deadlines,
  });
}

function broadcastState(room: Room) {
  if (room.game) io.to(room.code).emit('state', { code: room.code, game: room.game });
}

/** while the actor whose move it is has a computer stand-in, keep playing for them */
function runAiIfNeeded(room: Room) {
  if (room.aiTimer) {
    clearTimeout(room.aiTimer);
    room.aiTimer = null;
  }
  const g = room.game;
  if (!g || g.phase === 'gameOver') return;
  let actor: number | null = null;
  if (g.phase === 'deciding' && g.decide) {
    const pending = g.decide.pool.filter((id) => g.decide!.rolls[id] === null);
    if (pending.length > 0) actor = pending[0];
  } else if (g.order.length > 0) {
    actor = currentPlayer(g).id;
  }
  if (actor === null || !room.ai[actor]) return;
  room.aiTimer = setTimeout(() => {
    room.aiTimer = null;
    const game = room.game;
    if (!game || game.phase === 'gameOver' || !room.ai[actor!]) return;
    try {
      const action: Action =
        game.phase === 'deciding'
          ? { type: 'decideRoll', player: actor!, d1: rollDie(), d2: rollDie() }
          : aiChooseAction(game);
      room.game = applyAction(game, action);
      broadcastState(room);
    } catch (e) {
      console.warn('stand-in AI action failed', e);
    }
    runAiIfNeeded(room);
  }, AI_STEP_MS);
}

function seatLost(room: Room, idx: number) {
  room.connected[idx] = false;
  room.deadlines[idx] = Date.now() + TAKEOVER_MS;
  broadcastConn(room);
  const timer = setTimeout(() => {
    room.takeoverTimers.delete(idx);
    if (room.connected[idx] || !room.game || room.game.phase === 'gameOver') return;
    room.ai[idx] = true;
    delete room.deadlines[idx];
    room.game.log.push(`${room.names[idx]} did not return in time — the computer plays for them until they rejoin.`);
    broadcastState(room);
    broadcastConn(room);
    runAiIfNeeded(room);
  }, TAKEOVER_MS);
  room.takeoverTimers.set(idx, timer);
}

function seatBack(room: Room, idx: number, socketId: string) {
  room.sockets[idx] = socketId;
  room.connected[idx] = true;
  const wasAi = room.ai[idx];
  room.ai[idx] = false;
  delete room.deadlines[idx];
  const t = room.takeoverTimers.get(idx);
  if (t) {
    clearTimeout(t);
    room.takeoverTimers.delete(idx);
  }
  if (room.game) {
    room.game.log.push(`${room.names[idx]} ${wasAi ? 'is back and takes over from the computer' : 'reconnected'}. ✔`);
    broadcastState(room);
  }
  broadcastConn(room);
  runAiIfNeeded(room);
}

io.on('connection', (socket) => {
  socket.on('create', ({ name, count, turnLimit }: { name: string; count: number; turnLimit: number }, cb) => {
    const code = makeCode();
    const key = randomUUID();
    const room: Room = {
      code,
      count: Math.min(4, Math.max(2, count)),
      turnLimit: turnLimit || 30,
      names: [String(name).slice(0, 14)],
      sockets: [socket.id],
      keys: [key],
      connected: [true],
      ai: [false],
      deadlines: {},
      takeoverTimers: new Map(),
      aiTimer: null,
      game: null,
    };
    rooms.set(code, room);
    socket.join(code);
    cb({ code, hostIp: lanIp(), id: 0, key });
    io.to(code).emit('lobby', { code, names: room.names, count: room.count });
  });

  socket.on('join', ({ code, name }: { code: string; name: string }, cb) => {
    const room = rooms.get(String(code).toUpperCase());
    if (!room) return cb({ ok: false, error: 'Room not found' });
    if (room.game) {
      // game already running: offer seats whose player is gone (computer or waiting)
      const claimable = room.names
        .map((n, i) => ({ id: i, name: n }))
        .filter(({ id }) => !room.connected[id] && !room.game!.players[id].bankrupt);
      return cb({ ok: false, running: true, claimable, error: claimable.length ? undefined : 'Game already started' });
    }
    if (room.names.length >= room.count) return cb({ ok: false, error: 'Room is full' });
    const id = room.names.length;
    const key = randomUUID();
    room.names.push(String(name).slice(0, 14));
    room.sockets.push(socket.id);
    room.keys.push(key);
    room.connected.push(true);
    room.ai.push(false);
    socket.join(room.code);
    cb({ ok: true, id, key });
    io.to(room.code).emit('lobby', { code: room.code, names: room.names, count: room.count });
    if (room.names.length === room.count) {
      room.game = newGame(room.names, room.names.map(() => false), room.turnLimit);
      room.game.log.unshift(`Playing with friends — room code ${room.code}.`);
      broadcastState(room);
      broadcastConn(room);
    }
  });

  /** reconnect with the secret key saved on the device */
  socket.on('rejoin', ({ code, playerId, key }: { code: string; playerId: number; key: string }, cb) => {
    const room = rooms.get(String(code).toUpperCase());
    if (!room || !room.game) return cb({ ok: false, error: 'That game no longer exists.' });
    if (room.keys[playerId] !== key) return cb({ ok: false, error: 'This seat belongs to another device.' });
    socket.join(room.code);
    seatBack(room, playerId, socket.id);
    cb({ ok: true, code: room.code, myId: playerId, game: room.game });
  });

  /** claim an abandoned seat from a new device (via room code / join link) */
  socket.on('claim', ({ code, playerId }: { code: string; playerId: number }, cb) => {
    const room = rooms.get(String(code).toUpperCase());
    if (!room || !room.game) return cb({ ok: false, error: 'That game no longer exists.' });
    if (room.connected[playerId]) return cb({ ok: false, error: 'That player is already connected.' });
    const key = randomUUID();
    room.keys[playerId] = key;
    socket.join(room.code);
    seatBack(room, playerId, socket.id);
    cb({ ok: true, code: room.code, myId: playerId, key, game: room.game });
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
      broadcastState(room);
      runAiIfNeeded(room);
    } catch (e) {
      socket.emit('errorMsg', (e as Error).message);
    }
  });

  socket.on('disconnect', () => {
    for (const room of rooms.values()) {
      const idx = room.sockets.indexOf(socket.id);
      if (idx < 0) continue;
      if (!room.game) {
        room.names.splice(idx, 1);
        room.sockets.splice(idx, 1);
        room.keys.splice(idx, 1);
        room.connected.splice(idx, 1);
        room.ai.splice(idx, 1);
        io.to(room.code).emit('lobby', { code: room.code, names: room.names, count: room.count });
      } else if (room.game.phase !== 'gameOver' && room.connected[idx]) {
        seatLost(room, idx);
      }
    }
  });
});

httpServer.listen(PORT, () => console.log(`Business India server on :${PORT} (takeover after ${TAKEOVER_MS / 1000}s)`));
