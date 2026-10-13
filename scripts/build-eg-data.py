"""Bake Egypt fuel/EV stations and searchable areas into public/data/*.json.

Sources (no OpenStreetMap, no API keys):
  - Ministry of Petroleum public directory (petroleum.gov.eg SharePoint lists)
  - Emarat Misr station list (emaratmisr.com/PublicPage/places.xml)
  - Overture Maps places (gas_station category + fuel-brand names); divisions from geoBoundaries only
  - Open Charge Map export on GitHub (EV chargers)

Usage:  pip install duckdb && python scripts/build-eg-data.py
Set DRIVELOG_INSECURE_TLS=1 behind a TLS-inspecting proxy.
"""

import json
import math
import os
import re
import ssl
import subprocess
import tempfile
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path

import duckdb

OUT = Path(__file__).resolve().parent.parent / "public" / "data"
OVERTURE = os.environ.get("OVERTURE_RELEASE", "2026-09-23.1")
EG_BBOX = "bbox.xmin BETWEEN 24.6 AND 37.0 AND bbox.ymin BETWEEN 21.9 AND 31.8"
CTX = ssl._create_unverified_context() if os.environ.get("DRIVELOG_INSECURE_TLS") else None

BRANDS = [
    ("TotalEnergies", r"totalenergies|\btotal\b|توتال"),
    ("Shell", r"\bshell\b|\bشل\b"),
    ("Mobil", r"\bmobil\b|\bموبيل\b|exxon"),
    ("Chillout", r"chill ?out|تشيل ?اوت"),
    ("Wataniya", r"wataniya|watanya|watnya|وطنية|وطنيه"),
    ("Emarat Misr", r"emarat|[اإ]مارات مصر"),
    ("OLA Energy", r"\bola\b|oilibya"),
    ("TAQA", r"\btaqa\b|طاقة"),
    ("Gastec", r"gastec|جاستك"),
    ("Misr Petroleum", r"misr petrol|مصر للبترول"),
    ("Co-op", r"co-?op|التعاون للبترول"),
    ("Car Gas", r"car ?gas|كار ?جاس"),
    ("Master Gas", r"master ?gas|ماستر ?جاس"),
]
BRAND_RX = "|".join(rx for _, rx in BRANDS) + r"|petrol station|gas station|fuel station|محط[ةه] (بنزين|وقود)|بنزين[ةه]"
NOT_A_STATION = re.compile(r"خلف|امام|أمام|بجوار|شارع|school|مدرس|clinic|عياد|ماركت|market|موتورز|motors|مركز خدمة|صيانة|توكيل|care|كير|موبيليا|موبيليات|موبليات|furniture", re.I)
BRAND_CATS = {None, "train", "energy_company", "oil_change_station", "car_wash", "convenience_store", "travel_service"}
CAFE_CATS = {"coffee_shop", "cafe", "donut_shop", "fast_food_restaurant"}
EV_NETWORKS = {3742: "Infinity EV", 3743: "Sha7en", 3744: "IKARUS", 3802: "Elsewedy Plug", 3803: "TAQA Volt",
               3920: "Ona", 3837: "Karm", 3883: "Electra", 3991: "MegaPlug", 3293: "Revolta"}


# Big neighbourhoods missing from the Ministry districts. Hand-entered centres, ~1-2 km accurate.
EXTRA_AREAS = [
    ("مدينة نصر", "Nasr City", 30.0566, 31.3301), ("التجمع الخامس", "Fifth Settlement", 30.0084, 31.4285),
    ("الرحاب", "Al Rehab", 30.0596, 31.4930), ("مدينتي", "Madinaty", 30.1070, 31.6380),
    ("الشروق", "El Shorouk", 30.1428, 31.6276), ("العبور", "Obour", 30.2283, 31.4790),
    ("القطامية", "Katameya", 29.9850, 31.4050), ("العاصمة الإدارية", "New Administrative Capital", 30.0200, 31.7600),
    ("مدينة بدر", "Badr City", 30.1360, 31.7150), ("المهندسين", "Mohandessin", 30.0566, 31.2003),
    ("الدقي", "Dokki", 30.0385, 31.2123), ("الزمالك", "Zamalek", 30.0609, 31.2197),
    ("وسط البلد", "Downtown Cairo", 30.0478, 31.2400), ("جاردن سيتي", "Garden City", 30.0370, 31.2310),
    ("المنيل", "Manial", 30.0230, 31.2290), ("المعادي", "Maadi", 29.9602, 31.2569),
    ("المقطم", "Mokattam", 30.0110, 31.3060), ("حلوان", "Helwan", 29.8414, 31.3008),
    ("شبرا", "Shubra", 30.0820, 31.2450), ("شبرا الخيمة", "Shubra El Kheima", 30.1286, 31.2422),
    ("مصر الجديدة", "Heliopolis", 30.0911, 31.3227), ("العباسية", "Abbasia", 30.0720, 31.2820),
    ("الزيتون", "Zeitoun", 30.1050, 31.3100), ("عين شمس", "Ain Shams", 30.1310, 31.3280),
    ("المطرية", "Matareya", 30.1210, 31.3130), ("المرج", "El Marg", 30.1520, 31.3360),
    ("مدينة السلام", "El Salam City", 30.1700, 31.4100), ("الشيخ زايد", "Sheikh Zayed", 30.0444, 30.9800),
    ("فيصل", "Faisal", 30.0130, 31.1650), ("الهرم", "Haram", 29.9900, 31.1500),
    ("حدائق الأهرام", "Hadayek El Ahram", 29.9720, 31.0860), ("سموحة", "Smouha", 31.2156, 29.9500),
    ("ميامي", "Miami Alexandria", 31.2710, 30.0050), ("سيدي جابر", "Sidi Gaber", 31.2190, 29.9420),
    ("العجمي", "Agami", 31.0950, 29.7600), ("المنتزه", "Montaza", 31.2850, 30.0150),
    ("العين السخنة", "Ain Sokhna", 29.6000, 32.3200), ("الغردقة", "Hurghada", 27.2579, 33.8116),
    ("شرم الشيخ", "Sharm El Sheikh", 27.9158, 34.3300),
]


