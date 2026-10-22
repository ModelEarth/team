// Print/Download Widget Functions
class PrintDownloadWidget {
    static createPrintDownloadIcons() {
        // Add CSS for print/download functionality
        if (!document.getElementById('print-download-styles')) {
            const styles = `
                <style id="print-download-styles">
                .print-download-container {
                    position: relative;
                    display: inline-block;
                    vertical-align: middle;
                    margin: 0 5px;
                }
                
                /* a: selectors keep link icons grey instead of the site's blue link color */
                .print-download-icon, a.print-download-icon:link, a.print-download-icon:visited {
                    display: inline-block;
                    vertical-align: middle;
                    width: 32px;
                    height: 32px;
                    padding: 6px;
                    background: #f5f5f5;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    cursor: pointer;
                    transition: background-color 0.3s;
                    color: #999;
                }
                
                .print-download-icon svg {
                    width: 18px;
                    height: 18px;
                }

                .print-download-icon .material-icons {
                    font-size: 18px;
                    line-height: 1;
                    user-select: none;
                }

                .print-download-icon:hover, a.print-download-icon:hover {
                    background: #e5e5e5;
                    color: #666;
                }

                .dark .print-download-icon, .dark a.print-download-icon:link, .dark a.print-download-icon:visited {
                    background: #3a3a3a;
                    border-color: #555;
                    color: #888;
                }

                .dark .print-download-icon:hover, .dark a.print-download-icon:hover {
                    background: #4a4a4a;
                    color: #aaa;
                }
                
                .print-download-popup {
                    position: absolute;
                    top: 40px;
                    right: 0;
                    background: white;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                    z-index: 2000;
                    min-width: 180px;
                    display: none;
                }
                
                .popup-header {
                    padding: 12px;
                    border-bottom: 1px solid #eee;
                    font-weight: bold;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .popup-close {
                    cursor: pointer;
                    font-size: 24px;
                    color: #999;
                    font-weight: 300;
                    line-height: 1;
                    transform: translateY(-3px);
                }
                
                .popup-close:hover {
                    color: #333;
                }
                
                .popup-item {
                    padding: 8px 16px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    color: #333;
                    text-decoration: none;
                }
                
                .popup-item:hover {
                    background: #f5f5f5;
                    color: #333;
                    text-decoration: none;
                }
                
                .popup-item svg {
                    margin-right: 8px;
                    width: 16px;
                    height: 16px;
                }
                
                .dark .print-download-popup {
                    background: #2a2a2a;
                    border-color: #555;
                    color: #e0e0e0;
                }
                
                .dark .popup-header {
                    border-bottom-color: #444;
                    color: #e0e0e0;
                }
                
                .dark .popup-close {
                    color: #aaa;
                }
                
                .dark .popup-close:hover {
                    color: #e0e0e0;
                }
                
                .dark .popup-item {
                    color: #d0d0d0;
                }
                
                .dark .popup-item:hover {
                    background: #3a3a3a;
                    color: #e0e0e0;
                }
                
                @media print {
                    .print-download-container {
                        display: none !important;
                    }
                }
                </style>
            `;
            document.head.insertAdjacentHTML('beforeend', styles);
        }
    }
    
    static createLinkIcon(containerId, options = {}) {
        this.createPrintDownloadIcons();

        // "View Film" opens the page outside the iframe, so it shows only when this page is in an iframe
        let inIframe = false;
        try {
            inIframe = window.self !== window.top;
        } catch (error) {
            inIframe = true; // a cross-origin parent blocks the check, which means we're framed
        }

        const linkIcon = `
            <div class="print-download-container" id="viewOutsideIFrame"${inIframe ? '' : ' style="display:none"'}>
                <a class="print-download-icon" href="/explore/film/iframe-content.html" target="_blank" rel="noopener" title="View Film">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                    </svg>
                </a>
            </div>
        `;

        return linkIcon;
    }

    static createDarkModeToggle(containerId) {
        this.createPrintDownloadIcons();

        const darkModeToggle = `
            <div class="print-download-container">
                <div id="dark-mode-toggle-${containerId}" class="print-download-icon darkModeToggle" role="button" title="Toggle dark mode" aria-pressed="false">
                    <i class="material-icons">light_mode</i>
                </div>
            </div>
        `;

        return darkModeToggle;
    }

