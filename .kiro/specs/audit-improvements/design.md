# Audit Improvements - Design

**Feature**: 감사 보고서 기반 앱 품질 개선
**Status**: Design
**Last Updated**: 2026-08-08

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Audit Improvements                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  P0: Security & Data Safety                                 │
│  ├─ Library Flush Integration                               │
│  ├─ CSP Hardening (nonce/hash)                             │
│  ├─ Capability Minimization                                 │
│  └─ Path Validation Hardening                               │
│                                                              │
│  P1: Structure & Maintainability                            │
│  ├─ SettingsContext                                         │
│  ├─ useAppActions Tests                                     │
│  └─ Feature Extraction                                      │
│                                                              │
│  P2: Infrastructure & DX                                    │
│  ├─ Package Engines                                         │
│  ├─ Local Version Check                                     │
│  ├─ Clippy CI                                               │
│  └─ E2E Smoke Tests                                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Design Decisions

### DD-1: Library Flush Strategy
**Decision**: Investigate first, then implement based on findings

**Options Considered**:
1. Add `flushLibrary` to `flushPendingAppWrites` signature
2. Library auto-persists via useLibraryFolders (verify this)
3. Separate library flush mechanism with debounce

**Chosen**: Option 1 (conditional on investigation)

**Rationale**:
- Consistent with existing flush pattern (entries, settings, exams)
- Centralized close guard logic
- 15s timeout already accounts for multiple flushes

**Investigation Steps**:
```typescript
// 1. Check useLibraryFolders implementation
//    - Does mutate() call localStorage.setItem immediately?
//    - Or does it queue writes?

// 2. Test race condition
//    - Create folder → immediately close app
//    - Check if folder persists

// 3. If race exists, add flush
```

### DD-2: CSP Unsafe-Inline Removal
**Decision**: Vite plugin + manual nonce for KaTeX

**Options Considered**:
1. Vite plugin-csp with auto-nonce injection
2. Manual nonce generation in index.html
3. Hash-based CSP (brittle for dynamic builds)
4. Keep unsafe-inline (rejected for security)

**Chosen**: Option 1 (Vite plugin) with fallback to Option 2

**Implementation**:
```typescript
// vite.config.ts
import csp from 'vite-plugin-csp';

export default defineConfig({
  plugins: [
    react(),
    csp({
      algorithm: 'sha256',
      // or nonce: true
    })
  ]
});
```

**Affected Components**:
- KaTeX: Already uses external script, verify no inline eval
- React inline handlers: React 19 uses DOM listeners (verify)
- MathText.tsx: Check for dangerouslySetInnerHTML with scripts

**Verification**:
```bash
# Build and check CSP violations
npm run build
npm run tauri dev
# Open DevTools → Console → Check for CSP errors
```

### DD-3: Filesystem Capability Audit
**Decision**: Remove `fs:allow-appdata-write-recursive` if FE doesn't use plugin-fs

**Investigation**:
```bash
grep -r "@tauri-apps/plugin-fs" src/
grep -r "invoke.*write.*file" src/
```

**Expected Outcome**:
- If no FE usage: Remove capability entirely
- If FE uses: Restrict to specific subdirectories
  ```json
  {
    "permissions": [
      "fs:allow-appdata-read",
      "fs:allow-write-text-file",
      "fs:scope-appdata-images"
    ]
  }
  ```

**Rollback Plan**:
If removal breaks app, add minimal scoped permissions.

### DD-4: Save Image Path Hardening
**Decision**: Replace string path with dialog selection

**Current Flow**:
```rust
#[tauri::command]
fn save_image(source_path: String) -> Result<String> {
    // Takes arbitrary path, copies to images/
}
```

**New Flow**:
```rust
#[tauri::command]
fn save_image_from_dialog(app: AppHandle) -> Result<String> {
    let source_path = dialog::FileDialog::new()
        .add_filter("Images", &["png", "jpg", "jpeg", "webp", "gif"])
        .pick_file()
        .ok_or("No file selected")?;
    
    // Canonicalize and validate prefix
    let canonical = source_path.canonicalize()?;
    // Rest of logic...
}
```

