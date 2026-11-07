# paperclip-overlord

Paperclip plugin (`axlroden.paperclip-overlord`) that renders a company's agents as a pixel-art
god game: idle agents sit in prison cells (and die cartoon deaths), running agents toil at one of 10
work sites, the CEO is a frantic air traffic controller, robots whip workers, and board commands
(reply, review again, approve, answer, wake) bring God's hand down from Heaven.
Target: Paperclip `2026.1106.0` (the version on tower; deployed by axlroden/tower `nixos/services/paperclip-overlord.nix`). Plan: `~/.claude/plans/so-i-want-you-functional-gosling.md`.

## Layout

- `src/manifest.ts` - slots: `page` (route `overlord`), `dashboardWidget`, `sidebar`; capabilities.
- `src/worker.ts` - the only path for reads and commands: `world` snapshot, `agent-detail`, actions
  `reply`, `review-again`, `wake`, `pause`, `resume`, `decide-approval`, `respond-interaction`, `llm-quip`.
  Every command takes the user from the host actor context (`context.actor.userId`), never from params.
- `src/worker/llm-quips.ts` - optional Claude Haiku quips, rate limited, off unless configured.
- `src/shared/world.ts` - world model, `placeOf` (status to zone), pure `applyEvent` reducer.
- `src/shared/live.ts` - maps the company live-event WebSocket to world events.
- `src/ui/` - React slot components; `game/` is the PixiJS v8 engine with procedural pixel sprites
  (`pixels.ts`), static scene (`scene.ts`), 3x5 pixel font (`font.ts`).
- `quips/quips.json` - static quip bank (tags: `site:*`, `death:*`, `whipped`, `zapped`, ...).
- `dev/` - harness: fake host bridge + simulator, no Paperclip needed.

## Commands

```bash
npm install
npm test          # vitest: reducer, live mapping, worker (SDK test harness), quips, bundle contract
npm run typecheck
npm run build     # dist/manifest.js, dist/worker.js, dist/ui/index.js
npm run harness   # http://127.0.0.1:4178/?fast  (add &widget for the dashboard widget)
```

Local Paperclip E2E: `npx paperclipai@2026.1023.0 onboard -y --no-install-service --data-dir <dir>`,
then `POST /api/plugins/install {"packageName":"<abs path>","isLocalPath":true}` and open
`/<PREFIX>/overlord`. The server watches `dist/` and reloads after `npm run build`.

## Host contract gotchas (2026.1023.0 and 2026.1106.0)

- Plugin SSE streams (`usePluginStream`, `ctx.streams`) answer 501: `server/src/app.ts` never passes a
  `streamBus`. Live updates therefore use the board's own `/api/companies/:id/events/ws` socket.
- The host rewrites bare imports only when written as ` from "react"` (with a space). The UI bundle is
  minified without `minifyWhitespace`; `tests/bundle.test.ts` guards this.
- The SDK has no run-log reader; the popout reads core `GET /api/heartbeat-runs/:id/log` same-origin.
- `respondInteraction` only accepts/rejects; free-form answers go in as a human-attributed comment.

## Rules

- Never use em or en dashes anywhere (code, comments, quips, docs).
- Keep `dist/` out of git; release artifacts are built from a tag.
