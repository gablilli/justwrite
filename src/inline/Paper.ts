/**
 * Lined and grid paper. A per-NOTE writing aid (1.4): each note remembers
 * its own ruling, stored in the plugin's own settings keyed by file path -
 * never written into the note or its frontmatter, so opening a note in
 * another app or syncing it elsewhere never surfaces plugin bookkeeping.
 * Applied as a class on that note's own view container, which styles.css
 * turns into a background on that editor's scroller alone, so two notes
 * open side by side can rule themselves differently.
 *
 * One style at a time per note, cycled by a single command: none -> lines
 * -> grid -> none. A vault-wide default (Settings) covers any note that has
 * never been cycled.
 */

export type PaperStyle = "none" | "lines" | "grid";

export const PAPER_STYLES: readonly PaperStyle[] = ["none", "lines", "grid"];

export function nextPaperStyle(cur: PaperStyle): PaperStyle {
	const i = PAPER_STYLES.indexOf(cur);
	return PAPER_STYLES[(i + 1) % PAPER_STYLES.length] ?? "none";
}

/** The body class for a style; null for none. */
export function paperClass(style: PaperStyle): string | null {
	if (style === "lines") return "justwrite-paper-lines";
	if (style === "grid") return "justwrite-paper-grid";
	return null;
}

/** Normalize a persisted value; anything unrecognized is none. */
export function normalizePaperStyle(raw: unknown): PaperStyle {
	return raw === "lines" || raw === "grid" ? raw : "none";
}

/**
 * Normalize the persisted per-note map: drop any entry whose key is not a
 * string or whose value is not a recognized style, so a hand-edited or
 * corrupted data.json degrades to "no override" per note rather than
 * throwing during load. "none" is kept as a real override (a note can
 * deliberately opt out of ruling even while the vault default is lined or
 * grid) - it is deleted from the map, not stored, only when the caller asks
 * to CLEAR a note back to following the default.
 */
export function normalizePaperStyleByPath(raw: unknown): Record<string, PaperStyle> {
	const out: Record<string, PaperStyle> = {};
	if (!raw || typeof raw !== "object") return out;
	for (const [path, value] of Object.entries(raw as Record<string, unknown>)) {
		if (value === "none" || value === "lines" || value === "grid") out[path] = value;
	}
	return out;
}
