/**
 * Shared utility functions
 * Extracted from admin/import-data.html for reuse across multiple pages
 */

document.addEventListener('hashChangeEvent', function (elem) {
    console.log("list.js detects URL hashChangeEvent");

}, false);

// =============================================================================
// CACHE MANAGEMENT FUNCTIONS
// =============================================================================

function loadCacheFromStorage() {
    try {
        const stored = localStorage.getItem('aiInsightsCache');
        const cache = stored ? JSON.parse(stored) : {};
        console.log('DEBUG: loadCacheFromStorage - loaded keys:', Object.keys(cache));
        
        // Debug: Show cache contents
        Object.keys(cache).forEach(key => {
            console.log(`DEBUG: Gemini cache key "${key}":`, {
                success: cache[key].success,
                analysisLength: cache[key].analysis?.length,
                totalRecords: cache[key].totalRecords,
                timestamp: cache[key].timestamp
            });
        });
        
        return cache;
    } catch (error) {
        console.error('Error loading cache from localStorage:', error);
        return {};
    }
}

function saveCacheToStorage(aiInsightsCache, getCurrentCacheKey) {
    try {
        const cacheKey = getCurrentCacheKey();
        console.log('DEBUG: saveCacheToStorage called for key:', cacheKey);
        console.log('DEBUG: Current aiInsightsCache contents:', Object.keys(aiInsightsCache));
        console.log('DEBUG: Current cache entry:', aiInsightsCache[cacheKey]);
        
        localStorage.setItem('aiInsightsCache', JSON.stringify(aiInsightsCache));
        console.log('Saved cache to localStorage, keys:', Object.keys(aiInsightsCache));
    } catch (error) {
        console.error('Error saving cache to localStorage:', error);
    }
}

function loadClaudeCacheFromStorage() {
    try {
        const stored = localStorage.getItem('claudeInsightsCache');
        const cache = stored ? JSON.parse(stored) : {};
        console.log('DEBUG: loadClaudeCacheFromStorage - loaded keys:', Object.keys(cache));
        
        // Debug: Show cache contents
        Object.keys(cache).forEach(key => {
            console.log(`DEBUG: Claude cache key "${key}":`, {
                success: cache[key].success,
                analysisLength: cache[key].analysis?.length,
                totalRecords: cache[key].totalRecords,
                timestamp: cache[key].timestamp
            });
        });
        
        return cache;
    } catch (error) {
        console.error('Error loading Claude cache from localStorage:', error);
        return {};
    }
}

function saveClaudeCacheToStorage(claudeInsightsCache, getCurrentCacheKey) {
    try {
        const cacheKey = getCurrentCacheKey();
        console.log('DEBUG: saveClaudeCacheToStorage called for key:', cacheKey);
        console.log('DEBUG: Current claudeInsightsCache contents:', Object.keys(claudeInsightsCache));
        console.log('DEBUG: Current cache entry:', claudeInsightsCache[cacheKey]);
        
        localStorage.setItem('claudeInsightsCache', JSON.stringify(claudeInsightsCache));
        console.log('Saved Claude cache to localStorage, keys:', Object.keys(claudeInsightsCache));
    } catch (error) {
        console.error('Error saving Claude cache to localStorage:', error);
    }
}

function getCurrentCacheKey(fileSelect, selectedFile, selectedSheet) {
    // Always use the dropdown value for consistent caching, regardless of selectedFile content
    const selectedOption = fileSelect && fileSelect.options && fileSelect.options.length > 0 
        ? fileSelect.options[fileSelect.selectedIndex] 
        : null;
    let fileKey = selectedOption ? selectedOption.value : (selectedFile || 'unknown');
    
    console.log('DEBUG getCurrentCacheKey - selectedFile:', selectedFile);
    console.log('DEBUG getCurrentCacheKey - selectedOption:', selectedOption);
    console.log('DEBUG getCurrentCacheKey - selectedOption.value:', selectedOption?.value);
    console.log('DEBUG getCurrentCacheKey - data-cors:', selectedOption?.getAttribute('data-cors'));
    console.log('DEBUG: Using dropdown value for cache key:', fileKey);
    
    const sheetKey = selectedSheet || 'default';
    const cacheKey = `${fileKey}__${sheetKey}`;
    console.log('DEBUG: Generated cache key:', cacheKey, 'from file:', fileKey, 'sheet:', sheetKey);
    return cacheKey;
}

// =============================================================================
// FALLBACK CSV STORAGE
// =============================================================================

async function storeFallbackCSV(csvText) {
    // Store CSV data to local fallback file using Rust API endpoint or local storage
    try {
        // Try to use the Rust API endpoint to save the file (if available)
        const saveResponse = await fetch('http://localhost:8081/api/files/csv', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                filename: 'lists.csv',
                content: csvText
            })
        });
        
        if (saveResponse.ok) {
            console.log('Successfully saved CSV to server file system via Rust API');
            return;
        }
        
        console.warn('Rust API save endpoint not available, using localStorage fallback');
    } catch (error) {
        console.warn('Rust API save failed, using localStorage fallback:', error);
    }
    
    // Fallback to localStorage if server save isn't available
    try {
        localStorage.setItem('fallbackCSV', csvText);
        localStorage.setItem('fallbackCSVTimestamp', Date.now().toString());
        console.log('Stored CSV in localStorage as fallback');
    } catch (storageError) {
        console.error('Failed to store CSV in localStorage:', storageError);
        throw storageError;
    }
}

// =============================================================================
// DATA PROCESSING UTILITIES
// =============================================================================

function parseCSV(csvText) {
    // Robust CSV parser that handles quoted fields with newlines, escaped quotes, and proper field separation
    // This prevents line returns within quoted field values from being treated as new rows
    const rows = [];
    let inQuotes = false;
    let currentRow = [];
    let currentField = '';
    
    for (let i = 0; i < csvText.length; i++) {
        const char = csvText[i];
        const nextChar = csvText[i + 1];
        
        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                // Handle escaped quotes ("" inside quoted field)
                currentField += '"';
                i++; // Skip next quote
            } else {
                // Toggle quote state
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            // End of field
            currentRow.push(currentField.trim());
            currentField = '';
        } else if ((char === '\n' || char === '\r\n') && !inQuotes) {
            // End of row (only if not inside quotes)
            currentRow.push(currentField.trim());
            if (currentRow.length > 0 && currentRow.some(field => field !== '')) {
                rows.push(currentRow);
            }
            currentRow = [];
            currentField = '';
            
            // Skip \r if we're at \r\n
            if (char === '\r' && nextChar === '\n') {
                i++;
            }
        } else if (char === '\r' && !inQuotes) {
            // Handle standalone \r as row separator
            currentRow.push(currentField.trim());
            if (currentRow.length > 0 && currentRow.some(field => field !== '')) {
                rows.push(currentRow);
            }
            currentRow = [];
            currentField = '';
        } else {
            // Regular character or newline inside quotes
            currentField += char;
        }
    }
    
    // Handle last field and row
    if (currentField !== '' || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        if (currentRow.length > 0 && currentRow.some(field => field !== '')) {
            rows.push(currentRow);
        }
    }
    
    return rows;
}

function parseCSVToObjects(csvText, allFields = null) {
    const arrays = parseCSV(csvText);
    return convertArraysToObjects(arrays, allFields);
}

function parseRSS(xmlText) {
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        
        // Check for parsing errors
        const parseError = xmlDoc.querySelector("parsererror");
        if (parseError) {
            throw new Error("XML parsing error: " + parseError.textContent);
        }
        
        // Get all item elements (RSS) or entry elements (Atom)
        const items = xmlDoc.querySelectorAll("item, entry");
        
        if (items.length === 0) {
            throw new Error("No RSS items or Atom entries found in XML");
        }
        
        // Define headers based on common RSS/Atom elements
        const headers = ['title', 'link', 'description', 'pubDate', 'guid', 'category', 'author'];
        const result = [headers]; // First row as headers
        
        items.forEach(item => {
            const row = headers.map(header => {
                let element;
                
                // Handle different element names for RSS vs Atom
                switch(header) {
                    case 'title':
                        element = item.querySelector('title');
                        break;
                    case 'link':
                        element = item.querySelector('link');
                        // For Atom feeds, link might be an attribute
                        if (!element || !element.textContent.trim()) {
                            const linkAttr = item.querySelector('link[href]');
                            return linkAttr ? linkAttr.getAttribute('href') : '';
                        }
                        break;
                    case 'description':
                        element = item.querySelector('description, summary, content');
                        break;
                    case 'pubDate':
                        element = item.querySelector('pubDate, published, updated');
                        break;
                    case 'guid':
                        element = item.querySelector('guid, id');
                        break;
                    case 'category':
                        element = item.querySelector('category');
                        break;
                    case 'author':
                        element = item.querySelector('author, creator');
                        break;
                    default:
                        element = item.querySelector(header);
                }
                
                if (element) {
                    // Strip HTML tags from content if present
                    let content = element.textContent || element.innerHTML || '';
                    content = content.replace(/<[^>]*>/g, '').trim();
                    return content;
                }
                
                return '';
            });
            
            result.push(row);
        });
        
        console.log(`Parsed ${items.length} RSS/XML items`);
        return result;
        
    } catch (error) {
        console.error('RSS parsing error:', error);
        throw new Error(`Failed to parse RSS/XML: ${error.message}`);
    }
}

