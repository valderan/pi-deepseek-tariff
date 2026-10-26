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

test("panel advertises the short /dsp command form", () => {
	const theme = { fg: (_token: string, text: string) => text, bold: (text: string) => text } as never;
	const lines = panelLines(theme, {
		config: {
			intervalMs: 30_000,
			pricingTtlHours: 6,
			alwaysShow: false,
			models: ["deepseek"],
			providerPrefix: "deepseek:",
			holidays: new Set<string>(),
		},
		lang: "en",
		currentModel: "deepseek:deepseek-flash",
		pricing: {
			models: { "deepseek-flash": { peak: { cacheHit: 0, cacheMiss: 0, output: 0 }, offPeak: { cacheHit: 0, cacheMiss: 0, output: 0 } } },
			requests: [],
			fetchedAt: 0,
			source: "builtin",
		},
		ttlMs: 6 * 3_600_000,
	});
	const hint = lines.at(-1) ?? "";
	assert.match(hint, /\/dsp on\|off\|refresh\|en\|ru/);
	assert.doesNotMatch(hint, /\/deepseek-peak on/);
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
