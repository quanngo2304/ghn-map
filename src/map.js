// ============================================================
// GHN Map - Main Application
// ============================================================

// State
const state = {
    mode: 'truoc',         // 'sau' | 'truoc'
    level: 'tinh',         // 'tinh' | 'huyen' | 'xa'
    heatmap: 'off',        // 'off' | 'dancu' | 'sanluong'
    showPostOffices: true,
    pinColorMode: 'category', // 'category' | 'am'
    showLabels: false,
    filterProvinces: [],   // empty = show all
    filterRegions: [],     // empty = show all
    colorByGroup: 'auto',  // 'auto' | 'buucuc'
    geodata: {},           // cached geojson
    wardData: {},          // ma_xa -> row
    wardDataByGhn: {},     // ghn_ward_id -> row
    postOffices: [],       // array of post office objects
    amColorMap: {},        // am_name -> color
    regions: {},           // shortname -> fullname
    provinceRegions: {},   // province_name -> region_shortname
    ghnProvinceMap: {},    // ten_tinh -> ghn_province_id
    ghnDistrictMap: {},    // "ten_huyen|ten_tinh" -> ghn_district_id
    provinceCodeMap: {},   // ten_tinh -> ma_tinh (for lazy loading)
};

// GHN logo colors
const GHN_ORANGE = '#F26522';
const GHN_BLUE = '#00549A';

