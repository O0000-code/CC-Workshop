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
 * the detail panel's Source / Scope row. Clicking opens the GitHub repository
 * in the user's default browser. Two lines:
 *   - `<owner>/<repo>` — monospaced GitHub link
 *   - "from skills.sh" / "from MCP Registry" — small caption identifying the
 *     upstream catalog (D-Imp-4 source kinds; spec §9 wording).
 *
 * Styling follows the design language tokens already established for Source
 * row content (text-xs / text-[11px] for caption, zinc palette only). No new
 * tokens are introduced.
 */
export function MarketplaceSourceBadge({ source }: MarketplaceSourceBadgeProps) {
  if (!source) {
    return <span className="text-xs text-[#A1A1AA]">Unknown marketplace</span>;
  }

  const sourceLabel = source.source === 'skills_sh' ? 'skills.sh' : 'MCP Registry';
  const repoUrl = `https://github.com/${source.owner}/${source.repo}`;

  return (
    <div className="flex flex-col gap-0.5">
      <a
        href={repoUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-xs text-[#18181B] hover:underline"
      >
        {source.owner}/{source.repo}
      </a>
      <span className="text-[11px] text-[#A1A1AA]">from {sourceLabel}</span>
    </div>
  );
}

export default MarketplaceSourceBadge;
