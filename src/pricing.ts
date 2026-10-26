/**
 * DeepSeek pricing: parsing of the official docs page plus a small TTL cache.
 *
 * The page is parsed at most once per TTL (default 6 hours). Parsed values are
 * cached on disk so a restart does not hit the network either.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type Tariff = { cacheHit: number; cacheMiss: number; output: number };
export type ModelPricing = { peak: Tariff; offPeak: Tariff };
export type RequestPricing = { api: string; unit: string; price: number };
export type Pricing = {
	models: Record<string, ModelPricing>;
	requests: RequestPricing[];
	fetchedAt: number;
	source: "live" | "cache" | "builtin";
};

export const PRICING_URL = "https://api-docs.deepseek.com/quick_start/pricing/";
export const DEFAULT_TTL_HOURS = 6;

/** Values from the docs page at the time this package was written. */
export const BUILTIN_PRICING: Record<string, ModelPricing> = {
	"deepseek-flash": {
		peak: { cacheHit: 0.006, cacheMiss: 0.3, output: 1.2 },
		offPeak: { cacheHit: 0.003, cacheMiss: 0.15, output: 0.6 },
	},
	"deepseek-v4-pro": {
		peak: { cacheHit: 0.044, cacheMiss: 1.32, output: 3.96 },
		offPeak: { cacheHit: 0.022, cacheMiss: 0.66, output: 1.98 },
	},
};

export const BUILTIN_REQUESTS: RequestPricing[] = [
	{ api: "Search", unit: "per 1,000 successful requests", price: 0.75 },
	{ api: "Fetch", unit: "per 1,000 successful requests", price: 0.75 },
];

// ------------------------------------------------------------------- parsing

function textOf(html: string): string {
	return html
		.replace(/<[^>]*>/g, " ")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
		.replace(/\s+/g, " ")
		.trim();
}

