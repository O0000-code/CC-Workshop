# Usage Guide

## First-Time Setup

When you first launch Ensemble, it will:

1. Create the data directory at `~/.ensemble/`
2. Detect existing Skills from `~/.claude/skills/` and MCPs from `~/.claude.json`
3. Offer to import detected configurations into Ensemble's managed storage

We recommend importing your existing configurations to get started quickly.

## Core Concepts

### Skills

Skills are Claude Code's skill modules -- markdown files (each containing a `SKILL.md`) that provide Claude with specialized capabilities.

- **Storage**: Managed in `~/.ensemble/skills/`
- **Scope** (`global` | `project`):
  - `global` -- A symlink is created in `~/.claude/skills/` pointing to the skill in `~/.ensemble/skills/`, making it active for all Claude Code sessions.
  - `project` -- The skill is only deployed to specific projects when synced via a Scene. The symlink in `~/.claude/skills/` is removed if it existed.
- **Import Sources**:
  - **Local Skills** from `~/.claude/skills/` (detected during first-time setup or via the import dialog)
  - **Plugin-installed Skills** from Claude Code plugins (detected from plugin cache directories under `~/.claude/plugins/`)

**Managing Skills:**

1. Navigate to the **Skills** section in the sidebar.
2. Use the search bar, category filter, or tag filter to find specific skills.
3. Click on a skill to view its details (name, description, instructions, category, tags, icon, scope, usage stats).
4. Toggle the scope between `Global` and `Project` using the scope selector.
5. Edit category, tags, and icon directly in the detail panel.
6. Click "Auto Classify" to use AI to automatically assign categories, tags, and icons to all skills.
7. Use the import button to import additional skills from `~/.claude/skills/` or from installed plugins.

### MCP Servers

MCP (Model Context Protocol) Servers extend Claude Code with additional tools and data sources.

- **Storage**: Configurations stored in `~/.ensemble/mcps/` (each as a standalone JSON file)
- **Scope** (`global` | `project`):
  - `global` -- The MCP server entry is added to `~/.claude.json` under `mcpServers`, making it available to all Claude Code sessions.
  - `project` -- The MCP entry is removed from `~/.claude.json`. The MCP is only deployed to specific projects via a Scene, which writes a `.mcp.json` file in the project root.
- **Import Sources**:
  - **Local MCPs** from `~/.claude.json` (both user-scope and project-scope entries are detected)
  - **Legacy MCPs** from `~/.claude/settings.json` (for backward compatibility)
  - **Plugin-installed MCPs** from Claude Code plugins

**Managing MCPs:**

1. Navigate to **MCP Servers** in the sidebar.
2. Click on an MCP to view its details (name, description, command, args, environment variables, provided tools, category, tags, icon, scope).
3. Click "Discover Tools" to connect to the MCP server at runtime and fetch its available tools. This populates the provided tools list.
4. Toggle scope between `Global` and `Project`.
5. Edit category, tags, and icon in the detail panel.
6. Click "Auto Classify" to use AI for automatic categorization of all MCPs.
7. Use the import button to import additional MCPs from `~/.claude.json` or from installed plugins.

### Scenes

Scenes are configuration bundles that combine multiple Skills, MCPs, an optional CLAUDE.md file, and any number of Rules into a reusable profile.

**Creating a Scene:**

1. Navigate to **Scenes** in the sidebar.
2. Click "New Scene" (the `+` button).
3. Enter a name and description.
4. Switch between tabs to select:
   - **Skills** -- Select any number of skills to include.
   - **MCPs** -- Select any number of MCP servers to include.
   - **CLAUDE.md** -- Optionally select one CLAUDE.md file (only non-global files are available; global files are excluded since they are already active system-wide).
   - **Rules** -- Select any number of Rule files to include. All non-global Rules are available; multi-select since Rules are designed to compose.
5. Click "Create" to save the scene.

**Editing a Scene:**

- Click on a scene to view its details in the slide panel.
- Edit the scene name, description, and icon.
- View the list of included Skills, MCPs, and CLAUDE.md.
- Delete the scene if no longer needed.

**Use Cases:**
- "Web Development" scene with frontend skills and relevant MCPs
- "Data Analysis" scene with Python skills and database MCPs
- "Documentation" scene with writing-focused configurations

