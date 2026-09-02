# Business India

A Monopoly-style Indian business board game — 20 states in 4 color groups + 6 special
tickets (banks, ports, airline, stadium, IPL team). Built as a web app so the same code
can be wrapped with Capacitor for the Google Play Store and Apple App Store.

## Run it

```bash
npm install        # once
npm run server     # friends-mode server on http://localhost:3005
npm run dev        # game on http://localhost:5173
```

- **Play with computer** — you vs 1-3 computer players on one device.
- **Play with friends** — creates a room link (`?join=CODE`) you can copy or share on
  WhatsApp; the game starts automatically when everyone has joined. For friends on other
  devices in the same network, open the link with your machine's IP instead of localhost.

## Tests

```bash
npm test           # 19 engine unit tests (rents, jail, taxes, reservation rule, ranking…)
```

## Structure

- `shared/` — pure TypeScript game engine + all game data (board layout, 26 tickets,
  chance/community chest values, every rule). No DOM: used by both client and server.
- `client/` — React + Vite app (board UI, popups, dice, lobby).
- `server/` — Node + socket.io room server for friends mode.

## Game rules summary

- ₹199800 split equally; ₹3000 every time you pass START; turn order by highest initial roll.
- Land on a free state: buy / buy + 1 house / skip. Banks (tickets 21-26): buy or skip.
- Build one step per visit to your own state: house 1 → 2 → 3 → hotel.
- Rent by ticket; owning 3+ states of one color doubles its rents (houses included).
- Owning a bank pair (RBL+SBI, Adani+IndiGo, Stadium+RCB) doubles those rents.
- Jail: pay ₹1000 before rolling, roll doubles, or wait 5 turns.
- Income tax = sites × ₹100 · Wealth tax = builds × ₹100.
- Chance / Community chest resolved by the dice total (odd/even lists on the board).
- No mortgage: sell houses or sites back at the same price, anytime. A sold site can be
  bought again by whoever lands on it.
- Reservation rule: you can't buy a state if that would leave another player unable to
  ever complete 3-of-a-color.
- Game ends when the first player finishes the chosen number of turns; ranking by total
  assets (cash + prices paid + build costs).
