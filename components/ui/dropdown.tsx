"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  LIST_MAX,
  edgeIndex,
  filterByText,
  initialActiveIndex,
  moveActiveIndex,
  optionInitial,
  placePanel,
  samePlacement,
  shouldSearch,
  type DropdownOption,
  type PanelPlacement
} from "@/lib/dropdown";
import { cn } from "@/lib/utils";

export type { DropdownOption };

// Two looks share one behaviour: the admin one (white, neutral and amber) and the customer
// site's cream, dark and burnt-orange one.
const TONES = {
  admin: {
    label: "mb-1 block text-xs font-semibold text-neutral-500",
    button: "border bg-white text-neutral-950 shadow-sm focus-visible:ring-4 focus-visible:ring-amber-200",
    buttonOpen: "border-neutral-950",
    buttonIdle: "border-neutral-300 hover:border-neutral-400",
    buttonDisabled: "cursor-not-allowed bg-neutral-50 text-neutral-400 hover:border-neutral-300",
    plainText: "font-medium",
    richText: "font-bold",
    muted: "text-neutral-500",
    placeholder: "text-neutral-500",
    chevron: "text-neutral-400",
    tile: "bg-neutral-100 text-neutral-500",
    panel: "bg-white shadow-[0_18px_50px_rgba(23,23,19,0.22)] sm:border sm:border-neutral-200",
    divider: "border-neutral-100",
    search:
      "border-neutral-300 bg-white placeholder:text-neutral-400 focus:border-neutral-950 focus:ring-4 focus:ring-amber-200",
    searchIcon: "text-neutral-400",
    row: "text-neutral-950",
    rowPlainText: "font-medium",
    rowRichText: "font-semibold",
    rowIdle: "bg-white",
    rowActive: "bg-amber-50",
    rowSelected: "ring-1 ring-inset ring-[#f6b73c]",
    rowSelectedMuted: "",
    check: "text-neutral-950",
    empty: "text-neutral-500"
  },
  customer: {
    label: "mb-1 block text-sm font-bold text-[#171713]",
    button: "border bg-white text-[#171713] focus-visible:ring-2 focus-visible:ring-[#c65d24]/25",
    buttonOpen: "border-[#c65d24]",
    buttonIdle: "border-black/12 hover:border-black/30",
    buttonDisabled: "cursor-not-allowed bg-[#f4efe6] text-[#a29b90] hover:border-black/12",
    plainText: "font-black",
    richText: "font-black",
    muted: "text-[#817a70]",
    placeholder: "text-[#a29b90]",
    chevron: "text-[#817a70]",
    tile: "bg-[#f0ebe1] text-[#817a70]",
    panel: "bg-[#fffdf8] shadow-[0_18px_50px_rgba(23,23,19,0.16)] sm:border sm:border-black/10",
    divider: "border-black/8",
    search:
      "border-black/12 bg-white placeholder:text-[#a29b90] focus:border-[#c65d24] focus:ring-2 focus:ring-[#c65d24]/10",
    searchIcon: "text-[#a29b90]",
    row: "text-[#171713]",
    rowPlainText: "font-bold",
    rowRichText: "font-bold",
    rowIdle: "bg-transparent",
    rowActive: "bg-[#f0ebe1]",
    rowSelected: "bg-[#171713] text-white",
    rowSelectedMuted: "text-white/60",
    check: "text-[#f6b73c]",
    empty: "text-[#817a70]"
  }
} as const;

type Tone = keyof typeof TONES;

// Room taken by the search box and padding around the list on desktop.
const PANEL_EXTRA_SEARCH = 68;
const PANEL_EXTRA_PLAIN = 12;

// A neutral initial-letter tile stands in when there is no photo or the photo fails to load.
function Thumb({ url, label, tone, small }: { url: string | null | undefined; label: string; tone: Tone; small?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(url) && failedUrl !== url;
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-lg font-bold",
        small ? "h-6 w-6 text-xs" : "h-10 w-10 text-sm",
        TONES[tone].tile
      )}
      aria-hidden="true"
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- thumbnails come from uploads/external URLs of any size
        <img src={url ?? ""} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" onError={() => setFailedUrl(url ?? null)} />
      ) : (
        optionInitial(label)
      )}
    </span>
  );
}

function measureButton(button: HTMLElement | null, extraHeight: number, listWanted: number): PanelPlacement | null {
  const rect = button?.getBoundingClientRect();
  if (!rect) return null;
  return placePanel({ rect, viewport: { width: window.innerWidth, height: window.innerHeight }, extraHeight, listWanted });
}