### Projects

Projects link Scenes to specific local directories, enabling one-click configuration deployment.

**Adding a Project:**

1. Navigate to **Projects** in the sidebar.
2. Click "Add Project" (the `+` button).
3. Enter a project name.
4. Select a local folder using the folder picker.
5. Optionally choose a Scene to associate.
6. Click "Create" to save the project.

**Sync Process:**

When you click "Sync" on a project, Ensemble performs the following:

1. **Skills deployment** -- Creates `<project>/.claude/skills/` and places symlinks pointing to each skill's source in `~/.ensemble/skills/`. Existing symlinks are cleaned before re-creating.
2. **MCP configuration** -- Writes a `.mcp.json` file in the project root (`<project>/.mcp.json`) containing the MCP server configurations from the associated Scene.
3. **CLAUDE.md distribution** -- If the Scene includes a CLAUDE.md file, it is written to the project at the configured distribution path (see Settings). Existing files are backed up before overwriting.
4. **Rules distribution** -- If the Scene includes Rules, each Rule is copied to `<project>/.claude/rules/<filename>.md`. Existing files at the same filename are backed up before overwriting.

**Clearing Configuration:**

Click "Clear Config" on a project to remove all deployed configuration: skill symlinks, `.mcp.json`, any distributed CLAUDE.md files (from all three possible paths), and the Rule `.md` files in `<project>/.claude/rules/` whose filenames match Ensemble-managed Rules. User-authored Rule files in the same directory are never touched.

**Changing Scenes:**

You can change the Scene associated with a project. The old configuration is cleared and the new Scene is automatically synced.

### CLAUDE.md

CLAUDE.md files provide context and instructions to Claude Code at different levels. Ensemble manages these files centrally.

- **Storage**: Imported files are stored in `~/.ensemble/claude-md/`
- **Source Types** (detected during scan):
  - `global` -- Found at `~/.claude/CLAUDE.md`
  - `project` -- Found at `./CLAUDE.md` or `./.claude/CLAUDE.md` in project directories
  - `local` -- Found at `./CLAUDE.local.md` in project directories

**Scanning:**

1. Navigate to **CLAUDE.md** in the sidebar.
2. Click "Scan" to discover CLAUDE.md files on your system. The scanner checks specified paths and optionally the home directory.
3. Review the scan results, which show discovered files with their type, size, modification date, and a content preview.
4. Import selected files into Ensemble's managed storage.

**Setting a File as Global:**

- Select a CLAUDE.md file and click "Set as Global".
- This copies/syncs the file content to `~/.claude/CLAUDE.md`, making it active for all Claude Code sessions.
- Only one file can be global at a time. Setting a new global file replaces the previous one.
- If an unmanaged `~/.claude/CLAUDE.md` already exists, it is backed up and imported as "Original Global" before being replaced.
- Click "Unset Global" to remove the global status and delete the `~/.claude/CLAUDE.md` file.

**Distribution to Projects:**

CLAUDE.md files can be distributed to projects in two ways:

1. **Via Scenes** -- Include a CLAUDE.md file in a Scene, and it will be distributed when the associated Project is synced.
2. **Direct distribution** -- Use the "Distribute" action to send a file to a specific project path.

**Distribution Path Options** (configurable in Settings):

| Setting | Target Path |
|---------|------------|
| `.claude/CLAUDE.md` (default) | `<project>/.claude/CLAUDE.md` |
| `CLAUDE.md` | `<project>/CLAUDE.md` |
| `CLAUDE.local.md` | `<project>/CLAUDE.local.md` |

**Editing:**

- Click on a CLAUDE.md file to view and edit its content, name, description, category, tags, and icon.
- Content changes are saved to the managed copy in `~/.ensemble/claude-md/`.

### Rules

Rules are modular `.md` instruction files under `.claude/rules/` that Claude Code loads to scope behaviour -- coding conventions, review checklists, project-specific guardrails. A single project may have a dozen Rule files, each addressing one topic.

- **Storage**: Imported files are stored in `~/.ensemble/rules/{id}/<filename>.md`. The original filename is preserved since Claude Code indexes Rules by filename; the displayed `name` can be renamed independently.
- **Source scopes** (detected during scan):
  - `user` -- Found at `~/.claude/rules/**/*.md`
  - `project` -- Found at `<project>/.claude/rules/**/*.md` under default project directories

