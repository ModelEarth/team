// Member Registration Form JavaScript
// Google Sheets integration with OAuth authentication

const API_BASE = 'http://localhost:8081/api';
let currentUser = null;
let existingMemberData = null;
let sheetsConfig = null;

// Job title suggestions for autocomplete
const jobTitleSuggestions = [
    'Data Scientist / Software Engineer',
    'Full Stack Developer (AI/ML Integration)',
    'Frontend Developer',
    'Backend Developer',
    'Machine Learning Engineer',
    'DevOps Engineer',
    'Product Manager',
    'UX/UI Designer',
    'Software Architect',
    'Data Analyst',
    'Python Developer',
    'JavaScript Developer',
    'React Developer',
    'Node.js Developer',
    'AI Research Scientist',
    'Cybersecurity Specialist',
    'Cloud Engineer',
    'Mobile App Developer',
    'Quality Assurance Engineer',
    'Technical Writer',
    'Solutions Architect',
    'Database Administrator',
    'Site Reliability Engineer',
    'Research Engineer',
    'Business Intelligence Analyst'
];

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    initializeFeatherIcons();
    setupFormEventListeners();
    loadConfiguration();
    setupJobTitleAutocomplete();
    updateProgressIndicator();
});

function initializeFeatherIcons() {
    if (window.feather) {
        feather.replace();
    }
}

async function loadConfiguration() {
    try {
        const response = await fetch(`${API_BASE}/google/sheets/config`);
        if (response.ok) {
            const configData = await response.json();
            if (configData.success && configData.config) {
                sheetsConfig = configData.config;
                applyFormConfiguration(sheetsConfig);
            }
        } else {
            console.warn('Sheets configuration not available, using defaults');
        }
    } catch (error) {
        console.warn('Failed to load configuration:', error);
    }
}

// Apply configuration to form appearance and behavior
function applyFormConfiguration(config) {
    // Apply appearance settings
    if (config.appearance) {
        if (config.appearance.title) {
            const titleElement = document.querySelector('.card-title');
            if (titleElement) {
                titleElement.innerHTML = `<i data-feather="users"></i> ${config.appearance.title}`;
            }
        }
        
        if (config.appearance.subtitle) {
            const subtitleElement = document.querySelector('.card-subtitle');
            if (subtitleElement) {
                subtitleElement.textContent = config.appearance.subtitle;
            }
        }
        
        // Apply custom colors
        if (config.appearance.primaryColor || config.appearance.accentColor) {
            const style = document.createElement('style');
            let css = ':root {\n';
            
            if (config.appearance.primaryColor) {
                css += `  --accent-blue: ${config.appearance.primaryColor};\n`;
            }
            
            if (config.appearance.accentColor) {
                css += `  --accent-green: ${config.appearance.accentColor};\n`;
            }
            
            css += '}';
            style.textContent = css;
            document.head.appendChild(style);
        }
    }
    
    // Apply behavior settings
    if (config.behavior) {
        if (config.behavior.requireGithub === false) {
            const githubField = document.getElementById('github');
            if (githubField) {
                githubField.removeAttribute('required');
                const label = document.querySelector('label[for="github"]');
                if (label) {
                    label.classList.remove('required');
                }
            }
        }
        
        if (config.behavior.showProgress === false) {
            const progressIndicator = document.querySelector('.progress-indicator');
            if (progressIndicator) {
                progressIndicator.style.display = 'none';
            }
        }
        
        if (config.behavior.enablePreview === false) {
            const previewButton = document.querySelector('button[onclick="previewData()"]');
            if (previewButton) {
                previewButton.style.display = 'none';
            }
        }
    }
    
    // Update links in help text
    if (config.links) {
        if (config.links.membersPage) {
            const helpText = document.querySelector('.form-help');
            if (helpText && helpText.textContent.includes('model.earth/community/members')) {
                helpText.innerHTML = helpText.innerHTML.replace(
                    'model.earth/community/members',
                    `<a href="${config.links.membersPage}" target="_blank">${config.links.membersPage}</a>`
                );
            }
        }
        
        if (config.links.projectsPage) {
            const focusField = document.querySelector('label[for="focus"] + textarea');
            if (focusField) {
                focusField.placeholder = focusField.placeholder.replace(
                    'model.earth/projects',
                    config.links.projectsPage
                );
            }
        }
    }
}

