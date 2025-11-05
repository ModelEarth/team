// Leaflet Map Integration for Team Projects
// Displays listings data on an interactive map with customizable popups

// Debug function that only shows messages on localhost with model.georgia
function debugAlert(message) {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isTestSite = Cookies.get('modelsite') === 'model.georgia';
    
    if (isLocalhost && isTestSite) {
        // Create or find debug div
        let debugDiv = document.getElementById('debug-messages');
        if (!debugDiv) {
            debugDiv = document.createElement('div');
            debugDiv.id = 'debug-messages';
            debugDiv.style.cssText = 'position: fixed; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.8); color: white; padding: 10px; font-family: monospace; font-size: 12px; max-height: 200px; overflow-y: scroll; z-index: 10000;';
            document.body.appendChild(debugDiv);
            
            // Add control buttons if function is available
            if (typeof addControlButtons === 'function') {
                addControlButtons('debug-messages');
            }
        }
        
        // Add timestamp and message
        const timestamp = new Date().toLocaleTimeString();
        const messageElement = document.createElement('div');
        messageElement.textContent = `${timestamp}: ${message}`;
        debugDiv.appendChild(messageElement);
        
        // Keep only last 20 messages
        while (debugDiv.children.length > 20) {
            debugDiv.removeChild(debugDiv.firstChild);
        }
        
        // Auto-scroll to bottom
        debugDiv.scrollTop = debugDiv.scrollHeight;
    }
}

