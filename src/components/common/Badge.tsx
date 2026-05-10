import { ReactNode } from 'react';

export interface BadgeProps {
  /** Badge variant type */
  variant: 'status' | 'count' | 'category' | 'tag' | 'neutral';
  /** Badge content */
  children: ReactNode;
  /** Dot color for category badge, or status dot color */
  color?: string;
  /** Show dot indicator (default: false for category, true for status with color) */
  showDot?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Badge component for displaying status, counts, categories, and tags.
 *
 * Variants:
 * - status: Green badge for enabled/active states (bg: #DCFCE7, text: #16A34A) —
 *   reserved for transient async/AI success feedback (e.g. classify-success-bloom).
 *   For persistent state badges, use `neutral` instead (Phase F P0-1 / E2-1).
 * - count: Gray badge for counts/numbers (bg: #F4F4F5, text: #71717A)
 * - category: Gray badge for categories (bg: #F4F4F5, text: #52525B)
 * - tag: Light gray badge with border for tags (bg: #FAFAFA, border: #E5E5E5)
 * - neutral: Zinc-grey badge for persistent state markers / type tags (bg: #F4F4F5,
 *   text: #52525B). Mirrors the `category` variant geometry but with a wider gap
 *   (`gap-1`) and no dot/swatch reservation — used for "Installed" / "stdio" / "HTTP"
 *   badges where the design language requires a non-success neutral surface.
 */
export function Badge({ variant, children, color, showDot, className = '' }: BadgeProps) {
  // Base styles for all badges
  const baseStyles = 'inline-flex items-center font-medium font-inter';

  // Variant-specific styles
  const variantStyles = {
    status: 'bg-[#DCFCE7] text-[#16A34A] px-2 py-1 rounded gap-1 text-[11px] leading-none',
    count: 'bg-[#F4F4F5] text-[#71717A] px-2 py-0.5 rounded-[10px] text-[11px] leading-none',
    category:
      'bg-[#F4F4F5] text-[#52525B] px-2 py-[3px] rounded-[3px] gap-1.5 text-[11px] leading-none',
    tag: 'bg-[#FAFAFA] text-[#71717A] border border-[#E5E5E5] px-2 py-[3px] rounded-[3px] text-[11px] leading-none font-medium',
    neutral: 'bg-[#F4F4F5] text-[#52525B] px-2 py-1 rounded gap-1 text-[11px] leading-none',
  };

  // Determine if dot should be shown
  const shouldShowDot =
    showDot !== undefined ? showDot : variant === 'status' || (variant === 'category' && color);

  // Dot styles based on variant
  const getDotStyles = () => {
    if (variant === 'status') {
      return 'w-1.5 h-1.5 rounded-full bg-[#16A34A]';
    }
    if (variant === 'category' && color) {
      return 'w-1.5 h-1.5 rounded-full';
    }
    return '';
  };

  return (
    <span className={`${baseStyles} ${variantStyles[variant]} ${className}`}>
      {shouldShowDot && (
        <span
          className={getDotStyles()}
          style={variant === 'category' && color ? { backgroundColor: color } : undefined}
        />
      )}
      {children}
    </span>
  );
}

export default Badge;
