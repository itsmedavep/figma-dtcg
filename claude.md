# Claude Context: Figma DTCG Plugin

This document provides context for AI assistants working on the Figma DTCG Plugin codebase.

---

## Project Overview

**Name:** Figma DTCG Plugin (`figma-dtcg-starter`)
**Version:** 0.1.0
**Plugin ID:** `com.example.dtcg-starter`

### Purpose
Bridges Figma variables with the W3C Design Tokens Community Group (DTCG) format, enabling bidirectional conversion between Figma's native token system and industry-standard DTCG JSON files with integrated GitHub support.

### Key Capabilities
- Import/export design tokens between Figma and DTCG JSON
- Preserve metadata and vendor extensions through round-trips
- GitHub integration for version control workflows
- Support for colors, numbers, strings, booleans, typography, and aliases
- Style Dictionary compatibility mode
- Per-collection and per-mode exports

---

## Architecture Patterns

### Intermediate Representation (IR)
The plugin uses a canonical `TokenGraph` type as the central data structure:

- **Location:** `src/core/ir.ts`
- **Key Types:**
  - `TokenNode` - single token with path, type, per-context values, metadata
  - `TokenGraph` - container for all tokens
  - `ValueOrAlias` - union type for token values or alias references
  - `ColorValue` - DTCG color object with colorSpace, components, alpha

**Why IR?** Decouples format-specific code (Figma vs DTCG) and ensures deterministic exports.

### Adapter Pattern
Four adapters handle bidirectional conversion:

| Adapter | File | Purpose |
|---------|------|---------|
| **Figma Reader** | `src/adapters/figma-reader.ts` | Extracts variables from live Figma document → IR |
| **Figma Writer** | `src/adapters/figma-writer.ts` | Updates Figma variables from IR |
| **DTCG Reader** | `src/adapters/dtcg-reader.ts` | Parses DTCG JSON → IR with strict validation |
| **DTCG Writer** | `src/adapters/dtcg-writer.ts` | Serializes IR → DTCG JSON with deterministic ordering |

### Pipeline Orchestration
**Location:** `src/core/pipeline.ts`

High-level operations that coordinate adapters:
- `importDtcg()` - parse JSON → normalize → validate → write to Figma
- `exportDtcg()` - read from Figma → serialize → package into files
- Export formats: `single`, `perMode`, `typography`

### Message-Based IPC
**Location:** `src/app/messages.ts`

Type-safe communication between UI thread and plugin main thread using discriminated unions:

**UI → Plugin:**
- `FETCH_COLLECTIONS`, `IMPORT_DTCG`, `EXPORT_DTCG`, `EXPORT_TYPOGRAPHY`
- `GITHUB_*` messages for auth, repo selection, commits, PRs

**Plugin → UI:**
- `COLLECTIONS_DATA`, `EXPORT_RESULT`, `IMPORT_SUMMARY`
- `GITHUB_*` responses with branch lists, folder trees, status updates

---

## Directory Structure

```
figma-dtcg/
├── src/
│   ├── core/                          # Shared token processing infrastructure
│   │   ├── ir.ts                      # Intermediate representation types
│   │   ├── pipeline.ts                # Import/export orchestration
│   │   ├── normalize.ts               # Path canonicalization & utilities
│   │   ├── color.ts                   # Color conversion (sRGB/Display-P3)
│   │   ├── typography.ts              # Typography token support
│   │   ├── figma-cache.ts             # Collection snapshot caching
│   │   └── github/
│   │       └── api.ts                 # GitHub REST API wrapper
│   │
│   ├── adapters/                      # Format translation layer
│   │   ├── figma-reader.ts            # Figma → IR
│   │   ├── figma-writer.ts            # IR → Figma
│   │   ├── dtcg-reader.ts             # DTCG JSON → IR
│   │   └── dtcg-writer.ts             # IR → DTCG JSON
│   │
│   ├── app/                           # Plugin UI & main thread logic
│   │   ├── main.ts                    # Plugin controller (main thread)
│   │   ├── ui.ts                      # UI state & event handling
│   │   ├── ui.html                    # HTML template with embedded CSS
│   │   ├── messages.ts                # Type-safe message contracts
│   │   ├── collections.ts             # Figma collection snapshot utilities
│   │   └── github/
│   │       ├── dispatcher.ts          # GitHub workflow orchestration
│   │       ├── ui.ts                  # GitHub UI components
│   │       └── folders.ts             # Folder path normalization
│   │
│   └── types/
│       └── html.d.ts                  # HTML module declarations
│
├── tests/                             # Test suite
├── docs/                              # Documentation
│   ├── bugs/                          # Bug tracking documents
│   ├── designer-github-guide.md
│   └── github-pat-designer-guide.md
│
├── dist/                              # Build output (generated)
├── manifest.json                      # Figma plugin manifest
├── esbuild.config.mjs                 # Build configuration
├── tsconfig.json                      # TypeScript configuration
└── package.json                       # Dependencies & scripts
```

