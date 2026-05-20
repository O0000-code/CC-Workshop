import type { LucideIcon } from 'lucide-react';
import { Tooltip } from './Tooltip';

export type CornerBadgeTone = 'accent' | 'warning' | 'success' | 'neutral';

export interface CornerBadgeProps {
  icon: LucideIcon;
  tone: CornerBadgeTone;
  tooltip: string;
}

const TONE_BG: Record<CornerBadgeTone, string> = {
  accent: 'bg-[var(--color-accent)]',
  warning: 'bg-[var(--color-warning)]',
  success: 'bg-[var(--color-success)]',
  neutral: 'bg-[var(--color-tertiary)]',
};

/**
 * 16x16 corner badge anchored at the top-right of a relatively-positioned
 * icon container. Visual spec is locked by `design-language.md` L33-35
 * (token-only colors) and `05_plugin_badge_reuse.md` (16x16 / right:-4 top:-4
 * / 2px white border / rounded-lg / 8x8 inner icon).
 *
 * The wrapping `<span>` is the Tooltip's trigger child — Tooltip uses
 * `React.cloneElement` and expects a single React element it can attach a
 * ref + mouse handlers to.
 */
export function CornerBadge({ icon: IconComponent, tone, tooltip }: CornerBadgeProps) {
  return (
    <Tooltip content={tooltip}>
      <span
        className={`absolute w-4 h-4 rounded-lg border-2 border-white flex items-center justify-center ${TONE_BG[tone]}`}
        style={{ right: '-4px', top: '-4px' }}
      >
        <IconComponent className="w-2 h-2 text-white" />
      </span>
    </Tooltip>
  );
}

export default CornerBadge;
