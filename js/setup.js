// Setup.js - Shared Git account fields and functionality
// Used by both root index.html and team/admin/server/index.html

// Calculate path to team folder based on current location
const currentPath = window.location.pathname;
const teamPathSetup = currentPath.includes('/team/') 
    ? ('../'.repeat((currentPath.split('/team/')[1] || '').split('/').filter(p => p).length))
    : 'team/';

// HTML content for the Git account fields
function createGitAccountFieldsHTML() {
    return `
      <div id="githubAccountFields" style="margin-bottom: 15px;">
        <div style="margin-bottom: 8px;">
          <label for="gitAccount" style="font-size: 14px;">Your GitHub Account</label><br>
          <input type="text" id="gitAccount" class="textInput" style="width:150px; font-size: 14px;" onfocus="this.select()" oninput="updateGitAccountFields()">
        </div>
        <div>
          <label for="myWebrootForkName" style="font-size: 14px;">Webroot Fork Name</label><br>
          <input type="text" id="myWebrootForkName" class="textInput" style="width:150px; font-size: 14px;" value="webroot" onfocus="this.select()" oninput="updateGitAccountFields()">
        </div>
      </div>`;
}

// HTML content for the webroot setup instructions
function createWebrootSetupHTML() {
    // Set parent repo based on selected modelsite (with URL fallback)
    const currentUrl = window.location.href.toLowerCase();
    const selectedModelsite = getSelectedModelsite();
    const isLocationsDomain = currentUrl.includes('locations');
    const parentRepoPath = (selectedModelsite === 'model.georgia' && isLocationsDomain)
        ? 'partnertools/webroot'
        : (selectedModelsite === 'model.georgia'
            ? 'GeorgiaData/iteam'
            : ((currentUrl.includes('locations') || currentUrl.includes('geo'))
                ? 'PartnerTools/webroot'
                : 'ModelEarth/webroot'));
    const webrootGit = `https://github.com/${parentRepoPath}/`;
    
    return `
      <div id="webroot-manager-github-fields-anchor"></div>
      1. Install <a href="https://github.com/apps/desktop" target="github_desktop">Github Desktop</a><br>
      2. Go to <!--Fork the webroot repo--><a href="${webrootGit}" target="github_webroot">${webrootGit}</a> and click the "Fork" button in the upper&nbsp;right.<br>
      3. Click the Green Button on <span id="webrootFork">your webroot fork</span> and choose "Open with Github Desktop" to clone the repo.<br>
      4. Choose "To contribute to the parent project" (${parentRepoPath}) as you clone via Github Desktop.<br>
      5. Start your Command Line Interface (CLI) using the commands below (with or without AI).<br>`;
}

// HTML content for the trade flow repos section
function createTradeFlowReposHTML() {
    return `
        <h1 class="card-title"><span id="extra-repos-title">Extra Repos</span></h1>
        <div class="with-ai-content">
        <p>Optional: To contribute to our tradeflow visualizations, run the following to fork and clone:<br>
        trade-data, community, cv, nisar, evaporation-kits</p>

        <pre><code id="forkReposCmds">using guidance in webroot/AGENTS.md
fork extra repos to [your github account]
clone extra repos from [your github account]
</code></pre>

        <p>The above requires having GitHub CLI (gh) installed locally and authenticated with your GitHub account. (Steps above)</p>
        </div>
        <div class="without-ai-content">Without AI, use Github Desktop to manage extra repos in your webroot.</div>

        <p><a href="https://model.earth/codechat/">Overview of repos (codechat)</a></p>
    `;
}

// Function to update git account fields and browser storage
function updateGitAccountFields() {
    const gitAccount = document.getElementById("gitAccount").value;
    const myWebrootForkName = document.getElementById("myWebrootForkName").value || "webroot";
    
    // Store in localStorage using same cache as localsite - store even if empty to clear cache
    localStorage.gitAccount = gitAccount;
    
    // Only store webroot fork name if it's different from "webroot"
    if (myWebrootForkName && myWebrootForkName !== "webroot") {
        localStorage.myWebrootForkName = myWebrootForkName;
    } else {
        localStorage.removeItem('myWebrootForkName');
    }
    
    // Update the webrootFork link
    updateWebrootForkLink();
    
    // Update fork repos commands with git account
    updateForkReposCommands();
}

// Function to update the webroot fork link
function updateWebrootForkLink() {
    const gitAccountField = document.getElementById("gitAccount");
    const myWebrootForkNameField = document.getElementById("myWebrootForkName");
    
    // Get values safely with null checks
    const gitAccount = (gitAccountField ? gitAccountField.value : '') || localStorage.gitAccount;
    const myWebrootForkName = (myWebrootForkNameField ? myWebrootForkNameField.value : '') || localStorage.myWebrootForkName || "webroot";
    
    // Update all elements with id="webrootFork" (there might be multiple on some pages)
    const webrootForkSpans = document.querySelectorAll('[id="webrootFork"]');
    
    if (gitAccount && webrootForkSpans.length > 0) {
        const linkUrl = `https://github.com/${gitAccount}/${myWebrootForkName}`;
        const linkHTML = `<a href="${linkUrl}" target="github_fork">your ${myWebrootForkName} fork</a>`;
        
        webrootForkSpans.forEach(span => {
            span.innerHTML = linkHTML;
        });
    }
}

// Function to update fork repos commands with git account
function updateForkReposCommands() {
    const gitAccountField = document.getElementById("gitAccount");
    const forkReposCmds = document.getElementById("forkReposCmds");
    
    if (!forkReposCmds) return;
    
    // Get git account value from field or localStorage
    const gitAccount = (gitAccountField ? gitAccountField.value : '') || localStorage.gitAccount;
    const replacementText = gitAccount || '[your github account]';
    
    // Store original template if not already stored
    if (!forkReposCmds.dataset.originalTemplate) {
        forkReposCmds.dataset.originalTemplate = forkReposCmds.textContent;
    }
    
    // Always work from the original template and replace placeholders
    const originalTemplate = forkReposCmds.dataset.originalTemplate;
    const updatedContent = originalTemplate.replace(/\[your github account\]/g, replacementText);
    forkReposCmds.textContent = updatedContent;
}

// Initialize fields on page load
function initializeGitFields() {
    // Load from localStorage if available
    const gitAccountField = document.getElementById("gitAccount");
    const myWebrootForkNameField = document.getElementById("myWebrootForkName");
    
    if (gitAccountField && localStorage.gitAccount && !gitAccountField.value) {
        gitAccountField.value = localStorage.gitAccount;
    }
    if (myWebrootForkNameField && localStorage.myWebrootForkName) {
        myWebrootForkNameField.value = localStorage.myWebrootForkName;
    }
    
    // Add keypress event listeners for clearing cache on Enter when field is empty
    if (gitAccountField) {
        gitAccountField.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && this.value.trim() === '') {
                localStorage.removeItem('gitAccount');
                updateGitAccountFields();
            }
        });
    }
    
    if (myWebrootForkNameField) {
        myWebrootForkNameField.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (this.value.trim() === '') {
                    localStorage.removeItem('myWebrootForkName');
                }
                updateGitAccountFields();
                this.blur();
            }
        });
    }
    
    // Update the link and fork repos commands
    updateWebrootForkLink();
    updateForkReposCommands();
    
    // Re-initialize after a delay to ensure persistence
    setTimeout(() => {
        if (gitAccountField && localStorage.gitAccount && !gitAccountField.value) {
            gitAccountField.value = localStorage.gitAccount;
        }
        if (myWebrootForkNameField && localStorage.myWebrootForkName) {
            myWebrootForkNameField.value = localStorage.myWebrootForkName;
        }
        updateWebrootForkLink();
        updateForkReposCommands();
    }, 500);
}

// Setup Git fields in a target container
function setupGitAccountFields(containerId) {
    const container = document.getElementById(containerId);
    if (container) {
        const existingFields = document.getElementById('githubAccountFields');
        if (existingFields) {
            initializeGitFields();
            return;
        }

        // Insert the HTML at the beginning of the container
        const fieldsHTML = createGitAccountFieldsHTML();
        const anchor = container.querySelector('#webroot-manager-github-fields-anchor');
        if (anchor) {
            anchor.insertAdjacentHTML('afterend', fieldsHTML);
        } else {
            container.insertAdjacentHTML('afterbegin', fieldsHTML);
        }
        
        // Initialize the fields
        setTimeout(() => {
            initializeGitFields();
        }, 100);
    }
}

// Setup webroot setup instructions in a target container
function setupWebrootSetup(containerId) {
    const container = document.getElementById(containerId);
    if (container) {
        const renderWebrootSetup = () => {
            const existingGitFields = document.getElementById('githubAccountFields');
            if (existingGitFields) {
                existingGitFields.remove();
            }
            const setupHTML = createWebrootSetupHTML();
            container.innerHTML = setupHTML;
            if (existingGitFields) {
                const anchor = container.querySelector('#webroot-manager-github-fields-anchor');
                if (anchor) {
                    anchor.insertAdjacentElement('afterend', existingGitFields);
                } else {
                    container.insertAdjacentElement('afterbegin', existingGitFields);
                }
            }
            updateWebrootForkLink();
        };

        // Initial render
        renderWebrootSetup();

        // Re-render after modelsite selector loads or changes
        waitForElm('#modelsite').then((modelsiteSelect) => {
            if (modelsiteSelect.dataset.webrootSetupBound !== 'true') {
                modelsiteSelect.dataset.webrootSetupBound = 'true';
                modelsiteSelect.addEventListener('change', renderWebrootSetup);
            }
            renderWebrootSetup();
        });
    }
}

// Setup trade flow repos section in a target container
function setupTradeFlowRepos(containerId) {
    const container = document.getElementById(containerId);
    if (container) {
        // Insert the trade flow repos HTML
        const tradeFlowHTML = createTradeFlowReposHTML();
        container.innerHTML = tradeFlowHTML;

        // Apply current AI mode immediately after inserting HTML
        if (typeof getCurrentAiModeValue === 'function') {
            const aiMode = getCurrentAiModeValue();
            const isWithout = aiMode === 'no';
            const isBoth = aiMode === 'both';
            container.querySelectorAll('.with-ai-content').forEach(el => {
                el.style.display = isWithout ? 'none' : 'block';
            });
            container.querySelectorAll('.without-ai-content').forEach(el => {
                el.style.display = isWithout ? 'block' : 'none';
            });
            const titleEl = container.querySelector('#extra-repos-title');
            if (titleEl) {
                titleEl.textContent = isBoth ? 'Extra Repos' : isWithout ? 'Extra Repos without AI' : 'Extra Repos with AI';
            }
        }

        updateGeorgiaModelsitePanelVisibility();

        if (!window.teamSetupModelsiteChangedBound) {
            document.addEventListener('modelsiteChanged', () => {
                updateGeorgiaModelsitePanelVisibility();
            });
            window.teamSetupModelsiteChangedBound = true;
        }

        // Re-check after navigation.js has had a chance to establish modelsite.
        if (typeof loadScript === 'function' && typeof local_app !== 'undefined' && typeof local_app.localsite_root === 'function') {
            loadScript(local_app.localsite_root() + 'js/navigation.js', () => {
                updateGeorgiaModelsitePanelVisibility();
            });
        }
        
        // Update the fork repos commands after inserting the content
        setTimeout(() => {
            updateForkReposCommands();
        }, 100);
    }
}

// API Configuration (use existing API_BASE if available, otherwise define it)
if (typeof API_BASE === 'undefined') {
    // Use getApiBase from common.js if available (handles localhost fallback)
    var API_BASE = (typeof getApiBase === 'function') ? getApiBase() : 'http://localhost:8081/api';
}

// Localhost access toggle — uses the accesslocal cookie shared with the Settings menu.
function getLocalhostAccessSetting() {
    if (typeof getAccesslocalSetting === 'function') {
        return getAccesslocalSetting();
    }
    return '';
}

function isLocalhostAccessEnabled() {
    if (typeof window.shouldAccessLocalhost === 'function') return window.shouldAccessLocalhost();
    return getLocalhostAccessSetting() === 'enabled';
}