function money(text: string): number | undefined {
	if (/free/i.test(text)) return 0;
	const value = Number(text.replace(/[^0-9.]/g, ""));
	return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function tableRows(table: string): string[][] {
	return [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((row) =>
		[...row[0].matchAll(/<t[hd][\s\S]*?<\/t[hd]>/gi)].map((cell) => textOf(cell[0])),
	);
}

function tables(html: string): string[] {
	return [...html.matchAll(/<table[\s\S]*?<\/table>/gi)].map((match) => match[0]);
}

const PRICE_FIELDS: ReadonlyArray<readonly [RegExp, keyof Tariff]> = [
	[/input tokens \(cache hit\)/i, "cacheHit"],
	[/input tokens \(cache miss\)/i, "cacheMiss"],
	[/output tokens/i, "output"],
];

/** Parse the per-model pricing table. Returns undefined when the table is absent. */
export function parsePricing(html: string): Record<string, ModelPricing> | undefined {
	for (const table of tables(html)) {
		const rows = tableRows(table);
		const header = rows.find((cells) => cells.some((cell) => /^model$/i.test(cell)));
		if (!header) continue;

		const headerStart = header.findIndex((cell) => /^model$/i.test(cell)) + 1;
		const names = header
			.slice(headerStart)
			.map((cell) => cell.replace(/\s*\(\d+\)\s*$/, "").trim())
			.filter((name) => name.length > 0);
		if (names.length === 0) continue;

		const empty = (): Tariff => ({ cacheHit: Number.NaN, cacheMiss: Number.NaN, output: Number.NaN });
		const parsed: Record<string, ModelPricing> = {};
		for (const name of names) parsed[name] = { peak: empty(), offPeak: empty() };

		let field: keyof Tariff | undefined;
		for (const cells of rows) {
			for (const cell of cells) {
				const match = PRICE_FIELDS.find(([pattern]) => pattern.test(cell));
				if (match) field = match[1];
			}
			const tariffIndex = cells.findIndex((cell) => /^(off[\s-]?peak|peak)$/i.test(cell));
			if (!field || tariffIndex < 0) continue;

			const currentField = field;
			const tariff: keyof ModelPricing = /^off/i.test(cells[tariffIndex]) ? "offPeak" : "peak";
			const values = cells.slice(tariffIndex + 1).map(money);
			names.forEach((name, index) => {
				const value = values[index];
				if (value !== undefined) parsed[name][tariff][currentField] = value;
			});
		}

		const complete = Object.entries(parsed).filter(([, model]) =>
			[model.peak, model.offPeak].every(
				(tariff) =>
					Number.isFinite(tariff.cacheHit) &&
					Number.isFinite(tariff.cacheMiss) &&
					Number.isFinite(tariff.output),
			),
		);
		if (complete.length > 0) return Object.fromEntries(complete);
	}
	return undefined;
}

/** Parse the Search / Fetch request pricing table. */
export function parseRequestPricing(html: string): RequestPricing[] {
	for (const table of tables(html)) {
		const rows = tableRows(table);
		const header = rows.find((cells) => cells.some((cell) => /^api$/i.test(cell)));
		if (!header) continue;
		const apiIndex = header.findIndex((cell) => /^api$/i.test(cell));
		const unitIndex = header.findIndex((cell) => /^unit$/i.test(cell));
		const priceIndex = header.findIndex((cell) => /^price$/i.test(cell));
		if (unitIndex < 0 || priceIndex < 0) continue;

		const entries: RequestPricing[] = [];
		for (const cells of rows) {
			const api = cells[apiIndex] ?? "";
			if (!/^[A-Za-z][A-Za-z &/-]{1,30}$/.test(api) || /^api$/i.test(api)) continue;
			const price = money(cells[priceIndex] ?? "");
			if (price === undefined) continue;
			entries.push({ api: api.trim(), unit: (cells[unitIndex] ?? "").trim(), price });
		}
		if (entries.length > 0) return entries;
	}
	return [];
}

// --------------------------------------------------------------------- cache

export type PricingStoreOptions = {
	cachePath: string;
	ttlMs?: number;
	/** PI_OFFLINE and friends: never touch the network. */
	offline?: boolean;
	fetchImpl?: typeof fetch;
};

export type PricingStore = {
	get(): Pricing;
	/** True when the parsed values are missing or older than the TTL. */
	expired(): boolean;
	/** Load the on-disk cache once, so a restart does not need the network. */
	loadCache(): Pricing;
	/** Parse the page when the TTL expired, or always with `force`. */
	refresh(force?: boolean): Promise<Pricing>;
	setTtl(ms: number): void;
};

export function createPricingStore(options: PricingStoreOptions): PricingStore {
	const { cachePath } = options;
	const fetchImpl = options.fetchImpl ?? fetch;
	const offline = options.offline ?? false;
	let ttlMs = options.ttlMs ?? DEFAULT_TTL_HOURS * 60 * 60 * 1000;
	let loading = false;
	let pricing: Pricing = {
		models: BUILTIN_PRICING,
		requests: BUILTIN_REQUESTS,
		fetchedAt: 0,
		source: "builtin",
	};

	const readCache = (): Pricing | undefined => {
		try {
			const raw = JSON.parse(readFileSync(cachePath, "utf8")) as {
				models?: unknown;
				requests?: unknown;
				fetchedAt?: unknown;
			};
			if (!raw.models || typeof raw.models !== "object") return undefined;
			const models = raw.models as Record<string, ModelPricing>;
			const valid = Object.values(models).every(
				(model) =>
					typeof model?.peak?.cacheMiss === "number" &&
					typeof model?.offPeak?.cacheMiss === "number" &&
					typeof model?.peak?.output === "number" &&
					typeof model?.offPeak?.output === "number",
			);
			if (!valid) return undefined;
			const requests = Array.isArray(raw.requests)
				? (raw.requests as RequestPricing[]).filter(
						(entry) => typeof entry?.api === "string" && typeof entry?.price === "number",
					)
				: [];
			return {
				models,
				requests: requests.length > 0 ? requests : BUILTIN_REQUESTS,
				fetchedAt: typeof raw.fetchedAt === "number" ? raw.fetchedAt : 0,
				source: "cache",
			};
		} catch {
			return undefined;
		}
	};

	const writeCache = (value: Pricing) => {
		try {
			mkdirSync(dirname(cachePath), { recursive: true });
			writeFileSync(
				cachePath,
				`${JSON.stringify({ models: value.models, requests: value.requests, fetchedAt: value.fetchedAt }, null, 2)}\n`,
			);
		} catch {
			// The cache is an optimization only.
		}
	};

	const expired = () => pricing.source === "builtin" || Date.now() - pricing.fetchedAt >= ttlMs;

	const refresh = async (force = false): Promise<Pricing> => {
		const fresh = pricing.source !== "builtin" && Date.now() - pricing.fetchedAt < ttlMs;
		if (!force && fresh) return pricing;
		if (loading) return pricing;
		if (offline) return pricing;

		loading = true;
		try {
			const response = await fetchImpl(PRICING_URL, {
				headers: { accept: "text/html", "user-agent": "pi-deepseek-tariff" },
				signal: AbortSignal.timeout(15_000),
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const html = await response.text();
			const models = parsePricing(html);
			if (!models) throw new Error("pricing table not found");
			const requests = parseRequestPricing(html);
			pricing = {
				models,
				requests: requests.length > 0 ? requests : BUILTIN_REQUESTS,
				fetchedAt: Date.now(),
				source: "live",
			};
			writeCache(pricing);
		} catch {
			if (pricing.source === "builtin") {
				const cached = readCache();
				if (cached) pricing = cached;
			}
		} finally {
			loading = false;
		}
		return pricing;
	};

	return {
		get: () => pricing,
		expired,
		loadCache: () => {
			if (pricing.source === "builtin") {
				const cached = readCache();
				if (cached) pricing = cached;
			}
			return pricing;
		},
		refresh,
		setTtl: (ms: number) => {
			if (Number.isFinite(ms) && ms > 0) ttlMs = ms;
		},
	};
}

/** PI_OFFLINE disables automatic network activity; treat 0/false/no as "online". */
export function isOffline(env: NodeJS.ProcessEnv = process.env): boolean {
	const raw = (env.PI_OFFLINE ?? "").trim().toLowerCase();
	if (raw === "") return false;
	return !["0", "false", "no", "off"].includes(raw);
}