**Scanning:**

1. Navigate to **Rules** in the sidebar.
2. Click "Scan" to discover Rule files on your system.
3. Review the scan results and import selected files into Ensemble's managed storage.

**Setting a Rule as Global:**

- Toggle the global switch on any Rule to write its content to `~/.claude/rules/<filename>.md`, making it active for all Claude Code sessions.
- Multiple Rules can be global at the same time -- the global state is per-Rule.
- If an unmanaged `~/.claude/rules/<filename>.md` already exists, it is backed up and imported as "Original" before being replaced.
- Editing the content of a global Rule mirrors the changes to `~/.claude/rules/<filename>.md` immediately; no re-toggle required.

**Distribution to Projects:**

Rules can be distributed to projects in two ways:

1. **Via Scenes** -- Include Rules in a Scene; they are written when the associated Project is synced.
2. **Direct distribution** -- Use the "Distribute" action on a Rule to send it to a specific project at `<project>/.claude/rules/<filename>.md`.

The distribution path is fixed -- Claude Code only scans `.claude/rules/` for project Rules.

**Editing:**

- Click on a Rule to view and edit its content, name, description, category, tags, and icon.
- The `filename` field is immutable after import; the displayed `name` is independent and can be renamed freely.

### Categories and Tags

Ensemble supports organizing Skills, MCPs, CLAUDE.md files, and Rules with categories and tags.

- **Categories** -- Each item can belong to one category. Categories have names and colors, and can be nested one level deep (subcategories appear indented under a parent). Navigate to a category in the sidebar to view all items in that category and its subcategories.
- **Tags** -- Each item can have multiple tags. Tags are single lowercase words. Navigate to a tag in the sidebar to view all items with that tag.
- Categories and tags can be created, renamed, deleted, and reordered by dragging within the sidebar. Drag a root category onto another to nest it; drag a subcategory out past the threshold to promote it back to root.

### View Options

Skills, MCP Servers, CLAUDE.md, Scenes, Projects, and the Category and Tag filter pages each carry a View Options menu (funnel icon in the page header) with two independent axes:

- **Group by** -- Categories, Tags, or None (where applicable). Grouping by Tags is multi-valued: an item with multiple tags appears once in each matching bucket.
- **Sort by** -- Name (A-Z), Recently added, Recently used, or Most used (subset varies per page).

Preferences are persisted per page. Plugin-installed items sort to the bottom within any axis.

## Marketplace

Ensemble includes an in-app catalog for discovering and installing Skills and MCP Servers without leaving the app.

