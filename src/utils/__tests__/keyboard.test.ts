import { describe, it, expect } from 'vitest';
import { isEnterCommit } from '../keyboard';

// Helpers --------------------------------------------------------------------
// React.KeyboardEvent wraps a native KeyboardEvent under `nativeEvent`.
// The helper handles both shapes (it's also called from raw DOM listeners
// in a few places), so the test covers both.

interface FakeReactKeyEvent {
  key: string;
  nativeEvent: {
    isComposing?: boolean;
    keyCode?: number;
  };
}

function reactEvent(
  key: string,
  isComposing = false,
  keyCode: number | undefined = undefined,
): FakeReactKeyEvent {
  return {
    key,
    nativeEvent: { isComposing, keyCode },
  };
}

function nativeEvent(
  key: string,
  isComposing = false,
  keyCode: number | undefined = undefined,
): Partial<KeyboardEvent> {
  return { key, isComposing, keyCode } as Partial<KeyboardEvent>;
}

// Tests ----------------------------------------------------------------------

describe('isEnterCommit', () => {
  it('returns true for a plain Enter press on a React event', () => {
    expect(isEnterCommit(reactEvent('Enter') as unknown as React.KeyboardEvent)).toBe(true);
  });

  it('returns true for a plain Enter press on a native event', () => {
    expect(isEnterCommit(nativeEvent('Enter') as KeyboardEvent)).toBe(true);
  });

  it('returns false when isComposing is true (modern IME path)', () => {
    expect(isEnterCommit(reactEvent('Enter', true) as unknown as React.KeyboardEvent)).toBe(false);
  });

  it('returns false when keyCode is 229 (Safari / legacy IME path)', () => {
    expect(isEnterCommit(reactEvent('Enter', false, 229) as unknown as React.KeyboardEvent)).toBe(
      false,
    );
  });

  it('returns false for non-Enter keys regardless of composition state', () => {
    expect(isEnterCommit(reactEvent('a') as unknown as React.KeyboardEvent)).toBe(false);
    expect(isEnterCommit(reactEvent('Tab') as unknown as React.KeyboardEvent)).toBe(false);
    expect(isEnterCommit(reactEvent('Escape') as unknown as React.KeyboardEvent)).toBe(false);
    expect(isEnterCommit(reactEvent('a', true) as unknown as React.KeyboardEvent)).toBe(false);
  });

  it('handles a native event with no isComposing field (treats undefined as not composing)', () => {
    expect(
      isEnterCommit(nativeEvent('Enter', undefined as unknown as boolean) as KeyboardEvent),
    ).toBe(true);
  });
});
