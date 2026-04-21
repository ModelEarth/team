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
    - check mark (`CheckCircleFillIcon` from `components/icons.tsx` for React components; `lucide-react`'s `Check` is also available for sidebar tab panel content) if key stored
  - When expanded / entering key: same `APIKeySection` card as current settings page (password input, show/hide, clear, verify)
- "Where to get your key" link per provider
- Security notice (keys stored locally, never transmitted)

`ModelSelectorPanel` renders (adapted from `model-selector.tsx`):
- Same two-level dropdown: provider → models
- **Changed**: also shows providers/models without a key; they appear greyed out
- Clicking a locked model prompts key entry inline rather than being disabled
- Named container IDs for external targeting: `id="key-provider-{id}`, `id="key-model-{id}`, `#key-key-input-{id}`

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
- Shows all providers with lock/check mark availability indicators
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

## Progress

| Phase | Status |
|---|---|
| Phase 1 — Expand `chat` Storage Schema | Complete |
| Phase 1b — Encrypt Keys at Rest | Complete |
| Phase 2 — Update `chat` Model Selector | Complete |
| Phase 3 — Show list of all models in Chat Sidebar | Complete |
| Phase 4 — Build the Embeddable Static Widget | Complete |
| Phase 5 — Update `team/projects/index.html` | Complete |
| Phase 6 — Update `requests/engine/` | Complete |
| Phase 7 — `chat` Settings Page Updates | Complete |
| Phase 8 — Server-Side .env Key Indicators | Not started |
| Phase 9 — Asymmetric Key Encryption (Server-Only Decryption) | Not started |

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

## Phase 1b — Encrypt Keys at Rest

Keys stored in `settings_api-keys` are encrypted so they are only decryptable within the same browser that saved them, preventing a JavaScript injection attack from reading a plaintext key out of localStorage.

### Mechanism — Web Crypto API with a non-extractable browser key

On first use, generate a non-extractable AES-GCM `CryptoKey` via `crypto.subtle.generateKey()` and persist it in **IndexedDB** (not localStorage). Because the key is non-extractable, JavaScript can call `crypto.subtle.encrypt/decrypt()` with it but can never read its raw bytes — it is therefore inaccessible to injected scripts that can only read storage values.

```
IndexedDB['km-store']['browser-key']  →  CryptoKey (non-extractable, AES-GCM 256-bit)
localStorage['settings_api-keys']     →  { google: "<iv>:<ciphertext base64>", ... }
```

The browser key is unique per browser profile and origin. It is never transmitted and cannot be exported. Keys encrypted in one browser cannot be decrypted in another — which is why the export window exists (see below).

### `chat/lib/storage/crypto.ts` — new file

Responsibilities:
- `initBrowserKey()` — retrieve existing key from IndexedDB, or generate and store a new one
- `encryptValue(plaintext)` — encrypt a string, return `"<iv base64>:<ciphertext base64>"`
- `decryptValue(stored)` — decrypt a stored string, return plaintext
- `isEncrypted(value)` — detect whether a stored value is already in encrypted format (for migration of plaintext legacy entries)

### Changes to `LocalStorageManager`

- On `setAPIKey(provider, value)`: encrypt `value` before writing to `settings_api-keys`
- On `getAPIKey(provider)`: decrypt the stored value before returning
- On `migrateFromLegacy()`: after migrating plaintext entries from `aPro` / `${aiType}_api_key`, immediately encrypt them
- Record `settings_api-keys-last-edit` timestamp in localStorage on every `setAPIKey` call

### Export window — 1 hour after last edit

The `.env` format export (replacing the output textarea from `requests/engine/agents.js`) is only available within **1 hour** of the most recent key edit:

- Check `Date.now() - parseInt(localStorage['settings_api-keys-last-edit']) < 3_600_000`
- If within window: show "Export as .env" button; clicking decrypts all keys and displays them in a blurred textarea (same reveal-on-focus pattern as `agents.js`), formatted as `PROVIDER_API_KEY=value` lines
- If outside window: button is hidden; only a note explaining that editing any key re-opens the 1-hour window is shown

### UI additions in `KeyManagerPanel`

- **"Encrypt Now" button** — visible whenever a key has been entered or edited in the current session but the 1-hour export window is still open. Clicking immediately closes the export window (sets `settings_api-keys-last-edit` to 0) and confirms encryption is active. This is the user's way of saying "I'm done transferring — lock it down now."
- **Info icon** (ℹ) next to the "Encrypt Now" button and the export section — opens an inline tooltip or expand panel explaining:
  - Keys are encrypted with a key stored in your browser that cannot be read by JavaScript
  - Encrypted keys cannot be used in another browser without re-entering them
  - The 1-hour export window lets you copy keys to another browser or to a `.env` file
  - "Encrypt Now" closes the export window immediately
- The existing show/hide (eye) toggle on key inputs continues to work — it decrypts transiently for display only, never writes plaintext back to storage

### Encryption in the vanilla JS widget (`chat/key/key-manager.js`)

The same `initBrowserKey` / `encryptValue` / `decryptValue` logic is duplicated (or imported as a small shared utility) in the static vanilla JS widget, so encryption works identically on `localhost:8887/chat/key/` and in `team/projects/index.html`.

---

## Phase 2 — Update `chat` Model Selector

**File:** `chat/components/model-selector.tsx`

Current behavior: filters out providers/models where `enabled === false`.

New behavior:
- Show **all** providers from config (both enabled and disabled)
- Show **all** models per provider (both active and inactive)
- For providers where key is present: show a check icon using the material icon library (or whatever icon system is already in use) rather than a font emoji
- Model items in providers without a key: render greyed out with a "Add key to use" note
- Clicking a locked provider's submenu trigger (or a locked model) opens `KeyManagerPanel` focused on that provider instead of selecting the model

Add named IDs to the rendered elements:
- `id="key-model-selector"` on the root `<DropdownMenu>` wrapper
- `id="key-provider-{providerId}"` on each `<DropdownMenuSub>`
- `id="key-model-{modelId}"` on each `<DropdownMenuItem>`

---

## Phase 3 — Show list of all models in Chat Sidebar

**File:** `chat/components/app-sidebar.tsx`

Use the existing padlock button process that opens a left side panel. Add an update to the `TABS` array entry currently using `Lock` / "Visibility":

- **Rename** label from `"Visibility"` → `"AI Models & API Keys"`
- **Replace icon** from `Lock` → `BrainCog` (from `lucide-react`; conveys AI + configuration)
- **Panel content**: render `KeyManagerPanel` showing the full list of providers and models with check mark availability indicators. The existing Private/Public visibility toggle moves into this panel as a secondary section below the model list.

```tsx
import { BrainCog } from "lucide-react";

// In the TABS array:
{ id: "visibility" as ActiveTab, icon: <BrainCog size={15} />, label: "AI Models & API Keys" }
```

The sidebar tab row uses `lucide-react` for all icons — use it here rather than `components/icons.tsx`. See `chat/AGENTS.md` for the icon system decision table.

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
  - Header row: `id="km-provider-{id}"` div — provider name, model count, lock/check mark icon
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
   <div id="key-root"></div>
   <script src="/chat/key/providers.js"></script>
   <script src="/chat/key/key-manager.js"></script>
   <script>KeyManager.init(document.getElementById('key-root'));</script>
   ```
2. Run `KeyManager.migrateFromLegacy()` on load to migrate existing `aPro` data.
3. Once the above is verified, remove `requests/engine/agents/agents.js`.

---

## Phase 7 — `chat` Settings Page Updates

1. In `settings-page.tsx`: add `KeyManagerPanel` (from Phase 1 React component) alongside or replacing the three hardcoded `APIKeySection` cards. The new panel shows all providers including the new extended ones (xAI, Groq, etc.).
2. The existing `APIKeySection` component is kept as-is and used inside `KeyManagerPanel` for per-provider key entry — no duplication.
3. `APIProvider` type in `types.ts` is widened to include new providers.

---

## Phase 8 — Server-Side .env Key Indicators

**Goal:** Show in the key manager UI which providers have a key available from the local `docker/.env` file (read by the Rust team server), so users know they can use those models without entering a browser key.

### Rust changes — `team/src/main.rs`

Replace the existing `gemini_api_key_present: bool` field (and the individual per-provider approach) with a single generic list driven by a static mapping:

```rust
/// Maps provider ID → env var name. Single source of truth for all key lookups.
const PROVIDER_ENV_VARS: &[(&str, &str)] = &[
    ("google",     "GEMINI_API_KEY"),
    ("anthropic",  "ANTHROPIC_API_KEY"),
    ("openai",     "OPENAI_API_KEY"),
    ("xai",        "XAI_API_KEY"),
    ("groq",       "GROQ_API_KEY"),
    ("together",   "TOGETHER_API_KEY"),
    ("fireworks",  "FIREWORKS_API_KEY"),
    ("mistral",    "MISTRAL_API_KEY"),
    ("perplexity", "PERPLEXITY_API_KEY"),
    ("deepseek",   "DEEPSEEK_API_KEY"),
    ("discord",    "DISCORD_BOT_TOKEN"),
];

fn env_keys_present() -> Vec<String> {
    PROVIDER_ENV_VARS.iter()
        .filter(|(_, var)| {
            std::env::var(var).map_or(false, |v| !v.is_empty() && v != "dummy_key")
        })
        .map(|(id, _)| id.to_string())
        .collect()
}
```

Update `EnvConfigResponse` — remove `gemini_api_key_present`, add `env_keys_present`:

```rust
#[derive(Serialize)]
struct EnvConfigResponse {
    database: Option<EnvDatabaseConfig>,
    database_connections: Vec<DatabaseConnection>,
    env_keys_present: Vec<String>,   // replaces gemini_api_key_present
    google_client_id: Option<String>,
    // ... other existing fields unchanged
}
```

Update `get_env_config` and `get_current_config` to call `env_keys_present()` instead of the individual boolean check. Remove all references to `gemini_api_key_present`.

### New Next.js API route — `chat/app/api/server-keys/route.ts`

Fetches from the Rust server and returns the list directly:

```ts
// GET /api/server-keys
// Returns: ["google", "discord"]  — provider IDs that have a .env key
export const revalidate = 30;

export async function GET() {
  try {
    const res = await fetch("http://localhost:8081/api/config/current");
    const data = await res.json();
    return Response.json(data.env_keys_present ?? []);
  } catch {
    return Response.json([]);  // Rust server not running — treat all as absent
  }
}
```

### Key manager UI changes

**`chat/key/key-manager.js`** — fetch server keys on `init()` before rendering:

```js
var SERVER_KEYS_URL = location.port === '3000'
  ? '/api/server-keys'
  : 'http://localhost:8081/api/config/current';

var _serverKeys = new Set();

function _loadServerKeys() {
  return fetch(SERVER_KEYS_URL)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      // /api/server-keys returns an array; /api/config/current returns object with env_keys_present
      var list = Array.isArray(data) ? data : (data.env_keys_present || []);
      _serverKeys = new Set(list);
    })
    .catch(function() {});  // silently ignore if unavailable
}
```

Call `_loadServerKeys()` in parallel with `_initCrypto()` before `_renderWidget`.

In `buildProviderHeader`, if `_serverKeys.has(provider.id)` and `!hasKey(provider.id)`, show a `.key-server-badge` next to the provider name (e.g. `[.env]`). If both browser key and server key are present, only show the browser check mark — the server key is a silent fallback.

**`chat/components/model-selector.tsx`** — fetch `/api/server-keys` via SWR; pass `serverKeys: Set<string>` alongside `keyedProviders`. A provider shows a check icon if `keyedProviders.has(id) || serverKeys.has(id)`. Use a distinct icon (e.g. `Server` from lucide-react) when the key comes only from the server.

**`chat/key/style.css`** — add `.key-server-badge` styled to be visually distinct from `.key-model-badge` (e.g. muted blue instead of gray).

### Priority of key resolution (client)

When assembling request headers in `chat.tsx`:
1. Browser localStorage key (decrypted from cache) — always preferred; sent as `x-google-api-key`
2. If absent, send no key header — the server falls back to its own `.env` key for that provider

No changes needed in `/api/chat` — it already reads its own env vars as a fallback.

---

## Phase 9 — Asymmetric Key Encryption (Server-Only Decryption)

**Goal:** Eliminate the window where an API key exists as plaintext in client-side JS memory after initial entry. After this phase, XSS that runs after a key is saved cannot extract it.

### Threat model improvement

Current model (Phase 1b): key is encrypted at rest with a browser-bound AES key. To send to the server, it is decrypted into JS memory first — meaning active XSS on the chat page could read it from the plaintext cache or intercept the `fetch` header.

New model: the key is encrypted client-side with the **server's RSA public key** before being stored. The server decrypts it with its private key on each request. The plaintext key is only in JS memory for the brief moment the user types and saves it — never during a normal chat send.

```
Entry:  user types key → encrypt(key, serverPublicKey) → store "rsa:<base64>" in localStorage
Send:   read "rsa:<base64>" from cache (no decrypt) → send as header to server
Server: decrypt(blob, serverPrivateKey) → use plaintext to call AI provider
```

### Key pair management

Generate an RSA-OAEP 2048-bit key pair once:

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out server_private.pem
openssl rsa -pubout -in server_private.pem -out server_public.pem
```

