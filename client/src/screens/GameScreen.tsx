import { useEffect, useRef, useState } from 'react';
import {
  SEQ,
  STATES,
  BANKS,
  GROUPS,
  BANK_STYLE,
  N_TILES,
  CHANCE_ODD,
  CHANCE_EVEN,
  CHEST_EVEN,
  CHEST_ODD,
  tileName,
  currentPlayer,
  rollDie,
  aiChooseAction,
  totalAssets,
  type Game,
  type Action,
  type GroupKey,
} from '@game/shared';
import { Board } from '../components/Board';
import { Dialogs } from '../components/Dialogs';
import { playStep, playDice, playBuy, playBuild, playSet, playJail, playCoin, playSell } from '../sound';
import { confettiBurst } from '../fx';

export interface ConnInfo {
  connected: boolean[];
  ai: boolean[];
  deadlines: Record<number, number>;
}

interface Props {
  game: Game;
  controls: (playerId: number) => boolean;
  dispatch: (a: Action) => void;
  onExit: () => void;
  aiLocal: boolean;
  conn?: ConnInfo; // online mode: who is connected / computer-controlled
  selfOffline?: boolean; // online mode: this device lost its connection
  myId?: number;
}

interface Banner {
  kind: 'buy' | 'build' | 'set' | 'jail' | 'start' | 'sell';
  text: string;
}

const STEP_MS = 345; // token walk speed (15% slower for readability)
const AI_DELAY_MS = 1265;

function setsOf(g: Game, playerId: number): number {
  const counts: Record<GroupKey, number> = { lb: 0, mg: 0, yl: 0, gr: 0 };
  for (const [idx, o] of Object.entries(g.own)) {
    const tile = SEQ[Number(idx)];
    if (o.owner === playerId && tile.t === 'state') counts[STATES[tile.name].group]++;
  }
  return (Object.values(counts) as number[]).filter((c) => c >= 3).length;
}