function isLocalhostToggleChecked() {
    const accessSetting = getLocalhostAccessSetting();
    if (!accessSetting && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)) {
        return true;
    }
    return accessSetting === 'enabled' || accessSetting === 'install';
}

function setLocalhostAccessEnabled(enabled) {
    const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
    if (typeof setAccesslocal === 'function') {
        setAccesslocal(enabled ? 'enabled' : (isLocalHost ? 'block' : ''));
        return;
    }
    if (typeof Cookies !== 'undefined') {
        if (enabled) {
            Cookies.set('accesslocal', 'enabled');
        } else if (isLocalHost) {
            Cookies.set('accesslocal', 'block');
        } else {
            Cookies.remove('accesslocal');
        }
    }
}

function applyLocalhostToggleStyle(toggleElement, checked) {
    if (!toggleElement) return;
    const toggleLabel = toggleElement.closest('label');
    const knob = toggleLabel ? toggleLabel.querySelector('.toggle-knob') : null;
    const track = toggleLabel ? toggleLabel.querySelector('.toggle-slider') : null;
    toggleElement.checked = !!checked;
    if (knob) knob.style.transform = checked ? 'translateX(16px)' : 'translateX(0)';
    if (track) track.style.background = checked ? 'var(--color-success, #4caf50)' : 'var(--bg-tertiary, #ccc)';
}

function syncLocalhostToggleFromSettings() {
    const localhostToggle = document.getElementById('localhost-access-toggle');
    if (!localhostToggle) return;
    applyLocalhostToggleStyle(localhostToggle, isLocalhostToggleChecked());
}

function bindLocalhostSettingsSync() {
    if (window.localhostSettingsSyncBound) return;
    window.localhostSettingsSyncBound = true;

    document.addEventListener('accesslocalChanged', () => {
        syncLocalhostToggleFromSettings();
        updateLocalhostAccessNotice();
    });
    waitForElm('#accesslocal').then((accesslocalSelect) => {
        if (accesslocalSelect.dataset.localhostToggleBound === 'true') return;
        accesslocalSelect.dataset.localhostToggleBound = 'true';
        accesslocalSelect.addEventListener('change', () => {
            const selectedValue = (accesslocalSelect.value || '').toLowerCase();
            applyLocalhostToggleStyle(
                document.getElementById('localhost-access-toggle'),
                selectedValue === 'enabled' || selectedValue === 'install'
            );
            updateLocalhostAccessNotice();
        });
        syncLocalhostToggleFromSettings();
        updateLocalhostAccessNotice();
    });
}

function canUseLocalRustConfigApi() {
    return !!(typeof window.shouldAccessLocalhost === 'function' && window.shouldAccessLocalhost());
}

function updateLocalhostAccessNotice() {
    const notice = document.getElementById('quickstartDiv-localhost-notice');
    if (!notice) return;
    const toggleLabel = document.getElementById('localhost-access-toggle-label');

    if (canUseLocalRustConfigApi()) {
        notice.innerHTML = '';
        return;
    }

    notice.innerHTML = `
        <div class="alert alert-danger" style="margin-top: 10px; margin-bottom: 6px; font-size: 13px;">
            <div>
                <strong>Turn on your Localhost Backend</strong> for Rust endpoints and local API Keys. <!--<code>docker/.env</code> are unavailable here because <code>model.earth</code> does not currently expose the team Rust API endpoints.-->
            </div>
        </div>
    `;
}

// HTML content for the gemini resources section
function createGeminiResourcesHTML() {
    return `
<div id="gemini-resources" class="card" style="margin-bottom: 16px; padding: 16px; background: var(--bg-tertiary); border-radius: var(--radius-md);">
    <h4 style="margin: 0 0 8px 0;" id="gemini-key-title">Add Gemini Key</h4>
    <div id="gemini-key-content">
        Add it in docker/.env
    </div>
</div>
    `;
}

// Function to check Gemini key status and update UI
async function checkGeminiKeyStatus() {
    if (!canUseLocalRustConfigApi()) {
        updateGeminiKeyUI(false);
        return false;
    }
    try {
        // Call the config/current endpoint to check if Gemini key is available
        const response = await fetch(`${API_BASE}/config/current`);
        if (response.ok) {
            const config = await response.json();
            updateGeminiKeyUI(config.gemini_api_key_present);
            return config.gemini_api_key_present;
        } else {
            // If API call fails, assume key is not available
            updateGeminiKeyUI(false);
            return false;
        }
    } catch (error) {
        // If there's an error (e.g., server not running), assume key is not available
        updateGeminiKeyUI(false);
        return false;
    }
}

// Function to update the Gemini key UI based on availability
function updateGeminiKeyUI(keyIsAvailable) {
    const titleElement = document.getElementById('gemini-key-title');
    const contentElement = document.getElementById('gemini-key-content');

    if (!titleElement || !contentElement) return;
    
    if (keyIsAvailable) {
        // Key is available - update to activated state
        titleElement.innerHTML = '✅ Your Insights Key is Activated';

        // Use teamPathSetup to get correct relative path to projects
        const projectsPath = teamPathSetup + 'projects/#list=all';
        const exploreDataPath = teamPathSetup + 'projects/#list=all';

        contentElement.innerHTML = `
            You can ask questions about datasets on the <a href="${projectsPath}">AI Data Insights</a> page.<br>
            <a href="https://ai.google.dev/gemini-api/docs/quickstart" title="Gemini key" target="_blank">Gemini key</a> is active on the server - <a href="#" onclick="testGeminiFromPanel(); return false;">Test Gemini API</a>
            <div id="gemini-test-result" style="margin-top: 8px;"></div>
            <div style="margin-top: 8px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                <button onclick="toggleGeminiKeyInput()" class="btn btn-primary" style="display: inline-flex; align-items: center; gap: 6px; text-decoration: none; border: none; cursor: pointer;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path>
                        <circle cx="12" cy="16" r="1"></circle>
                        <circle cx="12" cy="12" r="1"></circle>
                        <circle cx="16" cy="12" r="1"></circle>
                    </svg>
                    Change Key
                </button>
                <a href="${exploreDataPath}" class="btn btn-secondary">Explore Data</a>
            </div>
            <div id="browser-key-input" style="display: none; margin-top: 12px; padding: 16px; background: var(--bg-tertiary); border: 1px solid var(--border-light); border-radius: var(--radius-md);">
                <div style="display: flex; gap: 8px; align-items: center;">
                    <input type="password" id="browser-gemini-key" placeholder="AIza..." style="flex: 1; max-width: 300px; padding: 8px 12px; font-size: 14px; border: 1px solid var(--border-medium); border-radius: var(--radius-md); background: var(--bg-secondary); color: var(--text-primary);" value="">
                    <button onclick="saveGeminiKey()" class="btn btn-primary" style="padding: 8px 16px; font-size: 14px;">Save</button>
                    <button onclick="cancelGeminiKey()" class="btn btn-secondary" style="padding: 8px 16px; font-size: 14px;">Cancel</button>
                </div>
            </div>
        `;
    } else {
        // Check if user has cached key in browser
        const cachedKey = localStorage.getItem('gemini_api_key');
        
        // Use teamPathSetup to get correct relative path to admin server
        const adminServerPath = teamPathSetup + 'admin/server/';
        
        // Determine button text and title based on available keys
        const buttonText = cachedKey ? 'Change Key' : 'Add Key';
        const titlePrefix = cachedKey ? '🟡 Insights Key Available (Browser Cache)' : '🔴 Add Insights Key';
        const storageText = cachedKey ? 'Your key is stored in your browser cache only' : 'Your key will be stored in your browser cache only';
        const envText = cachedKey ? `To use additional keys residing in docker/.env, <a href="${adminServerPath}">start the Rust API server</a>.` : `Or add your key to docker/.env and <a href="${adminServerPath}">start the Rust API server</a> to detect it.`;
        const linkText = cachedKey ? 'Get another Gemini key' : 'Get your Gemini key';

        titleElement.innerHTML = titlePrefix;
        contentElement.innerHTML = `
            <div style="margin-top: 8px;">
                ${storageText} - <a href="https://ai.google.dev/gemini-api/docs/quickstart" target="_blank" style="color: var(--accent-blue);">${linkText}</a>
            </div>
            <div style="margin-top: 8px;">
                <button onclick="toggleGeminiKeyInput()" class="btn btn-primary" style="display: inline-flex; align-items: center; gap: 6px; text-decoration: none; border: none; cursor: pointer;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path>
                        <circle cx="12" cy="16" r="1"></circle>
                        <circle cx="12" cy="12" r="1"></circle>
                        <circle cx="16" cy="12" r="1"></circle>
                    </svg>
                    ${buttonText}
                </button>
            </div>
            <div id="browser-key-input" style="display: none; margin-top: 12px; padding: 16px; background: var(--bg-tertiary); border: 1px solid var(--border-light); border-radius: var(--radius-md);">
                <div style="display: flex; gap: 8px; align-items: center;">
                    <input type="password" id="browser-gemini-key" placeholder="AIza..." style="flex: 1; max-width: 300px; padding: 8px 12px; font-size: 14px; border: 1px solid var(--border-medium); border-radius: var(--radius-md); background: var(--bg-secondary); color: var(--text-primary);" value="${cachedKey || ''}">
                    <button onclick="saveGeminiKey()" class="btn btn-primary" style="padding: 8px 16px; font-size: 14px;">Save</button>
                    <button onclick="cancelGeminiKey()" class="btn btn-secondary" style="padding: 8px 16px; font-size: 14px;">Cancel</button>
                </div>
            </div>
            <div class="local" style="display:none; margin-top: 8px;">
                ${envText}
            </div>
        `;
    }
}

// Toggle the browser Gemini key input field
function toggleGeminiKeyInput() {
    const inputDiv = document.getElementById('browser-key-input');
    const changeKeyBtn = document.querySelector('button[onclick="toggleGeminiKeyInput()"]');
    
    if (inputDiv) {
        const isVisible = inputDiv.style.display !== 'none';
        inputDiv.style.display = isVisible ? 'none' : 'block';
        
        // Hide/show Change Key button
        if (changeKeyBtn) {
            changeKeyBtn.style.display = isVisible ? 'inline-flex' : 'none';
        }
        
        // Focus the input field and load cached key when showing
        if (!isVisible) {
            const keyInput = document.getElementById('browser-gemini-key');
            if (keyInput) {
                // Load cached key if available
                const cachedKey = localStorage.getItem('gemini_api_key');
                if (cachedKey && !keyInput.value) {
                    keyInput.value = cachedKey;
                }
                setTimeout(() => keyInput.focus(), 100);
            }
        }
    }
}

// Save Gemini key and hide input
function saveGeminiKey() {
    const keyInput = document.getElementById('browser-gemini-key');
    const inputDiv = document.getElementById('browser-key-input');
    const changeKeyBtn = document.querySelector('button[onclick="toggleGeminiKeyInput()"]');
    
    if (keyInput) {
        const key = keyInput.value.trim();
        if (key) {
            localStorage.setItem('gemini_api_key', key);
        } else {
            localStorage.removeItem('gemini_api_key');
        }
        
        // Hide input and show Change Key button
        if (inputDiv) {
            inputDiv.style.display = 'none';
        }
        if (changeKeyBtn) {
            changeKeyBtn.style.display = 'inline-flex';
        }
        
        // Update UI to reflect the change
        checkGeminiKeyStatus();
    }
}

// Cancel key input and restore previous state
function cancelGeminiKey() {
    const keyInput = document.getElementById('browser-gemini-key');
    const inputDiv = document.getElementById('browser-key-input');
    const changeKeyBtn = document.querySelector('button[onclick="toggleGeminiKeyInput()"]');
    
    if (keyInput) {
        // Restore previous value from localStorage
        const cachedKey = localStorage.getItem('gemini_api_key');
        keyInput.value = cachedKey || '';
    }
    
    // Hide input and show Change Key button
    if (inputDiv) {
        inputDiv.style.display = 'none';
    }
    if (changeKeyBtn) {
        changeKeyBtn.style.display = 'inline-flex';
    }
}

