# Contributing to Auralis

Thanks for your interest in improving Auralis! 🎵

## Getting started

```bash
npm ci
cp .env.example .env.local      # set AURALIS_MUSIC_DIR to a folder of audio
npm run dev                     # http://localhost:3000
```

## Before you open a PR

Run the full check — CI runs the same:

```bash
npm run check        # lint + typecheck + build
npm test             # unit tests
```

Please keep changes:

- **Typed** — no `any` unless unavoidable; `npm run typecheck` must pass.
- **Lint-clean** — `npm run lint` must pass.
- **Focused** — one concern per PR, with a clear description.
- **In the existing style** — match the surrounding code, naming and comment density.

## Project layout

See the [Architecture](README.md#%EF%B8%8F-architecture) section of the README.

- Backend core lives in `src/server/` (framework-agnostic).
- API routes in `src/app/api/` are thin handlers over that core.
- The shared UI lives in `src/components/` and `src/store/`.
- Desktop shell: `desktop/`. Android shell: `android/` + `mobile/www/`.

## Reporting bugs

Open an issue with steps to reproduce, the platform (web/desktop/Android), and the
Auralis version (`/api/health`). For security issues, see [SECURITY.md](SECURITY.md).

## Contact

**Youssef Ben yedder** — [volt@webtvmedia.net](mailto:volt@webtvmedia.net)
