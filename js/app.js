// =========================================================================
// 1. INITIALIZE MAP & CONTROLS
// =========================================================================

// Check if we are recovering from a print refresh
const savedCenter = sessionStorage.getItem('printRecoveryCenter');
const savedZoom = sessionStorage.getItem('printRecoveryZoom');

// Determine starting coordinates (use saved if they exist, otherwise default)
const startingCenter = savedCenter ? JSON.parse(savedCenter) : [16.8409, 96.1735];
const startingZoom = savedZoom ? parseInt(savedZoom, 10) : 12;

const map = L.map('map', {
    zoomControl: false,
    tap: false,          // <-- Changed to false (Crucial Android fix)
    dragging: true,
    preferCanvas: true   
}).setView(startingCenter, startingZoom);

// Clean up session storage so standard refreshes behave normally
if (savedCenter) {
    sessionStorage.removeItem('printRecoveryCenter');
    sessionStorage.removeItem('printRecoveryZoom');
}

L.control.zoom({ position: 'bottomright' }).addTo(map);

// =========================================================================
// NEW MAP OVERLAY LAYER (CUSTOM CONTROL)
// =========================================================================
const tourControl = L.control({ position: 'topright' }); // Positions: 'topleft', 'topright', 'bottomleft', 'bottomright'

tourControl.onAdd = function(map) {
    // 1. Create a container div for your overlay element
    const container = L.DomUtil.create('div', 'leaflet-bar custom-map-overlay');
    
    // 2. Insert your custom HTML (e.g., your Cinematic Tour button)
    container.innerHTML = `
        <button id="startTourBtn" class="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2.5 rounded-lg flex items-center gap-2 shadow-lg transition-all transform active:scale-95 text-sm">
            <i class="fas fa-play"></i> <span>Cinematic Tour</span>
        </button>
    `;

    // 3. CRUCIAL FOR MOBILE: Prevent map dragging/clicking when interacting with the button
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);

    return container;
};

// 4. Mount it onto your active map instance
tourControl.addTo(map);


// --- Put your Event Listeners right below the control mounting ---
document.body.addEventListener('click', function(e) {
    // Safely hook event delegation since the element is injected dynamically
    if (e.target.closest('#startTourBtn')) {
        runCinematicTour(); // Executes your feature logic
    }
});

// Add Location Control Button
const locateControl = L.control({ position: 'bottomright' });

locateControl.onAdd = function(map) {
    const btn = L.DomUtil.create('button', 'bg-white text-emerald-700 p-2 rounded shadow-md hover:bg-gray-50 border border-gray-200 mt-2');
    btn.innerHTML = '<i class="fas fa-location-arrow"></i>';
    btn.title = "Find My Location";
    btn.onclick = function(e) {
        e.preventDefault();
        map.locate({ setView: true, maxZoom: 20 });
    };
    return btn;
};
locateControl.addTo(map);

// Handle successful location finding
// Add these variables right above the locationfound event
let userLocMarker = null;
let userLocCircle = null;

// Handle successful location finding
map.on('locationfound', function(e) {
    const radius = e.accuracy / 2;
    
    // 1. Remove the old marker and circle if they already exist
    if (userLocMarker) {
        map.removeLayer(userLocMarker);
    }
    if (userLocCircle) {
        map.removeLayer(userLocCircle);
    }

    // 2. Create the new marker and circle, and save them to the variables
    userLocMarker = L.marker(e.latlng).addTo(map)
        .bindPopup(`You are within ${radius} meters from this point`).openPopup();
    
    userLocCircle = L.circle(e.latlng, radius, { color: '#10b981', fillOpacity: 0.2 }).addTo(map);
});

// Handle location error
map.on('locationerror', function(e) {
    alert("Location access denied or unavailable.");
});

// Base Map Switcher (Street vs Satellite)
const streetMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 22,         // The new absolute zoom limit for the user
    maxNativeZoom: 19,    // Tells Leaflet to stretch tiles after level 19
    crossOrigin: true // <-- ADD THIS
}).addTo(map);

const satelliteMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 22,         // The new absolute zoom limit for the user
    maxNativeZoom: 19,    // Tells Leaflet to stretch tiles after level 19
    crossOrigin: true // <-- Add this to allow the image exporter to read the satellite pixels
});

// NEW: Dark Mode Map Layer
const darkMap = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap contributors © CARTO',
    maxZoom: 22,
    maxNativeZoom: 19,
    crossOrigin: true
});

L.control.layers({
    "Street Map (Default)": streetMap,
    "Satellite Imagery": satelliteMap,
    "Dark Mode Map": darkMap // Adds Dark Mode option to selector
}).addTo(map);

// Configure Geoman Drawing Toolbar Options
map.pm.addControls({
    position: 'topleft',
    drawMarker: true,
    drawCircleMarker: false,
    drawPolyline: false,
    drawRectangle: true,
    drawPolygon: true,
    drawCircle: false,
    editMode: true, 
    dragMode: false,
    removalMode: true
});

// Map Search / Geocoding Control
const geocoder = L.Control.geocoder({
    defaultMarkGeocode: false,
    position: 'topright',
    placeholder: 'Search location...'
})
.on('markgeocode', function(e) {
    // When a user selects a search result, fit the map bounds to that location
    const bbox = e.geocode.bbox;
    const poly = L.polygon([
        bbox.getSouthEast(),
        bbox.getNorthEast(),
        bbox.getNorthWest(),
        bbox.getSouthWest()
    ]);
    map.fitBounds(poly.getBounds());
})
.addTo(map);

// Map Printing / PDF Export Control
L.control.browserPrint({
    position: 'topright',
    title: 'Print / Export Map to PDF',
    documentTitle: 'Melody House Real Estate Plot',
    printModes: [
        L.BrowserPrint.Mode.Portrait(),
        L.BrowserPrint.Mode.Landscape(),
        L.BrowserPrint.Mode.Auto(),
        L.BrowserPrint.Mode.Custom("A4", { title: "Select Area" }) 
    ],
    customPrintStyle: { 
        color: "red", 
        dashArray: "5, 10", 
        pane: "overlayPane" // Fallback to a standard Leaflet pane to prevent crashes
        // NOTE: pmIgnore MUST be removed. Geoman needs to attach to the box so you can resize it.
    }
}).addTo(map);

// ==========================================
// NEW: Map Image Export (PNG/JPG) Control
// ==========================================
L.simpleMapScreenshoter({
    hidden: false,           // Show the camera button on the map
    position: 'topright',    // Place it below the PDF print button
    preventDownload: false,  // Automatically trigger the file download
    mimeType: 'image/png',  // 'image/jpeg' or 'image/png'
    cropImageByInnerWH: true // Crops out the Leaflet UI elements to just show the map
}).addTo(map);

// UX Enhancement: Auto-enable Geoman editing when the print box appears
// UX Enhancement: Auto-enable Geoman editing when the print box appears
map.on('layeradd', function(e) {
    if (e.layer instanceof L.Rectangle && e.layer.options.color === 'red' && e.layer.options.dashArray === '5, 10') {
        if (e.layer.pm) {
            // Enable Geoman and explicitly allow dragging the whole box
            e.layer.pm.enable({
                draggable: true 
            });

            // ANDROID FIX: Lock map panning when touching the inside of the print box
            e.layer.on('touchstart mousedown', function() {
                map.dragging.disable();
            });
            
            // Unlock map panning when releasing the touch
            e.layer.on('touchend mouseup', function() {
                map.dragging.enable();
            });
        }
    }
});

// ANDROID FIX: Lock map panning when dragging the corner/edge dots of ANY Geoman shape
map.on('pm:markerdragstart', () => map.dragging.disable());
map.on('pm:markerdragend', () => map.dragging.enable());

// ANDROID FIX: Lock map panning when dragging entire shapes
map.on('pm:dragstart', () => map.dragging.disable());
map.on('pm:dragend', () => map.dragging.enable());

// Force map to redraw all vector layers and meshes after the print dialog closes
// Safely ensure map exists before adding the listener
// Force map to redraw all vector layers and meshes after the print dialog closes
if (typeof map !== 'undefined') {
    map.on('browser-print-end', async function(e) {
        try {
            // 1. Immediately save the exact current state of the map to localForage
            if (typeof saveMapState === 'function') {
                await saveMapState();
            }

            // === NEW: SAVE VIEWPORT TO SESSION STORAGE ===
            const currentCenter = map.getCenter();
            sessionStorage.setItem('printRecoveryCenter', JSON.stringify([currentCenter.lat, currentCenter.lng]));
            sessionStorage.setItem('printRecoveryZoom', map.getZoom());
            // =============================================

            // 2. Perform an instant hard refresh to rebuild the corrupted Canvas DOM.
            window.location.reload();
            
        } catch (error) {
            console.error("Failed to recover map after printing:", error);
        }
    });
}

// Failsafe: If the print plugin crashes, prevent it from locking the UI
map.on('browser-print-start', function() {
    // If it gets stuck for more than 2 seconds, force-remove the invisible blocking layer
    setTimeout(() => {
        const blockingOverlay = document.querySelector('.leaflet-browser-print--custom');
        if (blockingOverlay) {
            blockingOverlay.style.pointerEvents = 'none';
        }
    }, 2000);
});


// =========================================================================
// 2. STATE MANAGEMENT & SIDEBAR COLLAPSE
// =========================================================================
let landLayersArray = [];
let temporarilyDrawnLayer = null;
let editingPlotId = null; 
let meshLayersArray = []; 

// Sidebar Logic
// Sidebar Logic
const sidebar = document.getElementById('mainSidebar');
const sidebarIcon = document.getElementById('sidebarToggleIcon');
const topSidebarIcon = document.getElementById('topSidebarToggleIcon'); // <-- NEW

function toggleSidebar() {
    const isCollapsed = sidebar.style.marginLeft.includes('-');

    if (isCollapsed) {
        sidebar.style.marginLeft = '0px';
        if (sidebarIcon) sidebarIcon.classList.replace('fa-chevron-right', 'fa-chevron-left');
        if (topSidebarIcon) topSidebarIcon.classList.replace('fa-chevron-right', 'fa-chevron-left');
    } else {
        const sidebarWidth = sidebar.offsetWidth;
        sidebar.style.marginLeft = `-${sidebarWidth}px`;
        if (sidebarIcon) sidebarIcon.classList.replace('fa-chevron-left', 'fa-chevron-right');
        if (topSidebarIcon) topSidebarIcon.classList.replace('fa-chevron-left', 'fa-chevron-right');
    }

    setTimeout(() => {
        map.invalidateSize();
    }, 300);
}

// Bind the click event to both buttons
document.getElementById('sidebarToggleBtn')?.addEventListener('click', toggleSidebar);
document.getElementById('topSidebarToggleBtn')?.addEventListener('click', toggleSidebar); // <-- NEW

// Automatically collapse the sidebar as soon as the page loads
window.addEventListener('DOMContentLoaded', () => {
    const sidebarWidth = sidebar.offsetWidth;
    sidebar.style.marginLeft = `-${sidebarWidth}px`;
    if (sidebarIcon) sidebarIcon.classList.replace('fa-chevron-left', 'fa-chevron-right');
    if (topSidebarIcon) topSidebarIcon.classList.replace('fa-chevron-left', 'fa-chevron-right');
});


