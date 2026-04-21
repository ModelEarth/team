# Key Management Unification Plan

## Goal

Consolidate all API key storage and entry UI into the **`chat` repo**, using its existing `settings_api-keys` localStorage format as the canonical store. The embeddable widget is authored once in `chat` and shared as a pre-built static JS file into `team/projects`, `requests/engine`, and any other repo. The `requests/engine/agents/agents.js` file is retired once its functionality is superseded.

Do not commit automatically while implementing this plan.

---

## Repo Overview (from AGENTS.md)

| Repo | Role | Served at |
|---|---|---|
| `localsite` | Shared frontend JS/CSS framework used by all repos | static |
| `team` | Rust API (port 8081) + CRM frontend (no build) | `localhost:8887/team/` |
| `requests` | Agent/tools frontend (no build) | `localhost:8887/requests/` |
| `chat` | Next.js AI chat app — requires `next dev` or `next start` | its own port (3000) |
| webroot | Python static server (port 8887) serves everything else | root |

`chat/` is a Next.js app — it cannot be served by the Python static server. However, static files placed inside `chat/` (outside the Next.js build pipeline) **are** accessible at `localhost:8887/chat/` when the Python server is running.

---

## Current State

### Storage formats in use

| Location | localStorage key | Format | Providers |
|---|---|---|---|
| `chat` settings | `settings_api-keys` | `{ google?, anthropic?, openai? }` | 3 hardcoded |
| `requests/engine/agents.js` | `aPro` | `{ GEMINI_API_KEY: "...", ... }` | 10 + Other |
| `team/projects/index.html` | `${aiType}_api_key` | one key per entry | any |

### Key management UIs

**`chat` settings page** (`/settings`, `components/settings/settings-page.tsx`):
- Three hardcoded `<APIKeySection>` cards: Google, Anthropic, OpenAI
- Each card has: password input, show/hide toggle, clear button, live "Verify" button (makes real API call to the provider)
- Reads/writes via `storage.apiKeys.get/set/remove(provider)` → `LocalStorageManager` singleton → `settings_api-keys` in localStorage

**`requests/engine/agents.js`** (`#apiProviderMenu`):
- Provider `<select>` (10 providers + Other) → shows key input → Save → stored in `aPro`
- Undo (5-min expiry), Copy to clipboard in `.env` format, Clear All, blur/reveal toggle
- Self-contained IIFE rendered into `#agentsContainer`

**`chat` model selector** (`components/model-selector.tsx`):
- Two-level dropdown: provider name (with model count) → submenu of enabled models
- Only shows providers/models where `providerConfig.enabled === true` and `modelConfig.enabled === true`
- Currently hides providers/models that have no key or are disabled — needs to show all with an availability indicator

**`team/projects/index.html`**:
- `initializeLLMButtons()` renders one button per LLM_CONFIGS entry in `#insightsStatus` (always shown)
- On click → `showRefreshPrompt()` → `checkAndShowApiKeyManagement()` — checks `${aiType}_api_key` in localStorage, then Rust server `/api/config/current`
- No-key path: shows plain `<input>` + description + link in a modal; disables prompt section

---

## Canonical Storage: `settings_api-keys`

Going forward, all browser-side key storage uses `localStorage['settings_api-keys']` with the chat repo's format, expanded to support more providers:

```ts
// Expanded schema (chat/lib/storage/types.ts)
type APIKeysStore = {
  // existing
  google?: string;
  anthropic?: string;
  openai?: string;
  // new
  xai?: string;
  groq?: string;
  together?: string;
  fireworks?: string;
  mistral?: string;
  perplexity?: string;
  deepseek?: string;
};
```

**Priority order** when resolving a key:
1. `settings_api-keys` (browser localStorage) — set by user in this browser
2. `docker/.env` via server API (Rust `/api/config/current` or Next.js server-side env) — administrator-set fallback
3. _(legacy migration only)_ `aPro` and `${aiType}_api_key` — read once on first load, migrated, then removed

