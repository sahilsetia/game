// Business India — pure game engine. No DOM, no sockets: every rule lives here
// so the client (local mode) and server (friends mode) share identical behavior.

import {
  SEQ,
  STATES,
  BANKS,
  N_TILES,
  JAIL_TILE,
  REST_TILE,
  START_BONUS,
  JAIL_FINE,
  JAIL_MAX_TURNS,
  TOTAL_POOL,
  cardForRoll,
  PLAYER_COLORS,
  type GroupKey,
} from './data.js';

export interface Player {
  id: number;
  name: string;
  isAI: boolean;
  color: string;
  cash: number;
  pos: number;
  inJail: boolean;
  jailTurns: number;
  skipNext: boolean;
  turns: number; // completed turns
  bankrupt: boolean;
}

export interface Ownership {
  owner: number;
  level: number; // 0 = site only, 1-3 houses, 4 = hotel
}

export type Phase =
  | 'deciding' // initial "let's decide the turn" rolls
  | 'awaitJail' // in jail: pay or roll?
  | 'awaitRoll'
  | 'awaitAction' // landed: buy / build / skip choices
  | 'awaitPay' // owes money, must sell assets until covered
  | 'awaitNext' // turn resolved, show "next player" popup
  | 'gameOver';

export interface BuyOption {
  tile: number;
  canBuy: boolean;
  reservedFor?: string;
  buyPrice: number;
  withHousePrice?: number; // states only
}

export interface BuildOption {
  tile: number;
  nextLevelLabel: string;
  cost: number;
}

export interface Due {
  amount: number;
  to: number | 'bank';
  reason: string;
}

export interface Ranking {
  playerId: number;
  name: string;
  assets: number;
}

export interface Game {
  players: Player[];
  own: Record<number, Ownership>;
  order: number[]; // player ids in turn order
  cur: number; // index into order
  turnLimit: number;
  phase: Phase;
  dice: [number, number] | null;
  buy?: BuyOption;
  build?: BuildOption;
  due?: Due;
  decide: { rolls: Record<number, number | null>; pool: number[] } | null;
  log: string[];
  ranking?: Ranking[];
}

export type Action =
  | { type: 'decideRoll'; player: number; d1: number; d2: number }
  | { type: 'payJail' }
  | { type: 'roll'; d1: number; d2: number }
  | { type: 'buy'; withHouse?: boolean }
  | { type: 'build' }
  | { type: 'skip' }
  | { type: 'sellHouse'; tile: number }
  | { type: 'sellSite'; tile: number }
  | { type: 'endTurn' };

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export function rollDie(rng: () => number = Math.random): number {
  return 1 + Math.floor(rng() * 6);
}

export function newGame(names: string[], aiFlags: boolean[], turnLimit: number): Game {
  const n = names.length;
  if (n < 2 || n > 4) throw new Error('2-4 players');
  const cash = Math.floor(TOTAL_POOL / n / 50) * 50; // 99900 / 66600 / 49950
  const players: Player[] = names.map((name, i) => ({
    id: i,
    name,
    isAI: aiFlags[i] ?? false,
    color: PLAYER_COLORS[i],
    cash,
    pos: 0,
    inJail: false,
    jailTurns: 0,
    skipNext: false,
    turns: 0,
    bankrupt: false,
  }));
  return {
    players,
    own: {},
    order: [],
    cur: 0,
    turnLimit,
    phase: 'deciding',
    dice: null,
    decide: { rolls: Object.fromEntries(players.map((p) => [p.id, null])), pool: players.map((p) => p.id) },
    log: [`Let's decide the turn — everyone rolls once. Each player starts with ₹${cash}.`],
  };
}

export function currentPlayer(g: Game): Player {
  return g.players[g.order[g.cur]];
}

export function tileName(idx: number): string {
  const t = SEQ[idx];
  if (t.t === 'state' || t.t === 'bank') return t.name;
  return t.label;
}

