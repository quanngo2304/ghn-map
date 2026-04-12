// ============================================================
// GHN Map - Planning Module
// Post office planning: place drafts, assign wards, draw service areas
// ============================================================

let planningMarkerLayer = null;
let planningServiceLayer = null;
let planningCompareLayer = null;
let drawingPolygonPoints = [];
let drawingTempLayer = null;

const PLANNING_COLOR = '#e84393';
const PLANNING_STORAGE_KEY = 'ghn-map-planning';

// ============================================================
// Init & Persistence
// ============================================================

function initPlanning() {
    loadPlanningData();
    renderDraftPostOffices();
    buildDraftListUI();

    // Map click for placing drafts
    map.on('click', handlePlanningMapClick);
}

function loadPlanningData() {
    try {
        const saved = localStorage.getItem(PLANNING_STORAGE_KEY);
        if (saved) {
            const data = JSON.parse(saved);
            state.planning.draftPostOffices = data.draftPostOffices || [];
            state.planning.wardOverrides = data.wardOverrides || {};
        }
    } catch (e) {
        console.log('Planning data not loaded:', e);
    }
}

function savePlanningData() {
    localStorage.setItem(PLANNING_STORAGE_KEY, JSON.stringify({
        draftPostOffices: state.planning.draftPostOffices,
        wardOverrides: state.planning.wardOverrides,
    }));
}

// ============================================================
// Toggle planning mode
// ============================================================

function togglePlanningMode() {
    state.planning.active = !state.planning.active;
    const btn = document.getElementById('btn-planning-toggle');
    const controls = document.getElementById('planning-controls');

    if (state.planning.active) {
        btn.textContent = 'Tắt quy hoạch';
        btn.classList.add('active');
        controls.style.display = 'block';
        renderDraftPostOffices();
    } else {
        btn.textContent = 'Bật quy hoạch';
        btn.classList.remove('active');
        controls.style.display = 'none';
        state.planning.mode = null;
        state.planning.selectedDraftId = null;
        clearPlanningModeButtons();
        document.getElementById('map').classList.remove('map-crosshair');
        clearDrawingState();
        // Remove planning layers
        if (planningMarkerLayer) { map.removeLayer(planningMarkerLayer); planningMarkerLayer = null; }
        if (planningServiceLayer) { map.removeLayer(planningServiceLayer); planningServiceLayer = null; }
        if (planningCompareLayer) { map.removeLayer(planningCompareLayer); planningCompareLayer = null; }
    }
    updateDraftInfoPanel();
    document.getElementById('planning-draw-controls').style.display = 'none';
}

function setPlanningMode(mode) {
    if (state.planning.mode === mode) {
        // Toggle off
        state.planning.mode = null;
        clearPlanningModeButtons();
        document.getElementById('map').classList.remove('map-crosshair');
        document.getElementById('planning-draw-controls').style.display = 'none';
        clearDrawingState();
        return;
    }

    state.planning.mode = mode;
    clearPlanningModeButtons();
    document.getElementById('btn-plan-' + mode).classList.add('active');
    clearDrawingState();

    if (mode === 'place') {
        document.getElementById('map').classList.add('map-crosshair');
        document.getElementById('planning-draw-controls').style.display = 'none';
    } else if (mode === 'assign') {
        document.getElementById('map').classList.remove('map-crosshair');
        document.getElementById('planning-draw-controls').style.display = 'none';
        if (!state.planning.selectedDraftId && state.planning.draftPostOffices.length > 0) {
            selectDraft(state.planning.draftPostOffices[0].id);
        }
    } else if (mode === 'draw') {
        document.getElementById('map').classList.remove('map-crosshair');
        document.getElementById('planning-draw-controls').style.display =
            state.planning.selectedDraftId ? 'block' : 'none';
        if (!state.planning.selectedDraftId && state.planning.draftPostOffices.length > 0) {
            selectDraft(state.planning.draftPostOffices[0].id);
        }
    }
}

function clearPlanningModeButtons() {
    ['place', 'assign', 'draw'].forEach(m => {
        document.getElementById('btn-plan-' + m).classList.remove('active');
    });
}

// ============================================================
// Place draft post office
// ============================================================

