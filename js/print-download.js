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
                    margin: 0 5px;
                }
                
                .print-download-icon {
                    display: inline-block;
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
                
                .print-download-icon:hover {
                    background: #e5e5e5;
                    color: #666;
                }
                
                .dark .print-download-icon {
                    background: #3a3a3a;
                    border-color: #555;
                    color: #888;
                }
                
                .dark .print-download-icon:hover {
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
                    z-index: 1000;
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
    }
    
    static handlePrint(printType, options = {}) {
        // Hide print/download controls during printing
        const printControls = document.querySelectorAll('.print-download-container');
        printControls.forEach(control => control.style.display = 'none');
        
        // Apply print-specific styles
        const printStyles = document.createElement('style');
        printStyles.setAttribute('media', 'print');
        
        switch (printType) {
            case 'map':
                if (options.showMap) {
                    printStyles.textContent = `
                        @media print {
                            body * { visibility: hidden; }
                            #widgetmapWrapper, #widgetmapWrapper * { visibility: visible; }
                            #widgetmapWrapper { position: absolute; left: 0; top: 0; width: 100% !important; height: 100% !important; }
                            .leaflet-control-container { display: none !important; }
                        }
                    `;
                }
                break;
            case 'list':
                printStyles.textContent = `
                    @media print {
                        body * { visibility: hidden; }
                        .listings-grid, .listings-grid *, .tabulator, .tabulator * { visibility: visible; }
                        .listings-grid, .tabulator { position: absolute; left: 0; top: 0; width: 100% !important; }
                        .search-container, .widgetHeader, nav, .print-download-container { display: none !important; }
                    }
                `;
                break;
            case 'content':
                printStyles.textContent = `
                    @media print {
                        .search-container, .widgetHeader nav, .print-download-container { display: none !important; }
                        body { font-size: 12pt; line-height: 1.4; }
                    }
                `;
                break;
        }
        
        document.head.appendChild(printStyles);
        
        // Trigger print
        setTimeout(() => {
            window.print();
            
            // Restore controls after printing
            setTimeout(() => {
                if (document.head.contains(printStyles)) {
                    document.head.removeChild(printStyles);
                }
                printControls.forEach(control => control.style.display = 'inline-block');
            }, 1000);
        }, 100);
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
        
        const printIcon = this.createPrintIcon(containerId, options);
        const downloadIcon = this.createDownloadIcon(containerId, data, options);
        
        target.insertAdjacentHTML('beforeend', printIcon + downloadIcon);
        this.setupPrintDownloadHandlers(containerId, data, options);
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