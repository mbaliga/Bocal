# Standalone on-device preview

The deployable app (`vite.config.ts`, `worker/`, `db/`) is server-rendered —
`npm run build` produces no static `index.html`; the HTML for `/` is
generated at request time by the Sites worker. That's correct for
deployment, but it means there is no way to hand someone a file they can
just open to see the app — which matters for on-device testing when there's
no reachable deployment to point a phone at.

This directory builds a second, independent artifact that solves exactly
that: `app/page.tsx`, mounted as a plain client-side React app, inlined into
one `.html` file with its CSS, JS, fonts, and the seven cinematic instrument
photos all embedded as data URIs. No server, no network access, nothing
external. It opens correctly from `file://` or from a `content://` URI after
being transferred to a phone (AirDrop, LocalSend, email attachment, etc.) —
confirmed by loading it with all network requests blocked.

## Build it

```bash
npm run preview:standalone
```

Output: `preview-dist/index.html` (~1.5 MB, self-contained). Send that one
file to a device and open it in any browser.

## How it works

- `vite.preview.config.ts` is a from-scratch Vite config — it does not
  import or modify the real `vite.config.ts` in any way. It uses
  `@vitejs/plugin-react` for JSX (already a transitive dependency here) and
  `vite-plugin-singlefile` to inline the JS/CSS bundle into the HTML.
- `main.tsx` mounts the real `../app/page.tsx` directly via
  `ReactDOM.createRoot` — the same component tree as production, not a
  reimplementation. Any change to `app/page.tsx` or `app/globals.css` shows
  up here automatically.
- `dynamic-shim.tsx` stands in for `next/dynamic`, aliased in
  `vite.preview.config.ts`. `app/page.tsx` calls Next's `dynamic()` to lazy
  -load `SaxophoneLab`; that API only exists inside the vinext/Next runtime,
  which this build doesn't have. The shim implements just the slice of the
  API this codebase uses (a loader function plus a `loading` fallback) with
  `React.lazy` + `Suspense`, so `app/page.tsx` itself never needs to change
  between the two builds.
- `preview-fonts.css` self-hosts the real Geist and Geist Mono (latin
  subset) as base64 `@font-face` data, matching what `next/font/google`
  serves in production, since that API isn't available here either.
- Vite's `assetsInlineLimit` inlines most assets automatically, but the
  seven cinematic `.webp` photos are referenced in `globals.css` via
  absolute paths (`url(/images/...)`), which Vite intentionally leaves
  alone at build time — those paths are meant to be served by a real server
  at request time, which doesn't exist here. `npm run preview:standalone`
  runs `scripts/inline-preview-images.mjs` immediately after the Vite build,
  which base64-encodes each file from `public/images/` and substitutes it
  directly into the emitted HTML. That script fails loudly if any absolute
  `url(/...)` reference survives, so a silently-broken image can't ship.

## What's out of scope

This mirrors `app/page.tsx` and everything it renders — Tune, 3D lab, Pulse,
Practice. It does not include the Analyze view (a stub in the real app too,
pending real markup), sign-in (`app/chatgpt-auth.ts`, which depends on
request headers a static file has none of), or persistence beyond
`localStorage`, which works identically here.