---

## Provider / Model Registry

The `chat` repo is the source of truth for the provider + model list. Add a static registry file that both the Next.js app and the embeddable widget can read:

**`chat/lib/providers.ts`** (and a plain-JS copy at **`chat/key/providers.js`** for the static widget):

```ts
export type ProviderConfig = {
  id: string;           // storage key: 'google', 'anthropic', 'openai', 'xai', ...
  name: string;         // display name: 'Google', 'Anthropic', ...
  keyPlaceholder: string;
  keyHint: string;      // e.g. 'AIza...'
  getKeyUrl: string;    // link to get the key
  models: ModelConfig[];
};

export type ModelConfig = {
  id: string;           // e.g. 'gemini-2.5-flash'
  name: string;         // e.g. 'Gemini 2.5 Flash'
  description: string;
  isDefault: boolean;
  active: boolean;      // show in selector by default
};
```

This replaces the DB-only `adminConfig` for the purposes of the embeddable widget (which cannot query the DB).

---

## Architecture: Embeddable Key Manager

### Source (Next.js, in `chat` repo)

**`chat/components/key-manager/`** — new folder:

```
key-manager/
  KeyManagerWidget.tsx     # React component wrapping the full UI
  KeyManagerPanel.tsx      # The API keys tab content, embeddable in settings or sidebar
  ModelSelectorPanel.tsx   # Provider+model selector adapted from ModelSelector.tsx
  useKeyManager.ts         # hook: reads/writes settings_api-keys, exposes key presence per provider
```

`KeyManagerPanel` renders:
- For each provider (all providers, not just those with keys):
  - Provider row: icon, name, model count, availability indicator
    - 🔒 (lock icon) if no key stored → clicking opens key entry inline
    - ✅ (green check) if key stored
  - When expanded / entering key: same `APIKeySection` card as current settings page (password input, show/hide, clear, verify)
- "Where to get your key" link per provider
- Security notice (keys stored locally, never transmitted)

`ModelSelectorPanel` renders (adapted from `model-selector.tsx`):
- Same two-level dropdown: provider → models
- **Changed**: also shows providers/models without a key; they appear greyed out with 🔒
- Clicking a locked model prompts key entry inline rather than being disabled
- Named container IDs for external targeting: `#km-provider-{id}`, `#km-model-{id}`, `#km-key-input-{id}`

### Static Build Output (embeddable in non-Next.js pages)

**`chat/key/`** — new subfolder, committed to the repo and served statically at `localhost:8887/chat/key/`:

```
chat/key/
  index.html        # Standalone key settings page (no Next.js required)
  key-manager.js    # Self-contained JS bundle (no React, no build needed)
  providers.js      # Static copy of provider + model registry
  style.css         # Styles for the widget (can reference localsite base.css for non-Next pages)
```

`key-manager.js` is a **vanilla JS** implementation (not a React bundle) that:
- Renders the full key management UI into any container element via `KeyManager.init(el, options)`
- Reads/writes `settings_api-keys` in localStorage (same format as the Next.js `LocalStorageManager`)
- Shows all providers with 🔒/✅ availability indicators
- Shows models within each provider
- Includes inline key entry (password input, show/hide, clear)
- No external dependencies beyond `providers.js`
- Can be included in `team/projects/index.html`, `requests/engine/`, etc. via `<script src="/chat/key/key-manager.js">`

`index.html` at `localhost:8887/chat/key/`:
- Standalone HTML page using `key-manager.js` + `providers.js`
- Shows the full key management UI (all providers and their models)
- Uses localsite `base.css` for consistent styling
- Works as a reference implementation and as a user-facing settings page
- Links to the chat app's `/settings` for the full Next.js experience when available

---

## Phase 1 — Expand `chat` Storage Schema

**Files:** `chat/lib/storage/types.ts`, `chat/lib/storage/local-storage-manager.ts`

