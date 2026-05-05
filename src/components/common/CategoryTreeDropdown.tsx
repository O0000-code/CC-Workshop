import { useMemo } from 'react';
import { Dropdown, type DropdownOption } from './Dropdown';
import { flattenTree } from '@/components/sidebar/dnd/treeUtilities';
import type { Category } from '@/types';

/**
 * Hierarchy-aware Category dropdown shared by the 6 entity-edit dropdowns
 * (Skills, MCPs, ClaudeMd) and the CreateSceneModal category filter.
 *
 * Renders a flat list of category options where each child row is visually
 * indented 16px relative to its parent (D9 / D10 — see
 * `02_design_spec.md` V2 §6.5 + `03_tech_plan.md` V2 §5.9). Both parent and
 * child rows are selectable (D7 = A: parent selection means "self + all
 * descendants" at the consumer side; this component does not enforce
 * descendant inclusion — it just lets you pick the categoryId).
 *
 * `value` is the canonical `categoryId` (string) — D1 = A migration locks
 * the dropdown's identity onto the category UUID, not the display name. An
 * empty-string value means "Uncategorized" / "no selection" depending on
 * the consumer's interpretation (controlled by `placeholder` and the
 * presence of `includeUncategorized`).
 *
 * Why this lives in `common/` rather than `sidebar/`: the dropdown is used
 * across pages (Skills, MCPs, CLAUDE.md, Scenes), not the sidebar — but the
 * tree flattening logic lives in `sidebar/dnd/` because the sidebar is
 * where the tree was first defined. Importing `flattenTree` here keeps the
 * source-of-truth single (any new sidebar tree behaviour is automatically
 * reflected in the dropdown).
 *
 * Note: the dropdown does NOT participate in the localStorage `expanded`
 * set used by the sidebar — it always renders the full flat list (D9: the
 * dropdown itself is not collapsible, since collapsing inside a 200-300px
 * popover would be needless friction).
 */
export interface CategoryTreeDropdownProps {
  /** All categories from `useAppStore`. Order is preserved as-is for roots
   *  and children of each root. */
  categories: Category[];
  /** Currently-selected categoryId. Pass empty string for
   *  "no selection / uncategorized" semantics. */
  value: string;
  /** Called when the user picks an option. Receives the categoryId
   *  (or `''` if `includeUncategorized` is true and the user picked it). */
  onChange: (categoryId: string) => void;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  /** Use the 32px-tall variant (matches V3 sidebar/list visuals). */
  compact?: boolean;
  disabled?: boolean;
  /** When true, prepend an "Uncategorized" option that maps to value `''`.
   *  Default true (matches existing dropdown behaviour). */
  includeUncategorized?: boolean;
  /** Optional extra options prepended *before* the categories (e.g.
   *  CreateSceneModal's "All Categories"). These render at depth 0. */
  prefixOptions?: DropdownOption[];
}

/**
 * Build the flat option list with depth-aware indent. Roots first, each
 * root's children directly after (in their input order). Mirrors
 * `flattenTree` exactly — the dropdown always renders every level (no
 * collapse), so we pass `expandedSet = all root ids` for the flatten call.
 */
function useCategoryTreeOptions(
  categories: Category[],
  includeUncategorized: boolean,
  prefix: DropdownOption[] | undefined,
): DropdownOption[] {
  return useMemo(() => {
    const allRootIds = new Set(categories.filter((c) => !c.parentId).map((c) => c.id));
    const flat = flattenTree(categories, allRootIds);

    const treeOptions: DropdownOption[] = flat.map((cat) => ({
      value: cat.id,
      label: cat.name,
      color: cat.color || '#71717A',
      indent: cat.depth,
    }));

    const head: DropdownOption[] = [];
    if (includeUncategorized) {
      head.push({
        value: '',
        label: 'Uncategorized',
        color: '#71717A',
        indent: 0,
      });
    }
    if (prefix && prefix.length > 0) {
      head.push(...prefix);
    }

    return [...head, ...treeOptions];
  }, [categories, includeUncategorized, prefix]);
}

export function CategoryTreeDropdown({
  categories,
  value,
  onChange,
  placeholder = 'Select category',
  className,
  triggerClassName,
  compact = true,
  disabled = false,
  includeUncategorized = true,
  prefixOptions,
}: CategoryTreeDropdownProps) {
  const options = useCategoryTreeOptions(categories, includeUncategorized, prefixOptions);

  return (
    <Dropdown
      options={options}
      value={value}
      onChange={(v) => {
        // CategoryTreeDropdown is single-select only; coerce to string
        // (Dropdown's onChange signature is `string | string[]` because it
        // can also operate in `multiple` mode, which we never enable here).
        if (typeof v === 'string') onChange(v);
      }}
      placeholder={placeholder}
      className={className}
      triggerClassName={triggerClassName}
      compact={compact}
      disabled={disabled}
    />
  );
}

export default CategoryTreeDropdown;