---

## Key Files Reference

### Core Logic
- **`src/core/ir.ts`** - Token graph types (TokenNode, TokenGraph, ValueOrAlias)
- **`src/core/pipeline.ts`** - Import/export orchestration
- **`src/core/normalize.ts`** - Path canonicalization, deduplication, sorting
- **`src/core/color.ts`** - Color space handling (sRGB/Display-P3)
- **`src/core/typography.ts`** - Typography token representation

### Adapters
- **`src/adapters/figma-reader.ts`** - Read Figma variables into IR
- **`src/adapters/figma-writer.ts`** - Write IR back to Figma variables
- **`src/adapters/dtcg-reader.ts`** - Parse DTCG JSON with validation
- **`src/adapters/dtcg-writer.ts`** - Serialize IR to DTCG JSON

### UI & State
- **`src/app/main.ts`** - Plugin main thread controller
- **`src/app/ui.ts`** - UI state management (1,359 lines)
- **`src/app/messages.ts`** - IPC message type definitions
- **`src/app/collections.ts`** - Collection snapshot utilities

### GitHub Integration
- **`src/app/github/dispatcher.ts`** - GitHub workflow orchestration
- **`src/app/github/ui.ts`** - GitHub UI components & folder picker
- **`src/app/github/folders.ts`** - Folder path normalization helpers
- **`src/core/github/api.ts`** - GitHub REST API client

---

## Important Conventions

### Path Handling
- **Canonical paths:** Always split on `/`, trim, filter empties
- **Normalization:** Use helpers from `src/core/normalize.ts`
- **Functions:**
  - `canonicalPath()` - split variable names on `/`
  - `toDot()` / `toAliasString()` - serialize paths
  - `normalize()` - deduplicate and sort tokens for stable exports

### Folder Path Conventions
- **Internal storage:** Use `''` (empty string) for repository root
- **UI display:** Show `/` for repository root
- **Key functions:**
  - `normalizeFolderForStorage()` - validates and normalizes for storage
  - `folderStorageToCommitPath()` - converts storage format to commit path
  - Never use `.` or `..` segments (security risk)

### Color Handling
- **Supported color spaces:** sRGB, Display-P3
- **Validation:** Strict DTCG color object validation before processing
- **Hex fallback:** Generate hex strings for legacy tooling compatibility
- **Document constraints:** SRGB docs only allow sRGB colors

### Metadata Preservation
- **`$extensions` blocks:** Treated as opaque vendor metadata
- **`com.figma` namespace:** Figma-specific context (collection IDs, mode IDs, variable names)
- **Round-trip requirement:** Never merge or modify extensions heuristically
- **Conflict handling:** Surface conflicts to users, don't auto-resolve

### Deterministic Ordering
- Tokens deduplicated by canonical path
- Sorted lexicographically by dot-notation path
- File paths sanitized for cross-platform compatibility
- Ensures stable version-control diffs

---

## Code Style & Patterns

### TypeScript
- **Target:** ES2020
- **Strict mode:** Enabled
- **Module resolution:** Bundler
- **No frameworks:** Plain DOM manipulation for minimal bundle size