/** total assets = cash + purchase prices + build costs (sell-back is at the same price). */
export function totalAssets(g: Game, playerId: number): number {
  const p = g.players[playerId];
  let sum = p.cash;
  for (const [idx, o] of Object.entries(g.own)) {
    if (o.owner !== playerId) continue;
    const tile = SEQ[Number(idx)];
    if (tile.t === 'state') {
      const s = STATES[tile.name];
      sum += s.price + o.level * s.houseCost;
    } else if (tile.t === 'bank') {
      sum += BANKS[tile.name].price;
    }
  }
  return sum;
}

function groupCount(g: Game, playerId: number, group: GroupKey): number {
  let c = 0;
  for (const [idx, o] of Object.entries(g.own)) {
    const tile = SEQ[Number(idx)];
    if (o.owner === playerId && tile.t === 'state' && STATES[tile.name].group === group) c++;
  }
  return c;
}

function hasCompletedSet(g: Game, playerId: number): boolean {
  return (['lb', 'mg', 'yl', 'gr'] as GroupKey[]).some((grp) => groupCount(g, playerId, grp) >= 3);
}

function unownedInGroup(g: Game, group: GroupKey, exceptTile?: number): number {
  let c = 0;
  SEQ.forEach((tile, idx) => {
    if (tile.t !== 'state' || STATES[tile.name].group !== group) return;
    if (idx === exceptTile) return;
    if (!g.own[idx]) c++;
  });
  return c;
}

/** Rules 30-31: a purchase is blocked if it would leave another set-less player
 *  with no color they can still complete (own + unowned >= 3). */
export function reservationBlock(g: Game, buyerId: number, tileIdx: number): string | null {
  const tile = SEQ[tileIdx];
  if (tile.t !== 'state') return null;
  for (const p of g.players) {
    if (p.id === buyerId || p.bankrupt || hasCompletedSet(g, p.id)) continue;
    const reachable = (['lb', 'mg', 'yl', 'gr'] as GroupKey[]).filter(
      (grp) => groupCount(g, p.id, grp) + unownedInGroup(g, grp, tileIdx) >= 3,
    );
    if (reachable.length === 0) return p.name;
  }
  return null;
}

/** Rent owed when `visitorTotal` was rolled and the visitor stands on tileIdx. */
export function rentFor(g: Game, tileIdx: number, diceTotal: number): number {
  const o = g.own[tileIdx];
  if (!o) return 0;
  const tile = SEQ[tileIdx];
  if (tile.t === 'state') {
    const s = STATES[tile.name];
    let rent = s.rents[o.level];
    // Rule 20: 3+ sites of the color group double the rent, houses or not.
    if (groupCount(g, o.owner, s.group) >= 3) rent *= 2;
    return rent;
  }
  if (tile.t === 'bank') {
    const b = BANKS[tile.name];
    const pairIdx = SEQ.findIndex((t) => t.t === 'bank' && t.name === b.pair);
    const ownsPair = g.own[pairIdx]?.owner === o.owner;
    if (b.rent.kind === 'fixed') return b.rent.base * (ownsPair ? 2 : 1);
    return b.rent.mult * (ownsPair ? 2 : 1) * diceTotal;
  }
  return 0;
}

function buildUnits(g: Game, playerId: number): { houses: number; hotels: number } {
  let houses = 0;
  let hotels = 0;
  for (const [idx, o] of Object.entries(g.own)) {
    if (o.owner !== playerId || SEQ[Number(idx)].t !== 'state') continue;
    if (o.level === 4) {
      houses += 3;
      hotels += 1;
    } else {
      houses += o.level;
    }
  }
  return { houses, hotels };
}

function sitesOwned(g: Game, playerId: number): number {
  return Object.values(g.own).filter((o) => o.owner === playerId).length;
}

function log(g: Game, msg: string) {
  g.log.push(msg);
  if (g.log.length > 200) g.log.splice(0, g.log.length - 200);
}

function credit(g: Game, to: number | 'bank', amount: number) {
  if (to !== 'bank') g.players[to].cash += amount;
}

/** Charge the current player. If cash is short, enter awaitPay (they must sell);
 *  if even total assets can't cover it, they go bankrupt. */