def brand_of(*texts):
    t = " ".join(x for x in texts if x)
    return next((name for name, rx in BRANDS if re.search(rx, t, re.I)), None)


def get(url, accept="application/json;odata=verbose"):
    req = urllib.request.Request(url, headers={"Accept": accept, "User-Agent": "drivelog-data/1"})
    return urllib.request.urlopen(req, context=CTX, timeout=120).read()


def km(a, b, c, d):
    p = math.pi / 180
    h = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


def in_egypt(lat, lon):
    return 21.9 < lat < 31.8 and 24.6 < lon < 37.0


class Stations:
    """ponytail: O(n²) dedupe over ~3k rows; fine for a monthly bake, use a grid if it grows past ~50k."""

    def __init__(self):
        self.rows = []

    def add(self, lat, lon, name, brand):
        if not in_egypt(lat, lon):
            return
        for s in self.rows:
            if abs(s[0] - lat) < 0.002 and km(s[0], s[1], lat, lon) < 0.12:
                if not s[3] and brand:
                    s[3] = brand
                return
        self.rows.append([round(lat, 5), round(lon, 5), (name or "").strip(), brand])


# Ministry district names are police-station areas: «قسم أول المعادي», «Second Station of 6 October».
AR_NOISE = re.compile(r"^(قسم|مركز|و)\s+|\s+(اول|أول|ثان|ثانى|ثاني|ثالث|رابع)\b|\b(اول|أول|ثان|ثانى|ثاني|ثالث|رابع)\s+|محافظ[هة]\s*|\s+$")
EN_NOISE = re.compile(r"\b(first|second|third|fourth|station|center|centre|of|governorate|the)\b|-\d+$", re.I)


def clean_ar(s):
    s = (s or "").strip()
    for _ in range(3):
        s = AR_NOISE.sub(" ", s).strip()
    return re.sub(r"\s+", " ", s)


def clean_en(s):
    return re.sub(r"\s+", " ", EN_NOISE.sub(" ", s or "")).strip()


def ministry(stations, areas):
    sel = ("?$top=5000&$select=Title,latitude,longitude,Station_x0020_KindEn/TitleEn,District/Title,DistrictEn/TitleEn,"
           "Governorate/Title,GovernorateEn/TitleEn&$expand=Station_x0020_KindEn,District,DistrictEn,Governorate,GovernorateEn")
    company = {"Misr Petrolem": "Misr Petroleum", "COOP Petrolem": "Co-op", "GasTec": "Gastec"}
    n = 0
    for lst in ("lst-public-services-petrol-stations-directory", "lst-public-services-gas-stations-directory"):
        url = f"https://www.petroleum.gov.eg/_api/web/lists/getbytitle('{lst}')/items" + sel
        while url:
            d = json.loads(get(url))["d"]
            for it in d["results"]:
                lat, lon = it.get("latitude"), it.get("longitude")
                if not lat or not lon:
                    continue
                kind = ((it.get("Station_x0020_KindEn") or {}).get("TitleEn") or "").strip()
                stations.add(lat, lon, it.get("Title"), company.get(kind, kind or None))
                n += 1
                for ar, en in (((it.get("District") or {}).get("Title"), (it.get("DistrictEn") or {}).get("TitleEn")),
                               ((it.get("Governorate") or {}).get("Title"), (it.get("GovernorateEn") or {}).get("TitleEn"))):
                    a, e = clean_ar(ar), clean_en(en)
                    if len(a) > 1 and "ظهير" not in a:
                        areas.setdefault(a, [e, []])[1].append((lat, lon))
            url = d.get("__next")
    return n