function flattenObject(obj, prefix = '', maxDepth = 3, currentDepth = 0) {
    const flattened = {};
    
    if (currentDepth >= maxDepth || obj === null || obj === undefined) {
        return flattened;
    }
    
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            const value = obj[key];
            const newKey = prefix ? `${prefix}_${key}` : key;
            
            if (value === null || value === undefined) {
                flattened[newKey] = null;
            } else if (Array.isArray(value)) {
                // Handle arrays by extracting useful information
                if (value.length === 0) {
                    flattened[newKey] = null;
                } else if (value.length === 1 && typeof value[0] === 'object') {
                    // If array has one object, flatten that object
                    const subFlattened = flattenObject(value[0], newKey, maxDepth, currentDepth + 1);
                    Object.assign(flattened, subFlattened);
                } else {
                    // For multiple items or primitive arrays, join them
                    flattened[newKey] = value.map(item => 
                        typeof item === 'object' ? extractObjectValues(item, 1) : String(item)
                    ).join(', ');
                }
            } else if (typeof value === 'object') {
                // Recursively flatten nested objects
                const subFlattened = flattenObject(value, newKey, maxDepth, currentDepth + 1);
                Object.assign(flattened, subFlattened);
            } else {
                // Primitive value
                flattened[newKey] = value;
            }
        }
    }
    
    return flattened;
}

function extractObjectValues(obj, maxDepth = 2, currentDepth = 0) {
    if (obj === null || obj === undefined) {
        return '';
    }
    
    if (typeof obj !== 'object') {
        return String(obj);
    }
    
    if (Array.isArray(obj)) {
        if (obj.length === 0) return '[]';
        if (obj.length === 1) return extractObjectValues(obj[0], maxDepth, currentDepth + 1);
        return `[${obj.length} items: ${obj.slice(0, 3).map(item => extractObjectValues(item, maxDepth, currentDepth + 1)).join(', ')}${obj.length > 3 ? '...' : ''}]`;
    }
    
    // Stop recursion if we've gone too deep
    if (currentDepth >= maxDepth) {
        return '{...}';
    }
    
    const keys = Object.keys(obj);
    if (keys.length === 0) return '{}';
    
    // For objects, extract key-value pairs up to a limit
    const pairs = [];
    const maxPairs = 3;
    
    for (let i = 0; i < Math.min(keys.length, maxPairs); i++) {
        const key = keys[i];
        const value = obj[key];
        const extractedValue = extractObjectValues(value, maxDepth, currentDepth + 1);
        
        // Format the key-value pair
        if (extractedValue && extractedValue !== '{}' && extractedValue !== '[]') {
            pairs.push(`${key}: ${extractedValue}`);
        }
    }
    
    if (pairs.length === 0) {
        // If no meaningful pairs found, just show the keys
        return `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}}`;
    }
    
    let result = pairs.join(', ');
    if (keys.length > maxPairs) {
        result += `... (+${keys.length - maxPairs} more)`;
    }
    
    return result;
}

function isCSVFile(filePath) {
    if (typeof filePath === 'string') {
        return filePath.includes('output=csv') || filePath.endsWith('.csv');
    } else if (filePath instanceof File) {
        return filePath.name.toLowerCase().endsWith('.csv');
    }
    return false;
}

function getImportTableForFile(filePath, fileSelect) {
    if (isCSVFile(filePath)) {
        return 'accounts'; // CSV files go to accounts table
    } else {
        // Check if this is a projects data source
        const selectedOption = fileSelect.options[fileSelect.selectedIndex];
        const isProjects = selectedOption && selectedOption.getAttribute('data-projects') === 'true';
        return isProjects ? 'projects' : 'projects'; // Default to projects table
    }
}

// =============================================================================
// UI UTILITIES
// =============================================================================

function showSection(element) {
    element.classList.remove('hidden');
}

function hideSection(element) {
    element.classList.add('hidden');
}

function showLoading(button, text) {
    button.disabled = true;
    button.textContent = text;
    button.classList.add('loading');
}

function hideLoading(button, text) {
    button.disabled = false;
    button.textContent = text;
    button.classList.remove('loading');
}

function showMessage(message, type = 'info', clearPrevious = false, statusMessages = null) {
    // If statusMessages element not provided, try to find it
    if (!statusMessages) {
        statusMessages = document.getElementById('statusMessages');
        if (!statusMessages) {
            // If no status messages container, just log to console
            console.log(`[${type.toUpperCase()}] ${message}`);
            return;
        }
    }
    
    // Add timestamp to message
    const timestamp = new Date().toLocaleTimeString();
    const timestampedMessage = `[${timestamp}] ${message}`;
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = timestampedMessage;
    
    // Clear previous messages if requested
    if (clearPrevious) {
        statusMessages.innerHTML = '';
    }
    
    // Append new message to the bottom of the log
    statusMessages.appendChild(alertDiv);
    
    // Keep only the last 20 messages to prevent memory issues
    while (statusMessages.children.length > 20) {
        statusMessages.removeChild(statusMessages.firstChild);
    }
    
    // Ensure the log container is visible
    statusMessages.style.display = 'block';
    
    // Auto-scroll to the bottom to show the newest message
    statusMessages.scrollTop = statusMessages.scrollHeight;
}

function clearMessages(statusMessages = null) {
    if (!statusMessages) {
        statusMessages = document.getElementById('statusMessages');
    }
    if (statusMessages) {
        statusMessages.innerHTML = '';
    }
}

// =============================================================================
// API UTILITIES
// =============================================================================

async function fetchListFeed(url, options = {}, forceCorsProxy = false, API_BASE = 'http://localhost:8081/api') {
    // Check if we're on model.earth domain (allow-listed for direct access)
    const isModelEarthDomain = window.location.hostname.includes('model.earth');
    if ((isModelEarthDomain) && !forceCorsProxy) {
        // Direct fetch for model.earth domain (CORS allow-listed)
        showMessage('Using direct API access for model.earth domain...', 'info');
        const response = await fetch(url, options);
        return await response.json();
    } else if (forceCorsProxy) {
        // Skip direct fetch and go straight to proxy when CORS is known to be required
        showMessage('Using CORS proxy for external API...', 'info');
    } else {
        // For other domains, try direct fetch first and fallback to Rust backend
        try {
            showMessage('Pull list via Javascript.', 'info');
            const response = await fetch(url, options);
            return await response.json();
        } catch (corsError) {
            // If CORS fails, use Rust backend to proxy the request
            console.log('CORS blocked direct access:', corsError.message);
            showMessage('Direct API access blocked by CORS. Using Rust backend proxy...', 'info');
        }
    }
    
    // Use Rust backend proxy
    try {
        // Alert the path about to be sent when using CORS proxy
        /*
        if (forceCorsProxy) {
            alert('CORS Proxy - Sending Request:\n\nOriginal URL: ' + url + '\nAPI_BASE: ' + API_BASE + '\nProxy Endpoint: ' + `${API_BASE}/proxy/external` + '\nRequest Body: ' + JSON.stringify({
                url: url,
                method: options.method || 'GET',
                headers: options.headers || {}
            }, null, 2));
        }
        */
        // Use Rust backend to fetch the external URL
        const proxyResponse = await fetch(`${API_BASE}/proxy/external`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url: url,
                method: options.method || 'GET',
                headers: options.headers || {}
            })
        });

        // Alert the response when using CORS proxy (before checking status)
        let proxyResult;
        if (forceCorsProxy) {
            const responseText = await proxyResponse.text();
            
            // Check for common backend connection issues
            if (proxyResponse.status === 404) {
                console.log('CORS Proxy - 404 ERROR:\n\nPath: ' + url + '\nProxy Endpoint: ' + `${API_BASE}/proxy/external` +
                      '\nStatus: ' + proxyResponse.status + ' ' + proxyResponse.statusText +
                      '\n\nLIKELY ISSUE: Rust backend not running on ' + API_BASE +
                      '\nSOLUTION: Start the Rust server with: cargo run serve' +
                      '\n\nResponse: ' + responseText.substring(0, 500));
            } else {
                /*
                alert('CORS Proxy - Response Received:\n\nPath: ' + url + '\nStatus: ' + proxyResponse.status + ' ' + proxyResponse.statusText + 
                      '\nResponse: ' + responseText.substring(0, 1000) + 
                      (responseText.length > 1000 ? '\n\n[Response truncated - showing first 1000 characters]' : ''));
                */
            }
            
            // Parse the response text as JSON
            proxyResult = JSON.parse(responseText);
        } else {
            if (!proxyResponse.ok) {
                throw new Error(`Proxy request failed: ${proxyResponse.status} ${proxyResponse.statusText}`);
            }
            proxyResult = await proxyResponse.json();
        }
        
        if (proxyResult.success) {
            showMessage('Successfully fetched data via Rust backend proxy', 'success');
            
            // Alert the loaded data when using CORS proxy
            /*
            if (forceCorsProxy) {
                alert('CORS Data Loaded:\n\n' + JSON.stringify(proxyResult.data, null, 2).substring(0, 1000) + 
                      (JSON.stringify(proxyResult.data, null, 2).length > 1000 ? '\n\n[Data truncated - showing first 1000 characters]' : ''));
            }
            */
            
            // Check if the response might be RSS/XML
            if (typeof proxyResult.data === 'string' && 
                (proxyResult.data.includes('<rss') || proxyResult.data.includes('<feed') || 
                 proxyResult.data.includes('<?xml'))) {
                // Parse as RSS/XML instead of treating as JSON
                console.log('Detected RSS/XML content from proxy, parsing...');
                const rssData = parseRSS(proxyResult.data);
                
                // Convert RSS data to JSON-like objects for consistency
                if (rssData.length > 1) {
                    const headers = rssData[0];
                    const items = rssData.slice(1).map(row => {
                        const item = {};
                        headers.forEach((header, index) => {
                            item[header] = row[index] || '';
                        });
                        return item;
                    });
                    return items;
                }
                return [];
            }
            
            return proxyResult.data;
        } else {
            throw new Error(proxyResult.error || 'Proxy request failed');
        }
    } catch (proxyError) {
        console.error('Rust backend proxy failed:', proxyError.message);
        if (forceCorsProxy) {
            showMessage('CORS proxy failed. Using fallback data...', 'warning');
        } else {
            showMessage('Both direct access and proxy failed. Using fallback data...', 'warning');
        }
        
        // Return mock data structure for DemocracyLab as last resort
        if (url.includes('democracylab.org')) {
            return [
                {
                    project_name: "Sample DemocracyLab Project",
                    project_description: "This is sample data. Both direct access and backend proxy failed.",
                    project_url: "https://www.democracylab.org",
                    project_location: "Various",
                    project_date_created: new Date().toISOString(),
                    project_date_modified: new Date().toISOString()
                }
            ];
        }
        throw proxyError;
    }
}

