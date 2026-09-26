# Inventory System — Renderer

This is the Next.js (App Router) renderer for the Inventory System desktop app. It runs inside the Electron window defined in `../electron/main.js` — see the root [README.md](../README.md) for the full project architecture and build instructions.

## Development

```bash
npm run dev
```

Starts the Next.js dev server at `http://localhost:3000`. Run `npm run dev` from the project root instead of here to also launch the Electron window pointed at it.

## Build

```bash
npm run build
```

Produces the static export in `out/`, consumed by `electron-builder` when packaging the desktop app.
