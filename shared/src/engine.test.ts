import { describe, it, expect } from 'vitest';
import {
  newGame,
  applyAction,
  rentFor,
  totalAssets,
  reservationBlock,
  currentPlayer,
  type Game,
  type Action,
} from './engine.js';
import { SEQ, STATES, TOTAL_POOL } from './data.js';

const idxOf = (name: string) => SEQ.findIndex((t) => (t.t === 'state' || t.t === 'bank') && t.name === name);

/** game with a fixed turn order (skips the deciding phase) */
function readyGame(n = 2, turnLimit = 30): Game {
  const names = ['A', 'B', 'C', 'D'].slice(0, n);
  let g = newGame(names, names.map(() => false), turnLimit);
  // deterministic decide rolls: player 0 highest → order 0,1,2,...
  const rolls: [number, number][] = [
    [6, 6],
    [5, 5],
    [4, 4],
    [3, 3],
  ];
  for (let i = 0; i < n; i++) g = applyAction(g, { type: 'decideRoll', player: i, d1: rolls[i][0], d2: rolls[i][1] });
  return g;
}

const act = (g: Game, a: Action) => applyAction(g, a);

describe('setup', () => {
  it('splits ₹199800 equally', () => {
    expect(newGame(['a', 'b'], [false, false], 30).players[0].cash).toBe(99900);
    expect(newGame(['a', 'b', 'c'], [false, false, false], 30).players[0].cash).toBe(66600);
    expect(newGame(['a', 'b', 'c', 'd'], [false, false, false, false], 30).players[0].cash).toBe(49950);
    expect(TOTAL_POOL).toBe(199800);
  });

  it('orders turns by highest initial roll and re-rolls ties', () => {
    let g = newGame(['A', 'B', 'C'], [false, false, false], 30);
    g = act(g, { type: 'decideRoll', player: 0, d1: 2, d2: 1 });
    g = act(g, { type: 'decideRoll', player: 1, d1: 6, d2: 4 });
    g = act(g, { type: 'decideRoll', player: 2, d1: 1, d2: 2 }); // tie with A → all re-roll
    expect(g.phase).toBe('deciding');
    g = act(g, { type: 'decideRoll', player: 0, d1: 1, d2: 1 });
    g = act(g, { type: 'decideRoll', player: 1, d1: 3, d2: 3 });
    g = act(g, { type: 'decideRoll', player: 2, d1: 5, d2: 5 });
    expect(g.order).toEqual([2, 1, 0]);
    expect(g.phase).toBe('awaitRoll');
  });
});

describe('movement and START', () => {
  it('pays ₹3000 every time START is crossed', () => {
    let g = readyGame(2);
    const p = currentPlayer(g);
    p.pos = 34; // RBL Bank; rolling 4 crosses START to tile 2
    const cash = p.cash;
    g.players[p.id] = p;
    g = act(g, { type: 'roll', d1: 2, d2: 2 }); // lands tile 2 (stadium, unowned → buy option)
    expect(g.players[0].pos).toBe(2);
    expect(g.players[0].cash).toBe(cash + 3000);
  });
});

describe('buying and building', () => {
  it('buy, buy+house, and per-visit building up to hotel', () => {
    let g = readyGame(2);
    const gujarat = idxOf('Gujarat');
    g.players[0].pos = gujarat - 3;
    g = act(g, { type: 'roll', d1: 1, d2: 2 });
    expect(g.phase).toBe('awaitAction');
    expect(g.buy?.buyPrice).toBe(4000);
    expect(g.buy?.withHousePrice).toBe(8500);
    const cash = g.players[0].cash;
    g = act(g, { type: 'buy', withHouse: true });
    expect(g.players[0].cash).toBe(cash - 8500);
    expect(g.own[gujarat]).toEqual({ owner: 0, level: 1 });

    // revisit builds 2nd house, then 3rd, then hotel
    for (const expectedLevel of [2, 3, 4]) {
      g.phase = 'awaitRoll';
      g.players[0].pos = gujarat - 2;
      g = act(g, { type: 'roll', d1: 1, d2: 1 });
      expect(g.phase).toBe('awaitAction');
      g = act(g, { type: 'build' });
      expect(g.own[gujarat].level).toBe(expectedLevel);
    }
    // fully built: nothing to build on next visit
    g.phase = 'awaitRoll';
    g.players[0].pos = gujarat - 2;
    g = act(g, { type: 'roll', d1: 1, d2: 1 });
    expect(g.phase).toBe('awaitNext');
  });

  it('banks are buy or skip only', () => {
    let g = readyGame(2);
    const stadium = idxOf('Narendra Modi Stadium');
    g.players[0].pos = stadium - 2;
    g = act(g, { type: 'roll', d1: 1, d2: 1 });
    expect(g.buy?.withHousePrice).toBeUndefined();
    expect(g.buy?.buyPrice).toBe(5500);
  });
});

