# Masud Gaming Hub 🎲

A small multiplayer game portal for friends and family. It is one static web page on **GitHub Pages**: no server to run, no database, no account, nothing to install.

**Play:** https://mprantikk.github.io/masud-gaming-hub/

**Games:** Ludo (Classic, Quick, 2v2 Team), Chess, Twenty-Nine (29) and Monopoly-style Business.

## How it works

- Each player picks a name and an emoji avatar. The app remembers them on that device.
- The player who creates a match is its **host**: the match runs in the host's browser and is saved on the host's device.
- Friends open the match link and connect **peer-to-peer** to the host's browser (WebRTC, through the free public [PeerJS](https://peerjs.com) connection service).
- The host has to keep Masud Gaming Hub open (in any screen of the app) while friends play. If the host reloads, the match continues from where it was.
- Robot matches need nobody else and work on one device.

## Features

- Share a match link (WhatsApp, Messenger...); open seats are taken by whoever opens it
- Ludo: pairs ("jora"), safe stars, bonus rolls for kicks and reaching home, three sixes in a row do not count, strict pair rule, per-player board orientation, robot opponents
- Chess with optional move hints (off by default) and a robot opponent
- Twenty-Nine (4 players, 2v2) and Monopoly-style Business
- Optional "bet" note (just text, no money)
- Match creator can let a robot play for a player who is not moving
- Fast mode for shorter animations

## Project layout

```
src/app.html          the page and the app (UI)
src/engine/core.js    game engine: players, rooms, Ludo, Chess, storage
src/engine/games.js   game engine: Twenty-Nine and Monopoly
src/platform.js       browser storage for the engine (localStorage)
src/net.js            peer-to-peer: sends each call to this device or to the match host
tools/build.js        builds docs/index.html (one file, PeerJS inlined)
docs/index.html       the built site that GitHub Pages serves (do not edit by hand)
tests/                Node tests for the engine and the build; tests/e2e is a 2-browser test
```

## Develop

```bash
npm install
npm run build      # after any change in src/: rebuilds docs/index.html
npm test           # engine rules + checks that docs/index.html is up to date
npm run e2e        # two real browsers play over a local PeerJS server (needs Playwright + Chromium)
```

To try it locally, serve `docs/` (for example `npm run serve`) and open http://localhost:8080.

## Publish on GitHub Pages

1. Commit `docs/index.html` after `npm run build`.
2. GitHub repo → **Settings → Pages** → *Deploy from a branch* → pick the branch and the `/docs` folder → **Save**.
3. The site updates a minute or two after each push.

## Notes and limits

- The connection service (PeerJS cloud) only introduces the browsers; game data goes directly between them, or through PeerJS's free relay when a network blocks direct connections. It is a free public service, so it can occasionally be slow or down.
- Each device keeps its own data: matches it hosted, names of friends who joined, and its leaderboard. Clearing the browser's site data removes them.
- Open the app in one tab only on each device (the second tab cannot host matches).

## License

MIT, see `LICENSE`. PeerJS is MIT licensed.
