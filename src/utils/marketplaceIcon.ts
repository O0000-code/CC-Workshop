// ============================================================================
// Marketplace item icon resolver
// ============================================================================
//
// Picks a lucide icon for a Skill / MCP marketplace item based on three
// data sources, in descending order of confidence:
//
//   Stage 0 (skills only) — skills.sh `/topic/<x>` reverse map (94 skills
//     curated by the upstream into 8 topics; 100% accurate when present).
//   Stage 1 — Brand exact match: `\b<brand>\b` regex against
//     `name + source` (skill) or `name + description` (mcp).
//   Stage 2 — Domain keyword whitelist (narrow, no ambiguous words).
//   Stage 3 — Default fallback: Sparkles (skill) / Plug (mcp).
//
// "Red line": no false positives. Anything not matched falls through to the
// default — a familiar generic icon is preferable to an incorrectly-themed
// one. Patterns must be unambiguous; the Stage 2 whitelist deliberately
// excludes generic verbs like `api` / `search` / `tool` / `service`.
//
// All patterns are lowercase + word-boundary. Hyphens in source slugs are
// pre-replaced with spaces so `\b` boundaries land naturally on tokens
// (e.g. `microsoft-foundry` → `microsoft foundry`, matched by `\bazure\b`
// only via the source `microsoft/azure-skills` after the same rewrite).
// ============================================================================

import { Plug, Sparkles, type LucideIcon } from 'lucide-react';
import { ICON_MAP } from '@/components/common/IconPicker';
import type { MarketplaceMcpItem, MarketplaceSkillItem } from '@/types/marketplace';

export type MarketplaceItemType = 'skill' | 'mcp';

/** Reverse mapping `<source>/<skillId>` → list of skills.sh topics. Populated
 *  by `loadSkillsTopicMap()` in the marketplace store; the empty object is
 *  a safe default (Stage 0 simply doesn't match anything). */
export type SkillsTopicMap = Record<string, string[]>;

// ============================================================================
// Stage 0 — skills.sh topic → icon (Skill only)
// ============================================================================

const TOPIC_TO_ICON: Record<string, string> = {
  react: 'code',
  nextjs: 'code',
  databases: 'database',
  design: 'palette',
  marketing: 'megaphone',
  mobile: 'smartphone',
  testing: 'check-circle',
  'agent-workflows': 'workflow',
};

// ============================================================================
// Stage 1 — Brand exact match (high confidence)
// ============================================================================
//
// Each entry: [pattern, icon-name]. Patterns use `\b<brand>\b` so adjacent
// hyphens / underscores / punctuation are treated as word boundaries (they
// are — `_` is a word character in JS regex, but our pre-process replaces
// `_` with space so boundaries always work).
//
// Order matters only inside a single regex's alternation — the first match
// wins across the table. Brand names that visually map to a "generic"
// lucide icon (e.g. Postgres → Database) are grouped at the top so they
// take priority over the brand-icon ones (which are rare). The actual
// priority is: this table is scanned top-to-bottom; whichever matches first
// wins.