// House SVG icon (from Flaticon #1946436), colorized
function houseIconSvg(color, size) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">
        <path fill="${color}" d="M256 24.585L0 248.753h64v238.662h160V358.748h64v128.667h160V248.753h64z"/>
    </svg>`;
}

// Pin styles per category
const PIN_STYLES = {
    kho_trung_chuyen: { size: 28, shape: 'house', color: GHN_ORANGE, label: 'Kho Trung Chuyển' },
    kho_chuyen_tiep:  { size: 22, shape: 'house', color: GHN_BLUE, label: 'Kho Chuyển Tiếp' },
    buu_cuc:          { radius: 8,  shape: 'circle', color: '#3498db', label: 'Bưu Cục' },
    giao_hang_nang:   { radius: 8,  shape: 'circle', color: '#2ecc71', label: 'Giao Hàng Nặng' },
};

// Distinct colors for AM coloring (30 colors)
const AM_COLORS = [
    '#e6194b','#3cb44b','#ffe119','#4363d8','#f58231','#911eb4','#42d4f4','#f032e6',
    '#bfef45','#fabed4','#469990','#dcbeff','#9A6324','#fffac8','#800000','#aaffc3',
    '#808000','#ffd8b1','#000075','#a9a9a9','#e6beff','#1abc9c','#e74c3c','#3498db',
    '#9b59b6','#f39c12','#1abc9c','#e84393','#00b894','#6c5ce7',
];

// Map init
const map = L.map('map', {
    center: [16.5, 106.5],
    zoom: 6,
    zoomControl: false,
});

L.control.zoom({ position: 'topleft' }).addTo(map);

// Base map layers
const baseLayers = {
    'Google Maps': L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        attribution: '&copy; Google Maps',
    }),
    'Google Satellite': L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        attribution: '&copy; Google Maps',
    }),
    'Google Hybrid': L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        attribution: '&copy; Google Maps',
    }),
    'CartoDB Light': L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        attribution: '&copy; OSM &copy; CARTO',
    }),
    'OSM': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
    }),
};

baseLayers['Google Maps'].addTo(map);
L.control.layers(baseLayers, null, { position: 'topleft' }).addTo(map);

// Layers
let activeLayer = null;
let postOfficeLayer = null;
let buucucBorderLayer = null;

// ============================================================
// Data loading
// ============================================================

const DATA_VERSION = '2.5';

async function loadGeoJSON(path) {
    if (state.geodata[path]) return state.geodata[path];
    const res = await fetch(path + '?v=' + DATA_VERSION);
    const data = await res.json();
    state.geodata[path] = data;
    return data;
}

// Load per-province GeoJSON files and merge into one FeatureCollection
async function loadProvinceFiles(mode, level, provinceNames) {
    const prefix = mode === 'sau' ? 'data/sau-sap-nhap' : 'data/truoc-sap-nhap';
    const codes = provinceNames
        .map(name => state.provinceCodeMap[name])
        .filter(Boolean);
    if (codes.length === 0) return null;

    const collections = await Promise.all(
        codes.map(code => loadGeoJSON(`${prefix}/${level}/${code}.geojson`).catch(() => null))
    );

    return {
        type: 'FeatureCollection',
        features: collections.filter(Boolean).flatMap(c => c.features),
    };
}

async function loadCSV(path) {
    return new Promise((resolve, reject) => {
        Papa.parse(path, {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: (results) => resolve(results.data),
            error: reject,
        });
    });
}

// Normalize province name for matching (handle unicode variants + prefixes)
function normalizeProvName(name) {
    return (name || '').normalize('NFC').replace(/^TP\.\s*/, '').trim();
}

async function loadWardData() {
    try {
        const rows = await loadCSV('data/ward-data.csv');
        rows.forEach(row => {
            if (row.ma_xa) state.wardData[row.ma_xa] = row;
            if (row.ghn_ward_id) state.wardDataByGhn[row.ghn_ward_id] = row;
            if (row.ten_tinh && row.ghn_province_id) {
                state.ghnProvinceMap[row.ten_tinh] = row.ghn_province_id;
                state.ghnProvinceMap[normalizeProvName(row.ten_tinh)] = row.ghn_province_id;
            }
            if (row.ten_huyen && row.ghn_district_id) {
                state.ghnDistrictMap[row.ten_huyen + '|' + row.ten_tinh] = row.ghn_district_id;
            }
        });
    } catch (e) {
        console.log('Ward data not loaded:', e);
    }
}

async function loadRegions() {
    try {
        const res = await fetch('data/regions.json');
        state.regions = await res.json();
        const res2 = await fetch('data/province-regions.json');
        state.provinceRegions = await res2.json();
    } catch (e) {
        console.log('Regions not loaded:', e);
    }
}

async function loadPostOffices() {
    try {
        const rows = await loadCSV('data/post-offices.csv');
        state.postOffices = rows;
        // Build AM color map
        const ams = [...new Set(rows.map(r => r.area_manager_name).filter(Boolean))].sort();
        ams.forEach((am, i) => { state.amColorMap[am] = AM_COLORS[i % AM_COLORS.length]; });
    } catch (e) {
        console.log('Post office data not loaded:', e);
    }
}

// ============================================================
// Styling
// ============================================================

const COLORS = {
    default: { fill: '#3498db', border: '#2980b9' },
    hover: { fill: '#e74c3c', border: '#c0392b' },
    heatmap: {
        dancu: ['#ffffcc','#c7e9b4','#7fcdbb','#41b6c4','#1d91c0','#225ea8','#0c2c84'],
        sanluong: ['#fff5f0','#fee0d2','#fcbba1','#fc9272','#fb6a4a','#ef3b2c','#99000d'],
    },
    // Palette for grouping by province
    group: [
        '#3498db','#e67e22','#2ecc71','#9b59b6','#1abc9c',
        '#e74c3c','#f39c12','#3498db','#d35400','#27ae60',
        '#8e44ad','#16a085','#c0392b','#2980b9','#f1c40f',
        '#7f8c8d','#2c3e50','#e84393','#00b894','#6c5ce7',
        '#fd79a8','#a29bfe','#55efc4','#fab1a0','#74b9ff',
        '#dfe6e9','#636e72','#b2bec3','#0984e3','#d63031',
        '#00cec9','#e17055','#fdcb6e','#6ab04c',
    ],
};

// Map code -> color index for consistent group coloring
const groupColorMap = {};
let groupColorIdx = 0;

function getGroupColor(code) {
    if (!code) return COLORS.group[0];
    if (!(code in groupColorMap)) {
        groupColorMap[code] = groupColorIdx % COLORS.group.length;
        groupColorIdx++;
    }
    return COLORS.group[groupColorMap[code]];
}

// Build ma_xa -> warehouse_id map for coloring by buu cuc
function getWarehouseForWard(ma_xa) {
    const wd = state.wardData[ma_xa];
    return wd ? wd.buu_cuc_ma : null;
}

function getDefaultStyle(feature) {
    const props = feature.properties;

    // Color by bưu cục if mode is active
    if (state.colorByGroup === 'buucuc' && props.ma_xa) {
        const wh = getWarehouseForWard(props.ma_xa);
        if (wh) {
            const fill = getGroupColor('wh-' + wh);
            return {
                fillColor: fill,
                weight: 2.5,
                opacity: 1,
                color: fill,
                fillOpacity: 0.4,
            };
        }
    }

    // When viewing sub-levels, color by parent group
    if (state.level !== 'tinh' && props.ma_tinh) {
        // For xa level: group by huyen if available, else by tinh
        let groupKey;
        if (state.level === 'xa' && props.ma_huyen) {
            groupKey = props.ma_huyen;
        } else {
            groupKey = props.ma_tinh;
        }
        return {
            fillColor: getGroupColor(groupKey),
            weight: 1,
            opacity: 0.8,
            color: '#fff',
            fillOpacity: 0.35,
        };
    }
    return {
        fillColor: COLORS.default.fill,
        weight: 1,
        opacity: 0.8,
        color: COLORS.default.border,
        fillOpacity: 0.15,
    };
}

// Get heatmap value for a feature based on current level
function getHeatmapValue(feature) {
    const props = feature.properties;
    if (state.heatmap === 'dancu') {
        // Province level: use density; district/ward: use absolute population
        if (state.level === 'tinh') {
            return props.matdo_km2 || props.dan_cu || 0;
        }
        return props.dan_so || 0;
    } else if (state.heatmap === 'sanluong') {
        const wd = state.wardData[props.ma_xa];
        return wd ? (parseInt(wd.sl_lay) || 0) + (parseInt(wd.sl_giao) || 0) : 0;
    }
    return 0;
}

// Compute quantile breaks from current layer data
function computeHeatmapBreaks(geojson) {
    const values = [];
    if (geojson) {
        geojson.features.forEach(f => {
            const val = getHeatmapValue(f);
            if (val > 0) values.push(val);
        });
    }
    if (values.length < 7) return null;
    values.sort((a, b) => a - b);
    const n = values.length;
    return [
        0,
        values[Math.floor(n * 0.14)],
        values[Math.floor(n * 0.28)],
        values[Math.floor(n * 0.43)],
        values[Math.floor(n * 0.57)],
        values[Math.floor(n * 0.71)],
        values[Math.floor(n * 0.86)],
    ].map(v => Math.round(v));
}

// Cache current breaks (recalculated on each renderLayer)
let currentHeatmapBreaks = null;

function getHeatmapStyle(feature) {
    let colors;
    const value = getHeatmapValue(feature);

    if (state.heatmap === 'dancu') {
        colors = COLORS.heatmap.dancu;
    } else if (state.heatmap === 'sanluong') {
        colors = COLORS.heatmap.sanluong;
    }

    const breaks = currentHeatmapBreaks || [0, 100, 500, 1000, 3000, 5000, 10000];
    let colorIdx = 0;
    for (let i = 0; i < breaks.length; i++) {
        if (value >= breaks[i]) colorIdx = i;
    }

    return {
        fillColor: colors[Math.min(colorIdx, colors.length - 1)],
        weight: 1,
        opacity: 0.6,
        color: '#666',
        fillOpacity: 0.6,
    };
}

function getStyle(feature) {
    if (state.heatmap !== 'off') return getHeatmapStyle(feature);
    return getDefaultStyle(feature);
}

function highlightStyle() {
    return {
        fillColor: COLORS.hover.fill,
        weight: 2,
        color: COLORS.hover.border,
        fillOpacity: 0.3,
    };
}

// ============================================================
// Popup content
// ============================================================

function lookupGhnProvince(tenTinh) {
    return state.ghnProvinceMap[tenTinh] || state.ghnProvinceMap[normalizeProvName(tenTinh)];
}

function buildPopup(props) {
    const level = props.cap;
    let html = '';

    if (level === 1) {
        // Tỉnh
        const ghnProv = lookupGhnProvince(props.ten_tinh);
        html = `<h4>${props.ten_tinh}</h4><table>
            <tr><td>Mã</td><td>${props.ma_tinh}${ghnProv ? ' (GHN: ' + ghnProv + ')' : ''}</td></tr>
            <tr><td>Loại</td><td>${props.loai}</td></tr>
            ${props.dan_so ? `<tr><td>Dân số</td><td>${Number(props.dan_so).toLocaleString('vi')}</td></tr>` : ''}
            ${props.dtich_km2 ? `<tr><td>Diện tích</td><td>${Number(props.dtich_km2).toLocaleString('vi')} km²</td></tr>` : ''}
            ${props.matdo_km2 ? `<tr><td>Mật độ</td><td>${Number(props.matdo_km2).toLocaleString('vi')} người/km²</td></tr>` : ''}
            ${props.sap_nhap ? `<tr><td>Sáp nhập từ</td><td>${props.sap_nhap}</td></tr>` : ''}
            ${props.quy_mo ? `<tr><td>Quy mô</td><td>${props.quy_mo}</td></tr>` : ''}
        </table>`;
    } else if (level === 2 && props.ma_huyen) {
        // Quận huyện (trước sáp nhập)
        const ghnDist = state.ghnDistrictMap[props.ten_huyen + '|' + props.ten_tinh];
        const ghnProv = lookupGhnProvince(props.ten_tinh);
        html = `<h4>${props.ten_huyen}</h4><table>
            <tr><td>Mã</td><td>${props.ma_huyen}${ghnDist ? ' (GHN: ' + ghnDist + ')' : ''}</td></tr>
            <tr><td>Loại</td><td>${props.loai}</td></tr>
            <tr><td>Tỉnh</td><td>${props.ten_tinh}${ghnProv ? ' (' + ghnProv + ')' : ''}</td></tr>
            ${props.dan_so ? `<tr><td>Dân số</td><td>${Number(props.dan_so).toLocaleString('vi')}</td></tr>` : ''}
            ${props.dtich_km2 ? `<tr><td>Diện tích</td><td>${Number(props.dtich_km2).toLocaleString('vi')} km²</td></tr>` : ''}
            ${props.matdo_km2 ? `<tr><td>Mật độ</td><td>${Number(props.matdo_km2).toLocaleString('vi')} người/km²</td></tr>` : ''}
        </table>`;
    } else {
        // Phường xã
        const name = props.ten_xa || props.ten_huyen;
        const code = props.ma_xa || props.ma_huyen;
        const wd = state.wardData[code] || {};
        const ghnWard = wd.ghn_ward_id;
        const ghnProv = lookupGhnProvince(props.ten_tinh);

        html = `<h4>${name}</h4><table>
            <tr><td>Mã</td><td>${code}${ghnWard ? ' (GHN: ' + ghnWard + ')' : ''}</td></tr>
            <tr><td>Loại</td><td>${props.loai}</td></tr>
            <tr><td>Tỉnh</td><td>${props.ten_tinh}${ghnProv ? ' (' + ghnProv + ')' : ''}</td></tr>
            ${props.ten_huyen ? `<tr><td>Quận/Huyện</td><td>${props.ten_huyen}</td></tr>` : ''}
            ${props.dan_so ? `<tr><td>Dân số</td><td>${Number(props.dan_so).toLocaleString('vi')}</td></tr>` : ''}
            ${props.dtich_km2 ? `<tr><td>Diện tích</td><td>${Number(props.dtich_km2).toLocaleString('vi')} km²</td></tr>` : ''}
            ${props.matdo_km2 ? `<tr><td>Mật độ</td><td>${Number(props.matdo_km2).toLocaleString('vi')} người/km²</td></tr>` : ''}
            ${props.sap_nhap ? `<tr><td>Sáp nhập từ</td><td>${props.sap_nhap}</td></tr>` : ''}
        </table>`;

        // Ward operation data
        if (wd.am_name) {
            html += `<hr style="margin:6px 0;border:none;border-top:1px solid #eee"><table>
                <tr><td>AM</td><td>${wd.am_name} ${wd.am_phone ? '(' + wd.am_phone + ')' : ''}</td></tr>
                ${wd.buu_cuc_ten ? `<tr><td>Bưu cục</td><td>${wd.buu_cuc_ten}</td></tr>` : ''}
                ${wd.nhan_vien ? `<tr><td>Nhân viên</td><td>${wd.nhan_vien}</td></tr>` : ''}
                ${wd.sl_lay ? `<tr><td>SL Lấy</td><td>${Number(wd.sl_lay).toLocaleString('vi')} đơn/ngày</td></tr>` : ''}
                ${wd.sl_giao ? `<tr><td>SL Giao</td><td>${Number(wd.sl_giao).toLocaleString('vi')} đơn/ngày</td></tr>` : ''}
            </table>`;
        }
    }

    return html;
}

function buildPostOfficePopup(po) {
    const cat = PIN_STYLES[po.warehouse_category] || PIN_STYLES.buu_cuc;
    return `<h4>${cat.label}: ${po.warehouse_name}</h4><table>
        <tr><td>Mã</td><td>${po.warehouse_id}</td></tr>
        <tr><td>Địa chỉ</td><td>${po.warehouse_address}</td></tr>
        ${po.area_manager_name ? `<tr><td>AM</td><td>${po.area_manager_name}</td></tr>` : ''}
        <tr><td>Phường/Xã</td><td>${po.ward_name || '-'}</td></tr>
        <tr><td>Quận/Huyện</td><td>${po.district_name || '-'}</td></tr>
        <tr><td>Tỉnh</td><td>${po.province_name || '-'}</td></tr>
        <tr><td>Vùng</td><td>${po.region} - ${po.area}</td></tr>
    </table>`;
}

// ============================================================
// Layer rendering
// ============================================================

function getDataPath() {
    const prefix = state.mode === 'sau' ? 'data/sau-sap-nhap' : 'data/truoc-sap-nhap';
    return `${prefix}/${state.level}.geojson`;
}

let hoveredLayer = null;

async function renderLayer() {
    if (activeLayer) {
        map.removeLayer(activeLayer);
        activeLayer = null;
    }

    // Check if level is available for current mode
    if (state.mode === 'sau' && state.level === 'huyen') {
        // Sau sáp nhập không có cấp huyện riêng, skip to xa
        state.level = 'xa';
        document.getElementById('level-select').value = 'xa';
    }

    const hasRegionFilter = state.filterRegions.length > 0;
    const hasProvinceFilter = state.filterProvinces.length > 0;

    // Lazy load: for xa level with province/region filter, load per-province files
    let filteredGeojson = null;
    if (state.level === 'xa' && (hasProvinceFilter || hasRegionFilter)) {
        let provinceNames;
        if (hasProvinceFilter) {
            provinceNames = state.filterProvinces;
        } else {
            provinceNames = Object.entries(state.provinceRegions)
                .filter(([, reg]) => state.filterRegions.includes(reg))
                .map(([name]) => name);
        }
        filteredGeojson = await loadProvinceFiles(state.mode, 'xa', provinceNames);
    }

    // Fallback: load full file and filter client-side
    if (!filteredGeojson) {
        const path = getDataPath();
        const geojson = await loadGeoJSON(path);

        if (hasRegionFilter || hasProvinceFilter) {
            filteredGeojson = {
                type: 'FeatureCollection',
                features: geojson.features.filter(f => {
                    const p = f.properties;
                    if (hasProvinceFilter) return state.filterProvinces.includes(p.ten_tinh);
                    if (hasRegionFilter) {
                        const reg = getProvinceRegion(p.ten_tinh);
                        return state.filterRegions.includes(reg);
                    }
                    return true;
                }),
            };
        } else {
            filteredGeojson = geojson;
        }
    }

    // Compute dynamic heatmap breaks from current data
    if (state.heatmap !== 'off') {
        currentHeatmapBreaks = computeHeatmapBreaks(filteredGeojson);
    }

    activeLayer = L.geoJSON(filteredGeojson, {
        style: getStyle,
        onEachFeature: (feature, layer) => {
            // Click popup
            layer.on('click', (e) => {
                L.popup()
                    .setLatLng(e.latlng)
                    .setContent(buildPopup(feature.properties))
                    .openOn(map);
            });

            // Hover highlight
            layer.on('mouseover', () => {
                if (hoveredLayer) hoveredLayer.setStyle(getStyle(hoveredLayer.feature));
                layer.setStyle(highlightStyle());
                hoveredLayer = layer;
            });

            layer.on('mouseout', () => {
                if (hoveredLayer === layer) {
                    layer.setStyle(getStyle(feature));
                    hoveredLayer = null;
                }
            });
        }
    }).addTo(map);

    // Render bưu cục group borders
    renderBuucucBorders(filteredGeojson);

    updateLegend();
}

// Draw thick dark borders around groups of wards sharing the same buu_cuc
// Uses turf.union to merge polygons so only outer boundary is drawn
function renderBuucucBorders(geojson) {
    if (buucucBorderLayer) {
        map.removeLayer(buucucBorderLayer);
        buucucBorderLayer = null;
    }

    if (state.colorByGroup !== 'buucuc' || state.level !== 'xa' || state.heatmap !== 'off') return;
    if (!geojson || !geojson.features) return;
    if (typeof turf === 'undefined') return;

    // Group features by buu_cuc_ma
    const groups = {};
    geojson.features.forEach(f => {
        const wh = getWarehouseForWard(f.properties.ma_xa);
        if (wh) {
            if (!groups[wh]) groups[wh] = [];
            groups[wh].push(f);
        }
    });

    // Merge polygons per group using turf.union, draw only outer boundary
    const borderLayers = [];
    Object.values(groups).forEach(features => {
        if (features.length < 1) return;
        try {
            const merged = turf.union(turf.featureCollection(features));
            if (merged) {
                borderLayers.push(L.geoJSON(merged, {
                    style: {
                        fillColor: 'transparent',
                        fillOpacity: 0,
                        weight: 2,
                        opacity: 0.7,
                        color: '#444',
                    },
                    interactive: false,
                }));
            }
        } catch (e) {
            // Fallback: skip group if union fails (e.g. invalid geometry)
        }
    });

    if (borderLayers.length > 0) {
        buucucBorderLayer = L.layerGroup(borderLayers).addTo(map);
    }
}

let labelLayer = null;

function renderPostOffices() {
    if (postOfficeLayer) {
        map.removeLayer(postOfficeLayer);
        postOfficeLayer = null;
    }
    if (labelLayer) {
        map.removeLayer(labelLayer);
        labelLayer = null;
    }

    if (!state.showPostOffices || state.postOffices.length === 0) return;

    // Filter by region and province
    const filtered = state.postOffices.filter(po => {
        if (!po.latitude || !po.longitude) return false;
        if (state.filterRegions.length > 0) {
            const poRegion = getProvinceRegion(po.province_name);
            if (!state.filterRegions.includes(poRegion)) return false;
        }
        if (state.filterProvinces.length > 0 && !state.filterProvinces.includes(po.province_name)) return false;
        return true;
    });

    const markers = [];
    const labels = [];

    filtered.forEach(po => {
        const cat = po.warehouse_category || 'buu_cuc';
        const pinStyle = PIN_STYLES[cat] || PIN_STYLES.buu_cuc;

        let fillColor;
        if (state.pinColorMode === 'am' && po.area_manager_name) {
            fillColor = state.amColorMap[po.area_manager_name] || '#999';
        } else {
            fillColor = pinStyle.color;
        }

        const lat = parseFloat(po.latitude);
        const lng = parseFloat(po.longitude);
        let marker;

        if (pinStyle.shape === 'house') {
            const s = pinStyle.size;
            const icon = L.divIcon({
                className: 'pin-hover-target pin-house-wrap',
                html: houseIconSvg(fillColor, s),
                iconSize: [s, s],
                iconAnchor: [s/2, s],
            });
            marker = L.marker([lat, lng], { icon });
        } else {
            // Use DivIcon for circles too so they render above GeoJSON polygon layers
            const s = pinStyle.radius * 2;
            const icon = L.divIcon({
                className: 'pin-hover-target',
                html: `<div class="pin-shape pin-circle" style="width:${s}px;height:${s}px;background:${fillColor};border-radius:50%;"></div>`,
                iconSize: [s + 8, s + 8],
                iconAnchor: [(s+8)/2, (s+8)/2],
            });
            marker = L.marker([lat, lng], { icon });
        }

        marker.bindPopup(buildPostOfficePopup(po));
        markers.push(marker);

        // Label (shown only when toggled on)
        if (state.showLabels) {
            const labelIcon = L.divIcon({
                className: 'pin-label',
                html: `<span>${po.warehouse_name}</span>`,
                iconSize: [120, 16],
                iconAnchor: [-8, 8],
            });
            labels.push(L.marker([lat, lng], { icon: labelIcon, interactive: false }));
        }
    });

    postOfficeLayer = L.layerGroup(markers).addTo(map);
    if (labels.length > 0) {
        labelLayer = L.layerGroup(labels).addTo(map);
    }
    updatePinLegend();
}

// ============================================================
// Legend
// ============================================================

function updateLegend() {
    const legend = document.getElementById('legend');
    const content = document.getElementById('legend-content');

    if (state.heatmap === 'off') {
        legend.style.display = 'none';
        const mobileLegend = document.getElementById('mobile-legend-content');
        if (mobileLegend) mobileLegend.innerHTML = '';
        return;
    }

    legend.style.display = 'block';
    let colors, title, unit;

    if (state.heatmap === 'dancu') {
        colors = COLORS.heatmap.dancu;
        if (state.level === 'tinh') {
            title = 'Mật độ dân cư';
            unit = 'người/km²';
        } else {
            title = 'Dân số';
            unit = 'người';
        }
    } else {
        colors = COLORS.heatmap.sanluong;
        title = 'Sản lượng';
        unit = 'đơn/ngày';
    }

    // Use dynamic breaks from current data
    const breaks = currentHeatmapBreaks || [0, 100, 500, 1000, 3000, 5000, 10000];
    function fmtBreak(v) {
        if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
        if (v >= 1000) return (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'K';
        return String(v);
    }
    const labels = breaks.map((b, i) => i === breaks.length - 1 ? fmtBreak(b) + '+' : fmtBreak(b));

    // Compute stats from current layer
    let min = Infinity, max = 0, sum = 0, count = 0;
    if (activeLayer) {
        activeLayer.eachLayer(l => {
            if (!l.feature) return;
            const val = getHeatmapValue(l.feature);
            if (val > 0) {
                min = Math.min(min, val);
                max = Math.max(max, val);
                sum += val;
                count++;
            }
        });
    }
    const avg = count > 0 ? Math.round(sum / count) : 0;
    if (min === Infinity) min = 0;

    const legendHtml = `
        <div class="legend-title">${title} <span style="font-weight:400;color:#999">(${unit})</span></div>
        <div class="legend-scale">
            ${colors.map(c => `<div style="flex:1;background:${c}"></div>`).join('')}
        </div>
        <div class="legend-labels">
            ${labels.map(l => `<span>${l}</span>`).join('')}
        </div>
        <div class="legend-stats">
            Thấp nhất: <span>${Math.round(min).toLocaleString('vi')}</span> ·
            Trung bình: <span>${avg.toLocaleString('vi')}</span> ·
            Cao nhất: <span>${Math.round(max).toLocaleString('vi')}</span>
        </div>
    `;
    content.innerHTML = legendHtml;

    // Also update mobile inline legend
    const mobileLegend = document.getElementById('mobile-legend-content');
    if (mobileLegend) mobileLegend.innerHTML = legendHtml;
}

function updatePinLegend() {
    const el = document.getElementById('pin-legend-static');
    if (!el) return;

    if (!state.showPostOffices) {
        el.style.display = 'none';
        return;
    }

    el.style.display = 'block';

    // Filter count by province filter
    const filtered = state.filterProvinces.length > 0
        ? state.postOffices.filter(p => state.filterProvinces.includes(p.province_name))
        : state.postOffices;

    const catItems = Object.entries(PIN_STYLES).map(([key, s]) => {
        let shape = '';
        if (s.shape === 'house') {
            shape = `<span class="pin-legend-icon" style="border:none;box-shadow:none;">${houseIconSvg(s.color, 18)}</span>`;
        } else {
            shape = `<span class="pin-legend-icon" style="width:${s.radius*2}px;height:${s.radius*2}px;background:${s.color};border-radius:50%;"></span>`;
        }
        const count = filtered.filter(p => p.warehouse_category === key).length;
        return `<div class="pin-legend-row">${shape}<span>${s.label} (${count})</span></div>`;
    }).join('');

    el.innerHTML = `
        <div class="legend-title">Điểm vận hành <span style="font-weight:400;color:#999">(${filtered.length} điểm)</span></div>
        ${catItems}
        <div class="pin-legend-mode">
            <span>Màu pin:</span>
            <a href="#" onclick="switchPinColor('category');return false" class="${state.pinColorMode==='category'?'active':''}">Loại</a>
            <a href="#" onclick="switchPinColor('am');return false" class="${state.pinColorMode==='am'?'active':''}">AM</a>
        </div>
    `;
}

function switchPinColor(mode) {
    state.pinColorMode = mode;
    const sel = document.getElementById('pin-color-select');
    if (sel) sel.value = mode;
    renderPostOffices();
}

// ============================================================
// Search
// ============================================================

let searchHighlightLayer = null;
window._searchResults = [];
window._searchSelected = new Set();

function clearSearchHighlights() {
    if (searchHighlightLayer) {
        map.removeLayer(searchHighlightLayer);
        searchHighlightLayer = null;
    }
}

async function handleSearch(query) {
    const container = document.getElementById('search-results');
    if (!query || query.length < 2) {
        container.innerHTML = '';
        window._searchResults = [];
        window._searchSelected.clear();
        clearSearchHighlights();
        return;
    }

    const q = query.toLowerCase();
    const results = [];

    // Search across ALL loaded geodata (all levels, all modes)
    const prefix = state.mode === 'sau' ? 'data/sau-sap-nhap' : 'data/truoc-sap-nhap';
    const levels = state.mode === 'sau' ? ['tinh', 'xa'] : ['tinh', 'huyen', 'xa'];

    for (const lvl of levels) {
        const path = `${prefix}/${lvl}.geojson`;
        try {
            const geojson = await loadGeoJSON(path);
            geojson.features.forEach(f => {
                const p = f.properties;
                const name = p.ten_xa || p.ten_huyen || p.ten_tinh || '';
                const parent = p.ten_tinh || '';
                const parentHuyen = p.ten_huyen || '';
                if (name.toLowerCase().includes(q) || parent.toLowerCase().includes(q)) {
                    let type;
                    if (p.cap === 1) type = 'tinh';
                    else if (p.ma_huyen && !p.ma_xa) type = 'huyen';
                    else type = 'xa';
                    // Avoid duplicates
                    const key = `${type}-${p.ma_tinh || ''}-${p.ma_huyen || ''}-${p.ma_xa || ''}`;
                    if (!results.find(r => r.key === key)) {
                        let subtitle = '';
                        if (type === 'xa') subtitle = [parentHuyen, parent].filter(Boolean).join(', ');
                        else if (type === 'huyen') subtitle = parent;
                        results.push({ name, subtitle, type, feature: f, key });
                    }
                }
            });
        } catch (e) { /* level not available */ }
    }

    // Search post offices
    state.postOffices.forEach(po => {
        const searchFields = [po.warehouse_name, po.warehouse_id, po.area_manager_name, po.district_name, po.province_name].join(' ').toLowerCase();
        if (searchFields.includes(q)) {
            const cat = PIN_STYLES[po.warehouse_category] || PIN_STYLES.buu_cuc;
            results.push({
                name: po.warehouse_name,
                subtitle: `${po.district_name || ''}, ${po.province_name || ''} ${po.area_manager_name ? '· AM: ' + po.area_manager_name : ''}`,
                type: 'buucuc',
                po,
                key: 'bc-' + po.warehouse_id,
            });
        }
    });

    window._searchResults = results.slice(0, 50);
    window._searchSelected.clear();
    clearSearchHighlights();

    // Render results with checkboxes
    let html = '';
    if (results.length > 1) {
        html += `<div class="search-actions">
            <span class="search-count">${results.length > 50 ? '50+' : results.length} kết quả</span>
            <a href="#" onclick="searchSelectAll(event)">Chọn tất cả</a>
            <a href="#" onclick="searchDeselectAll(event)">Bỏ tất cả</a>
            <a href="#" onclick="searchZoomSelected(event)">Zoom đã chọn</a>
        </div>`;
    }
    html += window._searchResults.map((r, i) => {
        const typeLabel = { tinh: 'Tỉnh', huyen: 'Huyện', xa: 'Xã', buucuc: 'BC' }[r.type];
        return `<div class="search-item">
            <label>
                <input type="checkbox" onchange="searchToggle(${i}, this.checked)" />
                <span class="type-badge ${r.type}">${typeLabel}</span>
                <span class="search-name">${r.name}</span>
                ${r.subtitle ? `<span class="search-subtitle">${r.subtitle}</span>` : ''}
            </label>
        </div>`;
    }).join('');

    container.innerHTML = html;
}

function searchToggle(idx, checked) {
    if (checked) {
        window._searchSelected.add(idx);
    } else {
        window._searchSelected.delete(idx);
    }
    updateSearchHighlights();
}

function searchSelectAll(e) {
    e.preventDefault();
    const checkboxes = document.querySelectorAll('#search-results input[type=checkbox]');
    checkboxes.forEach((cb, i) => { cb.checked = true; window._searchSelected.add(i); });
    updateSearchHighlights();
}

function searchDeselectAll(e) {
    e.preventDefault();
    const checkboxes = document.querySelectorAll('#search-results input[type=checkbox]');
    checkboxes.forEach((cb, i) => { cb.checked = false; });
    window._searchSelected.clear();
    clearSearchHighlights();
}

function searchZoomSelected(e) {
    e.preventDefault();
    if (window._searchSelected.size === 0) return;

    const bounds = L.latLngBounds();
    window._searchSelected.forEach(idx => {
        const r = window._searchResults[idx];
        if (r.po) {
            bounds.extend([parseFloat(r.po.latitude), parseFloat(r.po.longitude)]);
        } else if (r.feature) {
            const layer = L.geoJSON(r.feature);
            bounds.extend(layer.getBounds());
        }
    });

    if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] });
    }
}

function updateSearchHighlights() {
    clearSearchHighlights();
    if (window._searchSelected.size === 0) return;

    const layers = [];
    window._searchSelected.forEach(idx => {
        const r = window._searchResults[idx];
        if (r.po) {
            layers.push(L.circleMarker([parseFloat(r.po.latitude), parseFloat(r.po.longitude)], {
                radius: 10, fillColor: '#f1c40f', color: '#e74c3c', weight: 3, fillOpacity: 0.8,
            }).bindPopup(buildPostOfficePopup(r.po)));
        } else if (r.feature) {
            layers.push(L.geoJSON(r.feature, {
                style: { fillColor: '#f1c40f', weight: 3, color: '#e74c3c', fillOpacity: 0.4 },
            }));
        }
    });

    searchHighlightLayer = L.layerGroup(layers).addTo(map);
}

// ============================================================
// Controls
// ============================================================

function switchMode(mode) {
    state.mode = mode;
    document.getElementById('btn-sau').classList.toggle('active', mode === 'sau');
    document.getElementById('btn-truoc').classList.toggle('active', mode === 'truoc');

    // Update level options
    const select = document.getElementById('level-select');
    const huyenOption = select.querySelector('option[value="huyen"]');
    if (mode === 'sau') {
        huyenOption.disabled = true;
        huyenOption.textContent = 'Quận / Huyện (không có)';
        if (state.level === 'huyen') {
            state.level = 'tinh';
            select.value = 'tinh';
        }
    } else {
        huyenOption.disabled = false;
        huyenOption.textContent = 'Quận / Huyện';
    }

    state.filterProvinces = [];
    renderLayer();
    buildProvinceFilter();
    renderPostOffices();
}

function changeLevel(level) {
    state.level = level;
    renderLayer();
}

function switchColorGroup(mode) {
    state.colorByGroup = mode;
    document.getElementById('btn-color-auto').classList.toggle('active', mode === 'auto');
    document.getElementById('btn-color-buucuc').classList.toggle('active', mode === 'buucuc');
    if (activeLayer) {
        activeLayer.setStyle(getStyle);
        // Re-render bưu cục borders with current geojson
        const features = [];
        activeLayer.eachLayer(l => { if (l.feature) features.push(l.feature); });
        renderBuucucBorders({ features });
    }
}

function toggleControls() {
    const panel = document.getElementById('controls');
    const btn = document.getElementById('controls-toggle');
    panel.classList.toggle('collapsed');
    btn.textContent = panel.classList.contains('collapsed') ? 'Menu' : 'Đóng';
}

function toggleHeatmap(mode) {
    state.heatmap = mode;
    document.getElementById('btn-heatmap-off').classList.toggle('active', mode === 'off');
    document.getElementById('btn-heatmap-dancu').classList.toggle('active', mode === 'dancu');
    document.getElementById('btn-heatmap-sanluong').classList.toggle('active', mode === 'sanluong');

    // Recalculate breaks from visible data
    if (mode !== 'off' && activeLayer) {
        const features = [];
        activeLayer.eachLayer(l => { if (l.feature) features.push(l.feature); });
        currentHeatmapBreaks = computeHeatmapBreaks({ features });
    }

    if (activeLayer) {
        activeLayer.setStyle(getStyle);
    }
    updateLegend();
}

function togglePostOffices(show) {
    state.showPostOffices = show;
    renderPostOffices();
}

function toggleLabels(show) {
    state.showLabels = show;
    renderPostOffices();
}

function closeInfo() {
    document.getElementById('info-panel').style.display = 'none';
}

// ============================================================
// Region filter
// ============================================================

function buildRegionFilter() {
    const container = document.getElementById('region-filter');
    if (!container || !state.regions) return;

    const regionEntries = Object.entries(state.regions).sort((a, b) => a[1].localeCompare(b[1], 'vi'));

    let html = `<div class="province-filter-actions">
        <a href="#" onclick="filterSelectAllRegions(event)">Tất cả</a>
        <a href="#" onclick="filterClearRegions(event)">Bỏ chọn</a>
        <span class="filter-count" id="region-count">${regionEntries.length}/${regionEntries.length}</span>
    </div>`;
    html += `<div class="province-list" style="max-height:100px">`;
    regionEntries.forEach(([short, full]) => {
        const checked = state.filterRegions.length === 0 || state.filterRegions.includes(short);
        html += `<label class="province-item"><input type="checkbox" value="${short}" onchange="toggleRegionFilter()" ${checked ? 'checked' : ''} />${short} - ${full}</label>`;
    });
    html += `</div>`;
    container.innerHTML = html;
}

function toggleRegionFilter() {
    const checkboxes = document.querySelectorAll('#region-filter .province-list input[type=checkbox]');
    const all = [];
    const checked = [];
    checkboxes.forEach(cb => {
        all.push(cb.value);
        if (cb.checked) checked.push(cb.value);
    });

    state.filterRegions = checked.length === all.length ? [] : checked;

    const countEl = document.getElementById('region-count');
    if (countEl) countEl.textContent = `${checked.length}/${all.length}`;

    // Auto-update province filter based on region selection
    updateProvincesByRegion();
    renderLayer();
    renderPostOffices();
}

function filterSelectAllRegions(e) {
    e.preventDefault();
    document.querySelectorAll('#region-filter .province-list input[type=checkbox]').forEach(cb => cb.checked = true);
    toggleRegionFilter();
}

function filterClearRegions(e) {
    e.preventDefault();
    document.querySelectorAll('#region-filter .province-list input[type=checkbox]').forEach(cb => cb.checked = false);
    toggleRegionFilter();
}

function updateProvincesByRegion() {
    // When regions are filtered, auto-check/uncheck matching provinces
    if (state.filterRegions.length === 0) {
        // All regions → reset province filter
        state.filterProvinces = [];
        buildProvinceFilter();
        return;
    }

    // Find provinces in selected regions
    const allowedProvinces = new Set();
    for (const [prov, reg] of Object.entries(state.provinceRegions)) {
        if (state.filterRegions.includes(reg)) {
            allowedProvinces.add(prov);
        }
    }

    state.filterProvinces = [...allowedProvinces];
    buildProvinceFilter();
}

function getProvinceRegion(provinceName) {
    return state.provinceRegions[provinceName] || '';
}

// ============================================================
// Province filter
// ============================================================

function buildProvinceFilter() {
    const container = document.getElementById('province-filter');
    // Get provinces from current mode's tinh geojson
    const prefix = state.mode === 'sau' ? 'data/sau-sap-nhap' : 'data/truoc-sap-nhap';
    const path = `${prefix}/tinh.geojson`;
    const geojson = state.geodata[path];
    if (!geojson) return;

    const provinces = geojson.features
        .map(f => f.properties.ten_tinh)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'vi'));

    let html = `<div class="province-filter-actions">
        <a href="#" onclick="filterSelectAllProvinces(event)">Tất cả</a>
        <a href="#" onclick="filterClearProvinces(event)">Bỏ chọn</a>
        <span class="filter-count">${state.filterProvinces.length || provinces.length}/${provinces.length}</span>
    </div>`;
    html += `<input type="text" id="province-search" placeholder="Tìm tỉnh..." oninput="filterProvinceSearch(this.value)" class="province-search" />`;
    html += `<div class="province-list">`;
    provinces.forEach(p => {
        const checked = state.filterProvinces.length === 0 || state.filterProvinces.includes(p);
        html += `<label class="province-item"><input type="checkbox" value="${p}" onchange="toggleProvinceFilter()" ${checked ? 'checked' : ''} />${p}</label>`;
    });
    html += `</div>`;

    container.innerHTML = html;
}

function toggleProvinceFilter() {
    const checkboxes = document.querySelectorAll('.province-list input[type=checkbox]');
    const all = [];
    const checked = [];
    checkboxes.forEach(cb => {
        all.push(cb.value);
        if (cb.checked) checked.push(cb.value);
    });

    // If all checked, treat as no filter
    if (checked.length === all.length) {
        state.filterProvinces = [];
    } else {
        state.filterProvinces = checked;
    }

    // Update count
    const countEl = document.querySelector('.filter-count');
    if (countEl) countEl.textContent = `${checked.length}/${all.length}`;

    renderLayer();
    renderPostOffices();
}

function filterSelectAllProvinces(e) {
    e.preventDefault();
    document.querySelectorAll('.province-list input[type=checkbox]').forEach(cb => cb.checked = true);
    toggleProvinceFilter();
}

function filterClearProvinces(e) {
    e.preventDefault();
    document.querySelectorAll('.province-list input[type=checkbox]').forEach(cb => cb.checked = false);
    toggleProvinceFilter();
}

function filterProvinceSearch(query) {
    const q = query.toLowerCase();
    document.querySelectorAll('.province-item').forEach(el => {
        const name = el.textContent.toLowerCase();
        el.style.display = name.includes(q) ? '' : 'none';
    });
}

// ============================================================
// Save / Load / Reset view
// ============================================================

const DEFAULT_STATE = {
    mode: 'truoc',
    level: 'tinh',
    heatmap: 'off',
    showPostOffices: true,
    pinColorMode: 'category',
    showLabels: false,
    filterProvinces: [],
    filterRegions: [],
    colorByGroup: 'auto',
    mapCenter: [16.5, 106.5],
    mapZoom: 6,
};

function saveView() {
    const view = {
        mode: state.mode,
        level: state.level,
        heatmap: state.heatmap,
        showPostOffices: state.showPostOffices,
        pinColorMode: state.pinColorMode,
        showLabels: state.showLabels,
        filterProvinces: state.filterProvinces,
        filterRegions: state.filterRegions,
        colorByGroup: state.colorByGroup,
        mapCenter: [map.getCenter().lat, map.getCenter().lng],
        mapZoom: map.getZoom(),
    };
    localStorage.setItem('ghn-map-view', JSON.stringify(view));
    alert('Đã lưu view mặc định');
}

function resetView() {
    localStorage.removeItem('ghn-map-view');
    applyViewState(DEFAULT_STATE);
    alert('Đã reset về mặc định');
}

function loadSavedView() {
    try {
        const saved = localStorage.getItem('ghn-map-view');
        if (saved) return JSON.parse(saved);
    } catch (e) {}
    return null;
}

function applyViewState(view) {
    state.mode = view.mode;
    state.level = view.level;
    state.heatmap = view.heatmap;
    state.showPostOffices = view.showPostOffices;
    state.pinColorMode = view.pinColorMode;
    state.showLabels = view.showLabels;
    state.filterProvinces = view.filterProvinces || [];
    state.filterRegions = view.filterRegions || [];
    state.colorByGroup = view.colorByGroup;

    // Update map position
    if (view.mapCenter && view.mapZoom) {
        map.setView(view.mapCenter, view.mapZoom);
    }

    // Update UI toggles
    document.getElementById('btn-sau').classList.toggle('active', state.mode === 'sau');
    document.getElementById('btn-truoc').classList.toggle('active', state.mode === 'truoc');
    document.getElementById('level-select').value = state.level;
    document.getElementById('btn-heatmap-off').classList.toggle('active', state.heatmap === 'off');
    document.getElementById('btn-heatmap-dancu').classList.toggle('active', state.heatmap === 'dancu');
    document.getElementById('btn-heatmap-sanluong').classList.toggle('active', state.heatmap === 'sanluong');
    document.getElementById('btn-color-auto').classList.toggle('active', state.colorByGroup === 'auto');
    document.getElementById('btn-color-buucuc').classList.toggle('active', state.colorByGroup === 'buucuc');
    document.getElementById('chk-buucuc').checked = state.showPostOffices;
    document.getElementById('chk-labels').checked = state.showLabels;

    // Update huyen option
    const huyenOption = document.getElementById('level-select').querySelector('option[value="huyen"]');
    if (state.mode === 'sau') {
        huyenOption.disabled = true;
        huyenOption.textContent = 'Quận / Huyện (không có)';
    } else {
        huyenOption.disabled = false;
        huyenOption.textContent = 'Quận / Huyện';
    }

    // Re-render
    renderLayer();
    buildRegionFilter();
    buildProvinceFilter();
    renderPostOffices();
    updateLegend();
}

// ============================================================
// Init
// ============================================================

async function init() {
    const loading = document.getElementById('loading');

    try {
        // Load saved view into state before rendering
        const saved = loadSavedView();
        if (saved) {
            state.mode = saved.mode || DEFAULT_STATE.mode;
            state.level = saved.level || DEFAULT_STATE.level;
            state.heatmap = saved.heatmap || DEFAULT_STATE.heatmap;
            state.showPostOffices = saved.showPostOffices !== undefined ? saved.showPostOffices : true;
            state.pinColorMode = saved.pinColorMode || DEFAULT_STATE.pinColorMode;
            state.showLabels = saved.showLabels || false;
            state.filterProvinces = saved.filterProvinces || [];
            state.filterRegions = saved.filterRegions || [];
            state.colorByGroup = saved.colorByGroup || DEFAULT_STATE.colorByGroup;
            if (saved.mapCenter && saved.mapZoom) {
                map.setView(saved.mapCenter, saved.mapZoom);
            }
        }

        await Promise.all([
            loadWardData(),
            loadPostOffices(),
            loadRegions(),
        ]);

        // Build province name → code mapping for lazy loading
        const [tinhTruoc, tinhSau] = await Promise.all([
            loadGeoJSON('data/truoc-sap-nhap/tinh.geojson'),
            loadGeoJSON('data/sau-sap-nhap/tinh.geojson'),
        ]);
        [tinhTruoc, tinhSau].forEach(g => {
            g.features.forEach(f => {
                state.provinceCodeMap[f.properties.ten_tinh] = f.properties.ma_tinh;
            });
        });

        // Apply UI state
        document.getElementById('btn-sau').classList.toggle('active', state.mode === 'sau');
        document.getElementById('btn-truoc').classList.toggle('active', state.mode === 'truoc');
        document.getElementById('level-select').value = state.level;
        document.getElementById('btn-heatmap-off').classList.toggle('active', state.heatmap === 'off');
        document.getElementById('btn-heatmap-dancu').classList.toggle('active', state.heatmap === 'dancu');
        document.getElementById('btn-heatmap-sanluong').classList.toggle('active', state.heatmap === 'sanluong');
        document.getElementById('btn-color-auto').classList.toggle('active', state.colorByGroup === 'auto');
        document.getElementById('btn-color-buucuc').classList.toggle('active', state.colorByGroup === 'buucuc');
        document.getElementById('chk-buucuc').checked = state.showPostOffices;
        document.getElementById('chk-labels').checked = state.showLabels;

        await renderLayer();
        buildRegionFilter();
        buildProvinceFilter();
        renderPostOffices();
        updateLegend();
    } catch (e) {
        console.error('Init error:', e);
    } finally {
        loading.style.display = 'none';
    }
}

// Close popup on ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        map.closePopup();
    }
});

init();
