#!/usr/bin/env python3
"""Split xa.geojson (and optionally huyen.geojson) into per-province files by ma_tinh."""

import json
import os
from collections import defaultdict

BASE_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')

SPLITS = [
    ('truoc-sap-nhap', 'xa'),
    ('sau-sap-nhap', 'xa'),
]


def split_geojson(mode, level):
    src = os.path.join(BASE_DIR, mode, f'{level}.geojson')
    out_dir = os.path.join(BASE_DIR, mode, level)
    os.makedirs(out_dir, exist_ok=True)

    print(f'Reading {src}...')
    with open(src, 'r', encoding='utf-8') as f:
        data = json.load(f)

    by_province = defaultdict(list)
    for feature in data['features']:
        ma_tinh = feature['properties'].get('ma_tinh', 'unknown')
        by_province[ma_tinh].append(feature)

    total_size = 0
    for ma_tinh, features in sorted(by_province.items()):
        out_path = os.path.join(out_dir, f'{ma_tinh}.geojson')
        collection = {
            'type': 'FeatureCollection',
            'features': features,
        }
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(collection, f, ensure_ascii=False, separators=(',', ':'))

        size_kb = os.path.getsize(out_path) / 1024
        total_size += size_kb
        print(f'  {ma_tinh}.geojson: {len(features)} features, {size_kb:.0f} KB')

    print(f'  → {len(by_province)} files, total {total_size/1024:.1f} MB')
    print()


if __name__ == '__main__':
    for mode, level in SPLITS:
        split_geojson(mode, level)
    print('Done!')
