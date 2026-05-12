import { Input } from '@/components/common/Input';
import type { EnvVarSpec } from '@/types/marketplace';

/**
 * Reusable input form for MCP detail-panel inputs that share the
 * `EnvVarSpec` shape: stdio env vars, HTTP URL template variables, and
 * HTTP headers. All three render identically (label + input +
 * description + optional "Where to find" link); only the surrounding
 * section heading differs.
 *
 * Minimalism: no outer container border (the input border already
 * separates entries visually); `gap-4` stacking; the `SECRET` label is
 * suppressed in favour of the `type=password` mask which is itself the
 * visual signal.
 */
export interface EnvVarInputPanelProps {
  specs: EnvVarSpec[];
  values: Record<string, string>;
  /** Persisted values from the live MCP `.json` config — surfaced as a
   *  read-from baseline when the user hasn't typed anything yet. */
  persistedValues?: Record<string, string>;
  /** When true and a value is empty/whitespace, the input shows the
   *  "Required" error decoration. Owners flip this at submit time. */
  showValidation: boolean;
  onChange: (name: string, value: string) => void;
}

function isHttpUrl(value: string | undefined | null): boolean {
  if (!value) return false;
  return /^https?:\/\//i.test(value.trim());
}

export function EnvVarInputPanel({
  specs,
  values,
  persistedValues,
  showValidation,
  onChange,
}: EnvVarInputPanelProps) {
  if (specs.length === 0) return null;
  return (
    <div className="flex flex-col gap-4">
      {specs.map((spec) => {
        const persisted = persistedValues?.[spec.name];
        // Prefer user-typed → previously-persisted → upstream-default → empty.
        const value = values[spec.name] ?? persisted ?? spec.defaultValue ?? '';
        const isMissing = showValidation && (!value || value.trim().length === 0);
        const hintIsUrl = isHttpUrl(spec.whereToFind);
        const inputType = spec.isSecret ? 'password' : spec.format === 'number' ? 'number' : 'text';
        return (
          <div key={spec.name} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-xs font-medium text-[#18181B] break-all">
                {spec.name}
              </span>
              {hintIsUrl && spec.whereToFind && (
                <a
                  href={spec.whereToFind}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="whitespace-nowrap text-[11px] font-medium text-[#18181B] hover:underline"
                >
                  Where to find →
                </a>
              )}
            </div>
            <Input
              type={inputType}
              value={value}
              placeholder={spec.defaultValue ? `Default: ${spec.defaultValue}` : ''}
              onChange={(e) => onChange(spec.name, e.target.value)}
              error={isMissing ? 'Required' : undefined}
              autoComplete={spec.isSecret ? 'off' : undefined}
              spellCheck={spec.isSecret ? false : undefined}
            />
            {spec.description && (
              <span className="text-[11px] font-normal leading-relaxed text-[#71717A]">
                {spec.description}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default EnvVarInputPanel;
