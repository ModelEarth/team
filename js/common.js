// Common utilities and shared functions

// Function to create a loading spinner element
function createLoadingSpinner(text = 'Loading...', options = {}) {
    const {
        fontSize = '14px',
        spinnerSize = '16px',
        spinnerBorder = '2px',
        color = 'var(--text-secondary)',
        marginRight = '8px'
    } = options;

    return `
        <div style="padding: 20px; display: flex; align-items: flex-start; gap: 12px;">
            <span style="display: inline-block; width: ${spinnerSize}; height: ${spinnerSize}; border: ${spinnerBorder} solid ${color}; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; flex-shrink: 0; margin-top: 2px;"></span>
            <div style="flex: 1;">
                <div style="font-weight: 500; color: var(--text-primary); font-size: ${fontSize};">${text}</div>
                <div class="loading-progress" style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;"></div>
            </div>
        </div>
    `;
}

// Function to update loading progress message
function updateLoadingProgress(message, containerSelector = '.loading-progress') {
    const progressEl = document.querySelector(containerSelector);
    if (progressEl) progressEl.textContent = message;
}

function isLocalDevelopmentHost(hostname = window.location.hostname) {
    const host = String(hostname || '').toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
}

function getCanonicalHostModelsite(hostname = window.location.hostname) {
    const host = String(hostname || '').toLowerCase();

    if (host.includes('model.georgia') || host.includes('georgia.org') || host.includes('locations.pages.dev')) {
        return 'model.georgia';
    }
    if (host.includes('model.earth')) {
        return 'model.earth';
    }
    if (host.includes('planet.live')) {
        return 'planet.live';
    }
    if (host.includes('dreamstudio')) {
        return 'dreamstudio';
    }
    if (host.includes('neighborhood.org')) {
        return 'neighborhood.org';
    }
    if (host.includes('democracylab')) {
        return 'democracylab';
    }
    if (host.includes('membercommons.org')) {
        return 'membercommons';
    }

    return '';
}

function getEffectiveModelsite() {
    const host = String(window.location.hostname || '').toLowerCase();
    const canonicalHostModelsite = getCanonicalHostModelsite(host);
    const paramModelsite = (typeof param !== 'undefined' && typeof param.modelsite === 'string' && param.modelsite)
        ? param.modelsite
        : '';
    const modelsiteSelect = document.getElementById('modelsite');
    const selectedModelsite = modelsiteSelect &&
        Array.from(modelsiteSelect.options || []).some(option => option.value === modelsiteSelect.value)
        ? modelsiteSelect.value
        : '';
    const universalModelsite = (typeof window !== 'undefined' && typeof window.modelsiteUniversal === 'string')
        ? window.modelsiteUniversal
        : '';
    const cookieModelsite = (typeof Cookies !== 'undefined' && typeof Cookies.get === 'function')
        ? (Cookies.get('modelsite') || '')
        : '';

    if (paramModelsite) {
        return paramModelsite;
    }
    if (selectedModelsite) {
        return selectedModelsite;
    }
    if (!isLocalDevelopmentHost(host) && canonicalHostModelsite) {
        return canonicalHostModelsite;
    }
    return universalModelsite || cookieModelsite || canonicalHostModelsite || '';
}

// Function to detect if current site is a geo site
function isGeoSite() {
    const host = String(window.location.hostname || '').toLowerCase();
    if (host.includes('geo') || host.includes('location') || host.includes('georgia.org') || host.includes('locations.pages.dev') || host.includes('model.georgia')) {
        return true;
    }
    return getEffectiveModelsite() === 'model.georgia';
}

// Function to create OS detection panel directly in a container
function createOSDetectionPanelIn(containerId) {
    function createPanel() {
        const container = document.getElementById(containerId);
        if (!container) {
            console.warn(`createOSDetectionPanelIn: Container '${containerId}' not found`);
            return;
        }
        
        // Create the panel directly in the specified container
        createOSDetectionPanel(containerId);
    }
    
    // Check if DOM is already loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createPanel);
    } else {
        createPanel();
    }
}

// Function to automatically create OS detection panel - works in any location
function autoCreateOSDetectionPanel(targetSelector = '.content', beforeSelector = '#readmeDiv') {
    function createPanel() {
        // Create container for OS detection panel
        const osContainer = document.createElement('div');
        osContainer.id = 'os-detection-container';
        
        // Find target container
        const contentDiv = document.querySelector(targetSelector);
        if (!contentDiv) {
            console.warn(`autoCreateOSDetectionPanel: Target selector '${targetSelector}' not found`);
            return;
        }
        
        // Find beforeElement and attempt insertion with fallback
        const beforeElement = document.querySelector(beforeSelector);
        if (beforeElement && contentDiv.contains(beforeElement)) {
            try {
                // Attempt insertBefore - this should be safe but can still fail in edge cases
                contentDiv.insertBefore(osContainer, beforeElement);
            } catch (error) {
                console.warn(`autoCreateOSDetectionPanel: insertBefore failed (${error.message}), falling back to appendChild`);
                contentDiv.appendChild(osContainer);
            }
        } else {
            // Either beforeElement not found or not a child of contentDiv, append instead
            if (beforeElement) {
                console.warn(`autoCreateOSDetectionPanel: beforeSelector '${beforeSelector}' found but not a child of '${targetSelector}', appending instead`);
            }
            contentDiv.appendChild(osContainer);
        }
        
        createOSDetectionPanel('os-detection-container');

        // Add AGENTS guidance note inside the OS panel when rendering in commonSetupDiv
        if (contentDiv.id === 'commonSetupDiv' && !document.getElementById('agents-guidance-note')) {
            const panel = osContainer.querySelector('#os-detection-panel');
            if (panel) {
                const cliOnlyDiv = document.createElement('div');
                cliOnlyDiv.className = 'cli-only';

                const noteText = document.createElement('div');
                noteText.textContent = 'Inform your AI Coding Agent where to find guidance:';
                noteText.style.marginTop = '12px';
                noteText.style.marginBottom = '8px';
                cliOnlyDiv.appendChild(noteText);

                const note = document.createElement('pre');
                note.id = 'agents-guidance-note';
                note.style.marginTop = '0';
                const code = document.createElement('code');
                code.textContent = 'Follow AGENTS.md files in webroot, localsite, and team repos';
                note.appendChild(code);
                cliOnlyDiv.appendChild(note);

                const frontendText = document.createElement('div');
                frontendText.textContent = 'Or if you are vibe coding frontend code only (without Python or Rust updates), then just run:';
                frontendText.style.marginTop = '12px';
                frontendText.style.marginBottom = '8px';
                cliOnlyDiv.appendChild(frontendText);

                const frontendNote = document.createElement('pre');
                frontendNote.style.marginTop = '0';
                const frontendCode = document.createElement('code');
                frontendCode.textContent = 'Follow localsite/AGENTS.md';
                frontendNote.appendChild(frontendCode);
                cliOnlyDiv.appendChild(frontendNote);

                panel.appendChild(cliOnlyDiv);
            }
        }
    }
    
    // Check if DOM is already loaded
    if (document.readyState === 'loading') {
        // DOM not yet loaded, wait for it
        document.addEventListener('DOMContentLoaded', createPanel);
    } else {
        // DOM already loaded, create panel immediately
        createPanel();
    }
}

// Base path detection utility
function getBasePath() {
    // Get the current script's path or the current page path
    const currentPath = window.location.pathname;
    
    // Check if we're in a webroot container (has '/team/' in path)
    if (currentPath.includes('/team/')) {
        // Extract base path up to /team/
        const teamIndex = currentPath.indexOf('/team/');
        return currentPath.substring(0, teamIndex + 6); // Include '/team/'
    }
    
    // For direct repo serving, determine depth based on current location
    const pathSegments = currentPath.split('/').filter(segment => segment !== '');
    
    // Remove the current file if it's an HTML file
    if (pathSegments.length > 0 && pathSegments[pathSegments.length - 1].includes('.html')) {
        pathSegments.pop();
    }
    
    // Calculate relative path to repo root
    const depth = pathSegments.length;
    return depth > 0 ? '../'.repeat(depth) : './';
}

// Global base path
const BASE_PATH = getBasePath();

// Function to fix relative paths dynamically
function fixRelativePath(relativePath) {
    if (relativePath.startsWith('../') || relativePath.startsWith('./')) {
        // Already relative, keep as is for direct serving
        if (!window.location.pathname.includes('/team/')) {
            return relativePath;
        }
    }
    
    // For webroot container, use absolute path from webroot
    if (window.location.pathname.includes('/team/')) {
        return '/team/' + relativePath.replace(/^\.\.\/+/, '');
    }
    
    return relativePath;
}

// Function to update favicon dynamically
function updateFaviconPath() {
    const faviconLinks = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');
    faviconLinks.forEach(faviconLink => {
        const originalHref = faviconLink.getAttribute('href');
        if (originalHref && !originalHref.startsWith('http')) {
            // Fix any incorrect /team/ paths for direct serving
            if (originalHref.includes('/team/') && !window.location.pathname.includes('/team/')) {
                faviconLink.href = originalHref.replace('/team/', '');
            } else {
                faviconLink.href = fixRelativePath(originalHref);
            }
        }
    });
}

// API Configuration with localhost fallback for external domains
function getApiBase() {
    // Check if user has disabled localhost fallback
    const pullLocalRust = localStorage.getItem('pullLocalRust');
    if (pullLocalRust === 'false') {
        // Fallback disabled, use current domain
        return window.location.origin.includes('localhost')
            ? 'http://localhost:8081/api'
            : `${window.location.origin}/api`;
    }

    // Default behavior: always try localhost first when on external domains
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    if (!isLocalhost) {
        // On external domain (model.earth, dreamstudio.com, etc.)
        // Enable pullLocalRust flag to indicate we're using localhost fallback
        if (pullLocalRust === null) {
            localStorage.setItem('pullLocalRust', 'true');
        }
        return 'http://localhost:8081/api';
    }

    // On localhost, use localhost
    return 'http://localhost:8081/api';
}

if (typeof API_BASE === 'undefined') {
    var API_BASE = getApiBase();
}

// OS Detection functionality
function detectOS() {
    const userAgent = navigator.userAgent;
    const platform = navigator.platform;
    
    let detectedOS = '';
    let osDetails = '';
    
    if (userAgent.includes('Mac') || platform.includes('Mac')) {
        detectedOS = 'Mac';
        osDetails = `Detected: macOS (${platform})`;
    } else if (userAgent.includes('Windows') || platform.includes('Win')) {
        detectedOS = 'PC';
        osDetails = `Detected: Windows (${platform})`;
    } else if (userAgent.includes('Linux') || platform.includes('Linux')) {
        detectedOS = 'Linux';
        osDetails = `Detected: Linux (${platform})`;
    } else {
        detectedOS = 'Other';
        osDetails = `Detected: Unknown OS (${platform})`;
    }
    
    return { os: detectedOS, details: osDetails };
}

// Helper function to show and expand a section (handles both collapsible and non-collapsible states)
function expandSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (!section) return;
    
    // Always show the section
    section.style.display = 'block';
    
    // Check if it has collapsible content and expand it
    const collapseContent = section.querySelector('.collapse-content');
    if (collapseContent) {
        // This section is collapsible - expand it
        collapseContent.style.display = 'block';
        
        // Update the toggle button
        const toggleBtn = section.querySelector('.collapse-toggle-btn');
        if (toggleBtn) {
            toggleBtn.textContent = 'Done';
            toggleBtn.className = 'collapse-toggle-btn btn btn-primary';
        }
        
        // Hide status message
        const statusDiv = section.querySelector('.collapse-status');
        if (statusDiv) {
            statusDiv.style.display = 'none';
        }
        
        // Update localStorage to reflect expanded state
        localStorage.setItem(`${sectionId}-collapsed`, 'false');
    }
    
    // Special handling for cli-commands section - ensure cli-code-commands is visible
    if (sectionId === 'cli-commands') {
        const cliCodeCommands = document.getElementById('cli-code-commands');
        if (cliCodeCommands) {
            console.log('expandSection: Setting cli-code-commands to display: block');
            cliCodeCommands.style.display = 'block';
        } else {
            console.log('expandSection: cli-code-commands not found');
        }
    }
}

// Function to create collapsible sections with Done/Show toggle
function makeCollapsible(divId, statusMessage = 'Section completed and collapsed', onCollapseCallback = null) {
    const targetDiv = document.getElementById(divId);
    if (!targetDiv) return;

    // Check if already made collapsible
    if (targetDiv.querySelector('.collapse-toggle-btn')) return;

    // Get stored state
    const isCollapsed = localStorage.getItem(`${divId}-collapsed`) === 'true';

    // Create toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.className = isCollapsed ? 'collapse-toggle-btn btn btn-secondary' : 'collapse-toggle-btn btn btn-primary';
    toggleBtn.style.cssText = 'position: absolute; top: 12px; right: 0px; padding: 6px 12px; font-size: 12px; z-index: 10;';
    toggleBtn.textContent = isCollapsed ? 'Show' : 'Done';

    // Create status div (hidden by default)
    const statusDiv = document.createElement('div');
    statusDiv.className = 'collapse-status';
    statusDiv.style.cssText = 'display: none; color: var(--text-secondary); font-size: 14px; font-style: italic;';
    statusDiv.textContent = statusMessage;

    // Wrap existing content
    const originalContent = targetDiv.innerHTML;
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'collapse-content';
    contentWrapper.innerHTML = originalContent;

    // Make target div position relative for absolute positioning of button
    targetDiv.style.position = 'relative';

    // Clear and rebuild div structure
    targetDiv.innerHTML = '';
    targetDiv.appendChild(toggleBtn);
    targetDiv.appendChild(contentWrapper);
    targetDiv.appendChild(statusDiv);

    // Apply initial state
    if (isCollapsed) {
        contentWrapper.style.display = 'none';
        statusDiv.style.display = 'block';
        // Call callback if collapsed on load
        if (onCollapseCallback && typeof onCollapseCallback === 'function') {
            onCollapseCallback();
        }
    }

    // Add click handler
    toggleBtn.addEventListener('click', function() {
        const isCurrentlyCollapsed = contentWrapper.style.display === 'none';

        if (isCurrentlyCollapsed) {
            // Show content
            contentWrapper.style.display = 'block';
            statusDiv.style.display = 'none';
            toggleBtn.textContent = 'Done';
            toggleBtn.className = 'collapse-toggle-btn btn btn-primary';
            localStorage.setItem(`${divId}-collapsed`, 'false');
        } else {
            // Hide content
            contentWrapper.style.display = 'none';
            statusDiv.style.display = 'block';
            toggleBtn.textContent = 'Show';
            toggleBtn.className = 'collapse-toggle-btn btn btn-secondary';
            localStorage.setItem(`${divId}-collapsed`, 'true');

            // Call the collapse callback if provided
            if (onCollapseCallback && typeof onCollapseCallback === 'function') {
                onCollapseCallback();
            }
        }
    });
}

