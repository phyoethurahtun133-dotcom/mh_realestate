// =========================================================================
// 1. INITIALIZE MAP & CONTROLS
// =========================================================================
const map = L.map('map', {
    zoomControl: false // Move zoom control to bottom right to avoid sidebar overlaps
}).setView([16.8409, 96.1735], 12);

L.control.zoom({ position: 'bottomright' }).addTo(map);

// Add Location Control Button
const locateControl = L.control({ position: 'bottomright' });

locateControl.onAdd = function(map) {
    const btn = L.DomUtil.create('button', 'bg-white text-emerald-700 p-2 rounded shadow-md hover:bg-gray-50 border border-gray-200 mt-2');
    btn.innerHTML = '<i class="fas fa-location-arrow"></i>';
    btn.title = "Find My Location";
    btn.onclick = function(e) {
        e.preventDefault();
        map.locate({ setView: true, maxZoom: 16 });
    };
    return btn;
};
locateControl.addTo(map);

// Handle successful location finding
map.on('locationfound', function(e) {
    const radius = e.accuracy / 2;
    L.marker(e.latlng).addTo(map)
        .bindPopup(`You are within ${radius} meters from this point`).openPopup();
    L.circle(e.latlng, radius, { color: '#10b981', fillOpacity: 0.2 }).addTo(map);
});

// Handle location error
map.on('locationerror', function(e) {
    alert("Location access denied or unavailable.");
});

// Base Map Switcher (Street vs Satellite)
const streetMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 21
}).addTo(map);

const satelliteMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 21
});

L.control.layers({
    "Street Map (Default)": streetMap,
    "Satellite Imagery": satelliteMap
}).addTo(map);

// Configure Geoman Drawing Toolbar Options
map.pm.addControls({
    position: 'topleft',
    drawMarker: false,
    drawCircleMarker: false,
    drawPolyline: false,
    drawRectangle: true,
    drawPolygon: true,
    drawCircle: false,
    editMode: true, 
    dragMode: false,
    removalMode: true
});

// =========================================================================
// 2. STATE MANAGEMENT & SIDEBAR COLLAPSE
// =========================================================================
let landLayersArray = [];
let temporarilyDrawnLayer = null;
let editingPlotId = null; 
let meshLayersArray = []; // <--- Add this new array for locked images