**Frontend Changes**:
```typescript
// Old
await invoke('save_image', { sourcePath });

// New
await invoke('save_image_from_dialog');
// Dialog is shown by Rust backend
```

**Affected Workflows**:
- Manual image attachment in EntryForm
- Image preprocessing in ImportFromGptModal

### DD-5: SettingsContext Architecture
**Decision**: Single SettingsContext with scoped controllers

**Structure**:
```typescript
// contexts/SettingsContext.tsx
interface SettingsContextValue {
  // State
  settings: AppSettings;
  loading: boolean;
  error: string | null;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  
  // Controllers (grouped by tab)
  theme: {
    current: ThemeMode;
    set: (theme: ThemeMode) => void;
  };
  ai: {
    status: AiProviderStatus | null;
    keyInput: string;
    setKeyInput: (value: string) => void;
    updateConfig: (patch: Partial<AiProviderSettings>) => Promise<void>;
    storeKey: () => Promise<void>;
    removeKey: () => Promise<void>;
  };
  view: {
    preferences: ViewPreferences;
    patch: (patch: Partial<ViewPreferences>) => Promise<void>;
  };
  // ... similar for exam, images, gptMcp, chatGpt, data, templates, advanced, updates
  
  // Generic
  message: string | null;
  setMessage: (msg: string | null) => void;
  clearError: () => void;
  retrySave: () => Promise<void>;
}
```

**Provider Setup**:
```typescript
// App.tsx
<SettingsProvider>
  <ThemeProvider> {/* Nested for theme-specific logic */}
    <AppContent />
  </ThemeProvider>
</SettingsProvider>
```

**Migration Path**:
1. Create SettingsContext with all existing functions
2. Wrap App with SettingsProvider
3. Update SettingsModal to use useSettings() hook
4. Remove props from App → SettingsModal chain
5. Keep backward compat for other consumers initially

### DD-6: useAppActions Test Strategy
**Decision**: Vitest + React Testing Library + Comprehensive mocks

**Test Structure**:
```typescript
// src/hooks/useAppActions.test.ts
describe('useAppActions', () => {
  const mockEntries = [/* fixtures */];
  const mockSettings = {/* fixtures */};
  
  // Mock all dependencies
  const mockAddEntry = vi.fn();
  const mockUpdateEntry = vi.fn();
  const mockPatchEntry = vi.fn();
  // ...
  
  describe('handleSave', () => {
    it('saves new entry', async () => { /* ... */ });
    it('updates existing entry', async () => { /* ... */ });
    it('handles duplicate detection', async () => { /* ... */ });
    it('rolls back on error', async () => { /* ... */ });
  });
  
  describe('handleImportedEntriesApply', () => {
    it('imports single entry', async () => { /* ... */ });
    it('imports batch with assets', async () => { /* ... */ });
    it('handles tauri-staged session', async () => { /* ... */ });
  });
  
  // ... more test suites
});
```

**Coverage Target**: 70% line coverage minimum
**Focus Areas**:
- CRUD operations (save, import, delete)
- Error handling and rollback
- Backup/restore logic
- Review workflows

### DD-7: Feature Extraction Plan
**Decision**: Phased extraction with smart_relocate

**Phase 1: entries feature**
```
src/features/entries/
├── components/
│   ├── EntryForm.tsx          (from src/components/)
│   ├── EntryDetail.tsx        (from src/components/)
│   └── EntryListPane.tsx      (already in components, move optionally)
├── hooks/
│   └── useEntryForm.ts        (extract from EntryForm logic)
├── model/
│   └── entryDraft.ts          (already exists, keep)
├── services/
│   └── entryValidation.ts     (extract from EntryForm)
└── index.ts                   (public API)
```

**Phase 2: import feature**
```
src/features/import/
├── components/
│   ├── ImportFromGptModal.tsx (from src/components/)
│   ├── ImportPreviewSummary.tsx (already exists in components/)
│   └── ConceptImportPreviewModal.tsx (from src/components/)
├── services/
│   ├── importStudyText.ts     (already in utils, move)
│   ├── importValidation.ts    (already in utils, move)
│   └── zipImport.ts           (already in features/import/services/)
└── index.ts
```