// Function to create and render OS detection panel
function createOSDetectionPanel(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container with ID '${containerId}' not found`);
        return;
    }
    
    const panelHTML = `
<div class="card" id="os-detection-panel">
    <div>
        <div id="coding-with-row" style="display: flex; flex-wrap: wrap; align-items: flex-start; gap: 12px; margin-bottom: 0; container-type: inline-size;">
            <div id="coding-with-left" style="display: flex; flex-direction: column; gap: 6px; flex: 1 1 420px; min-width: 220px;">
                <span id="coding-with-label" style="font-weight: 500;">I'll run setup and deployments...</span>
                <div id="coding-with-controls">
                    <div id="quickstartDiv-toggle-host" style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center;"></div>
                </div>
            </div>
            <div id="coding-with-right" style="display: flex; flex-direction: column; align-items: flex-end; margin-left: auto; gap: 4px;">
                <div id="coding-with-os-wrap" style="display: flex; flex-direction: column; align-items: flex-end;">
                    <select id="os" style="padding: 8px 12px; border: 1px solid var(--border-medium); border-radius: var(--radius-sm); font-size: 14px; min-width: 150px;">
                        <option value="">Select OS...</option>
                        <option value="Mac">Mac</option>
                        <option value="PC">PC</option>
                        <option value="Linux">Linux</option>
                        <option value="Other">Other</option>
                    </select>
                    <div id="os-info" style="color: var(--text-secondary); font-size: 12px; margin-top: 4px;"></div>
                </div>
                <span class="mac-instructions" style="font-size: 12px; line-height:1.45em; text-align:right">
                    Recommended terminal: <a href="https://iterm2.com/" target="_blank">iTerm2</a><br>
                    Install steps for <a href="/localsite/start/cmds/">Python and NodeJS</a><br>
                    <a href="#deployChanges">How to deploy changes</a>
                </span>
            </div>
        </div>
        <div style="margin-bottom: 4px;"></div>
        <div id="agent-checkboxes" style="display: none; flex-wrap: nowrap; margin-top:20px; align-items: center; gap: 12px; overflow-x: auto; padding-left: 3px; box-sizing: border-box;">
            <label style="display: flex; align-items: center; gap: 8px; font-size: 14px;">
                <input type="checkbox" id="claude-code-cli" style="margin: 0;">
                <span>Claude</span>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 14px;">
                <input type="checkbox" id="codex-cli" style="margin: 0;">
                <span>OpenAI</span>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 14px;">
                <input type="checkbox" id="gemini-cli" style="margin: 0;">
                <span>Gemini</span>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 14px;">
                <input type="checkbox" id="grok-cli" style="margin: 0;">
                <span>Grok</span>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 14px;">
                <input type="checkbox" id="vscode-claude" style="margin: 0;">
                <span>VS Code</span>
            </label>
        </div>
        <div id="agent-checkboxes-helper" style="display: none; margin-top: 6px; font-size: 12px; color: var(--text-secondary);">
            Select an AI Coding Agent above for install and session start commands
        </div>
    </div>
    <div id="cli-commands" class="cli-only" style="display: none;">
        <div id="cli-code-commands" style="display: none;">
            <h4 style="margin: 0 0 8px 0;" id="cli-installation-title">CLI Installation:</h4>
            <div style="margin: 8px 0 16px 0; display: flex; gap: 20px;">
                <label style="display: flex; align-items: center; gap: 8px; font-size: 14px;">
                    <input type="radio" name="claude-install-status" value="initial" style="margin: 0;" checked>
                    <span>Initial install</span>
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 14px;">
                    <input type="radio" name="claude-install-status" value="already" style="margin: 0;">
                    <span>Already installed</span>
                </label>
            </div>
            <div id="claude-install-text" style="display: block; margin-top: 12px; font-size: 14px;">

                <span id="cli-subscription-text">Get yourself a $20/month subscription to <a href="https://claude.com/product/claude-code" target="_blank" rel="noopener noreferrer">Claude Code CLI</a>.</span><br>

                <div id="os-specific-install">
                    <!-- OS-specific installation instructions will be populated here -->
                </div>
                <div id="optional-migrate" style="display: block;">
                    Optional, for auto-updates run to move from the system directory to your local user directory:

                    <pre><code>claude migrate-installer</code></pre>

                </div>
            </div>

            <div id="cli-instructions" style="margin-bottom: 16px;">
                Right-click on your "<span id="repo-name">team</span>" repo, open a New Terminal at Folder, and run a virtual environment with your CLI tool.
            </div>

            <div id="command-display">python3 -m venv env
source env/bin/activate
npx @anthropic-ai/claude-code</div>
            <div id="codex-reasoning-tip" style="display: none; margin-top: 8px; font-size: 0.9em;">
                For a complex problem, turn on reasoning (not normally needed):
                <pre><code>codex -c model_reasoning_effort="medium" "fix this bug"</code></pre>
            </div>
            <div style="font-size: .8em;" id="cli-tips">
                Since context is passed with each request, use a new terminal window when your context changes, or run /clear.<br>
                Also, use /compact with instructions on what to keep. (These approaches will keep responses fast and will use fewer tokens.)
            </div>
        </div>
    </div>
    </div>

        <div class="card" id="gemini-installation-card" style="display: none; position: relative;">
            <h1 class="card-title">Gemini Setup</h1>

            <!-- Gemini Insights Section (always visible) -->
            <div id="gemini-resources" style="margin-bottom: 16px; background: var(--bg-tertiary); border-radius: var(--radius-md);">
                <h4 style="margin: 0 0 8px 0;" id="gemini-key-title">Add Gemini Key</h4>
                <div id="gemini-key-content">
                    Add it in docker/.env
                </div>
            </div>

            <!-- Gemini CLI Installation Section Header -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <h4 style="margin: 0;">Gemini CLI Installation</h4>
                <button id="gemini-toggle-btn" class="btn btn-primary" style="padding: 6px 12px; font-size: 12px;">Done</button>
            </div>

            <!-- Collapsible CLI Installation Content -->
            <div id="gemini-installation-content">
                <div class="cardsection">
                    <div id="gemini-command-display">
                        <pre class="no-bottom-margin"><code>python -m venv env
env\Scripts\activate.bat
npm install -g @google/generative-ai
gemini</code></pre></div>
                </div>
            </div>

            <div id="gemini-status" style="display: none; color: var(--text-secondary); font-style: italic;"></div>
        </div>
        <div class="cardsection" id="vscode-cmds" style="display: none; margin-bottom:16px">
            <h4 style="margin: 0 0 8px 0;">VS Code command</h4>
            After forking and cloning the webroot repo, initialize the submodules:
            <pre><code>git submodule update --init --recursive</code></pre>
        </div>

        <div class="card" id="githubCLICard" style="margin-bottom: 16px;">

            <h1 class="card-title">Github CLI for sending a Pull Request (PR)</h1>
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                <span>Do you have Github CLI installed?</span>
                <select id="github-cli-status" style="padding: 8px 12px; border: 1px solid var(--border-medium); border-radius: var(--radius-sm); font-size: 14px; min-width: 220px;">
                    <option value="choose">Choose</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                    <option value="not-using">Not using Github Automation</option>
                </select>
            </div>
            

            <div id="githubCLIinstall">

            In a terminal separate from your Code CLI, check if you have Github CLI installed:
            <pre><code>gh auth status</code></pre>

            <div class="mac-instructions">

                If needed, install Github CLI using <a href="https://brew.sh/" target="_blank">brew</a>

                <pre><code>brew reinstall gh</code></pre> 

                choose HTTPS, then run and hit return.

                <pre><code>gh auth login</code></pre>
            </div>
            <div class="pc-instructions" style="display: none;">
                If needed, install Github CLI:<br>
                <pre><code>winget install --id GitHub.cli</code></pre>
                
                If you don't have winget, check that your terminal is PowerShell (with \`$PSVersionTable\`), download Microsoft's 
                <a href="https://apps.microsoft.com/detail/app-installer/9nblggh4nns1" target="_blank">App Installer</a><br>
                
                Run in PowerShell to install App Installer:<br>
                <pre><code>Add-AppxPackage</code></pre>

                After installing "App Installer", restart PowerShell and check:<br>
                <pre><code>winget --version</code></pre>

                <h1>Or install Chocolatey for GitHub CLI</h1>
                If installing winget with App Installer above fails, Chocolatey works smoothly:<br>
                <pre><code># Install Chocolatey package manager
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install GitHub CLI via Chocolatey
choco install gh -y</code></pre>

            </div>

    <div class="mac-instructions">

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            If you have an error updating the .config fire, run the following to check ownership of the .config directory. 
            Ownership&nbsp;by&nbsp;"root" indicates it was created by a process running with elevated privileges.
            <input type="text" id="userComputer" placeholder="MyUserAcct" class="textInput" style="width: 150px; font-size: 14px; padding: 6px 8px; border: 1px solid var(--border-medium); border-radius: var(--radius-sm);">
        </div>

        <pre><code id="MyUser1">ls -la /Users/[MyUserAcct]/.config</code></pre>

        Add yourself as owner instead of root.
        <pre><code id="MyUser2">sudo chown -R [MyUserAcct]:staff /Users/[MyUserAcct]/.config</code></pre>
    </div>

    Now retry the Code CLI install above.<br><br>

    <b>Tip:</b> Turn off terminal audio alerts under Settings > Profiles > Audible bell<br>

    </div>
</div>
<div id="github-cli-auto-status" style="display: none; margin-top: 0; font-size: 14px;">
    Github CLI is installed. <a href="#" id="github-cli-show-commands-link">Show commands</a>
</div>

    `;
    
    container.innerHTML = panelHTML;
    
    // Initialize the panel after creating it
    initializeOSDetectionPanel();
}



// Function to initialize OS detection panel functionality
function initializeOSDetectionPanel() {
    const osSelect = document.getElementById('os');
    const osInfo = document.getElementById('os-info');
    const codexCli = document.getElementById('codex-cli');
    const claudeCodeCli = document.getElementById('claude-code-cli');
    const geminiCli = document.getElementById('gemini-cli');
    const grokCli = document.getElementById('grok-cli');
    const vscodeClaude = document.getElementById('vscode-claude');
    const agentCheckboxes = document.getElementById('agent-checkboxes');
    const agentCheckboxesHelper = document.getElementById('agent-checkboxes-helper');
    const cliCommands = document.getElementById('cli-commands');
    const cliCodeCommands = document.getElementById('cli-code-commands');
    const geminiInstallation = document.getElementById('gemini-installation');
    const vscodeCommands = document.getElementById('vscode-cmds');
    const claudeInstallText = document.getElementById('claude-install-text');
    const repoNameSpan = document.getElementById('repo-name');
    const githubCliCard = document.getElementById('githubCLICard');

    if (!osSelect || !osInfo) return;
    
    // Auto-detect OS and set initial values
    const osInfo_detected = detectOS();
    const detectedOS = osInfo_detected.os;
    const osDetails = osInfo_detected.details;
    
    osSelect.value = detectedOS;
    
    // Update dropdown options to show (current) for detected OS
    const options = osSelect.querySelectorAll('option');
    options.forEach(option => {
        if (option.value === detectedOS) {
            option.textContent = `${option.value} (current)`;
        }
    });
    
    console.log(osDetails);
    
    // Update repo name from current URL
    const currentPath = window.location.pathname;
    const pathSegments = currentPath.split('/').filter(segment => segment);
    const repoName = pathSegments.length > 0 ? pathSegments[0] : 'webroot';
    if (repoNameSpan) {
        repoNameSpan.textContent = repoName;
    }
    
    // Load saved CLI preferences
    const savedCodex = localStorage.getItem('codex-cli-installed');
    const savedClaudeCode = localStorage.getItem('claude-code-cli-installed');
    const savedGemini = localStorage.getItem('gemini-cli-installed');
    const savedGrok = localStorage.getItem('grok-cli-installed');
    const savedVscode = localStorage.getItem('vscode-claude-installed');
    const savedInstallStatus = localStorage.getItem('claude-install-status');
    const savedUseAIMode = localStorage.getItem('use-ai-mode');

    function normalizeAiModeValue(value) {
        const normalized = (value || '').toString().trim().toLowerCase();
        if (normalized === 'yes' || normalized === 'with' || normalized === 'with-ai') return 'yes';
        if (normalized === 'no' || normalized === 'without' || normalized === 'without-ai') return 'no';
        if (normalized === 'both') return 'both';
        return '';
    }

    function getCurrentAiModeValue() {
        if (typeof getAiModePreference === 'function') {
            const aiModeFromSetup = normalizeAiModeValue(getAiModePreference());
            if (aiModeFromSetup) return aiModeFromSetup;
        }
        if (typeof getBackendCommandMode === 'function') {
            const backendMode = getBackendCommandMode();
            if (backendMode === 'with-ai') return 'yes';
            if (backendMode === 'both') return 'both';
            if (backendMode === 'without-ai') return 'no';
        }
        const stored = normalizeAiModeValue(localStorage.getItem('use-ai-mode'));
        return stored || 'no';
    }

    // Check saved preferences
    if (codexCli && savedCodex === 'true') {
        codexCli.checked = true;
    }
    // Check Claude only when explicitly saved as selected
    if (claudeCodeCli) {
        if (savedClaudeCode === 'true') {
            claudeCodeCli.checked = true;
        }
    }
    if (geminiCli && savedGemini === 'true') {
        geminiCli.checked = true;
    }
    if (grokCli && savedGrok === 'true') {
        grokCli.checked = true;
    }
    if (vscodeClaude && savedVscode === 'true') {
        vscodeClaude.checked = true;
    }
    const normalizedSavedAiMode = normalizeAiModeValue(savedUseAIMode);
    if (normalizedSavedAiMode && normalizedSavedAiMode !== savedUseAIMode) {
        localStorage.setItem('use-ai-mode', normalizedSavedAiMode);
    }
    
    // Radio button initialization will be done in the setTimeout below
    
    // Function to update install text visibility based on radio button selection
    function updateInstallTextVisibility() {
        const initialInstallRadio = document.querySelector('input[name="claude-install-status"][value="initial"]');
        const claudeInstallText = document.getElementById('claude-install-text');
        
        console.log('updateInstallTextVisibility called');
        console.log('initialInstallRadio found:', !!initialInstallRadio);
        console.log('claudeInstallText found:', !!claudeInstallText);
        
        if (initialInstallRadio && claudeInstallText) {
            if (initialInstallRadio.checked) {
                console.log('Showing install text (initial selected)');
                claudeInstallText.style.display = 'block';
            } else {
                console.log('Hiding install text (already selected)');
                claudeInstallText.style.display = 'none';
            }
        }
    }
    
    // Function to update CLI commands display
    function updateCliCommands() {
        const deployChanges = document.getElementById('deployChanges');
        const selectedOS = osSelect.value;
        const codexChecked = codexCli ? codexCli.checked : false;
        const claudeCodeChecked = claudeCodeCli ? claudeCodeCli.checked : false;
        const geminiChecked = geminiCli ? geminiCli.checked : false;
        const grokChecked = grokCli ? grokCli.checked : false;
        const vscodeChecked = vscodeClaude ? vscodeClaude.checked : false;
        const aiModeValue = getCurrentAiModeValue();
        const withAiMode = aiModeValue === 'yes' || aiModeValue === 'both';
        const anyNonNoCliChecked = codexChecked || claudeCodeChecked || geminiChecked || grokChecked || vscodeChecked;
        const backendCommandMode = (typeof getBackendCommandMode === 'function')
            ? getBackendCommandMode()
            : '';
        const withoutAiMode = aiModeValue === 'no' || backendCommandMode === 'without-ai';
        const noAiOnlyMode = withoutAiMode && !anyNonNoCliChecked;
        const codingWithRow = document.getElementById('coding-with-row');
        const codingWithLabel = document.getElementById('coding-with-label');

        if (codingWithRow) {
            codingWithRow.style.display = 'flex';
        }
        if (codingWithLabel) {
            codingWithLabel.style.display = '';
        }
        if (githubCliCard) {
            const forceGithubCliCommands = githubCliCard.dataset.forceCommands === 'true';
            if (withoutAiMode && !forceGithubCliCommands) {
                if (githubCliCard.dataset.noAiHidden !== 'true') {
                    githubCliCard.dataset.noAiPrevDisplay = githubCliCard.style.display || '';
                }
                githubCliCard.dataset.noAiHidden = 'true';
                githubCliCard.style.display = 'none';
            } else if (withoutAiMode && forceGithubCliCommands) {
                githubCliCard.style.display = 'block';
                delete githubCliCard.dataset.noAiHidden;
                delete githubCliCard.dataset.noAiPrevDisplay;
            } else if (githubCliCard.dataset.noAiHidden === 'true') {
                const prevDisplay = githubCliCard.dataset.noAiPrevDisplay || '';
                githubCliCard.style.display = prevDisplay;
                delete githubCliCard.dataset.noAiHidden;
                delete githubCliCard.dataset.noAiPrevDisplay;
            }
        }
        if (deployChanges) {
            const hideDeployCli = withoutAiMode && backendCommandMode !== 'both';
            deployChanges.style.display = hideDeployCli ? 'none' : '';
        }
        if (agentCheckboxes) {
            const showCheckboxes = (withAiMode || anyNonNoCliChecked) && !withoutAiMode;
            agentCheckboxes.style.display = showCheckboxes ? 'flex' : 'none';
            if (agentCheckboxesHelper) {
                const showHelper = showCheckboxes && !withoutAiMode && !anyNonNoCliChecked;
                agentCheckboxesHelper.style.display = showHelper ? 'block' : 'none';
            }
        } else if (agentCheckboxesHelper) {
            agentCheckboxesHelper.style.display = 'none';
        }

        // Update OS-specific installation instructions
        updateOSSpecificInstall(selectedOS, codexChecked, claudeCodeChecked);

        // Update CLI installation title and text based on selections
        const cliInstallationTitle = document.getElementById('cli-installation-title');
        const cliSubscriptionText = document.getElementById('cli-subscription-text');
        const optionalMigrate = document.getElementById('optional-migrate');
        const cliTips = document.getElementById('cli-tips');
        const checkedInstallAgents = [];
        if (codexChecked) checkedInstallAgents.push('OpenAI Codex');
        if (claudeCodeChecked) checkedInstallAgents.push('Claude Code CLI');

        if (cliInstallationTitle) {
            cliInstallationTitle.textContent = checkedInstallAgents.length
                ? `${checkedInstallAgents.join(' + ')} Installation:`
                : 'CLI Installation:';
        }
        const cliCollapseStatus = document.querySelector('#cli-commands .collapse-status');
        if (cliCollapseStatus) {
            cliCollapseStatus.textContent = checkedInstallAgents.length
                ? `${checkedInstallAgents.join(' + ')} Installation`
                : 'CLI Installation';
        }

        if (codexChecked && claudeCodeChecked) {
            if (cliSubscriptionText) {
                cliSubscriptionText.innerHTML = 'Get subscriptions: <a href="https://openai.com/api/" target="_blank" rel="noopener noreferrer">OpenAI Codex</a> and <a href="https://claude.com/product/claude-code" target="_blank" rel="noopener noreferrer">Claude Code CLI</a>.';
            }
            if (optionalMigrate) optionalMigrate.style.display = 'block';
            if (cliTips) cliTips.style.display = 'block';
        } else if (codexChecked) {
            if (cliSubscriptionText) {
                cliSubscriptionText.innerHTML = 'Get yourself <a href="https://chatgpt.com/codex/get-started" target="_blank" rel="noopener noreferrer">OpenAI Codex</a>.';
            }
            if (optionalMigrate) optionalMigrate.style.display = 'none';
            if (cliTips) cliTips.style.display = 'none';
        } else if (claudeCodeChecked) {
            if (cliSubscriptionText) {
                cliSubscriptionText.innerHTML = 'Get yourself a $20/month subscription to <a href="https://claude.com/product/claude-code" target="_blank" rel="noopener noreferrer">Claude Code CLI</a>.';
            }
            if (optionalMigrate) optionalMigrate.style.display = 'block';
            if (cliTips) cliTips.style.display = 'block';
        }

        // Handle CLI section (for both Codex and Claude Code CLI)
        if ((codexChecked || claudeCodeChecked) && !withoutAiMode) {
            // Show and expand the main CLI commands section
            expandSection('cli-commands');

            // Update command display based on OS and radio button selection
            updateCommandsForOS(selectedOS, codexChecked, claudeCodeChecked);
            const codexReasoningTip = document.getElementById('codex-reasoning-tip');
            if (codexReasoningTip) {
                codexReasoningTip.style.display = codexChecked ? 'block' : 'none';
            }
        } else {
            // Hide the entire CLI commands section
            if (cliCommands) {
                cliCommands.style.display = 'none';
            }
        }
        
        // Handle Gemini CLI section
        if (geminiChecked) {
            // Show and expand Gemini installation card
            const geminiCard = document.getElementById('gemini-installation-card');
            const geminiContent = document.getElementById('gemini-installation-content');
            const geminiStatus = document.getElementById('gemini-status');
            const geminiBtn = document.getElementById('gemini-toggle-btn');

            if (geminiCard) {
                geminiCard.style.display = 'block';
            }
            if (geminiContent) {
                geminiContent.style.display = 'block';
            }
            if (geminiStatus) {
                geminiStatus.style.display = 'none';
            }
            if (geminiBtn) {
                geminiBtn.textContent = 'Done';
                geminiBtn.className = 'btn btn-primary';
            }

            // Update Gemini commands based on OS
            updateGeminiCommandsForOS(selectedOS);
        } else {
            // Hide Gemini installation card
            const geminiCard = document.getElementById('gemini-installation-card');
            if (geminiCard) {
                geminiCard.style.display = 'none';
            }
        }
        
        // Handle VS Code with Claude section
        if (vscodeChecked) {
            // Show and expand VS Code commands section
            expandSection('vscode-cmds');
        } else {
            // Hide VS Code commands section
            if (vscodeCommands) {
                vscodeCommands.style.display = 'none';
            }
        }

        // Handle without-AI mode like the prior no-AI checkbox behavior.
        if (withoutAiMode) {
            const toggleBtn = document.getElementById('quickstartDiv-toggle');
            if (toggleBtn && toggleBtn.dataset.open !== 'true') {
                toggleBtn.click();
            }
        }

        // Keep all .cli-only sections hidden until user selects "with" or checks an AI agent.
        const allowCliOnlySections = (withAiMode || anyNonNoCliChecked) && !withoutAiMode;
        document.querySelectorAll('.cli-only').forEach(el => {
            if (!allowCliOnlySections) {
                el.style.display = 'none';
                return;
            }
            if (el.id === 'cli-commands') return; // Managed by existing codex/claude logic above
            el.style.display = noAiOnlyMode ? 'none' : '';
        });
        // Toggle with-ai / without-ai content blocks (used in markdown files)
        document.querySelectorAll('.with-ai-content').forEach(el => {
            el.style.display = withoutAiMode ? 'none' : 'block';
        });
        document.querySelectorAll('.without-ai-content').forEach(el => {
            el.style.display = withoutAiMode ? 'block' : 'none';
        });
        const extraReposTitle = document.getElementById('extra-repos-title');
        if (extraReposTitle) {
            const isBoth = aiModeValue === 'both';
            extraReposTitle.textContent = isBoth ? 'Extra Repos' : withoutAiMode ? 'Extra Repos without AI' : 'Extra Repos with AI';
        }

        // Sync rust tab labels and active tab
        updateRustTabState();
        updateWithoutCliCommand();

        // Keep deploy-git commands expanded when "Without AI" is selected.
        if (withoutAiMode) {
            const deployGitPanel = document.getElementById('deployGit');
            const showDeployGitBtn = document.getElementById('showDeployGit');
            const deployGitToggleContent = document.getElementById('deploy-git-toggle-content');
            const deployGitHidden = deployGitToggleContent
                ? getComputedStyle(deployGitToggleContent).display === 'none'
                : (deployGitPanel ? getComputedStyle(deployGitPanel).display === 'none' : true);
            if (deployGitPanel && showDeployGitBtn && deployGitHidden) {
                showDeployGitBtn.click();
            }
        }

        // Update GitHub CLI instructions based on OS
        const macInstructions = document.querySelectorAll('.mac-instructions');
        const pcInstructions = document.querySelectorAll('.pc-instructions');
        
        if (macInstructions.length > 0 && pcInstructions.length > 0) {
            if (selectedOS === 'PC') {
                macInstructions.forEach(element => element.style.display = 'none');
                pcInstructions.forEach(element => element.style.display = 'block');
            } else {
                macInstructions.forEach(element => element.style.display = 'block');
                pcInstructions.forEach(element => element.style.display = 'none');
            }
        }
    }
    
    // Separate function to update Gemini commands based on OS
    function updateGeminiCommandsForOS(selectedOS) {
        const geminiCommandDisplay = document.getElementById('gemini-command-display');
        if (geminiCommandDisplay) {
            let geminiContent = '';

            if (selectedOS === 'PC') {
                geminiContent = `<pre class="no-bottom-margin"><code>${getVenvPrefix('PC')}npm install -g @google/generative-ai && gemini</code></pre>`;
            } else {
                geminiContent = `<pre class="no-bottom-margin"><code>${getVenvPrefix('Mac')}npm install -g @google/generative-ai\ngemini</code></pre>`;
            }

            geminiCommandDisplay.innerHTML = geminiContent;
        }
    }
    
    // Function to update OS-specific installation instructions
    function updateOSSpecificInstall(selectedOS, codexChecked, claudeCodeChecked) {
        const osSpecificInstall = document.getElementById('os-specific-install');
        if (osSpecificInstall) {
            let installContent = `If you haven't installed npm, node, python, or pip yet, install <a href="/io/coders/python/" target="_blank">node and npm using pyenv and nvm</a>.<br><br>`;

            // Show installation commands based on selected CLI tools
            if (codexChecked && claudeCodeChecked) {
                // Both selected
                if (selectedOS === 'PC' || selectedOS === 'Other' || !selectedOS || selectedOS === '') {
                    installContent += `<strong>For PC users:</strong> Use PowerShell to install:<br>
                    <pre><code>irm https://claude.ai/install.ps1 | iex
npm install -g openai-codex-cli</code></pre>`;
                }
                if (selectedOS === 'Mac' || selectedOS === 'Linux' || selectedOS === 'Other' || !selectedOS || selectedOS === '') {
                    if (selectedOS === 'PC') installContent += '<br>';
                    const osLabel = (selectedOS === 'Mac' || selectedOS === 'Linux') ? selectedOS : 'Mac/Linux';
                    installContent += `<strong>For ${osLabel} users:</strong> Install both CLIs with npm:<br>
                    <pre><code>npm install -g @anthropic-ai/claude-code
npm install -g openai-codex-cli</code></pre>`;
                }
            } else if (codexChecked) {
                // Only Codex selected
                const osLabel = (selectedOS === 'Mac' || selectedOS === 'Linux') ? selectedOS : (selectedOS === 'PC' ? 'PC' : 'all');
                installContent += `<strong>Install OpenAI Codex CLI:</strong><br>
                <pre><code>npm install -g openai-codex-cli</code></pre>`;
            } else if (claudeCodeChecked) {
                // Only Claude selected
                if (selectedOS === 'PC' || selectedOS === 'Other' || !selectedOS || selectedOS === '') {
                    installContent += `<strong>For PC users:</strong> Use this PowerShell command first which automatically installs Node.js, npm, and Claude Code CLI in one step:<br>
                    <pre><code>irm https://claude.ai/install.ps1 | iex</code></pre>`;
                }
                if (selectedOS === 'Mac' || selectedOS === 'Linux' || selectedOS === 'Other' || !selectedOS || selectedOS === '') {
                    if (selectedOS === 'PC') installContent += '<br>';
                    const osLabel = (selectedOS === 'Mac' || selectedOS === 'Linux') ? selectedOS : 'Mac/Linux';
                    installContent += `<strong>For ${osLabel} users:</strong> Install Claude Code CLI manually with npm:<br>
                    <pre><code>npm install -g @anthropic-ai/claude-code</code></pre>`;
                }
            }

            osSpecificInstall.innerHTML = installContent;
        }
    }

    // Separate function to update commands - called after DOM is ready
    function updateCommandsForOS(selectedOS, codexChecked, claudeCodeChecked) {
        // Find the command display div
        let commandDisplay = document.getElementById('command-display');

        // If not found directly, look for it within collapsed content
        if (!commandDisplay) {
            const cliCodeCommands = document.getElementById('cli-code-commands');
            if (cliCodeCommands) {
                commandDisplay = cliCodeCommands.querySelector('#command-display') ||
                               cliCodeCommands.querySelector('.collapse-content #command-display');
            }
        }

        if (commandDisplay) {
            let newContent = '';

            // Check if "Already installed" radio button is selected
            const alreadyInstalledRadio = document.querySelector('input[name="claude-install-status"][value="already"]');
            const isAlreadyInstalled = alreadyInstalledRadio && alreadyInstalledRadio.checked;

            // Determine which CLI command to use
            let cliCmd = '';
            if (codexChecked && !claudeCodeChecked) {
                cliCmd = 'codex';
            } else if (claudeCodeChecked && !codexChecked) {
                cliCmd = isAlreadyInstalled ? 'claude' : 'npx @anthropic-ai/claude-code';
            } else if (codexChecked && claudeCodeChecked) {
                // Both selected - show both commands
                const claudeCmd = isAlreadyInstalled ? 'claude' : 'npx @anthropic-ai/claude-code';
                cliCmd = `codex\n# Or use:\n# ${claudeCmd}`;
            }

            if (selectedOS === 'Mac' || selectedOS === 'Linux' || selectedOS === 'PC') {
                newContent = `<pre><code>${getVenvPrefix(selectedOS)}${cliCmd}</code></pre>`;
            } else {
                newContent = `<b>For Unix/Linux/Mac:</b>
<pre><code>${getVenvPrefix('Mac')}${cliCmd}</code></pre>

<b>For Windows:</b>
<pre><code>${getVenvPrefix('PC')}${cliCmd}</code></pre>`;
            }

            commandDisplay.innerHTML = newContent;
        }
    }
    
    // Add OS select change event listener
    osSelect.addEventListener('change', function() {
        const selectedOS = this.value;
        updateCliCommands();
    });
    
    // Add checkbox event listeners
    if (codexCli) {
        codexCli.addEventListener('change', function() {
            localStorage.setItem('codex-cli-installed', this.checked);
            updateCliCommands();
        });
    }

    if (claudeCodeCli) {
        claudeCodeCli.addEventListener('change', function() {
            localStorage.setItem('claude-code-cli-installed', this.checked);
            updateCliCommands();
        });
    }

    if (geminiCli) {
        geminiCli.addEventListener('change', function() {
            localStorage.setItem('gemini-cli-installed', this.checked);
            updateCliCommands();
        });
    }

    if (grokCli) {
        grokCli.addEventListener('change', function() {
            localStorage.setItem('grok-cli-installed', this.checked);
            updateCliCommands();
        });
    }

    if (vscodeClaude) {
        vscodeClaude.addEventListener('change', function() {
            localStorage.setItem('vscode-claude-installed', this.checked);
            updateCliCommands();
        });
    }

    if (osSelect.dataset.aiModeListenerBound !== 'true') {
        osSelect.dataset.aiModeListenerBound = 'true';
        document.addEventListener('aiModeChanged', function(event) {
            updateCliCommands();
        });
    }

    // Add event listeners for Claude install status radio buttons (with delay to ensure DOM is ready)
    setTimeout(() => {
        const installStatusRadios = document.querySelectorAll('input[name="claude-install-status"]');
        const initialRadio = document.querySelector('input[name="claude-install-status"][value="initial"]');
        const alreadyRadio = document.querySelector('input[name="claude-install-status"][value="already"]');
        
        console.log('Setting up radio buttons, found:', installStatusRadios.length);
        console.log('Saved install status:', savedInstallStatus);
        
        // Set radio button based on saved preference, default to "initial"
        if (savedInstallStatus === 'already' && alreadyRadio) {
            console.log('Setting already radio to checked');
            alreadyRadio.checked = true;
            if (initialRadio) initialRadio.checked = false;
        } else {
            // Default to "initial" if no saved preference or if saved preference is "initial"
            console.log('Setting initial radio to checked');
            if (initialRadio) initialRadio.checked = true;
            if (alreadyRadio) alreadyRadio.checked = false;
        }
        
        // Add event listeners
        installStatusRadios.forEach(radio => {
            radio.addEventListener('change', function() {
                console.log('Radio button changed to:', this.value);
                // Save the selected radio button value to localStorage
                localStorage.setItem('claude-install-status', this.value);
                
                // Update install text visibility immediately
                updateInstallTextVisibility();
                
                // Update other CLI commands
                updateCliCommands();
            });
        });

        // Initial update of install text visibility
        updateInstallTextVisibility();

        // Update CLI commands to reflect the correct radio button state
        updateCliCommands();
    }, 200);
    
    // Add event listeners for GitHub CLI status dropdown and userComputer text box
    setTimeout(() => {
        const githubCliStatusSelect = document.getElementById('github-cli-status');
        const githubInstallDiv = document.getElementById('githubCLIinstall');
        const userComputerInput = document.getElementById('userComputer');
        const osDetectionPanel = document.getElementById('os-detection-panel');
        const githubCliCard = document.getElementById('githubCLICard');
        const githubCliAutoStatus = document.getElementById('github-cli-auto-status');
        const githubCliShowCommandsLink = document.getElementById('github-cli-show-commands-link');
        const savedGithubCliStatus = localStorage.getItem('github-cli-status');
        const savedUserComputer = localStorage.getItem('user-computer-name');
        let ghCommandsExpanded = false;

        function placeGithubCliAutoStatus() {
            if (!githubCliAutoStatus) return;
            const rustRecheckMessage = document.getElementById('rust-recheck-message');
            if (rustRecheckMessage) {
                if (githubCliAutoStatus.previousElementSibling !== rustRecheckMessage) {
                    rustRecheckMessage.insertAdjacentElement('afterend', githubCliAutoStatus);
                }
                return;
            }
            if (osDetectionPanel && githubCliAutoStatus.parentElement !== osDetectionPanel) {
                osDetectionPanel.appendChild(githubCliAutoStatus);
            }
        }

        function syncGithubCliAutoStatusVisibility() {
            if (!githubCliAutoStatus) return;
            const rustRecheckMessage = document.getElementById('rust-recheck-message');
            const recheckVisible = !rustRecheckMessage || getComputedStyle(rustRecheckMessage).display !== 'none';
            const shouldShow = githubCliAutoStatus.dataset.shouldShow === 'true';
            githubCliAutoStatus.style.display = shouldShow && recheckVisible ? 'block' : 'none';
        }
        placeGithubCliAutoStatus();
        
        // Set dropdown based on saved preference, default to "choose"
        if (githubCliStatusSelect && savedGithubCliStatus) {
            const validValues = ['choose', 'yes', 'no', 'not-using'];
            githubCliStatusSelect.value = validValues.includes(savedGithubCliStatus) ? savedGithubCliStatus : 'choose';
        }
        
        // Set userComputer input from saved value
        if (userComputerInput && savedUserComputer) {
            userComputerInput.value = savedUserComputer;
        }
        
        // Store original templates and current user placeholders for tracking
        let originalTemplates = {};
        let currentUserLength = 0;
        
        // Function to update [MyUserAcct] placeholders in the GitHub CLI instructions
        function updateUserAcctPlaceholders() {
            if (!githubInstallDiv) return;
            
            // Get current value from the input
            const currentUserComputerInput = document.getElementById('userComputer');
            const userComputer = currentUserComputerInput ? currentUserComputerInput.value.trim() : '';
            const replacementText = userComputer || '[MyUserAcct]';
            
            // Store original templates on first run
            const myUser1 = document.getElementById('MyUser1');
            const myUser2 = document.getElementById('MyUser2');
            
            if (myUser1 && !originalTemplates.MyUser1) {
                originalTemplates.MyUser1 = myUser1.textContent;
            }
            if (myUser2 && !originalTemplates.MyUser2) {
                originalTemplates.MyUser2 = myUser2.textContent;
            }
            
            // Update MyUser1 (contains one [MyUserAcct])
            if (myUser1 && originalTemplates.MyUser1) {
                myUser1.textContent = originalTemplates.MyUser1.replace(/\[MyUserAcct\]/g, replacementText);
            }
            
            // Update MyUser2 (contains two [MyUserAcct])
            if (myUser2 && originalTemplates.MyUser2) {
                myUser2.textContent = originalTemplates.MyUser2.replace(/\[MyUserAcct\]/g, replacementText);
            }
            
            // Update current user length for future reference
            currentUserLength = replacementText.length;
        }
        
        // Function to update GitHub CLI install div and userComputer text box visibility
        function updateGithubCliVisibility() {
            const selectedValue = githubCliStatusSelect ? githubCliStatusSelect.value : 'choose';
            const showInstall = selectedValue === 'no';
            if (githubInstallDiv) {
                githubInstallDiv.style.display = showInstall ? 'block' : 'none';
            }
            
            // Hide/show userComputer text box based on dropdown selection
            if (userComputerInput) {
                userComputerInput.style.display = showInstall ? 'block' : 'none';
            }
        }

        function updateGithubCliCardVisibilityFromRust(installed) {
            if (!githubCliCard || !githubCliAutoStatus) return;
            githubCliAutoStatus.dataset.shouldShow = installed ? 'true' : 'false';
            placeGithubCliAutoStatus();
            syncGithubCliAutoStatusVisibility();
            githubCliCard.dataset.forceCommands = ghCommandsExpanded ? 'true' : 'false';
            const withoutAiMode = getCurrentAiModeValue() === 'no';
            if (installed) {
                githubCliCard.style.display = ghCommandsExpanded ? 'block' : 'none';
                if (githubCliShowCommandsLink) {
                    githubCliShowCommandsLink.textContent = ghCommandsExpanded ? 'Hide commands' : 'Show commands';
                }
            } else {
                githubCliCard.style.display = 'block';
                if (githubCliShowCommandsLink) {
                    githubCliShowCommandsLink.textContent = 'Show commands';
                }
            }
            if (withoutAiMode && !ghCommandsExpanded) {
                githubCliCard.style.display = 'none';
            } else if (ghCommandsExpanded) {
                githubCliCard.style.display = 'block';
            }
        }

        async function detectGithubCliFromRust() {
            try {
                const response = await fetch(`${getApiBase()}/github-cli/status`, { method: 'GET' });
                if (!response.ok) {
                    updateGithubCliCardVisibilityFromRust(false);
                    return;
                }
                const data = await response.json();
                const installed = !!data.installed;
                if (installed && githubCliStatusSelect) {
                    githubCliStatusSelect.value = 'yes';
                    localStorage.setItem('github-cli-status', 'yes');
                    updateGithubCliVisibility();
                }
                updateGithubCliCardVisibilityFromRust(installed);
            } catch (error) {
                updateGithubCliCardVisibilityFromRust(false);
            }
        }
        
        // Add event listener for dropdown
        if (githubCliStatusSelect) {
            githubCliStatusSelect.addEventListener('change', function() {
                console.log('GitHub CLI dropdown changed to:', this.value);
                // Save the selected value to localStorage
                localStorage.setItem('github-cli-status', this.value);
                
                // Update div visibility
                updateGithubCliVisibility();
            });
        }

        if (githubCliShowCommandsLink) {
            githubCliShowCommandsLink.addEventListener('click', function(event) {
                event.preventDefault();
                ghCommandsExpanded = !ghCommandsExpanded;
                updateGithubCliCardVisibilityFromRust(true);
            });
        }
        
        // Add event listener for userComputer text box
        if (userComputerInput) {
            userComputerInput.addEventListener('input', function() {
                // Save to localStorage while typing
                localStorage.setItem('user-computer-name', this.value);
                
                // Update placeholders in real-time
                updateUserAcctPlaceholders();
            });
        }
        
        // Initial updates
        updateGithubCliVisibility();
        updateUserAcctPlaceholders();
        detectGithubCliFromRust();
    }, 200);
    
    // Initial update
    updateCliCommands();

    if (typeof waitForElm === 'function') {
        waitForElm('#deployChanges').then(() => {
            updateCliCommands();
        });
    }
    
    // Make sections collapsible after initialization
    setTimeout(() => {
        makeCollapsible('cli-commands', 'CLI Installation');
        makeCollapsible('vscode-cmds', 'VS Code Commands');

        // Setup custom Gemini toggle
        setupGeminiToggle();
    }, 100);
}

