/**
 * Presentation: the footer status line and the panel body.
 *
 * Colors follow the pi theme: the footer clock and the tariff word share the
 * state token (green off-peak, red peak), the countdown uses the accent token,
 * and only the brand keeps a fixed colour. The panel below the editor keeps the
 * warning/text pairing.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Color } from "@earendil-works/pi-tui";
import type { Config } from "./config.ts";
import { localizeUnit, STRINGS, type Lang } from "./i18n.ts";
import type { Pricing, RequestPricing } from "./pricing.ts";
import {
	countdownPhase,
	dayRangeLabel,
	humanize,
	isHoliday,
	isPeak,
	localDayShift,
	localParts,
	localPeakWindows,
	nextTransition,
	PEAK_WINDOWS_UTC,
	tzLabel,
	utcStamp,
	type CountdownPhase,
} from "./rules.ts";

/** Placeholder for a full-width rule; the renderer expands it to the panel width. */
export const SEPARATOR = "\u0000rule";

/** Footer clock: one cell wide, so the segment stays short on the shared status line. */
const CLOCK = "\u25F7"; // ◷

/**
 * DeepSeek brand blue (#4175E6). Fixed in every theme: it is the product colour, not a
 * theme role. Written as a plain `Color` literal rather than `parseColor("#4175E6")`, so
 * this module keeps zero runtime imports — the test job runs without `npm install`.
 */
const BRAND_BLUE: Color = { kind: "rgb", r: 0x41, g: 0x75, b: 0xe6 };

/** "Search & Fetch" value: a shared price is printed once. */
export function requestPricingText(entries: RequestPricing[], lang: Lang): string | undefined {
	if (entries.length === 0) return undefined;

	const groups = new Map<string, { price: number; unit: string; apis: string[] }>();
	for (const entry of entries) {
		const key = `${entry.price}|${entry.unit}`;
		const group = groups.get(key) ?? { price: entry.price, unit: entry.unit, apis: [] };
		group.apis.push(entry.api);
		groups.set(key, group);
	}

	const localized = (unit: string) => localizeUnit(unit, lang);
	const grouped = [...groups.values()];

	if (grouped.length === 1) {
		const group = grouped[0];
		return `$${group.price.toFixed(2)} ${localized(group.unit)}`.trim();
	}

	const sharedUnit = grouped.every((group) => group.unit === grouped[0].unit) ? grouped[0].unit : undefined;
	const parts = grouped.map(
		(group) => `${group.apis.join(" / ")} $${group.price.toFixed(2)}${sharedUnit ? "" : ` ${localized(group.unit)}`}`,
	);
	return `${parts.join(" · ")}${sharedUnit ? ` ${localized(sharedUnit)}` : ""}`.trim();
}

/**
 * The tariff word with its tail painted as the switch approaches: the letters the
 * feed already consumed go dim and the last up to four take the colour of the tariff
 * that is about to start (red towards PEAK, green towards OFF-PEAK).
 */
function tariffWord(
	theme: Theme,
	word: string,
	current: "success" | "error",
	incoming: "success" | "error",
	phase: CountdownPhase,
): string {
	if (phase.swallowed <= 0) return theme.fg(current, word);
	const cut = Math.max(0, word.length - phase.swallowed);
	const head = cut > 0 ? theme.fg("dim", word.slice(0, cut)) : "";
	return `${head}${theme.fg(incoming, word.slice(cut))}`;
}

/**
 * Compact footer line: a clock, the brand in DeepSeek blue, the tariff word and
 * the countdown — for example "◷ deepseek OFF-PEAK → 11h 59m".
 *
 * The clock carries the state colour (green off-peak, red peak). Below 15 minutes
 * to the next switch both the clock and the countdown turn yellow, and in the last
 * four minutes the tariff word is eaten from the end, one letter per minute shown
 * by the counter. The duration keeps the panel language units.
 */
export function statusText(theme: Theme, config: Config, lang: Lang, pricing: Pricing): string {
	void pricing;
	const text = STRINGS[lang];
	const now = new Date();
	const peak = isPeak(now, config.holidays);
	const next = nextTransition(now, config.holidays);
	const msLeft = next.getTime() - now.getTime();
	const phase = countdownPhase(msLeft);
	const state = peak ? "error" : "success";
	const incoming = peak ? "success" : "error";
	const clock = theme.fg(phase.urgent ? "warning" : state, CLOCK);
	const brand = theme.style(text.statusBrand, { fg: BRAND_BLUE });
	const word = peak ? text.statusPeak : text.statusOffPeak;
	const label = tariffWord(theme, word, state, incoming, phase);
	const countdown = theme.fg(phase.urgent ? "warning" : "accent", text.statusFor(humanize(msLeft, lang)));
	return `${clock} ${brand} ${label} ${countdown}`;
}