**Relocation Commands**:
```bash
# Use smart_relocate for automatic import updates
kiro relocate src/components/EntryForm.tsx src/features/entries/components/EntryForm.tsx
kiro relocate src/components/EntryDetail.tsx src/features/entries/components/EntryDetail.tsx
kiro relocate src/components/ImportFromGptModal.tsx src/features/import/components/ImportFromGptModal.tsx
```

**Validation**:
- `npm run build` succeeds
- `npm run lint` passes
- `npm run test` passes
- Manual smoke test: Create/edit/import entry

### DD-8: Package Engines
**Decision**: Strict engines with >=24.0.0

**Implementation**:
```json
// package.json
{
  "engines": {
    "node": ">=24.0.0",
    "npm": ">=10.0.0"
  },
  "engineStrict": false  // Warn but don't fail
}
```

**Rationale**:
- CI uses Node 24
- README states 18+, but audit recommends 24
- engineStrict: false allows flexibility for local dev

### DD-9: Version Check in Local
**Decision**: Add to check script

**Implementation**:
```json
// package.json
{
  "scripts": {
    "check": "npm run lint && npm run check:debug && npm run check:mcp-contract && npm run check:tauri-contract && npm run version:check && npm run test && npm run build"
  }
}
```

**Order**: After contracts, before test (fast fail)

### DD-10: Clippy CI Integration
**Decision**: Clippy with warnings allowed initially

**Implementation**:
```yaml
# .github/workflows/ci.yml
- name: Cargo clippy
  working-directory: src-tauri
  run: cargo clippy --all-targets --all-features
  # Initially no -- -D warnings (allow warnings)
  # After fixing warnings, add: -- -D warnings
```

**Phased Approach**:
1. Add clippy to CI (report only)
2. Fix existing warnings in separate PR
3. Enable `-D warnings` (treat as errors)

### DD-11: E2E Smoke Tests
**Decision**: Playwright with Tauri WebDriver

**Setup**:
```typescript
// e2e/setup.ts
import { _electron as electron } from '@playwright/test';

export async function launchApp() {
  const app = await electron.launch({
    args: ['path/to/tauri/app']  // Adjust for Tauri
  });
  const window = await app.firstWindow();
  return { app, window };
}
```

**Test Cases**:
```typescript
// e2e/smoke.spec.ts
test('creates and saves entry', async () => {
  const { window } = await launchApp();
  
  // Navigate to new entry
  await window.click('[data-testid="new-entry-btn"]');
  
  // Fill form
  await window.fill('[data-testid="title-input"]', 'Test Entry');
  await window.fill('[data-testid="question-textarea"]', 'Test question');
  
  // Save
  await window.click('[data-testid="save-btn"]');
  
  // Verify
  await expect(window.locator('[data-testid="entry-list"]')).toContainText('Test Entry');
});

test('creates and restores backup', async () => {
  // Similar structure
});

test('persists settings across restart', async () => {
  // Similar structure
});
```

**CI Integration** (optional initially):
```yaml
# .github/workflows/ci.yml
e2e:
  name: E2E Smoke Tests
  runs-on: windows-latest
  needs: tauri-build
  steps:
    # Build Tauri app
    # Run playwright e2e tests
```

## Data Model Changes

### Library Folders Flush
**No schema changes**, only persistence timing.

### Settings Context
**No schema changes**, only consumption pattern.

## API Changes

### Modified Rust Commands

#### Before:
```rust
#[tauri::command]
fn save_image(app: AppHandle, source_path: String) -> Result<String>
```

#### After:
```rust
#[tauri::command]
fn save_image_from_dialog(app: AppHandle) -> Result<String>

// Keep old for backward compat initially, deprecate later
#[tauri::command]
#[deprecated(note = "Use save_image_from_dialog")]
fn save_image(app: AppHandle, source_path: String) -> Result<String>
```

### Modified TS APIs

#### Before:
```typescript
// App.tsx
<SettingsModal
  settings={settings}
  patchSettings={patchSettings}
  theme={theme}
  setTheme={setTheme}
  aiProviderStatus={aiProviderStatus}
  // ... 50+ more props
/>
```

