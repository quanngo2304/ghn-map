# GHN Map - Bản đồ quản lý vận hành GHN

## Tổng quan
Web app bản đồ Việt Nam hiển thị ranh giới hành chính (trước/sau sáp nhập 01/07/2025), overlay dữ liệu vận hành GHN (bưu cục, tuyến, sản lượng, nhân sự).

## Deploy
- **GitHub:** https://github.com/quanngo2304/ghn-map (public)
- **Live:** https://quanngo2304.github.io/ghn-map/
- **Local:** `cd ~/Projects/ghn-map && python3 -m http.server 8080`
- **Push:** `cd ~/Projects/ghn-map && git add -A && git commit -m "message" && git push`

## Tech Stack
- **Leaflet.js** + GeoJSON — map rendering
- **PapaParse** — CSV parsing
- **Turf.js** — polygon union cho đường viền nhóm bưu cục
- **Single HTML app** — không cần build tool, mở local chạy được
- **Base map tiles** (chuyển đổi được qua layer control góc trái):
  - Google Maps (mặc định)
  - Google Satellite
  - Google Hybrid (vệ tinh + tên đường)
  - CartoDB Light (nền sáng tối giản)
  - OpenStreetMap

## Cấu trúc thư mục
```
ghn-map/
├── CLAUDE.md              ← File này
├── .gitignore             ← Ignore data/*-raw/
├── index.html             ← App chính (HTML + controls UI)
├── src/
│   ├── map.js             ← Core JS logic (state, render, controls, search, filters)
│   ├── planning.js        ← Planning module (đặt BC nháp, gán xã, vẽ vùng, export)
│   └── style.css          ← Styles + responsive + planning
├── scripts/
│   ├── split-geojson.py   ← Tách xa.geojson theo tỉnh (ma_tinh)
│   └── enrich-population.py ← Enrich dân số GSO 2019 vào GeoJSON 63 tỉnh
├── data/
│   ├── sau-sap-nhap/      ← GeoJSON simplified (34 tỉnh)
│   │   ├── tinh.geojson   ← 34 features, 5MB
│   │   ├── xa.geojson     ← 3,321 features, 30MB
│   │   └── xa/            ← Per-province xa files (34 files, lazy load)
│   ├── truoc-sap-nhap/    ← GeoJSON simplified (63 tỉnh)
│   │   ├── tinh.geojson   ← 63 features, 2.4MB (enriched: dan_so, dtich_km2, matdo_km2)
│   │   ├── huyen.geojson  ← 705 features, 4.7MB (enriched)
│   │   ├── xa.geojson     ← 10,614 features, 15MB (enriched)
│   │   └── xa/            ← Per-province xa files (63 files, lazy load)
│   ├── sau-sap-nhap-raw/  ← Original unsimplified (GITIGNORED, local only ~700MB)
│   ├── truoc-sap-nhap-raw/← Original unsimplified (GITIGNORED, local only ~316MB)
│   ├── ward-data.csv      ← 10,661 tuyến bưu cục cover phường xã toàn quốc
│   ├── post-offices.csv   ← 1,310 điểm vận hành (cleaned)
│   ├── regions.json       ← 14 vùng GHN (shortname → fullname)
│   └── province-regions.json ← 63 tỉnh → vùng mapping
├── public/
│   └── home-icon.png      ← House icon reference (Flaticon #1946436)
└── .git/
```

## Data Format

### ward-data.csv (10,661 rows — tuyến bưu cục cover phường xã)
| Column | Type | Mô tả |
|---|---|---|
| ghn_ward_id | string | Mã phường xã GHN (primary key) |
| ma_xa | string | Mã phường xã quốc gia (join với GeoJSON, 83% matched) |
| ten_xa | string | Tên phường xã |
| ghn_district_id | string | Mã quận huyện GHN |
| ten_huyen | string | Tên quận huyện |
| ghn_province_id | string | Mã tỉnh GHN |
| ten_tinh | string | Tên tỉnh |
| region | string | Vùng GHN (DSH, HNO, HCM...) |
| buu_cuc_ma | string | Mã bưu cục phụ trách |
| buu_cuc_ten | string | Tên bưu cục |
| am_name | string | Area Manager (chưa có data) |
| am_phone | string | SĐT AM (chưa có data) |
| nhan_vien | string | Nhân viên chạy tuyến (chưa có data) |
| sl_lay | number | Sản lượng lấy (chưa có data) |
| sl_giao | number | Sản lượng giao (chưa có data) |

### post-offices.csv (1,310 rows — điểm vận hành thật)
| Column | Type | Mô tả |
|---|---|---|
| warehouse_id | string | Mã bưu cục GHN |
| warehouse_name | string | Tên |
| warehouse_address | string | Địa chỉ |
| warehouse_category | string | buu_cuc / kho_trung_chuyen / kho_chuyen_tiep / giao_hang_nang |
| latitude, longitude | number | Tọa độ |
| area_manager_name | string | AM quản lý |
| ward_name, district_name, province_name | string | Địa chỉ hành chính |
| region, area | string | Vùng + miền |

