/**
 * The floating pen-tools strip for inline notes.
 *
 * Every Handwriting control lives in the command palette, and on an iPad the
 * palette lives in the toolbar above the keyboard - and the stylus fix keeps
 * the keyboard DOWN, which is correct for writing and fatal for discovery: a
 * pencil-only user has no path to the eraser, the highlighter, or anything
 * else. This strip is that path. It invents nothing: every button executes
 * the same command id the palette would, so persistence, notices and behavior
 * stay in one place.
 *
 * Where it mounts matters. It sits on the EDITOR element (`view.dom`), a
 * sibling of the scroller, not inside it - the router's capture listeners
 * live on the scroller, so a pencil tap on a button never enters the pen
 * pipeline and lands as an ordinary click. Top-right, because the writing
 * palm owns the bottom of the glass and a palm-planted strip would switch
 * tools mid-word.
 *
 * The host hands in command execution and current-state reads so this file
 * imports nothing from InkOverlay (no import cycle).
 *
 * Collapse: the strip minimizes to a single pen pill (the PencilKit move -
 * every serious note app keeps tools permanently reachable but shrinkable).
 * The collapsed state is per-strip and per-session: chrome preference, not
 * document state, and not worth a setting.
 */

import { setIcon } from "obsidian";
import {
	ToolbarCorner,
	allToolbarCornerClasses,
	toolbarCornerClass,
} from "./ToolbarCorner";

export interface MobileToolsHost {
	/** Execute a command by its full id (e.g. "justwrite:inline-tool-pen"). */
	exec(commandId: string): void;
	/** The active nib: "pen" or "highlighter". */
	activeTool(): string;
	/** Whether eraser mode currently overrides the nib. */
	eraserOn(): boolean;
	/** Eraser behavior, so the pop's Stroke | Reticle chips can show and flip it. */
	eraserWholeStroke(): boolean;
	setEraserWholeStroke(on: boolean): void;
	/** Whether lasso mode makes the tip lasso. */
	lassoOn(): boolean;
	/** Whether insert-space mode makes the tip plant a divider. */
	spaceOn(): boolean;
	/** Whether pan mode makes the tip drag the view. */
	panOn(): boolean;
	/** The active tool's current ink color, for the tinted palette button. */
	activeColor(): string;
	/** Eraser radius in screen px, for the slider. */
	eraserRadiusPx(): number;
	/** Live while dragging; commit=true on release persists. */
	setEraserRadiusPx(px: number, commit: boolean): void;
	/** Nib size multiplier for a tool, for the ink sliders. */
	inkSizeMult(tool: string): number;
	setInkSizeMult(tool: string, mult: number, commit: boolean): void;
	/** Editor history state, so undo/redo can dim when they would no-op. */
	canUndo(): boolean;
	canRedo(): boolean;
	/** Whether the ink clipboard holds anything, so paste can dim. */
	canPasteInk(): boolean;
	/** Whether a lasso selection exists, so copy and trash can dim. */
	hasInkSelection(): boolean;
	/** The active tool's palette, for the swatch pop. */
	palette(): ReadonlyArray<{ name: string; hex: string }>;
	/** Set the active tool's color to an arbitrary hex string (validated). */
	setInkColorHex(hex: string): void;
}

/**
 * The tip inks only when nothing has taken it over. A nib button asked
 * only whether the eraser was on, so turning on lasso - or insert space,
 * which copied lasso's shape - left Pen lit alongside the mode that had
 * actually claimed the tip, and the strip showed two active tools at once
 * (alan, 2026-08-27). Every mode that steals the tip belongs in here.
 */
const tipInks = (h: MobileToolsHost): boolean =>
	!h.eraserOn() && !h.lassoOn() && !h.spaceOn() && !h.panOn();