#### After:
```typescript
// App.tsx
<SettingsProvider value={settingsContextValue}>
  <SettingsModal
    open={showSettings}
    onClose={() => setShowSettings(false)}
    initialTab={settingsInitialTab}
  />
</SettingsProvider>
```

## File Structure Changes

### Before:
```
src/
├── components/
│   ├── EntryForm.tsx        (~1,200 lines)
│   ├── EntryDetail.tsx      (~2,100 lines)
│   ├── ImportFromGptModal.tsx (~1,500 lines)
│   └── SettingsModal.tsx    (~815 lines, 57 props)
├── hooks/
│   └── useAppActions.ts     (~840 lines, no tests)
└── services/
    └── flushAppWrites.ts    (missing library)
```

### After:
```
src/
├── components/
│   └── SettingsModal.tsx    (~815 lines, <10 props)
├── contexts/
│   └── SettingsContext.tsx  (new)
├── features/
│   ├── entries/
│   │   └── components/
│   │       ├── EntryForm.tsx
│   │       └── EntryDetail.tsx
│   └── import/
│       └── components/
│           └── ImportFromGptModal.tsx
├── hooks/
│   ├── useAppActions.ts
│   └── useAppActions.test.ts (new)
└── services/
    └── flushAppWrites.ts    (includes library)
```

## Security Model

### Threat Mitigation Matrix

| Threat | Before | After | Mitigation |
|--------|--------|-------|------------|
| XSS → RCE | CSP allows inline scripts → Full Tauri invoke access | CSP blocks inline → Attacker cannot inject arbitrary invokes | CSP hardening |
| Arbitrary File Write | fs:allow-appdata-write-recursive + XSS | No FE filesystem access | Capability removal |
| Arbitrary File Read | save_image accepts any path | Dialog-only or validated paths | Path hardening |
| Data Loss | Library flush missing | Library flush in close guard | Flush integration |

### CSP Policy Evolution

#### Before:
```
script-src 'self' 'unsafe-inline' ipc: http://ipc.localhost;
```

#### After:
```
script-src 'self' 'nonce-{RANDOM}' ipc: http://ipc.localhost;
```

**Nonce Rotation**: Generated per-build by Vite plugin.

## Testing Strategy

### Unit Tests
- **Target**: useAppActions.ts (0% → 70%)
- **Tools**: Vitest + React Testing Library
- **Scope**: CRUD, import, backup, review logic

### Integration Tests
- **Existing**: Contract tests (MCP, Tauri commands) ✅
- **New**: Settings Context integration

### E2E Tests
- **New**: 3 smoke tests (create, backup, settings)
- **Tool**: Playwright + Tauri WebDriver
- **Scope**: Happy path only initially

### Manual Testing Checklist
- [ ] Library folder CRUD + immediate close
- [ ] All settings tabs functional
- [ ] Image import with new dialog
- [ ] CSP errors in DevTools: 0
- [ ] Backup/restore full cycle

## Performance Considerations

### Library Flush Overhead
- **Estimate**: +10-50ms to close sequence
- **Acceptable**: Within 15s timeout
- **Mitigation**: If slow, debounce library mutations

### CSP Impact
- **Build Time**: Vite plugin adds ~100-200ms
- **Runtime**: No impact (nonce is compile-time)

### Feature Extraction
- **Bundle Size**: Neutral (code moved, not added)
- **Load Time**: Potential for lazy loading (future)

## Rollback Plan

### P0 Rollbacks
- **CSP**: Revert to unsafe-inline if critical component breaks
- **Capability**: Re-add fs:allow-appdata-write-recursive if app breaks
- **save_image**: Keep old command, deprecate slowly

### P1 Rollbacks
- **SettingsContext**: Context is additive, old props still work
- **Feature Extraction**: Git revert smart_relocate commits

### P2 Rollbacks
- **All P2**: Config changes only, trivial rollback

## Deployment Strategy

### Phase 1: P0 Critical (Week 1)
1. Library flush investigation + fix
2. CSP hardening (with fallback)
3. Capability audit + removal
4. save_image path validation

