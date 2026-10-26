import assert from "node:assert/strict";
import { test } from "node:test";
import { beijingDateKey, isPeak, nextTransition } from "../src/rules.ts";

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