// Function to setup custom Gemini toggle button
function setupGeminiToggle() {
    const toggleBtn = document.getElementById('gemini-toggle-btn');
    const content = document.getElementById('gemini-installation-content');
    const statusDiv = document.getElementById('gemini-status');

    if (!toggleBtn || !content || !statusDiv) return;

    // Get stored state
    const isCollapsed = localStorage.getItem('gemini-installation-collapsed') === 'true';

    // Apply initial state
    if (isCollapsed) {
        content.style.display = 'none';
        statusDiv.style.display = 'block';
        toggleBtn.textContent = 'Show';
        toggleBtn.className = 'btn btn-secondary';
        // Run API check for initial collapsed state
        checkGeminiApiStatus();
    }

    // Add click handler
    toggleBtn.addEventListener('click', function() {
        const isCurrentlyCollapsed = content.style.display === 'none';

        if (isCurrentlyCollapsed) {
            // Show content
            content.style.display = 'block';
            statusDiv.style.display = 'none';
            toggleBtn.textContent = 'Done';
            toggleBtn.className = 'btn btn-primary';
            localStorage.setItem('gemini-installation-collapsed', 'false');
        } else {
            // Hide content
            content.style.display = 'none';
            statusDiv.style.display = 'block';
            toggleBtn.textContent = 'Show';
            toggleBtn.className = 'btn btn-secondary';
            localStorage.setItem('gemini-installation-collapsed', 'true');

            // Run API check when collapsed
            checkGeminiApiStatus();
        }
    });

    // Check Gemini key status if the function is available (from setup.js)
    if (typeof checkGeminiKeyStatus === 'function') {
        setTimeout(() => {
            checkGeminiKeyStatus();
        }, 100);
    }
}

