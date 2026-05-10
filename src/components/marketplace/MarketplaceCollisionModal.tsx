import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';
import { useMarketplaceStore } from '@/stores/marketplaceStore';
import type { ConflictAction } from '@/types/marketplace';

// ============================================================================
// MarketplaceCollisionModal — task card C5
// ============================================================================
//
// Resolves the `InstallOutcome::NameCollision` outcome surfaced when
// `install_marketplace_skill` / `install_marketplace_mcp` detects a same-name
// resource in the user's library or in the Trash.
//
// State machine (spec §8.1 / §6.2):
//   - User triggers Install → store calls backend → backend returns
//     `NameCollision { hasLocal, hasTrashed }` → store opens this Modal.
//   - User picks Replace / Restore / Cancel:
//       * Replace  → store.resolveCollision({ kind: 'replace' })
//       * Restore  → store.resolveCollision({ kind: 'restoreFromTrash',
//                                              trashPath: hasTrashed.path })
//       * Cancel   → store.closeCollisionModal()  (also clears installingItemIds)
//   - resolveCollision closes the Modal optimistically and reroutes through
//     the install action; install-time errors flow into `installFailedItems`
//     and surface as Retry on the originating ListItem (R3-P0-3 / PRD §5.5).
//
// ARIA (spec §10.2):
//   The reusable Modal component does not let callers override its outer
//   role, so we keep `showHeader={false}` and render the entire body inside
//   `children`, attaching `role="alertdialog"` + `aria-modal="true"` +
//   `aria-labelledby` + `aria-describedby` directly on our content wrapper.
//   Esc / overlay click / portal / body-scroll lock continue to come from
//   Modal itself (verified in `src/components/common/Modal.tsx:30-58`).
//
// Default focus:
//   The shared Button component is a plain function component (not
//   forwardRef-wrapped) under React 18.3, so `ref` cannot be threaded
//   through it. We instead attach a ref to the footer container and locate
//   the desired button via a `data-collision-action` attribute on a
//   wrapping span. This keeps focus management self-contained and avoids
//   modifying the shared Button (out of scope for C5).
// ============================================================================

const TITLE_TEMPLATE = (name: string) => `${name} already exists in your library.`;

const DESCRIPTION_LOCAL_ONLY =
  'Replacing will move the existing version to Trash. Your category, tags, and custom icon will not be carried over.';
const DESCRIPTION_HAS_TRASHED =
  'A previously deleted version exists in Trash. Restoring will recover your category, tags, and custom icon.';

type CollisionAction = 'cancel' | 'replace' | 'restore';