// Sidebar Collapse Toggle
document.getElementById('sidebarToggleBtn').addEventListener('click', function() {
    const sidebar = document.getElementById('mainSidebar');
    const icon = document.getElementById('sidebarToggleIcon');
    const isCollapsed = sidebar.style.marginLeft.includes('-');

    if (isCollapsed) {
        sidebar.style.marginLeft = '0px';
        icon.classList.replace('fa-chevron-right', 'fa-chevron-left');
    } else {
        const sidebarWidth = sidebar.offsetWidth;
        sidebar.style.marginLeft = `-${sidebarWidth}px`;
        icon.classList.replace('fa-chevron-left', 'fa-chevron-right');
    }

    setTimeout(() => {
        map.invalidateSize();
    }, 300);
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
// 3. DRAWING & VECTOR PLOT MANAGEMENT
// =========================================================================
map.on('pm:create', (e) => {
    temporarilyDrawnLayer = e.layer; 
    temporarilyDrawnLayer._pmShape = e.shape; // Capture shape type (Polygon, Text, Rectangle, etc.)
    editingPlotId = null; 
    
    document.getElementById('metaForm').reset(); 
    document.getElementById('remarkInput').style.display = 'none';
    document.getElementById('addRemarkBtn').innerText = '+ Add Remark';

    // If the user drew a Text element, auto-fill the Land ID input with their text
    if (e.shape === 'Text' && e.layer.options.text) {
        document.getElementById('landIdInput').value = e.layer.options.text;
    }

    document.getElementById('metaModal').style.display = 'flex';
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

        newCutLayer.bindPopup(`
            <div class="min-w-[200px]">
                ${plot.imageBase64 ? `<img src="${plot.imageBase64}" class="w-full h-32 object-cover rounded-t-md mb-2 border-b border-gray-200">` : ''}
                <div class="font-bold text-lg border-b pb-1 mb-2 text-gray-800 ${!plot.imageBase64 ? 'mt-1' : ''}">${plot.landId}</div>
                <div class="grid grid-cols-2 gap-1 text-sm mb-2">
                    <div class="text-gray-500">Status:</div>
                    <div class="font-semibold ${plot.status === 'Available' ? 'text-emerald-600' : 'text-gray-500'}">${plot.status}</div>
                    <div class="text-gray-500">Location:</div>
                    <div class="text-gray-700">${plot.number || ''} ${plot.quarter || ''} ${plot.township || ''}</div>
                    <div class="text-gray-500">Area:</div>
                    <div class="text-gray-700">${plot.areaAcres > 0 ? plot.areaAcres + ' Acres' : 'N/A'}</div>
                    <div class="text-gray-500">Price:</div>
                    <div class="font-bold text-emerald-700">${plot.price} Lakhs</div>
                </div>
                ${plot.remark ? `<div class="text-xs text-gray-500 italic border-t pt-1 mt-1 bg-gray-50 p-1 rounded"><i class="fas fa-info-circle mr-1"></i>${plot.remark}</div>` : ''}
            </div>
        `);

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

document.getElementById('metaForm').addEventListener('submit', (e) => {
    e.preventDefault();
    
    let areaSqMeters = 0;
    const geoJson = temporarilyDrawnLayer.toGeoJSON();
    
    if (geoJson.geometry.type === 'Polygon' || geoJson.geometry.type === 'MultiPolygon') {
        areaSqMeters = turf.area(geoJson);
    }

    const areaSqFt = (areaSqMeters * 10.7639).toFixed(2);
    const areaAcres = (areaSqMeters / 4046.86).toFixed(4);

    // Extract text content if it's a Text layer
    const shapeType = temporarilyDrawnLayer._pmShape || (temporarilyDrawnLayer.pm ? temporarilyDrawnLayer.pm._shape : 'Polygon');
    const textContent = temporarilyDrawnLayer.options.text || (temporarilyDrawnLayer.pm && temporarilyDrawnLayer.pm.getText ? temporarilyDrawnLayer.pm.getText() : null);

    const metadata = {
        id: editingPlotId ? editingPlotId : Date.now(),
        landId: document.getElementById('landIdInput').value,
        price: document.getElementById('priceInput').value,
        status: document.getElementById('statusInput').value,
        color: document.getElementById('colorInput').value, 
        division: document.getElementById('divisionInput').value,
        township: document.getElementById('townshipInput').value,
        quarter: document.getElementById('quarterInput').value,
        number: document.getElementById('numberInput').value,
        remark: document.getElementById('remarkInput').value,
        imageBase64: document.getElementById('plotImageBase64').value,
        areaSqFt: areaSqFt,
        areaAcres: areaAcres,
        shapeType: shapeType,
        textContent: textContent,
        layerRef: temporarilyDrawnLayer
    };

    temporarilyDrawnLayer.bindPopup(`
        <div class="min-w-[200px]">
            ${metadata.imageBase64 ? `<img src="${metadata.imageBase64}" class="w-full h-32 object-cover rounded-t-md mb-2 border-b border-gray-200">` : ''}
            <div class="font-bold text-lg border-b pb-1 mb-2 text-gray-800 ${!metadata.imageBase64 ? 'mt-1' : ''}">${metadata.landId}</div>
            <div class="grid grid-cols-2 gap-1 text-sm mb-2">
                <div class="text-gray-500">Status:</div>
                <div class="font-semibold ${metadata.status === 'Available' ? 'text-emerald-600' : 'text-gray-500'}">${metadata.status}</div>
                <div class="text-gray-500">Location:</div>
                <div class="text-gray-700">${metadata.number || ''} ${metadata.quarter || ''} ${metadata.township || ''}</div>
                <div class="text-gray-500">Area:</div>
                <div class="text-gray-700">${metadata.areaAcres > 0 ? metadata.areaAcres + ' Acres' : 'N/A'}</div>
                <div class="text-gray-500">Price:</div>
                <div class="font-bold text-emerald-700">${metadata.price} Lakhs</div>
            </div>
            ${metadata.remark ? `<div class="text-xs text-gray-500 italic border-t pt-1 mt-1 bg-gray-50 p-1 rounded"><i class="fas fa-info-circle mr-1"></i>${metadata.remark}</div>` : ''}
        </div>
    `);

    colorCodeLayer(temporarilyDrawnLayer, metadata.color);

    if (editingPlotId) {
        const index = landLayersArray.findIndex(p => p.id === editingPlotId);
        if (index !== -1) landLayersArray[index] = metadata;
    } else {
        landLayersArray.push(metadata);
    }
    
    updateTownshipDropdown();
    renderSidebarList();
    saveMapState(); // <-- CRITICAL FIX: Save newly created/updated plot to localForage
    closeModal(); 
});

document.getElementById('plotImageInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        document.getElementById('plotImageBase64').value = event.target.result;
    };
    reader.readAsDataURL(file);
});

function openEditModal(id) {
    const plot = landLayersArray.find(p => p.id === id);
    if (!plot) return;

    editingPlotId = id; 
    temporarilyDrawnLayer = plot.layerRef; 

    document.getElementById('landIdInput').value = plot.landId;
    document.getElementById('priceInput').value = plot.price;
    document.getElementById('statusInput').value = plot.status;
    document.getElementById('colorInput').value = plot.color || '#10b981'; 
    document.getElementById('divisionInput').value = plot.division;
    document.getElementById('townshipInput').value = plot.township;
    document.getElementById('quarterInput').value = plot.quarter;
    document.getElementById('numberInput').value = plot.number;
    
    // Load existing image if available
    document.getElementById('plotImageBase64').value = plot.imageBase64 || '';
    document.getElementById('plotImageInput').value = ''; // Reset UI file input

    if (plot.remark) {
        document.getElementById('remarkInput').value = plot.remark;
        document.getElementById('remarkInput').style.display = 'block';
        document.getElementById('addRemarkBtn').innerText = '- Remove Remark';
    } else {
        document.getElementById('remarkInput').value = '';
        document.getElementById('remarkInput').style.display = 'none';
        document.getElementById('addRemarkBtn').innerText = '+ Add Remark';
    }

    document.getElementById('metaModal').style.display = 'flex';
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
                map.fitBounds(plot.layerRef.getBounds());
                plot.layerRef.openPopup();
            }
        });

        listContainer.appendChild(item);
    });

    if (listContainer.innerHTML === '') {
        listContainer.innerHTML = `<div class="text-center p-5 text-gray-400 text-sm mt-10">No properties match your current filters.</div>`;
    }
}

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
// 4. MULTI-GRID MESHING OVERLAY ENGINE
// =========================================================================
let activeGridMeshLayer = null;
let meshControlMarkers = [];