/**
 * Colour the product name inside a panel label without splitting the string in
 * i18n: the label stays one translatable line, only the brand word is swapped to
 * the DeepSeek blue. Falls back to `rest(label)` when the name is missing.
 */
function brandLabel(theme: Theme, label: string, brand: string, rest: (value: string) => string): string {
	const at = label.indexOf(brand);
	if (at < 0) return rest(label);
	const head = rest(label.slice(0, at));
	const tail = rest(label.slice(at + brand.length));
	return `${head}${theme.style(brand, { fg: BRAND_BLUE })}${tail}`;
}

export function panelLines(
	theme: Theme,
	options: { config: Config; lang: Lang; currentModel?: string; pricing: Pricing; ttlMs: number },
): string[] {
	const { config, lang, currentModel, pricing, ttlMs } = options;
	const text = STRINGS[lang];
	const now = new Date();
	const peak = isPeak(now, config.holidays);
	const holiday = isHoliday(now, config.holidays);
	const next = nextTransition(now, config.holidays);
	const after = nextTransition(next, config.holidays);
	const zone = tzLabel(now);
	const local = localParts(now);
	const yellow = (value: string) => theme.fg("warning", value);
	const white = (value: string) => theme.fg("text", value);
	const state = peak ? "PEAK" : "OFF-PEAK";

	const lines: string[] = [];

	// 1. Current tariff.
	lines.push(
		peak
			? theme.fg("error", text.peakTitle)
			: theme.fg("success", text.offPeakTitle) + (holiday ? theme.fg("dim", text.holiday) : ""),
	);

	// 2. Machine clock and UTC.
	lines.push(`${yellow(text.computer)} ${white(`${local.time} ${local.date}(${zone}) | UTC: ${utcStamp(now)}`)}`);

	// 3. Next window: start - end date(zone) in duration.
	const start = localParts(next);
	const end = localParts(after);
	const windowRange =
		start.date === end.date
			? `${start.hm} - ${end.hm} ${end.date}(${zone})`
			: `${start.hm} ${start.date} - ${end.hm} ${end.date}(${zone})`;
	lines.push(
		`${yellow(text.nextWindow)} ${white(`${windowRange} ${text.nextIn(humanize(next.getTime() - now.getTime(), lang))}`)}`,
	);

	// 4. Model prices with the active tariff highlighted.
	lines.push(`${brandLabel(theme, text.prices, text.pricesBrand, yellow)} ${white(text.pricesState(state))}`);
	const value = (amount: number) => amount.toFixed(4).padStart(8);
	for (const [name, model] of Object.entries(pricing.models)) {
		const id = `${config.providerPrefix}${name}`;
		const isCurrent = currentModel === id ? theme.fg("accent", `  ${text.activeModel}`) : "";
		lines.push(`  ${theme.fg("muted", id)}${isCurrent}`);
		for (const tariff of ["peak", "offPeak"] as const) {
			const row = model[tariff];
			const label = tariff === "peak" ? "PEAK    " : "OFF-PEAK";
			const body = `${label}  hit ${value(row.cacheHit)}  miss ${value(row.cacheMiss)}  out ${value(row.output)}`;
			const active = tariff === (peak ? "peak" : "offPeak");
			lines.push(
				active
					? theme.bold(theme.fg(peak ? "error" : "success", `    ▸ ${body}`))
					: theme.fg("dim", `      ${body}`),
			);
		}
	}

	// 5. Search & Fetch request pricing.
	const requests = requestPricingText(pricing.requests, lang);
	if (requests) lines.push(`  ${yellow(text.requestPricing)} ${white(requests)}`);

	// 6. Reference notes, framed by rules.
	lines.push(SEPARATOR);
	lines.push(
		`${theme.fg("dim", text.peakWindows(zone))} ${white(
			`${localPeakWindows(now, lang)}, ${dayRangeLabel(localDayShift(now, PEAK_WINDOWS_UTC[0][0]), lang)}`,
		)}`,
	);
	lines.push(`${theme.fg("dim", text.offPeak)} ${white(text.offPeakNote)}`);

	// 7. Price source and freshness.
	let source: string;
	if (pricing.fetchedAt === 0) {
		source = text.sourceBuiltin;
	} else {
		const when = new Date(pricing.fetchedAt);
		const stamp = `${localParts(when).hm} ${localParts(when).short}`;
		const remaining = humanize(Math.max(0, pricing.fetchedAt + ttlMs - Date.now()), lang);
		source = text.sourceLive(stamp, remaining);
	}
	lines.push(`${theme.fg("dim", text.priceSource)} ${white(source)}`);
	lines.push(SEPARATOR);

	// 8. Command hints.
	lines.push(`${theme.fg("dim", text.commands)} ${white("/dsp on|off|refresh|en|ru · /dsp footer on|off")}`);

	return lines;
}
