# omrizz.github.io

A personal website styled as a nostalgic Windows XP desktop — draggable
windows, a Start menu, a Run dialog, themes, a Winamp-style player,
Minesweeper, and **Sunset Circuit**, an arcade racing game with drift
physics, AI rivals, lap records and a ghost car.

Everything (icons, wallpapers, UI chrome, sounds, game art) is built from
scratch with plain HTML/CSS/JS — no build step, no external assets, no
copied branding.

## Highlights

- **Desktop** — window manager (drag, focus, minimize, maximize), taskbar,
  quick launch, Start menu, right-click menu, Display Properties with three
  wallpapers (Bliss, Sunset, Midnight), synthesised system sounds.
- **Content** — About Me, Resume, Projects (with diagrams), Control Panel
  (skills), My Computer, an Email composer that hands off to your mail app.
- **Games folder** — launchers plus personal records read from `localStorage`.
- **Sunset Circuit** — three spline circuits, drifty car physics at a fixed
  60 Hz step, three AI rivals with rubber-banding, slipstream, collisions,
  tyre marks, minimap, Web Audio engine/skid sounds, Time Trial mode with a
  ghost of your best run, keyboard / touch / gamepad controls.
- **Mobile** — windows open full-screen like apps; the game has touch controls.

## Controls (Sunset Circuit)

| Input | Action |
| --- | --- |
| Arrow keys / WASD | Gas, brake, steer |
| Space | Handbrake (slide) |
| T | Recover to the track (+3 s) |
| Enter / click | Start, race again |
| R | Back to the grid |
| M | Mute |
| Gamepad | Stick steers, RT/A gas, LT/B brake, X/RB handbrake, Start race, Select restart, Y recover |

## Deep links and Run commands

Open a window straight from the URL: `#about`, `#resume`, `#projects`,
`#skills`, `#games`, `#circuit`, `#minesweeper`, `#winamp`, `#computer`,
`#recycle`, `#contact`, `#display`. The hash follows whichever window you
opened last, so the address bar is always shareable.

Start → **Run…** accepts the same names (`resume`, `circuit`, `games`,
`display`, `github`, `help`, …).

## Structure

- `index.html` — desktop markup: icons, windows, taskbar, Start menu, overlays
- `assets/style.css` — the whole Luna-style visual theme, themes and mobile rules
- `assets/app.js` — window manager, deep links, Start menu, clock, boot/shutdown
- `assets/drive.js` — Sunset Circuit: tracks, physics, AI, audio, rendering, records
- `assets/minesweeper.js` — classic 9×9 / 10-mine Minesweeper (saves best time)
- `assets/winamp.js` — Web Audio chiptune player + canvas visualizer + playlist
- `assets/records.js` — personal-records table in the Games folder
- `assets/run.js` — Run dialog
- `assets/contact.js` — Email composer (`mailto:` hand-off)
- `assets/desktop.js` — right-click menu and wallpaper themes
- `assets/sounds.js` — system sounds and the tray speaker toggle

## Running locally

No build step required — just serve the folder statically:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Data and privacy

Nothing leaves the browser. Mute state, difficulty, lap records, the Time
Trial ghost, the wallpaper and the sound toggle are stored in
`localStorage` (`sunsetCircuit.v1`, `omrios.*`); clearing site data resets them.

## Testing hook

`window.sunsetCircuit` exposes `step(n)`, `state()`, `start()`, `autopilot(on)`
and a few helpers so headless browser tests (Playwright) can advance the
fixed-step simulation deterministically and check laps, records and rivals.

## Content

Update the desktop copy in `index.html` (About Me text, project cards,
resume, links) — everything else is driven from there.
