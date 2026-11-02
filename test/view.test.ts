import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { normalizeLang } from "../src/i18n.ts";
import { dayRangeLabel, humanize, localClock, localDayShift } from "../src/rules.ts";
import { panelLines, requestPricingText } from "../src/view.ts";

test("normalizeLang accepts ru/en in any case", () => {
	assert.equal(normalizeLang("ru"), "ru");
	assert.equal(normalizeLang("RU"), "ru");
	assert.equal(normalizeLang("ru-RU"), "ru");
	assert.equal(normalizeLang("en"), "en");
	assert.equal(normalizeLang("EN-gb"), "en");
	assert.equal(normalizeLang("de"), undefined);
	assert.equal(normalizeLang(undefined), undefined);
});

test("humanize switches units per language", () => {
	assert.equal(humanize(30 * 60_000, "en"), "30m");
	assert.equal(humanize(30 * 60_000, "ru"), "30м");
	assert.equal(humanize(2 * 3_600_000 + 12 * 60_000, "en"), "2h 12m");
	assert.equal(humanize(2 * 3_600_000 + 12 * 60_000, "ru"), "2ч 12м");
	assert.equal(humanize(3 * 3_600_000, "en"), "3h");
});

test("requestPricingText prints a shared price once", () => {
	assert.equal(
		requestPricingText(
			[
				{ api: "Search", unit: "Per 1,000 successful requests", price: 0.75 },
				{ api: "Fetch", unit: "Per 1,000 successful requests", price: 0.75 },
			],
			"en",
		),
		"$0.75 per 1,000 successful requests",
	);
	assert.equal(
		requestPricingText(
			[
				{ api: "Search", unit: "Per 1,000 successful requests", price: 0.75 },
				{ api: "Fetch", unit: "Per 1,000 successful requests", price: 0.75 },
			],
			"ru",
		),
		"$0.75 за 1,000 успешных запросов",
	);
});

test("requestPricingText splits different prices per API", () => {
	assert.equal(
		requestPricingText(
			[
				{ api: "Search", unit: "Per 1,000 successful requests", price: 0.75 },
				{ api: "Fetch", unit: "Per 1,000 successful requests", price: 0.5 },
			],
			"en",
		),
		"Search $0.75 · Fetch $0.50 per 1,000 successful requests",
	);
});

test("requestPricingText returns undefined for no entries", () => {
	assert.equal(requestPricingText([], "en"), undefined);
});

const PANEL_CONFIG = {
	intervalMs: 30_000,
	pricingTtlHours: 6,
	alwaysShow: false,
	footer: true,
	models: ["deepseek"],
	providerPrefix: "deepseek:",
	holidays: new Set<string>(),
};
const PANEL_PRICING = {
	models: { "deepseek-flash": { peak: { cacheHit: 0, cacheMiss: 0, output: 0 }, offPeak: { cacheHit: 0, cacheMiss: 0, output: 0 } } },
	requests: [],
	fetchedAt: 0,
	source: "builtin" as const,
};

test("panel advertises the short /dsp command form", () => {
	const theme = { fg: (_token: string, text: string) => text, style: (text: string) => text, bold: (text: string) => text } as never;
	const lines = panelLines(theme, {
		config: PANEL_CONFIG,
		lang: "en",
		currentModel: "deepseek:deepseek-flash",
		pricing: PANEL_PRICING,
		ttlMs: 6 * 3_600_000,
	});
	const hint = lines.at(-1) ?? "";
	assert.match(hint, /\/dsp on\|off\|refresh\|en\|ru/);
	assert.doesNotMatch(hint, /\/deepseek-peak on/);
});

test("price label paints only the product name in the brand colour", () => {
	const styled: string[] = [];
	const theme = {
		fg: (token: string, text: string) => {
			styled.push(`${token}:${text}`);
			return text;
		},
		style: (text: string) => {
			styled.push(`brand:${text}`);
			return text;
		},
		bold: (text: string) => text,
	} as never;
	const options = { config: PANEL_CONFIG, currentModel: undefined, pricing: PANEL_PRICING, ttlMs: 6 * 3_600_000 };

	for (const [lang, expected] of [
		["en", "DeepSeek prices:"],
		["ru", "Цены DeepSeek:"],
	] as const) {
		styled.length = 0;
		const line = panelLines(theme, { ...options, lang }).find((item) => item.includes("$ per 1M tokens") || item.includes("$ за 1M токенов"));
		assert.ok(line, `the price label must be rendered for ${lang}`);
		assert.ok(line.startsWith(expected), `unexpected label: ${line}`);
		assert.ok(styled.includes("brand:DeepSeek"), "the product name must be painted with the brand colour");
		assert.ok(!styled.includes(`warning:${expected}`), "the whole label must not stay in the warning token");
		// The colon keeps the label token, so the line still reads as one label.
		assert.ok(styled.some((entry) => entry.startsWith("warning:") && entry.includes(":")));
	}
});