// Filters Collapse Toggle
document.getElementById('toggleFiltersBtn').addEventListener('click', function() {
    const content = document.getElementById('filterContent');
    const icon = document.getElementById('filterToggleIcon');
    
    content.classList.toggle('hidden');
    
    if (content.classList.contains('hidden')) {
        icon.classList.remove('fa-chevron-up');
        icon.classList.add('fa-chevron-down');
    } else {
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-up');
    }
});

// Toggle Custom Remark Text Box in Modal
document.getElementById('addRemarkBtn').addEventListener('click', function() {
    const remarkBox = document.getElementById('remarkInput');
    if (remarkBox.style.display === 'none') {
        remarkBox.style.display = 'block';
        this.innerText = '- Remove Remark';
    } else {
        remarkBox.style.display = 'none';
        remarkBox.value = ''; 
        this.innerText = '+ Add Remark';
    }
});

// =========================================================================
// HELPER: GENERATE POPUP HTML
// =========================================================================
function generatePopupHTML(plot, layer) {
    // 1. Safely get the center coordinates (Polygons use bounds, Pins/Text use direct LatLng)
    let center;
    if (typeof layer.getBounds === 'function') {
        center = layer.getBounds().getCenter();
    } else {
        center = layer.getLatLng();
    }
    
    // (Also fixing the Google Maps URL format)
    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${center.lat},${center.lng}`;

    // 2. Dynamic Status Badge Styling
    const isAvailable = (plot.status === 'Available');
    const badgeColors = isAvailable 
        ? 'bg-emerald-100 text-emerald-800 border-emerald-200' 
        : 'bg-red-100 text-red-800 border-red-200';

    // 3. Clean up the location string (ignores empty fields)
    const locationString = [plot.number, plot.quarter, plot.township].filter(Boolean).join(', ') || 'Unknown Location';

    return `
        <!-- FIX: Changed to min-w-[260px] and added pb-2 to expand the bottom edge -->
        <div class="min-w-[260px] font-sans pb-2">
            ${plot.imageBase64 
                ? `<img src="${plot.imageBase64}" class="w-full h-auto max-h-60 object-contain rounded-md mb-3 shadow-sm border border-gray-100 bg-gray-50" alt="Plot Image">` 
                : ''}
            
            <div class="flex justify-between items-start mb-3 border-b border-gray-100 pb-2 gap-2">
                <h3 class="font-bold text-lg text-gray-900 leading-tight m-0 p-0">${plot.landId || 'Unnamed Plot'}</h3>
                <span class="shrink-0 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full border ${badgeColors}">
                    ${plot.status || 'N/A'}
                </span>
            </div>

            <div class="flex flex-col gap-2 text-sm text-gray-600 mb-4">
                <div class="flex items-start gap-2">
                    <i class="fas fa-map-marker-alt mt-1 w-4 text-center text-gray-400"></i>
                    <span class="leading-snug">${locationString}</span>
                </div>
                
                <div class="flex items-center gap-2">
                    <i class="fas fa-vector-square w-4 text-center text-gray-400"></i>
                    <span><span class="font-semibold text-gray-800">${plot.areaAcres > 0 ? plot.areaAcres : '--'}</span> Acres</span>
                </div>

                <div class="flex items-center gap-2">
                    <i class="fas fa-coins w-4 text-center text-emerald-500"></i>
                    <span class="font-bold text-emerald-600">${plot.price ? plot.price + ' Lakhs' : 'Price on Request'}</span>
                </div>
            </div>

            ${plot.remark 
                ? `<div class="bg-gray-50 border border-gray-200 rounded text-xs text-gray-500 p-2 mb-3 italic">
                     <i class="fas fa-info-circle mr-1 text-gray-400"></i> ${plot.remark}
                   </div>` 
                : ''}
            
            <!-- FIX: Added mb-1 to guarantee space between the button and the popup arrow -->
            <a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer" 
               class="flex items-center justify-center w-full bg-blue-600 hover:bg-blue-700 !text-white transition-colors text-sm font-semibold py-2 px-4 rounded shadow-sm hover:shadow outline-none mb-1">
                <i class="fas fa-directions mr-2 text-white"></i> Get Directions
            </a>
        </div>
    `;
}

// =========================================================================
// CUSTOM PIN ICON & COLOR SELECTOR HANDLERS
// =========================================================================
document.querySelectorAll('.icon-choice').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.icon-choice').forEach(b => b.classList.remove('border-emerald-500', 'bg-emerald-50'));
        this.classList.add('border-emerald-500', 'bg-emerald-50');
        document.getElementById('selectedPinIcon').value = this.dataset.icon;
    });
});

document.querySelectorAll('.color-choice').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.color-choice').forEach(b => b.classList.remove('ring-2', 'ring-offset-2', 'ring-emerald-500'));
        this.classList.add('ring-2', 'ring-offset-2', 'ring-emerald-500');
        document.getElementById('selectedPinColor').value = this.dataset.color;
    });
});

// =========================================================================
// 3. DRAWING & VECTOR PLOT MANAGEMENT
// =========================================================================
let currentLayerType = 'Polygon'; // 'Polygon' | 'Pin' | 'Text'

map.on('pm:create', (e) => {
    temporarilyDrawnLayer = e.layer; 
    temporarilyDrawnLayer._pmShape = e.shape;
    editingPlotId = null; 
    
    document.getElementById('metaForm').reset(); 
    document.getElementById('remarkInput').style.display = 'none';
    document.getElementById('addRemarkBtn').innerText = '+ Add Remark';

    // Identify current layer type
    if (e.shape === 'Marker') {
        currentLayerType = 'Pin';
    } else if (e.shape === 'Text') {
        currentLayerType = 'Text';
        if (e.layer.options && e.layer.options.text) {
            // FIX: Route the typed text to our new box, NOT the landIdInput
            document.getElementById('textContentInput').value = e.layer.options.text;
        }
    } else {
        currentLayerType = 'Polygon';
    }

    // Show or hide the custom Pin styling UI section
    const pinSection = document.getElementById('pinIconSection');
    if (pinSection) {
        if (currentLayerType === 'Pin') {
            pinSection.classList.remove('hidden');
        } else {
            pinSection.classList.add('hidden');
        }
    }


    // Toggle the visibility of the Icon Picker based on the layer type
// Toggle the visibility of styling containers based on the active layer type
    const markerStyles = document.getElementById('markerStylesContainer');
    const textStyles = document.getElementById('textStylesContainer');

    if (markerStyles) {
        if (currentLayerType === 'Pin' || currentLayerType === 'Marker') {
            markerStyles.classList.remove('hidden');
        } else {
            markerStyles.classList.add('hidden');
        }
    }

    if (textStyles) {
        if (currentLayerType === 'Text') {
            textStyles.classList.remove('hidden');
        } else {
            textStyles.classList.add('hidden');
        }
    }


    document.getElementById('metaModal').style.display = 'flex';
});

// SINGLE, SAFE META-FORM SUBMIT LISTENER
document.getElementById('metaForm').addEventListener('submit', (e) => {
    e.preventDefault();

    let areaSqMeters = 0;
    const geoJson = temporarilyDrawnLayer.toGeoJSON ? temporarilyDrawnLayer.toGeoJSON() : null;

    if (geoJson && geoJson.geometry && (geoJson.geometry.type === 'Polygon' || geoJson.geometry.type === 'MultiPolygon')) {
        areaSqMeters = turf.area(geoJson);
    }

    const areaSqFt = (areaSqMeters * 10.7639).toFixed(2);
    const areaAcres = (areaSqMeters / 4046.86).toFixed(4);

    const shapeType = temporarilyDrawnLayer._pmShape || (temporarilyDrawnLayer.pm ? temporarilyDrawnLayer.pm._shape : currentLayerType);
    
    // FIX: Read text values directly from your user text input box instead of Geoman options
    // FIX: Read text values directly from your new dedicated text input box
    // FIX: Read text values directly from your new dedicated text input box
    const textContent = currentLayerType === 'Text' 
        ? document.getElementById('textContentInput').value 
        : null;

    const pinIconEl = document.getElementById('selectedPinIcon');
    const pinColorEl = document.getElementById('selectedPinColor');
    const colorInput = document.getElementById('colorInput').value;

    const pinConfig = currentLayerType === 'Pin' ? {
        icon: pinIconEl ? pinIconEl.value : 'fa-map-marker-alt',
        color: pinColorEl ? pinColorEl.value : colorInput
    } : null;

    // Capture Text Styles safely from your newly configured text block
    const textConfig = currentLayerType === 'Text' ? {
        color: document.getElementById('selectedTextColor') ? document.getElementById('selectedTextColor').value : '#0f172a',
        size: document.getElementById('selectedTextSize') ? document.getElementById('selectedTextSize').value : '16px'
    } : null;

    const metadata = {
        id: editingPlotId ? editingPlotId : Date.now(),
        landId: document.getElementById('landIdInput').value,
        price: document.getElementById('priceInput').value,
        status: document.getElementById('statusInput').value,
        color: colorInput, 
        division: document.getElementById('divisionInput').value,
        township: document.getElementById('townshipInput').value,
        quarter: document.getElementById('quarterInput').value,
        number: document.getElementById('numberInput').value,
        remark: document.getElementById('remarkInput').value,
        imageBase64: document.getElementById('plotImageBase64').value,
        areaSqFt: areaSqFt,
        areaAcres: areaAcres,
        shapeType: shapeType,
        textStyle: textConfig,
        textContent: textContent,
        type: currentLayerType,
        pin: pinConfig,
        layerRef: temporarilyDrawnLayer
    };

    // Apply Visual Styling Changes Symmetrically 
    if (currentLayerType === 'Pin' && pinConfig) {
        const iconHtml = `<div class="relative flex items-center justify-center" style="color: ${pinConfig.color}; filter: drop-shadow(0px 2px 3px rgba(0,0,0,0.4));">
                            <i class="fas ${pinConfig.icon} text-2xl"></i>
                          </div>`;
        temporarilyDrawnLayer.setIcon(L.divIcon({
            html: iconHtml,
            className: 'custom-map-pin-icon',
            iconSize: [30, 30],
            iconAnchor: [15, 30]
        }));
        } else if (currentLayerType === 'Text' && textConfig && textContent) {
            // Re-render text configurations perfectly on edits
            temporarilyDrawnLayer.setIcon(L.divIcon({
                className: 'custom-map-text-label',
                html: `<div style="color: ${textConfig.color}; font-size: ${textConfig.size}; font-weight: bold; white-space: nowrap; text-shadow: 1px 1px 2px rgba(255,255,255,0.9), -1px -1px 2px rgba(255,255,255,0.9);">${textContent}</div>`,
                iconSize: [0, 0] // Changed from null to [0, 0]
            }));
        } else {
        colorCodeLayer(temporarilyDrawnLayer, metadata.color);
    }

    temporarilyDrawnLayer.bindPopup(generatePopupHTML(metadata, temporarilyDrawnLayer));

    if (editingPlotId) {
        const index = landLayersArray.findIndex(p => p.id === editingPlotId);
        if (index !== -1) landLayersArray[index] = metadata;
    } else {
        landLayersArray.push(metadata);
    }
    
    updateTownshipDropdown();
    renderSidebarList();
    if (typeof saveMapState === "function") saveMapState();
    closeModal(); 
});

map.on('pm:remove', (e) => {
    const deletedLayer = e.layer;
    const index = landLayersArray.findIndex(plot => plot.layerRef === deletedLayer);
    
    if (index !== -1) {
        landLayersArray.splice(index, 1);
        updateTownshipDropdown();
        renderSidebarList();
        if (typeof saveMapState === "function") saveMapState();
    }

    // CRITICAL FIX: Force Leaflet to unlock map dragging after layer destruction
    setTimeout(() => {
        if (!map.dragging.enabled()) {
            map.dragging.enable();
        }
    }, 50);
});

// Ensure map dragging restores when exiting Removal Mode or Edit Mode
map.on('pm:globalremovalmodetoggled', (e) => {
    if (!e.enabled && !map.dragging.enabled()) {
        map.dragging.enable();
    }
});

map.on('pm:globaleditmodetoggled', (e) => {
    if (!e.enabled && !map.dragging.enabled()) {
        map.dragging.enable();
    }
});

// CRITICAL FIX: Ensure double-clicking and editing text updates the save state AND keeps format
map.on('pm:textchange', (e) => {
    const plotIndex = landLayersArray.findIndex(p => p.layerRef === e.layer);
    
    if (plotIndex !== -1) {
        const plot = landLayersArray[plotIndex];
        plot.textContent = e.text;
        
        // Geoman wipes the custom divIcon when edited natively. We must rebuild it:
        const tColor = plot.textStyle?.color || '#0f172a';
        const tSize = plot.textStyle?.size || '16px';
        
        setTimeout(() => {
            e.layer.setIcon(L.divIcon({
                className: 'custom-map-text-label',
                html: `<div style="color: ${tColor}; font-size: ${tSize}; font-weight: bold; white-space: nowrap; text-shadow: 1px 1px 2px rgba(255,255,255,0.9), -1px -1px 2px rgba(255,255,255,0.9);">${e.text}</div>`,
                iconSize: [0, 0]
            }));
            
            if (typeof saveMapState === "function") saveMapState();
        }, 10);
    }
});

// Automatically save state whenever any layer is edited, cut, or moved
map.on('pm:edit', () => {
    if (typeof saveMapState === "function") saveMapState();
});

map.on('pm:update', () => {
    if (typeof saveMapState === "function") saveMapState();
});

map.on('pm:dragend', () => {
    if (typeof saveMapState === "function") saveMapState();
});

// Automatically handle polygon slicing and update references
map.on('pm:cut', (e) => {
    const originalLayer = e.originalLayer;
    const newCutLayer = e.layer;

    // 1. Find the existing plot in our array that matches the old layer
    const plotIndex = landLayersArray.findIndex(p => p.layerRef === originalLayer);
    
    if (plotIndex !== -1) {
        const plot = landLayersArray[plotIndex];

        // 2. Recalculate the new area from the cut geometry
        let areaSqMeters = 0;
        const geoJson = newCutLayer.toGeoJSON();
        if (geoJson.geometry.type === 'Polygon' || geoJson.geometry.type === 'MultiPolygon') {
            areaSqMeters = turf.area(geoJson);
        }
        plot.areaSqFt = (areaSqMeters * 10.7639).toFixed(2);
        plot.areaAcres = (areaSqMeters / 4046.86).toFixed(4);

        // 3. SWAP THE REFERENCE: Point the array to the new cut layer!
        plot.layerRef = newCutLayer;

        // 4. Re-apply visual styling and popups to the brand-new cut layer
        if (newCutLayer.setStyle) {
            newCutLayer.setStyle({ 
                color: plot.color || '#10b981', 
                fillColor: plot.color || '#10b981', 
                fillOpacity: 0.5 
            });
        }

        newCutLayer.bindPopup(generatePopupHTML(plot, newCutLayer));

        // 5. Update the sidebar list and commit the new state to localForage
        renderSidebarList();
        if (typeof saveMapState === "function") saveMapState();
    }
});

function colorCodeLayer(layer, customColor) {
    if (layer.setStyle) {
        layer.setStyle({ 
            color: customColor, 
            fillColor: customColor, 
            fillOpacity: 0.5 
        });
    }
}

// REPLACE your current plotImageInput listener with this:
document.getElementById('plotImageInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            // Set maximum dimensions for the saved image
            const MAX_WIDTH = 800;
            const MAX_HEIGHT = 800;
            let width = img.width;
            let height = img.height;

            // Calculate new dimensions while maintaining aspect ratio
            if (width > height) {
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height;
                    height = MAX_HEIGHT;
                }
            }

            // Draw to canvas for compression
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Compress to JPEG at 70% quality (drastically reduces Base64 string size)
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
            document.getElementById('plotImageBase64').value = compressedBase64;
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
});

function openEditModal(id) {
    const plot = landLayersArray.find(p => p.id === id);
    if (!plot) return;

    editingPlotId = id; 
    temporarilyDrawnLayer = plot.layerRef; 

    // Synchronize global layer type state for the editor path
    if (plot.type === 'Pin' || plot.shapeType === 'Marker') {
        currentLayerType = 'Pin';
    } else if (plot.shapeType === 'Text' || plot.textContent) {
        currentLayerType = 'Text';
    } else {
        currentLayerType = 'Polygon';
    }

    // Populate standard textual fields
    document.getElementById('landIdInput').value = plot.landId || '';
    document.getElementById('priceInput').value = plot.price || '';
    document.getElementById('statusInput').value = plot.status || 'Available';
    document.getElementById('colorInput').value = plot.color || '#10b981'; 
    document.getElementById('divisionInput').value = plot.division || '';
    document.getElementById('townshipInput').value = plot.township || '';
    document.getElementById('quarterInput').value = plot.quarter || '';
    document.getElementById('numberInput').value = plot.number || '';

    // Handle styling panel view visibility toggles
    const markerStyles = document.getElementById('markerStylesContainer');
    const textStyles = document.getElementById('textStylesContainer');
    
    if (markerStyles) markerStyles.classList.add('hidden');
    if (textStyles) textStyles.classList.add('hidden');

    if (currentLayerType === 'Pin') {
        if (markerStyles) {
            markerStyles.classList.remove('hidden');
            if (plot.pin) {
                document.getElementById('selectedPinIcon').value = plot.pin.icon || 'fa-map-marker-alt';
                document.getElementById('selectedPinColor').value = plot.pin.color || plot.color || '#10b981';
            }
        }
            } else if (currentLayerType === 'Text') {
                    if (textStyles) {
                        textStyles.classList.remove('hidden');
                        
                        // FIX: Load the saved visual text into the new editor box
                        document.getElementById('textContentInput').value = plot.textContent || '';
                        
                        if (plot.textStyle) {
                            document.getElementById('selectedTextColor').value = plot.textStyle.color || '#0f172a';
                            document.getElementById('selectedTextSize').value = plot.textStyle.size || '16px';
                        }
                    }
                }

    // Load existing image string if available
    const imageBase64El = document.getElementById('plotImageBase64');
    const imageInputEl = document.getElementById('plotImageInput');
    if (imageBase64El) imageBase64El.value = plot.imageBase64 || '';
    if (imageInputEl) imageInputEl.value = ''; 

    // Handle remarks input section display
    const remarkInput = document.getElementById('remarkInput');
    const addRemarkBtn = document.getElementById('addRemarkBtn');
    if (remarkInput && addRemarkBtn) {
        if (plot.remark) {
            remarkInput.value = plot.remark;
            remarkInput.style.display = 'block';
            addRemarkBtn.innerText = '- Remove Remark';
        } else {
            remarkInput.value = '';
            remarkInput.style.display = 'none';
            addRemarkBtn.innerText = '+ Add Remark';
        }
    }

    // Make the edit modal visible
    const metaModal = document.getElementById('metaModal');
    if (metaModal) {
        metaModal.style.display = 'flex';
    }
}

function renderSidebarList() {
    const listContainer = document.getElementById('propertyList');
    const filterStatus = document.getElementById('statusFilter').value;
    const filterTownship = document.getElementById('townshipFilter').value; 
    const filterQuarter = document.getElementById('quarterFilter').value;   
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    
    listContainer.innerHTML = ''; 

    landLayersArray.forEach(plot => {
        const matchesStatus = (filterStatus === 'all' || plot.status === filterStatus);
        const matchesTownship = (filterTownship === 'all' || plot.township === filterTownship); 
        const matchesQuarter = (filterQuarter === 'all' || plot.quarter === filterQuarter);   
        
        const searchString = `${plot.landId} ${plot.township} ${plot.quarter}`.toLowerCase();
        const matchesSearch = searchString.includes(searchTerm);

        if (!matchesStatus || !matchesSearch || !matchesTownship || !matchesQuarter) {
            map.removeLayer(plot.layerRef);
            return;
        }
        
        plot.layerRef.addTo(map);

        const item = document.createElement('div');
        item.setAttribute('data-plot-id', plot.id); // <-- ADD THIS LINE HERE
        item.className = `bg-white p-4 mb-3 rounded-lg border shadow-sm hover:shadow-md cursor-pointer transition-shadow border-l-4 ${plot.status === 'Available' ? 'border-l-emerald-500 border-gray-200' : 'border-l-gray-400 border-gray-200'}`;
        
        item.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <span class="font-bold text-base text-gray-800">${plot.landId}</span>
                <span class="text-xs px-2 py-1 rounded-full font-medium ${plot.status === 'Available' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'}">
                    ${plot.status}
                </span>
            </div>
            <div class="text-xs text-gray-500 mb-3 flex items-center">
                <i class="fas fa-map-marker-alt mr-2 text-gray-400"></i>
                ${plot.number ? plot.number + ', ' : ''}${plot.quarter ? plot.quarter + ', ' : ''}${plot.township}
            </div>
            <div class="flex justify-between items-center pt-2 border-t border-gray-100">
                <span class="font-bold text-emerald-700 text-sm">${plot.price} Lakhs</span>
                <button class="edit-btn text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 hover:bg-blue-50 rounded transition-colors">
                    <i class="fas fa-edit mr-1"></i>Edit
                </button>
            </div>
        `;
        
            item.addEventListener('click', (e) => {
                if (e.target.closest('.edit-btn')) {
                    openEditModal(plot.id);
                } else {
                    // Use the cinematic flight instead of instant snapping
                    flyToPlotCinematically(plot);
                }
            });

        listContainer.appendChild(item);
    });