    // Clicks and sitelook changes are handled by darkModeToggle in localsite/js/localsite.js,
    // the process shared with #goatIcons, /cv and localsite/css/themes.
    static setupDarkModeToggle(containerId) {
        const toggle = document.getElementById(`dark-mode-toggle-${containerId}`);
        if (!toggle || toggle.dataset.bound === 'true') return;
        toggle.dataset.bound = 'true';

        if (typeof updateDarkModeToggles === 'function') updateDarkModeToggles();

        const syncDataTheme = () => {
            document.documentElement.dataset.theme = document.body.classList.contains('dark') ? 'dark' : 'light';
        };
        syncDataTheme();
        new MutationObserver(syncDataTheme).observe(document.body, { attributeFilter: ['class'] });
    }

    static createPrintIcon(containerId, options = {}) {
        this.createPrintDownloadIcons();
        
        const printIcon = `
            <div class="print-download-container">
                <div class="print-download-icon" title="Print Options">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="6,9 6,2 18,2 18,9"></polyline>
                        <path d="M6,18 L4,18 C2.9,18 2,17.1 2,16 L2,11 C2,9.9 2.9,9 4,9 L20,9 C21.1,9 22,9.9 22,11 L22,16 C22,17.1 21.1,18 20,18 L18,18"></path>
                        <polyline points="6,14 18,14 18,22 6,22 6,14"></polyline>
                    </svg>
                </div>
                <div class="print-download-popup" id="print-popup-${containerId}">
                    <div class="popup-header">
                        Print
                        <span class="popup-close">&times;</span>
                    </div>
                    <div class="popup-content">
                        ${options.showMap ? '<div class="popup-item" data-print-type="map"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14,2 14,8 20,8"></polyline></svg>Print Map</div>' : ''}
                        <div class="popup-item" data-print-type="list">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                                <polyline points="14,2 14,8 20,8"></polyline>
                            </svg>
                            Print List
                        </div>
                        <div class="popup-item" data-print-type="content">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 1 2 2h12a2 2 0 0 1 2-2V7.5L14.5 2z"></path>
                                <polyline points="14,2 14,8 20,8"></polyline>
                            </svg>
                            Print Content
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        return printIcon;
    }
    
    static createDownloadIcon(containerId, data = [], options = {}) {
        this.createPrintDownloadIcons();
        
        const downloadIcon = `
            <div class="print-download-container">
                <div class="print-download-icon" title="Download Options">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7,10 12,15 17,10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                </div>
                <div class="print-download-popup" id="download-popup-${containerId}">
                    <div class="popup-header">
                        Download
                        <span class="popup-close">&times;</span>
                    </div>
                    <div class="popup-content">
                        <div class="popup-item" data-download-type="csv">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                                <polyline points="14,2 14,8 20,8"></polyline>
                            </svg>
                            CSV File
                        </div>
                        <div class="popup-item" data-download-type="json">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                                <polyline points="14,2 14,8 20,8"></polyline>
                            </svg>
                            JSON File
                        </div>
                        <div class="popup-item" data-download-type="excel">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                                <polyline points="14,2 14,8 20,8"></polyline>
                            </svg>
                            Excel File
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        return downloadIcon;
    }
    
