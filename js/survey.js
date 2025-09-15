// Survey and Account Management Module
class SurveyManager {
    constructor() {
        this.currentQuestion = 1;
        this.totalQuestions = 20;
        this.responses = {};
        this.interests = {};
        this.surveyQuestions = [
            "Rural initiatives should primarily focus on open, transparent technology",
            "Government spending reductions should be enhanced through technology",
            "Public education should include digital literacy training",
            "Worker protection laws should cover gig economy participants",
            "Government should prioritize investments in renewable energy infrastructure",
            "Public funding should include AI implementations for government efficiency",
            "AI features in apps should be optional, not automatic.",
            "Digital privacy rights should be strengthened with new legislation",
            "Tech companies should compensate creators for AI training data collection",
            "Public-private partnerships should be expanded for infrastructure",
            "Government should increase funding for public transportation",
            "Open source software should be prioritized in government systems",
            "Climate change adaptation should be included in infrastructure planning",
            "Public internet access should be treated as a basic utility",
            "Local communities should have realtime voting during technology adoption",
            "Innovation bonds should be included in public investment incentives",
            "Environmental justice should guide technology deployment decisions",
            "Businesses using open apps should receive priority in government contracts"
        ];
    }

    // Initialize survey functionality
    init() {
        this.loadSavedResponses();
        this.createAllQuestions();
        this.restoreDropdownSelections();
        this.setupSurveyListeners();
        this.setupInterestsListeners();
        this.updateSurveyProgress();
    }

    // Create all survey questions at once
    createAllQuestions() {
        const container = document.querySelector('#survey-container');
        if (!container) return;
        
        container.innerHTML = '';
        
        this.surveyQuestions.forEach((questionText, index) => {
            const questionNum = index + 1;
            const questionEl = this.createQuestionDropdown(questionNum, questionText);
            container.appendChild(questionEl);
        });
    }
    
    // Create a question with dropdown
    createQuestionDropdown(questionNum, questionText) {
        const questionEl = document.createElement('div');
        questionEl.className = 'survey-question';
        questionEl.dataset.question = questionNum;
        
        questionEl.innerHTML = `
            <h3 class="question-title">${questionText}</h3>
            <div class="rating-scale">
                <select class="survey-dropdown" data-question="${questionNum}">
                    <option value="">Your response...</option>
                    <option value="5">Strongly Agree</option>
                    <option value="4">Agree</option>
                    <option value="3">No Opinion</option>
                    <option value="2">Disagree</option>
                    <option value="1">Strongly Disagree</option>
                </select>
            </div>
        `;
        
        // Pre-select saved response if it exists
        if (this.responses[questionNum]) {
            const dropdown = questionEl.querySelector('.survey-dropdown');
            dropdown.value = this.responses[questionNum];
        }
        
        return questionEl;
    }