export function MarketplaceCollisionModal() {
  // Subscribe to the whole collision state so the Modal closes the moment
  // the store flips it back to `initialCollisionModalState`. (zustand
  // re-renders are object-shallow, so subscribing to the wrapper object is
  // fine — the store creates a new object on every flip.)
  const collisionState = useMarketplaceStore((s) => s.collisionModalState);
  const closeCollisionModal = useMarketplaceStore((s) => s.closeCollisionModal);
  const resolveCollision = useMarketplaceStore((s) => s.resolveCollision);

  // Inline error state for the unlikely case where `resolveCollision`
  // throws synchronously (programming error). Async install failures are
  // swallowed by the install action and surface as Retry on the ListItem,
  // so this state is rarely populated in practice. Reset on close/open.
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  // Footer container ref — used to query a default-focus target by
  // `data-collision-action` once the dialog mounts.
  const footerRef = useRef<HTMLDivElement | null>(null);

  // Stable ids for aria-labelledby / aria-describedby pairing.
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();

  const { open, item, hasLocal, hasTrashed } = collisionState;

  // Reset transient local state whenever the modal opens with a new item.
  useEffect(() => {
    if (open) {
      setInlineError(null);
      setIsResolving(false);
    }
  }, [open, item?.id]);

  // Apply default focus after the dialog DOM mounts. The Modal portal
  // renders synchronously when `isOpen` flips, so a 0 ms timeout is enough
  // to land focus after layout (matches `Dropdown.tsx:90` / `IconPicker.tsx:535`
  // patterns elsewhere in this codebase).
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      // Restore wins focus when present (least surprise: it preserves the
      // user's previous category/tags/icon). Otherwise default to Cancel —
      // never default to a destructive action when the user has no
      // recoverable copy.
      const target: CollisionAction = hasTrashed ? 'restore' : 'cancel';
      const root = footerRef.current;
      if (!root) return;
      const button = root.querySelector<HTMLButtonElement>(
        `button[data-collision-action="${target}"]`,
      );
      button?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, hasTrashed]);

  const description = useMemo(() => {
    // The "has trashed" copy is more informative — it tells the user that
    // restoring recovers their metadata. Show it whenever a trashed copy
    // exists, regardless of whether a local copy also exists.
    if (hasTrashed) return DESCRIPTION_HAS_TRASHED;
    return DESCRIPTION_LOCAL_ONLY;
  }, [hasTrashed]);

  // Defensive: if the store opened the modal but item is missing, close it
  // on the next tick so the user is never stranded looking at a half-
  // rendered dialog. This should never fire under normal flow.
  if (open && !item) {
    void Promise.resolve().then(closeCollisionModal);
    return null;
  }

  // Run a resolution action (Replace / Restore). Errors flow through the
  // store's install path, but we additionally guard against synchronous
  // throws so the user sees an inline error rather than a stuck spinner.
  const runResolution = async (action: ConflictAction) => {
    setInlineError(null);
    setIsResolving(true);
    try {
      await resolveCollision(action);
      // resolveCollision sets `collisionModalState` to initial — this Modal
      // unmounts shortly after this await resolves.
    } catch (err) {
      const message =
        typeof err === 'string' ? err : err instanceof Error ? err.message : String(err);
      setInlineError(message || 'Something went wrong while resolving the collision.');
      setIsResolving(false);
    }
  };

  const handleReplace = () => {
    void runResolution({ kind: 'replace' });
  };

  const handleRestore = () => {
    if (!hasTrashed) return;
    void runResolution({
      kind: 'restoreFromTrash',
      trashPath: hasTrashed.path,
    });
  };

  const handleCancel = () => {
    closeCollisionModal();
  };

  // Buttons rendered in left-to-right order (Cancel first as the
  // non-destructive default; primary actions follow). When both Replace
  // and Restore are available we put Restore last because Restore is the
  // intended default — the trailing button is the most prominent.
  const showReplace = !!hasLocal;
  const showRestore = !!hasTrashed;

  return (
    <Modal isOpen={open} onClose={handleCancel} title="" showHeader={false} maxWidth="480px">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={inlineError ? `${descriptionId} ${errorId}` : descriptionId}
        className="flex flex-col gap-5 px-7 py-6"
      >
        {/* Title */}
        <h2 id={titleId} className="text-lg font-semibold text-[#18181B]">
          {item ? TITLE_TEMPLATE(item.name) : ''}
        </h2>

        {/* Description */}
        <p id={descriptionId} className="text-[13px] font-normal leading-relaxed text-[#71717A]">
          {description}
        </p>

        {/* Inline error — surfaces only when resolveCollision throws
            synchronously. Async install failures route through the
            ListItem's Retry path and do not appear here. */}
        {inlineError && (
          <p
            id={errorId}
            role="alert"
            className="text-[13px] font-normal leading-relaxed text-[#DC2626]"
          >
            {inlineError}
          </p>
        )}

        {/* Footer — buttons. Cancel always present, Replace/Restore are
            conditional. The trailing button receives default focus. */}
        <div ref={footerRef} className="mt-1 flex items-center justify-end gap-2">
          <Button
            variant="secondary"
            size="small"
            onClick={handleCancel}
            disabled={isResolving}
            data-collision-action="cancel"
          >
            Cancel
          </Button>

          {showReplace && (
            <Button
              variant="primary"
              size="small"
              onClick={handleReplace}
              disabled={isResolving}
              loading={isResolving}
              data-collision-action="replace"
            >
              Replace existing
            </Button>
          )}

          {showRestore && (
            <Button
              variant="primary"
              size="small"
              onClick={handleRestore}
              disabled={isResolving}
              loading={isResolving}
              data-collision-action="restore"
            >
              Restore from Trash
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default MarketplaceCollisionModal;
