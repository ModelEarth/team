// Database Admin JavaScript

// A year's per-year database (industrydb_{year}) counts as "comprehensive"
// once its on-disk size passes this many MB. NOT gated on region/country
// coverage in the `region` table or on distinct trade.region2 values --
// comprehensive_push_reference_tables seeds `region` with all 49 Exiobase
// codes on database init regardless of how much trade data actually gets
// loaded, and even a single country's own exports touch most/all of the
// other 48 regions as trade.region2, so either would already read as
// "49 regions" long before the database is actually comprehensive.
// Chosen from real measured per-year database sizes: EXIOBASE_2023 (14
// countries, old per-country loader) is 779MB, EXIOBASE_2019/2021 (1
// country, US) are 416-441MB each -- so this needs real headroom above
// today's largest partial load. No real 49-region comprehensive push has
// completed yet to measure directly; 1500MB is an estimate extrapolated
// from comprehensive's own measured per-region row density (see
// PLAN-comprehensive.md) -- recalibrate this from the first real
// comprehensive run's actual industrydb_{year} size once one completes.
const COMPREHENSIVE_SIZE_MB_THRESHOLD = 1500;

class DatabaseAdmin {
    constructor() {
        // Use config from settings.js if available, otherwise fallback
        this.apiBaseUrl = (typeof CONFIG !== 'undefined' && CONFIG.API) 
            ? CONFIG.API.BASE_URL 
            : 'http://localhost:8081/api';
        this.log = [];
        this.envConfig = null;
        this.selectedConnection = 'EXIOBASE'; // Default to Industry Database
        this.databaseConnectionStatus = {}; // Track individual database connection status
        this.init();
    }

