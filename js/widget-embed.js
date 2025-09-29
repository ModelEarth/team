// Load localsite.js and supporting files for widget.js
// Optimized loading strategy: parallel JS batches, non-blocking CSS

(function() {
    // Configuration - automatically determine widgetWebroot from calling page path
    const widgetWebroot = (() => {
        // Get the current script element

        // Temp
        //alert("https://locations.pages.dev")
        //return "https://locations.pages.dev"

        const currentScript = document.currentScript || document.querySelector('script[src*="widget-embed.js"]');
        if (currentScript) {
            // Get the script source URL
            const scriptUrl = new URL(currentScript.src);
            const scriptPath = scriptUrl.pathname;
            
            // Find where 'team/js/widget-embed.js' appears in the path
            const teamIndex = scriptPath.lastIndexOf('/team/js/widget-embed.js');
            if (teamIndex !== -1) {
                // Extract the webroot path (everything before '/team/js/widget-embed.js')
                const webroot = scriptPath.substring(0, teamIndex);
                // Include domain with protocol
                console.log("domain with protocol: " + scriptUrl.protocol + '//' + scriptUrl.host + webroot);
                return scriptUrl.protocol + '//' + scriptUrl.host + webroot;
            }
        }
        
        // Fallback to empty string if detection fails
        return '';
    })();
    
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