class LeafletMapManager {
    constructor(containerId = 'map', options = {}) {
        // Debug: track when map is being created/recreated
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const isTestSite = typeof Cookies !== 'undefined' && Cookies.get('modelsite') === 'model.georgia';
        
        if (isLocalhost && isTestSite) {
            const stack = new Error().stack.split('\n').slice(2, 4).map(line => line.trim().replace(/.*\//, '')).join(' -> ');
            debugAlert('MAP CONSTRUCTOR CALLED - LeafletMapManager created/recreated - ' + stack);
        }
        
        this.containerId = containerId;
        this.map = null;
        this.markers = [];
        this.currentMapStyle = 'monochrome';
        this.currentOverlay = null;
        this.isFullscreen = false;
        this.originalStyles = null;
        this.initialZoom = null;
        this.useLargerSizes = false;
        this.hasEverLoadedMarkers = false;
        this.popupOptions = {
            maxWidth: 300,
            className: 'custom-popup',
            closeButton: true,
            autoPan: true,
            autoPanPadding: [20, 48]  // More comfortable space above popup [horizontal, vertical] - added 18px
        };
        
        // Default options
        this.options = {
            height: '500px',
            width: '100%',
            defaultLat: 33.7490,  // Atlanta, GA
            defaultLng: -84.3880,
            defaultZoom: 9,
            ...options
        };
        
        // Map style configurations
        this.mapStyles = {
            monochrome: {
                name: 'Monochrome',
                url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                attribution: '© OpenStreetMap contributors',
                filter: 'grayscale(1) contrast(1.3) brightness(0.9)'
            },
            coral: {
                name: 'Coral Reef',
                url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
                attribution: '© OpenStreetMap contributors, © CARTO',
                filter: 'hue-rotate(330deg) saturate(1.4) contrast(1.1) brightness(1.1)'
            },
            light: {
                name: 'Light Mode',
                url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
                attribution: '© OpenStreetMap contributors, © CARTO'
            },
            dark: {
                name: 'Dark Mode',
                url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
                attribution: '© OpenStreetMap contributors, © CARTO'
            },
            darkmatter: {
                name: 'Dark Matter',
                url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
                attribution: '© OpenStreetMap contributors, © CARTO'
            },
            openstreetmap: {
                name: 'OpenStreetMap',
                url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                attribution: '© OpenStreetMap contributors'
            },
            satellite: {
                name: 'Satellite',
                url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                attribution: '© Esri, Maxar, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community',
                overlayUrl: 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png',
                overlayAttribution: '© OpenStreetMap contributors, © CARTO'
            },
            terrain: {
                name: 'Terrain',
                url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
                attribution: '© OpenTopoMap contributors'
            },
            voyager: {
                name: 'Voyager',
                url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
                attribution: '© OpenStreetMap contributors, © CARTO'
            },
            positron: {
                name: 'Positron',
                url: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
                attribution: '© OpenStreetMap contributors, © CARTO'
            },
            vintage: {
                name: 'Vintage',
                url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                attribution: '© OpenStreetMap contributors',
                filter: 'sepia(0.8) contrast(1.2) brightness(0.9) hue-rotate(15deg)'
            },
            sunset: {
                name: 'Sunset',
                url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                attribution: '© OpenStreetMap contributors',
                filter: 'sepia(0.5) saturate(1.8) hue-rotate(15deg) brightness(0.9) contrast(1.1)'
            },
            forest: {
                name: 'Forest',
                url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
                attribution: '© OpenTopoMap contributors',
                filter: 'hue-rotate(80deg) saturate(1.5) contrast(1.1) brightness(0.9)'
            },
            infrared: {
                name: 'Infrared',
                url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                attribution: '© Esri, Maxar, GeoEye, Earthstar Geographics',
                filter: 'hue-rotate(180deg) saturate(2.5) contrast(1.4)',
                overlayUrl: 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png',
                overlayAttribution: '© OpenStreetMap contributors, © CARTO'
            },
            emerald: {
                name: 'Emerald City',
                url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
                attribution: '© OpenStreetMap contributors, © CARTO',
                filter: 'hue-rotate(120deg) saturate(1.8) contrast(1.2) brightness(0.9)'
            },
            sepia: {
                name: 'Old Map',
                url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                attribution: '© OpenStreetMap contributors',
                filter: 'sepia(1) saturate(0.8) contrast(1.2) brightness(0.8)'
            },
            desert: {
                name: 'Desert',
                url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
                attribution: '© OpenTopoMap contributors',
                filter: 'hue-rotate(25deg) saturate(1.2) contrast(1.1) brightness(1.1)'
            },
            autumn: {
                name: 'Autumn Leaves',
                url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
                attribution: '© OpenTopoMap contributors',
                filter: 'hue-rotate(15deg) saturate(1.6) contrast(1.1) brightness(1.0) sepia(0.3)'
            },
            thermal: {
                name: 'Thermal Vision',
                url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                attribution: '© Esri, Maxar, GeoEye, Earthstar Geographics',
                filter: 'hue-rotate(60deg) saturate(3) contrast(1.8) brightness(1.2)',
                overlayUrl: 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png',
                overlayAttribution: '© OpenStreetMap contributors, © CARTO'
            },
            sage: {
                name: 'Sage',
                url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
                attribution: '© OpenTopoMap contributors',
                filter: 'hue-rotate(90deg) saturate(0.7) contrast(1.0) brightness(0.95)'
            },
            bronze: {
                name: 'Bronze Age',
                url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                attribution: '© OpenStreetMap contributors',
                filter: 'sepia(0.4) hue-rotate(35deg) saturate(1.1) contrast(1.1) brightness(0.9)'
            }
        };
        
        this.init();
    }
    
    init() {
        this.createMapContainer();
        this.initializeMap();
        this.addMapStyleSelector();
        this.addCustomCSS();
    }
    
    createMapContainer() {
        const container = document.getElementById(this.containerId);
        if (!container) {
            console.error(`Map container '${this.containerId}' not found`);
            return;
        }
        
        // Set container styles
        container.style.width = this.options.width;
        container.style.height = this.options.height;
        container.style.position = 'relative';
        container.style.borderRadius = '8px';
        container.style.overflow = 'hidden';
        container.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
        
        // Add Leaflet CSS if not already present
        if (!document.querySelector('link[href*="leaflet.css"]')) {
            const leafletCSS = document.createElement('link');
            leafletCSS.rel = 'stylesheet';
            leafletCSS.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            leafletCSS.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
            leafletCSS.crossOrigin = '';
            document.head.appendChild(leafletCSS);
        }
        
        // Add Leaflet JS if not already present
        if (!window.L) {
            const leafletJS = document.createElement('script');
            leafletJS.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            leafletJS.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
            leafletJS.crossOrigin = '';
            leafletJS.onload = () => this.initializeMap();
            document.head.appendChild(leafletJS);
            return;
        }
    }
    
    initializeMap() {
        if (!window.L) {
            setTimeout(() => this.initializeMap(), 100);
            return;
        }
        
        // Initialize map with scroll zoom disabled initially
        this.map = L.map(this.containerId, {
            scrollWheelZoom: false
        }).setView(
            [this.options.defaultLat, this.options.defaultLng], 
            this.options.defaultZoom
        );
        
        // Add click event to toggle scroll zoom
        this.map.on('click', () => {
            if (this.map.scrollWheelZoom.enabled()) {
                this.map.scrollWheelZoom.disable();
                this.showScrollZoomNotification(false);
            } else {
                this.map.scrollWheelZoom.enable();
                this.showScrollZoomNotification(true);
            }
        });
        
        // Load cached background style
        const cachedStyle = this.loadCachedMapStyle();
        if (cachedStyle && this.mapStyles[cachedStyle]) {
            this.currentMapStyle = cachedStyle;
        }
        
        // Add initial tile layer
        this.setMapStyle(this.currentMapStyle);
        
        // Add zoom event listener for dynamic icon sizing and user zoom tracking
        this.map.on('zoomend', () => {
            // Debug: track zoom changes
            const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            const isTestSite = typeof Cookies !== 'undefined' && Cookies.get('modelsite') === 'model.georgia';
            
            if (isLocalhost && isTestSite) {
                const stack = new Error().stack.split('\n').slice(2, 4).map(line => line.trim().replace(/.*\//, '')).join(' -> ');
                debugAlert('ZOOM CHANGED to ' + this.map.getZoom() + ' - triggered by: ' + stack);
            }
            
            // Track user-initiated zoom changes (not programmatic ones)
            const currentZoom = this.map.getZoom();
            const baselineZoom = window.mapBaselineZoom || 7;
            
            // Check if this is a user-initiated zoom (not from our setZoom calls)
            if (window.mapHasEverLoaded && !this.programmaticZoomInProgress) {
                if (currentZoom > baselineZoom) {
                    // User zoomed in closer than baseline - store it
                    window.mapUserZoom = currentZoom;
                    debugAlert('USER ZOOM DETECTED: Stored user zoom level ' + currentZoom + ' (baseline: ' + baselineZoom + ')');
                } else if (currentZoom === baselineZoom) {
                    // User zoomed out to baseline - clear user zoom
                    window.mapUserZoom = null;
                    debugAlert('USER ZOOM RESET: Cleared user zoom, back to baseline ' + baselineZoom);
                }
            }
            
            this.updateMarkerSizes();
            this.updateZoomDisplay();
        });
        
        // Add zoom display
        this.addZoomDisplay();
        
        // Add fullscreen toggle - DISABLED: using widget wrapper button instead
        // this.addFullscreenToggle();
    }
    
    addMapStyleSelector() {
        // Create style selector control
        const styleControl = L.control({ position: 'bottomleft' });
        
        styleControl.onAdd = (map) => {
            const div = L.DomUtil.create('div', 'map-style-selector');
            div.innerHTML = `
                <select class="map-style-select mapPopButton">
                    ${Object.entries(this.mapStyles).map(([key, style]) => 
                        `<option value="${key}" ${key === this.currentMapStyle ? 'selected' : ''}>${style.name}</option>`
                    ).join('')}
                </select>
            `;
            
            // Prevent map interaction when clicking selector
            L.DomEvent.disableClickPropagation(div);
            L.DomEvent.disableScrollPropagation(div);
            
            // Handle style changes
            const select = div.querySelector('.map-style-select');
            select.addEventListener('change', (e) => {
                this.setMapStyle(e.target.value);
                this.saveCachedMapStyle(e.target.value);
            });
            
            return div;
        };
        
        styleControl.addTo(this.map);
    }
    
    setMapStyle(styleKey) {
        if (!this.mapStyles[styleKey]) return;
        
        const style = this.mapStyles[styleKey];
        this.currentMapStyle = styleKey;
        
        // Remove existing tile layers
        this.map.eachLayer((layer) => {
            if (layer instanceof L.TileLayer) {
                this.map.removeLayer(layer);
            }
        });
        
        // Add base tile layer
        const tileLayer = L.tileLayer(style.url, {
            attribution: style.attribution,
            maxZoom: 18
        }).addTo(this.map);
        
        // Add overlay layer if specified (for labels on satellite imagery)
        // Only show labels at zoom level 8 and above
        if (style.overlayUrl) {
            const overlayLayer = L.tileLayer(style.overlayUrl, {
                attribution: style.overlayAttribution || '',
                maxZoom: 18,
                minZoom: 8  // Only show labels at zoom 8+
            }).addTo(this.map);
            
            // Store reference to overlay for dynamic visibility
            this.currentOverlay = overlayLayer;
        } else {
            this.currentOverlay = null;
        }
        
        // Apply CSS filter if specified
        if (style.filter) {
            const mapContainer = document.getElementById(this.containerId);
            if (mapContainer) {
                // Remove any existing filter
                const existingTiles = mapContainer.querySelectorAll('.leaflet-tile-pane');
                existingTiles.forEach(pane => {
                    pane.style.filter = '';
                });
                
                // Apply new filter after a short delay to ensure tiles are loaded
                setTimeout(() => {
                    const tilePane = mapContainer.querySelector('.leaflet-tile-pane');
                    if (tilePane) {
                        tilePane.style.filter = style.filter;
                    }
                }, 100);
            }
        } else {
            // Remove any existing filter
            const mapContainer = document.getElementById(this.containerId);
            if (mapContainer) {
                const tilePane = mapContainer.querySelector('.leaflet-tile-pane');
                if (tilePane) {
                    tilePane.style.filter = '';
                }
            }
        }
    }
    
    addMarkersFromData(data, config = {}) {
        // Clear existing markers (but be more careful during filtering)
        debugAlert('🔄 CLEAR: About to clear ' + this.markers.length + ' existing markers');
        this.clearMarkers();
        
        if (!Array.isArray(data) || data.length === 0) {
            console.warn('No data provided for map markers');
            return;
        }
        
        const validMarkers = [];
        
        debugAlert('🔍 PROCESSING ' + data.length + ' data items for markers');
        data.forEach((item, index) => {
            const coords = this.extractCoordinates(item);
            if (index < 3) { // Debug first 3 items
                debugAlert('🔍 Item ' + index + ' coords: lat=' + coords.lat + ' lng=' + coords.lng + ' sample fields: ' + Object.keys(item).slice(0, 5).join(', '));
            }
            if (coords.lat && coords.lng) {
                const marker = this.createMarker(coords.lat, coords.lng, item, config);
                if (marker) {
                    validMarkers.push({ marker, coords });
                }
            }
        });
        
        debugAlert('✅ VALID MARKERS: ' + validMarkers.length + ' out of ' + data.length + ' items');
        
        // Handle case where no valid coordinates found
        if (validMarkers.length === 0) {
            console.warn('⚠️ NO VALID COORDINATES: No map points can be displayed. Data needs latitude/longitude fields.');
            // Show message in map container if no coordinates
            const mapContainer = document.getElementById(this.containerId);
            if (mapContainer) {
                const messageDiv = document.createElement('div');
                messageDiv.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(255,255,255,0.9); padding: 20px; border-radius: 5px; text-align: center; z-index: 1000;';
                messageDiv.innerHTML = `
                    <h3>No Map Points Available</h3>
                    <p>This dataset doesn't contain latitude/longitude coordinates.</p>
                    <p>Available fields: ${data.length > 0 ? Object.keys(data[0]).join(', ') : 'none'}</p>
                `;
                mapContainer.appendChild(messageDiv);
            }
            return;
        }
        
        // IMPLEMENT PROPER ZOOM LOGIC
        if (validMarkers.length > 0) {
            const group = new L.featureGroup(validMarkers.map(m => m.marker));
            const newBounds = group.getBounds();
            
            // Use persistent flags that survive map recreation
            if (!window.mapHasEverLoaded) {
                // Very first load - fit bounds to show all points and establish baseline
                debugAlert('INITIAL LOAD: About to fit bounds - current zoom:' + this.map.getZoom());
                this.map.fitBounds(newBounds, { 
                    padding: [10, 10],
                    maxZoom: 15
                });
                window.mapHasEverLoaded = true;
                
                // Store the baseline zoom level after fitBounds completes
                setTimeout(() => {
                    window.mapBaselineZoom = this.map.getZoom();
                    window.mapUserZoom = null; // No user zoom yet
                    debugAlert('INITIAL LOAD: Fitted bounds completed - baseline zoom:' + window.mapBaselineZoom);
                }, 100);
            } else {
                // Subsequent calls - smart zoom behavior
                const currentZoom = this.map.getZoom();
                const baselineZoom = window.mapBaselineZoom || 7; // fallback to 7
                
                // Check if user has manually zoomed closer than baseline
                if (window.mapUserZoom && window.mapUserZoom > baselineZoom) {
                    // User has zoomed in - check if new points are outside current view
                    const currentBounds = this.map.getBounds();
                    if (newBounds.intersects(currentBounds)) {
                        // New points are within current view - maintain user zoom
                        debugAlert('SUBSEQUENT LOAD: Maintained user zoom:' + window.mapUserZoom + ' (baseline:' + baselineZoom + ')');
                        this.programmaticZoomInProgress = true;
                        this.map.setZoom(window.mapUserZoom);
                        setTimeout(() => { this.programmaticZoomInProgress = false; }, 100);
                    } else {
                        // New points outside view - zoom out to baseline to show all
                        debugAlert('SUBSEQUENT LOAD: Zooming out to baseline:' + baselineZoom + ' (was user zoom:' + window.mapUserZoom + ')');
                        this.programmaticZoomInProgress = true;
                        this.map.setZoom(baselineZoom);
                        setTimeout(() => { this.programmaticZoomInProgress = false; }, 100);
                        window.mapUserZoom = null; // Reset user zoom
                    }
                } else {
                    // No user zoom or user zoom is not closer than baseline - maintain baseline
                    debugAlert('SUBSEQUENT LOAD: Maintained baseline zoom:' + baselineZoom + ' (current:' + currentZoom + ')');
                    this.programmaticZoomInProgress = true;
                    this.map.setZoom(baselineZoom);
                    setTimeout(() => { this.programmaticZoomInProgress = false; }, 100);
                }
            }
        }
        
        // Keep only the critical debug message right before tiles disappear
        
        // Always check if larger sizes should be used
        const currentZoom = this.map.getZoom();
        const shouldUseLargerSizes = currentZoom <= 5;
        if (shouldUseLargerSizes) {
            this.useLargerSizes = true;
            console.log(`Zoom ${currentZoom} detected, enabling larger sizes`);
        }
        
        // Apply multiple checks with delays to ensure consistent behavior
        const currentZoomForDebug = this.map.getZoom();
        debugAlert('DEBUG: ensureLargerSizesIfNeeded DISABLED for testing - RIGHT BEFORE TILES DISAPPEAR - zoom:' + currentZoomForDebug);
        // this.ensureLargerSizesIfNeeded(); // DISABLED TO TEST TILE ISSUE
        
        debugAlert('✅ MARKERS ADDED: ' + validMarkers.length + ' markers from ' + data.length + ' items - method completing');
        
        // Force map refresh to prevent tile issues
        setTimeout(() => {
            debugAlert('🔄 POST-MARKER: Forcing map invalidateSize and tile refresh');
            
            // Check map container status
            const container = document.getElementById(this.containerId);
            const mapExists = !!(this.map && this.map._container);
            debugAlert('🔍 MAP STATUS: container exists=' + !!container + ' map._container exists=' + mapExists + ' zoom=' + (this.map ? this.map.getZoom() : 'no map'));
            
            if (this.map && this.map._container) {
                this.map.invalidateSize();
                
                // Force tile layer refresh
                let tileLayerCount = 0;
                this.map.eachLayer((layer) => {
                    if (layer._url) { // This is a tile layer
                        tileLayerCount++;
                        layer.redraw();
                    }
                });
                debugAlert('🔄 REFRESHED: ' + tileLayerCount + ' tile layers refreshed');
                
                // Check if tiles are actually visible
                setTimeout(() => {
                    const tiles = this.map._container.querySelectorAll('.leaflet-tile');
                    const visibleTiles = Array.from(tiles).filter(tile => tile.style.opacity !== '0');
                    debugAlert('🔍 TILES: ' + tiles.length + ' total tiles, ' + visibleTiles.length + ' visible');
                }, 100);
            } else {
                debugAlert('❌ MAP LOST: Map or container missing after marker update!');
            }
        }, 50);
    }
    
    ensureLargerSizesIfNeeded() {
        // Check multiple times with different delays to handle map reinitialization
        const checkTimes = [20]; // [10, 700];
        
        checkTimes.forEach(delay => {
            setTimeout(() => {
                if (!this.map) return; // Map might be destroyed
                
                const currentZoom = this.map.getZoom();
                const shouldUseLargerSizes = currentZoom <= 5;
                
                if (shouldUseLargerSizes && !this.useLargerSizes) {
                    this.useLargerSizes = true;
                    console.log(`[Delay ${delay}ms] Zoom ${currentZoom} detected, enabling larger sizes`);
                    this.updateMarkerSizes();
                } else if (shouldUseLargerSizes && this.useLargerSizes && this.markers.length > 0) {
                    // Force update even if flag is already set (handles reinitialization)
                    console.log(`[Delay ${delay}ms] Forcing marker size update for zoom ${currentZoom}`);
                    this.updateMarkerSizes();
                }
            }, delay);
        });
    }
    
    extractCoordinates(item) {
        // Try various coordinate field names
        const latFields = ['latitude', 'lat', 'Latitude', 'LAT', 'y', 'Y'];
        const lngFields = ['longitude', 'lng', 'lon', 'Longitude', 'LON', 'LONGITUDE', 'x', 'X'];
        
        let lat = null, lng = null;
        
        // Find latitude
        for (const field of latFields) {
            if (item[field] && !isNaN(parseFloat(item[field]))) {
                lat = parseFloat(item[field]);
                break;
            }
        }
        
        // Find longitude
        for (const field of lngFields) {
            if (item[field] && !isNaN(parseFloat(item[field]))) {
                lng = parseFloat(item[field]);
                break;
            }
        }
        
        // Validate coordinates
        if (lat && lng && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
            return { lat, lng };
        }
        
        return { lat: null, lng: null };
    }
    
    createMarker(lat, lng, data, config = {}) {
        try {
            // Create custom icon with zoom-based sizing and shape
            const currentZoom = this.map.getZoom();
            const iconSize = this.getIconSizeForZoom(currentZoom);
            const markerHtml = this.getMarkerHtml(currentZoom, iconSize);
            
            const customIcon = L.divIcon({
                className: 'custom-marker',
                html: markerHtml,
                iconSize: [iconSize, iconSize],
                iconAnchor: this.getIconAnchor(currentZoom, iconSize),
                popupAnchor: this.getPopupAnchor(currentZoom, iconSize)
            });
            
            // Create marker with custom icon
            const marker = L.marker([lat, lng], { icon: customIcon });
            
            // Store original data for updates
            marker._markerData = data;
            marker._markerConfig = config;
            
            // Create popup content
            const popupContent = this.createPopupContent(data, config);
            
            // Bind popup with custom options
            marker.bindPopup(popupContent, this.popupOptions);
            
            // Add to map and store reference
            marker.addTo(this.map);
            this.markers.push(marker);
            
            return marker;
        } catch (error) {
            console.error('Error creating marker:', error);
            return null;
        }
    }
    
    createPopupContent(data, config = {}) {
        let content = '<div class="popup-content">';
        // Use featuredColumns if available in config
        if (config.featuredColumns && Array.isArray(config.featuredColumns)) {
            config.featuredColumns.forEach((column, index) => {
                // Try original case first, then lowercase fallback
                const value = data[column] || data[column.toLowerCase()];
                if (value) {
                    // OPTIMIZATION 3: Format emails lazily when popup opens
                    const formattedValue = this.formatPopupValue(value, column);
                    
                    if (index === 0) {
                        // First column - bold title
                        content += `<div class="popup-title">${formattedValue}</div>`;
                    } else if (index === 1) {
                        // Second column - with appropriate prefix
                        const displayValue = column.toLowerCase().includes('population') ? 
                            `Population: ${this.formatNumber(value)}` : 
                            `${formattedValue}`; // `${this.formatColumnName(column)}: ${formattedValue}`
                        content += `<div class="popup-field"><span class="popup-text">${displayValue}</span></div>`;
                    } else if (index === 2) {
                        // Third column - with appropriate suffix
                        const displayValue = column.toLowerCase().includes('county') ? 
                            `${formattedValue} County` : 
                            `${formattedValue}`; // ``${this.formatColumnName(column)}: ${formattedValue}`;
                        content += `<div class="popup-field"><span class="popup-text">${displayValue}</span></div>`;
                    }
                }
            });
        } else {
            // Fallback to old popup behavior
            const name = this.getFieldValue(data, config.nameColumn || ['name', 'Name', 'organization name', 'city', 'City']);
            const population = this.getFieldValue(data, ['population', 'Population']);
            const county = this.getFieldValue(data, ['county', 'County']);
            
            if (name) {
                content += `<div class="popup-title">${this.formatPopupValue(name)}</div>`;
            }
            
            if (population) {
                content += `<div class="popup-field">
                    <span class="popup-text">Population: ${this.formatNumber(population)}</span>
                </div>`;
            }
            
            if (county) {
                content += `<div class="popup-field">
                    <span class="popup-text">${this.formatPopupValue(county)} County</span>
                </div>`;
            }
        }
        
        content += '</div>';
        return content;
    }
    
    getFieldValue(data, fieldNames) {
        if (typeof fieldNames === 'string') {
            fieldNames = [fieldNames];
        }
        
        for (const fieldName of fieldNames) {
            if (data[fieldName] && String(data[fieldName]).trim()) {
                return String(data[fieldName]).trim();
            }
        }
        return null;
    }
    
    getExtraFields(data, usedColumns = {}) {
        const usedFields = new Set([
            usedColumns.nameColumn,
            usedColumns.titleColumn, 
            usedColumns.addressColumn,
            usedColumns.valueColumn,
            'name', 'Name', 'organization name', 'city', 'City',
            'title', 'Title', 'address', 'Address', 'category', 'Category',
            'description', 'Description', 'details',
            'phone', 'Phone', 'telephone', 'email', 'Email',
            'website', 'Website', 'url', 'URL', 'population', 'Population',
            'latitude', 'lat', 'Latitude', 'LAT', 'y', 'Y',
            'longitude', 'lng', 'lon', 'Longitude', 'LON', 'LONGITUDE', 'x', 'X'
        ]);
        
        return Object.entries(data)
            .filter(([key, value]) => !usedFields.has(key) && value && String(value).trim())
            .slice(0, 5); // Limit to 5 extra fields
    }
    
    formatFieldName(fieldName) {
        return fieldName
            .replace(/[_-]/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
    }
    
    formatPhone(phone) {
        const cleaned = phone.replace(/\D/g, '');
        if (cleaned.length === 10) {
            return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
        }
        return phone;
    }
    
    formatNumber(num) {
        const number = parseInt(num);
        if (!isNaN(number) && number > 1000) {
            return number.toLocaleString();
        }
        return num;
    }
    
    // OPTIMIZATION 3: Lazy email formatting - only processes when popup opens
    formatPopupValue(value, column = '') {
        if (!value) return '';
        
        const strValue = value.toString();
        
        // Check if it's an email and format with mailto link
        if (column.toLowerCase().includes('email') || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(strValue)) {
            return `<a href="mailto:${this.escapeHtml(strValue)}" class="popup-link">${this.escapeHtml(strValue)}</a>`;
        }
        
        // For non-email values, just escape HTML
        return this.escapeHtml(strValue);
    }
    
    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    
    formatColumnName(key) {
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
    
    clearMarkers() {
        this.markers.forEach(marker => {
            this.map.removeLayer(marker);
        });
        this.markers = [];
    }
    
    getIconSizeForZoom(zoom) {
        // Scale icon size based on zoom level
        // Zoom levels typically range from 1-18
        const minSize = 6;   // Smaller minimum icon size at low zoom
        const maxSize = 28;  // Slightly smaller maximum icon size at high zoom
        const minZoom = 1;
        const maxZoom = 18;
        
        // Linear interpolation between min and max sizes
        const ratio = Math.max(0, Math.min(1, (zoom - minZoom) / (maxZoom - minZoom)));
        return Math.round(minSize + (maxSize - minSize) * ratio);
    }
    
    getMarkerHtml(zoom, iconSize) {
        // Use conditional logic based on initial zoom level
        if (this.useLargerSizes) {
            // Apply larger sizes when initial zoom was 5 or less
            if (zoom <= 3) {
                // 50% dots for zoom 1-3 (slightly smaller than level 4)
                const size3 = Math.max(2, Math.round(iconSize * 0.5));
                return `<div class="marker-dot-tiny" style="width: ${size3}px; height: ${size3}px;"></div>`;
            } else if (zoom === 4) {
                // 60% dots for zoom 4 (like the old default level 6)
                const size4 = Math.max(2, Math.round(iconSize * 0.6));
                return `<div class="marker-dot-tiny" style="width: ${size4}px; height: ${size4}px;"></div>`;
            } else if (zoom === 5) {
                // 100% pins for zoom 5 (same as level 7)
                return `<div class="marker-pin" style="width: ${iconSize}px; height: ${iconSize}px;">
                          <div class="marker-dot"></div>
                        </div>`;
            } else if (zoom === 6) {
                // 100% pins for zoom 6 (same as level 7)
                return `<div class="marker-pin" style="width: ${iconSize}px; height: ${iconSize}px;">
                          <div class="marker-dot"></div>
                        </div>`;
            } else if (zoom === 7) {
                // 100% pins for zoom 7
                return `<div class="marker-pin" style="width: ${iconSize}px; height: ${iconSize}px;">
                          <div class="marker-dot"></div>
                        </div>`;
            } else {
                // Regular pin markers for zoom 8+
                return `<div class="marker-pin" style="width: ${iconSize}px; height: ${iconSize}px;">
                          <div class="marker-dot"></div>
                        </div>`;
            }
        } else {
            // Use default/original sizes when initial zoom was greater than 5
            if (zoom <= 3) {
                // Half-size dots for zoom 1-3
                const halfSize = Math.max(1, Math.round(iconSize * 0.2));
                return `<div class="marker-dot-tiny" style="width: ${halfSize}px; height: ${halfSize}px;"></div>`;
            } else if (zoom === 4) {
                // 30% dots for zoom 4
                const size4 = Math.max(1, Math.round(iconSize * 0.3));
                return `<div class="marker-dot-tiny" style="width: ${size4}px; height: ${size4}px;"></div>`;
            } else if (zoom === 5) {
                // 40% dots for zoom 5
                const size5 = Math.max(2, Math.round(iconSize * 0.4));
                return `<div class="marker-dot-tiny" style="width: ${size5}px; height: ${size5}px;"></div>`;
            } else if (zoom === 6) {
                // 60% dots for zoom 6
                const size6 = Math.max(2, Math.round(iconSize * 0.6));
                return `<div class="marker-dot-tiny" style="width: ${size6}px; height: ${size6}px;"></div>`;
            } else if (zoom === 7) {
                // 100% pins for zoom 7
                return `<div class="marker-pin" style="width: ${iconSize}px; height: ${iconSize}px;">
                          <div class="marker-dot"></div>
                        </div>`;
            } else {
                // Regular pin markers for zoom 8+
                return `<div class="marker-pin" style="width: ${iconSize}px; height: ${iconSize}px;">
                          <div class="marker-dot"></div>
                        </div>`;
            }
        }
    }
    
    getIconAnchor(zoom, iconSize) {
        // Use conditional logic based on initial zoom level
        if (this.useLargerSizes) {
            // Apply larger sizes when initial zoom was 5 or less
            if (zoom <= 3) {
                const size3 = Math.max(2, Math.round(iconSize * 0.5));
                return [size3/2, size3/2];  // Center anchor for 50% dots
            } else if (zoom === 4) {
                const size4 = Math.max(2, Math.round(iconSize * 0.6));
                return [size4/2, size4/2];  // Center anchor for 60% dots
            } else if (zoom === 5) {
                return [iconSize/2, iconSize];    // Bottom center for 100% pins
            } else if (zoom === 6) {
                return [iconSize/2, iconSize];    // Bottom center for 100% pins
            } else if (zoom === 7) {
                return [iconSize/2, iconSize];    // Bottom center for 100% pins
            } else {
                return [iconSize/2, iconSize];    // Bottom center for regular pins
            }
        } else {
            // Use default/original anchors when initial zoom was greater than 5
            if (zoom <= 3) {
                const halfSize = Math.max(1, Math.round(iconSize * 0.2));
                return [halfSize/2, halfSize/2];  // Center anchor for half-size dots
            } else if (zoom === 4) {
                const size4 = Math.max(1, Math.round(iconSize * 0.3));
                return [size4/2, size4/2];  // Center anchor for 30% dots
            } else if (zoom === 5) {
                const size5 = Math.max(2, Math.round(iconSize * 0.4));
                return [size5/2, size5/2];  // Center anchor for 40% dots
            } else if (zoom === 6) {
                const size6 = Math.max(2, Math.round(iconSize * 0.6));
                return [size6/2, size6/2];  // Center anchor for 60% dots
            } else if (zoom === 7) {
                return [iconSize/2, iconSize];    // Bottom center for 100% pins
            } else {
                return [iconSize/2, iconSize];    // Bottom center for regular pins
            }
        }
    }
    
    getPopupAnchor(zoom, iconSize) {
        // Use conditional logic based on initial zoom level
        if (this.useLargerSizes) {
            // Apply larger sizes when initial zoom was 5 or less
            if (zoom <= 3) {
                const size3 = Math.max(2, Math.round(iconSize * 0.5));
                return [0, -size3/2];  // Above center for 50% dots
            } else if (zoom === 4) {
                const size4 = Math.max(2, Math.round(iconSize * 0.6));
                return [0, -size4/2];  // Above center for 60% dots
            } else if (zoom === 5) {
                return [0, -iconSize];    // Above 100% pin point
            } else if (zoom === 6) {
                return [0, -iconSize];    // Above 100% pin point
            } else if (zoom === 7) {
                return [0, -iconSize];    // Above 100% pin point
            } else {
                return [0, -iconSize];    // Above regular pin point
            }
        } else {
            // Use default/original popup anchors when initial zoom was greater than 5
            if (zoom <= 3) {
                const halfSize = Math.max(1, Math.round(iconSize * 0.2));
                return [0, -halfSize/2];  // Above center for half-size dots
            } else if (zoom === 4) {
                const size4 = Math.max(1, Math.round(iconSize * 0.3));
                return [0, -size4/2];  // Above center for 30% dots
            } else if (zoom === 5) {
                const size5 = Math.max(2, Math.round(iconSize * 0.4));
                return [0, -size5/2];  // Above center for 40% dots
            } else if (zoom === 6) {
                const size6 = Math.max(2, Math.round(iconSize * 0.6));
                return [0, -size6/2];  // Above center for 60% dots
            } else if (zoom === 7) {
                return [0, -iconSize];    // Above 100% pin point
            } else {
                return [0, -iconSize];    // Above regular pin point
            }
        }
    }
    
    updateMarkerSizes() {
        const currentZoom = this.map.getZoom();
        const newIconSize = this.getIconSizeForZoom(currentZoom);
        
        this.markers.forEach(marker => {
            // Create new icon with updated size and shape
            const markerHtml = this.getMarkerHtml(currentZoom, newIconSize);
            
            const customIcon = L.divIcon({
                className: 'custom-marker',
                html: markerHtml,
                iconSize: [newIconSize, newIconSize],
                iconAnchor: this.getIconAnchor(currentZoom, newIconSize),
                popupAnchor: this.getPopupAnchor(currentZoom, newIconSize)
            });
            
            // Update marker icon
            marker.setIcon(customIcon);
        });
    }
    
    addZoomDisplay() {
        // Create zoom level display control
        const zoomControl = L.control({ position: 'bottomleft' });
        
        zoomControl.onAdd = (map) => {
            const div = L.DomUtil.create('div', 'zoom-display-container');
            
            const currentLevel = this.map.getZoom();
            div.innerHTML = `
                <div class="zoom-display-current mapPopButton">Level: ${currentLevel}</div>
                <div class="zoom-display-levels">
                    ${this.generateZoomLevels(currentLevel)}
                </div>
            `;
            
            // Prevent map interaction when clicking display
            L.DomEvent.disableClickPropagation(div);
            L.DomEvent.disableScrollPropagation(div);
            
            // Add click handlers for zoom levels
            div.addEventListener('click', (e) => {
                if (e.target.classList.contains('zoom-level-item')) {
                    const zoomLevel = parseInt(e.target.dataset.zoom);
                    this.map.setZoom(zoomLevel);
                }
            });
            
            // Add hover handlers to ensure proper positioning
            div.addEventListener('mouseenter', () => {
                const levelsContainer = div.querySelector('.zoom-display-levels');
                if (levelsContainer) {
                    setTimeout(() => {
                        this.positionZoomLevelsOverButton(levelsContainer, this.map.getZoom());
                    }, 10);
                }
            });
            
            // Position the levels container on initial load
            setTimeout(() => {
                const levelsContainer = div.querySelector('.zoom-display-levels');
                if (levelsContainer) {
                    this.positionZoomLevelsOverButton(levelsContainer, currentLevel);
                }
            }, 50);
            
            return div;
        };
        
        zoomControl.addTo(this.map);
        this.zoomControl = zoomControl;
    }
    
    generateZoomLevels(currentZoom) {
        const minZoom = 1;
        const maxZoom = 18;
        let levels = '';
        
        // Show all levels but put current level in the middle when possible
        for (let i = minZoom; i <= maxZoom; i++) {
            const isActive = i === currentZoom;
            levels += `<div class="zoom-level-item ${isActive ? 'active' : ''}" data-zoom="${i}">Level: ${i}</div>`;
        }
        
        return levels;
    }
    
    updateZoomDisplay() {
        const zoomDisplayContainer = document.querySelector('.zoom-display-container');
        if (zoomDisplayContainer) {
            const currentLevel = this.map.getZoom();
            const currentDisplay = zoomDisplayContainer.querySelector('.zoom-display-current');
            const levelsContainer = zoomDisplayContainer.querySelector('.zoom-display-levels');
            
            if (currentDisplay) {
                currentDisplay.innerHTML = `Level: ${currentLevel}`;
            }
            
            if (levelsContainer) {
                // Check if container is being hovered to avoid repositioning during interaction
                const isHovered = zoomDisplayContainer.matches(':hover');
                
                levelsContainer.innerHTML = this.generateZoomLevels(currentLevel);
                
                // Only reposition if not currently being hovered
                if (!isHovered) {
                    setTimeout(() => {
                        this.positionZoomLevelsOverButton(levelsContainer, currentLevel);
                    }, 10);
                }
            }
        }
    }
    
    positionZoomLevelsOverButton(levelsContainer, currentLevel) {
        const activeItem = levelsContainer.querySelector('.zoom-level-item.active');
        if (!activeItem) return;
        
        // Calculate the height of one item
        const itemHeight = activeItem.offsetHeight;
        
        // Set the max-height to show reasonable number of items
        const maxVisibleItems = 7; // Show about 7 items at a time
        const maxHeight = maxVisibleItems * itemHeight;
        levelsContainer.style.maxHeight = `${maxHeight}px`;
        
        // Position popup to overlap button and extend downward past map edge
        // Calculate how many items should appear above the current level in the visible area
        const itemsAboveCurrent = currentLevel - 1;
        const itemsToShowAbove = Math.min(3, itemsAboveCurrent); // Show up to 3 items above
        
        // Position popup so current level overlaps the button
        const overlapOffset = itemsToShowAbove * itemHeight;
        const adjustedOffset = overlapOffset - 60; // Move popup down by 60px
        levelsContainer.style.transform = `translateY(-${adjustedOffset}px)`;
        
        // Set scroll position to show current level with context
        const scrollPosition = Math.max(0, itemsAboveCurrent - itemsToShowAbove);
        levelsContainer.scrollTop = scrollPosition * itemHeight;
    }
    
    addFullscreenToggle() {
        // Create fullscreen toggle control
        const fullscreenControl = L.control({ position: 'topright' });
        
        fullscreenControl.onAdd = (map) => {
            const div = L.DomUtil.create('div', 'fullscreen-toggle-container');
            div.innerHTML = `
                <button class="fullscreen-toggle-btn" title="Toggle Fullscreen">
                    <svg class="fullscreen-icon expand-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                    </svg>
                    <svg class="fullscreen-icon collapse-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: none;">
                        <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
                    </svg>
                </button>
            `;
            
            // Prevent map interaction when clicking toggle
            L.DomEvent.disableClickPropagation(div);
            L.DomEvent.disableScrollPropagation(div);
            
            // Handle fullscreen toggle
            const button = div.querySelector('.fullscreen-toggle-btn');
            const expandIcon = div.querySelector('.expand-icon');
            const collapseIcon = div.querySelector('.collapse-icon');
            
            button.addEventListener('click', () => {
                this.toggleFullscreen();
                
                // Update icon visibility
                if (this.isFullscreen) {
                    expandIcon.style.display = 'none';
                    collapseIcon.style.display = 'block';
                    button.title = 'Exit Fullscreen';
                } else {
                    expandIcon.style.display = 'block';
                    collapseIcon.style.display = 'none';
                    button.title = 'Toggle Fullscreen';
                }
            });
            
            return div;
        };
        
        this.fullscreenControl = fullscreenControl;
        fullscreenControl.addTo(this.map);
    }
    
    toggleFullscreen() {
        // Use the new myHero function from the widget for map expansion
        if (window.listingsApp && window.listingsApp.myHero) {
            // Find the fullscreen button that was clicked
            const fullscreenBtn = document.querySelector('.leaflet-control-container .fullscreen-toggle-btn');
            if (fullscreenBtn) {
                // Create a synthetic event to pass to myHero
                window.event = { target: fullscreenBtn };
                window.listingsApp.myHero();
            }
        } else {
            console.warn('Widget myHero function not available, falling back to original fullscreen');
            // Fallback to original implementation if myHero is not available
            this.originalToggleFullscreen();
        }
        
        // Toggle fullscreen state for icon updates
        this.isFullscreen = !this.isFullscreen;
    }

    // Keep original implementation as fallback
    originalToggleFullscreen() {
        const mapContainer = document.getElementById(this.containerId);
        const pageContent = document.getElementById('pageContent');
        
        if (!this.isFullscreen) {
            // Enter fullscreen within pageContent
            this.isFullscreen = true;
            
            // Store original styles
            this.originalStyles = {
                mapContainer: {
                    position: mapContainer.style.position,
                    top: mapContainer.style.top,
                    left: mapContainer.style.left,
                    width: mapContainer.style.width,
                    height: mapContainer.style.height,
                    zIndex: mapContainer.style.zIndex,
                    marginBottom: mapContainer.style.marginBottom
                }
            };
            
            if (pageContent) {
                // Get pageContent bounds
                const contentRect = pageContent.getBoundingClientRect();
                
                // Apply fullscreen styles within pageContent
                mapContainer.style.position = 'fixed';
                mapContainer.style.top = contentRect.top + 'px';
                mapContainer.style.left = contentRect.left + 'px';
                mapContainer.style.width = contentRect.width + 'px';
                mapContainer.style.height = contentRect.height + 'px';
                mapContainer.style.zIndex = '9999';
                mapContainer.style.marginBottom = '0';
            } else {
                // Fallback to full page if pageContent not found
                mapContainer.style.position = 'fixed';
                mapContainer.style.top = '0';
                mapContainer.style.left = '0';
                mapContainer.style.width = '100vw';
                mapContainer.style.height = '100vh';
                mapContainer.style.zIndex = '9999';
                mapContainer.style.marginBottom = '0';
            }
            
            // Add fullscreen class for additional styling
            mapContainer.classList.add('fullscreen-map');
            
        } else {
            // Exit fullscreen
            this.isFullscreen = false;
            
            // Restore original styles
            if (this.originalStyles) {
                Object.assign(mapContainer.style, this.originalStyles.mapContainer);
            }
            
            // Remove fullscreen class
            mapContainer.classList.remove('fullscreen-map');
        }
        
        // Invalidate map size to ensure proper rendering
        setTimeout(() => {
            this.map.invalidateSize();
        }, 100);
    }
    
    addCustomCSS() {
        if (document.querySelector('#leaflet-custom-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'leaflet-custom-styles';
        style.textContent = `
            /* Bottom Left Controls Layout */
            .leaflet-bottom.leaflet-left {
                display: flex;
                flex-direction: row;
                align-items: flex-end;
                gap: 10px;
            }
            
            /* Shared Button Style */
            .mapPopButton {
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 4px;
                min-height: 26px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 500;
                box-shadow: 0 1px 3px rgba(0,0,0,0.3);
                cursor: pointer;
                transition: all 0.2s ease;
                border: none;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                text-align: center;
                white-space: nowrap;
                margin: 0px !important;
            }
            .leaflet-left .leaflet-control {
                margin-left: 0px;
            }
            .leaflet-bottom {
                padding-left: 8px;
            }
            .mapPopButton:hover {
                background: rgba(0, 0, 0, 0.9);
            }
            
            /* Map Style Selector */
            .map-style-selector {
                background: transparent;
                padding: 0;
                border-radius: 0;
                box-shadow: none;
                margin-bottom: 0;
            }
            
            /* Fullscreen Toggle */
            .fullscreen-toggle-container {
                background: white;
                border-radius: 4px;
                box-shadow: 0 1px 5px rgba(0,0,0,0.2);
            }
            
            .fullscreen-toggle-btn {
                background: white;
                border: none;
                padding: 8px;
                border-radius: 4px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background-color 0.2s ease;
                color: #333;
            }
            
            .fullscreen-toggle-btn:hover {
                background-color: #f5f5f5;
            }
            
            .fullscreen-toggle-btn:active {
                background-color: #e5e5e5;
            }
            
            /* Fullscreen map styling */
            .fullscreen-map {
                border-radius: 0 !important;
            }
            
            /* Zoom Level Display */
            .zoom-display-container {
                position: relative;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            
            .zoom-display-current {
                width: 68px;
            }
            
            .zoom-display-container:hover .zoom-display-current {
                background: rgba(0, 0, 0, 0.9);
            }
            
            .zoom-display-levels {
                position: absolute;
                bottom: 0;
                left: 0;
                width: 68px;
                background: rgba(0, 0, 0, 0.8);
                border-radius: 4px;
                max-height: 200px;
                overflow-y: scroll;
                opacity: 0;
                visibility: hidden;
                transition: opacity 0.2s ease, visibility 0.2s ease;
                box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                /* Hide scrollbar but keep functionality */
                scrollbar-width: none; /* Firefox */
                -ms-overflow-style: none; /* IE/Edge */
            }
            
            .zoom-display-levels::-webkit-scrollbar {
                display: none; /* Chrome/Safari */
            }
            
            .zoom-display-container:hover .zoom-display-levels {
                opacity: 1;
                visibility: visible;
            }
            
            .zoom-level-item {
                color: white;
                padding: 4px 8px;
                font-size: 12px;
                font-weight: 500;
                cursor: pointer;
                transition: background-color 0.15s ease;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                text-align: center;
                white-space: nowrap;
                width: 68px;
                box-sizing: border-box;
            }
            
            .zoom-level-item:last-child {
                border-bottom: none;
            }
            
            .zoom-level-item:hover {
                background: rgba(255, 255, 255, 0.2);
            }
            
            .zoom-level-item.active {
                background: rgba(255, 255, 255, 0.3);
                font-weight: 600;
            }
            
            /* Custom Marker Styles */
            .custom-marker {
                background: none !important;
                border: none !important;
            }
            
            .marker-pin {
                position: relative;
                background: #137AD1;
                border: 1px solid white;
                border-radius: 50% 50% 50% 0;
                transform: rotate(-45deg);
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                transition: all 0.3s ease;
                cursor: pointer;
            }
            
            .marker-pin:hover {
                transform: rotate(-45deg) scale(1.1);
                box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            }
            
            .marker-dot {
                position: absolute;
                top: 50%;
                left: 50%;
                width: 30%;
                height: 30%;
                background: white;
                border-radius: 50%;
                transform: translate(-50%, -50%) rotate(45deg);
            }
            
            
            /* Tiny dot marker for very low zoom levels */
            .marker-dot-tiny {
                background: #137AD1;
                border: none;
                border-radius: 50%;
                box-shadow: 0 1px 2px rgba(0,0,0,0.2);
                transition: all 0.3s ease;
                cursor: pointer;
            }
            
            .marker-dot-tiny:hover {
                transform: scale(1.3);
                box-shadow: 0 1px 4px rgba(0,0,0,0.3);
            }
            
            /* Custom Popup Styles */
            .leaflet-popup-content-wrapper {
                border-radius: 8px !important;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
            }
            
            .leaflet-popup-content {
                margin: 0 !important;
                line-height: 1.4 !important;
            }
            
            .popup-content {
                padding: 12px;
                padding-top: 20px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            
            .popup-title {
                font-size: 16px;
                font-weight: 600;
                color: #1a1a1a;
                margin-bottom: 4px;
            }
            
            .popup-subtitle {
                font-size: 14px;
                font-weight: 500;
                color: #4a4a4a;
                margin-bottom: 8px;
            }
            
            .popup-category {
                display: inline-block;
                padding: 2px 8px;
                font-size: 11px;
                font-weight: 500;
                color: #1d4ed8;
                background: #dbeafe;
                border-radius: 12px;
                margin-bottom: 8px;
            }
            
            .popup-description {
                font-size: 13px;
                color: #666;
                margin-bottom: 8px;
                line-height: 1.3;
            }
            
            .popup-field {
                display: flex;
                align-items: flex-start;
                gap: 6px;
                margin-bottom: 4px;
                font-size: 13px;
            }
            
            .popup-field-small {
                font-size: 12px;
                margin-bottom: 2px;
            }
            
            .popup-icon {
                font-size: 12px;
                width: 16px;
                flex-shrink: 0;
            }
            
            .popup-text {
                color: #4a4a4a;
                word-break: break-word;
            }
            
            .popup-label {
                font-weight: 500;
                color: #666;
                min-width: 60px;
                flex-shrink: 0;
            }
            
            .popup-link {
                color: #007bff;
                text-decoration: none;
                word-break: break-all;
            }
            
            .popup-link:hover {
                text-decoration: underline;
            }
            
            .popup-extra {
                margin-top: 8px;
                padding-top: 8px;
                border-top: 1px solid #e5e5e5;
            }
            
            /* Scroll zoom notification */
            .scroll-zoom-notification {
                position: absolute;
                top: 10px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 8px 16px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 500;
                z-index: 1000;
                animation: fadeInOut 2s ease-in-out;
                pointer-events: none;
            }
            
            @keyframes fadeInOut {
                0% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
                20% { opacity: 1; transform: translateX(-50%) translateY(0); }
                80% { opacity: 1; transform: translateX(-50%) translateY(0); }
                100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
            }
            
            /* Responsive popup */
            @media (max-width: 600px) {
                .leaflet-popup-content-wrapper {
                    max-width: 280px !important;
                }
                
                .popup-content {
                    padding: 10px;
                }
                
                .popup-title {
                    font-size: 15px;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Public methods for integration with listing apps
    updateFromListingsApp(listingsApp) {
        debugAlert('📍 updateFromListingsApp called with: ' + (listingsApp ? listingsApp.filteredListings?.length : 'null') + ' listings');
        if (!listingsApp || !listingsApp.filteredListings) {
            debugAlert('⚠️ Invalid listings app provided');
            return;
        }
        
        debugAlert('📍 About to call addMarkersFromData with ' + listingsApp.filteredListings.length + ' items');
        this.addMarkersFromData(listingsApp.filteredListings, listingsApp.config);
        
        // Ensure larger sizes are applied after listings app update
        setTimeout(() => {
            //this.ensureLargerSizesIfNeeded();
        }, 50);
    }
    
    // Cache management methods
    saveCachedMapStyle(styleKey) {
        try {
            localStorage.setItem('leafletMapStyle', styleKey);
        } catch (error) {
            console.warn('Failed to save map style to cache:', error);
        }
    }
    
    loadCachedMapStyle() {
        try {
            return localStorage.getItem('leafletMapStyle');
        } catch (error) {
            console.warn('Failed to load map style from cache:', error);
            return null;
        }
    }
    
    // Show notification for scroll zoom state
    showScrollZoomNotification(enabled) {
        // Hide scroll zoom notifications on narrow screens
        if (window.innerWidth <= 768) {
            return;
        }
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = 'scroll-zoom-notification';
        notification.textContent = enabled ? 'Scroll zoom enabled' : 'Scroll zoom disabled';
        
        // Add to map container
        const mapContainer = document.getElementById(this.containerId);
        if (mapContainer) {
            mapContainer.appendChild(notification);
            
            // Remove after 2 seconds
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 2000);
        }
    }
    
    destroy() {
        if (this.map) {
            this.map.remove();
            this.map = null;
        }
        this.markers = [];
    }
}

// Auto-initialize map when DOM is ready if map container exists
// Note: This will be controlled by the listings app for better integration
document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for other scripts to load and initialize
    setTimeout(() => {
        const mapContainer = document.getElementById('map');
        if (mapContainer && !window.leafletMap && !window.listingsApp) {
            // Only auto-initialize if there's no listings app to control it
            window.leafletMap = new LeafletMapManager('map');
        }
    }, 100);
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LeafletMapManager;
} else {
    window.LeafletMapManager = LeafletMapManager;
}