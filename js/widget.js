class ListingsDisplay {
    constructor() {
        this.listings = [];
        this.filteredListings = [];
        this.searchTerm = '';
        this.config = null;
        this.loading = true;
        this.error = null;
        this.showConfigs = {};
        this.currentShow = this.getInitialShow();
        this.currentPage = 1;
        this.itemsPerPage = 200;
        this.searchFields = new Set();
        this.availableFields = new Set();
        this.searchPopupOpen = false;
        this.dataLoaded = false;
        
        this.init();
    }

    async init() {
        try {
            this.showLoadingState("Loading Dataset Choices");
            await this.loadShowConfigs();
            
            this.showLoadingState("Loading listings...");
            
            // If currentShow came from hash, don't update cache on initial load
            const urlParams = new URLSearchParams(window.location.hash.substring(1));
            const fromHash = urlParams.has('list');
            
            if (fromHash) {
                // Load data without updating cache
                await this.loadShowData();
            } else {
                // Normal load, can update cache
                await this.loadShowData();
                this.updateUrlHash(this.currentShow);
            }
            
            this.render();
            this.setupEventListeners();
        } catch (err) {
            console.error('Initialization error:', err);
            this.error = err.message;
            this.loading = false;
            this.render();
        }
    }

    showLoadingState(message) {
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p>${message}</p>
            </div>
        `;
    }

    async loadShowConfigs() {
        try {
            // Try to load adjacent show.json file first
            try {
                const response = await fetch('show.json');
                if (response.ok) {
                    this.showConfigs = await response.json();
                    console.log('Show configs loaded from show.json:', this.showConfigs);
                    return;
                }
            } catch (error) {
                console.log('Could not load show.json, using fallback config');
            }

            // Fallback to embedded show.json configuration
            this.showConfigs = {
                "cities": {
                    "shortTitle": "Team Locations",
                    "listTitle": "Team Locations",
                    "dataTitle": "Team Locations",
                    "datatype": "csv",
                    "dataset": "cities.csv",
                    "markerType": "google",
                    "nameColumn": "city",
                    "featuredColumns": ["City", "Population", "County"],
                    "search": {
                        "In City": "City",
                        "In County Name": "County"
                    },
                    "datastates": ["GA"],
                    "mapInfo": "Cities in Georgia"
                },
                "recyclers": {
                    "listTitle": "B2B Recyclers",
                    "dataTitle": "B2B Recyclers",
                    "googleCSV": "https://docs.google.com/spreadsheets/d/e/2PACX-1vRBRXb005Plt3mmmJunBMk6IejMu-VAJOPdlHWXUpyecTAF-SK4OpfSjPHNMN_KAePShbNsiOo2hZzt/pub?gid=1924677788&single=true&output=csv",
                    "googleCategories": "https://docs.google.com/spreadsheets/d/e/2PACX-1vRBRXb005Plt3mmmJunBMk6IejMu-VAJOPdlHWXUpyecTAF-SK4OpfSjPHNMN_KAePShbNsiOo2hZzt/pub?gid=381237740&single=true&output=csv",
                    "nameColumn": "organization name",
                    "titleColumn": "organization name",
                    "searchFields": "organization name",
                    "addressColumn": "address",
                    "valueColumn": "category",
                    "valueColumnLabel": "Category",
                    "catColumn": "Category",
                    "subcatColumn": "Materials Accepted",
                    "itemsColumn": "Materials Accepted",
                    "color": "#E31C79",
                    "markerType": "google",
                    "search": {
                        "In Main Category": "Category",
                        "In Materials Accepted": "Materials Accepted",
                        "In Location Name": "organization name",
                        "In Address": "address",
                        "In County Name": "county",
                        "In Website URL": "website"
                    },
                    "datastates": ["GA"],
                    "mapInfo": "Add <a href='https://map.georgia.org/recycling/'>B2B&nbsp;Recycler Listings</a> or post comments to submit additions to our <a href='https://docs.google.com/spreadsheets/d/1YmfBPEFpfmaKmxcnxijPU8-esVkhaVBE1wLZqPNOKtY/edit?usp=sharing' target='georgia_recyclers_sheet'>Google&nbsp;Sheet</a>."
                }
            };
            console.log('Using fallback show configs:', this.showConfigs);
        } catch (error) {
            console.error('Error loading show configurations:', error);
            throw error;
        }
    }

    async loadShowData() {
        try {
            this.loading = true;
            this.dataLoaded = false;
            
            const showConfig = this.showConfigs[this.currentShow];
            if (!showConfig) {
                throw new Error(`Could not find show configuration for: ${this.currentShow}`);
            }
            
            this.config = showConfig;
            console.log('Loading data for config:', showConfig);
            
            const data = await this.loadDataFromConfig(showConfig);
            this.listings = data;
            this.filteredListings = data;
            this.currentPage = 1;
            
            this.initializeSearchFields();
            this.dataLoaded = true;
            
            console.log('Data loaded:', data.length, 'items');
            
        } catch (err) {
            console.error('Error loading show data:', err);
            this.error = err.message;
        } finally {
            this.loading = false;
        }
    }

    async loadDataFromConfig(config) {
        try {
            console.log('Loading data from config:', config);
            
            // For demo purposes, create mock data based on the config
            if (config.googleCSV) {
                console.log('Attempting to load from googleCSV:', config.googleCSV);
                return await this.loadGoogleCSV(config.googleCSV);
            } else if (config.dataset) {
                console.log('Attempting to load from dataset:', config.dataset);
                return await this.loadCSVData(config.dataset);
            } else {
                // Create mock data based on the current show
                return this.createMockData(config);
            }
        } catch (error) {
            console.error('Error loading data from config:', error);
            // Fall back to mock data
            return this.createMockData(config);
        }
    }

    createMockData(config) {
        console.log('Creating mock data for:', this.currentShow);
        
        if (this.currentShow === 'cities') {
            // Create more mock data to test pagination
            const cities = [];
            const baseData = [
                { city: "Atlanta", County: "Fulton", state: "Georgia", population: "498715", phone: "4045463000", website: "atlantaga.gov", description: "Capital city of Georgia" },
                { city: "Savannah", County: "Chatham", state: "Georgia", population: "147780", phone: "9126515000", website: "savannahga.gov", description: "Historic coastal city" },
                { city: "Augusta", County: "Richmond", state: "Georgia", population: "202081", phone: "7067904000", website: "augustaga.gov", description: "Home of the Masters Tournament" },
                { city: "Columbus", County: "Muscogee", state: "Georgia", population: "194058", phone: "7065962000", website: "columbusga.gov", description: "Historic river city" },
                { city: "Macon", County: "Bibb", state: "Georgia", population: "153095", phone: "4785512000", website: "maconbibb.us", description: "Heart of Georgia" }
            ];
            
            // Duplicate to create 250+ entries for pagination testing
            for (let i = 0; i < 50; i++) {
                baseData.forEach((cityData, index) => {
                    cities.push({
                        ...cityData,
                        city: `${cityData.city} ${i + 1}`,
                        City: `${cityData.city} ${i + 1}`,
                        phone: cityData.phone.replace(/(\d{3})(\d{3})(\d{4})/, `$1$2${(index + i).toString().padStart(4, '0')}`)
                    });
                });
            }
            
            return cities;
        } else if (this.currentShow === 'recyclers') {
            return [
                {
                    "organization name": "Atlanta Recycling Center",
                    "Category": "Paper",
                    "Materials Accepted": "Cardboard, Office Paper",
                    address: "123 Recycling Way, Atlanta, GA",
                    county: "Fulton",
                    website: "atlantarecycling.com"
                },
                {
                    "organization name": "Savannah Metal Recovery",
                    "Category": "Metal",
                    "Materials Accepted": "Aluminum, Steel, Copper",
                    address: "456 Metal St, Savannah, GA", 
                    county: "Chatham",
                    website: "savannahmetal.com"
                }
            ];
        } else if (this.currentShow === 'landfills') {
            return [
                {
                    Name: "Peach County Landfill",
                    County: "Peach",
                    latitude: "32.5",
                    longitude: "-83.8"
                },
                {
                    Name: "Gwinnett County Landfill", 
                    County: "Gwinnett",
                    latitude: "33.9",
                    longitude: "-84.1"
                }
            ];
        }
        
        return [];
    }

    async loadGoogleCSV(url) {
        try {
            console.log('Fetching CSV from:', url);
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to load CSV: ${response.status} ${response.statusText}`);
            }
            const csvText = await response.text();
            console.log('CSV loaded, length:', csvText.length);
            return this.parseCSV(csvText);
        } catch (error) {
            console.error('Error loading Google CSV:', error);
            throw error;
        }
    }

    async loadCSVData(url) {
        try {
            console.log('Fetching CSV from:', url);
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to load CSV: ${response.status} ${response.statusText}`);
            }
            const csvText = await response.text();
            return this.parseCSV(csvText);
        } catch (error) {
            console.error('Error loading CSV data:', error);
            throw error;
        }
    }

    parseCSV(csvText) {
        try {
            console.log('Parsing CSV...');
            const lines = this.splitCSVIntoLines(csvText.trim());
            if (lines.length < 2) {
                console.warn('CSV has insufficient data');
                return [];
            }
            
            // Parse headers - handle quoted fields
            const headerLine = lines[0];
            const headers = this.parseCSVLine(headerLine);
            console.log('CSV headers:', headers);
            
            const data = [];
            for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim()) {
                    const values = this.parseCSVLine(lines[i]);
                    const row = {};
                    headers.forEach((header, index) => {
                        row[header] = values[index] || '';
                    });
                    data.push(row);
                }
            }
            
            console.log('Parsed CSV data:', data.length, 'rows');
            return data;
        } catch (error) {
            console.error('Error parsing CSV:', error);
            throw error;
        }
    }

    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current.trim());
        return result;
    }

    splitCSVIntoLines(csvText) {
        const lines = [];
        let currentLine = '';
        let inQuotes = false;
        
        for (let i = 0; i < csvText.length; i++) {
            const char = csvText[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
                currentLine += char;
            } else if (char === '\n' && !inQuotes) {
                // Only split on line breaks when not inside quotes
                if (currentLine.trim()) {
                    lines.push(currentLine);
                }
                currentLine = '';
            } else if (char === '\r' && !inQuotes) {
                // Handle Windows line endings - ignore \r when not in quotes
                // The \n will be handled in the next iteration
                if (csvText[i + 1] !== '\n') {
                    // Standalone \r (old Mac format)
                    if (currentLine.trim()) {
                        lines.push(currentLine);
                    }
                    currentLine = '';
                }
            } else {
                currentLine += char;
            }
        }
        
        // Add the last line if it exists
        if (currentLine.trim()) {
            lines.push(currentLine);
        }
        
        return lines;
    }

    initializeSearchFields() {
        this.availableFields.clear();
        if (this.listings.length > 0) {
            Object.keys(this.listings[0]).forEach(key => {
                this.availableFields.add(key);
            });
        }
        
        // Start with no fields selected - show all results initially
        this.searchFields.clear();
        
        console.log('Available fields:', Array.from(this.availableFields));
        console.log('Search fields (initially empty):', Array.from(this.searchFields));
    }

    getRecognizedFields(listing) {
        if (!this.config) return {};
        
        const recognized = {};
        
        // Name field
        if (this.config.nameColumn && listing[this.config.nameColumn]) {
            recognized.name = listing[this.config.nameColumn];
        }
        
        // Title field
        if (this.config.titleColumn && listing[this.config.titleColumn] && this.config.titleColumn !== this.config.nameColumn) {
            recognized.title = listing[this.config.titleColumn];
        }
        
        // Address field
        if (this.config.addressColumn && listing[this.config.addressColumn]) {
            recognized.address = listing[this.config.addressColumn];
        }
        
        // Value/Category field
        if (this.config.valueColumn && listing[this.config.valueColumn]) {
            recognized.category = listing[this.config.valueColumn];
        }
        
        // Common location fields
        ['city', 'City', 'CITY'].forEach(field => {
            if (listing[field] && !recognized.city) {
                recognized.city = listing[field];
            }
        });
        
        ['county', 'County', 'COUNTY'].forEach(field => {
            if (listing[field] && !recognized.county) {
                recognized.county = listing[field];
            }
        });
        
        ['state', 'State', 'STATE'].forEach(field => {
            if (listing[field] && !recognized.state) {
                recognized.state = listing[field];
            }
        });
        
        // Contact fields
        ['phone', 'Phone', 'PHONE', 'telephone'].forEach(field => {
            if (listing[field] && !recognized.phone) {
                recognized.phone = listing[field];
            }
        });
        
        ['email', 'Email', 'EMAIL'].forEach(field => {
            if (listing[field] && !recognized.email) {
                recognized.email = listing[field];
            }
        });
        
        ['website', 'Website', 'WEBSITE', 'url', 'URL'].forEach(field => {
            if (listing[field] && !recognized.website) {
                recognized.website = listing[field];
            }
        });
        
        // Description field
        ['description', 'Description', 'DESCRIPTION', 'details'].forEach(field => {
            if (listing[field] && !recognized.description) {
                recognized.description = listing[field];
            }
        });
        
        // Population field
        ['population', 'Population', 'POPULATION', 'pop'].forEach(field => {
            if (listing[field] && !recognized.population) {
                recognized.population = listing[field];
            }
        });
        
        return recognized;
    }

    getUnrecognizedFields(listing) {
        const recognizedKeys = new Set([
            this.config?.nameColumn,
            this.config?.titleColumn,
            this.config?.addressColumn,
            this.config?.valueColumn,
            'city', 'City', 'CITY',
            'county', 'County', 'COUNTY',
            'state', 'State', 'STATE',
            'zip', 'Zip', 'ZIP', 'zipcode', 'postal_code',
            'population', 'Population', 'POPULATION', 'pop',
            'phone', 'Phone', 'PHONE', 'telephone',
            'email', 'Email', 'EMAIL',
            'website', 'Website', 'WEBSITE', 'url', 'URL',
            'description', 'Description', 'DESCRIPTION', 'details'
        ]);
        
        const unrecognized = {};
        Object.keys(listing).forEach(key => {
            if (!recognizedKeys.has(key) && listing[key] && listing[key].toString().trim()) {
                unrecognized[key] = listing[key];
            }
        });
        
        return unrecognized;
    }

    formatFieldName(fieldName) {
        return fieldName
            .replace(/[_-]/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
    }

    formatFieldValue(value, fieldType = 'text') {
        if (!value) return '';
        
        const strValue = value.toString();
        
        // Format phone numbers
        if (fieldType === 'phone' || /^\+?[\d\s\-\(\)]+$/.test(strValue)) {
            return strValue.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
        }
        
        // Format population numbers
        if (fieldType === 'population' || (fieldType === 'text' && /^\d+$/.test(strValue))) {
            const num = parseInt(strValue);
            if (!isNaN(num) && num > 1000) {
                return num.toLocaleString();
            }
        }
        
        return strValue;
    }

    filterListings() {
        if (!this.searchTerm.trim()) {
            this.filteredListings = this.listings;
        } else {
            // If no search fields are selected, search all fields
            const fieldsToSearch = this.searchFields.size > 0 ? 
                Array.from(this.searchFields) : 
                Array.from(this.availableFields);
            
            this.filteredListings = this.listings.filter(listing => {
                return fieldsToSearch.some(field => {
                    const value = listing[field];
                    return value && value.toString().toLowerCase().includes(this.searchTerm.toLowerCase());
                });
            });
        }
        this.currentPage = 1;
        this.renderListingsOnly();
        
        // Update map with filtered results
        if (window.leafletMap) {
            setTimeout(() => {
                window.leafletMap.updateFromListingsApp(this);
            }, 100);
        }
    }

    getSearchFieldsSummary() {
        if (this.searchFields.size === 0) return 'Select Filters';
        if (this.searchFields.size === this.availableFields.size) return 'All fields';
        
        // Get display names from config if available
        const displayNames = [];
        if (this.config && this.config.search) {
            Object.entries(this.config.search).forEach(([displayName, fieldName]) => {
                if (this.searchFields.has(fieldName)) {
                    displayNames.push(displayName);
                }
            });
        }
        
        // If we have display names, use those
        if (displayNames.length > 0) {
            if (displayNames.length <= 2) {
                return displayNames.join(', ');
            } else {
                return `${displayNames.slice(0, 2).join(', ')}, +${displayNames.length - 2} more`;
            }
        }
        
        // Otherwise use field names
        const fieldNames = Array.from(this.searchFields).slice(0, 2);
        let summary = fieldNames.join(', ');
        
        if (this.searchFields.size > 2) {
            summary += `, +${this.searchFields.size - 2} more`;
        }
        
        if (summary.length > 40) {
            summary = summary.substring(0, 37) + '...';
        }
        
        return summary;
    }

    toggleSearchField(field) {
        if (this.searchFields.has(field)) {
            this.searchFields.delete(field);
        } else {
            this.searchFields.add(field);
        }
        this.filterListings();
    }

    useConfigSearchFields() {
        this.searchFields.clear();
        if (this.config && this.config.search) {
            Object.values(this.config.search).forEach(field => {
                this.searchFields.add(field);
            });
        } else {
            this.availableFields.forEach(field => {
                this.searchFields.add(field);
            });
        }
        this.filterListings();
    }

    toggleSearchPopup() {
        this.searchPopupOpen = !this.searchPopupOpen;
        this.render();
    }

    closeSearchPopup() {
        this.searchPopupOpen = false;
        this.render();
    }

    clearSearch() {
        this.searchTerm = '';
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = '';
        this.filterListings();
    }

    async changeShow(showKey, updateCache = true) {
        this.currentShow = showKey;
        this.searchPopupOpen = false;
        
        // Update URL hash
        this.updateUrlHash(showKey);
        
        // Only save to cache if this is a user-initiated change
        if (updateCache) {
            this.saveCachedShow(showKey);
        }
        
        await this.loadShowData();
        this.render();
        
        // Update map with new show data - ensure map container exists
        setTimeout(() => {
            this.initializeMap();
        }, 100);
    }

    setupEventListeners() {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchTerm = e.target.value;
                this.filterListings();
            });
        }

        const showSelect = document.getElementById('listSelect');
        if (showSelect) {
            showSelect.addEventListener('change', (e) => {
                this.changeShow(e.target.value);
            });
        }

        const clearSearch = document.getElementById('clearSearch');
        if (clearSearch) {
            clearSearch.addEventListener('click', () => {
                this.searchTerm = '';
                const searchInput = document.getElementById('searchInput');
                if (searchInput) searchInput.value = '';
                this.filterListings();
            });
        }

        const searchFieldsBtn = document.getElementById('searchFieldsBtn');
        if (searchFieldsBtn) {
            searchFieldsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleSearchPopup();
            });
        }

        // Close popup when clicking outside
        document.addEventListener('click', (e) => {
            if (this.searchPopupOpen && !e.target.closest('.search-fields-control')) {
                this.closeSearchPopup();
            }
        });

        // Handle details toggle and pagination
        document.addEventListener('click', (e) => {
            // Handle pagination
            if (e.target.classList.contains('pagination-btn') && !e.target.disabled) {
                const page = parseInt(e.target.dataset.page);
                if (!isNaN(page)) {
                    this.changePage(page);
                }
                return;
            }

            // Handle details toggle - check for both the button and arrow
            if (e.target.classList.contains('details-toggle') || 
                e.target.classList.contains('toggle-arrow') ||
                e.target.closest('.details-toggle')) {
                
                e.preventDefault();
                e.stopPropagation();
                
                let toggle = e.target;
                if (e.target.classList.contains('toggle-arrow')) {
                    toggle = e.target.parentElement;
                } else if (!e.target.classList.contains('details-toggle')) {
                    toggle = e.target.closest('.details-toggle');
                }
                
                if (toggle) {
                    const content = toggle.nextElementSibling;
                    const arrow = toggle.querySelector('.toggle-arrow');
                    
                    if (content && arrow) {
                        const isExpanded = content.classList.contains('expanded');
                        
                        if (isExpanded) {
                            content.classList.remove('expanded');
                            arrow.classList.remove('expanded');
                            arrow.textContent = '▶';
                        } else {
                            content.classList.add('expanded');
                            arrow.classList.add('expanded');
                            arrow.textContent = '▼';
                        }
                    }
                }
                return;
            }
        });
    }

    changePage(page) {
        this.currentPage = page;
        this.render();
        // Scroll to top of listings
        const listingsGrid = document.querySelector('.listings-grid');
        if (listingsGrid) {
            listingsGrid.scrollIntoView({ behavior: 'smooth' });
        }
    }

    getTotalPages() {
        return Math.ceil(this.filteredListings.length / this.itemsPerPage);
    }

    getCurrentPageListings() {
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        return this.filteredListings.slice(startIndex, endIndex);
    }

    renderListings() {
        const currentPageListings = this.getCurrentPageListings();
        
        return currentPageListings.map(listing => {
            const displayData = this.getDisplayData(listing);
            const uniqueId = `details-${Math.random().toString(36).substr(2, 9)}`;
            
            // Count additional details (excluding featured columns and coordinates)
            const additionalDetailsCount = Object.entries(listing)
                .filter(([key, value]) => 
                    !(this.config?.featuredColumns || []).includes(key) && 
                    value && 
                    key !== 'latitude' && 
                    key !== 'longitude'
                ).length;
            
            return `
                <div class="listing-card">
                    <div class="listing-content">
                        <div class="listing-name">${displayData.primary || 'No Name'}</div>
                        ${displayData.secondary ? `<div class="listing-info">${displayData.secondary}</div>` : ''}
                        ${displayData.tertiary ? `<div class="listing-info">${displayData.tertiary}</div>` : ''}
                        
                        <div class="details-toggle">
                            <span class="toggle-arrow" id="arrow-${uniqueId}" onclick="toggleDetails('${uniqueId}')">▶</span>
                            <span class="toggle-label" onclick="toggleDetails('${uniqueId}')">Additional Details (${additionalDetailsCount})</span>
                        </div>
                        
                        <div class="details-content" id="${uniqueId}">
                            ${Object.entries(listing)
                                .filter(([key, value]) => 
                                    !(this.config?.featuredColumns || []).includes(key) && 
                                    value && 
                                    key !== 'latitude' && 
                                    key !== 'longitude'
                                )
                                .map(([key, value]) => {
                                    const formattedValue = this.formatFieldValue(value);
                                    const shouldStack = key.length > 16 && formattedValue.length > 38;
                                    const stackedClass = shouldStack ? ' stacked' : '';
                                    
                                    return `
                                        <div class="detail-item${stackedClass}">
                                            <span class="detail-label">${key}:</span>
                                            <span class="detail-value">${formattedValue}</span>
                                        </div>
                                    `;
                                }).join('')}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderNoResults() {
        // Show no results message when data is loaded but filtered results are empty
        if (this.dataLoaded && this.filteredListings.length === 0 && this.searchTerm) {
            return `
                <div class="no-results">
                    <div class="no-results-content">
                        <h3>No results found</h3>
                        <p>No listings match your search for "${this.searchTerm}"</p>
                        <button onclick="window.listingsApp.clearSearch()" class="clear-search-btn">
                            Clear Search
                        </button>
                    </div>
                </div>
            `;
        }
        return '';
    }

    renderEmptyState() {
        // Show empty state when data is loaded but there are no listings at all
        if (this.dataLoaded && this.listings.length === 0) {
            return `
                <div class="empty-state">
                    <div class="empty-state-content">
                        <h3>No listings available</h3>
                        <p>There are currently no listings to display for this dataset.</p>
                    </div>
                </div>
            `;
        }
        return '';
    }

    renderPagination() {
        // Only show pagination if data is loaded and there are multiple pages
        if (!this.dataLoaded || this.filteredListings.length === 0) return '';
        
        const totalPages = this.getTotalPages();
        if (totalPages <= 1) return '';

        const currentPage = this.currentPage;
        const maxVisiblePages = 5;
        
        let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
        
        if (endPage - startPage + 1 < maxVisiblePages) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        const pages = [];
        for (let i = startPage; i <= endPage; i++) {
            pages.push(i);
        }

        return `
            <div class="pagination-container">
                <button class="pagination-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>
                    Previous
                </button>
                
                <div class="page-numbers">
                    ${startPage > 1 ? `
                        <button class="pagination-btn" data-page="1">1</button>
                        ${startPage > 2 ? '<span>...</span>' : ''}
                    ` : ''}
                    
                    ${pages.map(page => `
                        <button class="pagination-btn ${page === currentPage ? 'active' : ''}" data-page="${page}">
                            ${page}
                        </button>
                    `).join('')}
                    
                    ${endPage < totalPages ? `
                        ${endPage < totalPages - 1 ? '<span>...</span>' : ''}
                        <button class="pagination-btn" data-page="${totalPages}">${totalPages}</button>
                    ` : ''}
                </div>
                
                <button class="pagination-btn" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>
                    Next
                </button>
                
                <div class="pagination-info">
                    Page ${currentPage} of ${totalPages}
                </div>
                
                <a href="../edit.html?add=visit" class="add-visit-btn">Add City Visit</a>
            </div>
        `;
    }

    render() {
        const app = document.getElementById('app');
        
        if (this.loading) {
            this.showLoadingState("Loading listings...");
            return;
        }

        if (this.error) {
            app.innerHTML = `
                <div class="error">
                    <div class="error-box">
                        <div class="error-title">Error loading data:</div>
                        <div>${this.error}</div>
                    </div>
                </div>
            `;
            return;
        }

        if (!this.showConfigs || Object.keys(this.showConfigs).length === 0) {
            this.showLoadingState("Loading Dataset Choices");
            return;
        }

        app.innerHTML = `
            <!-- Header -->
            <div class="widgetHeader" style="position:relative">
                <div class="sign-in-container">
                    <button id="signInBtn" class="btn btn-primary" onclick="showAuthModal()">Sign In</button>
                </div>
                <h1>${this.config?.listTitle || 'Listings'}</h1>
                ${this.config?.mapInfo ? `<div class="info">${this.config.mapInfo}</div>` : ''}
            </div>
            <div class="widgetHero" style="position:relative">
            </div>
                
            <!-- Page Content Container -->
            <div id="pageContent">
                <!-- Details Section (Left column on desktop) -->
                <div id="pageDetails">
                    <!-- Controls -->
                    <div class="controls-container">
                        <div class="search-container">
                            ${window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? `
                            <div class="list-selector">
                                <select id="listSelect" class="list-select">
                                    ${Object.keys(this.showConfigs).map(key => 
                                        `<option value="${key}" ${key === this.currentShow ? 'selected' : ''}>${this.showConfigs[key].listTitle || key}</option>`
                                    ).join('')}
                                </select>
                            </div>
                            ` : ''}
                            <div class="search-wrapper">
                                <div class="search-box">
                                    <input
                                        type="text"
                                        id="searchInput"
                                        placeholder="Search listings..."
                                        value="${this.searchTerm}"
                                        class="search-input"
                                    />
                                    <svg class="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                                    </svg>
                                </div>
                                <div class="search-fields-control">
                                    <button id="searchFieldsBtn" class="search-fields-btn ${this.searchPopupOpen ? 'active' : ''}">
                                        ${this.getSearchFieldsSummary()}
                                    </button>
                                    ${this.searchPopupOpen ? this.renderSearchPopup() : ''}
                                </div>
                            </div>
                        </div>
                        <div class="search-results">
                            Showing ${this.getCurrentPageListings().length} of ${this.filteredListings.length} listings
                            ${this.filteredListings.length !== this.listings.length ? ` (${this.listings.length} total)` : ''}
                        </div>
                    </div>

                    <!-- Pagination -->
                    ${this.renderPagination()}
                    
                    <!-- Listings Grid -->
                    <div class="listings-grid">
                        ${this.renderListings()}
                    </div>

                    ${this.renderNoResults()}
                    ${this.renderEmptyState()}
                </div>

                <!-- Right Column (Gallery + Map on desktop) -->
                <div class="right-column">
                    <!-- Gallery Section -->
                    <div id="pageGallery">
                        <!-- ../../img/banner.webp --->
                        <img src="../../../community/img/hero/hero.png" alt="Banner" class="gallery-banner">
                    </div>

                    <!-- Map Section -->
                    <div id="pageMap">
                        <!-- Map Container -->
                        <div id="map" style="width: 100%; height: 500px; margin-bottom: 24px; border-radius: 8px; overflow: hidden;"></div>
                    </div>
                </div>
            </div>
        `;

        // Apply domain-based sign-in button visibility
        this.applySignInVisibility();

        setTimeout(() => {
            this.setupEventListeners();
            this.initializeMap();
        }, 0);
    }
    
    initializeMap() {
        // Check if LeafletMapManager is available
        if (typeof LeafletMapManager === 'undefined') {
            console.warn('LeafletMapManager not available');
            return;
        }
        
        try {
            // Always destroy existing map since DOM container gets recreated
            if (window.leafletMap && window.leafletMap.map) {
                window.leafletMap.map.remove();
                window.leafletMap = null;
            }
            
            // Create new map instance
            window.leafletMap = new LeafletMapManager('map', {
                height: '500px',
                width: '100%'
            });
            
            // Update map with current listings data
            if (this.listings && this.listings.length > 0) {
                setTimeout(() => {
                    window.leafletMap.updateFromListingsApp(this);
                }, 100);
            }
        } catch (error) {
            console.warn('Failed to initialize map:', error);
        }
    }
    
    // URL Hash and Cache Management
    getInitialShow() {
        // Check URL hash first
        const urlParams = new URLSearchParams(window.location.hash.substring(1));
        const hashList = urlParams.get('list');
        if (hashList) {
            return hashList;
        }
        
        // Fall back to cached list
        const cachedList = this.loadCachedShow();
        return cachedList || 'cities';
    }
    
    updateUrlHash(showKey) {
        const currentHash = window.location.hash.substring(1);
        const urlParams = new URLSearchParams(currentHash);
        urlParams.set('list', showKey);
        window.location.hash = urlParams.toString();
    }
    
    saveCachedShow(showKey) {
        try {
            localStorage.setItem('listingsAppShow', showKey);
        } catch (error) {
            console.warn('Failed to save show to cache:', error);
        }
    }
    
    loadCachedShow() {
        try {
            return localStorage.getItem('listingsAppShow');
        } catch (error) {
            console.warn('Failed to load show from cache:', error);
            return null;
        }
    }
    
    getDisplayData(listing) {
        if (!this.config || !this.config.featuredColumns) {
            // Fallback to old behavior
            const recognized = this.getRecognizedFields(listing);
            return {
                primary: recognized.name,
                secondary: recognized.population ? `Population: ${this.formatFieldValue(recognized.population, 'population')}` : null,
                tertiary: recognized.county ? `${recognized.county} County` : null
            };
        }
        
        const featuredColumns = this.config.featuredColumns;
        const data = {};
        
        featuredColumns.forEach((column, index) => {
            const value = listing[column];
            if (value) {
                if (index === 0) {
                    data.primary = value;
                } else if (index === 1) {
                    // Add "Population: " prefix for population data
                    data.secondary = column.toLowerCase().includes('population') ? 
                        `Population: ${this.formatFieldValue(value, 'population')}` : 
                        `${column}: ${this.formatFieldValue(value)}`;
                } else if (index === 2) {
                    // Add " County" suffix for county data
                    data.tertiary = column.toLowerCase().includes('county') ? 
                        `${value} County` : 
                        `${column}: ${value}`;
                }
            }
        });
        
        return data;
    }
    
    applySignInVisibility() {
        const currentHost = window.location.hostname;
        const currentPath = window.location.href;
        
        // Domain restrictions for sign-in button visibility:
        // - localhost and 127.0.0.1 (development)
        // - domains containing "geo" or "location"
        // - harimayooram.github.io (specific deployment)
        const allowSignIn = currentHost.includes('localhost') || 
                           currentHost === '127.0.0.1' || 
                           currentPath.includes('harimayooram.github.io') ||
                           currentHost.includes('geo') ||
                           currentHost.includes('location');
        
        const signInBtn = document.getElementById('signInBtn');
        if (signInBtn) {
            if (allowSignIn) {
                signInBtn.style.display = 'inline-block';
                console.log('Sign-in button enabled for domain:', currentHost);
            } else {
                signInBtn.style.display = 'none';
                console.log('Sign-in button hidden for domain:', currentHost);
            }
        }
    }
}

// Global function for toggle details
window.toggleDetails = function(detailsId) {
    const content = document.getElementById(detailsId);
    const arrow = document.getElementById(`arrow-${detailsId}`);
    
    if (content && arrow) {
        const isExpanded = content.classList.contains('expanded');
        
        if (isExpanded) {
            content.classList.remove('expanded');
            arrow.classList.remove('expanded');
            arrow.textContent = '▶';
        } else {
            content.classList.add('expanded');
            arrow.classList.add('expanded');
            arrow.textContent = '▼';
        }
    }
}



// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (!window.listingsApp) {
        window.listingsApp = new ListingsDisplay();
    }
});