function maskApiKey(url) {
    return url.replace(/key=[^&]+/, 'key=***MASKED***');
}

// =============================================================================
// DATA FORMATTING UTILITIES
// =============================================================================

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    try {
        const date = new Date(timestamp);
        return date.toLocaleString();
    } catch (error) {
        return timestamp;
    }
}

// =============================================================================
// URL HASH UTILITIES
// =============================================================================

function getURLHashParam(paramName) {
    const hash = window.location.hash.substring(1);
    
    if (!hash) return null;
    
    // Parse hash manually to avoid URLSearchParams encoding
    const params = new Map();
    hash.split('&').forEach(pair => {
        const [key, val] = pair.split('=');
        if (key && val !== undefined) {
            // Decode only the key, leave value as-is to preserve commas
            const decodedKey = decodeURIComponent(key);
            let decodedVal = decodeURIComponent(val);
            
            // Remove spaces that immediately follow commas in hash values
            decodedVal = decodedVal.replace(/,\s+/g, ',');
            
            params.set(decodedKey, decodedVal);
        }
    });
    
    return params.get(paramName) || null;
}

function setURLHashParam(paramName, value) {
    const hash = window.location.hash.substring(1);
    const params = new Map();
    
    // Parse existing parameters manually
    if (hash) {
        hash.split('&').forEach(pair => {
            const [key, val] = pair.split('=');
            if (key && val !== undefined) {
                params.set(decodeURIComponent(key), decodeURIComponent(val));
            }
        });
    }
    
    // Update or remove the parameter
    if (value) {
        params.set(paramName, value);
    } else {
        params.delete(paramName);
    }
    
    // Build new hash string manually without encoding commas
    const hashPairs = [];
    params.forEach((val, key) => {
        // Only encode the key and special characters in value, but preserve commas
        const encodedKey = encodeURIComponent(key);
        const encodedValue = val.replace(/[&=]/g, match => encodeURIComponent(match));
        hashPairs.push(`${encodedKey}=${encodedValue}`);
    });
    
    const newHash = hashPairs.join('&');
    window.location.hash = newHash ? `#${newHash}` : '';
}

function updateFeedHashParam(feedValue) {
    setURLHashParam('feed', feedValue);
}

function updateListHashParam(listValue) {
    setURLHashParam('list', listValue);
}

// =============================================================================
// LOCAL STORAGE UTILITIES
// =============================================================================

function savePromptToStorage(prompt, storageKey = 'PartnerTools_prompt') {
    if (prompt && prompt.trim()) {
        localStorage.setItem(storageKey, prompt.trim());
        console.log('Saved prompt to browser storage:', prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''));
    } else {
        // Clear storage when prompt is blank
        localStorage.removeItem(storageKey);
        console.log('Cleared prompt from browser storage (blank prompt)');
    }
}

function loadPromptFromStorage(storageKey = 'PartnerTools_prompt') {
    const savedPrompt = localStorage.getItem(storageKey);
    if (savedPrompt) {
        console.log('Loaded prompt from browser storage:', savedPrompt.substring(0, 50) + (savedPrompt.length > 50 ? '...' : ''));
        return savedPrompt;
    }
    return null;
}

function saveFileSelectionToStorage(fileValue, storageKey = 'PartnerTools_selected_file') {
    if (fileValue && fileValue !== 'custom') {
        localStorage.setItem(storageKey, fileValue);
        console.log('Saved file selection to browser storage:', fileValue);
    } else {
        // Don't store custom file selections as they won't be available on reload
        localStorage.removeItem(storageKey);
        console.log('Cleared file selection from browser storage');
    }
}

function loadFileSelectionFromStorage(storageKey = 'PartnerTools_selected_file') {
    const savedFileSelection = localStorage.getItem(storageKey);
    if (savedFileSelection) {
        // Filter out hardcoded system paths that contain other users' directories
        const isHardcodedSystemPath = savedFileSelection.includes('C:\\Users\\') || 
                                    savedFileSelection.includes('/Users/') || 
                                    savedFileSelection.includes('/home/');
        
        if (isHardcodedSystemPath) {
            let currentUserGuessed = null;
            
            // Parse username from path
            if (savedFileSelection.includes('C:\\Users\\')) {
                const match = savedFileSelection.match(/C:\\Users\\([^\\]+)/);
                currentUserGuessed = match ? match[1] : null;
            } else if (savedFileSelection.includes('/Users/')) {
                const match = savedFileSelection.match(/\/Users\/([^\/]+)/);
                currentUserGuessed = match ? match[1] : null;
            } else if (savedFileSelection.includes('/home/')) {
                const match = savedFileSelection.match(/\/home\/([^\/]+)/);
                currentUserGuessed = match ? match[1] : null;
            }
            
            // Remove item if user is not yashg
            if (currentUserGuessed !== 'yashg') {
                console.warn('Temp, will delete "yashg" hardcoding later. Clearing hardcoded path from storage:', savedFileSelection);
                localStorage.removeItem(storageKey);
                return null;
            }
        }
        
        console.log('Loaded file selection from browser storage:', savedFileSelection);
        return savedFileSelection;
    }
    return null;
}

// =============================================================================
// GOOGLE SHEET CONFIGURATION LOADING
// =============================================================================

// Load configuration for dynamic dropdown population from CSV or JSON based on site type
async function loadGoogleSheetConfig(fileSelect, hashParam = 'feed') {
    // Check if this is a geo site - use existing isGeoSite value if available
    const modelsite = typeof Cookies !== 'undefined' ? Cookies.get('modelsite') : null;
    
    // Safely check for global isGeoSite variable
    let globalIsGeoSite = false;
    try {
        globalIsGeoSite = (typeof window.isGeoSite !== 'undefined' && window.isGeoSite === 'geo');
    } catch (e) {
        // Ignore reference errors for isGeoSite variable
        globalIsGeoSite = false;
    }
    
    const isGeoSiteDetected = globalIsGeoSite ||
                             window.location.hostname.includes('geo') || 
                             window.location.hostname.includes('location') ||
                             (modelsite === 'model.georgia');

    if (isGeoSiteDetected) {
        console.log('Geo site detected - loading from show.json instead of CSV');
        return await loadShowJsonConfig(fileSelect, hashParam);
    } else {
        console.log('Non-geo site - loading from CSV sources');
        return await loadCsvConfig(fileSelect, hashParam);
    }
}