    static setupPrintDownloadHandlers(containerId, data = [], options = {}) {
        // Remove any existing handlers for this container
        if (this.clickHandlers && this.clickHandlers[containerId]) {
            document.removeEventListener('click', this.clickHandlers[containerId]);
        }
        
        if (!this.clickHandlers) {
            this.clickHandlers = {};
        }
        
        // Create new click handler for this container
        this.clickHandlers[containerId] = (e) => {
            // Handle print icon click
            if (e.target.closest('.print-download-icon') && e.target.closest('.print-download-container').querySelector(`#print-popup-${containerId}`)) {
                e.stopPropagation();
                const popup = document.getElementById(`print-popup-${containerId}`);
                const downloadPopup = document.getElementById(`download-popup-${containerId}`);
                
                // Hide download popup if open
                if (downloadPopup) downloadPopup.style.display = 'none';
                
                // Toggle print popup
                popup.style.display = popup.style.display === 'block' ? 'none' : 'block';
            }
            
            // Handle download icon click
            if (e.target.closest('.print-download-icon') && e.target.closest('.print-download-container').querySelector(`#download-popup-${containerId}`)) {
                e.stopPropagation();
                const popup = document.getElementById(`download-popup-${containerId}`);
                const printPopup = document.getElementById(`print-popup-${containerId}`);
                
                // Hide print popup if open
                if (printPopup) printPopup.style.display = 'none';
                
                // Toggle download popup
                popup.style.display = popup.style.display === 'block' ? 'none' : 'block';
            }
            
            // Handle print options
            if (e.target.closest(`#print-popup-${containerId} .popup-item`)) {
                const printType = e.target.closest('.popup-item').getAttribute('data-print-type');
                PrintDownloadWidget.handlePrint(printType, options);
                document.getElementById(`print-popup-${containerId}`).style.display = 'none';
            }
            
            // Handle download options
            if (e.target.closest(`#download-popup-${containerId} .popup-item`)) {
                const downloadType = e.target.closest('.popup-item').getAttribute('data-download-type');
                PrintDownloadWidget.handleDownload(downloadType, data, options);
                document.getElementById(`download-popup-${containerId}`).style.display = 'none';
            }
            
            // Handle popup close buttons
            if (e.target.classList.contains('popup-close')) {
                e.target.closest('.print-download-popup').style.display = 'none';
            }
            
            // Close popups when clicking outside
            if (!e.target.closest('.print-download-container')) {
                const printPopup = document.getElementById(`print-popup-${containerId}`);
                const downloadPopup = document.getElementById(`download-popup-${containerId}`);
                if (printPopup) printPopup.style.display = 'none';
                if (downloadPopup) downloadPopup.style.display = 'none';
            }
        };
        
        document.addEventListener('click', this.clickHandlers[containerId]);
        this.applyPrintMode(options);
    }
    
