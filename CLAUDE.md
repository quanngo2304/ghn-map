# GHN Map - Bản đồ quản lý vận hành GHN

## Tổng quan
Web app bản đồ Việt Nam hiển thị ranh giới hành chính (trước/sau sáp nhập 01/07/2025), overlay dữ liệu vận hành GHN (bưu cục, tuyến, sản lượng, nhân sự).

## Tech Stack
- **Leaflet.js** + GeoJSON — map rendering
- **Single HTML app** — không cần build tool, mở local chạy được
- Tile: OpenStreetMap (mặc định) hoặc CartoDB (sáng/tối)

## Cấu trúc thư mục
```
ghn-map/
├── CLAUDE.md           ← File này
├── index.html          ← App chính
├── src/
│   ├── map.js          ← Map core logic
│   ├── layers.js       ← Layer management (toggle trước/sau sáp nhập, drill-down)
│   ├── data-loader.js  ← Load GeoJSON + CSV data
│   ├── popup.js        ← Popup content builder
│   ├── controls.js     ← UI controls (search, filter, toggle)
│   └── style.css       ← Styles
├── data/
│   ├── sau-sap-nhap/   ← GeoJSON ranh giới sau sáp nhập (34 tỉnh)
│   │   ├── tinh.geojson
│   │   ├── huyen.geojson
│   │   └── xa.geojson
│   ├── truoc-sap-nhap/ ← GeoJSON ranh giới trước sáp nhập (63 tỉnh)
│   │   ├── tinh.geojson
│   │   ├── huyen.geojson
│   │   └── xa.geojson
│   ├── ward-data.csv       ← Thông tin phường xã (AM, bưu cục, sản lượng...)
│   ├── post-offices.csv    ← Thông tin bưu cục + tọa độ pin
│   └── population.csv      ← Mật độ dân cư + diện tích (research từ GSO/WorldPop)
└── public/                 ← Static assets nếu cần
```

## Data Format

### ward-data.csv
| Column | Type | Mô tả |
|---|---|---|
| ma_xa | string | Mã phường xã (key join với GeoJSON) |
| ten_xa | string | Tên phường xã |
| ma_huyen | string | Mã quận huyện |
| ma_tinh | string | Mã tỉnh thành |
| am_name | string | Area Manager |
| am_phone | string | SĐT AM |
| buu_cuc_ma | string | Mã bưu cục phụ trách |
| buu_cuc_ten | string | Tên bưu cục |
| nhan_vien | string | Nhân viên chạy tuyến |
| sl_lay | number | Sản lượng lấy (đơn/ngày) |
| sl_giao | number | Sản lượng giao (đơn/ngày) |
| dan_cu | number | Mật độ dân cư (người/km²) |
| dien_tich | number | Diện tích (km²) |
| dan_so | number | Dân số |

### post-offices.csv
| Column | Type | Mô tả |
|---|---|---|
| buu_cuc_ma | string | Mã bưu cục |
| buu_cuc_ten | string | Tên bưu cục |
| lat | number | Vĩ độ |
| lng | number | Kinh độ |
| dia_chi | string | Địa chỉ |
| am_name | string | AM quản lý |
| am_phone | string | SĐT AM |
| so_nhan_vien | number | Số nhân viên |
| so_tuyen | number | Số tuyến |
| sl_lay_ngay | number | Sản lượng lấy/ngày |
| sl_giao_ngay | number | Sản lượng giao/ngày |
| phuong_xa_phu_trach | string | Danh sách mã xã (comma-separated) |

## Features

### Core
1. **Toggle trước/sau sáp nhập** — switch giữa 2 bộ ranh giới hành chính
2. **Drill-down 3 cấp** — tỉnh → quận/huyện → phường/xã, có option chọn view tới cấp nào
3. **Popup on click** — click vào vùng để xem thông tin chi tiết (chỉ khi click, không hover)
4. **Pin bưu cục** — marker trên bản đồ từ post-offices.csv, click hiện popup thông tin

### Optional (toggle on/off)
5. **Heatmap** — tô màu theo mật độ dân cư hoặc sản lượng (bật/tắt được)
6. **Search** — tìm theo tên phường xã, bưu cục, AM
7. **Filter** — lọc theo AM, bưu cục, khoảng sản lượng

## GeoJSON Source
- Tải từ gis.vn (host tại vn2000.vn/diachinh/)
- Sau sáp nhập: 34 tỉnh, có tỉnh + phường xã
- Trước sáp nhập: 63 tỉnh, có tỉnh + quận huyện + phường xã
- Property key join: `ma_tinh`, `ma_huyen`, `ma_xa` trong GeoJSON properties

## Lưu ý khi code
- GeoJSON file rất nặng (phường xã ~100-277MB). Cần:
  - Simplify geometry (turf.js hoặc mapshaper) để giảm size
  - Lazy load theo zoom level (chỉ load phường xã khi zoom sâu)
  - Có thể tách GeoJSON theo tỉnh để load on-demand
- CSV data load bằng PapaParse hoặc d3-dsv
- Responsive — hoạt động trên mobile/tablet
- Không cần backend, pure frontend

## Trạng thái
- [ ] Phase 1: Map cơ bản + ranh giới + toggle trước/sau sáp nhập
- [ ] Phase 2: Drill-down + popup
- [ ] Phase 3: Pin bưu cục + popup bưu cục
- [ ] Phase 4: Heatmap + search + filter
- [ ] Phase 5: Import dữ liệu thực từ CSV
- [ ] Phase 6: Research + import mật độ dân cư
