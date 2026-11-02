import assert from "node:assert/strict";
import { test } from "node:test";
import { beijingDateKey, countdownMinutes, countdownPhase, isPeak, MAX_SWALLOWED, nextTransition } from "../src/rules.ts";

const NO_HOLIDAYS = new Set<string>();

const peakCases: Array<[string, boolean, string]> = [
	["2026-10-26T00:30:00Z", false, "Monday before the first window"],
	["2026-10-26T01:00:00Z", true, "window 1 starts"],
	["2026-10-26T03:59:00Z", true, "window 1, last minute"],
	["2026-10-26T04:00:00Z", false, "window 1 ends"],
	["2026-10-26T05:59:00Z", false, "gap between windows"],
	["2026-10-26T06:00:00Z", true, "window 2 starts"],
	["2026-10-26T09:59:00Z", true, "window 2, last minute"],
	["2026-10-26T10:00:00Z", false, "window 2 ends"],
	["2026-10-30T08:00:00Z", true, "Friday inside a window"],
	["2026-10-31T02:00:00Z", false, "Saturday inside a would-be window"],
	["2026-11-01T02:00:00Z", false, "Sunday inside a would-be window"],
];

for (const [iso, expected, label] of peakCases) {
	test(`isPeak: ${label} (${iso})`, () => {
		assert.equal(isPeak(new Date(iso), NO_HOLIDAYS), expected);
	});
}

test("isPeak: a Chinese holiday disables peak on a weekday", () => {
	const holidays = new Set(["2026-10-26"]);
	assert.equal(isPeak(new Date("2026-10-26T02:00:00Z"), holidays), false);
});

test("beijingDateKey uses UTC+8", () => {
	assert.equal(beijingDateKey(new Date("2026-10-01T20:00:00Z")), "2026-10-02");
	assert.equal(beijingDateKey(new Date("2026-10-01T15:59:00Z")), "2026-10-01");
});

const transitionCases: Array<[string, string]> = [
	["2026-10-26T00:30:00Z", "2026-10-26T01:00:00Z"],
	["2026-10-26T01:00:00Z", "2026-10-26T04:00:00Z"],
	["2026-10-26T03:59:00Z", "2026-10-26T04:00:00Z"],
	["2026-10-26T10:00:00Z", "2026-10-27T01:00:00Z"],
	["2026-10-30T20:00:00Z", "2026-11-02T01:00:00Z"],
	["2026-10-31T02:00:00Z", "2026-11-02T01:00:00Z"],
];

for (const [from, expected] of transitionCases) {
	test(`nextTransition: ${from} -> ${expected}`, () => {
		assert.equal(nextTransition(new Date(from), NO_HOLIDAYS).getTime(), Date.parse(expected));
	});
}

test("nextTransition: holidays push the switch to the next weekday", () => {
	const holidays = new Set(["2026-10-26", "2026-10-27"]);
	const next = nextTransition(new Date("2026-10-26T02:00:00Z"), holidays);
	assert.equal(next.getTime(), Date.parse("2026-10-28T01:00:00Z"));
});

test("countdownPhase: yellow starts strictly below 15 minutes", () => {
	assert.equal(countdownPhase(15 * 60_000).urgent, false);
	assert.equal(countdownPhase(15 * 60_000 - 1).urgent, true);
	assert.equal(countdownPhase(60_000).urgent, true);
});

test("countdownPhase eats letters by the displayed minute", () => {
	const ladder: Array<[number, number]> = [
		[6, 0],
		[5, 0],
		[4, 1],
		[3, 2],
		[2, 3],
		[1, 3],
		[0, 4],
	];
	for (const [minutes, swallowed] of ladder) {
		assert.equal(countdownPhase(minutes * 60_000).swallowed, swallowed, `${minutes}m must swallow ${swallowed}`);
	}
	// The last letter goes only in the final seconds, when the counter shows 0m.
	assert.equal(countdownPhase(29_000).swallowed, 4);
	assert.equal(countdownPhase(30_000).swallowed, 3);
});

test("countdownPhase never swallows more than a four-letter tail", () => {
	assert.equal(countdownPhase(-5 * 60_000).swallowed, MAX_SWALLOWED);
	assert.equal(countdownMinutes(-1), 0);
});
