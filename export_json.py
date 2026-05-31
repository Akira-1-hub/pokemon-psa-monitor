"""
export_json.py — SQLite DB を静的 JSON ファイルにエクスポート。

公開サイト（Vercel等）はバックエンド不要で、この JSON だけで動作する。

使い方:
    python export_json.py

出力先:
    frontend/public/data/products.json
    frontend/public/data/history.json
    frontend/public/data/pokeca-history.json
    frontend/public/data/rankings.json
    frontend/public/data/meta.json
"""
from __future__ import annotations

import json
import math
import sqlite3
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT     = Path(__file__).resolve().parent
DB_PATH  = ROOT / "data" / "market.db"
OUT_DIR  = ROOT / "frontend" / "public" / "data"
JST      = timezone(timedelta(hours=9))


# ─── ユーティリティ ───────────────────────────────────────────────
def _safe(v):
    if v is None:
        return None
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    return v


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def _has_table(conn, name: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone() is not None


# ─── /api/products ─────────────────────────────────────────────────
def build_products(conn) -> list[dict]:
    cur = conn.cursor()
    has_pokeca = _has_table(conn, "pokeca_stats")

    rows = cur.execute("""
        SELECT apparel_id, product_type, name, nickname,
               img_url, snkrdunk_url, pokeca_url
        FROM snkr_products
    """).fetchall()

    products = []
    for r in rows:
        apid = r["apparel_id"]

        series_data = {}
        for sr in cur.execute("""
            SELECT series, date, price FROM snkr_market_data m
            WHERE apparel_id = ? AND date = (
                SELECT MAX(date) FROM snkr_market_data
                WHERE apparel_id = m.apparel_id AND series = m.series
            )
        """, (apid,)).fetchall():
            series_data[sr["series"]] = {
                "latest_price": _safe(sr["price"]),
                "latest_date":  sr["date"],
            }

        for sname, s in series_data.items():
            row = cur.execute("""
                SELECT price FROM snkr_market_data
                WHERE apparel_id = ? AND series = ?
                  AND date < date(?, '-7 days')
                ORDER BY date DESC LIMIT 1
            """, (apid, sname, s["latest_date"])).fetchone()
            if row:
                prev = row["price"]
                latest = s["latest_price"]
                if latest is not None and prev:
                    s["change"]     = latest - prev
                    s["change_pct"] = (latest - prev) / prev * 100

        pokeca = {}
        if has_pokeca and r["product_type"] == "CARD":
            ps = cur.execute("""
                SELECT date, psa10_pop, psa_total, psa10_rate, transaction_count
                FROM pokeca_stats WHERE apparel_id = ?
                ORDER BY date DESC LIMIT 1
            """, (apid,)).fetchone()
            if ps:
                pokeca = {
                    "date":              ps["date"],
                    "psa10_pop":         _safe(ps["psa10_pop"]),
                    "psa_total":         _safe(ps["psa_total"]),
                    "psa10_rate":        _safe(ps["psa10_rate"]),
                    "transaction_count": _safe(ps["transaction_count"]),
                }
                prev = cur.execute("""
                    SELECT psa10_pop FROM pokeca_stats
                    WHERE apparel_id = ? AND date < date(?, '-7 days')
                    ORDER BY date DESC LIMIT 1
                """, (apid, ps["date"])).fetchone()
                if prev and prev["psa10_pop"] is not None and pokeca["psa10_pop"] is not None:
                    inc = pokeca["psa10_pop"] - prev["psa10_pop"]
                    pokeca["psa10_pop_inc_7d"] = inc
                    if pokeca.get("transaction_count"):
                        pokeca["supply_pressure"] = inc / pokeca["transaction_count"]

        market_cap = None
        if pokeca.get("psa10_pop") and series_data.get("PSA10", {}).get("latest_price"):
            market_cap = pokeca["psa10_pop"] * series_data["PSA10"]["latest_price"]

        products.append({
            "apparel_id":   r["apparel_id"],
            "product_type": r["product_type"],
            "name":         r["name"],
            "nickname":     r["nickname"],
            "display_name": r["nickname"] or r["name"],
            "img_url":      r["img_url"],
            "snkrdunk_url": r["snkrdunk_url"],
            "pokeca_url":   r["pokeca_url"],
            "series":       series_data,
            "pokeca":       pokeca,
            "market_cap":   _safe(market_cap),
        })

    return products


# ─── /api/history ──────────────────────────────────────────────────
def build_history(conn) -> list[dict]:
    rows = conn.execute("""
        SELECT m.date, m.apparel_id, m.series, m.price,
               p.nickname, p.name, p.product_type
        FROM snkr_market_data m
        JOIN snkr_products p ON m.apparel_id = p.apparel_id
        ORDER BY m.date
    """).fetchall()
    return [{
        "date": r["date"], "apparel_id": r["apparel_id"],
        "series": r["series"], "price": _safe(r["price"]),
        "display_name": r["nickname"] or r["name"],
        "product_type": r["product_type"],
    } for r in rows]


# ─── /api/pokeca-history ──────────────────────────────────────────
def build_pokeca_history(conn) -> list[dict]:
    if not _has_table(conn, "pokeca_stats"):
        return []

    rows = conn.execute("""
        SELECT ps.date, ps.apparel_id, ps.psa10_pop, ps.psa_total,
               ps.psa10_rate, ps.transaction_count,
               p.nickname, p.name
        FROM pokeca_stats ps
        JOIN snkr_products p ON ps.apparel_id = p.apparel_id
        ORDER BY ps.apparel_id, ps.date
    """).fetchall()
    if not rows:
        return []

    # snkr PSA10価格を日付で索引化
    snkr_prices = {}
    for sr in conn.execute("""
        SELECT apparel_id, date, price FROM snkr_market_data WHERE series = 'PSA10'
    """).fetchall():
        snkr_prices[(sr["apparel_id"], sr["date"])] = sr["price"]

    out = []
    last_pop_by_apid: dict[int, int] = {}
    for r in rows:
        apid = r["apparel_id"]
        pop10 = r["psa10_pop"]
        psa10_price = snkr_prices.get((apid, r["date"]))
        market_cap = pop10 * psa10_price if (pop10 and psa10_price) else None
        pop_inc = None
        if apid in last_pop_by_apid and pop10 is not None:
            pop_inc = pop10 - last_pop_by_apid[apid]
        if pop10 is not None:
            last_pop_by_apid[apid] = pop10
        supply_pressure = None
        if pop_inc is not None and r["transaction_count"]:
            supply_pressure = pop_inc / r["transaction_count"]

        out.append({
            "date":              r["date"],
            "apparel_id":        apid,
            "display_name":      r["nickname"] or r["name"],
            "psa10_pop":         _safe(r["psa10_pop"]),
            "psa_total":         _safe(r["psa_total"]),
            "psa10_rate":        _safe(r["psa10_rate"]),
            "transaction_count": _safe(r["transaction_count"]),
            "psa10_price":       _safe(psa10_price),
            "market_cap":        _safe(market_cap),
            "pop_inc":           _safe(pop_inc),
            "supply_pressure":   _safe(supply_pressure),
        })
    return out


# ─── /api/rankings ──────────────────────────────────────────────────
def build_rankings(products: list[dict]) -> dict:
    items, cards = [], []
    for p in products:
        if p["product_type"] == "CARD":
            cards.append({
                "apparel_id":      p["apparel_id"],
                "name":            p["display_name"],
                "img_url":         p["img_url"],
                "psa10_pop":       p["pokeca"].get("psa10_pop"),
                "psa_total":       p["pokeca"].get("psa_total"),
                "psa10_rate":      p["pokeca"].get("psa10_rate"),
                "psa10_price":     p["series"].get("PSA10", {}).get("latest_price"),
                "raw_price":       p["series"].get("A", {}).get("latest_price"),
                "market_cap":      p["market_cap"],
                "supply_pressure": p["pokeca"].get("supply_pressure"),
                "pop_inc_7d":      p["pokeca"].get("psa10_pop_inc_7d"),
            })
        for series_name, s in (p.get("series") or {}).items():
            items.append({
                "apparel_id":   p["apparel_id"],
                "name":         p["display_name"],
                "img_url":      p["img_url"],
                "product_type": p["product_type"],
                "series":       series_name,
                "latest_price": s.get("latest_price"),
                "latest_date":  s.get("latest_date"),
                "change":       s.get("change"),
                "change_pct":   s.get("change_pct"),
            })

    has_chg   = [i for i in items if i.get("change") is not None]
    has_price = [i for i in items if i.get("latest_price") is not None]

    def _nz(arr, key, desc=True):
        f = [x for x in arr if x.get(key) is not None]
        return sorted(f, key=lambda x: x[key], reverse=desc)

    return {
        "rising":   sorted([i for i in has_chg if i["change"] > 0],
                           key=lambda x: -x["change"]),
        "falling":  sorted([i for i in has_chg if i["change"] < 0],
                           key=lambda x: x["change"]),
        "by_price": sorted(has_price, key=lambda x: -x["latest_price"]),
        "market_cap":      _nz(cards, "market_cap"),
        "psa10_pop":       _nz(cards, "psa10_pop"),
        "psa_total":       _nz(cards, "psa_total"),
        "psa10_rate":      _nz(cards, "psa10_rate"),
        "pop_inc_7d":      _nz(cards, "pop_inc_7d"),
        "supply_pressure": _nz(cards, "supply_pressure"),
    }


# ─── メイン ─────────────────────────────────────────────────────────
def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if not DB_PATH.exists():
        print(f"[ERROR] DB not found: {DB_PATH}")
        return

    conn = _conn()
    try:
        products       = build_products(conn)
        history        = build_history(conn)
        pokeca_history = build_pokeca_history(conn)
    finally:
        conn.close()

    rankings = build_rankings(products)
    meta = {
        "generated_at": datetime.now(JST).isoformat(),
        "product_count": len(products),
        "history_count": len(history),
        "pokeca_history_count": len(pokeca_history),
    }

    files = [
        ("products.json",       {"products": products}),
        ("history.json",        {"history": history}),
        ("pokeca-history.json", {"history": pokeca_history}),
        ("rankings.json",       {"rankings": rankings}),
        ("meta.json",           meta),
    ]
    for name, payload in files:
        path = OUT_DIR / name
        text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        path.write_text(text, encoding="utf-8")
        size_kb = len(text.encode("utf-8")) / 1024
        print(f"  wrote {name:24s}  {size_kb:>8.1f} KB")

    print(f"\n=== 完了 ===")
    print(f"出力先: {OUT_DIR}")
    print(f"商品数: {len(products)}")


if __name__ == "__main__":
    main()
