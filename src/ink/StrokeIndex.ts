import { BBox, InkStroke } from "./Stroke";

/**
 * Spatial index over a note's strokes (renderer debt, 2026-08-27).
 *
 * Repaint used to test every stroke's bbox against the viewport and then
 * rasterize every visible one from scratch - O(strokes) tests plus
 * O(visible) full ribbon draws per repaint, per erase FRAME while
 * scrubbing. The index buckets strokes into a fixed world-space grid so a
 * tile renderer asks "what overlaps this tile" and touches only those.
 *
 * Rebuilt whole per change: a rebuild is one pass over the strokes and
 * happens at gesture boundaries, which is orders cheaper than what the
 * per-repaint work used to be. Order within a bucket follows the input
 * array, so z-order survives bucket iteration.
 */

/** World units per bucket. Strokes are justwrite-sized; 256 keeps the
 * typical bucket at a handful of strokes without exploding bucket count. */
export const BUCKET_WORLD = 256;

export class StrokeIndex {
	private buckets = new Map<string, InkStroke[]>();
	private all: readonly InkStroke[] = [];

	private static bucketRange(b: BBox): { x0: number; y0: number; x1: number; y1: number } {
		return {
			x0: Math.floor(b.x / BUCKET_WORLD),
			y0: Math.floor(b.y / BUCKET_WORLD),
			x1: Math.floor((b.x + b.width) / BUCKET_WORLD),
			y1: Math.floor((b.y + b.height) / BUCKET_WORLD),
		};
	}

	private addToBuckets(s: InkStroke, b: BBox): void {
		const { x0, y0, x1, y1 } = StrokeIndex.bucketRange(b);
		for (let by = y0; by <= y1; by++) {
			for (let bx = x0; bx <= x1; bx++) {
				const key = `${bx},${by}`;
				const list = this.buckets.get(key);
				if (list) list.push(s);
				else this.buckets.set(key, [s]);
			}
		}
	}

	private removeFromBuckets(s: InkStroke, b: BBox): void {
		const { x0, y0, x1, y1 } = StrokeIndex.bucketRange(b);
		for (let by = y0; by <= y1; by++) {
			for (let bx = x0; bx <= x1; bx++) {
				const key = `${bx},${by}`;
				const list = this.buckets.get(key);
				if (!list) continue;
				const i = list.indexOf(s);
				if (i !== -1) list.splice(i, 1);
			}
		}
	}

	rebuild(strokes: readonly InkStroke[]): void {
		this.buckets.clear();
		this.all = strokes;
		for (const s of strokes) this.addToBuckets(s, s.bbox);
	}

	/**
	 * Reposition strokes that were mutated in place (same object identity,
	 * moved bbox) - a live lasso or insert-space drag, one frame at a time.
	 * O(moved) instead of rebuild()'s O(every stroke in the note), so a drag
	 * frame no longer pays for ink that never moved (hardware, 2026-08-31:
	 * a lasso drag on a busy iPad note visibly stuttered because every
	 * frame rebuilt the whole spatial index from scratch).
	 *
	 * `oldBBoxes` must hold each stroke's bbox from BEFORE this frame's
	 * translation (the caller snapshots it first); the stroke's current
	 * `.bbox` is read as the new position. Only meant for strokes already
	 * indexed by the last rebuild() (true for a live move: the moved set
	 * is frozen at gesture start and can't gain or lose members mid-drag) -
	 * a stroke missing from `oldBBoxes` has nothing to remove and is
	 * bucketed fresh, but a stroke absent from the last rebuild() entirely
	 * won't appear in query()'s z-order pass until the next rebuild().
	 */
	relocate(strokes: readonly InkStroke[], oldBBoxes: ReadonlyMap<string, BBox>): void {
		for (const s of strokes) {
			const old = oldBBoxes.get(s.id);
			if (old) this.removeFromBuckets(s, old);
			this.addToBuckets(s, s.bbox);
		}
	}

	get size(): number {
		return this.all.length;
	}

	/**
	 * Strokes whose bbox intersects the world rect, in stable z-order,
	 * deduplicated (a stroke spanning buckets appears once).
	 */
	query(rect: BBox): InkStroke[] {
		const x0 = Math.floor(rect.x / BUCKET_WORLD);
		const y0 = Math.floor(rect.y / BUCKET_WORLD);
		const x1 = Math.floor((rect.x + rect.width) / BUCKET_WORLD);
		const y1 = Math.floor((rect.y + rect.height) / BUCKET_WORLD);
		const seen = new Set<InkStroke>();
		for (let by = y0; by <= y1; by++) {
			for (let bx = x0; bx <= x1; bx++) {
				const list = this.buckets.get(`${bx},${by}`);
				if (!list) continue;
				for (const s of list) {
					const b = s.bbox;
					if (
						b.x > rect.x + rect.width ||
						b.y > rect.y + rect.height ||
						b.x + b.width < rect.x ||
						b.y + b.height < rect.y
					) {
						continue;
					}
					seen.add(s);
				}
			}
		}
		// Set preserves insertion order, but bucket iteration order is not
		// z-order across buckets: restore it against the source array.
		if (seen.size === 0) return [];
		const out: InkStroke[] = [];
		for (const s of this.all) if (seen.has(s)) out.push(s);
		return out;
	}
}