// Save browser Gemini key to localStorage
function saveBrowserGeminiKey() {
    const keyInput = document.getElementById('browser-gemini-key');
    if (keyInput) {
        const key = keyInput.value.trim();
        if (key) {
            localStorage.setItem('gemini_api_key', key);
        } else {
            localStorage.removeItem('gemini_api_key');
        }
        // Update UI to reflect the change
        checkGeminiKeyStatus();
    }
}

// Test Gemini API from the panel
async function testGeminiFromPanel() {
    const resultDiv = document.getElementById('gemini-test-result');
    if (!resultDiv) return;

    if (!canUseLocalRustConfigApi()) {
        resultDiv.innerHTML = `
            <div style="background: #FEF3C7; border: 1px solid #F59E0B; color: #92400E; padding: 8px; border-radius: 4px; font-size: 12px; margin-top: 4px;">
                ⚠️ Enable Access Localhost or start the Rust API locally to test Gemini server access.
            </div>
        `;
        return;
    }
    
    resultDiv.innerHTML = '<div style="color: var(--text-secondary); font-size: 12px;">Testing Gemini API...</div>';
    
    try {
        const response = await fetch(`${API_BASE}/config/gemini`);
        const data = await response.json();
        
        if (data.success) {
            resultDiv.innerHTML = `
                <div style="background: #D1FAE5; border: 1px solid #A7F3D0; color: #065F46; padding: 8px; border-radius: 4px; font-size: 12px; margin-top: 4px;">
                    ✅ Gemini API connection successful<br>
                    API Key Present: Yes | API Key Preview: ${data.api_key_preview}<br>
                    Status: API key is valid and working<br>
                    Test: Successfully connected to Gemini API<br>
                    Ready: AI features are available
                </div>
            `;
        } else {
            resultDiv.innerHTML = `
                <div style="background: #FEE2E2; border: 1px solid #FECACA; color: #991B1B; padding: 8px; border-radius: 4px; font-size: 12px; margin-top: 4px;">
                    ❌ ${data.message}<br>
                    ${data.error ? 'Error: ' + data.error : ''}
                </div>
            `;
        }
    } catch (error) {
        // Check if this is likely a connection error (server not running)
        const isConnectionError = error.message.includes('fetch') || 
                                error.message.includes('NetworkError') || 
                                error.message.includes('Failed to fetch');
        
        if (isConnectionError) {
            resultDiv.innerHTML = `
                <div style="background: #FEF3C7; border: 1px solid #F59E0B; color: #92400E; padding: 8px; border-radius: 4px; font-size: 12px; margin-top: 4px;">
                    ⚠️ Start the Rust API first. Then you can test the Gemini API.<br>
                    Error: Failed to connect to API server (${error.message})
                </div>
            `;
        } else {
            resultDiv.innerHTML = `
                <div style="background: #FEE2E2; border: 1px solid #FECACA; color: #991B1B; padding: 8px; border-radius: 4px; font-size: 12px; margin-top: 4px;">
                    ❌ Failed to connect to API server<br>
                    Error: ${error.message}
                </div>
            `;
        }
    }
}

// Setup gemini resources section in a target container
function setupGeminiResources() { // containerId
    //const container = document.getElementById(containerId);
    //if (container) {
        // Insert the gemini resources HTML
        const geminiHTML = createGeminiResourcesHTML();
        //container.innerHTML = geminiHTML;
        
        // Check Gemini key status and update UI after inserting the content
        setTimeout(() => {
            checkGeminiKeyStatus();
        }, 100);
    //}
}

// Check if Gemini key is available and working
async function isGeminiKeyAvailable() {
    if (!canUseLocalRustConfigApi()) {
        return false;
    }
    try {
        const response = await fetch(`${API_BASE}/config/current`);
        if (response.ok) {
            const config = await response.json();
            return config.gemini_api_key_present;
        }
        return false;
    } catch (error) {
        return false;
    }
}


// Setup Gemini Resources conditionally based on key availability
// NOTE: This function is disabled - Gemini setup is now handled by the Gemini Setup card in common.js
async function setupGeminiResourcesConditionally() {
    // Gemini setup is now integrated into the Gemini Setup card created by common.js
    // No longer need to conditionally show/hide a separate setup card
    return;
}

// Setup Gemini Resources after Trade Flow Repos (for admin server page)
function setupGeminiResourcesAfterTradeFlow(tradeFlowContainerId, geminiContainerId) {
    if (typeof waitForElm === 'function') {
        // Wait for trade flow container first
        waitForElm(`#${tradeFlowContainerId}`).then((tradeFlowContainer) => {
            // Setup trade flow repos first
            if (typeof setupTradeFlowRepos === 'function') {
                setupTradeFlowRepos(tradeFlowContainerId);
            }
            
            // Then wait for gemini container and setup
            waitForElm(`#${geminiContainerId}`).then((geminiContainer) => {
                if (typeof setupGeminiResources === 'function') {
                    setupGeminiResources(geminiContainerId);
                }
            });
        });
    }
}

// Auto-initialize on DOM load for compatibility with existing code
document.addEventListener('DOMContentLoaded', function() {
    // Initialize immediately if elements exist
    initializeGitFields();

    // NOTE: setupGeminiResourcesConditionally is now disabled
    // Gemini setup is handled by the Gemini Setup card in common.js
    // setupGeminiResourcesConditionally();

    // Also initialize after waitForElm to ensure they're loaded
    if (typeof waitForElm === 'function') {
        waitForElm('#gitAccount').then((elm) => {
            initializeGitFields();
        });
    }
});

function getQuickstartCommandsHtml() {
    return '';
}

function ensureQuickstartLayoutStyles() {
    if (document.getElementById('quickstart-layout-styles')) {
        return;
    }
    const style = document.createElement('style');
    style.id = 'quickstart-layout-styles';
    style.textContent = `
        .web-server-status-row {
            container-type: inline-size;
        }
        .quickstart-port-pre {
            margin-top: 0;
        }
        .quickstart-port-pre-with-stop {
            padding-right: 0;
        }
        .quickstart-port-pre > code {
            width: 100%;
        }
        .quickstart-stop-port-btn {
            position: absolute;
            top: 0;
            right: 8px;
            margin: 0;
            margin-top: 5px;
            width: auto !important;
            min-width: 0;
            z-index: 1;
        }
        @container (max-width: 520px) {
            .quickstart-port-pre-with-stop {
                padding-right: 0;
            }
            .quickstart-stop-port-btn {
                width: auto !important;
            }
            .quickstart-toggle-actions {
                margin-left: 0 !important;
                justify-content: flex-start !important;
                flex: 1 1 100%;
                width: 100%;
            }
        }
    `;
    document.head.appendChild(style);
}

function renderQuickstartCommands(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    ensureQuickstartLayoutStyles();

    container.innerHTML = getQuickstartCommandsHtml();
    const aiPromptHost = document.getElementById(`${containerId}-ai-prompt-host`);
    const aiPromptWrap = document.getElementById('quickstart-cli-prompt-wrap');
    if (aiPromptHost && aiPromptWrap && aiPromptWrap.parentElement !== aiPromptHost) {
        aiPromptHost.appendChild(aiPromptWrap);
    }
    attachQuickstartCliListeners();
    updateQuickstartCliVisibility();
    updateQuickstartDesktopInstallerStatus();
    updateNoAiFlaskStartVisibility();
}

let quickstartCliListenersAttached = false;
let quickstartOsListenerAttached = false;

function attachQuickstartCliListeners() {
    if (!quickstartCliListenersAttached) {
        const checkboxIds = ['codex-cli', 'claude-code-cli', 'gemini-cli', 'grok-cli', 'vscode-claude'];
        const checkboxes = checkboxIds
            .map((id) => document.getElementById(id))
            .filter(Boolean);

        if (checkboxes.length) {
            checkboxes.forEach((checkbox) => {
                checkbox.addEventListener('change', updateQuickstartCliVisibility);
            });
            quickstartCliListenersAttached = true;
        }
    }

    if (!quickstartOsListenerAttached) {
        const osSelect = document.getElementById('os');
        if (osSelect) {
            osSelect.addEventListener('change', updateQuickstartOsVisibility);
            quickstartOsListenerAttached = true;
        }
    }

    const desktopInstallerToggle = document.getElementById('quickstart-desktop-installer-toggle');
    const desktopInstallerDetails = document.getElementById('quickstart-desktop-installer-details');
    if (desktopInstallerToggle && desktopInstallerDetails) {
        setQuickstartDesktopInstallerExpanded(false);
        desktopInstallerToggle.onclick = function(event) {
            event.preventDefault();
            updateQuickstartDesktopInstallerStatus();
            const isExpanded = desktopInstallerToggle.getAttribute('aria-expanded') === 'true';
            setQuickstartDesktopInstallerExpanded(!isExpanded);
        };
    }
}

function setQuickstartDesktopInstallerExpanded(isExpanded) {
    const desktopInstallerToggle = document.getElementById('quickstart-desktop-installer-toggle');
    const desktopInstallerDetails = document.getElementById('quickstart-desktop-installer-details');
    const desktopInstallerArrow = document.getElementById('quickstart-desktop-installer-arrow');
    if (desktopInstallerToggle) {
        desktopInstallerToggle.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    }
    if (desktopInstallerDetails) {
        desktopInstallerDetails.style.display = isExpanded ? 'block' : 'none';
    }
    if (desktopInstallerArrow) {
        desktopInstallerArrow.textContent = isExpanded ? '▾' : '▸';
    }
    updateRustRecheckMessageVisibilityForDesktopInstaller();
}

function updateRustRecheckMessageVisibilityForDesktopInstaller() {
    const recheckMessage = document.getElementById('rust-recheck-message');
    if (!recheckMessage) return;

    const desktopInstallerDetails = document.getElementById('quickstart-desktop-installer-details');
    const detailsVisible = !!(
        desktopInstallerDetails
        && getComputedStyle(desktopInstallerDetails).display !== 'none'
    );
    recheckMessage.style.display = detailsVisible ? 'none' : 'block';

    const githubCliAutoStatus = document.getElementById('github-cli-auto-status');
    if (githubCliAutoStatus) {
        const shouldShow = githubCliAutoStatus.dataset.shouldShow === 'true';
        githubCliAutoStatus.style.display = shouldShow ? 'block' : 'none';
    }
    moveGithubCliAutoStatusToQuickstart();
}

function moveGithubCliAutoStatusToQuickstart() {}


async function isExecutablePythonRunning() {
    const localWebPort = getConfiguredLocalWebPort();
    const localhostHosts = ['localhost', '127.0.0.1', '::1'];
    const onLocalhostPort = localhostHosts.includes(window.location.hostname) && window.location.port === localWebPort;
    const statusUrl = onLocalhostPort ? '/api/status' : `http://localhost:${localWebPort}/api/status`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    try {
        const response = await fetch(statusUrl, { signal: controller.signal });
        if (!response.ok) return false;
        await response.json();
        return true;
    } catch (error) {
        return false;
    } finally {
        clearTimeout(timeoutId);
    }
}

async function updateQuickstartDesktopInstallerStatus() {
}

function updateQuickstartCliVisibility() {
    const modeState = getBackendCommandState();
    const aiPromptHost = document.querySelector('.quickstart-ai-prompt-host');
    const showAiPrompt = !!modeState.withAi;
    const promptWrap = document.getElementById('quickstart-cli-prompt-wrap');
    const line = document.getElementById('quickstart-cli-line');
    const command = document.getElementById('quickstart-cli-command');
    if (!line) {
        return;
    }

    if (aiPromptHost) {
        aiPromptHost.style.display = showAiPrompt ? 'block' : 'none';
    }
    if (promptWrap) {
        promptWrap.style.display = showAiPrompt ? 'block' : 'none';
    }
    line.style.display = showAiPrompt ? 'inline' : 'none';
    if (command) {
        command.style.display = showAiPrompt ? 'block' : 'none';
    }
    updateQuickstartOsVisibility();
}

