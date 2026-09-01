/**
 * Pen appearance (handoff §12). Deliberately simple.
 */

export interface PenStyle {
	color: string;
	/** Base stroke width in world units. */
	baseWidth: number;
	/** Fraction of baseWidth drawn at zero pressure (floor). */
	minWidthFactor: number;
	/** Pressure gamma: effective = pow(pressure, gamma). */
	gamma: number;
}

/**
 * Floor for the pen (not the highlighter) at zero pressure, as a fraction of
 * baseWidth. This is what the tip tapers DOWN TO at pen-up: real pressure
 * curves on Apple Pencil and similar devices fall off sharply right at
 * lift-off, and at the old 0.35 the last few live samples before release
 * read as a needle point rather than a natural nib lift (reported: alan,
 * iPad, 2026-08-30). Raised to 0.5 - still a real taper, just not a spike.
 *
 * Shared by every path that draws pen ink at zero pressure, wet or
 * committed (see StrokeOutline.ts and StrokeRenderer.ts), so the tip never
 * jumps to a different sharpness the moment a stroke commits.
 */
export const PEN_MIN_WIDTH_FACTOR = 0.5;

export const DEFAULT_PEN: PenStyle = {
	color: "#2f6de0",
	baseWidth: 2.2,
	minWidthFactor: PEN_MIN_WIDTH_FACTOR,
	gamma: 0.75,
};

/**
 * Highlighter (§51, §57). Wide and nearly flat: a chisel tip does not taper
 * the way a nib does, so pressure barely moves the width.
 *
 * The translucency is deliberately NOT in this colour. It lives on the layer,
 * as CSS opacity, and the ink itself is drawn opaque. Translucent ink would
 * double-blend everywhere a stroke crosses itself or another highlight, giving
 * muddy dark seams, the one thing a highlighter must not do. One opaque layer
 * at one alpha gives a flat, even wash no matter how much overlaps.
 */
export const HIGHLIGHTER_PEN: PenStyle = {
	color: "#ffd60a",
	baseWidth: 16,
	minWidthFactor: 0.9,
	gamma: 1,
};

/** Layer opacity for highlighter ink. */
export const HIGHLIGHTER_ALPHA = 0.35;
export const MIN_HIGHLIGHTER_ALPHA = 0.05;
export const MAX_HIGHLIGHTER_ALPHA = 1;
export function clampHighlighterOpacity(value: number): number {
	return Math.min(MAX_HIGHLIGHTER_ALPHA, Math.max(MIN_HIGHLIGHTER_ALPHA, Number.isFinite(value) ? value : HIGHLIGHTER_ALPHA));
}

/** Backwards-compatible generic ink opacity clamp used by tests and callers. */
export function clampInkOpacity(value: number): number {
	return clampHighlighterOpacity(value);
}

/** What a device that reports no pressure sends, normalized upstream. */
export const NO_PRESSURE = 0.5;

/**
 * Width multiplier from Apple Pencil (or any pen that reports tiltX/tiltY).
 *
 * tiltX and tiltY are the PointerEvent angles in degrees from the surface
 * plane along each axis (-90..+90, sign indicates direction). Combining them
 * gives the altitude angle of the nib: 90° = perfectly vertical (like a
 * ballpoint held straight up), 0° = lying flat.
 *
 * A real brush or fountain pen is widest when held obliquely, because more
 * of the tip makes contact with the paper. We mirror that:
 *
 *   altitude 90° (vertical)    → factor 1.0   (no widening)
 *   altitude  0° (flat/oblique)→ factor 1 + TILT_MAX_BOOST  (widest)
 *
 * TILT_MAX_BOOST is tuned so that fully-tilted Pencil strokes read as
 * deliberately wider without swamping the pressure signal.
 *
 * If tiltX/tiltY are both 0 (device doesn't report tilt, or pen is
 * perfectly vertical) the function returns 1.0 so nothing changes.
 */
const TILT_MAX_BOOST = 0.6; // fully oblique → 60% wider than vertical

export function tiltFactor(tiltX: number | undefined, tiltY: number | undefined): number {
	if (!tiltX && !tiltY) return 1;
	const tx = (tiltX ?? 0) * (Math.PI / 180);
	const ty = (tiltY ?? 0) * (Math.PI / 180);
	// altitude = arcsin of the vertical component of the unit nib vector.
	// When tiltX=tiltY=0 altitude=π/2 (vertical); when either ±90 altitude→0.
	const sinAlt = Math.cos(tx) * Math.cos(ty);
	// sinAlt = 1 when vertical, 0 when horizontal.
	// We want factor = 1 + TILT_MAX_BOOST * (1 - sinAlt).
	return 1 + TILT_MAX_BOOST * (1 - Math.max(0, sinAlt));
}

/**
 * Pressure sensitivity, off for anyone who wants an even line.
 *
 * It pins pressure rather than switching the width law off. Speed thinning
 * and the endpoint taper are what make a stroke read as handwriting and they
 * stay in both states; only "how hard you press" stops moving the width.
 * Every stroke is styled at render time, so flipping this restyles ink that
 * was written years ago.
 */
let pressureSensitive = true;

export function setPressureSensitivity(on: boolean): void {
	pressureSensitive = on;
}

export function pressureSensitivityEnabled(): boolean {
	return pressureSensitive;
}

/**
 * Width in world units for a given pressure sample.
 * Devices that report no pressure send 0.5 (normalized upstream).
 */
export function widthForPressure(style: PenStyle, pressure: number): number {
	const raw = pressureSensitive ? pressure : NO_PRESSURE;
	const p = Math.min(1, Math.max(0, raw));
	const effective = Math.pow(p, style.gamma);
	const factor = style.minWidthFactor + (1 - style.minWidthFactor) * effective;
	return style.baseWidth * factor;
}