L.GridMeshLayer = L.Layer.extend({
    initialize: function (imgUrl, bounds, gridCols, gridRows, options) {
        L.setOptions(this, options);
        this._imgUrl = imgUrl;
        this._cols = gridCols || 4; 
        this._rows = gridRows || 4; 
        this._opacity = options.opacity || 0.75;
        this._vertices = []; 
    },

    onAdd: function (map) {
        this._map = map;
        this._canvas = L.DomUtil.create('canvas', 'leaflet-zoom-animated');

        // Ensure the overlay canvas doesn't block map panning/dragging beneath it
        this._canvas.style.pointerEvents = 'none';

        this._ctx = this._canvas.getContext('2d');
        map.getPanes().overlayPane.appendChild(this._canvas);
        
        this._img = new Image();
        this._img.onload = () => {
            this._initGridVertices();
            this.draw();
        };
        this._img.src = this._imgUrl;

        map.on('zoom reset viewreset moveend', this._reset, this);
        this._reset();
    },

    onRemove: function (map) {
        L.DomUtil.remove(this._canvas);
        map.off('zoom reset viewreset moveend', this._reset, this);
    },

    setOpacity: function (opacity) {
        this._opacity = opacity;
        this.draw();
    },

    moveBy: function (dLat, dLng) {
        this._vertices.forEach(vert => {
            vert.latlng = L.latLng(vert.latlng.lat + dLat, vert.latlng.lng + dLng);
        });
        this._syncMarkers();
        this.draw();
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
        this.draw();
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
        this.draw();
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
        this.fire('meshReady');
    },

    _reset: function () {
        const topLeft = this._map.containerPointToLayerPoint([0, 0]);
        L.DomUtil.setPosition(this._canvas, topLeft);
        const size = this._map.getSize();
        this._canvas.width = size.x;
        this._canvas.height = size.y;
        this.draw();
    },

    draw: function () {
        if (!this._img || !this._img.complete || this._vertices.length === 0) return;
        const ctx = this._ctx;
        ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
        ctx.globalAlpha = this._opacity;

        const w = this._img.naturalWidth;
        const h = this._img.naturalHeight;
        const getVert = (c, r) => this._vertices[r * (this._cols + 1) + c];

        for (let r = 0; r < this._rows; r++) {
            for (let c = 0; c < this._cols; c++) {
                const v1 = getVert(c, r);
                const v2 = getVert(c + 1, r);
                const v3 = getVert(c, r + 1);
                const v4 = getVert(c + 1, r + 1);

                this._drawTriangle(ctx, this._img, v1, v2, v3, w, h);
                this._drawTriangle(ctx, this._img, v2, v4, v3, w, h);
            }
        }
    },

    _drawTriangle: function (ctx, img, vA, vB, vC, imgW, imgH) {
        const pA = this._map.latLngToContainerPoint(vA.latlng);
        const pB = this._map.latLngToContainerPoint(vB.latlng);
        const pC = this._map.latLngToContainerPoint(vC.latlng);

        const sAx = vA.u * imgW, sAy = vA.v * imgH;
        const sBx = vB.u * imgW, sBy = vB.v * imgH;
        const sCx = vC.u * imgW, sCy = vC.v * imgH;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.lineTo(pB.x, pB.y);
        ctx.lineTo(pC.x, pC.y);
        ctx.closePath();
        ctx.clip();

        const denom = (sAx * (sBy - sCy) + sBx * (sCy - sAy) + sCx * (sAy - sBy));
        if (Math.abs(denom) < 0.0001) { ctx.restore(); return; }

        const m11 = (pA.x * (sBy - sCy) + pB.x * (sCy - sAy) + pC.x * (sAy - sBy)) / denom;
        const m12 = (pA.y * (sBy - sCy) + pB.y * (sCy - sAy) + pC.y * (sAy - sBy)) / denom;
        const m21 = (pA.x * (sCx - sBx) + pB.x * (sAx - sCx) + pC.x * (sBx - sAx)) / denom;
        const m22 = (pA.y * (sCx - sBx) + pB.y * (sAx - sCx) + pC.y * (sBx - sAx)) / denom;
        const dx  = (pA.x * (sBx * sCy - sCx * sBy) + pB.x * (sCx * sAy - sAx * sCy) + pC.x * (sAx * sBy - sBx * sAy)) / denom;
        const dy  = (pA.y * (sBx * sCy - sCx * sBy) + pB.y * (sCx * sAy - sAx * sCy) + pC.y * (sAx * sBy - sBx * sAy)) / denom;

        ctx.setTransform(m11, m12, m21, m22, dx, dy);
        ctx.drawImage(img, 0, 0);
        ctx.restore();
    }
});