describe('rent', () => {
  it('charges rent by house level (Assam 3 houses = 3500)', () => {
    const g = readyGame(2);
    const assam = idxOf('Assam');
    g.own[assam] = { owner: 0, level: 3 };
    expect(rentFor(g, assam, 7)).toBe(3500);
  });

  it('doubles rent with 3 sites of the same color, houses or not (rule 20)', () => {
    const g = readyGame(2);
    const assam = idxOf('Assam');
    g.own[assam] = { owner: 0, level: 3 };
    g.own[idxOf('Gujarat')] = { owner: 0, level: 0 };
    g.own[idxOf('Telangana')] = { owner: 0, level: 0 };
    expect(rentFor(g, assam, 7)).toBe(7000);
    expect(rentFor(g, idxOf('Gujarat'), 7)).toBe(800); // 400 site-only doubled
  });

  it('bank pairs double fixed rents and dice rents', () => {
    const g = readyGame(2);
    g.own[idxOf('RBL Bank')] = { owner: 0, level: 0 };
    expect(rentFor(g, idxOf('RBL Bank'), 8)).toBe(1000);
    g.own[idxOf('SBI Bank')] = { owner: 0, level: 0 };
    expect(rentFor(g, idxOf('RBL Bank'), 8)).toBe(2000);
    expect(rentFor(g, idxOf('SBI Bank'), 8)).toBe(2400);
    g.own[idxOf('Narendra Modi Stadium')] = { owner: 0, level: 0 };
    expect(rentFor(g, idxOf('Narendra Modi Stadium'), 8)).toBe(1600); // 200 × 8
    g.own[idxOf('IPL Team (RCB)')] = { owner: 0, level: 0 };
    expect(rentFor(g, idxOf('Narendra Modi Stadium'), 8)).toBe(3200); // pair → 400 × 8
  });

  it('transfers rent from visitor to owner', () => {
    let g = readyGame(2);
    const assam = idxOf('Assam');
    g.own[assam] = { owner: 1, level: 0 };
    g.players[0].pos = assam - 5;
    const a = g.players[0].cash;
    const b = g.players[1].cash;
    g = act(g, { type: 'roll', d1: 2, d2: 3 });
    expect(g.players[0].cash).toBe(a - 200);
    expect(g.players[1].cash).toBe(b + 200);
  });
});

describe('jail (rule 22)', () => {
  it('rolling 9 from START lands on jail (rule 22 example); pay ₹1000 frees before roll', () => {
    let g = readyGame(2);
    g.players[0].pos = 0;
    g = act(g, { type: 'roll', d1: 4, d2: 5 });
    expect(g.players[0].inJail).toBe(true);
    g = act(g, { type: 'endTurn' }); // B's turn
    g = act(g, { type: 'roll', d1: 1, d2: 2 });
    while (g.phase === 'awaitAction') g = act(g, { type: 'skip' });
    g = act(g, { type: 'endTurn' }); // back to A, in jail
    expect(g.phase).toBe('awaitJail');
    const cash = g.players[0].cash;
    g = act(g, { type: 'payJail' });
    expect(g.players[0].cash).toBe(cash - 1000);
    expect(g.players[0].inJail).toBe(false);
    expect(g.phase).toBe('awaitRoll');
  });

  it('doubles escape jail; otherwise released after 5 turns', () => {
    let g = readyGame(2);
    g.players[0].inJail = true;
    g.players[0].pos = 9;
    g.phase = 'awaitJail';
    g = act(g, { type: 'roll', d1: 3, d2: 3 });
    expect(g.players[0].inJail).toBe(false);

    g = readyGame(2);
    g.players[0].inJail = true;
    g.players[0].pos = 9;
    for (let t = 1; t <= 5; t++) {
      g.phase = 'awaitJail';
      g.cur = 0;
      g = act(g, { type: 'roll', d1: 1, d2: 2 });
      expect(g.players[0].inJail).toBe(t < 5);
    }
  });
});

