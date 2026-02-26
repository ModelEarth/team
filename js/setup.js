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
        <p>Optional: To contribute to our tradeflow visualizations, run the following to fork and clone:<br>
        trade-data, community, cv, nisar, evaporation-kits</p>
        
        <pre><code id="forkReposCmds">using guidance in webroot/AGENTS.md
fork extra repos to [your github account]
clone extra repos from [your github account]
</code></pre>

        <p>The above requires having GitHub CLI (gh) installed locally and authenticated with your GitHub account. (Steps above)</p>
        
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
                    <button onclick="cancelGeminiKey()" class="btn btn-secondary btn-width" style="padding: 8px 16px; font-size: 14px;">Cancel</button>
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
                    <button onclick="cancelGeminiKey()" class="btn btn-secondary btn-width" style="padding: 8px 16px; font-size: 14px;">Cancel</button>
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

function getQuickstartCommandsHtml() {
    const isLocalhost = window.location.hostname === 'localhost';
    const basicCommandPreClass = isLocalhost
        ? 'quickstart-8887-pre quickstart-8887-pre-with-stop'
        : 'quickstart-8887-pre';
    const stopServerButton = isLocalhost
        ? `
            <button class="btn btn-secondary quickstart-stop-8887-btn" onclick="stopLocalWebServer()">
                Stop 8887 Server
            </button>
        `
        : '';
    return `
        <p style="color: var(--text-primary);"><strong>Start basic HTTP server without server-side Python execution:</strong></p>
        <div class="quickstart-8887-wrap" style="position:relative; container-type:inline-size;">
            <pre class="${basicCommandPreClass}" style="background: var(--bg-tertiary); border-radius: var(--radius-sm); overflow-x: auto;"><code>python -m http.server 8887</code></pre>
            ${stopServerButton}
        </div>
        <div style="color: var(--text-secondary); display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-top: 12px;">
            <span id="quickstart-cli-line"><strong>Using your Code CLI</strong>, start a web server (and python backend) within a virtual environment on port 8887:</span>
        </div>
        <div id="stop-8887-fallback"></div>
        <pre id="quickstart-cli-command" style="background: var(--bg-tertiary); border-radius: var(--radius-sm); overflow-x: auto;"><code>start server using guidance in team/AGENTS.md</code></pre>
        <div id="quickstart-cli-placeholder" style="color: var(--text-secondary); margin-top: 6px;">Choose a Code CLI above to see more commands.</div>
        <div id="quickstart-mac-linux-section">
            <p style="color: var(--text-primary);">The above start server command is the equivalent to:</p>
            <pre style="background: var(--bg-tertiary); border-radius: var(--radius-sm); overflow-x: auto;"><code>python3 -m venv env
source env/bin/activate
./desktop/install/quickstart.sh</code></pre>
        </div>
        <div id="quickstart-windows-section">
            <p style="color: var(--text-primary);">Start http server and server-side Python (PC):</p>
            <pre style="background: var(--bg-tertiary); border-radius: var(--radius-sm); overflow-x: auto;"><code>python -m venv env
env\\Scripts\\activate
./desktop/install/quickstart.sh</code></pre>
        </div>
        <p style="color: var(--text-secondary);"><strong>About the quickstart.sh script:</strong></p>
        <ul style="color: var(--text-secondary); margin-left: 20px;">
            <li>Automatically creates a virtual environment in <code>desktop/install/env/</code> if it doesn't exist</li>
            <li>Activates the virtual environment</li>
            <li>Checks for Claude API key configuration in <code>docker/.env</code></li>
            <li>Installs the <code>anthropic</code> package if API key is present</li>
            <li>Starts the Python HTTP server with server-side execution access via server.py on port 8887</li>
        </ul>
    `;
}

