import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

// ============================================================================
// ViewOptionsMenu — multi-section borderless ghost trigger + portal popover.
// ============================================================================
//
// Single entry-point that hosts arbitrary "view configuration" sections
// (Group by, Sort by, …). Each section has its own options + value + onChange,
// rendered under an UPPERCASE letter-spaced section header that mirrors the
// sidebar's "MARKETPLACE" / "LIBRARY" labels (10px font-semibold tracking-
// 0.8px text-[#A1A1AA]). Selecting an option does NOT close the popover —
// the user typically picks across multiple sections in a single open.
//
// Strictly token-only per `.claude/rules/design-language.md`: 11px trigger,
// rounded-md / rounded-lg, var(--shadow-dropdown), var(--ease-drag) chevron,
// real `<button>` with aria-haspopup/aria-expanded, focus-visible ring.
// Reduced-motion fallback lives in `index.css` via `data-view-options-menu*`.
// ============================================================================

export interface ViewOption {
  value: string;
  label: string;
}

export interface ViewSection {
  /** Stable id used as React key + for a11y wiring. */
  id: string;
  /** UPPERCASE section header rendered above the options. */
  label: string;
  options: ViewOption[];
  value: string;
  onChange: (value: string) => void;
}

export interface ViewOptionsMenuProps {
  sections: ViewSection[];
  /** Trigger button label next to the chevron. Defaults to "View options". */
  triggerLabel?: string;
}

export function ViewOptionsMenu({ sections, triggerLabel = 'View options' }: ViewOptionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; right: number }>({ top: 0, right: 0 });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 4,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const handle = () => updatePosition();
    window.addEventListener('scroll', handle, true);
    window.addEventListener('resize', handle);
    return () => {
      window.removeEventListener('scroll', handle, true);
      window.removeEventListener('resize', handle);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-view-options-menu
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((v) => !v)}
        className={`
          inline-flex items-center gap-1 rounded-md px-2 py-1
          text-[11px] text-[#A1A1AA]
          transition-colors
          hover:bg-[#F4F4F5] hover:text-[#52525B]
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[#18181B]
        `}
      >
        <span className="whitespace-nowrap">{triggerLabel}</span>
        <ChevronDown
          className="h-3 w-3 flex-shrink-0"
          style={{
            transition: 'transform 120ms var(--ease-drag)',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>
      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            data-view-options-menu-popover
            role="menu"
            style={{
              position: 'fixed',
              top: position.top,
              right: position.right,
              zIndex: 9999,
              minWidth: 220,
              boxShadow: 'var(--shadow-dropdown)',
            }}
            className="rounded-lg border border-[#E5E5E5] bg-white p-1"
          >
            {sections.map((section, idx) => (
              <div key={section.id}>
                {idx > 0 && <div className="my-1 h-px bg-[#E5E5E5]" />}
                <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.8px] text-[#A1A1AA]">
                  {section.label}
                </div>
                {/* `gap-0.5` (2px) keeps adjacent rounded bg blocks visually
                    separated when both a selected row and a hovered row sit
                    next to each other — without this, two #F4F4F5 backplates
                    fuse into one block with rounded inner notches. Matches
                    macOS Sonoma menu spacing. */}
                <div className="flex flex-col gap-0.5">
                  {section.options.map((option) => {
                    const selected = option.value === section.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="menuitemradio"
                        aria-checked={selected}
                        onClick={() => section.onChange(option.value)}
                        className={`
                          flex w-full items-center justify-between gap-2 rounded px-3 py-2
                          text-left text-[13px] font-medium text-[#18181B] transition-colors
                          ${selected ? 'bg-[#F4F4F5]' : 'hover:bg-[#F4F4F5]'}
                        `}
                      >
                        <span className="truncate">{option.label}</span>
                        {selected && (
                          <Check
                            className="h-3.5 w-3.5 flex-shrink-0 text-[#18181B]"
                            strokeWidth={2}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

export default ViewOptionsMenu;