// Google OAuth Integration
async function handleCredentialResponse(response) {
    try {
        showStatus('info', 'Authenticating with Google...');
        
        // Verify the credential with our backend
        const authResponse = await fetch(`${API_BASE}/google/auth/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                credential: response.credential
            })
        });

        if (!authResponse.ok) {
            throw new Error('Authentication failed');
        }

        const userData = await authResponse.json();
        currentUser = userData;

        // Update UI to show authenticated state
        showUserInfo(userData);
        showFormSection();
        
        // Try to load existing member data
        await loadExistingMemberData(userData.email);
        
        showStatus('success', `Welcome ${userData.name}! ${existingMemberData ? 'Your existing information has been loaded.' : 'Please fill out the registration form.'}`);
        
    } catch (error) {
        console.error('Authentication error:', error);
        showStatus('error', 'Authentication failed. Please try again.');
    }
}

function showUserInfo(userData) {
    const userInfo = document.getElementById('user-info');
    const userAvatar = document.getElementById('user-avatar');
    const userName = document.getElementById('user-name');
    const userEmail = document.getElementById('user-email');
    
    userAvatar.src = userData.picture || '';
    userName.textContent = userData.name || '';
    userEmail.textContent = userData.email || '';
    
    // Set email in hidden form field
    document.getElementById('email').value = userData.email;
    
    userInfo.style.display = 'flex';
}

function showFormSection() {
    document.querySelector('.auth-required').style.display = 'none';
    document.querySelector('.form-section').classList.add('active');
}

function signOut() {
    currentUser = null;
    existingMemberData = null;
    
    // Reset form
    document.getElementById('registration-form').reset();
    
    // Hide form and show auth
    document.querySelector('.form-section').classList.remove('active');
    document.querySelector('.auth-required').style.display = 'block';
    
    // Clear status
    hideStatus();
    
    // Update progress
    updateProgressIndicator();
}

// Load existing member data from Google Sheets
async function loadExistingMemberData(email) {
    try {
        const response = await fetch(`${API_BASE}/google/sheets/member/${encodeURIComponent(email)}`);
        
        if (response.ok) {
            existingMemberData = await response.json();
            
            if (existingMemberData && existingMemberData.data) {
                populateFormWithExistingData(existingMemberData.data);
                return true;
            }
        }
        
        return false;
    } catch (error) {
        console.error('Error loading existing member data:', error);
        return false;
    }
}

function populateFormWithExistingData(data) {
    // Map sheet columns to form fields
    const fieldMapping = {
        'Name': 'name',
        'Handle': 'handle',
        'Team': 'team',
        'Focus': 'focus',
        'UN Goal': 'un_goals',
        'School and Degree Program': 'school',
        'Date Degree Completed': 'degree_date',
        'OPT University Department': 'opt_department',
        'OPT University Department,Email Phone': 'opt_contact',
        'HoursPerWeek': 'hours_per_week',
        'Your Location': 'location',
        'Status': 'status',
        'Github': 'github',
        'Phone': 'phone',
        'StartDate': 'start_date',
        'EndDate': 'end_date',
        'Your Website': 'website',
        'Job Title': 'job_title',
        'Projects': 'projects',
        'ToDos': 'todos',
        'Note': 'note'
    };

    // Populate form fields
    Object.entries(fieldMapping).forEach(([sheetColumn, formField]) => {
        if (data[sheetColumn]) {
            const element = document.getElementById(formField);
            if (element) {
                if (element.type === 'checkbox' || element.name === 'team' || element.name === 'un_goals') {
                    // Handle checkbox groups
                    handleCheckboxData(formField, data[sheetColumn]);
                } else {
                    element.value = data[sheetColumn];
                }
            }
        }
    });

    updateProgressIndicator();
}

function handleCheckboxData(fieldName, data) {
    const values = data.split(',').map(v => v.trim());
    
    values.forEach(value => {
        const checkbox = document.querySelector(`input[name="${fieldName}"][value="${value}"]`);
        if (checkbox) {
            checkbox.checked = true;
        }
    });
}

// Form event listeners and validation
function setupFormEventListeners() {
    const form = document.getElementById('registration-form');
    
    // Form submission
    form.addEventListener('submit', handleFormSubmission);
    
    // Progress tracking
    const formInputs = form.querySelectorAll('input, select, textarea');
    formInputs.forEach(input => {
        input.addEventListener('input', updateProgressIndicator);
        input.addEventListener('change', updateProgressIndicator);
    });
    
    // Team "Other" checkbox toggle
    const teamOtherCheckbox = document.getElementById('team-other');
    const teamOtherInput = document.getElementById('team-other-input');
    
    teamOtherCheckbox.addEventListener('change', function() {
        if (this.checked) {
            teamOtherInput.style.display = 'block';
        } else {
            teamOtherInput.style.display = 'none';
            document.getElementById('team-other-text').value = '';
        }
    });
    
    // Auto-populate timestamp
    document.getElementById('timestamp').value = new Date().toISOString();
}

function setupJobTitleAutocomplete() {
    const jobTitleInput = document.getElementById('job_title');
    const suggestionsDiv = document.getElementById('job-title-suggestions');
    
    jobTitleInput.addEventListener('input', function() {
        const value = this.value.toLowerCase();
        
        if (value.length < 2) {
            suggestionsDiv.style.display = 'none';
            return;
        }
        
        const matches = jobTitleSuggestions.filter(title => 
            title.toLowerCase().includes(value)
        );
        
        if (matches.length > 0) {
            suggestionsDiv.innerHTML = matches
                .slice(0, 5) // Limit to 5 suggestions
                .map(title => `<div class="suggestion-item" onclick="selectJobTitle('${title}')">${title}</div>`)
                .join('');
            suggestionsDiv.style.display = 'block';
        } else {
            suggestionsDiv.style.display = 'none';
        }
    });
    
    // Hide suggestions when clicking outside
    document.addEventListener('click', function(e) {
        if (!jobTitleInput.contains(e.target) && !suggestionsDiv.contains(e.target)) {
            suggestionsDiv.style.display = 'none';
        }
    });
}

function selectJobTitle(title) {
    document.getElementById('job_title').value = title;
    document.getElementById('job-title-suggestions').style.display = 'none';
    updateProgressIndicator();
}

function updateProgressIndicator() {
    const form = document.getElementById('registration-form');
    const requiredFields = form.querySelectorAll('[required]');
    const allFields = form.querySelectorAll('input:not([type="hidden"]), select, textarea');
    
    let filledRequired = 0;
    let filledTotal = 0;
    
    // Count required fields
    requiredFields.forEach(field => {
        if (field.type === 'checkbox') {
            // For checkbox groups, check if at least one is selected
            const groupName = field.name;
            const checkedInGroup = form.querySelectorAll(`input[name="${groupName}"]:checked`).length;
            if (checkedInGroup > 0) filledRequired++;
        } else if (field.value.trim()) {
            filledRequired++;
        }
    });
    
    // Count all fields
    allFields.forEach(field => {
        if (field.type === 'checkbox') {
            const groupName = field.name;
            const checkedInGroup = form.querySelectorAll(`input[name="${groupName}"]:checked`).length;
            if (checkedInGroup > 0) filledTotal++;
        } else if (field.value.trim()) {
            filledTotal++;
        }
    });
    
    // Calculate progress (based on all fields, not just required)
    const totalFieldGroups = getAllFieldGroups().length;
    const progress = Math.round((filledTotal / totalFieldGroups) * 100);
    
    document.getElementById('progress-fill').style.width = `${progress}%`;
    document.getElementById('progress-text').textContent = `${progress}% complete`;
    
    // Update submit button state
    const submitBtn = document.getElementById('submit-btn');
    const requiredComplete = filledRequired === requiredFields.length;
    
    if (requiredComplete) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i data-feather="save"></i> Save Registration';
    } else {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i data-feather="alert-circle"></i> Complete Required Fields';
    }
    
    initializeFeatherIcons();
}

function getAllFieldGroups() {
    return [
        'name', 'handle', 'team', 'focus', 'un_goals', 'school', 'degree_date',
        'opt_department', 'opt_contact', 'hours_per_week', 'location', 'status',
        'github', 'phone', 'start_date', 'end_date', 'website', 'job_title',
        'projects', 'todos', 'note'
    ];
}

// Form submission
async function handleFormSubmission(event) {
    event.preventDefault();
    
    if (!currentUser) {
        showStatus('error', 'Please sign in with Google first.');
        return;
    }
    
    const submitBtn = document.getElementById('submit-btn');
    const originalText = submitBtn.innerHTML;
    
    try {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="loading-spinner"></span> Saving...';
        
        const formData = collectFormData();
        
        // Submit to Google Sheets
        const response = await fetch(`${API_BASE}/google/sheets/member`, {
            method: existingMemberData ? 'PUT' : 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                data: formData,
                email: currentUser.email,
                updateExisting: !!existingMemberData
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to save registration');
        }
        
        const result = await response.json();
        
        showStatus('success', `Registration ${existingMemberData ? 'updated' : 'saved'} successfully! Your information has been recorded in our member database.`);
        
        // Update existing data reference
        existingMemberData = result.data;
        
    } catch (error) {
        console.error('Form submission error:', error);
        showStatus('error', `Failed to save registration: ${error.message}`);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
        initializeFeatherIcons();
    }
}

function collectFormData() {
    const form = document.getElementById('registration-form');
    const formData = new FormData(form);
    const data = {};
    
    // Handle regular fields
    for (let [key, value] of formData.entries()) {
        if (key !== 'team' && key !== 'un_goals') {
            data[key] = value;
        }
    }
    
    // Handle team checkboxes
    const teamValues = [];
    const teamCheckboxes = form.querySelectorAll('input[name="team"]:checked');
    teamCheckboxes.forEach(checkbox => {
        if (checkbox.value === 'Other') {
            const otherText = document.getElementById('team-other-text').value.trim();
            if (otherText) {
                teamValues.push(otherText);
            }
        } else {
            teamValues.push(checkbox.value);
        }
    });
    data.team = teamValues.join(', ');
    
    // Handle UN Goals checkboxes
    const unGoalValues = [];
    const unGoalCheckboxes = form.querySelectorAll('input[name="un_goals"]:checked');
    unGoalCheckboxes.forEach(checkbox => {
        unGoalValues.push(checkbox.value);
    });
    data.un_goals = unGoalValues.join(', ');
    
    // Add timestamp
    data.timestamp = new Date().toISOString();
    
    return data;
}

// Preview functionality
function previewData() {
    const data = collectFormData();
    const previewWindow = window.open('', '_blank', 'width=600,height=800,scrollbars=yes');
    
    const previewHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Registration Preview</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; }
                .header { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
                .field { margin-bottom: 15px; }
                .label { font-weight: bold; color: #333; }
                .value { margin-top: 5px; padding: 8px; background: #f9f9f9; border-radius: 3px; }
                .empty { color: #999; font-style: italic; }
            </style>
        </head>
        <body>
            <div class="header">
                <h2>Member Registration Preview</h2>
                <p>Review your information before submitting</p>
            </div>
            
            ${Object.entries(data).map(([key, value]) => `
                <div class="field">
                    <div class="label">${formatFieldLabel(key)}</div>
                    <div class="value ${!value ? 'empty' : ''}">${value || '(Not provided)'}</div>
                </div>
            `).join('')}
            
            <button onclick="window.close()" style="margin-top: 20px; padding: 10px 20px; background: #007cba; color: white; border: none; border-radius: 5px; cursor: pointer;">Close Preview</button>
        </body>
        </html>
    `;
    
    previewWindow.document.write(previewHTML);
    previewWindow.document.close();
}

function formatFieldLabel(key) {
    const labelMap = {
        'name': 'Name',
        'handle': 'Handle',
        'team': 'Team',
        'focus': 'Focus',
        'un_goals': 'UN Goals',
        'school': 'School and Degree Program',
        'degree_date': 'Date Degree Completed',
        'opt_department': 'OPT University Department',
        'opt_contact': 'OPT Department Contact',
        'hours_per_week': 'Hours Per Week',
        'location': 'Location',
        'status': 'Status',
        'github': 'GitHub Username',
        'phone': 'Phone',
        'start_date': 'Start Date',
        'end_date': 'End Date',
        'website': 'Website',
        'job_title': 'Job Title',
        'email': 'Email',
        'projects': 'Projects',
        'todos': 'ToDos',
        'note': 'Note',
        'timestamp': 'Timestamp'
    };
    
    return labelMap[key] || key.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// Status message utilities
function showStatus(type, message) {
    const statusDiv = document.getElementById('form-status') || document.getElementById('auth-status');
    statusDiv.className = `status-message ${type}`;
    statusDiv.innerHTML = message;
    statusDiv.style.display = 'block';
    
    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
        setTimeout(() => hideStatus(), 5000);
    }
}

function hideStatus() {
    const statusDivs = document.querySelectorAll('.status-message');
    statusDivs.forEach(div => {
        div.style.display = 'none';
    });
}

// Initialize Google Sign-In with dynamic client ID
function initializeGoogleAuth() {
    if (typeof google !== 'undefined' && google.accounts && sheetsConfig && sheetsConfig.oauth) {
        google.accounts.id.initialize({
            client_id: sheetsConfig.oauth.clientId,
            callback: handleCredentialResponse
        });
        
        // Update the data-client_id attribute on the sign-in element
        const gSignInElement = document.getElementById('g_id_onload');
        if (gSignInElement) {
            gSignInElement.setAttribute('data-client_id', sheetsConfig.oauth.clientId);
        }
    }
}

// Initialize Google Sign-In after configuration is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Load configuration first, then initialize auth
    loadConfiguration().then(() => {
        initializeGoogleAuth();
    });
});