// Database Admin Panel JavaScript
class DatabaseAdmin {
    constructor() {
        // Use config from settings.js if available, otherwise fallback
        this.apiBaseUrl = (typeof CONFIG !== 'undefined' && CONFIG.API) 
            ? CONFIG.API.BASE_URL 
            : 'http://localhost:8081/api';
        this.log = [];
        this.envConfig = null;
        this.selectedConnection = 'COMMONS'; // Default to COMMONS
        this.init();
    }

    async init() {
        await this.loadEnvConfig();
        this.setupEventListeners();
        this.displayConfig();
        this.addLog('Database Admin Panel initialized');
    }

    async loadEnvConfig() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/config/env`);
            if (response.ok) {
                this.envConfig = await response.json();
                console.log('Loaded env config:', this.envConfig);
                this.addLog('Environment configuration loaded from .env');
                this.populateConnectionDropdown();
            } else {
                this.addLog(`Could not load .env config: HTTP ${response.status}`);
            }
        } catch (error) {
            this.addLog(`Failed to load .env config: ${error.message}`);
            // Show API connection error in config display if available
            const configDisplay = document.getElementById('config-display');
            if (configDisplay) {
                handleApiConnectionError(error, 'config-display');
            }
        }
    }

    populateConnectionDropdown() {
        const databaseSelect = document.getElementById('database-select');
        console.log('populateConnectionDropdown called', {
            databaseSelect: !!databaseSelect,
            envConfig: !!this.envConfig,
            connections: this.envConfig?.database_connections
        });
        
        if (!databaseSelect || !this.envConfig || !this.envConfig.database_connections) {
            console.log('Early return from populateConnectionDropdown');
            return;
        }

        // Clear existing options
        databaseSelect.innerHTML = '';

        // Add database connections
        this.envConfig.database_connections.forEach(connection => {
            const option = document.createElement('option');
            option.value = connection.name;
            option.textContent = connection.display_name;
            
            // Select COMMONS as default
            if (connection.name === 'COMMONS') {
                option.selected = true;
                this.selectedConnection = connection.name;
            }
            
            databaseSelect.appendChild(option);
        });

        this.addLog(`Populated dropdown with ${this.envConfig.database_connections.length} database connections`);
    }

    setupEventListeners() {
        // Only add event listeners if elements exist (allows reuse on different pages)
        const databaseSelect = document.getElementById('database-select');
        if (databaseSelect) {
            databaseSelect.addEventListener('change', (e) => {
                this.selectedConnection = e.target.value;
                this.addLog(`Selected database connection: ${e.target.value}`);
                console.log('Connection changed to:', this.selectedConnection);
                this.displayConfig();
            });
        }

        const testConnectionBtn = document.getElementById('test-connection');
        if (testConnectionBtn) {
            testConnectionBtn.addEventListener('click', () => this.testConnection());
        }

        const list10TablesBtn = document.getElementById('list-10-tables');
        if (list10TablesBtn) {
            list10TablesBtn.addEventListener('click', () => {
                console.log('List 10 tables clicked, selectedConnection:', this.selectedConnection);
                this.listTables(10);
            });
        }

        const listAllTablesBtn = document.getElementById('list-all-tables');
        if (listAllTablesBtn) {
            listAllTablesBtn.addEventListener('click', () => {
                console.log('List all tables clicked, selectedConnection:', this.selectedConnection);
                this.listTables();
            });
        }

        const clearLogBtn = document.getElementById('clear-log');
        if (clearLogBtn) {
            clearLogBtn.addEventListener('click', () => this.clearLog());
        }

        const checkUsersBtn = document.getElementById('check-users');
        if (checkUsersBtn) {
            checkUsersBtn.addEventListener('click', () => this.checkTable('users'));
        }

        const checkAccountsBtn = document.getElementById('check-accounts');
        if (checkAccountsBtn) {
            checkAccountsBtn.addEventListener('click', () => this.checkTable('accounts'));
        }

        const testQueryBtn = document.getElementById('test-query');
        if (testQueryBtn) {
            testQueryBtn.addEventListener('click', () => this.testSimpleQuery());
        }
    }

    displayConfig() {
        const configDisplay = document.getElementById('config-display');
        if (!configDisplay) {
            // Element doesn't exist on this page, skip config display
            return;
        }
        
        // Show selected connection from .env config
        if (this.envConfig && this.envConfig.database_connections) {
            const selectedConn = this.envConfig.database_connections.find(conn => conn.name === this.selectedConnection);
            if (selectedConn) {
                const config = selectedConn.config;
                configDisplay.innerHTML = `<div class="config-item"><strong>Source:</strong> .env file</div><div class="config-item"><strong>Connection:</strong> ${selectedConn.display_name}</div><div class="config-item"><strong>Server:</strong> ${config.server}</div><div class="config-item"><strong>Database:</strong> ${config.database}</div><div class="config-item"><strong>Username:</strong> ${config.username}</div><div class="config-item"><strong>Port:</strong> ${config.port}</div><div class="config-item"><strong>SSL:</strong> ${config.ssl ? 'Enabled' : 'Disabled'}</div><div class="config-item"><strong>API Endpoint:</strong> ${this.apiBaseUrl}</div>`;
                return;
            }
        }
        
        // Fallback to default database config
        if (this.envConfig && this.envConfig.database) {
            const config = this.envConfig.database;
            configDisplay.innerHTML = `<div class="config-item"><strong>Source:</strong> .env file</div><div class="config-item"><strong>Server:</strong> ${config.server}</div><div class="config-item"><strong>Database:</strong> ${config.database}</div><div class="config-item"><strong>Username:</strong> ${config.username}</div><div class="config-item"><strong>Port:</strong> ${config.port}</div><div class="config-item"><strong>SSL:</strong> ${config.ssl ? 'Enabled' : 'Disabled'}</div><div class="config-item"><strong>API Endpoint:</strong> ${this.apiBaseUrl}</div>`;
        } else if (typeof CONFIG !== 'undefined' && CONFIG.DATABASE) {
            const config = CONFIG.DATABASE;
            configDisplay.innerHTML = `<div class="config-item"><strong>Source:</strong> settings.js</div><div class="config-item"><strong>Server:</strong> ${config.SERVER}</div><div class="config-item"><strong>Database:</strong> ${config.DATABASE}</div><div class="config-item"><strong>Username:</strong> ${config.USERNAME}</div><div class="config-item"><strong>Port:</strong> ${config.PORT}</div><div class="config-item"><strong>SSL:</strong> ${config.SSL ? 'Enabled' : 'Disabled'}</div><div class="config-item"><strong>Connection:</strong> ${config.CONNECTION_INFO}</div><div class="config-item"><strong>API Endpoint:</strong> ${this.apiBaseUrl}</div>`;
        } else {
            configDisplay.innerHTML = `<div class="config-error"><strong>⚠️ Configuration not loaded</strong><br>Neither .env nor settings.js configuration found.<br><br><strong>API URL:</strong> ${this.apiBaseUrl}</div>`;
        }
    }

    async testConnection() {
        this.setLoading('test-connection', true);
        this.updateConnectionStatus('loading');
        this.addLog(`Testing database connection for: ${this.selectedConnection}`);
        
        try {
            // Test the selected connection using the new endpoint
            const response = await this.makeRequest(`/config/database/${this.selectedConnection}`, {
                method: 'GET'
            });

            if (response.success) {
                this.updateConnectionStatus('connected');
                this.showSuccess(`Database connection successful! (${response.connection_name})`, 'connection-result');
                this.addLog(`✅ Connection successful: ${response.message}`);
                if (response.config) {
                    this.addLog(`📊 Server info: ${JSON.stringify(response.config, null, 2)}`);
                }
            } else {
                throw new Error(response.error || 'Connection failed');
            }
        } catch (error) {
            this.updateConnectionStatus('error');
            // Check if this looks like an API connection failure
            if (error.message.includes('fetch') || error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                handleApiConnectionError(error, 'connection-result');
            } else {
                this.showError(`Connection failed: ${error.message}`, 'connection-result');
            }
            this.addLog(`❌ Connection failed: ${error.message}`);
            
            // Try fallback methods
            await this.tryDirectConnection();
        } finally {
            this.setLoading('test-connection', false);
        }
    }

    async tryDirectConnection() {
        this.addLog('🔄 Attempting direct database connection test...');
        
        try {
            // Since we can't directly connect to PostgreSQL from browser,
            // we'll try to make a request to our Rust backend
            const testData = {
                server: CONFIG.DATABASE.SERVER,
                database: CONFIG.DATABASE.DATABASE,
                username: CONFIG.DATABASE.USERNAME,
                port: CONFIG.DATABASE.PORT,
                ssl: CONFIG.DATABASE.SSL
            };

            this.addLog(`📡 Testing connection with parameters: ${JSON.stringify(testData, null, 2)}`);
            
            // Try alternative endpoints
            const endpoints = ['/health', '/api/health', '/db/status', '/api/db/status'];
            
            for (const endpoint of endpoints) {
                try {
                    this.addLog(`🔍 Trying endpoint: ${endpoint}`);
                    const response = await fetch(`${this.apiBaseUrl.replace('/api', '')}${endpoint}`);
                    
                    if (response.ok) {
                        const data = await response.json();
                        this.addLog(`✅ Endpoint ${endpoint} responded: ${JSON.stringify(data)}`);
                        return;
                    } else {
                        this.addLog(`⚠️ Endpoint ${endpoint} returned ${response.status}: ${response.statusText}`);
                    }
                } catch (err) {
                    this.addLog(`❌ Endpoint ${endpoint} failed: ${err.message}`);
                }
            }
            
            throw new Error('All backend endpoints failed. Make sure the Rust server is running on port 8081.');
            
        } catch (error) {
            this.addLog(`❌ Direct connection test failed: ${error.message}`);
            this.showConnectionHelp();
        }
    }

    showConnectionHelp() {
        const helpMessage = `
<div style="margin-top: 16px; padding: 16px; background: var(--bg-tertiary); border-radius: var(--radius-md);">
    <h4>Connection Troubleshooting:</h4>
    <ol style="margin: 8px 0 0 20px; color: var(--text-secondary);">
        <li>Make sure the Rust backend server is running: <code>cargo run serve</code></li>
        <li>Verify the server is listening on port 8081</li>
        <li>Check that your Azure PostgreSQL credentials are correct</li>
        <li>Ensure your IP is allowed in Azure PostgreSQL firewall rules</li>
        <li>Verify SSL certificate settings for Azure connection</li>
    </ol>
</div>`;
        
        document.getElementById('connection-result').innerHTML += helpMessage;
    }

    async listTables(limit = null) {
        const buttonId = limit ? 'list-10-tables' : 'list-all-tables';
        this.setLoading(buttonId, true);
        const logMessage = limit ? `Fetching first ${limit} database tables from ${this.selectedConnection}...` : `Fetching all database tables from ${this.selectedConnection}...`;
        this.addLog(logMessage);
        
        try {
            // Use the selected connection parameter
            const response = await this.makeRequest(`/tables?connection=${this.selectedConnection}`, {
                method: 'GET'
            });

            if (response.tables) {
                // Limit results if requested
                const tables = limit ? response.tables.slice(0, limit) : response.tables;
                this.displayTables(tables, response.tables.length);
                const foundMessage = limit ? 
                    `✅ Found ${response.tables.length} tables (showing first ${Math.min(limit, response.tables.length)})` :
                    `✅ Found ${response.tables.length} tables (showing all)`;
                this.addLog(foundMessage);
            } else {
                throw new Error('Invalid response format');
            }
        } catch (error) {
            // Check if this looks like an API connection failure
            if (error.message.includes('fetch') || error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                handleApiConnectionError(error, 'tables-result');
            } else {
                this.showError(`Failed to list tables: ${error.message}`, 'tables-result');
            }
            this.addLog(`❌ Table listing failed: ${error.message}`);
            
            // Show mock data for demonstration only if it's not an API connection error
            if (!error.message.includes('fetch')) {
                this.showMockTables();
            }
        } finally {
            this.setLoading(buttonId, false);
        }
    }

    showMockTables() {
        this.addLog('📋 Showing expected SuiteCRM tables based on schema...');
        
        const mockTables = [
            { name: 'accounts', rows: '~1,250', description: 'Customer accounts and organizations' },
            { name: 'contacts', rows: '~3,400', description: 'Individual contact records' },
            { name: 'users', rows: '~45', description: 'System users and administrators' },
            { name: 'opportunities', rows: '~890', description: 'Sales opportunities and deals' },
            { name: 'cases', rows: '~567', description: 'Customer support cases' },
            { name: 'leads', rows: '~234', description: 'Sales leads and prospects' },
            { name: 'campaigns', rows: '~67', description: 'Marketing campaigns' },
            { name: 'meetings', rows: '~1,123', description: 'Scheduled meetings and appointments' },
            { name: 'calls', rows: '~2,456', description: 'Phone calls and communications' },
            { name: 'tasks', rows: '~3,567', description: 'Tasks and activities' }
        ];

        this.displayTables(mockTables);
        
        // Override the count info for mock data
        const tablesCountInfo = document.getElementById('tables-count-info');
        if (tablesCountInfo) {
            tablesCountInfo.innerHTML = `<strong>Mock data</strong> - Expected SuiteCRM tables (actual count available when connected to Azure database)`;
        }
        
        document.getElementById('tables-result').innerHTML = `
            <div class="error-message">
                Note: These are expected tables based on the SuiteCRM schema. 
                Actual counts will be available when database connection is established.
            </div>
        `;
    }

    displayTables(tables, totalCount = null) {
        const tablesList = document.getElementById('tables-list');
        const tablesCountInfo = document.getElementById('tables-count-info');
        
        // Update the count info
        if (tablesCountInfo) {
            const actualTotal = totalCount || tables.length;
            const displayedCount = tables.length;
            const countText = actualTotal === displayedCount ? 
                `<strong>${actualTotal} total tables found</strong> in the actual Azure database (showing all)` :
                `<strong>${actualTotal} total tables found</strong> in the actual Azure database (showing ${displayedCount})`;
            tablesCountInfo.innerHTML = countText;
        }
        
        tablesList.innerHTML = tables.map(table => `
            <div class="table-item">
                <div class="table-name">${table.name}</div>
                <div class="table-info">
                    ${table.row_count !== undefined ? `Rows: ${table.row_count}` : (table.rows ? `Rows: ${table.rows}` : 'Rows: Unknown')}
                    ${table.description ? `<br>${table.description}` : ''}
                </div>
            </div>
        `).join('');

        const actualTotal = totalCount || tables.length;
        const displayedCount = tables.length;
        const successText = actualTotal === displayedCount ? 
            `Displaying all ${displayedCount} tables from Azure database` :
            `Displaying ${displayedCount} of ${actualTotal} total tables from Azure database`;
        this.showSuccess(successText, 'tables-result');
    }

    async checkTable(tableName) {
        this.addLog(`🔍 Checking table: ${tableName} using connection: ${this.selectedConnection}`);
        
        try {
            const response = await this.makeRequest(`/db/table/${tableName}?connection=${this.selectedConnection}`, {
                method: 'GET'
            });

            if (response.success) {
                const data = response.data;
                let tableInfo = data ? 
                    `${data.description || 'Table found'} (${data.column_count || 'unknown'} columns)` : 
                    'Table found';
                
                // Add column list if available
                if (data && data.columns && Array.isArray(data.columns)) {
                    const columnNames = data.columns.map(col => col.name).join(', ');
                    tableInfo += `<br><strong>Columns:</strong> ${columnNames}`;
                }
                
                this.showSuccess(`Table ${tableName}: ${tableInfo}`, 'quick-actions-result');
                this.addLog(`✅ Table ${tableName} check successful: ${JSON.stringify(data)}`);
            } else {
                throw new Error(response.error || 'Table check failed');
            }
        } catch (error) {
            // Check if this looks like an API connection failure
            if (error.message.includes('fetch') || error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                handleApiConnectionError(error, 'quick-actions-result');
            } else {
                this.showError(`Table ${tableName} check failed: ${error.message}`, 'quick-actions-result');
            }
            this.addLog(`❌ Table ${tableName} check failed: ${error.message}`);
        }
    }

    async testSimpleQuery() {
        this.addLog(`🔍 Testing simple database query using connection: ${this.selectedConnection}...`);
        
        try {
            const response = await this.makeRequest(`/db/query?connection=${this.selectedConnection}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query: 'SELECT version() as db_version, current_database() as db_name, current_user as db_user;'
                })
            });

            if (response.success && response.data) {
                this.showSuccess(`Query executed successfully: ${JSON.stringify(response.data)}`, 'quick-actions-result');
                this.addLog(`✅ Query result: ${JSON.stringify(response.data, null, 2)}`);
            } else {
                throw new Error(response.error || 'Query execution failed');
            }
        } catch (error) {
            // Check if this looks like an API connection failure
            if (error.message.includes('fetch') || error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                handleApiConnectionError(error, 'quick-actions-result');
            } else {
                this.showError(`Query failed: ${error.message}`, 'quick-actions-result');
            }
            this.addLog(`❌ Query failed: ${error.message}`);
        }
    }

    async makeRequest(endpoint, options = {}) {
        const url = `${this.apiBaseUrl}${endpoint}`;
        this.addLog(`📡 Making request to: ${url}`);
        
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            ...options
        };

        try {
            const response = await fetch(url, defaultOptions);
            
            this.addLog(`📥 Response status: ${response.status} ${response.statusText}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            this.addLog(`📄 Response data: ${JSON.stringify(data, null, 2)}`);
            
            return data;
        } catch (error) {
            this.addLog(`❌ Request failed: ${error.message}`);
            throw error;
        }
    }

    updateConnectionStatus(status) {
        const indicator = document.getElementById('connection-status');
        if (indicator) {
            indicator.className = `status-indicator ${status}`;
        }
    }

    setLoading(buttonId, isLoading) {
        const button = document.getElementById(buttonId);
        let spinnerId;
        
        if (buttonId.includes('connection')) {
            spinnerId = 'connection-spinner';
        } else if (buttonId === 'list-10-tables') {
            spinnerId = 'tables-10-spinner';
        } else if (buttonId === 'list-all-tables') {
            spinnerId = 'tables-all-spinner';
        } else {
            spinnerId = 'tables-spinner'; // fallback
        }
        
        const spinner = document.getElementById(spinnerId);
        
        if (button) {
            if (isLoading) {
                button.disabled = true;
                if (spinner) spinner.style.display = 'inline-block';
            } else {
                button.disabled = false;
                if (spinner) spinner.style.display = 'none';
            }
        }
    }

    showError(message, containerId) {
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = `<div class="error-message">${message}</div>`;
        }
    }

    showSuccess(message, containerId) {
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = `<div class="success-message">${message}</div>`;
        }
    }

    addLog(message) {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = `[${timestamp}] ${message}`;
        this.log.push(logEntry);
        
        const logOutput = document.getElementById('log-output');
        if (logOutput) {
            logOutput.style.display = 'block';
            logOutput.textContent = this.log.join('\n');
            logOutput.scrollTop = logOutput.scrollHeight;
        }
    }

    clearLog() {
        this.log = [];
        const logOutput = document.getElementById('log-output');
        if (logOutput) {
            logOutput.textContent = '';
            logOutput.style.display = 'none';
        }
        
        // Clear result containers (only if they exist)
        const connectionResult = document.getElementById('connection-result');
        if (connectionResult) connectionResult.innerHTML = '';
        
        const tablesResult = document.getElementById('tables-result');
        if (tablesResult) tablesResult.innerHTML = '';
        
        const quickActionsResult = document.getElementById('quick-actions-result');
        if (quickActionsResult) quickActionsResult.innerHTML = '';
        
        const tablesList = document.getElementById('tables-list');
        if (tablesList) tablesList.innerHTML = '';
        
        this.updateConnectionStatus('');
        this.addLog('Log cleared - ready for new tests');
    }

}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.dbAdmin = new DatabaseAdmin();
});

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DatabaseAdmin;
}