function handlePlanningMapClick(e) {
    if (!state.planning.active || state.planning.mode !== 'place') return;

    const { lat, lng } = e.latlng;
    const draft = {
        id: 'draft_' + Date.now(),
        name: '',
        category: 'buu_cuc',
        latitude: Math.round(lat * 1e6) / 1e6,
        longitude: Math.round(lng * 1e6) / 1e6,
        serviceArea: null,
        notes: '',
    };

    // Show popup form to fill details
    const formHtml = `
        <div class="planning-popup-form" style="min-width:220px">
            <h4 style="margin:0 0 8px;color:${PLANNING_COLOR}">Bưu cục nháp mới</h4>
            <label>Tên</label>
            <input type="text" id="draft-name" placeholder="VD: BC Mỹ Đình 2" autofocus>
            <label>Loại</label>
            <select id="draft-category">
                <option value="buu_cuc">Bưu Cục</option>
                <option value="kho_trung_chuyen">Kho Trung Chuyển</option>
                <option value="kho_chuyen_tiep">Kho Chuyển Tiếp</option>
                <option value="giao_hang_nang">Giao Hàng Nặng</option>
            </select>
            <label>Toạ độ</label>
            <input type="text" value="${draft.latitude}, ${draft.longitude}" readonly style="color:#999">
            <label>Ghi chú</label>
            <textarea id="draft-notes" rows="2" placeholder="Ghi chú..."></textarea>
            <div style="margin-top:6px">
                <button class="btn-save" onclick="saveDraftFromPopup('${draft.id}')">Lưu</button>
                <button class="btn-cancel" onclick="map.closePopup()">Huỷ</button>
            </div>
        </div>
    `;

    // Store temp draft
    window._tempDraft = draft;

    L.popup({ closeOnClick: false, maxWidth: 300 })
        .setLatLng(e.latlng)
        .setContent(formHtml)
        .openOn(map);
}

function saveDraftFromPopup(draftId) {
    const draft = window._tempDraft;
    if (!draft || draft.id !== draftId) return;

    draft.name = document.getElementById('draft-name').value || 'BC nháp ' + (state.planning.draftPostOffices.length + 1);
    draft.category = document.getElementById('draft-category').value;
    draft.notes = document.getElementById('draft-notes').value;

    state.planning.draftPostOffices.push(draft);
    state.planning.selectedDraftId = draft.id;
    window._tempDraft = null;

    map.closePopup();
    savePlanningData();
    renderDraftPostOffices();
    buildDraftListUI();
    updateDraftInfoPanel();
}

// ============================================================
// Render draft post offices
// ============================================================

function renderDraftPostOffices() {
    if (planningMarkerLayer) {
        map.removeLayer(planningMarkerLayer);
        planningMarkerLayer = null;
    }
    if (planningCompareLayer) {
        map.removeLayer(planningCompareLayer);
        planningCompareLayer = null;
    }

    if (!state.planning.active) return;

    const markers = [];
    const compareLines = [];

    state.planning.draftPostOffices.forEach(draft => {
        const isSelected = draft.id === state.planning.selectedDraftId;
        const icon = L.divIcon({
            className: 'planning-marker' + (isSelected ? ' planning-marker-selected' : ''),
            html: '<div class="planning-marker-icon"></div>',
            iconSize: [24, 24],
            iconAnchor: [12, 12],
        });

        const marker = L.marker([draft.latitude, draft.longitude], {
            icon,
            draggable: true,
            zIndexOffset: 1000,
        });

        marker.on('click', () => {
            selectDraft(draft.id);
        });

        marker.on('dragend', (e) => {
            const pos = e.target.getLatLng();
            draft.latitude = Math.round(pos.lat * 1e6) / 1e6;
            draft.longitude = Math.round(pos.lng * 1e6) / 1e6;
            savePlanningData();
            updateDraftInfoPanel();
            renderCompareLines();
            renderServiceAreas();
        });

        marker.bindTooltip(draft.name || draft.id, {
            permanent: false,
            direction: 'top',
            offset: [0, -14],
        });

        markers.push(marker);

        // Compare line to nearest existing PO
        const nearest = findNearestPostOffice(draft.latitude, draft.longitude);
        if (nearest) {
            const line = L.polyline(
                [[draft.latitude, draft.longitude], [parseFloat(nearest.po.latitude), parseFloat(nearest.po.longitude)]],
                { color: '#999', weight: 1.5, dashArray: '6,4', opacity: 0.7, interactive: false }
            );
            const midLat = (draft.latitude + parseFloat(nearest.po.latitude)) / 2;
            const midLng = (draft.longitude + parseFloat(nearest.po.longitude)) / 2;
            const distLabel = L.tooltip({ permanent: true, direction: 'center', className: 'distance-tooltip' })
                .setLatLng([midLat, midLng])
                .setContent(`${nearest.distance.toFixed(1)} km`);
            compareLines.push(line);
            compareLines.push(distLabel);
        }
    });

    if (markers.length > 0) {
        planningMarkerLayer = L.layerGroup(markers).addTo(map);
    }
    if (compareLines.length > 0) {
        planningCompareLayer = L.layerGroup(compareLines).addTo(map);
    }
}

