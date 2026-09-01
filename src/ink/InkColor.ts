/**
 * Ink colors (v0.13.6): a small, intentional first-release palette.
 *
 * Strokes have always stored their own color (`InkStroke.color`, rendered
 * verbatim by the stroke renderer), so no schema change is involved: the
 * selected color is simply what the StrokeBuilder is handed when a stroke
 * BINDS its style at pen-down. Changing the selection never touches
 * existing strokes, and every stroke ever saved renders exactly as before.
 *
 * Per-tool palettes: pens are opaque writing inks; highlighter colors are
 * bright bases designed for the highlight layer's single 0.35 alpha (the
 * v0.6.0 rule: strokes paint opaque, the LAYER carries the translucency,
 * so overlaps never double-blend). Selection state lives here (pure,
 * testable); the plugin persists it per tool like the nib size.
 */

import { InkTool } from "./Stroke";

export interface InkColorChoice {
	readonly name: string;
	readonly hex: string;
}

/** Pen inks. First entry is the default, the original Handwriting blue. */
export const PEN_COLORS: ReadonlyArray<InkColorChoice> = [
	{ name: "blue", hex: "#2f6de0" },
	{ name: "black", hex: "#1c1f26" },
	{ name: "graphite", hex: "#5f6673" },
	{ name: "white", hex: "#f4f4f2" },
	{ name: "red", hex: "#cf3040" },
	{ name: "orange", hex: "#de6b12" },
	{ name: "green", hex: "#2f8f5b" },
	{ name: "purple", hex: "#7a4bbd" },
];

/** Highlighter bases. First entry is the default, the original yellow. */
export const HIGHLIGHTER_COLORS: ReadonlyArray<InkColorChoice> = [
	{ name: "yellow", hex: "#ffd60a" },
	{ name: "green", hex: "#a9e34b" },
	{ name: "pink", hex: "#ff6b9d" },
	{ name: "blue", hex: "#3bc9db" },
	{ name: "orange", hex: "#ffa94d" },
];

export function colorsFor(tool: InkTool): ReadonlyArray<InkColorChoice> {
	return tool === "highlighter" ? HIGHLIGHTER_COLORS : PEN_COLORS;
}

const HEX_RE = /^#[0-9a-f]{6}$/i;

/**
 * Pure, unit-tested: a persisted/foreign value is kept if it is a plain
 * six-digit hex color (future-proof for custom colors); anything else
 * falls back to the tool's default. Never throws, never returns nonsense.
 */
export function normalizeInkColor(tool: InkTool, value: unknown): string {
	if (typeof value === "string" && HEX_RE.test(value)) return value.toLowerCase();
	return colorsFor(tool)[0]!.hex;
}

/** Pure, unit-tested: next palette entry; off-palette values restart at 0. */
/** Adapt only near-black custom pen colors for dark-theme readability.
 * The stored stroke color is never mutated. */
export function displayInkColor(hex: string, darkTheme: boolean): string {
	if (!darkTheme || !HEX_RE.test(hex)) return hex;
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
	return luminance <= 0.14 ? "#ffffff" : hex;
}

export function nextInkColor(tool: InkTool, currentHex: string): InkColorChoice {
	const palette = colorsFor(tool);
	const i = palette.findIndex((c) => c.hex.toLowerCase() === currentHex.toLowerCase());
	return palette[(i + 1) % palette.length]!;
}

// ---- selection state (session; the plugin persists it per tool) ------------

const selected: Record<InkTool, string> = {
	pen: PEN_COLORS[0]!.hex,
	highlighter: HIGHLIGHTER_COLORS[0]!.hex,
};

export function getInkColorHex(tool: InkTool): string {
	return selected[tool];
}

export function setInkColorHex(tool: InkTool, hex: unknown): string {
	selected[tool] = normalizeInkColor(tool, hex);
	return selected[tool];
}