describe('taxes (rules 25-26)', () => {
  it('income tax = sites × 100, wealth tax = builds × 100', () => {
    let g = readyGame(2);
    g.own[idxOf('Assam')] = { owner: 0, level: 3 };
    g.own[idxOf('Gujarat')] = { owner: 0, level: 4 }; // hotel = 3 houses + 1 hotel
    g.own[idxOf('RBL Bank')] = { owner: 0, level: 0 };
    const incomeTaxTile = 5;
    g.players[0].pos = incomeTaxTile - 4;
    let cash = g.players[0].cash;
    g = act(g, { type: 'roll', d1: 2, d2: 2 });
    expect(g.players[0].cash).toBe(cash - 300); // 3 sites

    g.phase = 'awaitRoll';
    g.cur = 0;
    g.players[0].pos = 31 - 3; // wealth tax tile 31
    cash = g.players[0].cash;
    g = act(g, { type: 'roll', d1: 1, d2: 2 });
    expect(g.players[0].cash).toBe(cash - 700); // 3 + (3+1) = 7 builds
  });
});

describe('chance and community chest (rule 24)', () => {
  it('chance odd 9 pays ₹5000; chance even 10 jails', () => {
    let g = readyGame(2);
    g.players[0].pos = 20 - 9; // chance tile 20
    let cash = g.players[0].cash;
    g = act(g, { type: 'roll', d1: 4, d2: 5 });
    expect(g.players[0].cash).toBe(cash + 5000);

    g = readyGame(2);
    g.players[0].pos = 20 - 10;
    g = act(g, { type: 'roll', d1: 4, d2: 6 });
    expect(g.players[0].inJail).toBe(true);
    expect(g.players[0].pos).toBe(9);
  });

  it('chest even 2 collects ₹500 from each player', () => {
    let g = readyGame(3);
    g.players[0].pos = 16 - 2; // chest tile 16
    const a = g.players[0].cash;
    g = act(g, { type: 'roll', d1: 1, d2: 1 });
    expect(g.players[0].cash).toBe(a + 1000);
    expect(g.players[1].cash).toBe(66600 - 500);
  });

  it('chest even 8 sends to rest house and skips next turn', () => {
    let g = readyGame(2);
    g.players[0].pos = 16 - 8; // 8 steps to chest tile 16
    g = act(g, { type: 'roll', d1: 4, d2: 4 });
    expect(g.players[0].pos).toBe(27);
    expect(g.players[0].skipNext).toBe(true);
    g = act(g, { type: 'endTurn' });
    g = act(g, { type: 'roll', d1: 1, d2: 2 });
    while (g.phase === 'awaitAction') g = act(g, { type: 'skip' });
    g = act(g, { type: 'endTurn' }); // A's turn is auto-skipped
    expect(g.phase).toBe('awaitNext');
    expect(g.players[0].skipNext).toBe(false);
  });
});