function updateQuickstartOsVisibility() {
    const macLinuxSection = document.getElementById('quickstart-mac-linux-section');
    const windowsSection = document.getElementById('quickstart-windows-section');

    if (!macLinuxSection || !windowsSection) {
        return;
    }

    const osSelect = document.getElementById('os');
    const selectedOS = osSelect ? osSelect.value : '';

    if (selectedOS === 'PC') {
        macLinuxSection.style.display = 'none';
        windowsSection.style.display = 'block';
    } else if (selectedOS === 'Mac' || selectedOS === 'Linux') {
        macLinuxSection.style.display = 'block';
        windowsSection.style.display = 'none';
    } else {
        macLinuxSection.style.display = 'block';
        windowsSection.style.display = 'block';
    }
}

async function getWebServerStatusState() {
    const currentHost = window.location.hostname;
    const currentPort = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
    const currentUrl = window.location.href;
    const currentOriginUrl = `${window.location.protocol}//${window.location.host}/`;
    const isLocalOrigin = ['localhost', '127.0.0.1', '::1'].includes(currentHost);
    const localhostPort = getConfiguredLocalWebPort();
    const localhostWebUrl = `http://localhost:${localhostPort}/`;
    const localhostApiStatusUrl = `http://localhost:${localhostPort}/api/status`;

    const localhostAccessOn = isLocalhostAccessEnabled();
    const [localhostWebRunning, localhostApiRunning, currentOriginRunning] = await Promise.all([
        localhostAccessOn ? checkBackendAvailabilityCached(localhostWebUrl, `webServerLocalhost${localhostPort}`) : Promise.resolve(false),
        localhostAccessOn ? checkBackendAvailabilityCached(localhostApiStatusUrl, `webServerLocalhost${localhostPort}Api`) : Promise.resolve(false),
        checkBackendAvailabilityCached(currentOriginUrl, 'webServerCurrentOrigin')
    ]);

    let isRunning = false;
    let detectedUrl = '';
    let detectedLabel = '';
    let detectedType = 'none';

    if (localhostWebRunning) {
        isRunning = true;
        detectedUrl = localhostWebUrl;
        detectedLabel = `port ${localhostPort}`;
        detectedType = `localhost${localhostPort}`;
    } else if (isLocalOrigin && currentOriginRunning) {
        isRunning = true;
        detectedUrl = currentOriginUrl;
        detectedLabel = window.location.host || `${currentHost}:${currentPort}`;
        detectedType = 'localOrigin';
    }

    return {
        currentHost,
        currentPort,
        currentUrl,
        currentOriginUrl,
        isLocalOrigin,
        isRunning,
        detectedUrl,
        detectedLabel,
        detectedType,
        localhostPort,
        localhostWebUrl,
        localhostWebRunning,
        localhostApiRunning,
        currentOriginRunning
    };
}

async function getNodeWebServerProbeState(localhostPort) {
    if (!isLocalhostAccessEnabled()) return null;
    if (localhostPort !== '8888') return null;

    const rootUrl = `http://localhost:${localhostPort}/`;
    const statusUrl = `http://localhost:${localhostPort}/api/status`;
    let statusDetails = null;

    try {
        const response = await fetch(statusUrl, {
            method: 'GET',
            cache: 'no-store'
        });
        let body = null;
        try {
            body = await response.json();
        } catch (error) {
            body = null;
        }
        statusDetails = {
            ok: response.ok,
            status: response.status,
            body
        };
    } catch (error) {
        statusDetails = {
            ok: false,
            status: null,
            body: null,
            error: error && error.message ? error.message : 'Request failed'
        };
    }

    return {
        rootUrl,
        statusUrl,
        statusDetails
    };
}

function getNodeWebServerStatusMarkup(nodeStatus) {
    if (!nodeStatus) return '';

    const body = nodeStatus.statusDetails && nodeStatus.statusDetails.body
        ? JSON.stringify(nodeStatus.statusDetails.body, null, 2)
        : '';
    const statusText = nodeStatus.statusDetails
        ? (nodeStatus.statusDetails.status === null
            ? `Request failed${nodeStatus.statusDetails.error ? `: ${nodeStatus.statusDetails.error}` : ''}`
            : `HTTP ${nodeStatus.statusDetails.status}${nodeStatus.statusDetails.ok ? ' OK' : ''}`)
        : 'Not checked';
    const bodyMarkup = body
        ? `<pre style="background: var(--bg-tertiary); border-radius: var(--radius-sm); overflow-x: auto; margin: 8px 0 0 0;"><code>${body}</code></pre>`
        : '';

    return `
        <div style="margin-top: 14px; padding: 14px; background: var(--bg-tertiary); border-radius: var(--radius-md);">
            <h4 style="margin: 0 0 8px 0;">Node Unified Server on Port 8888</h4>
            <p style="color: var(--text-secondary); margin: 0 0 8px 0; font-size: 13px;">
                The setup page probes these URLs for the chat/webroot unified Node.js server:
            </p>
            <p style="color: var(--text-secondary); margin: 0; font-size: 13px;">
                Root probe: <code>${nodeStatus.rootUrl}</code><br>
                Status probe: <code>${nodeStatus.statusUrl}</code> (${statusText})
            </p>
            ${bodyMarkup}
            <p style="color: var(--text-secondary); margin: 10px 0 6px 0; font-size: 13px;">
                From <code>chat/AGENTS.md</code>, start it from the webroot root with:
            </p>
            <pre style="background: var(--bg-secondary); border-radius: var(--radius-sm); overflow-x: auto; margin: 0;"><code>node chat/server.mjs</code></pre>
            <p style="color: var(--text-secondary); margin: 8px 0 0 0; font-size: 13px;">
                First time only, install dependencies with <code>pnpm --prefix chat install</code>.
            </p>
        </div>
    `;
}

function getPythonBackendStatusMarkup(containerId) {
    const checkingText = isLocalhostAccessEnabled() ? 'Checking...' : '';
    return `
        <div class="geo-x">
        <div style="display:flex; align-items:center; gap:10px; margin-top:8px; margin-bottom:6px;">
            <!-- <span class="status-indicator error" id="${containerId}-aggregate-dot"></span> -->
            <h3 style="margin:0;">Backend Code and APIs</h3>
        </div>
        <p style="color:var(--text-secondary); margin:0 0 6px 0; font-size:13px;">You don't need to activate these to contribute - since our webroot uses JAM Stack (static pages with APIs)</p>
        <div id="${containerId}">
            <div data-backend="engine" style="margin-top: 6px;">
                <div style="display:flex; flex-wrap:wrap; align-items:center; gap:8px;">
                    <span class="status-indicator loading"></span>
                    <span style="flex: 1;"><a href="/requests/engine/">Arts Engine Axum Rust</a> (port 8082): <span class="backend-text">${checkingText}</span></span>
                    <button class="btn btn-width show-cmd-btn" style="display:none; margin-left:auto;">Show Commands</button>
                </div>
                <div class="with-ai-backend-cmd" style="display:none; margin-top: 6px;">
                    <pre style="background: var(--bg-tertiary); border-radius: var(--radius-sm); overflow-x: auto; margin: 0;"><code>start art</code></pre>
                </div>
                <div class="no-ai-backend-cmd" style="display:none; margin-top: 6px;">
                    <div class="full-command-label" style="display:none; color: var(--text-secondary); margin: 0 0 4px 0;">Full Command</div>
                    <pre style="background: var(--bg-tertiary); border-radius: var(--radius-sm); overflow-x: auto; margin: 0;"><code>cargo run --manifest-path requests/engine/rust-api/Cargo.toml</code></pre>
                </div>
            </div>
            <hr style="border:none; border-top:1px solid var(--border-light); margin: 8px 0 0 0;">
            <div data-backend="pipeline" style="margin-top: 6px;">
                <div style="display:flex; flex-wrap:wrap; align-items:center; gap:8px;">
                    <span class="status-indicator loading"></span>
                    <span style="flex: 1;"><a href="/data-pipeline/admin">Data-Pipeline Flask</a> (port 5001): <span class="backend-text">${checkingText}</span></span>
                    <button class="btn btn-width show-cmd-btn" style="display:none; margin-left:auto;">Show Commands</button>
                </div>
                <div class="with-ai-backend-cmd" style="display:none; margin-top: 6px;">
                    <pre style="background: var(--bg-tertiary); border-radius: var(--radius-sm); overflow-x: auto; margin: 0;"><code>start pipeline</code></pre>
                </div>
                <div class="no-ai-backend-cmd" style="display:none; margin-top: 6px;">
                    <div class="full-command-label" style="display:none; color: var(--text-secondary); margin: 0 0 4px 0;">Full Command</div>
                    <pre style="background: var(--bg-tertiary); border-radius: var(--radius-sm); overflow-x: auto; margin: 0;"><code># Check if data-pipeline Flask server is already running on port 5001
if lsof -ti:5001 > /dev/null 2>&1; then
  echo "Data pipeline Flask server already running on port 5001"
else
  # Navigate to data-pipeline/flask
  cd data-pipeline/flask

  # Create virtual environment if it doesn't exist
  if [ ! -d "env" ]; then
    python3 -m venv env
  fi

  # Activate virtual environment
  source env/bin/activate

  # Install Flask and CORS if not already installed
  pip install -q flask flask-cors

  # Start Flask server in background (disable debug/reloader for stable daemon mode)
  nohup python -c "import flask_server as s; s.app.run(host='127.0.0.1', port=5001, debug=False, use_reloader=False)" > flask.log 2>&1 &

  echo "Started data pipeline Flask server on port 5001"
  echo "Health check: http://localhost:5001/health"
  echo "Data pipeline API: http://localhost:5001/api/nodes/"

  # Return to webroot
  cd ../..
fi</code></pre>
                </div>
            </div>
            <hr style="border:none; border-top:1px solid var(--border-light); margin: 8px 0 0 0;">
            <div data-backend="cloud" style="margin-top: 6px;">
                <div style="display:flex; flex-wrap:wrap; align-items:center; gap:8px;">
                    <span class="status-indicator loading"></span>
                    <span style="flex: 1;"><a href="/cloud/run">Cloud/Run Flask</a> (port 8100): <span class="backend-text">${checkingText}</span></span>
                    <button class="btn btn-width show-cmd-btn" style="display:none; margin-left:auto;">Show Commands</button>
                </div>
                <div class="with-ai-backend-cmd" style="display:none; margin-top: 6px;">
                    <pre style="background: var(--bg-tertiary); border-radius: var(--radius-sm); overflow-x: auto; margin: 0;"><code>start cloud</code></pre>
                </div>
                <div class="no-ai-backend-cmd" style="display:none; margin-top: 6px;">
                    <div class="full-command-label" style="display:none; color: var(--text-secondary); margin: 0 0 4px 0;">Full Command</div>
                    <pre style="background: var(--bg-tertiary); border-radius: var(--radius-sm); overflow-x: auto; margin: 0;"><code># Check if cloud/run Flask server is already running on port 8100
if lsof -ti:8100 > /dev/null 2>&1; then
  echo "Cloud run Flask server already running on port 8100"
else
  # Navigate to cloud/run
  cd cloud/run

  # Create virtual environment if it doesn't exist
  if [ ! -d "env" ]; then
    python3 -m venv env
  fi

  # Activate virtual environment
  source env/bin/activate

  # Install dependencies if requirements.txt exists
  if [ -f "requirements.txt" ]; then
    pip install -q -r requirements.txt
  fi

  # Install Flask and CORS if not already installed
  pip install -q flask flask-cors

  # Start Flask server in background
  nohup python app.py > flask.log 2>&1 &

  echo "Started cloud run Flask server on port 8100"
  echo "Health check: http://localhost:8100/health"
  echo "Cloud run API: http://localhost:8100/"

  # Return to webroot
  cd ../..
fi</code></pre>
                </div>
            </div>
            <hr style="border:none; border-top:1px solid var(--border-light); margin: 8px 0 0 0;">
            <div data-backend="nodejs" style="margin-top: 6px;">
                <div style="display:flex; flex-wrap:wrap; align-items:center; gap:8px;">
                    <span class="status-indicator loading"></span>
                    <span style="flex: 1;"><a href="/chat/keys/">NodeJS Server + Sanity</a> (port 8888): <span class="backend-text">${checkingText}</span></span>
                    <button class="btn btn-width show-cmd-btn" style="display:none; margin-left:auto;">Show Commands</button>
                </div>
                <div class="with-ai-backend-cmd" style="display:none; margin-top: 6px;">
                    <pre style="background: var(--bg-tertiary); border-radius: var(--radius-sm); overflow-x: auto; margin: 0;"><code>start chat</code></pre>
                </div>
                <div class="no-ai-backend-cmd" style="display:none; margin-top: 6px;">
                    <div class="full-command-label" style="display:none; color: var(--text-secondary); margin: 0 0 4px 0;">Full Command</div>
                    <pre style="background: var(--bg-tertiary); border-radius: var(--radius-sm); overflow-x: auto; margin: 0;"><code>pnpm --prefix chat install
bun --cwd sanity install
node chat/server.mjs</code></pre>
                </div>
            </div>
            <hr style="border:none; border-top:1px solid var(--border-light); margin: 8px 0 0 0;">
            <div data-backend="dotnet" style="margin-top: 6px;">
                <div style="display:flex; flex-wrap:wrap; align-items:center; gap:8px;">
                    <span class="status-indicator loading"></span>
                    <span style="flex: 1;"><a href="/host/net/">Shared .NET Host</a> (port 8010): <span class="backend-text">${checkingText}</span></span>
                    <button class="btn btn-width show-cmd-btn" style="display:none; margin-left:auto;">Show Commands</button>
                </div>
                <div class="with-ai-backend-cmd" style="display:none; margin-top: 6px;">
                    <pre style="background: var(--bg-tertiary); border-radius: var(--radius-sm); overflow-x: auto; margin: 0;"><code>start net</code></pre>
                </div>
                <div class="no-ai-backend-cmd" style="display:none; margin-top: 6px;">
                    <div class="full-command-label" style="display:none; color: var(--text-secondary); margin: 0 0 4px 0;">Full Command</div>
                    <pre style="background: var(--bg-tertiary); border-radius: var(--radius-sm); overflow-x: auto; margin: 0;"><code>bash host/net/net.sh start</code></pre>
                </div>
            </div>
            <hr style="border:none; border-top:1px solid var(--border-light); margin: 8px 0 0 0;">
        </div>
        <div id="github-cli-auto-status" style="display:none; margin-top:6px;">
            <div style="display:flex; flex-wrap:wrap; align-items:center; gap:8px;">
                <span class="status-indicator connected"></span>
                <span style="flex: 1;">Github CLI is installed</span>
                <button class="btn btn-secondary btn-width" id="github-cli-show-commands-link" style="margin-left:auto;">Show Commands</button>
            </div>
            <div id="github-cli-inline-commands" style="display:none; margin-top: 6px;"></div>
        </div>
        </div>
    `;
}