// Load configuration from show.json for geo sites
async function loadShowJsonConfig(fileSelect, hashParam = 'feed') {
    // Calculate the correct relative path to show.json based on current location
    let SHOW_JSON_URL;
    const currentPath = window.location.pathname;
    
    if (currentPath.includes('/team/projects')) {
        // Already in team/projects directory, so show.json is in map/ subdirectory
        SHOW_JSON_URL = 'map/show.json';
    } else if (currentPath.includes('/team/')) {
        // In team directory, so show.json is in projects/map/ subdirectory
        SHOW_JSON_URL = 'projects/map/show.json';
    } else {
        // Outside team directory, use full relative path
        SHOW_JSON_URL = 'team/projects/map/show.json';
    }
    
    console.log(`Calculated show.json path: ${SHOW_JSON_URL} (from ${currentPath})`);
    
    try {
        console.log('Loading from show.json file...');
        const response = await fetch(SHOW_JSON_URL);
        
        if (!response.ok) {
            throw new Error(`show.json not available: ${response.status} ${response.statusText}`);
        }
        
        const showConfigs = await response.json();
        console.log('Successfully loaded show.json');
        
        // Process show.json entries and add to dropdown
        const customOption = fileSelect.querySelector('option[value="custom"]');
        
        Object.entries(showConfigs).forEach(([key, config]) => {
            // Check if option already exists to prevent duplicates
            const existingOption = fileSelect.querySelector(`option[value="${key}"]`);
            if (existingOption) {
                console.log(`Skipping duplicate option: ${key}`);
                return;
            }
            
            const option = document.createElement('option');
            option.value = key;
            option.textContent = config.shortTitle || config.listTitle || config.dataTitle || key;
            
            // Use dataset property from show.json as the URL
            if (config.dataset) {
                let datasetUrl = config.dataset;
                
                // If dataset is relative (doesn't start with http/https), make it relative to show.json location
                if (!datasetUrl.startsWith('http')) {
                    // Get the directory path of show.json and combine with dataset path
                    const showJsonDir = SHOW_JSON_URL.substring(0, SHOW_JSON_URL.lastIndexOf('/'));
                    datasetUrl = showJsonDir + '/' + datasetUrl;
                }
                
                option.setAttribute('data-url', datasetUrl);
                console.log(`Dataset path for ${key}: ${config.dataset} → ${datasetUrl}`);
            }
            
            // Set CORS to false for local files (show.json contains local dataset paths)
            option.setAttribute('data-cors', 'false');
            
            // Use featuredColumns as TopFields for Columns and Gallery layouts
            if (config.featuredColumns && Array.isArray(config.featuredColumns)) {
                option.setAttribute('data-top-fields', config.featuredColumns.join(','));
            }
            
            // Use all available fields from first data entry if available
            // Note: This would need actual data loading to determine, so we'll use featuredColumns for now
            if (config.featuredColumns) {
                option.setAttribute('data-all-fields', config.featuredColumns.join(','));
            }
            
            // Store int_required config for filtering
            if (config.int_required) {
                option.setAttribute('data-int-required', config.int_required);
            }

            // Store imgOnly config for filtering
            if (config.imgOnly) {
                option.setAttribute('data-img-only', config.imgOnly);
            }

            // Insert before the "Choose File..." option
            fileSelect.insertBefore(option, customOption);
            
            console.log(`Added show.json option: ${option.textContent} (${key}) - Dataset: ${config.dataset}`);
        });
        
        console.log('show.json configuration loaded successfully');
        return true;
        
    } catch (error) {
        console.error('Failed to load show.json configuration:', error);
        
        // Provide detailed error message for better debugging
        let errorDetails = error.message;
        if (error.message.includes('404') || error.message.includes('Not Found')) {
            errorDetails = `show.json file not found at ${SHOW_JSON_URL}. Check if the file exists and has proper permissions.`;
        } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
            errorDetails = `Access denied to show.json file at ${SHOW_JSON_URL}. Check file permissions.`;
        } else if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
            errorDetails = `Network error loading show.json from ${SHOW_JSON_URL}. Check network connection and file accessibility.`;
        }
        
        showMessage(`Failed to load show.json: ${errorDetails}. Falling back to CSV configuration.`, 'warning');
        
        // Also throw the error with details so it shows in the main error handler
        throw new Error(`Failed to load list of lists from show.json: ${errorDetails}`);
    }
}

// Load configuration from CSV sources (original logic)
async function loadCsvConfig(fileSelect, hashParam = 'feed') {
    const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSxfv7lxikjrmro3EJYGE_134vm5HdDszZKt4uKswHhsNJ_-afSaG9RoA4oeNV656r4mTuG3wTu38pM/pub?output=csv';
    const LOCAL_CSV_URL = './lists.csv'; // Local CSV file (now primary source)
    
    let csvText;
    let dataSource = 'Local file';
    
    // Try local file first (new primary source)
    try {
        console.log('Loading from local lists.csv file...');
        const localResponse = await fetch(LOCAL_CSV_URL);
        
        if (localResponse.ok) {
            csvText = await localResponse.text();
            dataSource = 'Local file';
            console.log('Successfully loaded from local lists.csv');
        } else {
            throw new Error(`Local file not available: ${localResponse.status} ${localResponse.statusText}`);
        }
        
    } catch (localError) {
        console.warn('Local file failed, attempting Google Sheets fallback:', localError);
        
        try {
            console.log('Attempting to load from Google Sheets fallback...');
            const response = await fetch(SHEET_URL);
            
            if (response.ok) {
                csvText = await response.text();
                dataSource = 'Google Sheets fallback';
                console.log('Successfully loaded from Google Sheets fallback');
            } else {
                throw new Error(`Google Sheets fetch failed: ${response.status} ${response.statusText}`);
            }
            
        } catch (googleError) {
            console.warn('Google Sheets fallback failed, trying localStorage:', googleError);
            
            try {
                const storedCSV = localStorage.getItem('fallbackCSV');
                const storedTimestamp = localStorage.getItem('fallbackCSVTimestamp');
                
                if (storedCSV) {
                    csvText = storedCSV;
                    dataSource = 'localStorage fallback';
                    
                    const timestamp = storedTimestamp ? new Date(parseInt(storedTimestamp)) : 'unknown';
                    console.log(`Successfully loaded from localStorage fallback (stored: ${timestamp})`);
                } else {
                    throw new Error('No fallback data available in localStorage');
                }
                
            } catch (localStorageError) {
                console.error('All data sources failed:', localStorageError);
                throw new Error('Failed to load from local file, Google Sheets, and localStorage');
            }
        }
    }
    
    try {
        // Parse CSV using robust parser that handles quoted fields
        const rows = parseCSV(csvText);
        const headers = rows[0];
        
        console.log(`CSV headers from ${dataSource}:`, headers);
        
        // Find column indices
        const titleIndex = headers.findIndex(h => h.toLowerCase() === 'title');
        const urlIndex = headers.findIndex(h => h.toLowerCase() === 'url');
        const feedIndex = headers.findIndex(h => h.toLowerCase() === 'feed');
        const corsIndex = headers.findIndex(h => h.toLowerCase() === 'cors');
        const topFieldsIndex = headers.findIndex(h => h.toLowerCase() === 'topfields');
        const allFieldsIndex = headers.findIndex(h => h.toLowerCase() === 'allfields');
        
        if (titleIndex === -1 || urlIndex === -1 || feedIndex === -1) {
            throw new Error('Required columns (Title, URL, Feed) not found in sheet');
        }
        
        console.log(`Column indices from ${dataSource} - Title:`, titleIndex, 'URL:', urlIndex, 'Feed:', feedIndex, 'CORS:', corsIndex, 'TopFields:', topFieldsIndex, 'AllFields:', allFieldsIndex);
        
        // Check if this is a geo site for filtering
        const modelsite = typeof Cookies !== 'undefined' ? Cookies.get('modelsite') : null;
        const isGeoSite = window.location.hostname.includes('geo') || 
                         window.location.hostname.includes('location') ||
                         (modelsite === 'model.georgia');
        const allowedGeoOptions = ['geo', 'film-scouting', 'nasa'];
        
        // Process data rows and add to dropdown
        const customOption = fileSelect.querySelector('option[value="custom"]');
        
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row.length < Math.max(titleIndex, urlIndex, feedIndex) + 1) continue;
            
            const title = row[titleIndex];
            const url = row[urlIndex];
            const feed = row[feedIndex];
            const cors = corsIndex !== -1 ? row[corsIndex] : '';
            const topFields = topFieldsIndex !== -1 ? row[topFieldsIndex] : '';
            const allFields = allFieldsIndex !== -1 ? row[allFieldsIndex] : '';
            
            if (title && url && feed) {
                // Filter options for geo sites
                if (isGeoSite && !allowedGeoOptions.includes(feed)) {
                    continue; // Skip this option for geo sites
                }
                
                // Check if option already exists to prevent duplicates
                const existingOption = fileSelect.querySelector(`option[value="${feed}"]`);
                if (existingOption) {
                    console.log(`Skipping duplicate option: ${feed}`);
                    continue; // Skip creating duplicate option
                }
                
                const option = document.createElement('option');
                option.value = feed;
                option.textContent = title;
                option.setAttribute('data-url', url);
                const corsValue = cors.toLowerCase() === 'true' ? 'true' : 'false';
                option.setAttribute('data-cors', corsValue);
                
                // Add TopFields attribute if available
                if (topFields) {
                    option.setAttribute('data-top-fields', topFields);
                }
                
                // Add AllFields attribute if available
                if (allFields) {
                    option.setAttribute('data-all-fields', allFields);
                }
                
                // Debug logging for cities.us specifically
                if (feed === 'cities.us') {
                    console.log('=== US-CITIES OPTION CREATION DEBUG ===');
                    console.log('Feed:', feed);
                    console.log('Title:', title);
                    console.log('URL:', url);
                    console.log('Raw CORS value from CSV:', cors);
                    console.log('Processed CORS value:', corsValue);
                    console.log('Option created with data-cors:', option.getAttribute('data-cors'));
                }
                
                // Add data-projects attribute for democracylab
                if (feed === 'democracylab') {
                    option.setAttribute('data-projects', 'true');
                }
                
                // Insert before the "Choose File..." option
                fileSelect.insertBefore(option, customOption);
                
                console.log(`Added option: ${title} (${feed}) - CORS: ${cors}`);
            }
        }
        
        console.log('CSV configuration loaded successfully');
        return true;
        
    } catch (error) {
        console.error('Failed to load CSV configuration:', error);
        showMessage('Failed to load dynamic options from CSV, using fallback options', 'warning');
        
        // Add fallback options when CSV loading fails
        const customOption = fileSelect.querySelector('option[value="custom"]');
        if (customOption) {
            // Add Cities option as primary fallback (check for duplicates)
            if (!fileSelect.querySelector('option[value="cities"]')) {
                const citiesOption = document.createElement('option');
                citiesOption.value = 'cities';
                citiesOption.textContent = 'Cities';
                citiesOption.setAttribute('data-url', 'projects/map/cities.csv');
                citiesOption.setAttribute('data-cors', 'false');
                fileSelect.insertBefore(citiesOption, customOption);
            }
            
            // Add Model Team option as secondary fallback (check for duplicates)
            if (!fileSelect.querySelector('option[value="modelteam"]')) {
                const fallbackOption = document.createElement('option');
                fallbackOption.value = 'modelteam';
                fallbackOption.textContent = 'Model Team (list.js)';
                fallbackOption.setAttribute('data-url', 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRh5-bIR4hC1f9H3NtDCNT19hZXnqz8WRrBwTuLGnZiA5PWhFILUv2nS2FKE2TZ4dZ-RnJkZwHx1t2Y/pub?gid=1054734503&single=true&output=csv');
                fallbackOption.setAttribute('data-cors', 'false');
                fileSelect.insertBefore(fallbackOption, customOption);
            }
        }
        
        return false;
    }
}