1. Expand `LocalStorageSchema["api-keys"]` to include `xai?`, `groq?`, `together?`, `fireworks?`, `mistral?`, `perplexity?`, `deepseek?`
2. Expand `APIProvider` type from `"google" | "anthropic" | "openai"` to include the new providers
3. `LocalStorageManager.getAPIKey/setAPIKey/removeAPIKey` already work generically — no logic change needed beyond type widening
4. Add a `migrateFromLegacy()` method that runs once on init:
   - Reads `aPro` (JSON), maps env-var keys (e.g. `GEMINI_API_KEY`) to provider IDs (`google`), writes to `settings_api-keys`, removes `aPro`
   - Reads per-key entries (`gemini_api_key`, `claude_api_key`, etc.), migrates, removes them

---

## Phase 2 — Update `chat` Model Selector

**File:** `chat/components/model-selector.tsx`

Current behavior: filters out providers/models where `enabled === false`.

New behavior:
- Show **all** providers from config (both enabled and disabled)
- Show **all** models per provider (both active and inactive)
- For providers where the user has no key stored: show 🔒 icon next to provider name in the submenu trigger
- For providers where key is present: show ✅ icon
- Model items in providers without a key: render greyed out with a "Add key to use" note
- Clicking a locked provider's submenu trigger (or a locked model) opens `KeyManagerPanel` focused on that provider instead of selecting the model

Add named IDs to the rendered elements:
- `id="km-model-selector"` on the root `<DropdownMenu>` wrapper
- `id="km-provider-{providerId}"` on each `<DropdownMenuSub>`
- `id="km-model-{modelId}"` on each `<DropdownMenuItem>`

---

## Phase 3 — Add Lock Icon to Chat Sidebar

**File:** `chat/components/app-sidebar.tsx`

Add a padlock button to the `SidebarHeader` action row (alongside the existing Trash and Plus buttons):

```tsx
import { LockIcon } from "@/components/icons";

// In the button row:
<Tooltip>
  <TooltipTrigger asChild>
    <Button
      id="km-sidebar-lock-btn"
      className="h-8 p-1 md:h-fit md:p-2"
      onClick={() => router.push("/settings")}
      type="button"
      variant="ghost"
      aria-label="API Keys"
    >
      <LockIcon size={16} />
    </Button>
  </TooltipTrigger>
  <TooltipContent align="end" className="hidden md:block">
    API Keys
  </TooltipContent>
</Tooltip>
```

When a provider has no key stored, the lock icon shows a small badge (red dot) to draw attention.

Optionally, add an inline `KeyManagerPanel` slide-out within the sidebar (below `SidebarContent`) that expands when the lock icon is clicked, avoiding a full page navigation.

---

## Phase 4 — Build the Embeddable Static Widget

**New files:** `chat/key/key-manager.js`, `chat/key/providers.js`, `chat/key/style.css`, `chat/key/index.html`

### `providers.js`

Static JS file defining the full provider + model list. Manually kept in sync with the DB seed data (`chat/lib/db/migrations/0007_seed_data_model_config.sql`) and the `agents.js` provider list:

```js
window.KeyManagerProviders = [
  {
    id: 'google',
    name: 'Google',
    keyPlaceholder: 'AIza...',
    keyHint: 'Google AI Studio key',
    getKeyUrl: 'https://aistudio.google.com/app/apikey',
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Fast, efficient model', isDefault: true, active: true },
      { id: 'gemini-2.5-pro',   name: 'Gemini 2.5 Pro',   description: 'Most capable Gemini',  isDefault: false, active: true },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Previous generation',  isDefault: false, active: true },
    ]
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    keyPlaceholder: 'sk-ant-...',
    keyHint: 'Anthropic Console key',
    getKeyUrl: 'https://console.anthropic.com/settings/keys',
    models: [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Best balance', isDefault: true, active: true },
      { id: 'claude-3-5-haiku-20241022',  name: 'Claude 3.5 Haiku',  description: 'Fast and compact', isDefault: false, active: true },
    ]
  },
  {
    id: 'openai',
    name: 'OpenAI',
    keyPlaceholder: 'sk-...',
    keyHint: 'OpenAI platform key',
    getKeyUrl: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'gpt-4o',      name: 'GPT-4o',      description: 'Most capable GPT', isDefault: true,  active: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o mini', description: 'Compact and fast', isDefault: false, active: true },
    ]
  },
  { id: 'xai',        name: 'xAI',         keyPlaceholder: 'xai-...', getKeyUrl: 'https://console.x.ai/', models: [] },
  { id: 'groq',       name: 'Groq',        keyPlaceholder: 'gsk_...', getKeyUrl: 'https://console.groq.com/keys', models: [] },
  { id: 'mistral',    name: 'Mistral',     keyPlaceholder: '',        getKeyUrl: 'https://console.mistral.ai/api-keys/', models: [] },
  { id: 'together',   name: 'Together AI', keyPlaceholder: '',        getKeyUrl: 'https://api.together.xyz/settings/api-keys', models: [] },
  { id: 'fireworks',  name: 'Fireworks',   keyPlaceholder: '',        getKeyUrl: 'https://fireworks.ai/account/api-keys', models: [] },
  { id: 'perplexity', name: 'Perplexity',  keyPlaceholder: 'pplx-...', getKeyUrl: 'https://www.perplexity.ai/settings/api', models: [] },
  { id: 'deepseek',   name: 'DeepSeek',    keyPlaceholder: '',        getKeyUrl: 'https://platform.deepseek.com/api_keys', models: [] },
];
```

### `key-manager.js`

Vanilla JS IIFE (`window.KeyManager`). Public API:

```js
KeyManager.init(containerEl, options)  // render full widget into containerEl
KeyManager.get(providerId)             // returns key string or null
KeyManager.set(providerId, value)      // writes to settings_api-keys
KeyManager.has(providerId)             // boolean
KeyManager.remove(providerId)          // deletes from settings_api-keys
KeyManager.getAll()                    // returns full settings_api-keys object
KeyManager.migrateFromLegacy()        // one-time migration from aPro / ${aiType}_api_key
```

Storage uses `localStorage['settings_api-keys']` (same JSON format as the Next.js `LocalStorageManager`).

UI rendered by `init()` into the container:
- Provider list with expand/collapse per provider
  - Header row: `id="km-provider-{id}"` div — provider name, model count, 🔒/✅ icon
  - Collapsed state: click to expand
  - Expanded state: shows `APIKeySection`-equivalent UI (password input with show/hide, clear, verify button, get-key link) and model list
- Model list per provider: `id="km-model-{id}"` for each model row, greyed if no key
- "Add key" inline if no key present: pre-selects the provider, focuses the input
- Saves on blur or explicit Save button click
- No external JS dependencies

### `index.html`

```html
<!DOCTYPE html>
<html>
<head>
  <title>API Key Settings</title>
  <link rel="stylesheet" href="../../localsite/css/base.css">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="km-root"></div>
  <script src="providers.js"></script>
  <script src="key-manager.js"></script>
  <script>
    KeyManager.init(document.getElementById('km-root'));
  </script>
</body>
</html>
```

This page is committed to the repo and served statically at `localhost:8887/chat/key/`. It works with zero build steps and zero server-side dependencies.

---

## Phase 5 — Update `team/projects/index.html`

**Goal:** Replace the current modal key entry with the embeddable `KeyManager` widget.

1. Add script tags for the shared files:
   ```html
   <script src="/chat/key/providers.js"></script>
   <script src="/chat/key/key-manager.js"></script>
   ```

2. In `checkAndShowApiKeyManagement()`, replace `getCachedApiKey(aiType)` with `KeyManager.get(providerId)` where `providerId` maps from `aiType` via `LLM_CONFIG_TO_ENV`:
   ```js
   const AITYPE_TO_PROVIDER = { gemini: 'google', claude: 'anthropic', openai: 'openai', xai: 'xai' };
   ```