const BRAND_PATTERNS: Array<[RegExp, string]> = [
  // === Verticals that need to win over generic-cloud / generic-monitoring
  // === domain matches further below; ordered first.
  // Ad-tech / marketing platforms (description-driven; `metrics` in their
  // descriptions otherwise misfires into "bar-chart" via Stage 2).
  [/\b(meta ads|google ads|facebook ads|tiktok ads|ad campaign)\b/, 'megaphone'],
  // E-commerce platforms
  [/\b(shopify|woocommerce|magento)\b/, 'shopping-cart'],
  // === Web frameworks (must win over `vercel` cloud match below — many
  // === Vercel-published items are Next.js / React skills first, host
  // === platform second).
  [/\b(react|nextjs|next js|vue|angular|svelte|remix)\b/, 'code'],
  // Mobile frameworks
  [/\b(android|ios|react native|flutter|swift)\b/, 'smartphone'],
  // === Databases & data stores
  [
    /\b(postgres(ql)?|mysql|mongodb|sqlite|redis|supabase|firebase|cockroach|dynamodb|bigquery)\b/,
    'database',
  ],
  // === Cloud providers (after frameworks)
  [/\b(aws|amazon web|s3|ec2|lambda)\b/, 'cloud'],
  [/\b(azure|microsoft azure)\b/, 'cloud'],
  [/\b(gcp|google cloud)\b/, 'cloud'],
  [/\bcloudflare\b/, 'cloud'],
  [/\bvercel\b/, 'cloud'],
  [/\b(netlify|render|fly\.io|heroku|railway|digitalocean)\b/, 'cloud'],
  // Containers / orchestration
  [/\b(docker|kubernetes|k8s|container)\b/, 'box'],
  // Browser automation
  [/\b(playwright|selenium|puppeteer)\b/, 'globe'],
  // === Brand icons available in lucide
  [/\bgithub\b/, 'github'],
  [/\bgitlab\b/, 'gitlab'],
  [/\bslack\b/, 'slack'],
  [/\bfigma\b/, 'figma'],
  [/\byoutube\b/, 'youtube'],
  [/\b(chrome|chromium)\b/, 'chrome'],
  [/\b(twitter|tweet|x\.com)\b/, 'twitter'],
  [/\blinkedin\b/, 'linkedin'],
  [/\bcodepen\b/, 'codepen'],
  // Productivity / collaboration
  [/\bnotion\b/, 'book-open'],
  [/\b(linear|jira|asana|trello)\b/, 'check-circle'],
  [/\b(airtable|google sheets|spreadsheet|excel)\b/, 'table'],
  // Messaging brands — `teams` deliberately omitted (matches the
  // generic noun "engineering teams" / "product teams" too often).
  [/\b(discord|telegram|whatsapp|signal)\b/, 'message-circle'],
  // Payments & finance brands
  [/\b(stripe|paypal|square)\b/, 'credit-card'],
  // Knowledge / docs brands
  [/\b(anki|flashcard)\b/, 'layers'],
  // AI / LLM providers
  [/\b(openai|chatgpt)\b/, 'sparkles'],
  // Design / vector
  [/\b(sketch|adobe|photoshop|illustrator)\b/, 'palette'],
  // Devops / CI
  [/\b(github actions|gitlab ci|circleci|jenkins|travis)\b/, 'workflow'],
];

// ============================================================================
// Stage 2 — Domain keyword whitelist (narrow, unambiguous)
// ============================================================================
//
// Only keywords whose presence in `name` or `description` reliably implies
// the icon meaning. Generic verbs (`api`, `search`, `find`, `tool`,
// `service`, `data`, `manage`) are deliberately omitted — they would
// produce false positives.