    // Setup event listeners for survey
    setupSurveyListeners() {
        // Dropdown change events
        document.addEventListener('change', (e) => {
            if (e.target.matches('.survey-dropdown')) {
                const value = parseInt(e.target.value);
                const questionNum = parseInt(e.target.dataset.question);
                
                if (value) {
                    this.selectRating(questionNum, value);
                } else {
                    // Remove response if blank option selected
                    delete this.responses[questionNum];
                    this.updateSurveyProgress();
                    this.saveResponses();
                }
            }
        });

        // Navigation buttons
        const saveBtn = document.getElementById('save-survey');
        const finishBtn = document.getElementById('finish-survey');

        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveResponses());
        }
        
        if (finishBtn) {
            finishBtn.addEventListener('click', () => this.completeSurvey());
        }
    }

    // Setup event listeners for interests
    setupInterestsListeners() {
        document.addEventListener('click', (e) => {
            if (e.target.matches('.star-btn')) {
                const rating = parseInt(e.target.dataset.rating);
                const interestName = e.target.closest('.star-rating').dataset.interest;
                
                this.setInterestRating(interestName, rating);
            }
        });
    }

    // Select a rating for a question
    selectRating(questionNum, value) {
        // Store the response
        this.responses[questionNum] = value;
        
        // Update progress and save
        this.updateSurveyProgress();
        this.saveResponses();
    }


    // Update survey progress indicator
    updateSurveyProgress() {
        const completedCount = Object.keys(this.responses).length;
        const progressText = document.querySelector('.progress-text');
        const progressFill = document.querySelector('.progress-fill');
        
        if (progressText) {
            progressText.textContent = `${completedCount} of ${this.totalQuestions} completed`;
        }
        
        if (progressFill) {
            const percentage = (completedCount / this.totalQuestions) * 100;
            progressFill.style.width = `${percentage}%`;
        }
    }

    // Complete the survey and show results
    completeSurvey() {
        // Hide survey container
        const surveyContainer = document.querySelector('.survey-container');
        const surveyNavigation = document.querySelector('.survey-navigation');
        
        if (surveyContainer) surveyContainer.style.display = 'none';
        if (surveyNavigation) surveyNavigation.style.display = 'none';
        
        // Show results
        const resultsSection = document.querySelector('.survey-results');
        if (resultsSection) {
            resultsSection.style.display = 'block';
            this.generateResults();
        }
        
        // Save responses to backend (or local storage for demo)
        this.saveResponses();
    }

    // Generate and display survey results
    generateResults() {
        const results = this.analyzeSurveyResponses();
        
        // Update progress to 100%
        const progressText = document.querySelector('.progress-text');
        const progressFill = document.querySelector('.progress-fill');
        
        if (progressText) {
            progressText.textContent = `Survey Complete! (${this.totalQuestions}/${this.totalQuestions})`;
        }
        
        if (progressFill) {
            progressFill.style.width = '100%';
        }
        
        // Generate simple Sankey chart visualization
        this.drawSankeyChart(results);
        
        // Update profile summary
        this.updateProfileSummary(results);
    }

    // Analyze survey responses
    analyzeSurveyResponses() {
        const categories = {
            'technology': [2, 7, 9, 11, 13, 15],
            'environment': [1, 8, 16, 20],
            'governance': [3, 11, 18, 20],
            'economy': [5, 6, 17, 18],
            'social': [10, 12, 14, 19]
        };
        
        const results = {};
        
        for (const [category, questionIndices] of Object.entries(categories)) {
            const scores = questionIndices
                .map(i => this.responses[i])
                .filter(score => score !== undefined);
            
            if (scores.length > 0) {
                const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
                results[category] = {
                    score: average,
                    count: scores.length,
                    label: this.getCategoryLabel(category)
                };
            }
        }
        
        return results;
    }

    // Get user-friendly category labels
    getCategoryLabel(category) {
        const labels = {
            'technology': 'Technology & Innovation',
            'environment': 'Environmental Policy',
            'governance': 'Governance & Transparency',
            'economy': 'Economic Development',
            'social': 'Social Impact'
        };
        return labels[category] || category;
    }

    // Draw a simple Sankey chart
    drawSankeyChart(results) {
        const canvas = document.getElementById('sankey-chart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        // Simple bar chart representation of results
        const categories = Object.keys(results);
        const barHeight = height / (categories.length + 1);
        const maxScore = 5;
        
        categories.forEach((category, index) => {
            const result = results[category];
            const y = (index + 1) * barHeight - barHeight / 2;
            const barWidth = (result.score / maxScore) * (width * 0.6);
            
            // Draw bar
            const gradient = ctx.createLinearGradient(0, 0, barWidth, 0);
            if (result.score >= 4) {
                gradient.addColorStop(0, '#10B981'); // Green for high scores
                gradient.addColorStop(1, '#3B82F6');
            } else if (result.score >= 3) {
                gradient.addColorStop(0, '#3B82F6'); // Blue for medium scores
                gradient.addColorStop(1, '#F59E0B');
            } else {
                gradient.addColorStop(0, '#6B7280'); // Gray for low scores
                gradient.addColorStop(1, '#9CA3AF');
            }
            
            ctx.fillStyle = gradient;
            ctx.fillRect(50, y - 15, barWidth, 30);
            
            // Draw label
            ctx.fillStyle = '#1A1A1A';
            ctx.font = '12px Inter, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(result.label, 60 + barWidth, y + 4);
            
            // Draw score
            ctx.fillStyle = '#6B7280';
            ctx.font = '11px Inter, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(`${result.score.toFixed(1)}/5`, 45, y + 4);
        });
    }

    // Update profile summary
    updateProfileSummary(results) {
        const summaryContainer = document.querySelector('.profile-summary');
        if (!summaryContainer) return;
        
        // Clear existing content
        summaryContainer.innerHTML = '';
        
        // Sort categories by score
        const sortedCategories = Object.entries(results)
            .sort(([,a], [,b]) => b.score - a.score)
            .slice(0, 3); // Show top 3
        
        sortedCategories.forEach(([category, result]) => {
            const categoryEl = document.createElement('div');
            categoryEl.className = 'profile-category';
            
            const supportLevel = this.getSupportLevel(result.score);
            
            categoryEl.innerHTML = `
                <h4>${result.label}</h4>
                <div class="category-score">${supportLevel} (${result.score.toFixed(1)}/5)</div>
                <div class="category-description">${this.getCategoryDescription(category, result.score)}</div>
            `;
            
            summaryContainer.appendChild(categoryEl);
        });
    }

    // Get support level text
    getSupportLevel(score) {
        if (score >= 4.5) return 'Very Strong Support';
        if (score >= 4.0) return 'Strong Support';
        if (score >= 3.5) return 'Moderate Support';
        if (score >= 2.5) return 'Mixed Views';
        if (score >= 2.0) return 'Some Opposition';
        return 'Strong Opposition';
    }

    // Get category description
    getCategoryDescription(category, score) {
        const descriptions = {
            'technology': score >= 4 
                ? 'You strongly support government investment in technology and innovation initiatives.'
                : 'You have moderate support for technology initiatives in government.',
            'environment': score >= 4
                ? 'You are highly aligned with environmental protection and renewable energy policies.'
                : 'You show moderate support for environmental policy initiatives.',
            'governance': score >= 4
                ? 'You strongly value transparency and accountability in government operations.'
                : 'You support governance improvements with some reservations.',
            'economy': score >= 4
                ? 'You strongly support policies that promote economic development and innovation.'
                : 'You have moderate support for economic development initiatives.',
            'social': score >= 4
                ? 'You are highly committed to social equity and community empowerment.'
                : 'You support social initiatives with some considerations.'
        };
        
        return descriptions[category] || 'Your views on this area are developing.';
    }

    // Set interest rating
    setInterestRating(interestName, rating) {
        this.interests[interestName] = rating;
        
        // Update UI
        const ratingEl = document.querySelector(`[data-interest="${interestName}"]`);
        if (ratingEl) {
            const stars = ratingEl.querySelectorAll('.star-btn');
            stars.forEach((star, index) => {
                if (index < rating) {
                    star.classList.add('active');
                } else {
                    star.classList.remove('active');
                }
            });
        }
        
        // Update summary
        this.updateInterestsSummary();
    }

    // Update interests summary
    updateInterestsSummary() {
        const ratedCount = Object.keys(this.interests).length;
        const totalInterests = 20; // Assuming 20 total interests
        
        const summaryText = document.querySelector('.summary-text');
        if (summaryText) {
            summaryText.textContent = `${ratedCount} of ${totalInterests} interests rated`;
        }
    }

    // Save responses
    async saveResponses() {
        const data = {
            survey_responses: this.responses,
            interests: this.interests,
            completed_at: new Date().toISOString()
        };
        
        try {
            const response = await apiCall('/user/preferences', 'POST', data);
            if (response.error) {
                console.log('Responses saved locally (demo mode):', data);
                localStorage.setItem('PartnerTools_preferences', JSON.stringify(data));
            }
        } catch (error) {
            console.log('Responses saved locally (demo mode):', data);
            localStorage.setItem('PartnerTools_preferences', JSON.stringify(data));
        }
    }

    // Load saved responses
    loadSavedResponses() {
        try {
            const saved = localStorage.getItem('PartnerTools_preferences');
            if (saved) {
                const data = JSON.parse(saved);
                this.responses = data.survey_responses || {};
                this.interests = data.interests || {};
                
                // Update UI
                this.updateSurveyProgress();
                this.updateInterestsSummary();
                
                // Restore star ratings
                Object.entries(this.interests).forEach(([interest, rating]) => {
                    this.setInterestRating(interest, rating);
                });
            }
        } catch (error) {
            console.log('Could not load saved responses:', error);
        }
    }
    
    // Restore dropdown selections after questions are created
    restoreDropdownSelections() {
        Object.entries(this.responses).forEach(([questionNum, value]) => {
            const dropdown = document.querySelector(`[data-question="${questionNum}"]`);
            if (dropdown) {
                dropdown.value = value;
            }
        });
    }
}