export type DropdownProps = {
  options: DropdownOption[];
  // Controlled: pass value and onChange. Uncontrolled (server-rendered filter forms): pass
  // defaultValue and a name, and the choice is submitted with the form.
  value?: string | null;
  defaultValue?: string;
  onChange?: (value: string) => void;
  // Visible label, linked to the control.
  label?: string;
  // Spoken name for a dropdown that has no visible label.
  ariaLabel?: string;
  // Shown when the current value matches no option.
  placeholder?: string;
  // On by default once there are more than 7 options.
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  // Renders a hidden input so the choice travels with a plain HTML form.
  name?: string;
  disabled?: boolean;
  className?: string;
  size?: "md" | "sm";
  tone?: Tone;
  // Submits the closest form after the choice changes, for filter forms that apply at once.
  onChangeSubmit?: boolean;
};

export function Dropdown({
  options,
  value,
  defaultValue,
  onChange,
  label,
  ariaLabel,
  placeholder = "Select",
  searchable,
  searchPlaceholder = "Search",
  emptyText = "No matches",
  name,
  disabled = false,
  className,
  size = "md",
  tone = "admin",
  onChangeSubmit = false
}: DropdownProps) {
  const t = TONES[tone];
  const baseId = useId();
  const buttonId = `${baseId}-button`;
  const labelId = `${baseId}-label`;
  const listId = `${baseId}-list`;
  const optionId = (index: number) => `${baseId}-opt-${index}`;

  const [innerValue, setInnerValue] = useState(defaultValue ?? "");
  const current = value !== undefined ? (value ?? "") : innerValue;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [placement, setPlacement] = useState<PanelPlacement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const spaceHandled = useRef(false);

  const searchOn = shouldSearch(options.length, searchable);
  const selected = options.find((option) => option.value === current) ?? null;
  // One look for the whole list: photo tiles and second lines make every row taller.
  const showTiles = options.some((option) => option.imageUrl !== undefined);
  const rich = showTiles || options.some((option) => option.description);

  const extraHeight = searchOn ? PANEL_EXTRA_SEARCH : PANEL_EXTRA_PLAIN;
  const listWanted = Math.min(LIST_MAX, options.length * (rich ? 52 : 40) + 12);

  const entries = useMemo(() => options.map((option, index) => ({ option, index })), [options]);
  const shown = useMemo(() => filterByText(entries, query, (entry) => entry.option.label), [entries, query]);
  const activeEntry = shown[activeIndex];
  const activeOptionIndex = activeEntry?.index;
  const isDisabledAt = (position: number) => Boolean(shown[position]?.option.disabled);

  function openDropdown() {
    if (disabled) return;
    setQuery("");
    setActiveIndex(initialActiveIndex(options, current));
    setPlacement(measureButton(buttonRef.current, extraHeight, listWanted));
    setOpen(true);
  }

  function closeDropdown(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  function submitForm() {
    const form = rootRef.current?.closest("form");
    // Waits a tick so the hidden input already holds the new choice.
    setTimeout(() => {
      if (form?.isConnected) form.requestSubmit();
    }, 0);
  }

  function pick(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    // Re-picking the current choice should not reset the page's filters.
    if (option.value !== current) {
      if (value === undefined) setInnerValue(option.value);
      onChange?.(option.value);
      if (onChangeSubmit) submitForm();
    }
    closeDropdown(true);
  }

  // Closing on a press outside (not on focus loss) so dragging the list's scrollbar is safe.
  // The panel lives in a portal, so it is checked separately from the button.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || portalRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) (searchOn ? searchRef : buttonRef).current?.focus();
  }, [open, searchOn]);

  // The panel is fixed to the screen, so follow the button when the page or a parent scrolls.
  useEffect(() => {
    if (!open) return;
    function follow(event: Event) {
      if (portalRef.current?.contains(event.target as Node)) return;
      const next = measureButton(buttonRef.current, extraHeight, listWanted);
      if (next) setPlacement((previous) => (samePlacement(previous, next) ? previous : next));
    }
    window.addEventListener("resize", follow);
    window.addEventListener("scroll", follow, true);
    return () => {
      window.removeEventListener("resize", follow);
      window.removeEventListener("scroll", follow, true);
    };
  }, [open, extraHeight, listWanted]);

  useEffect(() => {
    if (!open || activeOptionIndex === undefined) return;
    document.getElementById(`${baseId}-opt-${activeOptionIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeOptionIndex, baseId]);

  // Shared by the search box (long lists) and the button itself (short lists, where there
  // is nothing to type into).
  function onListKeyDown(event: KeyboardEvent<HTMLElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((position) => moveActiveIndex(position, 1, shown.length, isDisabledAt));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((position) => moveActiveIndex(position, -1, shown.length, isDisabledAt));
        break;
      case "Home": {
        const first = edgeIndex(shown.length, "first", isDisabledAt);
        if (first >= 0) {
          event.preventDefault();
          setActiveIndex(first);
        }
        break;
      }
      case "End": {
        const last = edgeIndex(shown.length, "last", isDisabledAt);
        if (last >= 0) {
          event.preventDefault();
          setActiveIndex(last);
        }
        break;
      }
      case "Enter":
        event.preventDefault();
        if (activeEntry) pick(activeEntry.index);
        break;
      case " ":
        // Space types a space in the search box; on the bare button it picks.
        if (!searchOn) {
          event.preventDefault();
          spaceHandled.current = true;
          if (activeEntry) pick(activeEntry.index);
        }
        break;
      case "Escape":
        event.preventDefault();
        // Stops an enclosing dialog from also closing on the same key press.
        event.stopPropagation();
        closeDropdown(true);
        break;
      case "Tab":
        // With a search box, hand focus back to the button first so Tab continues from there.
        closeDropdown(searchOn);
        break;
    }
  }

  function onButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (open && !searchOn) {
      onListKeyDown(event);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) openDropdown();
    }
  }

  // Some browsers click a button when space is released, which would reopen the list.
  function onButtonKeyUp(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === " " && spaceHandled.current) {
      event.preventDefault();
      spaceHandled.current = false;
    }
  }

  const compact = size === "sm";
  const hasName = Boolean(label || ariaLabel);
  const panelStyle = placement
    ? ({
        "--dd-top": placement.top === null ? "auto" : `${placement.top}px`,
        "--dd-bottom": placement.bottom === null ? "auto" : `${placement.bottom}px`,
        "--dd-left": `${placement.left}px`,
        "--dd-width": `${placement.width}px`,
        "--dd-list-max": `${placement.listMax}px`
      } as CSSProperties)
    : undefined;

  const selectedLine = selected ? (compact ? undefined : (selected.selectedDescription ?? selected.description)) : undefined;

  return (
    <div ref={rootRef} className={cn("relative w-full", className)}>
      {label ? (
        <label id={labelId} htmlFor={buttonId} className={t.label}>
          {label}
        </label>
      ) : ariaLabel ? (
        <span id={labelId} className="sr-only">
          {ariaLabel}
        </span>
      ) : null}

      {name && !disabled ? <input type="hidden" name={name} value={current} /> : null}

      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        role={searchOn ? undefined : "combobox"}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && !searchOn && activeOptionIndex !== undefined ? optionId(activeOptionIndex) : undefined}
        aria-labelledby={hasName ? `${labelId} ${buttonId}` : undefined}
        onClick={() => (open ? closeDropdown(false) : openDropdown())}
        onKeyDown={onButtonKeyDown}
        onKeyUp={onButtonKeyUp}
        className={cn(
          "flex w-full items-center gap-3 text-left outline-none transition",
          compact ? "h-9 rounded-lg px-2.5" : cn("rounded-xl px-3", rich ? "min-h-[52px] py-2" : "h-11"),
          t.button,
          disabled ? t.buttonDisabled : open ? t.buttonOpen : t.buttonIdle
        )}
      >
        {selected ? (
          <>
            {showTiles ? <Thumb url={selected.imageUrl} label={selected.label} tone={tone} small={compact} /> : null}
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className={cn("truncate text-sm", rich ? t.richText : t.plainText)}>{selected.label}</span>
                {selected.badge ? (
                  <Badge tone={selected.badge.tone} className="shrink-0 px-2 py-0.5">
                    {selected.badge.text}
                  </Badge>
                ) : null}
              </span>
              {selectedLine ? <span className={cn("block truncate text-xs", t.muted)}>{selectedLine}</span> : null}
            </span>
          </>
        ) : (
          <span className={cn("min-w-0 flex-1 truncate text-sm", t.placeholder)}>{placeholder}</span>
        )}
        <ChevronDown size={compact ? 16 : 18} className={cn("shrink-0 transition-transform", t.chevron, open && "rotate-180")} aria-hidden="true" />
      </button>

      {open
        ? createPortal(
            <div ref={portalRef}>
              {/* Phones: dim the page behind the bottom sheet; tapping it closes the sheet. */}
              <div className="fixed inset-0 z-[55] bg-black/40 sm:hidden" aria-hidden="true" onClick={() => closeDropdown(false)} />
              <div
                style={panelStyle}
                className={cn(
                  "z-[60] flex flex-col overflow-hidden",
                  "fixed inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl",
                  "sm:inset-x-auto sm:bottom-[var(--dd-bottom)] sm:left-[var(--dd-left)] sm:top-[var(--dd-top)] sm:max-h-none sm:w-[var(--dd-width)] sm:rounded-xl",
                  t.panel
                )}
              >
                {searchOn ? (
                  <div className={cn("border-b p-3", t.divider)}>
                    <div className="relative">
                      <Search size={16} className={cn("pointer-events-none absolute left-3 top-1/2 -translate-y-1/2", t.searchIcon)} aria-hidden="true" />
                      <input
                        ref={searchRef}
                        type="text"
                        role="combobox"
                        aria-expanded="true"
                        aria-controls={listId}
                        aria-autocomplete="list"
                        aria-activedescendant={activeOptionIndex !== undefined ? optionId(activeOptionIndex) : undefined}
                        aria-label={searchPlaceholder}
                        placeholder={searchPlaceholder}
                        autoComplete="off"
                        value={query}
                        onChange={(event) => {
                          setQuery(event.target.value);
                          // The top match is highlighted so Enter picks it straight away.
                          const matches = filterByText(entries, event.target.value, (entry) => entry.option.label);
                          setActiveIndex(edgeIndex(matches.length, "first", (position) => Boolean(matches[position].option.disabled)));
                        }}
                        onKeyDown={onListKeyDown}
                        className={cn("h-11 w-full rounded-xl border pl-9 pr-3 text-base outline-none transition sm:text-sm", t.search)}
                      />
                    </div>
                  </div>
                ) : null}

                <ul
                  id={listId}
                  role="listbox"
                  aria-label={label ?? ariaLabel ?? placeholder}
                  // Keeps focus where it is while a row or the scrollbar is pressed.
                  onMouseDown={(event) => event.preventDefault()}
                  className="max-h-[60dvh] overflow-y-auto overscroll-contain p-1.5 [scrollbar-color:#d4d4d4_transparent] [scrollbar-width:thin] sm:max-h-[var(--dd-list-max)]"
                >
                  {shown.length ? (
                    shown.map(({ option, index }, position) => {
                      const isSelected = option.value === current;
                      return (
                        <li
                          key={`${index}-${option.value}`}
                          id={optionId(index)}
                          role="option"
                          aria-selected={isSelected}
                          aria-disabled={option.disabled || undefined}
                          onClick={() => pick(index)}
                          onMouseMove={() => !option.disabled && position !== activeIndex && setActiveIndex(position)}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-1.5",
                            rich ? "min-h-[52px]" : "min-h-10",
                            t.row,
                            position === activeIndex ? t.rowActive : t.rowIdle,
                            isSelected && t.rowSelected,
                            option.disabled && "cursor-not-allowed opacity-50"
                          )}
                        >
                          {showTiles ? <Thumb url={option.imageUrl} label={option.label} tone={tone} /> : null}
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className={cn("truncate text-sm", rich ? t.rowRichText : t.rowPlainText)}>{option.label}</span>
                              {option.badge ? (
                                <Badge tone={option.badge.tone} className="shrink-0 px-2 py-0.5">
                                  {option.badge.text}
                                </Badge>
                              ) : null}
                            </span>
                            {option.description ? (
                              <span className={cn("block truncate text-xs", isSelected && t.rowSelectedMuted ? t.rowSelectedMuted : t.muted)}>
                                {option.description}
                              </span>
                            ) : null}
                          </span>
                          {option.endBadge ? (
                            <Badge tone={option.endBadge.tone} className="shrink-0 px-2 py-0.5">
                              {option.endBadge.text}
                            </Badge>
                          ) : null}
                          <Check size={16} className={cn("shrink-0", t.check, !isSelected && "invisible")} aria-hidden="true" />
                        </li>
                      );
                    })
                  ) : (
                    <li role="presentation" className={cn("px-3 py-8 text-center text-sm", t.empty)}>
                      {emptyText}
                    </li>
                  )}
                </ul>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
