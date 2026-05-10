# Validate "No Public API" Claims via the Browser Network Panel

When research, planning, or design work concludes that an upstream service "has no public API" / "must be accessed via web scraping" / "requires authentication for any access", that conclusion is acceptable only if the upstream's website has been opened in a real browser and its network panel inspected for fetch / XHR / RSC traffic. A "no API" conclusion derived purely from documentation reading is incomplete research, not a usable result.

## Why

Textual research surfaces (READMEs, awesome-lists, docs pages, search-engine results) are structurally blind to **undocumented internal endpoints** the site's frontend uses to render itself. These endpoints are routinely usable by downstream tools — they bypass auth requirements that the documented API enforces, and they typically remain stable for months because the upstream depends on them too — but they are invisible without opening the browser network panel. The cost of believing a wrong "no API" claim is paid by every downstream design choice that has to work around the missing endpoint.

## How to apply

**Trigger** — research or planning is about to conclude any of:
- "Upstream X has no public API"
- "Upstream X requires an API key for any access"
- "We must scrape upstream X's HTML"
- "Upstream X only ships data through an undocumented stream"

**Required investigation, in order**:

1. **Open the upstream site** in a real browser (`chrome-devtools` MCP, Playwright, dev-tools manually). Curl-fetching the home page is not enough.
2. **Exercise the relevant feature surfaces** — scroll past the first viewport, type in the search box, switch tabs/categories, click pagination. Each interaction may surface a new endpoint.
3. **Read the network panel.** List every request whose URL contains `/api/`, `/v1/`, `/graphql`, `/rsc/`, or any internal-looking pattern. Note method, response shape, and the headers the browser sent.
4. **For each candidate endpoint**, attempt to reproduce the call in `curl` with the full browser header bundle:
   ```
   -H 'User-Agent: Mozilla/5.0 (...)'
   -H 'Accept: application/json'
   -H 'Origin: https://upstream.example/'
   -H 'Referer: https://upstream.example/'
   -H 'Sec-Fetch-Mode: cors'
   --compressed
   ```
   Do not omit any of these. `Origin`/`Referer` are the most common gatekeepers; `Sec-Fetch-Mode` distinguishes a real browser from a scraper; `--compressed` matters because some endpoints respond only with brotli/gzip with no plain-text fallback.
5. **For each working endpoint**, document URL pattern, required header subset, response schema, and stability assessment.
6. **Only after this investigation** is "no public API" / "must scrape HTML" an acceptable conclusion. Even then, qualify it: "no _documented_ public API; an unauth `<path>` endpoint is observable but undocumented; we depend on it explicitly with a fallback."

**Tooling** — `chrome-devtools` MCP provides everything needed:

- `mcp__chrome-devtools__new_page` — open the upstream URL
- `mcp__chrome-devtools__list_network_requests` — enumerate fetch/XHR
- `mcp__chrome-devtools__evaluate_script` — `window.scrollTo(0, document.body.scrollHeight)` to trigger lazy-load
- `mcp__chrome-devtools__take_snapshot` — read the DOM to find search inputs, pagination, etc.

Playwright is equivalent. A truly air-gapped session can fall back to `curl` against SSR HTML for `<a href>` extraction, but that misses dynamic endpoints — use only when no browser is available.

## Anti-patterns

- "I read the docs page and it says no public API, so we go scrape." That's the conclusion that needs verifying, not a starting point.
- "The site uses Next.js / RSC, so there is no JSON API." RSC payloads are streamable JSON-flavored data; the same data is often also available via internal `/api/...` routes.
- Trying `curl` once with no headers, getting a hang or 4xx, and concluding "the endpoint requires auth." `Origin`/`Referer`/`Sec-Fetch-Mode` failure looks identical to auth failure from the outside. Try the full header bundle before giving up.
- "Network panel showed N fetches, all are static assets." Many internal endpoints fire only on scroll / search / tab change. Exercise the surface, then re-read the panel.

## Out of scope

- Upstreams with no website (pure CLI tools, bare-metal services). The browser network panel does not apply.
- Upstreams whose ToS explicitly forbids programmatic access — apply this rule to discover the API, then weigh ToS separately.

## Sibling rules

- `validate-curated-upstream-ids.md` — identifier-existence layer; this rule is the endpoint-existence layer.
- `verify-third-party-behavior-firsthand.md` — library API behavior layer.
- `~/.claude/rules/Global Rules.md` "Investigate Before Answering" — the parent principle.
