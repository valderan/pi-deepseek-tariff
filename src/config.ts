/**
 * Configuration and well-known paths.
 *
 * Paths honour PI_CODING_AGENT_DIR so non-default Pi installations keep their
 * own config and cache instead of writing into ~/.pi/agent.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { normalizeLang, type Lang } from "./i18n.ts";
import { DEFAULT_TTL_HOURS } from "./pricing.ts";

export const AGENT_DIR = process.env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), ".pi", "agent");
export const CONFIG_PATH = join(AGENT_DIR, "deepseek-peak.json");
export const SETTINGS_PATH = join(AGENT_DIR, "settings.json");
export const PRICING_CACHE = join(AGENT_DIR, "cache", "deepseek-peak-pricing.json");

export type Config = {
	language?: Lang;
	intervalMs: number;
	pricingTtlHours: number;
	alwaysShow: boolean;
	footer: boolean;
	models: string[];
	providerPrefix: string;
	holidays: Set<string>;
};

/** Language from the pi settings, so the panel follows the interface language. */
export function settingsLanguage(): Lang {
	try {
		const raw = JSON.parse(readFileSync(SETTINGS_PATH, "utf8")) as { language?: unknown };
		return normalizeLang(raw.language) ?? "en";
	} catch {
		return "en";
	}
}

export function loadConfig(): Config {
	const config: Config = {
		intervalMs: 30_000,
		pricingTtlHours: DEFAULT_TTL_HOURS,
		alwaysShow: false,
		footer: true,
		models: ["deepseek"],
		providerPrefix: "deepseek:",
		holidays: new Set<string>(),
	};

	try {
		const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Record<string, unknown>;
		config.language = normalizeLang(raw.language);
		if (typeof raw.intervalMs === "number" && raw.intervalMs >= 5_000) config.intervalMs = raw.intervalMs;
		if (typeof raw.pricingTtlHours === "number" && raw.pricingTtlHours > 0) {
			config.pricingTtlHours = raw.pricingTtlHours;
		}
		if (typeof raw.alwaysShow === "boolean") config.alwaysShow = raw.alwaysShow;
		if (typeof raw.footer === "boolean") config.footer = raw.footer;
		if (typeof raw.providerPrefix === "string" && raw.providerPrefix.length > 0) {
			config.providerPrefix = raw.providerPrefix;
		}
		if (Array.isArray(raw.models)) {
			const models = raw.models.filter((m): m is string => typeof m === "string" && m.length > 0);
			if (models.length > 0) config.models = models.map((m) => m.toLowerCase());
		}
		if (Array.isArray(raw.holidays)) {
			for (const day of raw.holidays) {
				if (typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day)) config.holidays.add(day);
			}
		}
	} catch {
		// A missing or malformed config keeps the defaults.
	}

	config.language ??= settingsLanguage();
	return config;
}

/** Persist a single config key without dropping user-authored ones. */
export function saveConfig(patch: Record<string, unknown>) {
	try {
		let current: Record<string, unknown> = {};
		try {
			current = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Record<string, unknown>;
		} catch {
			current = {};
		}
		const next = { ...current, ...patch };
		mkdirSync(dirname(CONFIG_PATH), { recursive: true });
		writeFileSync(CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`);
	} catch {
		// Persisting is best effort; the session keeps the in-memory value.
	}
}