    // CSS rules for a print layout (map, list or content), without an @media wrapper,
    // so handlePrint can apply them to printing and printmode can apply them on screen.
    static getPrintRules(printType, options = {}) {
        // Marker colors (.marker-pin, .marker-dot, .marker-dot-tiny in leaflet.js) are plain
        // background colors, which browsers strip by default when printing unless told to
        // keep them exactly - without this the map pins print as an empty white teardrop.
        const preserveMarkerColorsCSS = `
            #widgetmapWrapper, #widgetmapWrapper * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                color-adjust: exact !important;
            }
        `;
        // Page headers that every print layout leaves out: localsite's site header and
        // the engine page's title, menus and icons
        const hideHeaderCSS = `
            #main-header, #aeHeader { display: none !important; }
        `;
        // Map controls: Leaflet's zoom/layer controls and the panel menu button (the div holding #widgetmapWrapperMenuControl)
        const hideMapControlsCSS = `
            .leaflet-control-container, #widgetmapWrapper > div:has(> #widgetmapWrapperMenuControl),
            #widgetmapWrapperMenu { display: none !important; }
        `;

        // The List layout: only the listings (plus the engine page's Locations heading) show
        const listCSS = `
            ${hideHeaderCSS}
            body * { visibility: hidden; }
            .listings-grid, .listings-grid *, .tabulator, .tabulator * { visibility: visible; }
            /* The engine page's Locations heading (place icon + #locationsTitle) */
            #locationsPanel > h3, #locationsPanel > h3 * { visibility: visible; }
            /* Every container around the list (html down to .listings-scroll-container) grows to fit it.
               A fixed height or a clipping overflow on any of them crops the list to its visible part,
               since a scrolling or clipped box doesn't continue onto the next printed page. */
            :has(.listings-grid), .listings-scroll-container {
                overflow: visible !important;
                height: auto !important;
                max-height: none !important;
            }
            .search-container, .widgetHeader, nav, .print-download-container { display: none !important; }
            /* The engine page's Projects panel would otherwise leave a blank area too */
            #projectsPanel { display: none !important; }
            /* Engine page: the panels below Locations and the "About Our Engine" line
               would otherwise print as blank space */
            #locationsPanel ~ *, .ae-container:has(#locationsPanel) ~ * { display: none !important; }
            #widgetDetailsParent { flex: 1 1 100% !important; width: 100% !important; }
            #alphabetRail { display: none !important; }
            .listings-margin-left { margin-left: 0 !important; }
            .listing-card {
                border: none !important;
                border-radius: 0 !important;
                box-shadow: none !important;
                padding: 8px 4px !important;
                break-inside: avoid;
            }
            /* Two columns with tighter line spacing */
            .listings-grid {
                grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
                column-gap: 24px !important;
                row-gap: 0 !important;
            }
            .listing-content { gap: 0 !important; }
            .listing-content, .listing-content * { line-height: 1.25 !important; }
            .listing-secondary, .listing-tertiary { margin-top: 0 !important; }
            .address-section { gap: 0 !important; }
            /* Card buttons (Details, More, Nearby, Airports, image count) don't work on paper */
            .listing-card .details-more-actions { display: none !important; }
        `;
        // The map's column: .right-column on most pages, .ae-right (holding #mapCatch) on the engine page.
        // visibility:hidden alone keeps its layout box, leaving a large blank area next to the list.
        const hideMapColumnCSS = `
            .right-column, .ae-container:has(#locationsPanel) .ae-right { display: none !important; }
        `;
        // Moves the map column above the list, showing only the map in it
        const mapAboveListCSS = `
            ${preserveMarkerColorsCSS}
            ${hideMapControlsCSS}
            #widgetmapWrapper, #widgetmapWrapper * { visibility: visible; }
            #widgetGalleryParent { display: none !important; }
            #widgetContent { flex-direction: column !important; }
            .right-column {
                order: -1;
                flex: none !important;
                width: 100% !important;
                height: auto !important;
                max-height: none !important;
                position: static !important;
            }
            .ae-container:has(#locationsPanel) { display: flex !important; flex-direction: column !important; flex-wrap: nowrap !important; }
            .ae-container:has(#locationsPanel) > .ae-left,
            .ae-container:has(#locationsPanel) > .ae-right { flex: none !important; width: 100% !important; }
            .ae-container:has(#locationsPanel) > .ae-right { order: -1; }
            .ae-right > :not(#mapCatch) { display: none !important; }
            #pageMap { height: 420px !important; break-inside: avoid; }
        `;

        switch (printType) {
            case 'map':
                if (options.showMap) {
                    return `
                        /* No @page size: setting an orientation hides Chrome's Layout option, so the user picks
                           portrait or landscape. The map fills the page width and centers vertically in either. */
                        @page { margin: 0.3in; }
                        ${preserveMarkerColorsCSS}
                        ${hideMapControlsCSS}
                        /* moveMapToPrintHolder() puts the map in #printMapHolder directly under <body>,
                           so everything else can be removed, leaving one page */
                        body > *:not(#printMapHolder) { display: none !important; }
                        /* In print, html's 100% height is the page area, so body can center the map vertically on the page.
                           1px short of the page, since content exactly as tall as the page can spill a blank second page. */
                        html, body { margin: 0 !important; padding: 0 !important; min-height: 0 !important; }
                        html { height: 100% !important; }
                        body {
                            height: calc(100% - 1px) !important;
                            display: flex !important;
                            flex-direction: column !important;
                            justify-content: center !important;
                        }
                        #printMapHolder {
                            position: static !important;
                            flex: none !important;
                            width: 100% !important;
                            height: ${this.MAP_PRINT_SIZE.height} !important;
                        }
                        #printMapHolder #widgetmapWrapper { border-radius: 0 !important; }
                        /* Leaflet fades tiles in, so tiles loaded just before printing can print see-through white */
                        #widgetmapWrapper .leaflet-tile { opacity: 1 !important; transition: none !important; }
                    `;
                }
                return '';
            case 'list':
                return listCSS + hideMapColumnCSS;
            case 'content':
                // Print Map and Print List together: the map above the list
                return listCSS + (options.showMap ? mapAboveListCSS : hideMapColumnCSS);
        }
        return '';
    }

    // Print Map's area on a landscape page inside 0.3in margins: Letter is 10.4in x 7.9in, A4 is 11.09in x 7.67in.
    // The height fits both. The map is this size on screen before printing so Leaflet loads its tiles.
    static MAP_PRINT_SIZE = { width: '10.4in', height: '7.6in' };

