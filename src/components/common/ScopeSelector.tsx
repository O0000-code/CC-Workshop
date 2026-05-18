import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Loader2 } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

export type Scope = 'global' | 'project';

export interface ScopeSelectorProps {
  // Backend now derives scope from filesystem state at scan time, so the
  // value is always one of `"global" | "project"` (never `"user"` — that
  // earlier hardcoded backend value, plus the UI hack that normalised it
  // to "global", was removed when scope became derived).
  // `undefined` falls back to "project" defensively.
  value: Scope | undefined;
  onChange: (scope: Scope) => Promise<void>;
  disabled?: boolean;
  className?: string;
}

// ============================================================================
// Scope Configuration
// ============================================================================

const scopeConfig = {
  global: {
    label: 'Global',
    description: 'Available in all projects',
    dotColor: 'bg-[#8B5CF6]', // violet-500
  },
  project: {
    label: 'Project',
    description: 'Only in current project',
    dotColor: 'bg-[#71717A]', // zinc-500
  },
};

// ============================================================================
// ScopeSelector Component
// ============================================================================

/**
 * ScopeSelector component for selecting the installation scope of Skills/MCPs.
 *
 * - Global: Symlinked to ~/.claude, available in all projects
 * - Project: Managed by CC Workshop, available via Scenes
 */
export function ScopeSelector({
  value,
  onChange,
  disabled = false,
  className = '',
}: ScopeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Default to 'project' if value is undefined or unknown.
  // Backend always returns 'global' | 'project' now (derived from
  // filesystem at scan time — see commands/skills.rs::derive_skill_scope
  // and commands/mcps.rs::derive_mcp_scope).
  const normalizedValue: Scope = value === 'global' ? 'global' : 'project';

  const currentScope = scopeConfig[normalizedValue];

  // Calculate dropdown position when opening
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4, // 4px gap
        left: rect.left,
      });
    }
  }, [isOpen]);

  const handleSelect = async (scope: Scope) => {
    if (scope === normalizedValue || isUpdating) return;

    setIsUpdating(true);
    setIsOpen(false);

    try {
      await onChange(scope);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        onClick={() => !disabled && !isUpdating && setIsOpen(!isOpen)}
        disabled={disabled || isUpdating}
        className={`
          flex items-center gap-2 px-3 py-1.5 rounded-md border border-[#E5E5E5]
          transition-colors cursor-pointer
          ${disabled || isUpdating ? 'opacity-60 cursor-not-allowed' : 'hover:bg-[#FAFAFA]'}
        `}
      >
        {isUpdating ? (
          <Loader2 className="w-2 h-2 animate-spin text-[#A1A1AA]" />
        ) : (
          <div className={`w-2 h-2 rounded-full ${currentScope.dotColor}`} />
        )}
        <span className="text-[13px] font-medium text-[#18181B]">{currentScope.label}</span>
        {!disabled && !isUpdating && (
          <ChevronDown
            className={`w-3.5 h-3.5 text-[#A1A1AA] transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        )}
      </button>

      {/* Dropdown Menu - Rendered via Portal to avoid clipping */}
      {isOpen &&
        createPortal(
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-[100]" onClick={() => setIsOpen(false)} />

            {/* Menu */}
            <div
              className="fixed w-[220px] bg-white rounded-lg border border-[#E5E5E5] shadow-[0_4px_12px_rgba(0,0,0,0.06)] z-[101]"
              style={{
                top: dropdownPosition.top,
                left: dropdownPosition.left,
              }}
            >
              {(Object.keys(scopeConfig) as Scope[]).map((scope, index) => {
                const config = scopeConfig[scope];
                const isSelected = scope === normalizedValue;
                const isFirst = index === 0;
                const isLast = index === Object.keys(scopeConfig).length - 1;

                // Determine border radius based on position
                const roundedClass = isFirst ? 'rounded-t-md' : isLast ? 'rounded-b-md' : '';

                return (
                  <button
                    key={scope}
                    onClick={() => handleSelect(scope)}
                    className={`
                    w-full flex items-center gap-2.5 py-3 px-[14px] text-left
                    transition-colors cursor-pointer
                    ${roundedClass}
                    ${isSelected ? 'bg-[#F4F4F5]' : 'hover:bg-[#FAFAFA]'}
                  `}
                  >
                    {/* Dot */}
                    <div className={`w-2 h-2 rounded-full ${config.dotColor}`} />

                    {/* Info */}
                    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                      <span
                        className={`text-[13px] text-[#18181B] ${isSelected ? 'font-semibold' : 'font-medium'}`}
                      >
                        {config.label}
                      </span>
                      <span className="text-[11px] text-[#71717A]">{config.description}</span>
                    </div>

                    {/* Check icon for selected */}
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#18181B]" />}
                  </button>
                );
              })}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}

// ============================================================================
// Export
// ============================================================================

export default ScopeSelector;