function ensureQuickstartLayoutStyles() {
    if (document.getElementById('quickstart-layout-styles')) {
        return;
    }
    const style = document.createElement('style');
    style.id = 'quickstart-layout-styles';
    style.textContent = `
        .quickstart-8887-pre {
            margin: 0;
        }
        .quickstart-8887-pre-with-stop {
            padding-right: 0;
        }
        .quickstart-8887-pre > code {
            width: 100%;
        }
        .quickstart-stop-8887-btn {
            position: absolute;
            top: 8px;
            right: 8px;
            margin: 0;
            width: auto !important;
            min-width: 0;
            z-index: 1;
        }
        @container (max-width: 520px) {
            .quickstart-8887-pre-with-stop {
                padding-right: 0;
            }
            .quickstart-stop-8887-btn {
                width: auto !important;
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
    attachQuickstartCliListeners();
    updateQuickstartCliVisibility();
}

let quickstartCliListenersAttached = false;
let quickstartOsListenerAttached = false;

function attachQuickstartCliListeners() {
    if (!quickstartCliListenersAttached) {
        const checkboxIds = ['codex-cli', 'claude-code-cli', 'gemini-cli', 'vscode-claude'];
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
}

function updateQuickstartCliVisibility() {
    const line = document.getElementById('quickstart-cli-line');
    const command = document.getElementById('quickstart-cli-command');
    const placeholder = document.getElementById('quickstart-cli-placeholder');
    if (!line) {
        return;
    }

    const checkboxIds = ['codex-cli', 'claude-code-cli', 'gemini-cli', 'vscode-claude'];
    const isAnyChecked = checkboxIds.some((id) => {
        const checkbox = document.getElementById(id);
        return checkbox && checkbox.checked;
    });

    line.style.display = isAnyChecked ? 'inline' : 'none';
    if (command) {
        command.style.display = isAnyChecked ? 'block' : 'none';
    }
    if (placeholder) {
        placeholder.style.display = isAnyChecked ? 'none' : 'block';
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

    const localhost8887Url = 'http://localhost:8887/';
    const localhost8887ApiStatusUrl = 'http://localhost:8887/api/status';

    const [localhost8887Running, localhost8887ApiRunning, currentOriginRunning] = await Promise.all([
        checkBackendAvailabilityCached(localhost8887Url, 'webServerLocalhost8887'),
        checkBackendAvailabilityCached(localhost8887ApiStatusUrl, 'webServerLocalhost8887Api'),
        checkBackendAvailabilityCached(currentOriginUrl, 'webServerCurrentOrigin')
    ]);

    let isRunning = false;
    let detectedUrl = '';
    let detectedLabel = '';
    let detectedType = 'none';

    if (localhost8887Running) {
        isRunning = true;
        detectedUrl = localhost8887Url;
        detectedLabel = 'port 8887';
        detectedType = 'localhost8887';
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
        localhost8887Url,
        localhost8887ApiStatusUrl,
        localhost8887Running,
        localhost8887ApiRunning,
        currentOriginRunning,
        serverSidePythonAvailable: localhost8887ApiRunning
    };
}

function getPythonBackendStatusMarkup(containerId) {
    return `
        <div id="${containerId}" style="color: var(--text-secondary);">
            <div data-backend="pipeline" style="display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-top: 6px;">
                <span class="status-indicator loading"></span>
                <span style="flex: 1;"><a href="/data-pipeline/admin">Data-Pipeline Flask</a> (port 5001): <span class="backend-text">Checking...</span></span>
                <button class="btn btn-secondary btn-width backend-action" data-backend-action="pipeline" style="margin-left:auto;">Start Flask 5001</button>
            </div>
            <div data-backend="cloud" style="display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-top: 6px;">
                <span class="status-indicator loading"></span>
                <span style="flex: 1;"><a href="/cloud/run">Cloud/Run Flask</a> (port 8100): <span class="backend-text">Checking...</span></span>
                <button class="btn btn-secondary btn-width backend-action" data-backend-action="cloud" style="margin-left:auto;">Start Flask 8100</button>
            </div>
        </div>
    `;
}

function setBackendRowStatus(container, backendKey, isRunning) {
    const row = container ? container.querySelector(`[data-backend="${backendKey}"]`) : null;
    if (!row) return;
    const indicator = row.querySelector('.status-indicator');
    const text = row.querySelector('.backend-text');
    const actionButton = row.querySelector('.backend-action');
    if (!indicator || !text) return;

    if (isRunning) {
        indicator.className = 'status-indicator connected';
        text.textContent = 'Running';
        if (actionButton) {
            actionButton.textContent = backendKey === 'pipeline' ? 'Stop Flask 5001' : 'Stop Flask 8100';
            actionButton.dataset.running = 'true';
        }
    } else {
        indicator.className = 'status-indicator error';
        text.textContent = 'Not running';
        if (actionButton) {
            actionButton.textContent = backendKey === 'pipeline' ? 'Start Flask 5001' : 'Start Flask 8100';
            actionButton.dataset.running = 'false';
        }
    }
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

function attachBackendActionHandlers(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const buttons = container.querySelectorAll('.backend-action');
    buttons.forEach((button) => {
        button.addEventListener('click', () => {
            const backend = button.dataset.backendAction;
            const isRunning = button.dataset.running === 'true';
            let command = '';

            if (backend === 'pipeline') {
                command = isRunning ? 'lsof -ti:5001 | xargs kill -9' : 'start pipeline';
            } else if (backend === 'cloud') {
                command = isRunning ? 'lsof -ti:8100 | xargs kill -9' : 'start cloud';
            }

            if (command) {
                copyCommandToClipboard(command, { showCommandInAlert: true });
            }
        });
    });
}

function checkBackendAvailability(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    return fetch(url, { mode: 'no-cors', signal: controller.signal })
        .then(() => true)
        .catch(() => false)
        .finally(() => clearTimeout(timeoutId));
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
    const pythonAvailable = await checkBackendAvailabilityCached('http://localhost:8887/api/status', 'pythonServer');
    const rustAvailable = pythonAvailable
        ? false
        : await checkBackendAvailabilityCached('http://localhost:8081/api/health', 'rustApi');

    if (!pythonAvailable && !rustAvailable) {
        showStopServerFallback();
        return;
    }

    const confirmed = confirm('Your local website will be stopped.');
    if (!confirmed) {
        return;
    }

    if (pythonAvailable) {
        try {
            const response = await fetch('http://localhost:8887/api/execute', {
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

    showStopServerFallback();
}

window.stopLocalWebServer = stopLocalWebServer;

function showStopServerFallback() {
    const command = 'lsof -ti:8887 | xargs kill -9';
    const safeCommand = command.replace(/'/g, "\\'");
    const existingDialog = document.getElementById('stop-8887-dialog');
    if (existingDialog) {
        existingDialog.remove();
    }

    const dialog = document.createElement('div');
    dialog.id = 'stop-8887-dialog';
    dialog.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.35); display:flex; align-items:center; justify-content:center; z-index: 9999;';
    dialog.innerHTML = `
        <div style="background: white; border-radius: 10px; padding: 16px; max-width: 460px; width: calc(100% - 40px); box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
            <div style="color: var(--text-primary); font-weight: 600; margin-bottom: 8px;">Stop Local Server</div>
            <div style="color: var(--text-secondary); margin-bottom: 10px;">Backend stop is unavailable. Use this command to stop port 8887:</div>
            <code style="display:block; background: var(--bg-tertiary); padding: 8px 10px; border-radius: 6px; font-size: 13px;">${command}</code>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top: 12px;">
                <button class="btn btn-secondary btn-width" id="stop-8887-copy">Copy</button>
                <button class="btn btn-secondary btn-width" id="stop-8887-cancel">Cancel</button>
            </div>
        </div>
    `;

    document.body.appendChild(dialog);

    const copyBtn = dialog.querySelector('#stop-8887-copy');
    const cancelBtn = dialog.querySelector('#stop-8887-cancel');
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

function updatePythonBackendStatus(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    attachBackendActionHandlers(containerId);

    Promise.all([
        checkBackendAvailability('http://localhost:5001/'),
        checkBackendAvailability('http://localhost:8100/')
    ]).then(([pipelineRunning, cloudRunning]) => {
        setBackendRowStatus(container, 'pipeline', pipelineRunning);
        setBackendRowStatus(container, 'cloud', cloudRunning);
    });
}

function setupCommandsToggle(buttonId, commandsContainerId, renderFn) {
    const toggleButton = document.getElementById(buttonId);
    const commandsContainer = document.getElementById(commandsContainerId);
    if (!toggleButton || !commandsContainer) return;

    const setButtonState = (isOpen) => {
        toggleButton.dataset.open = isOpen ? 'true' : 'false';
        toggleButton.textContent = isOpen ? 'Hide Commands' : 'View Commands';
        commandsContainer.style.display = isOpen ? 'block' : 'none';
    };

    setButtonState(false);

    toggleButton.addEventListener('click', () => {
        const isOpen = toggleButton.dataset.open === 'true';
        if (!isOpen && typeof renderFn === 'function') {
            if (!commandsContainer.dataset.loaded) {
                renderFn(commandsContainerId);
                commandsContainer.dataset.loaded = 'true';
            }
        }
        setButtonState(!isOpen);
    });
}

async function setupWebServerStatusPanel(options) {
    const statusIndicator = document.getElementById(options.statusIndicatorId);
    const titleEl = document.getElementById(options.titleId);
    const contentEl = document.getElementById(options.contentId);
    if (!statusIndicator || !titleEl || !contentEl) return;

    const {
        isRunning,
        detectedUrl,
        detectedLabel,
        currentOriginUrl,
        isLocalOrigin,
        localhost8887Url,
        localhost8887ApiStatusUrl,
        localhost8887Running,
        localhost8887ApiRunning,
        currentOriginRunning,
        serverSidePythonAvailable
    } = await getWebServerStatusState();
    const activeUrl = detectedUrl || window.location.href;
    const displayUrl = activeUrl
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '');
    const currentOriginDisplay = currentOriginUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const localhost8887Display = localhost8887Url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const localhost8887ApiStatusDisplay = localhost8887ApiStatusUrl.replace(/^https?:\/\//, '');
    const withBtnWidth = (className) => className && className.includes('btn-width')
        ? className
        : `${className} btn-width`;
    const connectedClass = withBtnWidth(options.buttonClassConnected || options.buttonClass || 'btn btn-secondary');
    const defaultClass = withBtnWidth(options.buttonClassDefault || options.buttonClass || 'btn btn-secondary');
    const buttonId = options.toggleButtonId;
    const commandsContainerId = options.commandsContainerId;

    if (isRunning) {
        statusIndicator.className = 'status-indicator connected';
        titleEl.textContent = `Web Server Running (${detectedLabel})`;
        contentEl.innerHTML = `
            <div class="web-server-status-row" style="display:flex; flex-wrap:wrap; gap:12px; align-items:flex-start;">
                <div class="status-text" style="display:flex; align-items:flex-start; gap:8px; flex: 1 1 360px;">
                    <span class="status-indicator-holder" style="display:flex; align-items:center;"></span>
                    <p style="color: var(--text-secondary); margin: 0;">
                        Your local http server is running at <a href="${activeUrl}">${displayUrl}</a><br>
                        ${serverSidePythonAvailable ? 'Server-side Python API detected' : 'Server-side Python API not detected'} at ${localhost8887ApiStatusDisplay}<br>
                        <!--
                        <span style="font-size: 13px;">
                            Checks: origin <code>${currentOriginDisplay}</code> (${currentOriginRunning ? 'reachable' : 'not reachable'}), local web server <code>${localhost8887Display}</code> (${localhost8887Running ? 'reachable' : 'not reachable'}), local API path <code>/api/status</code> on port 8887 (${localhost8887ApiRunning ? 'reachable' : 'not reachable'}).
                        </span>
                        -->
                    </p>
                </div>
                <div class="actions" style="display:flex; flex-wrap:wrap; gap:8px; margin-left:auto; justify-content:flex-end;">
                    <button class="${connectedClass}" id="${buttonId}" style="margin-left:auto;">
                        View Commands
                    </button>
                </div>
            </div>
            ${getPythonBackendStatusMarkup(options.pythonStatusId)}
        `;
        const statusHolder = contentEl.querySelector('.status-indicator-holder');
        if (statusHolder) {
            statusHolder.appendChild(statusIndicator);
        }
    } else {
        statusIndicator.className = 'status-indicator loading';
        titleEl.textContent = 'Local Web Server';
        contentEl.innerHTML = `
            <div class="web-server-status-row" style="display:flex; flex-wrap:wrap; gap:12px; align-items:flex-start;">
                <p style="color: var(--text-secondary); margin: 0; flex: 1 1 300px;">
                    To contribute code, view at <a href="https://localhost:8887/team/admin/server">localhost:8887/team/admin/server</a>.
                    If your localhost server is not started, click to copy commands:
                </p>
                <div class="actions" style="display:flex; flex-wrap:wrap; gap:8px; margin-left:auto; justify-content:flex-end;">
                    <button class="${defaultClass}" id="${buttonId}" style="margin-left:auto;">
                        View Commands
                    </button>
                </div>
            </div>
            <p style="color: var(--text-secondary); margin: 8px 0 0 0; font-size: 13px;">
                ${!isLocalOrigin ? `This page is loaded from hosted origin <code>${currentOriginDisplay}</code>; hosted page reachability does not mean local server-side Python is running on your machine.<br>` : ''}
                Checks: origin <code>${currentOriginDisplay}</code> (${currentOriginRunning ? 'reachable' : 'not reachable'}), local web server <code>${localhost8887Display}</code> (${localhost8887Running ? 'reachable' : 'not reachable'}), local API path <code>/api/status</code> on port 8887 (${localhost8887ApiRunning ? 'reachable' : 'not reachable'}).
            </p>
            ${getPythonBackendStatusMarkup(options.pythonStatusId)}
        `;
    }

    const commandsContainer = document.getElementById(commandsContainerId);
    const statusRow = contentEl.querySelector('.web-server-status-row');
    if (commandsContainer && statusRow) {
        statusRow.insertAdjacentElement('afterend', commandsContainer);
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

    container.innerHTML = `
        <div style="margin-top: 12px;">
            <h1 class="card-title" style="display:flex; align-items:center; gap:10px;">
                <span class="status-indicator" id="${statusIndicatorId}"></span>
                <span id="${titleId}">Local Web Server</span>
            </h1>
            <div id="${contentId}"></div>
            <div id="${commandsContainerId}" class="readme-content" style="display:none; margin-top: 16px;"></div>
        </div>
    `;

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