def emarat(stations):
    root = ET.fromstring(get("https://emaratmisr.com/PublicPage/places.xml", "*/*"))
    rows = list(root.iter("Stations"))
    for st in rows:
        stations.add(float(st.get("latitude")), float(st.get("longitude")), st.get("stationName"), "Emarat Misr")
    return len(rows)


def overture(stations, areas):
    db = duckdb.connect()
    db.sql("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; SET s3_region='us-west-2';")
    places = db.sql(f"""
        SELECT names.primary, names.common['ar'], brand.names.primary, taxonomy.primary, confidence, ST_Y(geometry), ST_X(geometry)
        FROM read_parquet('s3://overturemaps-us-west-2/release/{OVERTURE}/theme=places/type=place/*', hive_partitioning=1)
        WHERE {EG_BBOX} AND addresses[1].country = 'EG' AND confidence >= 0.6
          AND (taxonomy.primary = 'gas_station'
               OR regexp_matches(lower(coalesce(names.primary,'') || ' ' || coalesce(brand.names.primary,'')), ?))
    """, params=[BRAND_RX]).fetchall()
    n = 0
    for name, name_ar, brand, cat, _conf, lat, lon in places:
        b = brand_of(name, brand)
        if cat != "gas_station":
            if not b or NOT_A_STATION.search(name or ""):
                continue
            if cat in CAFE_CATS and b not in {"Chillout", "Wataniya"}:
                continue
            if cat not in BRAND_CATS | CAFE_CATS:
                continue
        stations.add(lat, lon, name_ar or name, b or brand)
        n += 1
    counties = db.sql(f"""
        SELECT names.primary, ST_Y(ST_Centroid(geometry)), ST_X(ST_Centroid(geometry))
        FROM read_parquet('s3://overturemaps-us-west-2/release/{OVERTURE}/theme=divisions/type=division/*', hive_partitioning=1)
        WHERE country = 'EG' AND subtype = 'county'
          AND list_contains(list_transform(sources, s -> s.dataset), 'geoBoundaries')
          AND NOT list_contains(list_transform(sources, s -> s.dataset), 'OpenStreetMap')
    """).fetchall()
    for name, lat, lon in counties:
        e = clean_en(name)
        if e:
            areas.setdefault("~" + e.lower(), ["", []])
            areas["~" + e.lower()] = [e, [(lat, lon)]]
    return n


def open_charge_map():
    with tempfile.TemporaryDirectory() as tmp:
        git = ["git", "-c", "http.sslVerify=false"] if CTX else ["git"]
        subprocess.run(git + ["clone", "-q", "--depth", "1", "--filter=blob:none", "--sparse",
                              "https://github.com/openchargemap/ocm-export", tmp], check=True)
        subprocess.run(git + ["-C", tmp, "sparse-checkout", "set", "data/EG"], check=True)
        out = []
        for f in sorted(Path(tmp, "data", "EG").glob("*.json")):
            x = json.loads(f.read_text(encoding="utf-8"))
            if x.get("StatusTypeID") in (100, 150, 200):
                continue
            a = x["AddressInfo"]
            if not in_egypt(a["Latitude"], a["Longitude"]):
                continue
            kw = max(((c.get("PowerKW") or 0) for c in x.get("Connections") or []), default=0)
            out.append([round(a["Latitude"], 5), round(a["Longitude"], 5), (a.get("Title") or "").strip(),
                        EV_NETWORKS.get(x.get("OperatorID")), round(kw) or None])
        return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    stations, areas = Stations(), {}
    counts = {"ministry": ministry(stations, areas), "emarat": emarat(stations), "overture": overture(stations, areas)}
    charge = open_charge_map()
    today = date.today().isoformat()
    (OUT / "eg-stations.json").write_text(json.dumps(
        {"updated": today, "fuel": stations.rows, "charge": charge}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    area_rows = [[ar, en, lat, lon] for ar, en, lat, lon in EXTRA_AREAS]
    for key, (en, pts) in areas.items():
        ar = "" if key.startswith("~") else key
        lat = sum(p[0] for p in pts) / len(pts)
        lon = sum(p[1] for p in pts) / len(pts)
        area_rows.append([ar, en, round(lat, 4), round(lon, 4)])
    (OUT / "eg-areas.json").write_text(json.dumps(
        {"updated": today, "areas": area_rows}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({"read": counts, "fuel": len(stations.rows), "charge": len(charge), "areas": len(area_rows)}))


if __name__ == "__main__":
    main()
