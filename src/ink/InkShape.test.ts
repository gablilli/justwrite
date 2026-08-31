/**
 * The shaping laws, pinned as properties rather than pixel dumps: filtered
 * pressure, velocity thinning, endpoint taper. Everything here is derived
 * from stored samples at render time, so the same inputs must always shape
 * identically, and neutral parameters must reproduce the unshaped law
 * exactly.
 */

import { describe, expect, it } from "vitest";
import {
	IncrementalShaper,
	PEN_SHAPE,
	ShapeParams,
	applyEndTaper,
	flattenStrokeShaped,
	shapedHalfWidths,
} from "./InkShape";
import { flattenStroke } from "./Ribbon";
import { DEFAULT_PEN, tiltFactor, widthForPressure } from "./PenStyle";
import { InkPoint } from "./Stroke";

/** Shaping disabled through its own parameters: must equal the plain law. */
const NEUTRAL: ShapeParams = {
	pressureAlpha: 1,
	velocityAlpha: 1,
	thinningK: 0,
	minVelocityFactor: 1,
	taperWidths: 0,
	taperMaxShare: 0,
	tipFloor: 1,
};

function line(n: number, spacing: number, dtMs: number, pressure = 0.5): InkPoint[] {
	const out: InkPoint[] = [];
	for (let i = 0; i < n; i++) {
		out.push({ x: i * spacing, y: 0, pressure, t: i * dtMs });
	}
	return out;
}

describe("shapedHalfWidths — pressure filtering and velocity thinning", () => {
	it("is deterministic: same samples, same widths", () => {
		const pts = line(30, 2, 5, 0.6);
		expect(shapedHalfWidths(pts, DEFAULT_PEN)).toEqual(shapedHalfWidths(pts, DEFAULT_PEN));
	});

	it("neutral parameters reproduce the unshaped width law exactly", () => {
		const pts = line(10, 2, 5, 0.7);
		const hws = shapedHalfWidths(pts, DEFAULT_PEN, NEUTRAL);
		for (const hw of hws) {
			expect(hw).toBeCloseTo(widthForPressure(DEFAULT_PEN, 0.7) / 2, 10);
		}
	});

	it("a fast stroke comes out thinner than a slow one", () => {
		const slow = shapedHalfWidths(line(30, 0.5, 5), DEFAULT_PEN);
		const fast = shapedHalfWidths(line(30, 10, 5), DEFAULT_PEN);
		expect(fast[29]!).toBeLessThan(slow[29]!);
	});

	it("thinning bottoms out at the velocity floor", () => {
		const absurd = shapedHalfWidths(line(30, 1000, 1), DEFAULT_PEN);
		const floor = (widthForPressure(DEFAULT_PEN, 0.5) / 2) * PEN_SHAPE.minVelocityFactor;
		expect(absurd[29]!).toBeGreaterThanOrEqual(floor * 0.99);
	});

	it("damps a single-sample pressure spike instead of printing it", () => {
		const pts = line(10, 2, 5, 0.5);
		pts[5]!.pressure = 1;
		const hws = shapedHalfWidths(pts, DEFAULT_PEN);
		const raw = widthForPressure(DEFAULT_PEN, 1) / 2;
		const base = hws[4]!;
		// The spike moves width, but by less than the raw law would.
		expect(hws[5]!).toBeGreaterThan(base);
		expect(hws[5]! - base).toBeLessThan(raw - base);
	});
});

describe("applyEndTaper — tips, not blunt caps", () => {
	function ribbon(n: number, spacing: number, hw: number) {
		const out = [];
		for (let i = 0; i < n; i++) out.push({ x: i * spacing, y: 0, hw });
		return out;
	}

	it("pulls both ends down toward the tip floor and leaves the middle alone", () => {
		const pts = ribbon(101, 1, 2); // 100 units long, taper zone ~5.3
		applyEndTaper(pts, DEFAULT_PEN, PEN_SHAPE);
		expect(pts[0]!.hw).toBeCloseTo(2 * PEN_SHAPE.tipFloor, 6);
		expect(pts[100]!.hw).toBeCloseTo(2 * PEN_SHAPE.tipFloor, 6);
		expect(pts[50]!.hw).toBeCloseTo(2, 6);
	});

	it("widens monotonically away from each tip", () => {
		const pts = ribbon(101, 1, 2);
		applyEndTaper(pts, DEFAULT_PEN, PEN_SHAPE);
		for (let i = 1; i < 8; i++) expect(pts[i]!.hw).toBeGreaterThanOrEqual(pts[i - 1]!.hw);
		for (let i = 93; i < 100; i++) expect(pts[i + 1]!.hw).toBeLessThanOrEqual(pts[i]!.hw);
	});

	it("a short stroke tapers over its capped share, never to nothing", () => {
		const pts = ribbon(11, 0.5, 2); // 5 units long
		applyEndTaper(pts, DEFAULT_PEN, PEN_SHAPE);
		for (const p of pts) expect(p.hw).toBeGreaterThan(0);
		expect(pts[5]!.hw).toBeGreaterThan(pts[0]!.hw);
	});

	it("leaves a dot (single point) untouched", () => {
		const pts = [{ x: 0, y: 0, hw: 2 }];
		applyEndTaper(pts, DEFAULT_PEN, PEN_SHAPE);
		expect(pts[0]!.hw).toBe(2);
	});
});