// Function to check Gemini API accessibility
async function checkGeminiApiStatus() {
    const statusDiv = document.getElementById('gemini-status');
    if (!statusDiv) return;

    // Show checking status
    statusDiv.innerHTML = '<span style="color: var(--text-secondary);">Checking Gemini CLI status...</span>';

    // Check if Gemini key is available (from setup.js or browser cache)
    let hasKey = false;

    // Check browser cache first
    const cachedKey = localStorage.getItem('gemini_api_key');
    if (cachedKey) {
        hasKey = true;
        statusDiv.innerHTML = '<span style="color: var(--accent-green);">✅ Gemini CLI setup collapsed - Key available in browser cache</span>';
        return;
    }

    // Check if server-side key is available (requires Rust API server)
    if (typeof isGeminiKeyAvailable === 'function') {
        try {
            hasKey = await isGeminiKeyAvailable();
            if (hasKey) {
                statusDiv.innerHTML = '<span style="color: var(--accent-green);">✅ Gemini CLI setup collapsed - Key configured in .env</span>';
            } else {
                statusDiv.innerHTML = '<span style="color: var(--text-secondary);">⚠️ Gemini CLI setup collapsed - Start Rust server to detect docker/.env key, or add key in browser</span>';
            }
        } catch (error) {
            // Server not running or network error
            statusDiv.innerHTML = '<span style="color: var(--text-secondary);">⚠️ Gemini CLI setup collapsed - Start Rust API server to check docker/.env key, or add key using button above</span>';
        }
    } else {
        // Function not available - likely server not running
        statusDiv.innerHTML = '<span style="color: var(--text-secondary);">⚠️ Gemini CLI setup collapsed - Start Rust API server to check docker/.env key, or add key using button above</span>';
    }
}