// REPLACE the bottom of renderSidebarList() with this:
    if (landLayersArray.length === 0) {
        // State 1: No properties exist on the map at all
        listContainer.innerHTML = `
            <div class="text-center p-5 text-gray-400 text-sm mt-10">
                <i class="fas fa-draw-polygon text-3xl mb-3 text-gray-300 block"></i>
                Draw a plot on the map to begin.
            </div>`;
    } else if (listContainer.innerHTML === '') {
        // State 2: Properties exist, but filters hid all of them
        listContainer.innerHTML = `
            <div class="text-center p-5 text-gray-400 text-sm mt-10">
                No properties match your current filters.
            </div>`;
    }
    
    updateHeatmapData();
} // <-- End of renderSidebarList function

// =========================================================================
// SIDEBAR SELECTION HIGHLIGHT LOGIC
// =========================================================================

/**
 * Highlights a property item in the sidebar and scrolls it into view.
 * @param {number|string} plotId - Unique ID of the property plot
 */
function highlightSidebarItem(plotId) {
    // 1. Remove the highlight styling from all sidebar items and reset them back to white
    document.querySelectorAll('#propertyList [data-plot-id]').forEach(el => {
        el.classList.remove('bg-emerald-50', 'border-emerald-500', 'ring-1', 'ring-emerald-500');
        el.classList.add('bg-white');
    });

    // 2. Locate the active item in the sidebar
    const targetItem = document.querySelector(`#propertyList [data-plot-id="${plotId}"]`);
    if (targetItem) {
        // 3. Apply the eye-catching emerald tint and accent border ring
        targetItem.classList.remove('bg-white');
        targetItem.classList.add('bg-emerald-50', 'border-emerald-500', 'ring-1', 'ring-emerald-500');
        
        // 4. Smoothly scroll the sidebar to center onto the highlighted item
        targetItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// Global hook: Catch whenever a popup is opened anywhere on the map
map.on('popupopen', (e) => {
    if (e.popup && e.popup._source) {
        // Match the opened map layer reference to our internal data registry array
        const plot = landLayersArray.find(p => p.layerRef === e.popup._source);
        if (plot) {
            highlightSidebarItem(plot.id);
        }
    }
});

function updateTownshipDropdown() {
    const townshipFilter = document.getElementById('townshipFilter');
    const currentSelection = townshipFilter.value;
    const townships = [...new Set(landLayersArray.map(p => p.township).filter(Boolean))].sort();
    
    townshipFilter.innerHTML = '<option value="all">All Townships</option>';
    townships.forEach(town => {
        townshipFilter.innerHTML += `<option value="${town}">${town}</option>`;
    });
    
    townshipFilter.value = townships.includes(currentSelection) ? currentSelection : 'all';
    updateQuarterDropdown();
}

function updateQuarterDropdown() {
    const townshipFilter = document.getElementById('townshipFilter').value;
    const quarterFilter = document.getElementById('quarterFilter');
    const currentSelection = quarterFilter.value;
    
    let eligiblePlots = landLayersArray;
    if (townshipFilter !== 'all') {
        eligiblePlots = landLayersArray.filter(p => p.township === townshipFilter);
    }
    
    const quarters = [...new Set(eligiblePlots.map(p => p.quarter).filter(Boolean))].sort();
    
    quarterFilter.innerHTML = '<option value="all">All Quarters</option>';
    quarters.forEach(qtr => {
        quarterFilter.innerHTML += `<option value="${qtr}">${qtr}</option>`;
    });
    
    quarterFilter.value = quarters.includes(currentSelection) ? currentSelection : 'all';
}

function closeModal() {
    document.getElementById('metaModal').style.display = 'none';
    document.getElementById('metaForm').reset();
    document.getElementById('remarkInput').style.display = 'none';
    document.getElementById('addRemarkBtn').innerText = '+ Add Remark';
    document.getElementById('plotImageBase64').value = ''; // Clear hidden image data
    document.getElementById('plotImageInput').value = ''; // Clear file input UI
    editingPlotId = null;
    temporarilyDrawnLayer = null;

    // CRITICAL FIX: Force-restore map dragging capabilities
    if (map && map.dragging) {
        map.dragging.enable();
    }
}

document.getElementById('cancelBtn').addEventListener('click', () => {
    if (!editingPlotId && temporarilyDrawnLayer) {
        map.removeLayer(temporarilyDrawnLayer); 
    }
    closeModal();
});

// Filter Listeners
document.getElementById('searchInput').addEventListener('input', renderSidebarList);
document.getElementById('statusFilter').addEventListener('change', renderSidebarList);
document.getElementById('townshipFilter').addEventListener('change', () => {
    updateQuarterDropdown();
    renderSidebarList();
});
document.getElementById('quarterFilter').addEventListener('change', renderSidebarList);

// =========================================================================
// PRICE RANGE HIGHLIGHT LOGIC
// =========================================================================
const highlightPriceBtn = document.getElementById('highlightPriceBtn');
const clearHighlightBtn = document.getElementById('clearHighlightBtn');
const minPriceInput = document.getElementById('minPrice');
const maxPriceInput = document.getElementById('maxPrice');

highlightPriceBtn.addEventListener('click', () => {
    // 1. Get the values. If left blank, default to 0 and Infinity
    const min = parseFloat(minPriceInput.value) || 0;
    const max = parseFloat(maxPriceInput.value) || Infinity;

    if (min === 0 && max === Infinity) return; // Do nothing if both are blank

    // 2. Loop through all saved plots on the map
    landLayersArray.forEach(plot => {
        const price = parseFloat(plot.price) || 0;
        
        if (price >= min && price <= max) {
            // IN RANGE: Highlight brightly
            plot.layerRef.setStyle({
                color: '#f59e0b',       // Amber/Gold border
                weight: 4,              // Thicker border
                fillColor: '#fcd34d',   // Yellow fill
                fillOpacity: 0.8        // Less transparent
            });
            // Bring highlighted plots to the front so they aren't hidden under gray ones
                if (typeof plot.layerRef.bringToFront === 'function') {
                    plot.layerRef.bringToFront();
                }
        } else {
            // OUT OF RANGE: Dim and gray out
            plot.layerRef.setStyle({
                color: '#9ca3af',       // Gray border
                weight: 1,              // Thin border
                fillColor: '#e5e7eb',   // Light gray fill
                fillOpacity: 0.2        // Very transparent
            });
        }
    });

    // Show the "Clear" button so the user can reset the map
    clearHighlightBtn.classList.remove('hidden');
});

clearHighlightBtn.addEventListener('click', () => {
    // 1. Clear the input fields
    minPriceInput.value = '';
    maxPriceInput.value = '';
    
    // 2. Reset all plots back to their specific custom colors
    landLayersArray.forEach(plot => {
        if (plot.layerRef.setStyle) {
            plot.layerRef.setStyle({
                color: plot.color || '#10b981',       // Use saved color, fallback to emerald
                weight: 3,
                fillColor: plot.color || '#10b981',   // Use saved color, fallback to emerald
                fillOpacity: 0.5                      // Your default fill opacity
            });
        }
    });

    // Hide the "Clear" button again
    clearHighlightBtn.classList.add('hidden');
});

// =========================================================================
// 3. HEATMAP LOGIC
// =========================================================================

// 1. Tighter visuals and a richer color gradient
let heatLayer = L.heatLayer([], {
    radius: 20,      // Smaller radius keeps hotspots from bleeding too far
    blur: 12,        // Lower blur makes the colors much crisper and distinct
    maxZoom: 16,     // Helps the heatmap aggregate better when zoomed out
    gradient: { 
        0.1: 'blue', 
        0.3: 'cyan', 
        0.5: 'lime',  // Added lime for mid-tier prices
        0.7: 'yellow', 
        1.0: 'red' 
    }
});
let isHeatmapActive = false;

document.getElementById('toggleHeatmapBtn').addEventListener('click', function() {
    isHeatmapActive = !isHeatmapActive;
    if (isHeatmapActive) {
        this.classList.replace('bg-orange-100', 'bg-orange-600');
        this.classList.replace('text-orange-700', 'text-white');
        map.addLayer(heatLayer);
        updateHeatmapData();
    } else {
        this.classList.replace('bg-orange-600', 'bg-orange-100');
        this.classList.replace('text-white', 'text-orange-700');
        map.removeLayer(heatLayer);
    }
});

function updateHeatmapData() {
    if (!isHeatmapActive) return;
    
    // 2. Sort prices to find a realistic maximum, ignoring massive outliers
    const prices = landLayersArray
        .map(p => Number(p.price) || 0)
        .filter(price => price > 0)
        .sort((a, b) => a - b);
    
    // Use the 90th percentile price as the "max" instead of the absolute max.
    // This prevents one ultra-expensive plot from making everything else invisible.
    let realisticMaxPrice = 1;
    if (prices.length > 0) {
        const percentileIndex = Math.floor(prices.length * 0.90);
        realisticMaxPrice = prices[percentileIndex] || prices[prices.length - 1];
    }
    
    const heatPoints = [];
    
    const filterStatus = document.getElementById('statusFilter').value;
    const filterTownship = document.getElementById('townshipFilter').value; 
    const filterQuarter = document.getElementById('quarterFilter').value;   

    landLayersArray.forEach(plot => {
        const matchesStatus = (filterStatus === 'all' || plot.status === filterStatus);
        const matchesTownship = (filterTownship === 'all' || plot.township === filterTownship); 
        const matchesQuarter = (filterQuarter === 'all' || plot.quarter === filterQuarter);   
        
        if (matchesStatus && matchesTownship && matchesQuarter) {
            const bounds = getSafeLayerBounds(plot.layerRef);
            const center = bounds.getCenter();
            const price = Number(plot.price) || 0;
            
            // 3. Normalize intensity and ensure a minimum visibility of 0.25 (blue)
            let intensity = price / realisticMaxPrice;
            
            // Cap at 1.0 (red) for properties above the 90th percentile
            if (intensity > 1.0) intensity = 1.0; 
            
            // Boost the minimum visibility so cheap plots still show up as clear blue dots
            if (price > 0 && intensity < 0.25) intensity = 0.25;

            heatPoints.push([center.lat, center.lng, intensity]);
        }
    });

    heatLayer.setLatLngs(heatPoints);
}

// =========================================================================
// 4. MULTI-GRID MESHING OVERLAY ENGINE (UPGRADED TO WEBGL)
// =========================================================================
let activeGridMeshLayer = null;
let meshControlMarkers = [];

L.GridMeshLayer = L.Layer.extend({
    initialize: function (imgUrl, bounds, gridCols, gridRows, options) {
        L.setOptions(this, options);
        this._imgUrl = imgUrl;
        this._cols = gridCols || 4; 
        this._rows = gridRows || 4; 
        this._opacity = options && options.opacity ? options.opacity : 0.75;
        this._vertices = []; 
        this._textureLoaded = false;
        this._drawPending = false; // OPTIMIZATION: Track pending frames
    },

    onAdd: function (map) {
        this._map = map;
        this._canvas = L.DomUtil.create('canvas', 'leaflet-zoom-animated custom-webgl-overlay');
        this._canvas.style.pointerEvents = 'none';
        
        this._gl = this._canvas.getContext('webgl', { premultipliedAlpha: false }) || 
                   this._canvas.getContext('experimental-webgl');

        map.getPanes().overlayPane.appendChild(this._canvas);
        
        this._initWebGL(this._gl);

        this._img = new Image();
        this._img.crossOrigin = "anonymous";
        this._img.onload = () => {
            this._texture = this._loadTexture(this._gl, this._img);
            this._textureLoaded = true;
            this._initGridVertices();
            this.scheduleDraw(); // Use new rAF method
        };
        this._img.src = this._imgUrl;

        map.on('zoom reset viewreset moveend', this._reset, this);
        this._reset();
    },

    onRemove: function (map) {
        L.DomUtil.remove(this._canvas);
        map.off('zoom reset viewreset moveend', this._reset, this);
    },

    // --- OPTIMIZATION 1: Screen Refresh Sync ---
    scheduleDraw: function() {
        if (!this._drawPending) {
            this._drawPending = true;
            requestAnimationFrame(() => {
                this.draw();
                this._drawPending = false;
            });
        }
    },

    _initWebGL: function(gl) {
        const vsSource = `
            attribute vec2 a_position;
            attribute vec2 a_texCoord;
            uniform vec2 u_resolution;
            varying vec2 v_texCoord;
            void main() {
                vec2 zeroToOne = a_position / u_resolution;
                vec2 zeroToTwo = zeroToOne * 2.0;
                vec2 clipSpace = zeroToTwo - 1.0;
                gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
                v_texCoord = a_texCoord;
            }
        `;

        const fsSource = `
            precision mediump float;
            uniform sampler2D u_image;
            uniform float u_opacity;
            varying vec2 v_texCoord;
            void main() {
                vec4 color = texture2D(u_image, v_texCoord);
                gl_FragColor = vec4(color.rgb, color.a * u_opacity);
            }
        `;

        const vertexShader = this._createShader(gl, gl.VERTEX_SHADER, vsSource);
        const fragmentShader = this._createShader(gl, gl.FRAGMENT_SHADER, fsSource);
        this._program = this._createProgram(gl, vertexShader, fragmentShader);
        
        this._positionBuffer = gl.createBuffer();
        this._texCoordBuffer = gl.createBuffer(); // This will now hold static data

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    },

    // ... (Keep _createShader, _createProgram, _loadTexture exactly the same) ...
    _createShader: function(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        return shader;
    },
    _createProgram: function(gl, vertexShader, fragmentShader) {
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        return program;
    },
    _loadTexture: function(gl, image) {
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        return texture;
    },

    // --- Interaction Math ---
    setOpacity: function (opacity) {
        this._opacity = opacity;
        this.scheduleDraw();
    },

    moveBy: function (dLat, dLng) {
        this._vertices.forEach(vert => {
            vert.latlng = L.latLng(vert.latlng.lat + dLat, vert.latlng.lng + dLng);
        });
        this._syncMarkers();
        this.scheduleDraw();
    },

    scaleBy: function (scaleFactor) {
        if (scaleFactor <= 0) return;
        const center = this._getCentroid();
        this._vertices.forEach(vert => {
            const dLat = vert.latlng.lat - center.lat;
            const dLng = vert.latlng.lng - center.lng;
            vert.latlng = L.latLng(center.lat + (dLat * scaleFactor), center.lng + (dLng * scaleFactor));
        });
        this._syncMarkers();
        this.scheduleDraw();
    },

    rotateBy: function (angleDegrees) {
        const rad = angleDegrees * (Math.PI / 180);
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const center = this._getCentroid();
        this._vertices.forEach(vert => {
            const x = (vert.latlng.lng - center.lng) * cos - (vert.latlng.lat - center.lat) * sin;
            const y = (vert.latlng.lng - center.lng) * sin + (vert.latlng.lat - center.lat) * cos;
            vert.latlng = L.latLng(center.lat + y, center.lng + x);
        });
        this._syncMarkers();
        this.scheduleDraw();
    },

    setResolution: function (newResolution) {
        if (!this._vertices || this._vertices.length === 0) {
            this._cols = newResolution;
            this._rows = newResolution;
            this._initGridVertices();
            return;
        }

        // ... (Keep the whole bilinear interpolation block exactly as it was) ...
        const oldCols = this._cols;
        const oldRows = this._rows;
        const oldVertices = [...this._vertices];
        const newVertices = [];
        const getOldVert = (col, row) => {
            const safeCol = Math.max(0, Math.min(col, oldCols));
            const safeRow = Math.max(0, Math.min(row, oldRows));
            return oldVertices[safeRow * (oldCols + 1) + safeCol];
        };

        for (let r = 0; r <= newResolution; r++) {
            const v = r / newResolution; 
            const oldRowExact = v * oldRows;
            const r0 = Math.floor(oldRowExact);
            const r1 = Math.min(r0 + 1, oldRows);
            const fr = oldRowExact - r0;

            for (let c = 0; c <= newResolution; c++) {
                const u = c / newResolution; 
                const oldColExact = u * oldCols;
                const c0 = Math.floor(oldColExact);
                const c1 = Math.min(c0 + 1, oldCols);
                const fc = oldColExact - c0;

                const v00 = getOldVert(c0, r0), v01 = getOldVert(c1, r0);
                const v10 = getOldVert(c0, r1), v11 = getOldVert(c1, r1);
                if (!v00 || !v01 || !v10 || !v11) continue;

                const latTop = v00.latlng.lat * (1 - fc) + v01.latlng.lat * fc;
                const latBot = v10.latlng.lat * (1 - fc) + v11.latlng.lat * fc;
                const interpLat = latTop * (1 - fr) + latBot * fr;

                const lngTop = v00.latlng.lng * (1 - fc) + v01.latlng.lng * fc;
                const lngBot = v10.latlng.lng * (1 - fc) + v11.latlng.lng * fc;
                const interpLng = lngTop * (1 - fr) + lngBot * fr;

                newVertices.push({ latlng: L.latLng(interpLat, interpLng), u: u, v: v });
            }
        }

        this._cols = newResolution;
        this._rows = newResolution;
        this._vertices = newVertices;
        
        // Re-allocate our optimized buffers for the new grid size
        this._allocateBuffers();
        this.scheduleDraw();
    },

    updateVertex: function (index, latlng) {
        if (this._vertices[index]) {
            this._vertices[index].latlng = latlng;
            this.scheduleDraw();
        }
    },

    _getCentroid: function () {
        let sumLat = 0, sumLng = 0;
        this._vertices.forEach(v => { sumLat += v.latlng.lat; sumLng += v.latlng.lng; });
        return L.latLng(sumLat / this._vertices.length, sumLng / this._vertices.length);
    },

    _syncMarkers: function () {
        if (!meshControlMarkers || meshControlMarkers.length === 0) return;
        this._vertices.forEach((vert, idx) => {
            if (meshControlMarkers[idx]) {
                meshControlMarkers[idx].setLatLng(vert.latlng);
            }
        });
    },

    _initGridVertices: function () {
        if (this._vertices.length > 0) return;
        const center = this._map.getCenter();
        const aspect = (this._img.naturalWidth || 1) / (this._img.naturalHeight || 1);
        const halfLat = 0.004;
        const halfLng = halfLat * aspect;

        for (let r = 0; r <= this._rows; r++) {
            for (let c = 0; c <= this._cols; c++) {
                const u = c / this._cols;
                const v = r / this._rows;
                const lat = center.lat + halfLat - (v * halfLat * 2);
                const lng = center.lng - halfLng + (u * halfLng * 2);
                this._vertices.push({ latlng: L.latLng(lat, lng), u: u, v: v });
            }
        }
        
        this._allocateBuffers();
        this.fire('meshReady');
    },

// --- OPTIMIZATION 2: Pre-allocate Memory for a Subdivided Mesh (CORRECTED) ---
    _allocateBuffers: function() {
        this._subdivisions = 6; 
        
        const renderCols = this._cols * this._subdivisions;
        const renderRows = this._rows * this._subdivisions;
        
        const numQuads = renderCols * renderRows;
        const numVertices = numQuads * 6; // 2 triangles per sub-quad
        
        // Pre-allocate the massive arrays for the GPU
        this._positionsArray = new Float32Array(numVertices * 2); 
        const texCoordsArray = new Float32Array(numVertices * 2); 

        let i = 0;
        const subs = this._subdivisions;
        
        // CRITICAL FIX: The loop structure here MUST exactly match 
        // the chunk-by-chunk loop structure in the draw() method!
        for (let r = 0; r < this._rows; r++) {
            for (let c = 0; c < this._cols; c++) {
                
                // Tessellation sub-loop
                for (let sr = 0; sr < subs; sr++) {
                    for (let sc = 0; sc < subs; sc++) {
                        
                        // Calculate global sub-grid index to map to the image perfectly
                        const globalCol = (c * subs) + sc;
                        const globalRow = (r * subs) + sr;

                        // Map to a 0.0 -> 1.0 UV space
                        const u1 = globalCol / renderCols;
                        const v1 = globalRow / renderRows;
                        const u2 = (globalCol + 1) / renderCols;
                        const v2 = (globalRow + 1) / renderRows;

                        // Triangle 1 UVs
                        texCoordsArray[i] = u1;     texCoordsArray[i+1] = v1;
                        texCoordsArray[i+2] = u2;   texCoordsArray[i+3] = v1;
                        texCoordsArray[i+4] = u1;   texCoordsArray[i+5] = v2;
                        
                        // Triangle 2 UVs
                        texCoordsArray[i+6] = u2;   texCoordsArray[i+7] = v1;
                        texCoordsArray[i+8] = u2;   texCoordsArray[i+9] = v2;
                        texCoordsArray[i+10] = u1;  texCoordsArray[i+11] = v2;
                        
                        i += 12; // Advance index by 12 (6 vertices * 2 coordinates)
                    }
                }
            }
        }
        
        const gl = this._gl;
        if (gl && this._texCoordBuffer) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this._texCoordBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, texCoordsArray, gl.STATIC_DRAW);
            const texCoordLocation = gl.getAttribLocation(this._program, "a_texCoord");
            gl.enableVertexAttribArray(texCoordLocation);
            gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);
        }
    },

    
    _reset: function () {
        const topLeft = this._map.containerPointToLayerPoint([0, 0]);
        L.DomUtil.setPosition(this._canvas, topLeft);
        const size = this._map.getSize();
        this._canvas.width = size.x;
        this._canvas.height = size.y;
        
        if (this._gl) {
            this._gl.viewport(0, 0, size.x, size.y);
        }
        this.scheduleDraw();
    },

    // --- OPTIMIZATION 3: High-Performance Curved Draw Loop ---
    draw: function () {
        if (!this._gl || !this._textureLoaded || this._vertices.length === 0 || !this._positionsArray) return;
        
        const gl = this._gl;
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        let i = 0; 
        const getVert = (c, r) => this._vertices[r * (this._cols + 1) + c];
        const subs = this._subdivisions;

        // Loop through the SPARSE control quads (the purple dots)
        for (let r = 0; r < this._rows; r++) {
            for (let c = 0; c < this._cols; c++) {
                const vTL = getVert(c, r);       // Top-Left
                const vTR = getVert(c + 1, r);   // Top-Right
                const vBL = getVert(c, r + 1);   // Bottom-Left
                const vBR = getVert(c + 1, r + 1); // Bottom-Right

                if (!vTL || !vTR || !vBL || !vBR) continue;

                const pTL = this._map.latLngToContainerPoint(vTL.latlng);
                const pTR = this._map.latLngToContainerPoint(vTR.latlng);
                const pBL = this._map.latLngToContainerPoint(vBL.latlng);
                const pBR = this._map.latLngToContainerPoint(vBR.latlng);

                // Tessellation Loop: Generate the curved DENSE grid inside this quad
                for (let sr = 0; sr < subs; sr++) {
                    // Vertical interpolation percentages
                    const vFrac1 = sr / subs;
                    const vFrac2 = (sr + 1) / subs;

                    // Interpolate the left and right edges
                    const leftX1 = pTL.x + (pBL.x - pTL.x) * vFrac1;
                    const leftY1 = pTL.y + (pBL.y - pTL.y) * vFrac1;
                    const rightX1 = pTR.x + (pBR.x - pTR.x) * vFrac1;
                    const rightY1 = pTR.y + (pBR.y - pTR.y) * vFrac1;

                    const leftX2 = pTL.x + (pBL.x - pTL.x) * vFrac2;
                    const leftY2 = pTL.y + (pBL.y - pTL.y) * vFrac2;
                    const rightX2 = pTR.x + (pBR.x - pTR.x) * vFrac2;
                    const rightY2 = pTR.y + (pBR.y - pTR.y) * vFrac2;

                    for (let sc = 0; sc < subs; sc++) {
                        // Horizontal interpolation percentages
                        const uFrac1 = sc / subs;
                        const uFrac2 = (sc + 1) / subs;

                        // Final Bilinear Sub-Points
                        const px1 = leftX1 + (rightX1 - leftX1) * uFrac1;
                        const py1 = leftY1 + (rightY1 - leftY1) * uFrac1;
                        
                        const px2 = leftX1 + (rightX1 - leftX1) * uFrac2;
                        const py2 = leftY1 + (rightY1 - leftY1) * uFrac2;
                        
                        const px3 = leftX2 + (rightX2 - leftX2) * uFrac1;
                        const py3 = leftY2 + (rightY2 - leftY2) * uFrac1;
                        
                        const px4 = leftX2 + (rightX2 - leftX2) * uFrac2;
                        const py4 = leftY2 + (rightY2 - leftY2) * uFrac2;

                        // Push the tiny, smooth triangles to the GPU array
                        // Triangle 1
                        this._positionsArray[i++] = px1; this._positionsArray[i++] = py1;
                        this._positionsArray[i++] = px2; this._positionsArray[i++] = py2;
                        this._positionsArray[i++] = px3; this._positionsArray[i++] = py3;

                        // Triangle 2
                        this._positionsArray[i++] = px2; this._positionsArray[i++] = py2;
                        this._positionsArray[i++] = px4; this._positionsArray[i++] = py4;
                        this._positionsArray[i++] = px3; this._positionsArray[i++] = py3;
                    }
                }
            }
        }

        gl.useProgram(this._program);

        gl.bindBuffer(gl.ARRAY_BUFFER, this._positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this._positionsArray, gl.DYNAMIC_DRAW); 
        
        const positionLocation = gl.getAttribLocation(this._program, "a_position");
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

        const resolutionLocation = gl.getUniformLocation(this._program, "u_resolution");
        gl.uniform2f(resolutionLocation, gl.canvas.width, gl.canvas.height);

        const opacityLocation = gl.getUniformLocation(this._program, "u_opacity");
        gl.uniform1f(opacityLocation, this._opacity);

        gl.drawArrays(gl.TRIANGLES, 0, this._positionsArray.length / 2);
    }
});


