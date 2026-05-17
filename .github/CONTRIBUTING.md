# Contributing to Ensemble

Contributions are welcome. This guide covers setup, code style, and the PR process.

## Development Setup

### Prerequisites

- **Node.js** 18+
- **Rust** 1.77+
- **macOS** 12.0+

### Getting Started

1. Fork the repository and clone your fork:

   ```bash
   git clone https://github.com/YOUR_USERNAME/Ensemble.git
   cd Ensemble
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start development server:

   ```bash
   npm run tauri dev
   ```

   This starts the Vite dev server on `http://localhost:1420` and launches the Tauri application. Frontend changes hot-reload automatically.

4. Build for production:

   ```bash
   npm run tauri build
   ```

## Project Structure

```
Ensemble/
├── src/                    # React frontend
│   ├── components/         # Reusable UI components
│   ├── pages/              # Page components
│   ├── stores/             # Zustand state stores
│   ├── hooks/              # Custom React hooks
│   ├── utils/              # Utility functions
│   └── types/              # TypeScript type definitions
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── commands/       # Tauri command handlers
│   │   └── lib.rs          # Main library entry point
│   ├── Cargo.toml          # Rust dependencies
│   └── tauri.conf.json     # Tauri configuration
└── docs/                   # Documentation
```

For the complete project structure with every file listed, see the [Development Guide](./docs/development.md#project-structure-complete).

## Code Style

### TypeScript

- Use TypeScript strict mode
- Prefer explicit type annotations for function parameters and return types
- Use interfaces for object shapes, types for unions and primitives
- Avoid `any`; use `unknown` if the type is truly unknown

### Rust

- Format with `cargo fmt` before committing
- Run `cargo clippy` for linting
- Follow Rust naming conventions (snake_case for functions/variables, PascalCase for types)
- Document public functions with doc comments

### React Components

- Use functional components with hooks
- Keep components small and focused
- Extract reusable logic into custom hooks

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description
```

| Type | Description |
|------|-------------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation changes |
| `style` | Code style changes (formatting, etc.) |
| `refactor` | Code refactoring |
| `chore` | Maintenance tasks |

Examples:

```
feat(skills): add drag-and-drop reordering
fix(mcp): resolve connection timeout issue
docs(readme): update installation instructions
```

## Pull Request Process

1. Create a feature branch from `main`:

   ```bash
   git checkout -b feature/your-feature-name
   ```

   Use prefixes: `feature/`, `fix/`, `docs/`, `refactor/`.

2. Make your changes following the code style guidelines.

3. Test locally:
   - `npm run tauri dev` to verify functionality
   - `npm run tauri build` to ensure it builds without errors

4. Push and submit a Pull Request:

   ```bash
   git push origin feature/your-feature-name
   ```

   Fill out the PR template with a clear description and screenshots for UI changes.

5. Address review feedback. The PR will be merged once approved.

## Issue Reporting

Before submitting an issue, search existing issues to avoid duplicates.

**Bug reports** should include: description, steps to reproduce, expected vs actual behavior, macOS version, Ensemble version, and screenshots if applicable.

**Feature requests** should include: the problem you're solving, proposed solution, and alternatives considered.

## License

By contributing to Ensemble, you agree that your contributions will be licensed under the [MIT License](LICENSE).