    // Moves the widget map into #printMapHolder, directly under <body>, at its print size.
    // Under <body>, none of the map's usual containers can limit its size. Full Screen moves the map the same way.
    static moveMapToPrintHolder() {
        const wrapper = document.getElementById('widgetmapWrapper');
        if (!wrapper) return false;
        if (this.mapPrintHome) return true;

        this.mapPrintHome = { parent: wrapper.parentNode, next: wrapper.nextSibling, style: wrapper.style.cssText };
        const holder = document.createElement('div');
        holder.id = 'printMapHolder';
        Object.assign(holder.style, {
            position: 'fixed', left: '0', top: '0', zIndex: '100000',
            width: this.MAP_PRINT_SIZE.width, height: this.MAP_PRINT_SIZE.height
        });
        document.body.appendChild(holder);
        holder.appendChild(wrapper);
        Object.assign(wrapper.style, { width: '100%', height: '100%' });

        const map = window.leafletMap && window.leafletMap.map;
        if (map) map.invalidateSize();
        return true;
    }

    // Puts the widget map back where moveMapToPrintHolder() found it
    static returnMapFromPrintHolder() {
        const home = this.mapPrintHome;
        if (!home) return;
        this.mapPrintHome = null;
        const wrapper = document.getElementById('widgetmapWrapper');
        if (wrapper) {
            home.parent.insertBefore(wrapper, home.next && home.next.parentNode === home.parent ? home.next : null);
            wrapper.style.cssText = home.style;
        }
        const holder = document.getElementById('printMapHolder');
        if (holder) holder.remove();
        const map = window.leafletMap && window.leafletMap.map;
        if (map) map.invalidateSize();
    }

    // Moves the map to its print size, then waits for the tiles of the larger area (at most 3 seconds).
    // Returns a function that puts the map back.
    static async prepareMapForPrint() {
        const keepInHolder = this.getPrintMode() === 'map'; // printmode=map already shows the map this way
        if (!this.moveMapToPrintHolder()) return () => {};

        const map = window.leafletMap && window.leafletMap.map;
        if (map) {
            await new Promise(resolve => requestAnimationFrame(resolve));
            const loading = [];
            map.eachLayer(layer => {
                if (layer instanceof L.TileLayer && layer.isLoading()) {
                    loading.push(new Promise(resolve => layer.once('load', resolve)));
                }
            });
            await Promise.race([Promise.all(loading), new Promise(resolve => setTimeout(resolve, 3000))]);
        }

        return keepInHolder ? () => {} : () => this.returnMapFromPrintHolder();
    }

    static async handlePrint(printType, options = {}) {
        // Hide print/download controls during printing
        // Remember each control's inline display, so hidden ones (like #viewOutsideIFrame outside an iframe) stay hidden after
        const printControls = Array.from(document.querySelectorAll('.print-download-container'));
        const priorDisplays = printControls.map(control => control.style.display);
        printControls.forEach(control => control.style.display = 'none');
        
        // Apply print-specific styles
        const printStyles = document.createElement('style');
        printStyles.setAttribute('media', 'print');
        const printRules = this.getPrintRules(printType, options);
        if (printRules) {
            printStyles.textContent = `@media print { ${printRules} }`;
        }
        
        document.head.appendChild(printStyles);
        
        // The printed map is larger than on screen, so load its tiles first
        const restoreMap = printType === 'map' && options.showMap
            ? await this.prepareMapForPrint()
            : () => {};

        // Trigger print
        setTimeout(() => {
            window.print();
            restoreMap();
            
            // Restore controls after printing
            setTimeout(() => {
                if (document.head.contains(printStyles)) {
                    document.head.removeChild(printStyles);
                }
                printControls.forEach((control, i) => control.style.display = priorDisplays[i]);
            }, 1000);
        }, 100);
    }
    
    // #printmode=1 (or ?printmode=1) shows the print layout on screen for inspecting it.
    // 1 uses the List layout. map, list or content picks a layout.
    static getPrintMode() {
        const hash = typeof getHash === 'function' ? getHash() : {};
        const value = hash.printmode || new URLSearchParams(window.location.search).get('printmode');
        if (!value || value === '0' || value === 'false') return '';
        return ['map', 'list', 'content'].includes(value) ? value : 'list';
    }

