# Installation Guide

## System Requirements

- **Operating System**: macOS 12.0 (Monterey) or later
- **Architecture**: Apple Silicon (M1/M2/M3/M4) or Intel x86_64
- **Disk Space**: ~100MB for the application, plus data storage in `~/.cc-workshop/`
- **Claude Code**: Must be installed and configured ([Claude Code](https://docs.anthropic.com/en/docs/claude-code))

## Option 1: Download Pre-built Release

1. Go to the [Releases](https://github.com/O0000-code/CC-Workshop/releases) page
2. Download the latest `.dmg` file for your architecture
3. Open the DMG and drag **CC Workshop** to your Applications folder
4. Launch CC Workshop from Applications

## Option 2: Build from Source

### Prerequisites

Install the following tools before building:

1. **Xcode Command Line Tools** (required for compiling native code on macOS)

   ```bash
   xcode-select --install
   ```

2. **Node.js 18 or later**

   ```bash
   # Using Homebrew
   brew install node

   # Or using nvm
   nvm install 18
   nvm use 18
   ```

   Verify: `node --version` should output `v18.x.x` or higher.

3. **Rust 1.77.2 or later**

   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   source "$HOME/.cargo/env"
   ```

   Verify: `rustc --version` should output `1.77.2` or higher.

### Build Steps

```bash
# Clone the repository
git clone https://github.com/O0000-code/CC-Workshop.git
cd CC Workshop

# Install Node.js dependencies
npm install

# Build for production
npm run tauri build
```

The build process will:
1. Compile the TypeScript/React frontend via Vite (`npm run build`)
2. Compile the Rust backend via Cargo
3. Bundle everything into a macOS application

### Build Output

After a successful build, the artifacts are located at:

| Artifact | Path |
|----------|------|
| macOS App Bundle | `src-tauri/target/release/bundle/macos/CC Workshop.app` |
| DMG Installer | `src-tauri/target/release/bundle/dmg/CC Workshop_<version>_<arch>.dmg` |

You can copy `CC Workshop.app` directly to your `/Applications` folder, or open the generated DMG.

### Development Mode

For development with hot-reload (frontend changes reflect instantly):

```bash
npm run tauri dev
```

This starts the Vite dev server on `http://localhost:1420` and launches the Tauri application window. Changes to frontend code will hot-reload automatically. Changes to Rust code in `src-tauri/` will trigger a recompile and restart.

## First Launch

When CC Workshop starts for the first time, it automatically creates its data directory at `~/.cc-workshop/` with the following structure:

```
~/.cc-workshop/
├── data.json           # Application data (categories, tags, scenes, projects)
├── settings.json       # User settings and preferences
├── skills/             # Managed skill files
├── mcps/               # MCP server configuration files
├── claude-md/          # Managed CLAUDE.md files
└── trash/              # Soft-deleted items (recoverable from within the app)
    ├── skills/
    ├── mcps/
    └── claude-md/
```

On first launch, CC Workshop will also create default categories (Development, Writing, Analysis) and offer to import any existing Skills and MCP configurations from your Claude Code setup (`~/.claude/` and `~/.claude.json`).

## Verification

After installation, verify CC Workshop is working correctly:

1. Launch the application
2. You should see the main interface with sidebar navigation
3. If you have existing Claude Code configurations, CC Workshop will offer to import them
4. Check **Settings** to review and configure your preferences

## Uninstallation

To completely remove CC Workshop and all its data:

1. Quit the application (right-click the Dock icon and select **Quit**, or press `Cmd+Q`)
2. Delete `CC Workshop.app` from your Applications folder
3. Remove the data directory:

   ```bash
   rm -rf ~/.cc-workshop
   ```

**Warning**: Removing `~/.cc-workshop` will permanently delete all your managed Skills, MCP configurations, CLAUDE.md files, categories, tags, scenes, and project associations. This action cannot be undone.

Note: CC Workshop does not modify your original Claude Code configuration files (`~/.claude/`, `~/.claude.json`). Uninstalling CC Workshop will not affect your Claude Code setup, though any symlinks CC Workshop created in project directories will become broken and should be cleaned up manually.

To also remove the Finder Quick Action (if installed):

   ```bash
   rm -rf ~/Library/Services/Open\ with\ CC Workshop.workflow
   ```