// API utility function
async function apiCall(endpoint, method = 'GET', data = null) {
    try {
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
            }
        };
        
        if (data) {
            options.body = JSON.stringify(data);
        }
        
        const response = await fetch(`${API_BASE}${endpoint}`, options);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('API call failed:', error);
        // Return placeholder data for development
        return {
            error: true,
            message: 'Connection failed - showing placeholder data',
            data: null
        };
    }
}

// Common API connection error handler
function handleApiConnectionError(error, containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error('Container not found:', containerId);
        return;
    }

    // Determine the relative path to admin/server/ from current page
    let adminPath = 'admin/server/';
    const currentPath = window.location.pathname;
    const localWebPort = (typeof Cookies !== 'undefined' && typeof Cookies.get === 'function' && Cookies.get('modelsite') === 'model.georgia')
        ? '8888'
        : '8887';
    
    // Calculate the correct path based on current location
    if (currentPath.includes('/admin/')) {
        // Already in admin folder, just go to server subfolder
        adminPath = 'server/';
    } else if (currentPath.includes('/projects/') || currentPath.includes('/preferences/')) {
        // In subdirectories, go up one level then to admin/server
        adminPath = '../setup/';
    } else {
        // From root team directory, path to admin/server
        adminPath = 'setup/';
    }

    const errorMessage = `
        <div style="color: #EF4444; padding: 8px 12px; border-radius: 6px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); margin: 8px 0;">
            <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                <span style="color: #EF4444; font-weight: 500;">API Connection Failed - Unable to connect to server.</span>
                <a href="${adminPath}">
                    Webroot Manager
                </a>
                <span style="cursor: pointer; color: var(--text-secondary); font-size: 14px;" onclick="
                    const container = this.parentElement.parentElement;
                    const details = container.querySelector('.error-tech-details');
                    const arrow = this.querySelector('.toggle-arrow');
                    if (details.style.display === 'none' || details.style.display === '') {
                        details.style.display = 'block';
                        arrow.innerHTML = '&#9660;';
                        arrow.style.fontSize = '12px';
                    } else {
                        details.style.display = 'none';
                        arrow.innerHTML = '&#9654;';
                        arrow.style.fontSize = '10px';
                    }
                ">
                    <span class="toggle-arrow" style="font-size: 10px;">&#9654;</span> Details
                </span>
            </div>
            <div class="error-tech-details" style="display: none; margin-top: 4px; background: var(--bg-tertiary); border-radius: 4px; font-family: monospace; font-size: 12px; color: var(--text-secondary);">
                ${error.message || 'Failed to fetch'}
            </div>
        </div>
    `;

    container.innerHTML = errorMessage;
}

