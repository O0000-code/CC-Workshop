import type { Category, ClassifyResult, ExistingCategoryPayload, Tag } from '@/types';

const CATEGORY_COLORS = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
  '#F97316',
];

/**
 * Build the snapshot of existing categories sent to `auto_classify`,
 * with each entry's parent name resolved. The model reasons about
 * hierarchy via names, not IDs.
 */
export function buildExistingCategoriesPayload(categories: Category[]): ExistingCategoryPayload[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return categories.map((c) => ({
    name: c.name,
    parentName: c.parentId ? (byId.get(c.parentId)?.name ?? null) : null,
  }));
}

/**
 * Apply classification results: create the new categories and tags they
 * imply, then return a name → id map covering the (now up-to-date)
 * category set.
 *
 * Sub-categories (results with `suggested_parent_category`) are created
 * with the proper `parentId`. Parents that are themselves new are
 * created first so the child-create call sees a valid parent. Depth-2
 * safety net: if the AI proposes an existing sub-category as the parent
 * (which the backend would reject), the result silently falls back to
 * root — better than aborting the whole batch on one bad row.
 */
export async function applyClassifyResultsToCategories(
  results: ClassifyResult[],
  currentCategories: Category[],
  currentTags: Tag[],
  addCategory: (name: string, color: string, parentId?: string) => Promise<Category>,
  addTag: (name: string) => Promise<Tag>,
): Promise<Map<string, string>> {
  const existingByName = new Map(currentCategories.map((c) => [c.name, c]));
  const existingTagNames = new Set(currentTags.map((t) => t.name));

  const newRoots: string[] = [];
  const newChildren: Array<{ name: string; parentName: string }> = [];
  const seenNew = new Set<string>();
  const newTagNames = new Set<string>();

  for (const r of results) {
    let parentName = r.suggested_parent_category?.trim() || undefined;
    const childName = r.suggested_category;

    if (parentName) {
      const existingParent = existingByName.get(parentName);
      const parentIsValidRoot = existingParent ? !existingParent.parentId : true;
      if (!parentIsValidRoot || parentName === childName) {
        parentName = undefined;
      }
    }

    if (parentName) {
      if (!existingByName.has(parentName) && !seenNew.has(parentName)) {
        newRoots.push(parentName);
        seenNew.add(parentName);
      }
      if (!existingByName.has(childName) && !seenNew.has(childName)) {
        newChildren.push({ name: childName, parentName });
        seenNew.add(childName);
      }
    } else if (!existingByName.has(childName) && !seenNew.has(childName)) {
      newRoots.push(childName);
      seenNew.add(childName);
    }

    for (const tag of r.suggested_tags) {
      if (!existingTagNames.has(tag)) newTagNames.add(tag);
    }
  }

  let colorIndex = currentCategories.length;
  const justCreatedByName = new Map<string, Category>();

  for (const name of newRoots) {
    const created = await addCategory(
      name,
      CATEGORY_COLORS[colorIndex % CATEGORY_COLORS.length],
      undefined,
    );
    justCreatedByName.set(created.name, created);
    colorIndex++;
  }

  for (const { name, parentName } of newChildren) {
    const parent = justCreatedByName.get(parentName) ?? existingByName.get(parentName);
    if (!parent) continue;
    const created = await addCategory(
      name,
      CATEGORY_COLORS[colorIndex % CATEGORY_COLORS.length],
      parent.id,
    );
    justCreatedByName.set(created.name, created);
    colorIndex++;
  }

  for (const t of newTagNames) {
    await addTag(t);
  }

  const idByName = new Map<string, string>();
  for (const c of currentCategories) idByName.set(c.name, c.id);
  for (const [name, c] of justCreatedByName) idByName.set(name, c.id);
  return idByName;
}
