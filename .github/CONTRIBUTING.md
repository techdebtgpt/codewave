# Contributing to CodeWave

Thank you for your interest in contributing to CodeWave! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

Please be respectful and professional in all interactions with other contributors and maintainers.

## Getting Started

### Prerequisites

- Node.js 18.0.0 or later
- npm 9.0.0 or later
- Git 2.0.0 or later

### Local Development Setup

```bash
# Clone the repository
git clone https://github.com/techdebtgpt/codewave.git
cd codewave

# Install dependencies
npm install

# Build the project
npm run build

# Verify everything works
npm run lint
```

## Development Workflow

### 1. Create a Feature Branch

```bash
# Update main branch
git checkout main
git pull origin main

# Create feature branch with descriptive name
git checkout -b feature/your-feature-name
# or for bug fixes:
git checkout -b fix/bug-description
```

### 2. Make Your Changes

```bash
# Edit files as needed
# Test your changes locally
npm run build
npm run lint
npm run prettier
```

### 3. Commit Your Changes

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

- feat: A new feature
- fix: A bug fix
- docs: Documentation changes
- style: Code style changes (no logic changes)
- refactor: Code refactoring
- perf: Performance improvements
- test: Adding or updating tests
- chore: Build process, dependencies, etc.
```

**Examples:**

```bash
git commit -m "feat(agents): add new validation logic for agent responses"
git commit -m "fix(cli): resolve issue with configuration file loading"
git commit -m "docs: add section on multi-round discussion to ADVANCED_FEATURES.md"
git commit -m "refactor(orchestrator): simplify convergence calculation"
```

### 4. Code Quality Checks

Before submitting:

```bash
# Format code
npm run prettier

# Check linting
npm run lint

# Fix lint issues automatically
npm run lint:fix

# Build to verify TypeScript compilation
npm run build
```

### 5. Push and Create Pull Request

```bash
# Push to your fork
git push origin feature/your-feature-name

# Create PR on GitHub
# Fill out PR template with:
# - Description of changes
# - Motivation and context
# - Testing performed
# - Screenshots (if UI changes)
```

## Coding Standards

### TypeScript

- Use strict mode (`"strict": true` in tsconfig.json)
- Add type annotations where helpful
- Avoid `any` types
- Use const for immutable variables

**Example:**

```typescript
// Good
const calculateMetrics = (data: CommitData[]): Metrics[] => {
  return data.map((commit) => ({
    quality: computeQuality(commit),
    complexity: computeComplexity(commit),
  }));
};

// Avoid
const calculateMetrics = (data: any) => {
  return data.map((commit: any) => {
    return { quality: computeQuality(commit) };
  });
};
```

### Comments and Documentation

- Add JSDoc comments for exported functions/classes
- Explain WHY, not WHAT (code shows what)
- Keep comments up-to-date with code changes

**Example:**

```typescript
/**
 * Calculate convergence score for agent responses.
 *
 * Convergence measures how closely agents agree on metrics.
 * Higher scores indicate stronger consensus.
 *
 * @param responses - Agent responses from all rounds
 * @returns Convergence score from 0.0 to 1.0
 */
export const calculateConvergence = (responses: AgentResponse[][]): number => {
  // Implementation
};
```

### File Organization

```
src/
├── agents/          # Agent implementations
├── config/          # Configuration management
├── llm/            # LLM provider integration
├── orchestrator/   # Workflow orchestration
├── services/       # Business logic services
├── types/          # TypeScript type definitions
├── formatters/     # Output formatting
└── utils/          # Utility functions

cli/
├── commands/       # CLI commands
├── utils/          # CLI utilities
└── index.ts        # Entry point

tests/              # Test files
docs/               # Documentation
```

## Testing

While comprehensive tests are being developed, please:

1. Manually test your changes locally
2. Build without warnings: `npm run build`
3. Verify linting passes: `npm run lint`

**Future:** We will add Jest tests. Contributions with tests are especially welcome!

## Documentation

- Update docs/INDEX.md if adding new documentation
- Update docs/CHANGELOG.md with your changes
- Add code comments for complex logic
- Update README.md if adding user-facing features

### Documentation Files

- **README.md** - Main overview and quick start
- **docs/CLI.md** - Command reference
- **docs/CONFIGURATION.md** - Setup guide
- **docs/ADVANCED_FEATURES.md** - Deep features
- **docs/ARCHITECTURE.md** - System design
- **docs/API.md** - Programmatic API
- **docs/CHANGELOG.md** - Version history
- **.github/CONTRIBUTING.md** - This file

## Pull Request Process

1. **Title**: Use conventional commit format
   - `feat: add new agent validation`
   - `fix: resolve memory leak in orchestrator`

2. **Description**: Fill out PR template completely
   - What changes were made?
   - Why were they needed?
   - How were they tested?

3. **Checks**: Ensure all CI checks pass
   - Build succeeds
   - Linting passes
   - No console errors

4. **Review**: Respond to reviewer feedback
   - Address all comments
   - Request changes review when done

5. **Merge**: Maintainer will merge when approved

## Issues

### Reporting Bugs

Use the bug report template:

- **Description**: Clear summary
- **Steps to reproduce**: Exact steps
- **Expected behavior**: What should happen
- **Actual behavior**: What actually happens
- **Environment**: Node version, OS, etc.

### Requesting Features

- **Use case**: Why is this needed?
- **Proposed solution**: Your idea
- **Alternatives**: Other approaches considered

## Release Process

### Version Numbers

We use [Semantic Versioning](https://semver.org/):

- **MAJOR** (0.1.0 → 1.0.0): Breaking API changes
- **MINOR** (0.0.1 → 0.1.0): New features (backward compatible)
- **PATCH** (0.0.1 → 0.0.2): Bug fixes (backward compatible)

### Changelog Format

```markdown
## [0.1.0] - 2025-01-15

### Added

- New feature description

### Fixed

- Bug fix description

### Changed

- Breaking change description
```

## Questions?

- Check [docs/INDEX.md](../docs/INDEX.md)
- Open a GitHub Discussion
- Contact: issues@techdebtgpt.com

## Thank You! 🙏

Your contributions make CodeWave better. We appreciate your effort and enthusiasm!

---

**Happy coding!** 🚀