- Private key → `BROWSER_ENCRYPTION_PRIVATE_KEY` in `docker/.env` and Vercel environment variables (PEM string, newlines as `\n`)
- Public key is served at `GET /api/public-key` (safe to expose)

### New Next.js API route — `chat/app/api/public-key/route.ts`

```ts
// Returns the RSA public key as a JWK, for use with crypto.subtle.importKey
export async function GET() {
  // Parse BROWSER_ENCRYPTION_PRIVATE_KEY from env, extract public key, return as JWK
}
```

### `chat/lib/storage/crypto.ts` additions

```ts
export async function fetchServerPublicKey(): Promise<CryptoKey>
// Fetches /api/public-key, imports as RSA-OAEP key, caches in module var

export async function encryptForServer(plaintext: string): Promise<string>
// Returns "rsa:<base64>" — encrypted with server public key

export function isServerEncrypted(value: string): boolean
// Returns true if value starts with "rsa:"
```

### `chat/lib/storage/local-storage-manager.ts` changes

`setAPIKey`:
1. Keep plaintext in `_plaintextCache` for the duration of the current session (so `getAPIKey` keeps working sync)
2. Encrypt with browser AES key **and** with server public key in parallel
3. Store the server-encrypted blob: `apiKeys[provider] = "rsa:<base64>"`
4. The browser-AES version is **not** stored — the "rsa:" blob is what persists