function charge(g: Game, amount: number, to: number | 'bank', reason: string) {
  const p = currentPlayer(g);
  if (p.cash >= amount) {
    p.cash -= amount;
    credit(g, to, amount);
    log(g, `${p.name} paid ₹${amount} — ${reason}.`);
    return;
  }
  if (totalAssets(g, p.id) < amount) {
    // bankrupt: liquidate everything to the creditor, drop out
    let raised = p.cash;
    for (const [idx, o] of Object.entries(g.own)) {
      if (o.owner !== p.id) continue;
      const tile = SEQ[Number(idx)];
      raised += tile.t === 'state' ? STATES[tile.name].price + o.level * STATES[tile.name].houseCost : BANKS[(tile as any).name].price;
      delete g.own[Number(idx)];
    }
    p.cash = 0;
    p.bankrupt = true;
    credit(g, to, Math.min(raised, amount));
    log(g, `${p.name} is bankrupt — could not pay ₹${amount} (${reason}).`);
    const alive = g.players.filter((q) => !q.bankrupt);
    if (alive.length <= 1) return endGame(g);
    g.phase = 'awaitNext';
    return;
  }
  g.due = { amount, to, reason };
  g.phase = 'awaitPay';
  log(g, `${p.name} owes ₹${amount} (${reason}) — sell houses or sites to raise cash.`);
}

function settleDueIfPossible(g: Game) {
  const p = currentPlayer(g);
  if (!g.due) return;
  if (p.cash >= g.due.amount) {
    p.cash -= g.due.amount;
    credit(g, g.due.to, g.due.amount);
    log(g, `${p.name} paid ₹${g.due.amount} — ${g.due.reason}.`);
    g.due = undefined;
    g.phase = 'awaitNext';
  }
}

function endGame(g: Game) {
  g.phase = 'gameOver';
  g.ranking = g.players
    .map((p) => ({ playerId: p.id, name: p.name, assets: p.bankrupt ? 0 : totalAssets(g, p.id) }))
    .sort((a, b) => b.assets - a.assets);
  log(g, `Game over. Winner: ${g.ranking[0].name} with total assets ₹${g.ranking[0].assets}.`);
}

function beginTurn(g: Game) {
  const p = currentPlayer(g);
  g.dice = null;
  g.buy = undefined;
  g.build = undefined;
  if (p.skipNext) {
    p.skipNext = false;
    log(g, `${p.name} is resting — turn skipped.`);
    g.phase = 'awaitNext';
    return;
  }
  g.phase = p.inJail ? 'awaitJail' : 'awaitRoll';
}

