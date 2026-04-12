#!/usr/bin/env python3
"""Enrich truoc-sap-nhap GeoJSON files with population density data.

Approach:
1. Compute dtich_km2 from GeoJSON geometry using pyproj (geodesic area)
2. Province-level: use GSO 2019 census population
3. District/Ward-level: distribute province population by area ratio
4. Write enriched GeoJSON files
"""

import json
import os
from pyproj import Geod
from shapely.geometry import shape

BASE_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'truoc-sap-nhap')

# GSO 2019 Census population by province (ma_tinh -> population)
POPULATION_2019 = {
    '01': 8053663, '02': 854679, '04': 530341, '06': 313905,
    '08': 784811, '10': 730420, '11': 598856, '12': 460196,
    '14': 1248415, '15': 821030, '17': 854131, '19': 1286751,
    '20': 781655, '22': 1320324, '24': 1803950, '25': 1463726,
    '26': 1151154, '27': 1368840, '30': 1892254, '31': 2028514,
    '33': 1252731, '34': 1860447, '35': 852800, '36': 1833561,
    '37': 982487, '38': 3640128, '40': 3327791, '42': 1289058,
    '44': 895430, '45': 632375, '46': 1128620, '48': 1134310,
    '49': 1495812, '51': 1231697, '52': 1487009, '54': 961152,
    '56': 1231107, '58': 590467, '60': 1231902, '62': 540438,
    '64': 1513847, '66': 1869322, '67': 622168, '68': 1296906,
    '70': 994679, '72': 1169165, '74': 2426561, '75': 3097107,
    '77': 1148313, '79': 8993082, '80': 1688547, '82': 1764185,
    '83': 1288463, '84': 1009168, '86': 1022791, '87': 1599504,
    '89': 1908352, '91': 1723067, '92': 1235171, '93': 733017,
    '94': 1199653, '95': 907236, '96': 1194476,
}

geod = Geod(ellps='WGS84')


def compute_area_km2(geometry):
    """Compute geodesic area in km² from GeoJSON geometry."""
    try:
        geom = shape(geometry)
        area_m2 = abs(geod.geometry_area_perimeter(geom)[0])
        return round(area_m2 / 1e6, 2)
    except Exception:
        return 0


def enrich_tinh():
    """Enrich province-level GeoJSON with population data."""
    path = os.path.join(BASE_DIR, 'tinh.geojson')
    print(f'Enriching {path}...')

    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    for feature in data['features']:
        props = feature['properties']
        ma_tinh = props.get('ma_tinh')

        dtich = compute_area_km2(feature['geometry'])
        dan_so = POPULATION_2019.get(ma_tinh, 0)
        matdo = round(dan_so / dtich, 2) if dtich > 0 else 0

        props['dtich_km2'] = dtich
        props['dan_so'] = dan_so
        props['matdo_km2'] = matdo

        print(f'  {props.get("ten_tinh", ma_tinh)}: {dan_so:,} người, {dtich:,.1f} km², {matdo:,.0f}/km²')

    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))

    print(f'  → {len(data["features"])} provinces enriched\n')


def enrich_sub_level(filename, group_key):
    """Enrich district or ward GeoJSON by distributing province population by area ratio."""
    path = os.path.join(BASE_DIR, filename)
    print(f'Enriching {path}...')

    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Step 1: compute area for all features
    for feature in data['features']:
        feature['properties']['dtich_km2'] = compute_area_km2(feature['geometry'])

    # Step 2: group by province, compute area ratio, distribute population
    from collections import defaultdict
    by_province = defaultdict(list)
    for feature in data['features']:
        ma_tinh = feature['properties'].get('ma_tinh', '')
        by_province[ma_tinh].append(feature)

    for ma_tinh, features in by_province.items():
        total_area = sum(f['properties']['dtich_km2'] for f in features)
        province_pop = POPULATION_2019.get(ma_tinh, 0)

        for feature in features:
            props = feature['properties']
            area = props['dtich_km2']

            if total_area > 0 and province_pop > 0:
                ratio = area / total_area
                dan_so = round(province_pop * ratio)
                matdo = round(dan_so / area, 2) if area > 0 else 0
            else:
                dan_so = 0
                matdo = 0

            props['dan_so'] = dan_so
            props['matdo_km2'] = matdo

    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))

    print(f'  → {len(data["features"])} features enriched\n')


if __name__ == '__main__':
    enrich_tinh()
    enrich_sub_level('huyen.geojson', 'ma_tinh')
    enrich_sub_level('xa.geojson', 'ma_tinh')
    print('Done! Now re-run split-geojson.py to update per-province files.')
