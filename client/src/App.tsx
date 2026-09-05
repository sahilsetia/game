import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { newGame, applyAction, type Game, type Action } from '@game/shared';
import { GameScreen, type ConnInfo } from './screens/GameScreen';

const SERVER_URL = (import.meta as any).env?.VITE_SERVER_URL ?? `http://${window.location.hostname}:3005`;

/** saved seat so the player can rejoin a running game after reload / network switch */
interface Session {
  code: string;
  myId: number;
  key: string;
}
const SESSION_KEY = 'bi.session';
function saveSession(s: Session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {}
}
function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {}
}

type Screen =
  | { s: 'home' }
  | { s: 'setupLocal' }
  | { s: 'localGame'; game: Game }
  | { s: 'lobbyCreate' }
  | { s: 'lobbyJoin'; code: string }
  | { s: 'lobbyClaim'; code: string; claimable: { id: number; name: string }[] }
  | { s: 'lobbyWait'; code: string; names: string[]; count: number; myId: number; hostIp?: string | null }
  | { s: 'onlineGame'; code: string; game: Game; myId: number; conn?: ConnInfo; selfOffline?: boolean };

let socketSingleton: Socket | null = null;

export default function App() {
  const [screen, setScreen] = useState<Screen>({ s: 'home' });
  const [session, setSession] = useState<Session | null>(loadSession());

  // Deep link: ?join=CODE
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('join');
    if (code) setScreen({ s: 'lobbyJoin', code: code.toUpperCase() });
  }, []);

  function keepSession(s: Session) {
    saveSession(s);
    setSession(s);
  }
  function dropSession() {
    clearSession();
    setSession(null);
  }

  function socket(): Socket {
    if (!socketSingleton) {
      const sk = io(SERVER_URL, { transports: ['websocket', 'polling'] });
      socketSingleton = sk;
      sk.on('lobby', (data: { code: string; names: string[]; count: number }) => {
        setScreen((prev) => {
          if (prev.s !== 'lobbyWait' && prev.s !== 'lobbyCreate' && prev.s !== 'lobbyJoin') return prev;
          const myId = prev.s === 'lobbyWait' ? prev.myId : data.names.length - 1;
          const hostIp = prev.s === 'lobbyWait' ? prev.hostIp : undefined;
          return { s: 'lobbyWait', code: data.code, names: data.names, count: data.count, myId, hostIp };
        });
      });
      sk.on('state', (data: { code: string; game: Game }) => {
        setScreen((prev) => {
          const myId = prev.s === 'lobbyWait' || prev.s === 'onlineGame' ? prev.myId : 0;
          const conn = prev.s === 'onlineGame' ? prev.conn : undefined;
          return { s: 'onlineGame', code: data.code, game: data.game, myId, conn, selfOffline: false };
        });
        if (data.game.phase === 'gameOver') dropSession();
      });
      sk.on('conn', (data: { code: string; connected: boolean[]; ai: boolean[]; deadlines: Record<number, number> }) => {
        setScreen((prev) =>
          prev.s === 'onlineGame' && prev.code === data.code
            ? { ...prev, conn: { connected: data.connected, ai: data.ai, deadlines: data.deadlines } }
            : prev,
        );
      });
      sk.on('errorMsg', (msg: string) => alert(msg));
      // network dropped: show "reconnecting" and reclaim the seat automatically when back
      sk.on('disconnect', () => {
        setScreen((prev) => (prev.s === 'onlineGame' ? { ...prev, selfOffline: true } : prev));
      });
      sk.on('connect', () => {
        const s = loadSession();
        setScreen((prev) => {
          if (prev.s === 'onlineGame' && s && s.code === prev.code) {
            sk.emit('rejoin', s, (res: { ok: boolean }) => {
              if (!res.ok) {
                clearSession();
                alert('The game is no longer running on the server.');
                window.location.href = window.location.pathname;
              }
            });
            return { ...prev, selfOffline: false };
          }
          return prev;
        });
      });
    }
    return socketSingleton;
  }

  function resume(sess: Session) {
    socket().emit('rejoin', sess, (res: { ok: boolean; error?: string; code?: string; myId?: number; game?: Game }) => {
      if (res.ok && res.game) {
        setScreen({ s: 'onlineGame', code: res.code!, game: res.game, myId: res.myId! });
      } else {
        dropSession();
        alert(res.error ?? 'That game has ended.');
      }
    });
  }

  const goHome = () => {
    window.history.replaceState(null, '', window.location.pathname);
    socketSingleton?.disconnect();
    socketSingleton = null;
    setSession(loadSession());
    setScreen({ s: 'home' });
  };

  if (screen.s === 'home') {
    return (
      <div className="screen">
        <div style={{ textAlign: 'center' }}>
          <div className="title">
            Business <span>india</span>
          </div>
          <div className="subtitle">AMAZING ENTERTAINMENT FOR WHOLE FAMILY</div>
        </div>
        <div className="menu">
          {session && (
            <button className="resume" onClick={() => resume(session)}>
              ▶ Resume game {session.code}
            </button>
          )}
          <button className="primary" onClick={() => setScreen({ s: 'setupLocal' })}>
            Play with computer
          </button>
          <button className="primary" onClick={() => setScreen({ s: 'lobbyCreate' })}>
            Play with friends
          </button>
          <button onClick={() => setScreen({ s: 'lobbyJoin', code: '' })}>Join with room code</button>
        </div>
        <div className="credit">
          <div className="credit-name">Made by Sahil Setia</div>
          <div className="credit-more">✨ More games coming soon ✨</div>
        </div>
      </div>
    );
  }

  if (screen.s === 'setupLocal') {
    return <SetupLocal onStart={(g) => setScreen({ s: 'localGame', game: g })} onBack={goHome} />;
  }

  if (screen.s === 'localGame') {
    return (
      <GameScreen
        game={screen.game}
        aiLocal
        controls={(id) => !screen.game.players[id].isAI}
        dispatch={(a: Action) => {
          try {
            setScreen({ s: 'localGame', game: applyAction(screen.game, a) });
          } catch (e) {
            console.warn('ignored invalid action', a, e);
          }
        }}
        onExit={goHome}
      />
    );
  }

  if (screen.s === 'lobbyCreate') {
    return (
      <LobbyCreate
        onCreate={(name, count, turnLimit) => {
          socket().emit('create', { name, count, turnLimit }, (res: { code: string; hostIp?: string | null; id: number; key: string }) => {
            keepSession({ code: res.code, myId: res.id, key: res.key });
            setScreen({ s: 'lobbyWait', code: res.code, names: [name], count, myId: 0, hostIp: res.hostIp });
          });
        }}
        onBack={goHome}
      />
    );
  }

  if (screen.s === 'lobbyJoin') {
    return (
      <LobbyJoin
        code={screen.code}
        onJoin={(name, roomCode) => {
          socket().emit(
            'join',
            { code: roomCode, name },
            (res: { ok: boolean; id?: number; key?: string; error?: string; running?: boolean; claimable?: { id: number; name: string }[] }) => {
              if (res.ok) {
                keepSession({ code: roomCode, myId: res.id!, key: res.key! });
                setScreen({ s: 'lobbyWait', code: roomCode, names: [], count: 0, myId: res.id! });
              } else if (res.running && res.claimable && res.claimable.length > 0) {
                setScreen({ s: 'lobbyClaim', code: roomCode, claimable: res.claimable });
              } else {
                alert(res.error ?? 'Could not join');
              }
            },
          );
        }}
        onBack={goHome}
      />
    );
  }

  if (screen.s === 'lobbyClaim') {
    return (
      <div className="screen">
        <div className="card">
          <h2>Game {screen.code} is running</h2>
          <div className="hint">These players are away — take a seat back to continue their game:</div>
          {screen.claimable.map((c) => (
            <button
              key={c.id}
              className="primary"
              onClick={() => {
                socket().emit('claim', { code: screen.code, playerId: c.id }, (res: { ok: boolean; error?: string; myId?: number; key?: string; game?: Game }) => {
                  if (res.ok && res.game) {
                    keepSession({ code: screen.code, myId: res.myId!, key: res.key! });
                    setScreen({ s: 'onlineGame', code: screen.code, game: res.game, myId: res.myId! });
                  } else {
                    alert(res.error ?? 'Could not rejoin');
                  }
                });
              }}
            >
              Rejoin as {c.name}
            </button>
          ))}
          <button onClick={goHome}>Back</button>
        </div>
      </div>
    );
  }

  if (screen.s === 'lobbyWait') {
    const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const shareHost = isLocal && screen.hostIp ? screen.hostIp : window.location.hostname;
    const port = window.location.port ? `:${window.location.port}` : '';
    const link = `${window.location.protocol}//${shareHost}${port}${window.location.pathname}?join=${screen.code}`;
    const wa = `https://wa.me/?text=${encodeURIComponent(`Join my Business India game! ${link}`)}`;
    return (
      <div className="screen">
        <div className="card">
          <h2>Waiting for players…</h2>
          <div className="row">
            <span>Room code</span>
            <b style={{ fontSize: 22, letterSpacing: 3 }}>{screen.code}</b>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <input readOnly value={link} style={{ flex: 1, fontSize: 12 }} onFocus={(e) => e.currentTarget.select()} />
            <button onClick={() => navigator.clipboard.writeText(link)}>Copy</button>
          </div>
          <a href={wa} target="_blank" rel="noreferrer">
            <button className="primary" style={{ width: '100%' }}>
              Share on WhatsApp
            </button>
          </a>
          <div className="hint">
            If the link doesn't open on a friend's phone: they can open <b>{link.split('?')[0]}</b> in their browser, tap
            "Join with room code", and type <b>{screen.code}</b>.
          </div>
          <div>
            {screen.names.map((n, i) => (
              <div key={i} className="player-row">
                <span>
                  {i + 1}. {n} {i === screen.myId ? '(you)' : ''}
                </span>
              </div>
            ))}
            {screen.count > 0 && (
              <div className="hint">
                {screen.names.length} of {screen.count} joined — the game starts automatically when everyone is in.
              </div>
            )}
          </div>
          <button
            onClick={() => {
              dropSession();
              goHome();
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (screen.s === 'onlineGame') {
    return (
      <GameScreen
        game={screen.game}
        aiLocal={false}
        controls={(id) => id === screen.myId}
        dispatch={(a: Action) => socket().emit('action', { code: screen.code, action: a })}
        onExit={goHome}
        conn={screen.conn}
        selfOffline={screen.selfOffline}
        myId={screen.myId}
      />
    );
  }

  return null;
}

function SetupLocal({ onStart, onBack }: { onStart: (g: Game) => void; onBack: () => void }) {
  const [name, setName] = useState('Player 1');
  const [bots, setBots] = useState(1);
  const [turns, setTurns] = useState(50);
  return (
    <div className="screen">
      <div className="card">
        <h2>Play with computer</h2>
        <label>
          Your name
          <input style={{ width: '100%' }} value={name} onChange={(e) => setName(e.target.value)} maxLength={14} />
        </label>
        <label className="row">
          Computer players
          <select value={bots} onChange={(e) => setBots(Number(e.target.value))}>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </label>
        <label className="row">
          Turns per player
          <select value={turns} onChange={(e) => setTurns(Number(e.target.value))}>
            {[30, 40, 50, 60, 70, 80, 90].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <button
          className="primary"
          onClick={() => {
            const names = [name || 'You', ...Array.from({ length: bots }, (_, i) => `Computer ${i + 1}`)];
            const ai = [false, ...Array.from({ length: bots }, () => true)];
            onStart(newGame(names, ai, turns));
          }}
        >
          Start game
        </button>
        <button onClick={onBack}>Back</button>
      </div>
    </div>
  );
}

function LobbyCreate({ onCreate, onBack }: { onCreate: (name: string, count: number, turnLimit: number) => void; onBack: () => void }) {
  const [name, setName] = useState('');
  const [count, setCount] = useState(2);
  const [turns, setTurns] = useState(50);
  return (
    <div className="screen">
      <div className="card">
        <h2>Play with friends</h2>
        <label>
          Your name
          <input style={{ width: '100%' }} value={name} onChange={(e) => setName(e.target.value)} maxLength={14} placeholder="Enter your name" />
        </label>
        <label className="row">
          Total players (including you)
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {[2, 3, 4].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="row">
          Turns per player
          <select value={turns} onChange={(e) => setTurns(Number(e.target.value))}>
            {[30, 40, 50, 60, 70, 80, 90].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" disabled={!name.trim()} onClick={() => onCreate(name.trim(), count, turns)}>
          Create room and get link
        </button>
        <button onClick={onBack}>Back</button>
      </div>
    </div>
  );
}

function LobbyJoin({ code, onJoin, onBack }: { code: string; onJoin: (name: string, code: string) => void; onBack: () => void }) {
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState(code);
  return (
    <div className="screen">
      <div className="card">
        <h2>{code ? `Join game ${code}` : 'Join a game'}</h2>
        {!code && (
          <label>
            Room code (ask the host)
            <input
              style={{ width: '100%', textTransform: 'uppercase', letterSpacing: 3, fontWeight: 700 }}
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase().trim())}
              maxLength={5}
              placeholder="e.g. AX6BH"
            />
          </label>
        )}
        <label>
          Your name
          <input style={{ width: '100%' }} value={name} onChange={(e) => setName(e.target.value)} maxLength={14} placeholder="Enter your name" />
        </label>
        <button className="primary" disabled={!name.trim() || roomCode.length < 5} onClick={() => onJoin(name.trim(), roomCode)}>
          Join
        </button>
        <button onClick={onBack}>Back</button>
      </div>
    </div>
  );
}
