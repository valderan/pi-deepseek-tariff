/**
 * Localization for the DeepSeek tariff panel.
 *
 * Add a language by extending `Lang`, `STRINGS` and `DAY_NAMES`.
 */

export type Lang = "en" | "ru";

export function normalizeLang(value: unknown): Lang | undefined {
	if (typeof value !== "string") return undefined;
	const lower = value.trim().toLowerCase();
	if (lower.startsWith("ru")) return "ru";
	if (lower.startsWith("en")) return "en";
	return undefined;
}

type Strings = {
	peakTitle: string;
	offPeakTitle: string;
	holiday: string;
	computer: string;
	nextWindow: string;
	nextIn: (duration: string) => string;
	and: string;
	prices: string;
	pricesState: (state: string) => string;
	activeModel: string;
	peakWindows: (zone: string) => string;
	peakDays: string;
	offPeak: string;
	offPeakNote: string;
	priceSource: string;
	sourceLive: (when: string, next: string) => string;
	sourceBuiltin: string;
	requestPricing: string;
	commands: string;
	statusBrand: string;
	statusPeak: string;
	statusOffPeak: string;
	statusFor: (duration: string) => string;
	locale: string;
	hourUnit: string;
	minuteUnit: string;
};

export const STRINGS: Record<Lang, Strings> = {
	en: {
		peakTitle: "Warning: Now PEAK",
		offPeakTitle: "Now OFF-PEAK",
		holiday: " (Chinese holiday)",
		computer: "Computer:",
		nextWindow: "Next window:",
		nextIn: (duration) => `in ${duration}`,
		and: "and",
		prices: "DeepSeek prices:",
		pricesState: (state) => `$ per 1M tokens, active: ${state}`,
		activeModel: "← active",
		peakWindows: (zone) => `Peak windows (${zone}):`,
		peakDays: "Mon-Fri",
		offPeak: "Off-peak",
		offPeakNote: "= night, weekends and Chinese holidays",
		priceSource: "Price source:",
		sourceLive: (when, next) => `api-docs.deepseek.com, updated ${when} (next in ${next})`,
		sourceBuiltin: "built-in values (page unavailable)",
		requestPricing: "Search & Fetch:",
		commands: "Commands:",
		statusBrand: "DeepSeek",
		statusPeak: "Peak",
		statusOffPeak: "Off-peak",
		statusFor: (duration) => `for ${duration}`,
		locale: "en-GB",
		hourUnit: "h",
		minuteUnit: "m",
	},
	ru: {
		peakTitle: "Warning: Сейчас: PEAK",
		offPeakTitle: "Сейчас: OFF-PEAK",
		holiday: " (праздник Китая)",
		computer: "Компьютер:",
		nextWindow: "Следующее окно:",
		nextIn: (duration) => `через ${duration}`,
		and: "и",
		prices: "Цены DeepSeek:",
		pricesState: (state) => `$ за 1M токенов, активен ${state}`,
		activeModel: "← активна",
		peakWindows: (zone) => `Окна peak (${zone}):`,
		peakDays: "пн-пт",
		offPeak: "Off-peak",
		offPeakNote: "= ночь, выходные и праздники Китая",
		priceSource: "Источник цен:",
		sourceLive: (when, next) => `api-docs.deepseek.com, обновлено ${when} (следующее через ${next})`,
		sourceBuiltin: "встроенные значения (страница недоступна)",
		requestPricing: "Search & Fetch:",
		commands: "Команды:",
		statusBrand: "DeepSeek",
		statusPeak: "Пиковый",
		statusOffPeak: "Обычный",
		statusFor: (duration) => `ещё ${duration}`,
		locale: "ru-RU",
		hourUnit: "ч",
		minuteUnit: "м",
	},
};

export const DAY_NAMES: Record<Lang, string[]> = {
	en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
	ru: ["вс", "пн", "вт", "ср", "чт", "пт", "сб"],
};

/** Translate the docs unit cell ("Per 1,000 successful requests") for display. */
export function localizeUnit(unit: string, lang: Lang): string {
	if (lang === "ru") {
		if (/1,?000/.test(unit) && /request/i.test(unit)) return "за 1,000 успешных запросов";
		return unit;
	}
	// The page capitalizes the cell; inline text reads better lower-case.
	return unit.length > 0 ? unit.charAt(0).toLowerCase() + unit.slice(1) : unit;
}
