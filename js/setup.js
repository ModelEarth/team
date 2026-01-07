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
      <div style="float: right; margin-bottom: 15px;">
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
    // Set webroot Git URL based on current URL
    const currentUrl = window.location.href.toLowerCase();
    const webrootGit = (currentUrl.includes('locations') || currentUrl.includes('geo')) 
        ? 'https://github.com/partnertools/webroot/' 
        : 'https://github.com/modelearth/webroot/';
    
    return `
      <a href="/team/admin/">Partner Tools</a><h1 class="card-title">Webroot setup</h1>
      1. Install <a href="https://github.com/apps/desktop" target="github_desktop">Github Desktop</a><br>
      2. Go to <!--Fork the webroot repo--><a href="${webrootGit}" target="github_webroot">${webrootGit}</a> and click the "Fork" button in the upper right.<br>
      3. Click the Green Button on <span id="webrootFork">your webroot fork</span> and choose "Open with Github Desktop" to clone the repo.<br>
      4. Choose "To contribute to the parent project" (ModelEarth/webroot) as you clone via Github Desktop.<br>
      5. Start your Command Line Interface (CLI) using the following commands:<br>`;
}

// HTML content for the trade flow repos section
function createTradeFlowReposHTML() {
    return `
        <h1 class="card-title">Extra Repos</h1>
        <p>Optional: To contribute to our data-pipeline or industry tradeflow visualizations, run the following to fork and clone:<br>
        data-pipeline, trade-data, nisar, community, evaporation-kits</p>
        
        <pre><code id="forkReposCmds">using claude.md
fork extra repos to [your github account]
clone extra repos from [your github account]
</code></pre>

        <p>The above requires having GitHub CLI (gh) installed locally and authenticated with your GitHub account. (Steps above)</p>
        
        <p><a href="https://model.earth/codechat/">Overview of repos (codechat)</a></p>
    `;
}

function createBackendInfo() {
    return `<h1 class="card-title">Rust API Backend</h1>
  Run "Start Rust" if your backend isn't started yet.<br><br>
  <a href="http://localhost:8887/team/admin/sql/panel/" class="btn btn-primary" style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px; background-color: #3B82F6; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; margin-right: 12px;">
    <span>🗄️</span>
    Rust API and Database
  </a>`
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
        const linkHTML = `<a href="${linkUrl}" target="github_fork">your webroot fork</a>`;
        
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
    if (myWebrootForkNameField && localStorage.myWebrootForkName && !myWebrootForkNameField.value) {
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
        myWebrootForkNameField.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && this.value.trim() === '') {
                localStorage.removeItem('myWebrootForkName');
                updateGitAccountFields();
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
        if (myWebrootForkNameField && localStorage.myWebrootForkName && !myWebrootForkNameField.value) {
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
        // Insert the HTML at the beginning of the container
        const fieldsHTML = createGitAccountFieldsHTML();
        container.insertAdjacentHTML('afterbegin', fieldsHTML);
        
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
        // Insert the webroot setup HTML
        const setupHTML = createWebrootSetupHTML();
        container.innerHTML = setupHTML;
        
        // Update the webroot fork link after inserting the content
        setTimeout(() => {
            updateWebrootForkLink();
        }, 100);
    }
}

// Setup trade flow repos section in a target container
function setupTradeFlowRepos(containerId) {
    const container = document.getElementById(containerId);
    if (container) {
        // Insert the trade flow repos HTML
        const tradeFlowHTML = createTradeFlowReposHTML();
        container.innerHTML = tradeFlowHTML;
        
        // Update the fork repos commands after inserting the content
        setTimeout(() => {
            updateForkReposCommands();
        }, 100);
    }
}
function setupBackendInfo(containerId) {
    const container = document.getElementById(containerId);
    if (container) {
        const backendInfoHTML = createBackendInfo();
        container.innerHTML = backendInfoHTML;
    }
}

// API Configuration (use existing API_BASE if available, otherwise define it)
if (typeof API_BASE === 'undefined') {
    // Use getApiBase from common.js if available (handles localhost fallback)
    var API_BASE = (typeof getApiBase === 'function') ? getApiBase() : 'http://localhost:8081/api';
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
        titleElement.innerHTML = '✅ Your Gemini Key is Activated';

        // Use teamPathSetup to get correct relative path to projects
        const projectsPath = teamPathSetup + 'projects/#list=all';

        contentElement.innerHTML = `
            You can ask questions about datasets on the <a href="${projectsPath}">AI Data Insights</a> page.<br>
            <a href="https://ai.google.dev/gemini-api/docs/quickstart" title="Gemini key" target="_blank">Gemini key</a> resides in docker/.env - <a href="#" onclick="testGeminiFromPanel(); return false;">Test Gemini API</a>
            <div id="gemini-test-result" style="margin-top: 8px;"></div>
            <div style="margin-top: 8px;">
                <button onclick="toggleGeminiKeyInput()" class="btn btn-primary" style="display: inline-flex; align-items: center; gap: 6px; text-decoration: none; border: none; cursor: pointer;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path>
                        <circle cx="12" cy="16" r="1"></circle>
                        <circle cx="12" cy="12" r="1"></circle>
                        <circle cx="16" cy="12" r="1"></circle>
                    </svg>
                    Change Key
                </button>
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
        const titlePrefix = cachedKey ? '🟡 Gemini Key Available (Browser Cache)' : '🔴 Add Gemini Key';
        const storageText = cachedKey ? 'Your key is stored in your browser cache only' : 'Your key will be stored in your browser cache only';
        const envText = cachedKey ? `To use additional keys residing in docker/.env, <a href="${adminServerPath}">start the Rust API server</a>.` : `Or add your key to docker/.env and <a href="${adminServerPath}">start the Rust API server</a> to detect it.`;
        const linkText = cachedKey ? 'Get another Gemini key' : 'Get your Gemini key';

        titleElement.innerHTML = titlePrefix;
        contentElement.innerHTML = `
            <div style="margin-top: 8px;">
                ${storageText} - <a href="https://ai.google.dev/gemini-api/docs/quickstart" target="_blank" style="color: var(--accent-blue);">${linkText}</a>
            </div>
            <div style="margin-top: 8px;">
                ${envText}
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