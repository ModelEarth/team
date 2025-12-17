// OAuth Authentication Handler
// Supports Google, GitHub, LinkedIn, Microsoft Outlook, and Facebook

class AuthManager {
    constructor() {
        // Detect environment and set appropriate API base for Auth API
        const isLocal = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);

        if (isLocal) {
            // Local development - Auth API on port 3002
            this.API_BASE = 'http://localhost:3002/api';
        } else {
            // Production - use Cloud Run Auth API URL
            // This can be overridden by setting window.AUTH_API_URL in index.html
            this.API_BASE = window.AUTH_API_URL || 'https://webroot-auth-api-336235334145.us-central1.run.app/api';
        }

        this.providers = ['google', 'github', 'linkedin', 'microsoft', 'facebook'];
        this.currentUser = null;
        this.initializeAuth();

        console.log(`[Auth API] API_BASE set to: ${this.API_BASE}`);
    }

    async initializeAuth() {
        // Check session via httpOnly cookie (secure)
        try {
            // Get session from server (uses httpOnly cookie)
            const response = await fetch(`${this.API_BASE}/auth-status`, {
                method: 'GET',
                credentials: 'include' // Send httpOnly cookies
            });

            if (response.ok) {
                const result = await response.json();
                if (result && result.authenticated && result.user) {
                    this.currentUser = result.user;
                    this.updateUI(true);
                    return;
                }
            }

            // No valid session
            this.currentUser = null;
            this.updateUI(false);
        } catch (error) {
            console.log('[Auth] Error:', error);
            this.currentUser = null;
            this.updateUI(false);
        }
    }

    // Create the Sign In dropdown with all providers
    createSignInButton(containerId) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error('Auth container not found:', containerId);
            return;
        }

        const authHTML = `
            <div class="auth-container">
                <div class="auth-button" id="authButton">
                    <i data-feather="user"></i>
                    <span id="authText">Sign In</span>
                    <i data-feather="chevron-down" class="dropdown-icon"></i>
                </div>
                <div class="auth-dropdown" id="authDropdown">
                    <div class="auth-providers">
                        <button class="auth-provider google" onclick="authManager.startAuth('google')">
                            <svg class="provider-icon" viewBox="0 0 24 24">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                            </svg>
                            Continue with Google
                        </button>
                        <button class="auth-provider github" onclick="authManager.startAuth('github')">
                            <svg class="provider-icon" viewBox="0 0 24 24" fill="#333">
                                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                            </svg>
                            Continue with GitHub
                        </button>
                        <button class="auth-provider linkedin" onclick="authManager.startAuth('linkedin')">
                            <svg class="provider-icon" viewBox="0 0 24 24" fill="#0077B5">
                                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                            </svg>
                            Continue with LinkedIn
                        </button>
                        <button class="auth-provider microsoft" onclick="authManager.startAuth('microsoft')">
                            <svg class="provider-icon" viewBox="0 0 24 24" fill="#00A4EF">
                                <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zM24 11.4H12.6V0H24v11.4z"/>
                            </svg>
                            Continue with Outlook
                        </button>
                        <button class="auth-provider facebook" onclick="authManager.startAuth('facebook')">
                            <svg class="provider-icon" viewBox="0 0 24 24" fill="#1877F2">
                                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                            </svg>
                            Continue with Facebook
                        </button>
                        <hr class="auth-divider">
                        <button class="auth-provider demo" onclick="authManager.startAuth('demo')">
                            <svg class="provider-icon" viewBox="0 0 24 24" fill="#6B7280">
                                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                            </svg>
                            Demo Login (Development)
                        </button>
                    </div>
                    <div class="auth-user-info" id="authUserInfo" style="display: none;">
                        <div class="user-avatar">
                            <img id="userAvatar" src="" alt="User Avatar">
                        </div>
                        <div class="user-details">
                            <div class="user-name" id="userName"></div>
                            <div class="user-email" id="userEmail"></div>
                        </div>
                        <button class="auth-logout" onclick="authManager.logout()">
                            <i data-feather="log-out"></i>
                            Sign Out
                        </button>
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = authHTML;

        // Initialize dropdown behavior
        this.initializeDropdown();

        // Initialize feather icons
        if (typeof feather !== 'undefined') {
            feather.replace();
        }
    }

    initializeDropdown() {
        const authButton = document.getElementById('authButton');
        const authDropdown = document.getElementById('authDropdown');

        if (authButton && authDropdown) {
            authButton.addEventListener('click', (e) => {
                e.stopPropagation();
                authDropdown.classList.toggle('show');
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!authButton.contains(e.target) && !authDropdown.contains(e.target)) {
                    authDropdown.classList.remove('show');
                }
            });
        }
    }

    async startAuth(provider) {
        try {
            // Special handling for demo provider (disabled in production)
            if (provider === 'demo') {
                if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
                    alert('Demo login is only available in development mode');
                    return;
                }

                const response = await fetch(`${this.API_BASE}/auth/demo/login`, {
                    method: 'POST',
                    credentials: 'include' // Backend sets httpOnly cookie
                });

                if (response.ok) {
                    const result = await response.json();
                    if (result.success) {
                        console.log('[Auth] Demo login successful');
                        // Session is now stored in httpOnly cookie
                        await this.initializeAuth();
                    }
                }
                return;
            }

            // Get OAuth URL from backend
            const response = await fetch(`${this.API_BASE}/auth/${provider}/url`, {
                credentials: 'include'
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || `${provider} OAuth not configured`);
            }

            const result = await response.json();

            // Store the provider for callback handling
            sessionStorage.setItem('oauth_provider', provider);

            // Store current page URL for return after auth
            sessionStorage.setItem('auth_return_url', window.location.pathname + window.location.search + window.location.hash);

            // Redirect to OAuth provider (required for OAuth flow)
            window.location.href = result.auth_url;

        } catch (error) {
            console.error('Auth error:', error);
            alert(`Authentication failed: ${error.message}`);
        }
    }

    async logout() {
        try {
            // Call server logout endpoint to clear httpOnly cookie
            await fetch(`${this.API_BASE}/auth/sign-out`, {
                method: 'POST',
                credentials: 'include' // Send httpOnly cookie to be cleared
            });

            // Clear client-side session data
            sessionStorage.removeItem('just_authenticated');
            sessionStorage.removeItem('oauth_provider');
            this.currentUser = null;
            this.updateUI(false);
            console.log('[Auth] User logged out successfully');
        } catch (error) {
            console.error('Logout error:', error);
            // Force UI update even if request fails
            this.currentUser = null;
            this.updateUI(false);
        }
    }

    updateUI(isAuthenticated) {
        const authButton = document.getElementById('authButton');
        const authText = document.getElementById('authText');
        const authProviders = document.querySelector('.auth-providers');
        const authUserInfo = document.getElementById('authUserInfo');
        const userName = document.getElementById('userName');
        const userEmail = document.getElementById('userEmail');
        const userAvatar = document.getElementById('userAvatar');

        if (!authButton) return;

        if (isAuthenticated && this.currentUser) {
            // Show user info, hide providers
            authText.textContent = this.currentUser.name || 'User';
            authProviders.style.display = 'none';
            authUserInfo.style.display = 'block';

            if (userName) userName.textContent = this.currentUser.name;
            if (userEmail) userEmail.textContent = this.currentUser.email;
            if (userAvatar) {
                userAvatar.src = this.currentUser.image || '/img/default-avatar.png';
                userAvatar.onerror = () => {
                    userAvatar.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiNGM0Y0RjYiLz4KPHN2ZyB4PSI4IiB5PSI4IiB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSI+CjxwYXRoIGQ9Ik0yMCAyMXYtMmE0IDQgMCAwIDAtNC00SDhhNCA0IDAgMCAwLTQgNHYyIiBzdHJva2U9IiM2QjcyODAiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+CjxjaXJjbGUgY3g9IjEyIiBjeT0iNyIgcj0iNCIgc3Ryb2tlPSIjNkI3MjgwIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8L3N2Zz4KPC9zdmc+';
                };
            }

            authButton.classList.add('authenticated');
        } else {
            // Show providers, hide user info
            authText.textContent = 'Sign In';
            if (authProviders) authProviders.style.display = 'block';
            if (authUserInfo) authUserInfo.style.display = 'none';
            authButton.classList.remove('authenticated');
        }

        // Refresh feather icons
        if (typeof feather !== 'undefined') {
            feather.replace();
        }
    }

    // Handle OAuth callback
    handleAuthCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const error = urlParams.get('error');
        const code = urlParams.get('code');

        if (error) {
            console.error('OAuth error:', error);
            alert(`Authentication failed: ${error}`);
            return;
        }

        if (code) {
            // OAuth callback will be handled by the backend redirect
            // The backend should redirect to the frontend with auth success/failure
            console.log('OAuth callback received, backend should handle redirect');
        }
    }
}

// Initialize global auth manager
let authManager;
document.addEventListener('DOMContentLoaded', () => {
    authManager = new AuthManager();

    // Handle OAuth callback if present
    if (window.location.search.includes('code=') || window.location.search.includes('error=')) {
        authManager.handleAuthCallback();
    }
});