interface ButtonSpec {
	icon: string;
	/** Two-char fallback shown when the icon set has no such glyph. */
	glyph: string;
	label: string;
	commandId: string;
	/** Marks the button active from current state; omitted = never marked. */
	isActive?: (host: MobileToolsHost) => boolean;
	/** Dims the button when false; omitted = always enabled. */
	isEnabled?: (host: MobileToolsHost) => boolean;
	/**
	 * Draw a divider BEFORE this button. The strip carries two different
	 * kinds of control - modes, where exactly one is always winning, and
	 * one-shot actions - and they were laid out identically, so the most
	 * important distinction in the whole strip was invisible.
	 */
	startsGroup?: boolean;
}

/**
 * Four groups, divided by SUBJECT rather than by widget type: the nib and
 * its colour, the other things the tip can be, what to do with a selection,
 * and the note's history. Colour is an action sitting among modes on
 * purpose - it changes whichever nib is active, so it belongs beside them.
 */
const BUTTONS: ButtonSpec[] = [
	{
		icon: "pen",
		glyph: "P",
		label: "Pen",
		commandId: "justwrite:inline-tool-pen",
		isActive: (h) => tipInks(h) && h.activeTool() === "pen",
	},
	{
		icon: "highlighter",
		glyph: "H",
		label: "Highlighter",
		commandId: "justwrite:inline-tool-highlighter",
		isActive: (h) => tipInks(h) && h.activeTool() === "highlighter",
	},
	// The standalone palette button is gone: color now lives INSIDE each
	// nib's own panel (toolPanel below), reached by tapping the nib you
	// are already holding. A second button that opened the very same
	// swatches was redundant chrome once the panel carried them itself.
	{
		icon: "eraser",
		glyph: "E",
		label: "Eraser",
		commandId: "justwrite:inline-tool-eraser",
		isActive: (h) => h.eraserOn(),
		startsGroup: true,
	},
	{
		icon: "lasso",
		glyph: "L",
		label: "Lasso",
		commandId: "justwrite:inline-tool-lasso",
		isActive: (h) => h.lassoOn(),
	},
	{
		icon: "unfold-vertical",
		glyph: "S",
		label: "Insert space",
		commandId: "justwrite:inline-tool-space",
		isActive: (h) => h.spaceOn(),
	},
	{
		icon: "hand",
		glyph: "M",
		label: "Pan",
		commandId: "justwrite:inline-tool-pan",
		isActive: (h) => h.panOn(),
	},
	{
		icon: "trash-2",
		glyph: "D",
		label: "Delete selection",
		startsGroup: true,
		commandId: "justwrite:delete-selected-ink",
		isEnabled: (h) => h.hasInkSelection(),
	},
	{
		icon: "copy",
		glyph: "Cp",
		label: "Copy selected ink",
		commandId: "justwrite:copy-selected-ink",
		isEnabled: (h) => h.hasInkSelection(),
	},
	{
		icon: "clipboard-paste",
		glyph: "V",
		label: "Paste ink",
		commandId: "justwrite:paste-ink",
		isEnabled: (h) => h.canPasteInk(),
	},
	{
		icon: "undo-2",
		glyph: "U",
		label: "Undo",
		commandId: "editor:undo",
		isEnabled: (h) => h.canUndo(),
		startsGroup: true,
	},
	{ icon: "redo-2", glyph: "R", label: "Redo", commandId: "editor:redo", isEnabled: (h) => h.canRedo() },
];

/**
 * Collapsed is a SESSION preference, not a per-note one: collapsing the
 * strip in one note means "get out of my way", and it would be rude to
 * reappear full-size on the next note. New strips are born matching it.
 */
let collapsedSession = false;

interface ToolPanel {
	pop: HTMLElement;
	input: HTMLInputElement;
	val: HTMLElement;
	swatches: HTMLElement;
	hexInput: HTMLInputElement;
	hexSwatch: HTMLElement;
	tool: "pen" | "highlighter";
}

