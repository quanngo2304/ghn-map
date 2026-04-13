# GHN Map - Ban do van hanh

Web app ban do Viet Nam hien thi ranh gioi hanh chinh (truoc/sau sap nhap 01/07/2025), overlay du lieu van hanh GHN (buu cuc, tuyen, san luong, nhan su).

**Live:** https://quanngo2304.github.io/ghn-map/

## Tinh nang chinh

### Ban do
- Toggle truoc/sau sap nhap (63/34 tinh)
- Drill-down: tinh > quan/huyen > phuong/xa
- To mau vung tu dong hoac theo buu cuc (co duong vien nhom buu cuc)
- 5 base map layers: Google Maps/Satellite/Hybrid, CartoDB, OSM
- Popup click hien ma quoc gia + ma GHN
- Lazy loading: cap xa voi filter tinh/vung load per-province files

### Heatmap
- Mat do dan cu (tinh dung matdo_km2, huyen/xa dung dan_so tuyet doi)
- Dynamic quantile breaks tu tinh 7 muc tu data hien thi
- Data: sau sap nhap tu gis.vn, truoc sap nhap tu GSO 2019 census

### Pin diem van hanh
- 1,310 diem: 1,170 Buu Cuc + 17 KTC + 24 KCT + 100 GHN
- Mau pin theo loai hoac theo AM (271 AM, 30 mau)

### Loc & Tim kiem
- Loc vung (14 vung GHN), cascade xuong tinh
- Loc tinh: filter theo vung da chon
- Tim kiem da cap: tinh, huyen, xa, buu cuc, AM

### Quy hoach buu cuc
- Dat buu cuc nhap: click map, form popup, marker draggable
- Chon BC that lam target (dropdown searchable, filter theo vung/tinh)
- Gan xa: click xa polygon toggle assign/unassign
- To vung: keo rectangle bulk-assign wards
- Ve vung phuc vu: ban kinh (km) hoac ve tay polygon
- Color picker: palette 18 mau cho moi target
- Doi AM: datalist suggest AM tu vung/tinh, hoac go tay
- Danh sach "DA CHINH": hien BC that co thay doi (AM/xa +N/-N)
- So sanh: duong dashed + khoang cach den BC gan nhat (turf.distance)
- Ward count: hien goc +them -bo = tong
- Thu gon info panel de xem tong quan
- Persistence: localStorage auto-save
- Export 3 CSV: draft-post-offices, ward-reassignments, am-changes

### UI
- Collapsible sections menu
- Brand colors GHN (#F26522 cam, #00549A xanh)
- Luu/Reset view (localStorage)
- Mobile responsive

## Tech Stack

- **Leaflet.js** + GeoJSON - map rendering
- **PapaParse** - CSV parsing
- **Turf.js** - polygon union, distance calculation
- Single HTML app, khong can build tool
- Deploy: GitHub Pages (static)

## Cau truc thu muc

```
ghn-map/
├── index.html             # App chinh (HTML + controls UI)
├── src/
│   ├── map.js             # Core JS logic (state, render, controls, search, filters)
│   ├── planning.js        # Planning module (dat BC nhap, gan xa, ve vung, export)
│   └── style.css          # Styles + responsive + planning
├── scripts/
│   ├── split-geojson.py   # Tach xa.geojson theo tinh (ma_tinh)
│   └── enrich-population.py # Enrich dan so GSO 2019 vao GeoJSON 63 tinh
├── data/
│   ├── sau-sap-nhap/      # GeoJSON 34 tinh (co dan so tu gis.vn)
│   │   ├── tinh.geojson
│   │   ├── xa.geojson
│   │   └── xa/            # Per-province xa files (34 files)
│   ├── truoc-sap-nhap/    # GeoJSON 63 tinh (enriched GSO 2019)
│   │   ├── tinh.geojson
│   │   ├── huyen.geojson
│   │   ├── xa.geojson
│   │   └── xa/            # Per-province xa files (63 files)
│   ├── ward-data.csv      # 10,661 tuyen buu cuc cover phuong xa
│   ├── post-offices.csv   # 1,310 diem van hanh
│   ├── regions.json       # 14 vung GHN
│   └── province-regions.json # 63 tinh -> vung mapping
├── public/
│   ├── favicon.png        # GHN favicon
│   ├── ghn-logo.png       # GHN logo
│   └── home-icon.png      # House icon reference
├── CLAUDE.md              # Full project spec cho AI assistant
└── README.md              # File nay
```

## Chay local

```bash
cd ghn-map
python3 -m http.server 8080
# Mo http://localhost:8080
```

## Deploy

```bash
git add -A && git commit -m "message" && git push
# GitHub Pages tu deploy tu branch main
```

## Data

### ward-data.csv (10,661 rows)
Map phuong xa -> buu cuc phu trach. Cot chinh:
- `ma_xa`: Ma phuong xa quoc gia (join voi GeoJSON)
- `ghn_ward_id`: Ma noi bo GHN
- `buu_cuc_ma`, `buu_cuc_ten`: Buu cuc phu trach
- `region`: Vung GHN (DSH, HNO, HCM...)

### post-offices.csv (1,310 rows)
Diem van hanh that. Cot chinh:
- `warehouse_id`, `warehouse_name`: Ma va ten
- `warehouse_category`: buu_cuc / kho_trung_chuyen / kho_chuyen_tiep / giao_hang_nang
- `latitude`, `longitude`: Toa do
- `area_manager_name`: AM quan ly

### GeoJSON
- Tai tu gis.vn, simplified bang mapshaper (dp 10-15%)
- Truoc sap nhap: enriched dan so GSO 2019 (tinh chinh xac, huyen/xa uoc tinh theo ty le dien tich)
- Sau sap nhap: data dan so goc tu gis.vn

## Luu y khi code

- GeoJSON nang (xa.geojson 15-30MB) -> dung lazy load per-province khi filter active
- Cache-busting: `DATA_VERSION` trong map.js, tang khi update data files
- Planning logic tach rieng `src/planning.js`, map.js chi co hooks toi thieu
- Ward override chi active khi `state.planning.active`
- `_unassigned` marker trong wardOverrides = xa bi bo khoi BC goc
- `colorOverrides` hook trong `getDefaultStyle`
- `amOverrides` hook trong `renderPostOffices`
- Pin dung DivIcon (khong phai CircleMarker) de nam tren GeoJSON layers
- Popup: check trung ten voi label (tranh "Buu Cuc: Buu Cuc...")

## Versions

| Version | Noi dung |
|---------|----------|
| v1.0 | Core map, boundaries, pins, search, heatmap, filters |
| v2.0 | Mobile responsive, region filter, save/reset view |
| v2.5 | Dan so GSO 2019, lazy load, ma GHN popup, dynamic heatmap |
| v2.6 | Duong vien nhom buu cuc (turf.union) |
| v3.0 | Quy hoach buu cuc - dat nhap, gan xa, ve vung, export CSV |
| v3.1 | Brand GHN, collapsible menu, quy hoach BC that, to vung, color picker, doi AM |
| v3.2 | Panel UX: thu gon info, BC search accessible, tinh filter theo vung |

## Tac gia

**Quan Ngo Ngoc (Saul)** - Giam doc Vung Dong Bang Song Hong, GHN Express
