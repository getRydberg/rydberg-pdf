# Rydberg PDF

A PDF editor that runs entirely in your browser. Open a PDF (or several),
reorder and rotate pages, draw on them, drop in text and images, and save
a new file back to disk.

Nothing is uploaded. There is no backend, no database, and no API key —
see [why](#why-there-is-no-backend) below.

## What it does

- **Open** one or more PDFs, by picker or drag-and-drop; opening more files
  either replaces what you have or appends to it
- **Pages** — rotate, delete, duplicate, and drag to reorder in the page rail
- **Text** — click to place a text box, set size and color
- **Rectangle** — solid boxes, including white ones for covering things up
- **Highlight** — translucent color over existing content
- **Ink** — freehand pen
- **Image** — pick a PNG or JPEG, then drag out where it goes on the page
- **Undo/redo** across everything, 50 steps deep
- **Zoom** to a fixed level or fit-to-window
- **Save** a flattened PDF built from the pages you kept, in the order you
  put them, with your annotations drawn in

Annotations are pinned to a page *id*, not a page number, so reordering or
deleting pages never orphans what you drew.

## Keyboard

| Key | Does |
|---|---|
| `V` `T` `R` `H` `D` `I` | select / text / rectangle / highlight / ink (draw) / image |
| `Ctrl`+`S` | save |
| `Ctrl`+`Z` / `Ctrl`+`Shift`+`Z` / `Ctrl`+`Y` | undo / redo / redo |
| `Delete` or `Backspace` | delete the selected annotation |
| `PageUp` / `PageDown` | previous / next page |
| `Esc` | deselect, or cancel a pending image |

## Requirements

- Docker + Docker Compose (or Node 20+ to run it directly)

That's the whole list. No inference endpoint, no credentials.

## Install as a Rydberg module (recommended)

If you're running the [Rydberg core](https://github.com/getRydberg/Rydberg):

```bash
bin/rydberg install pdf https://github.com/getRydberg/rydberg-pdf.git main
bin/rydberg up
```

This joins the shared `rydberg-net` network and gets routed automatically
if you've got Cloudflare Tunnel (or another reverse proxy) configured in
core.

## Run standalone

```bash
git clone https://github.com/getRydberg/rydberg-pdf.git
cd rydberg-pdf
cp .env.example .env                 # only PDF_HOST lives here
docker network create rydberg-net    # skip if it already exists
docker compose --profile pdf up -d --build
```

The editor is on `http://localhost:5173`.

`--profile pdf` is required: the service declares `profiles: [pdf]` per the
module contract, so a bare `docker compose up` starts nothing.

## Run without Docker

```bash
cd frontend
npm install
npm run dev
```

## Configuration

| Variable | What it's for |
|---|---|
| `PDF_HOST` | Hostname this module is routed to. Must match what you point at `rydberg-frontend-pdf` in your tunnel/proxy config. Also added to Vite's allowed-hosts list, because Vite 6 rejects requests with unrecognized `Host` headers. |

That is the only variable. See `.env.example`.

## Architecture

```
rydberg-pdf/
├── docker-compose.yml    includes compose/frontend.yml, nothing else
├── compose/
│   └── frontend.yml      the one service, on rydberg-net
└── frontend/             React (Vite + TypeScript)
    └── src/
        ├── app/App.tsx           all editor state, history, keyboard, save
        ├── components/           Toolbar, PageRail, PageCanvas, Inspector
        └── lib/
            ├── types.ts          Doc / PageRef / Annot — the whole state shape
            ├── render.ts         pdfjs-dist: PDF bytes → canvas
            ├── save.ts           pdf-lib: state → new PDF bytes
            ├── geometry.ts       display frame ↔ PDF user space
            ├── style.ts          the "current brush" and swatches
            ├── text.ts, id.ts
            └── ...
```

Rendering is [pdfjs-dist](https://github.com/mozilla/pdf.js); writing is
[pdf-lib](https://github.com/Hopding/pdf-lib). Editor state is three
things — the bytes of every source PDF, an ordered list of page references
into those sources, and a list of annotations — and every edit produces a
new state object rather than mutating the old one, which is what makes
undo/redo a one-liner.

Coordinates are stored in PDF points with a top-left origin in the page's
*displayed* (rotated) frame, i.e. the frame you actually see. `geometry.ts`
maps them back to PDF user space on save, so rotating a page doesn't move
what you drew on it.

## Why there is no backend

Every operation this editor performs — decoding a PDF, rasterizing pages,
compositing annotations, writing new bytes — has a mature implementation
that runs in the browser. A server would add deployment surface, storage
to secure, and an upload round-trip, in exchange for nothing the client
can't already do.

It also means your documents never leave your machine. For the kind of
files people actually reach for a PDF editor to fix — contracts, medical
forms, tax paperwork, signed agreements — that is the more important
property, and it's one you get structurally rather than by promising it.

The trade-off is real, and it's the last entry under
[Known limitations](#known-limitations): nothing persists.

## Known limitations

- **Text is Helvetica, WinAnsi only.** Saving uses a PDF standard font, so
  characters outside Latin-1 (CJK, emoji, most non-Western scripts) are
  replaced with `?` in the output. Fix is font embedding; not done yet.
- **Saving flattens what you add.** Your annotations are painted into each
  page's content stream rather than written as PDF annotation objects, so
  every reader shows exactly what you saw and nothing can be clicked away.
  The cost is that a saved file re-opened here is just a document — your
  boxes and strokes are no longer separate editable objects.
- **Existing form fields and annotations pass through untouched.** They're
  carried over with the page and can't be filled or edited here.
- **Password-protected PDFs won't open.** Encryption is ignored on save
  (`ignoreEncryption`), which covers permission-restricted files, but a
  file that needs a password to decrypt is not handled.
- **Everything is in memory.** Large PDFs are held as bytes plus rendered
  canvases, and nothing survives a reload. Save the file you care about.

## Status

Early. The editor works end to end — open, edit, save — but hasn't been
tested against the long tail of PDFs in the wild. Expect rough edges.
