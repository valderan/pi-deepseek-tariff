import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
	BUILTIN_PRICING,
	BUILTIN_REQUESTS,
	createPricingStore,
	parsePricing,
	parseRequestPricing,
} from "../src/pricing.ts";

const html = readFileSync(fileURLToPath(new URL("./fixtures/pricing.html", import.meta.url)), "utf8");

test("parsePricing reads per-model peak and off-peak prices", () => {
	const models = parsePricing(html);
	assert.ok(models, "pricing table should be found");
	assert.deepEqual(Object.keys(models).sort(), ["deepseek-flash", "deepseek-v4-pro"]);

	assert.deepEqual(models["deepseek-flash"], {
		peak: { cacheHit: 0.006, cacheMiss: 0.3, output: 1.2 },
		offPeak: { cacheHit: 0.003, cacheMiss: 0.15, output: 0.6 },
	});
	assert.deepEqual(models["deepseek-v4-pro"], {
		peak: { cacheHit: 0.044, cacheMiss: 1.32, output: 3.96 },
		offPeak: { cacheHit: 0.022, cacheMiss: 0.66, output: 1.98 },
	});
});

test("parsePricing handles footnote markers in the header", () => {
	const models = parsePricing(html);
	assert.ok(models);
	// The page writes "deepseek-flash (1)"; the footnote must not leak into the id.
	assert.equal(models["deepseek-flash"] !== undefined, true);
	assert.equal(Object.keys(models).some((name) => name.includes("(")), false);
});

test("parsePricing returns undefined when the table is missing", () => {
	assert.equal(parsePricing("<html><body>nothing</body></html>"), undefined);
});

test("parseRequestPricing reads the Search & Fetch table", () => {
	assert.deepEqual(parseRequestPricing(html), [
		{ api: "Search", unit: "Per 1,000 successful requests", price: 0.75 },
		{ api: "Fetch", unit: "Per 1,000 successful requests", price: 0.75 },
	]);
});

test("parseRequestPricing is empty without the table", () => {
	assert.deepEqual(parseRequestPricing("<table><tr><td>nope</td></tr></table>"), []);
});

function makeStore(dir: string, options: { offline?: boolean; fetchImpl?: typeof fetch; ttlMs?: number } = {}) {
	let calls = 0;
	const fetchImpl = (async (input: RequestInfo | URL) => {
		calls += 1;
		if (options.fetchImpl) return options.fetchImpl(input);
		return new Response(html, { status: 200 });
	}) as typeof fetch;
	const store = createPricingStore({
		cachePath: join(dir, "pricing.json"),
		offline: options.offline,
		ttlMs: options.ttlMs,
		fetchImpl,
	});
	return { store, calls: () => calls };
}

test("store starts from built-in values and caches parsed prices", async () => {
	const dir = mkdtempSync(join(tmpdir(), "dsp-"));
	const { store, calls } = makeStore(dir);

	assert.equal(store.get().source, "builtin");
	assert.deepEqual(store.get().models, BUILTIN_PRICING);
	assert.deepEqual(store.get().requests, BUILTIN_REQUESTS);

	const value = await store.refresh();
	assert.equal(value.source, "live");
	assert.equal(Object.keys(value.models).length, 2);

	// A second refresh inside the TTL must not hit the network.
	await store.refresh();
	assert.equal(calls(), 1);

	// A fresh store reads the on-disk cache instead of fetching.
	const second = makeStore(dir);
	second.store.loadCache();
	assert.equal(second.store.get().source, "cache");
	assert.deepEqual(second.store.get().models, value.models);
	await second.store.refresh();
	assert.equal(second.calls(), 0);
});

test("store does not fetch when offline", async () => {
	const dir = mkdtempSync(join(tmpdir(), "dsp-"));
	const { store, calls } = makeStore(dir, { offline: true });
	const value = await store.refresh(true);
	assert.equal(value.source, "builtin");
	assert.equal(calls(), 0);
});

test("store keeps working values when the page cannot be parsed", async () => {
	const dir = mkdtempSync(join(tmpdir(), "dsp-"));
	const { store } = makeStore(dir, { fetchImpl: async () => new Response("<html>nope</html>", { status: 200 }) });
	const value = await store.refresh(true);
	assert.equal(value.source, "builtin");
	assert.deepEqual(value.models, BUILTIN_PRICING);
});

test("store ignores a corrupt cache file", () => {
	const dir = mkdtempSync(join(tmpdir(), "dsp-"));
	writeFileSync(join(dir, "pricing.json"), "{ not json");
	const { store } = makeStore(dir);
	store.loadCache();
	assert.equal(store.get().source, "builtin");
});