**Nguồn gốc:** Cleaned từ file GHN internal 2,117 rows → loại bỏ điểm ảo (Sorting Crew, Ahamove, FTL, Fulfillment, Tech)
**Filter:** Giữ lại: tên chứa "Bưu Cục" / "Kho Trung Chuyển" / "Kho Chuyển Tiếp" / "Giao Hàng Nặng", loại "Tech"

## Features đã hoàn thành

### Map
- Toggle trước/sau sáp nhập (63/34 tỉnh)
- Drill-down: tỉnh → quận/huyện → phường/xã (chọn cấp hiển thị)
- Tô màu vùng: tự động (theo quận/huyện hoặc tỉnh) hoặc theo bưu cục (có đường viền nhóm bưu cục via turf.union)
- 5 base map layers: Google Maps/Satellite/Hybrid, CartoDB, OSM
- Popup on click: hiện mã quốc gia + mã GHN (ESC để đóng)
- Hover highlight
- Lazy loading: cấp xã với filter tỉnh/vùng load per-province files thay vì full 15-30MB

### Heatmap
- Mật độ dân cư: cấp tỉnh dùng mật độ (người/km²), cấp huyện/xã dùng dân số tuyệt đối
- Sau sáp nhập: data gốc từ gis.vn (chính xác cấp xã)
- Trước sáp nhập: dân số tỉnh từ GSO 2019, phân bổ theo tỷ lệ diện tích xuống huyện/xã (ước tính)
- Dynamic quantile breaks: tự tính 7 mức từ data hiển thị, legend cập nhật theo
- Sản lượng (cần data)
- Toggle bật/tắt