export class MobileTools {
	private el: HTMLElement;
	private buttons: Array<{ el: HTMLElement; spec: ButtonSpec }> = [];
	private slider!: { pop: HTMLElement; input: HTMLInputElement; val: HTMLElement };
	private penPanel!: ToolPanel;
	private hlPanel!: ToolPanel;
	/** Which nib's panel (size + color) is open; tap the active tool again to toggle. */
	private openInkSlider: "pen" | "highlighter" | null = null;
	private strokeChip!: HTMLElement;
	private reticleChip!: HTMLElement;

	private pill: HTMLElement;

	// Buttons must not take focus from the editor: undo/redo route to the
	// active editor, and a focus-stealing toolbar makes that a coin flip.
	//
	// MOUSE ONLY. Calling preventDefault() on pointerdown for a touch- or
	// pen-sourced pointer tells WebKit the compatibility mouse events that
	// follow - including click - are unwanted, and on iPadOS it honours that
	// by never firing them. Every button in this strip went permanently dead
	// under Apple Pencil (and finger) as a result: pointerdown fired, click
	// never did (alan, iPad, 2026-08-29). Mouse and trackpad clicks don't
	// carry that penalty, so they keep the focus guard; pen and touch taps
	// skip it and rely on `click` alone. An arrow field, not a constructor
	// local, so every button-building method - including toolPanel(), a
	// separate method - can reach it.
	private noFocus = (el: HTMLElement): void => {
		el.addEventListener("pointerdown", (ev) => {
			if (ev.pointerType === "mouse") ev.preventDefault();
		});
	};