// Notification utility
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i data-feather="${type === 'success' ? 'check-circle' : 'info'}"></i>
            <span>${message}</span>
        </div>
        <button class="notification-close" onclick="this.parentElement.remove()">
            <i data-feather="x"></i>
        </button>
    `;

    document.body.appendChild(notification);
    
    // Initialize feather icons if available
    if (window.feather) {
        feather.replace();
    }

    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

// Format date for display
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
}

// Utility to safely get element by ID
function safeGetElement(id) {
    const element = document.getElementById(id);
    if (!element) {
        console.warn(`Element with ID '${id}' not found`);
    }
    return element;
}

// Utility to safely query selector
function safeQuerySelector(selector) {
    const element = document.querySelector(selector);
    if (!element) {
        console.warn(`Element with selector '${selector}' not found`);
    }
    return element;
}

// Initialize Feather icons safely
function initializeFeatherIcons() {
    // Wait for feather to be available
    const featherLib = (typeof feather !== 'undefined' && feather) || window.feather;
    
    if (featherLib && featherLib.replace && featherLib.icons) {
        // Always use manual processing to avoid bulk replace issues
        const featherElements = document.querySelectorAll('[data-feather]');
        
        featherElements.forEach(el => {
            const iconName = el.getAttribute('data-feather');
            
            // Skip if no icon name or already processed
            if (!iconName || !iconName.trim() || el.querySelector('svg')) {
                return;
            }
            
            // Check if icon exists in feather library
            if (featherLib.icons && featherLib.icons[iconName]) {
                try {
                    const icon = featherLib.icons[iconName];
                    if (icon && typeof icon.toSvg === 'function') {
                        el.innerHTML = icon.toSvg();
                    }
                } catch (iconError) {
                    console.warn(`Failed to render icon: ${iconName}`, iconError);
                }
            } else {
                console.warn(`Icon '${iconName}' not found in Feather library`);
            }
        });
    } else {
        // Wait a bit and try again (max 3 seconds)
        if (!initializeFeatherIcons._retryCount) {
            initializeFeatherIcons._retryCount = 0;
        }
        
        if (initializeFeatherIcons._retryCount < 30) {
            initializeFeatherIcons._retryCount++;
            setTimeout(() => {
                if (typeof feather !== 'undefined' || window.feather) {
                    initializeFeatherIcons();
                }
            }, 200);
        }
    }
}

// Wait for DOM and dependencies to be ready
function waitForDependencies(callback, dependencies = ['feather'], maxWait = 5000) {
    const startTime = Date.now();
    
    function checkDependencies() {
        const allReady = dependencies.every(dep => {
            return (typeof window[dep] !== 'undefined' && window[dep]) || 
                   (typeof globalThis[dep] !== 'undefined' && globalThis[dep]);
        });
        
        if (allReady) {
            callback();
        } else if (Date.now() - startTime < maxWait) {
            setTimeout(checkDependencies, 50);
        } else {
            console.warn('Dependencies not loaded in time:', dependencies);
            callback(); // Continue anyway
        }
    }
    
    checkDependencies();
}

// Export functions for module usage if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        apiCall,
        showNotification,
        formatDate,
        safeGetElement,
        safeQuerySelector,
        initializeFeatherIcons,
        waitForDependencies,
        API_BASE
    };
}

// File Display System - Enhanced markdown file loading
class FileDisplaySystem {
    constructor() {
        this.log = [];
    }

    addLog(message) {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = `[${timestamp}] ${message}`;
        this.log.push(logEntry);
        console.log(logEntry);
    }

    // Enhanced displayFile function
    async displayFile(pagePath, divID, target, callback, enableLogging = true) {
        if (enableLogging) {
            this.addLog(`📄 Loading file: ${pagePath}`);
        }
        
        try {
            // Load dependencies
            await this.loadDependencies(enableLogging);
            
            // Process the file path
            const pathInfo = this.processFilePath(pagePath);
            
            // Fetch and process the markdown file
            const content = await this.fetchFileContent(pagePath, enableLogging);
            const processedHTML = await this.processMarkdownContent(content, pathInfo, enableLogging);
            
            // Load content into target div
            this.loadContentIntoDiv(divID, processedHTML, target);
            
            if (enableLogging) {
                this.addLog(`✅ File loaded successfully: ${pagePath}`);
            }
            
            // Execute callback if provided
            if (typeof callback === 'function') {
                setTimeout(callback, 50);
            }
            
        } catch (error) {
            if (enableLogging) {
                this.addLog(`❌ Failed to load file: ${error.message}`);
            }
            this.showError(`Failed to load ${pagePath}: ${error.message}`, divID);
        }
    }

    // Load required dependencies
    async loadDependencies(enableLogging = true) {
        const dependencies = [
            {
                url: 'https://cdn.jsdelivr.net/npm/showdown@2.1.0/dist/showdown.min.js',
                check: () => window.showdown,
                name: 'showdown'
            }
        ];

        for (const dep of dependencies) {
            if (!dep.check()) {
                await this.loadScript(dep.url, dep.name, enableLogging);
            }
        }
    }

    // Load external script with promise
    loadScript(src, name, enableLogging = true) {
        return new Promise((resolve, reject) => {
            if (enableLogging) {
                this.addLog(`📥 Loading dependency: ${name}`);
            }
            
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => {
                if (enableLogging) {
                    this.addLog(`✅ Loaded dependency: ${name}`);
                }
                resolve();
            };
            script.onerror = () => {
                const error = `Failed to load ${name} from ${src}`;
                if (enableLogging) {
                    this.addLog(`❌ ${error}`);
                }
                reject(new Error(error));
            };
            
            document.head.appendChild(script);
        });
    }

    // Process file path to extract folder information
    processFilePath(pagePath) {
        let pageFolder = pagePath;
        
        // Remove query parameters
        if (pageFolder.lastIndexOf('?') > 0) {
            pageFolder = pageFolder.substring(0, pageFolder.lastIndexOf('?'));
        }
        
        // Extract folder path (remove filename if present)
        if (pageFolder.lastIndexOf('.') > pageFolder.lastIndexOf('/')) {
            pageFolder = pageFolder.substring(0, pageFolder.lastIndexOf('/')) + "/";
        }
        
        if (pageFolder === "/") {
            pageFolder = "";
        }
        
        // Handle GitHub wiki URLs
        if (pageFolder.indexOf('https://raw.githubusercontent.com/wiki') >= 0) {
            pageFolder = pageFolder.replace("https://raw.githubusercontent.com/wiki/", "https://github.com/") + "/wiki/";
        }
        
        return {
            originalPath: pagePath,
            folderPath: pageFolder,
            fileName: pagePath.split('/').pop()
        };
    }

    // Fetch file content
    async fetchFileContent(pagePath, enableLogging = true) {
        if (enableLogging) {
            this.addLog(`🔍 Fetching content from: ${pagePath}`);
        }
        
        try {
            const response = await fetch(pagePath);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const content = await response.text();
            if (enableLogging) {
                this.addLog(`📊 Content loaded: ${content.length} characters`);
            }
            return content;
            
        } catch (error) {
            throw new Error(`Failed to fetch ${pagePath}: ${error.message}`);
        }
    }

    // Process markdown content with showdown
    async processMarkdownContent(content, pathInfo, enableLogging = true) {
        if (!window.showdown) {
            throw new Error('Showdown markdown processor not loaded');
        }
        
        if (enableLogging) {
            this.addLog(`🔄 Processing markdown content...`);
        }
        
        // Configure showdown converter with enhanced options
        const converter = new showdown.Converter({
            tables: true,
            metadata: true,
            simpleLineBreaks: true,
            ghCodeBlocks: true,
            tasklists: true,
            strikethrough: true,
            emoji: true,
            underline: true
        });
        
        // Convert markdown to HTML
        const html = converter.makeHtml(content);
        
        // Add edit link for GitHub files
        const editLink = this.createEditLink(pathInfo.originalPath);
        
        // Combine edit link with content
        return editLink + html;
    }

    // Create edit link for GitHub files
    createEditLink(pagePath) {
        if (pagePath.includes('github.com') || pagePath.includes('raw.githubusercontent.com')) {
            return `<div class='edit-link' style='float:right;z-index:1;cursor:pointer;text-decoration:none;opacity:.7;margin-bottom:10px'>
                        <a href='${pagePath}' target='_blank' style='color:var(--text-secondary);text-decoration:none;font-size:14px'>
                            📝 Edit on GitHub
                        </a>
                    </div>`;
        }
        return '';
    }

    // Load content into specified div
    loadContentIntoDiv(divID, html, target) {
        const targetDiv = document.getElementById(divID);
        if (!targetDiv) {
            throw new Error(`Target div with ID '${divID}' not found`);
        }
        
        // Handle different target options
        switch (target) {
            case '_parent':
                targetDiv.innerHTML = html;
                break;
            case '_append':
                targetDiv.innerHTML += html;
                break;
            case '_prepend':
                targetDiv.innerHTML = html + targetDiv.innerHTML;
                break;
            default:
                targetDiv.innerHTML = html;
        }
        
        // Add some basic styling to the loaded content
        targetDiv.style.lineHeight = '1.6';
        targetDiv.style.color = 'var(--text-primary)';
        
        // Style code blocks
        const codeBlocks = targetDiv.querySelectorAll('pre code');
        codeBlocks.forEach(block => {
            block.style.background = '#f6f8fa';
            block.style.padding = '16px';
            block.style.borderRadius = '6px';
            block.style.fontSize = '14px';
            block.style.fontFamily = 'monospace';
        });
        
        // Style tables
        const tables = targetDiv.querySelectorAll('table');
        tables.forEach(table => {
            table.style.borderCollapse = 'collapse';
            table.style.width = '100%';
            table.style.margin = '16px 0';
        });
        
        const cells = targetDiv.querySelectorAll('td, th');
        cells.forEach(cell => {
            cell.style.border = '1px solid var(--border-light)';
            cell.style.padding = '8px 12px';
            cell.style.textAlign = 'left';
        });
        
        const headers = targetDiv.querySelectorAll('th');
        headers.forEach(header => {
            header.style.background = 'var(--bg-tertiary)';
            header.style.fontWeight = '600';
        });

        const lists = targetDiv.querySelectorAll('ul, ol');
        lists.forEach(list => {
            list.style.marginLeft = '20px';
        });
    }

    showError(message, containerId) {
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = `<div style="color: #EF4444; padding: 16px; border-radius: 8px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3);">${message}</div>`;
        }
    }
}

// Create global instance
const fileDisplaySystem = new FileDisplaySystem();

// Global displayFile function for easy usage
function displayFile(pagePath, divID, target, callback, enableLogging = true) {
    fileDisplaySystem.displayFile(pagePath, divID, target, callback, enableLogging);
}

// Initialize path fixes when page loads
function initializePathFixes() {
    updateFaviconPath();
    console.log('Base path detected:', BASE_PATH);
    console.log('Current path:', window.location.pathname);
    
    // Watch for favicon changes and fix them immediately
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1 && node.tagName === 'LINK' && 
                        (node.rel === 'icon' || node.rel === 'shortcut icon')) {
                        setTimeout(updateFaviconPath, 10); // Fix after a brief delay
                    }
                });
            }
        });
    });
    observer.observe(document.head, { childList: true, subtree: true });
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePathFixes);
} else {
    initializePathFixes();
}

// Make functions globally available
window.handleApiConnectionError = handleApiConnectionError;

function ensureRustApiStatusPanelStyles() {
    if (document.getElementById('rust-api-status-panel-styles')) {
        return;
    }

    const style = document.createElement('style');
    style.id = 'rust-api-status-panel-styles';
    style.textContent = `
        .rust-api-status-layout {
            container-type: inline-size;
        }
        .rust-api-status-header {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
        }
        .rust-api-status-heading {
            margin: 0;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .rust-api-status-actions {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-left: auto;
        }
        .rust-api-status-button {
            margin: 0;
        }
        #stop-rust-btn.rust-api-status-button {
            margin-bottom: 0;
        }
        .dark .rust-api-status-button {
            background-color: var(--border-medium);
            border-color: var(--border-medium);
            color: var(--text-secondary);
        }
        .rust-api-status-content-wrap {
            position: relative;
        }
        .rust-api-admin-link-wrap {
            margin-bottom: 12px;
            display: none;
            flex-wrap: wrap;
            justify-content: flex-start;
            gap: 8px;
        }
        .rust-api-recheck-message {
            flex-basis: 100%;
            display: block;
            margin-bottom: 12px;
        }
        @container (max-width: 560px) {
            .rust-api-status-actions {
                margin-left: 0;
            }
        }
    `;
    document.head.appendChild(style);
}

// Function to create combined Rust API Status and Connection panel
function createRustApiStatusPanel(containerId, showConfigureLink = true) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn(`createRustApiStatusPanel: Container '${containerId}' not found`);
        return;
    }
    ensureRustApiStatusPanelStyles();

    // Determine the relative path to admin/server/ from current page
    let adminPath = 'admin/server/';
    const currentPath = window.location.pathname;
    const localWebPort = (typeof Cookies !== 'undefined' && typeof Cookies.get === 'function' && Cookies.get('modelsite') === 'model.georgia')
        ? '8888'
        : '8887';
    
    // Calculate the correct path based on current location
    if (currentPath.includes('/admin/server/')) {
        // Already on the admin/server page, no link needed
        showConfigureLink = false;
    } else if (currentPath.includes('/admin/')) {
        // Already in admin folder, just go to server subfolder
        adminPath = 'server/';
    } else if (currentPath.includes('/projects/') || currentPath.includes('/preferences/')) {
        // In subdirectories, go up one level then to admin/server
        adminPath = '../admin/server/';
    } else {
        // From root team directory, path to admin/server
        adminPath = 'admin/server/';
    }

    // Create the combined panel HTML
    const panelHtml = `
        <div class="rust-api-status-layout">
            <div class="rust-api-status-content-wrap">
                <!-- Status Indicators -->
                <div id="backend-status-indicators">
                    <div class="rust-api-status-header">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span class="status-indicator" id="rust-api-status-indicator"></span>
                            <span id="rust-api-status-title"><strong>Rust Backend API</strong> - start locally for access to CORS datasets and SQL databases</span>
                        </div>
                        <div class="rust-api-status-actions">
                            <button class="btn btn-danger btn-width rust-api-status-button" onclick="stopRustServer()" style="display: none; background: #b87333; color: white; border-color: #b87333; opacity: 0.85;" id="stop-rust-btn">
                                Stop Rust
                            </button>
                        </div>
                    </div>
                    <!-- Rust API Status Section -->
                    <div id="rust-api-status-content" style="margin-bottom: 16px;">
                        <p style="color: var(--text-secondary); margin-bottom: 16px;">
                            Checking backend API status...
                        </p>
                    </div>

                    <!-- Database Status Items -->
                    <div class="status-indicator-item" style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
                        <span class="status-indicator error" id="commons-db-indicator"></span>
                        <span style="font-size: 16px; color: var(--text-secondary);" id="commons-db-text">Member database inactive</span>
                    </div>
                    <div class="status-indicator-item" style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
                        <span class="status-indicator error" id="exiobase-db-indicator"></span>
                        <span style="font-size: 16px; color: var(--text-secondary);" id="exiobase-db-text">Industry database inactive</span>
                    </div>
                    <!-- Locations Database - hidden by default, shown only when active -->
                    <div class="status-indicator-item" id="location-db-container" style="display: none; align-items: center; gap: 8px; margin-bottom: 16px;">
                        <span class="status-indicator error" id="location-db-indicator"></span>
                        <span style="font-size: 16px; color: var(--text-secondary);" id="location-db-text">Locations Database inactive</span>
                    </div>
                    <div style="display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-top:8px;">
                        <button class="btn btn-secondary rust-api-status-button" onclick="window.location.href='http://localhost:${localWebPort}/team/admin/sql/panel/'" id="database-admin-btn">Database Admin</button>
                        <button class="btn btn-secondary rust-api-status-button" onclick="recheckRustStatus()" id="reload-status-btn">Recheck Status</button>
                        <div id="rust-recheck-message" class="rust-api-recheck-message" aria-live="polite" style="color: var(--text-secondary); font-size: 14px;"></div>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Admin Detail Content (hidden by default, shown when admin detail button clicked) -->
        <div class="config-info" id="config-display" style="display: none; margin-top: 16px; padding: 16px; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-light);">
            Loading configuration...
        </div>
    `;

    container.innerHTML = panelHtml;
    const githubCliCard = document.getElementById('githubCLICard');
    const quickstartPanel = document.getElementById('quickstartDiv');
    if (quickstartPanel && githubCliCard) {
        quickstartPanel.insertAdjacentElement('afterend', githubCliCard);
    }
    // Initialize the status check
    updateRustApiStatusPanel(showConfigureLink, adminPath);
}

function recheckRustStatus() {
    if (typeof setQuickstartDesktopInstallerExpanded === 'function') {
        setQuickstartDesktopInstallerExpanded(false);
    } else {
        const desktopInstallerDetails = document.getElementById('quickstart-desktop-installer-details');
        const desktopInstallerToggle = document.getElementById('quickstart-desktop-installer-toggle');
        if (desktopInstallerDetails) {
            desktopInstallerDetails.style.display = 'none';
        }
        if (desktopInstallerToggle) {
            desktopInstallerToggle.setAttribute('aria-expanded', 'false');
        }
    }
    updateRustApiStatusPanel();
}

// Function to update the Rust API status panel
async function updateRustApiStatusPanel(showConfigureLink = true, adminPath = 'admin/server/') {
    const indicator = document.getElementById('rust-api-status-indicator');
    const title = document.getElementById('rust-api-status-title');
    const content = document.getElementById('rust-api-status-content');
    const dbIndicators = document.getElementById('backend-status-indicators');
    const stopBtn = document.getElementById('stop-rust-btn');
    const recheckMessage = document.getElementById('rust-recheck-message');
    const recheckTime = new Date().toLocaleTimeString();
    
    if (!indicator || !title || !content) return;

    try {
        // Check if backend API is running
        const healthResponse = await fetch('http://localhost:8081/api/health', {
            method: 'GET',
            timeout: 5000
        });

        if (healthResponse.ok) {
            // Backend is active
            indicator.className = 'status-indicator connected';

            // Check if we're using localhost fallback on an external domain
            const isExternalDomain = !(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
            const pullLocalRustEnabled = localStorage.getItem('pullLocalRust') !== 'false';
            const showFallbackToggle = isExternalDomain;
            const fallbackTitle = pullLocalRustEnabled ? 'Localhost Fallback Active' : 'Localhost Fallback Disabled';
            const fallbackDescription = pullLocalRustEnabled
                ? 'Using localhost:8081 API from your local machine'
                : `Using ${window.location.hostname} API endpoints`;

            const fallbackToggleHtml = showFallbackToggle ? `
                <div style="margin-top: 12px; padding: 12px; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-light);">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px;">
                        <div>
                            <strong style="color: var(--text-primary);">${fallbackTitle}</strong>
                            <p style="color: var(--text-secondary); font-size: 14px; margin: 4px 0 0 0;">
                                ${fallbackDescription}
                            </p>
                        </div>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none;">
                            <input type="checkbox" id="localhost-fallback-toggle"
                                   ${pullLocalRustEnabled ? 'checked' : ''}
                                   onchange="toggleLocalhostFallback(this)"
                                   style="width: 18px; height: 18px; cursor: pointer;">
                            <span style="color: var(--text-primary); font-size: 14px;">Enable</span>
                        </label>
                    </div>
                </div>
            ` : '';

            content.innerHTML = `
                <div style="color: var(--accent-green); margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
                    <span class="status-indicator connected"></span>
                    <span>Backend Rust API is accessible</span>
                </div>
                ${fallbackToggleHtml}
            `;

            // Show stop button
            if (stopBtn) {
                stopBtn.style.display = 'block';
            }
            
            // Show and check backend status indicators
            if (dbIndicators) {
                checkBackendStatus();
                dbIndicators.style.display = 'block';
            }

            window.backendStatusCache = window.backendStatusCache || {};
            window.backendStatusCache.rustApi = { value: true, timestamp: Date.now() };
            if (recheckMessage) {
                recheckMessage.style.display = 'block';
                recheckMessage.textContent = `Last recheck: ${recheckTime}. Rust API is reachable.`;
            }
            if (typeof updateRustRecheckMessageVisibilityForDesktopInstaller === 'function') {
                updateRustRecheckMessageVisibilityForDesktopInstaller();
            }
            if (typeof updateBackendAggregateStatus === 'function') {
                updateBackendAggregateStatus('quickstartDiv-python-status');
            }

        } else {
            throw new Error('Backend not responding');
        }
    } catch (error) {
        // Backend is inactive - show demo mode
        indicator.className = 'status-indicator error';
        
        content.innerHTML = `
            <div id="rust-start-mode-content">
                <div id="with-cli-content" style="display: none;">
                    <p id="with-cli-label" style="display:none; color: var(--text-secondary); margin: 0 0 8px 0;"><strong>AI Command</strong></p>
                    <pre><code>Using guidance in team/AGENTS.md start rust</code></pre>
                </div>
                <div id="without-cli-content" style="display: none;">
                    <p id="without-cli-label" style="display:none; color: var(--text-secondary); margin: 0 0 8px 0;"><strong>Full Command</strong></p>
                    <p style="color: var(--text-secondary); margin-bottom: 16px;">
                        ⚙️ To start Rust directly, run in your webroot/team folder:
                    </p>
                    <pre><code id="without-cli-cmd-display">cargo run --bin partner_tools -- serve</code></pre>
                </div>
            </div>
        `;
        
        // Sync mode content and without-cli command with current state
        updateRustTabState();
        updateWithoutCliCommand();

        // Hide stop button when API is inactive, but keep reload button visible
        if (stopBtn) {
            stopBtn.style.display = 'none';
        }
        // Show backend status indicators even when main API is inactive - they can still be checked
        if (dbIndicators) {
            dbIndicators.style.display = 'block';
            // Check database status independently
            checkBackendStatus();
        }

        window.backendStatusCache = window.backendStatusCache || {};
        window.backendStatusCache.rustApi = { value: false, timestamp: Date.now() };
        if (recheckMessage) {
            recheckMessage.style.display = 'block';
            recheckMessage.textContent = `Last recheck: ${recheckTime}. Rust API is not reachable.`;
        }
        if (typeof updateRustRecheckMessageVisibilityForDesktopInstaller === 'function') {
            updateRustRecheckMessageVisibilityForDesktopInstaller();
        }
        if (typeof updateBackendAggregateStatus === 'function') {
            updateBackendAggregateStatus('quickstartDiv-python-status');
        }

        // Initialize feather icons for the info icon
        if (window.feather) {
            setTimeout(() => feather.replace(), 100);
        }
    }
}

// Returns the venv activation prefix for the given OS
function getVenvPrefix(selectedOS) {
    if (selectedOS === 'PC') {
        return 'python -m venv env && env\\Scripts\\activate.bat && ';
    }
    return 'python3 -m venv env\nsource env/bin/activate\n';
}

// Updates the without-cli command display based on current OS selection
function updateWithoutCliCommand() {
    const cmdEl = document.getElementById('without-cli-cmd-display');
    if (!cmdEl) return;
    const selectedOS = (document.getElementById('os') || {}).value || '';
    if (selectedOS === 'PC') {
        cmdEl.textContent = getVenvPrefix('PC') + 'cargo run --bin partner_tools -- serve';
    } else {
        cmdEl.textContent = getVenvPrefix('Mac') + 'cargo run --bin partner_tools -- serve';
    }
}

// Sync Rust start instructions with current backend command mode state.
function updateRustTabState(modeState = null) {
    const resolvedModeState = modeState || (
        typeof getBackendCommandState === 'function'
            ? getBackendCommandState()
            : { withAi: true, withoutAi: false }
    );
    const withCliContent = document.getElementById('with-cli-content');
    const withoutCliContent = document.getElementById('without-cli-content');
    const withCliLabel = document.getElementById('with-cli-label');
    const withoutCliLabel = document.getElementById('without-cli-label');
    const showWithCli = !!resolvedModeState.withAi;
    const showWithoutCli = !!resolvedModeState.withoutAi;
    const showBothLabels = showWithCli && showWithoutCli;

    if (withCliContent) {
        withCliContent.style.display = showWithCli ? 'block' : 'none';
    }
    if (withoutCliContent) {
        withoutCliContent.style.display = showWithoutCli ? 'block' : 'none';
    }
    if (withCliLabel) {
        withCliLabel.style.display = showBothLabels ? 'block' : 'none';
    }
    if (withoutCliLabel) {
        withoutCliLabel.style.display = showBothLabels ? 'block' : 'none';
    }
}

// Backward-compatibility: tabs were removed, keep function as no-op mode sync.
function switchRustTab() {
    updateRustTabState();
}

// Helper function to update a single status indicator
function updateStatusIndicator(indicatorId, textId, isActive, activeText, inactiveText) {
    const indicator = document.getElementById(indicatorId);
    const text = document.getElementById(textId);
    
    if (!indicator || !text) return;
    
    if (isActive) {
        indicator.className = 'status-indicator connected';
        text.textContent = activeText;
        text.style.color = 'var(--accent-green)';
    } else {
        indicator.className = 'status-indicator error';
        text.textContent = inactiveText;
        text.style.color = 'var(--text-secondary)';
    }
}

// Function to check a single database connection
async function checkDatabaseConnection(endpoint, indicatorId, textId, activeText, inactiveText) {
    try {
        const response = await fetch(`http://localhost:8081/api/db/${endpoint}`);
        const result = await response.json();
        updateStatusIndicator(indicatorId, textId, result.success, activeText, inactiveText);
        return result.success;
    } catch (error) {
        updateStatusIndicator(indicatorId, textId, false, activeText, inactiveText);
        return false;
    }
}

