/**
 * DeepSeek tariff clock rules and local-time formatting.
 *
 * https://api-docs.deepseek.com/quick_start/pricing/
 *   - Peak: 01:00-04:00 and 06:00-10:00 UTC, Monday-Friday
 *   - Off-peak: all other hours, weekends and Chinese public holidays
 *
 * Everything here is pure: pass a `Date`, get numbers or strings back. That
 * keeps the rules testable without a TUI and without the network.
 */

import { DAY_NAMES, type Lang } from "./i18n.ts";

/** Peak windows in UTC hours, [start, end). */
export const PEAK_WINDOWS_UTC: ReadonlyArray<readonly [number, number]> = [
	[1, 4],
	[6, 10],
];

const MAX_SCAN_MINUTES = 8 * 24 * 60;

/** Short zone names, because ICU reports "GMT+3" for most of them. */
const TZ_ABBREV: Record<string, string> = {
	"Europe/Moscow": "MSK",
	"Europe/Minsk": "MSK",
	"Europe/Kaliningrad": "KGD",
	"Europe/Samara": "SAMT",
	"Asia/Yekaterinburg": "YEKT",
	"Asia/Omsk": "OMST",
	"Asia/Novosibirsk": "NOVT",
	"Asia/Krasnoyarsk": "KRAT",
	"Asia/Irkutsk": "IRKT",
	"Asia/Yakutsk": "YAKT",
	"Asia/Vladivostok": "VLAT",
	"Asia/Magadan": "MAGT",
	"Asia/Sakhalin": "SAKT",
	"Asia/Kamchatka": "PETT",
	"Europe/Kyiv": "EET",
	"Europe/Kiev": "EET",
	UTC: "UTC",
	"Etc/UTC": "UTC",
};

export const pad2 = (value: number) => String(value).padStart(2, "0");

/** Beijing calendar date (UTC+8) as YYYY-MM-DD. */
export function beijingDateKey(date: Date): string {
	const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
	return shifted.toISOString().slice(0, 10);
}

export function isHoliday(date: Date, holidays: ReadonlySet<string>): boolean {
	return holidays.size > 0 && holidays.has(beijingDateKey(date));
}

export function isPeak(date: Date, holidays: ReadonlySet<string>): boolean {
	if (isHoliday(date, holidays)) return false;
	const weekday = date.getUTCDay();
	if (weekday === 0 || weekday === 6) return false;
	const hour = date.getUTCHours() + date.getUTCMinutes() / 60;
	return PEAK_WINDOWS_UTC.some(([start, end]) => hour >= start && hour < end);
}

/** First minute boundary at which the peak state differs from the state at `from`. */
export function nextTransition(from: Date, holidays: ReadonlySet<string>): Date {
	const current = isPeak(from, holidays);
	const probe = new Date(from.getTime());
	probe.setUTCSeconds(0, 0);
	probe.setUTCMinutes(probe.getUTCMinutes() + 1);
	for (let i = 0; i < MAX_SCAN_MINUTES; i++) {
		if (isPeak(probe, holidays) !== current) return new Date(probe.getTime());
		probe.setUTCMinutes(probe.getUTCMinutes() + 1);
	}
	return probe;
}

export type LocalParts = { time: string; hm: string; date: string; short: string };

export function localParts(date: Date): LocalParts {
	return {
		time: `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`,
		hm: `${pad2(date.getHours())}:${pad2(date.getMinutes())}`,
		date: `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()}`,
		short: `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}`,
	};
}

export function utcStamp(date: Date): string {
	const day = `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
	return `${day} ${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`;
}

export function tzLabel(date: Date): string {
	const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const known = TZ_ABBREV[zone];
	if (known) return known;
	const part =
		new Intl.DateTimeFormat("en-GB", { timeZoneName: "short" })
			.formatToParts(date)
			.find((item) => item.type === "timeZoneName")?.value ?? "";
	const offset = part.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/i);
	if (offset) {
		const sign = offset[1].startsWith("-") ? "-" : "+";
		return `UTC${sign}${pad2(Math.abs(Number(offset[1])))}:${offset[2] ?? "00"}`;
	}
	return part || "LOCAL";
}

export function clockTime(date: Date, lang: Lang): string {
	const locale = lang === "ru" ? "ru-RU" : "en-GB";
	return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

export function humanize(ms: number, lang: Lang = "en"): string {
	const minutes = Math.max(0, Math.round(ms / 60_000));
	const hourUnit = lang === "ru" ? "ч" : "h";
	const minuteUnit = lang === "ru" ? "м" : "m";
	if (minutes < 60) return `${minutes}${minuteUnit}`;
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest === 0 ? `${hours}${hourUnit}` : `${hours}${hourUnit} ${rest}${minuteUnit}`;
}

/** Local wall-clock time of a UTC hour on the machine's current date. */
export function localClock(date: Date, utcHour: number): string {
	const instant = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), utcHour, 0, 0));
	return `${pad2(instant.getHours())}:${pad2(instant.getMinutes())}`;
}

/** How many calendar days the local clock is ahead of UTC at that hour. */
export function localDayShift(date: Date, utcHour: number): number {
	const instant = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), utcHour, 0, 0));
	const utcDay = Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate());
	const localDay = Date.UTC(instant.getFullYear(), instant.getMonth(), instant.getDate());
	return Math.round((localDay - utcDay) / 86_400_000);
}

/** "Mon-Fri" shifted by `shift` days, so the label matches local weekdays. */
export function dayRangeLabel(shift: number, lang: Lang): string {
	const names = DAY_NAMES[lang];
	const start = (1 + shift + 7) % 7;
	const end = (5 + shift + 7) % 7;
	return `${names[start]}-${names[end]}`;
}

/** "04:00-07:00 and 09:00-13:00" for the machine's time zone. */
export function localPeakWindows(date: Date, lang: Lang): string {
	const joiner = lang === "ru" ? " и " : " and ";
	return PEAK_WINDOWS_UTC.map(([from, to]) => `${localClock(date, from)}-${localClock(date, to)}`).join(joiner);
}