// Initialize file selection with Google Sheet loading and hash parameter support
async function initializeFileSelectionWithGoogleSheet(fileSelect, hashParam = 'feed', storageKey = 'fileSelection') {
    // Load Google Sheet configuration first
    await loadGoogleSheetConfig(fileSelect, hashParam);
    
    // Check for hash parameter first
    const hashParamValue = getURLHashParam(hashParam);
    let selectedOption;
    
    if (hashParamValue) {
        // Use value from URL hash parameter
        const hashOption = fileSelect.options ? Array.from(fileSelect.options).find(option => option.value === hashParamValue) : null;
        if (hashOption) {
            fileSelect.value = hashParamValue;
            selectedOption = hashOption;
            console.log(`Using ${hashParam} from URL hash parameter:`, hashParamValue);
        } else {
            // Hash parameter not found, fall back to browser storage
            const savedSelection = loadFileSelectionFromStorage(storageKey);
            if (savedSelection && fileSelect.options) {
                const savedOption = Array.from(fileSelect.options).find(option => option.value === savedSelection);
                if (savedOption) {
                    fileSelect.value = savedSelection;
                    selectedOption = savedOption;
                    console.log(`Hash ${hashParam} not found, restored from browser storage:`, savedSelection);
                } else {
                    selectedOption = fileSelect.options && fileSelect.options.length > 0 ? fileSelect.options[fileSelect.selectedIndex] : null;
                    if (selectedOption) {
                        console.log(`Hash ${hashParam} not found, saved selection not available, using default:`, selectedOption.value);
                    }
                }
            } else {
                selectedOption = fileSelect.options && fileSelect.options.length > 0 ? fileSelect.options[fileSelect.selectedIndex] : null;
                if (selectedOption) {
                    console.log(`Hash ${hashParam} not found, no saved selection, using default:`, selectedOption.value);
                }
            }
        }
    } else {
        // No hash parameter, try to restore saved selection from browser storage
        const savedSelection = loadFileSelectionFromStorage(storageKey);
        
        if (savedSelection && fileSelect.options) {
            // Check if the saved selection is still available in the dropdown
            const savedOption = Array.from(fileSelect.options).find(option => option.value === savedSelection);
            if (savedOption) {
                fileSelect.value = savedSelection;
                selectedOption = savedOption;
                console.log('Restored file selection from browser storage:', savedSelection);
            } else {
                // Saved selection no longer available, use default (prefer "videos")
                const videosOption = Array.from(fileSelect.options).find(option => option.value === 'videos');
                if (videosOption) {
                    fileSelect.value = 'videos';
                    selectedOption = videosOption;
                    console.log('Saved file selection not available, defaulting to videos');
                } else {
                    // No videos option, find first non-custom option
                    const firstNonCustomOption = Array.from(fileSelect.options).find(option => option.value !== 'custom');
                    if (firstNonCustomOption) {
                        fileSelect.value = firstNonCustomOption.value;
                        selectedOption = firstNonCustomOption;
                        console.log('Saved file selection not available, using first non-custom option:', firstNonCustomOption.value);
                    } else {
                        selectedOption = fileSelect.options && fileSelect.options.length > 0 ? fileSelect.options[fileSelect.selectedIndex] : null;
                        if (selectedOption) {
                            console.log('Saved file selection not available, using fallback:', selectedOption.value);
                        }
                    }
                }
            }
        } else {
            // No saved selection, use default (prefer "videos")
            const videosOption = Array.from(fileSelect.options).find(option => option.value === 'videos');
            if (videosOption) {
                fileSelect.value = 'videos';
                selectedOption = videosOption;
                console.log('No saved file selection, defaulting to videos');
            } else {
                // No videos option, find first non-custom option
                const firstNonCustomOption = Array.from(fileSelect.options).find(option => option.value !== 'custom');
                if (firstNonCustomOption) {
                    fileSelect.value = firstNonCustomOption.value;
                    selectedOption = firstNonCustomOption;
                    console.log('No saved file selection, using first non-custom option:', firstNonCustomOption.value);
                } else {
                    selectedOption = fileSelect.options && fileSelect.options.length > 0 ? fileSelect.options[fileSelect.selectedIndex] : null;
                    if (selectedOption) {
                        console.log('No saved file selection, using fallback:', selectedOption.value);
                    }
                }
            }
        }
        
        // Update URL hash with the selected value
        if (selectedOption) {
            if (hashParam === 'feed') {
                updateFeedHashParam(selectedOption.value);
            } else {
                setURLHashParam(hashParam, selectedOption.value);
            }
        }
    }
    
    // If no selectedOption was set, create a fallback
    if (!selectedOption && fileSelect.options && fileSelect.options.length > 0) {
        selectedOption = fileSelect.options[0];
        console.log('Using first available option as fallback:', selectedOption.value);
    }
    
    return selectedOption;
}

// =============================================================================
// UNIFIED DATA LOADING FUNCTIONS
// =============================================================================

// Function to check if a value is likely a valid column header
function isValidHeaderValue(value) {
    if (value === null || value === undefined || value === '') {
        return false;
    }
    
    const str = String(value).trim();
    if (str === '') {
        return false;
    }
    
    // Check if it's a number (not a valid header)
    if (!isNaN(parseFloat(str)) && isFinite(str)) {
        return false;
    }
    
    // Check if it looks like a date (not a valid header)
    const dateRegex = /^\d{4}-\d{2}-\d{2}|^\d{1,2}\/\d{1,2}\/\d{4}|^\d{1,2}-\d{1,2}-\d{4}/;
    if (dateRegex.test(str)) {
        return false;
    }
    
    // Check if it's too long to be a reasonable header (probably data)
    if (str.length > 100) {
        return false;
    }
    
    // Check if it contains characters that suggest it's data rather than a header
    // URLs, emails, or very long text with spaces suggesting sentences
    if (str.includes('http://') || str.includes('https://') || str.includes('@') && str.includes('.')) {
        return false;
    }
    
    // If it has more than 10 words, it's probably data, not a header
    const wordCount = str.split(/\s+/).length;
    if (wordCount > 10) {
        return false;
    }
    
    return true;
}

