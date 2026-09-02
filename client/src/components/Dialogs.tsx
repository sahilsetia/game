import { useMemo } from 'react';
import {
  SEQ,
  STATES,
  BANKS,
  GROUPS,
  BANK_STYLE,
  JAIL_FINE,
  tileName,
  currentPlayer,
  rollDie,
  totalAssets,
  type Game,
  type Action,
} from '@game/shared';

interface Props {
  game: Game;
  controls: (playerId: number) => boolean; // does this device control that player?
  dispatch: (a: Action) => void;
  onExit: () => void;
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="overlay">
      <div className="dialog" style={{ maxHeight: '88vh', overflow: 'auto' }}>{children}</div>
    </div>
  );
}

/** list of the player's assets with sell buttons — used inside popups when cash is short.
 *  Rows are tinted with the board color and grouped by color, and sites that are part of a
 *  completed 3-color set are marked so you don't break your double-rent combination by mistake. */
function SellAssets({ game, playerId, dispatch }: { game: Game; playerId: number; dispatch: (a: Action) => void }) {
  const groupRank: Record<string, number> = { lb: 0, mg: 1, yl: 2, gr: 3 };
  const groupCount: Record<string, number> = { lb: 0, mg: 0, yl: 0, gr: 0 };
  for (const [idxStr, o] of Object.entries(game.own)) {
    const tile = SEQ[Number(idxStr)];
    if (o.owner === playerId && tile.t === 'state') groupCount[STATES[tile.name].group]++;
  }
  const owned = Object.entries(game.own)
    .filter(([, o]) => o.owner === playerId)
    .sort(([a], [b]) => {
      const ta = SEQ[Number(a)];
      const tb = SEQ[Number(b)];
      const ra = ta.t === 'state' ? groupRank[STATES[ta.name].group] : 4;
      const rb = tb.t === 'state' ? groupRank[STATES[tb.name].group] : 4;
      return ra - rb || Number(a) - Number(b);
    });
  if (owned.length === 0) return <div className="hint">You own nothing to sell.</div>;
  return (
    <div>
      <div className="hint" style={{ fontWeight: 700, marginBottom: 4 }}>Sell assets to raise cash (same price you paid):</div>
      {owned.map(([idxStr, o]) => {
        const idx = Number(idxStr);
        const tile = SEQ[idx];
        const isState = tile.t === 'state';
        const g = isState ? GROUPS[STATES[(tile as any).name].group] : null;
        const inSet = isState && groupCount[STATES[(tile as any).name].group] >= 3;
        const siteValue = isState
          ? STATES[(tile as any).name].price + o.level * STATES[(tile as any).name].houseCost
          : BANKS[(tile as any).name].price;
        return (
          <div
            key={idx}
            className="prop-row"
            style={{
              background: g ? g.fill : BANK_STYLE.fill,
              color: g ? g.dark : BANK_STYLE.dark,
              borderLeft: `4px solid ${g ? g.strong : BANK_STYLE.strong}`,
              borderRadius: 6,
              padding: '4px 8px',
              margin: '3px 0',
            }}
          >
            <span style={{ fontWeight: 600 }}>
              {tileName(idx)}
              {o.level > 0 ? ` (${o.level === 4 ? 'hotel' : o.level + ' house' + (o.level > 1 ? 's' : '')})` : ''}
              {inSet ? ' 👑' : ''}
            </span>
            <span className="spacer" />
            {isState && o.level > 0 && (
              <button onClick={() => dispatch({ type: 'sellHouse', tile: idx })}>
                Sell build +₹{STATES[(tile as any).name].houseCost}
              </button>
            )}
            <button onClick={() => dispatch({ type: 'sellSite', tile: idx })}>Sell site +₹{siteValue}</button>
          </div>
        );
      })}
      <div className="hint" style={{ marginTop: 4 }}>👑 = part of a 3-color set (double rent) — selling that site breaks the combination.</div>
    </div>
  );
}

