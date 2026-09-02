# Business India — setup on a new laptop

## 1. Prerequisites

- **Node.js 20+** — https://nodejs.org (check with `node --version`)
- **Android Studio** (for the Android app) — https://developer.android.com/studio
- **Xcode** (for the iOS app, Mac only) — from the Mac App Store

## 2. Install and run the game (browser)

```bash
cd Game
npm install
npm run server     # friends-mode server on port 3005 (keep running)
npm run dev        # game at http://localhost:5173
```

To play from phones on the same Wi-Fi, run the client with `npx vite --host` inside
`client/` and open `http://<laptop-ip>:5173` on the phone.

Run the rule tests any time with `npm test`.

## 3. Android app

```bash
cd client
npm run build && npx cap sync
npx cap open android      # opens the project in Android Studio
```

In Android Studio: pick an emulator or plug in a phone (USB debugging on) → press Run ▶.
The game installs and launches as a native app.

## 4. iOS app (Mac only)

```bash
cd client
npm run build && npx cap sync
npx cap open ios          # opens the project in Xcode
```

In Xcode: choose a simulator or your iPhone → press Run ▶. For a real iPhone you'll
need to set your (free) Apple ID under Signing & Capabilities the first time.

## 5. After every game change

```bash
cd client && npm run mobile:sync
```

That rebuilds the web app and copies it into both native projects.

## Important before "Play with friends" works on the mobile apps

The friends server currently runs on a laptop. For the installed apps to play online
from anywhere, deploy `server/` to a host (Render / Railway / Fly.io free tiers work),
then build the client with:

```bash
VITE_SERVER_URL=https://your-server-url npm run build && npx cap sync
```

"Play with computer" works everywhere with no server.

## Store publishing checklist (later)

- App icon + splash screen (`npx @capacitor/assets generate` once you have a logo)
- Google Play: developer account ($25 one-time), upload signed `.aab`
- Apple App Store: Apple Developer Program ($99/year), archive via Xcode
- Privacy policy URL (required by both stores)
- Review the real brand names (SBI, RBL, RCB, Adani, IndiGo, Narendra Modi Stadium) —
  trademarks can get a store listing rejected; consider renamed equivalents.
