//  1. Stores the int_required filtered data in DOM storage only once on initial load
//  2. Apply search filters to the stored data rather than updating the stored data
//  3. Only update DOM storage when the list= parameter changes (new dataset)
document.addEventListener('hashChangeEvent', function (elem) {
    console.log("widget.js detects URL hashChangeEvent");
    mapWidgetChange();
}, false);
function mapWidgetChange() {
    let hash = getHash();
    if (hash.map != priorHash.map) {
        //if (hash.map && window.listingsApp) { // Would rather see an error
        if (hash.map) {
            window.listingsApp.changeShow(hash.map);
        }
    }
}
class ListingsDisplay {
    constructor(options = {}) {
        this.listings = [];
        this.filteredListings = [];
        this.searchTerm = '';
        this.config = null;
        this.loading = true;
        this.error = null;
        this.dataLoadError = null;
        this.enableStateFiltering = false;
        this.usingEmbeddedList = false;
        this.showConfigs = {};
        this.currentShow = this.getInitialShow();
        this.currentPage = 1;
        this.itemsPerPage = 500;
        this.searchFields = new Set();
        this.availableFields = new Set();
        this.searchPopupOpen = false;
        this.dataLoaded = false;
        this.mapInitializing = false;
        
        // Configuration for paths
        this.pathConfig = {
            basePath: options.basePath || this.detectBasePath()
        };
        
        this.init();
        this.setupGlobalEventListeners();
    }

    setupGlobalEventListeners() {
        // Use event delegation for buttons that get re-rendered
        document.addEventListener('click', (e) => {
            if (e.target.closest('#searchFieldsBtn')) {
                e.stopPropagation();
                this.toggleSearchPopup();
            }
        });
    }
    
    detectBasePath() {
        // Use local_app.web_root() to get the webroot, then append team/projects/map/
        if (typeof local_app !== 'undefined' && typeof local_app.web_root === 'function') {
            const web_root = local_app.web_root();
            if (web_root) {
                // Ensure trailing slash and append team/projects/map/
                const baseRoot = web_root.endsWith('/') ? web_root : web_root + '/';
                return baseRoot + 'team/projects/map/';
            }
        }
        
        // Fallback to original logic if local_app.web_root() is not available
        const currentPath = window.location.pathname;
        
        // If we're in display/team/test.html, we need to go back to team/projects/map/
        if (currentPath.includes('/display/team/')) {
            return '../../team/projects/map/';
        }
        
        // If we're in team/projects/map/, use relative path
        if (currentPath.includes('/team/projects/map/')) {
            return './';
        }
        
        // Default fallback - assume we need to reach team/projects/map/ from current location
        return '../../team/projects/map/';
    }

    getDatasetBasePath() {
        // Use local_app.web_root() for dataset paths to ensure they work when embedded
        if (typeof local_app !== 'undefined' && typeof local_app.web_root === 'function') {
            const web_root = local_app.web_root();
            if (web_root) {
                // Ensure trailing slash and append team/projects/map/
                const baseRoot = web_root.endsWith('/') ? web_root : web_root + '/';
                return baseRoot + 'team/projects/map/';
            }
        }
        
        // Fallback to using this.pathConfig.basePath if local_app.web_root() is not available
        return this.pathConfig.basePath;
    }

