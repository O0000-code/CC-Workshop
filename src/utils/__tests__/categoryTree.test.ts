import { describe, it, expect } from 'vitest';
import type { Category } from '@/types';
import {
  collectDescendantIds,
  isAncestorOf,
  findRootOf,
  getCategoryDisplayName,
  getCategoryColor,
} from '../categoryTree';

// Helper builds a Category that may carry an optional `parentId`. The cast
// keeps these tests compiling whether or not T2a has merged the field onto
// the shared `Category` interface.
function cat(id: string, parentId?: string, name = id, color = '#000000'): Category {
  const base = { id, name, color, count: 0 };
  if (parentId !== undefined) {
    return { ...base, parentId } as Category;
  }
  return base as Category;
}

describe('collectDescendantIds', () => {
  it('returns a set containing only the id when the category list is empty', () => {
    const result = collectDescendantIds('root', []);
    expect(result).toEqual(new Set(['root']));
  });

  it('returns a set containing only the id when the category has no children', () => {
    const cats = [cat('root'), cat('other')];
    const result = collectDescendantIds('root', cats);
    expect(result).toEqual(new Set(['root']));
  });

  it('collects direct children one level down', () => {
    const cats = [cat('root'), cat('childA', 'root'), cat('childB', 'root'), cat('unrelated')];
    const result = collectDescendantIds('root', cats);
    expect(result).toEqual(new Set(['root', 'childA', 'childB']));
  });

  it('collects descendants two levels down (depth-agnostic, even though backend caps at 2)', () => {
    // Defensive: even though MAX_DEPTH=2 is a hard cap, the helper should not
    // miss grandchildren if a malformed payload leaks through.
    const cats = [cat('root'), cat('child', 'root'), cat('grand', 'child'), cat('unrelated')];
    const result = collectDescendantIds('root', cats);
    expect(result).toEqual(new Set(['root', 'child', 'grand']));
  });

  it('returns a singleton set when the id does not exist in the list', () => {
    const cats = [cat('root'), cat('other')];
    const result = collectDescendantIds('missing', cats);
    expect(result).toEqual(new Set(['missing']));
  });

  it('does not infinite-loop when a cycle exists in parentId chain', () => {
    // a → b → a (cycle); collectDescendantIds('a', ...) must terminate.
    const cats = [cat('a', 'b'), cat('b', 'a'), cat('c')];
    const result = collectDescendantIds('a', cats);
    // 'a' is starting point; 'b' has parentId='a' so it's a child of a; 'a'
    // also has parentId='b' but visited guard prevents re-adding.
    expect(result).toContain('a');
    expect(result).toContain('b');
    expect(result.size).toBeLessThanOrEqual(3);
  });

  it('only returns the root id when descendants set has no qualifying children', () => {
    // Sibling categories sharing no parent relation with the queried root.
    const cats = [cat('root'), cat('sibling'), cat('orphan', 'gone')];
    const result = collectDescendantIds('root', cats);
    expect(result).toEqual(new Set(['root']));
  });
});

describe('isAncestorOf', () => {
  it('returns true when ancestor and descendant are the same id (reflexive)', () => {
    const cats = [cat('a')];
    expect(isAncestorOf('a', 'a', cats)).toBe(true);
  });

  it('returns true when the ancestor is the direct parent', () => {
    const cats = [cat('parent'), cat('child', 'parent')];
    expect(isAncestorOf('parent', 'child', cats)).toBe(true);
  });

  it('returns true for a transitive (grandparent) ancestor', () => {
    const cats = [cat('grand'), cat('parent', 'grand'), cat('child', 'parent')];
    expect(isAncestorOf('grand', 'child', cats)).toBe(true);
  });

  it('returns false when there is no ancestry relationship', () => {
    const cats = [cat('a'), cat('b'), cat('c', 'b')];
    expect(isAncestorOf('a', 'c', cats)).toBe(false);
  });

  it('returns false when the descendant id is not in the list', () => {
    const cats = [cat('a'), cat('b', 'a')];
    expect(isAncestorOf('a', 'missing', cats)).toBe(false);
  });

  it('returns false when querying with empty category list', () => {
    expect(isAncestorOf('a', 'b', [])).toBe(false);
  });

  it('does not infinite-loop on a parentId cycle', () => {
    // a → b → a cycle; isAncestorOf('z', 'a') must terminate without crashing.
    const cats = [cat('a', 'b'), cat('b', 'a')];
    const result = isAncestorOf('z', 'a', cats);
    expect(result).toBe(false);
  });
});

