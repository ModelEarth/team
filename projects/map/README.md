# membermap

Add a team/js/leaflet.js file used by team/projects/map/index.html to show a map using latitude and longitude values from the lists loaded into the page when #showSelect changes. Pass an object to the map containing parameter to display in popup boxes with curved corners when clicking. The map will 100% wide at the top of the page and 500px tall. 

Include background styles:

Coral Reef
Light Mode
Dark Mode
Dark Matter
OpenStreetMap
Satellite
Terrain
Voyager
Positron
Vintage
Sunset
Forest
Infrared
Emerald City
Old Map
Desert
Autumn Leaves
Monochrome
Thermal Vision
Sage
Bronze Age

Avoid backgrounds: Watercolor, Retro Gaming, Midnight, Neon, Fire, Ocean, Artic, Pastel Dreams, Matrix Code, Rainbow, Purple Haze, Lava Flow, Dream World, Glacier, Blueprint. Save the move recent background selection in the browser cache and apply when reloading page.

transparent text overlay layer at level 8 and above for backgrounds: Satellite, Infrared, Thermal Vision

Load the official Leaflet CSS and JS files before our custom script. Initialization order: The map waits for both the Leaflet library and LeafletMapManager to be available. Include proper error handling and cleanup for map container conflicts. For auto-initialization the leaflet.js file defers to the listings app for initialization.

Turn off scrollWheelZoom initially and toggle on when the map is clicked. Toggle scrollWheelZoom when clicking when scrollWheelZoom is already on.

Reduced padding: Changed from [20, 20] to [10, 10] for tighter bounds
  - Added maxZoom: Set to 15 so it will zoom closer to show markers in more
   detail

Zoom-responsive icons: Scale from 8px (zoomed out) to 32px (zoomed in)
  - Custom pin design: Blue droplet-shaped markers with white dots
  - Smooth transitions: Icons resize smoothly when zooming
  - Hover effects: Markers grow and get enhanced shadows on hover

  - Linear scaling: Icon size increases proportionally with zoom level
  - Performance optimized: Icons update efficiently on zoom events
  - Consistent design: All markers maintain the same visual style




### Connected map updates to the listings app:

- Map initializes when page renders
- Map updates when show selection changes (#showSelect)
- Map updates when search/filtering occurs
- Map updates when pagination changes

### Performance Notes

Current optimizations:
1) Marker hover highlight uses CSS class only (no `setIcon` swapping) to avoid per-hover marker rebuild.
2) Marker creation is deferred by two `requestAnimationFrame` calls so the page can become clickable sooner.

Prompts to undo:
- "Switch hover highlight back to icon swapping so the highlighted marker uses a larger icon."
- "Remove the deferred marker creation and call addMarkersFromData immediately in updateFromListingsApp."

### Key Features Implemented

- 5 background map styles: OpenStreetMap, Satellite, Terrain, Dark Mode, Light Mode
- Dynamic markers: Created from latitude/longitude data in listings
- Curved corner popups: Show listing details when markers are clicked
- Auto-coordinate detection: Supports various field names (latitude/lat/LAT, longitude/lng/lon/LON, etc.)
- Responsive design: Works on mobile and desktop
- Integration hooks: Automatically connects to existing listings filtering system