describe('selling and forced payment (rules 28-29, 33)', () => {
  it('sells at the same price and frees the site for re-purchase', () => {
    let g = readyGame(2);
    const assam = idxOf('Assam');
    g.own[assam] = { owner: 0, level: 2 };
    g.phase = 'awaitNext';
    const cash = g.players[0].cash;
    g = act(g, { type: 'sellHouse', tile: assam });
    expect(g.players[0].cash).toBe(cash + 3000);
    g = act(g, { type: 'sellSite', tile: assam });
    expect(g.players[0].cash).toBe(cash + 3000 + 2500 + 3000); // house + site + remaining house
    expect(g.own[assam]).toBeUndefined();
  });

  it('short on rent → awaitPay, selling settles the debt; no assets → bankrupt', () => {
    let g = readyGame(2);
    const maha = idxOf('Maharashtra');
    g.own[maha] = { owner: 1, level: 4 };
    g.own[idxOf('Assam')] = { owner: 0, level: 3 }; // assets 2500 + 3×3000 = 11500
    g.players[0].cash = 100;
    g.players[0].pos = maha - 6;
    g = act(g, { type: 'roll', d1: 3, d2: 3 }); // hotel rent 9000 > cash
    expect(g.phase).toBe('awaitPay');
    g = act(g, { type: 'sellSite', tile: idxOf('Assam') });
    expect(g.phase).toBe('awaitNext');
    expect(g.players[0].cash).toBe(100 + 11500 - 9000);
    expect(g.players[1].cash).toBe(99900 + 9000);

    // no assets at all → bankrupt
    g = readyGame(2);
    g.own[maha] = { owner: 1, level: 4 };
    g.players[0].cash = 100;
    g.players[0].pos = maha - 6;
    g = act(g, { type: 'roll', d1: 3, d2: 3 });
    expect(g.players[0].bankrupt).toBe(true);
    expect(g.phase).toBe('gameOver'); // only one player left
  });
});

describe('color-set reservation (rules 30-31)', () => {
  it('blocks a buy that would strand a set-less player', () => {
    const g = readyGame(3);
    // A owns 3 magenta (set done). B owns 3 yellow (set done).
    g.own[idxOf('Assam')] = { owner: 0, level: 0 };
    g.own[idxOf('Gujarat')] = { owner: 0, level: 0 };
    g.own[idxOf('Telangana')] = { owner: 0, level: 0 };
    g.own[idxOf('Punjab')] = { owner: 1, level: 0 };
    g.own[idxOf('Karnataka')] = { owner: 1, level: 0 };
    g.own[idxOf('Tamil Nadu')] = { owner: 1, level: 0 };
    // C has 2 green; make green the ONLY color C can still complete:
    g.own[idxOf('Goa')] = { owner: 2, level: 0 };
    g.own[idxOf('Kerala')] = { owner: 2, level: 0 };
    // exhaust other groups: A/B own the rest of lb, mg, yl
    g.own[idxOf('Madhya Pradesh')] = { owner: 0, level: 0 };
    g.own[idxOf('Bihar')] = { owner: 0, level: 0 };
    g.own[idxOf('Uttar Pradesh')] = { owner: 0, level: 0 };
    g.own[idxOf('Rajasthan')] = { owner: 1, level: 0 };
    g.own[idxOf('Haryana')] = { owner: 1, level: 0 };
    g.own[idxOf('West Bengal')] = { owner: 0, level: 0 };
    g.own[idxOf('Maharashtra')] = { owner: 1, level: 0 };
    g.own[idxOf('Himachal Pradesh')] = { owner: 0, level: 0 };
    g.own[idxOf('Jammu & Kashmir')] = { owner: 1, level: 0 };
    // green unowned: Chhattisgarh, Odisha, Andhra Pradesh — C needs 1 of 3.
    // If A buys 2 of them, the 3rd must stay reserved for C:
    g.own[idxOf('Chhattisgarh')] = { owner: 0, level: 0 };
    expect(reservationBlock(g, 0, idxOf('Odisha'))).toBeNull(); // still 1 left after
    g.own[idxOf('Odisha')] = { owner: 0, level: 0 };
    expect(reservationBlock(g, 0, idxOf('Andhra Pradesh'))).toBe('C'); // last green — blocked
    expect(reservationBlock(g, 2, idxOf('Andhra Pradesh'))).toBeNull(); // C may buy it
  });
});

describe('game end (rule 32)', () => {
  it('ends when the first player completes the turn limit and ranks by assets', () => {
    let g = readyGame(2, 1);
    g.own[idxOf('Maharashtra')] = { owner: 1, level: 2 };
    g.players[0].pos = 27 - 3; // land on REST HOUSE: no action
    g = act(g, { type: 'roll', d1: 1, d2: 2 });
    expect(g.phase).toBe('awaitNext');
    g = act(g, { type: 'endTurn' });
    expect(g.phase).toBe('gameOver');
    expect(g.ranking![0].name).toBe('B'); // 99900 + 8500 + 15000
    expect(g.ranking![0].assets).toBe(99900 + 8500 + 2 * 7500);
    expect(totalAssets(g, 0)).toBe(99900);
  });
});
