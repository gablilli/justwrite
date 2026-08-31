import { describe, expect, it } from "vitest";
import { nextPaperStyle, normalizePaperStyle, normalizePaperStyleByPath, paperClass } from "./Paper";

describe("paper style", () => {
	it("cycles none -> lines -> grid -> none", () => {
		expect(nextPaperStyle("none")).toBe("lines");
		expect(nextPaperStyle("lines")).toBe("grid");
		expect(nextPaperStyle("grid")).toBe("none");
	});
	it("classes: one per ruled style, none for none", () => {
		expect(paperClass("none")).toBeNull();
		expect(paperClass("lines")).toBe("handwriting-paper-lines");
		expect(paperClass("grid")).toBe("handwriting-paper-grid");
	});
	it("normalizes junk to none", () => {
		expect(normalizePaperStyle("grid")).toBe("grid");
		expect(normalizePaperStyle("sepia")).toBe("none");
		expect(normalizePaperStyle(undefined)).toBe("none");
	});
});

describe("per-note paper map", () => {
	it("keeps valid per-path entries, including an explicit none", () => {
		const out = normalizePaperStyleByPath({
			"a.md": "grid",
			"b.md": "lines",
			"c.md": "none",
		});
		expect(out).toEqual({ "a.md": "grid", "b.md": "lines", "c.md": "none" });
	});
	it("drops entries with an unrecognized value", () => {
		const out = normalizePaperStyleByPath({ "a.md": "sepia", "b.md": 3, "c.md": "grid" });
		expect(out).toEqual({ "c.md": "grid" });
	});
	it("degrades non-objects to an empty map instead of throwing", () => {
		expect(normalizePaperStyleByPath(undefined)).toEqual({});
		expect(normalizePaperStyleByPath(null)).toEqual({});
		expect(normalizePaperStyleByPath("grid")).toEqual({});
		expect(normalizePaperStyleByPath(42)).toEqual({});
	});
});