    async init() {
        this.showLoadingState("Loading Dataset Choices");
        await this.loadShowConfigs();
        
        this.showLoadingState("Loading listings...");
        
        // If currentShow came from hash, don't update cache on initial load
        const urlParams = new URLSearchParams(window.location.hash.substring(1));
        const fromHash = urlParams.has('map'); // True or false

        // TEMPORARY - So Location Visits can avoid maps on some pages.
        // TO DO - This getLoadMapDataParam() is based on file name widget.js  Do we send on localsite.js instead?  And allow for other map too?
        const loadMapDataParam = this.getLoadMapDataParam(); // Check script URL parameter
        //alert("param.showmap " + param.showmap)
        //alert("fromHash " + fromHash)

        if (fromHash) {
            await this.loadShowData();
        } else if (loadMapDataParam) { // Checks for widget.js?showmap=true
            await this.loadShowData();
            
            //this.updateUrlHash(this.currentShow); // Use updateHash instead to avoid triggering
        }
        
        //this.render();
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
        // Check for source parameter in widget.js script URL
        let listsJson = this.getSourceFromScriptUrl();
        
        // If no source parameter, use default logic
        if (!listsJson) {
            listsJson = "trade.json"
            if (Cookies.get('modelsite')?.indexOf("geo") >= 0 || 
                location.host.indexOf("geo") >= 0 || 
                location.host.indexOf("locations.pages.dev") >= 0) {
                listsJson = 'show.json'
            }
        }
        console.log('widget.js: local_app.web_root() =', local_app.web_root());
        console.log(`Loading configuration from: ${local_app.web_root() + "/team/projects/map/" + listsJson}`);
        const response = await fetch(local_app.web_root() + "/team/projects/map/" + listsJson);
        
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
                    }
                }
            };
    }

    async loadShowData() {
        //alert("loadShowData")
        this.loading = true;
        this.dataLoaded = false;
        
        let showConfig = this.showConfigs[this.currentShow];
        
        if (!showConfig) {
            // If requested list not found, use the first available list
            const availableKeys = Object.keys(this.showConfigs);
            if (availableKeys.length > 0) {
                const firstKey = availableKeys[0];
                console.warn(`List "${this.currentShow}" not found, using "${firstKey}" instead`);
                this.currentShow = firstKey;
                showConfig = this.showConfigs[firstKey];
                
                // Update URL hash to reflect the actual list being used
                this.updateUrlHash(firstKey);
            } else {
                this.error = `No show configurations available`;
                this.loading = false;
                return;
            }
        }
        
        this.config = showConfig;
        
        let data = await this.loadDataFromConfig(showConfig);
        
        // Apply int_required filtering if specified
        if (showConfig.int_required && data.length > 0) {
            const intRequiredField = showConfig.int_required;
            const originalCount = data.length;
            data = data.filter(row => {
                const value = row[intRequiredField];
                return value && !isNaN(parseInt(value)) && parseInt(value).toString() === value.toString();
            });
            console.log(`Filtered by int_required (${intRequiredField}): ${data.length} rows remaining from ${originalCount} original rows`);
        }
        
        // Apply state_required filtering if specified and enabled
        if (showConfig.state_required && data.length > 0) {
            const requiredState = showConfig.state_required;
            const originalCount = data.length;
            
            if (this.enableStateFiltering) {
                data = data.filter(row => this.matchesRequiredState(row, requiredState));
                console.log(`State filtering APPLIED: Filtered by state_required (${requiredState}): ${data.length} rows remaining from ${originalCount} original rows`);
            } else {
                console.log(`State filtering SKIPPED: Would have filtered by state_required (${requiredState}), but enableStateFiltering is false. Keeping all ${originalCount} rows.`);
            }
        }
        
        // Sort data alphabetically by primary name field
        if (data.length > 0) {
            data = this.sortDataAlphabetically(data, showConfig);
            console.log(`Sorted ${data.length} rows alphabetically`);
        }
        
        this.listings = data;
        this.filteredListings = data;
        this.currentPage = 1;
        
        // Store filtered data in DOM for download/print functionality
        this.storeDataInDOM(data);
        
        this.initializeSearchFields();
        this.dataLoaded = true;
        
        this.loading = false;
        
        // Force a render after a short delay to ensure UI updates
        //setTimeout(() => {
            this.render();
        //}, 100);
        
        // AGGRESSIVE: Force render again after longer delay if still stuck
        /*
        setTimeout(() => {
            if (this.loading && this.listings && this.listings.length > 0) {
                this.loading = false;
                this.render();
            }
        }, 2000);
        */
    }

    async loadDataFromConfig(config) {
        if (config.googleCSV) {
            //return await this.loadGoogleCSV(config.googleCSV);
            return await this.loadCSVData(config.googleCSV, config);
        } else if (config.dataset.endsWith('.json') ) {
            const datasetUrl = config.dataset.startsWith('http') ? config.dataset : this.getDatasetBasePath() + config.dataset;
            return await this.loadJSONData(datasetUrl);
        } else if (config.dataset) {
            const datasetUrl = config.dataset.startsWith('http') ? config.dataset : this.getDatasetBasePath() + config.dataset;
            return await this.loadCSVData(datasetUrl, config);
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

    async loadGoogleCSV(url, config = null) { /* Probably not needed since the same as loadCSVData */
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Failed to load CSV: ${response.status} ${response.statusText}`);
        }
        
        const csvText = await response.text();
        return this.parseCSV(csvText, config);
    }

    async loadCSVData(url, config = null) {
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Failed to load CSV: ${response.status} ${response.statusText}`);
        }
        
        const csvText = await response.text();
        return this.parseCSV(csvText, config);
    }

    async loadJSONData(url) {
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Failed to load JSON: ${response.status} ${response.statusText}`);
        }
        
        const jsonData = await response.json();
        
        // Convert JSON array to the same format as CSV data
        if (Array.isArray(jsonData) && jsonData.length > 0) {
            return jsonData;
        }
        
        return [];
    }

    parseCSV(csvText, config = null) {
        const lines = this.splitCSVIntoLines(csvText.trim());
        
        if (lines.length === 0) {
            return [];
        }
        
        let headers;
        let dataStartIndex = 1;
        
        // Check if config has allColumns array (for datasets without header row)
        if (config && config.allColumns && Array.isArray(config.allColumns)) {
            headers = config.allColumns;
            dataStartIndex = 0; // Start from first line since there's no header row
            console.log('🔧 Using allColumns for headers:', headers);
            console.log('🔧 Config dataset:', config.dataset);
        } else {
            // Traditional parsing - first row contains headers
            if (lines.length < 2) {
                return [];
            }
            const headerLine = lines[0];
            headers = this.parseCSVLine(headerLine);
            dataStartIndex = 1;
        }
        
        const data = [];
        
        for (let i = dataStartIndex; i < lines.length; i++) {
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

    getFieldMapping() {
        // When allColumns exists, create a mapping from standard field names to allColumns field names
        if (this.config && this.config.allColumns && Array.isArray(this.config.allColumns)) {
            const mapping = {};
            const allColumns = this.config.allColumns;
            
            // Map standard geographic coordinate fields
            allColumns.forEach(field => {
                const lowerField = field.toLowerCase();
                if (lowerField.includes('lat')) {
                    mapping.latitude = field;
                } else if (lowerField.includes('lng') || lowerField.includes('lon')) {
                    mapping.longitude = field;
                }
            });
            
            return mapping;
        }
        
        // Default mapping when no allColumns
        return {
            latitude: 'latitude',
            longitude: 'longitude'
        };
    }

    getRecognizedFields(listing) {
        if (!this.config) return {};
        
        const recognized = {};
        const fieldMapping = this.getFieldMapping();
        
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

    formatKeyName(key) {
        if (!key) return '';
        
        // Words that should not be capitalized unless at the start
        const lowercaseWords = ['in', 'to', 'of', 'for', 'and', 'or', 'but', 'at', 'by', 'with', 'from', 'on', 'as', 'is', 'the', 'a', 'an'];
        // Words that should be all caps
        const uppercaseWords = ['id', 'url'];
        
        return key
            .replace(/_/g, ' ')  // Replace underscores with spaces
            .split(' ')
            .map((word, index) => {
                const lowerWord = word.toLowerCase();
                // Check if word should be all caps
                if (uppercaseWords.includes(lowerWord)) {
                    return word.toUpperCase();
                }
                // Always capitalize the first word, or if it's not in the lowercase list
                if (index === 0 || !lowercaseWords.includes(lowerWord)) {
                    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                }
                return lowerWord;
            })
            .join(' ');
    }

    getStateLookup() {
        return {
            'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
            'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
            'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
            'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
            'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
            'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
            'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
            'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
            'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
            'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming',
            'DC': 'District of Columbia'
        };
    }

    matchesRequiredState(row, requiredState) {
        // If no required state specified, include the row
        if (!requiredState) return true;
        
        const stateLookup = this.getStateLookup();
        const requiredStateLower = requiredState.toLowerCase();
        const requiredStateFull = stateLookup[requiredState.toUpperCase()] || requiredState;
        
        // Check State field first if it exists
        const stateField = Object.keys(row).find(key => key.toLowerCase() === 'state');
        if (stateField && row[stateField]) {
            const stateValue = row[stateField].toString().trim().toLowerCase();
            // Check for exact match (2-char or full name)
            if (stateValue === requiredStateLower || 
                stateValue === requiredStateFull.toLowerCase() ||
                stateLookup[stateValue.toUpperCase()] === requiredStateFull) {
                return true;
            }
        }
        
        // Check Address field if State field doesn't match or doesn't exist
        const addressField = Object.keys(row).find(key => key.toLowerCase() === 'address');
        if (addressField && row[addressField]) {
            const addressValue = row[addressField].toString().toLowerCase();
            
            // Look for 2-character state codes in address
            const stateCodeRegex = /\b([A-Z]{2})\b/gi;
            const stateMatches = addressValue.match(stateCodeRegex);
            if (stateMatches) {
                for (const match of stateMatches) {
                    const matchUpper = match.toUpperCase();
                    if (matchUpper === requiredState.toUpperCase() || 
                        stateLookup[matchUpper] === requiredStateFull) {
                        return true;
                    }
                }
            }
            
            // Look for full state names in address
            for (const [code, fullName] of Object.entries(stateLookup)) {
                if (addressValue.includes(fullName.toLowerCase())) {
                    if (code === requiredState.toUpperCase() || 
                        fullName.toLowerCase() === requiredStateLower) {
                        return true;
                    }
                }
            }
        }
        
        // If no state found in Address or State field, include the row
        return true;
    }

    sortDataAlphabetically(data, config) {
        if (!data || data.length === 0) return data;
        
        // Determine the primary field to sort by
        let sortField = null;
        
        // Priority 1: Use nameColumn from config if specified
        if (config && config.nameColumn) {
            if (config.allColumns && Array.isArray(config.allColumns)) {
                // When allColumns exists, use exact field name matching
                sortField = config.nameColumn;
            } else {
                // Traditional case-insensitive lookup for backward compatibility
                sortField = Object.keys(data[0]).find(key => 
                    key.toLowerCase() === config.nameColumn.toLowerCase()
                );
            }
        }
        
        // Priority 2: Use first featured column if no nameColumn
        if (!sortField && config && config.featuredColumns && config.featuredColumns.length > 0) {
            if (config.allColumns && Array.isArray(config.allColumns)) {
                // When allColumns exists, use exact field name matching
                sortField = config.featuredColumns[0];
            } else {
                // Traditional case-insensitive lookup for backward compatibility
                sortField = Object.keys(data[0]).find(key => 
                    key.toLowerCase() === config.featuredColumns[0].toLowerCase()
                );
            }
        }
        
        // Priority 3: Look for common name fields
        if (!sortField) {
            const commonNameFields = ['name', 'title', 'organization', 'organization name', 'company', 'city'];
            sortField = Object.keys(data[0]).find(key => 
                commonNameFields.some(commonField => 
                    key.toLowerCase().includes(commonField.toLowerCase())
                )
            );
        }
        
        // Priority 4: Use first field if nothing else found
        if (!sortField) {
            sortField = Object.keys(data[0])[0];
        }
        
        // Sort the data
        return data.sort((a, b) => {
            const valueA = a[sortField] ? a[sortField].toString().toLowerCase().trim() : '';
            const valueB = b[sortField] ? b[sortField].toString().toLowerCase().trim() : '';
            
            // Handle empty values - put them at the end
            if (!valueA && !valueB) return 0;
            if (!valueA) return 1;
            if (!valueB) return -1;
            
            return valueA.localeCompare(valueB);
        });
    }

    filterListings() {
        // Store current focus state
        const activeElement = document.activeElement;
        const wasSearchInputFocused = activeElement && activeElement.id === 'searchInput';
        const cursorPosition = wasSearchInputFocused ? activeElement.selectionStart : null;
        
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
        this.render();
        
        // Restore focus and cursor position if search input was focused
        if (wasSearchInputFocused) {
            setTimeout(() => {
                const searchInput = document.getElementById('searchInput');
                if (searchInput) {
                    searchInput.focus();
                    if (cursorPosition !== null) {
                        searchInput.setSelectionRange(cursorPosition, cursorPosition);
                    }
                }
            }, 0);
        }
        
        // Update map with filtered results - only send current page data
        if (window.leafletMap) {
            setTimeout(() => {
                // Create a limited version of this object with only current page data
                const limitedListingsApp = {
                    ...this,
                    filteredListings: this.getCurrentPageListings(),
                    listings: this.getCurrentPageListings(),
                    getMapListings: () => this.getCurrentPageListings()
                };
                window.leafletMap.updateFromListingsApp(limitedListingsApp);
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
        
        // Position the popup after it's rendered
        if (this.searchPopupOpen) {
            setTimeout(() => this.positionSearchPopup(), 0);
        }
    }
    
    positionSearchPopup() {
        return;
        
        const button = document.getElementById('searchFieldsBtn');
        const popup = document.querySelector('.search-fields-popup');
        
        if (button && popup) {
            const buttonRect = button.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const popupHeight = popup.offsetHeight || 300; // fallback height
            
            // Position popup below button, or above if not enough space below
            let top = buttonRect.bottom + 4;
            if (top + popupHeight > viewportHeight) {
                top = buttonRect.top - popupHeight - 4;
            }
            
            // Align right edge of popup with right edge of button
            const left = buttonRect.right - popup.offsetWidth;
            
            popup.style.top = Math.max(4, top) + 'px';
            popup.style.left = Math.max(4, left) + 'px';
        }
    }

    closeSearchPopup() {
        this.searchPopupOpen = false;
        this.render();
    }

    renderSearchPopup() {
        if (this.availableFields.size === 0) return '';
        return `
            <div class="search-fields-popup">
                <div class="search-fields-header">
                    <span style="padding-right:10px">Filter by:</span>
                    <button class="select-all-btn" onclick="window.listingsApp.useConfigSearchFields()">Select All</button>
                </div>
                <div class="search-fields-list">
                    ${Array.from(this.availableFields).map(field => `
                        <div class="search-field-item" onclick="window.listingsApp.toggleSearchField('${field}')">
                            <input type="checkbox" 
                                   id="field-${field.replace(/\s+/g, '-')}" 
                                   ${this.searchFields.has(field) ? 'checked' : ''}
                                   onchange="window.listingsApp.toggleSearchField('${field}')"
                            />
                            <label for="field-${field.replace(/\s+/g, '-')}">${field}</label>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    clearSearch() {
        this.searchTerm = '';
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = '';
        this.filterListings();
    }

    async changeShow(showKey, updateCache = true) {
        //alert("changeShow")
        this.currentShow = showKey;
        this.searchPopupOpen = false;
        
        // Update URL hash
        //this.updateUrlHash(showKey); // Avoid because hash is driving
        
        // Only save to cache if this is a user-initiated change
        if (updateCache) {
            this.saveCachedShow(showKey);
        }
        
        await this.loadShowData(); // Invokes this.render()
        //this.render();
        
        // Force map reinitialization when changing datasets
        /*
        setTimeout(() => {
            console.log('🔍 TRACE: initializeMap() called from changeShow()');
            //this.initializeMap('FROM_CHANGESHOW');
        }, 100);
        */
    }

    setupEventListeners() {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchTerm = e.target.value;
                this.filterListings();
            });
        }

        const showSelect = document.getElementById('mapDataSelect');
        if (showSelect) {
            showSelect.addEventListener('change', (e) => {
                goHash({'map':e.target.value});
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

        // Search fields button handled by global event delegation

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
            const toggleElement = e.target.closest('.details-toggle');
            const isToggleArrow = e.target.classList.contains('toggle-arrow');
            const isToggleLabel = e.target.classList.contains('toggle-label');
            
            if (toggleElement || isToggleArrow || isToggleLabel) {
                e.preventDefault();
                e.stopPropagation();
                
                // Find the toggle container
                let toggle = toggleElement;
                if (!toggle && (isToggleArrow || isToggleLabel)) {
                    toggle = e.target.parentElement;
                    // Make sure we found a details-toggle element
                    if (!toggle || !toggle.classList.contains('details-toggle')) {
                        toggle = e.target.closest('.details-toggle');
                    }
                }
                
                if (toggle && toggle.classList.contains('details-toggle')) {
                    const content = toggle.nextElementSibling;
                    const arrow = toggle.querySelector('.toggle-arrow');
                    
                    if (content && content.classList.contains('details-content') && arrow) {
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

        // Handle window resize and scroll to reposition popup
        window.addEventListener('resize', () => {
            if (this.searchPopupOpen) {
                this.positionSearchPopup();
            }
        });

        window.addEventListener('scroll', () => {
            if (this.searchPopupOpen) {
                this.positionSearchPopup();
            }
        });
    }

    changePage(page) {
        this.currentPage = page;
        this.render();
    }

    getTotalPages() {
        return Math.ceil(this.filteredListings.length / this.itemsPerPage);
    }

    getCurrentPageListings() {
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        return this.filteredListings.slice(startIndex, endIndex);
    }

    // Get listings for map display - returns only current page to avoid performance issues
    getMapListings() {
        return this.getCurrentPageListings();
    }

    renderListings() {
        // Show error inline if there's a data loading error
        if (this.dataLoadError) {
            const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            const errorDetails = isLocalhost ? this.getErrorDetails() : '';
            
            return `
                <div class="listing-error">
                    <div class="error-box">
                        <div class="error-title">Error loading data:</div>
                        <div class="error-message">${this.dataLoadError}</div>
                        ${errorDetails ? `<div class="error-details">${errorDetails}</div>` : ''}
                    </div>
                </div>
            `;
        }
        
        const currentPageListings = this.getCurrentPageListings();
        
        return currentPageListings.map(listing => {
            const displayData = this.getDisplayData(listing);
            const uniqueId = `details-${Math.random().toString(36).substr(2, 9)}`;
            
            // Helper function to check if key is in featured columns
            const isInFeaturedColumns = (key) => {
                const featuredColumns = this.config?.featuredColumns || [];
                
                // When allColumns exists, use exact matching since field names are guaranteed to match
                if (this.config?.allColumns && Array.isArray(this.config.allColumns)) {
                    return featuredColumns.includes(key);
                } else {
                    // Traditional case-insensitive matching for backward compatibility
                    return featuredColumns.some(col => col.toLowerCase() === key.toLowerCase());
                }
            };
            
            // Helper function to check if key is in omit list (case-insensitive)
            const isInOmitList = (key) => {
                const omitList = this.config?.omit_display || [];
                return omitList.some(col => col.toLowerCase() === key.toLowerCase());
            };
            
            // Count additional details (excluding featured columns, omitted fields, and coordinates)
            const fieldMapping = this.getFieldMapping();
            const additionalDetailsCount = Object.entries(listing)
                .filter(([key, value]) => 
                    !isInFeaturedColumns(key) && 
                    !isInOmitList(key) &&
                    value && 
                    value.toString().trim() !== '' &&
                    value.toString().trim() !== '-' &&
                    key !== fieldMapping.latitude && 
                    key !== fieldMapping.longitude
                ).length;
            
            return `
                <div class="listing-card">
                    <div class="listing-content">
                        <div class="listing-name">${displayData.primary || 'No Name'}</div>
                        ${displayData.secondary ? `<div class="listing-info">${displayData.secondary}</div>` : ''}
                        ${displayData.tertiary ? `<div class="listing-info">${displayData.tertiary}</div>` : ''}
                        ${displayData.quaternary ? `<div class="listing-info">${displayData.quaternary}</div>` : ''}
                        ${displayData.quinary ? `<div class="listing-info">${displayData.quinary}</div>` : ''}
                        ${displayData.senary ? `<div class="listing-info">${displayData.senary}</div>` : ''}
                        
                        <div class="details-toggle">
                            <span class="toggle-arrow" id="arrow-${uniqueId}" data-details-id="${uniqueId}">▶</span>
                            <span class="toggle-label" data-details-id="${uniqueId}">Additional Details (${additionalDetailsCount})</span>
                        </div>
                        
                        <div class="details-content" id="${uniqueId}">
                            ${Object.entries(listing)
                                .filter(([key, value]) => 
                                    !isInFeaturedColumns(key) && 
                                    !isInOmitList(key) &&
                                    value && 
                                    value.toString().trim() !== '' &&
                                    value.toString().trim() !== '-' &&
                                    key !== fieldMapping.latitude && 
                                    key !== fieldMapping.longitude
                                )
                                .map(([key, value]) => {
                                    const formattedValue = this.formatFieldValue(value);
                                    const shouldStack = key.length > 16 && formattedValue.length > 38;
                                    const stackedClass = shouldStack ? ' stacked' : '';
                                    
                                    return `
                                        <div class="detail-item${stackedClass}">
                                            <span class="detail-label">${this.formatKeyName(key)}:</span>
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

    getErrorDetails() {
        // Provide detailed error information for localhost debugging
        let details = '<strong>Debug Info (localhost only):</strong><br>';
        
        // Show current configuration
        if (this.currentShow) {
            details += `• Current dataset: <code>${this.currentShow}</code><br>`;
        }
        
        // Show config source
        const listsJson = (Cookies.get('modelsite')?.indexOf("geo") >= 0 || location.host.indexOf("geo") >= 0 || location.host.indexOf("locations.pages.dev") >= 0) ? 'show.json' : 'trade.json';
        details += `• Config file: <code>${this.pathConfig.basePath}${listsJson}</code><br>`;
        
        // Show dataset path if config exists
        if (this.config?.dataset) {
            const datasetPath = this.config.dataset.startsWith('http') ? this.config.dataset : this.pathConfig.basePath + this.config.dataset;
            details += `• Dataset file: <code>${datasetPath}</code><br>`;
        }
        
        // Show base path
        details += `• Base path: <code>${this.pathConfig.basePath}</code><br>`;
        
        // Show available configs
        if (this.showConfigs && Object.keys(this.showConfigs).length > 0) {
            details += `• Available datasets: <code>${Object.keys(this.showConfigs).join(', ')}</code>`;
        } else {
            details += '• No dataset configurations found';
        }
        
        return details;
    }

    getLoadMapDataParam() { // loadMapData
        // Check for loadMapData parameter in widget.js script URL
        const widgetScripts = document.querySelectorAll('script[src*="widget.js"]');
        for (const script of widgetScripts) {
            if (script.src.includes('showmap=')) {
                const scriptUrl = new URL(script.src);
                const loadMapDataParam = scriptUrl.searchParams.get('showmap');
                if (loadMapDataParam === 'true') {
                    console.log(`Using loadMapData parameter: ${loadMapDataParam}`);
                    return true;
                }
            }
        }
        return false;
    }

    getSourceFromScriptUrl() {
        // Check for source parameter in widget.js script URL
        const widgetScripts = document.querySelectorAll('script[src*="widget.js"]');
        for (const script of widgetScripts) {
            if (script.src.includes('source=')) {
                const scriptUrl = new URL(script.src);
                const sourceParam = scriptUrl.searchParams.get('source');
                if (sourceParam) {
                    console.log(`Using source parameter: ${sourceParam}`);
                    return sourceParam;
                }
            }
        }
        return null;
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
                    ←
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
                    →
                </button>
            </div>
        `;
    }

    render() {
        //alert('🔍 RENDER() called');
        console.trace('Render call stack:');
        // Force clear loading state if we have data
        if (this.dataLoaded && this.listings && this.listings.length > 0 && this.loading) {
            this.loading = false;
        }
        
        const teamwidget = document.getElementById('teamwidget');
        if (teamwidget) teamwidget.style.display = 'block';
        
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

        // Store data loading error but don't return early - still show the interface
        if (this.error) {
            this.dataLoadError = this.error;
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
                    <div id="map-print-download-icons" style="padding-top:12px"></div>
                </div>
            </div>
            
            <!-- Widget Hero Container -->
            <div id="widgetHero"></div>
                
            <!-- Widget Content Container -->
            <div id="widgetContent">
                <!-- Details Section (Left column on desktop) -->
                <div id="widgetDetailsParent" class="basePanel">
                <div id="widgetDetails" myparent="widgetDetailsParent" class="basePanel">
                    <!-- Controls -->
                    <div id="widgetDetailsControls" class="basePanelTop basePanelPadding basePanelFadeOut basePanelBackground" style="padding-bottom:0px">
                        <div class="search-container">
                            ${window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? `
                            <div class="map-selector">
                                <select id="mapDataSelect" class="map-select">
                                    ${Object.keys(this.showConfigs).map(key => 
                                        `<option value="${key}" ${key === this.currentShow ? 'selected' : ''}>${this.showConfigs[key].menuTitle || this.showConfigs[key].shortTitle || this.showConfigs[key].listTitle || key}</option>`
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
                    <div class="listings-scroll-container">
                        ${this.searchPopupOpen ? this.renderSearchPopup() : ''}
                        <div class="listings-grid basePanelPadding" style="padding-top:0px">
                            ${this.renderListings()}
                        </div>
                    </div>

                    ${this.renderNoResults()}
                    ${this.renderEmptyState()}
                    
                    <!-- Widget Details Bottom Container -->
                    <div id="widgetDetailsBottom">
                        <div class="search-results">
                            ${this.getCurrentPageListings().length === this.filteredListings.length ? 
                                `${this.filteredListings.length}` : 
                                `${this.getCurrentPageListings().length} of ${this.filteredListings.length}`}
                            ${this.filteredListings.length !== this.listings.length ? ` (${this.listings.length} total)` : ''}
                            ${this.config?.shortTitle ? ` ${this.config.shortTitle}` : ''}
                        </div>
                        <div class="pagination-container" style="${this.filteredListings.length <= 500 ? 'display: none;' : ''}">
                            ${this.renderPagination()}
                        </div>
                    </div>
                </div>
                </div>

                <!-- Right Column (Gallery + Map on desktop) -->
                <div class="right-column">
                    <!-- Gallery Section -->
                    <div id="widgetGalleryParent" style="display:none">
                    <div id="pageGallery" myparent="widgetGalleryParent" style="display:none" class="earth">
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
                        <!--
                        <img src="../../../community/img/hero/hero.png" alt="Banner" class="gallery-banner">
                        -->
                    </div>
                    </div>
                    <!-- Map Section -->
                    <div id="pageMap" style="position: relative;">
                        <!-- Map Wrapper Container -->
                        <div id="widgetmapWrapper" myparent="pageMap" style="width: 100%; height: 100%; border-radius: 8px; overflow: hidden; position: relative;">
                            <div id="widgetmap" style="width: 100%; height: 100%; border-radius: 8px; overflow: hidden;">
                            </div>
                            <!-- Add Visit Button - Upper Left Corner -->
                            <div style="position: absolute; top: 8px; left: 8px; z-index: 1000;">
                                <a href="/team/projects/edit.html?add=visit" class="btn add-visit-btn list-cities" style="display:none">Add Visit</a>
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

        //setTimeout(() => {
            this.setupEventListeners();
            //this.conditionalMapInit();
            this.initializeMap('FROM_RENDER conditionalMapInit');
            this.setupPrintDownloadIcons();
        //}, 0);
    }
    
    //conditionalMapInit() {
    //    console.log('🔍 TRACE: conditionalMapInit() called from render()');
    //    this.initializeMap('FROM_RENDER conditionalMapInit');
    //}
    
    initializeMap(source = 'UNKNOWN') {
        //alert("initializeMap called from: " + source)
        console.log('🚨 INITIALIZEMAP CALLED FROM:', source);
        console.trace('Call stack:');
        // Check if LeafletMapManager is available
        if (typeof LeafletMapManager === 'undefined') {
            console.warn('LeafletMapManager not available');
            return;
        }
        
        // Prevent multiple simultaneous initializations
        if (this.mapInitializing) {
            console.log('Map initialization already in progress, skipping...');
            return;
        }
        this.mapInitializing = true;
        
        waitForElm('#widgetmap').then((elm) => {
            try {
                // More thorough cleanup of existing map
                if (window.leafletMap && window.leafletMap.map) {
                    try {
                        // Stop any ongoing animations/transitions
                        window.leafletMap.map.stop();
                        
                        // Remove all event listeners
                        window.leafletMap.map.off();
                        
                        // Clear any pending timeouts/animations
                        window.leafletMap.map._clearPans && window.leafletMap.map._clearPans();
                        
                        // Remove the map
                        window.leafletMap.map.remove();
                        
                        // Clean up DOM references
                        const container = document.getElementById('widgetmap');
                        if (container && container._leaflet_id) {
                            delete container._leaflet_id;
                        }
                        if (container && container._leaflet) {
                            delete container._leaflet;
                        }
                        
                    } catch (e) {
                        console.warn('Error removing existing map:', e);
                    }
                    window.leafletMap = null;
                }
                
                // Create new map instance
                window.leafletMap = new LeafletMapManager('widgetmap', {
                    height: '500px',
                    width: '100%'
                });
                
                // Update map with current listings data - only send current page data
                if (this.listings && this.listings.length > 0) {
                    setTimeout(() => {
                        // Create a limited version of this object with only current page data
                        const limitedListingsApp = {
                            ...this,
                            filteredListings: this.getCurrentPageListings(),
                            listings: this.getCurrentPageListings(),
                            getMapListings: () => this.getCurrentPageListings()
                        };
                        window.leafletMap.updateFromListingsApp(limitedListingsApp);
                    }, 100);
                }
            } catch (error) {
                console.warn('Failed to initialize map:', error);
            } finally {
                this.mapInitializing = false;
            }
        });
    }
    
    // URL Hash and Cache Management
    getInitialShow() {
        // Check URL hash first - prioritize map= parameter
        const urlParams = new URLSearchParams(window.location.hash.substring(1));
        const hashMap = urlParams.get('map');
        
        if (hashMap) {
            return hashMap;
        }
        
        // Check for map parameter in widget.js script URL (from widget-embed.js)
        const widgetScripts = document.querySelectorAll('script[src*="widget.js"]');
        for (const script of widgetScripts) {
            if (script.src.includes('?map=')) {
                const scriptUrl = new URL(script.src);
                const embedMap = scriptUrl.searchParams.get('map');
                if (embedMap) {
                    this.usingEmbeddedList = true;
                    console.log(`Using embedded map parameter: ${embedMap}`);
                    return embedMap;
                }
            }
        }
        
        // Fall back to cached list
        const cachedList = this.loadCachedShow();
        return cachedList || 'cities';
    }
    
    updateUrlHash(showKey) {
        // Don't update hash when using embedded map parameter
        if (this.usingEmbeddedList) {
            console.log(`Skipping hash update - using embedded map parameter: ${showKey}`);
            return;
        }
        
        console.log("Add #map=" + showKey);
        updateHash({'map':showKey}); // Avoid triggering hash event, like goHash() would.

        /*
        const currentHash = window.location.hash.substring(1);
        const urlParams = new URLSearchParams(currentHash);
        urlParams.set('map', showKey);
        window.location.hash = urlParams.toString();
        */
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
        
        // Skip nameColumn if it's also in featuredColumns to avoid duplication
        const nameColumn = this.config.nameColumn;
        const filteredFeaturedColumns = nameColumn ? 
            featuredColumns.filter(col => col !== nameColumn) : 
            featuredColumns;
        
        // Set primary display from nameColumn if specified, otherwise first featuredColumn
        if (nameColumn) {
            let nameValue;
            if (this.config.allColumns && Array.isArray(this.config.allColumns)) {
                nameValue = listing[nameColumn];
            } else {
                const actualNameColumn = Object.keys(listing).find(key => 
                    key.toLowerCase() === nameColumn.toLowerCase()
                ) || nameColumn;
                nameValue = listing[actualNameColumn];
            }
            if (nameValue) {
                data.primary = nameValue;
            }
        } else if (featuredColumns.length > 0) {
            // Use first featured column as primary if no nameColumn
            let value;
            if (this.config.allColumns && Array.isArray(this.config.allColumns)) {
                value = listing[featuredColumns[0]];
            } else {
                const actualColumnName = Object.keys(listing).find(key => 
                    key.toLowerCase() === featuredColumns[0].toLowerCase()
                ) || featuredColumns[0];
                value = listing[actualColumnName];
            }
            if (value) {
                data.primary = value;
            }
        }
        
        // Create array to hold all featured fields (excluding the primary name field)
        const featuredFields = [];
        const columnsToShow = nameColumn ? filteredFeaturedColumns : featuredColumns.slice(1);
        
        columnsToShow.forEach((column) => {
            let actualColumnName;
            let value;
            
            // When allColumns exists, use exact field name matching since field names are guaranteed to match allColumns
            if (this.config.allColumns && Array.isArray(this.config.allColumns)) {
                actualColumnName = column;
                value = listing[column];
            } else {
                // Traditional case-insensitive lookup for backward compatibility
                actualColumnName = Object.keys(listing).find(key => 
                    key.toLowerCase() === column.toLowerCase()
                ) || column;
                value = listing[actualColumnName];
            }
            
            if (value && value.toString().trim()) {
                // Format the field display
                let formattedDisplay;
                if (column.toLowerCase().includes('population')) {
                    formattedDisplay = `Population: ${this.formatFieldValue(value, 'population')}`;
                } else if (column.toLowerCase().includes('county')) {
                    formattedDisplay = `${value} County`;
                } else {
                    formattedDisplay = `${this.formatKeyName(column)}: ${this.formatFieldValue(value)}`;
                }
                featuredFields.push(formattedDisplay);
            }
        });
        
        // Assign featured fields to secondary, tertiary, etc.
        if (featuredFields.length > 0) data.secondary = featuredFields[0];
        if (featuredFields.length > 1) data.tertiary = featuredFields[1];
        if (featuredFields.length > 2) data.quaternary = featuredFields[2];
        if (featuredFields.length > 3) data.quinary = featuredFields[3];
        if (featuredFields.length > 4) data.senary = featuredFields[4];
        
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
                                console.log('🔍 TRACE: initializeMap() called from hero collapse');
                                this.initializeMap('FROM_HERO_COLLAPSE');
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
                        console.log('🔍 TRACE: initializeMap() called from hero expand');
                        this.initializeMap('FROM_HERO_EXPAND');
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
            
            // Get map name from current hash or config for filename
            let listName = 'listings';
            if (typeof getHash === 'function') {
                const hashParams = getHash();
                listName = hashParams.map || listName;
            }
            
            // If we have config with a title, use that instead
            if (this.config && (this.config.shortTitle || this.config.listTitle)) {
                listName = this.config.shortTitle || this.config.listTitle;
                // Clean filename - remove spaces and special characters
                listName = listName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
            }
            
            const options = {
                showMap: true,
                filename: listName
            };
            
            // Check if rightTeamControls exists, otherwise use default location
            const rightTeamControls = document.getElementById('rightTeamControls');
            const targetSelector = rightTeamControls ? '#rightTeamControls' : '#map-print-download-icons';
            
            PrintDownloadWidget.addPrintDownloadIcons(
                'map',
                targetSelector,
                data,
                options
            );
        }
    }
    
    storeDataInDOM(data) {
        // Store data in DOM as base64 encoded JSON to handle quotes and special characters
        const dataElement = document.getElementById('widget-stored-data') || document.createElement('div');
        dataElement.id = 'widget-stored-data';
        dataElement.style.display = 'none';
        
        // Clean up the data for storage
        const cleanedData = data.map(listing => {
            const cleanListing = {};
            Object.keys(listing).forEach(key => {
                if (key !== 'id' && listing[key] !== null && listing[key] !== undefined) {
                    cleanListing[key] = listing[key];
                }
            });
            return cleanListing;
        });
        
        // Base64 encode to safely handle quotes and special characters including Unicode
        const jsonString = JSON.stringify(cleanedData);
        const encodedData = btoa(unescape(encodeURIComponent(jsonString)));
        dataElement.setAttribute('data-widget-listings', encodedData);
        
        if (!document.getElementById('widget-stored-data')) {
            document.body.appendChild(dataElement);
        }
        
        console.log(`Stored ${cleanedData.length} rows in DOM for download/print functionality`);
    }

    getDataForDownload() {
        // Get base data from DOM storage instead of pulling fresh
        const dataElement = document.getElementById('widget-stored-data');
        if (dataElement && dataElement.getAttribute('data-widget-listings')) {
            try {
                const encodedData = dataElement.getAttribute('data-widget-listings');
                const decodedString = decodeURIComponent(escape(atob(encodedData)));
                let baseData = JSON.parse(decodedString);
                console.log(`Retrieved ${baseData.length} rows from DOM storage for filtering and download`);
                
                // Apply current search filters to the stored data
                if (this.searchTerm.trim()) {
                    const fieldsToSearch = this.searchFields.size > 0 ? 
                        Array.from(this.searchFields) : 
                        Array.from(this.availableFields);
                    
                    baseData = baseData.filter(listing => {
                        return fieldsToSearch.some(field => {
                            const value = listing[field];
                            return value && value.toString().toLowerCase().includes(this.searchTerm.toLowerCase());
                        });
                    });
                    console.log(`Applied search filter "${this.searchTerm}": ${baseData.length} rows remaining`);
                }
                
                return baseData;
            } catch (error) {
                console.warn('Error retrieving data from DOM storage, falling back to current filtered listings:', error);
            }
        }
        
        // Fallback to current filtered listings if DOM storage fails
        return this.filteredListings.map(listing => {
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

// Initialize the application when DOM is loaded or immediately if already loaded
function initializeWidget() {
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
}

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

// Check if DOM is already loaded, otherwise wait for it
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeWidget);
} else {
    // DOM already loaded, initialize immediately (handles dynamic loading)
    initializeWidget();
}