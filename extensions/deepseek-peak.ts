/**
 * DeepSeek Peak / Off-Peak tariff panel for pi.
 *
 * Footer status line: current tariff window and countdown to the next switch.
 * `/deepseek-peak` opens a panel with the local/UTC clock, the next window,
 * per-model prices and Search & Fetch request pricing parsed from the official
 * DeepSeek pricing page, plus reference notes.
 *
 * https://api-docs.deepseek.com/quick_start/pricing/
 */

import { truncateToWidth } from "@earendil-works/pi-tui";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { loadConfig, PRICING_CACHE, saveConfig, type Config } from "../src/config.ts";
import { STRINGS, type Lang } from "../src/i18n.ts";
import { createPricingStore, isOffline, type Pricing } from "../src/pricing.ts";
import { SEPARATOR, panelLines, statusText } from "../src/view.ts";

const STATUS_KEY = "deepseek-peak";
const WIDGET_KEY = "deepseek-peak";

export default function deepseekPeak(pi: ExtensionAPI) {
	let config = loadConfig();
	let lang: Lang = config.language ?? "en";
	let timer: ReturnType<typeof setInterval> | undefined;
	let panelVisible = false;

	const pricing = createPricingStore({
		cachePath: PRICING_CACHE,
		ttlMs: config.pricingTtlHours * 60 * 60 * 1000,
		offline: isOffline(),
	});

	const ttlMs = () => config.pricingTtlHours * 60 * 60 * 1000;

	const isDeepSeekModel = (ctx: ExtensionContext | ExtensionCommandContext) => {
		const id = ctx.model?.id.toLowerCase();
		if (!id) return false;
		return config.models.some((needle) => id.includes(needle));
	};

	const renderFooter = (ctx: ExtensionContext | ExtensionCommandContext, current: Pricing = pricing.get()) => {
		if (!config.alwaysShow && !isDeepSeekModel(ctx)) {
			ctx.ui.setStatus(STATUS_KEY, undefined);
			return;
		}
		const theme: Theme | undefined = (ctx.ui as { theme?: Theme }).theme;
		if (!theme) return;
		ctx.ui.setStatus(STATUS_KEY, statusText(theme, config, lang, current));
	};

	const renderPanel = (ctx: ExtensionContext | ExtensionCommandContext, current: Pricing = pricing.get()) => {
		if (!panelVisible) return;
		const currentModel = ctx.model?.id;
		ctx.ui.setWidget(
			WIDGET_KEY,
			(_tui, theme) => {
				const lines = panelLines(theme, {
					config,
					lang,
					currentModel,
					pricing: current,
					ttlMs: ttlMs(),
				});
				return {
					invalidate() {},
					render(width: number) {
						const rule = theme.fg("dim", "─".repeat(Math.max(0, width)));
						return lines.map((line) => (line === SEPARATOR ? rule : truncateToWidth(line, width)));
					},
				};
			},
			{ placement: "belowEditor" },
		);
	};

	const render = (ctx: ExtensionContext | ExtensionCommandContext, current: Pricing = pricing.get()) => {
		renderFooter(ctx, current);
		renderPanel(ctx, current);
	};

	const stop = () => {
		if (timer !== undefined) clearInterval(timer);
		timer = undefined;
	};

	const start = (ctx: ExtensionContext) => {
		stop();
		render(ctx);
		timer = setInterval(() => {
			// Only hits the network when the TTL expired.
			if (!pricing.expired()) {
				render(ctx);
				return;
			}
			void pricing.refresh().then((value) => render(ctx, value));
		}, config.intervalMs);
	};

	pi.on("session_start", async (_event, ctx) => {
		config = loadConfig();
		lang = config.language ?? "en";
		pricing.setTtl(ttlMs());
		pricing.loadCache();
		start(ctx);
		void pricing.refresh().then((value) => render(ctx, value));
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		stop();
		panelVisible = false;
		ctx.ui.setWidget(WIDGET_KEY, undefined);
		ctx.ui.setStatus(STATUS_KEY, undefined);
	});

	// The model can change mid-session, so refresh on the cheap lifecycle hooks too.
	pi.on("agent_start", async (_event, ctx) => render(ctx));
	pi.on("turn_start", async (_event, ctx) => render(ctx));

	pi.registerCommand("deepseek-peak", {
		description: "DeepSeek peak/off-peak panel · Панель DeepSeek peak/off-peak",
		handler: async (args, ctx) => {
			config = loadConfig();
			lang = config.language ?? "en";
			pricing.setTtl(ttlMs());
			const arg = args.trim().toLowerCase();

			if (arg === "ru" || arg === "en") {
				lang = arg;
				config.language = arg;
				saveConfig({ language: arg });
				panelVisible = true;
				render(ctx);
				return;
			}

			if (arg === "off" || (arg === "" && panelVisible)) {
				panelVisible = false;
				ctx.ui.setWidget(WIDGET_KEY, undefined);
				renderFooter(ctx);
				return;
			}

			if (arg === "refresh") {
				const value = await pricing.refresh(true);
				panelVisible = true;
				render(ctx, value);
				return;
			}

			panelVisible = true;
			render(ctx);
		},
	});
}

export { STRINGS };
