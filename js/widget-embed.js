// Load localsite.js and supporting files for widget.js
// Optimized loading strategy: parallel JS batches, non-blocking CSS

(function() {
    // Create or ensure local_app exists
    var local_app = local_app || {}; // Same as localsite.js
    
    // Check if web_root already exists, if not create it
    if (typeof local_app.web_root !== 'function') {
        local_app.web_root = function() {
            // Find the widget-embed.js script using the same approach as localsite.js
            let scripts = document.getElementsByTagName('script');
            let widgetScript;
            
            // Look for widget-embed.js script
            for (var i = 0; i < scripts.length; ++i) {
                if(scripts[i].src && scripts[i].src.indexOf('widget-embed.js') !== -1){
                    widgetScript = scripts[i];
                    break;
                }
            }
            
            if (widgetScript) {
                // Extract hostname and port from the script src (like localsite.js does)
                function extractHostnameAndPort(url) {
                    let hostname;
                    let protocol = "";
                    // find & remove protocol (http, ftp, etc.) and get hostname
                    if (url.indexOf("//") > -1) {
                        protocol = url.split('//')[0] + "//"; // Retain http or https
                        hostname = protocol + url.split('/')[2];
                    } else {
                        hostname = url.split('/')[0];
                    }
                    //find & remove "?" and parameters
                    hostname = hostname.split('?')[0];
                    return hostname;
                }
                
                let hostnameAndPort = extractHostnameAndPort(widgetScript.src);
                console.log("widget-embed.js: script src hostname and port: " + hostnameAndPort);
                
                // Extract the path and find the webroot (everything before /team/js/widget-embed.js)
                const scriptPath = new URL(widgetScript.src).pathname;
                const teamIndex = scriptPath.lastIndexOf('/team/js/widget-embed.js');
                if (teamIndex !== -1) {
                    const webroot = scriptPath.substring(0, teamIndex);
                    const fullWebroot = hostnameAndPort + webroot;
                    console.log("widget-embed.js: final web_root = " + fullWebroot);
                    return fullWebroot;
                }
                
                // If path parsing fails, just return the hostname
                console.log("widget-embed.js: path parsing failed, returning hostname: " + hostnameAndPort);
                return hostnameAndPort;
            } else {
                console.log('widget-embed.js: no script src found');
            }
            
            // Fallback to empty string if detection fails
            return '';
        };
    }
    
    // Configuration - use local_app.web_root() (also accessible as widgetWebroot for backward compatibility)
    const widgetWebroot = local_app.web_root();
    console.log('widget-embed.js: Final widgetWebroot value =', widgetWebroot);
    
    // Make local_app globally available for localsite.js to use
    window.local_app = local_app;
    
    // Helper function to load script with promise
    function loadScript(src, id) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.type = 'text/javascript';
            script.src = src;
            if (id) script.id = id;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
    
    // Helper function to load CSS (non-blocking)
    function loadCSS(href, id) {
        const link = document.createElement('link');
        link.type = 'text/css';
        link.rel = 'stylesheet';
        link.href = href;
        if (id) link.id = id;
        document.head.appendChild(link);
    }
    
    // Load base.css early (non-blocking)
    loadCSS(widgetWebroot + '/localsite/css/base.css', '/localsite/css/base.css');
    
    // Load essential JS files in parallel (batch 1 - no waiting)
    const essentialScripts = [
        { src: widgetWebroot + '/localsite/js/localsite.js?showheader=true&showfooter=false' }, // No id for localsite.js
        { src: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', id: '/leaflet.js', integrity: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=', crossorigin: 'anonymous' },
        { src: widgetWebroot + '/team/js/leaflet.js', id: '/team/js/leaflet.js' },
        { src: widgetWebroot + '/team/js/common.js', id: '/team/js/common.js' }
    ];
    
    // Load all essential scripts in parallel
    const scriptPromises = essentialScripts.map(script => {
        if (script.integrity) {
            // Handle external scripts with integrity
            return new Promise((resolve, reject) => {
                const scriptEl = document.createElement('script');
                scriptEl.src = script.src;
                if (script.id) scriptEl.id = script.id;
                if (script.integrity) scriptEl.integrity = script.integrity;
                if (script.crossorigin !== undefined) scriptEl.crossOrigin = script.crossorigin;
                scriptEl.onload = resolve;
                scriptEl.onerror = reject;
                document.head.appendChild(scriptEl);
            });
        } else {
            return loadScript(script.src, script.id);
        }
    });
    
    // Load CSS files as separate non-blocking batch
    const cssFiles = [
        { href: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', id: '/leaflet.css', integrity: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=', crossorigin: 'anonymous' },
        { href: widgetWebroot + '/team/css/common.css', id: '/team/css/common.css' },
        { href: widgetWebroot + '/team/css/widget.css', id: '/team/css/widget.css' }
    ];
    
    cssFiles.forEach(css => {
        if (css.integrity) {
            // Handle external CSS with integrity
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = css.href;
            if (css.id) link.id = css.id;
            if (css.integrity) link.integrity = css.integrity;
            if (css.crossorigin !== undefined) link.crossOrigin = css.crossorigin;
            document.head.appendChild(link);
        } else {
            loadCSS(css.href, css.id);
        }
    });
    
    // Wait for essential scripts to load, then load widget.js
    Promise.all(scriptPromises).then(() => {
        console.log('Essential scripts loaded, loading widget.js');
        
        // Get parameters from current script tag
        let listParam = '';
        let sourceParam = '';
        const currentScript = document.currentScript || document.querySelector('script[src*="widget-embed.js"]');
        
        if (currentScript && currentScript.src.includes('?')) {
            const url = new URL(currentScript.src);
            if (url.searchParams.get('list')) {
                listParam = '?list=' + url.searchParams.get('list');
            }
            if (url.searchParams.get('source')) {
                sourceParam = '&source=' + url.searchParams.get('source');
            }
        }
        
        // Check if #teamwidget exists, if not create it at script location
        let teamwidgetExists = document.getElementById('teamwidget');
        if (!teamwidgetExists && currentScript) {
            console.log('Creating #teamwidget at script location');
            const teamwidgetDiv = document.createElement('div');
            teamwidgetDiv.id = 'teamwidget';
            
            // Insert the teamwidget div right after the script tag
            currentScript.parentNode.insertBefore(teamwidgetDiv, currentScript.nextSibling);
        }
        
        // Load widget.js with optional parameters
        const fullParams = listParam + sourceParam;
        return loadScript(widgetWebroot + '/team/js/widget.js' + fullParams, '/team/js/widget.js');
    }).then(() => {
        console.log('Widget.js loaded successfully');
        
        // Load non-essential print-download.js last (optional)
        loadScript(widgetWebroot + '/team/js/print-download.js', '/team/js/print-download.js')
            .catch(err => console.warn('Print-download.js failed to load (non-critical):', err));
    }).catch(err => {
        console.error('Failed to load essential scripts:', err);
    });
})();