### Pin điểm vận hành
- 1,310 điểm: 1,170 BC + 17 KTC + 24 KCT + 100 GHN
- Icon: ngôi nhà cam (#F26522) cho KTC, ngôi nhà xanh (#00549A) cho KCT, tròn cho BC/GHN
- Hover phóng to, click popup thông tin
- Màu pin: dropdown chọn "Theo loại" hoặc "Theo AM" (271 AM, 30 màu)
- Toggle hiện/ẩn pin + hiện tên bưu cục
- Tất cả pin dùng DivIcon (không CircleMarker) để nằm trên GeoJSON layers

### Filter
- Lọc vùng: 14 vùng GHN, cascade xuống tỉnh
- Lọc tỉnh: filter theo vùng đã chọn, chọn nhiều, tìm kiếm, chọn tất cả/bỏ tất cả
- Filter áp dụng lên cả bản đồ + pin + danh sách BC thật trong quy hoạch

### Search
- Tìm tất cả cấp: tỉnh, quận/huyện, phường/xã, bưu cục, AM
- Checkbox chọn/bỏ từng kết quả + highlight vàng trên map
- Chọn tất cả / Bỏ tất cả / Zoom đã chọn
- Đặt đầu tiên trong menu controls

### View
- Lưu view mặc định (localStorage): zoom, vị trí, tất cả filter/toggle, trạng thái thu gọn sections
- Reset view về mặc định

### UI
- Collapsible sections: Bản đồ, Bưu cục, Lọc vùng/tỉnh, Quy hoạch — click header thu/mở
- Trạng thái thu gọn persist qua localStorage (Lưu view)
- Brand colors: cam GHN #F26522 toàn bộ UI (nút active, hover, highlights)
- Favicon + logo GHN từ ghn.vn

### Quy hoạch bưu cục (planning mode)
- Toggle bật/tắt chế độ quy hoạch, tắt → ward colors về nguyên trạng
- **Đặt BC nháp**: click map → form popup (tên, loại, ghi chú) → marker magenta diamond draggable
- **Target**: chọn BC nháp HOẶC BC thật (dropdown searchable, filter theo vùng/tỉnh)
- **Gán xã**: click xã → toggle assign/unassign (hỗ trợ `_unassigned` marker cho xã gốc)
- **Tô vùng**: kéo rectangle bulk-assign wards (paint mode, disable map drag)
- **Vẽ vùng PV**: bán kính (km) hoặc vẽ tay polygon (chỉ draft)
- **Color picker**: palette 18 màu cho mỗi target, hook vào `getDefaultStyle` qua `colorOverrides`
- **Đổi AM**: datalist suggest AM từ vùng/tỉnh đang filter, hoặc gõ tay. AM override reflect trong pin colors
- **Danh sách "ĐÃ CHỈNH"**: hiện BC thật có thay đổi (AM/xã +N/-N) với badge màu
- **So sánh**: đường dashed + khoảng cách đến BC gần nhất (turf.distance)
- **Ward count**: hiện `gốc +thêm -bỏ = tổng`, gán lại xã về BC gốc = restore (không count thêm)
- **Action buttons** (Gán xã/Tô vùng/Vẽ vùng PV) nằm trong info panel per-target
- **Persistence**: localStorage auto-save, export 3 CSV (draft-post-offices, ward-reassignments, am-changes)
- Logic tách riêng trong `src/planning.js`, hooks tối thiểu trong map.js
- Ward override: `state.planning.wardOverrides[ma_xa]` → ưu tiên hơn `wardData.buu_cuc_ma` (chỉ khi planning active)

### Responsive
- Mobile: controls panel thu gọn, nút Menu toggle
- Mobile: floating legends ẩn, heatmap legend inline trong Menu
- Touch-friendly: nút lớn, font tối thiểu 12px

## Versions
- **v1.0** (352a307): Core map, boundaries, pins, search, heatmap, filters
- **v2.0** (fd09878): Mobile responsive, region filter, save/reset view
- **v2.1** (ca5d159): Google Maps base layers, mobile legend fixes
- **v2.2** (37fc76e): CLAUDE.md full rewrite
- **v2.3** (659d554): Pin color toggle in controls panel
- **v2.4** (9cfb735): Pin color mode dùng dropdown select (fix mobile)
- **v2.5** (6e57581): Dân số 63 tỉnh (GSO 2019), lazy load GeoJSON theo tỉnh, mã GHN trong popup, dynamic heatmap breaks
- **v2.6** (e90d66f): Đường viền nhóm bưu cục (turf.union merge polygons cùng bưu cục)
- **v3.0** (6b1db41): Quy hoạch bưu cục — đặt nháp, gán xã, vẽ vùng phục vụ, so sánh khoảng cách, export CSV
- **v3.1**: Brand GHN (favicon/logo/colors), collapsible menu, quy hoạch BC thật, tô vùng, color picker, đổi AM, danh sách đã chỉnh, fix ward toggle/count

## GeoJSON Source
- Tải từ gis.vn (host tại vn2000.vn/diachinh/)
- Simplified bằng mapshaper (`dp 10-15%`): 277MB → 30MB
- Sau sáp nhập: 34 tỉnh, dữ liệu có sẵn dân số + diện tích + mật độ (từ gis.vn)
- Trước sáp nhập: 63 tỉnh, dân số enriched từ GSO 2019 census (tỉnh chính xác, huyện/xã ước tính theo tỷ lệ diện tích)

## Ward matching
- GHN dùng mã nội bộ (ghn_ward_id), GeoJSON dùng mã quốc gia (ma_xa)
- Match bằng normalize tên: strip prefix (Xã/Phường/Huyện) + match (ward_name, district_name)
- Kết quả: 8,894/10,661 matched (83%) — 1,767 xã mới sau sáp nhập không match được
- GHN master data: 11,988 wards, 723 districts, 63 provinces, 14 regions

## GHN Brand Colors
- Orange: #F26522
- Blue: #00549A

## Lưu ý khi code
- GeoJSON simplified nhưng vẫn nặng (xa.geojson 15-30MB) — dùng lazy load per-province khi filter active
- Cache-busting: `DATA_VERSION` trong map.js, tăng khi update data files
- Heatmap: `getHeatmapValue()` chọn metric theo level (tỉnh→mật độ, huyện/xã→dân số tuyệt đối)
- `computeHeatmapBreaks()` tính quantile breaks dynamic từ data hiện tại
- Province name normalize: `normalizeProvName()` xử lý "TP." prefix + unicode NFC
- CSV load bằng PapaParse (CDN)
- Planning logic tách riêng `src/planning.js`, map.js chỉ có hooks tối thiểu
- Ward override chỉ active khi `state.planning.active` — tắt quy hoạch = về nguyên trạng
- `_unassigned` marker trong wardOverrides = xã bị bỏ khỏi BC gốc
- `colorOverrides` hook trong `getDefaultStyle` → ưu tiên hơn `getGroupColor`
- `amOverrides` hook trong `renderPostOffices` → override AM color cho pin
- State lưu trong object `state`, render functions: `renderLayer()`, `renderPostOffices()`
- Pin dùng DivIcon (không phải CircleMarker) để nằm trên GeoJSON layers
- Mobile: floating legends ẩn (`display:none !important`), heatmap legend inline trong controls
- Mobile: dùng native `<select>` cho toggle thay vì button group (button toggle active class không reliable trên mobile)
- View persistence: `localStorage` key `ghn-map-view`, load trong `init()`
- Phường xã tô màu theo `ma_huyen` (nhóm quận/huyện) khi view cấp xã ở mode 63 tỉnh

## Backlog
- [ ] Import AM data vào ward-data.csv (cần file GHN)
- [ ] Import sản lượng lấy/giao (cần file GHN)
- [ ] Import nhân viên chạy tuyến (cần file GHN)
- [x] Research mật độ dân cư cho bản đồ 63 tỉnh → Done: GSO 2019 census, phân bổ theo diện tích
- [x] Tách GeoJSON theo tỉnh để lazy load → Done: 63+34 per-province xa files
- [ ] Dân số thực cấp xã/huyện (hiện tại ước tính từ tỉnh, cần data GSO chi tiết hơn)
- [ ] Export view thành ảnh/PDF
- [ ] 38 xã hoàn toàn không match — cần GeoJSON mới hơn từ gis.vn