function renderCompareLines() {
    if (planningCompareLayer) {
        map.removeLayer(planningCompareLayer);
        planningCompareLayer = null;
    }
    if (!state.planning.active) return;

    const items = [];
    state.planning.draftPostOffices.forEach(draft => {
        const nearest = findNearestPostOffice(draft.latitude, draft.longitude);
        if (nearest) {
            items.push(L.polyline(
                [[draft.latitude, draft.longitude], [parseFloat(nearest.po.latitude), parseFloat(nearest.po.longitude)]],
                { color: '#999', weight: 1.5, dashArray: '6,4', opacity: 0.7, interactive: false }
            ));
            const midLat = (draft.latitude + parseFloat(nearest.po.latitude)) / 2;
            const midLng = (draft.longitude + parseFloat(nearest.po.longitude)) / 2;
            items.push(L.tooltip({ permanent: true, direction: 'center', className: 'distance-tooltip' })
                .setLatLng([midLat, midLng])
                .setContent(`${nearest.distance.toFixed(1)} km`));
        }
    });
    if (items.length > 0) {
        planningCompareLayer = L.layerGroup(items).addTo(map);
    }
}

// ============================================================
// Find nearest existing post office
// ============================================================

function findNearestPostOffice(lat, lng) {
    if (!state.postOffices || state.postOffices.length === 0) return null;

    let nearest = null;
    let minDist = Infinity;

    state.postOffices.forEach(po => {
        const poLat = parseFloat(po.latitude);
        const poLng = parseFloat(po.longitude);
        if (isNaN(poLat) || isNaN(poLng)) return;

        const dist = turf.distance(turf.point([lng, lat]), turf.point([poLng, poLat]), { units: 'kilometers' });
        if (dist < minDist) {
            minDist = dist;
            nearest = { po, distance: dist };
        }
    });

    return nearest;
}

// ============================================================
// Draft list UI
// ============================================================

function buildDraftListUI() {
    const container = document.getElementById('planning-draft-list');
    if (!container) return;

    if (state.planning.draftPostOffices.length === 0) {
        container.innerHTML = '<div style="font-size:11px;color:#999;padding:4px">Chưa có bưu cục nháp</div>';
        return;
    }

    container.innerHTML = state.planning.draftPostOffices.map(draft => {
        const isSelected = draft.id === state.planning.selectedDraftId;
        const wardCount = Object.values(state.planning.wardOverrides).filter(id => id === draft.id).length;
        return `
            <div class="draft-item ${isSelected ? 'selected' : ''}" onclick="selectDraft('${draft.id}')">
                <div class="draft-color" style="background:${PLANNING_COLOR}"></div>
                <div>
                    <div style="font-weight:600">${draft.name || draft.id}</div>
                    <div style="font-size:10px;color:#888">${wardCount} xã · ${draft.latitude}, ${draft.longitude}</div>
                </div>
                <span class="draft-delete" onclick="event.stopPropagation();deleteDraft('${draft.id}')" title="Xóa">&times;</span>
            </div>
        `;
    }).join('');
}

function selectDraft(id) {
    state.planning.selectedDraftId = id;
    buildDraftListUI();
    updateDraftInfoPanel();
    renderDraftPostOffices();
    renderServiceAreas();

    // Show draw controls if in draw mode
    if (state.planning.mode === 'draw') {
        document.getElementById('planning-draw-controls').style.display = id ? 'block' : 'none';
    }

    // Zoom to draft
    const draft = state.planning.draftPostOffices.find(d => d.id === id);
    if (draft) {
        map.setView([draft.latitude, draft.longitude], Math.max(map.getZoom(), 12));
    }
}

function deleteDraft(id) {
    state.planning.draftPostOffices = state.planning.draftPostOffices.filter(d => d.id !== id);
    // Remove ward overrides for this draft
    Object.keys(state.planning.wardOverrides).forEach(ma_xa => {
        if (state.planning.wardOverrides[ma_xa] === id) {
            delete state.planning.wardOverrides[ma_xa];
        }
    });
    if (state.planning.selectedDraftId === id) {
        state.planning.selectedDraftId = state.planning.draftPostOffices.length > 0
            ? state.planning.draftPostOffices[0].id : null;
    }
    savePlanningData();
    renderDraftPostOffices();
    renderServiceAreas();
    buildDraftListUI();
    updateDraftInfoPanel();
    // Re-render ward colors if in buucuc mode
    if (state.colorByGroup === 'buucuc' && activeLayer) {
        activeLayer.setStyle(getStyle);
    }
}