/**
 * Zone-dependent helpers are checked in a child process: Node caches the zone
 * of the running process, so TZ must be set before startup.
 */
function runInZone(tz: string, expression: string): string {
	const modulePath = fileURLToPath(new URL("../src/rules.ts", import.meta.url));
	const script = `
		const { localClock, localDayShift, dayRangeLabel } = await import(${JSON.stringify(modulePath)});
		const date = new Date("2026-10-26T08:00:00Z");
		console.log(JSON.stringify({ ${expression} }));
	`;
	const output = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
		env: { ...process.env, TZ: tz },
		encoding: "utf8",
	});
	return JSON.parse(output.trim());
}

test("local peak windows follow the machine zone", () => {
	assert.deepEqual(runInZone("Europe/Moscow", "a: localClock(date, 1), b: localClock(date, 10)"), {
		a: "04:00",
		b: "13:00",
	});
	assert.deepEqual(runInZone("UTC", "a: localClock(date, 1), b: localClock(date, 10)"), {
		a: "01:00",
		b: "10:00",
	});
	assert.deepEqual(runInZone("Asia/Kolkata", "a: localClock(date, 1), b: localClock(date, 10)"), {
		a: "06:30",
		b: "15:30",
	});
});

test("weekday labels shift with the zone", () => {
	assert.deepEqual(
		runInZone("America/New_York", "a: dayRangeLabel(localDayShift(date, 1), 'en'), b: localClock(date, 1)"),
		{ a: "Sun-Thu", b: "21:00" },
	);
	assert.deepEqual(runInZone("Europe/Moscow", "a: dayRangeLabel(localDayShift(date, 1), 'en')"), {
		a: "Mon-Fri",
	});
	assert.deepEqual(runInZone("Europe/Moscow", "a: dayRangeLabel(localDayShift(date, 1), 'ru')"), {
		a: "пн-пт",
	});
});

test("footer status leads with a state-coloured clock and the lowercase brand", async () => {
	const calls: Array<[string, string]> = [];
	const theme = {
		fg: (token: string, text: string) => {
			calls.push([token, text]);
			return `<${token}>${text}`;
		},
		style: (text: string) => `<brand>${text}</brand>`,
		bold: (text: string) => text,
	} as never;
	const { statusText } = await import("../src/view.ts");
	const config = {
		intervalMs: 30_000,
		pricingTtlHours: 6,
		alwaysShow: false,
		footer: true,
		models: ["deepseek"],
		providerPrefix: "deepseek:",
		holidays: new Set<string>(),
	};
	const line = statusText(theme, config, "ru", { models: {}, requests: [], fetchedAt: 0, source: "builtin" });

	// The clock replaced the dot and carries the state colour.
	const clock = calls.find(([, text]) => text === "\u25F7");
	assert.ok(clock, "the clock glyph must lead the line");
	assert.ok(clock[0] === "success" || clock[0] === "error", `unexpected clock token ${clock[0]}`);

	// The tariff is English in every language and matches the clock colour.
	const label = calls.find(([, text]) => text === "PEAK" || text === "OFF-PEAK");
	assert.ok(label, "the tariff must be written as PEAK / OFF-PEAK");
	assert.equal(label[0], clock[0], "clock and tariff must share the state colour");

	// The brand is lowercase and keeps the DeepSeek blue instead of a theme token.
	assert.match(line, /<brand>deepseek<\/brand>/);

	// "for" / "ещё" is replaced by an arrow, and the duration stays localized.
	const rest = calls.find(([token]) => token === "accent");
	assert.ok(rest, "the countdown must use the accent token");
	assert.match(rest[1], /^\u2192 \d+[\u0447\u043c] /);
	assert.doesNotMatch(line, /ещё|for /);
	assert.doesNotMatch(line, /warning/);
});