    static applyPrintMode(options = this.printModeOptions || {}) {
        this.printModeOptions = options;
        const printType = this.getPrintMode();
        let printModeStyles = document.getElementById('printmode-styles');
        if (printType === 'map' && options.showMap) {
            this.moveMapToPrintHolder();
        } else {
            this.returnMapFromPrintHolder();
        }
        if (!printType) {
            if (printModeStyles) printModeStyles.remove();
            document.body.classList.remove('printmode');
            return;
        }
        if (!printModeStyles) {
            printModeStyles = document.createElement('style');
            printModeStyles.id = 'printmode-styles';
            document.head.appendChild(printModeStyles);
        }
        // The print controls are hidden when printing, so hide them here too
        printModeStyles.textContent = `
            .print-download-container { display: none !important; }
            ${this.getPrintRules(printType, options)}
        `;
        document.body.classList.add('printmode');

        if (!this.printModeListening) {
            this.printModeListening = true;
            document.addEventListener('hashChangeEvent', () => this.applyPrintMode());
        }
    }

    static handleDownload(downloadType, data, options = {}) {
        if (!data || data.length === 0) {
            alert('No data available for download');
            return;
        }
        
        let content = '';
        let filename = '';
        let mimeType = '';
        
        switch (downloadType) {
            case 'csv':
                content = this.convertToCSV(data);
                filename = `${options.filename || 'data'}.csv`;
                mimeType = 'text/csv';
                break;
            case 'json':
                content = JSON.stringify(data, null, 2);
                filename = `${options.filename || 'data'}.json`;
                mimeType = 'application/json';
                break;
            case 'excel':
                // For Excel, we'll generate CSV and let user open in Excel
                content = this.convertToCSV(data);
                filename = `${options.filename || 'data'}.csv`;
                mimeType = 'text/csv';
                break;
        }
        
        this.downloadFile(content, filename, mimeType);
    }
    
    static convertToCSV(data) {
        if (!data || data.length === 0) return '';
        
        const headers = Object.keys(data[0]);
        const csvHeaders = headers.join(',');
        
        const csvRows = data.map(row => {
            return headers.map(header => {
                let value = row[header] || '';
                // Handle values containing commas, quotes, or newlines
                if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                    value = '"' + value.replace(/"/g, '""') + '"';
                }
                return value;
            }).join(',');
        });
        
        return [csvHeaders, ...csvRows].join('\n');
    }
    
    static downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up
        setTimeout(() => URL.revokeObjectURL(url), 100);
    }
    
    // Convenience function to add both print and download icons to a container
    static addPrintDownloadIcons(containerId, targetSelector, data = [], options = {}) {
        const target = document.querySelector(targetSelector);
        if (!target) {
            console.warn(`Target element not found: ${targetSelector}`);
            return;
        }
        
        // Check if icons already exist for this container
        const existingPrintPopup = document.getElementById(`print-popup-${containerId}`);
        const existingDownloadPopup = document.getElementById(`download-popup-${containerId}`);
        
        if (existingPrintPopup || existingDownloadPopup) {
            // Icons already exist, just update the data for download handlers
            this.updateHandlerData(containerId, data, options);
            return;
        }
        
        const linkIcon = this.createLinkIcon(containerId, options);
        const printIcon = this.createPrintIcon(containerId, options);
        const downloadIcon = this.createDownloadIcon(containerId, data, options);
        const darkModeToggle = this.createDarkModeToggle(containerId);

        target.insertAdjacentHTML('beforeend', linkIcon + printIcon + downloadIcon + darkModeToggle);
        this.setupPrintDownloadHandlers(containerId, data, options);
        this.setupDarkModeToggle(containerId);
    }
    
    // Update data for existing handlers without recreating icons
    static updateHandlerData(containerId, data = [], options = {}) {
        if (this.clickHandlers && this.clickHandlers[containerId]) {
            // Remove old handler
            document.removeEventListener('click', this.clickHandlers[containerId]);
            // Set up new handler with updated data
            this.setupPrintDownloadHandlers(containerId, data, options);
        }
    }
}

// Make it globally available
window.PrintDownloadWidget = PrintDownloadWidget;