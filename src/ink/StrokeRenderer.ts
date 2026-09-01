import { CameraState } from "../camera/coordinates";
import { HIGHLIGHTER_ALPHA, PenStyle, PEN_MIN_WIDTH_FACTOR, widthForPressure, clampHighlighterOpacity } from "./PenStyle";
import { SmoothSegment } from "./Smoothing";
import { flattenStroke } from "./Ribbon";
import { flattenStrokeShaped, inkShapingEnabled } from "./InkShape";
import { fillRibbon } from "./RibbonRenderer";
import { InkPoint, InkStroke } from "./Stroke";

/**
 * Segment-based variable-width polyline rendering, shared by the wet layer
 * (incremental, screen-space) and the committed layer (full redraw on camera
 * change). The committed path is the ribbon outline from Ribbon.ts; the
 * incremental wet path is per-segment with round caps and joins.
 */

/** Presentation-only color adaptation for Obsidian's dark theme.
 * Persisted stroke colors are never changed. Pure enough to unit-test by
 * passing an explicit darkTheme flag.
 */
export function renderColorForTheme(color: string, darkTheme: boolean): string {
	const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
	if (!m) return color;
	const r = parseInt(m[1]!.slice(0, 2), 16);
	const g = parseInt(m[1]!.slice(2, 4), 16);
	const b = parseInt(m[1]!.slice(4, 6), 16);
	const brightness = Math.max(r, g, b);
	// Never render an ink colour that disappears into the current theme.
	// The stored value remains untouched, so changing theme can reveal the
	// original semantic colour again.
	if (darkTheme) return brightness <= 40 ? "#ffffff" : color;
	return Math.min(r, g, b) >= 230 ? "#000000" : color;
}

function isDarkTheme(): boolean {
	return typeof document !== "undefined" && (document.body.classList.contains("theme-dark") || document.documentElement.classList.contains("theme-dark"));
}

function strokeStyleFor(stroke: { color: string }): string {
	return renderColorForTheme(stroke.color, isDarkTheme());
}

/**
 * Draw one segment between two world-space points onto a 2d context whose
 * transform is already set to identity in CSS pixels (dpr handled by caller
 * via ctx.scale).
 */
export function drawSegment(
	ctx: CanvasRenderingContext2D,
	cam: CameraState,
	style: PenStyle,
	from: InkPoint,
	to: InkPoint
): void {
	const x1 = (from.x - cam.x) * cam.zoom;
	const y1 = (from.y - cam.y) * cam.zoom;
	const x2 = (to.x - cam.x) * cam.zoom;
	const y2 = (to.y - cam.y) * cam.zoom;
	// Average the two samples' pressures for the segment width.
	const wWorld = widthForPressure(style, (from.pressure + to.pressure) / 2);
	ctx.strokeStyle = renderColorForTheme(style.color, isDarkTheme());
	ctx.lineWidth = Math.max(0.5, wWorld * cam.zoom);
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	ctx.beginPath();
	ctx.moveTo(x1, y1);
	ctx.lineTo(x2, y2);
	ctx.stroke();
}

/**
 * Draw one smoothed segment: a quadratic that bends around a real sample.
 * Same width law as drawSegment, so Raw and Smoothed differ only in geometry.
 */
export function drawSmoothSegment(
	ctx: CanvasRenderingContext2D,
	cam: CameraState,
	style: PenStyle,
	seg: SmoothSegment
): void {
	const sx = (seg.from.x - cam.x) * cam.zoom;
	const sy = (seg.from.y - cam.y) * cam.zoom;
	const cx = (seg.ctrl.x - cam.x) * cam.zoom;
	const cy = (seg.ctrl.y - cam.y) * cam.zoom;
	const ex = (seg.to.x - cam.x) * cam.zoom;
	const ey = (seg.to.y - cam.y) * cam.zoom;
	ctx.strokeStyle = renderColorForTheme(style.color, isDarkTheme());
	ctx.lineWidth = Math.max(0.5, widthForPressure(style, seg.pressure) * cam.zoom);
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	ctx.beginPath();
	ctx.moveTo(sx, sy);
	ctx.quadraticCurveTo(cx, cy, ex, ey);
	ctx.stroke();
}

