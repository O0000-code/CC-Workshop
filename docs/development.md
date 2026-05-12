# Development Guide

This guide provides everything you need to start contributing to Ensemble. All technical details (directory structures, versions, commands, code patterns) are verified against the actual codebase.

## Architecture Overview

Ensemble is a desktop application built with [Tauri 2](https://tauri.app/), combining a Rust backend with a React frontend. It manages Claude Code Skills, MCP Servers, CLAUDE.md files, Scenes, and Projects.

```
Ensemble/
├── src/                       # React frontend (TypeScript)
│   ├── App.tsx                # Root component with routing
│   ├── main.tsx               # Application entry point
│   ├── index.css              # Global styles (Tailwind CSS)
│   ├── components/            # UI components (organized by feature)
│   ├── pages/                 # Route page components
│   ├── stores/                # Zustand state management
│   ├── types/                 # TypeScript type definitions
│   └── utils/                 # Utility functions
├── src-tauri/                 # Rust backend (Tauri 2)
│   ├── src/
│   │   ├── main.rs            # Binary entry point
│   │   ├── lib.rs             # Tauri app builder and command registration
│   │   ├── types.rs           # Shared Rust types (Skill, McpServer, Scene, etc.)
│   │   ├── commands/          # Tauri command modules
│   │   └── utils/             # Rust utility modules
│   ├── Cargo.toml             # Rust dependencies
│   └── tauri.conf.json        # Tauri configuration
└── docs/                      # Documentation
```

## Tech Stack

### Frontend

| Dependency | Version | Purpose |
|---|---|---|
| React | ^18.3.1 | UI library |
| TypeScript | ^5.9.3 | Type safety |
| Vite | ^6.4.1 | Build tool with HMR |
| Tailwind CSS | ^4.1.18 | Utility-first styling (v4, using `@tailwindcss/vite` plugin) |
| Zustand | ^5.0.10 | State management |
| react-router-dom | ^7.13.0 | Client-side routing |
| Lucide React | ^0.500.0 | Icon library |
| @tauri-apps/api | ^2.9.1 | Tauri frontend API |
| @tauri-apps/plugin-dialog | ^2.6.0 | Native dialog plugin |

### Backend (Rust)

| Dependency | Version | Purpose |
|---|---|---|
| tauri | 2.9.5 | Desktop app framework |
| serde / serde_json | 1.0 | Serialization/deserialization |
| tokio | 1 (features: process, io-util, time) | Async runtime |
| reqwest | 0.12 (features: json, gzip) | HTTP client (Marketplace catalog fetches, README downloads) |
| uuid | 1 (features: v4) | UUID generation |
| chrono | 0.4 (features: serde) | Date/time handling |
| dirs | 5 | Platform-specific directory paths |
| walkdir | 2 | Recursive directory traversal |
| regex | 1 | Regular expressions |
| urlencoding | 2.1 | URL encoding |
| tauri-plugin-dialog | 2 | Native file/folder dialogs |
| tauri-plugin-shell | 2 | Shell command execution |
| tauri-plugin-log | 2 | Logging (debug builds only) |
| tauri-plugin-single-instance | 2 | Single instance enforcement |

## Development Setup

### Prerequisites

```bash
# Install Node.js (18+)
brew install node

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Xcode Command Line Tools (macOS)
xcode-select --install
```

### Getting Started

```bash
# Clone repository
git clone https://github.com/O0000-code/Ensemble.git
cd Ensemble

# Install dependencies
npm install

# Start full Tauri development (recommended)
npm run tauri dev
```

### Available Scripts

| Command | Actual Command | Description |
|---|---|---|
| `npm run dev` | `vite` | Start Vite dev server only (frontend without Tauri) |
| `npm run build` | `tsc && vite build` | Type-check and build frontend for production |
| `npm run preview` | `vite preview` | Preview the production build locally |
| `npm run tauri dev` | `tauri dev` | Start full Tauri development (frontend + Rust backend) |
| `npm run tauri build` | `tauri build` | Build the production application |

> **Note:** The `tauri` script is a passthrough to the `@tauri-apps/cli`. You can run any Tauri CLI subcommand via `npm run tauri -- <subcommand>`.

## Project Structure (Complete)

### Frontend (`src/`)

```
src/
├── App.tsx                          # Root component: BrowserRouter + Routes
├── main.tsx                         # ReactDOM.createRoot entry
├── index.css                        # Global CSS (@import "tailwindcss")
│
├── components/
│   ├── claude-md/                   # CLAUDE.md management components
│   │   ├── ClaudeMdBadge.tsx
│   │   ├── ClaudeMdCard.tsx
│   │   ├── ClaudeMdDetailPanel.tsx
│   │   └── index.ts
│   ├── common/                      # Shared/reusable UI components
│   │   ├── Badge.tsx
│   │   ├── Button.tsx
│   │   ├── Checkbox.tsx
│   │   ├── ColorPicker.tsx
│   │   ├── ContextMenu.tsx
│   │   ├── Dropdown.tsx
│   │   ├── EmptyState.tsx
│   │   ├── ErrorBoundary.tsx
│   │   ├── FilteredEmptyState.tsx
│   │   ├── IconPicker.tsx
│   │   ├── ImportDialog.tsx
│   │   ├── Input.tsx
│   │   ├── Modal.tsx
│   │   ├── ScopeSelector.tsx
│   │   ├── SearchInput.tsx
│   │   ├── TagsWithTooltip.tsx
│   │   ├── Toggle.tsx
│   │   ├── Tooltip.tsx
│   │   ├── icons/                   # Custom SVG icon components
│   │   │   ├── CategoryEmptyIcon.tsx
│   │   │   ├── TagEmptyIcon.tsx
│   │   │   └── index.ts
│   │   └── index.ts
│   ├── launcher/                    # Quick launcher (Cmd+K style)
│   │   ├── LauncherModal.tsx
│   │   └── index.ts
│   ├── layout/                      # Layout structure components
│   │   ├── ListDetailLayout.tsx
│   │   ├── MainLayout.tsx
│   │   ├── PageHeader.tsx
│   │   ├── Sidebar.tsx
│   │   ├── SlidePanel.tsx
│   │   └── index.ts
│   ├── mcps/                        # MCP Server components
│   │   ├── McpDetailPanel.tsx
│   │   ├── McpItem.tsx
│   │   ├── McpListItem.tsx
│   │   └── index.ts
│   ├── modals/                      # Feature-specific modal dialogs
│   │   ├── ImportClaudeMdModal.tsx
│   │   ├── ImportMcpModal.tsx
│   │   ├── ImportSkillsModal.tsx
│   │   ├── ScanClaudeMdModal.tsx
│   │   ├── TrashRecoveryModal.tsx
│   │   └── index.ts
│   ├── projects/                    # Project management components
│   │   ├── ProjectCard.tsx
│   │   ├── ProjectConfigPanel.tsx
│   │   ├── ProjectItem.tsx
│   │   └── index.ts
│   ├── scenes/                      # Scene management components
│   │   ├── CreateSceneModal.tsx
│   │   ├── SceneCard.tsx
│   │   ├── SceneItem.tsx
│   │   ├── SceneListItem.tsx
│   │   └── index.ts
│   ├── sidebar/                     # Sidebar-specific components
│   │   ├── CategoryInlineInput.tsx
│   │   ├── TagInlineInput.tsx
│   │   └── index.ts
│   └── skills/                      # Skill management components
│       ├── SkillDetailPanel.tsx
│       ├── SkillItem.tsx
│       ├── SkillListItem.tsx
│       └── index.ts
│
├── pages/
│   ├── CategoryPage.tsx             # Category filter page
│   ├── ClaudeMdPage.tsx             # CLAUDE.md management page
│   ├── McpMarketplacePage.tsx       # MCP Marketplace catalog + install
│   ├── McpServersPage.tsx           # MCP Servers list page
│   ├── ProjectsPage.tsx             # Projects management page
│   ├── SceneDetailPage.tsx          # Scene detail page
│   ├── ScenesPage.tsx               # Scenes list page
│   ├── SettingsPage.tsx             # Application settings page
│   ├── SkillMarketplacePage.tsx     # Skill Marketplace catalog + install
│   ├── SkillsPage.tsx               # Skills list page
│   ├── TagPage.tsx                  # Tag filter page
│   └── index.ts
│
├── stores/
│   ├── appStore.ts                  # Global app state (categories, tags, initialization)
│   ├── claudeMdStore.ts             # CLAUDE.md file management state
│   ├── importStore.ts               # Import workflow state
│   ├── launcherStore.ts             # Launcher modal state
│   ├── mcpsStore.ts                 # MCP Servers state
│   ├── pluginsStore.ts              # Plugin detection and import state
│   ├── projectsStore.ts             # Projects state
│   ├── scenesStore.ts               # Scenes state
│   ├── settingsStore.ts             # Application settings state
│   ├── skillsStore.ts               # Skills state
│   ├── trashStore.ts                # Trash recovery state
│   └── index.ts                     # Re-exports all stores
│
├── types/
│   ├── index.ts                     # Core types (Skill, McpServer, Scene, Project, etc.)
│   ├── claudeMd.ts                  # CLAUDE.md related types
│   ├── plugin.ts                    # Plugin related types
│   └── trash.ts                     # Trash recovery types
│
└── utils/
    ├── constants.ts                 # Application constants
    ├── parseDescription.ts          # Description text parsing utilities
    ├── tauri.ts                     # Tauri environment detection and safe invoke wrapper
    └── text.ts                      # Text formatting utilities
```

### Backend (`src-tauri/`)

```
src-tauri/
├── src/
│   ├── main.rs                      # Binary entry (calls ensemble_lib::run())
│   ├── lib.rs                       # Tauri Builder: plugin setup, command registration
│   ├── types.rs                     # All shared Rust types and data structures
│   ├── commands/
│   │   ├── mod.rs                   # Module declarations
│   │   ├── classify.rs              # AI auto-classification (Anthropic API)
│   │   ├── claude_md.rs             # CLAUDE.md file management commands
│   │   ├── config.rs                # Claude Code config file operations
│   │   ├── data.rs                  # App data persistence (categories, tags, scenes, projects)
│   │   ├── dialog.rs                # Native dialog and window operations
│   │   ├── import.rs                # Import existing configurations
│   │   ├── mcps.rs                  # MCP Server scanning and management
│   │   ├── plugins.rs               # Plugin detection and import
│   │   ├── skills.rs                # Skill scanning and management
│   │   ├── symlink.rs               # Symlink creation/removal for deployment
│   │   ├── trash.rs                 # Trash recovery operations
│   │   └── usage.rs                 # Usage statistics scanning
│   └── utils/
│       ├── mod.rs                   # Re-exports parser and path modules
│       ├── parser.rs                # SKILL.md / MCP config file parsers
│       └── path.rs                  # Path expansion, app data directory helpers
├── Cargo.toml
└── tauri.conf.json
```

### Routing Structure

Defined in `src/App.tsx`, all routes are nested under the `MainLayout` component:

| Route | Page Component | Description |
|---|---|---|
| `/` | Redirects to `/marketplace-skills` | Default route |
| `/marketplace-skills` | `SkillMarketplacePage` | Skill Marketplace catalog + install |
| `/marketplace-mcps` | `McpMarketplacePage` | MCP Marketplace catalog + install |
| `/skills` | `SkillsPage` | Skills management |
| `/mcp-servers` | `McpServersPage` | MCP Servers management |
| `/claude-md` | `ClaudeMdPage` | CLAUDE.md file management |
| `/scenes` | `ScenesPage` | Scene composition |
| `/projects` | `ProjectsPage` | Project management |
| `/category/:categoryId` | `CategoryPage` | Items filtered by category |
| `/tag/:tagId` | `TagPage` | Items filtered by tag |
| `/settings` | `SettingsPage` | Application settings |

## Key Concepts

### Tauri Commands

Backend functions are exposed to the frontend via `#[tauri::command]` and registered in `lib.rs` using `tauri::generate_handler![]`.

All commands are organized in the `commands/` module. Here is a representative example from `commands/skills.rs`:

```rust
use crate::types::{Skill, SkillMetadata};
use crate::utils::{expand_path, get_data_file_path, parse_skill_md};
use std::fs;

#[tauri::command]
pub fn scan_skills(source_dir: String) -> Result<Vec<Skill>, String> {
    let path = expand_path(&source_dir);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let mut skills = Vec::new();
    // ... scan directory for SKILL.md files
    Ok(skills)
}

#[tauri::command]
pub fn get_skill(source_dir: String, skill_id: String) -> Result<Option<Skill>, String> {
    let skills = scan_skills(source_dir)?;
    Ok(skills.into_iter().find(|s| s.id == skill_id))
}

#[tauri::command]
pub fn update_skill_metadata(
    skill_id: String,
    category: Option<String>,
    tags: Option<Vec<String>>,
    enabled: Option<bool>,
    icon: Option<String>,
) -> Result<(), String> {
    // ... update metadata in data.json
    Ok(())
}
```

Commands are registered in `lib.rs` within the `invoke_handler`:

```rust
.invoke_handler(tauri::generate_handler![
    skills::scan_skills,
    skills::get_skill,
    skills::update_skill_metadata,
    skills::delete_skill,
    mcps::scan_mcps,
    mcps::get_mcp,
    // ... all other commands
])
```

### Calling Tauri Commands from Frontend

The project uses a `safeInvoke` wrapper (defined in `src/utils/tauri.ts`) that handles non-Tauri environments gracefully:

```typescript
import { isTauri, safeInvoke } from '@/utils/tauri';

// safeInvoke returns null if not running in Tauri
const skills = await safeInvoke<Skill[]>('scan_skills', {
  sourceDir: '/path/to/skills',
});
```

You can also use the Tauri API directly:

```typescript
import { invoke } from '@tauri-apps/api/core';

const skills = await invoke<Skill[]>('scan_skills', {
  sourceDir: '/path/to/skills',
});
```

> **Important:** Command argument names in `invoke()` use **camelCase** on the frontend, which maps to **snake_case** parameters in the Rust command functions. Tauri handles this conversion automatically.

### Path Aliases

The project uses the `@/` path alias, configured in both `vite.config.ts` and `tsconfig.json`:

```typescript
// Instead of relative paths:
import { Button } from '../../../components/common';

// Use the alias:
import { Button } from '@/components/common';
```

### State Management (Zustand)

All frontend state is managed by Zustand stores in `src/stores/`. Each store follows a consistent pattern:

```typescript
import { create } from 'zustand';
import type { Skill } from '../types';
import { isTauri, safeInvoke } from '@/utils/tauri';

interface SkillsState {
  skills: Skill[];
  isLoading: boolean;
  error: string | null;
  loadSkills: () => Promise<void>;
  // ... other actions
}

export const useSkillsStore = create<SkillsState>((set, get) => ({
  skills: [],
  isLoading: false,
  error: null,

  loadSkills: async () => {
    if (!isTauri()) {
      console.warn('Cannot load skills in browser mode');
      set({ isLoading: false });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const skills = await safeInvoke<Skill[]>('scan_skills', {
        sourceDir: skillSourceDir,
      });
      set({ skills: skills || [], isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },
}));
```

Available stores (all re-exported from `src/stores/index.ts`):

| Store | Export | Purpose |
|---|---|---|
| `appStore.ts` | `useAppStore` | Categories, tags, global initialization |
| `skillsStore.ts` | `useSkillsStore` | Skills CRUD, filtering, classification |
| `mcpsStore.ts` | `useMcpsStore` | MCP Servers CRUD, filtering |
| `claudeMdStore.ts` | `useClaudeMdStore` | CLAUDE.md file management |
| `scenesStore.ts` | `useScenesStore` | Scene composition and management |
| `projectsStore.ts` | `useProjectsStore` | Project management and config syncing |
| `settingsStore.ts` | `useSettingsStore` | Application settings persistence |
| `importStore.ts` | `useImportStore` | Import workflow state |
| `pluginsStore.ts` | `usePluginsStore` | Plugin detection and import |
| `launcherStore.ts` | `useLauncherStore` | Quick launcher modal state |
| `trashStore.ts` | `useTrashStore` | Trash recovery operations |

### Styling

The project uses Tailwind CSS v4 with the Vite plugin (`@tailwindcss/vite`). The entry point is `src/index.css`:

```css
@import "tailwindcss";
```

Component styling example:

```tsx
<button className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
  Click me
</button>
```

### Data Storage

Ensemble stores its data in `~/.ensemble/`:

| Path | Purpose |
|---|---|
| `~/.ensemble/data.json` | Categories, tags, scenes, projects, metadata |
| `~/.ensemble/settings.json` | Application settings (paths, API key, preferences) |
| `~/.ensemble/skills/` | Skill files (each skill is a directory with `SKILL.md`) |
| `~/.ensemble/mcps/` | MCP Server config files (`.json` files) |
| `~/.ensemble/claude-md/` | Managed CLAUDE.md content files |
| `~/.ensemble/trash/` | Soft-deleted items for recovery |

### Registered Tauri Commands (Complete)

All commands registered in `lib.rs` grouped by module:

**Skills** (`commands/skills.rs`):
`scan_skills`, `get_skill`, `update_skill_metadata`, `delete_skill`

**MCPs** (`commands/mcps.rs`):
`scan_mcps`, `get_mcp`, `update_mcp_metadata`, `delete_mcp`, `fetch_mcp_tools`

**Symlink** (`commands/symlink.rs`):
`create_symlink`, `remove_symlink`, `is_symlink`, `get_symlink_target`, `create_symlinks`, `remove_symlinks`

**Config** (`commands/config.rs`):
`write_mcp_config`, `sync_project_config`, `clear_project_config`, `get_project_config_status`

**Data** (`commands/data.rs`):
`read_app_data`, `write_app_data`, `read_settings`, `write_settings`, `init_app_data`,
`get_categories`, `add_category`, `update_category`, `delete_category`, `reorder_categories`, `set_category_parent`, `migrate_category_id_for_skills_mcps`,
`get_tags`, `add_tag`, `update_tag`, `delete_tag`, `reorder_tags`, `reset_auto_classify_data`,
`get_scenes`, `add_scene`, `update_scene`, `delete_scene`,
`get_projects`, `add_project`, `update_project`, `delete_project`

**Dialog** (`commands/dialog.rs`):
`select_folder`, `select_file`, `reveal_in_finder`, `bring_window_to_front`

**Classify** (`commands/classify.rs`):
`auto_classify`

**Import** (`commands/import.rs`):
`detect_existing_config`, `backup_before_import`, `backup_claude_json`, `import_existing_config`,
`update_skill_scope`, `update_mcp_scope`, `remove_imported_skills`, `remove_imported_mcps`,
`install_quick_action`, `launch_claude_for_folder`, `get_launch_args`, `open_accessibility_settings`

**Usage** (`commands/usage.rs`):
`scan_usage_stats`

**Plugins** (`commands/plugins.rs`):
`detect_installed_plugins`, `detect_plugin_skills`, `detect_plugin_mcps`,
`import_plugin_skills`, `import_plugin_mcps`, `check_plugins_enabled`

**CLAUDE.md** (`commands/claude_md.rs`):
`scan_claude_md_files`, `import_claude_md`, `read_claude_md`, `get_claude_md_files`,
`update_claude_md`, `delete_claude_md`, `set_global_claude_md`, `unset_global_claude_md`,
`distribute_claude_md`, `distribute_scene_claude_md`

**Trash** (`commands/trash.rs`):
`list_trashed_items`, `restore_skill`, `restore_mcp`, `restore_claude_md`

**Marketplace** (`commands/marketplace.rs`):
`list_marketplace_skills`, `search_marketplace_skills`, `get_marketplace_skill_readme`, `get_marketplace_mcp_readme`,
`get_marketplace_repo_stars`, `get_marketplace_skill_summary`, `list_skill_topics_map`,
`list_marketplace_mcps_page`, `list_recently_updated_mcps`, `search_marketplace_mcps`,
`update_mcp_http_config`, `update_mcp_env_vars`,
`install_marketplace_skill`, `install_marketplace_mcp`, `auto_classify_marketplace_item`, `refresh_marketplace_cache`

## Building

### Development Build

```bash
npm run tauri dev
```

Features:
- Hot Module Replacement for frontend changes
- Automatic Rust recompilation on backend changes
- Vite dev server on `http://localhost:1420`
- DevTools enabled (logging plugin active in debug mode)

### Production Build

```bash
npm run tauri build
```

Outputs:
- `src-tauri/target/release/Ensemble` -- Release binary
- `src-tauri/target/release/bundle/dmg/` -- macOS DMG installer
- `src-tauri/target/release/bundle/macos/` -- macOS `.app` bundle

### Window Configuration

Defined in `tauri.conf.json`:
- Default size: 1440 x 900
- Minimum size: 1280 x 720
- Title bar: macOS overlay style with hidden title
- Traffic light position: (24, 25)

## Contributing

### Code Style

- **TypeScript**: Follow existing patterns, use strict types. Use `@/` path alias for imports.
- **Rust**: Run `cargo fmt` before committing. All types use `#[serde(rename_all = "camelCase")]` for JSON serialization.
- **CSS**: Use Tailwind CSS utility classes. Custom styles go in `src/index.css`.
- **Commits**: Use conventional commit messages (e.g., `feat:`, `fix:`, `chore:`, `docs:`).

### Adding a New Tauri Command

1. Create or update a command file in `src-tauri/src/commands/`.
2. If creating a new module, add `pub mod your_module;` to `commands/mod.rs`.
3. Register the command in `lib.rs` inside `tauri::generate_handler![]`.
4. Call from frontend using `safeInvoke<ReturnType>('command_name', { args })`.

### Adding a New Page

1. Create the page component in `src/pages/`.
2. Add the route in `src/App.tsx` inside the `<Route path="/" element={<MainLayout />}>` block.
3. If it needs sidebar navigation, update `src/components/layout/Sidebar.tsx`.

### Adding a New Store

1. Create the store file in `src/stores/`.
2. Export it from `src/stores/index.ts`.
3. Follow the existing pattern: define a state interface, use `create<State>((set, get) => ({...}))`.

### Pull Request Process

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npm run build` to verify TypeScript and build
5. Run `cargo fmt` in `src-tauri/` for Rust code
6. Submit a PR with a clear description

### Reporting Issues

When reporting bugs, please include:
- macOS version
- Ensemble version (currently 2.0.0)
- Steps to reproduce
- Expected vs actual behavior