function clearAllDrafts() {
    if (!confirm('Xóa tất cả bưu cục nháp và gán xã?')) return;
    state.planning.draftPostOffices = [];
    state.planning.wardOverrides = {};
    state.planning.selectedDraftId = null;
    savePlanningData();
    renderDraftPostOffices();
    renderServiceAreas();
    buildDraftListUI();
    updateDraftInfoPanel();
    if (state.colorByGroup === 'buucuc' && activeLayer) {
        activeLayer.setStyle(getStyle);
    }
}

// ============================================================
// Draft info panel
// ============================================================

function updateDraftInfoPanel() {
    const panel = document.getElementById('planning-draft-info');
    if (!panel) return;

    const draft = state.planning.draftPostOffices.find(d => d.id === state.planning.selectedDraftId);
    if (!draft) {
        panel.style.display = 'none';
        return;
    }

    const nearest = findNearestPostOffice(draft.latitude, draft.longitude);
    const wardCount = Object.values(state.planning.wardOverrides).filter(id => id === draft.id).length;
    const catLabels = { buu_cuc: 'Bưu Cục', kho_trung_chuyen: 'KTC', kho_chuyen_tiep: 'KCT', giao_hang_nang: 'GHN' };

    panel.style.display = 'block';
    panel.innerHTML = `
        <div style="font-weight:600;color:${PLANNING_COLOR}">${draft.name}</div>
        <div>Loại: ${catLabels[draft.category] || draft.category}</div>
        <div>Toạ độ: ${draft.latitude}, ${draft.longitude}</div>
        <div>Xã đã gán: <b>${wardCount}</b></div>
        ${nearest ? `<div>BC gần nhất: <b>${nearest.po.warehouse_name}</b> (${nearest.distance.toFixed(1)} km)</div>` : ''}
        ${draft.notes ? `<div style="color:#888;margin-top:2px">${draft.notes}</div>` : ''}
    `;
}

// ============================================================
// Ward assignment
// ============================================================

function handlePlanningFeatureClick(feature, layer, e) {
    if (state.planning.mode === 'assign') {
        const ma_xa = feature.properties.ma_xa;
        if (!ma_xa || !state.planning.selectedDraftId) return;

        // Toggle: if already assigned to this draft, unassign
        if (state.planning.wardOverrides[ma_xa] === state.planning.selectedDraftId) {
            delete state.planning.wardOverrides[ma_xa];
        } else {
            state.planning.wardOverrides[ma_xa] = state.planning.selectedDraftId;
        }

        // Restyle just this layer
        layer.setStyle(getStyle(feature));
        savePlanningData();
        buildDraftListUI();
        updateDraftInfoPanel();

        // Update buu cuc borders if visible
        if (buucucBorderLayer || state.colorByGroup === 'buucuc') {
            const features = [];
            activeLayer.eachLayer(l => { if (l.feature) features.push(l.feature); });
            renderBuucucBorders({ features });
        }
    } else if (state.planning.mode === 'draw' && drawingPolygonPoints.length > 0) {
        // Polygon drawing handled by map click, not feature click
        // But still add the point
        addDrawingPoint(e.latlng);
    }
}

// ============================================================
// Service area drawing
// ============================================================

function renderServiceAreas() {
    if (planningServiceLayer) {
        map.removeLayer(planningServiceLayer);
        planningServiceLayer = null;
    }
    if (!state.planning.active) return;

    const layers = [];
    state.planning.draftPostOffices.forEach(draft => {
        if (!draft.serviceArea) return;

        if (draft.serviceArea.type === 'circle') {
            layers.push(L.circle([draft.latitude, draft.longitude], {
                radius: draft.serviceArea.radius,
                color: PLANNING_COLOR,
                weight: 2,
                dashArray: '6,4',
                fillColor: PLANNING_COLOR,
                fillOpacity: 0.08,
                interactive: false,
            }));
        } else if (draft.serviceArea.type === 'polygon') {
            layers.push(L.polygon(draft.serviceArea.latlngs, {
                color: PLANNING_COLOR,
                weight: 2,
                dashArray: '6,4',
                fillColor: PLANNING_COLOR,
                fillOpacity: 0.08,
                interactive: false,
            }));
        }
    });

    if (layers.length > 0) {
        planningServiceLayer = L.layerGroup(layers).addTo(map);
    }
}