/** Redraw a full committed stroke (world space -> current camera). */
export function drawStroke(
	ctx: CanvasRenderingContext2D,
	cam: CameraState,
	stroke: InkStroke,
	styleOverride?: Partial<PenStyle>,
	smooth = false
): void {
	const pts = stroke.points;
	if (pts.length < 2) return;
	// A stroke describes its own pressure response through its tool, so it looks
	// right on any layer without the caller having to remember which it was.
	const flat = stroke.tool === "highlighter";
	const style: PenStyle = {
		color: renderColorForTheme(stroke.color, isDarkTheme()),
		baseWidth: stroke.width,
		minWidthFactor: styleOverride?.minWidthFactor ?? (flat ? 0.9 : PEN_MIN_WIDTH_FACTOR),
		gamma: styleOverride?.gamma ?? (flat ? 1 : 0.75),
	};
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	ctx.strokeStyle = strokeStyleFor(stroke);
	// Layered highlighting: each COMMITTED highlighter stroke paints at the
	// layer alpha itself (one fill call per stroke, so a single stroke's
	// self-crossing still reads as one flat wash - no internal seams).
	// Two separate strokes drawn over each other now compose normally, so a
	// second pass over the same ink genuinely darkens, the way a real
	// highlighter layers. The DOM canvas this lands on is left fully opaque
	// (InkOverlay owns that); only the still-drawing WET preview keeps its
	// translucency at the canvas level, because that path strokes many
	// overlapping segments per gesture and per-segment alpha would seam.
	const priorAlpha = ctx.globalAlpha;
	if (flat) ctx.globalAlpha = priorAlpha * clampHighlighterOpacity(stroke.opacity ?? HIGHLIGHTER_ALPHA);
	if (smooth) {
		// One path, one fill, one antialiased edge. See Ribbon.ts for why
		// per-segment stroking looks beaded when magnified. Pen strokes take
		// the shaped geometry (InkShape) unless shaping is switched off; the
		// highlighter's flat chisel wash never shapes.
		// Mouse strokes take the flat law: no pressure, and velocity says
		// nothing about intent (see InkStroke.device).
		const ribbon =
			!flat && stroke.device !== "mouse" && inkShapingEnabled()
				? flattenStrokeShaped(pts, style, cam.zoom)
				: flattenStroke(pts, style, cam.zoom);
		fillRibbon(ctx, cam, ribbon, strokeStyleFor(stroke));
		ctx.globalAlpha = priorAlpha;
		return;
	}
	for (let i = 1; i < pts.length; i++) {
		drawSegment(ctx, cam, style, pts[i - 1]!, pts[i]!);
	}
	ctx.globalAlpha = priorAlpha;
}

/**
 * Redraw all committed strokes visible in the current viewport.
 * Strokes fully outside the viewport are skipped via their bbox.
 */
/**
 * Redraw one world-space rect of a committed layer in place: clip, clear,
 * draw the given strokes (pre-queried by the caller's spatial index). The
 * damage-repaint path (renderer debt, 2026-08-27) - the full-viewport
 * clear-and-redraw lives on in drawCommitted for the "all" cases.
 */
export function drawRegion(
	ctx: CanvasRenderingContext2D,
	cam: CameraState,
	strokes: readonly InkStroke[],
	rect: { x: number; y: number; width: number; height: number },
	smooth = false,
	tool?: InkStroke["tool"]
): void {
	const cssX = (rect.x - cam.x) * cam.zoom;
	const cssY = (rect.y - cam.y) * cam.zoom;
	const cssW = rect.width * cam.zoom;
	const cssH = rect.height * cam.zoom;
	ctx.save();
	ctx.beginPath();
	ctx.rect(cssX, cssY, cssW, cssH);
	ctx.clip();
	ctx.clearRect(cssX, cssY, cssW, cssH);
	for (const s of strokes) {
		if (tool !== undefined && s.tool !== tool) continue;
		drawStroke(ctx, cam, s, undefined, smooth);
	}
	ctx.restore();
}

export function drawCommitted(
	ctx: CanvasRenderingContext2D,
	cam: CameraState,
	strokes: readonly InkStroke[],
	viewportCssWidth: number,
	viewportCssHeight: number,
	smooth = false,
	tool?: InkStroke["tool"]
): void {
	ctx.clearRect(0, 0, viewportCssWidth, viewportCssHeight);
	const worldLeft = cam.x;
	const worldTop = cam.y;
	const worldRight = cam.x + viewportCssWidth / cam.zoom;
	const worldBottom = cam.y + viewportCssHeight / cam.zoom;
	for (const s of strokes) {
		// Pen and highlighter live on separate canvases (§6): highlighter under
		// the text, pen over it.
		if (tool !== undefined && s.tool !== tool) continue;
		const b = s.bbox;
		if (
			b.x > worldRight ||
			b.y > worldBottom ||
			b.x + b.width < worldLeft ||
			b.y + b.height < worldTop
		) {
			continue;
		}
		drawStroke(ctx, cam, s, undefined, smooth);
	}
}