let initialAiModePreferenceResolved = false;
let initialAiModePreference = 'no';

function normalizeAiModePreference(value) {
    const normalized = (value || '').toString().trim().toLowerCase();
    if (normalized === 'yes' || normalized === 'with' || normalized === 'with-ai') return 'yes';
    if (normalized === 'no' || normalized === 'without' || normalized === 'without-ai') return 'no';
    if (normalized === 'both') return 'both';
    return '';
}

function getAiModeFromBackendMode(mode) {
    if (mode === 'with-ai') return 'yes';
    if (mode === 'both') return 'both';
    return 'no';
}

function getBackendModeFromAiMode(aiMode) {
    const normalized = normalizeAiModePreference(aiMode);
    if (normalized === 'yes') return 'with-ai';
    if (normalized === 'both') return 'both';
    return 'without-ai';
}

function resolveInitialAiModePreference() {
    if (initialAiModePreferenceResolved) {
        return initialAiModePreference;
    }

    let aiMode = '';
    if (typeof getHash === 'function') {
        const hash = getHash() || {};
        aiMode = normalizeAiModePreference(hash.ai);
    }
    if (!aiMode) {
        aiMode = normalizeAiModePreference(localStorage.getItem('use-ai-mode'));
    }
    if (!aiMode) {
        aiMode = 'no';
    }

    initialAiModePreference = aiMode;
    initialAiModePreferenceResolved = true;
    localStorage.setItem('use-ai-mode', aiMode);
    return initialAiModePreference;
}

function getAiModePreference() {
    const backendMode = getBackendCommandMode();
    if (backendMode) {
        return getAiModeFromBackendMode(backendMode);
    }
    return resolveInitialAiModePreference();
}

function persistAiModeSelection(aiMode, options = {}) {
    const normalized = normalizeAiModePreference(aiMode) || 'no';
    const shouldUpdateHash = options.updateHash !== false;
    const shouldUpdateCache = options.updateCache !== false;

    if (shouldUpdateCache) {
        localStorage.setItem('use-ai-mode', normalized);
    }
    if (shouldUpdateHash && typeof updateHash === 'function') {
        updateHash({ ai: normalized }, true);
    }
}

function applyAiModeSelection(mode, options = {}) {
    const normalizedMode = mode === 'with-ai' || mode === 'both' ? mode : 'without-ai';
    const nextState = setExclusiveBackendCommandMode(normalizedMode);
    const aiMode = getAiModeFromBackendMode(normalizedMode);
    persistAiModeSelection(aiMode, options);
    document.dispatchEvent(new CustomEvent('aiModeChanged', {
        detail: {
            mode: normalizedMode,
            aiMode,
            state: nextState
        }
    }));
    return nextState;
}

function getDefaultBackendCommandState() {
    const preferredAiMode = resolveInitialAiModePreference();
    return getBackendCommandStateFromMode(getBackendModeFromAiMode(preferredAiMode));
}

function getBackendCommandStateFromMode(mode) {
    const normalizedMode = mode === 'with-ai' || mode === 'both' ? mode : 'without-ai';
    return {
        withAi: normalizedMode === 'with-ai' || normalizedMode === 'both',
        withoutAi: normalizedMode === 'without-ai' || normalizedMode === 'both'
    };
}

function normalizeBackendCommandState(state, fallbackState = null) {
    const fallback = fallbackState || getDefaultBackendCommandState();
    const normalizedFallback = {
        withAi: !!(fallback && fallback.withAi),
        withoutAi: !!(fallback && fallback.withoutAi)
    };
    if (!normalizedFallback.withAi && !normalizedFallback.withoutAi) {
        normalizedFallback.withoutAi = true;
    }

    const normalized = {
        withAi: !!(state && state.withAi),
        withoutAi: !!(state && state.withoutAi)
    };

    if (!normalized.withAi && !normalized.withoutAi) {
        return normalizedFallback;
    }
    return normalized;
}

function getBackendCommandMode(state = null) {
    const safeState = normalizeBackendCommandState(state || getBackendCommandState());
    if (safeState.withAi && safeState.withoutAi) {
        return 'both';
    }
    if (safeState.withAi) {
        return 'with-ai';
    }
    return 'without-ai';
}

function getBackendCommandState() {
    if (
        window.quickstartBackendCommandModes
        && typeof window.quickstartBackendCommandModes.withAi === 'boolean'
        && typeof window.quickstartBackendCommandModes.withoutAi === 'boolean'
    ) {
        const normalizedState = normalizeBackendCommandState({
            withAi: window.quickstartBackendCommandModes.withAi,
            withoutAi: window.quickstartBackendCommandModes.withoutAi
        });
        window.quickstartBackendCommandModes = normalizedState;
        return normalizedState;
    }
    const defaultState = normalizeBackendCommandState(getDefaultBackendCommandState());
    window.quickstartBackendCommandModes = defaultState;
    return defaultState;
}

function hasEnabledBackendCommandMode(state) {
    return !!(state && (state.withAi || state.withoutAi));
}

function shouldShowFullCommandsContainer(state) {
    return !!(state && state.withoutAi);
}

function setQuickstartToggleButtonState(button, isActive) {
    if (!button) return;
    const buttonGroup = button.closest('.quickstart-commands-toggle-group');
    const isCompactToggle = !!(buttonGroup && (buttonGroup.id === 'quickstartDiv-toggle' || buttonGroup.id === 'webserver-commands-toggle'));
    if (isCompactToggle && buttonGroup) {
        buttonGroup.style.gap = '2px';
    }

    const existingLabel = button.querySelector('.quickstart-toggle-label');
    const labelText = (button.dataset.label || (existingLabel ? existingLabel.textContent : button.textContent) || '')
        .replace(/^[+\-]\s*/, '')
        .trim();
    button.dataset.label = labelText;

    let iconSpan = button.querySelector('.quickstart-toggle-icon');
    let labelSpan = existingLabel;
    if (!iconSpan || !labelSpan) {
        button.innerHTML = `
            <span class="quickstart-toggle-icon material-icons" aria-hidden="true"></span>
            <span class="quickstart-toggle-label"></span>
        `;
        iconSpan = button.querySelector('.quickstart-toggle-icon');
        labelSpan = button.querySelector('.quickstart-toggle-label');
    }

    iconSpan.classList.add('material-icons');
    iconSpan.textContent = isActive ? 'radio_button_checked' : 'radio_button_unchecked';
    iconSpan.style.fontSize = isCompactToggle ? '18px' : '';
    iconSpan.style.lineHeight = isCompactToggle ? '1' : '';
    labelSpan.textContent = labelText;

    button.style.display = 'inline-flex';
    button.style.alignItems = 'center';
    button.style.gap = '6px';
    button.style.paddingLeft = isCompactToggle ? '9px' : '';
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
}

function getQuickstartToggleButtonMarkup(mode, className, label) {
    return `
        <button id="ai-${mode}" class="${className} quickstart-commands-toggle-btn" data-mode="${mode}">
            <span class="quickstart-toggle-icon material-icons" aria-hidden="true">radio_button_unchecked</span>
            <span class="quickstart-toggle-label">${label}</span>
        </button>
    `;
}

function setGlobalCommandToggleAppearance(state) {
    const buttons = document.querySelectorAll('.quickstart-commands-toggle-btn');
    const safeState = normalizeBackendCommandState(state || getBackendCommandState());
    const activeMode = getBackendCommandMode(safeState);
    const modeColors = {
        'with-ai': '#2563eb',
        'without-ai': '#b45309',
        'both': '#0f766e'
    };
    buttons.forEach((button) => {
        const buttonMode = button.dataset.mode === 'with-ai' || button.dataset.mode === 'both'
            ? button.dataset.mode
            : 'without-ai';
        const isActive = buttonMode === activeMode;
        const activeColor = modeColors[buttonMode] || modeColors['without-ai'];
        const currentGroup = button.closest('.quickstart-commands-toggle-group');
        const isWebServerToggle = !!(currentGroup && currentGroup.id === 'webserver-commands-toggle');
        button.style.background = isActive
            ? activeColor
            : (isWebServerToggle ? 'transparent' : '');
        button.style.color = isActive
            ? '#ffffff'
            : (isWebServerToggle ? 'var(--text-secondary)' : '');
        button.style.borderColor = isActive
            ? activeColor
            : (isWebServerToggle ? 'var(--border-light)' : '');
        button.dataset.active = isActive ? 'true' : 'false';
        setQuickstartToggleButtonState(button, isActive);
    });
}

