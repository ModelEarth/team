// Projects Module - Handles all project-related functionality
class ProjectsManager {
    constructor() {
        this.projects = [];
        this.activities = [];
        this.opportunities = [];
        this.currentFilter = 'all';
        this.searchQuery = '';
        this.isUsingPlaceholderData = false;
    }

    // Initialize projects section
    init() {
        this.loadProjects();
        this.setupEventListeners();
        this.setupGeminiIntegration();
    }

    // Setup event listeners for project interactions
    setupEventListeners() {
        // Post Activity Form
        document.addEventListener('click', (e) => {
            if (e.target.matches('[data-action="post-activity"]')) {
                this.showActivityForm();
            }
            if (e.target.matches('[data-action="join-project"]')) {
                this.joinProject(e.target.dataset.projectId);
            }
            if (e.target.matches('[data-action="apply-job"]')) {
                this.applyToJob(e.target.dataset.activityId);
            }
            if (e.target.matches('[data-action="view-project"]')) {
                this.viewProjectDetails(e.target.dataset.projectId);
            }
        });

        // Search functionality - using event delegation since input is created dynamically
        document.addEventListener('input', (e) => {
            if (e.target.matches('#project-search')) {
                this.searchQuery = e.target.value;
                this.filterProjects();
            }
        });

        // Filter functionality
        document.addEventListener('change', (e) => {
            if (e.target.matches('[name="project-filter"]')) {
                this.currentFilter = e.target.value;
                this.filterProjects();
            }
        });
    }

