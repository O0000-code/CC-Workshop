import type React from 'react';

/**
 * Returns true when the key event is a real Enter commit (not an IME
 * composition end).
 *
 * Chinese / Japanese / Korean input methods route candidate-selection
 * through Enter while composition is still active. Treating that Enter
 * as a form-submit creates a class of bugs where CJK users get
 * accidental commits with the raw romanization (e.g. "fenlei" becoming
 * a category name before the user could pick "分类").
 *
 * Detection:
 *   - `event.isComposing` — supported by all modern browsers
 *     (https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/isComposing)
 *   - `event.keyCode === 229` — Safari / older WebKit edge cases
 *     where `isComposing` is not yet set for the synthetic Enter
 *
 * Use everywhere a text-input `onKeyDown` would otherwise read
 * `e.key === 'Enter'` to commit a value.
 */
export function isEnterCommit(e: React.KeyboardEvent | KeyboardEvent): boolean {
  if (e.key !== 'Enter') return false;
  const native = 'nativeEvent' in e ? e.nativeEvent : e;
  if ((native as KeyboardEvent).isComposing) return false;
  if ((native as KeyboardEvent).keyCode === 229) return false;
  return true;
}
