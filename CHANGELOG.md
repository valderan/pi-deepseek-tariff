# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Git tags (`vX.Y.Z`)
always point at the commit whose `package.json` declares the same version.

## [Unreleased]

## [0.3.2] - 2026-10-30

### Added

- Tab completion for the `/dsp` arguments (`on`, `off`, `refresh`, `en`, `ru`, `footer`
  plus `footer on|off`), so the documented subcommands are discoverable from the editor.

## [0.3.1] - 2026-10-26

### Added

- `pi.image`: a banner rendered from the real panel output, shown in the pi package gallery.

### Changed

- README: install through the npm `latest` dist-tag, plus the pinned git form; release
  section documents the tag/version lockstep and 2FA publishing.

### Removed

- `.npmignore`, redundant because `package.json` ships an explicit `files` list.

## [0.3.0] - 2026-10-26

### Added

- Compact footer status line: `● DeepSeek Off-peak for 11h 59m`
  (Russian: `● DeepSeek Обычный ещё 11ч 59м`).
- `/dsp footer on|off`, plus the one-word forms `/dsp footeron` and `/dsp footeroff`;
  the choice is persisted as `footer` in `deepseek-peak.json`.
- Footer line is limited to DeepSeek models unless `alwaysShow` is enabled.

### Changed

- The footer text is always yellow; only the dot switches colour — green for off-peak,
  red for peak.
- Panel hint advertises `/dsp` instead of the long command name.

## [0.2.0] - 2026-10-26

### Added

- `/dsp` as the short form of `/deepseek-peak`.
- `/deepseek-peek` is accepted so the frequent misspelling still resolves.

### Changed

- README documents the aliases; a test asserts the panel hint uses `/dsp`.

## [0.1.0] - 2026-10-26

### Added

- Tariff panel with the machine clock, UTC time, the next window and the peak windows in
  the local time zone (weekday labels shift with the zone).
- Per-model prices (cache hit, cache miss, output) and Search & Fetch request pricing,
  parsed from `api-docs.deepseek.com/quick_start/pricing/` with the active tariff highlighted.
- Parsed prices cached on disk and refreshed at most once per `pricingTtlHours` (default 6);
  `PI_OFFLINE` keeps the package entirely off the network.
- English (default, following the pi settings language) and Russian, switchable and persisted.
- Paths honour `PI_CODING_AGENT_DIR`.
- `node:test` suites over the pure rule and parsing modules with a captured page fixture.

[Unreleased]: https://github.com/valderan/pi-deepseek-tariff/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/valderan/pi-deepseek-tariff/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/valderan/pi-deepseek-tariff/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/valderan/pi-deepseek-tariff/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/valderan/pi-deepseek-tariff/releases/tag/v0.1.0
