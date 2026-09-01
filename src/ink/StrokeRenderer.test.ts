import { describe, expect, it } from "vitest";
import { renderColorForTheme } from "./StrokeRenderer";

describe("stroke theme color rendering", () => {
	it("renders custom black ink as white in dark theme without changing the stored color", () => {
		expect(renderColorForTheme("#000000", true)).toBe("#ffffff");
		expect(renderColorForTheme("#1c1f26", true)).toBe("#ffffff");
		expect(renderColorForTheme("#000000", false)).toBe("#000000");
		expect(renderColorForTheme("#ffffff", false)).toBe("#000000");
		expect(renderColorForTheme("#ffffff", true)).toBe("#ffffff");
	});

	it("leaves visible custom colors unchanged", () => {
		expect(renderColorForTheme("#cf3040", true)).toBe("#cf3040");
		expect(renderColorForTheme("#2f6de0", true)).toBe("#2f6de0");
	});
});
