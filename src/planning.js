// ============================================================
// GHN Map - Planning Module
// Post office planning: place drafts, assign wards, draw service areas,
// reassign wards between real POs, change AM, color picker
// ============================================================

let planningMarkerLayer = null;
let planningServiceLayer = null;
let planningCompareLayer = null;
let drawingPolygonPoints = [];
let drawingTempLayer = null;

const PLANNING_COLOR = '#e84393';
const PLANNING_STORAGE_KEY = 'ghn-map-planning';

// Color palette for user selection
const COLOR_PALETTE = [
    '#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c','#3498db',
    '#9b59b6','#e84393','#00549A','#F26522','#34495e','#95a5a6',
    '#d35400','#27ae60','#2980b9','#8e44ad','#c0392b','#16a085',
];

// ============================================================
// Init & Persistence
// ============================================================

function initPlanning() {
    loadPlanningData();
    renderDraftPostOffices();
    buildTargetListUI();
    map.on('click', handlePlanningMapClick);
}

function loadPlanningData() {
    try {
        const saved = localStorage.getItem(PLANNING_STORAGE_KEY);
        if (saved) {
            const data = JSON.parse(saved);
            state.planning.draftPostOffices = data.draftPostOffices || [];
            state.planning.wardOverrides = data.wardOverrides || {};
            state.planning.amOverrides = data.amOverrides || {};
            state.planning.colorOverrides = data.colorOverrides || {};
        }
    } catch (e) {
        console.log('Planning data not loaded:', e);
    }
}

function savePlanningData() {
    localStorage.setItem(PLANNING_STORAGE_KEY, JSON.stringify({
        draftPostOffices: state.planning.draftPostOffices,
        wardOverrides: state.planning.wardOverrides,
        amOverrides: state.planning.amOverrides,
        colorOverrides: state.planning.colorOverrides,
    }));
}

// ============================================================
// Helpers
// ============================================================

function getSelectedTargetId() {
    return state.planning.selectedTargetId;
}

function getTargetName(id) {
    const draft = state.planning.draftPostOffices.find(d => d.id === id);
    if (draft) return draft.name || id;
    const po = state.postOffices.find(p => p.warehouse_id === id);
    if (po) return po.warehouse_name;
    return id;
}

function autoSelectTarget() {
    if (state.planning.selectedTargetId) return;
    if (state.planning.draftPostOffices.length > 0) {
        selectTarget(state.planning.draftPostOffices[0].id, 'draft');
    }
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
        if (state.planning.mode === 'paint') cleanupPaintMode();
        state.planning.mode = null;
        state.planning.selectedTargetId = null;
        clearPlanningModeButtons();
        document.getElementById('map').classList.remove('map-crosshair');
        clearDrawingState();
        if (planningMarkerLayer) { map.removeLayer(planningMarkerLayer); planningMarkerLayer = null; }
        if (planningServiceLayer) { map.removeLayer(planningServiceLayer); planningServiceLayer = null; }
        if (planningCompareLayer) { map.removeLayer(planningCompareLayer); planningCompareLayer = null; }
        // Restore original ward colors
        if (activeLayer) activeLayer.setStyle(getStyle);
        if (buucucBorderLayer) {
            const features = [];
            activeLayer.eachLayer(l => { if (l.feature) features.push(l.feature); });
            renderBuucucBorders({ features });
        }
    }
    updateTargetInfoPanel();
    document.getElementById('planning-draw-controls').style.display = 'none';
}

function setPlanningMode(mode) {
    if (state.planning.mode === 'paint') cleanupPaintMode();

    if (state.planning.mode === mode) {
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
    } else if (mode === 'assign' || mode === 'paint') {
        document.getElementById('map').classList.toggle('map-crosshair', mode === 'paint');
        document.getElementById('planning-draw-controls').style.display = 'none';
        autoSelectTarget();
        if (mode === 'paint') initPaintMode();
    } else if (mode === 'draw') {
        document.getElementById('map').classList.remove('map-crosshair');
        document.getElementById('planning-draw-controls').style.display =
            state.planning.selectedTargetId ? 'block' : 'none';
        autoSelectTarget();
    }
}

function clearPlanningModeButtons() {
    ['place', 'assign', 'draw', 'paint'].forEach(m => {
        const el = document.getElementById('btn-plan-' + m);
        if (el) el.classList.remove('active');
    });
    // Refresh info panel to update button states
    updateTargetInfoPanel();
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
    window._tempDraft = null;
    map.closePopup();

    selectTarget(draft.id, 'draft');
    savePlanningData();
    renderDraftPostOffices();
    buildTargetListUI();
    updateTargetInfoPanel();
}

// ============================================================
// Render draft post offices
// ============================================================

