# pi-deepseek-tariff

A [pi](https://pi.dev) extension that shows the current **DeepSeek API tariff window** — peak or off-peak — with a countdown, and a panel with live prices parsed from the official DeepSeek pricing page.

DeepSeek charges double during peak hours, so knowing the current window is worth real money.

```
Now OFF-PEAK
Computer: 14:43:52 26-10-2026(MSK) | UTC: 2026-10-26 11:43
Next window: 04:00 - 07:00 27-10-2026(MSK) in 13h 16m
DeepSeek prices: $ per 1M tokens, active: OFF-PEAK
  deepseek:deepseek-flash  ← active
      PEAK      hit   0.0060  miss   0.3000  out   1.2000
    ▸ OFF-PEAK  hit   0.0030  miss   0.1500  out   0.6000
  deepseek:deepseek-v4-pro
      PEAK      hit   0.0440  miss   1.3200  out   3.9600
    ▸ OFF-PEAK  hit   0.0220  miss   0.6600  out   1.9800
  Search & Fetch: $0.75 per 1,000 successful requests
────────────────────────────────────────────────────────────
Peak windows (MSK): 04:00-07:00 and 09:00-13:00, Mon-Fri
Off-peak = night, weekends and Chinese holidays
Price source: api-docs.deepseek.com, updated 11:20 26-10 (next in 5h 59m)
────────────────────────────────────────────────────────────
Commands: /deepseek-peak on|off|refresh|en|ru
```

## Install

```bash
# from git (tags are pinned)
pi install git:github.com/<you>/deepseek-peak@v0.1.0

# from npm
pi install npm:pi-deepseek-tariff

# local checkout, for development
pi install ./deepseek-peak

# try it for one run without touching settings
pi -e ./deepseek-peak
```

Then run `/deepseek-peak`. Afterwards `pi list`, `pi update --extensions`, `pi remove …` manage it like any other package.

## Commands

| Command | Effect |
|---|---|
| `/deepseek-peak` | toggle the panel |
| `/deepseek-peak on` / `off` | show or hide it |
| `/deepseek-peak refresh` | re-parse prices from the docs page now |
| `/deepseek-peak en` / `ru` | switch the panel language (persisted) |

## What it does

- **Footer line** — `deepseek: PEAK → off-peak 13:00 (1h 40m)`. Shown only while a DeepSeek model is active; red for peak, green for off-peak.
- **Peak rules** — DeepSeek defines peak as `01:00-04:00` and `06:00-10:00` **UTC, Monday to Friday**; weekends and Chinese public holidays are off-peak all day.
- **Local time everywhere** — the UTC clock comes from the machine clock, so peak windows, weekday labels and countdowns are rendered in *your* zone (`(MSK)`, `(UTC-04:00)`, …). Weekday labels shift with the zone: at UTC−4 the windows land on Sun–Thu.
- **Prices** — parsed from `api-docs.deepseek.com/quick_start/pricing/`: cache hit, cache miss and output per model, plus the Search & Fetch request rates. The tariff in effect is highlighted.
- **Caching** — the page is parsed at most once per `pricingTtlHours` (default 6), and the result is cached on disk, so restarts stay offline. `PI_OFFLINE` disables network access entirely and the panel falls back to built-in values.

## Configuration

`<agent-dir>/deepseek-peak.json` — `PI_CODING_AGENT_DIR`, default `~/.pi/agent`. The file is created only when you switch the language.

```json
{
  "language": "ru",
  "intervalMs": 30000,
  "pricingTtlHours": 6,
  "alwaysShow": false,
  "models": ["deepseek"],
  "providerPrefix": "deepseek:",
  "holidays": ["2026-10-01", "2026-10-02"]
}
```

| Key | Default | Meaning |
|---|---|---|
| `language` | pi's `settings.json` language, else `en` | `"en"` or `"ru"` |
| `intervalMs` | `30000` | minimum refresh cadence (clamped to ≥ 5000) |
| `pricingTtlHours` | `6` | how long parsed prices stay valid |
| `alwaysShow` | `false` | show the footer line for non-DeepSeek models too |
| `models` | `["deepseek"]` | id substrings that count as DeepSeek |
| `providerPrefix` | `"deepseek:"` | prefix used when printing model ids |
| `holidays` | `[]` | Chinese public holidays as Beijing dates (`YYYY-MM-DD`), off-peak all day |

Chinese holidays are announced yearly and are not computed, so keep the list current. Prices are parsed automatically; if DeepSeek changes the page markup the parser returns nothing and the extension keeps the last good values.

## Development

```bash
npm test        # node:test, no dependencies required
npm run typecheck   # needs `npm install` for the pi type packages
```

Layout:

```
extensions/deepseek-peak.ts   pi entry point (UI, events, commands)
src/rules.ts                  peak rules, local time formatting (pure)
src/pricing.ts                page parsing + TTL/disk cache (pure, injectable fetch)
src/view.ts                   footer line and panel rendering
src/config.ts                 config file, agent-dir paths
src/i18n.ts                   English and Russian strings
test/                         node:test suites + captured page fixture
```

The rules and parsing modules are pure and take injectable inputs, so tests never touch the network or a TUI. `test/fixtures/pricing.html` is a captured copy of the pricing tables; refresh it when DeepSeek changes the page.

## License

MIT