**Checkpoint**: Security audit clean

### Phase 2: P1 Structure (Week 2)
1. SettingsContext (backward compat)
2. useAppActions tests
3. Feature extraction (entries first)

**Checkpoint**: Test coverage >70%, build succeeds

### Phase 3: P2 Infrastructure (Week 3)
1. Package engines
2. Local version:check
3. Clippy CI (report mode)
4. E2E setup (manual run)

**Checkpoint**: CI green, DX improved

### Phase 4: Hardening (Week 4)
1. Remove CSP fallback
2. Clippy -D warnings
3. E2E in CI (optional)
4. Deprecate old save_image

## Open Issues

### OI-1: Library Persistence Mechanism
**Status**: Needs investigation  
**Blocker for**: P0-1 (Library Flush)  
**Action**: Trace useLibraryFolders.mutate()

### OI-2: FE Plugin-FS Usage
**Status**: Needs grep audit  
**Blocker for**: P0-3 (Capability Removal)  
**Action**: `grep -r "@tauri-apps/plugin-fs" src/`

### OI-3: KaTeX Inline Scripts
**Status**: Needs component audit  
**Blocker for**: P0-2 (CSP Hardening)  
**Action**: Check MathText.tsx rendering

### OI-4: Playwright Tauri Integration
**Status**: Needs research  
**Blocker for**: P2-4 (E2E)  
**Action**: Check Tauri docs, GitHub discussions

### OI-5: Current Clippy Warnings
**Status**: Needs baseline  
**Blocker for**: P2-3 (Clippy CI)  
**Action**: Run `cargo clippy` locally, count warnings

## Success Metrics (Repeated from Requirements)

- [ ] Library: 0% data loss after immediate close
- [ ] CSP: 0 violations in DevTools
- [ ] Capability: fs removed or justified
- [ ] Path: save_image traversal blocked
- [ ] Settings: Props 57 → <10
- [ ] Tests: useAppActions 0% → 70%
- [ ] Components: Large files 3 → 0
- [ ] Engines: Field exists
- [ ] Check: version:check included
- [ ] CI: Clippy job exists
- [ ] E2E: 1-3 tests exist

## Appendix: Investigation Scripts

### Script 1: Library Flush Check
```typescript
// Test: Does library mutate immediately persist?
import { useLibraryFolders } from './features/library/hooks/useLibraryFolders';

const { mutate } = useLibraryFolders();

// Create folder
await mutate(current => [...current, newFolder]);

// Immediately read from storage
const stored = localStorage.getItem('library-folders');
console.log('Immediate persistence:', stored.includes(newFolder.id));
```

### Script 2: FE Filesystem Audit
```bash
#!/bin/bash
echo "=== FE Filesystem Usage Audit ==="
echo "Plugin-fs imports:"
grep -rn "@tauri-apps/plugin-fs" src/ || echo "None found"

echo "\nDirect fs invokes:"
grep -rn "invoke.*fs\." src/ || echo "None found"

echo "\nPlugin-fs API usage:"
grep -rn "readTextFile\|writeTextFile\|readDir\|createDir" src/ || echo "None found"
```

### Script 3: CSP Inline Detector
```bash
#!/bin/bash
echo "=== Inline Script Detector ==="
echo "dangerouslySetInnerHTML usage:"
grep -rn "dangerouslySetInnerHTML" src/

echo "\nInline event handlers (old React style):"
grep -rn 'onClick="' src/ || echo "None found (good)"
grep -rn "onclick=" src/ || echo "None found (good)"

echo "\neval() usage:"
grep -rn "eval(" src/ || echo "None found (good)"
```

### Script 4: Clippy Baseline
```bash
#!/bin/bash
cd src-tauri
echo "=== Clippy Baseline ==="
cargo clippy --all-targets --all-features 2>&1 | tee clippy-baseline.txt
echo "\n=== Summary ==="
grep -c "warning:" clippy-baseline.txt || echo "0"
echo "warnings found"
```

---

**Design Status**: ✅ Complete  
**Next Step**: Generate Tasks.md from this design
