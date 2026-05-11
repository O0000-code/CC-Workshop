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
 * the detail panel's Source / Scope row. Clicking opens the upstream location
 * in the user's default browser. Two lines:
 *   - `<owner>/<repo>` (or `<owner>/<repo>/<subPath>` for skills.sh items
 *     where the skill lives in a subfolder) — monospaced GitHub link
 *   - "from skills.sh" / "from MCP Registry" — small caption identifying the
 *     upstream catalog (D-Imp-4 source kinds; spec §9 wording).
 *
 * For skills.sh items, `source.name` carries the skill's sub-path inside the
 * repo (because `buildSourceFromSkillItem` populates `name = item.skillId`).
 * We surface that as a GitHub subtree URL (`/tree/HEAD/<subPath>`) so the
 * link points at the actual skill folder rather than the bare repo root.
 *
 * Styling follows the design language tokens already established for Source
 * row content (text-xs / text-[11px] for caption, zinc palette only). No new
 * tokens are introduced.
 */
export function MarketplaceSourceBadge({ source }: MarketplaceSourceBadgeProps) {
  if (!source) {
    return <span className="text-xs text-[#A1A1AA]">Unknown marketplace</span>;
  }

  // For skills.sh items, the `name` field carries the skill sub-path; link
  // straight to that subfolder. For MCP / unknown, link to the bare repo.
  const baseRepoUrl = `https://github.com/${source.owner}/${source.repo}`;
  const hasSubPath = source.source === 'skills_sh' && source.name && source.name.length > 0;
  const linkUrl = hasSubPath ? `${baseRepoUrl}/tree/HEAD/${source.name}` : baseRepoUrl;
  const displayText = hasSubPath
    ? `${source.owner}/${source.repo}/${source.name}`
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