function landOn(g: Game, total: number) {
  const p = currentPlayer(g);
  const idx = p.pos;
  const tile = SEQ[idx];
  switch (tile.t) {
    case 'state':
    case 'bank': {
      const o = g.own[idx];
      if (!o) {
        const reserved = reservationBlock(g, p.id, idx);
        if (reserved) {
          log(g, `${tileName(idx)} is reserved so ${reserved} can still complete a color set — ${p.name} can't buy.`);
          g.phase = 'awaitNext';
          return;
        }
        if (tile.t === 'state') {
          const s = STATES[tile.name];
          g.buy = { tile: idx, canBuy: true, buyPrice: s.price, withHousePrice: s.price + s.houseCost };
        } else {
          g.buy = { tile: idx, canBuy: true, buyPrice: BANKS[tile.name].price };
        }
        g.phase = 'awaitAction';
        return;
      }
      if (o.owner === p.id) {
        if (tile.t === 'state' && o.level < 4) {
          const s = STATES[tile.name];
          const label = o.level < 3 ? `house ${o.level + 1}` : 'hotel';
          g.build = { tile: idx, nextLevelLabel: label, cost: s.houseCost };
          g.phase = 'awaitAction';
          return;
        }
        log(g, `${p.name} visited their own ${tileName(idx)}.`);
        g.phase = 'awaitNext';
        return;
      }
      const rent = rentFor(g, idx, total);
      charge(g, rent, o.owner, `rent for ${tileName(idx)} to ${g.players[o.owner].name}`);
      if (g.phase !== 'awaitPay' && g.phase !== 'gameOver') g.phase = 'awaitNext';
      return;
    }
    case 'chance':
    case 'chest': {
      const rule = cardForRoll(tile.t, total);
      log(g, `${tile.t === 'chance' ? 'Chance' : 'Community chest'} (${total}): ${rule.text}`);
      const e = rule.effect;
      if (e.kind === 'receive') {
        p.cash += e.amount;
        g.phase = 'awaitNext';
      } else if (e.kind === 'pay') {
        charge(g, e.amount, 'bank', rule.text);
        if (g.phase !== 'awaitPay' && g.phase !== 'gameOver') g.phase = 'awaitNext';
      } else if (e.kind === 'collectFromEach') {
        for (const q of g.players) {
          if (q.id === p.id || q.bankrupt) continue;
          const pay = Math.min(q.cash, e.amount);
          q.cash -= pay;
          p.cash += pay;
        }
        g.phase = 'awaitNext';
      } else if (e.kind === 'goToJail') {
        p.pos = JAIL_TILE;
        p.inJail = true;
        p.jailTurns = 0;
        g.phase = 'awaitNext';
      } else if (e.kind === 'restHouse') {
        p.pos = REST_TILE;
        p.skipNext = true;
        g.phase = 'awaitNext';
      } else if (e.kind === 'repairs') {
        const u = buildUnits(g, p.id);
        const amount = u.houses * e.perHouse + u.hotels * e.perHotel;
        if (amount > 0) {
          charge(g, amount, 'bank', `general repairs (${u.houses} houses, ${u.hotels} hotels)`);
          if (g.phase !== 'awaitPay' && g.phase !== 'gameOver') g.phase = 'awaitNext';
        } else {
          log(g, `${p.name} has nothing to repair.`);
          g.phase = 'awaitNext';
        }
      }
      return;
    }
    case 'incomeTax': {
      const amount = sitesOwned(g, p.id) * 100;
      if (amount > 0) charge(g, amount, 'bank', `income tax (${sitesOwned(g, p.id)} sites × ₹100)`);
      else log(g, `${p.name} owns no sites — no income tax.`);
      if (g.phase !== 'awaitPay' && g.phase !== 'gameOver') g.phase = 'awaitNext';
      return;
    }
    case 'wealthTax': {
      const u = buildUnits(g, p.id);
      const units = u.houses + u.hotels;
      if (units > 0) charge(g, units * 100, 'bank', `wealth tax (${units} builds × ₹100)`);
      else log(g, `${p.name} has no houses or hotels — no wealth tax.`);
      if (g.phase !== 'awaitPay' && g.phase !== 'gameOver') g.phase = 'awaitNext';
      return;
    }
    case 'jail': {
      p.inJail = true;
      p.jailTurns = 0;
      log(g, `${p.name} landed on JAIL PUNISHMENT and is in jail.`);
      g.phase = 'awaitNext';
      return;
    }
    case 'rest':
    case 'resort':
    case 'start': {
      log(g, `${p.name} is at ${tileName(idx)} — nothing happens.`);
      g.phase = 'awaitNext';
      return;
    }
  }
}