    async init() {
        await this.loadEnvConfig();
        await this.loadExiobaseYears();
        this.setupEventListeners();
        this.displayConfig();
        this.addLog('Database Admin initialized');
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

    // Discovers per-year Industry Databases (e.g. EXIOBASE_2019, EXIOBASE_2021)
    // live from the Azure server and adds them to envConfig.database_connections
    // so they appear in the dropdown and in displayConfig() — no year is
    // hardcoded here, a newly provisioned year is picked up automatically.
    async loadExiobaseYears() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/db/list-exiobase-years`);
            if (!response.ok) return;
            const result = await response.json();
            const years = Array.isArray(result.years) ? result.years : [];
            if (!years.length) return;

            if (!this.envConfig) this.envConfig = {};
            if (!Array.isArray(this.envConfig.database_connections)) this.envConfig.database_connections = [];

            const exiobaseConn = this.envConfig.database_connections.find(c => c.name === 'EXIOBASE');

            years.forEach(year => {
                const name = `EXIOBASE_${year}`;
                if (this.envConfig.database_connections.some(c => c.name === name)) return;
                const config = exiobaseConn
                    ? { ...exiobaseConn.config, database: `${exiobaseConn.config.database}_${year}` }
                    : { server: '', database: `_${year}`, username: '', port: 5432, ssl: true };
                this.envConfig.database_connections.push({
                    name,
                    display_name: `${year} Industry Database`,
                    config
                });
            });

            this.addLog(`Discovered ${years.length} per-year Industry Database(s): ${years.join(', ')}`);
            this.populateConnectionDropdown();
        } catch (error) {
            this.addLog(`Failed to load per-year Industry Databases: ${error.message}`);
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
            
            // Select EXIOBASE as default
            if (connection.name === 'EXIOBASE') {
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
                // Reset connection status indicator when switching databases
                this.updateConnectionStatus('');
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

        const sendTradeDataBtn = document.getElementById('send-trade-data');
        if (sendTradeDataBtn) {
            sendTradeDataBtn.addEventListener('click', () => this.sendTradeData());
        }

        const clearSendStatusBtn = document.getElementById('clear-send-status');
        if (clearSendStatusBtn) {
            clearSendStatusBtn.addEventListener('click', () => this.clearSendStatus());
        }

        const sendYearInput = document.getElementById('send-year');
        if (sendYearInput) {
            sendYearInput.addEventListener('change', () => this.checkYearDatabaseStatus(sendYearInput.value.trim()));
            this.checkYearDatabaseStatus(sendYearInput.value.trim());
        }

        const sendCountriesRefreshBtn = document.getElementById('send-countries-refresh');
        if (sendCountriesRefreshBtn) {
            sendCountriesRefreshBtn.addEventListener('click', () => {
                if (sendYearInput) this.checkYearDatabaseStatus(sendYearInput.value.trim());
            });
        }

        const sendCountriesList = document.getElementById('send-countries-list');
        if (sendCountriesList) {
            sendCountriesList.addEventListener('change', (e) => {
                if (e.target.classList.contains('send-country-cb')) {
                    const country = e.target.dataset.country;
                    const checked = e.target.checked;
                    sendCountriesList
                        .querySelectorAll(`.send-flow-cb[data-country="${country}"]`)
                        .forEach(cb => { cb.checked = checked; });
                } else if (e.target.classList.contains('send-flow-cb')) {
                    const country = e.target.dataset.country;
                    const flowBoxes = sendCountriesList.querySelectorAll(`.send-flow-cb[data-country="${country}"]`);
                    const anyChecked = Array.from(flowBoxes).some(cb => cb.checked);
                    const countryBox = sendCountriesList.querySelector(`.send-country-cb[data-country="${country}"]`);
                    if (countryBox) countryBox.checked = anyChecked;
                }
                this.updateCountriesWarning();
            });
        }
    }

    // Reflects the selected connection's actual database name next to the
    // "Database Tables" card title (e.g. "Database Tables - industrydb_2023").
    updateTablesCardTitle(databaseName) {
        const el = document.getElementById('tables-card-db-name');
        if (!el) return;
        el.textContent = databaseName ? ` - ${databaseName}` : '';
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
                this.updateTablesCardTitle(config.database);
                return;
            }
        }

        // Fallback to default database config
        if (this.envConfig && this.envConfig.database) {
            const config = this.envConfig.database;
            configDisplay.innerHTML = `<div class="config-item"><strong>Source:</strong> .env file</div><div class="config-item"><strong>Server:</strong> ${config.server}</div><div class="config-item"><strong>Database:</strong> ${config.database}</div><div class="config-item"><strong>Username:</strong> ${config.username}</div><div class="config-item"><strong>Port:</strong> ${config.port}</div><div class="config-item"><strong>SSL:</strong> ${config.ssl ? 'Enabled' : 'Disabled'}</div><div class="config-item"><strong>API Endpoint:</strong> ${this.apiBaseUrl}</div>`;
            this.updateTablesCardTitle(config.database);
        } else if (typeof CONFIG !== 'undefined' && CONFIG.DATABASE) {
            const config = CONFIG.DATABASE;
            configDisplay.innerHTML = `<div class="config-item"><strong>Source:</strong> settings.js</div><div class="config-item"><strong>Server:</strong> ${config.SERVER}</div><div class="config-item"><strong>Database:</strong> ${config.DATABASE}</div><div class="config-item"><strong>Username:</strong> ${config.USERNAME}</div><div class="config-item"><strong>Port:</strong> ${config.PORT}</div><div class="config-item"><strong>SSL:</strong> ${config.SSL ? 'Enabled' : 'Disabled'}</div><div class="config-item"><strong>Connection:</strong> ${config.CONNECTION_INFO}</div><div class="config-item"><strong>API Endpoint:</strong> ${this.apiBaseUrl}</div>`;
            this.updateTablesCardTitle(config.DATABASE);
        } else {
            configDisplay.innerHTML = `<div class="config-error"><strong>⚠️ Configuration not loaded</strong><br>Neither .env nor settings.js configuration found.<br><br><strong>API URL:</strong> ${this.apiBaseUrl}</div>`;
            this.updateTablesCardTitle('');
        }
    }

    async testConnection() {
        this.setLoading('test-connection', true);
        this.updateConnectionStatus('loading');
        this.addLog(`Testing database connection for: ${this.selectedConnection}`);
        
        try {
            // Test the selected connection using the correct endpoint
            let endpoint;
            if (this.selectedConnection === 'COMMONS') {
                endpoint = '/db/test-commons-connection';
            } else if (this.selectedConnection === 'EXIOBASE') {
                endpoint = '/db/test-exiobase-connection';
            } else if (this.selectedConnection === 'LOCATIONS') {
                endpoint = '/db/test-locations-connection';
            } else if (/^EXIOBASE_\d{4}$/.test(this.selectedConnection)) {
                const year = this.selectedConnection.slice('EXIOBASE_'.length);
                endpoint = `/db/test-exiobase-year-connection?year=${encodeURIComponent(year)}`;
            } else {
                throw new Error(`Unknown database connection: ${this.selectedConnection}`);
            }
            
            const response = await this.makeRequest(endpoint, {
                method: 'GET'
            });

            if (response.success) {
                this.updateConnectionStatus('connected');
                // Track this database connection as successful
                this.databaseConnectionStatus[this.selectedConnection] = true;
                
                this.showSuccess(`Database connection successful! (${response.database || this.selectedConnection})`, 'connection-result');
                this.addLog(`✅ Connection successful: ${response.message}`);
                if (response.config) {
                    this.addLog(`📊 Server info: ${JSON.stringify(response.config, null, 2)}`);
                }
            } else {
                throw new Error(response.error || 'Connection failed');
            }
        } catch (error) {
            this.updateConnectionStatus('error');
            // Mark this database connection as failed
            this.databaseConnectionStatus[this.selectedConnection] = false;
            
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
            let testData = {};
            if (this.envConfig && this.envConfig.database_connections) {
                const connection = this.envConfig.database_connections.find(conn => conn.name === this.selectedConnection);
                if (connection) {
                    testData = {
                        server: connection.host,
                        database: connection.database,
                        username: connection.username,
                        port: connection.port,
                        ssl: connection.ssl_mode
                    };
                }
            }

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

    // Check if the current database connection is actually working
    isDatabaseConnected() {
        const status = this.databaseConnectionStatus[this.selectedConnection];
        return status === true; // Only true means actually connected
    }

    async listTables(limit = null) {
        const buttonId = limit ? 'list-10-tables' : 'list-all-tables';
        this.setLoading(buttonId, true);
        
        // Clear previous table list immediately
        this.clearTables();
        
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
            
            // No fallback data - only show real database connection data
        } finally {
            this.setLoading(buttonId, false);
        }
    }

    // Removed showMockTables() - no longer showing placeholder data

    clearTables() {
        const tablesList = document.getElementById('tables-list');
        const tablesCountInfo = document.getElementById('tables-count-info');
        const tablesResult = document.getElementById('tables-result');
        
        if (tablesList) {
            tablesList.innerHTML = '';
        }
        if (tablesCountInfo) {
            tablesCountInfo.innerHTML = '';
        }
        if (tablesResult) {
            tablesResult.innerHTML = '';
        }
    }

    displayTables(tables, totalCount = null) {
        const tablesList = document.getElementById('tables-list');
        const tablesCountInfo = document.getElementById('tables-count-info');
        
        // Update the count info
        if (tablesCountInfo) {
            const actualTotal = totalCount || tables.length;
            const displayedCount = tables.length;
            const countText = actualTotal === displayedCount ? 
                `<strong>${actualTotal} total tables found</strong> (showing all)` :
                `<strong>${actualTotal} total tables found</strong> (showing ${displayedCount})`;
            tablesCountInfo.innerHTML = countText;
        }
        
        tablesList.innerHTML = tables.map(table => `
            <div class="table-item" style="cursor: pointer;" data-table="${table.name}" title="Click to view 50 rows">
                <div class="table-name">${table.name}</div>
                <div class="table-info">
                    ${table.row_count !== undefined ? `Rows: ${table.row_count}` : (table.rows ? `Rows: ${table.rows}` : 'Rows: Unknown')}
                    ${table.description ? `<br>${table.description}` : ''}
                </div>
            </div>
        `).join('');

        tablesList.querySelectorAll('.table-item').forEach(item => {
            item.addEventListener('click', () => this.loadTableData(item.dataset.table));
        });

        const actualTotal = totalCount || tables.length;
        const displayedCount = tables.length;
        
        const successText = actualTotal === displayedCount ? 
            `Displaying all ${displayedCount} tables from database` :
            `Displaying ${displayedCount} of ${actualTotal} total tables from database`;
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

    // Separate status thread for the long-running "Send Trade Data to
    // Azure" action, kept out of the main #log-output so a 20-minute
    // send doesn't get buried under whatever else the user clicks
    // meanwhile. Shares the same .log-output CSS class (dark terminal
    // box, same font size) rather than its own styling.
    addSendStatus(message) {
        const timestamp = new Date().toLocaleTimeString();
        if (!this._sendStatusLog) this._sendStatusLog = [];
        this._sendStatusLog.push(`[${timestamp}] ${message}`);
        const el = document.getElementById('send-status-output');
        if (el) {
            el.style.display = 'block';
            el.textContent = this._sendStatusLog.join('\n');
            el.scrollTop = el.scrollHeight;
        }
    }

    clearSendStatus() {
        this._sendStatusLog = [];
        const el = document.getElementById('send-status-output');
        if (el) {
            el.textContent = '';
            el.style.display = 'none';
        }
        const result = document.getElementById('send-result');
        if (result) result.innerHTML = '';
    }

    // Gate for the whole "Countries & flow types" + Send/Clear section: a
    // year whose industrydb_{year} was already loaded via comprehensive
    // mode (exiobase/tradeflow's trade_comprehensive.py, all 49 Exiobase
    // regions) has nothing left for this incremental per-country panel to
    // usefully add, so this hides it and explains why instead. Runs on
    // year change/blur and on the Refresh Country List click, before
    // loadCountriesForYear's GitHub fetch (skipped entirely once a year is
    // detected comprehensive, since there'd be nothing to check). See
    // COMPREHENSIVE_SIZE_MB_THRESHOLD's comment for why this checks size,
    // not region/country coverage.
    async checkYearDatabaseStatus(year) {
        const statusEl = document.getElementById('send-year-size-status');
        const noticeEl = document.getElementById('send-comprehensive-notice');
        const sectionEl = document.getElementById('send-countries-and-actions');
        if (!statusEl || !noticeEl || !sectionEl) return;

        if (!/^\d{4}$/.test(String(year))) {
            statusEl.textContent = '';
            noticeEl.style.display = 'none';
            sectionEl.style.display = '';
            return;
        }

        statusEl.textContent = 'Loading database instance size…';
        noticeEl.style.display = 'none';

        const connection = `EXIOBASE_${year}`;
        let sizeResult;
        try {
            const res = await fetch(`${this.apiBaseUrl}/db/database-size?connection=${encodeURIComponent(connection)}`);
            sizeResult = await res.json();
        } catch (error) {
            sizeResult = { success: false };
        }

        if (!sizeResult || !sizeResult.success) {
            // No industrydb_{year} yet (nothing to compare against) --
            // never blocks the panel; a brand-new year always starts here.
            statusEl.textContent = `${year} Database Instance: not created yet (will be created on first send).`;
            sectionEl.style.display = '';
            return;
        }

        const sizeMb = sizeResult.bytes / (1024 * 1024);
        statusEl.textContent = `${year} Database Instance size: ${sizeMb.toFixed(1)} MB`;

        const isComprehensive = sizeMb >= COMPREHENSIVE_SIZE_MB_THRESHOLD;
        if (isComprehensive) {
            noticeEl.style.display = 'block';
            noticeEl.innerHTML = `The year ${year} is already comprehensive, so there's no need to send trade data to Azure.`;
            sectionEl.style.display = 'none';
        } else {
            noticeEl.style.display = 'none';
            sectionEl.style.display = '';
            this.loadCountriesForYear(year);
        }
    }

    // POST /api/db/insert-trade-data — either into a new annual database
    // (industrydb_{year}, target omitted) or straight into the shared
    // multi-year industrydb (target: "industrydb", adds a real year
    // column — see PLAN-merge.md's Stage 2 direct-import path). Measured
    // ~20 minutes for a full US year end to end (CSV fetch + chunked
    // inserts across all 9 tables); a single fetch() has no built-in
    // timeout, so it's left running rather than polled for completion —
    // only the live row-count status below is polled.
    // Populates #send-countries-list from trade-data's GitHub directory
    // listing for the given year (year/{year}/ subfolders are country
    // codes). US defaults checked (all 3 flow types); every other country
    // defaults unchecked — see updateCountriesWarning for why loading a
    // second country isn't just "more of the same data".
    async loadCountriesForYear(year) {
        const container = document.getElementById('send-countries-list');
        if (!container) return;

        if (!/^\d{4}$/.test(String(year))) {
            container.innerHTML = '<span style="color: var(--text-secondary); font-size:14px;">Enter a valid year first.</span>';
            return;
        }

        container.innerHTML = `<span style="color: var(--text-secondary); font-size:14px;">Loading countries for ${year}&hellip;</span>`;
        try {
            const res = await fetch(`https://api.github.com/repos/ModelEarth/trade-data/contents/year/${year}`);
            if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`);
            const listing = await res.json();
            // Real Exiobase region codes are always 2-letter (ISO country
            // codes, or the 5 "rest of world" aggregates WA/WE/WF/WL/WM) —
            // this excludes non-region folders that occasionally end up in a
            // year's directory (e.g. a "default" folder from a run where no
            // --country was passed to the pipeline; confirmed present in
            // trade-data's year/2023, its own bea-report.md literally says
            // "Country: default"). US always sorts first — see sendTradeData
            // for why (it's the reference country other regions' shared
            // bilateral flows are checked/kept against).
            const countries = listing.filter(e => e.type === 'dir' && /^[A-Z]{2}$/.test(e.name))
                .map(e => e.name)
                .sort((a, b) => (a === 'US' ? -1 : b === 'US' ? 1 : a.localeCompare(b)));
            if (!countries.length) {
                container.innerHTML = `<span style="color: var(--text-secondary); font-size:14px;">No countries found for ${year} in trade-data.</span>`;
                return;
            }
            container.innerHTML = countries.map(c => this.renderCountryRow(c)).join('');
            this.updateCountriesWarning();
        } catch (error) {
            container.innerHTML = `<span style="color: var(--accent-red); font-size:14px;">Failed to load country list: ${error.message}</span>`;
        }
    }

    renderCountryRow(country) {
        const checked = country === 'US' ? 'checked' : '';
        const flow = (name) => `
            <label style="display:flex; align-items:center; gap:4px; font-size:12px; color: var(--text-secondary); cursor:pointer;">
                <input type="checkbox" class="send-flow-cb" data-country="${country}" data-flow="${name}" ${checked}> ${name}
            </label>`;
        return `
            <div class="send-country-row" style="display:flex; align-items:center; gap:10px; padding:6px 8px; background: var(--bg-secondary); border-radius:6px; border:1px solid var(--border-light);">
                <label style="display:flex; align-items:center; gap:6px; font-weight:600; min-width:36px; cursor:pointer;">
                    <input type="checkbox" class="send-country-cb" data-country="${country}" ${checked}> ${country}
                </label>
                ${flow('domestic')}${flow('imports')}${flow('exports')}
            </div>`;
    }

    // Known, confirmed issue (not just a theoretical risk): a bilateral
    // flow like region1=CN,region2=US shows up in both CN's exports file
    // and US's imports file. For 2021 this is safe — verified 4,702/4,702
    // shared CN<->US keys have byte-identical amounts (a pure lookup into
    // Exiobase's country-independent global Z matrix, so trade.py should
    // always produce this). For 2019, it is NOT safe as-is: the non-US
    // 2019 files carry a stray "year" column trade.py no longer emits
    // (confirmed across AU/BR/CN/DE/JP), meaning they were generated by an
    // older pipeline run, and checked amounts diverge from US's own 2019
    // data for the same keys (~95% of a 2000-key sample differed, some by
    // 5-10x) — almost certainly stale or fallback (synthetic) data, not a
    // duplicate of something already correct. See PLAN-merge.md.
    updateCountriesWarning() {
        const container = document.getElementById('send-countries-list');
        const warning = document.getElementById('send-countries-warning');
        const yearInput = document.getElementById('send-year');
        if (!container || !warning) return;

        const selected = Array.from(container.querySelectorAll('.send-country-cb:checked')).map(cb => cb.dataset.country);
        const year = yearInput ? yearInput.value.trim() : '';
        const nonUsSelected = selected.filter(c => c !== 'US');

        if (year === '2019' && nonUsSelected.length > 0) {
            warning.style.display = 'block';
            warning.innerHTML = `<strong>2019 non-US data is confirmed stale/inconsistent</strong> — ` +
                `${nonUsSelected.join(', ')} 2019 file(s) were generated by an older pipeline run ` +
                `(missing schema marker) and their amounts don't match US's own 2019 data for the ` +
                `same bilateral flows. Regenerate with the current <code>trade.py</code> before ` +
                `sending 2019 for these countries. See ` +
                `<a href="https://github.com/ModelEarth/team/blob/main/PLAN-merge.md" target="_blank">PLAN-merge.md</a>.`;
        } else if (nonUsSelected.length > 0) {
            warning.style.display = 'block';
            warning.innerHTML = `<strong>Note:</strong> a bilateral flow (e.g. region1=CN,region2=US) ` +
                `appears in both countries' files (US's imports and CN's exports). The natural-key ` +
                `constraint on <code>trade</code> keeps only one copy, so this is safe as long as both ` +
                `countries' amounts genuinely agree for this year (verified true for 2021) — see ` +
                `<a href="https://github.com/ModelEarth/team/blob/main/PLAN-merge.md" target="_blank">PLAN-merge.md</a>.`;
        } else {
            warning.style.display = 'none';
        }
    }

    async sendTradeData() {
        const yearInput = document.getElementById('send-year');
        const targetSelect = document.getElementById('send-target');
        const countriesContainer = document.getElementById('send-countries-list');
        if (!yearInput || !targetSelect || !countriesContainer) return;

        const year = yearInput.value.trim();
        const target = targetSelect.value; // '' = new annual database, 'industrydb' = shared multi-year db

        if (!/^\d{4}$/.test(year)) {
            this.showError('Enter a valid 4-digit year', 'send-result');
            return;
        }

        // One job per checked country, with only its checked flow types.
        const jobs = [];
        countriesContainer.querySelectorAll('.send-country-cb').forEach(cb => {
            const country = cb.dataset.country;
            const flowTypes = Array.from(
                countriesContainer.querySelectorAll(`.send-flow-cb[data-country="${country}"]:checked`)
            ).map(fb => fb.dataset.flow);
            if (flowTypes.length > 0) jobs.push({ country, flowTypes });
        });

        if (jobs.length === 0) {
            this.showError('Select at least one country (and flow type)', 'send-result');
            return;
        }

        // US always runs first, explicitly — not just relying on the country
        // list's render order (loadCountriesForYear already sorts US first,
        // but this guarantees it even if jobs are ever built another way).
        // Reasons this matters: (1) it's the reference country every other
        // region's shared bilateral flows get checked/kept against — trade's
        // natural-key ON CONFLICT and the skip-before-insert filter both let
        // whichever country loads first "win" a shared flow, so US winning
        // matches how 2021's cross-country amounts were actually verified
        // (US vs. each other country, not the reverse); (2) region.country
        // gets block_index 1 for whichever country is first assigned one in
        // a fresh database — keeping that consistently US across years,
        // even though nothing requires it for correctness, avoids a
        // different country's trade_id landing on the historically
        // "unshifted" 1/1,000,000/2,000,000 range instead.
        jobs.sort((a, b) => (a.country === 'US' ? -1 : b.country === 'US' ? 1 : 0));

        const destinationLabel = target === 'industrydb'
            ? `the shared multi-year IndustryDB (industrydb, tagged year=${year})`
            : `a new annual database (industrydb_${year})`;

        // ~20 minutes measured for one full US year (all 3 flow types +
        // interstate); rough per-job estimate scales down for fewer flow
        // types. Just a guide — actual time varies by country size.
        const estimateMinutes = jobs.reduce((total, job) => {
            const interstateBonus = (job.country === 'US' && job.flowTypes.includes('domestic')) ? 4 : 0;
            return total + 2 + job.flowTypes.length * 6 + interstateBonus;
        }, 0);

        const nonUsJobs = jobs.filter(j => j.country !== 'US');
        const staleWarning = (year === '2019' && nonUsJobs.length > 0)
            ? `\n\n⚠ CONFIRMED STALE DATA: ${nonUsJobs.map(j => j.country).join(', ')} 2019 file(s) are from an ` +
              `older pipeline run with amounts that don't match US's own 2019 data for shared flows. ` +
              `Regenerate with current trade.py first — see PLAN-merge.md.`
            : (nonUsJobs.length > 0
                ? `\n\nNote: non-US countries share bilateral flows with US's data — verified consistent for 2021, see PLAN-merge.md.`
                : '');

        const jobList = jobs.map(j => `${j.country} (${j.flowTypes.join(', ')})`).join('\n  ');
        const confirmed = confirm(
            `Send ${year} trade data to Azure, into ${destinationLabel}?\n\n` +
            `${jobs.length} job(s), run one after another:\n  ${jobList}\n\n` +
            `Estimated total time: ~${estimateMinutes} minutes (rough; varies by country size). ` +
            `The server keeps running each job even if you close this tab — the status log below ` +
            `polls live row counts every 10 seconds while it waits.` +
            staleWarning
        );
        if (!confirmed) return;

        const sendBtn = document.getElementById('send-trade-data');
        const spinner = document.getElementById('send-spinner');
        if (sendBtn) sendBtn.disabled = true;
        if (spinner) spinner.style.display = 'inline-block';

        this.clearSendStatus();

        // Live row-count polling while each job runs server-side — same
        // connection/query shape as this panel's own Test Simple Query.
        const pollConnection = target === 'industrydb' ? 'EXIOBASE' : `EXIOBASE_${year}`;
        const yearFilter = target === 'industrydb' ? ` WHERE year=${parseInt(year, 10)}` : '';
        const pollQuery = `SELECT (SELECT count(*) FROM trade${yearFilter}) AS trade, ` +
            `(SELECT count(*) FROM trade_factor${yearFilter}) AS trade_factor, ` +
            `(SELECT count(*) FROM interstate${yearFilter}) AS interstate, ` +
            `(SELECT count(*) FROM interstate_factor${yearFilter}) AS interstate_factor`;

        let polling = true;
        const pollOnce = async () => {
            try {
                const res = await fetch(`${this.apiBaseUrl}/db/query?connection=${pollConnection}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: pollQuery })
                });
                const data = await res.json();
                if (data.success && data.data && data.data[0]) {
                    const c = data.data[0];
                    this.addSendStatus(
                        `trade=${c.trade ?? 0}  trade_factor=${c.trade_factor ?? 0}  ` +
                        `interstate=${c.interstate ?? 0}  interstate_factor=${c.interstate_factor ?? 0}`
                    );
                }
            } catch (e) {
                // Transient poll failures aren't fatal — the main request is still running.
            }
            if (polling) setTimeout(pollOnce, 10000);
        };
        setTimeout(pollOnce, 10000);

        let anyError = false;
        for (let i = 0; i < jobs.length; i++) {
            const job = jobs[i];
            this.addSendStatus(`Job ${i + 1}/${jobs.length}: ${job.country} (${job.flowTypes.join(', ')}) -> ${destinationLabel}...`);

            const body = { year, country: job.country, flow_types: job.flowTypes };
            if (target) body.target = target;

            try {
                const response = await fetch(`${this.apiBaseUrl}/db/insert-trade-data`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const result = await response.json();
                if (result.success) {
                    this.addSendStatus(`Job ${i + 1}/${jobs.length} (${job.country}) done. ${JSON.stringify(result.inserted)}`);
                } else {
                    anyError = true;
                    this.addSendStatus(`Job ${i + 1}/${jobs.length} (${job.country}) completed with errors: ${JSON.stringify(result.errors)}`);
                }
            } catch (error) {
                anyError = true;
                this.addSendStatus(`Job ${i + 1}/${jobs.length} (${job.country}) request failed: ${error.message}`);
            }
        }

        polling = false;
        if (anyError) {
            this.showError('Completed with errors on at least one job — see status log below.', 'send-result');
        } else {
            this.showSuccess(`${jobs.length} job(s) for ${year} sent to Azure.`, 'send-result');
        }

        if (sendBtn) sendBtn.disabled = false;
        if (spinner) spinner.style.display = 'none';
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

        // Mirror "List All Tables"' spinner onto the Database Tables card
        // itself, where the results actually land -- so it's visible even
        // when that button has scrolled out of view. Hidden the same way
        // the button's own spinner is: setLoading(..., false) runs in
        // listTables()'s `finally`, after displayTables()/showError() has
        // already populated the card.
        if (buttonId === 'list-all-tables') {
            const panelSpinner = document.getElementById('tables-panel-spinner');
            if (panelSpinner) panelSpinner.style.display = isLoading ? 'inline-block' : 'none';
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

    showMock(message, containerId) {
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = `<div class="mock-message">${message}</div>`;
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

    loadTableData(tableName) {
        this.addLog(`📋 Loading table: ${tableName}`);

        const card = document.getElementById('table-data-card');
        const title = document.getElementById('table-data-title');
        const container = document.getElementById('tabulator-tabledata');

        card.style.display = '';
        title.textContent = `Table: ${tableName}`;
        container.innerHTML = '';
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });

        if (this._tableDataTabulator) {
            this._tableDataTabulator.destroy();
            this._tableDataTabulator = null;
        }
        this._tableDataTotal = 0;

        const apiBase = this.apiBaseUrl;
        const connection = this.selectedConnection;

        this._tableDataTabulator = new Tabulator(container, {
            ajaxURL: `${apiBase}/db/table-rows`,
            ajaxRequestFunc: (url, config, params) => {
                const sortField = params.sort?.[0]?.field ?? null;
                const sortDir = params.sort?.[0]?.dir ?? null;
                const total = this._tableDataTotal;
                const size = params.size;
                const page = params.page;

                // Calculate expected record count for this page (only known after first load)
                let countSuffix = '';
                if (total > 0) {
                    const lastPage = Math.ceil(total / size);
                    const remainder = total % size;
                    const expectedCount = (page === lastPage && remainder !== 0) ? remainder : size;
                    countSuffix = ` ${expectedCount} records`;
                }
                const loadingInfo = document.getElementById('table-loading-info');
                if (loadingInfo) loadingInfo.textContent = `Loading${countSuffix}…`;
                requestAnimationFrame(() => {
                    const loaderMsg = container.querySelector('.tabulator-loader-msg')
                        || document.querySelector('.tabulator-loader-msg');
                    if (loaderMsg) loaderMsg.textContent = `Loading${countSuffix}…`;
                });

                return fetch(`${apiBase}/db/table-rows`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        table: tableName,
                        connection,
                        page,
                        size,
                        sort_field: sortField,
                        sort_dir: sortDir,
                    })
                }).then(r => r.json()).then(resp => {
                    if (resp.error) {
                        this.addLog(`❌ ${resp.error}`);
                        container.innerHTML = `<div class="error-message">${resp.error}</div>`;
                        if (loadingInfo) loadingInfo.textContent = '';
                        return { last_page: 1, data: [] };
                    }
                    this._tableDataTotal = resp.total;
                    if (loadingInfo) loadingInfo.textContent = `Loaded ${resp.data.length} of ${resp.total} records`;
                    const rowsLabel = container.querySelector('.table-rows-label');
                    if (rowsLabel) rowsLabel.textContent = `rows of ${resp.total} records`;
                    this.addLog(`✅ Page ${resp.page}/${resp.last_page} (${resp.total} total rows)`);
                    return resp;
                });
            },
            pagination: true,
            paginationMode: 'remote',
            paginationSize: 200,
            paginationButtonCount: 0,
            sortMode: 'remote',
            layout: 'fitColumns',
            responsiveLayout: 'hide',
            tooltips: true,
            movableColumns: true,
            maxHeight: '480px',
            autoColumns: true,
            autoColumnsDefinitions: (definitions) => {
                definitions.forEach(def => {
                    def.headerSortStartingDir = 'desc';
                    def.tooltip = true;
                    const orig = def.formatter;
                    def.formatter = (cell) => {
                        const val = cell.getValue();
                        if (val === null || val === undefined) {
                            return '<span style="color:var(--text-muted)">null</span>';
                        }
                        return orig ? orig(cell) : String(val);
                    };
                });
                return definitions;
            },
        });

        this._tableDataTabulator.on('tableBuilt', () => {
            this._setupTableFooter(container);
        });
    }

    _setupTableFooter(container) {
        const footer = container.querySelector('.tabulator-footer');
        if (!footer) return;

        // Page jump input between prev and next arrows
        const paginator = footer.querySelector('.tabulator-paginator');
        if (paginator) {
            const pageInput = document.createElement('input');
            pageInput.type = 'text';
            pageInput.value = '1';
            pageInput.style.cssText = 'width:3ch; text-align:center; border:1px solid #aaa; border-radius:3px;';
            pageInput.addEventListener('input', function() {
                this.style.width = (this.value.length + 2) + 'ch';
            });
            pageInput.addEventListener('change', () => {
                let page = parseInt(pageInput.value) || 1;
                const max = this._tableDataTabulator.getPageMax();
                if (page > max) { page = max; pageInput.value = max; }
                if (page < 1) { page = 1; pageInput.value = 1; }
                pageInput.style.width = (pageInput.value.toString().length + 2) + 'ch';
                this._tableDataTabulator.setPage(page);
            });
            this._tableDataTabulator.on('pageLoaded', (pageno) => {
                pageInput.value = pageno;
                pageInput.style.width = (pageno.toString().length + 2) + 'ch';
                ['first', 'prev', 'next', 'last'].forEach(name => {
                    const btn = container.querySelector(`.tabulator-page[data-page='${name}']`);
                    if (btn) btn.style.display = btn.disabled ? 'none' : '';
                });
            });
            const nextBtn = paginator.querySelector(".tabulator-page[data-page='next']");
            paginator.insertBefore(pageInput, nextBtn || null);
        }

        // "Showing X rows of Y records" on the left
        const rowsWrap = document.createElement('div');
        rowsWrap.style.cssText = 'float:left; display:flex; align-items:center; gap:4px; padding:4px 8px;';
        const showingLabel = document.createElement('span');
        showingLabel.textContent = 'Showing';
        const rowsInput = document.createElement('input');
        rowsInput.type = 'text';
        rowsInput.value = '200';
        rowsInput.style.cssText = 'width:5ch; text-align:center; border:1px solid #aaa; border-radius:3px;';
        rowsInput.addEventListener('input', function() {
            this.style.width = (this.value.length + 2) + 'ch';
        });
        rowsInput.addEventListener('change', () => {
            let size = parseInt(rowsInput.value) || 200;
            rowsInput.style.width = (rowsInput.value.toString().length + 2) + 'ch';
            this._tableDataTabulator.setPageSize(size);
        });
        const rowsLabel = document.createElement('span');
        rowsLabel.className = 'table-rows-label';
        rowsLabel.textContent = `rows of ${this._tableDataTotal} records`;
        rowsWrap.append(showingLabel, rowsInput, rowsLabel);
        footer.insertBefore(rowsWrap, footer.firstChild);

        // Hide disabled nav arrows initially
        ['first', 'prev', 'next', 'last'].forEach(name => {
            const btn = container.querySelector(`.tabulator-page[data-page='${name}']`);
            if (btn) btn.style.display = btn.disabled ? 'none' : '';
        });
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