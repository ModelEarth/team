//  1. Stores the int_required filtered data in DOM storage only once on initial load
//  2. Apply search filters to the stored data rather than updating the stored data
//  3. Only update DOM storage when the list= parameter changes (new dataset)
document.addEventListener('hashChangeEvent', function (elem) {
    console.log("team/js/map.js detects URL hashChangeEvent");
    waitForElm('#listwidget').then((elm) => {
        listwidgetChange();
    });
}, false);
function listwidgetChange() {
    let hash = getHash();
    // Use show parameter if map is not present
    let currentMap = hash.map || hash.show;
    let priorMap = priorHash.map || priorHash.show;

    console.log("currentMap:", currentMap, "priorMap:", priorMap);

    if (currentMap != priorMap || !priorMap) {
        if (!currentMap) {
            // Hide #listwidget here. First rename #widgetwidget to something distinct
        } else {
            // Check if listingsApp exists before calling changeShow
            if (window.listingsApp && typeof window.listingsApp.changeShow === 'function') {
                window.listingsApp.changeShow(currentMap);
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

// Global function to toggle "more/less" links for truncated descriptions
function toggleMoreLess(uniqueId) {
    const dots = document.getElementById(`${uniqueId}-dots`);
    const more = document.getElementById(`${uniqueId}-more`);
    const link = document.getElementById(`${uniqueId}-link`);

    if (more && dots && link) {
        if (more.style.display === 'none') {
            more.style.display = 'inline';
            dots.style.display = 'none';
            link.textContent = 'less';
        } else {
            more.style.display = 'none';
            dots.style.display = 'inline';
            link.textContent = 'more';
        }
    }
}

function getMapIconUtils() {
    return window.mapIconUtils || null;
}

function getFullscreenIconMarkup() {
    const mapIconUtils = getMapIconUtils();
    if (mapIconUtils?.getFullscreenIconsMarkup) {
        return mapIconUtils.getFullscreenIconsMarkup();
    }
    return `
        <svg class="fullscreen-icon expand-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
        </svg>
        <svg class="fullscreen-icon collapse-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: none;" aria-hidden="true">
            <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
        </svg>
    `;
}

function setFullscreenToggleState(button, isExpanded) {
    const mapIconUtils = getMapIconUtils();
    if (mapIconUtils?.setFullscreenToggleState) {
        mapIconUtils.setFullscreenToggleState(button, isExpanded);
        return;
    }
    if (!button) {
        return;
    }
    const expandIcon = button.querySelector('.expand-icon');
    const collapseIcon = button.querySelector('.collapse-icon');
    if (!expandIcon || !collapseIcon) {
        return;
    }
    if (isExpanded) {
        expandIcon.style.display = 'none';
        collapseIcon.style.display = 'block';
    } else {
        expandIcon.style.display = 'block';
        collapseIcon.style.display = 'none';
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
        this.selectedListingIndex = null;
        this.detailMap = null;
        this.detailMapMarker = null;
        this.inspectMode = false; // Track inspect mode for debug messages
        this.debugMessages = []; // Store debug messages
        this.citydataCache = null; // Cache for citydata lookup

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

            const detailsTrigger = e.target.closest('.view-details-btn, .listing-title');
            if (detailsTrigger) {
                const indexValue = Number(detailsTrigger.dataset.listingIndex);
                if (!Number.isNaN(indexValue)) {
                    const listing = this.filteredListings[indexValue];
                    const hashId = listing ? this.getListingHashId(listing, indexValue) : null;
                    if (hashId && typeof goHash === 'function') {
                        goHash({ id: hashId });
                    } else {
                        this.showListingDetailsByIndex(indexValue);
                    }
                    return;
                }
                const listingId = detailsTrigger.dataset.listingId;
                if (listingId) {
                    const resolvedIndex = this.findListingIndexByHashId(listingId);
                    if (resolvedIndex !== null) {
                        const listing = this.filteredListings[resolvedIndex];
                        const hashId = listing ? this.getListingHashId(listing, resolvedIndex) : listingId;
                        if (hashId && typeof goHash === 'function') {
                            goHash({ id: hashId });
                        } else {
                            this.showListingDetailsByIndex(resolvedIndex);
                        }
                    }
                }
            }

            // Handle close debug messages button
            if (e.target.id === 'close-inspect-debug' || e.target.closest('#close-inspect-debug')) {
                this.inspectMode = false;
                // Update menu item check state
                const menu = document.getElementById('widgetDetailsMenu');
                if (menu) {
                    const inspectItem = menu.querySelector('[data-action="inspect"]');
                    const checkMark = inspectItem?.querySelector('.menuToggleCheck');
                    if (checkMark) {
                        checkMark.style.display = 'none';
                    }
                }
                // Remove debug card immediately instead of re-rendering
                const debugCard = document.getElementById('inspect-debug-card');
                if (debugCard) {
                    debugCard.remove();
                }
            }

            const moreToggle = e.target.closest('.location-more-toggle');
            if (moreToggle) {
                const targetId = moreToggle.dataset.target;
                const target = targetId ? document.getElementById(targetId) : null;
                const group = moreToggle.dataset.group;
                const toggleType = moreToggle.dataset.toggleType;

                // Check if this is in the detail view (location-section)
                const isDetailView = moreToggle.closest('#location-section') !== null;

                if (isDetailView) {
                    // In detail view: use hash-based navigation
                    if (toggleType === 'meta-less') {
                        // Less button clicked - remove all meta views and independent views from hash
                        if (typeof goHash === 'function' && typeof getHash === 'function') {
                            const hash = getHash();
                            const currentView = hash?.view || '';
                            const viewArray = currentView ? currentView.split(',').map(v => v.trim()).filter(Boolean) : [];

                            // Remove 'more', 'evenmore', 'nearby', and 'airports' from the array
                            const filteredArray = viewArray.filter(v => v !== 'more' && v !== 'evenmore' && v !== 'nearby' && v !== 'airports');

                            const newViewValue = filteredArray.join(',');
                            goHash({ view: newViewValue });
                        }
                    } else if (target) {
                        // Regular toggle button clicked
                        const viewName = targetId.includes('nearby') ? 'nearby'
                                       : targetId.includes('airports') ? 'airports'
                                       : targetId.includes('even') ? 'evenmore'
                                       : 'more';

                        if (typeof goHash === 'function' && typeof getHash === 'function') {
                            const hash = getHash();
                            const currentView = hash?.view || '';
                            const viewArray = currentView ? currentView.split(',').map(v => v.trim()).filter(Boolean) : [];

                            if (toggleType === 'meta') {
                                // Meta button (More/Even More) - remove all meta views and add this one
                                const filteredArray = viewArray.filter(v => v !== 'more' && v !== 'evenmore');
                                filteredArray.push(viewName);
                                const newViewValue = filteredArray.join(',');
                                goHash({ view: newViewValue });
                            } else {
                                // Independent toggle (Nearby/Airports) - toggle individually
                                const index = viewArray.indexOf(viewName);
                                if (index >= 0) {
                                    viewArray.splice(index, 1);
                                } else {
                                    viewArray.push(viewName);
                                }
                                const newViewValue = viewArray.join(',');
                                goHash({ view: newViewValue });
                            }
                        }
                    }
                } else {
                    // In list view: use direct toggle
                    const container = moreToggle.closest('.details-more-actions');
                    const metaToggles = container ? Array.from(container.querySelectorAll('.meta-toggle')) : [];
                    const lessBtn = container ? container.querySelector('.meta-less-btn') : null;

                    if (toggleType === 'meta-less') {
                        // Less button clicked - hide all meta sections, show meta buttons, hide less button
                        const metaTargets = metaToggles
                            .map(btn => btn.dataset.target)
                            .filter(Boolean)
                            .map(id => document.getElementById(id))
                            .filter(Boolean);

                        metaTargets.forEach(section => section.classList.remove('expanded'));
                        metaToggles.forEach(btn => btn.style.display = '');
                        if (lessBtn) lessBtn.style.display = 'none';

                        // Also close independent sections (Nearby, Airports)
                        const independentToggles = container ? Array.from(container.querySelectorAll('.location-more-toggle[data-toggle-type="independent"]')) : [];
                        independentToggles.forEach(btn => {
                            const targetId = btn.dataset.target;
                            const section = targetId ? document.getElementById(targetId) : null;
                            if (section) section.classList.remove('expanded');
                            btn.classList.remove('active');
                        });
                    } else if (toggleType === 'meta') {
                        // Meta button clicked - show this section, hide meta buttons, show less button
                        if (target) {
                            // Collapse all meta sections first
                            metaToggles.forEach(btn => {
                                const btnTarget = btn.dataset.target;
                                const section = btnTarget ? document.getElementById(btnTarget) : null;
                                if (section) section.classList.remove('expanded');
                            });

                            // Expand this section
                            target.classList.add('expanded');

                            // Hide meta buttons, show less button
                            metaToggles.forEach(btn => btn.style.display = 'none');
                            if (lessBtn) lessBtn.style.display = '';
                        }
                    } else {
                        // Independent toggle (Nearby/Airports) - toggle individually
                        if (target) {
                            const isExpanded = target.classList.contains('expanded');
                            if (isExpanded) {
                                target.classList.remove('expanded');
                                moreToggle.classList.remove('active');
                            } else {
                                target.classList.add('expanded');
                                moreToggle.classList.add('active');
                            }
                        }
                    }
                }
            }
        });

        document.addEventListener('hashChangeEvent', () => {
            this.applyHashDetailSelection();
            this.applyHashViewSelection();
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
                // Ensure trailing slash and append display/data/
                const baseRoot = web_root.endsWith('/') ? web_root : web_root + '/';
                return baseRoot + 'display/data/';
            }
        }

        // Fallback to using this.pathConfig.basePath if local_app.web_root() is not available
        return this.pathConfig.basePath;
    }

    getWebrootBasePath() {
        if (typeof local_app !== 'undefined' && typeof local_app.web_root === 'function') {
            const web_root = local_app.web_root();
            if (web_root) {
                return web_root.endsWith('/') ? web_root : web_root + '/';
            }
        }

        const currentPath = window.location.pathname;
        const teamIndex = currentPath.indexOf('/team/');
        if (teamIndex >= 0) {
            return currentPath.slice(0, teamIndex + 1);
        }

        return '/';
    }

    resolveDatasetUrl(path) {
        if (!path) {
            return path;
        }
        if (path.startsWith('http')) {
            return path;
        }
        if (path.startsWith('/')) {
            return this.getWebrootBasePath() + path.replace(/^\/+/, '');
        }
        return this.getDatasetBasePath() + path;
    }

    resolveConfigUrl(path) {
        if (!path) {
            return path;
        }
        if (path.startsWith('http')) {
            return path;
        }
        if (path.startsWith('/')) {
            return this.getWebrootBasePath() + path.replace(/^\/+/, '');
        }
        return this.getDatasetBasePath() + path;
    }

    async init() {

        //this.showLoadingState("Loading Dataset Choices");
        await this.loadShowConfigs();

        // If currentShow came from hash, don't update cache on initial load
        const urlParams = new URLSearchParams(window.location.hash.substring(1));
        const fromHash = urlParams.has('map') || urlParams.has('show'); // True or false

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
        const listwidget = document.getElementById('listwidget');
        listwidget.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p>${message}</p>
            </div>
        `;
    }

    getNotFoundMessage(listName) {
        return `
            <span class="material-icons" style="font-size: 48px; color: #999;">search_off</span>
            <p>List ${listName} not found.</p>
        `;
    }

    async syncDetailMapZoomFromWidget() {
        // Only run once on initial load
        if (this.detailMapZoomSynced) {
            return;
        }
        this.detailMapZoomSynced = true;

        // Wait for widget map to be ready
        if (!window.leafletMap || !window.leafletMap.map) {
            return;
        }

        // Check if there's a detail currently showing
        const hash = typeof getHash === 'function' ? getHash() : {};
        const hasDetail = hash.id || hash.detail;

        if (!hasDetail || !this.detailMap) {
            return;
        }

        // Get widget map zoom level
        const widgetZoom = window.leafletMap.map.getZoom();

        // If widget map is zoomed out (level 1 or 2), adjust detail map to level 3
        if (widgetZoom === 1 || widgetZoom === 2) {
            const center = this.detailMap.getCenter();
            this.detailMap.setView(center, 3, { animate: true });
            console.log('Detail map zoom synced from widget: widget zoom=' + widgetZoom + ', detail zoom set to 3');
        }
    }

    async loadShowConfigs() {
        // Check for source parameter from param object (set in localsite.js)
        let listsJson = (typeof param !== 'undefined' && param.source) ? param.source : null;

        // If no source parameter, use default logic
        if (!listsJson) {
            listsJson = "/team/projects/map/trade.json";if(Cookies.get('modelsite')?.indexOf("geo") >= 0 || location.host.indexOf("geo") >= 0 || location.host.indexOf("locations.pages.dev") >= 0) { listsJson = "/display/data/show.json" }
        }
        const configUrl = this.resolveConfigUrl(listsJson);
        console.log('map.js: local_app.web_root() =', local_app.web_root());
        console.log(`Loading configuration from: ${configUrl}`);
        const response = await fetch(configUrl);

        if (response.ok) {
            this.showConfigs = await response.json();
            return;
        } else {
            this.showConfigs = {}; // Blank response.
            return;
        }
        // message here maybe

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

        // If showConfig is found, clear any previous error display
        if (showConfig) {
            this.dataLoadError = null;
            this.error = null;
            // Check if we're recovering from an error (no widget content exists)
            const widgetContent = document.getElementById('widgetContent');
            if (!widgetContent) {
                // Force full render by clearing the dataset changing flag
                this.recoveringFromError = true;
            }
            // Clear error message from spinner if it exists
            const spinner = document.querySelector("#listwidget .loading");
            if (spinner && spinner.innerHTML.includes('not found')) {
                spinner.innerHTML = '<div class="spinner"></div><div>Loading listings...</div>';
            }
        }

        //alert(alwaysLoadSomething); // Hmm, this is also true for tabs. Figure out if we need alwaysLoadSomething.
        if (!showConfig && alwaysLoadSomething) { // AVOIDING, ELSE TABS ALWAYS SHOW THE FIRST MAP

            // Clear the prior display and show error message
            this.listings = [];
            this.filteredListings = [];

            // Set error message (reused by renderListings)
            this.dataLoadError = this.getNotFoundMessage(this.currentShow);
            this.loading = false;

            // Wait for and replace the loading spinner with error message
            waitForElm("#listwidget .loading").then((spinner) => {
                if (spinner) {
                    spinner.innerHTML = this.getNotFoundMessage(this.currentShow);
                }
            });

            return;
        }
        
        // If no showConfig found and alwaysLoadSomething is false, exit early
        if (!showConfig) {
            this.error = null;
            this.loading = false;
            return;
        }
        
        this.config = showConfig;
        window.mapDataAdminPath = showConfig?.dataadmin || showConfig?.dataAdmin || '';

        // Initialize filter terms once from config
        this.initializeFilterTerms();

        // Load citydata if configured (only once when config is loaded)
        if (this.config?.citydata && !this.citydataCache) {
            const citydataPath = this.config.citydata.toString();
            const citydataUrl = this.resolveDatasetUrl(citydataPath);
            this.loadCSVData(citydataUrl).then(data => {
                this.citydataCache = data;
                console.log(`Citydata loaded: ${data.length} rows`);
            }).catch(err => {
                console.error('Failed to load citydata:', err);
            });
        }

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

        // Normalize coordinate fields - add standardized latitude/longitude to each row
        data = this.normalizeCoordinateFields(data);

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

    initializeFilterTerms() {
        // Check for nearby field in config (list-of-lists JSON) using lowercase key
        const nearbyValue = this.config?.nearby;
        this.hasNearbyFilter = !!nearbyValue;

        // Parse comma-separated nearby values
        this.nearbyFilterTerms = nearbyValue
            ? nearbyValue.toString().split(',').map(term => term.trim().toLowerCase()).filter(Boolean)
            : [];
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
            const datasetUrl = this.resolveDatasetUrl(config.dataset);
            return await this.loadJSONData(datasetUrl);
        } else if (config.dataset) {
            const datasetUrl = this.resolveDatasetUrl(config.dataset);
            return await this.loadCSVData(datasetUrl, config);
        } else {
            return this.createMockData(config);
        }
    }

    // Check if dataset already has complete Latitude and Longitude data
    hasCompleteCoordinates(data) {
        if (!data || data.length === 0) return false;

        // Check if Latitude and Longitude columns exist
        const firstRow = data[0];
        const hasLatCol = firstRow.hasOwnProperty('LATITUDE') || firstRow.hasOwnProperty('Latitude') || firstRow.hasOwnProperty('latitude');
        const hasLonCol = firstRow.hasOwnProperty('LONGITUDE') || firstRow.hasOwnProperty('Longitude') || firstRow.hasOwnProperty('longitude');

        if (!hasLatCol || !hasLonCol) {
            debugAlert('📍 Dataset missing Latitude/Longitude columns');
            return false;
        }

        // Check if all rows have valid coordinates
        const missingCount = data.filter(row => {
            const lat = row.LATITUDE || row.Latitude || row.latitude;
            const lon = row.LONGITUDE || row.Longitude || row.longitude;
            return !lat || !lon || lat === '' || lon === '';
        }).length;

        if (missingCount > 0) {
            debugAlert(`📍 Dataset has ${missingCount} rows missing coordinates`);
            return false;
        }

        debugAlert('✅ All rows have lat/lon, skipping merge with geoDataset');
        return true;
    }

    async geocodeLocationWithLLM(locationString) {
        const prompt = `Please provide the latitude and longitude for this location: "${locationString}"

Return ONLY a JSON object in this exact format with coordinates rounded to 2 decimal places:
{"latitude": 00.00, "longitude": -00.00}

Do not include any explanation or additional text.`;

        try {
            // Try Gemini first
            const geminiResponse = await fetch('http://localhost:8081/api/gemini/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });

            if (geminiResponse.ok) {
                const result = await geminiResponse.json();
                if (result.success && result.analysis) {
                    const coords = this.parseCoordinatesFromLLM(result.analysis);
                    if (coords) {
                        debugAlert(`🌍 Gemini geocoded "${locationString}": ${coords.latitude}, ${coords.longitude}`);
                        return coords;
                    }
                }
            }

            // Fallback to Claude
            const claudeResponse = await fetch('http://localhost:8081/api/claude/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });

            if (claudeResponse.ok) {
                const result = await claudeResponse.json();
                if (result.success && result.analysis) {
                    const coords = this.parseCoordinatesFromLLM(result.analysis);
                    if (coords) {
                        debugAlert(`🌍 Claude geocoded "${locationString}": ${coords.latitude}, ${coords.longitude}`);
                        return coords;
                    }
                }
            }
        } catch (error) {
            console.error(`Geocoding failed for ${locationString}:`, error);
        }

        return null;
    }

    parseCoordinatesFromLLM(text) {
        try {
            // Try to find JSON in the response
            const jsonMatch = text.match(/\{[^}]*"latitude"[^}]*"longitude"[^}]*\}/);
            if (jsonMatch) {
                const coords = JSON.parse(jsonMatch[0]);
                if (coords.latitude && coords.longitude) {
                    // Round to 2 decimal places
                    return {
                        latitude: Math.round(coords.latitude * 100) / 100,
                        longitude: Math.round(coords.longitude * 100) / 100
                    };
                }
            }

            // Try to parse numbers directly
            const latMatch = text.match(/lat(?:itude)?[:\s]+(-?\d+\.?\d*)/i);
            const lonMatch = text.match(/lon(?:gitude)?[:\s]+(-?\d+\.?\d*)/i);
            if (latMatch && lonMatch) {
                return {
                    latitude: Math.round(parseFloat(latMatch[1]) * 100) / 100,
                    longitude: Math.round(parseFloat(lonMatch[1]) * 100) / 100
                };
            }
        } catch (error) {
            console.error('Failed to parse coordinates:', error);
        }
        return null;
    }

    getLocationKey(row, mergeColumn, isLocationField) {
        if (isLocationField && row.City && row.State) {
            const city = row.City.trim();
            const state = row.State.trim();
            return `${city}|${state}`;
        } else if (isLocationField && row.City) {
            return row.City.trim();
        } else if (row[mergeColumn]) {
            return row[mergeColumn];
        }
        return null;
    }

    async mergeGeoDataset(primaryData, config) {
        try {
            // Check if dataset already has complete coordinates - skip merge if so
            if (this.hasCompleteCoordinates(primaryData)) {
                return primaryData;
            }

            debugAlert('🌍 GEO MERGE: Starting geo dataset merge');

            // Load the geo dataset
            const geoDatasetUrl = this.resolveDatasetUrl(config.geoDataset);
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
            let alreadyHasCoords = 0;
            let addedColumns = new Set();
            let unmatchedValues = new Map(); // Track unmatched values with counts (location -> count)

            primaryData.forEach(primaryRow => {
                // Check if this row already has both Latitude and Longitude
                const lat = primaryRow.Latitude || primaryRow.LATITUDE || primaryRow.latitude;
                const lon = primaryRow.Longitude || primaryRow.LONGITUDE || primaryRow.longitude;
                const hasLat = lat && lat !== '' && lat !== null && lat !== undefined;
                const hasLon = lon && lon !== '' && lon !== null && lon !== undefined;

                // Skip merging if coordinates already exist
                if (hasLat && hasLon) {
                    alreadyHasCoords++;
                    return; // Skip to next row
                }

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

                    // Add all geo columns that don't already exist or are empty in primary data
                    Object.keys(geoRow).forEach(geoColumn => {
                        const shouldUpdate = !primaryRow.hasOwnProperty(geoColumn) ||
                                           primaryRow[geoColumn] === '' ||
                                           primaryRow[geoColumn] === null ||
                                           primaryRow[geoColumn] === undefined;

                        if (shouldUpdate) {
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
                    // Track values that couldn't be matched with their counts (only if lookupKey exists and coordinates are missing)
                    const currentCount = unmatchedValues.get(lookupKey) || 0;
                    unmatchedValues.set(lookupKey, currentCount + 1);
                }
            });
            
            const totalWithCoords = alreadyHasCoords + mergedCount;
            const coordsPercentage = Math.round(totalWithCoords/primaryData.length*100);

            debugAlert('🌍 GEO MERGE: Merged ' + mergedCount + ' records, added columns: ' + Array.from(addedColumns).join(', '));
            console.log(`🌍 GEO MERGE SUMMARY: ${totalWithCoords}/${primaryData.length} (${coordsPercentage}%) have coordinates - ${alreadyHasCoords} already had coords, ${mergedCount} newly merged from ${geoData.length} geo locations`);

            // Store merge information for search results display
            this.geoMergeInfo = {
                totalRecords: primaryData.length,
                mergedRecords: mergedCount,
                alreadyHadCoords: alreadyHasCoords,
                totalWithCoords: totalWithCoords,
                geoDatasetSize: geoData.length
            };

            // Track if we need to save changes to the CSV
            let coordinatesAdded = mergedCount > 0;

            // Handle unmatched values with LLM geocoding (only during "Refresh Locally")
            const isRefreshingLocally = config._isRefreshingLocally === true;

            // During "Refresh Locally", also check for rows with incomplete coordinates (either lat or lon is empty)
            if (isRefreshingLocally) {
                primaryData.forEach(row => {
                    const lat = row.Latitude || row.LATITUDE || row.latitude;
                    const lon = row.Longitude || row.LONGITUDE || row.longitude;
                    const hasLat = lat && lat !== '' && lat !== null && lat !== undefined;
                    const hasLon = lon && lon !== '' && lon !== null && lon !== undefined;

                    // If either coordinate is missing, add this location for LLM geocoding
                    if (!hasLat || !hasLon) {
                        const lookupKey = this.getLocationKey(row, mergeColumn, isLocationField);
                        if (lookupKey) {
                            const currentCount = unmatchedValues.get(lookupKey) || 0;
                            unmatchedValues.set(lookupKey, currentCount + 1);
                        }
                    }
                });
            }

            if (unmatchedValues.size > 0 && isRefreshingLocally) {
                debugAlert(`🤖 GEO MERGE: ${unmatchedValues.size} location(s) not found - will attempt LLM geocoding`);

                let geocodedCount = 0;

                // Sort by count (descending) - geocode most frequent locations first
                const sortedUnmatched = Array.from(unmatchedValues.entries())
                    .sort((a, b) => b[1] - a[1]);

                // Process each unmatched location
                for (const [location, count] of sortedUnmatched) {
                    // Try LLM geocoding
                    const coords = await this.geocodeLocationWithLLM(location);
                    if (coords) {
                        // Update all records with this location (use mixed case to match cities.csv)
                        primaryData.forEach(row => {
                            const rowLocation = this.getLocationKey(row, mergeColumn, isLocationField);
                            if (rowLocation === location) {
                                row.Latitude = coords.latitude;
                                row.Longitude = coords.longitude;
                                addedColumns.add('Latitude');
                                addedColumns.add('Longitude');
                            }
                        });
                        geocodedCount += count;
                        mergedCount += count;
                        coordinatesAdded = true;
                    } else {
                        debugAlert(`❌ Failed to geocode "${location}" (${count} record${count > 1 ? 's' : ''})`);
                    }
                }

                debugAlert(`✅ LLM Geocoding complete: ${geocodedCount} record(s) geocoded`);
            } else if (unmatchedValues.size > 0) {
                // Report unmatched values for non-refresh operations
                debugAlert(`❌ GEO MERGE FAILED: ${unmatchedValues.size} unique location(s) not found in geo dataset`);
                console.log(`❌ GEO MERGE FAILED: ${unmatchedValues.size} unique location(s) not found in geo dataset`);

                const sortedUnmatched = Array.from(unmatchedValues.entries())
                    .sort((a, b) => b[1] - a[1]);

                sortedUnmatched.forEach(([location, count]) => {
                    const message = `📍 Missing location: "${location}" (${count} record${count > 1 ? 's' : ''} failed to merge - no lat/lon available for map)`;
                    debugAlert(message);
                    console.log(message);
                });
            } else {
                debugAlert('✅ GEO MERGE: All values matched successfully in geo dataset');
                console.log(`✅ GEO MERGE: All locations have coordinates (${alreadyHasCoords} pre-existing + ${mergedCount} from geo dataset)`);
            }

            // Check for any rows still missing coordinates and report them
            const rowsMissingCoords = [];
            primaryData.forEach((row, index) => {
                const lat = row.Latitude || row.LATITUDE || row.latitude;
                const lon = row.Longitude || row.LONGITUDE || row.longitude;
                const hasLat = lat && lat !== '' && lat !== null && lat !== undefined;
                const hasLon = lon && lon !== '' && lon !== null && lon !== undefined;

                if (!hasLat || !hasLon) {
                    const locationName = row[mergeColumn] || row.Location || row.City || row.Name || `Row ${index + 1}`;
                    rowsMissingCoords.push(locationName);
                }
            });

            if (rowsMissingCoords.length > 0) {
                const message = `⚠️ ${rowsMissingCoords.length} of ${primaryData.length} row(s) still missing coordinates: ${rowsMissingCoords.join(', ')}`;
                debugAlert(message);
                console.log(message);
            } else {
                console.log(`✅ All ${primaryData.length} rows have coordinates`);
            }

            // Save updated coordinates back to CSV only during "Refresh Locally" operations
            if (coordinatesAdded && isRefreshingLocally && config.dataset && !config.dataset.startsWith('http')) {
                debugAlert('💾 Saving updated coordinates to CSV file...');
                await this.saveUpdatedDataset(primaryData, config.dataset);
            }

            return primaryData;
            
        } catch (error) {
            debugAlert('❌ GEO MERGE ERROR: ' + error.message);
            console.error('Error merging geo dataset:', error);
            // Return original data if merge fails
            return primaryData;
        }
    }

    async saveUpdatedDataset(data, localFilePath) {
        try {
            const response = await fetch('http://localhost:8081/api/save-dataset', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    data: data,
                    file_path: localFilePath
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to save dataset: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            debugAlert(`✅ Saved ${result.entries_count} entries with coordinates to ${localFilePath}`);
        } catch (error) {
            console.error('Error saving updated dataset:', error);
            debugAlert(`❌ Failed to save coordinates: ${error.message}`);
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
                    const datasetUrl = this.resolveDatasetUrl(config.dataset);
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
                const datasetUrl = this.resolveDatasetUrl(config.dataset);
                return await this.loadCSVData(datasetUrl, config);
            }

            return [];

        } catch (error) {
            console.error('API connection error:', error);
            this.displayAPIError(apiUrl, null, error.message, config);

            // Fallback to CSV on connection error
            if (config.dataset) {
                this.displayDebugMessage('⚠️ Using CSV fallback due to connection error', 'warning');
                const datasetUrl = this.resolveDatasetUrl(config.dataset);
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

            // Get the merge column from geoColumns config (for coordinate preservation)
            const mergeColumn = this.config?.geoColumns?.[0] || 'Location';

            // Get the merge source file from geoDataset config (e.g., "cities.csv", "counties.csv", "countries.csv")
            // This specifies which reference CSV to merge data from
            const mergeSourceFile = this.config?.geoDataset;

            // Build request body
            const requestBody = {
                api_url: apiUrl,
                local_file_path: localFilePath,
                omit_fields: omitFields,
                merge_column: mergeColumn
            };

            // Add merge_source_file if specified in config
            if (mergeSourceFile) {
                requestBody.merge_source_file = mergeSourceFile;
            }

            // Call the Rust endpoint to refresh the local file
            const response = await fetch('http://localhost:8081/api/refresh-local', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
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
            const entriesCount = result.data?.entries_count || 0;
            this.displayDebugMessage(`✅ Successfully refreshed local file: ${localFilePath} (${entriesCount} entries)`, 'success');

            // Mark that we're refreshing locally to enable LLM geocoding
            if (this.config) {
                this.config._isRefreshingLocally = true;
            }

            // Reload the data from the refreshed local file
            this.loading = true;
            this.render();
            await this.loadShowData();
            this.loading = false;
            this.render();

            // Clear the flag after reload
            if (this.config) {
                this.config._isRefreshingLocally = false;
            }

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
        // Always log to console
        console.log('DEBUG:', message);

        const colors = {
            'success': { bg: '#155724', border: '#28a745', text: '#00ff00' },
            'warning': { bg: '#856404', border: '#ffc107', text: '#ffeb3b' },
            'info': { bg: '#0c5460', border: '#17a2b8', text: '#00ffff' },
            'error': { bg: '#721c24', border: '#dc3545', text: '#ff4444' }
        };

        const color = colors[type] || colors.info;

        const timestamp = new Date().toLocaleTimeString();
        const messageHtml = `
            <div style="border-left: 4px solid ${color.border}; padding: 8px 12px; margin: 5px 0; background: ${color.bg}; color: ${color.text}; font-family: monospace; font-size: 12px;">
                ${timestamp}: ${message}
            </div>
        `;

        // Store message in queue
        if (!this.debugMessages) {
            this.debugMessages = [];
        }
        this.debugMessages.unshift(messageHtml); // Add to beginning

        // Keep only last 50 messages
        if (this.debugMessages.length > 50) {
            this.debugMessages.pop();
        }

        // Insert into the inspect mode debug div if it exists and inspect mode is enabled
        if (this.inspectMode) {
            const debugDiv = document.getElementById('inspect-debug-messages');
            if (debugDiv) {
                debugDiv.insertAdjacentHTML('afterbegin', messageHtml);

                // Keep only last 50 messages in the DOM too
                while (debugDiv.children.length > 50) {
                    debugDiv.removeChild(debugDiv.lastChild);
                }
            }
        }
    }

    showDebugCard() {
        // Show debug card immediately without re-rendering all listings
        const listingsGrid = document.querySelector('.listings-grid');
        if (!listingsGrid) return;

        // Don't add if it already exists
        if (document.getElementById('inspect-debug-card')) return;

        // Get stored debug messages
        const storedMessages = this.debugMessages ? this.debugMessages.join('') : '';
        const messagesContent = storedMessages || '<div style="color: #00ff00; padding: 8px;">No debug messages yet. Messages will appear here as they are generated.</div>';

        const debugCardHtml = `
            <div class="listing-card" id="inspect-debug-card" style="background: #1a1a1a; color: #00ff00; border: 2px solid #00ff00; position: relative;">
                <div class="listing-content">
                    <h3 class="listing-title" style="color: #00ff00; display: flex; justify-content: space-between; align-items: center;">
                        <span>Debug Messages</span>
                        <button id="close-inspect-debug" style="background: none; border: none; color: #00ff00; font-size: 24px; cursor: pointer; padding: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;" title="Close debug messages">&times;</button>
                    </h3>
                    <div id="inspect-debug-messages" style="font-family: 'Courier New', monospace; font-size: 12px; max-height: 400px; overflow-y: auto;">
                        ${messagesContent}
                    </div>
                </div>
            </div>
        `;

        // Insert at the beginning of the listings grid
        listingsGrid.insertAdjacentHTML('afterbegin', debugCardHtml);
    }

    populateDebugCard() {
        // Populate the debug card with actual messages
        const debugMessagesDiv = document.getElementById('inspect-debug-messages');
        if (!debugMessagesDiv) return;

        const storedMessages = this.debugMessages ? this.debugMessages.join('') : '';
        const messagesContent = storedMessages || '<div style="color: #00ff00; padding: 8px;">No debug messages yet. Messages will appear here as they are generated.</div>';

        debugMessagesDiv.innerHTML = messagesContent;
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
        // Data is normalized on load, so coordinates always use standard field names
        return {
            latitude: 'Latitude',
            longitude: 'Longitude'
        };
    }

    normalizeCoordinateFields(data) {
        // Add standardized Latitude/Longitude fields to each row
        // This happens once per dataset load instead of repeatedly during rendering
        if (!data || data.length === 0) {
            return data;
        }

        // Get the field mapping from the first row
        const sampleRow = data[0];
        const fieldNames = Object.keys(sampleRow);
        let latField = null;
        let lngField = null;

        // Check allColumns first if available
        if (this.config && this.config.allColumns && Array.isArray(this.config.allColumns)) {
            this.config.allColumns.forEach(field => {
                const lowerField = field.toLowerCase();
                if (lowerField === 'lat' || lowerField === 'latitude') {
                    latField = field;
                } else if (lowerField === 'lng' || lowerField === 'lon' || lowerField === 'longitude') {
                    lngField = field;
                }
            });
        } else {
            // Detect from actual field names
            fieldNames.forEach(field => {
                const lowerField = field.toLowerCase();
                if (lowerField === 'lat' || lowerField === 'latitude') {
                    latField = field;
                } else if (lowerField === 'lng' || lowerField === 'lon' || lowerField === 'longitude') {
                    lngField = field;
                }
            });
        }

        // Add standardized fields and remove originals
        if (latField && lngField) {
            data.forEach(row => {
                // Copy to standardized field names (capital L)
                if (!row.hasOwnProperty('Latitude') && row.hasOwnProperty(latField)) {
                    row.Latitude = row[latField];
                    // Remove original field if it's different from 'Latitude'
                    if (latField !== 'Latitude') {
                        delete row[latField];
                    }
                }
                if (!row.hasOwnProperty('Longitude') && row.hasOwnProperty(lngField)) {
                    row.Longitude = row[lngField];
                    // Remove original field if it's different from 'Longitude'
                    if (lngField !== 'Longitude') {
                        delete row[lngField];
                    }
                }
            });

            // Update allColumns config if it exists
            if (this.config && this.config.allColumns && Array.isArray(this.config.allColumns)) {
                const updatedColumns = this.config.allColumns.map(col => {
                    if (col === latField && latField !== 'Latitude') return 'Latitude';
                    if (col === lngField && lngField !== 'Longitude') return 'Longitude';
                    return col;
                });
                this.config.allColumns = updatedColumns;
            }

            this.displayDebugMessage(`Normalized - removed ${latField} and ${lngField}, added Latitude and Longitude`, 'success');
        }

        return data;
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

        ['zip', 'Zip', 'ZIP', 'zipcode', 'postal_code'].forEach(field => {
            if (listing[field] && !recognized.zip) {
                recognized.zip = listing[field];
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

        // Notes field
        ['notes', 'Notes', 'NOTES', 'note', 'Note'].forEach(field => {
            if (listing[field] && !recognized.notes) {
                recognized.notes = listing[field];
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

    getRecognizedKeySet() {
        // Normalize recognized keys to lowercase for consistent comparisons.
        return new Set([
            this.config?.nameColumn,
            this.config?.titleColumn,
            this.config?.addressColumn,
            this.config?.valueColumn,
            'city',
            'county',
            'state',
            'zip',
            'zipcode',
            'postal_code',
            'population',
            'pop',
            'phone',
            'telephone',
            'email',
            'website',
            'url',
            'description',
            'details',
            'notes',
            'note',
            'contact_name',
            'contactname',
            'contact name',
            'contact',
            'contact_email',
            'contactemail',
            'contact email',
            'contact_address',
            'contactaddress',
            'contact address'
        ].filter(Boolean).map(key => key.toString().toLowerCase()));
    }

    getUnrecognizedFields(listing) {
        // Recognized keys are excluded from "additional details" so core fields stay in primary display blocks.
        const recognizedKeys = this.getRecognizedKeySet();
        
        const unrecognized = {};
        Object.keys(listing).forEach(key => {
            const normalizedKey = key.toString().toLowerCase();
            if (!recognizedKeys.has(normalizedKey) && listing[key] && listing[key].toString().trim()) {
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
        const normalizedValue = this.normalizeCommaSpacing(strValue);
        
        // Format email addresses with mailto links
        if (fieldType === 'email' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedValue)) {
            return `<a href="mailto:${normalizedValue}">${normalizedValue}</a>`;
        }
        
        // Format links
        if (fieldType === 'url') {
            const link = this.formatUrlValue(normalizedValue);
            return link || normalizedValue;
        }
        const linkedValue = this.linkifyAndShortenUrls(normalizedValue);
        if (linkedValue !== normalizedValue) {
            return linkedValue;
        }

        // Format phone numbers
        if (fieldType === 'phone' || /^\+?[\d\s\-\(\)]+$/.test(normalizedValue)) {
            return normalizedValue.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
        }
        
        // Format population numbers
        if (fieldType === 'population' || (fieldType === 'text' && /^\d+$/.test(normalizedValue))) {
            const num = parseInt(normalizedValue);
            if (!isNaN(num) && num > 1000) {
                return num.toLocaleString();
            }
        }
        
        return normalizedValue;
    }

    normalizeCommaSpacing(value) {
        if (!value || !value.includes(',')) {
            return value;
        }
        let result = '';
        for (let i = 0; i < value.length; i++) {
            const char = value[i];
            if (char === ',') {
                const prev = value[i - 1] || '';
                const next = value[i + 1] || '';
                const betweenNumbers = /\d/.test(prev) && /\d/.test(next);
                result += char;
                if (!betweenNumbers && next !== ' ') {
                    result += ' ';
                }
                continue;
            }
            result += char;
        }
        return result;
    }

    formatUrlValue(rawValue) {
        if (!rawValue) {
            return '';
        }
        let workingValue = rawValue.trim();
        if (!workingValue) {
            return '';
        }
        const hasScheme = /^https?:\/\//i.test(workingValue);
        if (!hasScheme) {
            workingValue = `https://${workingValue}`;
        }
        let parsed;
        try {
            parsed = new URL(workingValue);
        } catch (error) {
            return '';
        }
        let href = parsed.href;
        let displayHost = parsed.hostname.toLowerCase();
        if (displayHost.startsWith('www.')) {
            displayHost = displayHost.slice(4);
        }
        if (displayHost === 'airnav.com') {
            const segments = parsed.pathname.split('/').filter(Boolean);
            if (segments.length >= 3) {
                const trimmedPath = `/${segments.slice(0, -1).join('/')}`;
                parsed.pathname = trimmedPath;
                parsed.search = '';
                parsed.hash = '';
                href = parsed.href;
            }
        }
        return `<a href="${href}" target="_blank" rel="noopener">${displayHost}</a>`;
    }

    linkifyAndShortenUrls(text) {
        if (!text) {
            return '';
        }
        // Skip if already contains HTML anchor tags
        if (text.includes('<a href=') || text.includes('<a href"')) {
            return text;
        }
        if (text.includes('@')) {
            return text;
        }
        const urlPattern = /\b(https?:\/\/[^\s]+|www\.[^\s]+|[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?)\b/gi;
        let hasMatch = false;
        const replaced = text.replace(urlPattern, (match) => {
            if (match.includes('@')) {
                return match;
            }
            const linkMarkup = this.formatUrlValue(match);
            if (linkMarkup) {
                hasMatch = true;
                return linkMarkup;
            }
            return match;
        });
        return hasMatch ? replaced : text;
    }

    formatCityStateZip(recognized) {
        if (!recognized) {
            return '';
        }
        const city = recognized.city ? recognized.city.toString().trim() : '';
        const state = recognized.state ? recognized.state.toString().trim() : '';
        const zip = recognized.zip ? recognized.zip.toString().trim() : '';
        if (!city && !state && !zip) {
            return '';
        }
        const cityState = city && state ? `${city}, ${state}` : (city || state);
        if (zip) {
            return cityState ? `${cityState} ${zip}` : zip;
        }
        return cityState;
    }

    buildDetailMapPopupContent(listing) {
        if (!listing) {
            return '';
        }
        const displayData = this.getDisplayData(listing, { includeAddress: false });
        const recognized = this.getRecognizedFields(listing);
        const contactAddressInfo = this.getFirstMatchingField(listing, [
            'contact_address', 'Contact Address', 'contactAddress', 'address', 'Address', 'street', 'Street'
        ]);
        const contactAddress = contactAddressInfo.value || recognized.address;
        const addressLine = contactAddress ? this.formatFieldValue(contactAddress) : '';
        const cityStateZip = this.formatCityStateZip(recognized);
        const titleLine = displayData.primary || recognized.name || 'Listing';

        const lines = [
            titleLine ? `<div class="location-title">${this.formatFieldValue(titleLine)}</div>` : '',
            addressLine ? `<div class="location-address">${addressLine}</div>` : '',
            cityStateZip ? `<div class="location-citystate">${cityStateZip}</div>` : ''
        ].filter(Boolean);

        if (!lines.length) {
            return '';
        }
        return `<div class="detailmap-popup">${lines.join('')}</div>`;
    }

    getContactName(listing) {
        return this.getFirstMatchingFieldValue(listing, [
            'contact_name', 'Contact Name', 'contactName', 'Contact', 'contact'
        ]);
    }

    getContactAddress(listing) {
        return this.getFirstMatchingFieldValue(listing, [
            'contact_address', 'Contact Address', 'contactAddress', 'address', 'Address', 'street', 'Street'
        ]);
    }

    getContactEmail(listing) {
        return this.getFirstMatchingFieldValue(listing, [
            'contact_email', 'Contact Email', 'contactEmail', 'email', 'Email', 'EMAIL'
        ]);
    }

    getFirstMatchingField(listing, keys = []) {
        if (!listing || !keys.length) {
            return { key: '', value: '' };
        }
        const lookup = {};
        Object.keys(listing).forEach((key) => {
            lookup[key.toString().toLowerCase()] = key;
        });
        for (const key of keys) {
            const actualKey = lookup[key.toString().toLowerCase()] || key;
            const value = listing[actualKey];
            if (value) {
                return { key: actualKey, value };
            }
        }
        return { key: '', value: '' };
    }

    getFirstMatchingFieldValue(listing, keys = []) {
        return this.getFirstMatchingField(listing, keys).value || '';
    }

    getRecognizedDisplayRows(recognized, options = {}) {
        const omitKeys = new Set((options.omitKeys || []).map(key => key.toString().toLowerCase()));
        const rows = [];

        const addRow = (label, value, key) => {
            if (!value) {
                return;
            }
            if (key && omitKeys.has(key)) {
                return;
            }
            rows.push({ label, value });
        };

        addRow('Title', recognized.title, 'title');
        addRow('County', recognized.county, 'county');
        addRow('Phone', recognized.phone, 'phone');
        addRow('Email', recognized.email, 'email');
        addRow('Website', recognized.website, 'website');
        addRow('Description', recognized.description, 'description');
        addRow('Population', recognized.population, 'population');

        return rows;
    }

    getFeaturedDisplayRows(listing) {
        const featuredColumns = this.config?.featuredColumns || [];
        if (!featuredColumns.length) {
            return [];
        }
        const rows = [];

        // Get omit_display list from config
        const omitList = this.config?.omit_display || [];
        const omitSet = new Set(omitList.map(col => col.toLowerCase()));

        featuredColumns.forEach((column) => {
            const normalizedColumn = column.toLowerCase();

            // Skip if this column is in omit_display
            if (omitSet.has(normalizedColumn)) {
                return;
            }

            let actualColumnName;
            let value;

            if (this.config?.allColumns && Array.isArray(this.config.allColumns)) {
                actualColumnName = column;
                value = listing[column];
            } else {
                actualColumnName = Object.keys(listing).find(key =>
                    key.toLowerCase() === column.toLowerCase()
                ) || column;
                value = listing[actualColumnName];
            }

            if (value && value.toString().trim()) {
                let formattedValue = value;
                if (normalizedColumn.includes('population')) {
                    formattedValue = this.formatFieldValue(value, 'population');
                } else {
                    formattedValue = this.formatFieldValue(value);
                }
                rows.push({
                    key: column.toString().toLowerCase(),
                    label: this.formatKeyName(column),
                    value: formattedValue
                });
            }
        });

        return rows;
    }

    getNumberedGroupData(listing) {
        const keySet = new Set();
        const grouped = new Map();
        const rows = [];

        if (!listing) {
            return { rows, keySet };
        }

        Object.keys(listing).forEach((key) => {
            const value = listing[key];
            if (!value || !value.toString().trim()) {
                return;
            }

            const normalized = key
                .toString()
                .replace(/[_-]+/g, ' ')
                .replace(/(\d)([A-Za-z])/g, '$1 $2')
                .trim();

            const match = normalized.match(/^(.+?)(\d+)\s+(.+)$/);
            if (!match) {
                return;
            }

            const base = match[1].trim();
            const index = parseInt(match[2], 10);
            const field = match[3].trim();

            if (!base || !field || Number.isNaN(index)) {
                return;
            }

            const baseKey = base.toLowerCase();
            if (!grouped.has(baseKey)) {
                grouped.set(baseKey, {
                    baseLabel: this.formatKeyName(base),
                    indices: new Map(),
                    indexOrder: []
                });
            }

            const group = grouped.get(baseKey);
            if (!group.indices.has(index)) {
                group.indices.set(index, { fields: [] });
                group.indexOrder.push(index);
            }

            group.indices.get(index).fields.push({
                label: this.formatKeyName(field),
                value: value.toString().trim()
            });

            keySet.add(key.toString().toLowerCase());
        });

        grouped.forEach((group) => {
            const indices = group.indexOrder.sort((a, b) => a - b);
            if (!indices.length) {
                return;
            }

            const startIndex = indices.includes(1) ? 1 : indices[0];
            for (let idx = startIndex; group.indices.has(idx); idx += 1) {
                const fields = group.indices.get(idx).fields;
                if (!fields.length) {
                    continue;
                }

                const value = fields.map(item => `${item.label} ${item.value}`).join(', ');
                rows.push({
                    key: group.baseLabel.toString().toLowerCase(),
                    label: group.baseLabel,
                    value
                });
            }
        });

        return { rows, keySet };
    }

    isFeaturedColumnKey(key) {
        const featuredColumns = this.config?.featuredColumns || [];
        if (!featuredColumns.length || !key) {
            return false;
        }
        const lowerKey = key.toString().toLowerCase();
        return featuredColumns.some(col => col.toLowerCase() === lowerKey);
    }

    getSharedDisplayRows(listing, options = {}) {
        const omitRecognizedKeys = new Set((options.omitRecognizedKeys || []).map(key => key.toString().toLowerCase()));
        const omitRowKeys = new Set((options.omitRowKeys || []).map(key => key.toString().toLowerCase()));

        // Get omit_display list from config
        const omitDisplayList = this.config?.omit_display || [];
        const omitDisplaySet = new Set(omitDisplayList.map(col => col.toLowerCase()));

        const recognized = this.getRecognizedFields(listing);
        const featuredRows = this.getFeaturedDisplayRows(listing)
            .filter(row => !row.key || !omitRowKeys.has(row.key));
        const numberedGroupRows = this.getNumberedGroupData(listing).rows
            .filter(row => !row.key || (!omitRowKeys.has(row.key) && !omitDisplaySet.has(row.key)));
        const featuredColumns = this.config?.featuredColumns || [];
        const featuredKeySet = new Set(featuredColumns.map(col => col.toString().toLowerCase()));
        const recognizedRows = this.getRecognizedDisplayRows(recognized, {
            omitKeys: [
                'name', 'title', 'address', 'city', 'state', 'zip', 'zipcode', 'postal_code', 'email',
                ...featuredKeySet,
                ...omitRecognizedKeys,
                ...omitDisplaySet
            ]
        });
        const maxFeaturedRows = Number.isFinite(options.maxFeaturedRows)
            ? Math.max(0, options.maxFeaturedRows)
            : null;
        const limitedFeaturedRows = maxFeaturedRows !== null
            ? featuredRows.slice(0, maxFeaturedRows)
            : featuredRows;
        return [...limitedFeaturedRows, ...numberedGroupRows, ...recognizedRows];
    }

    getListFeaturedRowsMax() {
        const baseMax = Number.isFinite(this.config?.listFeaturedColumnsMax)
            ? this.config.listFeaturedColumnsMax
            : 5;
        return baseMax + 5;
    }

    getDetailMetaRows(listing, helpers = {}) {
        const fieldMapping = helpers.fieldMapping || this.getFieldMapping();
        const numberedGroupKeys = helpers.numberedGroupKeys || this.getNumberedGroupData(listing).keySet;
        const isInFeaturedColumns = helpers.isInFeaturedColumns || ((key) => this.isFeaturedColumnKey(key));
        const isInOmitList = helpers.isInOmitList || ((key) => {
            const omitList = this.config?.omit_display || [];
            return omitList.some(col => col.toLowerCase() === key.toLowerCase());
        });

        const filteredRows = Object.entries(listing)
            .filter(([key, value]) =>
                !isInFeaturedColumns(key) &&
                !numberedGroupKeys.has(key.toLowerCase()) &&
                value &&
                value.toString().trim() !== '' &&
                value.toString().trim() !== '-' &&
                key !== fieldMapping.latitude &&
                key !== fieldMapping.longitude
            )
            .map(([key, value]) => ({
                label: this.formatKeyName(key),
                value: this.formatFieldValue(value)
            }));

        const unfilteredRows = Object.entries(listing)
            .filter(([key]) =>
                !isInFeaturedColumns(key) &&
                !numberedGroupKeys.has(key.toLowerCase()) &&
                key !== fieldMapping.latitude &&
                key !== fieldMapping.longitude
            )
            .map(([key, value]) => ({
                label: this.formatKeyName(key),
                value: value ? this.formatFieldValue(value) : ''
            }));

        // Add coordinates to the end if available
        const coords = this.getListingCoordinates(listing);
        if (coords) {
            const coordinatesRow = {
                label: 'Coordinates',
                value: `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`
            };
            filteredRows.push(coordinatesRow);
            unfilteredRows.push(coordinatesRow);
        }

        return { filteredRows, unfilteredRows };
    }

    formatKeyName(key) {
        if (!key) return '';

        // Words that should not be capitalized unless at the start
        const lowercaseWords = ['in', 'to', 'of', 'for', 'and', 'or', 'but', 'at', 'by', 'with', 'from', 'on', 'as', 'is', 'the', 'a', 'an'];
        // Words that should be all caps
        const uppercaseWords = ['id', 'url'];

        if (/^[A-Z0-9]+$/.test(key)) {
            return key;
        }

        return key
            .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') // Split acronym + word (FAAData -> FAA Data)
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2')  // Split lower/number + upper (Runway1ID -> Runway1 ID)
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
        const container = document.getElementById('widgetDetailsPopups');
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

        // Update the dropdown to reflect the current hash value
        const showSelect = document.getElementById('mapDataSelect');
        if (showSelect && showSelect.value !== showKey) {
            showSelect.value = showKey;
        }

        // Update URL hash
        //this.updateUrlHash(showKey); // Avoid because hash is driving

        // Only save to cache if this is a user-initiated change
        if (updateCache) {
            this.saveCachedShow(showKey);
        }
        //alert("priorHash.map " + priorHash.map);
        if (priorHash.map || priorHash.show) { // Also need to allow for map-none-map sequence.
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
                goHash({ show: e.target.value, id: '' });
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

        // Handle Expand List button click
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('expand-list-btn')) {
                e.preventDefault();
                e.stopPropagation();

                const widgetDetails = document.getElementById('widgetDetails');
                const heroContainer = document.getElementById('widgetHero');

                if (!widgetDetails || !heroContainer) {
                    return;
                }

                // Check if currently expanded
                const isExpanded = heroContainer.contains(widgetDetails) && heroContainer.style.display !== 'none';

                // Scroll to top BEFORE expanding
                const listingsContainer = document.querySelector('.listings-scroll-container');
                if (!isExpanded && listingsContainer) {
                    listingsContainer.scrollTop = 0;
                }

                // Create a synthetic button element with mywidgetpanel attribute for myHero
                const syntheticButton = document.createElement('button');
                syntheticButton.className = 'fullscreen-toggle-btn';
                syntheticButton.setAttribute('mywidgetpanel', 'widgetDetails');

                // Create synthetic event
                const syntheticEvent = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                });

                // Override event.target to point to our synthetic button
                Object.defineProperty(syntheticEvent, 'target', {
                    value: syntheticButton,
                    enumerable: true
                });

                // Store original event in window to allow myHero to access it
                window.event = syntheticEvent;

                // Call myHero to toggle expansion
                this.myHero(null, ['widgetDetails']);

                // Update button text based on new state (will be opposite of current)
                const newIsExpanded = heroContainer.contains(widgetDetails) && heroContainer.style.display !== 'none';
                e.target.textContent = newIsExpanded ? 'Collapse List' : 'Expand List';

                // Remove/add height restriction on listings container
                if (listingsContainer) {
                    if (newIsExpanded) {
                        listingsContainer.style.maxHeight = 'none';
                    } else {
                        listingsContainer.style.maxHeight = '';
                    }
                }
            }
        });

        // Handle menuToggleItem clicks - hide parent menu
        document.addEventListener('click', (e) => {
            const menuItem = e.target.closest('.menuToggleItem');
            if (menuItem) {
                // Find the parent menu
                const parentMenu = menuItem.closest('.menuToggleMenu');
                if (parentMenu) {
                    parentMenu.style.display = 'none';
                }
            }
        });

        // Handle image crop toggle
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('image-crop-toggle')) {
                e.preventDefault();
                e.stopPropagation();

                const button = e.target;
                const locationSection = document.getElementById('location-section');
                if (!locationSection) return;

                const currentState = button.dataset.cropState || 'cropped';

                if (currentState === 'cropped') {
                    // Switch to uncropped
                    locationSection.classList.remove('images-cropped');
                    button.dataset.cropState = 'uncropped';
                    button.textContent = 'Uncropped';
                } else {
                    // Switch to cropped
                    locationSection.classList.add('images-cropped');
                    button.dataset.cropState = 'cropped';
                    button.textContent = 'Cropped';
                }
            }
        });

        // Location close button now handled by panel menu system

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

        document.addEventListener('mouseover', (e) => {
            const card = e.target.closest('.listing-card');
            if (!card || card.contains(e.relatedTarget)) {
                return;
            }
            const listingId = card.dataset.listingId;
            if (listingId && window.leafletMap && typeof window.leafletMap.highlightMarkersByListingId === 'function') {
                window.leafletMap.highlightMarkersByListingId(listingId);
            }
        });

        document.addEventListener('mouseout', (e) => {
            const card = e.target.closest('.listing-card');
            if (!card || card.contains(e.relatedTarget)) {
                return;
            }
            // Keep highlight until another listing card is hovered.
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
        const listMaxFeaturedRows = this.getListFeaturedRowsMax();

        // Check if this is summary view
        if (this.isSummaryView()) {
            return this.renderSummaryListings(currentPageListings);
        }

        // Prepend debug messages card if inspect mode is enabled
        let debugCard = '';
        if (this.inspectMode) {
            // Get stored debug messages
            const storedMessages = this.debugMessages ? this.debugMessages.join('') : '';
            const messagesContent = storedMessages || '<div style="color: #00ff00; padding: 8px;">No debug messages yet. Messages will appear here as they are generated.</div>';

            debugCard = `
                <div class="listing-card" id="inspect-debug-card" style="background: #1a1a1a; color: #00ff00; border: 2px solid #00ff00; position: relative;">
                    <div class="listing-content">
                        <h3 class="listing-title" style="color: #00ff00; display: flex; justify-content: space-between; align-items: center;">
                            <span>Debug Messages</span>
                            <button id="close-inspect-debug" style="background: none; border: none; color: #00ff00; font-size: 24px; cursor: pointer; padding: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;" title="Close debug messages">&times;</button>
                        </h3>
                        <div id="inspect-debug-messages" style="font-family: 'Courier New', monospace; font-size: 12px; max-height: 400px; overflow-y: auto;">
                            ${messagesContent}
                        </div>
                    </div>
                </div>
            `;
        }

        const listingsHtml = currentPageListings.map((listing, index) => {
            const displayData = this.getDisplayData(listing);
            const recognized = this.getRecognizedFields(listing);
            const uniqueId = `details-${Math.random().toString(36).substr(2, 9)}`;
            const listingIndex = (this.currentPage - 1) * this.itemsPerPage + index;
            const listingHashId = this.getListingHashId(listing, listingIndex);
            
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
            const metaRows = this.getDetailMetaRows(listing, {
                isInFeaturedColumns,
                isInOmitList,
                fieldMapping
            });
            const additionalDetailsCount = metaRows.filteredRows.length;
            const evenMoreCount = metaRows.unfilteredRows.length;
            
            return `
                <div class="listing-card" data-listing-id="${listingHashId}">
                    <div class="listing-content">
                        <h3 class="listing-title" data-listing-index="${listingIndex}">${displayData.primary || recognized.name || 'Listing'}</h3>
                        ${this.renderListingDetailContent(listing, {
                            metaId: `${uniqueId}-more`,
                            evenMetaId: `${uniqueId}-even`,
                            metaGroup: uniqueId,
                            metaRows,
                            showMetaButtons: true,
                            showViewDetailsButton: true,
                            maxFeaturedRows: listMaxFeaturedRows,
                            listingIndex,
                            listingHashId,
                            truncateLength: 100
                        })}
                    </div>
                </div>
            `;
        }).join('');

        return debugCard + listingsHtml;
    }

    renderMapGallerySection() {
        // Check if there's a hash.id to determine initial visibility
        let initialDisplay = 'none';
        if (typeof getHash === 'function') {
            const hash = getHash();
            const hashId = hash?.id || hash?.detail;
            if (hashId) {
                initialDisplay = 'block';
            }
        }

        return `
            <section class="location-section images-cropped" id="location-section" style="display: ${initialDisplay};">
                <div class="location-header">
                    <h2 class="location-title">Listing Details</h2>
                    <div id="detailHero"></div>
                    <div id="detailArrows">
                        <div id="tourBackArrow" class="tour-back-arrow"><span class="material-icons">arrow_left</span></div>
                        <div id="tourForwardArrow" class="tour-forward-arrow"><span class="material-icons">arrow_right</span></div>
                    </div>
                    <div id="locationSectionMenuControl" style="position: absolute; right: 0; top: 4px;"></div>
                </div>
                <div class="location-content">
                    <div class="location-details" id="location-details">
                        ${this.renderDetailEmptyState()}
                    </div>
                    <div class="location-map">
                        <div id="detailmapPlaceholder" class="detailmap-placeholder">
                            <div id="detailmapWrapper" class="detailmap-wrapper" myparent="detailmapPlaceholder">
                                <div class="detailmap-wrap">
                                    <div id="detailmap"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        `;
    }

    renderDetailEmptyState() {
        return `
            <div class="location-empty">
                <div class="location-empty-title">No listing selected</div>
                <div class="location-empty-subtitle">Use "View Details" to preview a listing here.</div>
            </div>
        `;
    }

    getSelectedListing() {
        if (this.selectedListingIndex !== null && this.filteredListings[this.selectedListingIndex]) {
            return this.filteredListings[this.selectedListingIndex];
        }

        if (typeof getHash === 'function') {
            const hash = getHash();
            const hashId = hash?.id || hash?.detail;
            if (hashId) {
                const index = this.findListingIndexByHashId(hashId);
                if (index !== null && this.filteredListings[index]) {
                    this.selectedListingIndex = index;
                    return this.filteredListings[index];
                }
            }
        }

        this.selectedListingIndex = null;
        return null;
    }

    getListingIdValue(listing) {
        if (!listing) {
            return null;
        }
        const configuredId = this.config?.id;
        if (configuredId) {
            let configuredKey = configuredId;
            if (!this.config?.allColumns || !Array.isArray(this.config.allColumns)) {
                configuredKey = Object.keys(listing).find(key =>
                    key.toLowerCase() === configuredId.toLowerCase()
                ) || configuredId;
            }
            if (listing[configuredKey]) {
                return String(listing[configuredKey]).trim();
            }
        }

        const idKeys = ['id', 'ID', 'uuid', 'UUID', 'Id'];
        for (const key of idKeys) {
            if (listing[key]) {
                return String(listing[key]).trim();
            }
        }
        return null;
    }

    getListingHashId(listing, index) {
        const idValue = this.getListingIdValue(listing);
        if (idValue) {
            return idValue;
        }
        return `idx-${index + 1}`;
    }

    findListingIndexByHashId(hashId) {
        if (!hashId) {
            return null;
        }
        if (hashId.startsWith('idx-')) {
            const parsed = Number(hashId.replace('idx-', ''));
            const resolvedIndex = Number.isNaN(parsed) ? null : parsed - 1;
            return resolvedIndex !== null && resolvedIndex >= 0 ? resolvedIndex : null;
        }
        const matchIndex = this.filteredListings.findIndex((listing) => {
            return this.getListingIdValue(listing) === hashId;
        });
        return matchIndex >= 0 ? matchIndex : null;
    }

    applyHashDetailSelection() {
        if (typeof getHash !== 'function') {
            return;
        }
        const hash = getHash();
        const hashId = hash?.id || hash?.detail;

        // Check if id actually changed using priorHash
        const priorHashId = window.priorHash?.id || window.priorHash?.detail;

        if (hashId === priorHashId) {
            // Hash id hasn't changed, don't update
            return;
        }

        if (!hashId) {
            this.selectedListingIndex = null;
            const section = document.getElementById('location-section');
            if (section) {
                section.style.display = 'none';
            }
            this.updateMapGallerySection(null);
            return;
        }
        const section = document.getElementById('location-section');
        if (section) {
            section.style.display = '';
        }
        const index = this.findListingIndexByHashId(hashId);
        if (index !== null) {
            this.showListingDetailsByIndex(index);
            return;
        }
        if (typeof goHash === 'function') {
            goHash({ id: '' });
        }
        this.selectedListingIndex = null;
        if (section) {
            section.style.display = 'none';
        }
        this.updateMapGallerySection(null);
    }

    applyHashViewSelection() {
        if (typeof getHash !== 'function') {
            return;
        }
        const hash = getHash();
        const viewValue = hash?.view;

        // Only apply to detail view (#location-section)
        const locationSection = document.getElementById('location-section');
        if (!locationSection) {
            return;
        }

        // Check if location-section is actually visible (not display:none)
        if (locationSection.style.display === 'none') {
            return;
        }

        // Build mapping dynamically from buttons to avoid hardcoded IDs
        const viewToTargetId = {
            'nearby': 'map-gallery-nearby',
            'airports': 'map-gallery-airports',
            'more': 'location-meta',
            'evenmore': 'location-meta-even'
        };

        // Parse comma-separated view values
        const activeViews = viewValue ? viewValue.split(',').map(v => v.trim()).filter(Boolean) : [];

        // Use waitForElm to ensure the content is loaded before manipulating
        if (typeof waitForElm === 'function') {
            waitForElm('.location-meta').then(() => {
                this.updateViewSections(locationSection, viewToTargetId, activeViews);
            });
        } else {
            // Fallback if waitForElm is not available
            this.updateViewSections(locationSection, viewToTargetId, activeViews);
        }
    }

    updateViewSections(locationSection, viewToTargetId, activeViews) {
        // Get all sections and buttons
        const allSections = Object.values(viewToTargetId)
            .map(id => document.getElementById(id))
            .filter(Boolean);
        const allButtons = Array.from(locationSection.querySelectorAll('.location-more-toggle:not(.meta-less-btn)'));
        const metaToggles = Array.from(locationSection.querySelectorAll('.meta-toggle'));
        const lessBtn = locationSection.querySelector('.meta-less-btn');

        // Check if any meta views (more/evenmore) are active
        const hasMetaView = activeViews.some(v => v === 'more' || v === 'evenmore');

        // If no active views, collapse all sections and reset buttons
        if (activeViews.length === 0) {
            allSections.forEach(section => section.classList.remove('expanded'));
            allButtons.forEach(btn => {
                btn.classList.remove('active');
                btn.style.display = '';
                const label = btn.dataset.label;
                if (label) btn.textContent = label;
            });
            if (lessBtn) lessBtn.style.display = 'none';
            return;
        }

        // Get target sections for active views
        const activeTargetIds = activeViews.map(v => viewToTargetId[v]).filter(Boolean);
        const activeSections = activeTargetIds.map(id => document.getElementById(id)).filter(Boolean);

        // Update all sections
        allSections.forEach(section => {
            if (activeSections.includes(section)) {
                section.classList.add('expanded');
            } else {
                section.classList.remove('expanded');
            }
        });

        // Update buttons based on type
        allButtons.forEach(btn => {
            const targetId = btn.dataset.target;
            const toggleType = btn.dataset.toggleType;
            const isActive = activeTargetIds.includes(targetId);

            if (toggleType === 'independent') {
                // Nearby/Airports - keep label, just toggle active class
                if (isActive) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
                // Always show independent toggles
                btn.style.display = '';
            } else if (toggleType === 'meta') {
                // More/Even More - hide when meta view is active
                btn.classList.remove('active');
                const label = btn.dataset.label;
                if (label) btn.textContent = label;

                // Special handling for "Even More" button
                const isEvenMoreButton = targetId && targetId.includes('even');
                if (isEvenMoreButton) {
                    // Show "Even More" button when viewing "more" but hide when viewing "evenmore"
                    const isViewingEvenMore = activeViews.includes('evenmore');
                    btn.style.display = isViewingEvenMore ? 'none' : '';
                } else {
                    // Hide "More" button when any meta view is active
                    btn.style.display = hasMetaView ? 'none' : '';
                }
            }
        });

        // Show/hide Less button based on meta view state
        if (lessBtn) {
            lessBtn.style.display = hasMetaView ? '' : 'none';
        }
    }

    showListingDetailsByIndex(index) {
        if (!this.filteredListings[index]) {
            return;
        }

        this.selectedListingIndex = index;
        this.updateMapGallerySection(this.filteredListings[index]);

        // Scroll to listwidget with margin above (only if header exists)
        const header = document.querySelector('header') || document.getElementById('headerbar');
        if (header) {
            const listwidget = document.getElementById('listwidget');
            if (listwidget) {
                const headerHeight = header.offsetHeight;
                const marginTop = 10;
                const listwidgetTop = listwidget.getBoundingClientRect().top + window.pageYOffset - headerHeight - marginTop;
                window.scrollTo({ top: listwidgetTop, behavior: 'smooth' });
            }
        }

        // Clear arrow navigation flag
        this.arrowNavigation = false;
    }

    updateMapGallerySection(listing) {
        const detailsContainer = document.getElementById('location-details');
        const headerTitle = document.querySelector('.location-header .location-title');
        const section = document.getElementById('location-section');
        if (!detailsContainer) {
            return;
        }

        // Check if tour is playing for fade effect
        const hash = this.getCurrentHash();
        const isTourPlaying = hash && hash.detailplay === 'true';

        if (!listing) {
            detailsContainer.innerHTML = this.renderDetailEmptyState();
            if (headerTitle) {
                headerTitle.textContent = 'Listing Details';
            }
            const mapEl = document.getElementById('detailmap');
            if (mapEl) {
                mapEl.dataset.hasImages = 'false';
            }
            this.updateDetailMap(null);
            // Hide location section when no listing
            if (section) {
                section.style.display = 'none';
            }
            return;
        }

        // Show location section when there's a listing
        if (section) {
            section.style.display = 'block';
        }

        const galleryImages = this.getListingImages(listing);
        const displayData = this.getDisplayData(listing);
        const recognized = this.getRecognizedFields(listing);

        // Trigger fade transition during tour
        if (isTourPlaying && section) {
            section.classList.add('fading');
            // Small delay to trigger CSS transition
            setTimeout(() => {
                if (headerTitle) {
                    headerTitle.textContent = displayData.primary || recognized.name || 'Listing Details';
                }
                detailsContainer.innerHTML = `
                    ${this.renderListingDetailContent(listing, {
                        metaId: 'location-meta',
                        evenMetaId: 'location-meta-even',
                        metaGroup: 'map-gallery',
                        metaRows: this.getDetailMetaRows(listing),
                        showMetaButtons: true,
                        showCroppedButton: galleryImages.length >= 2
                    })}
                `;

                // Insert gallery markup after .location-content
                const locationContent = document.querySelector('.location-content');
                if (locationContent) {
                    // Remove any existing gallery markup (both .description-images-nav and .image-gallery divs)
                    let nextSibling = locationContent.nextElementSibling;
                    while (nextSibling && (nextSibling.classList.contains('description-images-nav') || nextSibling.classList.contains('image-gallery'))) {
                        const toRemove = nextSibling;
                        nextSibling = nextSibling.nextElementSibling;
                        toRemove.remove();
                    }
                    locationContent.insertAdjacentHTML('afterend', this.renderGalleryMarkup(galleryImages));
                }

                const mapEl = document.getElementById('detailmap');
                if (mapEl) {
                    mapEl.dataset.hasImages = galleryImages.length ? 'true' : 'false';
                }

                this.setupGalleryNavigation(section, galleryImages, galleryImages);
                this.ensureGalleryImageModal();
                this.updateDetailMap(listing);

                // Remove fading class to fade back in
                setTimeout(() => {
                    section.classList.remove('fading');
                }, 50);
            }, 150);
        } else {
            // No fade for non-tour navigation
            if (headerTitle) {
                headerTitle.textContent = displayData.primary || recognized.name || 'Listing Details';
            }
            detailsContainer.innerHTML = `
                ${this.renderListingDetailContent(listing, {
                    metaId: 'location-meta',
                    evenMetaId: 'location-meta-even',
                    metaGroup: 'map-gallery',
                    metaRows: this.getDetailMetaRows(listing),
                    showMetaButtons: true,
                    showCroppedButton: galleryImages.length >= 2
                })}
            `;

            // Insert gallery markup after .location-content
            const locationContent = document.querySelector('.location-content');
            if (locationContent) {
                // Remove any existing gallery markup (both .description-images-nav and .image-gallery divs)
                let nextSibling = locationContent.nextElementSibling;
                while (nextSibling && (nextSibling.classList.contains('description-images-nav') || nextSibling.classList.contains('image-gallery'))) {
                    const toRemove = nextSibling;
                    nextSibling = nextSibling.nextElementSibling;
                    toRemove.remove();
                }
                locationContent.insertAdjacentHTML('afterend', this.renderGalleryMarkup(galleryImages));
            }

            const mapEl = document.getElementById('detailmap');
            if (mapEl) {
                mapEl.dataset.hasImages = galleryImages.length ? 'true' : 'false';
            }

            this.setupGalleryNavigation(section, galleryImages, galleryImages);
            this.ensureGalleryImageModal();
            this.updateDetailMap(listing);
        }

        // Check if tour is playing and restore pause icon
        if (isTourPlaying && typeof updateTourIcon === 'function') {
            waitForElm('#location-sectionMenuToggleIcon').then(() => {
                updateTourIcon('location-section', 'pause');
            });
        }

        // Restart tour to set timeout for next slide (if tour is playing)
        if (isTourPlaying && typeof startTour === 'function') {
            setTimeout(() => {
                startTour('location-section', true);
            }, 100);
        }

        // Populate listing IDs for arrow navigation (reuse tour logic)
        if (typeof window.tourState !== 'undefined') {
            const listingCards = document.querySelectorAll('.listing-card[data-listing-id]');
            const listingIds = Array.from(listingCards)
                .map(card => card.getAttribute('data-listing-id'))
                .filter(id => id);

            if (listingIds.length > 0) {
                window.tourState.listingIds = listingIds;
            }
        }

        // Setup back arrow and add alert based on tour state
        const backArrow = document.getElementById('tourBackArrow');
        if (backArrow) {
            // Setup click handler for back arrow - navigate to previous listing using tour sequence
            backArrow.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();

                console.log('Back arrow clicked');

                // Get current hash
                const currentHash = this.getCurrentHash();
                const currentId = currentHash.id;

                // Use tour state listing IDs (same sequence as forward navigation)
                if (typeof window.tourState !== 'undefined' && window.tourState.listingIds && window.tourState.listingIds.length > 0) {
                    const listingIds = window.tourState.listingIds;

                    // Find current ID in the tour sequence
                    const currentIndex = listingIds.indexOf(currentId);

                    console.log('Current ID:', currentId);
                    console.log('Current index in tour:', currentIndex);
                    console.log('Total listings:', listingIds.length);

                    if (currentIndex > 0) {
                        // Navigate to previous listing in sequence
                        const previousId = listingIds[currentIndex - 1];
                        console.log('Navigating to previous ID:', previousId);
                        if (typeof goHash === 'function') {
                            // Set temporary flag to prevent scrolling
                            this.arrowNavigation = true;
                            goHash({ id: previousId, view: currentHash.view || '', detailplay: currentHash.detailplay || '' });
                        }
                    } else if (currentIndex === 0) {
                        // At first slide - remove id from hash
                        console.log('At first slide - removing id from hash');
                        if (typeof goHash === 'function') {
                            // Set temporary flag to prevent scrolling
                            this.arrowNavigation = true;
                            goHash({ id: '', view: currentHash.view || '', detailplay: currentHash.detailplay || '' });
                        }
                    } else {
                        console.log('Current ID not found in tour sequence');
                    }
                } else {
                    console.log('Tour state not available');
                }

                /* Commented out - pause tour when going back (restore if needed)
                // Stop the tour
                if (typeof stopTour === 'function') {
                    stopTour('location-section');
                }
                // Navigate with detailplay removed
                goHash({ id: previousId, detailplay: '', view: currentHash.view || '' });
                */
            };
        }

        // Setup forward arrow
        const forwardArrow = document.getElementById('tourForwardArrow');
        if (forwardArrow) {
            // Setup click handler for forward arrow - navigate to next listing using tour sequence
            forwardArrow.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();

                console.log('Forward arrow clicked');

                // Get current hash
                const currentHash = this.getCurrentHash();
                const currentId = currentHash.id;

                // Use tour state listing IDs (same sequence as tour navigation)
                if (typeof window.tourState !== 'undefined' && window.tourState.listingIds && window.tourState.listingIds.length > 0) {
                    const listingIds = window.tourState.listingIds;

                    // Find current ID in the tour sequence
                    const currentIndex = listingIds.indexOf(currentId);

                    console.log('Current ID:', currentId);
                    console.log('Current index in tour:', currentIndex);
                    console.log('Total listings:', listingIds.length);

                    if (currentIndex >= 0 && currentIndex < listingIds.length - 1) {
                        // Navigate to next listing in sequence
                        const nextId = listingIds[currentIndex + 1];
                        console.log('Navigating to next ID:', nextId);
                        if (typeof goHash === 'function') {
                            // Set temporary flag to prevent scrolling
                            this.arrowNavigation = true;
                            goHash({ id: nextId, view: currentHash.view || '', detailplay: currentHash.detailplay || '' });
                        }
                    } else if (currentIndex === listingIds.length - 1) {
                        // At last slide - loop back to first
                        console.log('At last slide - looping to first');
                        if (typeof goHash === 'function') {
                            // Set temporary flag to prevent scrolling
                            this.arrowNavigation = true;
                            goHash({ id: listingIds[0], view: currentHash.view || '', detailplay: currentHash.detailplay || '' });
                        }
                    } else {
                        console.log('Current ID not found in tour sequence');
                    }
                } else {
                    console.log('Tour state not available');
                }
            };
        }

        // Alert turned off per user request
        // if (isTourPlaying) {
        //     const displayData = this.getDisplayData(listing);
        //     const recognized = this.getRecognizedFields(listing);
        //     const title = displayData.primary || recognized.name || 'Listing';
        //     alert(`Tour: Loaded ${title} at ${new Date().toLocaleTimeString()}`);
        // }
    }

    renderListingDetailContent(listing, options = {}) {
        const displayData = this.getDisplayData(listing, { includeAddress: false });
        const recognized = this.getRecognizedFields(listing);
        const fieldMapping = this.getFieldMapping();
        const extraFields = this.getUnrecognizedFields(listing);
        const devmode = (typeof Cookies !== 'undefined' && Cookies.get && Cookies.get('devmode')) || '';
        const isDevMode = devmode === 'dev';

        // Get web_root for constructing full URLs
        const web_root = (typeof local_app !== 'undefined' && typeof local_app.web_root === 'function')
            ? local_app.web_root()
            : '';

        const omitRecognizedKeys = new Set();
        const omitRowKeys = new Set();

        // Get omit_display list from config
        const omitList = this.config?.omit_display || [];
        const omitSet = new Set(omitList.map(col => col.toLowerCase()));

        // Helper function to check if a field should be omitted
        const shouldOmitField = (fieldNames) => {
            return fieldNames.some(name => omitSet.has(name.toLowerCase()));
        };

        const titleText = displayData.primary || recognized.name || 'Listing';
        const contactNameInfo = this.getFirstMatchingField(listing, [
            'contact_name', 'Contact Name', 'contactName', 'Contact', 'contact'
        ]);
        const contactEmailInfo = this.getFirstMatchingField(listing, [
            'contact_email', 'Contact Email', 'contactEmail', 'email', 'Email', 'EMAIL'
        ]);
        const contactAddressInfo = this.getFirstMatchingField(listing, [
            'contact_address', 'Contact Address', 'contactAddress', 'address', 'Address', 'street', 'Street'
        ]);
        const cityInfo = this.getFirstMatchingField(listing, ['city', 'City', 'CITY']);
        const stateInfo = this.getFirstMatchingField(listing, ['state', 'State', 'STATE']);
        const zipInfo = this.getFirstMatchingField(listing, ['zip', 'Zip', 'ZIP', 'zipcode', 'postal_code']);

        // Check if fields should be omitted
        const omitContact = shouldOmitField(['contact', 'contact_name', 'contact_email']);
        const omitAddress = shouldOmitField(['address', 'contact_address']);
        const omitCityStateZip = shouldOmitField(['city', 'state', 'zip', 'zipcode', 'postal_code']);

        const contactNameRaw = contactNameInfo.value;
        const contactEmail = contactEmailInfo.value || recognized.email;
        const contactAddress = contactAddressInfo.value || recognized.address;
        const contactName = contactNameRaw && contactNameRaw.toString().trim() !== titleText.toString().trim()
            ? contactNameRaw
            : '';
        const addressLine = contactAddress && !omitAddress ? this.formatFieldValue(contactAddress) : '';
        const cityStateZip = !omitCityStateZip ? this.formatCityStateZip(recognized) : '';

        // Get truncation length from options (100 for list, 255 for detail view)
        const truncateLength = options.truncateLength || 255;

        // Helper function to truncate text and add "more" link
        const truncateWithMore = (text, maxLength = truncateLength) => {
            if (!text) return '';
            const textStr = text.toString().trim();
            if (textStr.length <= maxLength) {
                const formatted = this.formatFieldValue(textStr);
                // Remove all <p>, </p>, and <br> tags, and leading &nbsp;
                return formatted
                    .replace(/^&nbsp;\s*/, '')
                    .replace(/<\/?p>/gi, '')
                    .replace(/<br\s*\/?>/gi, '')
                    .trim();
            }

            // Find the last space before maxLength to break at word boundary
            let breakPoint = maxLength;
            const lastSpace = textStr.lastIndexOf(' ', maxLength);
            if (lastSpace > maxLength * 0.8) { // Only break at word if we're at least 80% to the limit
                breakPoint = lastSpace;
            }

            const truncated = textStr.substring(0, breakPoint).trimEnd();
            const remaining = textStr.substring(breakPoint).trimStart();
            const uniqueId = `more-${Math.random().toString(36).substr(2, 9)}`;
            let formattedTruncated = this.formatFieldValue(truncated).replace(/^&nbsp;\s*/, '');
            let formattedRemaining = this.formatFieldValue(remaining).replace(/^&nbsp;\s*/, '');

            // Remove ALL <p>, </p>, and <br> tags to prevent extra spacing
            formattedTruncated = formattedTruncated
                .replace(/<\/?p>/gi, '')
                .replace(/<br\s*\/?>/gi, '')
                .trim();
            formattedRemaining = formattedRemaining
                .replace(/<\/?p>/gi, '')
                .replace(/<br\s*\/?>/gi, '')
                .trim();

            return `${formattedTruncated}<span id="${uniqueId}-dots">...</span><span id="${uniqueId}-more" style="display:none;"> ${formattedRemaining}</span> <a href="#" id="${uniqueId}-link" style="color:#94a3b8; text-decoration:none; margin-left:4px;" onclick="event.preventDefault(); toggleMoreLess('${uniqueId}');">more</a>`;
        };

        // Extract description and notes
        const descriptionText = recognized.description ? truncateWithMore(recognized.description) : '';
        const notesText = recognized.notes ? truncateWithMore(recognized.notes) : '';

        Object.entries(extraFields).some(([key]) => {
            if (key === fieldMapping.latitude || key === fieldMapping.longitude) {
                return false;
            }
            const lowerKey = key.toLowerCase();
            if (
                lowerKey.includes('address') ||
                lowerKey.includes('street') ||
                lowerKey.includes('city') ||
                lowerKey.includes('state') ||
                lowerKey.includes('zip') ||
                lowerKey.includes('postal') ||
                (lowerKey.includes('contact') && lowerKey.includes('name')) ||
                (lowerKey.includes('contact') && lowerKey.includes('email')) ||
                this.isFeaturedColumnKey(key)
            ) {
                return false;
            }
            if (lowerKey === 'name') {
                return false;
            }
            return false;
        });

        const tertiaryLine = displayData.tertiary || '';
        const showEmailLine = tertiaryLine && !(contactName && contactEmail);
        const normalizeHeaderValue = (value) => {
            if (value === null || value === undefined) {
                return '';
            }
            return this.formatFieldValue(value).toString().trim().toLowerCase();
        };
        const headerValues = new Set([
            contactName,
            contactEmail,
            contactAddress,
            tertiaryLine,
            cityStateZip
        ].filter(Boolean).map(normalizeHeaderValue));
        Object.entries(recognized).forEach(([key, value]) => {
            if (!value) {
                return;
            }
            if (headerValues.has(value.toString().trim().toLowerCase())) {
                omitRecognizedKeys.add(key.toString().toLowerCase());
            }
        });
        if (contactAddress) {
            omitRecognizedKeys.add('address');
        }
        if (cityStateZip) {
            ['city', 'state', 'zip', 'zipcode', 'postal_code'].forEach(key => omitRecognizedKeys.add(key));
            ['city', 'state', 'zip', 'zipcode', 'postal_code'].forEach(key => omitRowKeys.add(key));
            if (cityInfo.key) omitRowKeys.add(cityInfo.key.toString().toLowerCase());
            if (stateInfo.key) omitRowKeys.add(stateInfo.key.toString().toLowerCase());
            if (zipInfo.key) omitRowKeys.add(zipInfo.key.toString().toLowerCase());
        }
        if (contactEmail) {
            omitRecognizedKeys.add('email');
            omitRowKeys.add('email');
            if (contactEmailInfo.key) omitRowKeys.add(contactEmailInfo.key.toString().toLowerCase());
        }
        if (contactAddress && contactAddressInfo.key) {
            omitRowKeys.add(contactAddressInfo.key.toString().toLowerCase());
        }
        if (contactAddress && this.config?.addressColumn) {
            omitRowKeys.add(this.config.addressColumn.toString().toLowerCase());
        }
        if ((contactName || contactEmail) && contactNameInfo.key) {
            omitRowKeys.add(contactNameInfo.key.toString().toLowerCase());
        }
        if (headerValues.size && this.config?.featuredColumns?.length) {
            const featuredColumns = this.config.featuredColumns;
            featuredColumns.forEach((column) => {
                let actualColumnName;
                if (this.config?.allColumns && Array.isArray(this.config.allColumns)) {
                    actualColumnName = column;
                } else {
                    actualColumnName = Object.keys(listing).find(key =>
                        key.toLowerCase() === column.toLowerCase()
                    ) || column;
                }
                const value = listing[actualColumnName];
                if (!value) {
                    return;
                }
                const normalizedValue = normalizeHeaderValue(value);
                if (normalizedValue && headerValues.has(normalizedValue)) {
                    omitRowKeys.add(column.toString().toLowerCase());
                }
            });
        }
        omitRecognizedKeys.add('name');
        omitRecognizedKeys.add('title');
        omitRowKeys.add('name');
        omitRowKeys.add('title');
        if (descriptionText) {
            omitRecognizedKeys.add('description');
            omitRowKeys.add('description');
            omitRowKeys.add('details');
        }
        if (notesText) {
            omitRecognizedKeys.add('notes');
            omitRowKeys.add('notes');
            omitRowKeys.add('note');
        }
        if (showEmailLine && tertiaryLine.includes(':')) {
            const label = tertiaryLine.split(':')[0].trim().toLowerCase();
            if (label) {
                omitRowKeys.add(label);
            }
        }
        const sharedRows = this.getSharedDisplayRows(listing, {
            omitRecognizedKeys: Array.from(omitRecognizedKeys),
            omitRowKeys: Array.from(omitRowKeys),
            maxFeaturedRows: options.maxFeaturedRows
        });
        const sharedRowsMarkup = sharedRows.map(row => `
            <div class="location-row">
                <span class="location-label">${row.label}</span>
                <span class="location-value">${row.value}</span>
            </div>
        `).join('');

        const metaId = options.metaId || `location-meta-${Math.random().toString(36).substr(2, 8)}`;
        const evenMetaId = options.evenMetaId || `location-meta-even-${Math.random().toString(36).substr(2, 8)}`;
        const metaGroup = options.metaGroup || metaId;
        const hasMetaRows = sharedRows.length > 0;
        const metaRows = options.metaRows || this.getDetailMetaRows(listing);
        const moreCount = metaRows.filteredRows.length;
        const evenMoreCount = metaRows.unfilteredRows.length;

        const viewDetailsButton = options.showViewDetailsButton
            ? `<button class="view-details-btn location-btn" data-listing-index="${options.listingIndex}" data-listing-id="${options.listingHashId}">View Details</button>`
            : '';

        const splitContactList = (value) => {
            if (!value) {
                return [];
            }
            return value
                .toString()
                .split(',')
                .map(part => part.trim())
                .filter(Boolean);
        };
        const contactNameParts = splitContactList(contactName);
        const contactEmailParts = splitContactList(contactEmail);
        const contactParts = [];
        const usePairedLines = contactNameParts.length > 1
            && contactEmailParts.length > 1
            && contactNameParts.length === contactEmailParts.length;
        const contactCount = usePairedLines
            ? contactNameParts.length
            : Math.max(contactNameParts.length, contactEmailParts.length);
        if (usePairedLines) {
            const pairedLines = contactNameParts.map((name, idx) => {
                const formattedName = this.formatFieldValue(name);
                const formattedEmail = this.formatFieldValue(contactEmailParts[idx], 'email');
                return `${formattedName} ${formattedEmail}`.trim();
            });
            contactParts.push(pairedLines.join('<br>'));
        } else {
            if (contactName) {
                contactParts.push(this.formatFieldValue(contactName));
            }
            if (contactEmailParts.length) {
                const formattedEmails = contactEmailParts
                    .map(email => this.formatFieldValue(email, 'email'))
                    .join(', ');
                contactParts.push(formattedEmails);
            }
        }
        const contactLabel = contactCount > 1 ? 'Contacts:' : 'Contact:';
        const contactValue = usePairedLines
            ? `<br>${contactParts.join('')}`
            : ` ${contactParts.join(' ')}`;

        // Use pre-computed filter terms from config (set once in initializeFilterTerms)
        const hasNearby = this.hasNearbyFilter;
        const nearbyFilterTerms = this.nearbyFilterTerms || [];

        // Check for any field containing "airport" in the key
        const hasAirportDistance = Object.keys(listing).some(key =>
            key.toLowerCase().includes('airport') && listing[key] && listing[key].toString().trim()
        );
        const airportFilterTerms = ['airport'];

        // Log airport fields found
        if (hasAirportDistance) {
            const airportFields = Object.keys(listing).filter(key =>
                key.toLowerCase().includes('airport') && listing[key] && listing[key].toString().trim()
            );
            console.log('Airport fields found:', airportFields, 'Values:', airportFields.map(k => listing[k]));
        }

        // Helper function to format field names for display
        const formatFieldLabel = (key) => {
            return key
                .replace(/_/g, ' ')
                .replace(/([A-Z])/g, ' $1')
                .trim()
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
        };

        // Filter More rows to find fields matching airport terms (same process as nearby)
        const airportRows = hasAirportDistance && hasMetaRows
            ? metaRows.filteredRows.filter(row => {
                const labelLower = row.label.toLowerCase();
                return airportFilterTerms.some(term => labelLower.includes(term));
            })
            : [];

        // Filter More rows to find fields matching nearby terms
        const nearbyRows = hasNearby && hasMetaRows
            ? metaRows.filteredRows.filter(row => {
                const labelLower = row.label.toLowerCase();
                return nearbyFilterTerms.some(term => labelLower.includes(term));
            })
            : [];

        // Get FIPS code from citydata if available (only in detail view)
        let cityFIPS = null;

        // Only do FIPS lookup in detail view and if citydata cache exists
        const isDetailView = options.metaGroup === 'map-gallery';

        if (isDetailView && hasAirportDistance && this.citydataCache && recognized.city) {
            const cityName = recognized.city.toString().trim();
            const cityRow = this.citydataCache.find(row => {
                const rowCity = row.City || row.city || row.CITY || '';
                return rowCity.toString().trim().toLowerCase() === cityName.toLowerCase();
            });
            if (cityRow) {
                cityFIPS = cityRow.FIPS || cityRow.fips || cityRow.Fips || null;
            }
        }

        // Generate IDs for these sections
        const airportsId = `${metaGroup}-airports`;
        const nearbyId = `${metaGroup}-nearby`;

        return `
            <div class="location-listing">
                <div id="generalFields">
                    ${(!omitContact && (contactName || contactEmail)) ? `<div class="location-contact"><strong>${contactLabel}</strong>${contactValue}</div>` : ''}
                    ${showEmailLine ? `<div class="location-email">${tertiaryLine}</div>` : ''}
                    ${addressLine ? `<div class="location-address">${addressLine}</div>` : ''}
                    ${cityStateZip ? `<div class="location-citystate">${cityStateZip}</div>` : ''}
                    ${descriptionText ? `<div class="location-description">${descriptionText}</div>` : ''}
                    ${notesText ? `<div class="location-notes">${notesText}</div>` : ''}
                    ${sharedRowsMarkup ? `<div class="location-summary">${sharedRowsMarkup}</div>` : ''}
                </div>
                ${(options.showMetaButtons && (viewDetailsButton || hasNearby || hasAirportDistance || moreCount)) ? `
                    <div class="details-more-actions" style="margin-top:10px; display:flex; justify-content:space-between; align-items:center;">
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                            ${viewDetailsButton}
                            ${hasNearby ? `<button class="location-more-toggle location-btn" type="button" data-group="${metaGroup}" data-target="${nearbyId}" data-label="Nearby" data-toggle-type="independent">Nearby</button>` : ''}
                            ${hasAirportDistance ? `<button class="location-more-toggle location-btn" type="button" data-group="${metaGroup}" data-target="${airportsId}" data-label="Airports" data-toggle-type="independent">Airports</button>` : ''}
                            ${moreCount ? `<button class="location-more-toggle location-btn meta-toggle" type="button" data-group="${metaGroup}" data-target="${metaId}" data-label="More${isDevMode ? ' (' + moreCount + ')' : ''}" data-toggle-type="meta">More${isDevMode ? ' (' + moreCount + ')' : ''}</button>` : ''}
                            <button class="location-more-toggle location-btn meta-less-btn" type="button" data-group="${metaGroup}" data-toggle-type="meta-less" style="display:none; background:#94a3b8;">Less</button>
                        </div>
                        ${options.showCroppedButton ? '<button class="image-crop-toggle location-btn" type="button" data-crop-state="cropped">Cropped</button>' : ''}
                    </div>
                ` : ''}
                ${hasNearby ? `
                    <div class="location-meta" id="${nearbyId}">
                        ${nearbyRows.map(row => `
                            <div class="location-row">
                                <span class="location-label">${row.label}</span>
                                <span class="location-value">${row.value}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                ${hasAirportDistance ? `
                    <div class="location-meta" id="${airportsId}">
                        ${airportRows.map(row => `
                            <div class="location-row no-label">
                                <span class="location-value">${row.value}</span>
                            </div>
                        `).join('')}
                        ${cityFIPS ? `
                            <div class="location-row no-label">
                                <span class="location-value">FIPS: ${cityFIPS}</span>
                            </div>
                        ` : ''}
                        ${isDevMode && this.config?.airportdata ? `
                            <div class="location-row no-label" style="margin-top: 8px;">
                                <a href="${web_root}${this.config.airportdata}" target="_blank" style="color: #3b82f6; text-decoration: none;">All Airports (CSV)</a>
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
                ${hasMetaRows || moreCount || evenMoreCount ? `
                    <div class="location-meta" id="${metaId}">
                        ${metaRows.filteredRows.filter(row => {
                            // Omit Airport Distance if it's shown in the dedicated Airports section
                            if (hasAirportDistance && row.label && row.label.toLowerCase().replace(/\s+/g, '') === 'airportdistance') {
                                return false;
                            }
                            return true;
                        }).map(row => `
                            <div class="location-row">
                                <span class="location-label">${row.label}</span>
                                <span class="location-value">${row.value}</span>
                            </div>
                        `).join('')}
                        ${(isDevMode && evenMoreCount > moreCount) ? `
                            <div style="margin-top:10px">
                                <button class="location-more-toggle location-btn meta-toggle" type="button" data-group="${metaGroup}" data-target="${evenMetaId}" data-label="Even More (${evenMoreCount - moreCount})" data-toggle-type="meta">Even More (${evenMoreCount - moreCount})</button>
                            </div>
                        ` : ''}
                    </div>
                    <div class="location-meta" id="${evenMetaId}">
                        ${metaRows.unfilteredRows.map(row => `
                            <div class="location-row">
                                <span class="location-label">${row.label}</span>
                                <span class="location-value">${row.value || '-'}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                ${!hasMetaRows && !hasNearby && !hasAirportDistance && !moreCount && !evenMoreCount ? '<div class="location-empty">No details available.</div>' : ''}
            </div>
        `;
    }

    getDefaultGalleryImages() {

        return[]; // Remove if adding samples.

        return [
            { url: "../../img/presenting.jpg", path: "team/img/presenting.jpg" }
        ];
    }

    getListingImages(listing) {
        if (!listing) {
            return this.getDefaultGalleryImages();
        }

        const imageKeys = Object.keys(listing).filter((key) => {
            const lowerKey = key.toLowerCase();
            return lowerKey.includes('image') || lowerKey.includes('photo') || lowerKey.includes('logo') || lowerKey.includes('picture') || lowerKey.includes('thumbnail');
        });

        const images = [];
        imageKeys.forEach((key) => {
            const value = listing[key];
            if (!value) {
                return;
            }

            if (typeof value === 'string') {
                const trimmed = value.trim();
                if (trimmed.startsWith('http') || trimmed.match(/\.(png|jpe?g|webp|gif)$/i)) {
                    images.push({ url: trimmed, path: key });
                }
            }
        });

        return images.length ? images.slice(0, 12) : this.getDefaultGalleryImages();
    }

    formatGallerySourcePath(path) {
        return path || "";
    }

    getGalleryDisplayLabel(img) {
        if (!img || !img.url) {
            return '';
        }
        let filename = '';
        try {
            const urlObj = new URL(img.url, window.location.origin);
            const pathname = urlObj.pathname || '';
            filename = pathname.split('/').pop() || '';
        } catch (error) {
            const cleanUrl = img.url.split('?')[0].split('#')[0];
            filename = cleanUrl.split('/').pop() || '';
        }
        if (!filename) {
            return '';
        }
        const withoutExt = filename.replace(/\.[a-z0-9]+$/i, '');
        const withoutNumbers = withoutExt.replace(/\d+/g, '').replace(/[-_]+/g, ' ');
        const cleaned = withoutNumbers.replace(/\s+/g, ' ').trim();
        if (!cleaned) {
            return '';
        }
        return cleaned
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    getGallerySequenceBases(images) {
        const sequences = new Set();
        const grouped = new Map();
        images.forEach((img) => {
            const path = img.path || '';
            const match = path.toString().trim().match(/^(.*?)(\d+)$/);
            if (!match) {
                return;
            }
            const base = match[1].toLowerCase().replace(/\s+$/, '');
            const num = parseInt(match[2], 10);
            if (!base || Number.isNaN(num)) {
                return;
            }
            if (!grouped.has(base)) {
                grouped.set(base, []);
            }
            grouped.get(base).push(num);
        });
        grouped.forEach((nums, base) => {
            const unique = Array.from(new Set(nums)).sort((a, b) => a - b);
            if (unique.length < 2) {
                return;
            }
            const isConsecutive = unique[unique.length - 1] - unique[0] + 1 === unique.length;
            if (isConsecutive) {
                sequences.add(base);
            }
        });
        return sequences;
    }

    shouldShowGallerySource(images, img) {
        if (!img || !img.path) {
            return false;
        }
        const displayLabel = this.getGalleryDisplayLabel(img);
        if (displayLabel) {
            return true;
        }
        const allHaveNoDescription = images.every((entry) => {
            return !entry.description || !entry.description.toString().trim();
        });
        if (!allHaveNoDescription) {
            return true;
        }
        const sequenceBases = this.getGallerySequenceBases(images);
        if (!sequenceBases.size) {
            return true;
        }
        const match = img.path.toString().trim().match(/^(.*?)(\d+)$/);
        if (!match) {
            return true;
        }
        const base = match[1].toLowerCase().replace(/\s+$/, '');
        if (!base) {
            return true;
        }
        return !sequenceBases.has(base);
    }

    renderGalleryMarkup(images) {
        if (!images.length) {
            return '';
        }

        const preferThreeCol = images.length % 3 === 0 || images.length === 5;
        const galleryClass = preferThreeCol ? "image-gallery three-col-prefer" : "image-gallery";
        const navImages = images.slice(0, 3);
        const showGalleryButton = images.length > 3;
        const showNavControls = images.length > 1 || showGalleryButton;

        return `
            <div class="description-images-nav ${preferThreeCol ? 'three-col-prefer' : ''}" id="location-nav">
                <div class="image-stack" data-current-set="0" data-count="${Math.min(3, images.length)}">
                    ${navImages.map((img, index) => `
                        <div class="image-item" data-image-index="${index}">
                            <img src="${img.url}" alt="Gallery image" class="description-image" data-image-index="${index}" onerror="this.style.display='none'">
                            ${this.shouldShowGallerySource(images, img) ? `<div class="image-source">${this.getGalleryDisplayLabel(img) || this.formatGallerySourcePath(img.path)}</div>` : ''}
                        </div>
                    `).join('')}
                </div>
                ${showNavControls ? `
                <div class="image-nav-controls">
                    <button class="image-nav-btn image-nav-prev" aria-label="Previous image">‹</button>
                    <span class="image-counter">${images.length > 1 ? `1-${Math.min(3, images.length)} / ${images.length}` : `1 / ${images.length}`}</span>
                    <button class="image-nav-btn image-nav-next" aria-label="Next image">›</button>
                    ${showGalleryButton ? `<button class="view-gallery-btn" aria-label="View all images" title="View all images">⊞</button>` : ``}
                </div>` : ''}
            </div>
            <div class="${galleryClass}" style="display: none;">
                <div class="gallery-header">
                    <h5>Image Gallery (${images.length})</h5>
                    <button class="circular-close-btn" aria-label="Close gallery" title="Close gallery">
                        <i class="material-icons">cancel</i>
                    </button>
                </div>
                <div class="gallery-grid">
                    ${images.map((img, index) => `
                        <div class="gallery-item" data-gallery-index="${index}">
                            <img src="${img.url}" alt="Gallery image" class="gallery-image" data-gallery-index="${index}" onerror="this.parentElement.style.display='none'">
                            ${this.shouldShowGallerySource(images, img) ? `<div class="gallery-image-source">${this.getGalleryDisplayLabel(img) || this.formatGallerySourcePath(img.path)}</div>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    async ensureGalleryImageModal() {
        let modal = document.getElementById("gallery-image-modal");

        if (modal && modal.dataset.ready === "true") {
            return modal;
        }

        if (!modal) {
            modal = document.createElement("div");
            modal.id = "gallery-image-modal";
            modal.className = "product-image-modal";
            modal.setAttribute("aria-hidden", "true");
            modal.innerHTML = `
                <div class="product-image-modal-backdrop"></div>
                <div class="product-image-modal-content" role="dialog" aria-modal="true" aria-label="Gallery image preview">
                    <button type="button" class="product-image-modal-close" aria-label="Close image">
                        <span class="material-icons">close</span>
                    </button>
                    <img class="product-image-modal-img" alt="Gallery image preview">
                    <div class="product-image-modal-caption" aria-live="polite">
                        <span class="product-image-modal-caption-text"></span>
                        <button type="button" class="product-image-modal-caption-toggle" aria-expanded="false">More</button>
                    </div>
                    <div class="product-image-modal-nav" aria-hidden="true">
                        <button type="button" class="product-image-modal-prev" aria-label="Previous image">
                            <span class="material-icons">chevron_left</span>
                        </button>
                        <span class="product-image-modal-counter">1 / 1</span>
                        <button type="button" class="product-image-modal-next" aria-label="Next image">
                            <span class="material-icons">chevron_right</span>
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        if (modal.dataset.ready === "true") {
            return modal;
        }

        const closeButton = modal.querySelector(".product-image-modal-close");
        const backdrop = modal.querySelector(".product-image-modal-backdrop");
        const prevButton = modal.querySelector(".product-image-modal-prev");
        const nextButton = modal.querySelector(".product-image-modal-next");
        const captionToggle = modal.querySelector(".product-image-modal-caption-toggle");

        const closeModal = () => {
            modal.classList.remove("active");
            modal.setAttribute("aria-hidden", "true");
        };

        const stepImage = (direction) => {
            if (!modal._imageList || modal._imageList.length <= 1) {
                return;
            }
            const listLength = modal._imageList.length;
            modal._imageIndex = (modal._imageIndex + direction + listLength) % listLength;
            this.updateGalleryImageModal(modal);
        };

        closeButton.addEventListener("click", closeModal);
        backdrop.addEventListener("click", closeModal);
        prevButton.addEventListener("click", () => stepImage(-1));
        nextButton.addEventListener("click", () => stepImage(1));
        if (captionToggle) {
            captionToggle.addEventListener("click", () => {
                const caption = modal.querySelector(".product-image-modal-caption");
                if (!caption) {
                    return;
                }
                const isExpanded = caption.classList.toggle("expanded");
                captionToggle.setAttribute("aria-expanded", isExpanded ? "true" : "false");
                captionToggle.textContent = isExpanded ? "Less" : "More";
            });
        }

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && modal.classList.contains("active")) {
                closeModal();
            }
            if (event.key === "ArrowLeft" && modal.classList.contains("active")) {
                stepImage(-1);
            }
            if (event.key === "ArrowRight" && modal.classList.contains("active")) {
                stepImage(1);
            }
        });

        window.addEventListener("resize", () => {
            if (modal.classList.contains("active")) {
                this.adjustGalleryImageModalNav(modal);
            }
        });

        modal.dataset.ready = "true";
        return modal;
    }

    adjustGalleryImageModalNav(modal) {
        const image = modal.querySelector(".product-image-modal-img");
        if (!image) {
            return;
        }

        const rect = image.getBoundingClientRect();
        const isSmall = rect.width < 400 || rect.height < 400;
        modal.classList.toggle("nav-below", isSmall);
    }

    updateGalleryImageModal(modal) {
        const image = modal.querySelector(".product-image-modal-img");
        const counter = modal.querySelector(".product-image-modal-counter");
        const nav = modal.querySelector(".product-image-modal-nav");
        const list = modal._imageList || [];
        const caption = modal.querySelector(".product-image-modal-caption");
        const captionText = modal.querySelector(".product-image-modal-caption-text");
        const captionToggle = modal.querySelector(".product-image-modal-caption-toggle");

        if (!list.length) {
            return;
        }

        const currentUrl = list[modal._imageIndex];
        image.src = currentUrl;
        counter.textContent = `${modal._imageIndex + 1} / ${list.length}`;
        const hideNav = list.length <= 1;
        nav.setAttribute("aria-hidden", hideNav ? "true" : "false");
        nav.style.display = hideNav ? "none" : "flex";
        modal.classList.toggle("nav-hidden", hideNav);
        if (caption && captionText) {
            const dataList = modal._imageData || [];
            const currentData = dataList[modal._imageIndex] || null;
            const label = this.getGalleryDisplayLabel(currentData);
            const displayLabel = label || '';
            const isLong = displayLabel.length > 255;
            captionText.textContent = displayLabel;
            caption.style.display = displayLabel ? 'block' : 'none';
            caption.classList.remove("expanded");
            if (captionToggle) {
                captionToggle.style.display = isLong ? 'inline-block' : 'none';
                captionToggle.setAttribute("aria-expanded", "false");
                captionToggle.textContent = "More";
            }
        }
        image.onload = () => {
            requestAnimationFrame(() => this.adjustGalleryImageModalNav(modal));
        };
        this.adjustGalleryImageModalNav(modal);
    }

    async openGalleryImageModal(imageUrl, imageList = null, startIndex = null) {
        if (!imageUrl) {
            return;
        }

        const modal = await this.ensureGalleryImageModal();
        if (!modal) {
            return;
        }

        const hasObjects = Array.isArray(imageList) && imageList.length && typeof imageList[0] === 'object';
        const dataList = hasObjects ? imageList : [];
        const list = hasObjects
            ? imageList.map(entry => entry.url)
            : (Array.isArray(imageList) && imageList.length ? imageList : [imageUrl]);
        const resolvedIndex = typeof startIndex === "number"
            ? startIndex
            : Math.max(0, list.indexOf(imageUrl));

        modal._imageList = list;
        modal._imageData = dataList;
        modal._imageIndex = resolvedIndex;
        this.updateGalleryImageModal(modal);
        modal.classList.add("active");
        modal.setAttribute("aria-hidden", "false");
    }

    setupGalleryNavigation(container, images, galleryImages = []) {
        if (!images.length) return;

        const navContainer = container.querySelector('.description-images-nav');
        const imageStack = navContainer?.querySelector('.image-stack');
        const prevBtn = navContainer?.querySelector('.image-nav-prev');
        const nextBtn = navContainer?.querySelector('.image-nav-next');
        const counter = navContainer?.querySelector('.image-counter');
        const viewGalleryBtn = navContainer?.querySelector('.view-gallery-btn');
        const navControls = navContainer?.querySelector('.image-nav-controls');
        const gallery = container.querySelector('.image-gallery');
        const closeGalleryBtn = container.querySelector('.circular-close-btn');

        if (!navContainer || !imageStack) return;

        const setSize = 3;
        const totalSets = Math.ceil(images.length / setSize);
        let currentSet = 0;

        // Hide navigation controls if 3 or fewer images
        if (navControls) {
            navControls.style.display = images.length <= 3 ? 'none' : '';
        }

        const animateStack = (direction) => {
            imageStack.classList.remove('slide-left', 'slide-right');
            void imageStack.offsetWidth;
            imageStack.classList.add(direction === 'prev' ? 'slide-right' : 'slide-left');
        };

        imageStack.addEventListener('animationend', () => {
            imageStack.classList.remove('slide-left', 'slide-right');
        });

        const updateImageSet = () => {
            const startIndex = currentSet * setSize;
            const endIndex = Math.min(startIndex + setSize, images.length);
            const rangeLabel = startIndex + 1 === endIndex
                ? `${endIndex} / ${images.length}`
                : `${startIndex + 1}-${endIndex} / ${images.length}`;
            imageStack.dataset.count = String(endIndex - startIndex);
            imageStack.innerHTML = images.slice(startIndex, endIndex).map((img, offset) => {
                const index = startIndex + offset;
                const showSource = this.shouldShowGallerySource(images, img);
                const sourceLabel = this.getGalleryDisplayLabel(img) || this.formatGallerySourcePath(img.path);
                return `
                    <div class="image-item" data-image-index="${index}">
                        <img src="${img.url}" alt="Gallery image" class="description-image" data-image-index="${index}" onerror="this.style.display='none'">
                        ${showSource ? `<div class="image-source">${sourceLabel}</div>` : ''}
                    </div>
                `;
            }).join('');
            if (counter) counter.textContent = rangeLabel;
        };

        const updateGalleryNarrowState = () => {
            if (!gallery) {
                return;
            }
            const width = gallery.getBoundingClientRect().width;
            if (!width) {
                return;
            }
            gallery.classList.toggle('is-narrow', width <= 520);
        };

        if (gallery) {
            updateGalleryNarrowState();
            if (!gallery.dataset.narrowObserver && typeof ResizeObserver !== 'undefined') {
                const observer = new ResizeObserver(() => updateGalleryNarrowState());
                observer.observe(gallery);
                gallery.dataset.narrowObserver = 'true';
                gallery._narrowObserver = observer;
            }
        }

        if (prevBtn && totalSets > 1) {
            prevBtn.addEventListener('click', () => {
                currentSet = (currentSet - 1 + totalSets) % totalSets;
                updateImageSet();
                animateStack('prev');
            });
        }

        if (nextBtn && totalSets > 1) {
            nextBtn.addEventListener('click', () => {
                currentSet = (currentSet + 1) % totalSets;
                updateImageSet();
                animateStack('next');
            });
        }

        if (viewGalleryBtn && gallery) {
            viewGalleryBtn.addEventListener('click', () => {
                gallery.style.display = 'block';
                navContainer.style.display = 'none';
                requestAnimationFrame(() => updateGalleryNarrowState());
            });
        }

        if (closeGalleryBtn && gallery) {
            closeGalleryBtn.addEventListener('click', () => {
                gallery.style.display = 'none';
                navContainer.style.display = 'flex';
            });
        }

        imageStack.addEventListener('click', (event) => {
            const target = event.target.closest('.description-image');
            if (!target) {
                return;
            }
            const index = Number(target.dataset.imageIndex || 0);
            if (!galleryImages.length) {
                this.openGalleryImageModal(images[index]?.url, [images[index]], 0);
                return;
            }
            this.openGalleryImageModal(
                images[index]?.url,
                galleryImages,
                index
            );
        });

        if (galleryImages.length && gallery) {
            const galleryItems = gallery.querySelectorAll('.gallery-image');
            galleryItems.forEach((imgEl) => {
                imgEl.addEventListener('click', () => {
                    const index = Number(imgEl.dataset.galleryIndex || 0);
                    this.openGalleryImageModal(
                        galleryImages[index]?.url,
                        galleryImages,
                        index
                    );
                });
            });
        }

        if (totalSets > 1) {
            updateImageSet();
        }
    }

    getListingCoordinates(listing) {
        if (!listing) {
            return null;
        }
        const fieldMapping = this.getFieldMapping();
        const lat = listing[fieldMapping.latitude];
        const lng = listing[fieldMapping.longitude];
        if (lat === undefined || lng === undefined) {
            return null;
        }
        const latNum = parseFloat(lat);
        const lngNum = parseFloat(lng);
        if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
            return null;
        }
        return { lat: latNum, lng: lngNum };
    }

    getDetailMapStyles() {
        if (window.leafletMap && window.leafletMap.mapStyles) {
            return window.leafletMap.mapStyles;
        }
        if (window.leafletMapStyles) {
            return window.leafletMapStyles;
        }

        return {
            openstreetmap: {
                name: 'OpenStreetMap',
                url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                attribution: '© OpenStreetMap contributors'
            }
        };
    }

    getDetailMapDefaultStyleKey() {
        const styles = this.getDetailMapStyles();
        const cachedStyle = window.leafletMap && typeof window.leafletMap.loadCachedMapStyle === 'function'
            ? window.leafletMap.loadCachedMapStyle()
            : null;
        const preferredStyle = cachedStyle || (window.leafletMap ? window.leafletMap.currentMapStyle : null);

        if (preferredStyle && styles[preferredStyle]) {
            return preferredStyle;
        }

        const styleKeys = Object.keys(styles);
        return styleKeys.length ? styleKeys[0] : 'openstreetmap';
    }

    setDetailMapStyle(styleKey) {
        if (!this.detailMap) {
            return;
        }

        const styles = this.getDetailMapStyles();
        if (!styles[styleKey]) {
            return;
        }

        this.detailMapCurrentStyle = styleKey;

        this.detailMap.eachLayer((layer) => {
            if (layer instanceof L.TileLayer) {
                this.detailMap.removeLayer(layer);
            }
        });

        const style = styles[styleKey];
        const baseLayer = L.tileLayer(style.url, {
            attribution: style.attribution,
            maxZoom: 18
        }).addTo(this.detailMap);
        this.detailMapTileLayer = baseLayer;

        if (style.overlayUrl) {
            this.detailMapOverlayLayer = L.tileLayer(style.overlayUrl, {
                attribution: style.overlayAttribution || '',
                maxZoom: 18,
                minZoom: 8
            }).addTo(this.detailMap);
        } else {
            this.detailMapOverlayLayer = null;
        }

        if (style.filter) {
            requestAnimationFrame(() => {
                const mapContainer = document.getElementById('detailmap');
                if (!mapContainer) {
                    return;
                }
                const tilePanes = mapContainer.querySelectorAll('.leaflet-tile-pane');
                tilePanes.forEach((pane) => {
                    pane.style.filter = style.filter;
                });
            });
        }

        if (window.leafletMap && typeof window.leafletMap.saveCachedMapStyle === 'function') {
            window.leafletMap.saveCachedMapStyle(styleKey);
        }

        if (this.detailMapStyleControl?.select) {
            this.detailMapStyleControl.select.value = styleKey;
        }
    }

    toggleDetailMapControl(container, isOpen) {
        if (!container) {
            return;
        }
        const nextState = typeof isOpen === 'boolean' ? isOpen : !container.classList.contains('is-open');
        container.classList.toggle('is-open', nextState);
    }

    closeDetailMapControl(container) {
        if (!container) {
            return;
        }
        container.classList.remove('is-open');
    }

    refreshDetailMapStyleOptions() {
        if (!this.detailMapStyleControl?.select) {
            return;
        }
        const select = this.detailMapStyleControl.select;
        const styles = this.getDetailMapStyles();
        const currentValue = select.value;
        select.innerHTML = Object.entries(styles).map(([key, style]) =>
            `<option value="${key}">${style.name}</option>`
        ).join('');

        if (currentValue && styles[currentValue]) {
            select.value = currentValue;
        }
    }

    ensureDetailMapStylesReady() {
        if (!this.detailMap || !this.detailMapStyleControl?.select) {
            return;
        }

        const waitForStyles = () => {
            const hasSharedStyles = Boolean(window.leafletMapStyles || (window.leafletMap && window.leafletMap.mapStyles));
            if (!hasSharedStyles) {
                requestAnimationFrame(waitForStyles);
                return;
            }
            this.refreshDetailMapStyleOptions();
            const defaultStyle = this.getDetailMapDefaultStyleKey();
            this.setDetailMapStyle(defaultStyle);
        };

        requestAnimationFrame(waitForStyles);
    }

    addDetailMapStyleSelector() {
        if (!this.detailMap) {
            return;
        }

        const control = L.control({ position: 'bottomleft' });

        control.onAdd = () => {
            const div = L.DomUtil.create('div', 'map-style-selector detail-map-style-selector');
            const styles = this.getDetailMapStyles();
            div.innerHTML = `
                <button type="button" class="map-style-icon mapPopButton" title="Map style" aria-label="Map style">
                    <span class="material-icons" aria-hidden="true">layers</span>
                </button>
                <select class="map-style-select mapPopButton" aria-label="Map style">
                    ${Object.entries(styles).map(([key, style]) =>
                        `<option value="${key}">${style.name}</option>`
                    ).join('')}
                </select>
            `;

            L.DomEvent.disableClickPropagation(div);
            L.DomEvent.disableScrollPropagation(div);

            const button = div.querySelector('.map-style-icon');
            const select = div.querySelector('.map-style-select');

            div.addEventListener('click', (event) => event.stopPropagation());

            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.toggleDetailMapControl(div);
                this.closeDetailMapControl(this.detailMapZoomControl?.container);
                if (div.classList.contains('is-open')) {
                    select.focus();
                    if (typeof select.showPicker === 'function') {
                        select.showPicker();
                    } else {
                        select.click();
                    }
                }
            });

            select.addEventListener('change', (event) => {
                this.setDetailMapStyle(event.target.value);
                this.closeDetailMapControl(div);
            });

            this.detailMapStyleControl = { control, container: div, select, button };
            return div;
        };

        control.addTo(this.detailMap);
        this.ensureDetailMapStylesReady();
    }

    generateDetailMapZoomLevels(currentZoom) {
        const minZoom = 1;
        const maxZoom = 18;
        const levels = [];

        for (let i = minZoom; i <= maxZoom; i++) {
            const isActive = i === currentZoom;
            levels.push(`<div class="zoom-level-item ${isActive ? 'active' : ''}" data-zoom="${i}">Level: ${i}</div>`);
        }

        return levels.join('');
    }

    updateDetailMapZoomDisplay() {
        if (!this.detailMapZoomControl?.container || !this.detailMap) {
            return;
        }

        const currentZoom = this.detailMap.getZoom();
        const button = this.detailMapZoomControl.button;
        const levelsContainer = this.detailMapZoomControl.levelsContainer;

        if (button) {
            button.textContent = `L${currentZoom}`;
            button.setAttribute('title', `Level: ${currentZoom}`);
            button.setAttribute('aria-label', `Level ${currentZoom}`);
        }

        if (levelsContainer) {
            levelsContainer.innerHTML = this.generateDetailMapZoomLevels(currentZoom);
        }
    }

    addDetailMapZoomDisplay() {
        if (!this.detailMap) {
            return;
        }

        const control = L.control({ position: 'bottomleft' });

        control.onAdd = () => {
            const div = L.DomUtil.create('div', 'zoom-display-container detail-map-zoom-display');
            const currentZoom = this.detailMap.getZoom();

            div.innerHTML = `
                <button type="button" class="zoom-display-current mapPopButton" title="Level: ${currentZoom}" aria-label="Level ${currentZoom}">
                    L${currentZoom}
                </button>
                <div class="zoom-display-levels">
                    ${this.generateDetailMapZoomLevels(currentZoom)}
                </div>
            `;

            L.DomEvent.disableClickPropagation(div);
            L.DomEvent.disableScrollPropagation(div);

            const button = div.querySelector('.zoom-display-current');
            const levelsContainer = div.querySelector('.zoom-display-levels');

            div.addEventListener('click', (event) => event.stopPropagation());

            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.toggleDetailMapControl(div);
                this.closeDetailMapControl(this.detailMapStyleControl?.container);
            });

            div.addEventListener('click', (event) => {
                if (!event.target.classList.contains('zoom-level-item')) {
                    return;
                }
                const zoomLevel = parseInt(event.target.dataset.zoom, 10);
                if (!Number.isNaN(zoomLevel)) {
                    this.detailMap.setZoom(zoomLevel);
                }
                this.closeDetailMapControl(div);
            });

            this.detailMapZoomControl = { control, container: div, button, levelsContainer };
            return div;
        };

        control.addTo(this.detailMap);
    }

    applyDetailMapZoomControlIcons() {}

    addDetailMapExpandToggle() {
        if (!this.detailMap) {
            return;
        }

        const control = L.control({ position: 'topright' });
        control.onAdd = () => {
            const div = L.DomUtil.create('div', 'detail-map-expand-toggle');
            div.innerHTML = `
                <div id="detailmapMenuToggleHolder" class="menuIconHolder menuToggleHolderMap"
                     style="position:relative; display:inline-flex; align-items:center; justify-content:center; cursor:pointer;"
                     title="Map menu">
                    <i class="material-icons circle-bg" style="position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);">circle</i>
                    <i id="detailmapMenuToggleIcon" class="material-icons menu-toggle-arrow"
                       style="position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);">arrow_right</i>
                </div>
            `;

            L.DomEvent.disableClickPropagation(div);
            L.DomEvent.disableScrollPropagation(div);

            // Setup click handler for menu toggle
            const holder = div.querySelector('#detailmapMenuToggleHolder');
            holder.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const menu = document.getElementById('detailmapMenu');
                if (menu) {
                    const isVisible = menu.style.display !== 'none';
                    menu.style.display = isVisible ? 'none' : 'block';
                    if (typeof refreshPanelToggleIcon === 'function') {
                        refreshPanelToggleIcon('detailmapMenuToggleHolder', 'detailmap');
                    }
                }
            });

            this.detailMapExpandControl = { control, container: div, holder };
            return div;
        };

        control.addTo(this.detailMap);

        // Add the menu to the body after the control is created
        setTimeout(() => {
            if (typeof buildMenuConfig === 'function' && typeof document !== 'undefined') {
                const menuItems = buildMenuConfig('Map', 'detailmap', '');
                let menuHtml = `<div id="detailmapMenu" class="menuToggleMenu" style="display:none;">`;
                menuItems.forEach(item => {
                    if (item.divider) {
                        menuHtml += '<div class="menuToggleDivider"></div>';
                    } else {
                        const displayStyle = item.display ? `display:${item.display};` : '';
                        const className = item.class ? ` ${item.class}` : '';
                        const dataAction = item.action ? ` data-action="${item.action}"` : '';
                        menuHtml += `<div class="menuToggleItem${className}"${dataAction} style="${displayStyle}">`;
                        if (item.icon) {
                            menuHtml += `<i class="material-icons">${item.icon}</i>`;
                        }
                        menuHtml += item.label;
                        menuHtml += '</div>';
                    }
                });
                menuHtml += '</div>';

                // Remove existing menu if present
                const existingMenu = document.getElementById('detailmapMenu');
                if (existingMenu) {
                    existingMenu.remove();
                }

                // Add menu to the map wrapper container
                const mapWrapper = document.getElementById('detailmapWrapper');
                if (mapWrapper) {
                    mapWrapper.insertAdjacentHTML('beforeend', menuHtml);
                } else {
                    // Fallback to body if wrapper not found
                    document.body.insertAdjacentHTML('beforeend', menuHtml);
                }

                // Setup event listeners using the shared function
                if (typeof setupPanelMenuEvents === 'function') {
                    setupPanelMenuEvents('detailmap', 'Map');
                }
            }
        }, 100);
    }

    isDetailMapInHero() {
        const heroContainer = document.getElementById('detailHero');
        const wrapper = document.getElementById('detailmapWrapper');
        return !!(heroContainer && wrapper && heroContainer.contains(wrapper) && heroContainer.style.display !== 'none');
    }

    setDetailMapExpandedState(isExpanded) {
        return; // Prevent every-other map display.

        // Don't toggle during tour playback
        const hash = this.getCurrentHash();
        if (hash && hash.detailplay === 'true') {
            return;
        }

        this.detailMapExpanded = isExpanded;
        const mapEl = document.getElementById('detailmap');
        if (mapEl) {
            mapEl.classList.toggle('detailmap-expanded', isExpanded);
        }
        const section = document.getElementById('location-section');
        if (section) {
            section.classList.toggle('detailmap-expanded', isExpanded);
        }
    }

    toggleDetailMapHero(button) {
        const wrapper = document.getElementById('detailmapWrapper');
        const placeholder = document.getElementById('detailmapPlaceholder');
        const heroContainer = document.getElementById('detailHero');

        if (!wrapper || !placeholder || !heroContainer) {
            const nextState = !this.detailMapExpanded;
            this.setDetailMapExpandedState(nextState);
            if (button) {
                setFullscreenToggleState(button, nextState);
                button.title = nextState ? 'Collapse map' : 'Expand map';
            }
            if (typeof this.updateDetailMapLayout === 'function') {
                this.updateDetailMapLayout();
            }
            return;
        }

        const isExpanded = heroContainer.contains(wrapper) && heroContainer.style.display !== 'none';

        if (isExpanded) {
            placeholder.style.display = '';
            placeholder.appendChild(wrapper);
            this.setDetailMapExpandedState(false);
            if (heroContainer.children.length === 0) {
                heroContainer.style.display = 'none';
            }
        } else {
            placeholder.style.display = 'none';
            heroContainer.appendChild(wrapper);
            heroContainer.style.display = 'flex';
            this.setDetailMapExpandedState(true);
        }

        if (button) {
            setFullscreenToggleState(button, !isExpanded);
            button.title = !isExpanded ? 'Collapse map' : 'Expand map';
        }

        if (typeof this.updateDetailMapLayout === 'function') {
            this.updateDetailMapLayout();
        }
        if (this.detailMap) {
            requestAnimationFrame(() => {
                this.detailMap.invalidateSize();
            });
        }
    }

    initializeDetailMapControls() {
        if (!this.detailMap || this.detailMapControlsInitialized) {
            return;
        }

        this.addDetailMapStyleSelector();
        this.addDetailMapZoomDisplay();
        this.addDetailMapExpandToggle();

        this.detailMap.on('zoomend', () => {
            this.updateDetailMapZoomDisplay();
        });

        if (!this.detailMapControlOutsideHandler) {
            this.detailMapControlOutsideHandler = (event) => {
                if (this.detailMapStyleControl?.container && this.detailMapStyleControl.container.contains(event.target)) {
                    return;
                }
                if (this.detailMapZoomControl?.container && this.detailMapZoomControl.container.contains(event.target)) {
                    return;
                }
                this.closeDetailMapControl(this.detailMapStyleControl?.container);
                this.closeDetailMapControl(this.detailMapZoomControl?.container);
            };
            document.addEventListener('click', this.detailMapControlOutsideHandler);
        }

        this.detailMapControlsInitialized = true;
    }

    teardownDetailMapControls() {
        this.detailMapControlsInitialized = false;
        this.detailMapStyleControl = null;
        this.detailMapZoomControl = null;
        this.detailMapExpandControl = null;

        if (this.detailMapControlOutsideHandler) {
            document.removeEventListener('click', this.detailMapControlOutsideHandler);
            this.detailMapControlOutsideHandler = null;
        }
    }

    updateDetailMap(listing) {
        const mapEl = document.getElementById('detailmap');
        if (!mapEl) {
            return;
        }
        this.setDetailMapExpandedState(this.detailMapExpanded);

        const adjustDetailMapHeight = () => {
            const hasImages = mapEl.dataset.hasImages === 'true';
            const width = mapEl.clientWidth;
            if (!width) {
                return;
            }
            // Square aspect ratio (1:1)
            const baseHeight = width;
            const extra = hasImages ? 100 : 0;
            const baseTotal = Math.round(baseHeight + extra);
            const expandedTotal = Math.round(baseHeight + extra + 120);
            mapEl.dataset.baseHeight = `${baseTotal}`;
            mapEl.dataset.expandedHeight = `${expandedTotal}`;
            let targetHeight = this.detailMapExpanded ? expandedTotal : baseTotal;
            const wrap = mapEl.parentElement;
            if (this.detailMapExpanded && this.isDetailMapInHero()) {
                if (wrap) {
                    wrap.style.maxHeight = 'none';
                    wrap.style.height = '100%';
                }
                mapEl.style.height = '100%';
                return;
            }
            if (wrap) {
                // Remove inline height constraints to let CSS aspect-ratio work
                wrap.style.maxHeight = '';
                wrap.style.height = '';
            }
            // Remove inline height to let CSS aspect-ratio work
            mapEl.style.height = '';
        };

        this.updateDetailMapLayout = () => {
            adjustDetailMapHeight();
            if (this.detailMap) {
                this.detailMap.invalidateSize();
            }
        };

        const coords = this.getListingCoordinates(listing);
        if (!coords) {
            if (window.leafletMap && typeof window.leafletMap.setDetailMarker === 'function') {
                window.leafletMap.setDetailMarker(null);
            }
            if (this.detailMap) {
                this.detailMap.remove();
                this.detailMap = null;
                this.detailMapMarker = null;
                this.teardownDetailMapControls();
            }
            mapEl.innerHTML = '<div class="detail-map-empty">No coordinates available.</div>';
            return;
        }

        const detailIconSize = 24;
        const listingIndex = Array.isArray(this.filteredListings)
            ? this.filteredListings.indexOf(listing)
            : -1;
        const listingHashId = listingIndex >= 0
            ? this.getListingHashId(listing, listingIndex)
            : this.getListingIdValue(listing);
        const detailMarkerIcon = L.divIcon({
            className: 'custom-marker detail-marker',
            html: `<div class="marker-pin" style="width:${detailIconSize}px;height:${detailIconSize}px;"><div class="marker-dot"></div></div>`,
            iconSize: [detailIconSize, detailIconSize],
            iconAnchor: [detailIconSize / 2, detailIconSize],
            popupAnchor: [0, -detailIconSize]
        });

        if (!this.detailMap) {
            mapEl.innerHTML = '';
            this.detailMap = L.map('detailmap', {
                zoomControl: true,
                attributionControl: false,
                dragging: true,
                scrollWheelZoom: false
            });
            this.initializeDetailMapControls();
            if (this.detailMapExpandControl?.button) {
                setFullscreenToggleState(this.detailMapExpandControl.button, !!this.detailMapExpanded);
            }
        }

        // Determine detail map zoom level
        let detailZoom = 12; // Default zoom level

        // Check if we're coming from list view (no prior detail)
        const hadPriorDetail = window.priorHash && (window.priorHash.id || window.priorHash.detail);

        if (!hadPriorDetail && window.leafletMap && window.leafletMap.map) {
            const widgetZoom = window.leafletMap.map.getZoom();
            // If widget map is zoomed out (level 1 or 2), zoom detail map to level 3
            if (widgetZoom === 1 || widgetZoom === 2) {
                detailZoom = 3;
            }
        }

        this.detailMap.setView([coords.lat, coords.lng], detailZoom);
        adjustDetailMapHeight();
        if (!this.detailMapRecenteringRequested) {
            this.detailMapRecenteringRequested = true;
            const recenter = () => {
                requestAnimationFrame(() => {
                    adjustDetailMapHeight();
                    this.detailMap.invalidateSize();
                    this.detailMap.setView([coords.lat, coords.lng], detailZoom, { animate: false });
                });
            };
            if (this.detailMapTileLayer?.once) {
                this.detailMapTileLayer.once('load', recenter);
            } else {
                this.detailMap.whenReady(recenter);
            }
        }

        if (this.detailMapMarker) {
            this.detailMapMarker.setLatLng([coords.lat, coords.lng]);
            this.detailMapMarker.setIcon(detailMarkerIcon);
        } else {
            this.detailMapMarker = L.marker([coords.lat, coords.lng], {
                icon: detailMarkerIcon
            }).addTo(this.detailMap);
        }
        const detailPopupContent = this.buildDetailMapPopupContent(listing);
        if (detailPopupContent) {
            this.detailMapMarker.bindPopup(detailPopupContent, {
                autoPan: true,
                closeButton: true,
                className: 'detailmap-popup-wrapper'
            });
        }

        if (typeof waitForElm === 'function') {
            waitForElm('#widgetmap').then(() => {
                setTimeout(() => {
                    if (window.leafletMap && typeof window.leafletMap.setDetailMarker === 'function') {
                        window.leafletMap.setDetailMarker(coords, listing, this.config, listingHashId);
                    }
                }, 1000);
            });
        } else if (window.leafletMap && typeof window.leafletMap.setDetailMarker === 'function') {
            window.leafletMap.setDetailMarker(coords, listing, this.config, listingHashId);
        }

        requestAnimationFrame(() => {
            if (this.detailMap) {
                this.updateDetailMapLayout();
            }
        });
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
        const listsJson = (Cookies.get('modelsite')?.indexOf("geo") >= 0 || location.host.indexOf("geo") >= 0 || location.host.indexOf("locations.pages.dev") >= 0) ? '/display/data/show.json' : 'trade.json';
        const configPath = this.resolveConfigUrl(listsJson);
        details += `• Config file: <code>${configPath}</code><br>`;
        
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

            // Add geo merge info if available and not all records have coordinates
            if (this.geoMergeInfo && this.geoMergeInfo.totalWithCoords !== this.geoMergeInfo.totalRecords) {
                result += ` (${this.geoMergeInfo.totalWithCoords} with coordinates)`;
            }

            return result;
        } else {
            // When no filtering, show just the total
            let result = `${this.listings.length}${shortTitle}`;

            // Add geo merge info if available and not all records have coordinates
            if (this.geoMergeInfo && this.geoMergeInfo.totalWithCoords !== this.geoMergeInfo.totalRecords) {
                result += ` (${this.geoMergeInfo.totalWithCoords} with coordinates)`;
            }

            return result;
        }
    }

    isLocalhost() {
        const hostname = window.location.hostname;
        return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    }

    getViewSourceUrl() {
        if (!this.config) {
            return '';
        }
        const onlineMode = (typeof Cookies !== 'undefined' && Cookies.get) ? Cookies.get('onlinemode') : null;
        if (onlineMode === 'false' && this.config.dataset_offline) {
            return this.resolveDatasetUrl(this.config.dataset_offline);
        }
        const apiUrl = this.config.dataset_via_api || this.config.dataset_api_slow;
        if (apiUrl) {
            return this.resolveConfigUrl(apiUrl);
        }
        if (this.config.dataset) {
            return this.resolveDatasetUrl(this.config.dataset);
        }
        return '';
    }

    renderViewSourceLink() {
        if (!this.isLocalhost()) {
            return '';
        }
        const url = this.getViewSourceUrl();
        if (!url) {
            return '';
        }
        return `<a class="view-source-link" href="${url}" target="_blank" rel="noopener">View Source</a>`;
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

    updateExpandListButtonText() {
        const expandBtn = document.querySelector('.expand-list-btn');
        if (!expandBtn) {
            return;
        }

        const widgetDetails = document.getElementById('widgetDetails');
        const heroContainer = document.getElementById('widgetHero');

        if (!widgetDetails || !heroContainer) {
            return;
        }

        const isExpanded = heroContainer.contains(widgetDetails) && heroContainer.style.display !== 'none';
        expandBtn.textContent = isExpanded ? 'Collapse List' : 'Expand List';

        // Also update listings container max-height
        const listingsContainer = document.querySelector('.listings-scroll-container');
        if (listingsContainer) {
            if (isExpanded) {
                listingsContainer.style.maxHeight = 'none';
            } else {
                listingsContainer.style.maxHeight = '';
            }
        }
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
                const viewSourceLink = this.renderViewSourceLink();
                detailsBottom.innerHTML = `
                    <div class="search-results-row" style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
                        <button class="expand-list-btn">Expand List</button>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div class="search-results">
                                ${this.renderSearchResults()}
                            </div>
                            ${viewSourceLink ? `<div class="search-results-source">– ${viewSourceLink}</div>` : ''}
                        </div>
                    </div>
                    <div class="pagination-container" style="${this.filteredListings.length <= 500 ? 'display: none;' : ''}">
                        ${this.renderPagination()}
                    </div>
                `;
            }

            // Update summarize button visibility based on current dataset
            this.updateSummarizeButtonVisibility();

            // Update expand list button text based on current state
            this.updateExpandListButtonText();

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
        // Allow full render when recovering from error, even if dataset is changing
        const forceFullRender = this.recoveringFromError;
        if (forceFullRender) {
            this.recoveringFromError = false; // Reset flag
        }
        if (!(this.isFilteringInProgress || this.isDatasetChanging) || forceFullRender) {
            //alert("render() overwrites map")
            const listwidget = document.getElementById('listwidget');
            if (listwidget) listwidget.style.display = 'block';
            
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
        
            const mapGallerySection = this.renderMapGallerySection();
            const viewSourceLink = this.renderViewSourceLink();
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
            if (this.detailMap) {
                this.detailMap.remove();
                this.detailMap = null;
                this.detailMapMarker = null;
                this.teardownDetailMapControls();
            }
            listwidget.innerHTML = `
                ${mapGallerySection}
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
                                    <div id="widgetDetailsMenuControl" class="search-fields-control" style="min-width: auto; width: 48px;">
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

                        <!-- Popups Container -->
                        <div id="widgetDetailsPopups" style="position: relative;"></div>

                        <!-- Listings Grid -->
                        <!-- Above-the-fold key/value pairs come from getRecognizedFields + config.featuredColumns. -->
                        <div class="listings-scroll-container">
                            <div class="listings-grid basePanelPadding" style="padding-top:0px">
                                ${this.renderListings()}
                            </div>
                        </div>

                        ${this.renderNoResults()}
                        ${this.renderEmptyState()}
                        
                        <!-- Widget Details Bottom Container -->
                        <div id="widgetDetailsBottom">
                            <div class="search-results-row" style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
                                <button class="expand-list-btn">Expand List</button>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <div class="search-results">
                                        ${this.renderSearchResults()}
                                    </div>
                                    ${viewSourceLink ? `<div class="search-results-source">– ${viewSourceLink}</div>` : ''}
                                </div>
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
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }


        // ALLOWED MAP POINTS TO CHANGE WITH DAT

        // Removed duplicate call - applyHashDetailSelection handles this
        // this.updateMapGallerySection(this.getSelectedListing());

        this.applyHashDetailSelection();
        this.applyHashViewSelection();

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
                    goHash({'show':e.target.value});
                });
            }
            
            // Skip map initialization during filtering to prevent map recreation
            if (!this.isFilteringInProgress) {
                this.initializeMap('FROM_RENDER conditionalMapInit');
            } else {
                debugAlert("🚫 SKIPPING initializeMap during filtering to preserve map");
            }
            this.setupPrintDownloadIcons();
            this.setupPanelMenuToggles();
        //}, 0);

    }

    setupPanelMenuToggles() {
        // Wait for DOM to be ready
        setTimeout(() => {
            // Get datasource path for List Insights link
            const datasourcePath = this.config?.dataset || '';

            // Setup panel menu for widgetDetails (List type)
            const detailsPanel = document.getElementById('widgetDetails');
            // Check if menu toggle holder already exists to prevent duplicates
            const existingDetailsToggle = document.getElementById('widgetDetailsMenuToggleHolder');
            if (detailsPanel && typeof addPanelMenu === 'function' && !existingDetailsToggle) {
                const detailsMenu = addPanelMenu({
                    panelType: 'List',
                    targetPanelId: 'widgetDetails',
                    containerSelector: '#widgetDetailsMenuControl',
                    datasourcePath: datasourcePath,
                    inline: true,
                    menuPopupHolder: '#widgetDetailsPopups'
                });
                detailsMenu.render();
            }

            // Setup panel menu for widgetmapWrapper (Map type)
            const mapWrapper = document.getElementById('widgetmapWrapper');
            // Check if menu toggle holder already exists to prevent duplicates
            const existingMapToggle = document.getElementById('widgetmapWrapperMenuToggleHolder');
            if (mapWrapper && typeof addPanelMenu === 'function' && !existingMapToggle) {
                const mapMenu = addPanelMenu({
                    panelType: 'Map',
                    targetPanelId: 'widgetmapWrapper',
                    containerSelector: '#widgetmapWrapper'
                });
                mapMenu.render();
            }

            // Setup panel menu for pageGallery (Content type)
            const galleryPanel = document.getElementById('pageGallery');
            // Check if menu toggle holder already exists to prevent duplicates
            const existingGalleryToggle = document.getElementById('pageGalleryMenuToggleHolder');
            if (galleryPanel && typeof addPanelMenu === 'function' && !existingGalleryToggle) {
                const galleryMenu = addPanelMenu({
                    panelType: 'Content',
                    targetPanelId: 'pageGallery',
                    containerSelector: '#pageGallery'
                });
                galleryMenu.render();
            }

            // Setup panel menu for location-section (View type)
            const locationSection = document.getElementById('location-section');
            // Check if menu toggle holder already exists to prevent duplicates
            const existingLocationToggle = document.getElementById('location-sectionMenuToggleHolder');
            if (locationSection && typeof addPanelMenu === 'function' && !existingLocationToggle) {
                const viewMenu = addPanelMenu({
                    panelType: 'View',
                    targetPanelId: 'location-section',
                    containerSelector: '#locationSectionMenuControl',
                    datasourcePath: datasourcePath
                });
                viewMenu.render();

                // Check if tour is playing (detailplay in hash)
                const hash = this.getCurrentHash();
                if (hash && hash.detailplay === 'true') {
                    // Restart the tour with isReload=true
                    // Increased delay to ensure menu is fully rendered
                    if (typeof startTour === 'function') {
                        setTimeout(() => {
                            startTour('location-section', true);
                        }, 800);
                    }
                }

                // Setup browser back button handler to pause tour
                window.addEventListener('popstate', () => {
                    const currentHash = this.getCurrentHash();
                    // If we have a detail view and detailplay is true, remove it to pause
                    if (currentHash && currentHash.detailplay === 'true' && (currentHash.id || currentHash.detail)) {
                        if (typeof goHash === 'function') {
                            goHash({ detailplay: '' });
                        }
                    }
                });
            }
        }, 100);
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

                    // Prepare map options with center and zoom from configuration if available
                    const mapOptions = {
                        height: '500px',
                        width: '100%'
                    };

                    // Add latitude, longitude, and zoom from show.json config if they exist
                    if (this.config?.latitude) {
                        mapOptions.defaultLat = parseFloat(this.config.latitude);
                    }
                    if (this.config?.longitude) {
                        mapOptions.defaultLng = parseFloat(this.config.longitude);
                    }
                    if (this.config?.zoom) {
                        mapOptions.defaultZoom = parseInt(this.config.zoom);
                    }

                    window.leafletMap = new LeafletMapManager('widgetmap', mapOptions);
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

                        // Async: After widget map loads, sync detail map zoom if needed
                        setTimeout(() => {
                            this.syncDetailMapZoomFromWidget();
                        }, 50);
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

        console.log("Add #show=" + showKey);
        goHash({'show':showKey}); // Trigger hash event so other components can respond

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

        let currentList = hash.map || hash.show || window.param.map;
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
    
    getDisplayData(listing, options = {}) {
        const { includeAddress = true } = options;
        if (!this.config || !this.config.featuredColumns) {
            // Fallback to old behavior
            const recognized = this.getRecognizedFields(listing);
            const contactAddress = this.getContactAddress(listing) || recognized.address;
            const addressLine = includeAddress && contactAddress ? this.formatFieldValue(contactAddress) : null;
            const cityStateZipLine = includeAddress ? this.formatCityStateZip(recognized) : null;
            const lines = [];
            if (addressLine) lines.push(addressLine);
            if (cityStateZipLine) lines.push(cityStateZipLine);
            if (recognized.population) lines.push(`Population: ${this.formatFieldValue(recognized.population, 'population')}`);
            if (recognized.county) lines.push(`${recognized.county} County`);
            return {
                primary: recognized.name,
                secondary: lines[0] || null,
                tertiary: lines[1] || null,
                quaternary: lines[2] || null,
                quinary: lines[3] || null
            };
        }
        
        const featuredColumns = this.config.featuredColumns;
        const data = {};
        const recognized = this.getRecognizedFields(listing);
        const recognizedKeySet = this.getRecognizedKeySet();
        
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
            const normalizedColumn = column.toLowerCase();
            if (recognizedKeySet.has(normalizedColumn)) {
                return;
            }
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

        if (includeAddress) {
            const contactAddress = this.getContactAddress(listing) || recognized.address;
            const addressLine = contactAddress ? this.formatFieldValue(contactAddress) : null;
            const cityStateZipLine = this.formatCityStateZip(recognized);
            const hasAddress = addressLine ? featuredFields.some((field) => field.includes(addressLine) || field.toLowerCase().includes('address')) : false;
            const hasCityStateZip = cityStateZipLine ? featuredFields.some((field) => field.includes(cityStateZipLine)) : false;
            if (addressLine && !hasAddress) {
                featuredFields.unshift(addressLine);
            }
            if (cityStateZipLine && !hasCityStateZip) {
                const insertIndex = addressLine && !hasAddress ? 1 : 0;
                featuredFields.splice(insertIndex, 0, cityStateZipLine);
            }
        }
        
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
                    setFullscreenToggleState(button, false);

                    // Refresh panel menu toggle icon
                    if (typeof refreshPanelToggleIcon === 'function') {
                        refreshPanelToggleIcon(contentDiv.id + 'MenuToggleHolder', contentDiv.id);
                    }

                    // Update expand list button if it was the list that was collapsed
                    if (contentDiv.id === 'widgetDetails') {
                        setTimeout(() => this.updateExpandListButtonText(), 10);
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
            setFullscreenToggleState(button, true);

            // Refresh panel menu toggle icon
            if (typeof refreshPanelToggleIcon === 'function') {
                refreshPanelToggleIcon(contentDiv.id + 'MenuToggleHolder', contentDiv.id);
            }

            // Update expand list button if it was the list that was expanded
            if (contentDiv.id === 'widgetDetails') {
                setTimeout(() => this.updateExpandListButtonText(), 10);
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
    // Only initialize if the listwidget element exists
    const localwidgetElement = document.getElementById('listwidget');
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
                    setFullscreenToggleState(button, false);
                    
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
            setFullscreenToggleState(button, true);
            
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
