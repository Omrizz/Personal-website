# omrizz.github.io

A personal website styled as a nostalgic Windows XP desktop — draggable
windows, a Start menu, a taskbar with a live clock, desktop icons, a fully
playable Minesweeper, and a Winamp-style mini player with a procedurally
generated chiptune loop.

Everything (icons, wallpaper, UI chrome, audio) is built from scratch with
plain HTML/CSS/JS — no build step, no external assets, no copied branding.

## Structure

- `index.html` — desktop markup: icons, windows, taskbar, Start menu, shutdown overlay
- `assets/style.css` — the whole XP Luna-style visual theme
- `assets/app.js` — window manager: drag, focus/z-order, minimize/maximize/close, Start menu, clock, shutdown
- `assets/minesweeper.js` — classic 9x9 / 10-mine Minesweeper
- `assets/winamp.js` — Web Audio API chiptune player + canvas visualizer

## Running locally

No build step required — just serve the folder statically:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Content

Update the desktop copy in `index.html` (About Me text, the agentic-libs
project card, links) — everything else is driven from there.