3. In the no-key path of `checkAndShowApiKeyManagement()`, instead of the plain `<input>`, call:
   ```js
   KeyManager.init(keyInputSection, { provider: AITYPE_TO_PROVIDER[aiType], compact: true, onSave: () => checkAndShowApiKeyManagement(aiType, llmConfig) });
   ```

4. On first page load, call `KeyManager.migrateFromLegacy()` to sweep `${aiType}_api_key` entries into `settings_api-keys`.

5. Update `checkEnvKeyAvailable()` to also include a check of the Rust server for `xai_api_key_present` (expand `team/src/main.rs` `EnvConfigResponse` to add these fields).

---

## Phase 6 — Update `requests/engine/`

1. Replace `#agentsContainer` logic that currently calls `initAgentsEditor()` (from `agents.js`) with:
   ```html
   <div id="km-agents-root"></div>
   <script src="/chat/key/providers.js"></script>
   <script src="/chat/key/key-manager.js"></script>
   <script>KeyManager.init(document.getElementById('km-agents-root'));</script>
   ```
2. Run `KeyManager.migrateFromLegacy()` on load to migrate existing `aPro` data.
3. Once the above is verified, remove `requests/engine/agents/agents.js`.

---

## Phase 7 — `chat` Settings Page Updates

1. In `settings-page.tsx`: add `KeyManagerPanel` (from Phase 1 React component) alongside or replacing the three hardcoded `APIKeySection` cards. The new panel shows all providers including the new extended ones (xAI, Groq, etc.).
2. The existing `APIKeySection` component is kept as-is and used inside `KeyManagerPanel` for per-provider key entry — no duplication.
3. `APIProvider` type in `types.ts` is widened to include new providers.

---

## What Does NOT Change

- The `LocalStorageManager` singleton and `storage.apiKeys.*` API in `chat` — only the schema is widened
- The Rust API key reading from `.env` — still functions as server-side fallback
- The `chat` verification services (live API call on verify) — unchanged, reused in `KeyManagerPanel`
- The `docker/js/llm-configs.js` and `LLM_CONFIGS` structure in `team/` — add optional `providerId` field only
- Git workflow: use `./git.sh push` only when user explicitly requests

---

## File Summary

| File | Action |
|---|---|
| `chat/lib/storage/types.ts` | Expand `APIProvider` type + `LocalStorageSchema["api-keys"]` |
| `chat/lib/storage/local-storage-manager.ts` | Add `migrateFromLegacy()` |
| `chat/lib/providers.ts` | **New** — canonical provider+model registry (TypeScript) |
| `chat/components/key-manager/KeyManagerWidget.tsx` | **New** — React embeddable widget |
| `chat/components/key-manager/KeyManagerPanel.tsx` | **New** — all-providers key UI |
| `chat/components/key-manager/ModelSelectorPanel.tsx` | **New** — model selector with lock indicators |
| `chat/components/key-manager/useKeyManager.ts` | **New** — hook for key presence state |
| `chat/components/model-selector.tsx` | Show all providers/models; add 🔒/✅ indicators; add IDs |
| `chat/components/app-sidebar.tsx` | Add padlock button to sidebar header |
| `chat/components/settings/settings-page.tsx` | Replace 3 hardcoded sections with `KeyManagerPanel` |
| `chat/key/providers.js` | **New** — static JS copy of provider registry |
| `chat/key/key-manager.js` | **New** — vanilla JS embeddable widget |
| `chat/key/style.css` | **New** — widget styles |
| `chat/key/index.html` | **New** — static settings page at localhost:8887/chat/key/ |
| `team/projects/index.html` | Use `KeyManager.*` instead of `getCachedApiKey`; embed widget in modal |
| `team/src/main.rs` | Add `xai_api_key_present` etc. to `EnvConfigResponse` |
| `requests/engine/agents/agents.js` | **Remove** after Phase 6 migration is verified |