export function Dialogs({ game, controls, dispatch, onExit }: Props) {
  const dice2 = () => [rollDie(), rollDie()] as [number, number];

  if (game.phase === 'deciding' && game.decide) {
    const pending = game.decide.pool.filter((id) => game.decide!.rolls[id] === null);
    const next = pending[0];
    const done = game.decide.pool.filter((id) => game.decide!.rolls[id] !== null);
    return (
      <Overlay>
        <h2>Let's decide the turn</h2>
        <div className="hint">Everyone rolls once — highest goes first, lowest goes last. Ties are re-rolled.</div>
        {done.map((id) => (
          <div key={id} className="row">
            <span>{game.players[id].name}</span>
            <b>{game.decide!.rolls[id]}</b>
          </div>
        ))}
        {next !== undefined && controls(next) && (
          <button
            className="primary"
            onClick={() => {
              const [d1, d2] = dice2();
              dispatch({ type: 'decideRoll', player: next, d1, d2 });
            }}
          >
            {game.players[next].name} — roll the dice
          </button>
        )}
        {next !== undefined && !controls(next) && <div className="hint">Waiting for {game.players[next].name} to roll…</div>}
      </Overlay>
    );
  }

  if (game.phase === 'gameOver') {
    return (
      <Overlay>
        <h2>Game over</h2>
        <div className="podium">
          {game.ranking?.map((r, i) => (
            <div key={r.playerId} className="row">
              <span>
                {i + 1}. {r.name} {i === 0 ? '🏆' : ''}
              </span>
              <b>₹{r.assets}</b>
            </div>
          ))}
        </div>
        <button className="primary" onClick={onExit}>
          Back to home
        </button>
      </Overlay>
    );
  }

  const p = currentPlayer(game);
  const mine = controls(p.id);
  if (!mine) return null; // another device / the computer is acting

  if (game.phase === 'awaitJail') {
    return (
      <Overlay>
        <h2>{p.name}, you are in jail</h2>
        <div className="hint">
          Pay ₹{JAIL_FINE} to come out before rolling, or roll — the same number on both dice sets you free. Otherwise you are released
          after 5 turns. (Jail turn {p.jailTurns} of 5)
        </div>
        <div className="actions">
          <button className="primary" disabled={p.cash < JAIL_FINE} onClick={() => dispatch({ type: 'payJail' })}>
            Pay ₹{JAIL_FINE}
          </button>
          <button
            onClick={() => {
              const [d1, d2] = dice2();
              dispatch({ type: 'roll', d1, d2 });
            }}
          >
            Stay and roll
          </button>
        </div>
      </Overlay>
    );
  }

  if (game.phase === 'awaitAction' && game.buy) {
    const idx = game.buy.tile;
    const tile = SEQ[idx];
    const isState = tile.t === 'state';
    const state = isState ? STATES[(tile as any).name] : null;
    // Colored states ALWAYS offer buy + build house (rule 14); banks never do (rule 15).
    const withHousePrice = state ? game.buy.buyPrice + state.houseCost : undefined;
    return (
      <Overlay>
        <h2>Buy {tileName(idx)}?</h2>
        {state && (
          <div className="hint">
            {state.landmark} · {state.city} — house cost ₹{state.houseCost}
          </div>
        )}
        <div className="actions col">
          {withHousePrice !== undefined && (
            <button className="primary" disabled={p.cash < withHousePrice} onClick={() => dispatch({ type: 'buy', withHouse: true })}>
              Buy + build 1 house — ₹{withHousePrice}
            </button>
          )}
          <button
            className={withHousePrice === undefined ? 'primary' : ''}
            disabled={p.cash < game.buy.buyPrice}
            onClick={() => dispatch({ type: 'buy' })}
          >
            Buy site only — ₹{game.buy.buyPrice}
          </button>
          <button onClick={() => dispatch({ type: 'skip' })}>Skip — ₹0 (nothing happens)</button>
        </div>
        <div className="hint">Your cash: ₹{p.cash}</div>
        {(p.cash < game.buy.buyPrice || (withHousePrice !== undefined && p.cash < withHousePrice)) && (
          <SellAssets game={game} playerId={p.id} dispatch={dispatch} />
        )}
      </Overlay>
    );
  }

  if (game.phase === 'awaitAction' && game.build) {
    return (
      <Overlay>
        <h2>Build on {tileName(game.build.tile)}?</h2>
        <div className="actions">
          <button className="primary" disabled={p.cash < game.build.cost} onClick={() => dispatch({ type: 'build' })}>
            Build {game.build.nextLevelLabel} — ₹{game.build.cost}
          </button>
          <button onClick={() => dispatch({ type: 'skip' })}>Skip</button>
        </div>
        <div className="hint">Your cash: ₹{p.cash}</div>
        {p.cash < game.build.cost && <SellAssets game={game} playerId={p.id} dispatch={dispatch} />}
      </Overlay>
    );
  }

  if (game.phase === 'awaitPay' && game.due) {
    return (
      <Overlay>
        <h2>You owe ₹{game.due.amount}</h2>
        <div className="hint">
          {game.due.reason}. Cash ₹{p.cash} — the payment completes automatically once selling covers it.
        </div>
        <SellAssets game={game} playerId={p.id} dispatch={dispatch} />
        <div className="hint">Total assets: ₹{totalAssets(game, p.id)}</div>
      </Overlay>
    );
  }

  if (game.phase === 'awaitNext') {
    const nextIdx = (game.cur + 1) % game.order.length;
    const done = p.turns + 1 >= game.turnLimit;
    return (
      <Overlay>
        <h2>{done ? 'Final turn played!' : `Next: ${game.players[game.order[nextIdx]].name}`}</h2>
        <div className="hint">{game.log[game.log.length - 1]}</div>
        <button className="primary" onClick={() => dispatch({ type: 'endTurn' })}>
          {done ? 'Finish game' : 'OK'}
        </button>
      </Overlay>
    );
  }

  return null;
}