function renderDraftPostOffices() {
    if (planningMarkerLayer) { map.removeLayer(planningMarkerLayer); planningMarkerLayer = null; }
    if (planningCompareLayer) { map.removeLayer(planningCompareLayer); planningCompareLayer = null; }
    if (!state.planning.active) return;

    const markers = [];
    const compareLines = [];

    state.planning.draftPostOffices.forEach(draft => {
        const isSelected = draft.id === state.planning.selectedTargetId;
        const color = state.planning.colorOverrides[draft.id] || PLANNING_COLOR;
        const icon = L.divIcon({
            className: 'planning-marker' + (isSelected ? ' planning-marker-selected' : ''),
            html: `<div class="planning-marker-icon" style="background:${color}"></div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
        });

        const marker = L.marker([draft.latitude, draft.longitude], {
            icon, draggable: true, zIndexOffset: 1000,
        });

        marker.on('click', () => selectTarget(draft.id, 'draft'));
        marker.on('dragend', (e) => {
            const pos = e.target.getLatLng();
            draft.latitude = Math.round(pos.lat * 1e6) / 1e6;
            draft.longitude = Math.round(pos.lng * 1e6) / 1e6;
            savePlanningData();
            updateTargetInfoPanel();
            renderCompareLines();
            renderServiceAreas();
        });

        marker.bindTooltip(draft.name || draft.id, { permanent: false, direction: 'top', offset: [0, -14] });
        markers.push(marker);

        // Compare line
        const nearest = findNearestPostOffice(draft.latitude, draft.longitude);
        if (nearest) {
            compareLines.push(L.polyline(
                [[draft.latitude, draft.longitude], [parseFloat(nearest.po.latitude), parseFloat(nearest.po.longitude)]],
                { color: '#999', weight: 1.5, dashArray: '6,4', opacity: 0.7, interactive: false }
            ));
            const midLat = (draft.latitude + parseFloat(nearest.po.latitude)) / 2;
            const midLng = (draft.longitude + parseFloat(nearest.po.longitude)) / 2;
            compareLines.push(L.tooltip({ permanent: true, direction: 'center', className: 'distance-tooltip' })
                .setLatLng([midLat, midLng]).setContent(`${nearest.distance.toFixed(1)} km`));
        }
    });

    if (markers.length > 0) planningMarkerLayer = L.layerGroup(markers).addTo(map);
    if (compareLines.length > 0) planningCompareLayer = L.layerGroup(compareLines).addTo(map);
}

function renderCompareLines() {
    if (planningCompareLayer) { map.removeLayer(planningCompareLayer); planningCompareLayer = null; }
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
                .setLatLng([midLat, midLng]).setContent(`${nearest.distance.toFixed(1)} km`));
        }
    });
    if (items.length > 0) planningCompareLayer = L.layerGroup(items).addTo(map);
}

function findNearestPostOffice(lat, lng) {
    if (!state.postOffices || state.postOffices.length === 0) return null;
    let nearest = null;
    let minDist = Infinity;
    state.postOffices.forEach(po => {
        const poLat = parseFloat(po.latitude);
        const poLng = parseFloat(po.longitude);
        if (isNaN(poLat) || isNaN(poLng)) return;
        const dist = turf.distance(turf.point([lng, lat]), turf.point([poLng, poLat]), { units: 'kilometers' });
        if (dist < minDist) { minDist = dist; nearest = { po, distance: dist }; }
    });
    return nearest;
}

// ============================================================
// Target selection (draft or real PO)
// ============================================================

function selectTarget(id, type) {
    state.planning.selectedTargetId = id;
    state.planning.selectedTargetType = type || (id && id.startsWith('draft_') ? 'draft' : 'real');
    buildTargetListUI();
    updateTargetInfoPanel();
    renderDraftPostOffices();
    renderServiceAreas();

    if (state.planning.mode === 'draw') {
        document.getElementById('planning-draw-controls').style.display = id ? 'block' : 'none';
    }
}

function selectRealPO(warehouseId) {
    selectTarget(warehouseId, 'real');
}

// ============================================================
// Target list UI (drafts + real PO selector)
// ============================================================

// Get real POs that have been modified (AM override or ward changes)
function getModifiedRealPOs() {
    const modifiedIds = new Set();
    // AM overrides on real POs
    Object.keys(state.planning.amOverrides).forEach(id => {
        if (!id.startsWith('draft_')) modifiedIds.add(id);
    });
    // Color overrides on real POs
    Object.keys(state.planning.colorOverrides).forEach(id => {
        if (!id.startsWith('draft_')) modifiedIds.add(id);
    });
    // Ward overrides pointing to real POs
    Object.values(state.planning.wardOverrides).forEach(id => {
        if (id && id !== '_unassigned' && !id.startsWith('draft_')) modifiedIds.add(id);
    });
    // Wards moved away from their original real PO (unassigned or reassigned)
    Object.entries(state.planning.wardOverrides).forEach(([ma_xa, val]) => {
        const wd = state.wardData[ma_xa];
        if (wd && wd.buu_cuc_ma && val !== wd.buu_cuc_ma) {
            modifiedIds.add(wd.buu_cuc_ma);
        }
    });
    return state.postOffices.filter(po => modifiedIds.has(po.warehouse_id));
}

// Get filtered real POs based on current region/province filters
function getFilteredRealPOs() {
    return state.postOffices.filter(po => {
        if (po.warehouse_category !== 'buu_cuc') return false;
        if (state.filterRegions.length > 0 && !state.filterRegions.includes(po.region)) return false;
        if (state.filterProvinces.length > 0 && !state.filterProvinces.includes(po.province_name)) return false;
        return true;
    }).sort((a, b) => a.warehouse_name.localeCompare(b.warehouse_name));
}

function filterRealPOList() {
    const input = document.getElementById('real-po-search');
    const list = document.getElementById('real-po-options');
    if (!input || !list) return;
    const q = input.value.toLowerCase().trim();
    const items = list.querySelectorAll('.real-po-option');
    items.forEach(el => {
        el.style.display = !q || el.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
}

function buildTargetListUI() {
    const container = document.getElementById('planning-draft-list');
    if (!container) return;

    let html = '';

    // Draft post offices
    if (state.planning.draftPostOffices.length > 0) {
        html += '<div style="font-size:10px;font-weight:600;color:#888;margin-bottom:2px">BƯU CỤC NHÁP</div>';
        html += state.planning.draftPostOffices.map(draft => {
            const isSelected = draft.id === state.planning.selectedTargetId;
            const color = state.planning.colorOverrides[draft.id] || PLANNING_COLOR;
            const wardCount = Object.values(state.planning.wardOverrides).filter(id => id === draft.id).length;
            return `
                <div class="draft-item ${isSelected ? 'selected' : ''}" onclick="selectTarget('${draft.id}','draft')">
                    <div class="draft-color" style="background:${color}"></div>
                    <div>
                        <div style="font-weight:600">${draft.name || draft.id}</div>
                        <div style="font-size:10px;color:#888">${wardCount} xã</div>
                    </div>
                    <span class="draft-delete" onclick="event.stopPropagation();deleteDraft('${draft.id}')" title="Xóa">&times;</span>
                </div>
            `;
        }).join('');
    } else {
        html += '<div style="font-size:11px;color:#999;padding:4px;margin-bottom:4px">Chưa có BC nháp — dùng "Đặt BC"</div>';
    }

    // Real PO search + list (always accessible at top)
    const filteredPOs = getFilteredRealPOs();
    const filterNote = state.filterRegions.length > 0 || state.filterProvinces.length > 0
        ? ` (${filteredPOs.length} BC)` : '';
    html += `
        <div style="font-size:10px;font-weight:600;color:#888;margin:6px 0 2px">BƯU CỤC THẬT${filterNote}</div>
        <input type="text" id="real-po-search" placeholder="Tìm bưu cục..." oninput="filterRealPOList()"
               style="width:100%;padding:3px 4px;font-size:11px;border:1px solid #ccc;border-radius:3px;margin-bottom:3px">
        <div id="real-po-options" style="max-height:150px;overflow-y:auto;border:1px solid #eee;border-radius:3px">
            ${filteredPOs.map(po => {
                const sel = po.warehouse_id === state.planning.selectedTargetId;
                return `<div class="real-po-option draft-item ${sel ? 'selected' : ''}"
                             onclick="selectRealPO('${po.warehouse_id}')"
                             style="padding:3px 6px;font-size:11px;cursor:pointer">
                    ${po.warehouse_name}
                </div>`;
            }).join('')}
            ${filteredPOs.length === 0 ? '<div style="font-size:11px;color:#999;padding:4px">Lọc vùng/tỉnh để hiện BC</div>' : ''}
        </div>
    `;

    // Modified real POs (below search, scrollable)
    const modifiedRealPOs = getModifiedRealPOs();
    if (modifiedRealPOs.length > 0) {
        html += '<div style="font-size:10px;font-weight:600;color:#F26522;margin:6px 0 2px">ĐÃ CHỈNH (' + modifiedRealPOs.length + ')</div>';
        const modifiedListHeight = _infoPanelCollapsed ? 300 : 150;
        html += `<div style="max-height:${modifiedListHeight}px;overflow-y:auto">`;
        html += modifiedRealPOs.map(po => {
            const sel = po.warehouse_id === state.planning.selectedTargetId;
            const color = state.planning.colorOverrides[po.warehouse_id] || '';
            const changes = [];
            if (state.planning.amOverrides[po.warehouse_id]) changes.push('AM');
            let added = 0, removed = 0;
            Object.entries(state.planning.wardOverrides).forEach(([ma_xa, val]) => {
                const wd = state.wardData[ma_xa];
                const orig = wd ? wd.buu_cuc_ma : null;
                if (val === po.warehouse_id && orig !== po.warehouse_id) added++;
                if (orig === po.warehouse_id && val !== po.warehouse_id) removed++;
            });
            if (added > 0) changes.push(`<span style="color:#27ae60">+${added}</span>`);
            if (removed > 0) changes.push(`<span style="color:#e74c3c">-${removed}</span>`);
            return `
                <div class="draft-item ${sel ? 'selected' : ''}" onclick="selectRealPO('${po.warehouse_id}')">
                    ${color ? `<div class="draft-color" style="background:${color}"></div>` : ''}
                    <div>
                        <div style="font-weight:600;font-size:11px">${po.warehouse_name}</div>
                        <div style="font-size:10px;color:#F26522">${changes.join(' · ')}</div>
                    </div>
                </div>
            `;
        }).join('');
        html += '</div>';
    }

    container.innerHTML = html;
}

// ============================================================
// Color & AM overrides
// ============================================================

function setTargetColor(targetId, color) {
    if (color) {
        state.planning.colorOverrides[targetId] = color;
    } else {
        delete state.planning.colorOverrides[targetId];
    }
    savePlanningData();
    buildTargetListUI();
    renderDraftPostOffices();
    // Refresh ward colors
    if (state.colorByGroup === 'buucuc' && activeLayer) {
        activeLayer.setStyle(getStyle);
    }
}

function setAMOverride(targetId, amName) {
    if (amName.trim()) {
        state.planning.amOverrides[targetId] = amName.trim();
    } else {
        delete state.planning.amOverrides[targetId];
    }
    savePlanningData();
    updateTargetInfoPanel();
    // Refresh pin colors if in AM color mode
    if (state.pinColorMode === 'am') renderPostOffices();
}

// ============================================================
// Target info panel
// ============================================================

let _infoPanelCollapsed = false;

function toggleInfoPanel() {
    _infoPanelCollapsed = !_infoPanelCollapsed;
    // When collapsing info panel, expand draft list to see overview
    const draftList = document.getElementById('planning-draft-list');
    if (draftList) {
        draftList.style.maxHeight = _infoPanelCollapsed ? '600px' : '400px';
    }
    updateTargetInfoPanel();
}

function updateTargetInfoPanel() {
    const panel = document.getElementById('planning-draft-info');
    if (!panel) return;

    const targetId = state.planning.selectedTargetId;
    if (!targetId) { panel.style.display = 'none'; return; }

    // Collapsed mode — show only name + expand button
    if (_infoPanelCollapsed) {
        const name = getTargetName(targetId);
        const color = state.planning.colorOverrides[targetId] || PLANNING_COLOR;
        panel.style.display = 'block';
        panel.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:2px 0">
                <span style="font-weight:600;color:${color};font-size:11px">${name}</span>
                <span onclick="toggleInfoPanel()" style="cursor:pointer;font-size:11px;color:#F26522" title="Mở chi tiết">Mở ▸</span>
            </div>
        `;
        return;
    }

    // Count ward changes: added (new assignments), removed (unassigned from original)
    let wardsAdded = 0, wardsRemoved = 0;
    Object.entries(state.planning.wardOverrides).forEach(([ma_xa, val]) => {
        if (val === targetId) {
            // Check if this was originally assigned here (restore = not "added")
            const origWd = state.wardData[ma_xa];
            if (!origWd || origWd.buu_cuc_ma !== targetId) wardsAdded++;
        } else if (val === '_unassigned') {
            const origWd = state.wardData[ma_xa];
            if (origWd && origWd.buu_cuc_ma === targetId) wardsRemoved++;
        }
    });
    // Also count wards moved AWAY from this target to another target
    Object.entries(state.planning.wardOverrides).forEach(([ma_xa, val]) => {
        if (val !== targetId && val !== '_unassigned') {
            const origWd = state.wardData[ma_xa];
            if (origWd && origWd.buu_cuc_ma === targetId) wardsRemoved++;
        }
    });

    const amOverride = state.planning.amOverrides[targetId];
    const color = state.planning.colorOverrides[targetId] || PLANNING_COLOR;
    const catLabels = { buu_cuc: 'Bưu Cục', kho_trung_chuyen: 'KTC', kho_chuyen_tiep: 'KCT', giao_hang_nang: 'GHN' };

    let infoHtml = `<div style="display:flex;justify-content:flex-end"><span onclick="toggleInfoPanel()" style="cursor:pointer;font-size:12px;color:#888" title="Thu gọn">▾ Thu gọn</span></div>`;

    if (state.planning.selectedTargetType === 'draft') {
        const draft = state.planning.draftPostOffices.find(d => d.id === targetId);
        if (!draft) { panel.style.display = 'none'; return; }

        const nearest = findNearestPostOffice(draft.latitude, draft.longitude);
        infoHtml += `
            <div style="font-weight:600;color:${color}">${draft.name} <span style="font-size:10px;color:#888">(nháp)</span></div>
            <div>Loại: ${catLabels[draft.category] || draft.category}</div>
            <div>Toạ độ: ${draft.latitude}, ${draft.longitude}</div>
            <div>Xã gán: <b>${wardsAdded}</b></div>
            ${amOverride ? `<div>AM: <b>${amOverride}</b></div>` : ''}
            ${nearest ? `<div>BC gần nhất: <b>${nearest.po.warehouse_name}</b> (${nearest.distance.toFixed(1)} km)</div>` : ''}
            ${draft.notes ? `<div style="color:#888;margin-top:2px">${draft.notes}</div>` : ''}
        `;
    } else {
        const po = state.postOffices.find(p => p.warehouse_id === targetId);
        if (!po) { panel.style.display = 'none'; return; }

        const originalAM = po.area_manager_name || '(chưa có)';
        const origWardCount = Object.values(state.wardData).filter(w => w.buu_cuc_ma === targetId).length;
        const currentTotal = origWardCount + wardsAdded - wardsRemoved;

        infoHtml += `
            <div style="font-weight:600;color:${color}">${po.warehouse_name} <span style="font-size:10px;color:#888">(thật)</span></div>
            <div>Mã: ${po.warehouse_id}</div>
            <div>AM: ${originalAM}${amOverride ? ` → <b style="color:${PLANNING_COLOR}">${amOverride}</b>` : ''}</div>
            <div>Xã: ${origWardCount} gốc${wardsAdded ? ` <span style="color:#27ae60">+${wardsAdded}</span>` : ''}${wardsRemoved ? ` <span style="color:#e74c3c">-${wardsRemoved}</span>` : ''} = <b>${currentTotal}</b></div>
        `;
    }

    // Action buttons for selected target
    const assignActive = state.planning.mode === 'assign' ? ' active' : '';
    const paintActive = state.planning.mode === 'paint' ? ' active' : '';
    const drawActive = state.planning.mode === 'draw' ? ' active' : '';
    const isDraft = state.planning.selectedTargetType === 'draft';
    infoHtml += `
        <div style="margin-top:6px;border-top:1px solid #eee;padding-top:4px">
            <div style="font-size:10px;font-weight:600;color:#888;margin-bottom:3px">THAO TÁC</div>
            <div class="toggle-btn-group">
                <button id="btn-plan-assign" class="toggle-btn${assignActive}" onclick="setPlanningMode('assign')" style="font-size:11px;padding:2px 6px">Gán xã</button>
                <button id="btn-plan-paint" class="toggle-btn${paintActive}" onclick="setPlanningMode('paint')" style="font-size:11px;padding:2px 6px">Tô vùng</button>
                ${isDraft ? `<button id="btn-plan-draw" class="toggle-btn${drawActive}" onclick="setPlanningMode('draw')" style="font-size:11px;padding:2px 6px">Vẽ vùng PV</button>` : ''}
            </div>
            ${state.planning.mode === 'draw' && isDraft ? `
                <div style="margin-top:4px;display:flex;gap:4px;align-items:center">
                    <input type="number" id="planning-radius" value="3" min="0.5" max="50" step="0.5" style="width:50px;padding:2px;font-size:11px">
                    <span style="font-size:10px">km</span>
                    <button class="toggle-btn" onclick="drawServiceRadius()" style="font-size:11px;padding:2px 6px">Bán kính</button>
                    <button class="toggle-btn" onclick="startDrawPolygon()" id="btn-draw-polygon" style="font-size:11px;padding:2px 6px">Vẽ tay</button>
                </div>
            ` : ''}
        </div>
    `;

    // Color picker
    const currentColor = state.planning.colorOverrides[targetId] || '';
    infoHtml += `
        <div style="margin-top:6px;border-top:1px solid #eee;padding-top:4px">
            <div style="font-size:10px;font-weight:600;color:#888;margin-bottom:2px">MÀU TÔ</div>
            <div style="display:flex;flex-wrap:wrap;gap:3px">
                ${COLOR_PALETTE.map(c => `
                    <div onclick="setTargetColor('${targetId}','${c}')"
                         style="width:16px;height:16px;background:${c};border-radius:3px;cursor:pointer;border:2px solid ${c === currentColor ? '#333' : 'transparent'}"
                         title="${c}"></div>
                `).join('')}
                <div onclick="setTargetColor('${targetId}','')"
                     style="width:16px;height:16px;background:#fff;border-radius:3px;cursor:pointer;border:2px solid ${!currentColor ? '#333' : '#ccc'};font-size:8px;text-align:center;line-height:12px"
                     title="Tự động">A</div>
            </div>
        </div>
    `;

    // AM override
    const amOverrideVal = state.planning.amOverrides[targetId] || '';
    const filteredAMs = getFilteredAMList();
    infoHtml += `
        <div style="margin-top:6px;border-top:1px solid #eee;padding-top:4px">
            <div style="font-size:10px;font-weight:600;color:#888;margin-bottom:2px">ĐỔI AM</div>
            <input type="text" list="am-datalist" value="${amOverrideVal}" placeholder="Chọn hoặc gõ tên AM..."
                   onblur="setAMOverride('${targetId}', this.value)"
                   style="width:100%;padding:3px 4px;font-size:11px;border:1px solid #ccc;border-radius:3px">
            <datalist id="am-datalist">
                ${filteredAMs.map(am => `<option value="${am}">`).join('')}
            </datalist>
        </div>
    `;

    panel.style.display = 'block';
    panel.innerHTML = infoHtml;
}

// Get AM list filtered by current region/province
function getFilteredAMList() {
    const ams = new Set();
    state.postOffices.forEach(po => {
        if (!po.area_manager_name) return;
        if (state.filterRegions.length > 0 && !state.filterRegions.includes(po.region)) return;
        if (state.filterProvinces.length > 0 && !state.filterProvinces.includes(po.province_name)) return;
        ams.add(po.area_manager_name);
    });
    return [...ams].sort((a, b) => a.localeCompare(b, 'vi'));
}

// ============================================================
// Draft management
// ============================================================

function deleteDraft(id) {
    state.planning.draftPostOffices = state.planning.draftPostOffices.filter(d => d.id !== id);
    Object.keys(state.planning.wardOverrides).forEach(ma_xa => {
        if (state.planning.wardOverrides[ma_xa] === id) delete state.planning.wardOverrides[ma_xa];
    });
    delete state.planning.colorOverrides[id];
    delete state.planning.amOverrides[id];
    if (state.planning.selectedTargetId === id) {
        state.planning.selectedTargetId = state.planning.draftPostOffices.length > 0
            ? state.planning.draftPostOffices[0].id : null;
    }
    savePlanningData();
    renderDraftPostOffices();
    renderServiceAreas();
    buildTargetListUI();
    updateTargetInfoPanel();
    if (state.colorByGroup === 'buucuc' && activeLayer) activeLayer.setStyle(getStyle);
}

function clearAllDrafts() {
    if (!confirm('Xóa tất cả bưu cục nháp, gán xã, đổi AM?')) return;
    state.planning.draftPostOffices = [];
    state.planning.wardOverrides = {};
    state.planning.amOverrides = {};
    state.planning.colorOverrides = {};
    state.planning.selectedTargetId = null;
    savePlanningData();
    renderDraftPostOffices();
    renderServiceAreas();
    buildTargetListUI();
    updateTargetInfoPanel();
    if (state.colorByGroup === 'buucuc' && activeLayer) activeLayer.setStyle(getStyle);
}

// ============================================================
// Ward assignment (click or paint)
// ============================================================

function handlePlanningFeatureClick(feature, layer, e) {
    if (state.planning.mode === 'assign' || state.planning.mode === 'paint') {
        const ma_xa = feature.properties.ma_xa;
        if (!ma_xa || !state.planning.selectedTargetId) return;

        // Check if ward is currently assigned to this target (via override OR original data)
        const currentTarget = getWarehouseForWard(ma_xa);
        if (currentTarget === state.planning.selectedTargetId) {
            // Unassign: mark as _unassigned so it's removed from this target
            const origWd = state.wardData[ma_xa];
            const origTarget = origWd ? origWd.buu_cuc_ma : null;
            if (origTarget === state.planning.selectedTargetId) {
                // Original data points here — need special marker
                state.planning.wardOverrides[ma_xa] = '_unassigned';
            } else {
                // Was an override — just delete it
                delete state.planning.wardOverrides[ma_xa];
            }
        } else {
            // If assigning back to original BC, just remove override (restore)
            const origWd = state.wardData[ma_xa];
            const origTarget = origWd ? origWd.buu_cuc_ma : null;
            if (origTarget === state.planning.selectedTargetId) {
                delete state.planning.wardOverrides[ma_xa];
            } else {
                state.planning.wardOverrides[ma_xa] = state.planning.selectedTargetId;
            }
        }

        layer.setStyle(getStyle(feature));
        savePlanningData();
        buildTargetListUI();
        updateTargetInfoPanel();

        if (buucucBorderLayer || state.colorByGroup === 'buucuc') {
            const features = [];
            activeLayer.eachLayer(l => { if (l.feature) features.push(l.feature); });
            renderBuucucBorders({ features });
        }
    } else if (state.planning.mode === 'draw' && drawingPolygonPoints.length > 0) {
        addDrawingPoint(e.latlng);
    }
}

// ============================================================
// Service area drawing
// ============================================================

function renderServiceAreas() {
    if (planningServiceLayer) { map.removeLayer(planningServiceLayer); planningServiceLayer = null; }
    if (!state.planning.active) return;

    const layers = [];
    state.planning.draftPostOffices.forEach(draft => {
        if (!draft.serviceArea) return;
        const color = state.planning.colorOverrides[draft.id] || PLANNING_COLOR;

        if (draft.serviceArea.type === 'circle') {
            layers.push(L.circle([draft.latitude, draft.longitude], {
                radius: draft.serviceArea.radius, color, weight: 2, dashArray: '6,4',
                fillColor: color, fillOpacity: 0.08, interactive: false,
            }));
        } else if (draft.serviceArea.type === 'polygon') {
            layers.push(L.polygon(draft.serviceArea.latlngs, {
                color, weight: 2, dashArray: '6,4',
                fillColor: color, fillOpacity: 0.08, interactive: false,
            }));
        }
    });

    if (layers.length > 0) planningServiceLayer = L.layerGroup(layers).addTo(map);
}

function drawServiceRadius() {
    const draft = state.planning.draftPostOffices.find(d => d.id === state.planning.selectedTargetId);
    if (!draft) return;
    const km = parseFloat(document.getElementById('planning-radius').value) || 3;
    draft.serviceArea = { type: 'circle', radius: km * 1000 };
    savePlanningData();
    renderServiceAreas();
}

function startDrawPolygon() {
    const draft = state.planning.draftPostOffices.find(d => d.id === state.planning.selectedTargetId);
    if (!draft) return;

    const btn = document.getElementById('btn-draw-polygon');
    if (drawingPolygonPoints.length > 0) { finishDrawPolygon(); return; }

    drawingPolygonPoints = [];
    btn.textContent = 'Xong vẽ';
    btn.classList.add('active');
    document.getElementById('map').classList.add('map-crosshair');
    map.on('click', onDrawPolygonClick);
}

function onDrawPolygonClick(e) {
    if (state.planning.mode !== 'draw' || !document.getElementById('btn-draw-polygon').classList.contains('active')) return;
    addDrawingPoint(e.latlng);
}

function addDrawingPoint(latlng) {
    drawingPolygonPoints.push([latlng.lat, latlng.lng]);
    if (drawingTempLayer) map.removeLayer(drawingTempLayer);
    if (drawingPolygonPoints.length >= 2) {
        drawingTempLayer = L.polyline(drawingPolygonPoints, { color: PLANNING_COLOR, weight: 2, dashArray: '4,4' }).addTo(map);
    } else {
        drawingTempLayer = L.circleMarker(latlng, { radius: 5, color: PLANNING_COLOR, fillColor: PLANNING_COLOR, fillOpacity: 1 }).addTo(map);
    }
}

function finishDrawPolygon() {
    map.off('click', onDrawPolygonClick);
    const draft = state.planning.draftPostOffices.find(d => d.id === state.planning.selectedTargetId);
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
    if (btn) { btn.textContent = 'Vẽ tay'; btn.classList.remove('active'); }
    map.off('click', onDrawPolygonClick);
}

// ============================================================
// Export CSV
// ============================================================

function exportPlanningCSV() {
    const hasData = state.planning.draftPostOffices.length > 0 ||
                    Object.keys(state.planning.wardOverrides).length > 0 ||
                    Object.keys(state.planning.amOverrides).length > 0;
    if (!hasData) { alert('Chưa có dữ liệu quy hoạch để xuất'); return; }

    // 1. Draft post offices
    if (state.planning.draftPostOffices.length > 0) {
        const headers = ['id', 'name', 'category', 'latitude', 'longitude', 'notes', 'ward_count', 'am', 'nearest_po', 'nearest_distance_km'];
        const rows = state.planning.draftPostOffices.map(d => {
            const nearest = findNearestPostOffice(d.latitude, d.longitude);
            const wardCount = Object.values(state.planning.wardOverrides).filter(id => id === d.id).length;
            return [d.id, d.name, d.category, d.latitude, d.longitude, d.notes || '',
                wardCount, state.planning.amOverrides[d.id] || '',
                nearest ? nearest.po.warehouse_name : '', nearest ? nearest.distance.toFixed(2) : '',
            ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
        });
        downloadCSV('draft-post-offices.csv', headers.join(',') + '\n' + rows.join('\n'));
    }

    // 2. Ward reassignments
    const overrides = Object.entries(state.planning.wardOverrides);
    if (overrides.length > 0) {
        const headers = ['ma_xa', 'ten_xa', 'ten_huyen', 'ten_tinh', 'old_buu_cuc_ma', 'old_buu_cuc_ten', 'new_target_id', 'new_target_name', 'new_am'];
        const rows = overrides.map(([ma_xa, targetId]) => {
            const wd = state.wardData[ma_xa] || {};
            return [ma_xa, wd.ten_xa || '', wd.ten_huyen || '', wd.ten_tinh || '',
                wd.buu_cuc_ma || '', wd.buu_cuc_ten || '',
                targetId, getTargetName(targetId),
                state.planning.amOverrides[targetId] || '',
            ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
        });
        downloadCSV('ward-reassignments.csv', headers.join(',') + '\n' + rows.join('\n'));
    }

    // 3. AM changes
    const amChanges = Object.entries(state.planning.amOverrides);
    if (amChanges.length > 0) {
        const headers = ['target_id', 'target_name', 'target_type', 'new_am', 'old_am'];
        const rows = amChanges.map(([id, newAM]) => {
            const po = state.postOffices.find(p => p.warehouse_id === id);
            const draft = state.planning.draftPostOffices.find(d => d.id === id);
            const type = draft ? 'draft' : 'real';
            const name = draft ? draft.name : (po ? po.warehouse_name : id);
            const oldAM = po ? (po.area_manager_name || '') : '';
            return [id, name, type, newAM, oldAM].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
        });
        downloadCSV('am-changes.csv', headers.join(',') + '\n' + rows.join('\n'));
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

// ============================================================
// Paint mode — rectangle drag to bulk-assign wards
// ============================================================

let paintRectLayer = null;
let paintStartLatLng = null;

function initPaintMode() {
    map.dragging.disable();
    map.on('mousedown', onPaintMouseDown);
}

function cleanupPaintMode() {
    map.dragging.enable();
    map.off('mousedown', onPaintMouseDown);
    map.off('mousemove', onPaintMouseMove);
    map.off('mouseup', onPaintMouseUp);
    if (paintRectLayer) { map.removeLayer(paintRectLayer); paintRectLayer = null; }
    paintStartLatLng = null;
}

function onPaintMouseDown(e) {
    if (state.planning.mode !== 'paint') return;
    paintStartLatLng = e.latlng;
    map.on('mousemove', onPaintMouseMove);
    map.on('mouseup', onPaintMouseUp);
}

function onPaintMouseMove(e) {
    if (!paintStartLatLng) return;
    const bounds = L.latLngBounds(paintStartLatLng, e.latlng);
    const color = state.planning.colorOverrides[state.planning.selectedTargetId] || PLANNING_COLOR;
    if (paintRectLayer) map.removeLayer(paintRectLayer);
    paintRectLayer = L.rectangle(bounds, {
        color, weight: 2, dashArray: '6,4', fillColor: color, fillOpacity: 0.15, interactive: false,
    }).addTo(map);
}

function onPaintMouseUp(e) {
    map.off('mousemove', onPaintMouseMove);
    map.off('mouseup', onPaintMouseUp);
    if (!paintStartLatLng || !state.planning.selectedTargetId) {
        if (paintRectLayer) { map.removeLayer(paintRectLayer); paintRectLayer = null; }
        paintStartLatLng = null;
        return;
    }

    const bounds = L.latLngBounds(paintStartLatLng, e.latlng);
    paintStartLatLng = null;

    const size = map.latLngToContainerPoint(bounds.getNorthEast())
        .subtract(map.latLngToContainerPoint(bounds.getSouthWest()));
    if (Math.abs(size.x) < 10 && Math.abs(size.y) < 10) {
        if (paintRectLayer) { map.removeLayer(paintRectLayer); paintRectLayer = null; }
        return;
    }

    let count = 0;
    if (activeLayer) {
        activeLayer.eachLayer(l => {
            if (!l.feature || !l.feature.properties.ma_xa) return;
            try {
                const centroid = turf.centroid(l.feature);
                const [lng, lat] = centroid.geometry.coordinates;
                if (bounds.contains([lat, lng])) {
                    const ma = l.feature.properties.ma_xa;
                    const origWd = state.wardData[ma];
                    const origTarget = origWd ? origWd.buu_cuc_ma : null;
                    // If assigning back to original, remove override (restore)
                    if (origTarget === state.planning.selectedTargetId) {
                        delete state.planning.wardOverrides[ma];
                    } else {
                        state.planning.wardOverrides[ma] = state.planning.selectedTargetId;
                    }
                    l.setStyle(getStyle(l.feature));
                    count++;
                }
            } catch (err) {}
        });
    }

    setTimeout(() => { if (paintRectLayer) { map.removeLayer(paintRectLayer); paintRectLayer = null; } }, 300);

    if (count > 0) {
        savePlanningData();
        buildTargetListUI();
        updateTargetInfoPanel();
        if (buucucBorderLayer || state.colorByGroup === 'buucuc') {
            const features = [];
            activeLayer.eachLayer(l => { if (l.feature) features.push(l.feature); });
            renderBuucucBorders({ features });
        }
    }
}