const DOMAIN_PATTERNS: Array<[RegExp, string]> = [
  // Database & data
  [/\b(database|sql|nosql)\b/, 'database'],
  // Observability & analytics
  [/\b(monitoring|metrics|observability|telemetry|analytics)\b/, 'bar-chart'],
  // Security & auth
  [/\b(security|oauth|authentication|encrypt|cryptography|password)\b/, 'lock'],
  // Image / video / audio
  [/\b(image|photo|picture|screenshot)\b/, 'image'],
  [/\b(video|streaming)\b/, 'video'],
  [/\b(audio|podcast|sound|music)\b/, 'music'],
  // Documents
  [/\b(pdf|markdown|docx|document)\b/, 'file-text'],
  // Ads / marketing (domain, distinct from skills.sh "marketing" topic)
  [/\b(advertising|ad-?(s|server|tech)|marketing-automation)\b/, 'megaphone'],
  // Workflow / automation
  [/\b(workflow|automation|pipeline|orchestrat|scheduling)\b/, 'workflow'],
  // AI / ML (only narrow LLM-flavoured words; avoid generic "ai")
  [/\b(llm|gpt-\d|finetun(e|ing)|embedding)\b/, 'sparkles'],
  // Spreadsheets / tabular
  [/\b(spreadsheet|tabular)\b/, 'table'],
  // Calendar / scheduling
  [/\b(calendar|appointment)\b/, 'calendar'],
  // Crypto / blockchain / finance
  [/\b(blockchain|crypto(currency)?|web3|defi|nft)\b/, 'coins'],
  [/\b(trading|stock-market|portfolio|finance)\b/, 'trending-up'],
  // News / content
  [/\b(news|article|newsletter|blog)\b/, 'newspaper'],
  // Maps / location
  [/\b(geolocation|location|geography)\b/, 'map-pin'],
  // Weather
  [/\b(weather|forecast|climate)\b/, 'cloud-rain'],
  // E-commerce
  [/\b(e-?commerce|shopping|product-?catalog)\b/, 'shopping-cart'],
  // Testing & QA
  [/\b(unit-?test|integration-?test|e2e-?test)\b/, 'check-circle'],
  // CI / CD / deploy
  [/\b(deployment|continuous-?(integration|deployment)|ci-?cd)\b/, 'rocket'],
  // Mail / messaging
  [/\b(email|mailbox|smtp|imap)\b/, 'mail'],
  // Game / game engine
  [/\b(game-?engine|unity|unreal-?engine)\b/, 'gamepad-2'],
  // Calendar / time tracking
  [/\b(timer|stopwatch|time-?tracking)\b/, 'timer'],
];

// ============================================================================
// Resolver
// ============================================================================

/**
 * Pick an icon for a marketplace item. Pure function — same input always
 * returns the same output, ICON_MAP lookups are stable per session.
 *
 * `topicMap` is optional and only consulted for Skill items; pass `{}` (or
 * omit) to skip Stage 0.
 */
export function getMarketplaceItemIcon(
  item: MarketplaceSkillItem | MarketplaceMcpItem,
  itemType: MarketplaceItemType,
  topicMap?: SkillsTopicMap,
): LucideIcon {
  // ---- Stage 0: Skill topic map (high confidence, skills only)
  if (itemType === 'skill' && topicMap) {
    const skill = item as MarketplaceSkillItem;
    const key = skill.source && skill.skillId ? `${skill.source}/${skill.skillId}` : null;
    if (key && topicMap[key] && topicMap[key].length > 0) {
      const topic = topicMap[key][0]; // first topic wins
      const iconName = TOPIC_TO_ICON[topic];
      if (iconName && ICON_MAP[iconName]) return ICON_MAP[iconName];
    }
  }

  // ---- Build search haystack from text fields
  const haystack = buildHaystack(item, itemType);

  // ---- Stage 1: Brand exact match
  for (const [pattern, iconName] of BRAND_PATTERNS) {
    if (pattern.test(haystack)) {
      const icon = ICON_MAP[iconName];
      if (icon) return icon;
    }
  }

  // ---- Stage 2: Domain keyword
  for (const [pattern, iconName] of DOMAIN_PATTERNS) {
    if (pattern.test(haystack)) {
      const icon = ICON_MAP[iconName];
      if (icon) return icon;
    }
  }

  // ---- Stage 3: Default
  return itemType === 'skill' ? Sparkles : Plug;
}

/** Build the lowercase text the regex tables match against. Hyphens and
 *  underscores are replaced with spaces so word boundaries fall on every
 *  token. Skill items use name + source (no description on V2); MCP items
 *  use name + description. */
function buildHaystack(
  item: MarketplaceSkillItem | MarketplaceMcpItem,
  itemType: MarketplaceItemType,
): string {
  if (itemType === 'skill') {
    const skill = item as MarketplaceSkillItem;
    const parts = [skill.name ?? '', skill.source ?? '', skill.description ?? ''];
    return parts.join(' ').toLowerCase().replace(/[-_]/g, ' ');
  }
  const mcp = item as MarketplaceMcpItem;
  const parts = [mcp.name ?? '', mcp.description ?? ''];
  return parts.join(' ').toLowerCase().replace(/[-_]/g, ' ');
}