// Function to check all backend status (API + databases)
async function checkBackendStatus() {
    // Check individual database connections
    await Promise.all([
        checkDatabaseConnection(
            'test-commons-connection',
            'commons-db-indicator',
            'commons-db-text',
            'Commons database active',
            'Commons database inactive'
        ),
        checkDatabaseConnection(
            'test-exiobase-connection',
            'exiobase-db-indicator',
            'exiobase-db-text',
            'Industry database active',
            'Industry database inactive'
        ),
        // Locations Database - only show when active
        (async () => {
            try {
                const response = await fetch(`http://localhost:8081/api/db/test-locations-connection`);
                const result = await response.json();
                const container = document.getElementById('location-db-container');
                if (result.success) {
                    updateStatusIndicator('location-db-indicator', 'location-db-text', true, 'Locations Database active', 'Locations Database inactive');
                    if (container) container.style.display = 'flex';
                } else {
                    // Keep hidden when inactive
                    if (container) container.style.display = 'none';
                }
                return result.success;
            } catch (error) {
                // Keep hidden on error
                const container = document.getElementById('location-db-container');
                if (container) container.style.display = 'none';
                return false;
            }
        })()
    ]);
}

// Function to check individual database connections (legacy function for compatibility)
async function checkIndividualDatabaseStatus() {
    // Redirect to new backend status check
    await checkBackendStatus();
}

// Function to check database connection status (legacy function for compatibility)
async function checkDatabaseStatus() {
    // Redirect to new individual database status check
    checkIndividualDatabaseStatus();
}

// Function to toggle localhost fallback
function toggleLocalhostFallback(checkbox) {
    const enabled = checkbox.checked;
    localStorage.setItem('pullLocalRust', enabled ? 'true' : 'false');

    if (enabled) {
        // Re-enable fallback
        API_BASE = getApiBase();
        showNotification('✅ Localhost fallback enabled. Page will reload.', 'success');
    } else {
        // Disable fallback
        API_BASE = window.location.origin.includes('localhost')
            ? 'http://localhost:8081/api'
            : `${window.location.origin}/api`;
        showNotification('⚠️ Localhost fallback disabled. Page will reload.', 'info');
    }

    // Reload page after a short delay
    setTimeout(() => {
        window.location.reload();
    }, 1500);
}

// Make functions globally available
// Function to stop Rust server
async function stopRustServer() {
    const stopBtn = document.getElementById('stop-rust-btn');
    
    if (stopBtn) {
        stopBtn.disabled = true;
        stopBtn.textContent = 'Stopping...';
    }
    
    try {
        // Call the Rust API restart endpoint which performs a clean shutdown
        const response = await fetch('http://localhost:8081/api/config/restart', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const result = await response.json();
            showNotification('✅ ' + result.message, 'success');
            
            // Wait a moment for shutdown to complete, then refresh the status
            setTimeout(async () => {
                await updateRustApiStatusPanel();
            }, 2000);
        } else {
            throw new Error(`Server responded with status: ${response.status}`);
        }
        
    } catch (error) {
        console.error('Error stopping server via API:', error);
        
        // Fallback to showing terminal command
        const command = 'lsof -ti:8081 | xargs kill -9';
        const confirmed = confirm(`API stop failed. To manually stop the Rust server, run this command in your terminal:\n\n${command}\n\nOr tell Claude Code CLI: "Stop the Rust server"\n\nClick OK if you've run the command, then use Reload Status to refresh.`);
        
        if (confirmed) {
            showNotification('Manual server stop command provided. Use Reload Status to refresh.', 'info');
            
            setTimeout(async () => {
                await updateRustApiStatusPanel();
            }, 1000);
        }
    } finally {
        if (stopBtn) {
            stopBtn.disabled = false;
            stopBtn.textContent = 'Stop Rust';
        }
    }
}

window.getApiBase = getApiBase;
window.toggleLocalhostFallback = toggleLocalhostFallback;
window.createOSDetectionPanel = createOSDetectionPanel;
window.createRustApiStatusPanel = createRustApiStatusPanel;
window.updateRustApiStatusPanel = updateRustApiStatusPanel;
window.checkBackendStatus = checkBackendStatus;
window.checkDatabaseConnection = checkDatabaseConnection;
window.updateStatusIndicator = updateStatusIndicator;
window.checkIndividualDatabaseStatus = checkIndividualDatabaseStatus;
window.switchRustTab = switchRustTab;
window.checkDatabaseStatus = checkDatabaseStatus;
window.stopRustServer = stopRustServer;
window.apiCall = apiCall;
window.showNotification = showNotification;
window.formatDate = formatDate;
window.safeGetElement = safeGetElement;
window.safeQuerySelector = safeQuerySelector;
window.initializeFeatherIcons = initializeFeatherIcons;
window.waitForDependencies = waitForDependencies;
window.displayFile = displayFile;
window.fileDisplaySystem = fileDisplaySystem;
window.getBasePath = getBasePath;
window.fixRelativePath = fixRelativePath;
window.updateFaviconPath = updateFaviconPath;
window.BASE_PATH = BASE_PATH;


// Team Lookup Cache System
// Global object to store team data by modelsite
window.teamLookup = window.teamLookup || {};

// Function to get modelsite cookie value using Cookies.get (like localsite.js)
function getModelsiteCookie() {
    if (typeof getEffectiveModelsite === 'function') {
        const effectiveModelsite = getEffectiveModelsite();
        if (effectiveModelsite) {
            return effectiveModelsite;
        }
    }
    if (typeof Cookies !== 'undefined') {
        const modelsite = Cookies.get('modelsite');
        if (modelsite) {
            return modelsite;
        }
    }
    // Fallback to 'nosite' if no cookie found
    console.log('No modelsite cookie found, using "nosite"');
    return 'nosite';
}

// Function to save team data to browser cache (localStorage)
function saveTeamLookupToCache(modelsite, teamData) {
    try {
        const cacheKey = `teamLookup_${modelsite}`;
        localStorage.setItem(cacheKey, JSON.stringify(teamData));
        console.log(`Team lookup data cached for modelsite: ${modelsite}`);
    } catch (error) {
        console.error('Failed to save team lookup to cache:', error);
    }
}

// Function to load team data from browser cache
function loadTeamLookupFromCache(modelsite) {
    try {
        const cacheKey = `teamLookup_${modelsite}`;
        const cachedData = localStorage.getItem(cacheKey);
        if (cachedData) {
            return JSON.parse(cachedData);
        }
    } catch (error) {
        console.error('Failed to load team lookup from cache:', error);
    }
    return null;
}

// Function to populate teamLookup object from list data
function populateTeamLookup(listData) {
    const modelsite = getModelsiteCookie();
    
    if (!listData || !Array.isArray(listData)) {
        console.error('Invalid list data provided to populateTeamLookup');
        return;
    }
    
    // Initialize teamLookup for this modelsite if it doesn't exist
    if (!window.teamLookup[modelsite]) {
        window.teamLookup[modelsite] = {};
    }
    
    console.log(`Populating team lookup for modelsite: ${modelsite}`);
    
    // Process each team member
    listData.forEach(member => {
        if (member.Name) {
            // Extract required fields: Name, Email, Role (Title), Team (Department)
            const teamMember = {
                Name: member.Name || '',
                Email: member.Email || '',
                Role: member.Role || member.Title || '',
                Team: member.Team || member.Department || ''
            };
            
            // Store by name (case-insensitive key)
            const nameKey = member.Name.toLowerCase();
            window.teamLookup[modelsite][nameKey] = teamMember;
        }
    });
    
    // Save to browser cache
    saveTeamLookupToCache(modelsite, window.teamLookup[modelsite]);
    
    console.log(`Team lookup populated with ${Object.keys(window.teamLookup[modelsite]).length} members for ${modelsite}`);
}

// Function to get team member by name
function getTeamMemberByName(name) {
    const modelsite = getModelsiteCookie();
    
    // Check if we have data for this modelsite
    if (!window.teamLookup[modelsite]) {
        // Try to load from cache
        const cachedData = loadTeamLookupFromCache(modelsite);
        if (cachedData) {
            window.teamLookup[modelsite] = cachedData;
        } else {
            console.log(`No team lookup data available for modelsite: ${modelsite}`);
            return null;
        }
    }
    
    const nameKey = name.toLowerCase();
    return window.teamLookup[modelsite][nameKey] || null;
}

// Function to search team members by partial name
function searchTeamMembers(query) {
    const modelsite = getModelsiteCookie();
    
    // Check if we have data for this modelsite
    if (!window.teamLookup[modelsite]) {
        // Try to load from cache
        const cachedData = loadTeamLookupFromCache(modelsite);
        if (cachedData) {
            window.teamLookup[modelsite] = cachedData;
        } else {
            console.log(`No team lookup data available for modelsite: ${modelsite}`);
            return [];
        }
    }
    
    const queryLower = query.toLowerCase();
    const results = [];
    
    Object.values(window.teamLookup[modelsite]).forEach(member => {
        if (member.Name.toLowerCase().includes(queryLower)) {
            results.push(member);
        }
    });
    
    return results.sort((a, b) => a.Name.localeCompare(b.Name));
}