`getAPIKey` (sync, from cache) — unchanged; still returns plaintext from `_plaintextCache`.

`initCrypto`:
- On finding an `"rsa:<base64>"` entry, do **not** try to decrypt client-side; instead mark the provider as "has key" in a separate set (`_serverEncryptedProviders`)
- `_plaintextCache` is only populated for the current session's freshly-set keys

`prepareSendMessagesRequest` in `chat.tsx`:
- If `_plaintextCache` has the key (set this session): send as `x-google-api-key: <plaintext>` header (existing behavior, only during the session the key was entered)
- Otherwise send the raw "rsa:<base64>" blob as `x-google-api-key-enc: <blob>` header
- Server decrypts the blob before calling the AI provider

### Server-side decryption — `chat/app/api/chat/route.ts`

```ts
// Existing: const googleKey = request.headers.get("x-google-api-key");
// New:
const googleKeyEnc = request.headers.get("x-google-api-key-enc");
const googleKey = googleKeyEnc
  ? await decryptWithServerKey(googleKeyEnc)
  : request.headers.get("x-google-api-key");
```

`decryptWithServerKey(blob)` — strips `"rsa:"` prefix, base64-decodes, decrypts with private key loaded from `BROWSER_ENCRYPTION_PRIVATE_KEY` env var.

