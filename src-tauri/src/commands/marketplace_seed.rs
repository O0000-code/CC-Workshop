//! Marketplace MCP seed list (D-Imp-1 extension).
//!
//! V2 (Phase I 2026-05-10): the **Skill seed is gone**. The Skill marketplace
//! now reads directly from skills.sh's internal pagination API (91k items,
//! real fuzzy/semantic search) — no curated seed is needed. See
//! `commands/marketplace.rs::list_marketplace_skills`.
//!
//! What remains: well-known MCP servers (Filesystem, GitHub, Playwright, …)
//! that the Official MCP Registry does not list. Each entry has been
//! **verified to exist** via `curl https://registry.npmjs.org/<package>` —
//! never trust agent-hallucinated names. When adding a new entry, paste
//! the verification command into the comment so the check is reproducible.

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
