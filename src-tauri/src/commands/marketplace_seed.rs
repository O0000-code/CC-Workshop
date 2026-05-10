//! Marketplace Skill + MCP seed lists (D-Imp-1 / spec §1.1.1).
//!
//! V1 ships with curated seeds for both Skill and MCP marketplaces.
//! Each entry has been **verified to exist** by scraping
//! `https://github.com/<owner>/<repo>/tree/<branch>/<path>` HTML or the
//! npm registry — never trust agent-hallucinated names. When adding a
//! new entry, paste the verification command into the comment so the
//! check is reproducible.
//!
//! ## Why so few entries?
//!
//! Unauthenticated GitHub API allows only 60 req/h. Each Skill seed
//! entry costs ~2 requests (repo metadata + SKILL.md), so the list
//! is intentionally capped at ~10. V1.5 will add Personal Access
//! Token support (5000 req/h) and a much larger seed.

// ============================================================================
// Skill seed
// ============================================================================

#[derive(Debug, Clone, Copy)]
pub struct SeedSkill {
    pub owner: &'static str,
    pub repo: &'static str,
    /// Path within the repository to the skill directory containing
    /// `SKILL.md`. `""` means the repository root is itself a skill.
    pub skill_path: &'static str,
    /// Logical id `"{owner}/{repo}/{name}"`. Used for SSoT dedup with
    /// scrape results.
    pub upstream_id: &'static str,
}

/// Curated Skill baseline. **All paths verified 2026-05-09** by
/// scraping `https://github.com/<owner>/<repo>/tree/main/<path>`.
///
/// 5 obra/superpowers + 5 anthropics/skills = 10 entries.
pub const SKILL_SEED: &[SeedSkill] = &[
    // ── obra/superpowers (community curated; verified via
    //    https://github.com/obra/superpowers/tree/main/skills) ──
    SeedSkill {
        owner: "obra",
        repo: "superpowers",
        skill_path: "skills/test-driven-development",
        upstream_id: "obra/superpowers/test-driven-development",
    },
    SeedSkill {
        owner: "obra",
        repo: "superpowers",
        skill_path: "skills/systematic-debugging",
        upstream_id: "obra/superpowers/systematic-debugging",
    },
    SeedSkill {
        owner: "obra",
        repo: "superpowers",
        skill_path: "skills/writing-plans",
        upstream_id: "obra/superpowers/writing-plans",
    },
    SeedSkill {
        owner: "obra",
        repo: "superpowers",
        skill_path: "skills/brainstorming",
        upstream_id: "obra/superpowers/brainstorming",
    },
    SeedSkill {
        owner: "obra",
        repo: "superpowers",
        skill_path: "skills/writing-skills",
        upstream_id: "obra/superpowers/writing-skills",
    },
    // ── anthropics/skills (Anthropic official examples; verified via
    //    https://github.com/anthropics/skills/tree/main/skills) ──
    // NOTE: Real path is `skills/<name>` (not `<name>` at repo root).
    // The previous seed list had this prefix wrong, causing 404 on
    // every fetch. Path verified 2026-05-09.
    SeedSkill {
        owner: "anthropics",
        repo: "skills",
        skill_path: "skills/skill-creator",
        upstream_id: "anthropics/skills/skill-creator",
    },
    SeedSkill {
        owner: "anthropics",
        repo: "skills",
        skill_path: "skills/mcp-builder",
        upstream_id: "anthropics/skills/mcp-builder",
    },
    SeedSkill {
        owner: "anthropics",
        repo: "skills",
        skill_path: "skills/webapp-testing",
        upstream_id: "anthropics/skills/webapp-testing",
    },
    SeedSkill {
        owner: "anthropics",
        repo: "skills",
        skill_path: "skills/pdf",
        upstream_id: "anthropics/skills/pdf",
    },
    SeedSkill {
        owner: "anthropics",
        repo: "skills",
        skill_path: "skills/canvas-design",
        upstream_id: "anthropics/skills/canvas-design",
    },
];

// ============================================================================
// MCP seed (D-Imp-1 extension; well-known MCP servers users expect)
// ============================================================================

#[derive(Debug, Clone, Copy)]
pub struct SeedMcp {
    /// Display name (no reverse-DNS prefix). Shown in the Marketplace
    /// list. Examples: "filesystem", "playwright", "puppeteer".
    pub display_name: &'static str,
    /// Stable id used for SSoT dedup. Conventionally `"npm:{package}"`
    /// for npm-package MCP servers, or `"git:{owner}/{repo}"` for
    /// repository-based servers.
    pub id: &'static str,
    pub description: &'static str,
    /// Stdio command (typically `npx`).
    pub command: &'static str,
    /// Args (typically `["-y", "@scope/name"]`).
    pub args: &'static [&'static str],
    /// Repository URL for "Source" detail row.
    pub repository_url: &'static str,
    /// Required env-var names + helper hints. Empty `&[]` if none.
    pub env_vars: &'static [(&'static str, &'static str)],
}

