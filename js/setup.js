// Setup.js - Shared Git account fields and functionality
// Used by both root index.html and team/admin/server/index.html

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
      <h1>Webroot setup</h1>
      1. Install <a href="https://github.com/apps/desktop" target="github_desktop">Github Desktop</a><br>
      2. <a href="${webrootGit}" target="github_webroot">Fork the webroot repo</a><br>
      3. Click the Green Button on <span id="webrootFork">your webroot fork</span> and choose "Open with Github Desktop" to clone the repo.<br>
      4. Choose "To contribute to the parent project" (ModelEarth/webroot) as you clone via Github Desktop.<br>
      5. Start your Command Line Interface (CLI) using the following commands:<br>`;
}

// HTML content for the trade flow repos section
function createTradeFlowReposHTML() {
    return `
        <h1>Extra Repos</h1>
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
    return `<h1>Rust API Backend</h1>
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
    var API_BASE = 'http://localhost:8081/api';
}

// HTML content for the gemini resources section
function createGeminiResourcesHTML() {
    return `
<div id="gemini-resources" class="card" style="margin-bottom: 16px;">
    <h1>Gemini Insights</h1>
    <h4 style="margin: 0 0 8px 0;" id="gemini-key-title">Add AI Insights Key:</h4>
    <div id="gemini-key-content">
        You can use a free Gemini key for AI insights.<br>
        <a href="https://ai.google.dev/gemini-api/docs/quickstart" id="gemini-key-link">Get your Gemini key</a> and add it in team/.env
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
    const linkElement = document.getElementById('gemini-key-link');
    
    if (!titleElement || !contentElement || !linkElement) return;
    
    if (keyIsAvailable) {
        // Key is available - update to activated state
        titleElement.innerHTML = '<h2 class="card-title" style="margin: 0 0 8px 0;">✅ Your Gemini Key is Activated</h2>';
        
        // Calculate correct relative path to projects based on current page
        const currentPath = window.location.pathname;
        let projectsPath;
        if (currentPath.includes('/team/')) {
            // We're in a team subdirectory
            projectsPath = '../projects/#list=all';
        } else {
            // We're in webroot
            projectsPath = 'team/projects/#list=all';
        }
        
        contentElement.innerHTML = `
            You can ask questions about datasets on the <a href="${projectsPath}">AI Data Insights</a> page.<br>
            <a href="https://ai.google.dev/gemini-api/docs/quickstart" title="Gemini key" target="_blank">Gemini key</a> resides in team/.env - <a href="#" onclick="testGeminiFromPanel(); return false;">Test Gemini API</a>
            <div id="gemini-test-result" style="margin-top: 8px;"></div>
        `;
    } else {
        // Key is not available - keep original state
        titleElement.textContent = '🔴 Add AI Insights Key:';
        
        // Calculate correct relative path to admin server based on current page
        const currentPath = window.location.pathname;
        let adminServerPath;
        if (currentPath.includes('/team/')) {
            // We're in a team subdirectory
            adminServerPath = 'admin/server/';
        } else {
            // We're in webroot
            adminServerPath = 'team/admin/server/';
        }
        
        contentElement.innerHTML = `
            You can use a free Gemini key for AI insights. <a href="#" onclick="checkGeminiKeyStatus(); return false;">Refresh</a><br>
            <a href="https://ai.google.dev/gemini-api/docs/quickstart">Get your Gemini key</a> and add it in team/.env
            <div style="margin-top: 8px; color: #92400E; background: #FEF3C7; border: 1px solid #F59E0B; border-radius: 4px; padding: 6px; font-size: 11px;">
                ⚠️ <a href="${adminServerPath}">Start the Rust API server</a> locally to enable AI insights testing
            </div>
        `;
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
function setupGeminiResources(containerId) {
    const container = document.getElementById(containerId);
    if (container) {
        // Insert the gemini resources HTML
        const geminiHTML = createGeminiResourcesHTML();
        container.innerHTML = geminiHTML;
        
        // Check Gemini key status and update UI after inserting the content
        setTimeout(() => {
            checkGeminiKeyStatus();
        }, 100);
    }
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
async function setupGeminiResourcesConditionally() {
    if (typeof isGeminiKeyAvailable === 'function') {
        const isAvailable = await isGeminiKeyAvailable();
        
        if (typeof waitForElm === 'function') {
            // Wait for gemini setup container to exist
            waitForElm('#gemini-setup-container').then((geminiContainer) => {
                const promptModal = document.getElementById('promptModal');
                
                if (!isAvailable) {
                    // Gemini key not available - show setup card
                    if (typeof setupGeminiResources === 'function') {
                        setupGeminiResources('gemini-setup-container');
                        geminiContainer.style.display = 'block';
                    }
                    // Hide the prompt modal since Gemini is not available
                    if (promptModal) {
                        promptModal.style.display = 'none';
                    }
                } else {
                    // Gemini key is available - hide setup card, show prompt modal normally
                    geminiContainer.style.display = 'none';
                }
            });
        }
    }
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
    
    // Setup Gemini resources conditionally for projects pages
    setupGeminiResourcesConditionally();
    
    // Also initialize after waitForElm to ensure they're loaded
    if (typeof waitForElm === 'function') {
        waitForElm('#gitAccount').then((elm) => {
            initializeGitFields();
        });
    }
});