### Error Handling
- Defensive `try/catch` blocks with silent errors where appropriate
- Surface validation errors to users via UI messages
- Don't throw exceptions that crash the plugin

### Async Patterns
- Use Promises for async operations
- Await all async calls before proceeding
- Handle rejection with `.catch()` or try/catch

### State Management
- Module-level variables for UI state
- `figma.clientStorage` for persistent preferences
- No external state management libraries

---

## Development Workflow

### Setup
```bash
npm install              # Install dependencies
npm run build            # One-off build
npm run watch            # Continuous rebuild during development
npm run typecheck        # Validate TypeScript types
```

### Build Process
**Tool:** esbuild (configured in `esbuild.config.mjs`)

**Build steps:**
1. Bundle UI (`src/app/ui.ts`) → `dist/ui.js`
2. Inline compiled UI script into `dist/ui.html`
3. Bundle main thread (`src/app/main.ts`) with inlined HTML as `__html__` constant
4. Output: `dist/main.js` and `dist/ui.html`

**Watch mode:** Monitors `src/app/` directory for changes

### Loading in Figma
1. Build the plugin first (`npm run build`)
2. In Figma: **Right click → Plugins → Development → Import plugin from manifest…**
3. Select `manifest.json` from this repository
4. Rebuild after changes, then reload plugin in Figma

### Testing
- **Type checking:** `npm run typecheck`
- **Unit tests:** Located in `tests/` directory
- **Test compilation:** `tsc -p tests/tsconfig.test.json`
- **Execute tests:** Run emitted JavaScript in `tests/dist/`

---

## GitHub Integration Details

### Authentication
- Uses GitHub Personal Access Token (PAT)
- Required scope: `repo`
- Stored in `figma.clientStorage` (base64 encoded, not encrypted)
- Token passed via `Authorization: token <PAT>` header

### API Endpoints
- Repository listing: `GET /user/repos`
- Branch fetching: `GET /repos/{owner}/{repo}/branches`
- File content: `GET /repos/{owner}/{repo}/contents/{path}`
- Create/update file: `PUT /repos/{owner}/{repo}/contents/{path}`
- Create PR: `POST /repos/{owner}/{repo}/pulls`

### Folder Picker
**Location:** `src/app/github/ui.ts`

**Known Issues:** See [docs/bugs/GitHub Folder Picker & Import bugs.md](docs/bugs/GitHub%20Folder%20Picker%20&%20Import%20bugs.md)

**Key state:**
- `folderPickerCurrentPath` - current folder being viewed
- `folderPickerRefreshNonce` - prevents stale refreshes
- `folderListWaiters` - promise queue for folder list responses
- `folderCreateWaiters` - promise queue for folder creation

---

## Known Issues & Bug Tracking

**Primary bug tracker:** [docs/bugs/GitHub Folder Picker & Import bugs.md](docs/bugs/GitHub%20Folder%20Picker%20&%20Import%20bugs.md)

### Critical Issues (P0)
1. **Issue #3:** Unchecked folderListWaiters array - promises hang indefinitely
2. **Issue #2:** State synchronization mismatch between UI and dispatcher
3. **Issue #1:** Race condition in folder picker refresh

### High Priority (P1)
4. **Issue #4:** Folder picker path mutation during async operations
5. **Issue #5:** No validation of folderPickerPathInput before navigation
6. **Issue #6:** Missing error handling for folder path validation
7. **Issue #7:** Import flow missing context validation
8. **Issue #8:** Root path edge case (`'/'` vs `''`)

See bug tracker for complete list with fix plans and testing strategies.

---

## Common Pitfalls & Gotchas

### 1. Folder Path Normalization
❌ **Don't:** Use different normalization logic in UI vs dispatcher
✅ **Do:** Use shared helpers from `src/app/github/folders.ts`

### 2. Root Path Representation
❌ **Don't:** Mix `'/'` and `''` for root folder
✅ **Do:** Use `''` internally, display as `'/'` in UI

### 3. Async State Management
❌ **Don't:** Reference mutable state in async closures
✅ **Do:** Capture state in const before async operations