// Function to intelligently detect if first row should be used as headers
function shouldUseFirstRowAsHeaders(data) {
    if (!data || data.length === 0) {
        return false;
    }
    
    const firstRow = data[0];
    if (!firstRow || typeof firstRow !== 'object') {
        return false;
    }
    
    // For arrays of arrays (raw CSV data)
    if (Array.isArray(firstRow)) {
        // Check if most values in first row look like valid headers
        const validHeaderCount = firstRow.filter(value => isValidHeaderValue(value)).length;
        const totalValues = firstRow.filter(value => value !== null && value !== undefined && String(value).trim() !== '').length;
        
        // If at least 70% of non-empty values look like valid headers, use first row
        return totalValues > 0 && (validHeaderCount / totalValues) >= 0.7;
    }
    
    // For arrays of objects, headers are already the object keys
    return false;
}

// Function to convert array of arrays to array of objects using first row as headers
function convertArraysToObjects(data, allFields = null) {
    if (!data || data.length === 0) {
        return [];
    }
    
    // Check if we should use first row as headers
    if (!shouldUseFirstRowAsHeaders(data)) {
        // Use AllFields if provided, otherwise generate generic headers
        let headers;
        if (allFields && typeof allFields === 'string') {
            headers = allFields.split(',').map(h => h.trim());
            console.log('Using AllFields for column names:', headers);
        } else {
            // Generate generic headers: Column1, Column2, etc.
            // Use reduce instead of Math.max with spread operator to avoid stack overflow with large datasets
            const maxColumns = data.reduce((max, row) => {
                const length = Array.isArray(row) ? row.length : 0;
                return Math.max(max, length);
            }, 0);
            headers = Array.from({length: maxColumns}, (_, i) => `Column${i + 1}`);
        }
        
        return data.map(row => {
            const obj = {};
            headers.forEach((header, index) => {
                obj[header] = Array.isArray(row) ? (row[index] || '') : row;
            });
            return obj;
        });
    }
    
    // Use first row as headers
    const headers = data[0];
    const dataRows = data.slice(1);
    
    return dataRows.map(row => {
        const obj = {};
        headers.forEach((header, index) => {
            const cleanHeader = String(header || `Column${index + 1}`).trim();
            obj[cleanHeader] = Array.isArray(row) ? (row[index] || '') : row;
        });
        return obj;
    });
}

// Apply int_required filtering to data (same logic as map.js)
function applyIntRequiredFilter(data, config) {
    // Return original data if no config or int_required specified
    if (!config || !config.int_required || !data || data.length === 0) {
        return data;
    }
    
    const intRequiredField = config.int_required;
    const originalCount = data.length;
    
    const filteredData = data.filter(row => {
        const value = row[intRequiredField];
        return value && !isNaN(parseInt(value)) && parseInt(value).toString() === value.toString();
    });
    
    console.log(`Filtered by int_required (${intRequiredField}): ${filteredData.length} rows remaining from ${originalCount} original rows`);
    
    return filteredData;
}