    // Flatten nested JSON structures and extract all fields
    flattenObject(obj, prefix = '') {
        const flattened = {};
        
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const value = obj[key];
                const newKey = prefix ? `${prefix}.${key}` : key;
                
                if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                    // Recursively flatten nested objects
                    Object.assign(flattened, this.flattenObject(value, newKey));
                } else {
                    // Keep the value as is
                    flattened[newKey] = value;
                }
            }
        }
        
        return flattened;
    }
    
    // Find project_description in nested structures
    findProjectDescription(project) {
        const flattened = this.flattenObject(project);
        
        // Look for project_description in various locations
        const candidates = [
            'project_description',
            'projectDescription', 
            'description.project',
            'project.description',
            'data.project_description',
            'content.project_description',
            'details.project_description'
        ];
        
        for (const candidate of candidates) {
            if (flattened[candidate] !== undefined && flattened[candidate] !== null && flattened[candidate] !== '') {
                return flattened[candidate];
            }
        }
        
        // Also check direct nested access
        if (project.project_description) return project.project_description;
        if (project.projectDescription) return project.projectDescription;
        if (project.description && project.description.project) return project.description.project;
        if (project.project && project.project.description) return project.project.description;
        if (project.data && project.data.project_description) return project.data.project_description;
        if (project.content && project.content.project_description) return project.content.project_description;
        if (project.details && project.details.project_description) return project.details.project_description;
        
        return null;
    }

    // Detect and return common prefix from all column names
    detectCommonPrefix(columns) {
        if (columns.length === 0) return '';
        
        // Find the shortest column name to limit prefix length
        const minLength = Math.min(...columns.map(col => col.length));
        if (minLength === 0) return '';
        
        let commonPrefix = '';
        
        // Check each character position
        for (let i = 0; i < minLength; i++) {
            const char = columns[0][i];
            
            // Check if all columns have the same character at this position
            const allMatch = columns.every(col => col[i] === char);
            
            if (allMatch) {
                commonPrefix += char;
            } else {
                break;
            }
        }
        
        // Only return prefix if it ends with an underscore or is substantial
        // and all columns would still have meaningful names after removal
        if (commonPrefix.length > 2 && 
            (commonPrefix.endsWith('_') || commonPrefix.length >= 4)) {
            
            // Verify all columns would have meaningful names after prefix removal
            const wouldBeValid = columns.every(col => {
                const remaining = col.substring(commonPrefix.length);
                return remaining.length > 0 && remaining !== '_';
            });
            
            if (wouldBeValid) {
                return commonPrefix;
            }
        }
        
        return '';
    }

    // Preprocess API data to normalize column names and ordering
    preprocessProjectData(projects) {
        if (!Array.isArray(projects)) {
            return projects;
        }
        
        return projects.map(project => {
            // Create a new object to maintain original data
            const processed = {};
            
            // Step 1: Flatten nested structures to get all available fields
            const flatProject = this.flattenObject(project);
            
            // Step 2: Detect and remove common prefix from all columns
            const allColumns = Object.keys(flatProject);
            const commonPrefix = this.detectCommonPrefix(allColumns);
            
            // Create a mapping of original to cleaned column names
            const columnMapping = {};
            allColumns.forEach(col => {
                let cleanedName = col;
                if (commonPrefix && col.startsWith(commonPrefix)) {
                    cleanedName = col.substring(commonPrefix.length);
                    // Ensure the cleaned name doesn't start with underscore
                    if (cleanedName.startsWith('_')) {
                        cleanedName = cleanedName.substring(1);
                    }
                }
                columnMapping[col] = cleanedName;
            });
            
            // Step 3: Identify ID columns and add them first (using cleaned names)
            const idColumns = [];
            const otherColumns = [];
            
            Object.entries(columnMapping).forEach(([originalKey, cleanedKey]) => {
                if (cleanedKey === 'id' || cleanedKey.endsWith('_id') || cleanedKey.endsWith('ID') || cleanedKey === 'ID') {
                    idColumns.push({ original: originalKey, cleaned: cleanedKey });
                } else {
                    otherColumns.push({ original: originalKey, cleaned: cleanedKey });
                }
            });
            
            // Sort ID columns (id first, then others alphabetically)
            idColumns.sort((a, b) => {
                if (a.cleaned === 'id') return -1;
                if (b.cleaned === 'id') return 1;
                return a.cleaned.localeCompare(b.cleaned);
            });
            
            // Step 4: Add ID columns first
            idColumns.forEach(({ original, cleaned }) => {
                processed[cleaned] = flatProject[original];
            });
            
            // Step 5: Handle title column creation and positioning
            let titleValue = null;
            let titleColumnAdded = false;
            
            // First check for existing title (in cleaned names)
            const titleColumn = otherColumns.find(({ cleaned }) => cleaned === 'title');
            if (titleColumn && flatProject[titleColumn.original] !== undefined && 
                flatProject[titleColumn.original] !== null && flatProject[titleColumn.original] !== '') {
                titleValue = flatProject[titleColumn.original];
                processed.title = titleValue;
                titleColumnAdded = true;
                // Remove from otherColumns to avoid duplication
                const index = otherColumns.indexOf(titleColumn);
                if (index > -1) {
                    otherColumns.splice(index, 1);
                }
            } else {
                // Look for project_description in nested structures (original project object)
                titleValue = this.findProjectDescription(project);
                if (titleValue !== null) {
                    processed.title = titleValue;
                    titleColumnAdded = true;
                }
            }
            
            // Step 6: Remove all project_description variants from otherColumns
            const projectDescriptionKeys = otherColumns.filter(({ cleaned, original }) => 
                cleaned === 'project_description' ||
                cleaned === 'projectDescription' ||
                cleaned === 'description' ||
                cleaned.includes('project_description') ||
                cleaned.includes('projectDescription') ||
                original === 'project_description' ||
                original === 'projectDescription'
            );
            
            projectDescriptionKeys.forEach(item => {
                const index = otherColumns.indexOf(item);
                if (index > -1) {
                    otherColumns.splice(index, 1);
                }
            });
            
            // Step 7: Add remaining columns with cleaned names
            otherColumns.forEach(({ original, cleaned }) => {
                processed[cleaned] = flatProject[original];
            });
            
            return processed;
        });
    }

    // Flatten nested JSON structures and extract all fields
    flattenObject(obj, prefix = '') {
        const flattened = {};
        
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const value = obj[key];
                const newKey = prefix ? `${prefix}.${key}` : key;
                
                if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                    // Recursively flatten nested objects
                    Object.assign(flattened, this.flattenObject(value, newKey));
                } else {
                    // Keep the value as is
                    flattened[newKey] = value;
                }
            }
        }
        
        return flattened;
    }
    
    // Find project_description in nested structures
    findProjectDescription(project) {
        const flattened = this.flattenObject(project);
        
        // Look for project_description in various locations
        const candidates = [
            'project_description',
            'projectDescription', 
            'description.project',
            'project.description',
            'data.project_description',
            'content.project_description',
            'details.project_description'
        ];
        
        for (const candidate of candidates) {
            if (flattened[candidate] !== undefined && flattened[candidate] !== null && flattened[candidate] !== '') {
                return flattened[candidate];
            }
        }
        
        // Also check direct nested access
        if (project.project_description) return project.project_description;
        if (project.projectDescription) return project.projectDescription;
        if (project.description && project.description.project) return project.description.project;
        if (project.project && project.project.description) return project.project.description;
        if (project.data && project.data.project_description) return project.data.project_description;
        if (project.content && project.content.project_description) return project.content.project_description;
        if (project.details && project.details.project_description) return project.details.project_description;
        
        return null;
    }

    // Detect and return common prefix from all column names
    detectCommonPrefix(columns) {
        if (columns.length === 0) return '';
        
        // Find the shortest column name to limit prefix length
        const minLength = Math.min(...columns.map(col => col.length));
        if (minLength === 0) return '';
        
        let commonPrefix = '';
        
        // Check each character position
        for (let i = 0; i < minLength; i++) {
            const char = columns[0][i];
            
            // Check if all columns have the same character at this position
            const allMatch = columns.every(col => col[i] === char);
            
            if (allMatch) {
                commonPrefix += char;
            } else {
                break;
            }
        }
        
        // Only return prefix if it ends with an underscore or is substantial
        // and all columns would still have meaningful names after removal
        if (commonPrefix.length > 2 && 
            (commonPrefix.endsWith('_') || commonPrefix.length >= 4)) {
            
            // Verify all columns would have meaningful names after prefix removal
            const wouldBeValid = columns.every(col => {
                const remaining = col.substring(commonPrefix.length);
                return remaining.length > 0 && remaining !== '_';
            });
            
            if (wouldBeValid) {
                return commonPrefix;
            }
        }
        
        return '';
    }

    // Preprocess API data to normalize column names and ordering
    preprocessProjectData(projects) {
        if (!Array.isArray(projects)) {
            return projects;
        }
        
        return projects.map(project => {
            // Create a new object to maintain original data
            const processed = {};
            
            // Step 1: Flatten nested structures to get all available fields
            const flatProject = this.flattenObject(project);
            
            // Step 2: Detect and remove common prefix from all columns
            const allColumns = Object.keys(flatProject);
            const commonPrefix = this.detectCommonPrefix(allColumns);
            
            // Create a mapping of original to cleaned column names
            const columnMapping = {};
            allColumns.forEach(col => {
                let cleanedName = col;
                if (commonPrefix && col.startsWith(commonPrefix)) {
                    cleanedName = col.substring(commonPrefix.length);
                    // Ensure the cleaned name doesn't start with underscore
                    if (cleanedName.startsWith('_')) {
                        cleanedName = cleanedName.substring(1);
                    }
                }
                columnMapping[col] = cleanedName;
            });
            
            // Step 3: Identify ID columns and add them first (using cleaned names)
            const idColumns = [];
            const otherColumns = [];
            
            Object.entries(columnMapping).forEach(([originalKey, cleanedKey]) => {
                if (cleanedKey === 'id' || cleanedKey.endsWith('_id') || cleanedKey.endsWith('ID') || cleanedKey === 'ID') {
                    idColumns.push({ original: originalKey, cleaned: cleanedKey });
                } else {
                    otherColumns.push({ original: originalKey, cleaned: cleanedKey });
                }
            });
            
            // Sort ID columns (id first, then others alphabetically)
            idColumns.sort((a, b) => {
                if (a.cleaned === 'id') return -1;
                if (b.cleaned === 'id') return 1;
                return a.cleaned.localeCompare(b.cleaned);
            });
            
            // Step 4: Add ID columns first
            idColumns.forEach(({ original, cleaned }) => {
                processed[cleaned] = flatProject[original];
            });
            
            // Step 5: Handle title column creation and positioning
            let titleValue = null;
            let titleColumnAdded = false;
            
            // First check for existing title (in cleaned names)
            const titleColumn = otherColumns.find(({ cleaned }) => cleaned === 'title');
            if (titleColumn && flatProject[titleColumn.original] !== undefined && 
                flatProject[titleColumn.original] !== null && flatProject[titleColumn.original] !== '') {
                titleValue = flatProject[titleColumn.original];
                processed.title = titleValue;
                titleColumnAdded = true;
                // Remove from otherColumns to avoid duplication
                const index = otherColumns.indexOf(titleColumn);
                if (index > -1) {
                    otherColumns.splice(index, 1);
                }
            } else {
                // Look for project_description in nested structures (original project object)
                titleValue = this.findProjectDescription(project);
                if (titleValue !== null) {
                    processed.title = titleValue;
                    titleColumnAdded = true;
                }
            }
            
            // Step 6: Remove all project_description variants from otherColumns
            const projectDescriptionKeys = otherColumns.filter(({ cleaned, original }) => 
                cleaned === 'project_description' ||
                cleaned === 'projectDescription' ||
                cleaned === 'description' ||
                cleaned.includes('project_description') ||
                cleaned.includes('projectDescription') ||
                original === 'project_description' ||
                original === 'projectDescription'
            );
            
            projectDescriptionKeys.forEach(item => {
                const index = otherColumns.indexOf(item);
                if (index > -1) {
                    otherColumns.splice(index, 1);
                }
            });
            
            // Step 7: Add remaining columns with cleaned names
            otherColumns.forEach(({ original, cleaned }) => {
                processed[cleaned] = flatProject[original];
            });
            
            return processed;
        });
    }

    // Load projects from API or show placeholders
    async loadProjects() {
        try {
            const response = await apiCall('/projects');
            if (response.error) {
                this.loadPlaceholderData();
            } else {
                // Preprocess the data to normalize column names and ordering
                this.projects = this.preprocessProjectData(response.data);
                this.isUsingPlaceholderData = false;
                this.renderProjects();
            }
        } catch (error) {
            console.log('Loading placeholder project data');
            this.loadPlaceholderData();
        }
    }

    // Load opportunities (alias for loadProjects for compatibility)
    async loadOpportunities() {
        return this.loadProjects();
    }

    // Load placeholder data for demo purposes
    loadPlaceholderData() {
        this.isUsingPlaceholderData = true;
        this.projects = [
            {
                id: '1',
                name: 'AI-Powered Economic Development Dashboard',
                description: 'Build a real-time dashboard for local and state services using modern web technologies. Help government streamline citizen services with transparency and open tech.',
                status: 'active',
                type: 'opportunity',
                skills: ['React', 'Node.js', 'PostgreSQL', 'AI/ML'],
                funding: 'Innovation Bond',
                location: 'Atlanta, GA',
                team_size: 6,
                created_by: 'City Innovation Office',
                created_date: '2025-01-15',
                deadline: '2025-11-30',
                priority: 'high',
                activities: [
                    {
                        id: 'a1',
                        name: 'Frontend Development Lead',
                        type: 'job_opening',
                        description: 'Lead the frontend development using React and modern JavaScript frameworks.',
                        skills: ['React', 'TypeScript', 'CSS'],
                        status: 'open',
                        deadline: '2025-02-15'
                    },
                    {
                        id: 'a2',
                        name: 'Database Architecture',
                        type: 'task',
                        description: 'Design and implement PostgreSQL database schema for local and state services data.',
                        skills: ['PostgreSQL', 'Database Design'],
                        status: 'in_progress',
                        assigned_to: 'Sarah Johnson'
                    }
                ]
            },
            {
                id: '2',
                name: 'Community Resource Mapping Platform',
                description: 'Create an interactive platform to help residents find local resources, services, and volunteer opportunities in their neighborhoods.',
                status: 'active',
                type: 'opportunity',
                skills: ['Vue.js', 'Python', 'GIS', 'API Integration'],
                funding: 'Community Grant',
                location: 'Portland, OR',
                team_size: 4,
                created_by: 'Neighborhood Alliance',
                created_date: '2025-01-10',
                deadline: '2025-12-15',
                priority: 'medium',
                activities: [
                    {
                        id: 'a3',
                        name: 'GIS Data Integration',
                        type: 'task',
                        description: 'Integrate mapping services and location data for community resources.',
                        skills: ['GIS', 'JavaScript', 'APIs'],
                        status: 'open',
                        deadline: '2025-11-01'
                    }
                ]
            },
            {
                id: '3',
                name: 'Digital Literacy Training Program',
                description: 'Develop an online platform to provide digital literacy training for seniors and underserved communities.',
                status: 'planning',
                type: 'opportunity',
                skills: ['Educational Technology', 'UX Design', 'Content Creation'],
                funding: 'Innovation Bond',
                location: 'Detroit, MI',
                team_size: 8,
                created_by: 'Digital Inclusion Coalition',
                created_date: '2025-01-20',
                deadline: '2025-07-30',
                priority: 'high',
                activities: [
                    {
                        id: 'a4',
                        name: 'UX Designer',
                        type: 'job_opening',
                        description: 'Design user-friendly interfaces for learners of all technical backgrounds.',
                        skills: ['UX Design', 'Accessibility', 'User Research'],
                        status: 'open',
                        deadline: '2025-10-28'
                    }
                ]
            }
        ];
        this.renderProjects();
    }

    // Render projects in the UI
    renderProjects() {
        const container = document.getElementById('opportunities-content');
        if (!container) return;

        // Store current search input focus and cursor position
        const searchInput = document.getElementById('project-search');
        const wasFocused = searchInput && document.activeElement === searchInput;
        const cursorPosition = searchInput ? searchInput.selectionStart : 0;

        const filteredProjects = this.getFilteredProjects();
        
        container.innerHTML = `
            <!--
            <div style="position:relative">
            <img src="${window.fixRelativePath ? window.fixRelativePath('img/presenting-bolt-4gov.png') : 'img/presenting-bolt-4gov.png'}" style="width:100%;border-top-left-radius:25px;border-top-right-radius:25px;"><br><br></div>
            -->
            <div class="projects-header">
                
                <div class="projects-title-section" style="clear:both">
                    <h2 class="section-title">Project Opportunities</h2>
                    <p><a href="../projects/">Model.Earth Projects</a></p>
                    <p><a href="projects/#list=modelteam">Model.Earth Team</a></p>
                </div>
                
                <div class="projects-actions">
                    <button class="btn btn-primary" data-action="post-activity">
                        <i data-feather="plus"></i>
                        Post New Activity
                    </button>
                </div>
            </div>

            <div class="projects-filters">
                <div class="filter-group">
                    <input type="text" id="project-search" class="search-input" placeholder="Search projects using natural language..." value="${this.searchQuery}">
                </div>
                
                <div class="filter-group">
                    <label class="filter-label">Filter by:</label>
                    <select name="project-filter" class="filter-select">
                        <option value="all" ${this.currentFilter === 'all' ? 'selected' : ''}>All Projects</option>
                        <option value="opportunities" ${this.currentFilter === 'opportunities' ? 'selected' : ''}>Open Opportunities</option>
                        <option value="job_openings" ${this.currentFilter === 'job_openings' ? 'selected' : ''}>Job Openings</option>
                        <option value="innovation_bonds" ${this.currentFilter === 'innovation_bonds' ? 'selected' : ''}>Innovation Bond Projects</option>
                        <option value="high_priority" ${this.currentFilter === 'high_priority' ? 'selected' : ''}>High Priority</option>
                    </select>
                </div>
            </div>

            ${this.isUsingPlaceholderData ? `
                <div class="placeholder-message" style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 12px 16px; margin: 16px 0; color: #92400e;">
                    <strong>ℹ️ Demo Mode:</strong> Showing sample projects. Database connection unavailable - projects will load automatically locally when you've <a href="admin/server/" style="white-space:nowrap">Configured your Server</a>.
                </div>
            ` : ''}

            <div class="projects-grid">
                ${filteredProjects.map(project => this.renderProjectCard(project)).join('')}
            </div>

            ${filteredProjects.length === 0 ? `
                <div class="empty-state">
                    <div class="empty-icon">
                        <i data-feather="folder"></i>
                    </div>
                    <h3>No projects found</h3>
                    <p>Try adjusting your search criteria or post a new project opportunity.</p>
                </div>
            ` : ''}
        `;

        // Re-initialize Feather icons
         if (window.initializeFeatherIcons) {
            window.initializeFeatherIcons();
        }

        // Restore search input focus and cursor position if it was focused before
        if (wasFocused) {
            const newSearchInput = document.getElementById('project-search');
            if (newSearchInput) {
                newSearchInput.focus();
                newSearchInput.setSelectionRange(cursorPosition, cursorPosition);
            }
        }
    }

    // Get recognized fields from project data (adapted for database structure)
    getRecognizedFields(project) {
        const recognized = {};
        
        // Title field - database projects have name field
        recognized.title = project.name || project.title || 'Untitled Project';
        
        // Description field - database projects have description field
        recognized.description = project.description || 'No description available';
        
        // Database fields that exist
        recognized.id = project.id;
        recognized.status = project.status || 'unknown';
        recognized.created_date = project.created_date;
        recognized.modified_date = project.modified_date;
        
        // Fields that don't exist in database - provide defaults
        recognized.location = 'Location TBD';
        recognized.funding = 'Funding TBD';
        recognized.team_size = 0;
        recognized.priority = 'medium';
        recognized.skills = [];
        recognized.activities = [];
        recognized.created_by = 'System';
        recognized.deadline = null;
        
        // Try to extract some info from description for better display
        const desc = (project.description || '').toLowerCase();
        
        // Infer location if mentioned in description
        if (desc.includes('atlanta')) recognized.location = 'Atlanta, GA';
        else if (desc.includes('portland')) recognized.location = 'Portland, OR';
        else if (desc.includes('detroit')) recognized.location = 'Detroit, MI';
        else if (desc.includes('remote')) recognized.location = 'Remote';
        
        // Infer priority from keywords in name/description
        const text = ((project.name || '') + ' ' + desc).toLowerCase();
        if (text.includes('urgent') || text.includes('critical') || text.includes('priority')) {
            recognized.priority = 'high';
        }
        
        // Extract potential skills from description
        const skillKeywords = ['react', 'node', 'python', 'javascript', 'typescript', 'postgres', 
                              'sql', 'api', 'frontend', 'backend', 'fullstack', 'web', 'mobile'];
        recognized.skills = skillKeywords.filter(skill => desc.includes(skill))
                                        .map(skill => skill.charAt(0).toUpperCase() + skill.slice(1));
        
        return recognized;
    }

    // Render individual project card
    renderProjectCard(project) {
        // Use recognized fields for consistent display
        const recognized = this.getRecognizedFields(project);
        
        const hasJobOpenings = project.activities && project.activities.some(activity => activity.type === 'job_opening' && activity.status === 'open');
        const openActivities = project.activities ? project.activities.filter(activity => activity.status === 'open') : [];
        
        return `
            <div class="project-card ${recognized.priority}" data-project-id="${recognized.id}">
                <div class="project-header">
                    <div class="project-title-section">
                        <h3 class="project-title">${recognized.title || 'Untitled Project'}</h3>
                        <div class="project-meta">
                            <span class="project-location">
                                <i data-feather="map-pin"></i>
                                ${recognized.location || 'Location TBD'}
                            </span>
                            <span class="project-funding">
                                <i data-feather="dollar-sign"></i>
                                ${recognized.funding || 'Funding TBD'}
                            </span>
                            <span class="project-team">
                                <i data-feather="users"></i>
                                ${recognized.team_size || 0} members
                            </span>
                        </div>
                    </div>
                    
                    <div class="project-status">
                        <span class="status-badge status-${recognized.status || 'unknown'}">${(recognized.status || 'unknown').replace('_', ' ')}</span>
                        ${recognized.priority === 'high' ? '<span class="priority-badge">High Priority</span>' : ''}
                    </div>
                </div>

                <div class="project-description">
                    <p>${recognized.description || 'No description available'}</p>
                </div>

                <div class="project-skills">
                    ${(recognized.skills || []).map(skill => `<span class="skill-tag">${skill}</span>`).join('')}
                </div>

                ${(recognized.activities || []).length > 0 ? `
                    <div class="project-activities">
                        <h4 class="activities-title">Open Activities</h4>
                        ${openActivities.slice(0, 2).map(activity => `
                            <div class="activity-item">
                                <div class="activity-info">
                                    <h5 class="activity-name">${activity.name || 'Unnamed Activity'}</h5>
                                    <p class="activity-description">${activity.description || 'No description'}</p>
                                    <div class="activity-skills">
                                        ${(activity.skills || []).map(skill => `<span class="skill-tag small">${skill}</span>`).join('')}
                                    </div>
                                </div>
                                <div class="activity-actions">
                                    ${activity.type === 'job_opening' ? 
                                        `<button class="btn btn-primary small" data-action="apply-job" data-activity-id="${activity.id}">Apply</button>` :
                                        `<button class="btn btn-secondary small" data-action="join-activity" data-activity-id="${activity.id}">Join</button>`
                                    }
                                </div>
                            </div>
                        `).join('')}
                        
                        ${openActivities.length > 2 ? `
                            <button class="btn btn-link" data-action="view-project" data-project-id="${project.id}">
                                View ${openActivities.length - 2} more activities
                            </button>
                        ` : ''}
                    </div>
                ` : ''}

                <div class="project-footer">
                    <div class="project-dates">
                        <span class="created-date">Created ${this.formatDate(recognized.created_date || new Date().toISOString())}</span>
                        <span class="deadline">Deadline: ${this.formatDate(recognized.deadline || 'TBD')}</span>
                    </div>
                    
                    <div class="project-actions">
                        <button class="btn btn-secondary" data-action="view-project" data-project-id="${recognized.id}">
                            View Details
                        </button>
                        <button class="btn btn-primary" data-action="join-project" data-project-id="${recognized.id}">
                            Join Project
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    // Get filtered projects based on current filter and search
    getFilteredProjects() {
        let filtered = [...this.projects];

        // Apply search filter
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            filtered = filtered.filter(project => 
                (project.name || '').toLowerCase().includes(query) ||
                (project.description || '').toLowerCase().includes(query) ||
                (project.id || '').toLowerCase().includes(query) ||
                (project.status || '').toLowerCase().includes(query)
            );
        }

        // Apply category filter - adapted for database project structure
        switch (this.currentFilter) {
            case 'opportunities':
                // Filter for active projects (matching API status field)
                filtered = filtered.filter(p => (p.status || '').toLowerCase() === 'active');
                break;
            case 'job_openings':
                // Filter projects that might be hiring (contains keywords in description)
                filtered = filtered.filter(p => {
                    const text = ((p.name || '') + ' ' + (p.description || '')).toLowerCase();
                    return text.includes('hiring') || text.includes('job') || 
                           text.includes('position') || text.includes('developer') ||
                           text.includes('programmer') || text.includes('coder') ||
                           text.includes('career') || text.includes('employment');
                });
                break;
            case 'innovation_bonds':
                // Filter projects related to innovation or funding
                filtered = filtered.filter(p => {
                    const text = ((p.name || '') + ' ' + (p.description || '')).toLowerCase();
                    return text.includes('innovation') || text.includes('bond') || 
                           text.includes('funding') || text.includes('grant') ||
                           text.includes('financial') || text.includes('investment');
                });
                break;
            case 'high_priority':
                // Filter projects that might be high priority (recent or contains urgency keywords)
                filtered = filtered.filter(p => {
                    const text = ((p.name || '') + ' ' + (p.description || '')).toLowerCase();
                    const isRecent = p.created_date && 
                        new Date(p.created_date) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days
                    return isRecent || text.includes('urgent') || text.includes('priority') || 
                           text.includes('critical') || text.includes('important');
                });
                break;
        }

        // Sort projects - prioritize search relevance if searching, otherwise by creation date
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            filtered.sort((a, b) => {
                // Prioritize name matches over description matches
                const aNameMatch = (a.name || '').toLowerCase().includes(query);
                const bNameMatch = (b.name || '').toLowerCase().includes(query);
                
                if (aNameMatch && !bNameMatch) return -1;
                if (!aNameMatch && bNameMatch) return 1;
                
                // If both match name or both match description, sort by creation date
                const dateA = new Date(a.created_date || 0);
                const dateB = new Date(b.created_date || 0);
                return dateB - dateA;
            });
        } else {
            // Sort by creation date (newest first) for consistent ordering
            filtered.sort((a, b) => {
                const dateA = new Date(a.created_date || 0);
                const dateB = new Date(b.created_date || 0);
                return dateB - dateA;
            });
        }

        return filtered;
    }

    // Show activity posting form
    showActivityForm() {
        const modal = this.createActivityModal();
        document.body.appendChild(modal);
        modal.classList.add('show');
    }

    // Create activity posting modal
    createActivityModal() {
        const modal = document.createElement('div');
        modal.className = 'modal activity-modal';
        modal.innerHTML = `
            <div class="modal-content large">
                <div class="modal-header">
                    <h2 class="modal-title">Post New Activity</h2>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">
                        <i data-feather="x"></i>
                    </button>
                </div>
                
                <form id="activity-form" class="activity-form">
                    <div class="form-grid">
                        <div class="form-group">
                            <label class="form-label">Activity Type</label>
                            <select name="type" class="form-input" required>
                                <option value="">Select type...</option>
                                <option value="task">Task/Assignment</option>
                                <option value="job_opening">Job Opening</option>
                                <option value="volunteer">Volunteer Opportunity</option>
                                <option value="collaboration">Collaboration Request</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Priority Level</label>
                            <select name="priority" class="form-input" required>
                                <option value="low">Low</option>
                                <option value="medium" selected>Medium</option>
                                <option value="high">High</option>
                                <option value="urgent">Urgent</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Activity Title</label>
                        <input type="text" name="title" class="form-input" required 
                               placeholder="e.g., Frontend Developer for City Dashboard">
                    </div>

                    <div class="form-group">
                        <label class="form-label">Description</label>
                        <textarea name="description" class="form-input" rows="4" required
                                  placeholder="Describe the activity, requirements, and expected outcomes..."></textarea>
                    </div>

                    <div class="form-grid">
                        <div class="form-group">
                            <label class="form-label">Required Skills</label>
                            <input type="text" name="skills" class="form-input" 
                                   placeholder="e.g., React, Node.js, PostgreSQL (comma-separated)">
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Location</label>
                            <input type="text" name="location" class="form-input" 
                                   placeholder="e.g., Atlanta, GA or Remote">
                        </div>
                    </div>

                    <div class="form-grid">
                        <div class="form-group">
                            <label class="form-label">Start Date</label>
                            <input type="date" name="start_date" class="form-input">
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Deadline</label>
                            <input type="date" name="deadline" class="form-input">
                        </div>
                    </div>

                    <div class="form-group" id="compensation-group" style="display: none;">
                        <label class="form-label">Compensation/Budget</label>
                        <input type="text" name="compensation" class="form-input" 
                               placeholder="e.g., $5000, Volunteer, Innovation Bond Funding">
                    </div>

                    <div class="form-group">
                        <label class="form-label">Additional Requirements</label>
                        <textarea name="requirements" class="form-input" rows="3"
                                  placeholder="Any specific requirements, qualifications, or preferences..."></textarea>
                    </div>

                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">
                            Cancel
                        </button>
                        <button type="submit" class="btn btn-primary">
                            <i data-feather="send"></i>
                            Post Activity
                        </button>
                    </div>
                </form>
            </div>
        `;

        // Handle form submission
        modal.querySelector('#activity-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitActivity(e.target);
            modal.remove();
        });

        // Show/hide compensation field based on type
        modal.querySelector('[name="type"]').addEventListener('change', (e) => {
            const compensationGroup = modal.querySelector('#compensation-group');
            if (e.target.value === 'job_opening') {
                compensationGroup.style.display = 'block';
            } else {
                compensationGroup.style.display = 'none';
            }
        });

        if (window.initializeFeatherIcons) {
            window.initializeFeatherIcons();
        }
        return modal;
    }

    // Submit new activity
    async submitActivity(form) {
        const formData = new FormData(form);
        const activityData = {
            type: formData.get('type'),
            title: formData.get('title'),
            description: formData.get('description'),
            skills: formData.get('skills')?.split(',').map(s => s.trim()).filter(s => s) || [],
            location: formData.get('location'),
            priority: formData.get('priority'),
            start_date: formData.get('start_date'),
            deadline: formData.get('deadline'),
            compensation: formData.get('compensation'),
            requirements: formData.get('requirements')
        };

        try {
            const response = await apiCall('/activities', 'POST', activityData);
            if (response.error) {
                console.log('Activity posted (demo mode):', activityData);
                this.showNotification('Activity posted successfully! (Demo mode)', 'success');
            } else {
                this.showNotification('Activity posted successfully!', 'success');
                this.loadProjects(); // Refresh the projects list
            }
        } catch (error) {
            console.log('Activity posted (demo mode):', activityData);
            this.showNotification('Activity posted successfully! (Demo mode)', 'success');
        }
    }

    // Join a project
    async joinProject(projectId) {
        try {
            const response = await apiCall(`/projects/${projectId}/join`, 'POST');
            if (response.error) {
                this.showNotification('Joined project successfully! (Demo mode)', 'success');
            } else {
                this.showNotification('Joined project successfully!', 'success');
            }
        } catch (error) {
            this.showNotification('Joined project successfully! (Demo mode)', 'success');
        }
    }

    // Apply to job
    async applyToJob(activityId) {
        try {
            const response = await apiCall(`/activities/${activityId}/apply`, 'POST');
            if (response.error) {
                this.showNotification('Application submitted successfully! (Demo mode)', 'success');
            } else {
                this.showNotification('Application submitted successfully!', 'success');
            }
        } catch (error) {
            this.showNotification('Application submitted successfully! (Demo mode)', 'success');
        }
    }

    // Setup Gemini AI integration for smart insights
    setupGeminiIntegration() {
        // Add AI-powered search suggestions
        const searchInput = document.getElementById('project-search');
        if (searchInput) {
            this.setupAISearch(searchInput);
        }
    }

    // Setup AI-powered search
    setupAISearch(searchInput) {
        let searchTimeout;
        
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.processAISearch(e.target.value);
            }, 500);
        });
    }

    // Process AI search query
    async processAISearch(query) {
        if (!query || query.length < 3) return;

        try {
            // This would integrate with Gemini AI for natural language search
            const aiResponse = await this.queryGeminiAI(`
                Based on this search query: "${query}"
                Help find relevant projects from these categories:
                - AI/Government projects
                - Innovation Bond projects  
                - Local community development
                - Technical collaboration opportunities
                
                Return suggested search terms and project types.
            `);
            
            // For demo purposes, show intelligent suggestions
            this.showSearchSuggestions(query);
            
        } catch (error) {
            console.log('AI search not available, using basic search');
        }
    }

    // Query Gemini AI (placeholder for actual implementation)
    async queryGeminiAI(prompt) {
        // This would integrate with the Rust backend's Gemini client
        return await apiCall('/ai/query', 'POST', { prompt });
    }

    // Show search suggestions
    showSearchSuggestions(query) {
        // Remove existing suggestions
        const existingSuggestions = document.querySelector('.search-suggestions');
        if (existingSuggestions) {
            existingSuggestions.remove();
        }

        // Create suggestions based on query
        const suggestions = this.generateSmartSuggestions(query);
        if (suggestions.length === 0) return;

        const suggestionsEl = document.createElement('div');
        suggestionsEl.className = 'search-suggestions';
        suggestionsEl.innerHTML = `
            <div class="suggestions-header">
                <i data-feather="zap"></i>
                AI Suggestions
            </div>
            ${suggestions.map(suggestion => `
                <button class="suggestion-item" onclick="document.getElementById('project-search').value='${suggestion}'; projectsManager.searchQuery='${suggestion}'; projectsManager.filterProjects();">
                    ${suggestion}
                </button>
            `).join('')}
        `;

        const searchContainer = document.getElementById('project-search').parentElement;
        searchContainer.appendChild(suggestionsEl);

        if (window.initializeFeatherIcons) {
            window.initializeFeatherIcons();
        }
    }

    // Generate smart suggestions based on query
    generateSmartSuggestions(query) {
        const suggestions = [];
        const lowerQuery = query.toLowerCase();

        if (lowerQuery.includes('ai') || lowerQuery.includes('artificial')) {
            suggestions.push('AI-powered government projects');
            suggestions.push('machine learning opportunities');
        }
        
        if (lowerQuery.includes('government') || lowerQuery.includes('public')) {
            suggestions.push('government modernization projects');
            suggestions.push('civic technology initiatives');
        }
        
        if (lowerQuery.includes('react') || lowerQuery.includes('javascript')) {
            suggestions.push('frontend development opportunities');
            suggestions.push('React projects');
        }
        
        if (lowerQuery.includes('community') || lowerQuery.includes('local')) {
            suggestions.push('local community projects');
            suggestions.push('neighborhood innovation');
        }

        return suggestions.slice(0, 4);
    }

    // Filter projects based on current criteria
    filterProjects() {
        this.renderProjects();
    }

    // Show notification (using common utility)
    showNotification(message, type = 'info') {
        if (window.showNotification) {
            window.showNotification(message, type);
        } else {
            console.log(`Notification: ${message}`);
        }
    }

    // Format date for display (using common utility)
    formatDate(dateString) {
        if (window.formatDate) {
            return window.formatDate(dateString);
        } else {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
            });
        }
    }

    // View project details
    viewProjectDetails(projectId) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project) return;

        const modal = this.createProjectDetailsModal(project);
        document.body.appendChild(modal);
        modal.classList.add('show');
    }

    // Create project details modal
    createProjectDetailsModal(project) {
        const modal = document.createElement('div');
        modal.className = 'modal project-details-modal';
        modal.innerHTML = `
            <div class="modal-content extra-large">
                <div class="modal-header">
                    <h2 class="modal-title">${project.name}</h2>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">
                        <i data-feather="x"></i>
                    </button>
                </div>
                
                <div class="project-details-content">
                    <div class="project-overview">
                        <div class="project-meta-detailed">
                            <div class="meta-item">
                                <label>Location:</label>
                                <span>${project.location}</span>
                            </div>
                            <div class="meta-item">
                                <label>Funding:</label>
                                <span>${project.funding}</span>
                            </div>
                            <div class="meta-item">
                                <label>Team Size:</label>
                                <span>${project.team_size} members</span>
                            </div>
                            <div class="meta-item">
                                <label>Status:</label>
                                <span class="status-badge status-${project.status}">${project.status.replace('_', ' ')}</span>
                            </div>
                        </div>
                        
                        <div class="project-description-full">
                            <h3>Project Description</h3>
                            <p>${project.description}</p>
                        </div>
                        
                        <div class="project-skills-section">
                            <h3>Required Skills</h3>
                            <div class="skills-list">
                                ${project.skills.map(skill => `<span class="skill-tag large">${skill}</span>`).join('')}
                            </div>
                        </div>
                    </div>
                    
                    <div class="project-activities-section">
                        <h3>All Activities</h3>
                        <div class="activities-list">
                            ${project.activities.map(activity => `
                                <div class="activity-card">
                                    <div class="activity-header">
                                        <h4>${activity.name}</h4>
                                        <span class="activity-type-badge ${activity.type}">${activity.type.replace('_', ' ')}</span>
                                    </div>
                                    <p class="activity-description">${activity.description || 'No description'}</p>
                                    <div class="activity-skills">
                                        ${(activity.skills || []).map(skill => `<span class="skill-tag small">${skill}</span>`).join('')}
                                    </div>
                                    <div class="activity-footer">
                                        <span class="activity-status status-${activity.status}">${activity.status.replace('_', ' ')}</span>
                                        ${activity.deadline ? `<span class="activity-deadline">Due: ${this.formatDate(activity.deadline)}</span>` : ''}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
                    <button class="btn btn-primary" data-action="join-project" data-project-id="${project.id}" onclick="projectsManager.joinProject('${project.id}'); this.closest('.modal').remove();">
                        Join Project
                    </button>
                </div>
            </div>
        `;

        if (window.initializeFeatherIcons) {
            window.initializeFeatherIcons();
        }
        return modal;
    }
}

// Initialize projects manager
const projectsManager = new ProjectsManager();

// Export for global access
window.projectsManager = projectsManager;