export function GameScreen({ game, controls, dispatch, onExit, aiLocal, conn, selfOffline, myId }: Props) {
  const [displayPos, setDisplayPos] = useState<Record<number, number>>({});
  const [animating, setAnimating] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [diceShow, setDiceShow] = useState<[number, number] | null>(null);
  const [now, setNow] = useState(Date.now());
  const [inspect, setInspect] = useState<number | null>(null);
  const [recap, setRecap] = useState<string[] | null>(null);
  const [tileInfo, setTileInfo] = useState<number | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [scale, setScale] = useState(1);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Fit the whole 656px board into whatever width the screen offers — no scrolling.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setScale(Math.min(1, el.clientWidth / 656));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const prevRef = useRef<Game | null>(null);
  const timers = useRef<number[]>([]);
  const lastSeenLog = useRef(0);
  const wasMyTurn = useRef(false);

  // When my turn starts, show everything the other players did since my last turn.
  useEffect(() => {
    if (game.phase === 'deciding' || game.order.length === 0) {
      lastSeenLog.current = game.log.length;
      wasMyTurn.current = false;
      return;
    }
    if (game.phase === 'gameOver') return;
    const cur = currentPlayer(game);
    if (controls(cur.id)) {
      if (!wasMyTurn.current) {
        const lines = game.log
          .slice(lastSeenLog.current)
          .filter((l) => !/for turn order|Turn order:|decide the turn/.test(l));
        if (lines.length > 0) setRecap(lines.slice(-12));
        wasMyTurn.current = true;
      }
    } else if (wasMyTurn.current || lastSeenLog.current === 0) {
      lastSeenLog.current = game.log.length;
      wasMyTurn.current = false;
    }
  }, [game, controls]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Dice tumble: cycle random faces briefly before settling on the real roll.
  useEffect(() => {
    if (!game.dice) return;
    let frames = 0;
    const iv = window.setInterval(() => {
      frames += 1;
      if (frames >= 6) {
        window.clearInterval(iv);
        setDiceShow(null); // fall back to the real dice
      } else {
        setDiceShow([rollDie(), rollDie()]);
      }
    }, 95);
    return () => window.clearInterval(iv);
  }, [game.dice]);

  // tick every second while somebody is disconnected (for the takeover countdown)
  const anyWaiting = conn ? conn.connected.some((c, i) => !c && !conn.ai[i] && !game.players[i].bankrupt) : false;
  useEffect(() => {
    if (!anyWaiting) return;
    const iv = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(iv);
  }, [anyWaiting]);

  // Watch every state change: animate movement step by step, celebrate buys/builds/sets.
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = game;
    if (!prev || prev.players.length !== game.players.length) {
      setDisplayPos(Object.fromEntries(game.players.map((p) => [p.id, p.pos])));
      return;
    }

    const events: Banner[] = [];
    for (const [idxStr, o] of Object.entries(game.own)) {
      const idx = Number(idxStr);
      const po = prev.own[idx];
      const who = game.players[o.owner].name;
      if (!po || po.owner !== o.owner) {
        events.push({ kind: 'buy', text: `${who} bought ${tileName(idx)}${o.level > (po?.level ?? -1) && o.level === 1 && !po ? ' + built a house' : ''}! 🎉` });
      } else if (po.level < o.level) {
        events.push({
          kind: 'build',
          text: `${who} built ${o.level === 4 ? 'a HOTEL' : `house ${o.level}`} on ${tileName(idx)}! 🏗️`,
        });
      } else if (po.level > o.level) {
        events.push({ kind: 'sell', text: `${who} sold a build on ${tileName(idx)} back to the bank. 🔨` });
      }
    }
    // sites sold back to the bank (in prev, gone now)
    const soldSites: string[] = [];
    let seller = '';
    for (const [idxStr, po] of Object.entries(prev.own)) {
      if (!game.own[Number(idxStr)]) {
        soldSites.push(tileName(Number(idxStr)));
        seller = prev.players[po.owner].name;
      }
    }
    if (soldSites.length > 2) {
      events.push({ kind: 'sell', text: `${seller} sold ${soldSites.length} properties back to the bank — all available to buy again! 🏷️` });
    } else {
      for (const nm of soldSites) {
        events.push({ kind: 'sell', text: `${seller} sold ${nm} — it's available to buy again! 🏷️` });
      }
    }
    for (const p of game.players) {
      if (setsOf(game, p.id) > setsOf(prev, p.id)) {
        events.push({ kind: 'set', text: `${p.name} owns 3 states of one color — rents there are DOUBLED! 👑` });
      }
      if (!prev.players[p.id].inJail && p.inJail) {
        events.push({ kind: 'jail', text: `${p.name} is in JAIL! Pay ₹1000, roll doubles, or wait 5 turns. 🔒` });
      }
    }

    const fireEvents = () => {
      let delay = 200;
      for (const e of events) {
        const t = window.setTimeout(() => {
          setBanner(e);
          if (e.kind === 'buy') {
            playBuy();
            confettiBurst();
          } else if (e.kind === 'build') {
            playBuild();
            confettiBurst();
          } else if (e.kind === 'set') {
            playSet();
            confettiBurst(true);
          } else if (e.kind === 'jail') {
            playJail();
          } else if (e.kind === 'sell') {
            playSell();
          }
          const t2 = window.setTimeout(() => setBanner(null), 2400);
          timers.current.push(t2);
        }, delay);
        timers.current.push(t);
        delay += 2700;
      }
    };

    // movement: animate the mover tile-by-tile with a tick per step
    const mover = game.players.find((p) => prev.players[p.id].pos !== p.pos);
    if (mover) {
      const from = prev.players[mover.id].pos;
      const to = mover.pos;
      const steps = (to - from + N_TILES) % N_TILES;
      const rolled = game.dice && prev.players[mover.id].pos + (game.dice[0] + game.dice[1]) >= 0; // dice-based move
      if (steps > 0 && steps <= 12 && rolled) {
        playDice();
        setAnimating(true);
        const crossesStart = from + steps >= N_TILES;
        for (let s = 1; s <= steps; s++) {
          const t = window.setTimeout(() => {
            playStep();
            const tileNow = (from + s) % N_TILES;
            if (crossesStart && tileNow === 0) playCoin();
            setDisplayPos((dp) => ({ ...dp, [mover.id]: tileNow }));
            if (s === steps) {
              setAnimating(false);
              fireEvents();
            }
          }, s * STEP_MS);
          timers.current.push(t);
        }
        return;
      }
      setDisplayPos((dp) => ({ ...dp, [mover.id]: to }));
    }
    fireEvents();
  }, [game]);

  // Computer players act automatically (local mode) — but never while animating.
  useEffect(() => {
    if (!aiLocal || animating) return;
    let actor: number | null = null;
    if (game.phase === 'deciding' && game.decide) {
      const pending = game.decide.pool.filter((id) => game.decide!.rolls[id] === null);
      if (pending.length > 0 && game.players[pending[0]].isAI) actor = pending[0];
    } else if (game.phase !== 'gameOver') {
      const p = currentPlayer(game);
      if (p.isAI) actor = p.id;
    }
    if (actor === null) return;
    const t = window.setTimeout(() => {
      if (game.phase === 'deciding') {
        dispatch({ type: 'decideRoll', player: actor!, d1: rollDie(), d2: rollDie() });
      } else {
        dispatch(aiChooseAction(game));
      }
    }, AI_DELAY_MS);
    timers.current.push(t);
    return () => clearTimeout(t);
  }, [game, aiLocal, animating, dispatch]);

  const p = game.phase !== 'deciding' && game.order.length > 0 ? currentPlayer(game) : null;
  const myTurn = p ? controls(p.id) : false;

  // properties listed in board color order (light blue → magenta → yellow → green → bank tickets)
  const groupRank: Record<string, number> = { lb: 0, mg: 1, yl: 2, gr: 3 };
  const ownedSorted = (playerId: number) =>
    Object.entries(game.own)
      .filter(([, o]) => o.owner === playerId)
      .sort(([a], [b]) => {
        const ta = SEQ[Number(a)];
        const tb = SEQ[Number(b)];
        const ra = ta.t === 'state' ? groupRank[STATES[ta.name].group] : 4;
        const rb = tb.t === 'state' ? groupRank[STATES[tb.name].group] : 4;
        return ra - rb || Number(a) - Number(b);
      });
  const rowTint = (idx: number) => {
    const tile = SEQ[idx];
    const g = tile.t === 'state' ? GROUPS[STATES[tile.name].group] : null;
    return {
      background: g ? g.fill : BANK_STYLE.fill,
      color: g ? g.dark : BANK_STYLE.dark,
      borderLeft: `4px solid ${g ? g.strong : BANK_STYLE.strong}`,
      borderRadius: 6,
      padding: '4px 8px',
      margin: '3px 0',
      cursor: 'pointer',
    } as React.CSSProperties;
  };

  return (
    <div className="layout">
      <div className="board-wrap" ref={wrapRef} style={{ height: Math.round(656 * scale) }}>
        <div style={{ width: 656, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <Board
            game={game}
            displayPos={displayPos}
            currentId={p?.id ?? null}
            compact={scale < 0.8}
            onTile={setTileInfo}
            onRules={() => setShowRules(true)}
          />
        </div>
      </div>
      <div className="side">
        <div className="panel">
          <h3>Dice {p && `— turn ${p.turns + 1} of ${game.turnLimit}`}</h3>
          <div className="dicebar">
            <div className={`die ${diceShow ? 'tumble' : game.dice ? 'pop' : ''}`} key={`d1-${game.dice?.[0]}-${game.log.length}`}>
              {diceShow ? diceShow[0] : game.dice ? game.dice[0] : '–'}
            </div>
            <div className={`die ${diceShow ? 'tumble' : game.dice ? 'pop' : ''}`} key={`d2-${game.dice?.[1]}-${game.log.length}`}>
              {diceShow ? diceShow[1] : game.dice ? game.dice[1] : '–'}
            </div>
            {p && game.phase === 'awaitRoll' && myTurn && !animating && !recap && (
              <button className="primary" onClick={() => dispatch({ type: 'roll', d1: rollDie(), d2: rollDie() })}>
                Roll dice
              </button>
            )}
            {p && !myTurn && <span className="hint">{p.name} is playing…</span>}
          </div>
        </div>

        <details className="panel" open>
          <summary>Players — tap a name to see their property</summary>
          {game.players.map((pl) => {
            const ownedEntries = Object.entries(game.own).filter(([, o]) => o.owner === pl.id);
            const sites = ownedEntries.length;
            const builds = ownedEntries.reduce((sum, [, o]) => sum + o.level, 0);
            const open = inspect === pl.id;
            return (
              <div key={pl.id} style={{ marginBottom: 4 }}>
                <div
                  className={`player-row clickable ${p?.id === pl.id ? 'current' : ''}`}
                  onClick={() => setInspect(open ? null : pl.id)}
                >
                  <span className="dot" style={{ background: pl.color }} />
                  <span>
                    {pl.name}
                    {pl.isAI || conn?.ai[pl.id] ? ' 🤖' : ''}
                    {conn && !conn.connected[pl.id] && !conn.ai[pl.id] && !pl.bankrupt ? ' 📴' : ''}
                    {pl.bankrupt ? ' (out)' : pl.inJail ? ' 🔒 jail' : ''}
                  </span>
                  <span className="cash">₹{pl.cash}</span>
                  <span className="chev">{open ? '▾' : '▸'}</span>
                </div>
                {!pl.bankrupt && (
                  <div className="hint" style={{ paddingLeft: 30 }}>
                    Total assets ₹{totalAssets(game, pl.id)} · {sites} {sites === 1 ? 'site' : 'sites'} · {builds}{' '}
                    {builds === 1 ? 'build' : 'builds'}
                  </div>
                )}
                {open && (
                  <div className="assets-detail">
                    <div className="prop-row" style={{ fontWeight: 600 }}>
                      <span>Cash</span>
                      <span className="spacer" />
                      <span>₹{pl.cash}</span>
                    </div>
                    {ownedEntries.length === 0 && <div className="hint">No sites owned yet.</div>}
                    {ownedSorted(pl.id).map(([idxStr, o]) => {
                      const idx = Number(idxStr);
                      const tile = SEQ[idx];
                      const isState = tile.t === 'state';
                      const value = isState
                        ? STATES[(tile as any).name].price + o.level * STATES[(tile as any).name].houseCost
                        : BANKS[(tile as any).name].price;
                      return (
                        <div key={idx} className="prop-row" style={rowTint(idx)} onClick={() => setTileInfo(idx)} title="Tap to see the full ticket">
                          <span style={{ fontWeight: 600 }}>
                            {tileName(idx)}
                            {o.level > 0 && <> {o.level === 4 ? '🏨' : `🏠${o.level > 1 ? `×${o.level}` : ''}`}</>}
                          </span>
                          <span className="spacer" />
                          <span>₹{value}</span>
                        </div>
                      );
                    })}
                    <div className="prop-row" style={{ fontWeight: 700, borderTop: '1px solid #e3decf', marginTop: 4, paddingTop: 6 }}>
                      <span>Total assets</span>
                      <span className="spacer" />
                      <span>₹{totalAssets(game, pl.id)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </details>

        {p && myTurn && (
          <details className="panel" open>
            <summary>Your properties (sell anytime, same price)</summary>
            {Object.entries(game.own).filter(([, o]) => o.owner === p.id).length === 0 && (
              <div className="hint">Nothing owned yet.</div>
            )}
            {ownedSorted(p.id).map(([idxStr, o]) => {
              const idx = Number(idxStr);
              const tile = SEQ[idx];
              const isState = tile.t === 'state';
              return (
                <div key={idx} className="prop-row" style={rowTint(idx)}>
                  <span style={{ fontWeight: 600 }} onClick={() => setTileInfo(idx)} title="Tap to see the full ticket">
                    {tileName(idx)}
                    {o.level > 0 ? ` · ${o.level === 4 ? '🏨' : `🏠${o.level > 1 ? `×${o.level}` : ''}`}` : ''}
                  </span>
                  <span className="spacer" />
                  {isState && o.level > 0 && (
                    <button onClick={(e) => { e.stopPropagation(); dispatch({ type: 'sellHouse', tile: idx }); }}>Sell build</button>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); dispatch({ type: 'sellSite', tile: idx }); }}>Sell</button>
                </div>
              );
            })}
          </details>
        )}

        <details className="panel">
          <summary>Game log</summary>
          <div className="log">
            {[...game.log].reverse().map((l, i) => (
              <div key={game.log.length - i}>{l}</div>
            ))}
          </div>
        </details>
        <button onClick={onExit}>Leave game</button>
      </div>

      {banner && (
        <div className={`banner banner-${banner.kind}`} key={banner.text}>
          {banner.text}
        </div>
      )}
      {showRules && (
        <div className="overlay" onClick={() => setShowRules(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '86vh', overflow: 'auto' }}>
            <h2>Chance and Community chest</h2>
            <div className="hint">The dice total decides what happens — find your number below.</div>
            {[
              ['Chance — odd total: receive from the bank', CHANCE_ODD],
              ['Chance — even total: pay to the bank', CHANCE_EVEN],
              ['Community chest — even total: receive from the bank', CHEST_EVEN],
              ['Community chest — odd total: pay to the bank', CHEST_ODD],
            ].map(([title, list]) => (
              <div key={title as string}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#b03030', marginBottom: 4 }}>{title as string}</div>
                {(list as typeof CHANCE_ODD).map((r) => (
                  <div key={r.n} className="prop-row">
                    <span style={{ fontWeight: 700, minWidth: 22 }}>{r.n}.</span>
                    <span>{r.text}</span>
                  </div>
                ))}
              </div>
            ))}
            <button className="primary" onClick={() => setShowRules(false)}>Close</button>
          </div>
        </div>
      )}
      {tileInfo !== null && (
        <div className="overlay" onClick={() => setTileInfo(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            {(() => {
              const idx = tileInfo;
              const tile = SEQ[idx];
              const o = game.own[idx];
              const ownerLine = o ? (
                <div className="hint">
                  Owned by <b style={{ color: game.players[o.owner].color }}>{game.players[o.owner].name}</b>
                  {o.level > 0 && <> · {o.level === 4 ? 'hotel' : `${o.level} house${o.level > 1 ? 's' : ''}`}</>}
                </div>
              ) : tile.t === 'state' || tile.t === 'bank' ? (
                <div className="hint">Not owned yet — land here to buy it.</div>
              ) : null;
              if (tile.t === 'state') {
                const s = STATES[tile.name];
                return (
                  <>
                    <h2>{tile.name} — ₹{s.price}</h2>
                    <div className="hint">{s.landmark} · {s.city}</div>
                    {ownerLine}
                    <div>
                      {[['Rent site only', s.rents[0]], ['With 1 house', s.rents[1]], ['With 2 houses', s.rents[2]], ['With 3 houses', s.rents[3]], ['With hotel', s.rents[4]], ['Cost of house / hotel', s.houseCost]].map(([a, b]) => (
                        <div key={a as string} className="prop-row">
                          <span>{a}</span>
                          <span className="spacer" />
                          <span>₹{b}</span>
                        </div>
                      ))}
                      <div className="hint" style={{ marginTop: 4 }}>Rent doubles when the owner has 3 states of this color.</div>
                    </div>
                    <button className="primary" onClick={() => setTileInfo(null)}>Close</button>
                  </>
                );
              }
              if (tile.t === 'bank') {
                const b = BANKS[tile.name];
                return (
                  <>
                    <h2>{tile.name} — ₹{b.price}</h2>
                    {ownerLine}
                    <div className="hint">
                      {b.rent.kind === 'fixed'
                        ? `Rent ₹${b.rent.base} — ₹${b.rent.base * 2} if the owner also has ${b.pair}.`
                        : `Rent ${b.rent.mult} × dice throw — ${b.rent.mult * 2} × dice if the owner also has ${b.pair}.`}
                    </div>
                    <button className="primary" onClick={() => setTileInfo(null)}>Close</button>
                  </>
                );
              }
              return (
                <>
                  <h2>{tile.label}</h2>
                  <div className="hint">
                    {tile.t === 'start' && 'Collect ₹3000 every time you cross or land on START.'}
                    {tile.t === 'jail' && 'Land here and you are in jail — pay ₹1000 before rolling, roll doubles, or wait 5 turns.'}
                    {tile.t === 'rest' && 'Rest house — nothing happens when you land here.'}
                    {tile.t === 'resort' && 'Resort picnic — nothing happens when you land here.'}
                    {tile.t === 'incomeTax' && 'Pay ₹100 for every site you own.'}
                    {tile.t === 'wealthTax' && 'Pay ₹100 for every house and hotel you own.'}
                    {tile.t === 'chance' && 'Chance: odd dice total wins money from the bank, even total pays the bank (10 = jail, 12 = rest house).'}
                    {tile.t === 'chest' && 'Community chest: even dice total wins money, odd total pays (3 = jail).'}
                  </div>
                  <button className="primary" onClick={() => setTileInfo(null)}>Close</button>
                </>
              );
            })()}
          </div>
        </div>
      )}
      {!animating && recap && (
        <div className="overlay">
          <div className="dialog">
            <h2>While you were waiting…</h2>
            <div className="recap">
              {recap.map((l, i) => (
                <div key={i} className={`recap-line ${/sold/i.test(l) ? 'recap-sell' : ''}`}>
                  {/sold/i.test(l) ? '🏷️ ' : ''}
                  {l}
                </div>
              ))}
            </div>
            <button className="primary" onClick={() => setRecap(null)}>
              OK — start my turn
            </button>
          </div>
        </div>
      )}
      {selfOffline && (
        <div className="overlay">
          <div className="dialog" style={{ textAlign: 'center' }}>
            <div className="spinner" />
            <h2>Reconnecting…</h2>
            <div className="hint">
              Your connection dropped. Hold on — the moment your internet is back you rejoin this game automatically. Your seat is
              held for 1 minute; after that the computer plays for you until you return.
            </div>
          </div>
        </div>
      )}
      {!selfOffline &&
        (() => {
          if (!conn) return null;
          const waiting = game.players.filter((pl) => !pl.bankrupt && !conn.connected[pl.id] && !conn.ai[pl.id] && pl.id !== myId);
          if (waiting.length === 0) return null;
          const w = waiting[0];
          const remain = Math.max(0, Math.ceil(((conn.deadlines[w.id] ?? now) - now) / 1000));
          const mm = Math.floor(remain / 60);
          const ss = String(remain % 60).padStart(2, '0');
          return (
            <div className="overlay">
              <div className="dialog" style={{ textAlign: 'center' }}>
                <div className="spinner" />
                <h2>Waiting for {waiting.map((x) => x.name).join(' and ')} to reconnect…</h2>
                <div style={{ fontSize: 34, fontWeight: 800, color: '#1f4e6e' }}>
                  {mm}:{ss}
                </div>
                <div className="hint">
                  They can rejoin from the same device, the join link, or the room code. If they are not back when the timer ends,
                  the computer takes their seat and the game continues — they can still rejoin anytime after that.
                </div>
              </div>
            </div>
          );
        })()}
      {!animating && !recap && !selfOffline && !anyWaiting && (
        <Dialogs game={game} controls={controls} dispatch={dispatch} onExit={onExit} />
      )}
    </div>
  );
}