describe('findRootOf', () => {
  it('returns the category itself when it has no parent', () => {
    const cats = [cat('root'), cat('other')];
    const result = findRootOf('root', cats);
    expect(result?.id).toBe('root');
  });

  it('returns the root ancestor for a direct child', () => {
    const cats = [cat('root'), cat('child', 'root')];
    const result = findRootOf('child', cats);
    expect(result?.id).toBe('root');
  });

  it('returns the root ancestor for a grandchild (transitive walk)', () => {
    const cats = [cat('root'), cat('mid', 'root'), cat('leaf', 'mid')];
    const result = findRootOf('leaf', cats);
    expect(result?.id).toBe('root');
  });

  it('returns the orphan itself when its parentId points to a missing node', () => {
    const cats = [cat('orphan', 'gone'), cat('other')];
    const result = findRootOf('orphan', cats);
    expect(result?.id).toBe('orphan');
  });

  it('returns undefined when the id does not exist in the list', () => {
    const cats = [cat('a'), cat('b')];
    expect(findRootOf('missing', cats)).toBeUndefined();
  });

  it('returns undefined when the category list is empty', () => {
    expect(findRootOf('anything', [])).toBeUndefined();
  });

  it('does not infinite-loop when a cycle exists in parentId chain', () => {
    // a → b → a cycle. Any answer is acceptable as long as it terminates and
    // returns a node from the cycle.
    const cats = [cat('a', 'b'), cat('b', 'a')];
    const result = findRootOf('a', cats);
    expect(result).toBeDefined();
    expect(['a', 'b']).toContain(result?.id);
  });
});

describe('getCategoryDisplayName', () => {
  it('returns the resolved category name when categoryId matches', () => {
    const cats = [cat('id-1', undefined, 'Web')];
    expect(getCategoryDisplayName('id-1', 'StaleWeb', cats)).toBe('Web');
  });

  it('falls back to the cached name when categoryId is undefined', () => {
    const cats = [cat('id-1', undefined, 'Web')];
    expect(getCategoryDisplayName(undefined, 'LegacyWeb', cats)).toBe('LegacyWeb');
  });

  it('falls back to the cached name when categoryId is dangling', () => {
    const cats = [cat('id-1', undefined, 'Web')];
    expect(getCategoryDisplayName('deleted-id', 'CachedWeb', cats)).toBe('CachedWeb');
  });

  it('returns empty string when both inputs are undefined', () => {
    expect(getCategoryDisplayName(undefined, undefined, [])).toBe('');
  });

  it('returns empty string when categoryId is empty and fallback is undefined', () => {
    // Empty string is treated as "no id" — caller passes '' for "Uncategorized".
    expect(getCategoryDisplayName('', undefined, [cat('id-1')])).toBe('');
  });

  it('handles a dual-tracked entry where rename has happened in the SoT', () => {
    // SoT renamed Web → WebDev; cached `category` still shows Web.
    // categoryId resolution should win, so display tracks the rename.
    const cats = [cat('id-1', undefined, 'WebDev')];
    expect(getCategoryDisplayName('id-1', 'Web', cats)).toBe('WebDev');
  });
});

describe('getCategoryColor', () => {
  it('returns the resolved color when categoryId matches', () => {
    const cats = [cat('id-1', undefined, 'Web', '#3B82F6')];
    expect(getCategoryColor('id-1', 'Web', cats)).toBe('#3B82F6');
  });

  it('falls back to a name match when categoryId is undefined', () => {
    const cats = [cat('id-1', undefined, 'Web', '#3B82F6')];
    expect(getCategoryColor(undefined, 'Web', cats)).toBe('#3B82F6');
  });

  it('falls back to name match when categoryId is dangling', () => {
    const cats = [cat('id-1', undefined, 'Web', '#3B82F6')];
    expect(getCategoryColor('gone', 'Web', cats)).toBe('#3B82F6');
  });

  it('returns undefined when nothing resolves', () => {
    expect(getCategoryColor(undefined, undefined, [])).toBeUndefined();
  });

  it('returns undefined when both id and name miss', () => {
    const cats = [cat('id-1', undefined, 'Web', '#3B82F6')];
    expect(getCategoryColor('missing', 'NotFound', cats)).toBeUndefined();
  });
});