// Unified data loading function that handles JSON, RSS, CSV, and Excel formats
async function loadUnifiedData(url, options = {}) {
    const { forceCorsProxy = false, API_BASE = 'http://localhost:8081/api', allFields = null, config = null, forceCSV = false } = options;

    try {
        console.log('=== LOAD UNIFIED DATA DEBUG ===');
        console.log('Loading unified data from:', url);
        console.log('forceCorsProxy:', forceCorsProxy);
        console.log('forceCSV:', forceCSV);
        console.log('API_BASE:', API_BASE);

        // Determine if this URL needs CSV parsing (Google Sheets or CSV files)
        const isCSVData = forceCSV || url.includes('output=csv') || url.endsWith('.csv') || url.includes('docs.google.com/spreadsheets');
        
        if (isCSVData) {
            // Handle CSV data (Google Sheets, CSV files)
            let csvText;

            // Check if this is a local file path (relative or absolute local path)
            const isLocalFile = url.startsWith('./') || url.startsWith('../') || url.startsWith('/') || (!url.includes('://') && !url.includes('http'));

            if (forceCorsProxy && !isLocalFile) {
                // CORS is required for external URLs - use backend proxy
                console.log('CORS required for external URL - using backend proxy for CSV fetch...');
                try {
                    // Use appropriate endpoint based on URL type
                    const isGoogleSheets = url.includes('docs.google.com/spreadsheets');
                    const endpoint = isGoogleSheets ? '/proxy/csv' : '/proxy/external';

                    const proxyResponse = await fetch(`${API_BASE}${endpoint}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ url: url })
                    });

                    if (proxyResponse.ok) {
                        const proxyData = await proxyResponse.json();
                        if (proxyData.success) {
                            // Handle different response formats
                            csvText = proxyData.csv || proxyData.data; // Google Sheets uses .csv, external uses .data
                            console.log('Backend CSV proxy successful');
                        } else {
                            throw new Error(proxyData.error || 'Backend CSV proxy failed');
                        }
                    } else {
                        throw new Error('Backend CSV proxy not available');
                    }
                } catch (proxyError) {
                    throw new Error(`Rust server not accessible, so CORS process was not available to fetch CSV data via backend proxy.\n\nProxy error: ${proxyError.message}\n\nPath attempted: ${url}\n\nNote: CORS=TRUE is set for this URL in lists.csv`);
                }
            } else {
                // No CORS restriction or local file - try direct fetch
                if (isLocalFile) {
                    console.log('Local file detected - attempting direct CSV fetch...');
                } else {
                    console.log('No CORS restriction - attempting direct CSV fetch...');
                }
                try {
                    const directResponse = await fetch(url, {
                        cache: 'no-cache',
                        headers: {
                            'Accept': 'text/csv'
                        }
                    });
                    
                    if (directResponse.ok) {
                        csvText = await directResponse.text();
                        console.log('Direct CSV fetch successful');
                    } else {
                        throw new Error(`Direct fetch failed: ${directResponse.status} ${directResponse.statusText}`);
                    }
                } catch (directError) {
                    throw new Error(`Cannot fetch CSV data via direct fetch.\n\nDirect error: ${directError.message}\n\nPath attempted: ${url}\n\nNote: If this URL requires CORS proxy, set CORS=TRUE in the lists.csv file.`);
                }
            }
            
            // Parse CSV data with intelligent header detection
            const parsedArrays = parseCSV(csvText);
            
            if (!parsedArrays || parsedArrays.length === 0) {
                throw new Error(`No data found in the spreadsheet\n\nPath attempted: ${url}`);
            }
            
            // Convert arrays to objects with intelligent header detection
            const parsedData = convertArraysToObjects(parsedArrays, allFields);
            
            if (!parsedData || parsedData.length === 0) {
                throw new Error(`No valid data rows found in the spreadsheet\n\nPath attempted: ${url}`);
            }
            
            console.log(`CSV parsed: ${parsedArrays.length} total rows, ${parsedData.length} data rows, headers detected: ${shouldUseFirstRowAsHeaders(parsedArrays) ? 'YES' : 'NO'}`);
            
            // Apply int_required filtering if specified in config
            const filteredData = applyIntRequiredFilter(parsedData, config);
            
            return {
                data: filteredData,
                format: 'csv',
                total_records: filteredData.length,
                source: 'csv'
            };
            
        } else {
            // Handle JSON, RSS, XML, and other formats using fetchListFeed
            const response = await fetchListFeed(url, {}, forceCorsProxy, API_BASE);
            
            // Handle different response structures
            let processedData;
            
            if (Array.isArray(response)) {
                processedData = response;
            } else if (response && response.data && Array.isArray(response.data)) {
                processedData = response.data;
            } else if (response && response.projects && Array.isArray(response.projects)) {
                processedData = response.projects;
            } else if (response && response.results && Array.isArray(response.results)) {
                processedData = response.results;
            } else if (response && Array.isArray(response.project_tiles)) {
                processedData = response.project_tiles;
            } else if (response && typeof response === 'object') {
                // Check for any array property in the response
                const keys = Object.keys(response);
                console.log('Response keys:', keys);
                
                // First, check if this looks like a single data object that should be wrapped
                // (e.g., USDA food item with fdcId, description, etc.)
                const hasMainDataKeys = keys.some(key => 
                    ['id', 'fdcId', 'description', 'name', 'title', 'email', 'username'].includes(key) ||
                    (key.toLowerCase().includes('id') && typeof response[key] === 'number') ||
                    (key.toLowerCase().includes('name') && typeof response[key] === 'string') ||
                    (key.toLowerCase().includes('description') && typeof response[key] === 'string')
                );
                
                if (hasMainDataKeys) {
                    console.log('Found single data object with main identifier keys, wrapping in array for processing');
                    processedData = [response];
                } else {
                    // Look for arrays in the response - prioritize non-empty arrays
                    let foundArrays = [];
                    for (const key of keys) {
                        if (Array.isArray(response[key])) {
                            foundArrays.push({
                                key: key,
                                length: response[key].length,
                                data: response[key]
                            });
                        }
                    }
                    
                    // Sort by length (prioritize non-empty arrays)
                    foundArrays.sort((a, b) => b.length - a.length);
                    
                    if (foundArrays.length > 0) {
                        const bestArray = foundArrays[0];
                        console.log(`Found array at key: ${bestArray.key}, length: ${bestArray.length}`);
                        processedData = bestArray.data;
                    }
                }
                
                // If still no array found but this looks like a valid single data object, wrap it in an array
                if (!processedData && keys.length > 0) {
                    // Check if this looks like a data object (has meaningful keys, not just error/status)
                    const hasDataKeys = keys.some(key => 
                        key.toLowerCase() !== 'error' && 
                        key.toLowerCase() !== 'status' && 
                        key.toLowerCase() !== 'message' &&
                        response[key] !== null && 
                        response[key] !== undefined
                    );
                    
                    if (hasDataKeys) {
                        console.log('Found single data object, wrapping in array for processing');
                        processedData = [response];
                    }
                }
            }
            
            if (!Array.isArray(processedData)) {
                console.error('Unable to find data array in response:', response);
                const errorMessage = `Invalid data format received from API. Response type: ${typeof response}, keys: ${response && typeof response === 'object' ? Object.keys(response).join(', ') : 'none'}`;
                
                // Show error in status messages instead of throwing
                showMessage(`${errorMessage}\n\nPath attempted: ${url}`, 'error');
                
                // Populate Raw Data Editor with the error response
                const rawDataEditor = document.getElementById('raw-data-editor');
                const rawDataSource = document.getElementById('raw-data-source');
                
                if (rawDataEditor) {
                    rawDataEditor.value = JSON.stringify(response, null, 2);
                }
                
                if (rawDataSource) {
                    rawDataSource.value = url;
                }
                
                // Show Raw Data Editor panel if it exists and isn't already visible
                const rawDataControl = document.getElementById('raw-data-control');
                if (rawDataControl && rawDataControl.style.display === 'none') {
                    rawDataControl.style.display = 'block';
                    
                    // Update toggle text if available
                    const rawDataText = document.getElementById('raw-data-text');
                    if (rawDataText) {
                        rawDataText.textContent = 'Hide Raw Data';
                    }
                    
                    // Set rawDataVisible flag if it exists in global scope
                    if (typeof window !== 'undefined' && 'rawDataVisible' in window) {
                        window.rawDataVisible = true;
                    }
                }
                
                // Return an empty data structure to prevent further errors
                return {
                    data: [],
                    format: 'error',
                    total_records: 0,
                    source: 'error_response',
                    error: errorMessage,
                    rawResponse: response
                };
            }
            
            // Check if this might be an array of arrays (like CSV data in JSON format)
            const isArrayOfArrays = processedData.length > 0 && Array.isArray(processedData[0]);
            
            let finalData;
            if (isArrayOfArrays) {
                // Handle as array of arrays with header detection
                console.log('Processing JSON as array of arrays...');
                finalData = convertArraysToObjects(processedData, allFields);
                console.log(`JSON array processed: ${processedData.length} total rows, ${finalData.length} data rows, headers detected: ${shouldUseFirstRowAsHeaders(processedData) ? 'YES' : 'NO'}`);
            } else {
                // Flatten nested objects in the data
                console.log('Flattening nested objects in JSON data...');
                finalData = processedData.map(item => {
                    const flattened = flattenObject(item);
                    return flattened;
                });
            }
            
            // Apply int_required filtering if specified in config
            const filteredData = applyIntRequiredFilter(finalData, config);
            
            return {
                data: filteredData,
                format: 'json',
                total_records: filteredData.length,
                source: 'api'
            };
        }
        
    } catch (error) {
        console.error('Unified data loading error:', error);
        throw error;
    }
}

// Unified preview data formatter for consistent preview structure
function formatUnifiedPreviewData(loadResult, sourceName) {
    const { data, format, total_records } = loadResult;
    
    // Get all unique headers from data
    const allHeaders = new Set();
    data.forEach(item => {
        Object.keys(item).forEach(key => allHeaders.add(key));
    });
    const headers = Array.from(allHeaders).sort();
    
    // Create consistent preview structure
    const previewData = {
        preview: data.slice(0, 5), // Show first 5 items
        total_records: total_records,
        loaded_records: total_records,
        headers: headers,
        source: sourceName.toLowerCase().replace(/\s+/g, '_'),
        format: format
    };
    
    // Store the full dataset for later use
    const fullResult = {
        preview: previewData.preview,
        total_records: previewData.total_records,
        loaded_records: previewData.loaded_records,
        headers: previewData.headers,
        full_dataset: data,
        source: sourceName.toLowerCase().replace(/\s+/g, '_'),
        sheet_name: sourceName,
        format: format
    };
    
    return { previewData, fullResult };
}

// =============================================================================
// SHARED AI INSIGHTS FUNCTIONS
// =============================================================================

// Shared AI Insights Display Functions
function createSaveButtons(aiType, isNewAnalysis) {
    if (!isNewAnalysis) return '';
    
    const aiTypeCap = aiType.charAt(0).toUpperCase() + aiType.slice(1);
    return `
        <div class="save-cancel-buttons" style="display: flex; gap: 12px; margin-bottom: 16px; justify-content: flex-end;">
            <button class="btn btn-secondary" onclick="cancel${aiTypeCap}Analysis()">Don't Save</button>
            <button class="btn btn-primary" onclick="save${aiTypeCap}Analysis()">Save Changes</button>
        </div>
    `;
}

function createPromptSection(promptText, aiType) {
    const borderColor = aiType === 'claude' ? 'var(--accent-blue)' : 'var(--accent-green)';
    return `
        <div class="insight-section" style="background: var(--bg-tertiary); padding: 12px; border-radius: var(--radius-md); margin-bottom: 16px; border-left: 4px solid ${borderColor};">
            <strong>📝 Analysis Prompt:</strong> <span style="font-style: italic; color: var(--text-secondary);">${promptText}</span>
        </div>
    `;
}

function appendTokenUsage(analysis, tokenUsage) {
    if (!tokenUsage) return analysis;
    
    const tokenInfo = `\n\n---\n**Token Usage**: ${tokenUsage.total_tokens || 'N/A'} tokens (${tokenUsage.prompt_tokens || 'N/A'} prompt, ${tokenUsage.completion_tokens || 'N/A'} completion)`;
    return analysis + tokenInfo;
}

// Unified display function for all LLM insights
async function displayInsights(aiType, analysis, totalRecords, sampleSize, isNewAnalysis = false, customPrompt = 'Standard data analysis prompt') {
    const insightsContent = document.getElementById('insightsContent');
    if (!insightsContent) {
        console.warn(`⚠️ ERROR: insightsContent element not found for ${aiType}`);
        return;
    }

    // Get LLM-specific configuration
    const config = {
        'claude': { emoji: '🤖', color: 'var(--accent-blue)', name: 'Claude' },
        'gemini': { emoji: '📊', color: 'var(--accent-green)', name: 'Gemini' },
        'openai': { emoji: '📊', color: 'var(--accent-green)', name: 'OpenAI' }
    };
    const llmConfig = config[aiType] || { emoji: '🤖', color: 'var(--accent-blue)', name: aiType.charAt(0).toUpperCase() + aiType.slice(1) };

    const saveButtonsHTML = createSaveButtons(aiType, isNewAnalysis);
    const promptHTML = createPromptSection(customPrompt, aiType);

    // Check if this is cached data
    const isCached = !isNewAnalysis;

    console.warn(`⚠️ DISPLAY FUNCTION CALLED: ${aiType}`, {
        analysisLength: analysis?.length,
        totalRecords,
        sampleSize,
        isNewAnalysis,
        hasInsightsContent: !!insightsContent
    });

    try {
        // Use markdown processing similar to admin page
        const processedHTML = await processSharedMarkdownContent(analysis);

        console.warn(`⚠️ MARKDOWN PROCESSED for ${aiType}:`, {
            processedLength: processedHTML?.length,
            preview: processedHTML?.substring(0, 100)
        });

        let html = `
            <div class="insight-section" style="border-bottom: 1px solid var(--border-light); padding-bottom: 12px; margin-bottom: 16px;">
                <strong>${llmConfig.emoji} ${llmConfig.name} Analysis:</strong> ${sampleSize} records analyzed from a dataset of ${totalRecords}
                ${isCached ? `<span style="color: var(--text-muted); font-size: 12px; margin-left: 8px; cursor: pointer; text-decoration: underline;" onclick="showRawMarkdown('${aiType}')">💾 Cached ${llmConfig.name} Analysis</span>` : ''}
                ${isNewAnalysis ? `<span style="color: ${llmConfig.color}; font-size: 12px; margin-left: 8px;">✨ New Analysis</span>` : ''}
            </div>
            ${saveButtonsHTML}
            ${promptHTML}
            <div class="insight-section readme-content">
                ${processedHTML}
            </div>
        `;

        console.warn(`⚠️ SETTING INNERHTML for ${aiType}:`, {
            htmlLength: html.length,
            htmlPreview: html.substring(0, 200)
        });

        insightsContent.innerHTML = html;

        console.warn(`⚠️ INNERHTML SET SUCCESSFULLY for ${aiType}`);

        // Apply markdown styling if available
        if (typeof applyMarkdownStyling === 'function') {
            applyMarkdownStyling(insightsContent);
        }

    } catch (error) {
        console.error(`Error processing ${aiType} markdown:`, error);
        // Fallback to simple text display
        insightsContent.innerHTML = `
            <div class="insight-section" style="border-bottom: 1px solid var(--border-light); padding-bottom: 12px; margin-bottom: 16px;">
                <strong>${llmConfig.emoji} ${llmConfig.name} Analysis:</strong> ${sampleSize} records analyzed from a dataset of ${totalRecords}
                ${isCached ? '<span style="color: var(--text-muted); font-size: 12px; margin-left: 8px;">💾 Cached analysis</span>' : ''}
                ${isNewAnalysis ? `<span style="color: ${llmConfig.color}; font-size: 12px; margin-left: 8px;">✨ New Analysis</span>` : ''}
            </div>
            ${saveButtonsHTML}
            ${promptHTML}
            <div class="insight-section">
                <pre style="white-space: pre-wrap; font-family: inherit;">${escapeHtml(analysis)}</pre>
            </div>
        `;
    }
}

// Legacy wrapper functions for backward compatibility
async function displaySharedGeminiInsights(analysis, totalRecords, sampleSize, isNewAnalysis = false, customPrompt = 'Standard data analysis prompt') {
    return displayInsights('gemini', analysis, totalRecords, sampleSize, isNewAnalysis, customPrompt);
}

async function displaySharedClaudeInsights(analysis, totalRecords, sampleSize, isNewAnalysis = false, customPrompt = 'Standard data analysis prompt') {
    return displayInsights('claude', analysis, totalRecords, sampleSize, isNewAnalysis, customPrompt);
}

async function displaySharedOpenAIInsights(analysis, totalRecords, sampleSize, isNewAnalysis = false, customPrompt = 'Standard data analysis prompt') {
    return displayInsights('openai', analysis, totalRecords, sampleSize, isNewAnalysis, customPrompt);
}

// Escape underscores outside of code blocks to prevent markdown interpretation
function escapeUnderscoresOutsideCodeBlocks(markdown) {
    // Split the markdown into lines for processing
    const lines = markdown.split('\n');
    const processedLines = [];

    let inCodeFence = false;
    let codeBlockType = null;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // Check for code fences (```bash, ```javascript, etc.)
        if (line.trim().startsWith('```')) {
            inCodeFence = !inCodeFence;
            if (inCodeFence) {
                codeBlockType = line.trim().substring(3);
            } else {
                codeBlockType = null;
            }
            processedLines.push(line);
            continue;
        }

        // Check for tab-indented code blocks (4 spaces or tab at start)
        const isTabIndented = line.match(/^(\t|    )/);

        // If we're in a code block or this line is tab-indented, don't process underscores
        if (inCodeFence || isTabIndented) {
            processedLines.push(line);
            continue;
        }

        // Process inline code spans (`code`) by temporarily replacing them
        // Match pairs of backticks with content between them (including empty)
        const inlineCodeRegex = /`[^`]*`/g;
        const inlineCodeBlocks = [];
        let tempLine = line.replace(inlineCodeRegex, (match) => {
            const placeholder = `XYZINLINECODEXYZ${inlineCodeBlocks.length}XYZENDXYZ`;
            inlineCodeBlocks.push(match);
            return placeholder;
        });

        // Process HTML elements by temporarily replacing them
        // Match HTML tags with attributes that might contain underscores
        const htmlElementRegex = /<(a|img|pre|code|script|style|link|meta)[^>]*>.*?<\/\1>|<(a|img|pre|code|script|style|link|meta|br|hr|input)[^>]*\/?>/gi;
        const htmlElements = [];
        tempLine = tempLine.replace(htmlElementRegex, (match) => {
            const placeholder = `XYZHTMLELEMENTXYZ${htmlElements.length}XYZENDXYZ`;
            htmlElements.push(match);
            return placeholder;
        });

        // Also handle HTML attributes specifically (href, src, etc.) that might span lines or be standalone
        const attributeRegex = /\b(href|src|action|data-[a-z-]+|class|id|style|alt|title)\s*=\s*(['"]?)([^'">\s]*)\2/gi;
        const attributes = [];
        tempLine = tempLine.replace(attributeRegex, (match) => {
            const placeholder = `XYZATTRIBUTEXYZ${attributes.length}XYZENDXYZ`;
            attributes.push(match);
            return placeholder;
        });

        // Now escape underscores in the remaining text (not already escaped)
        tempLine = tempLine.replace(/(?<!\\)_/g, '\\_');

        // Restore attributes
        attributes.forEach((attribute, index) => {
            const placeholder = `XYZATTRIBUTEXYZ${index}XYZENDXYZ`;
            tempLine = tempLine.split(placeholder).join(attribute);
        });

        // Restore HTML elements
        htmlElements.forEach((htmlElement, index) => {
            const placeholder = `XYZHTMLELEMENTXYZ${index}XYZENDXYZ`;
            tempLine = tempLine.split(placeholder).join(htmlElement);
        });

        // Restore inline code blocks
        inlineCodeBlocks.forEach((codeBlock, index) => {
            const placeholder = `XYZINLINECODEXYZ${index}XYZENDXYZ`;
            tempLine = tempLine.split(placeholder).join(codeBlock);
        });

        processedLines.push(tempLine);
    }

    return processedLines.join('\n');
}

// Helper function for markdown processing (fallback if not available)
async function processSharedMarkdownContent(markdown) {
    // Use showdown for proper markdown conversion
    if (!window.showdown) {
        // Load showdown if not loaded
        await new Promise((resolve, reject) => {
            if (window.showdown) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/showdown@2.1.0/dist/showdown.min.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load Showdown'));
            document.head.appendChild(script);
        });
    }

    if (window.showdown) {
        // Escape underscores outside of code blocks (same as localsite)
        const processedMarkdown = escapeUnderscoresOutsideCodeBlocks(markdown);

        // Configure showdown converter with localsite-compatible options
        const converter = new showdown.Converter({
            tables: true,
            metadata: true,
            simpleLineBreaks: true,  // Match localsite behavior - convert single line breaks to <br>
            ghCodeBlocks: true,
            tasklists: true,
            strikethrough: true,
            emoji: true,
            underline: true
        });

        // Convert markdown to HTML
        return converter.makeHtml(processedMarkdown);
    }

    // Final fallback if showdown fails to load
    return markdown.replace(/\n/g, '<br>');
}

// =============================================================================
// EXPORT FOR MODULE USAGE (if needed)
// =============================================================================

// If using as a module, export the functions
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        // Cache management
        loadCacheFromStorage,
        saveCacheToStorage,
        loadClaudeCacheFromStorage,
        saveClaudeCacheToStorage,
        getCurrentCacheKey,
        
        // Data processing
        parseCSV,
        parseCSVToObjects,
        parseRSS,
        flattenObject,
        extractObjectValues,
        isCSVFile,
        getImportTableForFile,
        
        // Header detection
        isValidHeaderValue,
        shouldUseFirstRowAsHeaders,
        convertArraysToObjects,
        
        // UI utilities
        showSection,
        hideSection,
        showLoading,
        hideLoading,
        showMessage,
        clearMessages,
        
        // API utilities
        fetchListFeed,
        maskApiKey,
        
        // Data formatting
        formatBytes,
        escapeHtml,
        formatTimestamp,
        
        // URL hash utilities
        getURLHashParam,
        setURLHashParam,
        updateFeedHashParam,
        updateListHashParam,
        
        // Local storage utilities
        savePromptToStorage,
        loadPromptFromStorage,
        saveFileSelectionToStorage,
        loadFileSelectionFromStorage,
        
        // Google Sheet configuration
        loadGoogleSheetConfig,
        initializeFileSelectionWithGoogleSheet,
        
        // Unified data loading
        loadUnifiedData,
        formatUnifiedPreviewData,
        applyIntRequiredFilter,
        
        // Shared AI insights functions
        displaySharedGeminiInsights,
        displaySharedClaudeInsights,
        createSaveButtons,
        createPromptSection,
        appendTokenUsage
    };
}