describe("flattenStrokeShaped — the committed geometry", () => {
	it("neutral parameters reproduce flattenStroke's geometry", () => {
		const pts = line(20, 3, 5, 0.5);
		const plain = flattenStroke(pts, DEFAULT_PEN, 1);
		const shaped = flattenStrokeShaped(pts, DEFAULT_PEN, 1, NEUTRAL);
		expect(shaped.length).toBe(plain.length);
		for (let i = 0; i < plain.length; i++) {
			expect(shaped[i]!.x).toBeCloseTo(plain[i]!.x, 10);
			expect(shaped[i]!.y).toBeCloseTo(plain[i]!.y, 10);
			expect(shaped[i]!.hw).toBeCloseTo(plain[i]!.hw, 10);
		}
	});

	it("with pen shaping, the ends are thinner than the middle", () => {
		const pts = line(40, 3, 5, 0.5);
		const shaped = flattenStrokeShaped(pts, DEFAULT_PEN, 1);
		const mid = shaped[Math.floor(shaped.length / 2)]!.hw;
		expect(shaped[0]!.hw).toBeLessThan(mid);
		expect(shaped[shaped.length - 1]!.hw).toBeLessThan(mid);
	});
});

describe("IncrementalShaper — the wet layer speaks the same law", () => {
	it("matches shapedHalfWidths sample for sample, apart from the taper", () => {
		const pts = line(25, 2, 5, 0.6);
		const whole = shapedHalfWidths(pts, DEFAULT_PEN);
		const inc = new IncrementalShaper({ ...PEN_SHAPE, tipFloor: 1, taperWidths: 0 });
		inc.reset(pts[0], DEFAULT_PEN);
		// Sample 0 is consumed by reset; push the rest.
		const got = [whole[0]!];
		for (let i = 1; i < pts.length; i++) got.push(inc.push(DEFAULT_PEN, pts[i]!));
		for (let i = 1; i < pts.length; i++) {
			expect(got[i]!).toBeCloseTo(whole[i]!, 10);
		}
	});

	it("start taper ramps the first samples up from the tip", () => {
		const pts = line(25, 0.5, 5, 0.6);
		const inc = new IncrementalShaper();
		inc.reset(pts[0], DEFAULT_PEN);
		const hws: number[] = [];
		for (let i = 1; i < pts.length; i++) hws.push(inc.push(DEFAULT_PEN, pts[i]!));
		expect(hws[0]!).toBeLessThan(hws[hws.length - 1]!);
	});
});


describe("tiltFactor — Apple Pencil inclination → width", () => {
	it("returns 1.0 when tilt is absent (no tilt reported)", () => {
		expect(tiltFactor(undefined, undefined)).toBe(1);
	});

	it("returns 1.0 when pen is perfectly vertical (tiltX=tiltY=0)", () => {
		expect(tiltFactor(0, 0)).toBe(1);
	});

	it("returns more than 1 when pen is oblique (any nonzero tilt)", () => {
		expect(tiltFactor(45, 0)).toBeGreaterThan(1);
		expect(tiltFactor(0, 45)).toBeGreaterThan(1);
		expect(tiltFactor(45, 45)).toBeGreaterThan(1);
	});

	it("maximum boost at extreme oblique (tiltX or tiltY → 90)", () => {
		const f90 = tiltFactor(89, 0);
		const f45 = tiltFactor(45, 0);
		expect(f90).toBeGreaterThan(f45);
	});

	it("is symmetric: tiltX=45 and tiltX=-45 give the same factor", () => {
		expect(tiltFactor(45, 0)).toBeCloseTo(tiltFactor(-45, 0), 10);
	});

	it("shapedHalfWidths produces wider hw with oblique tilt on all points", () => {
		const makePoints = (tiltX: number): InkPoint[] =>
			Array.from({ length: 15 }, (_, i) => ({
				x: i * 3, y: 0, pressure: 0.5, t: i * 10, tiltX, tiltY: 0,
			}));
		const vertical  = shapedHalfWidths(makePoints(0),  DEFAULT_PEN, { ...PEN_SHAPE, taperWidths: 0, tipFloor: 1 });
		const oblique   = shapedHalfWidths(makePoints(60), DEFAULT_PEN, { ...PEN_SHAPE, taperWidths: 0, tipFloor: 1 });
		// Every sample should be wider when the pencil is tilted.
		for (let i = 0; i < vertical.length; i++) {
			expect(oblique[i]!).toBeGreaterThan(vertical[i]!);
		}
	});

	it("IncrementalShaper.push is also wider with oblique tilt", () => {
		const makePoint = (tiltX: number, i: number): InkPoint =>
			({ x: i * 3, y: 0, pressure: 0.5, t: i * 10, tiltX, tiltY: 0 });

		const incV = new IncrementalShaper({ ...PEN_SHAPE, tipFloor: 1, taperWidths: 0 });
		const incO = new IncrementalShaper({ ...PEN_SHAPE, tipFloor: 1, taperWidths: 0 });
		incV.reset(makePoint(0,  0), DEFAULT_PEN);
		incO.reset(makePoint(60, 0), DEFAULT_PEN);

		const hwV = incV.push(DEFAULT_PEN, makePoint(0,  5));
		const hwO = incO.push(DEFAULT_PEN, makePoint(60, 5));
		expect(hwO).toBeGreaterThan(hwV);
	});
});