/// Curated MCP baseline. **All packages verified 2026-05-09** via
/// `curl https://registry.npmjs.org/<package>` (HTTP 200).
///
/// The Official MCP Registry has only ~30 entries that are mostly
/// long-tail; users expect to see Filesystem / GitHub / Playwright
/// at first paint. This seed merges with Registry results in
/// `fetch_mcp_registry` so the user gets both.
pub const MCP_SEED: &[SeedMcp] = &[
    SeedMcp {
        display_name: "filesystem",
        id: "npm:@modelcontextprotocol/server-filesystem",
        description: "Read, write, and search files in allowed directories.",
        command: "npx",
        args: &["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/directory"],
        repository_url: "https://github.com/modelcontextprotocol/servers",
        env_vars: &[],
    },
    SeedMcp {
        display_name: "github",
        id: "npm:@modelcontextprotocol/server-github",
        description: "GitHub API integration — repos, issues, PRs, code search.",
        command: "npx",
        args: &["-y", "@modelcontextprotocol/server-github"],
        repository_url: "https://github.com/modelcontextprotocol/servers",
        env_vars: &[(
            "GITHUB_PERSONAL_ACCESS_TOKEN",
            "Create a token at https://github.com/settings/tokens (repo + read:org scopes).",
        )],
    },
    SeedMcp {
        display_name: "memory",
        id: "npm:@modelcontextprotocol/server-memory",
        description: "Knowledge graph–based persistent memory across sessions.",
        command: "npx",
        args: &["-y", "@modelcontextprotocol/server-memory"],
        repository_url: "https://github.com/modelcontextprotocol/servers",
        env_vars: &[],
    },
    SeedMcp {
        display_name: "puppeteer",
        id: "npm:@modelcontextprotocol/server-puppeteer",
        description: "Browser automation via Puppeteer — navigate, screenshot, scrape.",
        command: "npx",
        args: &["-y", "@modelcontextprotocol/server-puppeteer"],
        repository_url: "https://github.com/modelcontextprotocol/servers",
        env_vars: &[],
    },
    SeedMcp {
        display_name: "everything",
        id: "npm:@modelcontextprotocol/server-everything",
        description: "Reference MCP server demonstrating prompts, resources, and tools.",
        command: "npx",
        args: &["-y", "@modelcontextprotocol/server-everything"],
        repository_url: "https://github.com/modelcontextprotocol/servers",
        env_vars: &[],
    },
    SeedMcp {
        display_name: "sequential-thinking",
        id: "npm:@modelcontextprotocol/server-sequential-thinking",
        description: "Step-by-step reasoning helper for complex multi-step problems.",
        command: "npx",
        args: &["-y", "@modelcontextprotocol/server-sequential-thinking"],
        repository_url: "https://github.com/modelcontextprotocol/servers",
        env_vars: &[],
    },
    SeedMcp {
        display_name: "playwright",
        id: "npm:@playwright/mcp",
        description: "Microsoft Playwright — modern browser automation across Chromium, WebKit, Firefox.",
        command: "npx",
        args: &["-y", "@playwright/mcp"],
        repository_url: "https://github.com/microsoft/playwright-mcp",
        env_vars: &[],
    },
    SeedMcp {
        display_name: "sentry",
        id: "npm:@sentry/mcp-server",
        description: "Sentry — query issues, performance, and releases for your projects.",
        command: "npx",
        args: &["-y", "@sentry/mcp-server"],
        repository_url: "https://github.com/getsentry/sentry-mcp",
        env_vars: &[(
            "SENTRY_AUTH_TOKEN",
            "Create at https://sentry.io/settings/account/api/auth-tokens/.",
        )],
    },
    SeedMcp {
        display_name: "context7",
        id: "npm:@upstash/context7-mcp",
        description: "Up-to-date documentation for any library, framework, SDK, or API.",
        command: "npx",
        args: &["-y", "@upstash/context7-mcp"],
        repository_url: "https://github.com/upstash/context7",
        env_vars: &[],
    },
    SeedMcp {
        display_name: "firecrawl",
        id: "npm:mcp-server-firecrawl",
        description: "Web scraping & crawling via the Firecrawl API — extract structured data.",
        command: "npx",
        args: &["-y", "mcp-server-firecrawl"],
        repository_url: "https://github.com/mendableai/firecrawl-mcp-server",
        env_vars: &[(
            "FIRECRAWL_API_KEY",
            "Get one at https://www.firecrawl.dev/.",
        )],
    },
];
