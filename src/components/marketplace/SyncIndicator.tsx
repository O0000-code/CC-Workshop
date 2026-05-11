import { CloudDownload, CloudOff } from 'lucide-react';

interface SyncIndicatorProps {
  /** True while a fetch is in flight — foreground or background SWR. The
   *  visual is the same in both cases (pulsing cloud), only the underlying
   *  intent differs and the caller decides which slice drives this. */
  isSyncing: boolean;
  /** Last sync attempt failed. Switches the icon to `CloudOff`. */
  hasError: boolean;
  /** ISO timestamp of the last successful sync; informs the tooltip text. */
  lastSyncedAt: string | null;
  /** User-initiated refresh. Should call the relevant `load*` action with
   *  `mode: 'force'` so the SWR cache is bypassed. */
  onClick: () => void;
}

/**
 * Status-line trailing icon for the marketplace pages. Reflects the SWR
 * sync lifecycle:
 *   - idle / fresh   → static `CloudDownload`, grey
 *   - syncing        → `CloudDownload` + `animate-pulse`
 *   - error          → `CloudOff`, grey (click to retry; tooltip explains)
 *
 * Clicking always triggers a force-refresh (cache-bypass). Lives in
 * `components/marketplace/` because it is shared by both Skill and MCP
 * marketplace pages.
 */
export function SyncIndicator({ isSyncing, hasError, lastSyncedAt, onClick }: SyncIndicatorProps) {
  const title = (() => {
    if (hasError) return 'Sync failed — click to retry';
    if (isSyncing) return 'Syncing...';
    if (lastSyncedAt) {
      return `Last synced ${formatRelativeTime(lastSyncedAt)} — click to refresh`;
    }
    return 'Click to sync';
  })();
  const Icon = hasError ? CloudOff : CloudDownload;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={isSyncing}
      className={`
        flex items-center justify-center rounded-md p-1
        text-[#A1A1AA] transition-colors
        hover:text-[#52525B] hover:bg-[#F4F4F5]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[#18181B]
        disabled:cursor-not-allowed disabled:opacity-70
      `}
    >
      <Icon className={`h-3.5 w-3.5 ${isSyncing ? 'animate-pulse' : ''}`} />
    </button>
  );
}

/** Compact relative-time formatter for the tooltip. Doesn't try to be
 *  internationalised (the rest of the app is English-only). */
function formatRelativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'just now';
  const diffMs = Date.now() - t;
  if (diffMs < 30_000) return 'just now';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(diffMs / 86_400_000);
  return `${days}d ago`;
}

export default SyncIndicator;