function drawServiceRadius() {
    const draft = state.planning.draftPostOffices.find(d => d.id === state.planning.selectedDraftId);
    if (!draft) return;

    const km = parseFloat(document.getElementById('planning-radius').value) || 3;
    draft.serviceArea = { type: 'circle', radius: km * 1000 };
    savePlanningData();
    renderServiceAreas();
}

// Polygon drawing
function startDrawPolygon() {
    const draft = state.planning.draftPostOffices.find(d => d.id === state.planning.selectedDraftId);
    if (!draft) return;

    const btn = document.getElementById('btn-draw-polygon');
    if (drawingPolygonPoints.length > 0) {
        // Finish drawing
        finishDrawPolygon();
        return;
    }

    drawingPolygonPoints = [];
    btn.textContent = 'Xong vẽ';
    btn.classList.add('active');
    document.getElementById('map').classList.add('map-crosshair');

    // Map click adds vertices
    map.on('click', onDrawPolygonClick);
}

function onDrawPolygonClick(e) {
    if (state.planning.mode !== 'draw' || !document.getElementById('btn-draw-polygon').classList.contains('active')) return;
    addDrawingPoint(e.latlng);
}

function addDrawingPoint(latlng) {
    drawingPolygonPoints.push([latlng.lat, latlng.lng]);

    // Update temp visual
    if (drawingTempLayer) map.removeLayer(drawingTempLayer);
    if (drawingPolygonPoints.length >= 2) {
        drawingTempLayer = L.polyline(drawingPolygonPoints, {
            color: PLANNING_COLOR, weight: 2, dashArray: '4,4',
        }).addTo(map);
    } else {
        drawingTempLayer = L.circleMarker(latlng, {
            radius: 5, color: PLANNING_COLOR, fillColor: PLANNING_COLOR, fillOpacity: 1,
        }).addTo(map);
    }
}

function finishDrawPolygon() {
    map.off('click', onDrawPolygonClick);

    const draft = state.planning.draftPostOffices.find(d => d.id === state.planning.selectedDraftId);
    if (draft && drawingPolygonPoints.length >= 3) {
        draft.serviceArea = { type: 'polygon', latlngs: drawingPolygonPoints };
        savePlanningData();
        renderServiceAreas();
    }

    clearDrawingState();
}

function clearDrawingState() {
    drawingPolygonPoints = [];
    if (drawingTempLayer) { map.removeLayer(drawingTempLayer); drawingTempLayer = null; }
    const btn = document.getElementById('btn-draw-polygon');
    if (btn) {
        btn.textContent = 'Vẽ tay';
        btn.classList.remove('active');
    }
    map.off('click', onDrawPolygonClick);
}

// ============================================================
// Export CSV
// ============================================================

function exportPlanningCSV() {
    if (state.planning.draftPostOffices.length === 0) {
        alert('Chưa có bưu cục nháp để xuất');
        return;
    }

    // 1. Draft post offices CSV
    const poHeaders = ['id', 'name', 'category', 'latitude', 'longitude', 'notes', 'ward_count', 'nearest_po', 'nearest_distance_km'];
    const poRows = state.planning.draftPostOffices.map(d => {
        const nearest = findNearestPostOffice(d.latitude, d.longitude);
        const wardCount = Object.values(state.planning.wardOverrides).filter(id => id === d.id).length;
        return [
            d.id, d.name, d.category, d.latitude, d.longitude, d.notes || '',
            wardCount,
            nearest ? nearest.po.warehouse_name : '',
            nearest ? nearest.distance.toFixed(2) : '',
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    downloadCSV('draft-post-offices.csv', poHeaders.join(',') + '\n' + poRows.join('\n'));

    // 2. Ward reassignments CSV
    const overrides = Object.entries(state.planning.wardOverrides);
    if (overrides.length > 0) {
        const wardHeaders = ['ma_xa', 'ten_xa', 'ten_huyen', 'ten_tinh', 'old_buu_cuc_ma', 'old_buu_cuc_ten', 'new_draft_id', 'new_draft_name'];
        const wardRows = overrides.map(([ma_xa, draftId]) => {
            const wd = state.wardData[ma_xa] || {};
            const draft = state.planning.draftPostOffices.find(d => d.id === draftId);
            return [
                ma_xa, wd.ten_xa || '', wd.ten_huyen || '', wd.ten_tinh || '',
                wd.buu_cuc_ma || '', wd.buu_cuc_ten || '',
                draftId, draft ? draft.name : '',
            ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
        });
        downloadCSV('ward-reassignments.csv', wardHeaders.join(',') + '\n' + wardRows.join('\n'));
    }
}

function downloadCSV(filename, content) {
    const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
