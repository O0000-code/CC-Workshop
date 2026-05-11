import type { MarketplaceSource } from '@/types/marketplace';

interface MarketplaceSourceBadgeProps {
  /**
   * Provenance triple from `Skill.marketplaceSource` / `McpServer.marketplaceSource`.
   * Should always be present when the parent's `installSource === 'marketplace'`,
   * but accepted as optional for type-safe defensive rendering — V1 should not
   * encounter the undefined case.
   */
  source: MarketplaceSource | undefined;
}

/**
 * Renders the upstream origin for a marketplace-installed Skill or MCP inside
 * the detail panel's Source row. Clicking opens the GitHub folder where the
 * resource actually lives. Two lines:
 *   - `<owner>/<repo>` for MCPs (and legacy skill installs predating
 *     `repoSubpath`), or `<owner>/<repo>/<last-path-segment>` for skills
 *     whose `repoSubpath` was captured at install time — monospaced
 *     GitHub link.
 *   - "From GitHub" — small caption.
 *
 * URL construction uses `source.repoSubpath` (captured by the codeload
 * install helper from the tarball's actual layout) rather than
 * `source.name` (which is the display name from the upstream catalog,
 * not a path inside the repo — using `name` produces 404s for skills
 * whose display name differs from their on-disk directory).
 *
 * Styling follows the design language tokens already established for Source
 * row content (text-xs / text-[11px] for caption, zinc palette only). No new
 * tokens are introduced.
 */
export function MarketplaceSourceBadge({ source }: MarketplaceSourceBadgeProps) {
  if (!source) {
    return <span className="text-xs text-[#A1A1AA]">Unknown marketplace</span>;
  }

  const baseRepoUrl = `https://github.com/${source.owner}/${source.repo}`;
  const subPath = source.repoSubpath?.trim() ?? '';
  const hasSubPath = subPath.length > 0;

  // Show the final segment of the path for a compact display (e.g.
  // `microsoft-foundry` for `.github/plugins/azure-skills/skills/microsoft-foundry`).
  // The URL itself still uses the full path so the link is accurate.
  const lastSegment = hasSubPath ? (subPath.split('/').filter(Boolean).pop() ?? '') : '';

  const linkUrl = hasSubPath ? `${baseRepoUrl}/tree/HEAD/${subPath}` : baseRepoUrl;
  const displayText = hasSubPath
    ? `${source.owner}/${source.repo}/${lastSegment}`
    : `${source.owner}/${source.repo}`;

  return (
    <div className="flex flex-col gap-0.5">
      <a
        href={linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-xs text-[#18181B] underline decoration-[#18181B] underline-offset-[3px] transition-[font-weight] hover:font-medium"
      >
        {displayText}
      </a>
      <span className="text-[11px] text-[#A1A1AA]">From GitHub</span>
    </div>
  );
}

export default MarketplaceSourceBadge;
