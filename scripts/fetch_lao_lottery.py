"""
Builds frontend/public/data/lao-lottery.json: Lao Development Lottery (หวยลาวพัฒนา) results
from Sanook's per-draw pages (https://www.sanook.com/news/laolotto/DDMMYYYY/, Buddhist-era year).

Incremental: existing records are kept and only missing dates are fetched.

    python3 scripts/fetch_lao_lottery.py            # last 5 years
    python3 scripts/fetch_lao_lottery.py --years 1
"""
import argparse
import json
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "frontend" / "public" / "data" / "lao-lottery.json"
URL = "https://www.sanook.com/news/laolotto/{slug}/"
WORKERS = 4
DELAY_SECONDS = 0.2
BKK = timezone(timedelta(hours=7))


def slug(d: date) -> str:
    return f"{d.day:02d}{d.month:02d}{d.year + 543}"


def fetch_draw(d: date):
    """Returns the draw record for `d`, or None when no draw was published that day."""
    time.sleep(DELAY_SECONDS)
    req = urllib.request.Request(URL.format(slug=slug(d)), headers={"User-Agent": "Mozilla/5.0 (lao-lottery-stats)"})
    with urllib.request.urlopen(req, timeout=20) as res:
        html = res.read().decode("utf-8", "ignore")
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        return None
    data = json.loads(m.group(1))["props"]["serverState"]["apollo"]["data"]
    result = data.get(f'$ROOT_QUERY.laoLotto({{"date":"{slug(d)}"}}).prizeResult')
    last4 = (result or {}).get("last4Prize", "")
    if not re.fullmatch(r"\d{4}", last4):
        return None
    return {"date": d.isoformat(), "last4": last4, "animal": result.get("animalName", "")}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--years", type=float, default=5)
    args = parser.parse_args()

    existing = {}
    if OUT.exists():
        existing = {r["date"]: r for r in json.loads(OUT.read_text())["draws"]}

    today = datetime.now(BKK).date()
    start = today - timedelta(days=round(365.25 * args.years))
    checked = set(json.loads(OUT.read_text()).get("checked_empty", [])) if OUT.exists() else set()

    todo = []
    d = start
    while d <= today:
        key = d.isoformat()
        # Today's result may not be published yet, so always re-check it
        if key not in existing and (key not in checked or d == today):
            todo.append(d)
        d += timedelta(days=1)

    fetched, failures = 0, 0
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for d, outcome in zip(todo, pool.map(_safe_fetch, todo)):
            key = d.isoformat()
            if isinstance(outcome, Exception):  # network hiccup: leave the date for the next run
                failures += 1
                print(f"{key}: {outcome}", file=sys.stderr, flush=True)
                continue
            fetched += 1
            if outcome:
                existing[key] = outcome
                checked.discard(key)
            elif d < today:
                checked.add(key)
            if fetched % 100 == 0:
                print(f"{key}: {len(existing)} draws so far", flush=True)
                save(existing, checked, start)

    draws = save(existing, checked, start)
    print(f"Saved {len(draws)} draws ({draws[0]['date'] if draws else '-'} → {draws[-1]['date'] if draws else '-'}), "
          f"{fetched} pages fetched, {failures} failures → {OUT}")


def _safe_fetch(day: date):
    try:
        return fetch_draw(day)
    except Exception as e:
        return e


def save(existing, checked, start):
    draws = sorted(existing.values(), key=lambda r: r["date"])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "source": "https://www.sanook.com/news/laolotto/",
        "updated_at": datetime.now(BKK).isoformat(timespec="seconds"),
        "draws": draws,
        "checked_empty": sorted(c for c in checked if c >= start.isoformat()),
    }, ensure_ascii=False, separators=(",", ":")))
    return draws


if __name__ == "__main__":
    main()
