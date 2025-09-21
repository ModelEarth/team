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
        this.mapInitializing = false;
        
        this.init();
    }

    async init() {
        this.showLoadingState("Loading Dataset Choices");
        await this.loadShowConfigs();
        
        this.showLoadingState("Loading listings...");
        
        // If currentShow came from hash, don't update cache on initial load
        const urlParams = new URLSearchParams(window.location.hash.substring(1));
        const fromHash = urlParams.has('list');
        
        if (fromHash) {
            await this.loadShowData();
        } else {
            await this.loadShowData();
            this.updateUrlHash(this.currentShow);
        }
        
        this.render();
        this.setupEventListeners();
    }

    showLoadingState(message) {
        const teamwidget = document.getElementById('teamwidget');
        teamwidget.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p>${message}</p>
            </div>
        `;
    }

    async loadShowConfigs() {
        // Try to load adjacent show.json file first
        const response = await fetch('show.json');
        
        if (response.ok) {
            this.showConfigs = await response.json();
            return;
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
                    "datatype": "csv",
                    "googleCSV": "https://docs.google.com/spreadsheets/d/e/2PACX-1vRBRXb005Plt3mmmJunBMk6IejMu-VAJOPdlHWXUpyecTAF-SK4OpfSjPHNMN_KAePShbNsiOo2hZzt/pub?gid=1924677788&single=true&output=csv",
                    "googleCategories": "https://docs.google.com/spreadsheets/d/e/2PACX-1vRBRXb005Plt3mmmJunBMk6IejMu-VAJOPdlHWXUpyecTAF-SK4OpfSjPHNMN_KAePShbNsiOo2hZzt/pub?gid=381237740&single=true&output=csv",
                    "nameColumn": "organization name",
                    "titleColumn": "organization name",
                    "featuredColumns": ["organization name", "Category", "Materials Accepted"],
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
    }

    async loadShowData() {
        this.loading = true;
        this.dataLoaded = false;
        
        const showConfig = this.showConfigs[this.currentShow];
        
        if (!showConfig) {
            this.error = `Could not find show configuration for: ${this.currentShow}`;
            this.loading = false;
            return;
        }
        
        this.config = showConfig;
        
        const data = await this.loadDataFromConfig(showConfig);
        
        this.listings = data;
        this.filteredListings = data;
        this.currentPage = 1;
        
        this.initializeSearchFields();
        this.dataLoaded = true;
        
        this.loading = false;
        
        // Force a render after a short delay to ensure UI updates
        setTimeout(() => {
            this.render();
        }, 100);
        
        // AGGRESSIVE: Force render again after longer delay if still stuck
        setTimeout(() => {
            if (this.loading && this.listings && this.listings.length > 0) {
                this.loading = false;
                this.render();
            }
        }, 2000);
    }

    async loadDataFromConfig(config) {
        if (config.googleCSV) {
            return await this.loadGoogleCSV(config.googleCSV);
        } else if (config.dataset) {
            return await this.loadCSVData(config.dataset);
        } else {
            return this.createMockData(config);
        }
    }

    createMockData(config) {
        
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
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Failed to load CSV: ${response.status} ${response.statusText}`);
        }
        
        const csvText = await response.text();
        return this.parseCSV(csvText);
    }

    async loadCSVData(url) {
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Failed to load CSV: ${response.status} ${response.statusText}`);
        }
        
        const csvText = await response.text();
        return this.parseCSV(csvText);
    }

    parseCSV(csvText) {
        const lines = this.splitCSVIntoLines(csvText.trim());
        
        if (lines.length < 2) {
            return [];
        }
        
        // Parse headers - handle quoted fields
        const headerLine = lines[0];
        const headers = this.parseCSVLine(headerLine);
        
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
        
        return data;
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
                e.target.classList.contains('toggle-label') ||
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
                            <span class="toggle-arrow" id="arrow-${uniqueId}" data-details-id="${uniqueId}">▶</span>
                            <span class="toggle-label" data-details-id="${uniqueId}">Additional Details (${additionalDetailsCount})</span>
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
                
                <a href="../edit.html?add=visit" class="add-visit-btn">Add Visit</a>
            </div>
        `;
    }

    render() {
        // Force clear loading state if we have data
        if (this.dataLoaded && this.listings && this.listings.length > 0 && this.loading) {
            this.loading = false;
        }
        
        const teamwidget = document.getElementById('teamwidget');
        
        if (this.loading) {
            // FORCE clear loading if we have data but still loading
            if (this.listings && this.listings.length > 0) {
                this.loading = false;
                // Don't return, continue to render
            } else {
                this.showLoadingState("Loading listings...");
                return;
            }
        }

        if (this.error) {
            teamwidget.innerHTML = `
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

        teamwidget.innerHTML = `
            <!-- Header -->
            <div class="widgetHeader" style="position:relative; display:flex; justify-content:space-between; align-items:flex-start;">
                <div style="flex:1;">
                    <h1>${this.config?.listTitle || 'Listings'}</h1>
                    ${this.config?.mapInfo ? `<div class="info">${this.config.mapInfo}</div>` : ''}
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <div id="map-print-download-icons"></div>
                    <div class="sign-in-container">
                        <button id="signInBtn" class="btn btn-primary" onclick="showAuthModal()">Sign In</button>
                    </div>
                </div>
            </div>
            
            <!-- Widget Top Container -->
            <div id="widgetTop">
                <div class="search-results">
                    Showing ${this.getCurrentPageListings().length} of ${this.filteredListings.length} listings
                    ${this.filteredListings.length !== this.listings.length ? ` (${this.listings.length} total)` : ''}
                </div>
                <div class="pagination-container">
                    ${this.renderPagination()}
                </div>
            </div>
            
            <!-- Widget Hero Container -->
            <div id="widgetHero"></div>
                
            <!-- Widget Content Container -->
            <div id="widgetContent">
                <!-- Details Section (Left column on desktop) -->
                <div id="widgetDetailsParent">
                <div id="widgetDetails" myparent="widgetDetailsParent">
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
                                        <span class="button-text">${this.getSearchFieldsSummary()}</span>
                                        <svg class="filter-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46"></polygon>
                                        </svg>
                                    </button>
                                    ${this.searchPopupOpen ? this.renderSearchPopup() : ''}
                                </div>
                                <!-- Expand Icon for Details -->
                                <div class="fullscreen-toggle-container">
                                    <button class="fullscreen-toggle-btn" mywidgetpanel="widgetDetails" onclick="window.listingsApp.myHero()" title="Expand Details">
                                        <svg class="fullscreen-icon expand-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                                        </svg>
                                        <svg class="fullscreen-icon collapse-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: none;">
                                            <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Listings Grid -->
                    <div class="listings-grid">
                        ${this.renderListings()}
                    </div>

                    ${this.renderNoResults()}
                    ${this.renderEmptyState()}
                </div>
                </div>

                <!-- Right Column (Gallery + Map on desktop) -->
                <div class="right-column">
                    <!-- Gallery Section -->
                    <div id="widgetGalleryParent">
                    <div id="pageGallery" myparent="widgetGalleryParent">
                        <!-- Expand Icon for Gallery -->
                        <div class="fullscreen-toggle-container" style="position: absolute; top: 8px; right: 8px; z-index: 10;">
                            <button class="fullscreen-toggle-btn" mywidgetpanel="pageGallery" onclick="window.listingsApp.myHero()" title="Expand Gallery">
                                <svg class="fullscreen-icon expand-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                                </svg>
                                <svg class="fullscreen-icon collapse-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: none;">
                                    <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
                                </svg>
                            </button>
                        </div>
                        <!-- ../../img/banner.webp --->
                        <img src="../../../community/img/hero/hero.png" alt="Banner" class="gallery-banner">
                    </div>
                    </div>
                    <!-- Map Section -->
                    <div id="pageMap" style="position: relative;">
                        <!-- Map Wrapper Container -->
                        <div id="widgetmapWrapper" myparent="pageMap" style="width: 100%; height: 500px; border-radius: 8px; overflow: hidden; position: relative;">
                            <div id="widgetmap" style="width: 100%; height: 100%; border-radius: 8px; overflow: hidden;">
                            </div>
                            <!-- Expand Icon for Map - Outside the map container but inside wrapper -->
                            <div class="fullscreen-toggle-container" style="position: absolute; top: 8px; right: 8px; z-index: 1000;">
                                <button class="fullscreen-toggle-btn" mywidgetpanel="widgetmapWrapper" onclick="window.listingsApp.myHero()" title="Expand Map">
                                    <svg class="fullscreen-icon expand-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                                    </svg>
                                    <svg class="fullscreen-icon collapse-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: none;">
                                        <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Apply domain-based sign-in button visibility
        this.applySignInVisibility();

        setTimeout(() => {
            this.setupEventListeners();
            this.initializeMap();
            this.setupPrintDownloadIcons();
        }, 0);
    }
    
    initializeMap() {
        // Check if LeafletMapManager is available
        if (typeof LeafletMapManager === 'undefined') {
            console.warn('LeafletMapManager not available');
            return;
        }
        
        // Prevent multiple simultaneous initializations
        if (this.mapInitializing) {
            return;
        }
        this.mapInitializing = true;
        
        try {
            // Always destroy existing map since DOM container gets recreated
            if (window.leafletMap && window.leafletMap.map) {
                window.leafletMap.map.remove();
                window.leafletMap = null;
            }
            
            // Create new map instance
            window.leafletMap = new LeafletMapManager('widgetmap', {
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
        } finally {
            this.mapInitializing = false;
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

    myHero(heroDiv, chartTypes = ['widgetmapWrapper', 'widgetDetails', 'pageGallery']) {
        // Get the element that was clicked to trigger the hero mode
        const clickedElement = event?.target || window.event?.target;
        
        if (!clickedElement) {
            console.warn('No event target found for hero mode');
            return;
        }
        
        // Create selector from chartTypes parameter
        const selector = chartTypes.map(type => `#${type}`).join(', ');
        
        // Find the div to move to hero using the mywidgetpanel attribute
        let contentDiv = null;
        
        // Get the button that was clicked
        const button = clickedElement.closest('.fullscreen-toggle-btn');
        if (button) {
            const panelId = button.getAttribute('mywidgetpanel');
            if (panelId) {
                contentDiv = document.getElementById(panelId);
                // Found the target div using mywidgetpanel attribute
                
            }
        }
        
        // Fallback: use the old complex method if mywidgetpanel didn't work
        if (!contentDiv) {
            // Fallback to complex detection if mywidgetpanel not available
            // Look for the target div within the same parent container as the button
            const buttonContainer = button?.closest('[id$="Parent"], #pageMap');
            if (buttonContainer) {
                contentDiv = buttonContainer.querySelector(selector);
                // Found via button container method
            }
            
            // Final fallback: use the old method if the above didn't work
            if (!contentDiv) {
                contentDiv = clickedElement.closest(selector);
                // Found via fallback closest method
            }
        }
        
        if (!contentDiv) {
            console.warn('No valid content div found for hero mode');
            return;
        }
        
        const heroContainer = document.getElementById('widgetHero');
        
        if (!heroContainer) {
            console.error('widgetHero container not found');
            return;
        }
        
        // Get the parent div to hide
        const myparent = contentDiv.getAttribute('myparent');
        const parentDiv = myparent ? document.getElementById(myparent) : contentDiv.parentElement;
        
        // Check if THIS specific content is currently in hero (expanded state)
        // Improved expansion detection - just check if the panel is contained in the hero
        const isExpanded = heroContainer.contains(contentDiv) && heroContainer.style.display !== 'none';
        
        
        // Get the icons from the button (no cloning, so this is always the right button)
        const expandIcon = button?.querySelector('.expand-icon');
        const collapseIcon = button?.querySelector('.collapse-icon');
        
        if (isExpanded) {
            // Collapsing - move panel back to original parent
            if (myparent) {
                const originalParent = document.getElementById(myparent);
                if (originalParent && contentDiv) {
                    // Move the panel back to its original parent
                    contentDiv.style.marginBottom = '';
                    originalParent.appendChild(contentDiv);
                    
                    // If hero container is now empty, hide it
                    if (heroContainer.children.length === 0) {
                        heroContainer.style.display = 'none';
                    }
                    
                    // Show the original parent
                    originalParent.style.display = '';
                    
                    // Update button icons - show expand, hide collapse (panel is now collapsed)
                    if (expandIcon && collapseIcon) {
                        expandIcon.style.display = 'block';
                        collapseIcon.style.display = 'none';
                    }
                    
                    // Re-initialize map if it was the map that was collapsed
                    if (contentDiv.id === 'widgetmapWrapper') {
                        setTimeout(() => {
                            try {
                                this.initializeMap();
                            } catch (error) {
                                console.warn('Map reinitialization error after collapse:', error);
                            }
                        }, 100);
                    }
                }
            }
        } else {
            // Expanding to hero mode - move the actual panel
            
            // If heroDiv parameter is provided, wrap in that container
            if (heroDiv) {
                heroContainer.innerHTML = `<div id="${heroDiv}" style="width: 100%; height: 100%; padding: 20px; box-sizing: border-box;"></div>`;
                const heroWrapper = heroContainer.querySelector(`#${heroDiv}`);
                heroWrapper.appendChild(contentDiv);
            } else {
                // Full screen mode - move panel to hero container
                contentDiv.style.marginBottom = '10px';
                heroContainer.appendChild(contentDiv);
            }
            
            // Hide the parent div
            if (parentDiv) {
                parentDiv.style.display = 'none';
            }
            
            // Show hero container
            heroContainer.style.display = 'block';
            
            // Update button icons - hide expand, show collapse (panel is now expanded)
            if (expandIcon && collapseIcon) {
                expandIcon.style.display = 'none';
                collapseIcon.style.display = 'block';
                
            }
            
            // Re-initialize map if it was the map that was moved
            if (contentDiv.id === 'widgetmapWrapper') {
                setTimeout(() => {
                    try {
                        this.initializeMap();
                    } catch (error) {
                        console.warn('Map reinitialization error after expansion:', error);
                    }
                }, 100);
            }
        }
    }
    
    setupPrintDownloadIcons() {
        if (typeof PrintDownloadWidget !== 'undefined') {
            const data = this.getDataForDownload();
            const options = {
                showMap: true,
                filename: 'listings'
            };
            
            PrintDownloadWidget.addPrintDownloadIcons(
                'map',
                '#map-print-download-icons',
                data,
                options
            );
        }
    }
    
    getDataForDownload() {
        // Return the current filtered listings for download
        return this.filteredListings.map(listing => {
            // Clean up the data for export
            const cleanListing = {};
            Object.keys(listing).forEach(key => {
                if (key !== 'id' && listing[key] !== null && listing[key] !== undefined) {
                    cleanListing[key] = listing[key];
                }
            });
            return cleanListing;
        });
    }
}





// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize if the teamwidget element exists
    const teamwidgetElement = document.getElementById('teamwidget');
    if (teamwidgetElement && !window.listingsApp) {
        window.listingsApp = new ListingsDisplay();
    }
    
    // Create unified global myHero function for all pages
    window.myHero = function(heroDiv, chartTypes) {
        // Default chartTypes based on page type
        if (!chartTypes) {
            chartTypes = teamwidgetElement ? ['widgetmapWrapper', 'widgetDetails', 'pageGallery'] : ['chart2Wrapper', 'sankeyWrapper'];
        }
        
        // If ListingsDisplay is available, use its method
        if (window.listingsApp) {
            return window.listingsApp.myHero(heroDiv, chartTypes);
        }
        
        // Fallback implementation for profile pages
        // Get the element that was clicked to trigger the hero mode
        const clickedElement = event?.target || window.event?.target;
        
        if (!clickedElement) {
            console.warn('No event target found for hero mode');
            return;
        }
        
        // Create selector from chartTypes parameter
        const selector = chartTypes.map(type => `#${type}`).join(', ');
        
        // Find the div to move to hero using the mywidgetpanel attribute
        let contentDiv = null;
        
        // Get the button that was clicked
        const button = clickedElement.closest('.fullscreen-toggle-btn');
        if (button) {
            const panelId = button.getAttribute('mywidgetpanel');
            if (panelId) {
                contentDiv = document.getElementById(panelId);
                // Found the target div using mywidgetpanel attribute
            }
        }
        
        // Fallback: use the old complex method if mywidgetpanel didn't work
        if (!contentDiv) {
            // Fallback to complex detection if mywidgetpanel not available
            // Look for the target div within the same parent container as the button
            const buttonContainer = button?.closest('[id$="Parent"], #pageMap');
            if (buttonContainer) {
                contentDiv = buttonContainer.querySelector(selector);
                // Found via button container method
            }
            
            // Final fallback: use the old method if the above didn't work
            if (!contentDiv) {
                contentDiv = clickedElement.closest(selector);
                // Found via fallback closest method
            }
        }
        
        if (!contentDiv) {
            console.warn('No valid content div found for hero mode');
            return;
        }
        
        const heroContainer = document.getElementById('widgetHero');
        
        if (!heroContainer) {
            console.error('widgetHero container not found');
            return;
        }
        
        // Get the parent div to hide
        const myparent = contentDiv.getAttribute('myparent');
        const parentDiv = myparent ? document.getElementById(myparent) : contentDiv.parentElement;
        
        // Check if THIS specific content is currently in hero (expanded state)
        // Since we move panels instead of cloning, check if the panel's parent is the hero container
        const isExpanded = contentDiv.parentElement === heroContainer || 
                          (heroContainer.children.length > 0 && heroContainer.contains(contentDiv));
        
        // Get the icons from the button (no cloning, so this is always the right button)
        const expandIcon = button?.querySelector('.expand-icon');
        const collapseIcon = button?.querySelector('.collapse-icon');
        
        if (isExpanded) {
            // Collapsing - move panel back to original parent
            if (myparent) {
                const originalParent = document.getElementById(myparent);
                if (originalParent && contentDiv) {
                    // Move the panel back to its original parent
                    contentDiv.style.marginBottom = '';
                    originalParent.appendChild(contentDiv);
                    
                    // If hero container is now empty, hide it
                    if (heroContainer.children.length === 0) {
                        heroContainer.style.display = 'none';
                    }
                    
                    // Show the original parent
                    originalParent.style.display = '';
                    
                    // Update button icons - show expand, hide collapse (panel is now collapsed)
                    if (expandIcon && collapseIcon) {
                        expandIcon.style.display = 'block';
                        collapseIcon.style.display = 'none';
                    }
                    
                    // Trigger chart resize
                    triggerChartResize(contentDiv, 'collapse', chartTypes);
                }
            }
        } else {
            // Expanding to hero mode - move the actual panel
            
            // If heroDiv parameter is provided, wrap in that container
            if (heroDiv) {
                heroContainer.innerHTML = `<div id="${heroDiv}" style="width: 100%; height: 100%; padding: 20px; box-sizing: border-box;"></div>`;
                const heroWrapper = heroContainer.querySelector(`#${heroDiv}`);
                heroWrapper.appendChild(contentDiv);
            } else {
                // Full screen mode - move panel to hero container
                contentDiv.style.marginBottom = '10px';
                heroContainer.appendChild(contentDiv);
            }
            
            // Hide the parent div
            if (parentDiv) {
                parentDiv.style.display = 'none';
            }
            
            // Show hero container
            heroContainer.style.display = 'block';
            
            // Update button icons - hide expand, show collapse (panel is now expanded)
            if (expandIcon && collapseIcon) {
                expandIcon.style.display = 'none';
                collapseIcon.style.display = 'block';
            }
            
            // Trigger chart resize
            triggerChartResize(contentDiv, 'expand', chartTypes);
        }
    };
});

// Shared chart resize function
function triggerChartResize(contentDiv, mode, chartTypes) {
    // Check if this is a chart type that needs resizing
    const needsResize = chartTypes.some(type => 
        contentDiv.id === type || 
        (typeof contentDiv.querySelector === 'function' && contentDiv.querySelector(`#${type}`))
    );
    
    if (needsResize) {
        setTimeout(() => {
            // Trigger window resize event to make charts recalculate their size
            window.dispatchEvent(new Event('resize'));
            
            // Also trigger any custom resize events the charts might listen to
            const resizeEvent = new CustomEvent('chartResize', { 
                detail: { container: contentDiv.id || 'unknown', mode: mode }
            });
            document.dispatchEvent(resizeEvent);
            
            // Force charts to recalculate SVG dimensions
            const svg = contentDiv.querySelector('svg');
            if (svg) {
                svg.removeAttribute('width');
                svg.removeAttribute('height');
                svg.style.width = '100%';
                svg.style.height = '100%';
            }
        }, 100);
    }
}