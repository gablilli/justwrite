/**
 * Which corner (or edge) the floating pen strip parks in.
 *
 * Top-right is the default and was the only option: the writing palm owns
 * the bottom of the glass, so a bottom corner is the one place a right-handed
 * writer's hand lands. It is still the right default, and still a bad default
 * for somebody left-handed, working on a wide monitor, or with a sidebar
 * where the strip used to sit. So it becomes a choice rather than a verdict.
 *
 * Top-center and bottom-center sit alongside the four corners for the same
 * reason a corner became a choice: a wide monitor or a centered writing
 * column can make a corner feel off-axis, and centering the strip on the
 * top or bottom edge is the natural third option once corners already are.
 *
 * The strip and its collapsed pill share one position: they are the same
 * control in two sizes, and having them fly to different places would be
 * absurd. Both get the same class.
 *
 * DOM-free by construction, like PenToolsMode - the placement is CSS, and
 * what this module owns is only the vocabulary and its normalization.
 */

export type ToolbarCorner =
	| "top-right"
	| "top-left"
	| "top-center"
	| "bottom-right"
	| "bottom-left"
	| "bottom-center";

export const TOOLBAR_CORNERS: readonly ToolbarCorner[] = [
	"top-right",
	"top-left",
	"top-center",
	"bottom-right",
	"bottom-left",
	"bottom-center",
];

export const DEFAULT_TOOLBAR_CORNER: ToolbarCorner = "top-right";

/** Human labels for the settings dropdown, in the order offered. */
export const TOOLBAR_CORNER_LABELS: ReadonlyArray<{ value: ToolbarCorner; label: string }> = [
	{ value: "top-right", label: "Top right" },
	{ value: "top-left", label: "Top left" },
	{ value: "top-center", label: "Top center" },
	{ value: "bottom-right", label: "Bottom right" },
	{ value: "bottom-left", label: "Bottom left" },
	{ value: "bottom-center", label: "Bottom center" },
];

/**
 * Anything off disk becomes a real corner. Settings files get hand-edited,
 * synced between versions, and truncated; an unknown value must not leave the
 * toolbar unpositioned, which CSS would render as "wherever it happens to
 * land" rather than as an error anyone could diagnose.
 */
export function normalizeToolbarCorner(raw: unknown): ToolbarCorner {
	return TOOLBAR_CORNERS.includes(raw as ToolbarCorner)
		? (raw as ToolbarCorner)
		: DEFAULT_TOOLBAR_CORNER;
}

/** The class that positions the strip and the pill. One per corner. */
export function toolbarCornerClass(corner: ToolbarCorner): string {
	return `handwriting-corner-${corner}`;
}

/** Every class this module can apply, so a change can remove the others. */
export function allToolbarCornerClasses(): string[] {
	return TOOLBAR_CORNERS.map(toolbarCornerClass);
}