// Skills Management
class SkillsManager {
    constructor() {
        this.skills = {};
    }

    // Initialize skills functionality
    init() {
        this.setupSkillsListeners();
        this.loadSkills();
    }

    // Setup event listeners
    setupSkillsListeners() {
        // Add skill button
        document.addEventListener('click', (e) => {
            if (e.target.matches('[data-action="add-skill"]') || 
                e.target.closest('[data-action="add-skill"]')) {
                this.showAddSkillModal();
            }
        });
    }

    // Show add skill modal
    showAddSkillModal() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2 class="modal-title">Add New Skill</h2>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">
                        <i data-feather="x"></i>
                    </button>
                </div>
                
                <form id="add-skill-form">
                    <div class="form-group">
                        <label class="form-label">Skill Name</label>
                        <input type="text" name="skill_name" class="form-input" required 
                               placeholder="e.g., React, Python, AWS">
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Category</label>
                        <select name="category" class="form-input" required>
                            <option value="">Select category...</option>
                            <option value="programming">Programming Languages</option>
                            <option value="frameworks">Frameworks & Libraries</option>
                            <option value="cloud">Cloud & DevOps</option>
                            <option value="design">Design & UX</option>
                            <option value="data">Data & Analytics</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Proficiency Level</label>
                        <select name="level" class="form-input" required>
                            <option value="">Select level...</option>
                            <option value="beginner">Beginner</option>
                            <option value="intermediate">Intermediate</option>
                            <option value="advanced">Advanced</option>
                            <option value="expert">Expert</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Years of Experience</label>
                        <input type="number" name="experience" class="form-input" min="0" max="50" 
                               placeholder="Years of experience">
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Related Technologies/Tools</label>
                        <input type="text" name="related" class="form-input" 
                               placeholder="e.g., Redux, TypeScript, Hooks (optional)">
                    </div>
                    
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Add Skill</button>
                    </div>
                </form>
            </div>
        `;
        
        document.body.appendChild(modal);
        modal.classList.add('show');
        
        // Handle form submission
        modal.querySelector('#add-skill-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addSkill(e.target);
            modal.remove();
        });
        
        if (window.initializeFeatherIcons) {
            window.initializeFeatherIcons();
        }
    }

    // Add new skill
    addSkill(form) {
        const formData = new FormData(form);
        const skillData = {
            name: formData.get('skill_name'),
            category: formData.get('category'),
            level: formData.get('level'),
            experience: parseInt(formData.get('experience')) || 0,
            related: formData.get('related')?.split(',').map(s => s.trim()).filter(s => s) || []
        };
        
        // Add to skills object
        this.skills[skillData.name] = skillData;
        
        // Update UI
        this.renderSkill(skillData);
        
        // Save to backend/localStorage
        this.saveSkills();
    }

    // Render a skill item
    renderSkill(skill) {
        // Find the appropriate category section
        const categoryMap = {
            'programming': 'Programming Languages',
            'frameworks': 'Frameworks & Libraries',
            'cloud': 'Cloud & DevOps',
            'design': 'Design & UX',
            'data': 'Data & Analytics'
        };
        
        const categoryTitle = categoryMap[skill.category] || 'Other Skills';
        let categorySection = Array.from(document.querySelectorAll('.category-title'))
            .find(title => title.textContent === categoryTitle)?.closest('.skill-category');
        
        // Create category if it doesn't exist
        if (!categorySection) {
            categorySection = this.createSkillCategory(categoryTitle);
        }
        
        const skillsGrid = categorySection.querySelector('.skills-grid');
        const proficiencyPercent = this.getLevelPercentage(skill.level);
        
        const skillEl = document.createElement('div');
        skillEl.className = 'skill-item';
        skillEl.innerHTML = `
            <div class="skill-header">
                <span class="skill-name">${skill.name}</span>
                <span class="skill-level ${skill.level}">${skill.level}</span>
            </div>
            <div class="skill-bar">
                <div class="skill-progress" style="width: ${proficiencyPercent}%"></div>
            </div>
            <div class="skill-experience">
                ${skill.experience}+ year${skill.experience !== 1 ? 's' : ''}
                ${skill.related.length > 0 ? ` • ${skill.related.join(', ')}` : ''}
            </div>
        `;
        
        skillsGrid.appendChild(skillEl);
    }

    // Create new skill category
    createSkillCategory(title) {
        const skillsSection = document.querySelector('.skills-section');
        const categoryEl = document.createElement('div');
        categoryEl.className = 'skill-category';
        categoryEl.innerHTML = `
            <h3 class="category-title">${title}</h3>
            <div class="skills-grid"></div>
        `;
        
        skillsSection.appendChild(categoryEl);
        return categoryEl;
    }

    // Get proficiency percentage
    getLevelPercentage(level) {
        const percentages = {
            'beginner': 25,
            'intermediate': 50,
            'advanced': 75,
            'expert': 90
        };
        return percentages[level] || 0;
    }

    // Load skills
    loadSkills() {
        // Load from localStorage for demo
        try {
            const saved = localStorage.getItem('PartnerTools_skills');
            if (saved) {
                this.skills = JSON.parse(saved);
            }
        } catch (error) {
            console.log('Could not load skills:', error);
        }
    }

    // Save skills
    saveSkills() {
        try {
            localStorage.setItem('PartnerTools_skills', JSON.stringify(this.skills));
        } catch (error) {
            console.log('Could not save skills:', error);
        }
    }
}

// Initialize managers
const surveyManager = new SurveyManager();
const skillsManager = new SkillsManager();

// Export for global access
window.surveyManager = surveyManager;
window.skillsManager = skillsManager;