**Skill Marketplace** mirrors the [skills.sh](https://skills.sh) community catalog. Each entry shows install counts, topic filters, GitHub stars, and an AI-generated summary alongside the full upstream README.

**MCP Marketplace** mirrors the official [MCP Registry](https://registry.modelcontextprotocol.io) with cursor-paginated browsing, a Recently Updated feed, and search. Each entry shows publisher metadata (title, website, license, keywords) and publisher-curated example snippets where available.

**Installing an item:**

1. Open the **Skill Marketplace** or **MCP Marketplace** entry in the sidebar.
2. Click an item to open its detail panel; review the README, stars, summary, examples, and required environment variables (for MCPs).
3. For MCPs with required environment variables, fill in the form before installing. Secret fields render as password inputs.
4. For HTTP MCPs with URL template variables (`{VAR}`) or required headers, fill in the additional form that appears.
5. Click **Install**. The item is added to your managed library (`~/.ensemble/skills/` or `~/.ensemble/mcps/`) and an Auto-Classify pass suggests a category.
6. If an item with the same name already exists (active or in Trash), Ensemble offers **Replace** or **Restore from Trash** -- restoring round-trips the previous category, tags, and icon.

**Updating MCP connection settings after install:**

The Marketplace detail panel for an installed MCP exposes a **Save connection settings** button so URL variables, headers, and environment variables can be updated post-install without reinstalling.

**Catalog caching:**

Catalog responses are cached in `~/.ensemble/` with a 24-hour TTL. A background refresh runs on app launch and surfaces a sync indicator in the sidebar while in progress.

## Auto-Classification

Ensemble can automatically categorize your Skills, MCPs, and CLAUDE.md files using AI.

**How It Works:**

- Auto-classification uses the **Claude CLI** (`claude` command) to analyze items and suggest categories, tags, and icons.
- It does **not** require an Anthropic API key. It uses the Claude CLI that must be installed and available in your PATH.
- The model is configurable in **Settings > Auto Classify > Classification model** (Opus, Sonnet, or Haiku; defaults to Opus).
- Classification on a Category or Tag filter page is scoped to the items visible on that page (and, for categories, their subcategories).

**What Gets Classified:**

Each item receives:
- A **suggested category** (e.g., "Development", "Database", "Web", "DevOps")
- 1-2 **suggested tags** (single lowercase words, e.g., "python", "api", "testing")
- A **suggested icon** from the available icon set

**Usage:**

- Click the "Auto Classify" button on the Skills, MCP Servers, or CLAUDE.md page.
- All items in that module will be classified in a single batch.
- New categories and tags are automatically created as needed.
- Existing valid categories and tags are reused for consistency.

## Finder Integration (macOS)

Ensemble includes a macOS Finder Quick Action that lets you right-click folders and interact with Ensemble directly.

**Installation:**

1. Go to **Settings** > **Launch Configuration**.
2. Click "Reinstall" next to "Finder Integration".
3. The Quick Action is installed at `~/Library/Services/Open with Ensemble.workflow`.

**Usage:**

1. Right-click any folder in Finder.
2. Select **Quick Actions** > **Open with Ensemble**.
3. Ensemble receives the folder path and either launches Claude Code directly (if the folder has a configured Scene/Project) or shows the launcher dialog.

## Terminal Support

Ensemble supports launching Claude Code in multiple terminal applications:

| Terminal | Notes |
|----------|-------|
| **Terminal.app** | Default. Uses AppleScript `do script` for command execution. |
| **iTerm2** | Uses iTerm2's native AppleScript to create a new window with the command. |
| **Warp** | Supports two open modes: **New Window** (via Launch Configuration) and **New Tab** (via temporary script). Configurable in Settings. |
| **Alacritty** | Uses Alacritty's CLI arguments (`--working-directory`, `-e`) directly. |
| **Ghostty** | Uses Ghostty's AppleScript API to open a new tab in the existing instance, or a new window on older Ghostty versions. |

**Configuration:**

1. Go to **Settings** > **Launch Configuration**.
2. Select your preferred **Terminal Application**.
3. If using Warp, choose between **New Window** and **New Tab** open modes.
4. Customize the **Launch Command** (defaults to `claude`).

## Trash and Recovery

Deleted Skills, MCPs, CLAUDE.md files, and Rules are moved to a trash directory within `~/.ensemble/` and can be recovered.

**Accessing Trash:**

1. Go to **Settings** > **Storage**.
2. Click "Recover" next to "Deleted Items".
3. The Trash Recovery modal shows all deleted items grouped by type (Skills, MCPs, CLAUDE.md files, Rules).
4. Click "Restore" on any item to recover it back to the active collection.

After restoring items, the Skills, MCPs, and CLAUDE.md lists are automatically refreshed.

## Plugin Support

Ensemble can detect and import Skills and MCPs from Claude Code plugins (installed via the Claude Code plugin system).

- Detected plugin Skills come from plugin directories containing `SKILL.md` files.
- Detected plugin MCPs come from plugin directories containing `.mcp.json` files.
- Imported plugin items are tracked to avoid duplicate imports.
- Plugin-imported items appear at the bottom of the list, sorted separately from local items.

## Tips

1. **Use Scenes for context switching** -- Create different Scenes for different types of work and switch between them by changing the Project's associated Scene.
2. **Keep Global scope minimal** -- Only set frequently-used items as Global. Use Project scope and Scenes for project-specific configurations.
3. **Organize with categories and tags** -- Use the auto-classification feature to quickly organize large collections, then refine manually as needed.
4. **Use the Finder integration** -- Install the Quick Action for fast access to Claude Code from any project folder.
5. **Regular cleanup** -- Delete unused configurations; they can always be recovered from the trash.