// Initialize team lookup from cache on page load
document.addEventListener('DOMContentLoaded', function() {
    const modelsite = getModelsiteCookie();
    const cachedData = loadTeamLookupFromCache(modelsite);
    if (cachedData) {
        if (!window.teamLookup[modelsite]) {
            window.teamLookup[modelsite] = {};
        }
        Object.assign(window.teamLookup[modelsite], cachedData);
        console.log(`Team lookup initialized from cache for ${modelsite}: ${Object.keys(cachedData).length} members`);
    }
});

// Function to add control buttons (close/expand) to any div
function addControlButtons(parentDivId, options = {}) {
    const parentDiv = document.getElementById(parentDivId);
    if (!parentDiv) {
        console.warn(`addControlButtons: Parent div '${parentDivId}' not found`);
        return;
    }

    // Default options
    const defaults = {
        showCloseButton: true,
        showExpandButton: true,
        showClearButton: false, // Only show for specific divs when needed
        closeButtonText: '×',
        expandButtonText: '⛶',
        clearButtonText: '🗑️',
        position: 'top-right', // top-right, top-left, bottom-right, bottom-left
        onClose: null,
        onExpand: null,
        onClear: null
    };
    
    const config = { ...defaults, ...options };
    
    // Create container for buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'control-buttons-container';
    buttonContainer.style.cssText = `
        position: absolute;
        ${config.position.includes('top') ? 'top: 8px' : 'bottom: 8px'};
        ${config.position.includes('right') ? 'right: 8px' : 'left: 8px'};
        display: flex;
        gap: 8px;
        z-index: 1001;
    `;
    
    // Common button styles function
    function getButtonStyles() {
        return `
            background: rgba(0, 0, 0, 0.7);
            color: white;
            border: none;
            width: 28px;
            height: 28px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background-color 0.2s ease;
        `;
    }
    
    // Create clear button first
    if (config.showClearButton) {
        const clearButton = document.createElement('button');
        clearButton.className = 'control-button clear-button';
        clearButton.innerHTML = config.clearButtonText;
        clearButton.title = 'Clear content';
        clearButton.style.cssText = getButtonStyles();
        
        clearButton.addEventListener('mouseenter', () => {
            clearButton.style.background = 'rgba(168, 85, 247, 0.8)';
        });
        
        clearButton.addEventListener('mouseleave', () => {
            clearButton.style.background = 'rgba(0, 0, 0, 0.7)';
        });
        
        clearButton.addEventListener('click', () => {
            if (config.onClear && typeof config.onClear === 'function') {
                config.onClear(parentDiv, clearButton);
            } else {
                // Default clear behavior - clear content
                parentDiv.innerHTML = '';
            }
        });
        
        buttonContainer.appendChild(clearButton);
    }
    
    // Create expand button second
    if (config.showExpandButton) {
        const expandButton = document.createElement('button');
        expandButton.className = 'control-button expand-button';
        expandButton.innerHTML = config.expandButtonText;
        expandButton.title = 'Expand/Collapse';
        expandButton.style.cssText = getButtonStyles();
        
        expandButton.addEventListener('mouseenter', () => {
            expandButton.style.background = 'rgba(59, 130, 246, 0.8)';
        });
        
        expandButton.addEventListener('mouseleave', () => {
            expandButton.style.background = 'rgba(0, 0, 0, 0.7)';
        });
        
        expandButton.addEventListener('click', () => {
            if (config.onExpand && typeof config.onExpand === 'function') {
                config.onExpand(parentDiv, expandButton);
            } else {
                // Default expand/collapse behavior
                const isCollapsed = parentDiv.style.height === '100px';
                if (isCollapsed) {
                    parentDiv.style.height = '200px';
                    expandButton.innerHTML = '⛶';
                    expandButton.title = 'Collapse';
                } else {
                    parentDiv.style.height = '100px';
                    expandButton.innerHTML = '⛷';
                    expandButton.title = 'Expand';
                }
            }
        });
        
        buttonContainer.appendChild(expandButton);
    }
    
    // Create close button last (rightmost)
    if (config.showCloseButton) {
        const closeButton = document.createElement('button');
        closeButton.className = 'control-button close-button';
        closeButton.innerHTML = config.closeButtonText;
        closeButton.title = 'Close';
        closeButton.style.cssText = getButtonStyles();
        
        closeButton.addEventListener('mouseenter', () => {
            closeButton.style.background = 'rgba(220, 38, 38, 0.8)';
        });
        
        closeButton.addEventListener('mouseleave', () => {
            closeButton.style.background = 'rgba(0, 0, 0, 0.7)';
        });
        
        closeButton.addEventListener('click', () => {
            if (config.onClose && typeof config.onClose === 'function') {
                config.onClose(parentDiv);
            } else {
                parentDiv.remove();
            }
        });
        
        buttonContainer.appendChild(closeButton);
    }
    
    // Ensure parent div has relative positioning for absolute positioning of buttons
    if (getComputedStyle(parentDiv).position === 'static') {
        parentDiv.style.position = 'relative';
    }
    
    // Add button container to parent div
    parentDiv.appendChild(buttonContainer);
    
    return buttonContainer;
}

// Load team data for teamLookup cache
// Uses populateTeamLookup
async function loadTeamDataForLookup() {
    const modelsite = typeof getModelsiteCookie === 'function' ? getModelsiteCookie() : 'nosite';
    console.log('Loading team data for modelsite:', modelsite);
    
    try {
        // Try to load from the modelteam source (main team data)
        const teamDataUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRh5-bIR4hC1f9H3NtDCNT19hZXnqz8WRrBwTuLGnZiA5PWhFILUv2nS2FKE2TZ4dZ-RnJkZwHx1t2Y/pub?gid=1054734503&single=true&output=csv';
        
        // Use loadUnifiedData if available
        let teamData;
        if (typeof loadUnifiedData === 'function') {
            const result = await loadUnifiedData(teamDataUrl);
            teamData = result.data;
        } else {
            // Fallback to direct fetch
            const response = await fetch(teamDataUrl);
            const csvText = await response.text();
            // Simple CSV parsing (basic implementation)
            const lines = csvText.split('\n');
            const headers = lines[0].split(',').map(h => h.trim());
            teamData = lines.slice(1).map(line => {
                const values = line.split(',');
                const obj = {};
                headers.forEach((header, index) => {
                    obj[header] = values[index] ? values[index].trim() : '';
                });
                return obj;
            }).filter(obj => obj.Name && obj.Name.length > 0);
        }
        
        if (teamData && teamData.length > 0) {
            console.log(`Loaded ${teamData.length} team members for lookup cache`);
            alert(`DEBUG TEAM DATA: Loaded ${teamData.length} team members for modelsite "${modelsite}". Sample: ${teamData.slice(0, 3).map(m => m.Name || 'No Name').join(', ')}`);
            // Populate the teamLookup cache
            if (typeof populateTeamLookup === 'function') {
                populateTeamLookup(teamData);
                alert(`DEBUG TEAM DATA: teamLookup populated. Cache now has ${Object.keys(window.teamLookup[modelsite] || {}).length} members for "${modelsite}"`);
            } else {
                alert('DEBUG TEAM DATA: populateTeamLookup function not available');
            }
        } else {
            console.log('No team data found or failed to parse');
            alert('DEBUG TEAM DATA: No team data found or failed to parse');
        }
    } catch (error) {
        console.error('Failed to load team data for lookup cache:', error);
    }
}

// ========== Page Tabs Configuration and Rendering ==========

// Page-specific tab configurations
// Structure: { 'show-key': { name: 'Display Name', [align: 'right'], [onclick: 'customFunction()'], [id: 'custom-id'] } }
const showtabs = {
    'explore-parks': {
        'parks': { name: 'Parks' },
        'cities': { name: 'Cities' },
        'airports': { name: 'Airports' },
        'recyclers': { name: 'Recycling' },
        'liaisons': { name: 'Film Liaisons' }
    },
    'display-team': {
        'visits': { name: 'City Visits', id: 'cityList' },
        'offices': { name: 'Offices', id: 'userList' },
        'profile': { name: 'My Profile', id: 'seeProfile' },
        'liaisons': { name: 'Liaisons', id: 'liaisonsList' },
        'airports': { name: 'Airports', id: 'airportsList' },
        'bios': { name: 'Bios', id: 'biosList', hidden: true },
        'mail': { name: 'News', id: 'readMail', hidden: true },
        'signout': { name: 'Sign Out', id: 'signOut', align: 'right', onclick: 'signOut()', style: 'background-color:rgb(229, 231, 235); color:#222;' }
    },
    'team-projects-edit': {
        'form': { name: 'Add Project', id: 'form-tab', textId: 'add-new-text', onclick: "switchToView('form')" },
        'visits': { name: 'View Projects', id: 'visits-tab', textId: 'view-projects-text', onclick: "switchToView('visits')" },
        'tables': { name: 'View Tables', id: 'tables-tab', textId: 'tables-btn-text', onclick: "switchToView('tables')" },
        'google': { name: 'Google Config', id: 'google-tab', hidden: true, onclick: "switchToView('google')" },
        'map': { name: 'View Map', id: 'map-tab', hidden: true, onclick: "switchToView('map')" }
    }
};

/**
 * Render page tabs from configuration
 * @param {string} pageKey - The key for the page configuration in showtabs object
 * @param {string} containerId - The ID of the container element to render tabs into
 * @param {object} options - Optional settings (defaultShow: default active tab key, hashKey: hash parameter to use, default 'show')
 */
function renderPageTabs(pageKey, containerId, options = {}) {
    const { defaultShow = null, hashKey = 'show' } = options;

    // Get the tabs configuration for this page
    const tabs = showtabs[pageKey];
    if (!tabs) {
        console.warn(`renderPageTabs: No tabs configuration found for page "${pageKey}"`);
        return;
    }

    // Find the container
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn(`renderPageTabs: Container "${containerId}" not found`);
        return;
    }

    // Get current hash to determine active tab
    const hash = typeof getHash === 'function' ? getHash() : {};
    const currentShow = hash[hashKey] || defaultShow;

    // Build the tabs HTML
    let tabsHTML = '<div class="page-tab-container">\n';

    const tabKeys = Object.keys(tabs);
    tabKeys.forEach((showKey, index) => {
        const tab = tabs[showKey];

        // Skip if hidden (will be handled separately with display:none wrapper)
        if (tab.hidden && pageKey === 'display-team') {
            return; // Skip for now, will add after main tabs
        }

        const isActive = (currentShow === showKey) || (!currentShow && index === 0) ? ' active' : '';
        const alignStyle = tab.align === 'right' ? ' style="margin-left: auto;' + (tab.style ? ' ' + tab.style : '') + '"' : (tab.style ? ` style="${tab.style}"` : '');
        const id = tab.id || `${showKey}-tab`;

        // Handle onclick - use custom or default goHash
        let onclick = '';
        if (tab.onclick) {
            onclick = tab.onclick;
        } else {
            onclick = `goHash({'show':'${showKey}','summarize':''})`;
        }

        // Build button HTML
        let buttonHTML = `    <button class="page-tab${isActive}" id="${id}" onclick="${onclick}"${alignStyle}>`;

        // Add text with optional span wrapper
        if (tab.textId) {
            buttonHTML += `<span id="${tab.textId}">${tab.name}</span>`;
        } else {
            buttonHTML += tab.name;
        }

        buttonHTML += `</button>\n`;

        tabsHTML += buttonHTML;
    });

    // Add hidden tabs for display-team (bios, mail)
    if (pageKey === 'display-team') {
        tabsHTML += '    <div class="localX" style="display:none;">\n';
        const biosTab = tabs['bios'];
        if (biosTab) {
            tabsHTML += `        <button class="page-tab" id="${biosTab.id}" onclick="goHash({'show':'bios','summarize':''})" style="display:none">${biosTab.name}</button>\n`;
        }
        tabsHTML += '    </div>\n';

        tabsHTML += '    <div class="local" style="display:none">\n';
        const mailTab = tabs['mail'];
        if (mailTab) {
            tabsHTML += `        <button class="page-tab" id="${mailTab.id}" onclick="goHash({'show':'mail','summarize':''})" style="display:none">${mailTab.name}</button>\n`;
        }
        tabsHTML += '    </div>\n';
    }

    // Add hidden tabs for team-projects-edit (google, map)
    if (pageKey === 'team-projects-edit') {
        const googleTab = tabs['google'];
        const mapTab = tabs['map'];
        if (googleTab) {
            tabsHTML += `    <button class="page-tab" id="${googleTab.id}" onclick="switchToView('google')" style="display:none">${googleTab.name}</button>\n`;
        }
        if (mapTab) {
            tabsHTML += `    <button class="page-tab" id="${mapTab.id}" onclick="switchToView('map')" style="display:none">${mapTab.name}</button>\n`;
        }
    }

    tabsHTML += '</div>\n<div class="page-tab-line"></div>';

    // Insert the tabs
    container.innerHTML = tabsHTML;
}

/**
 * Update active tab based on current hash
 * @param {string} pageKey - The key for the page configuration in showtabs object
 * @param {string} hashKey - Hash parameter to use (default 'show')
 */
function updateActiveTab(pageKey, hashKey = 'show') {
    const hash = typeof getHash === 'function' ? getHash() : {};
    const show = hash[hashKey];

    if (!show) return;

    // Remove active class from all tabs
    document.querySelectorAll('.page-tab').forEach(tab => {
        tab.classList.remove('active');
    });

    // Add active class to current tab
    const activeTab = document.getElementById(show + '-tab');
    if (activeTab) {
        activeTab.classList.add('active');
    }
}
