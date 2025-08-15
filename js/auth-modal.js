// Shared Authentication Modal Component
// Used by both team/index.html and team/projects/map/index.html

class AuthModal {
    constructor() {
        this.modalId = 'auth-modal';
        this.init();
    }

    init() {
        this.injectStyles();
        this.injectHTML();
        this.setupEventListeners();
    }

    injectStyles() {
        if (document.getElementById('auth-modal-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'auth-modal-styles';
        styles.textContent = `
            /* Auth Modal Styles */
            .auth-modal {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                z-index: 10000;
                justify-content: center;
                align-items: center;
            }

            .auth-modal.show {
                display: flex;
            }

            .auth-modal-content {
                background: white;
                border-radius: 12px;
                padding: 24px;
                width: 90%;
                max-width: 400px;
                position: relative;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
            }

            .auth-modal-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 24px;
            }

            .auth-modal h3 {
                margin: 0;
                font-size: 1.3rem;
                color: #1a1a1a;
                flex: 1;
                text-align: center;
            }

            .auth-modal-close {
                background: #e5e7eb;
                border: none;
                cursor: pointer;
                width: 36px;
                height: 36px;
                color: #6b7280;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
                flex-shrink: 0;
            }

            .auth-modal-close:hover {
                background: #d1d5db;
                color: #374151;
                transform: scale(1.05);
            }

            .auth-buttons {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .auth-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 12px;
                padding: 12px 16px;
                border: 1px solid #e5e5e5;
                border-radius: 8px;
                background: white;
                color: #333;
                text-decoration: none;
                font-size: 1.1rem;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
                width: 100%;
            }

            .auth-btn:hover {
                background: #f8f9fa;
                border-color: #007bff;
                transform: translateY(-1px);
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            }
        `;
        document.head.appendChild(styles);
    }

    injectHTML() {
        if (document.getElementById(this.modalId)) return;

        const modalHTML = `
            <div id="${this.modalId}" class="auth-modal" onclick="window.authModal.hide()">
                <div class="auth-modal-content" onclick="event.stopPropagation()">
                    <div class="auth-modal-header">
                        <h3>Sign in or create an account</h3>
                        <button class="auth-modal-close" onclick="window.authModal.hide()">
                            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="15" y1="9" x2="9" y2="15"></line>
                                <line x1="9" y1="9" x2="15" y2="15"></line>
                            </svg>
                        </button>
                    </div>
                    
                    <div class="auth-buttons">
                        <button class="auth-btn" onclick="window.authModal.signInWith('google')">
                            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285f4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34a853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#fbbc05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#ea4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                            Continue with Google
                        </button>
                        
                        <button class="auth-btn" onclick="window.authModal.signInWith('microsoft')">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="#00a4ef"><path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zM24 11.4H12.6V0H24v11.4z"/></svg>
                            Continue with Microsoft
                        </button>

                        <button class="auth-btn" onclick="window.authModal.signInWith('linkedin')">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="#0077b5"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                            Continue with LinkedIn
                        </button>

                        <button class="auth-btn" onclick="window.authModal.signInWith('facebook')">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877f2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                            Continue with Facebook
                        </button>
                                                
                        <button class="auth-btn" onclick="window.authModal.signInWith('github')">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                            Continue with GitHub
                        </button>
                        
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    setupEventListeners() {
        // Close modal when clicking outside
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible()) {
                this.hide();
            }
        });
    }

    show() {
        const modal = document.getElementById(this.modalId);
        if (modal) {
            modal.classList.add('show');
        }
    }

    hide() {
        const modal = document.getElementById(this.modalId);
        if (modal) {
            modal.classList.remove('show');
        }
    }

    isVisible() {
        const modal = document.getElementById(this.modalId);
        return modal && modal.classList.contains('show');
    }

    async signInWith(provider) {
        console.log('Starting OAuth flow for provider:', provider);
        this.hide();
        
        try {
            // For localhost development, use the local backend
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                // Redirect to backend OAuth endpoint
                const response = await fetch(`http://localhost:8081/api/auth/${provider}/url`);
                if (response.ok) {
                    const result = await response.json();
                    if (result.auth_url) {
                        window.location.href = result.auth_url;
                    } else {
                        console.error('No auth URL received');
                        alert(`Failed to get authentication URL for ${provider}`);
                    }
                } else {
                    const error = await response.json();
                    console.error('OAuth URL error:', error);
                    alert(`${provider} authentication: ${error.message || 'Configuration needed'}`);
                }
            } else {
                // For production deployments, use existing signInWith function if available
                if (typeof signInWith === 'function') {
                    await signInWith(provider);
                } else {
                    console.log(`Production OAuth for ${provider} - would redirect to appropriate OAuth flow`);
                    alert(`${provider} authentication would be handled by production OAuth system`);
                }
            }
        } catch (error) {
            console.error('OAuth error:', error);
            alert(`Failed to start ${provider} authentication. Please check your connection.`);
        }
    }
}

// Initialize auth modal when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.authModal = new AuthModal();
});

// Global functions for backward compatibility
window.showAuthModal = () => window.authModal?.show();
window.hideAuthModal = () => window.authModal?.hide();