function updateGridResolution(newCols, newRows) {
    if (!activeGridMeshLayer) return;

    // 1. Capture current image data (if you need to preserve state)
    const imgUrl = activeGridMeshLayer._imgUrl;
    const opacity = activeGridMeshLayer._opacity;

    // 2. Clear old mesh and markers
    removeActiveImageOverlay();

    // 3. Re-create with new density
    activeGridMeshLayer = new L.GridMeshLayer(imgUrl, null, newCols, newRows, { opacity: opacity });
    map.addLayer(activeGridMeshLayer);

    // 4. Re-bind the meshReady event as shown in your existing upload code
    // (Ensure you call the marker creation logic again here)
    activeGridMeshLayer.on('meshReady', () => {
        // ... (Insert your marker generation loop here)
    });
}

// Helper: Remove active image overlay cleanly
function removeActiveImageOverlay() {
    if (activeGridMeshLayer) {
        map.removeLayer(activeGridMeshLayer);
        activeGridMeshLayer = null;
    }
    meshControlMarkers.forEach(m => map.removeLayer(m));
    meshControlMarkers = [];
    
    document.getElementById('opacityControlBlock').classList.add('hidden');
    document.getElementById('globalControls').classList.add('hidden');
}

// Upload Image Listener
document.getElementById('overlayImageInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        removeActiveImageOverlay();

        // To something like this:
        const newGridCols = 8; // Change this to your desired number of columns
        const newGridRows = 8; // Change this to your desired number of rows
        activeGridMeshLayer = new L.GridMeshLayer(event.target.result, null, newGridCols, newGridRows, { opacity: 0.75 });
        map.addLayer(activeGridMeshLayer);

        activeGridMeshLayer.on('meshReady', () => {
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
        });

        document.getElementById('opacityControlBlock').classList.remove('hidden');
        document.getElementById('globalControls').classList.remove('hidden');
        document.getElementById('overlayOpacitySlider').value = 75;
        document.getElementById('opacityVal').innerText = '75%';
    };

    reader.readAsDataURL(file);
    this.value = '';
});

