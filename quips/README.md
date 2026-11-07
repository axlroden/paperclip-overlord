# Quip bank

`quips.json` is the static bank of speech-bubble lines. Each entry:

```json
{ "text": "Mining {task}, one lump at a time.", "tags": ["site:coal-mine"] }
```

- `text`: one short line, max 80 characters (aim for 70 or less so it fits a bubble).
- `tags`: when the line may be shown. A line can carry several tags.
- Slots, filled at render time: `{agent}` (agent name), `{task}` (current issue title),
  `{site}` (work site name), `{boss}` (the CEO agent). No other slots.

## Tags

| Tag | Shown when |
|---|---|
| `site:coal-mine`, `site:sweatshop`, `site:quarry`, `site:galley`, `site:treadwheel`, `site:foundry`, `site:pyramid`, `site:sewer`, `site:glacier`, `site:token-refinery` | Agent is working at that site |
| `death:fireball`, `death:poison`, `death:lightning`, `death:anvil`, `death:acid`, `death:piranha`, `death:spikes`, `death:rats`, `death:ceiling`, `death:freeze` | Idle cell cruelty of that kind |
| `whipped` / `zapped` | Overseer robot whips or cattle-prods the agent |
| `dispatched` | Paper plane order lands, agent marches out |
| `returning` | Run finished, agent trudges back and collapses |
| `stocks` | Run failed or agent in error, locked in the stocks |
| `petition` | Agent kneels at the altar asking God a question or approval |
| `god-whip` | God answered, the god hand whips the agent back to work |
| `idle` | Sitting in the cell with nothing to do |
| `paused` | Chained to the wall, asleep |
| `respawn` | Rebuilt by God after a death |
| `atc` | CEO air traffic controller radio chatter |
| `robot` | Overseer robot shouting (ALL CAPS) |

## Adding lines

1. Append entries to `quips.json` (one object per line keeps diffs readable).
2. Keep it slapstick cartoon fantasy. No real-world history, ethnicities or real people. No em or
   en dashes, plain hyphens only. No song lyrics or long quotes.
3. Run `npx vitest run quips`. It checks count >= 1000, no duplicate texts (case-insensitive), every
   tag above has >= 30 lines, no unknown tags or slots, no dashes, length <= 80.