function updateBackendCommandForRow(row, isRunning) {
    if (!row) return;
    const modeState = getBackendCommandState();
    const backendKey = row.dataset.backend || '';
    const allowCommandsWhileRunning = backendKey === 'dotnet' || backendKey === 'webserver' || backendKey === 'engine' || backendKey === 'nodejs';
    const withAiBlock = row.querySelector('.with-ai-backend-cmd');
    const commandBlock = row.querySelector('.no-ai-backend-cmd');
    const fullCommandLabel = row.querySelector('.full-command-label');
    const showCmdBtn = row.querySelector('.show-cmd-btn');
    const commandsVisible = !isRunning || allowCommandsWhileRunning;
    const showFullCommandLabel = commandsVisible && modeState.withAi && modeState.withoutAi;
    if (withAiBlock) {
        withAiBlock.style.display = commandsVisible && modeState.withAi ? 'block' : 'none';
    }
    if (showCmdBtn) {
        const showBtn = commandsVisible && modeState.withoutAi;
        showCmdBtn.style.display = showBtn ? 'inline-block' : 'none';
        if (!showBtn && commandBlock) {
            commandBlock.style.display = 'none';
            showCmdBtn.textContent = 'Show Commands';
        }
        if (showBtn && !showCmdBtn.dataset.listenerBound) {
            showCmdBtn.dataset.listenerBound = 'true';
            showCmdBtn.addEventListener('click', function() {
                const expanded = commandBlock && commandBlock.style.display !== 'none';
                if (commandBlock) commandBlock.style.display = expanded ? 'none' : 'block';
                showCmdBtn.textContent = expanded ? 'Show Commands' : 'Hide Commands';
            });
        }
    } else if (commandBlock) {
        commandBlock.style.display = commandsVisible && modeState.withoutAi ? 'block' : 'none';
    }
    if (fullCommandLabel) {
        fullCommandLabel.style.display = showFullCommandLabel ? 'block' : 'none';
    }
}

function updateNoAiFlaskStartVisibility() {
    const modeState = getBackendCommandState();
    setGlobalCommandToggleAppearance(modeState);
    document.querySelectorAll('[data-backend]').forEach((row) => {
        const indicator = row.querySelector('.status-indicator');
        const isRunning = indicator ? indicator.classList.contains('connected') : false;
        const isNotRunning = indicator ? indicator.classList.contains('error') : false;
        if (isRunning) {
            updateBackendCommandForRow(row, true);
        } else if (isNotRunning) {
            updateBackendCommandForRow(row, false);
        } else {
            updateBackendCommandForRow(row, true);
        }
    });
}

let noAiBackendModelsiteListenerAttached = false;
let noAiBackendModelsiteWaitQueued = false;

function refreshAllPythonBackendStatusPanels() {
    const panels = document.querySelectorAll('[id$="-python-status"]');
    panels.forEach((panel) => {
        updatePythonBackendStatus(panel.id);
    });
}

function attachNoAiBackendModelsiteListener(modelsiteSelect) {
    if (!modelsiteSelect || noAiBackendModelsiteListenerAttached) return;
    modelsiteSelect.addEventListener('change', () => {
        updateGeorgiaModelsitePanelVisibility();
        refreshAllPythonBackendStatusPanels();
    });
    noAiBackendModelsiteListenerAttached = true;
}

function ensureNoAiBackendUseAIListener() {
    if (!noAiBackendModelsiteListenerAttached) {
        const modelsiteSelect = document.getElementById('modelsite');
        if (modelsiteSelect) {
            attachNoAiBackendModelsiteListener(modelsiteSelect);
        } else if (!noAiBackendModelsiteWaitQueued && typeof waitForElm === 'function') {
            noAiBackendModelsiteWaitQueued = true;
            waitForElm('#modelsite').then((elm) => {
                attachNoAiBackendModelsiteListener(elm);
                refreshAllPythonBackendStatusPanels();
                noAiBackendModelsiteWaitQueued = false;
            });
        }
    }
}

function setBackendCommandMode(mode, enabled) {
    const normalizedMode = mode === 'with-ai' || mode === 'both' ? mode : 'without-ai';
    if (enabled) {
        return setExclusiveBackendCommandMode(normalizedMode);
    }

    const currentMode = getBackendCommandMode();
    if (currentMode !== normalizedMode) {
        return getBackendCommandState();
    }

    if (normalizedMode === 'with-ai') {
        return setExclusiveBackendCommandMode('without-ai');
    }
    if (normalizedMode === 'without-ai') {
        return setExclusiveBackendCommandMode('with-ai');
    }
    return setExclusiveBackendCommandMode('without-ai');
}

function getPrimaryBackendCommandsContainerId() {
    if (
        window.primaryBackendCommandsContainerId
        && document.getElementById(window.primaryBackendCommandsContainerId)
    ) {
        return window.primaryBackendCommandsContainerId;
    }

    const aiPromptHost = document.querySelector('.quickstart-ai-prompt-host[data-commands-container-id]');
    if (aiPromptHost && aiPromptHost.dataset.commandsContainerId) {
        return aiPromptHost.dataset.commandsContainerId;
    }

    const toggleGroup = document.querySelector('.quickstart-commands-toggle-group');
    if (toggleGroup && toggleGroup.id) {
        const inferredId = toggleGroup.id.replace(/-toggle$/, '-commands');
        if (document.getElementById(inferredId)) {
            return inferredId;
        }
    }

    const fallbackContainer = document.querySelector('.readme-content[id$="-commands"]');
    return fallbackContainer ? fallbackContainer.id : null;
}

function applyBackendCommandsContainerVisibility(state) {
    const commandsContainerId = getPrimaryBackendCommandsContainerId();
    if (!commandsContainerId) return;

    const commandsContainer = document.getElementById(commandsContainerId);
    if (!commandsContainer) return;

    const showCommands = shouldShowFullCommandsContainer(state);
    if (showCommands && !commandsContainer.dataset.loaded) {
        renderQuickstartCommands(commandsContainerId);
        commandsContainer.dataset.loaded = 'true';
    }
    commandsContainer.style.display = showCommands ? 'block' : 'none';
    updateQuickstartCliVisibility();
}

function setExclusiveBackendCommandMode(mode) {
    const normalizedMode = mode === 'with-ai' || mode === 'both' ? mode : 'without-ai';
    const nextState = getBackendCommandStateFromMode(normalizedMode);
    window.quickstartBackendCommandModes = nextState;
    setGlobalCommandToggleAppearance(nextState);
    document.querySelectorAll('[data-backend]').forEach((row) => {
        const indicator = row.querySelector('.status-indicator');
        const isRunning = indicator ? indicator.classList.contains('connected') : false;
        updateBackendCommandForRow(row, isRunning);
    });
    if (typeof updateRustTabState === 'function') {
        updateRustTabState(nextState);
    }
    applyBackendCommandsContainerVisibility(nextState);
    updateNoAiFlaskStartVisibility();
    return nextState;
}

function setBackendRowStatus(container, backendKey, isRunning) {
    const row = container ? container.querySelector(`[data-backend="${backendKey}"]`) : null;
    if (!row) return;
    const indicator = row.querySelector('.status-indicator');
    const text = row.querySelector('.backend-text');
    if (!indicator || !text) return;

    if (isRunning) {
        indicator.className = 'status-indicator connected';
        text.textContent = 'Running';
        updateBackendCommandForRow(row, true);
    } else {
        indicator.className = 'status-indicator error';
        text.textContent = 'Not running';
        updateBackendCommandForRow(row, false);
    }
    updateBackendAggregateStatus(container.id);
}

function updateBackendAggregateStatus(pythonStatusId) {
    const aggregateDot = document.getElementById(`${pythonStatusId}-aggregate-dot`);
    if (!aggregateDot) return;
    const scopeIds = [pythonStatusId, 'backend-status-indicators'];
    let allGreen = true;
    let anyFound = false;
    scopeIds.forEach((id) => {
        const scope = document.getElementById(id);
        if (!scope) return;
        scope.querySelectorAll('.status-indicator').forEach((dot) => {
            if (getComputedStyle(dot).display === 'none') return;
            anyFound = true;
            if (!dot.classList.contains('connected')) allGreen = false;
        });
    });
    aggregateDot.className = `status-indicator ${anyFound && allGreen ? 'connected' : 'error'}`;
}

function copyCommandToClipboard(command, options = {}) {
    const { showCommandInAlert = false } = options;
    const copiedMessage = showCommandInAlert
        ? `Command copied to clipboard: ${command}`
        : 'Command copied to clipboard.';
    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(command).then(() => {
            alert(copiedMessage);
        }).catch(() => {
            prompt('Copy this command:', command);
        });
    } else {
        prompt('Copy this command:', command);
    }
}

function checkBackendAvailability(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    return fetch(url, { mode: 'no-cors', signal: controller.signal })
        .then(() => true)
        .catch(() => false)
        .finally(() => clearTimeout(timeoutId));
}

function checkWebrootFileExists(path, cacheKey, ttlMs = 15000) {
    const cache = getBackendStatusCache();
    const key = `file:${cacheKey}`;
    const now = Date.now();
    const cached = cache[key];

    if (cached && typeof cached.value === 'boolean' && now - cached.timestamp < ttlMs) {
        return Promise.resolve(cached.value);
    }
    if (cached && cached.promise) {
        return cached.promise;
    }

    const promise = (async () => {
        try {
            const headResponse = await fetch(path, { method: 'HEAD', cache: 'no-store' });
            if (headResponse.ok) return true;
            if (headResponse.status !== 405 && headResponse.status !== 501) return false;
        } catch (error) {
            // Fall back to GET below when HEAD fails.
        }

        try {
            const getResponse = await fetch(path, { method: 'GET', cache: 'no-store' });
            return getResponse.ok;
        } catch (error) {
            return false;
        }
    })().then((value) => {
        cache[key] = { value, timestamp: Date.now() };
        return value;
    }).finally(() => {
        if (cache[key]) {
            delete cache[key].promise;
        }
    });

    cache[key] = { ...(cache[key] || {}), promise };
    return promise;
}

function getSelectedModelsite() {
    if (typeof Cookies !== 'undefined' && typeof Cookies.get === 'function') {
        const cookieModelsite = Cookies.get('modelsite');
        if (cookieModelsite) {
            return cookieModelsite;
        }
    }

    if (typeof window !== 'undefined' && typeof window.modelsiteUniversal === 'string' && window.modelsiteUniversal) {
        return window.modelsiteUniversal;
    }

    const modelsiteSelect = document.getElementById('modelsite');
    if (modelsiteSelect && modelsiteSelect.value) {
        return modelsiteSelect.value;
    }
    const host = window.location.hostname.toLowerCase();
    if (host.includes('model.georgia') || host.includes('georgia.org') || host.includes('locations.pages.dev')) {
        return 'model.georgia';
    }
    return '';
}

function isGeorgiaModelsiteSelected() {
    return getSelectedModelsite() === 'model.georgia';
}

function getConfiguredLocalWebPort() {
    return isGeorgiaModelsiteSelected() ? '8888' : '8887';
}

function getConfiguredDotnetPort() {
    return '8010';
}

function updateGeorgiaModelsitePanelVisibility() {
    const isGeorgia = isGeorgiaModelsiteSelected();
    const panels = [
        document.getElementById('extraRepos'),
        document.getElementById('trade-flow-repos-container')
    ].filter(Boolean);
    panels.forEach((panel) => {
        panel.style.display = isGeorgia ? 'none' : '';
    });
}

async function updateBackendSectionVisibilityByFiles(container) {
    const engineRow = container ? container.querySelector('[data-backend="engine"]') : null;
    const pipelineRow = container ? container.querySelector('[data-backend="pipeline"]') : null;
    const cloudRow = container ? container.querySelector('[data-backend="cloud"]') : null;
    const nodejsRow = container ? container.querySelector('[data-backend="nodejs"]') : null;
    const dotnetRow = container ? container.querySelector('[data-backend="dotnet"]') : null;
    const hideForGeorgia = isGeorgiaModelsiteSelected();

    const [engineExists, nodejsExists, dotnetExists] = await Promise.all([
        checkWebrootFileExists('/requests/engine/index.html', 'requestsEngineIndex'),
        checkWebrootFileExists('/chat/server.mjs', 'chatServerMjs'),
        checkWebrootFileExists('/host/net/index.html', 'dotnetSetupIndex')
    ]);

    if (engineRow) {
        engineRow.style.display = engineExists ? '' : 'none';
    }
    if (pipelineRow) {
        pipelineRow.classList.toggle('geo-x', hideForGeorgia);
        pipelineRow.style.display = hideForGeorgia ? 'none' : '';
    }
    if (cloudRow) {
        cloudRow.classList.toggle('geo-x', hideForGeorgia);
        cloudRow.style.display = hideForGeorgia ? 'none' : '';
    }
    if (nodejsRow) {
        nodejsRow.style.display = nodejsExists ? '' : 'none';
    }
    if (dotnetRow) {
        dotnetRow.style.display = dotnetExists ? '' : 'none';
    }

    return {
        engineExists,
        pipelineExists: !hideForGeorgia,
        cloudExists: !hideForGeorgia,
        nodejsExists,
        dotnetExists
    };
}

