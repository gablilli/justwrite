import { describe, expect, it } from "vitest";
import { HIGHLIGHTER_ALPHA, clampInkOpacity } from "./PenStyle";

describe("highlighter opacity", () => {
	it("clamps opacity to a usable range", () => {
		expect(clampInkOpacity(-1)).toBe(0.05);
		expect(clampInkOpacity(0.4)).toBe(0.4);
		expect(clampInkOpacity(2)).toBe(1);
		expect(clampInkOpacity(Number.NaN)).toBe(HIGHLIGHTER_ALPHA);
	});
});
