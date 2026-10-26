/**
 * Presentation: the footer status line and the panel body.
 *
 * Colors follow the pi theme: labels in the warning token, values in the text
 * token, active rows bold, inactive rows dim.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Config } from "./config.ts";
import { localizeUnit, STRINGS, type Lang } from "./i18n.ts";
import type { Pricing, RequestPricing } from "./pricing.ts";
import {
	clockTime,
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
} from "./rules.ts";

/** Placeholder for a full-width rule; the renderer expands it to the panel width. */
export const SEPARATOR = "\u0000rule";

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

export function statusText(theme: Theme, config: Config, lang: Lang, pricing: Pricing): string {
	void pricing;
	const now = new Date();
	const peak = isPeak(now, config.holidays);
	const next = nextTransition(now, config.holidays);
	const label = peak ? "PEAK" : "off-peak";
	const color = theme.fg(peak ? "error" : "success", label);
	const hint = peak ? "→ off-peak" : "→ peak";
	const when = `${clockTime(next, lang)} (${humanize(next.getTime() - now.getTime(), lang)})`;
	return `${theme.fg("dim", "deepseek:")} ${color} ${theme.fg("dim", `${hint} ${when}`)}`;
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
	lines.push(`${yellow(text.prices)} ${white(text.pricesState(state))}`);
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
	lines.push(`${theme.fg("dim", text.commands)} ${white("/dsp on|off|refresh|en|ru")}`);

	return lines;
}