export function applyAction(state: Game, action: Action): Game {
  const g = clone(state);
  const p = g.phase === 'deciding' ? null : currentPlayer(g);

  switch (action.type) {
    case 'decideRoll': {
      if (g.phase !== 'deciding' || !g.decide) throw new Error('not deciding');
      if (!g.decide.pool.includes(action.player) || g.decide.rolls[action.player] !== null) throw new Error('not your decide roll');
      const total = action.d1 + action.d2;
      g.decide.rolls[action.player] = total;
      log(g, `${g.players[action.player].name} rolled ${total} for turn order.`);
      const pending = g.decide.pool.filter((id) => g.decide!.rolls[id] === null);
      if (pending.length === 0) {
        const entries = g.decide.pool.map((id) => ({ id, v: g.decide!.rolls[id]! }));
        const values = entries.map((e) => e.v);
        const hasTie = new Set(values).size !== values.length;
        if (hasTie) {
          g.decide = { rolls: Object.fromEntries(g.decide.pool.map((id) => [id, null])), pool: g.decide.pool };
          log(g, 'Tie — everyone rolls again.');
        } else {
          g.order = entries.sort((a, b) => b.v - a.v).map((e) => e.id);
          g.decide = null;
          log(g, `Turn order: ${g.order.map((id) => g.players[id].name).join(' → ')}.`);
          g.cur = 0;
          beginTurn(g);
        }
      }
      return g;
    }
    case 'payJail': {
      if (g.phase !== 'awaitJail' || !p) throw new Error('not in jail phase');
      if (p.cash < JAIL_FINE) {
        log(g, `${p.name} does not have ₹${JAIL_FINE} in cash — sell assets or roll for doubles.`);
        return g;
      }
      p.cash -= JAIL_FINE;
      p.inJail = false;
      p.jailTurns = 0;
      log(g, `${p.name} paid ₹${JAIL_FINE} and is out of jail.`);
      g.phase = 'awaitRoll';
      return g;
    }
    case 'roll': {
      if (!p) throw new Error('no player');
      const total = action.d1 + action.d2;
      g.dice = [action.d1, action.d2];
      if (g.phase === 'awaitJail') {
        if (action.d1 === action.d2) {
          p.inJail = false;
          p.jailTurns = 0;
          log(g, `${p.name} rolled doubles (${action.d1}+${action.d2}) and escapes jail!`);
        } else {
          p.jailTurns += 1;
          if (p.jailTurns >= JAIL_MAX_TURNS) {
            p.inJail = false;
            p.jailTurns = 0;
            log(g, `${p.name} finished ${JAIL_MAX_TURNS} turns in jail and is released.`);
          } else {
            log(g, `${p.name} stays in jail (turn ${p.jailTurns} of ${JAIL_MAX_TURNS}).`);
          }
          g.phase = 'awaitNext';
          return g;
        }
      } else if (g.phase !== 'awaitRoll') {
        throw new Error('not roll phase');
      }
      const from = p.pos;
      const dest = (from + total) % N_TILES;
      if (from + total >= N_TILES) {
        p.cash += START_BONUS;
        log(g, `${p.name} crossed START and collected ₹${START_BONUS}.`);
      }
      p.pos = dest;
      log(g, `${p.name} rolled ${action.d1}+${action.d2}=${total} and moved to ${tileName(dest)}.`);
      landOn(g, total);
      return g;
    }
    case 'buy': {
      if (g.phase !== 'awaitAction' || !g.buy || !p) throw new Error('nothing to buy');
      const idx = g.buy.tile;
      const tile = SEQ[idx];
      const withHouse = !!action.withHouse && tile.t === 'state';
      const cost = withHouse ? g.buy.withHousePrice! : g.buy.buyPrice;
      if (p.cash < cost) {
        log(g, `${p.name} needs ₹${cost} — sell assets first or skip.`);
        return g;
      }
      p.cash -= cost;
      g.own[idx] = { owner: p.id, level: withHouse ? 1 : 0 };
      log(g, `${p.name} bought ${tileName(idx)} for ₹${g.buy.buyPrice}${withHouse ? ` and built a house (₹${g.buy.withHousePrice! - g.buy.buyPrice})` : ''}.`);
      g.buy = undefined;
      g.phase = 'awaitNext';
      return g;
    }
    case 'build': {
      if (g.phase !== 'awaitAction' || !g.build || !p) throw new Error('nothing to build');
      const idx = g.build.tile;
      if (p.cash < g.build.cost) {
        log(g, `${p.name} needs ₹${g.build.cost} to build — sell assets first or skip.`);
        return g;
      }
      p.cash -= g.build.cost;
      g.own[idx].level += 1;
      log(g, `${p.name} built ${g.build.nextLevelLabel} on ${tileName(idx)} for ₹${g.build.cost}.`);
      g.build = undefined;
      g.phase = 'awaitNext';
      return g;
    }
    case 'skip': {
      if (g.phase !== 'awaitAction' || !p) throw new Error('nothing to skip');
      log(g, `${p.name} skipped.`);
      g.buy = undefined;
      g.build = undefined;
      g.phase = 'awaitNext';
      return g;
    }
    case 'sellHouse': {
      if (!p) return g;
      const o = g.own[action.tile];
      const tile = SEQ[action.tile];
      if (!o || o.owner !== p.id || tile.t !== 'state' || o.level === 0) return g; // stale click — ignore
      o.level -= 1;
      p.cash += STATES[tile.name].houseCost;
      log(g, `${p.name} sold a build on ${tile.name} for ₹${STATES[tile.name].houseCost}.`);
      settleDueIfPossible(g);
      return g;
    }
    case 'sellSite': {
      if (!p) return g;
      const o = g.own[action.tile];
      const tile = SEQ[action.tile];
      if (!o || o.owner !== p.id) return g; // stale click — ignore
      let refund = 0;
      if (tile.t === 'state') refund = STATES[tile.name].price + o.level * STATES[tile.name].houseCost;
      else if (tile.t === 'bank') refund = BANKS[tile.name].price;
      delete g.own[action.tile];
      p.cash += refund;
      log(g, `${p.name} sold ${tileName(action.tile)} back to the bank for ₹${refund}. It is available to buy again.`);
      settleDueIfPossible(g);
      return g;
    }
    case 'endTurn': {
      if (g.phase !== 'awaitNext' || !p) throw new Error('turn not finished');
      p.turns += 1;
      if (p.turns >= g.turnLimit) {
        endGame(g);
        return g;
      }
      let i = g.cur;
      do {
        i = (i + 1) % g.order.length;
      } while (g.players[g.order[i]].bankrupt && g.order[i] !== g.order[g.cur]);
      g.cur = i;
      beginTurn(g);
      return g;
    }
  }
}