function getBackendStatusCache() {
    window.backendStatusCache = window.backendStatusCache || {};
    return window.backendStatusCache;
}

function checkBackendAvailabilityCached(url, cacheKey, ttlMs = 5000) {
    const cache = getBackendStatusCache();
    const now = Date.now();
    const cached = cache[cacheKey];

    if (cached && typeof cached.value === 'boolean' && now - cached.timestamp < ttlMs) {
        return Promise.resolve(cached.value);
    }

    if (cached && cached.promise) {
        return cached.promise;
    }

    const promise = checkBackendAvailability(url)
        .then((value) => {
            cache[cacheKey] = { value, timestamp: Date.now() };
            return value;
        })
        .finally(() => {
            if (cache[cacheKey]) {
                delete cache[cacheKey].promise;
            }
        });

    cache[cacheKey] = { ...(cache[cacheKey] || {}), promise };
    return promise;
}

function notifyStopResult(message, type = 'info') {
    if (typeof showNotification === 'function') {
        showNotification(message, type);
        return;
    }
    alert(message);
}

async function stopLocalWebServer() {
    if (!isLocalhostAccessEnabled()) return;
    const localWebPort = getConfiguredLocalWebPort();
    const pythonAvailable = await checkBackendAvailabilityCached(`http://localhost:${localWebPort}/api/status`, `pythonServer${localWebPort}`);
    const rustAvailable = pythonAvailable
        ? false
        : await checkBackendAvailabilityCached('http://localhost:8081/api/health', 'rustApi');

    if (!pythonAvailable && !rustAvailable) {
        showStopServerFallback(localWebPort);
        return;
    }

    const confirmed = confirm('Your local website will be stopped.');
    if (!confirmed) {
        return;
    }

    if (pythonAvailable) {
        try {
            const response = await fetch(`http://localhost:${localWebPort}/api/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: 'stop_server' })
            });
            if (response.ok) {
                notifyStopResult('Local web server stop requested.', 'success');
                return;
            }
        } catch (error) {
            console.warn('Failed to stop via Python backend:', error);
        }
    }

    if (rustAvailable) {
        try {
            const response = await fetch('http://localhost:8081/api/config/stop-webroot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            if (response.ok) {
                notifyStopResult('Local web server stop requested.', 'success');
                return;
            }
        } catch (error) {
            console.warn('Failed to stop via Rust backend:', error);
        }
    }

    showStopServerFallback(localWebPort);
}

window.stopLocalWebServer = stopLocalWebServer;

function showStopServerFallback(localWebPort = getConfiguredLocalWebPort()) {
    const command = `lsof -ti:${localWebPort} | xargs kill -9`;
    const safeCommand = command.replace(/'/g, "\\'");
    const existingDialog = document.getElementById('stop-port-dialog');
    if (existingDialog) {
        existingDialog.remove();
    }

    const dialog = document.createElement('div');
    dialog.id = 'stop-port-dialog';
    dialog.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.35); display:flex; align-items:center; justify-content:center; z-index: 9999;';
    dialog.innerHTML = `
        <div style="background: white; border-radius: 10px; padding: 16px; max-width: 460px; width: calc(100% - 40px); box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
            <div style="color: var(--text-primary); font-weight: 600; margin-bottom: 8px;">Stop Local Server</div>
            <div style="color: var(--text-secondary); margin-bottom: 10px;">Backend stop is unavailable. Use this command to stop port ${localWebPort}:</div>
            <code style="display:block; background: var(--bg-tertiary); padding: 8px 10px; border-radius: 6px; font-size: 13px;">${command}</code>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top: 12px;">
                <button class="btn btn-secondary btn-width" id="stop-port-copy">Copy</button>
                <button class="btn btn-secondary btn-width" id="stop-port-cancel">Cancel</button>
            </div>
        </div>
    `;

    document.body.appendChild(dialog);

    const copyBtn = dialog.querySelector('#stop-port-copy');
    const cancelBtn = dialog.querySelector('#stop-port-cancel');
    const closeDialog = () => dialog.remove();

    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            copyCommandToClipboard(safeCommand);
            closeDialog();
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeDialog);
    }
}

async function updatePythonBackendStatus(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    ensureNoAiBackendUseAIListener();
    const { engineExists, nodejsExists, dotnetExists } = await updateBackendSectionVisibilityByFiles(container);
    updateNoAiFlaskStartVisibility();

    const checks = [];
    if (isLocalhostAccessEnabled()) {
        if (dotnetExists) {
            checks.push(
                checkBackendAvailability('http://localhost:8010/healthz')
                    .then((isRunning) => ({ backendKey: 'dotnet', isRunning }))
            );
        }
        if (engineExists) {
            checks.push(
                checkBackendAvailability('http://localhost:8082/api/health')
                    .then((isRunning) => ({ backendKey: 'engine', isRunning }))
            );
        }
        checks.push(
            checkBackendAvailability('http://localhost:5001/')
                .then((isRunning) => ({ backendKey: 'pipeline', isRunning }))
        );
        checks.push(
            checkBackendAvailability('http://localhost:8100/')
                .then((isRunning) => ({ backendKey: 'cloud', isRunning }))
        );
        if (nodejsExists) {
            checks.push(
                checkBackendAvailability('http://localhost:8888/')
                    .then((isRunning) => ({ backendKey: 'nodejs', isRunning }))
            );
        }
    }

    Promise.all(checks).then((results) => {
        results.forEach((result) => {
            setBackendRowStatus(container, result.backendKey, result.isRunning);
        });
    });

    relocateRustStatusIndicators(container);
}

function relocateRustStatusIndicators(container) {
    if (!container) return;
    const indicators = document.getElementById('backend-status-indicators');
    if (indicators) {
        if (container.firstChild !== indicators) {
            container.insertBefore(indicators, container.firstChild);
        }
        const rustContainer = document.getElementById('combined-rust-api-container');
        if (rustContainer) {
            rustContainer.style.display = 'none';
        }
    } else if (typeof waitForElm === 'function') {
        waitForElm('#backend-status-indicators').then(() => {
            relocateRustStatusIndicators(container);
        });
    }
}

function moveCommandsToggleBeforeUseAI(buttonId = 'quickstartDiv-toggle') {
    const agentCheckboxes = document.getElementById('agent-checkboxes');
    if (!agentCheckboxes || !agentCheckboxes.parentElement) {
        if (typeof waitForElm === 'function') {
            waitForElm('#quickstartDiv-toggle-host').then(() => moveCommandsToggleBeforeUseAI(buttonId));
        }
        return;
    }
    const controlsHost = document.getElementById('coding-with-controls');

    const toggleGroups = Array.from(document.querySelectorAll(`#${buttonId}`));
    if (!toggleGroups.length) {
        return;
    }

    // Keep the latest rendered toggle and remove stale duplicates.
    const toggleGroup = toggleGroups[toggleGroups.length - 1];
    toggleGroups.forEach((group) => {
        if (group !== toggleGroup) {
            group.remove();
        }
    });

    let host = document.getElementById('quickstartDiv-toggle-host');
    if (!host) {
        host = document.createElement('div');
        host.id = 'quickstartDiv-toggle-host';
    }
    host.style.display = 'flex';
    host.style.flexWrap = 'wrap';
    host.style.gap = '4px';
    host.style.margin = '0';
    host.style.alignItems = 'center';

    if (controlsHost) {
        if (host.parentElement !== controlsHost) {
            controlsHost.appendChild(host);
        }
    } else if (host.parentElement !== agentCheckboxes.parentElement || host.nextElementSibling !== agentCheckboxes) {
        agentCheckboxes.parentElement.insertBefore(host, agentCheckboxes);
    }
    const previousParent = toggleGroup.parentElement;
    const previousRow = previousParent ? previousParent.closest('.web-server-status-row') : null;
    if (toggleGroup.parentElement !== host) {
        host.appendChild(toggleGroup);
    }

    if (previousParent && previousParent !== host && previousParent.childElementCount === 0) {
        previousParent.remove();
    }
    if (previousRow && previousRow.parentElement && previousRow.querySelector('.quickstart-commands-toggle-group') == null) {
        previousRow.remove();
    }

    toggleGroup.style.gap = '2px';
    toggleGroup.style.marginLeft = '0';
    toggleGroup.style.justifyContent = 'flex-start';
    toggleGroup.style.width = '100%';
}

function setupCommandsToggle(buttonId, commandsContainerId, renderFn) {
    const buttonGroup = document.getElementById(buttonId);
    const commandsContainer = document.getElementById(commandsContainerId);
    if (!buttonGroup || !commandsContainer) return;

    const buttons = buttonGroup.querySelectorAll('.quickstart-commands-toggle-btn');
    window.primaryBackendCommandsContainerId = commandsContainerId;
    const setCommandsVisibility = (isOpen) => {
        commandsContainer.style.display = isOpen ? 'block' : 'none';
    };

    const ensureLoaded = () => {
        if (commandsContainer.dataset.loaded || typeof renderFn !== 'function') {
            return;
        }
        renderFn(commandsContainerId);
        commandsContainer.dataset.loaded = 'true';
    };

    const initialState = getBackendCommandState();
    setGlobalCommandToggleAppearance(initialState);
    if (typeof updateRustTabState === 'function') {
        updateRustTabState(initialState);
    }
    const hasAnyModeOnLoad = hasEnabledBackendCommandMode(initialState);
    const showCommandsOnLoad = shouldShowFullCommandsContainer(initialState);
    if (hasAnyModeOnLoad) {
        ensureLoaded();
    }
    setCommandsVisibility(showCommandsOnLoad);
    updateQuickstartCliVisibility();

    buttons.forEach((button) => {
        if (button.dataset.bound === 'true') return;
        button.dataset.bound = 'true';
        button.addEventListener('click', () => {
            const mode = button.dataset.mode === 'with-ai' || button.dataset.mode === 'both'
                ? button.dataset.mode
                : 'without-ai';
            const nextState = applyAiModeSelection(mode, { updateHash: true, updateCache: true });
            if (hasEnabledBackendCommandMode(nextState)) {
                ensureLoaded();
            }
            setCommandsVisibility(shouldShowFullCommandsContainer(nextState));
            updateQuickstartCliVisibility();
        });
    });
}

async function setupWebServerStatusPanel(options) {
    const statusIndicator = document.getElementById(options.statusIndicatorId);
    const titleEl = document.getElementById(options.titleId);
    const contentEl = document.getElementById(options.contentId);
    if (!statusIndicator || !titleEl || !contentEl) return;
    const renderToken = String(Date.now()) + Math.random().toString(36).slice(2);
    contentEl.dataset.webServerRenderToken = renderToken;

    const {
        isRunning,
        detectedLabel,
        currentOriginUrl,
        isLocalOrigin,
        localhostPort,
        localhostWebUrl,
        localhostWebRunning,
        localhostApiRunning,
        currentOriginRunning
    } = await getWebServerStatusState();
    if (!contentEl.isConnected || contentEl.dataset.webServerRenderToken !== renderToken) return;
    const nodeStatus = await getNodeWebServerProbeState(localhostPort);
    if (!contentEl.isConnected || contentEl.dataset.webServerRenderToken !== renderToken) return;
    const currentOriginDisplay = currentOriginUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const localhostDisplay = localhostWebUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const connectedClass = options.buttonClassConnected || options.buttonClass || 'btn btn-secondary';
    const defaultClass = options.buttonClassDefault || options.buttonClass || 'btn btn-secondary';
    const buttonId = options.toggleButtonId;
    const commandsContainerId = options.commandsContainerId;
    const isCompactToggle = buttonId === 'quickstartDiv-toggle' || buttonId === 'webserver-commands-toggle';
    const useTopToggleHost = buttonId === 'quickstartDiv-toggle' && !!document.getElementById('quickstartDiv-toggle-host');
    const toggleGap = isCompactToggle ? '2px' : '8px';
    const toggleGroupClass = `quickstart-commands-toggle-group${isCompactToggle ? ' compact-toggle-group' : ''}`;

    titleEl.textContent = 'Web Servers';
    const webserverLabel = localhostApiRunning
        ? 'Python HTTP Server Server-Side'
        : (localhostWebRunning ? 'Python HTTP-Only Server' : 'Python HTTP Server');
    const stopBtn = isRunning && isLocalOrigin
        ? `<button class="btn btn-secondary quickstart-stop-port-btn" onclick="stopLocalWebServer()">Stop ${localhostPort} Server</button>`
        : '';
    const btnClass = isRunning ? connectedClass : defaultClass;
    const toggleGroupMarkup = `
                <div id="${buttonId}" class="${toggleGroupClass}" style="display:flex; flex-wrap:wrap; gap:${toggleGap}; justify-content:flex-end;">
                    ${getQuickstartToggleButtonMarkup('with-ai', btnClass, 'With AI')}
                    ${getQuickstartToggleButtonMarkup('without-ai', btnClass, 'Without AI')}
                    ${getQuickstartToggleButtonMarkup('both', btnClass, 'Both')}
                </div>
    `;
    contentEl.innerHTML = `
        <div data-backend="webserver" style="margin-bottom: 0;">
            <div style="display:flex; flex-wrap:wrap; align-items:center; gap:8px;">
                <span class="status-indicator ${isRunning ? 'connected' : 'error'}"></span>
                <span style="flex: 1;"><a href="http://localhost:${localhostPort}">${webserverLabel}</a> (port ${localhostPort}): <span class="backend-text">${isRunning ? 'Running' : 'Not running'}</span></span>
            </div>
            <div class="with-ai-backend-cmd" style="display:none; margin-top: 6px;">
                <p style="color: var(--text-secondary); margin: 0 0 6px 0;"><strong>Using your Code CLI</strong>, start a web server with server-side Python on port ${localhostPort}:</p>
                <pre style="background: var(--bg-tertiary); border-radius: var(--radius-sm); overflow-x: auto; margin: 0;"><code>start server using guidance in team/AGENTS.md</code></pre>
            </div>
            <div class="no-ai-backend-cmd" style="display:none; margin-top: 6px;">
                <div style="color: var(--text-secondary); margin: 0 0 4px 0;">HTTP Server Only</div>
                <div style="position: relative; container-type: inline-size; margin: 0 0 4px 0;">
                    <pre class="quickstart-port-pre${isRunning ? ' quickstart-port-pre-with-stop' : ''}" style="background: var(--bg-tertiary); border-radius: var(--radius-sm); overflow-x: auto;"><code>python -m http.server ${localhostPort}</code></pre>
                    ${stopBtn}
                </div>
                <div style="color: var(--text-secondary); margin: 0 0 4px 0;">With Server-Side Python and support for <a href="#" id="desktop-installer-link" style="color: inherit; text-decoration: underline; cursor: pointer;">Desktop Installer</a></div>
                <pre style="background: var(--bg-tertiary); border-radius: var(--radius-sm); overflow-x: auto; margin: 0 0 4px 0;"><code>nohup ./desktop/install/quickstart.sh --cli --port ${localhostPort} > /dev/null 2>&1 &</code></pre>
                <div id="quickstart-desktop-installer-details" style="display:none; margin: 0 0 4px 0;">
                    <div id="quickstart-mac-linux-section">
                        <p style="color: var(--text-primary); margin: 0 0 4px 0;">Optional: run an executable python backend for the <a href="/desktop/install/" id="quickstart-manage-desktop-apps-link">Desktop Installer</a>${localhostPort ? ` (stop existing ${localhostPort} first.)` : ''}</p>
                        <pre style="background: var(--bg-tertiary); border-radius: var(--radius-sm); overflow-x: auto; margin: 0 0 6px 0;"><code>python3 -m venv env
source env/bin/activate
./desktop/install/quickstart.sh ${localhostPort}</code></pre>
                    </div>
                    <div id="quickstart-windows-section">
                        <p style="color: var(--text-primary); margin: 0 0 4px 0;">Start http server and server-side Python (PC):</p>
                        <pre style="background: var(--bg-tertiary); border-radius: var(--radius-sm); overflow-x: auto; margin: 0 0 6px 0;"><code>python -m venv env
env\\\\Scripts\\\\activate
./desktop/install/quickstart.sh ${localhostPort}</code></pre>
                    </div>
                    <p style="color: var(--text-secondary); margin: 0 0 4px 0;"><strong>About the quickstart.sh script:</strong></p>
                    <ul style="color: var(--text-secondary); margin: 0 0 4px 20px;">
                        <li>Automatically creates a virtual environment in <code>desktop/install/env/</code> if it doesn't exist</li>
                        <li>Activates the virtual environment</li>
                        <li>Checks for Claude API key configuration in <code>docker/.env</code></li>
                        <li>Installs the <code>anthropic</code> package if API key is present</li>
                        <li>Starts the Python HTTP server with server-side execution access via server.py on port ${localhostPort}</li>
                    </ul>
                </div>
            </div>
        </div>
        <hr style="border:none; border-top:1px solid var(--border-light); margin: 8px 0 0 0;">
        ${getPythonBackendStatusMarkup(options.pythonStatusId)}
        ${useTopToggleHost ? '' : `<div class="web-server-status-row" style="margin-top: 6px;">
            <div class="actions ${isCompactToggle ? 'quickstart-toggle-actions' : ''}" style="display:flex; flex-wrap:wrap; gap:8px; justify-content:flex-end;">
                ${toggleGroupMarkup}
            </div>
        </div>`}
        <div id="${commandsContainerId}-ai-prompt-host" class="quickstart-ai-prompt-host" data-commands-container-id="${commandsContainerId}" style="display:none; margin-top: 8px;"></div>
        ${getNodeWebServerStatusMarkup(nodeStatus)}
    `;

    if (useTopToggleHost) {
        const topToggleHost = document.getElementById('quickstartDiv-toggle-host');
        if (topToggleHost) {
            topToggleHost.innerHTML = toggleGroupMarkup;
        }
    }

    const commandsContainer = document.getElementById(commandsContainerId);
    const statusRow = contentEl.querySelector('.web-server-status-row');
    if (commandsContainer && statusRow) {
        statusRow.insertAdjacentElement('afterend', commandsContainer);
    }
    const aiPromptHost = document.getElementById(`${commandsContainerId}-ai-prompt-host`);
    if (aiPromptHost && commandsContainer) {
        commandsContainer.insertAdjacentElement('beforebegin', aiPromptHost);
    }

    const webserverRow = contentEl.querySelector('[data-backend="webserver"]');
    if (webserverRow) {
        updateBackendCommandForRow(webserverRow, isRunning);
    }

    const desktopLink = contentEl.querySelector('#desktop-installer-link');
    const desktopDetails = document.getElementById('quickstart-desktop-installer-details');
    if (desktopLink && desktopDetails) {
        desktopLink.addEventListener('click', (e) => {
            e.preventDefault();
            const isHidden = desktopDetails.style.display === 'none';
            desktopDetails.style.display = isHidden ? 'block' : 'none';
            updateRustRecheckMessageVisibilityForDesktopInstaller();
        });
    }

    setupCommandsToggle(buttonId, commandsContainerId, renderQuickstartCommands);
    updatePythonBackendStatus(options.pythonStatusId);
}

// Shared function to setup quickstart instructions
// Used by root index.html
function setupQuickstartInstructions(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const statusIndicatorId = `${containerId}-status-indicator`;
    const titleId = `${containerId}-title`;
    const contentId = `${containerId}-content`;
    const toggleButtonId = `${containerId}-toggle`;
    const commandsContainerId = `${containerId}-commands`;
    const pythonStatusId = `${containerId}-python-status`;
    const contentStyle = containerId === 'quickstartDiv' ? ' style="margin-bottom: 15px;"' : '';
    const localWebPort = getConfiguredLocalWebPort();
    const currentPort = window.location.port;
    const desktopInstallerPort = (currentPort && /^[0-9]+$/.test(currentPort))
        ? currentPort
        : '8887';
    const localhostToggleTitle = 'Enable to check if a local server is running (may trigger a browser permission prompt)';
    const localhostToggleHTML = `
        <label id="localhost-access-toggle-label" title="${localhostToggleTitle}" style="margin-left:auto; display:flex; align-items:center; gap:6px; font-size:13px; font-weight:normal; cursor:pointer; white-space:nowrap;">
            <span class="toggle-switch" style="position:relative; display:inline-block; width:34px; height:18px; flex-shrink:0;">
                <input type="checkbox" id="localhost-access-toggle" style="opacity:0; width:0; height:0; position:absolute;" ${isLocalhostToggleChecked() ? 'checked' : ''}>
                <span class="toggle-slider" style="position:absolute; cursor:pointer; inset:0; background:var(--bg-tertiary,#ccc); border-radius:18px; transition:background .2s;"></span>
                <span class="toggle-knob" style="position:absolute; left:2px; top:2px; width:14px; height:14px; background:#fff; border-radius:50%; transition:transform .2s; transform:${isLocalhostToggleChecked() ? 'translateX(16px)' : 'translateX(0)'};"></span>
            </span>
            Localhost Backend
        </label>`;

    container.innerHTML = `
        <div>
            <h1 class="card-title" style="display:flex; align-items:center; gap:10px;">
                <span class="status-indicator" id="${statusIndicatorId}" style="display:none;"></span>
                <span id="${titleId}">Web Servers</span>
            </h1>
            <div id="${contentId}"${contentStyle}></div>
            <div id="${commandsContainerId}" class="readme-content" style="display:none; margin-top: 16px;"></div>
        </div>
    `;

    // Place notice after #coding-with-right, spanning full width of the flex row
    if (!document.getElementById('quickstartDiv-localhost-notice')) {
        const codingWithRight = document.getElementById('coding-with-right');
        if (codingWithRight && codingWithRight.parentElement) {
            const wrapper = document.createElement('div');
            wrapper.id = 'localhost-toggle-wrapper';
            wrapper.style.width = '100%';

            const toggleWrapper = document.createElement('div');
            toggleWrapper.innerHTML = localhostToggleHTML;
            const toggleLabel = toggleWrapper.firstElementChild;
            toggleLabel.style.marginLeft = '';
            wrapper.appendChild(toggleLabel);

            const noticeEl = document.createElement('div');
            noticeEl.id = 'quickstartDiv-localhost-notice';
            wrapper.appendChild(noticeEl);

            codingWithRight.parentElement.insertBefore(wrapper, codingWithRight.nextSibling);
        }
    }

    moveGithubCliAutoStatusToQuickstart();
    attachQuickstartCliListeners();

    const localhostToggle = document.getElementById('localhost-access-toggle');
    if (localhostToggle) {
        applyLocalhostToggleStyle(localhostToggle, isLocalhostToggleChecked());
        localhostToggle.addEventListener('change', () => {
            setLocalhostAccessEnabled(localhostToggle.checked);
            applyLocalhostToggleStyle(localhostToggle, localhostToggle.checked);
            updateLocalhostAccessNotice();
            window.backendStatusCache = {};
            setupWebServerStatusPanel({
                statusIndicatorId,
                titleId,
                contentId,
                toggleButtonId,
                commandsContainerId,
                pythonStatusId,
                buttonClass: 'btn btn-secondary'
            });
        });
    }
    bindLocalhostSettingsSync();
    updateLocalhostAccessNotice();

    setupWebServerStatusPanel({
        statusIndicatorId,
        titleId,
        contentId,
        toggleButtonId,
        commandsContainerId,
        pythonStatusId,
        buttonClass: 'btn btn-secondary'
    });
}
