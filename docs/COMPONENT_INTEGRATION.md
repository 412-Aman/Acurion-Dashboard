# React component integration

All four requested components are included. The third attachment duplicates Shredder, so it is represented by the same Shredder component.

| Component | Source | Placement |
| --- | --- | --- |
| HoldButton (TS-TW) | Exact content from https://reactbits.dev/r/HoldButton-TS-TW.json | Reports → Disposable drafts, two-second confirmation |
| Shredder (TS-TW) | Exact content from https://reactbits.dev/r/Shredder-TS-TW.json; also supplied in the third attachment | Reports → Disposable drafts, animated disposal preview |
| Live Notification Feed | First attachment, `live-notification-feed.tsx` (CCgather attribution in supplied demo) | Header bell → AML alert activity |
| Gateway Flow | Second attachment, `gateway-flow.tsx` | Login background and overview intelligence banner |

The exact registry JSON files were fetched and their `files[].content` extracted directly into `src/components/ui/`. The jsrepo CLI was not needed for extraction. Registry dependencies: HoldButton lists none; Shredder lists `react-dom@^19.0.0`. React 19 and React DOM 19 are installed, together with TypeScript and their type packages. No paid service or account was created.

Gateway Flow was adapted to run entirely locally: its unused embedded login demo, external CDN scripts/fonts/images and unrelated GSAP reveal were removed. The supplied canvas geometry, effect wrapper and controls remain. Embedded template-literal quoting was repaired; iframe controls are resent after load and messages are accepted only from its parent. The iframe retains `sandbox="allow-scripts"` and has no access to the surrounding account data. Reduced-motion users get a static decorative fallback.

The notification feed receives Acurion's configured alerts and subscriptions. Items are ordered oldest-to-newest as the supplied component expects, which renders newest first. `autoplay` and looping are off. Review opens the existing alert detail sheet. Read/clear/dismiss affect this notification session, not stored AML alerts, investigations or customer records.

HoldButton uses the requested purple `#5227FF` fill, 2000ms hold, 200ms release, 14px radius, rightward fill, wave/glow and 1200ms reset. Early release does not trigger deletion. Shredder is inactive until a completed hold starts the selected draft's feed; it does not loop or repeatedly delete documents. Its preview is sized responsively for the Reports page. This is an intentional integration adaptation to connect the two components.

Disposable drafts use a separate browser key, `acurion.disposable-drafts.v1`. Delete moves a working draft to a recovery tray; Restore returns its complete content. Investigation evidence, legal holds, STR/SAR records and audit history have no deletion path through these controls. The tray seeds three explicitly fictional notes and supports adding temporary notes. It is not an institutional retention/archive service.

## Structure and setup

- `src/components/ui/`: supplied TS/Tailwind components.
- `src/islands/`: React integration wrappers mounted into existing vanilla pages using React DOM roots.
- `src/styles/main.css`: existing Tailwind v4 stylesheet and shadcn-compatible token aliases.
- `tsconfig.json`: TSX, React automatic JSX runtime, strict checks, `@/*` path alias.
- `components.json`: shadcn-compatible structure with `@/components/ui` and the existing stylesheet.
- `vite.config.js`: matching runtime alias. There is no runtime import from another project.
- `npm run typecheck`: checks components and React wrappers.
- `npm run build`: typecheck, then Vite build.

A full React rewrite is unnecessary: current Firebase authentication, transaction reads, investigation forms and rule logic remain in their existing pages. Future shadcn or React registry components should go in `src/components/ui` and be composed in a wrapper under `src/islands`.

## Navigation

The sidebar retains the Acurion monogram and a 72px rail with direct destination shortcuts. All main pages remain visible in stable workflow groups in the expanded panel. Breadcrumbs, collapse, resize, keyboard focus, mobile overlay, account menu and global search remain available. Compliance page changes update the active destination. Working drafts sit under Reports & audit.

## Verification

- Type checking and production build pass.
- Thirteen tests pass, including retained AML rule tests and draft-storage separation/recovery/quota handling.
- Browser checks cover completed two-second hold, shred completion, recovery, early-release cancellation, notification loading and Gateway canvas rendering. The flow uses no external runtime assets.
- Desktop and mobile navigation/layout checks; source components retain keyboard and reduced-motion behavior.