### 4. Promise Rejection Handling
❌ **Don't:** Call `resolve()` in both success and error cases
✅ **Do:** Use `reject()` for error cases

### 5. Waiter Queue Management
❌ **Don't:** Leave unmatched waiters in the array
✅ **Do:** Always remove waiters after resolve/reject

### 6. Path Validation
❌ **Don't:** Pass user input directly to API
✅ **Do:** Validate and sanitize all path inputs

### 7. Metadata Handling
❌ **Don't:** Merge or modify `$extensions` heuristically
✅ **Do:** Preserve `$extensions` verbatim, surface conflicts

### 8. Color Space Handling
❌ **Don't:** Assume all colors are sRGB
✅ **Do:** Check document color profile and validate color space

---

## Testing Strategy

### Unit Tests
Focus areas:
- Path normalization edge cases
- Color space conversions
- DTCG reader/writer serialization
- Typography token handling
- Alias resolution and cycle detection

### Integration Tests
Focus areas:
- Full import flow with validation
- Export flow with different formats
- GitHub API error handling
- Folder picker navigation

### Manual Testing Checklist
- [ ] Import DTCG JSON with various token types
- [ ] Export to DTCG JSON, verify deterministic output
- [ ] Round-trip: export → modify → import
- [ ] GitHub commit workflow
- [ ] GitHub PR creation
- [ ] Folder picker navigation with rapid clicks
- [ ] Invalid path input handling
- [ ] Color space validation (sRGB vs Display-P3)
- [ ] Typography export/import
- [ ] Alias resolution with cycles

---

## Message Contracts

### UI → Plugin Messages
```typescript
| 'UI_READY'
| 'FETCH_COLLECTIONS'
| 'IMPORT_DTCG'
| 'EXPORT_DTCG'
| 'EXPORT_TYPOGRAPHY'
| 'SAVE_PREFS'
| 'GITHUB_CONNECT'
| 'GITHUB_VERIFY_TOKEN'
| 'GITHUB_LOGOUT'
| 'GITHUB_LIST_REPOS'
| 'GITHUB_SELECT_REPO'
| 'GITHUB_LIST_BRANCHES'
| 'GITHUB_SELECT_BRANCH'
| 'GITHUB_SET_FOLDER'
| 'GITHUB_FOLDER_LIST'
| 'GITHUB_EXPORT_AND_COMMIT'
| 'GITHUB_FETCH_TOKENS'
| 'GITHUB_CREATE_PR'
| 'GITHUB_SAVE_STATE'
```

### Plugin → UI Messages
```typescript
| 'INFO'
| 'ERROR'
| 'COLLECTIONS_DATA'
| 'RAW_COLLECTIONS_TEXT'
| 'EXPORT_RESULT'
| 'IMPORT_SUMMARY'
| 'GITHUB_REPOS'
| 'GITHUB_BRANCHES'
| 'GITHUB_FOLDER_LIST_RESULT'
| 'GITHUB_EXPORT_COMMIT_RESULT'
| 'GITHUB_FETCH_TOKENS_RESULT'
| 'GITHUB_CREATE_PR_RESULT'
| 'GITHUB_AUTH_STATUS'
```

**Type definitions:** `src/app/messages.ts`

---

## Security Considerations

### Network Access
- **Restricted to:** `https://api.github.com` only
- **Document access:** Current document only
- **No other network domains allowed**

### Token Storage
- **Storage:** `figma.clientStorage` (plugin-specific storage)
- **Encoding:** Base64 (NOT encryption - tokens are not secure)
- **Recommendation:** Use tokens with minimal scope
- **Best practice:** Revoke tokens when no longer needed

### Path Validation
- **Prevent path traversal:** Reject `.` and `..` segments
- **Sanitize input:** Remove invalid characters
- **Validate segments:** Check for empty segments
- **Invalid characters:** `<>:"|?*\u0000-\u001F`

---

## Performance Considerations

