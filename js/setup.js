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
    return `
      <h1>Webroot setup</h1>
      1. Install <a href="https://github.com/apps/desktop" target="github_desktop">Github Desktop</a><br>
      2. <a href="https://github.com/modelearth/webroot/" target="github_webroot">Fork the webroot repo</a><br>
      3. Click the Green Button on <span id="webrootFork">your webroot fork</span> and choose "Open with Github Desktop" to clone the repo.<br>
      4. Choose "To contribute to the parent project" as you clone via Github Desktop.<br>
      5. Start your Command Line Interface (CLI) using the following commands:<br>`;
}

// HTML content for the trade flow repos section
function createTradeFlowReposHTML() {
    return `
        <h2>Get Trade Flow Repos</h2>
        
        <p>To contribute to our trade flow visualizations, run the following to fork and clone:<br>
        <a href="https://github.com/ModelEarth/exiobase/tree/main/tradeflow">exiobase</a>, profile, useeio.js and io</p>
        
        <pre><code id="forkReposCmds">using claude.md
fork trade repos to [your github account]
clone trade repos from [your github account]
</code></pre>

        <p>The above requires having GitHub CLI (gh) installed locally and authenticated with your GitHub account.</p>
        
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

// Auto-initialize on DOM load for compatibility with existing code
document.addEventListener('DOMContentLoaded', function() {
    // Initialize immediately if elements exist
    initializeGitFields();
    
    // Also initialize after waitForElm to ensure they're loaded
    if (typeof waitForElm === 'function') {
        waitForElm('#gitAccount').then((elm) => {
            initializeGitFields();
        });
    }
});