function updateGridResolution(newCols, newRows) {
    if (!activeGridMeshLayer) return;

    const imgUrl = activeGridMeshLayer._imgUrl;
    const opacity = activeGridMeshLayer._opacity;

    removeActiveImageOverlay();

    activeGridMeshLayer = new L.GridMeshLayer(imgUrl, null, newCols, newRows, { opacity: opacity });
    map.addLayer(activeGridMeshLayer);

    activeGridMeshLayer.on('meshReady', () => {
        // Handled naturally via the main listeners now
    });
}

// Helper: Remove active image overlay cleanly
// =========================================================================
// OVERLAY ENGINE TRACKERS & HELPER FUNCTIONS
// =========================================================================
let currentTotalRotation = 0;
let currentTotalScale = 1.0;
let selectedMeshMarker = null;

// Helper: Factory to create interactive, clickable mesh dots
function buildMeshMarker(vert, index) {
    const marker = L.marker(vert.latlng, {
        draggable: true,
        pmIgnore: true, 
        icon: L.divIcon({
            className: 'mesh-handle',
            html: `<div style="background:#9333ea; width:12px; height:12px; border:2px solid white; border-radius:50%; box-shadow:0 1px 3px rgba(0,0,0,0.6); cursor:grab;"></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6]
        })
    }).addTo(map);

    marker.vertexIndex = index;

    // Drag behavior
    // Inside buildMeshMarker() and your Right-Click map.on('contextmenu', ...)
    marker.on('drag', function(dragEvent) {
        vert.latlng = dragEvent.target.getLatLng();
        activeGridMeshLayer.scheduleDraw(); // <--- Changed from activeGridMeshLayer.draw()
    });

    // Click selection behavior for 1px keyboard nudging
    marker.on('click', function(e) {
        L.DomEvent.stopPropagation(e);
        if (selectedMeshMarker) {
            selectedMeshMarker.getElement()?.querySelector('div')?.style.setProperty('border', '2px solid white');
        }
        selectedMeshMarker = marker;
        selectedMeshMarker.getElement()?.querySelector('div')?.style.setProperty('border', '3px solid #facc15'); // Yellow ring
    });

    return marker;
}

// Helper: Remove active image overlay cleanly
function removeActiveImageOverlay() {
    if (activeGridMeshLayer) {
        map.removeLayer(activeGridMeshLayer);
        activeGridMeshLayer = null;
    }
    meshControlMarkers.forEach(m => map.removeLayer(m));
    meshControlMarkers = [];
    selectedMeshMarker = null;
    
    document.getElementById('opacityControlBlock').classList.add('hidden');
    document.getElementById('globalControls').classList.add('hidden');

    // Reset UI State
    currentTotalRotation = 0;
    currentTotalScale = 1.0;
    document.getElementById('overlayRotateSlider').value = 0;
    document.getElementById('rotationVal').innerText = '0°';
    document.getElementById('overlayScaleSlider').value = 100;
    document.getElementById('scaleVal').innerText = '100%';
}

// Upload Image Listener
document.getElementById('overlayImageInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        removeActiveImageOverlay();

        const densitySelect = document.getElementById('gridDensitySelect');
        const resolution = densitySelect ? parseInt(densitySelect.value, 10) : 4;

        activeGridMeshLayer = new L.GridMeshLayer(event.target.result, null, resolution, resolution, { opacity: 0.75 });
        map.addLayer(activeGridMeshLayer);

        activeGridMeshLayer.on('meshReady', () => {
            activeGridMeshLayer._vertices.forEach((vert, idx) => {
                const marker = buildMeshMarker(vert, idx);
                meshControlMarkers.push(marker);
            });
        });

        document.getElementById('opacityControlBlock').classList.remove('hidden');
        document.getElementById('globalControls').classList.remove('hidden');
        document.getElementById('overlayOpacitySlider').value = 75;
        document.getElementById('opacityVal').innerText = '75%';
    };

    reader.readAsDataURL(file);
    this.value = '';
});

// Grid Density Change Listener
// Grid Density Change Listener
document.getElementById('gridDensitySelect')?.addEventListener('change', function(e) {
    if (!activeGridMeshLayer) return;
    const newRes = parseInt(e.target.value, 10);
    
    // 1. Remove old purple control dots from the map
    meshControlMarkers.forEach(m => map.removeLayer(m));
    meshControlMarkers = [];
    selectedMeshMarker = null;

    // 2. Interpolate the mesh coordinates to the new grid density
    activeGridMeshLayer.setResolution(newRes);

    // 3. Spawn interactive dots at the new interpolated coordinates
    activeGridMeshLayer._vertices.forEach((vert, idx) => {
        meshControlMarkers.push(buildMeshMarker(vert, idx));
    });
    
    document.getElementById('gridDensityVal').innerText = `${newRes} × ${newRes}`;
});

// =========================================================================
// ROTATION, SCALING, & NUDGING LISTENERS
// =========================================================================
function applyRotationDelta(deltaDegrees) {
    if (!activeGridMeshLayer) return;
    activeGridMeshLayer.rotateBy(deltaDegrees);
    currentTotalRotation = (currentTotalRotation + deltaDegrees) % 360;
    document.getElementById('rotationVal').innerText = `${Math.round(currentTotalRotation)}°`;
    document.getElementById('overlayRotateSlider').value = Math.round(currentTotalRotation);
}

function applyScaleMultiplier(multiplier) {
    if (!activeGridMeshLayer) return;
    activeGridMeshLayer.scaleBy(multiplier);
    currentTotalScale *= multiplier;
    const pct = Math.round(currentTotalScale * 100);
    document.getElementById('scaleVal').innerText = `${pct}%`;
    document.getElementById('overlayScaleSlider').value = pct;
}

// Rotation bindings
document.getElementById('btnRotateCoarseLeft')?.addEventListener('click', () => applyRotationDelta(-5));
document.getElementById('btnRotateFineLeft')?.addEventListener('click', () => applyRotationDelta(-1));
document.getElementById('btnRotateFineRight')?.addEventListener('click', () => applyRotationDelta(1));
document.getElementById('btnRotateCoarseRight')?.addEventListener('click', () => applyRotationDelta(5));

let previousRotateVal = 0;
document.getElementById('overlayRotateSlider')?.addEventListener('input', function(e) {
    if (!activeGridMeshLayer) return;
    const newVal = parseFloat(e.target.value);
    activeGridMeshLayer.rotateBy(newVal - previousRotateVal);
    currentTotalRotation = newVal;
    previousRotateVal = newVal;
    document.getElementById('rotationVal').innerText = `${Math.round(currentTotalRotation)}°`;
});

// Scale bindings
document.getElementById('btnScaleCoarseDown')?.addEventListener('click', () => applyScaleMultiplier(0.95));
document.getElementById('btnScaleFineDown')?.addEventListener('click', () => applyScaleMultiplier(0.99));
document.getElementById('btnScaleFineUp')?.addEventListener('click', () => applyScaleMultiplier(1.01));
document.getElementById('btnScaleCoarseUp')?.addEventListener('click', () => applyScaleMultiplier(1.05));

document.getElementById('overlayScaleSlider')?.addEventListener('input', function(e) {
    if (!activeGridMeshLayer || currentTotalScale <= 0) return;
    const targetScale = parseFloat(e.target.value) / 100;
    activeGridMeshLayer.scaleBy(targetScale / currentTotalScale);
    currentTotalScale = targetScale;
    document.getElementById('scaleVal').innerText = `${Math.round(e.target.value)}%`;
});

// Map Nudge & Global Actions
const nudgeStep = 0.0001;
document.getElementById('btnMoveNorth')?.addEventListener('click', () => activeGridMeshLayer?.moveBy(nudgeStep, 0));
document.getElementById('btnMoveSouth')?.addEventListener('click', () => activeGridMeshLayer?.moveBy(-nudgeStep, 0));
document.getElementById('btnMoveWest')?.addEventListener('click', () => activeGridMeshLayer?.moveBy(0, -nudgeStep));
document.getElementById('btnMoveEast')?.addEventListener('click', () => activeGridMeshLayer?.moveBy(0, nudgeStep));

document.getElementById('overlayOpacitySlider')?.addEventListener('input', function(e) {
    const val = e.target.value / 100;
    document.getElementById('opacityVal').innerText = e.target.value + '%';
    if (activeGridMeshLayer) activeGridMeshLayer.setOpacity(val);
});

document.getElementById('btnLockOverlay')?.addEventListener('click', () => {
    if (!activeGridMeshLayer) return;
    meshControlMarkers.forEach(m => map.removeLayer(m));
    meshControlMarkers = [];
    meshLayersArray.push(activeGridMeshLayer);
    activeGridMeshLayer = null;
    selectedMeshMarker = null;
    document.getElementById('opacityControlBlock').classList.add('hidden');
    document.getElementById('globalControls').classList.add('hidden');
    if (typeof saveMapState === "function") saveMapState();
});

document.getElementById('btnRemoveOverlay')?.addEventListener('click', removeActiveImageOverlay);

// 1-Pixel Keyboard Nudging for Selected Mesh Dot
document.addEventListener('keydown', (e) => {
    if (!selectedMeshMarker || !activeGridMeshLayer) return;
    const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (!arrowKeys.includes(e.key)) return;
    e.preventDefault(); 

    const currentLatLng = selectedMeshMarker.getLatLng();
    const point = map.latLngToContainerPoint(currentLatLng);
    
    if (e.key === 'ArrowUp') point.y -= 1;
    if (e.key === 'ArrowDown') point.y += 1;
    if (e.key === 'ArrowLeft') point.x -= 1;
    if (e.key === 'ArrowRight') point.x += 1;
    
    const newLatLng = map.containerPointToLatLng(point);
    selectedMeshMarker.setLatLng(newLatLng);
    activeGridMeshLayer.updateVertex(selectedMeshMarker.vertexIndex, newLatLng);
});


// =========================================================================
// 5. EXPORT / IMPORT SYSTEM & 6. LOCALFORAGE (UPDATED FOR MULTIPLE MESHES)
// =========================================================================

document.getElementById('exportBtn').addEventListener('click', () => {
    if (landLayersArray.length === 0 && !activeGridMeshLayer && meshLayersArray.length === 0) {
        alert("There are no land plots or image overlays on the map to export!");
        return;
    }

    const features = landLayersArray.map(plot => {
        const geoJsonFeature = plot.layerRef.toGeoJSON();
        geoJsonFeature.properties = {
            layerType: 'vectorPlot', id: plot.id, landId: plot.landId,
            price: plot.price, status: plot.status, color: plot.color, 
            division: plot.division, township: plot.township, quarter: plot.quarter,
            number: plot.number, remark: plot.remark, imageBase64: plot.imageBase64,
            shapeType: plot.shapeType || (plot.layerRef._pmShape) || null,
            textContent: plot.textContent || (plot.layerRef.options ? plot.layerRef.options.text : null),
            pin: plot.pin || null,
            textStyle: plot.textStyle || null, // <-- ADD THIS LINE TO FIX THE REFRESH DROP
            // FIX: Safely detect Text layers so they aren't converted to Pins or Polygons
            type: plot.type || (plot.textContent ? 'Text' : (plot.shapeType === 'Marker' ? 'Pin' : 'Polygon'))
        };
        return geoJsonFeature;
    });

    const allMeshes = [...meshLayersArray];
    if (activeGridMeshLayer) allMeshes.push(activeGridMeshLayer);

    allMeshes.forEach(mesh => {
        if (mesh._vertices && mesh._vertices.length > 0) {
            features.push({
                type: "Feature", geometry: null, 
                properties: {
                    layerType: 'gridMeshImage',
                    imgUrl: mesh._imgUrl, cols: mesh._cols, rows: mesh._rows, opacity: mesh._opacity,
                    vertices: mesh._vertices.map(v => ({ lat: v.latlng.lat, lng: v.latlng.lng, u: v.u, v: v.v }))
                }
            });
        }
    });

    const geoJsonOutput = { type: "FeatureCollection", features: features };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(geoJsonOutput, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `melody_house_spatial_${new Date().toISOString().slice(0,10)}.geojson`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
});

async function saveMapState() {
    const features = landLayersArray.map(plot => {
        const geoJsonFeature = plot.layerRef.toGeoJSON();
        geoJsonFeature.properties = {
            layerType: 'vectorPlot', id: plot.id, landId: plot.landId,
            price: plot.price, status: plot.status, color: plot.color, 
            division: plot.division, township: plot.township, quarter: plot.quarter,
            number: plot.number, remark: plot.remark, imageBase64: plot.imageBase64,
            shapeType: plot.shapeType || (plot.layerRef._pmShape) || null,
            textContent: plot.textContent || (plot.layerRef.options ? plot.layerRef.options.text : null),
            pin: plot.pin || null,
            textStyle: plot.textStyle || null, // <-- ADD THIS LINE TO FIX THE REFRESH DROP
            type: plot.type || (plot.shapeType === 'Marker' ? 'Pin' : 'Polygon')
        };
        return geoJsonFeature;
    });
    
    // ... rest of the localforage code stays the same

    const allMeshes = [...meshLayersArray];
    if (activeGridMeshLayer) allMeshes.push(activeGridMeshLayer);

    allMeshes.forEach(mesh => {
        if (mesh._vertices && mesh._vertices.length > 0) {
            features.push({
                type: "Feature", geometry: null, 
                properties: {
                    layerType: 'gridMeshImage',
                    imgUrl: mesh._imgUrl, cols: mesh._cols, rows: mesh._rows, opacity: mesh._opacity,
                    vertices: mesh._vertices.map(v => ({ lat: v.latlng.lat, lng: v.latlng.lng, u: v.u, v: v.v }))
                }
            });
        }
    });

    try {
        await localforage.setItem('melodyHouseMapData', { type: "FeatureCollection", features: features });
    } catch (err) {
        console.error("Error saving map state:", err);
    }
}

/**
 * Factory Converter to restore custom map layers from saved storage records
 */
function createLayerFromSchema(plotData) {
    let newLayer;

    if (plotData.type === 'Text' || plotData.shapeType === 'Text') {
        // Dynamically fetch the saved text styling
        const tColor = plotData.textStyle?.color || '#0f172a';
        const tSize = plotData.textStyle?.size || '16px';
        const tContent = plotData.textContent || plotData.landId || 'Text';

        // Apply the same transparent background and text-shadow styling used elsewhere
        const textHtml = `<div style="color: ${tColor}; font-size: ${tSize}; font-weight: bold; white-space: nowrap; text-shadow: 1px 1px 2px rgba(255,255,255,0.9), -1px -1px 2px rgba(255,255,255,0.9);">${tContent}</div>`;
        
        newLayer = L.marker(plotData.geometry, {
            textMarker: true,
            text: tContent,
            icon: L.divIcon({
                html: textHtml,
                className: 'custom-map-text-label',
                iconSize: [0, 0] // Set to [0,0] to prevent Leaflet's default offset box
            })
        });
    } else if (plotData.type === 'Pin' || plotData.shapeType === 'Marker') {
        const pinColor = plotData.pin?.color || plotData.color || '#10b981';
        const pinIcon = plotData.pin?.icon || 'fa-map-marker-alt';
        const iconHtml = `<div class="relative flex items-center justify-center" style="color: ${pinColor}; filter: drop-shadow(0px 2px 3px rgba(0,0,0,0.4));">
                            <i class="fas ${pinIcon} text-2xl"></i>
                          </div>`;
        newLayer = L.marker(plotData.geometry, {
            icon: L.divIcon({
                html: iconHtml,
                className: 'custom-map-pin-icon',
                iconSize: [30, 30],
                iconAnchor: [15, 30]
            })
        });
    } else {
        newLayer = L.geoJSON(plotData.geometry, {
            style: {
                color: plotData.color || '#10b981',
                fillOpacity: 0.5
            }
        });
    }

    newLayer.bindPopup(generatePopupHTML(plotData, newLayer));
    newLayer.addTo(map);
    return newLayer;
}

function loadGeoJsonToMap(importedGeoJson) {
    meshLayersArray.forEach(mesh => map.removeLayer(mesh));
    meshLayersArray = [];

    importedGeoJson.features?.forEach(feature => {
        const metadata = feature.properties;
        if (!metadata) return;

        if (metadata.layerType === 'gridMeshImage') {
            const restoredMesh = new L.GridMeshLayer(metadata.imgUrl, null, metadata.cols, metadata.rows, { 
                opacity: metadata.opacity || 0.75 
            });
            map.addLayer(restoredMesh);

            restoredMesh.on('meshReady', () => {
                if (metadata.vertices && metadata.vertices.length === restoredMesh._vertices.length) {
                    metadata.vertices.forEach((savedV, i) => {
                        restoredMesh._vertices[i].latlng = L.latLng(savedV.lat, savedV.lng);
                    });
                }
                restoredMesh.draw(); 
            });

            meshLayersArray.push(restoredMesh);
            return;
        }

        if (feature.geometry) {
            L.geoJSON(feature, {
                // Intercept point creation: If it's a Text shape, create a Geoman Text Marker
                // REPLACE YOUR CURRENT pointToLayer WITH THIS:
                    pointToLayer: function(f, latlng) {
                        // FIX: Check `type` first. Geoman often defaults text shapeTypes to 'Marker', which breaks the restore logic.
                        if (f.properties && (f.properties.type === 'Text' || f.properties.shapeType === 'Text')) {
                            // Rebuild custom styled text
                            const tColor = f.properties.textStyle?.color || '#0f172a';
                            const tSize = f.properties.textStyle?.size || '16px';
                            const tContent = f.properties.textContent || f.properties.landId || 'Text';
                            
                            return L.marker(latlng, {
                                textMarker: true, 
                                text: tContent, // <-- FIX: Crucial for Geoman so it doesn't erase text when re-editing
                                icon: L.divIcon({
                                    className: 'custom-map-text-label',
                                    html: `<div style="color: ${tColor}; font-size: ${tSize}; font-weight: bold; white-space: nowrap; text-shadow: 1px 1px 2px rgba(255,255,255,0.9), -1px -1px 2px rgba(255,255,255,0.9);">${tContent}</div>`,
                                    iconSize: [0, 0] // <-- FIX: Use [0,0] instead of null to prevent Leaflet from wrapping it in a default offset box
                                })
                            });
                        } else if (f.properties && (f.properties.type === 'Pin' || f.properties.shapeType === 'Marker')) {
                            // Rebuild the custom FontAwesome Pin
                            const pinColor = f.properties.pin?.color || f.properties.color || '#10b981';
                            const pinIcon = f.properties.pin?.icon || 'fa-map-marker-alt';
                            const iconHtml = `<div class="relative flex items-center justify-center" style="color: ${pinColor}; filter: drop-shadow(0px 2px 3px rgba(0,0,0,0.4));">
                                                <i class="fas ${pinIcon} text-2xl"></i>
                                            </div>`;
                            return L.marker(latlng, {
                                icon: L.divIcon({
                                    html: iconHtml,
                                    className: 'custom-map-pin-icon',
                                    iconSize: [30, 30],
                                    iconAnchor: [15, 30]
                                })
                            });
                        }
                        return L.marker(latlng);
                    },
        onEachFeature: function(f, layer) {
            const plotColor = metadata.color || (metadata.status === 'Archived' ? '#6c757d' : '#10b981');
            
            // Safely determine true layer type to catch texts before they load
            const layerType = metadata.type || (metadata.textContent ? 'Text' : (metadata.shapeType === 'Marker' ? 'Pin' : null));

            if (layerType === 'Text') {
                // FIX: Forcefully re-apply custom styling to override Geoman's default reload wipe
                const tColor = metadata.textStyle?.color || '#0f172a';
                const tSize = metadata.textStyle?.size || '16px';
                const tContent = metadata.textContent || metadata.landId || 'Text';
                
                // A tiny timeout ensures Geoman finishes its internal parsing first
                setTimeout(() => {
                    if (layer.setIcon) {
                        layer.setIcon(L.divIcon({
                            className: 'custom-map-text-label',
                            html: `<div style="color: ${tColor}; font-size: ${tSize}; font-weight: bold; white-space: nowrap; text-shadow: 1px 1px 2px rgba(255,255,255,0.9), -1px -1px 2px rgba(255,255,255,0.9);">${tContent}</div>`,
                            iconSize: [0, 0]
                        }));
                    }
                }, 50);
            } else if (layerType !== 'Pin' && layer.setStyle) {
                layer.setStyle({ color: plotColor, fillColor: plotColor, fillOpacity: 0.5 });
            }

            layer.bindPopup(generatePopupHTML(metadata, layer));

            landLayersArray.push({
                id: metadata.id || Date.now(), 
                landId: metadata.landId || 'Unnamed',
                price: metadata.price || 0, 
                status: metadata.status || 'Available', 
                color: plotColor,
                division: metadata.division || 'Yangon', 
                township: metadata.township || '',
                quarter: metadata.quarter || '', 
                number: metadata.number || '', 
                pin: metadata.pin || null,
                remark: metadata.remark || '',
                imageBase64: metadata.imageBase64 || '',
                shapeType: metadata.shapeType || null,
                textStyle: metadata.textStyle || null,
                textContent: metadata.textContent || null,
                type: layerType, // Now correctly locking in the 'Text' type forever
                layerRef: layer 
            });
        }
            }).addTo(map);
        }
    });

    updateTownshipDropdown();
    renderSidebarList();
}

async function initializeMapFromStorage() {
    try {
        const savedData = await localforage.getItem('melodyHouseMapData');
        if (savedData && savedData.features) {
            loadGeoJsonToMap(savedData);
        }
    } catch (err) {
        console.error("Error loading map data from storage:", err);
    }
}

initializeMapFromStorage();

document.getElementById('importFile').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const importedGeoJson = JSON.parse(event.target.result);
            loadGeoJsonToMap(importedGeoJson);
            saveMapState(); 
        } catch (err) {
            console.error(err);
            alert("Error parsing file.");
        }
    };
    reader.readAsText(file);
    this.value = '';
});

// =========================================================================
// 7. UNLOCK & EDIT LOCKED IMAGES (RIGHT-CLICK TO UNLOCK)
// =========================================================================

// Helper: Check if a clicked point is inside the image boundary (Ray-Casting Algorithm)
function isPointInPolygon(latlng, boundaryVertices) {
    let x = latlng.lng, y = latlng.lat;
    let inside = false;
    for (let i = 0, j = boundaryVertices.length - 1; i < boundaryVertices.length; j = i++) {
        let xi = boundaryVertices[i].lng, yi = boundaryVertices[i].lat;
        let xj = boundaryVertices[j].lng, yj = boundaryVertices[j].lat;
        
        let intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// Helper: Get the outer boundary coordinates of a grid mesh
function getMeshBoundary(mesh) {
    const cols = mesh._cols;
    const rows = mesh._rows;
    const boundary = [];
    
    for(let c = 0; c <= cols; c++) boundary.push(mesh._vertices[c].latlng); // Top edge
    for(let r = 1; r <= rows; r++) boundary.push(mesh._vertices[r*(cols+1) + cols].latlng); // Right edge
    for(let c = cols - 1; c >= 0; c--) boundary.push(mesh._vertices[rows*(cols+1) + c].latlng); // Bottom edge
    for(let r = rows - 1; r > 0; r--) boundary.push(mesh._vertices[r*(cols+1)].latlng); // Left edge
    
    return boundary;
}

// Listen for Right-Click (contextmenu) on the map
map.on('contextmenu', function(e) {
    // If there is already an active image being edited, require the user to lock it first
    if (activeGridMeshLayer) {
        // Optional: You can change this to an alert() if you want to notify the user explicitly
        console.log("Please lock the currently active image before unlocking another.");
        return; 
    }

    // Loop backwards to check the top-most locked image first
    for (let i = meshLayersArray.length - 1; i >= 0; i--) {
        const mesh = meshLayersArray[i];
        const boundary = getMeshBoundary(mesh);

        // If the right-click happened inside this image's boundaries
        if (isPointInPolygon(e.latlng, boundary)) {
            
            // 1. Remove it from the locked array
            meshLayersArray.splice(i, 1);
            
            // 2. Set it as the active editing layer
            activeGridMeshLayer = mesh;
            
            // 3. Re-generate the purple control dots
            activeGridMeshLayer._vertices.forEach((vert) => {
                const marker = L.marker(vert.latlng, {
                    draggable: true,
                    pmIgnore: true, 
                    icon: L.divIcon({
                        className: 'mesh-handle',
                        html: `<div style="background:#9333ea; width:12px; height:12px; border:2px solid white; border-radius:50%; box-shadow:0 1px 3px rgba(0,0,0,0.6); cursor:grab;"></div>`,
                        iconSize: [12, 12],
                        iconAnchor: [6, 6]
                    })
                }).addTo(map);

                marker.on('drag', function(dragEvent) {
                    vert.latlng = dragEvent.target.getLatLng();
                    activeGridMeshLayer.draw();
                });

                meshControlMarkers.push(marker);
            });

            // 4. Reveal the UI Controls in the sidebar
            document.getElementById('opacityControlBlock').classList.remove('hidden');
            document.getElementById('globalControls').classList.remove('hidden');
            
            // 5. Sync the opacity slider to match this newly unlocked image
            const opacityPercent = Math.round((activeGridMeshLayer._opacity || 0.75) * 100);
            document.getElementById('overlayOpacitySlider').value = opacityPercent;
            document.getElementById('opacityVal').innerText = opacityPercent + '%';

            // Add inside map.on('contextmenu', ...), right next to where you sync rotation/opacity:
            currentTotalScale = activeGridMeshLayer._customScaleTracker || 1.0;
            const scalePercent = Math.round(currentTotalScale * 100);
            document.getElementById('overlayScaleSlider').value = scalePercent;
            document.getElementById('scaleVal').innerText = `${scalePercent}%`;

            // Stop checking other meshes underneath
            break;
        }
    }
});

/**
 * Safely extracts geometric bounds from any Leaflet layer type (Polygon, Pin, Text)
 */
function getSafeLayerBounds(layer) {
    if (typeof layer.getBounds === 'function') {
        return layer.getBounds();
    } else if (typeof layer.getLatLng === 'function') {
        return L.latLngBounds(layer.getLatLng(), layer.getLatLng());
    }
    return map.getBounds();
}

// ==========================================
// CINEMATIC TOUR & FLIGHT CONFIGURATION
// ==========================================

const FLIGHT_DURATION = 3.5; // Seconds spent flying between plots
const VIEW_PAUSE = 4500;     // Milliseconds camera pauses to let user read popup
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let isTourRunning = false;


async function runCinematicTour() {
    const tourBtn = document.getElementById('startTourBtn');

    // 1. If tour is already running, click stops it immediately
    if (isTourRunning) {
        isTourRunning = false;
        return;
    }

    // 2. FILTER AWARENESS: Only pick plots currently shown on map & matching price range
    const isPriceHighlightActive = !document.getElementById('clearHighlightBtn').classList.contains('hidden');
    const minPrice = parseFloat(document.getElementById('minPrice').value) || 0;
    const maxPrice = parseFloat(document.getElementById('maxPrice').value) || Infinity;

    const eligiblePlots = landLayersArray.filter(plot => {
        // Must pass standard dropdown/search filters (i.e., still rendered on the map)
        if (!map.hasLayer(plot.layerRef)) return false;

        // If price highlighting is active, must fall within min/max Lakhs
        if (isPriceHighlightActive) {
            const price = parseFloat(plot.price) || 0;
            if (price < minPrice || price > maxPrice) return false;
        }

        return true;
    });

    if (eligiblePlots.length === 0) {
        alert("No visible properties match your current filters to tour!");
        return;
    }

    // 3. START TOUR UI: Transform button into a Stop button
    isTourRunning = true;
    if (tourBtn) {
        tourBtn.innerHTML = `<i class="fas fa-stop animate-pulse"></i> <span>Stop Tour (${eligiblePlots.length})</span>`;
        tourBtn.classList.replace('bg-indigo-600', 'bg-red-600');
        tourBtn.classList.replace('hover:bg-indigo-700', 'hover:bg-red-700');
    }

    // Auto-collapse sidebar for maximum full-screen immersion
    const sidebar = document.getElementById('mainSidebar');
    if (!sidebar.style.marginLeft.includes('-')) toggleSidebar();

    // 4. THE TOUR LOOP
    for (let i = 0; i < eligiblePlots.length; i++) {
        // Exit early if user clicked "Stop Tour"
        if (!isTourRunning) break;

        const plot = eligiblePlots[i];
        const layer = plot.layerRef;
        if (!layer) continue;

        // Capture original styles so we can restore them precisely
        const originalStyle = {
            color: plot.color || '#10b981',
            fillColor: plot.color || '#10b981',
            fillOpacity: isPriceHighlightActive ? 0.8 : 0.5,
            weight: isPriceHighlightActive ? 4 : 3
        };

        // Close old popups
        map.closePopup();

        // Update button counter to show progress (e.g., "Stop Tour (2/5)")
        if (tourBtn) {
            tourBtn.querySelector('span').innerText = `Stop Tour (${i + 1}/${eligiblePlots.length})`;
        }

        // --- STEP A: Cinematic Swoop Flight ---
        map.flyToBounds(getSafeLayerBounds(layer), {
            animate: true,
            duration: FLIGHT_DURATION,
            easeLinearity: 0.2, // Swoops out slightly before diving in
            maxZoom: 18
        });

        // Wait for flight to finish (+ 200ms landing cushion)
        await delay((FLIGHT_DURATION * 1000) + 200);
        if (!isTourRunning) break;

        // --- STEP B: Showcase Highlight & Open Popup ---
        if (layer.setStyle) {
            layer.setStyle({
                color: '#4F46E5',     // Indigo glowing highlight border
                weight: 5,
                fillColor: '#6366F1',
                fillOpacity: 0.85
            });
            if (layer.bringToFront) layer.bringToFront();
        }
        layer.openPopup();

        // --- STEP C: Hold camera so user can read metadata ---
        await delay(VIEW_PAUSE);

        // --- STEP D: Reset Plot Style ---
        layer.closePopup();
        if (layer.setStyle && isTourRunning) {
            layer.setStyle(originalStyle);
        }
    }

    // 5. FINISH TOUR UI: Restore original start button state
    isTourRunning = false;
    map.closePopup();
    if (tourBtn) {
        tourBtn.innerHTML = `<i class="fas fa-play"></i> <span>Cinematic Tour</span>`;
        tourBtn.classList.replace('bg-red-600', 'bg-indigo-600');
        tourBtn.classList.replace('hover:bg-red-700', 'hover:bg-indigo-700');
    }

    // Re-open sidebar when presentation ends
    if (sidebar.style.marginLeft.includes('-')) toggleSidebar();
}

async function flyToPlotCinematically(plot) {
    // If a tour is running, stop it before snapping to manual selection
    if (isTourRunning) isTourRunning = false;

    const layer = plot.layerRef;
    if (!layer) return;

    map.closePopup();

    map.flyToBounds(getSafeLayerBounds(layer), {
        animate: true,
        duration: FLIGHT_DURATION,
        easeLinearity: 0.2,
        maxZoom: 18
    });

    await delay((FLIGHT_DURATION * 1000) + 200);
    layer.openPopup();
}


// =========================================================================
// SERVICE WORKER REGISTRATION (This should be the absolute final block)
// =========================================================================
    // Register Service Worker in app.js
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('Service Worker registered successfully!', reg.scope))
                .catch(err => console.error('Service Worker registration failed:', err));
        });
    }