### Large Repos
- Branch list can grow unbounded → UI sluggishness (Issue #10)
- Consider pagination or virtualization for repos with 1000+ branches

### Folder Picker
- Request deduplication needed to prevent duplicate API calls (Issue #12)
- Debounce rapid navigation to reduce load

### Token Exports
- Deterministic ordering ensures minimal diffs
- Normalization keeps exports stable across runs

---

## Useful Commands

```bash
# Development
npm run build           # Build plugin once
npm run watch           # Rebuild on changes
npm run typecheck       # Validate TypeScript

# Testing
tsc -p tests/tsconfig.test.json    # Compile tests
node tests/dist/<test-file>.js     # Run specific test

# Git
git status              # Check working tree
git diff                # See changes
git log --oneline -10   # Recent commits
```

---

## Key Documents

### User Documentation
- [README.md](README.md) - Project overview and quickstart
- [docs/designer-github-guide.md](docs/designer-github-guide.md) - GitHub integration guide for designers
- [docs/github-pat-designer-guide.md](docs/github-pat-designer-guide.md) - Personal Access Token setup guide

### Bug Tracking
- [docs/bugs/GitHub Folder Picker & Import bugs.md](docs/bugs/GitHub%20Folder%20Picker%20&%20Import%20bugs.md) - Comprehensive bug list with fix plans

### External References
- [W3C DTCG Specification](https://design-tokens.github.io/community-group/format/) - Token format spec
- [Figma Plugin API](https://www.figma.com/plugin-docs/) - Figma plugin documentation
- [GitHub REST API](https://docs.github.com/en/rest) - GitHub API documentation

---

## Decision Log

### Why Intermediate Representation (IR)?
- Decouples Figma-specific code from DTCG-specific code
- Enables validation in a format-agnostic way
- Simplifies adding new formats in the future
- Ensures deterministic exports

### Why No UI Framework?
- Minimal bundle size for fast plugin load
- Full control over DOM for Figma sandbox compatibility
- No external dependencies to maintain
- Simple event handling sufficient for use case

### Why Base64 for Token Storage?
- Figma plugin API doesn't provide encryption APIs
- Base64 prevents accidental exposure in logs
- Documented limitation in UI to set user expectations
- Recommend minimal-scope tokens to reduce risk

### Why Deterministic Ordering?
- Version control diffs stay minimal and meaningful
- Easier to review changes in token files
- Prevents spurious changes from re-ordering
- Enables reliable diffing in CI/CD pipelines

---

## Getting Help

### For Code Issues
1. Check [docs/bugs/GitHub Folder Picker & Import bugs.md](docs/bugs/GitHub%20Folder%20Picker%20&%20Import%20bugs.md) for known issues
2. Review code comments in relevant files
3. Check TypeScript types for expected interfaces
4. Run `npm run typecheck` to catch type errors

### For Architecture Questions
1. Review this document for patterns and conventions
2. Check `src/core/` for shared infrastructure
3. Look at `src/adapters/` for format translation examples
4. Review `src/app/messages.ts` for IPC contracts

### For Build Issues
1. Run `npm install` to ensure dependencies are current
2. Check `esbuild.config.mjs` for build configuration
3. Ensure `dist/` directory exists and has write permissions
4. Verify Node.js version is v18+ LTS

---

## Quick Reference: File Navigation

Need to...
- **Add new token type?** → Start in `src/core/ir.ts`, then adapters
- **Fix GitHub bug?** → Check `src/app/github/` directory
- **Modify UI?** → `src/app/ui.ts` and `src/app/ui.html`
- **Change import logic?** → `src/core/pipeline.ts` and `src/adapters/dtcg-reader.ts`
- **Change export logic?** → `src/core/pipeline.ts` and `src/adapters/dtcg-writer.ts`
- **Fix color handling?** → `src/core/color.ts`
- **Fix path normalization?** → `src/core/normalize.ts` or `src/app/github/folders.ts`
- **Add GitHub feature?** → `src/app/github/dispatcher.ts` and `src/core/github/api.ts`
- **Update message types?** → `src/app/messages.ts`

---

**Last Updated:** 2025-11-07
**Maintainer:** See repository for contributor information
**License:** See package.json
