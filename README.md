# pi-deepseek-tariff

[![npm](https://img.shields.io/npm/v/pi-deepseek-tariff?color=blue)](https://www.npmjs.com/package/pi-deepseek-tariff)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![pi-package](https://img.shields.io/badge/pi-package-8a2be2)](https://pi.dev/packages)

A [pi](https://pi.dev) extension that shows the current **DeepSeek API tariff window** — peak or off-peak — with a countdown, and a panel with live prices parsed from the official DeepSeek pricing page.

DeepSeek charges double during peak hours, so knowing the current window is worth real money.

```
● DeepSeek Off-peak for 11h 59m          ← footer line, always visible

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
Commands: /dsp on|off|refresh|en|ru · /dsp footer on|off
```

## Install

```bash
# from npm (always the `latest` dist-tag)
pi install npm:pi-deepseek-tariff

# from git: tags mirror the npm versions, so pin whichever you want
pi install git:github.com/valderan/pi-deepseek-tariff@v0.3.0

# local checkout, for development
git clone git@github.com:valderan/pi-deepseek-tariff.git
pi install ./pi-deepseek-tariff

# try it for one run without touching settings
pi -e ./pi-deepseek-tariff
```

Then run `/dsp`. Afterwards `pi list`, `pi update --extensions`, `pi remove …` manage it like any other package.

## Commands

`/dsp` is the short form of the command. The full name `/deepseek-peak` works too, and `/deepseek-peek` is accepted for muscle memory.

| Command | Effect |
|---|---|
| `/dsp` | toggle the panel |
| `/dsp on` / `off` | show or hide the panel (the footer line stays while a DeepSeek model is active) |
| `/dsp refresh` | re-parse prices from the docs page now |
| `/dsp en` / `ru` | switch the panel language (persisted) |
| `/dsp footer on` / `off` (or `/dsp footeron` / `footeroff`) | show or hide the footer line (persisted) |

## What it does

- **Footer line** — one compact status line: `● DeepSeek Off-peak for 11h 59m`, or `● DeepSeek Peak for 1h 40m` during peak. The text is always yellow and only the dot changes colour — green for off-peak, red for peak. Shown only while a DeepSeek model is active; `/dsp footer off` hides it for good.

  Russian looks like `● DeepSeek Обычный ещё 11ч 59м` / `● DeepSeek Пиковый ещё 1ч 40м`.

  Pi renders every extension status on a single footer line, joined alphabetically, so the segment is kept short.
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
  "footer": true,
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
| `footer` | `true` | show the footer status line at all; `/dsp footer off` writes this |
| `models` | `["deepseek"]` | id substrings that count as DeepSeek |
| `providerPrefix` | `"deepseek:"` | prefix used when printing model ids |
| `holidays` | `[]` | Chinese public holidays as Beijing dates (`YYYY-MM-DD`), off-peak all day |

Chinese holidays are announced yearly and are not computed, so keep the list current. Prices are parsed automatically; if DeepSeek changes the page markup the parser returns nothing and the extension keeps the last good values.

## Development

```bash
git clone git@github.com:valderan/pi-deepseek-tariff.git
cd pi-deepseek-tariff
npm test            # node:test, no dependencies required
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

## Release

Git tags and npm versions are kept in lockstep: the tag `vX.Y.Z` always points at
the commit whose `package.json` says `X.Y.Z`, and npm publishes that same version.

```bash
# 1. bump package.json + README, commit
npm version 0.3.1 --no-git-tag-version     # or edit by hand
git commit -am "chore: release 0.3.1"

# 2. tag the release commit and push
git tag -a v0.3.1 -m v0.3.1
git push origin main --tags

# 3. publish the tag to npm (2FA prompt, or --otp=123456)
npm publish --access public
```

`npm publish` sets the `latest` dist-tag automatically for a plain semver version.
Check the result:

```bash
npm view pi-deepseek-tariff dist-tags    # { latest: '0.3.1' }
npm view pi-deepseek-tariff versions
```

`.github/workflows/ci.yml` can publish on a `v*` tag instead of step 3 when the
`NPM_TOKEN` secret is configured; with trusted publishing enabled on npmjs.com the
token is not needed at all and the build is signed with provenance.

Tags are pinnable with `pi install git:…@v0.3.1`. Published versions show up in the
[pi package gallery](https://pi.dev/packages) through the `pi-package` keyword.

## License

MIT