### Migration / fallback

- Existing browser-AES entries (`"<iv>:<ct>"`) continue to work: `initCrypto` decrypts them into `_plaintextCache` as before, and they are re-encrypted as `"rsa:<base64>"` on next save
- If `/api/public-key` is unavailable: fall back to browser-AES storage (Phase 1b behavior)
- `isEncrypted` check in `crypto.ts` now also matches `"rsa:"` prefix

### `chat/key/key-manager.js` changes

Duplicate `fetchServerPublicKey` / `encryptForServer` / `isServerEncrypted` logic in vanilla JS, using the same `/api/public-key` endpoint. The static widget at `localhost:8887/chat/key/` falls back to browser-AES if the chat server is not running.

---

## What Does NOT Change

- The `storage.apiKeys.*` call signatures — callers always receive/pass plaintext; encryption is transparent inside `LocalStorageManager`
- The Rust API key reading from `.env` — still functions as server-side fallback
- The `chat` verification services (live API call on verify) — unchanged, reused in `KeyManagerPanel`
- The `docker/js/llm-configs.js` and `LLM_CONFIGS` structure in `team/` — add optional `providerId` field only
- Git workflow: use `./git.sh push` only when user explicitly requests

---

## File Summary

| File | Action |
|---|---|
| `chat/lib/storage/types.ts` | Expand `APIProvider` type + `LocalStorageSchema["api-keys"]` |
| `chat/lib/storage/local-storage-manager.ts` | Add `migrateFromLegacy()`; encrypt on write, decrypt on read via `crypto.ts` |
| `chat/lib/storage/crypto.ts` | **New** — browser-key generation (IndexedDB), AES-GCM encrypt/decrypt, `isEncrypted` detection |
| `chat/lib/providers.ts` | **New** — canonical provider+model registry (TypeScript) |
| `chat/components/key-manager/KeyManagerWidget.tsx` | **New** — React embeddable widget |
| `chat/components/key-manager/KeyManagerPanel.tsx` | **New** — all-providers key UI |
| `chat/components/key-manager/ModelSelectorPanel.tsx` | **New** — model selector with check mark indicating available models (which have keys in browser cache or .env) |
| `chat/components/key-manager/useKeyManager.ts` | **New** — hook for key presence state |
| `chat/components/model-selector.tsx` | Show all providers/models; add lock/check mark indicators; add IDs |
| `chat/components/app-sidebar.tsx` | Update existing padlock left side panel to render `KeyManagerPanel` |
| `chat/components/settings/settings-page.tsx` | Replace 3 hardcoded sections with `KeyManagerPanel` |
| `chat/key/providers.js` | **New** — static JS copy of provider registry |
| `chat/key/key-manager.js` | **New** — vanilla JS embeddable widget |
| `chat/key/style.css` | **New** — widget styles |
| `chat/key/index.html` | **New** — static settings page at localhost:8887/chat/key/ |
| `team/projects/index.html` | Use `KeyManager.*` instead of `getCachedApiKey`; embed widget in modal |
| `team/src/main.rs` | Replace `gemini_api_key_present` with generic `env_keys_present: Vec<String>` driven by `PROVIDER_ENV_VARS` mapping |
| `requests/engine/agents/agents.js` | **Remove** after Phase 6 migration is verified |
| `chat/app/api/server-keys/route.ts` | **New** — proxy to Rust `/api/config/current`, return normalized provider presence map |
| `chat/app/api/public-key/route.ts` | **New** — serve RSA public key JWK for client-side asymmetric encryption |
| `chat/key/style.css` | Add `.key-server-badge` style |