// Bind UI Action Buttons for Overlay
document.getElementById('btnLockOverlay').addEventListener('click', () => {
    if (!activeGridMeshLayer) return;
    meshControlMarkers.forEach(m => map.removeLayer(m));
    meshControlMarkers = [];
    meshLayersArray.push(activeGridMeshLayer);
    activeGridMeshLayer = null;
    document.getElementById('opacityControlBlock').classList.add('hidden');
    document.getElementById('globalControls').classList.add('hidden');
    if (typeof saveMapState === "function") saveMapState();
});

document.getElementById('btnRemoveOverlay').addEventListener('click', removeActiveImageOverlay);
document.getElementById('btnRotateLeft').addEventListener('click', () => activeGridMeshLayer?.rotateBy(-5));
document.getElementById('btnRotateRight').addEventListener('click', () => activeGridMeshLayer?.rotateBy(5));
document.getElementById('btnScaleDown').addEventListener('click', () => activeGridMeshLayer?.scaleBy(0.95));
document.getElementById('btnScaleUp').addEventListener('click', () => activeGridMeshLayer?.scaleBy(1.05));

const nudgeStep = 0.0001;
document.getElementById('btnMoveNorth').addEventListener('click', () => activeGridMeshLayer?.moveBy(nudgeStep, 0));
document.getElementById('btnMoveSouth').addEventListener('click', () => activeGridMeshLayer?.moveBy(-nudgeStep, 0));
document.getElementById('btnMoveWest').addEventListener('click', () => activeGridMeshLayer?.moveBy(0, -nudgeStep));
document.getElementById('btnMoveEast').addEventListener('click', () => activeGridMeshLayer?.moveBy(0, nudgeStep));

document.getElementById('overlayOpacitySlider').addEventListener('input', function(e) {
    const val = e.target.value / 100;
    document.getElementById('opacityVal').innerText = e.target.value + '%';
    if (activeGridMeshLayer) activeGridMeshLayer.setOpacity(val);
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
            number: plot.number, remark: plot.remark, imageBase64: plot.imageBase64 // <-- Added
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
            textContent: plot.textContent || (plot.layerRef.options ? plot.layerRef.options.text : null)
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

    try {
        await localforage.setItem('melodyHouseMapData', { type: "FeatureCollection", features: features });
    } catch (err) {
        console.error("Error saving map state:", err);
    }
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
                pointToLayer: function(f, latlng) {
                    if (f.properties && f.properties.shapeType === 'Text') {
                        return L.marker(latlng, {
                            textMarker: true,
                            text: f.properties.textContent || f.properties.landId || 'Text'
                        });
                    }
                    return L.marker(latlng);
                },
                onEachFeature: function(f, layer) {
                    const plotColor = metadata.color || (metadata.status === 'Archived' ? '#6c757d' : '#10b981');
                    if (layer.setStyle) layer.setStyle({ color: plotColor, fillColor: plotColor, fillOpacity: 0.5 });

                    layer.bindPopup(`
                        <div class="min-w-[200px]">
                            ${metadata.imageBase64 ? `<img src="${metadata.imageBase64}" class="w-full h-32 object-cover rounded-t-md mb-2 border-b border-gray-200">` : ''}
                            <div class="font-bold text-lg border-b pb-1 mb-2 text-gray-800 ${!metadata.imageBase64 ? 'mt-1' : ''}">${metadata.landId || 'Unnamed'}</div>
                            <div class="grid grid-cols-2 gap-1 text-sm mb-2">
                                <div class="text-gray-500">Status:</div>
                                <div class="font-semibold ${metadata.status === 'Available' ? 'text-emerald-600' : 'text-gray-500'}">${metadata.status || 'Available'}</div>
                                <div class="text-gray-500">Location:</div>
                                <div class="text-gray-700">${metadata.number || ''} ${metadata.quarter || ''} ${metadata.township || ''}</div>
                                <div class="text-gray-500">Price:</div>
                                <div class="font-bold text-emerald-700">${metadata.price || 0} Lakhs</div>
                            </div>
                            ${metadata.remark ? `<div class="text-xs text-gray-500 italic border-t pt-1 mt-1 bg-gray-50 p-1 rounded"><i class="fas fa-info-circle mr-1"></i>${metadata.remark}</div>` : ''}
                        </div>
                    `);

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
                        remark: metadata.remark || '',
                        imageBase64: metadata.imageBase64 || '',
                        shapeType: metadata.shapeType || null,
                        textContent: metadata.textContent || null,
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

            // Stop checking other meshes underneath
            break;
        }
    }
});

    // Register Service Worker in app.js
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('Service Worker registered successfully!', reg.scope))
                .catch(err => console.error('Service Worker registration failed:', err));
        });
    }