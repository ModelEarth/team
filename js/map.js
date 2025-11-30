//  1. Stores the int_required filtered data in DOM storage only once on initial load
//  2. Apply search filters to the stored data rather than updating the stored data
//  3. Only update DOM storage when the list= parameter changes (new dataset)

document.addEventListener('hashChangeEvent', function (elem) {
    console.log("team/js/map.js detects URL hashChangeEvent");
    waitForElm('#mapwidget').then((elm) => {
        mapWidgetChange();
    });
}, false);
function mapWidgetChange() {
    let hash = getHash();
    //let currentMap = hash.map || window.param.map;
    if (hash.map != priorHash.map) {
        if (!hash.map) {
            // Hide #mapwidget here. First rename #widgetwidget to something distinct
        } else {
            // Check if listingsApp exists before calling changeShow
            if (hash.map && window.listingsApp && typeof window.listingsApp.changeShow === 'function') {
                window.listingsApp.changeShow(hash.map);
            } else {
                console.log("Maybe no changeShow function yet. currentMap: " + currentMap);
            }
        }
    }
    
    // Check for summarize parameter changes
    if (hash.summarize !== priorHash.summarize) {
        if (window.listingsApp) {
            if (hash.summarize === 'true') {
                debugAlert('📊 Hash change detected: Summarize = true');
                window.listingsApp.SummarizeList();
            } else {
                debugAlert('📊 Hash change detected: Summarize = false/cleared');
                window.listingsApp.UnsummarizeList();
            }
            
            // Update button text if it exists
            const summarizeButton = document.getElementById('summarize-toggle');
            if (summarizeButton) {
                summarizeButton.textContent = hash.summarize === 'true' ? 'Unsummarize' : 'Summarize';
            }
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
        this.currentShow = this.getCurrentList();
        this.currentPage = 1;
        this.itemsPerPage = 500;
        this.searchFields = new Set();
        this.availableFields = new Set();
        this.searchPopupOpen = false;
        this.dataLoaded = false;
        this.mapInitializing = false;
        this.initialMapLoad = true;
        this.isFilteringInProgress = false;
        this.geoMergeInfo = null; // Track geo dataset merge information
        
        // Configuration for paths
        this.pathConfig = {
            basePath: options.basePath || this.detectBasePath()
        };
        
        this.init();
        this.setupGlobalEventListeners();

        // Initialize debug message queue watcher
        ListingsDisplay.initDebugDivWatcher();
    }

    // Static properties for debug message queue
    static debugMessageQueue = [];
    static debugDivReady = false;
    static debugDivCheckStarted = false;

    // Initialize debug div watcher
    static initDebugDivWatcher() {
        if (this.debugDivCheckStarted) return;
        this.debugDivCheckStarted = true;

        const checkForDiv = () => {
            const debugDiv = document.getElementById('debug-messages');
            if (debugDiv) {
                console.log('✅ debug-messages div found, flushing queue with', this.debugMessageQueue.length, 'messages');
                this.debugDivReady = true;
                this.flushDebugMessageQueue();
            } else {
                // Keep checking every 100ms
                setTimeout(checkForDiv, 100);
            }
        };
        checkForDiv();
    }

    static flushDebugMessageQueue() {
        const debugDiv = document.getElementById('debug-messages');
        if (!debugDiv || this.debugMessageQueue.length === 0) return;

        console.log('📤 Flushing', this.debugMessageQueue.length, 'queued messages to debug div');

        // Insert all queued messages (oldest first, so they appear in correct order)
        this.debugMessageQueue.reverse().forEach(html => {
            debugDiv.insertAdjacentHTML('afterbegin', html);
        });

        this.debugMessageQueue = [];
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
        
        //this.showLoadingState("Loading Dataset Choices");
        await this.loadShowConfigs();
        
        // If currentShow came from hash, don't update cache on initial load
        const urlParams = new URLSearchParams(window.location.hash.substring(1));
        const fromHash = urlParams.has('map'); // True or false

        // TEMPORARY - So Location Visits can avoid maps on some pages.
        // Use param object (set in localsite.js) instead of checking script URL directly
        //const loadMapDataParam = (typeof param !== 'undefined' && param.showmap === 'true') || (typeof param !== 'undefined' && param.showmap === true);
        
        //alert("param.showmap " + param.showmap)
        //alert("fromHash " + fromHash)

        if (fromHash || window.param.map) {
            this.showLoadingState("Loading listings...");
            await this.loadShowData();
        //} else if (loadMapDataParam) { // Checks for map.js?showmap=true
        } 

        /*
        else if (window.param.map) {
            hash.map = window.param.map;
            alert("hash.map " + hash.map)
            await this.loadShowData();
            
            //this.updateUrlHash(this.currentShow); // Use updateHash instead to avoid triggering
        }
        */

        //this.render();
        this.setupEventListeners();
    }
    
    showLoadingState(message) {
        const mapwidget = document.getElementById('mapwidget');
        mapwidget.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p>${message}</p>
            </div>
        `;
    }

    async loadShowConfigs() {
        // Check for source parameter from param object (set in localsite.js)
        let listsJson = (typeof param !== 'undefined' && param.source) ? param.source : null;
        
        // If no source parameter, use default logic
        if (!listsJson) {
            listsJson = "trade.json"
            if (Cookies.get('modelsite')?.indexOf("geo") >= 0 || 
                location.host.indexOf("geo") >= 0 || 
                location.host.indexOf("locations.pages.dev") >= 0) {
                listsJson = 'show.json'
            }
        }
        console.log('map.js: local_app.web_root() =', local_app.web_root());
        console.log(`Loading configuration from: ${local_app.web_root() + "/team/projects/map/" + listsJson}`);
        const response = await fetch(local_app.web_root() + "/team/projects/map/" + listsJson);
        
        if (response.ok) {
            this.showConfigs = await response.json();
            return;
        }

        // Fallback to embedded show.json configuration
        this.showConfigs = {
                "cities": {
                    "shortTitle": "Team Locations (fallback)",
                    "listTitle": "Team Locations (fallback)",
                    "dataTitle": "Team Locations (fallback)",
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
        console.log("loadShowData: " + this.currentShow);
        this.loading = true;
        this.dataLoaded = false;
        
        let showConfig = this.showConfigs[this.currentShow];
        
        let alwaysLoadSomething = false;
        if (window.param.showmap != "false") {
            alwaysLoadSomething = true;
        }
        //alert(alwaysLoadSomething); // Hmm, this is also true for tabs. Figure out if we need alwaysLoadSomething.
        if (!showConfig && alwaysLoadSomething) { // AVOIDING, ELSE TABS ALWAYS SHOW THE FIRST MAP
            
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
        
        // If no showConfig found and alwaysLoadSomething is false, exit early
        if (!showConfig) {
            this.error = null;
            this.loading = false;
            return;
        }
        
        this.config = showConfig;
        
        // Clear any previous geo merge info
        this.geoMergeInfo = null;
        
        let data = await this.loadDataFromConfig(showConfig);
        
        // Merge geoDataset if specified in showConfig
        if (showConfig.geoDataset && showConfig.geoColumns && showConfig.geoColumns.length > 0) {
            debugAlert('🌍 GEO MERGE: Loading geoDataset: ' + showConfig.geoDataset);
            data = await this.mergeGeoDataset(data, showConfig);
        }
        
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
        
        debugAlert("loadShowData() this.isDatasetChanging: " + this.isDatasetChanging)
        
        // Force a render first to create UI structure
        this.render();
        
        // Check if initial load should show summary view after UI is rendered
        const currentHash = this.getCurrentHash();
        if (currentHash.summarize === 'true' && this.config?.geoColumns && this.config.geoColumns.length > 0) {
            debugAlert('📊 INITIAL LOAD: Summarize detected in hash, showing summary view after render');
            setTimeout(() => {
                this.SummarizeList();
            }, 100); // Small delay to ensure render completes
            return;
        }
        
        // Render was already called above (no need for duplicate render call)
        
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
        // Check for offline mode - use dataset_offline if onlinemode cookie is false
        const onlineMode = Cookies.get('onlinemode');
        if (onlineMode === 'false' && config.dataset_offline) {
            console.log('Offline mode active - using dataset_offline:', config.dataset_offline);
            // Temporarily override dataset with dataset_offline
            config = {...config, dataset: config.dataset_offline};
        }

        // Check if dataset_via_api (fast API) is configured
        if (config.dataset_via_api && config.dataset_via_api.trim() !== '') {
            console.log('Loading data from fast API:', config.dataset_via_api);
            return await this.loadAPIData(config.dataset_via_api, config);
        }
        // For slow APIs (dataset_api_slow), we don't auto-load, only use local dataset
        // The "Refresh Local" button will fetch from slow API and save to local file
        else if (config.googleCSV) {
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

    async mergeGeoDataset(primaryData, config) {
        try {
            debugAlert('🌍 GEO MERGE: Starting geo dataset merge');
            
            // Load the geo dataset
            const geoDatasetUrl = config.geoDataset.startsWith('http') ? config.geoDataset : this.getDatasetBasePath() + config.geoDataset;
            debugAlert('🌍 GEO MERGE: Loading geo data from: ' + geoDatasetUrl);
            
            let geoData;
            if (config.geoDataset.endsWith('.json')) {
                geoData = await this.loadJSONData(geoDatasetUrl);
            } else {
                geoData = await this.loadCSVData(geoDatasetUrl, config);
            }
            
            debugAlert('🌍 GEO MERGE: Loaded ' + geoData.length + ' geo records');
            
            // Debug: Show first primary data row structure
            if (primaryData.length > 0) {
                debugAlert('🔍 DEBUG: Primary data columns: ' + Object.keys(primaryData[0]).join(', '));
                debugAlert('🔍 DEBUG: First row data: ' + JSON.stringify(primaryData[0]));
            }
            
            // Get the merge column (first item in geoColumns array)
            const mergeColumn = config.geoColumns[0];
            debugAlert('🌍 GEO MERGE: Merging on column: ' + mergeColumn);
            
            // State abbreviation lookup (full name -> 2-char code)
            const stateNameToCode = {
                'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
                'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
                'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
                'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
                'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
                'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
                'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
                'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
                'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
                'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY',
                'district of columbia': 'DC'
            };
            
            // Check if this is a Location field that needs to be split
            const isLocationField = mergeColumn.toLowerCase() === 'location';
            
            if (isLocationField) {
                debugAlert('🌍 GEO MERGE: Location field detected, will split into City and State');
                
                // Debug: Show first few raw values in Location field
                debugAlert('🔍 DEBUG: First 3 Location field values:');
                for (let i = 0; i < Math.min(3, primaryData.length); i++) {
                    const rawValue = primaryData[i][mergeColumn];
                    debugAlert(`  ${i}: Location="${rawValue}" (type: ${typeof rawValue})`);
                }
                
                // Process primary data to split Location into City and State
                primaryData.forEach((primaryRow, index) => {
                    const locationValue = primaryRow[mergeColumn];
                    if (locationValue && typeof locationValue === 'string') {
                        const firstCommaIndex = locationValue.indexOf(',');
                        if (firstCommaIndex !== -1) {
                            const city = locationValue.substring(0, firstCommaIndex).trim();
                            const statePart = locationValue.substring(firstCommaIndex + 1).trim();
                            
                            // Debug logging for first few entries
                            if (index < 3) {
                                debugAlert(`🔍 LOCATION SPLIT ${index}: "${locationValue}" → City: "${city}", State: "${statePart}"`);
                            }
                            
                            // Convert full state name to abbreviation if needed
                            const stateCode = stateNameToCode[statePart.toLowerCase()] || statePart;
                            
                            // Add City field if not already present
                            if (!primaryRow.hasOwnProperty('City')) {
                                primaryRow.City = city;
                            }
                            
                            // Add State field if not already present
                            if (!primaryRow.hasOwnProperty('State')) {
                                primaryRow.State = stateCode;
                            }
                        } else {
                            // Only city provided (no comma found)
                            if (!primaryRow.hasOwnProperty('City')) {
                                primaryRow.City = locationValue.trim();
                            }
                        }
                    }
                });
                
                debugAlert('🌍 GEO MERGE: Completed Location splitting');
            }
            
            // Create a lookup map from geo data for efficient merging
            const geoLookup = {};
            
            // Support different case variations for geo dataset columns
            const getCityField = (geoRow) => {
                return geoRow.City || geoRow.CITY || geoRow.city;
            };
            
            const getStateField = (geoRow) => {
                // Use config.geoStateTarget if specified, otherwise fallback to common state field names
                if (config.geoStateTarget && Array.isArray(config.geoStateTarget) && config.geoStateTarget.length > 0) {
                    // geoStateTarget is an array, use the first element as the state field name
                    const stateFieldName = config.geoStateTarget[0];
                    const stateValue = geoRow[stateFieldName] || geoRow[stateFieldName.toUpperCase()] || geoRow[stateFieldName.toLowerCase()];
                    if (stateValue) {
                        debugAlert(`🌍 GEO STATE: Using config field '${stateFieldName}' = '${stateValue}'`);
                    }
                    return stateValue;
                }
                // Fallback to common state field names
                const stateValue = geoRow.State || geoRow.STATE || geoRow.STATE_CODE || geoRow.state;
                if (stateValue) {
                    debugAlert(`🌍 GEO STATE: Using fallback field = '${stateValue}'`);
                }
                return stateValue;
            };
            
            if (isLocationField) {
                // Create lookup using City and optionally State
                geoData.forEach(geoRow => {
                    const geoCity = getCityField(geoRow);
                    const geoState = getStateField(geoRow);
                    
                    if (geoCity) {
                        // Create keys for both city-only and city+state combinations
                        const cityKey = geoCity.toLowerCase();
                        geoLookup[cityKey] = geoRow;
                        
                        if (geoState) {
                            const cityStateKey = `${cityKey}|${geoState.toLowerCase()}`;
                            geoLookup[cityStateKey] = geoRow;
                        }
                    }
                });
            } else {
                // Regular lookup using the merge column
                geoData.forEach(geoRow => {
                    const keyValue = geoRow[mergeColumn];
                    if (keyValue) {
                        geoLookup[keyValue] = geoRow;
                    }
                });
            }
            
            debugAlert('🌍 GEO MERGE: Created lookup with ' + Object.keys(geoLookup).length + ' entries');
            
            // Merge geo data into primary data
            let mergedCount = 0;
            let addedColumns = new Set();
            let unmatchedValues = new Set(); // Track unmatched values efficiently
            
            primaryData.forEach(primaryRow => {
                let geoRow = null;
                let lookupKey = null;
                
                if (isLocationField) {
                    // Special handling for Location field
                    const city = primaryRow.City;
                    const state = primaryRow.State;
                    
                    if (city && state) {
                        // Try city+state first for more precise matching
                        const cityStateKey = `${city.toLowerCase()}|${state.toLowerCase()}`;
                        geoRow = geoLookup[cityStateKey];
                        lookupKey = `${city}, ${state}`;
                        
                        if (!geoRow) {
                            // Fallback to city-only if city+state doesn't match
                            const cityKey = city.toLowerCase();
                            geoRow = geoLookup[cityKey];
                            lookupKey = city;
                        }
                    } else if (city) {
                        // Only city available, use city-only lookup
                        const cityKey = city.toLowerCase();
                        geoRow = geoLookup[cityKey];
                        lookupKey = city;
                    }
                } else {
                    // Regular merge column handling
                    const keyValue = primaryRow[mergeColumn];
                    if (keyValue) {
                        geoRow = geoLookup[keyValue];
                        lookupKey = keyValue;
                    }
                }
                
                if (geoRow) {
                    // Debug the geo match
                    const geoLat = geoRow.LATITUDE || geoRow.latitude || geoRow.LAT;
                    const geoLng = geoRow.LONGITUDE || geoRow.longitude || geoRow.LON;
                    debugAlert(`🗺️ GEO MATCH: ${primaryRow.Location} matched to geo row with lat: ${geoLat}, lng: ${geoLng}, lookup key: ${lookupKey}`);
                    
                    // Add all geo columns that don't already exist in primary data
                    Object.keys(geoRow).forEach(geoColumn => {
                        if (!primaryRow.hasOwnProperty(geoColumn)) {
                            // Debug coordinate assignments
                            if (geoColumn.toLowerCase().includes('lat') || geoColumn.toLowerCase().includes('lon')) {
                                debugAlert(`🗺️ GEO MERGE: Adding ${geoColumn} = ${geoRow[geoColumn]} to row with Location: ${primaryRow.Location}`);
                            }
                            primaryRow[geoColumn] = geoRow[geoColumn];
                            addedColumns.add(geoColumn);
                        }
                    });
                    
                    // Handle geoStateTarget parameter - relate State field to specified field in geo dataset
                    if (config.geoStateTarget && Array.isArray(config.geoStateTarget) && primaryRow.State) {
                        // geoStateTarget is an array, use the first element as the state field name
                        const stateTargetField = config.geoStateTarget[0];
                        const geoStateValue = geoRow[stateTargetField] || geoRow[stateTargetField.toUpperCase()] || geoRow[stateTargetField.toLowerCase()];
                        
                        if (geoStateValue && !primaryRow.hasOwnProperty(stateTargetField)) {
                            primaryRow[stateTargetField] = geoStateValue;
                            addedColumns.add(stateTargetField);
                        }
                    }
                    
                    mergedCount++;
                } else if (lookupKey) {
                    // Track values that couldn't be matched (only if lookupKey exists)
                    unmatchedValues.add(lookupKey);
                }
            });
            
            debugAlert('🌍 GEO MERGE: Merged ' + mergedCount + ' records, added columns: ' + Array.from(addedColumns).join(', '));
            
            // Store merge information for search results display
            this.geoMergeInfo = {
                totalRecords: primaryData.length,
                mergedRecords: mergedCount,
                geoDatasetSize: geoData.length
            };
            
            // Report unmatched values as a secondary process to avoid slowing down the merge
            setTimeout(() => {
                if (unmatchedValues.size > 0) {
                    const unmatchedList = Array.from(unmatchedValues);
                    debugAlert(`🔍 GEO MERGE UNMATCHED: ${unmatchedValues.size} values from "${mergeColumn}" column not found in geo dataset: ${unmatchedList.join(', ')}`);
                } else {
                    debugAlert('✅ GEO MERGE: All values matched successfully in geo dataset');
                }
            }, 0);
            
            return primaryData;
            
        } catch (error) {
            debugAlert('❌ GEO MERGE ERROR: ' + error.message);
            console.error('Error merging geo dataset:', error);
            // Return original data if merge fails
            return primaryData;
        }
    }
    
    createMockData(config) {
        console.log("createMockData() this.currentShow " + this.currentShow );
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

    async loadAPIData(apiPath, config) {
        // Determine the API URL to call
        let apiUrl;

        if (apiPath.startsWith('https://www.cognitoforms.com')) {
            // Cognito Forms URLs should be proxied through our Rust API server
            // which will add authentication - use the generic proxy endpoint
            const encodedUrl = encodeURIComponent(apiPath);
            apiUrl = `http://localhost:8081/api/cognito/proxy?url=${encodedUrl}`;
            console.log('Proxying Cognito Forms request:', apiPath, '→', apiUrl);
        } else if (apiPath.startsWith('http')) {
            // Other external URLs are called directly
            apiUrl = apiPath;
        } else {
            // Relative paths are resolved to local API server
            apiUrl = `http://localhost:8081${apiPath}`;
        }

        console.log('Fetching data from API:', apiUrl);

        try {
            const response = await fetch(apiUrl);

            if (!response.ok) {
                // Try to get detailed error from response body
                let detailedError = response.statusText;
                try {
                    const errorData = await response.json();
                    if (errorData.error) {
                        detailedError = errorData.error;
                    } else if (errorData.message) {
                        detailedError = errorData.message;
                    }
                } catch (e) {
                    console.warn('Could not parse error response:', e);
                }

                const errorMsg = `API request failed: ${response.status} ${detailedError}`;
                console.error(errorMsg);

                // Display error in debug messages
                this.displayAPIError(apiUrl, response.status, detailedError, config);

                // Fallback to CSV if API fails
                if (config.dataset) {
                    console.log('Falling back to CSV dataset:', config.dataset);
                    this.displayDebugMessage('⚠️ Using CSV fallback: ' + config.dataset, 'warning');
                    const datasetUrl = config.dataset.startsWith('http')
                        ? config.dataset
                        : this.getDatasetBasePath() + config.dataset;
                    return await this.loadCSVData(datasetUrl, config);
                }
                throw new Error(errorMsg);
            }

            const apiResponse = await response.json();

            console.log('API Response structure:', {
                hasSuccess: !!apiResponse.success,
                hasData: !!apiResponse.data,
                dataType: typeof apiResponse.data,
                isArray: Array.isArray(apiResponse.data),
                dataLength: Array.isArray(apiResponse.data) ? apiResponse.data.length : 'N/A'
            });

            // Check if API response has the expected structure
            if (apiResponse.success && apiResponse.data) {
                let entries;

                // Check if data is already an array (bulk entries) or a single object (specific entry)
                if (Array.isArray(apiResponse.data)) {
                    entries = apiResponse.data;
                    console.log(`Processing ${entries.length} entries from bulk API response`);
                } else if (typeof apiResponse.data === 'object' && apiResponse.data !== null) {
                    // Single entry - wrap in array
                    entries = [apiResponse.data];
                    console.log('Processing single entry from API response');
                } else {
                    entries = [];
                    console.warn('Unexpected data format:', typeof apiResponse.data);
                }

                if (entries.length > 0) {
                    // Log each entry as it's found
                    entries.forEach((entry, index) => {
                        console.log(`Entry #${index + 1}:`, {
                            City: entry.City,
                            Team: entry.Team,
                            StartDate: entry.StartDate,
                            TotalParticipants: entry.TotalParticipants
                        });
                    });

                    console.log(`✅ Successfully loaded ${entries.length} entries from API`);
                    this.displayDebugMessage(`✅ API Success: Loaded ${entries.length} entries`, 'success');
                    return entries;
                } else {
                    console.warn('No entries found in response');
                }
            }

            console.warn('API returned no data, falling back to CSV if available');
            this.displayDebugMessage('⚠️ API returned no data, using CSV fallback', 'warning');

            // Fallback to CSV if API returns no data
            if (config.dataset) {
                const datasetUrl = config.dataset.startsWith('http')
                    ? config.dataset
                    : this.getDatasetBasePath() + config.dataset;
                return await this.loadCSVData(datasetUrl, config);
            }

            return [];

        } catch (error) {
            console.error('API connection error:', error);
            this.displayAPIError(apiUrl, null, error.message, config);

            // Fallback to CSV on connection error
            if (config.dataset) {
                this.displayDebugMessage('⚠️ Using CSV fallback due to connection error', 'warning');
                const datasetUrl = config.dataset.startsWith('http')
                    ? config.dataset
                    : this.getDatasetBasePath() + config.dataset;
                return await this.loadCSVData(datasetUrl, config);
            }

            throw error;
        }
    }

    async refreshLocalData() {
        try {
            // Get the API URL (prefer dataset_via_api, fall back to dataset_api_slow)
            const apiUrl = this.config?.dataset_via_api || this.config?.dataset_api_slow;
            const localFilePath = this.config?.dataset;

            if (!apiUrl) {
                this.displayDebugMessage('❌ No API URL configured', 'error');
                return;
            }

            if (!localFilePath || localFilePath.startsWith('http')) {
                this.displayDebugMessage('❌ No local file path configured or path is not local', 'error');
                return;
            }

            this.displayDebugMessage('🔄 Fetching data from API and saving to local file...', 'info');

            // Get the fields to omit from dataset_omit config
            const omitFields = this.config?.dataset_omit
                ? this.config.dataset_omit.split(',').map(f => f.trim())
                : [];

            // Call the Rust endpoint to refresh the local file
            const response = await fetch('http://localhost:8081/api/refresh-local', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    api_url: apiUrl,
                    local_file_path: localFilePath,
                    omit_fields: omitFields
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage = `Failed to refresh local data (${response.status})`;
                try {
                    const errorData = JSON.parse(errorText);
                    errorMessage = errorData.error || errorMessage;
                } catch (e) {
                    // Not JSON, use the text as is
                    errorMessage = errorText || errorMessage;
                }
                throw new Error(errorMessage);
            }

            const result = await response.json();
            this.displayDebugMessage(`✅ Successfully refreshed local file: ${localFilePath} (${result.entries_count} entries)`, 'success');

            // Reload the data from the refreshed local file
            this.loading = true;
            this.render();
            await this.loadData();
            this.loading = false;
            this.render();

        } catch (error) {
            console.error('Error refreshing local data:', error);
            this.displayDebugMessage(`❌ Failed to refresh local data: ${error.message}`, 'error');
        }
    }

    displayAPIError(apiUrl, statusCode, errorMessage, config) {
        console.log('🚨 displayAPIError called - Endpoint:', apiUrl, 'Status:', statusCode, 'Error:', errorMessage);

        const errorHtml = `
            <div id="api-error-box" style="
                border: 2px solid #dc3545;
                border-radius: 8px;
                padding: 16px;
                margin: 10px 0;
                background: #fff;
                box-shadow: 0 4px 12px rgba(220, 53, 69, 0.3);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            ">
                <div style="display: flex; align-items: center; margin-bottom: 12px;">
                    <span style="font-size: 24px; margin-right: 10px;">❌</span>
                    <div style="font-weight: bold; font-size: 16px; color: #dc3545;">
                        API Connection Failed
                    </div>
                    <button onclick="this.closest('#api-error-box').remove()" style="
                        margin-left: auto;
                        background: transparent;
                        border: none;
                        font-size: 20px;
                        cursor: pointer;
                        color: #999;
                        padding: 0 8px;
                    ">×</button>
                </div>

                <div style="background: #f8f9fa; padding: 12px; border-radius: 4px; margin-bottom: 12px;">
                    <div style="margin-bottom: 8px;">
                        <strong>Endpoint:</strong><br>
                        <code style="background: #fff; padding: 4px 8px; border-radius: 3px; display: inline-block; margin-top: 4px; font-size: 12px; color: #333;">${apiUrl}</code>
                    </div>
                    ${statusCode ? `<div style="margin-bottom: 8px;"><strong>Status:</strong> <span style="color: #dc3545; font-weight: bold;">${statusCode}</span></div>` : ''}
                    <div>
                        <strong>Error:</strong> ${errorMessage}
                    </div>
                </div>

                <details style="margin-top: 12px;" open>
                    <summary style="cursor: pointer; font-weight: bold; color: #495057; margin-bottom: 8px;">
                        Troubleshooting Steps
                    </summary>
                    <ul style="margin: 8px 0; padding-left: 20px; line-height: 1.6; color: #495057;">
                        ${errorMessage.includes('404') ? `
                        <li><strong style="color: #dc3545;">404 Not Found</strong> - The entries endpoint URL is incorrect</li>
                        <li>Cognito Forms may use a different URL pattern for entries</li>
                        <li>Check the official API documentation for the correct endpoint format</li>
                        ` : errorMessage.includes('error sending request') || errorMessage.includes('Request failed') ? `
                        <li><strong style="color: #dc3545;">TLS/SSL Connection Issue Detected</strong></li>
                        <li>The Rust server cannot connect to Cognito Forms API</li>
                        <li>This may be due to certificate validation or network restrictions</li>
                        <li>Test from server: <code style="background: #e9ecef; padding: 2px 6px; border-radius: 3px;">curl https://www.cognitoforms.com/api/forms</code></li>
                        ` : ''}
                        <li>Verify server is running: <code style="background: #e9ecef; padding: 2px 6px; border-radius: 3px;">curl http://localhost:8081/api/health</code></li>
                        <li>Check API credentials in <code style="background: #e9ecef; padding: 2px 6px; border-radius: 3px;">docker/.env</code></li>
                        <li>Check server logs: <code style="background: #e9ecef; padding: 2px 6px; border-radius: 3px;">tail -f server.log</code></li>
                    </ul>
                </details>

                ${config.dataset ? `
                <div style="margin-top: 12px; padding: 10px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
                    <strong style="color: #856404;">ℹ️ Fallback Active:</strong> Loading data from CSV instead<br>
                    <code style="font-size: 11px; color: #856404; word-break: break-all;">${config.dataset}</code>
                </div>
                ` : ''}
            </div>
        `;

        // Display in dedicated API error container (always visible)
        const errorContainer = document.getElementById('api-error-container');
        if (errorContainer) {
            console.log('✅ Displaying API error in dedicated container');
            errorContainer.innerHTML = errorHtml;
        } else {
            console.error('❌ api-error-container not found!');
        }

        // Also log to debug messages if available
        this.displayDebugMessage(`❌ API Error: ${errorMessage}`, 'error');
    }

    displayDebugMessage(message, type = 'info') {

        const colors = {
            'success': { bg: '#d4edda', border: '#28a745', text: '#155724' },
            'warning': { bg: '#fff3cd', border: '#ffc107', text: '#856404' },
            'info': { bg: '#d1ecf1', border: '#17a2b8', text: '#0c5460' },
            'error': { bg: '#f8d7da', border: '#dc3545', text: '#721c24' }
        };

        const color = colors[type] || colors.info;

        const messageHtml = `
            <div style="border-left: 4px solid ${color.border}; padding: 8px 12px; margin: 5px 0; background: ${color.bg}; color: ${color.text}; font-family: monospace; font-size: 12px;">
                ${message}
            </div>
        `;

        // Queue or display immediately depending on div readiness
        const debugDiv = document.getElementById('debug-messages');
        if (debugDiv && ListingsDisplay.debugDivReady) {
            console.log('📢 Displaying debug message immediately:', message);
            debugDiv.insertAdjacentHTML('afterbegin', messageHtml);
        } else {
            console.log('📥 Queueing debug message (div not ready yet):', message);
            ListingsDisplay.debugMessageQueue.push(messageHtml);
        }
    }

    parseCSV(csvText, config = null) {
        const lines = this.splitCSVIntoLines(csvText.trim());
        
        if (lines.length === 0) {
            return [];
        }
        
        // Always parse first row as headers
        if (lines.length < 2) {
            return [];
        }
        
        const headerLine = lines[0];
        const headers = this.parseCSVLine(headerLine);
        const dataStartIndex = 1;
        
        console.log('🔧 Parsed headers from CSV:', headers);
        if (config && config.allColumns && Array.isArray(config.allColumns)) {
            console.log('🔧 AllColumns config (for display filtering):', config.allColumns);
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
        debugAlert(`🗺️ getFieldMapping()`); // Why is function called dozens of time?
        // When allColumns exists, create a mapping from standard field names to allColumns field names
        if (this.config && this.config.allColumns && Array.isArray(this.config.allColumns)) {
            const mapping = {};
            const allColumns = this.config.allColumns;
            
            // Map standard geographic coordinate fields
            allColumns.forEach(field => {
                const lowerField = field.toLowerCase();
                if (lowerField === 'lat' || lowerField === 'latitude') {
                    mapping.latitude = field;
                } else if (lowerField === 'lng' || lowerField === 'lon' || lowerField === 'longitude') {
                    mapping.longitude = field;
                }
            });
            
            return mapping;
        }
        
        // Default mapping when no allColumns - detect from actual data fields
        const mapping = {
            latitude: 'latitude',
            longitude: 'longitude'
        };
        
        // If we have data, check actual field names for coordinate fields
        if (this.listings && this.listings.length > 0) {
            const sampleRow = this.listings[0];
            const fieldNames = Object.keys(sampleRow);
            
            fieldNames.forEach(field => {
                const lowerField = field.toLowerCase();
                if (lowerField === 'lat' || lowerField === 'latitude') {
                    mapping.latitude = field;
                    //debugAlert(`🗺️ FIELD MAPPING: Found latitude field: ${field}`);
                } else if (lowerField === 'lng' || lowerField === 'lon' || lowerField === 'longitude') {
                    mapping.longitude = field;
                    //debugAlert(`🗺️ FIELD MAPPING: Found longitude field: ${field}`);
                }
            });
        }
        
        //debugAlert(`🗺️ FIELD MAPPING: Final mapping - latitude: '${mapping.latitude}', longitude: '${mapping.longitude}'`);
        
        return mapping;
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
        
        // Format email addresses with mailto links
        if (fieldType === 'email' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(strValue)) {
            return `<a href="mailto:${strValue}">${strValue}</a>`;
        }
        
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
            .replace(/([A-Z])/g, ' $1')  // Add space before capital letters (CamelCase -> Camel Case)
            .replace(/_/g, ' ')  // Replace underscores with spaces
            .trim()  // Remove leading/trailing spaces
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
        // Check if Leaflet map is currently animating to avoid DOM conflicts
        if (window.leafletMap && window.leafletMap.map && 
            (window.leafletMap.map._animatingZoom || window.leafletMap.map._zooming)) {
            // Defer filtering until animation completes
            setTimeout(() => this.filterListings(), 100);
            return;
        }
        
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
        
        // Set flag to prevent render() from updating map (we'll do it manually)
        this.isFilteringInProgress = true;
        //this.render(); // For map point update
        this.updateListingsDisplay();
        this.isFilteringInProgress = false;
        
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
        
        // Update map with filtered results - send all filtered data, not just current page
        if (window.leafletMap) {
            setTimeout(() => {
                debugAlert('🚨 updateFromListingsApp in filterListings() - sending ' + this.filteredListings.length + ' filtered listings');
                window.leafletMap.updateFromListingsApp(this);
            }, 100);
        }
    }

    getSearchFieldsSummary() {
        if (this.searchFields.size === 0) return 'Filters';
        if (this.searchFields.size === this.availableFields.size) return 'Filters: All';
        
        // Get display names from config if available
        const displayNames = [];
        if (this.config && this.config.search) {
            Object.entries(this.config.search).forEach(([displayName, fieldName]) => {
                if (this.searchFields.has(fieldName)) {
                    displayNames.push(displayName);
                }
            });
        }
        
        // Fall back to field names if no display names found
        if (displayNames.length === 0) {
            this.searchFields.forEach(field => displayNames.push(field));
        }
        
        // Show individual filter names for 1-2 filters
        if (displayNames.length <= 2) {
            return `Filters: ${displayNames.join(', ')}`;
        }
        
        // Show count for 3+ filters
        return `Filters (${displayNames.length})`;
    }

    toggleSearchField(field) {
        if (this.searchFields.has(field)) {
            this.searchFields.delete(field);
        } else {
            this.searchFields.add(field);
        }
        this.updateSelectAllButtonText();
        this.filterListings();
    }

    useConfigSearchFields() {
        // If more than 2 fields are selected, unselect all. Otherwise, select all.
        if (this.searchFields.size > 2) {
            this.searchFields.clear();
        } else {
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
        }
        this.updateSelectAllButtonText();
        this.filterListings();
    }

    updateSelectAllButtonText() {
        const selectAllBtn = document.querySelector('.select-all-btn');
        if (selectAllBtn) {
            selectAllBtn.textContent = this.searchFields.size > 2 ? 'Unselect' : 'Select All';
        }
    }

    toggleSearchPopup() {
        this.searchPopupOpen = !this.searchPopupOpen;
        
        if (this.searchPopupOpen) {
            this.showSearchPopup();
        } else {
            this.hideSearchPopup();
        }
    }
    
    showSearchPopup() {
        // Remove any existing popup
        this.hideSearchPopup();
        
        // Create and insert the popup
        const container = document.querySelector('.listings-scroll-container');
        if (container && this.availableFields.size > 0) {
            const popupHTML = this.renderSearchPopup();
            container.insertAdjacentHTML('afterbegin', popupHTML);
        }
    }
    
    hideSearchPopup() {
        const existingPopup = document.querySelector('.search-fields-popup');
        if (existingPopup) {
            existingPopup.remove();
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
        this.hideSearchPopup();
    }

    renderSearchPopup() {
        if (this.availableFields.size === 0) return '';
        return `
            <div class="search-fields-popup">
                <div class="search-fields-header">
                    <span style="padding-right:10px">Filter by:</span>
                    <button class="select-all-btn" onclick="window.listingsApp.useConfigSearchFields()">${this.searchFields.size > 2 ? 'Unselect' : 'Select All'}</button>
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
        this.currentShow = showKey;
        this.searchPopupOpen = false;
        
        // Dataset change - keep existing map, just update data
        debugAlert("🔄 Dataset change: Keeping existing map, will update data only");
        
        // Update URL hash
        //this.updateUrlHash(showKey); // Avoid because hash is driving
        
        // Only save to cache if this is a user-initiated change
        if (updateCache) {
            this.saveCachedShow(showKey);
        }
        //alert("priorHash.map " + priorHash.map);
        if (priorHash.map) { // Also need to allow for map-none-map sequence.
            // Set flag to prevent render() from updating map (we'll do it manually like filtering)
            this.isDatasetChanging = true;
        }
        await this.loadShowData(); // This calls render(), but it will be skipped due to flag
        this.updateListingsDisplay(); // Update only the listings display
        this.isDatasetChanging = false;
        
        // Update map with new dataset and fit to new points
        if (window.leafletMap) {
            setTimeout(() => {
                debugAlert('🚨 updateFromListingsApp in changeShow() - dataset change - sending ' + this.filteredListings.length + ' listings');
                
                // Force bounds fitting for dataset changes by temporarily resetting the baseline
                const originalMapHasLoaded = window.mapHasEverLoaded;
                window.mapHasEverLoaded = false; // Trick the system into thinking this is initial load
                
                window.leafletMap.updateFromListingsApp(this);
                
                // Restore the flag after update
                setTimeout(() => {
                    window.mapHasEverLoaded = originalMapHasLoaded;
                    debugAlert('🗺️ Dataset change bounds fitting completed, restored mapHasEverLoaded flag');
                }, 300);
                
            }, 100);
        }
        
        // Force map reinitialization when changing datasets
        /*
        setTimeout(() => {
            console.log('🔍 TRACE: initializeMap() called from changeShow()');
            //this.initializeMap('FROM_CHANGESHOW');
        }, 100);
        */
    }

    attachSearchInputListener() {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            // Remove any existing listener to avoid duplicates
            searchInput.removeEventListener('input', this.searchInputHandler);
            // Create bound handler for removal later
            this.searchInputHandler = (e) => {
                this.searchTerm = e.target.value;
                
                const now = Date.now();
                const timeSinceLastInput = this.lastInputTime ? now - this.lastInputTime : 1000;
                this.lastInputTime = now;
                
                // Clear any existing timeout
                if (this.filterTimeout) {
                    clearTimeout(this.filterTimeout);
                }
                
                // If typing rapidly (less than 100ms since last input), add delay
                // Otherwise filter immediately
                if (timeSinceLastInput < 100) {
                    this.filterTimeout = setTimeout(() => {
                        this.filterListings();
                    }, 50);
                } else {
                    this.filterListings();
                }
            };
            searchInput.addEventListener('input', this.searchInputHandler);
        }
    }

    setupEventListeners() {
        this.attachSearchInputListener();

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

        // Handle pagination with specific delegation
        document.addEventListener('click', (e) => {
            // Handle pagination
            if (e.target.classList.contains('pagination-btn') && !e.target.disabled) {
                const page = parseInt(e.target.dataset.page);
                if (!isNaN(page)) {
                    this.changePage(page);
                }
            }
        });

        // Handle refresh local button
        document.addEventListener('click', (e) => {
            if (e.target.id === 'refreshLocalBtn' || e.target.closest('#refreshLocalBtn')) {
                e.preventDefault();
                this.refreshLocalData();
            }
        });

        // Handle summarize toggle button
        document.addEventListener('click', (e) => {
            if (e.target.id === 'summarize-toggle') {
                const currentHash = this.getCurrentHash();
                const isSummarized = currentHash.summarize === 'true';
                
                if (typeof goHash === 'function') {
                    if (isSummarized) {
                        // Unsummarize - clear the summarize hash
                        goHash({"summarize": ""});
                    } else {
                        // Summarize - set summarize to true
                        goHash({"summarize": "true"});
                    }
                } else {
                    debugAlert('⚠️ goHash function not available');
                }
            }
        });

        document.addEventListener('click', (e) => {
            if (e.target.closest(".details-toggle")) {
                e.preventDefault();
                e.stopPropagation();
                const toggle = e.target.closest('.details-toggle');
                const content = toggle.nextElementSibling;
                const arrow = toggle.querySelector('.toggle-arrow');
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

    isSummaryView() {
        // Check if we're showing summary data by looking for originalListings
        return this.originalListings !== null && this.originalListings !== undefined;
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
        
        // Check if this is summary view
        if (this.isSummaryView()) {
            return this.renderSummaryListings(currentPageListings);
        }
        
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

                        ${additionalDetailsCount > 0 ? `
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
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    renderSummaryListings(summaryListings) {
        if (!this.config?.geoColumns || this.config.geoColumns.length === 0) {
            return '<div>No geo columns defined for summary</div>';
        }

        const groupColumn = this.config.geoColumns[0]; // First geoColumn is the grouping column
        const aggregateColumn = this.config.geoAggregate; // Column to aggregate
        
        return summaryListings.map(summaryItem => {
            const uniqueId = `details-${Math.random().toString(36).substr(2, 9)}`;
            const groupName = summaryItem[groupColumn] || 'Unknown';
            const count = summaryItem.count || 0;
            const aggregateTotal = summaryItem.aggregateTotal || 0;
            
            // Filter out the fields that should be hidden in summary view
            const fieldsToOmit = new Set([
                groupColumn.toLowerCase(), 
                'count', 
                'aggregatetotal'
            ]);
            
            // Count additional details (excluding omitted fields)
            const additionalDetails = Object.entries(summaryItem)
                .filter(([key, value]) => 
                    !fieldsToOmit.has(key.toLowerCase()) &&
                    value && 
                    value.toString().trim() !== '' &&
                    value.toString().trim() !== '-'
                );
            
            const additionalDetailsCount = additionalDetails.length;
            
            return `
                <div class="listing-card">
                    <div class="listing-content">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div class="listing-name">${groupName}</div>
                            <div class="summary-stats" style="display: flex; gap: 15px; color: #666;">
                                <div>Visits: ${count}</div>
                                ${aggregateColumn ? `<div>Participants: ${aggregateTotal}</div>` : ''}
                            </div>
                        </div>
                        
                        ${additionalDetailsCount > 0 ? `
                        <div class="details-toggle">
                            <span class="toggle-arrow" id="arrow-${uniqueId}" data-details-id="${uniqueId}">▶</span>
                            <span class="toggle-label" data-details-id="${uniqueId}">Additional Details (${additionalDetailsCount})</span>
                        </div>
                        
                        <div class="details-content" id="${uniqueId}">
                            ${additionalDetails.map(([key, value]) => `
                                <div class="detail-item">
                                    <strong>${this.formatKeyName(key)}:</strong>
                                    <div class="detail-value">
                                        ${this.formatFieldValue(value)}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        ` : ''}
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

    renderSearchResults() {
        const shortTitle = this.config?.shortTitle ? ` ${this.config.shortTitle}` : '';
        
        // Show filtered count whenever results are filtered (regardless of whether search term exists)
        if (this.filteredListings.length !== this.listings.length) {
            // When filtering is active (or search produced different results), show [filtered] of [total]
            let result = `${this.filteredListings.length} of ${this.listings.length}${shortTitle}`;
            
            // Add geo merge info if available and dataset is merged
            if (this.geoMergeInfo && this.geoMergeInfo.mergedRecords !== this.geoMergeInfo.totalRecords) {
                result += ` (${this.geoMergeInfo.mergedRecords} with coordinates)`;
            }
            
            return result;
        } else {
            // When no filtering, show just the total
            let result = `${this.listings.length}${shortTitle}`;
            
            // Add geo merge info if available and dataset is merged
            if (this.geoMergeInfo && this.geoMergeInfo.mergedRecords !== this.geoMergeInfo.totalRecords) {
                result += ` (${this.geoMergeInfo.mergedRecords} with coordinates)`;
            }
            
            return result;
        }
    }

    getCurrentHash() {
        if (typeof getHash === 'function') {
            return getHash();
        }
        return {};
    }

    SummarizeList() {
        debugAlert('📊 SUMMARIZE: Creating summary list');
        
        if (!this.config?.geoColumns || this.config.geoColumns.length === 0) {
            debugAlert('❌ SUMMARIZE: No geoColumns defined');
            return;
        }

        const groupColumn = this.config.geoColumns[0]; // First geoColumn is the grouping column
        const aggregateColumn = this.config.geoAggregate; // Column to aggregate
        
        debugAlert(`📊 SUMMARIZE: Grouping by "${groupColumn}", aggregating "${aggregateColumn}"`);
        
        // Group data by the grouping column
        const groups = {};
        this.listings.forEach(listing => {
            const groupValue = listing[groupColumn];
            if (groupValue) {
                if (!groups[groupValue]) {
                    groups[groupValue] = {
                        [groupColumn]: groupValue,
                        count: 0,
                        aggregateTotal: 0
                    };
                }
                groups[groupValue].count++;
                
                // Add to aggregate if the column exists and has a numeric value
                if (aggregateColumn && listing[aggregateColumn]) {
                    const aggregateValue = parseFloat(listing[aggregateColumn]);
                    if (!isNaN(aggregateValue)) {
                        groups[groupValue].aggregateTotal += aggregateValue;
                    }
                }
            }
        });
        
        // Convert to array and sort by count (descending)
        const summaryData = Object.values(groups).sort((a, b) => b.count - a.count);
        
        debugAlert(`📊 SUMMARIZE: Created ${summaryData.length} summary groups`);
        
        // Store original data and set summary as filtered listings
        this.originalListings = this.listings;
        this.originalFilteredListings = this.filteredListings;
        this.filteredListings = summaryData;
        this.currentPage = 1; // Reset to first page
        
        // Update display
        this.updateListingsDisplay();
    }

    UnsummarizeList() {
        debugAlert('📊 UNSUMMARIZE: Restoring original list');
        
        if (this.originalListings) {
            this.listings = this.originalListings;
            this.filteredListings = this.originalFilteredListings || this.originalListings;
            this.originalListings = null;
            this.originalFilteredListings = null;
            this.currentPage = 1; // Reset to first page
            
            // Update display
            this.updateListingsDisplay();
        }
    }

    updateListingsDisplay() {
        // Update only the listings display without recreating the entire UI
        const listingsScrollContainer = document.querySelector('.listings-scroll-container');
        if (listingsScrollContainer) {
            // Update the entire listings scroll container content
            listingsScrollContainer.innerHTML = `
                <div class="listings-grid basePanelPadding" style="padding-top:0px">
                    ${this.renderListings()}
                </div>
                ${this.renderNoResults()}
                ${this.renderEmptyState()}
            `;
            
            // Update pagination and search results if they exist
            const detailsBottom = document.getElementById('widgetDetailsBottom');
            if (detailsBottom) {
                detailsBottom.innerHTML = `
                    <div class="search-results">
                        ${this.renderSearchResults()}
                    </div>
                    <div class="pagination-container" style="${this.filteredListings.length <= 500 ? 'display: none;' : ''}">
                        ${this.renderPagination()}
                    </div>
                `;
            }
            
            // Update summarize button visibility based on current dataset
            this.updateSummarizeButtonVisibility();
            
            // Event listeners are handled by global delegation, no need to re-attach
        }
    }

    updateSummarizeButtonVisibility() {
        const summarizeControls = document.querySelector('.summarize-controls');
        if (summarizeControls) {
            const shouldShow = this.config?.geoColumns && this.config.geoColumns.length > 0;
            summarizeControls.style.display = shouldShow ? 'block' : 'none';
            
            if (shouldShow) {
                // Update button text based on current hash state
                const currentHash = this.getCurrentHash();
                const summarizeButton = document.getElementById('summarize-toggle');
                if (summarizeButton) {
                    summarizeButton.textContent = currentHash.summarize === 'true' ? 'Unsummarize' : 'Summarize';
                }
            }
        }
    }

    render() {
        debugAlert('🔍 RENDER() called');
        
        console.trace('Render call stack:');
        // Force clear loading state if we have data
        if (this.dataLoaded && this.listings && this.listings.length > 0 && this.loading) {
            this.loading = false;
        }
        if (!(this.isFilteringInProgress || this.isDatasetChanging)) {
            //alert("render() overwrites map")
            const mapwidget = document.getElementById('mapwidget');
            if (mapwidget) mapwidget.style.display = 'block';
            
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
        
            let localwidgetHeader = `
                <!-- Header -->
                <div class="widgetHeader" style="position:relative; display:flex; justify-content:space-between; align-items:flex-start;">
                    <div style="flex:1;">
                        <h1>${this.config?.listTitle || 'Listings'}</h1>
                        ${this.config?.mapInfo ? `<div class="info">${this.config.mapInfo}</div>` : ''}
                    </div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div id="map-print-download-icons" style="padding-top:12px"></div>
                    </div>
                </div>`

            // window.param.showheader hides too much.  Need to move #map-print-download-icons when header is hidden.
            // X added to temp disable until g.org removes showheader=false
            mapwidget.innerHTML = `
                ${ window.param.showheaderX != "false" ? localwidgetHeader : '' }
                <!-- Widget Hero Container -->
                <div id="widgetHero"></div>
                    
                <!-- Widget Content Container -->
                <div id="widgetContent">
                    <!-- Details Section (Left column on desktop) -->
                    <div id="widgetDetailsParent" class="basePanel">
                    <div id="widgetDetails" myparent="widgetDetailsParent" class="basePanel">
                        <!-- Controls -->
                        <div id="widgetDetailsControls" class="basePanelTop basePanelPadding basePanelFadeOut basePanelBackground">
                            <div class="search-container">
                                ${ (window.param.showmapselect == "true" || window.location.hostname === 'localhost') ? `
                                <div class="map-selector">
                                    <select id="mapDataSelect" class="map-select">
                                        <option value="">Selected map...</option>
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
                                            <svg class="filter-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46"></polygon>
                                            </svg>
                                            <span class="button-text">${this.getSearchFieldsSummary()}</span>
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

                            <!-- Summarize Toggle (only for datasets with geoColumns) -->
                            ${this.config?.geoColumns && this.config.geoColumns.length > 0 ? `
                            <div class="summarize-controls" style="display: flex; gap: 10px; align-items: center;">
                                <button id="summarize-toggle" class="btn btn-sm" style="background: #007bff; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">
                                    ${this.getCurrentHash().summarize === 'true' ? 'Unsummarize' : 'Summarize'}
                                </button>
                                ${ (window.location.hostname === 'localhost' &&
                                    (this.config?.dataset_api_slow || this.config?.dataset_via_api) &&
                                    this.config?.dataset &&
                                    !this.config.dataset.startsWith('http')) ? `
                                <button id="refreshLocalBtn" class="btn btn-sm" style="background: #28a745; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;" title="Fetch data from API and save to local file">
                                    Refresh Locally
                                </button>
                                ` : ''}
                            </div>
                            ` : ''}

                        </div>
                        
                        <!-- Listings Grid -->
                        <div class="listings-scroll-container">
                            <div class="listings-grid basePanelPadding" style="padding-top:0px">
                                ${this.renderListings()}
                            </div>
                        </div>

                        ${this.renderNoResults()}
                        ${this.renderEmptyState()}
                        
                        <!-- Widget Details Bottom Container -->
                        <div id="widgetDetailsBottom">
                            <div class="search-results">
                                ${this.renderSearchResults()}
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
        } 


        // ALLOWED MAP POINTS TO CHANGE WITH DAT

        // Apply domain-based sign-in button visibility
        this.applySignInVisibility();

        //setTimeout(() => {
            //this.setupEventListeners(); // Avoid here - Invokes clicks multiple times!
            
            // Set up essential event listeners that don't cause multiple triggers
            const showSelect = document.getElementById('mapDataSelect');
            
            // Re-attach search input listener after render (lost when DOM updates)
            this.attachSearchInputListener();
            if (showSelect) {
                showSelect.addEventListener('change', (e) => {
                    goHash({'map':e.target.value});
                });
            }
            
            // Skip map initialization during filtering to prevent map recreation
            if (!this.isFilteringInProgress) {
                this.initializeMap('FROM_RENDER conditionalMapInit');
            } else {
                debugAlert("🚫 SKIPPING initializeMap during filtering to preserve map");
            }
            this.setupPrintDownloadIcons();
        //}, 0);
          
    }
    
    //conditionalMapInit() {
    //    console.log('🔍 TRACE: conditionalMapInit() called from render()');
    //    this.initializeMap('FROM_RENDER conditionalMapInit');
    //}
    
    initializeMap(source = 'UNKNOWN') {
        debugAlert("🗺️ initializeMap in map.js CALLED FROM: " + source + " - checking initialMapLoad flag: " + this.initialMapLoad)
        
        // Block ALL map recreation during filtering to prevent #widgetmap from being emptied
        if (this.isFilteringInProgress) {
            debugAlert('🚫 BLOCKING: Map recreation during filtering - isFilteringInProgress=true');
            return;
        }
        
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
                // More thorough cleanup of existing map - only during initial load or dataset changes
                if (this.initialMapLoad) {
                    if (window.leafletMap && window.leafletMap.map && this.initialMapLoad) {
                        debugAlert("🧹 CLEANING UP EXISTING MAP - this causes tile reload, only doing during initial/dataset load");
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
                }
                // Create new map instance - only during initial load or dataset changes
                if (this.initialMapLoad) {
                    debugAlert("🗺️ CREATING NEW MAP - only during initial/dataset load");
                    window.leafletMap = new LeafletMapManager('widgetmap', {
                        height: '500px',
                        width: '100%'
                    });
                } else {
                    debugAlert("🔄 SKIPPING MAP RECREATION - using existing map to avoid tile reload. Map exists: " + !!window.leafletMap);
                }
                
                // Update map with current listings data - only send current page data
                console.log("Update map with current listings data - only send current page data")
                if (this.listings && this.listings.length > 0) {
                    //setTimeout(() => {
                        // Create a limited version of this object with only current page data
                        const limitedListingsApp = {
                            ...this,
                            filteredListings: this.getCurrentPageListings(),
                            listings: this.getCurrentPageListings(),
                            getMapListings: () => this.getCurrentPageListings()
                        };
                        window.leafletMap.updateFromListingsApp(limitedListingsApp);
                    //}, 100);
                }
            } catch (error) {
                console.warn('Failed to initialize map:', error);
            } finally {
                this.mapInitializing = false;
                // Set flag to false after initial map creation to prevent recreation during filtering
                this.initialMapLoad = false;
                debugAlert("✅ Map initialized! Setting initialMapLoad = false to prevent future recreation");
            }
        });
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
    
    getCurrentList() {
        let hash = {};
        if (typeof getHash === 'function') {
            hash = getHash();
        }
        
        let currentList = hash.map || window.param.map;
        return currentList;
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
        
        // Debug alert to confirm what data is stored
        if (typeof debugAlert === 'function') {
            debugAlert(`storeDataInDOM: Storing ${cleanedData.length} of ${data.length} original rows. All data stored: ${cleanedData.length === data.length}`);
        }
        
        // Report data size changes when on localhost
        let reportDataSize = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (reportDataSize) {
            console.log(`Source data ${jsonString.length} characters changed to ${encodedData.length} in encode JSON`);
        }
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
    // Only initialize if the mapwidget element exists
    const localwidgetElement = document.getElementById('mapwidget');
    if (localwidgetElement && !window.listingsApp) {
        window.listingsApp = new ListingsDisplay();
    }
    // Create unified global myHero function for all pages
    window.myHero = function(heroDiv, chartTypes) {
        // Default chartTypes based on page type
        if (!chartTypes) {
            chartTypes = localwidgetElement ? ['widgetmapWrapper', 'widgetDetails', 'pageGallery'] : ['chart2Wrapper', 'sankeyWrapper'];
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