	constructor(parent: HTMLElement, private host: MobileToolsHost) {
		// The collapsed form: one small pen button that brings the strip back.
		this.pill = parent.createEl("button", {
			cls: "justwrite-pen-pill",
			attr: { "aria-label": "Pen tools", type: "button" },
		});
		setIcon(this.pill, "pen");
		if (!this.pill.querySelector("svg")) this.pill.setText("P");
		const noFocus = this.noFocus;
		noFocus(this.pill);
		this.pill.addEventListener("click", (ev) => {
			ev.preventDefault();
			this.setCollapsed(false);
		});
		this.el = parent.createDiv({ cls: "justwrite-mobile-tools" });
		const collapse = this.el.createEl("button", {
			cls: "justwrite-mobile-tool justwrite-tools-collapse",
			attr: { "aria-label": "Collapse pen tools", type: "button" },
		});
		setIcon(collapse, "chevron-right");
		if (!collapse.querySelector("svg")) collapse.setText(">");
		noFocus(collapse);
		collapse.addEventListener("click", (ev) => {
			ev.preventDefault();
			this.setCollapsed(true);
		});
		for (const spec of BUTTONS) {
			if (spec.startsGroup) {
				this.el.createDiv({ cls: "justwrite-mobile-tools-divider" });
			}
			const b = this.el.createEl("button", {
				cls: "justwrite-mobile-tool",
				attr: { "aria-label": spec.label, type: "button" },
			});
			setIcon(b, spec.icon);
			// If the icon set yields no svg, the button says its initial.
			if (!b.querySelector("svg")) b.setText(spec.glyph);
			noFocus(b);
			b.addEventListener("click", (ev) => {
				ev.preventDefault();
				// The GoodNotes pattern: tapping the tool you are already
				// holding opens its options instead of re-picking it.
				// Color and size live together in one panel per nib now,
				// so there is no separate palette button to alias.
				const nib =
					spec.commandId === "justwrite:inline-tool-pen"
						? "pen"
						: spec.commandId === "justwrite:inline-tool-highlighter"
							? "highlighter"
							: null;
				if (nib && (spec.isActive?.(this.host) ?? true)) {
					this.openInkSlider = this.openInkSlider === nib ? null : nib;
				} else {
					this.openInkSlider = null;
					this.host.exec(spec.commandId);
				}
				this.refresh();
			});
			this.buttons.push({ el: b, spec });
		}
		// Drop-down sliders. No noFocus here: a range input needs its native
		// pointerdown to start a drag on webkit. Focus loss is tolerable for
		// a slider; a slider that will not slide is not.
		// Each slider rides in a pop with a live value readout: on glass
		// without hover there is otherwise NO feedback while dragging.
		const dropSlider = (
			aria: string,
			min: string,
			max: string,
			step: string,
			format: (v: number) => string,
			onValue: (v: number, commit: boolean) => void
		): { pop: HTMLElement; input: HTMLInputElement; val: HTMLElement } => {
			const pop = this.el.createDiv({ cls: "justwrite-slider-pop" });
			// The slot owns the layout (28x104); the input centers inside it,
			// so whatever app.css does to range inputs cannot move the pop.
			const slot = pop.createDiv({ cls: "justwrite-slider-slot" });
			const input = slot.createEl("input", {
				cls: "justwrite-eraser-slider",
				attr: { type: "range", min, max, step, "aria-label": aria },
			});
			const val = pop.createDiv({ cls: "justwrite-slider-val" });
			const show = () => {
				val.setText(format(Number(input.value)));
			};
			input.addEventListener("input", () => {
				show();
				onValue(Number(input.value), false);
			});
			input.addEventListener("change", () => onValue(Number(input.value), true));
			show();
			return { pop, input, val };
		};
		this.slider = dropSlider("Eraser size", "3", "64", "1", (v) => `${v}px`, (v, c) =>
			this.host.setEraserRadiusPx(v, c)
		);
		// The eraser's pop leads with its behavior: Stroke deletes what the
		// ring touches whole, Reticle takes only what it covers. Same
		// setting as the tab, so the two always agree.
		{
			const chips = this.slider.pop.createDiv({ cls: "justwrite-mode-chips" });
			this.slider.pop.insertBefore(chips, this.slider.pop.firstChild);
			const chip = (label: string, whole: boolean): HTMLElement => {
				const el = chips.createEl("button", {
					cls: "justwrite-mode-chip",
					text: label,
					attr: { type: "button" },
				});
				noFocus(el);
				el.addEventListener("click", (ev) => {
					ev.preventDefault();
					this.host.setEraserWholeStroke(whole);
					this.refresh();
				});
				return el;
			};
			this.strokeChip = chip("Stroke", true);
			this.reticleChip = chip("Reticle", false);
		}
		// Pen and highlighter each get ONE combined panel: a horizontal size
		// slider up top, the palette below it as an evenly-sized grid (never
		// stretched - each swatch is a fixed square, the grid only centers
		// them), and a hex field for any color the palette does not offer.
		// It used to be two separate pops (a rotated vertical slider, and a
		// palette pop reached only through a third button) that could not be
		// open at once; tapping the tool you are holding now surfaces both.
		this.penPanel = this.toolPanel(
			"pen",
			"Pen size",
			"0.3",
			"4",
			"0.05",
			(v) => `${v.toFixed(2)}x`,
			(v, c) => this.host.setInkSizeMult("pen", v, c)
		);
		// The highlighter runs a narrower range: its base is already wide,
		// and past 1.5x it stops being a highlighter and starts being paint.
		this.hlPanel = this.toolPanel(
			"highlighter",
			"Highlighter size",
			"0.25",
			"1.5",
			"0.05",
			(v) => `${v.toFixed(2)}x`,
			(v, c) => this.host.setInkSizeMult("highlighter", v, c)
		);
		this.refreshNow();
		this.setCollapsed(collapsedSession);
	}

