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
      2. Fork the webroot repo<br>
      3. Click the Green Button on <span id="webrootFork">your webroot fork</span> and choose "Open with Github Desktop" to clone the repo.<br>
      4. Choose "To contribute to the parent project" as you clone via Github Desktop.<br>
      5. Start your Command Line Interface (CLI) using the following commands:<br>`;
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
    
    // Update the link
    updateWebrootForkLink();
    
    // Re-initialize after a delay to ensure persistence
    setTimeout(() => {
        if (gitAccountField && localStorage.gitAccount && !gitAccountField.value) {
            gitAccountField.value = localStorage.gitAccount;
        }
        if (myWebrootForkNameField && localStorage.myWebrootForkName && !myWebrootForkNameField.value) {
            myWebrootForkNameField.value = localStorage.myWebrootForkName;
        }
        updateWebrootForkLink();
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