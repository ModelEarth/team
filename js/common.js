// Common utilities and shared functions

// Function to detect if current site is a geo site
function isGeoSite() {
    const modelsite = typeof Cookies !== 'undefined' ? Cookies.get('modelsite') : null;
    return window.location.hostname.includes('geo') || 
           window.location.hostname.includes('location') ||
           (modelsite === 'model.georgia');
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

// API Configuration
if (typeof API_BASE === 'undefined') {
    var API_BASE = 'http://localhost:8081/api';
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
    
    // Special handling for cli-commands section - ensure claude-code-commands is visible
    if (sectionId === 'cli-commands') {
        const claudeCodeCommands = document.getElementById('claude-code-commands');
        if (claudeCodeCommands) {
            console.log('expandSection: Setting claude-code-commands to display: block');
            claudeCodeCommands.style.display = 'block';
        } else {
            console.log('expandSection: claude-code-commands not found');
        }
    }
}

// Function to create collapsible sections with Done/Show toggle
function makeCollapsible(divId, statusMessage = 'Section completed and collapsed') {
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
    <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 16px;">
        <h1 class="card-title" id="cli-tools-title" style="margin: 0;">My Command Line Tool</h1>
        <div>
            <select id="os" style="padding: 8px 12px; border: 1px solid var(--border-medium); border-radius: var(--radius-sm); font-size: 14px; min-width: 150px;">
                <option value="">Select OS...</option>
                <option value="Mac">Mac</option>
                <option value="PC">PC</option>
                <option value="Linux">Linux</option>
                <option value="Other">Other</option>
            </select>
            <div id="os-info" style="color: var(--text-secondary); font-size: 12px; margin-top: 4px;"></div>
        </div>
    </div>
    <div>

        <span style="font-weight: 500; margin-right: 12px;">I'll be coding with...</span><br>
        <div style="margin-bottom: 4px;"></div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
            <label style="display: flex; align-items: center; gap: 8px; font-size: 14px;">
                <input type="checkbox" id="claude-code-cli" style="margin: 0;">
                <span>Claude Code CLI (Recommended)</span>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 14px;">
                <input type="checkbox" id="gemini-cli" style="margin: 0;">
                <span>Gemini CLI (Not mature yet)</span>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 14px;">
                <input type="checkbox" id="vscode-claude" style="margin: 0;">
                <span>VS Code with Claude</span>
            </label>
        </div>
    </div>
    <div id="cli-commands" style="display: none;">
        <div id="claude-code-commands" style="display: none;">
            <h4 style="margin: 0 0 8px 0;">Claude Code CLI Installation:</h4>
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
                
                Get yourself a $20/month subscription to <a href="https://claude.com/product/claude-code">Claude Code CLI</a>.<br>

                <div id="os-specific-install">
                    <!-- OS-specific installation instructions will be populated here -->
                </div>

            </div>

            <div id="cli-instructions" style="margin-bottom: 16px;">
                Right-click on your "<span id="repo-name">team</span>" repo, open a New Terminal at Folder, and run a virtual environment with Claude Code CLI.
            </div>
            
            <div id="command-display">python3 -m venv env
source env/bin/activate
npx @anthropic-ai/claude-code</div>
            <div style="font-size: .8em;">
                After a large interaction with Claude, if you're changing to a new topic, by starting a fresh terminal session you'll use fewer tokens. Claude Pro reserves the right to throttle you after 50 sessions/month, but if sessions are small we assume Anthropic will avoid throttling a fresh-session approach.
            </div>
        </div>
    </div>
    </div>

        <div class="cardsection" id="gemini-installation" style="display: none;">
                <h4 style="margin: 0 0 8px 0;">Gemini CLI Installation:</h4>
                <div id="gemini-command-display">
                    <pre><code>python -m venv env
env\Scripts\activate.bat
npm install -g @google/generative-ai
gemini</code></pre>
            </div>
        </div>
        <div class="cardsection" id="vscode-cmds" style="display: none; margin-bottom:16px">
            <h4 style="margin: 0 0 8px 0;">VS Code command</h4>
            After forking and cloning the webroot repo, initialize the submodules:
            <pre><code>git submodule update --init --recursive</code></pre>
        </div>

        <div class="card" style="margin-bottom: 16px;">

            <h1>Prerequisites</h1>
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                <span>Do you have Github CLI installed?</span>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 14px;">
                    <input type="radio" name="github-cli-status" value="yes" style="margin: 0;">
                    <span>Yes</span>
                </label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 14px;">
                    <input type="radio" name="github-cli-status" value="no" style="margin: 0;" checked>
                    <span>No</span>
                </label>
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

    `;
    
    container.innerHTML = panelHTML;
    
    // Initialize the panel after creating it
    initializeOSDetectionPanel();
}



// Function to initialize OS detection panel functionality
function initializeOSDetectionPanel() {
    const osSelect = document.getElementById('os');
    const osInfo = document.getElementById('os-info');
    const claudeCodeCli = document.getElementById('claude-code-cli');
    const geminiCli = document.getElementById('gemini-cli');
    const vscodeClaude = document.getElementById('vscode-claude');
    const cliCommands = document.getElementById('cli-commands');
    const claudeCodeCommands = document.getElementById('claude-code-commands');
    const geminiInstallation = document.getElementById('gemini-installation');
    const vscodeCommands = document.getElementById('vscode-cmds');
    const claudeInstallText = document.getElementById('claude-install-text');
    const repoNameSpan = document.getElementById('repo-name');
    
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
    const savedClaudeCode = localStorage.getItem('claude-code-cli-installed');
    const savedGemini = localStorage.getItem('gemini-cli-installed');
    const savedVscode = localStorage.getItem('vscode-claude-installed');
    const savedInstallStatus = localStorage.getItem('claude-install-status');
    
    // Check Claude by default if no saved preference exists
    if (claudeCodeCli) {
        if (savedClaudeCode === null) {
            claudeCodeCli.checked = true;
        } else if (savedClaudeCode === 'true') {
            claudeCodeCli.checked = true;
        }
    }
    if (geminiCli && savedGemini === 'true') {
        geminiCli.checked = true;
    }
    if (vscodeClaude && savedVscode === 'true') {
        vscodeClaude.checked = true;
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
        const selectedOS = osSelect.value;
        const claudeCodeChecked = claudeCodeCli ? claudeCodeCli.checked : false;
        const geminiChecked = geminiCli ? geminiCli.checked : false;
        const vscodeChecked = vscodeClaude ? vscodeClaude.checked : false;
        
        // Update OS-specific installation instructions
        updateOSSpecificInstall(selectedOS);
        
        // Update title based on number of checked tools
        const cliToolsTitle = document.getElementById('cli-tools-title');
        if (cliToolsTitle) {
            cliToolsTitle.textContent = 'Start your Code CLI (Command Line Interface)';
        }
        
        // Handle Claude Code CLI section
        if (claudeCodeChecked) {
            // Show and expand the main CLI commands section (this will also handle claude-code-commands)
            expandSection('cli-commands');
            
            // Update command display based on OS and radio button selection
            updateCommandsForOS(selectedOS);
        } else {
            // Hide the entire CLI commands section
            if (cliCommands) {
                cliCommands.style.display = 'none';
            }
        }
        
        // Handle Gemini CLI section
        if (geminiChecked) {
            // Show and expand Gemini installation section
            expandSection('gemini-installation');
            
            // Update Gemini commands based on OS
            updateGeminiCommandsForOS(selectedOS);
        } else {
            // Hide Gemini installation section
            if (geminiInstallation) {
                geminiInstallation.style.display = 'none';
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
                geminiContent = `<pre><code>python -m venv env
env\\Scripts\\activate.bat
npm install -g @google/generative-ai
gemini</code></pre>`;
            } else {
                geminiContent = `<pre><code>python3 -m venv env
source env/bin/activate
npm install -g @google/generative-ai
gemini</code></pre>`;
            }
            
            geminiCommandDisplay.innerHTML = geminiContent;
        }
    }
    
    // Function to update OS-specific installation instructions
    function updateOSSpecificInstall(selectedOS) {
        const osSpecificInstall = document.getElementById('os-specific-install');
        if (osSpecificInstall) {
            let installContent = `If you haven't installed npm, node, python, or pip yet, install <a href="/io/coders/python/" target="_blank">node and npm using pyenv and nvm</a>.<br><br>`;
            
            if (selectedOS === 'PC' || selectedOS === 'Other' || !selectedOS || selectedOS === '') {
                installContent += `<strong>For PC users:</strong> Use this PowerShell command first which automatically installs Node.js, npm, and Claude Code CLI in one step:<br>
                <pre><code>irm https://claude.ai/install.ps1 | iex</code></pre>`;
            }
            
            if (selectedOS === 'Mac' || selectedOS === 'Linux' || selectedOS === 'Other' || !selectedOS || selectedOS === '') {
                if (selectedOS === 'PC') {
                    installContent += '<br>';
                }
                const osLabel = (selectedOS === 'Mac' || selectedOS === 'Linux') ? selectedOS : 'Mac/Linux';
                installContent += `<strong>For ${osLabel} users:</strong> Install Claude Code CLI manually with npm:<br>
                <pre><code>npm install -g @anthropic-ai/claude-code</code></pre>`;
            }
            
            osSpecificInstall.innerHTML = installContent;
        }
    }

    // Separate function to update commands - called after DOM is ready
    function updateCommandsForOS(selectedOS) {
        // Find the command display div
        let commandDisplay = document.getElementById('command-display');
        
        // If not found directly, look for it within collapsed content
        if (!commandDisplay) {
            const claudeCodeCommands = document.getElementById('claude-code-commands');
            if (claudeCodeCommands) {
                commandDisplay = claudeCodeCommands.querySelector('#command-display') || 
                               claudeCodeCommands.querySelector('.collapse-content #command-display');
            }
        }
        
        if (commandDisplay) {
            let newContent = '';
            
            if (selectedOS === 'Mac' || selectedOS === 'Linux') {
                newContent = `<pre><code>python3 -m venv env
source env/bin/activate
npx @anthropic-ai/claude-code</code></pre>`;
            } else if (selectedOS === 'PC') {
                // Check if Initial install radio button is selected
                const initialInstallRadio = document.querySelector('input[name="claude-install-status"][value="initial"]');
                const isInitialInstall = initialInstallRadio && initialInstallRadio.checked;
                newContent = `<pre><code>python -m venv env && env\\Scripts\\activate.bat && npx @anthropic-ai/claude-code</code></pre>`;
            } else {
                newContent = `<b>For Unix/Linux/Mac:</b>
<pre><code>python3 -m venv env
source env/bin/activate
npx @anthropic-ai/claude-code</code></pre>

<b>For Windows:</b>
<pre><code>python -m venv env
env\\Scripts\\activate.bat
npx @anthropic-ai/claude-code</code></pre>`;
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
    
    if (vscodeClaude) {
        vscodeClaude.addEventListener('change', function() {
            localStorage.setItem('vscode-claude-installed', this.checked);
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
    }, 200);
    
    // Add event listeners for GitHub CLI status radio buttons and userComputer text box
    setTimeout(() => {
        const githubCliRadios = document.querySelectorAll('input[name="github-cli-status"]');
        const githubInstallDiv = document.getElementById('githubCLIinstall');
        const userComputerInput = document.getElementById('userComputer');
        const savedGithubCliStatus = localStorage.getItem('github-cli-status');
        const savedUserComputer = localStorage.getItem('user-computer-name');
        
        // Set radio button based on saved preference, default to "no"
        if (savedGithubCliStatus === 'yes') {
            const yesRadio = document.querySelector('input[name="github-cli-status"][value="yes"]');
            const noRadio = document.querySelector('input[name="github-cli-status"][value="no"]');
            if (yesRadio) yesRadio.checked = true;
            if (noRadio) noRadio.checked = false;
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
            const yesSelected = document.querySelector('input[name="github-cli-status"][value="yes"]:checked');
            if (githubInstallDiv) {
                if (yesSelected) {
                    githubInstallDiv.style.display = 'none';
                } else {
                    githubInstallDiv.style.display = 'block';
                }
            }
            
            // Hide/show userComputer text box based on radio selection
            if (userComputerInput) {
                if (yesSelected) {
                    userComputerInput.style.display = 'none';
                } else {
                    userComputerInput.style.display = 'block';
                }
            }
        }
        
        // Add event listeners for radio buttons
        githubCliRadios.forEach(radio => {
            radio.addEventListener('change', function() {
                console.log('GitHub CLI radio button changed to:', this.value);
                // Save the selected radio button value to localStorage
                localStorage.setItem('github-cli-status', this.value);
                
                // Update div visibility
                updateGithubCliVisibility();
            });
        });
        
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
    }, 200);
    
    // Initial update
    updateCliCommands();
    
    // Make sections collapsible after initialization
    setTimeout(() => {
        makeCollapsible('cli-commands', 'Claude Code CLI Installation');
        makeCollapsible('gemini-installation', 'Gemini CLI Installation');
        makeCollapsible('vscode-cmds', 'VS Code Commands');
    }, 100);
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
    
    // Calculate the correct path based on current location
    if (currentPath.includes('/admin/')) {
        // Already in admin folder, just go to server subfolder
        adminPath = 'server/';
    } else if (currentPath.includes('/projects/') || currentPath.includes('/preferences/')) {
        // In subdirectories, go up one level then to admin/server
        adminPath = '../admin/server/';
    } else {
        // From root team directory, path to admin/server
        adminPath = 'admin/server/';
    }

    const errorMessage = `
        <div style="color: #EF4444; padding: 8px 12px; border-radius: 6px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); margin: 8px 0;">
            <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                <span style="color: #EF4444; font-weight: 500;">API Connection Failed - Unable to connect to server.</span>
                <a href="${adminPath}">
                    Configure Your Local Server
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

// Function to create combined Rust API Status and Connection panel
function createRustApiStatusPanel(containerId, showConfigureLink = true) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn(`createRustApiStatusPanel: Container '${containerId}' not found`);
        return;
    }

    // Determine the relative path to admin/server/ from current page
    let adminPath = 'admin/server/';
    const currentPath = window.location.pathname;
    
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
        <div class="card" id="rust-api-status-panel">
            <h2 class="card-title">
                <span class="status-indicator" id="rust-api-status-indicator"></span>
                <span id="rust-api-status-title">Backend Rust API and Database Status</span>
            </h2>
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                
                <div>
                    
                    <!-- Status Indicators -->
                    <div id="backend-status-indicators" style="display: none;">
                        
                        <!-- Rust API Status Section -->
                        <div id="rust-api-status-content" style="margin-bottom: 16px;">
                            <p style="color: var(--text-secondary); margin-bottom: 16px;">
                                Checking backend API status...
                            </p>
                        </div>

                        <!-- Database Status Items -->
                        <div class="status-indicator-item" style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
                            <span class="status-box" id="commons-db-indicator" style="width: 20px; height: 20px; border-radius: 3px; background: transparent; color: #dc2626; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold;">🔴</span>
                            <span style="font-size: 16px; color: var(--text-secondary);" id="commons-db-text">MemberCommons database inactive</span>
                        </div>
                        <div class="status-indicator-item" style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
                            <span class="status-box" id="exiobase-db-indicator" style="width: 20px; height: 20px; border-radius: 3px; background: transparent; color: #dc2626; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold;">🔴</span>
                            <span style="font-size: 16px; color: var(--text-secondary);" id="exiobase-db-text">ModelEarth Industry Database inactive</span>
                        </div>
                        <div class="status-indicator-item" style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
                            <span class="status-box" id="location-db-indicator" style="width: 20px; height: 20px; border-radius: 3px; background: transparent; color: #dc2626; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold;">🔴</span>
                            <span style="font-size: 16px; color: var(--text-secondary);" id="location-db-text">Locations Database inactive</span>
                        </div>

                       
                    </div>

                </div>
                <div style="display: flex; flex-direction: column; justify-content: space-between; align-items: flex-end; min-height: 120px;">
                    <div style="display: flex; flex-direction: column; gap: 8px; align-items: flex-end;">
                        <button class="btn btn-secondary" onclick="updateRustApiStatusPanel()" style="display: none;margin: 0; width: 100%;" id="reload-status-btn">
                                Reload Status
                        </button>
                        <button class="btn btn-danger" onclick="stopRustServer()" style="display: none;margin: 0 0 2px 0; background: #b87333; color: white; border-color: #b87333; width: 100%; opacity: 0.85;" id="stop-rust-btn">
                                Stop Rust
                        </button>
                        <!-- Admin Detail Button -->
                        <button onclick="toggleAdminDetail()" id="admin-detail-btn" class="btn btn-secondary" style="margin: 0; width: 100%;">
                            Admin Details
                        </button>
                    </div>
                </div>
            </div>
            
            <!-- Admin Detail Content (hidden by default, shown when admin detail button clicked) -->
            <div class="config-info" id="config-display" style="display: none; margin-top: 16px; padding: 16px; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-light);">
                Loading configuration...
            </div>
        </div>
    `;

    container.innerHTML = panelHtml;

    // Initialize the status check
    updateRustApiStatusPanel(showConfigureLink, adminPath);
}

// Function to update the Rust API status panel
async function updateRustApiStatusPanel(showConfigureLink = true, adminPath = 'admin/server/') {
    const indicator = document.getElementById('rust-api-status-indicator');
    const title = document.getElementById('rust-api-status-title');
    const content = document.getElementById('rust-api-status-content');
    const dbIndicators = document.getElementById('backend-status-indicators');
    const reloadBtn = document.getElementById('reload-status-btn');
    const stopBtn = document.getElementById('stop-rust-btn');
    
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
            title.textContent = 'Backend API and Database Status';
            
            content.innerHTML = `
                <div style="color: var(--accent-green); margin-bottom: 16px;">
                    ✅ Backend Rust API is accessible
                </div>
            `;
            
            // Show reload and stop buttons
            if (reloadBtn) {
                reloadBtn.style.display = 'block';
            }
            if (stopBtn) {
                stopBtn.style.display = 'block';
            }
            
            // Show and check backend status indicators
            if (dbIndicators) {
                checkBackendStatus();
                dbIndicators.style.display = 'block';
            }
            
            
        } else {
            throw new Error('Backend not responding');
        }
    } catch (error) {
        // Backend is inactive - show demo mode
        indicator.className = 'status-indicator error';
        title.textContent = 'Backend Rust API and Database Status';
        
        const configureServerText = showConfigureLink 
            ? `<a href="${adminPath}" style="color: #856404; text-decoration: underline;">Configure Your Local Server</a>`
            : 'Configure Your Local Server';
        
        content.innerHTML = `
            <div style="color: #856404; background: #fff3cd; padding: 8px 12px; border-radius: 4px; border: 1px solid #ffeaa7; margin: 0 0 16px 0; display: flex; align-items: center; gap: 8px;">
                <i data-feather="info" style="width: 16px; height: 16px; flex-shrink: 0;"></i>
                <span><strong>Demo Mode:</strong> Database connection inactive. ${configureServerText}</span>
            </div>
            <p style="color: var(--text-secondary); margin-bottom: 16px;">
                <span style="color: #dc3545; margin-right: 8px;">🔴</span>The Rust backend server needs to be started to access full configuration and testing capabilities.
            </p>
            <!-- Tab Navigation -->
            <div style="border-bottom: 3px solid var(--accent-blue); margin: 16px 0;">
                <div style="display: flex; gap: 0;">
                    <button class="rust-tab-btn active" data-tab="with-claude" onclick="switchRustTab('with-claude')" style="padding: 12px 20px; border: none; background: var(--accent-blue); color: white; border-bottom: 2px solid var(--accent-blue); font-weight: 500; cursor: pointer; border-radius: 6px 6px 0 0;">
                        🤖 With Claude
                    </button>
                    <button class="rust-tab-btn" data-tab="without-claude" onclick="switchRustTab('without-claude')" style="padding: 12px 20px; border: 1px solid var(--border-medium); background: white; color: var(--text-primary); border-bottom: 2px solid transparent; font-weight: 500; cursor: pointer; border-radius: 6px 6px 0 0;">
                        ⚙️ Without Claude
                    </button>
                </div>
            </div>
            
            <!-- Tab Content -->
            <div id="rust-tab-content">
                <!-- Default to With Claude content -->
                <div id="with-claude-content" class="rust-tab-content active">
                    <p style="color: var(--text-secondary); margin-bottom: 16px;">
                        🤖 If you already have Claude Code running, say: <strong>"Start Rust"</strong> or similar.
                    </p>
                    <div style="margin-top: 12px; font-size: 12px; color: var(--text-secondary);">
                        Claude option will automatically start the server and databases for you.
                    </div>
                </div>
                
                <div id="without-claude-content" class="rust-tab-content" style="display: none;">
                    <p style="color: var(--text-secondary); margin-bottom: 16px;">
                        ⚙️ Alternative tools and manual setup options for running the server without Claude Code CLI.
                    </p>
                    <div style="margin-top: 16px; padding: 16px; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-light);">
                        <h5 style="margin: 0 0 12px 0;">Manual Setup Commands:</h5>
                        <pre style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; font-size: 14px; margin: 8px 0;"><code>cd team
cargo run --bin partner_tools -- serve</code></pre>
                        <p style="color: var(--text-secondary); font-size: 14px; margin: 8px 0 0 0;">
                            Run this in your terminal from the webroot directory.
                        </p>
                    </div>
                    <div style="margin-top: 12px; font-size: 12px; color: var(--text-secondary);">
                        Manual option shows commands to run yourself.
                    </div>
                </div>
            </div>
        `;
        
        // Hide stop button when API is inactive, but keep reload button visible
        if (stopBtn) {
            stopBtn.style.display = 'none';
        }
        // Keep reload button visible so user can refresh status
        if (reloadBtn) {
            reloadBtn.style.display = 'block';
        }
        
        // Show backend status indicators even when main API is inactive - they can still be checked
        if (dbIndicators) {
            dbIndicators.style.display = 'block';
            // Check database status independently
            checkBackendStatus();
        }
        
        
        // Initialize feather icons for the info icon
        if (window.feather) {
            setTimeout(() => feather.replace(), 100);
        }
    }
}

// Helper functions for the combined panel
function switchRustTab(tabName) {
    // Update tab buttons
    const tabs = document.querySelectorAll('.rust-tab-btn');
    tabs.forEach(tab => {
        const isActive = tab.dataset.tab === tabName;
        if (isActive) {
            // Active tab: colored background with white text
            tab.classList.add('active');
            tab.style.background = 'var(--accent-blue)';
            tab.style.color = 'white';
            tab.style.border = 'none';
            tab.style.borderBottom = '3px solid var(--accent-blue)';
            tab.style.opacity = '1';
        } else {
            // Inactive tab: white background with normal text
            tab.classList.remove('active');
            tab.style.background = 'white';
            tab.style.color = 'var(--text-primary)';
            tab.style.border = '1px solid var(--border-medium)';
            tab.style.borderBottomColor = 'transparent';
            tab.style.opacity = '1';
        }
    });
    
    // Update tab content
    const contents = document.querySelectorAll('.rust-tab-content');
    contents.forEach(content => {
        if (content.id === `${tabName}-content`) {
            content.style.display = 'block';
            content.classList.add('active');
        } else {
            content.style.display = 'none';
            content.classList.remove('active');
        }
    });
}

// Function to toggle the admin detail panel and README visibility
function toggleAdminDetail() {
    const readmeDiv = document.getElementById('readmeDiv');
    const adminDetailBtn = document.getElementById('admin-detail-btn');
    
    if (!readmeDiv || !adminDetailBtn) return;
    
    const isVisible = readmeDiv.style.display !== 'none';
    
    // Toggle admin detail content
    if (isVisible) {
        readmeDiv.style.display = 'none';
        adminDetailBtn.textContent = 'Admin Details';
        adminDetailBtn.style.background = '';  // Reset to default
        adminDetailBtn.style.color = '';  // Reset to default
        adminDetailBtn.style.borderColor = '';  // Reset to default
    } else {
        readmeDiv.style.display = 'block';
        adminDetailBtn.textContent = 'Hide Details';
        adminDetailBtn.style.background = '#1A1A1A';  // Black background
        adminDetailBtn.style.color = 'white !important';  // Force white text even in dark mode
        adminDetailBtn.style.borderColor = '#1A1A1A';
        
        // Load README content only if not already loaded (check for the loading message)
        const loadingMessage = readmeDiv.querySelector('p');
        if (loadingMessage && loadingMessage.textContent.includes('Loading README.md')) {
            if (typeof displayFile === 'function') {
                displayFile("README.md", "readmeDiv", "_parent", null, false);
            }
        }
    }
}

// Helper function to update a single status indicator
function updateStatusIndicator(indicatorId, textId, isActive, activeText, inactiveText) {
    const indicator = document.getElementById(indicatorId);
    const text = document.getElementById(textId);
    
    if (!indicator || !text) return;
    
    if (isActive) {
        indicator.style.background = 'transparent';
        indicator.style.width = '20px';
        indicator.style.height = '20px';
        indicator.style.borderRadius = '3px';
        indicator.style.display = 'flex';
        indicator.style.alignItems = 'center';
        indicator.style.justifyContent = 'center';
        indicator.style.fontSize = '14px';
        indicator.style.fontWeight = 'bold';
        indicator.innerHTML = '✅';
        indicator.style.color = '#10b981';
        text.textContent = activeText;
        text.style.color = 'var(--accent-green)';
    } else {
        indicator.style.background = 'transparent';
        indicator.style.width = '20px';
        indicator.style.height = '20px';
        indicator.style.borderRadius = '3px';
        indicator.style.display = 'flex';
        indicator.style.alignItems = 'center';
        indicator.style.justifyContent = 'center';
        indicator.style.fontSize = '14px';
        indicator.style.fontWeight = 'bold';
        indicator.innerHTML = '🔴';
        indicator.style.color = '#dc2626';
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
            'MemberCommons database active',
            'MemberCommons database inactive'
        ),
        checkDatabaseConnection(
            'test-exiobase-connection',
            'exiobase-db-indicator',
            'exiobase-db-text',
            'Industry database active',
            'ModelEarth Industry Database inactive'
        ),
        checkDatabaseConnection(
            'test-locations-connection',
            'location-db-indicator',
            'location-db-text',
            'Locations Database active',
            'Locations Database inactive'
        )
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

window.createOSDetectionPanel = createOSDetectionPanel;
window.createRustApiStatusPanel = createRustApiStatusPanel;
window.updateRustApiStatusPanel = updateRustApiStatusPanel;
window.checkBackendStatus = checkBackendStatus;
window.checkDatabaseConnection = checkDatabaseConnection;
window.updateStatusIndicator = updateStatusIndicator;
window.checkIndividualDatabaseStatus = checkIndividualDatabaseStatus;
window.switchRustTab = switchRustTab;
window.toggleAdminDetail = toggleAdminDetail;
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
        closeButtonText: '×',
        expandButtonText: '⛶',
        position: 'top-right', // top-right, top-left, bottom-right, bottom-left
        onClose: null,
        onExpand: null
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
        gap: 4px;
        z-index: 1001;
    `;
    
    // Create close button
    if (config.showCloseButton) {
        const closeButton = document.createElement('button');
        closeButton.className = 'control-button close-button';
        closeButton.innerHTML = config.closeButtonText;
        closeButton.title = 'Close';
        closeButton.style.cssText = `
            background: rgba(0, 0, 0, 0.7);
            color: white;
            border: none;
            width: 24px;
            height: 24px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background-color 0.2s ease;
        `;
        
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
    
    // Create expand button
    if (config.showExpandButton) {
        const expandButton = document.createElement('button');
        expandButton.className = 'control-button expand-button';
        expandButton.innerHTML = config.expandButtonText;
        expandButton.title = 'Expand/Collapse';
        expandButton.style.cssText = `
            background: rgba(0, 0, 0, 0.7);
            color: white;
            border: none;
            width: 24px;
            height: 24px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background-color 0.2s ease;
        `;
        
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