	/**
	 * Build one nib's combined panel: horizontal size slider, color grid,
	 * hex field. Pulled out of the constructor because pen and highlighter
	 * are otherwise identical apart from their range and command.
	 */
	private toolPanel(
		tool: "pen" | "highlighter",
		aria: string,
		min: string,
		max: string,
		step: string,
		format: (v: number) => string,
		onValue: (v: number, commit: boolean) => void
	): ToolPanel {
		const pop = this.el.createDiv({ cls: "justwrite-slider-pop justwrite-tool-panel" });
		const sizeRow = pop.createDiv({ cls: "justwrite-hslider-row" });
		const input = sizeRow.createEl("input", {
			cls: "justwrite-hslider",
			attr: { type: "range", min, max, step, "aria-label": aria },
		});
		const val = sizeRow.createDiv({ cls: "justwrite-slider-val" });
		const show = () => val.setText(format(Number(input.value)));
		input.addEventListener("input", () => {
			show();
			onValue(Number(input.value), false);
		});
		input.addEventListener("change", () => onValue(Number(input.value), true));
		show();
		pop.createDiv({ cls: "justwrite-tool-panel-divider" });
		const swatches = pop.createDiv({ cls: "justwrite-color-grid" });
		const hexRow = pop.createDiv({ cls: "justwrite-hex-row" });
		const hexSwatch = hexRow.createDiv({ cls: "justwrite-hex-preview" });
		const hexInput = hexRow.createEl("input", {
			cls: "justwrite-hex-input",
			attr: {
				type: "text",
				maxlength: "7",
				placeholder: "#rrggbb",
				"aria-label": `${aria.replace(" size", "")} custom color`,
			},
		});
		const commitHex = () => {
			const hex = hexInput.value.trim();
			if (!hex) return;
			this.host.setInkColorHex(hex);
			this.refresh();
		};
		hexInput.addEventListener("pointerdown", (ev) => ev.stopPropagation());
		hexInput.addEventListener("change", commitHex);
		hexInput.addEventListener("keydown", (ev) => {
			if (ev.key === "Enter") {
				ev.preventDefault();
				commitHex();
			}
		});
		return { pop, input, val, swatches, hexInput, hexSwatch, tool };
	}

	private refreshQueued = false;

	/**
	 * Coalesced, off-the-input-handler refresh: pen-up and pen-down call
	 * this from latency-critical handlers, and the body does forced layout
	 * reads (hangUnder measures offsets). One rAF defers the work past the
	 * stroke's frame and collapses bursts into a single pass.
	 */
	refresh(): void {
		if (this.refreshQueued) return;
		this.refreshQueued = true;
		// The strip's own window, so a popout editor ticks on its own frames.
		(this.el.ownerDocument.defaultView ?? window).requestAnimationFrame(() => {
			this.refreshQueued = false;
			this.refreshNow();
		});
	}

