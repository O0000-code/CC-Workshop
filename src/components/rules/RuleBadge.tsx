// src/components/rules/RuleBadge.tsx
//
// Rule has only one badge state — "is currently global" (writes
// `~/.claude/rules/<filename>.md`). Unlike CLAUDE.md (which has a
// Global/Project/Local trichotomy), there is no project-source or local-source
// variant to badge.

import React from 'react';
import { Globe } from 'lucide-react';

/**
 * RuleBadge Props
 */
interface RuleBadgeProps {
  /** Optional className for additional styling */
  className?: string;
}

/**
 * RuleBadge Component
 *
 * A circular Globe badge marking a Rule that is currently set as global
 * (i.e. mirrored to `~/.claude/rules/<filename>.md`).
 *
 * Visual spec mirrors `ClaudeMdBadge`'s `global` variant:
 *   * Size: 16x16
 *   * Radius: 8px (full circle)
 *   * Border: 2px white
 *   * Background: #7C3AED (purple — same as CLAUDE.md global)
 *   * Icon: Globe, 8x8, white
 *
 * Render this only when `rule.isGlobal === true`; the non-global state shows
 * no badge.
 */
export const RuleBadge: React.FC<RuleBadgeProps> = ({ className = '' }) => {
  return (
    <div
      className={`
        flex
        h-4
        w-4
        items-center
        justify-center
        rounded-full
        border-2
        border-white
        ${className}
      `}
      style={{ backgroundColor: '#7C3AED' }}
    >
      <Globe className="h-2 w-2 text-white" />
    </div>
  );
};

export default RuleBadge;