/** Simple computer opponent: same rules as a human, cash is the only constraint. */
export function aiChooseAction(g: Game, rng: () => number = Math.random): Action {
  const p = currentPlayer(g);
  switch (g.phase) {
    case 'awaitJail':
      if (p.cash >= JAIL_FINE) return { type: 'payJail' };
      return { type: 'roll', d1: rollDie(rng), d2: rollDie(rng) };
    case 'awaitRoll':
      return { type: 'roll', d1: rollDie(rng), d2: rollDie(rng) };
    case 'awaitAction': {
      if (g.buy) {
        const withHouse = g.buy.withHousePrice !== undefined && p.cash >= g.buy.withHousePrice;
        if (p.cash >= g.buy.buyPrice) return { type: 'buy', withHouse };
        // raise cash by selling the cheapest asset if that makes the buy possible
        const sale = cheapestSale(g, p.id);
        if (sale && totalAssets(g, p.id) - p.cash >= g.buy.buyPrice - p.cash) return sale;
        return { type: 'skip' };
      }
      if (g.build) {
        if (p.cash >= g.build.cost) return { type: 'build' };
        return { type: 'skip' };
      }
      return { type: 'skip' };
    }
    case 'awaitPay': {
      const sale = cheapestSale(g, p.id);
      if (sale) return sale;
      return { type: 'endTurn' }; // unreachable: charge() handles bankruptcy
    }
    case 'awaitNext':
      return { type: 'endTurn' };
    default:
      throw new Error(`AI has no move in phase ${g.phase}`);
  }
}

function cheapestSale(g: Game, playerId: number): Action | null {
  let best: { action: Action; value: number } | null = null;
  for (const [idxStr, o] of Object.entries(g.own)) {
    if (o.owner !== playerId) continue;
    const idx = Number(idxStr);
    const tile = SEQ[idx];
    if (tile.t === 'state' && o.level > 0) {
      const v = STATES[tile.name].houseCost;
      if (!best || v < best.value) best = { action: { type: 'sellHouse', tile: idx }, value: v };
    }
    const siteValue = tile.t === 'state' ? STATES[tile.name].price + o.level * STATES[tile.name].houseCost : BANKS[(tile as any).name].price;
    if (!best || siteValue < best.value) best = { action: { type: 'sellSite', tile: idx }, value: siteValue };
  }
  return best?.action ?? null;
}