	/** The synchronous body; the constructor uses it before first paint. */
	refreshNow(): void {
		for (const { el, spec } of this.buttons) {
			el.classList.toggle("is-active", spec.isActive?.(this.host) ?? false);
			el.classList.toggle("is-disabled", !(spec.isEnabled?.(this.host) ?? true));
		}
		// Hang a drop-down under its button, measured live so it survives
		// the strip wrapping on narrow screens.
		const hangUnder = (
			pop: HTMLElement,
			commandId: string,
			show: boolean
		) => {
			pop.toggleClass("is-showing", show);
			if (!show) return;
			const btn = this.buttons.find((b) => b.spec.commandId === commandId)?.el;
			if (btn) {
				const right = this.el.offsetWidth - btn.offsetLeft - btn.offsetWidth;
				pop.setCssStyles({ right: `${Math.max(0, right - 4)}px` });
			}
		};
		const whole = this.host.eraserWholeStroke();
		this.strokeChip.toggleClass("is-current", whole);
		this.reticleChip.toggleClass("is-current", !whole);
		this.slider.input.value = String(this.host.eraserRadiusPx());
		this.slider.val.setText(`${this.host.eraserRadiusPx()}px`);
		hangUnder(this.slider.pop, "justwrite:inline-tool-eraser", this.host.eraserOn());
		const nib = this.host.eraserOn() ? null : this.openInkSlider;
		// Each nib's panel carries its own size AND color together now, so
		// one populate step covers both instead of a separate swatch pop.
		const populate = (panel: ToolPanel, active: boolean) => {
			const show = nib === panel.tool && this.host.activeTool() === panel.tool;
			if (show) {
				panel.input.value = String(this.host.inkSizeMult(panel.tool));
				panel.val.setText(
					`${this.host.inkSizeMult(panel.tool).toFixed(2)}x`
				);
				const current = active ? this.host.activeColor() : "";
				panel.swatches.empty();
				for (const c of this.host.palette()) {
					const sw = panel.swatches.createEl("button", {
						cls: "justwrite-color-swatch",
						attr: { "aria-label": c.name, type: "button" },
					});
					// The visible circle lives on a nested, non-interactive
					// span rather than on the button itself: a <button> is a
					// form control and a direct CSS grid item, both of which
					// iPadOS Safari has been seen to size wrong regardless of
					// width/max-width/aspect-ratio pinned directly on it
					// (hardware, 2026-08-31/09-01 - the squashed-oval report
					// persisted through two rounds of constraining the button
					// itself). A plain <span> one level deeper is neither of
					// those things, so its fixed 22x22 circle cannot inherit
					// either quirk - whatever size WebKit decides the button
					// should be, the dot centered inside it stays exact.
					const dot = sw.createSpan({ cls: "justwrite-color-swatch-dot" });
					dot.setCssStyles({ backgroundColor: c.hex });
					sw.toggleClass("is-current", c.hex.toLowerCase() === current.toLowerCase());
					this.noFocus(sw);
					sw.addEventListener("click", (ev) => {
						ev.preventDefault();
						this.host.exec(`handwriting:ink-color-${c.name}`);
						this.refresh();
					});
				}
				panel.hexSwatch.setCssStyles({ backgroundColor: current });
				if (panel.hexInput.ownerDocument.activeElement !== panel.hexInput) {
					panel.hexInput.value = current;
				}
			}
			hangUnder(
				panel.pop,
				panel.tool === "pen"
					? "justwrite:inline-tool-pen"
					: "justwrite:inline-tool-highlighter",
				show
			);
		};
		populate(this.penPanel, this.host.activeTool() === "pen");
		populate(this.hlPanel, this.host.activeTool() === "highlighter");
	}

	/** Writing started: nib panels get out of the way. */
	closeInkSliders(): void {
		if (this.openInkSlider === null) return;
		this.openInkSlider = null;
		this.refresh();
	}

	/**
	 * While the pen is down the strip stays visible in whatever state it was
	 * already in - open or collapsed - but goes inert: `pointer-events: none`
	 * so a stroke or an eraser scrub passing under it can never land on one
	 * of its buttons mid-gesture. It used to hide outright, which made an
	 * always-reachable toolbar flicker out and back on every single stroke.
	 * Pure class toggle - no reads, nothing forced, safe inside the pen-down
	 * handler.
	 */
	setInking(on: boolean): void {
		this.el.toggleClass("is-inking", on);
		this.pill.toggleClass("is-inking", on);
	}

	/**
	 * Park the strip and its pill in a corner. Both move together: they are
	 * one control in two sizes, and the old classes come off first so a
	 * change cannot leave two corners asserted at once.
	 */
	setCorner(corner: ToolbarCorner): void {
		const stale = allToolbarCornerClasses();
		const want = toolbarCornerClass(corner);
		for (const el of [this.el, this.pill]) {
			for (const c of stale) el.classList.remove(c);
			el.classList.add(want);
		}
	}

	setCollapsed(on: boolean): void {
		collapsedSession = on;
		this.el.toggleClass("is-collapsed", on);
		this.pill.toggleClass("is-showing", on);
	}

	destroy(): void {
		this.el.remove();
		this.pill.remove();
		this.buttons = [];
	}

	/** Test seam / debugging: the currently open nib slider, if any. */
	get openNibSlider(): "pen" | "highlighter" | null {
		return this.openInkSlider;
	}
}
