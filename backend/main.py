"""
backend/main.py — snkrdunk + pokeca-chart ハイブリッド REST API
"""
from __future__ import annotations

import math
import os
import sqlite3
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import csv
import re
import subprocess
import threading
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)
sys.path.insert(0, str(ROOT))

DB_PATH = ROOT / "data" / "market.db"

app = FastAPI(title="ポケカ相場モニター API (Hybrid)", version="3.0.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"],
    allow_methods=["*"], allow_headers=["*"],
)


# ─────────────────────────────────────────────────────────────────────
def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def _safe(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    return v


def _has_table(conn, name: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone() is not None


# ─────────────────────────────────────────────────────────────────────
@app.get("/api/products")
def api_products():
    """全商品 + 各シリーズの最新価格 + pokeca PSA統計"""
    if not DB_PATH.exists():
        return {"products": []}

    conn = _conn()
    cur = conn.cursor()

    has_pokeca = _has_table(conn, "pokeca_stats")

    rows = cur.execute("""
        SELECT apparel_id, product_type, name, nickname,
               img_url, snkrdunk_url, pokeca_url,
               COALESCE(brand, 'pokeca') AS brand
        FROM snkr_products
    """).fetchall()

    products = []
    for r in rows:
        apid = r["apparel_id"]

        # --- snkrdunk 各シリーズ最新価格 ---
        series_data: dict[str, dict] = {}
        for sr in cur.execute("""
            SELECT series, date, price
            FROM snkr_market_data m
            WHERE apparel_id = ?
              AND date = (
                SELECT MAX(date) FROM snkr_market_data
                WHERE apparel_id = m.apparel_id AND series = m.series
              )
        """, (apid,)).fetchall():
            series_data[sr["series"]] = {
                "latest_price": _safe(sr["price"]),
                "latest_date":  sr["date"],
            }

        # 直近1つ前の取引との比較（前回比）+ 実日数
        for sname, s in series_data.items():
            row = cur.execute("""
                SELECT date, price FROM snkr_market_data
                WHERE apparel_id = ? AND series = ?
                  AND date < ?
                ORDER BY date DESC LIMIT 1
            """, (apid, sname, s["latest_date"])).fetchone()
            if row:
                prev = row["price"]
                latest = s["latest_price"]
                if latest is not None and prev:
                    s["change"]     = latest - prev
                    s["change_pct"] = (latest - prev) / prev * 100
                    try:
                        d1 = datetime.strptime(s["latest_date"], "%Y-%m-%d")
                        d0 = datetime.strptime(row["date"], "%Y-%m-%d")
                        s["change_days"] = (d1 - d0).days
                    except Exception:
                        s["change_days"] = None

        # --- pokeca PSA統計（CARD のみ） ---
        pokeca: dict = {}
        if has_pokeca and r["product_type"] == "CARD":
            ps = cur.execute("""
                SELECT date, psa10_pop, psa_total, psa10_rate, transaction_count
                FROM pokeca_stats
                WHERE apparel_id = ?
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
                # 1週間前のPSA10枚数（増加分計算用）
                prev = cur.execute("""
                    SELECT psa10_pop FROM pokeca_stats
                    WHERE apparel_id = ? AND date < date(?, '-7 days')
                    ORDER BY date DESC LIMIT 1
                """, (apid, ps["date"])).fetchone()
                if prev and prev["psa10_pop"] is not None and pokeca["psa10_pop"] is not None:
                    pop_inc = pokeca["psa10_pop"] - prev["psa10_pop"]
                    pokeca["psa10_pop_inc_7d"] = pop_inc
                    # 供給圧 = 増加枚数 / 取引件数
                    if pokeca.get("transaction_count"):
                        pokeca["supply_pressure"] = pop_inc / pokeca["transaction_count"]

        # --- PSA10時価総額 = PSA10枚数 × snkrdunk PSA10価格 ---
        market_cap = None
        if pokeca.get("psa10_pop") and series_data.get("PSA10", {}).get("latest_price"):
            market_cap = pokeca["psa10_pop"] * series_data["PSA10"]["latest_price"]

        products.append({
            "apparel_id":   r["apparel_id"],
            "product_type": r["product_type"],
            "brand":        r["brand"],
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

    conn.close()
    return {"products": products}


@app.get("/api/history")
def api_history(
    apparel_ids: str = Query(""),
    series:      str = Query(""),
):
    """snkrdunk 価格時系列"""
    if not DB_PATH.exists():
        return {"history": []}

    conn = _conn()
    sql = """
        SELECT m.date, m.apparel_id, m.series, m.price,
               p.nickname, p.name, p.product_type
        FROM snkr_market_data m
        JOIN snkr_products p ON m.apparel_id = p.apparel_id
    """
    conds, params = [], []
    if apparel_ids:
        ids = [int(x.strip()) for x in apparel_ids.split(",") if x.strip()]
        if ids:
            conds.append(f"m.apparel_id IN ({','.join('?' * len(ids))})")
            params.extend(ids)
    if series:
        conds.append("m.series = ?")
        params.append(series)
    if conds:
        sql += " WHERE " + " AND ".join(conds)
    sql += " ORDER BY m.date"

    rows = conn.execute(sql, params).fetchall()
    out = [{
        "date": r["date"], "apparel_id": r["apparel_id"],
        "series": r["series"], "price": _safe(r["price"]),
        "display_name": r["nickname"] or r["name"],
        "product_type": r["product_type"],
    } for r in rows]
    conn.close()
    return {"history": out}


@app.get("/api/pokeca-history")
def api_pokeca_history(apparel_ids: str = Query("")):
    """PSA10枚数・取得率・取引件数の時系列 + 派生指標"""
    if not DB_PATH.exists():
        return {"history": []}
    conn = _conn()
    if not _has_table(conn, "pokeca_stats"):
        conn.close()
        return {"history": []}

    sql = """
        SELECT ps.date, ps.apparel_id, ps.psa10_pop, ps.psa_total,
               ps.psa10_rate, ps.transaction_count,
               p.nickname, p.name
        FROM pokeca_stats ps
        JOIN snkr_products p ON ps.apparel_id = p.apparel_id
    """
    conds, params = [], []
    if apparel_ids:
        ids = [int(x.strip()) for x in apparel_ids.split(",") if x.strip()]
        if ids:
            conds.append(f"ps.apparel_id IN ({','.join('?' * len(ids))})")
            params.extend(ids)
    if conds:
        sql += " WHERE " + " AND ".join(conds)
    sql += " ORDER BY ps.apparel_id, ps.date"

    rows = conn.execute(sql, params).fetchall()

    # 派生指標を計算するため、apparel_id ごとに前日比増加・PSA10価格をマージ
    # PSA10価格を snkr から取得 (同一日付の PSA10 series)
    snkr_prices: dict[tuple[int, str], float] = {}
    if rows:
        ids = list({r["apparel_id"] for r in rows})
        ph = "?,".join("?" * len(ids))[:-1] if len(ids) > 1 else "?"
        sql2 = f"""
            SELECT apparel_id, date, price
            FROM snkr_market_data
            WHERE series = 'PSA10' AND apparel_id IN ({','.join(['?']*len(ids))})
        """
        for sr in conn.execute(sql2, ids).fetchall():
            snkr_prices[(sr["apparel_id"], sr["date"])] = sr["price"]

    out = []
    last_pop_by_apid: dict[int, int] = {}
    for r in rows:
        apid = r["apparel_id"]
        pop10 = r["psa10_pop"]
        psa10_price = snkr_prices.get((apid, r["date"]))
        market_cap = (pop10 * psa10_price) if (pop10 and psa10_price) else None
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
    conn.close()
    return {"history": out}


# ─────────────────────────────────────────────────────────────────────
#  商品 追加・削除（products.csv 操作）
# ─────────────────────────────────────────────────────────────────────
PRODUCTS_CSV = ROOT / "products.csv"

class AddProductReq(BaseModel):
    snkrdunk_url: str
    pokeca_url:   str | None = ""
    nickname:     str | None = ""
    brand:        str | None = "pokeca"

def _read_products_csv() -> list[dict]:
    if not PRODUCTS_CSV.exists():
        return []
    for enc in ("utf-8-sig", "utf-8", "cp932"):
        try:
            with open(PRODUCTS_CSV, encoding=enc) as f:
                return list(csv.DictReader(f))
        except UnicodeDecodeError:
            continue
    return []

def _write_products_csv(rows: list[dict]) -> None:
    fields = ["apparel_id", "type", "nickname", "pokeca_url", "brand"]
    with open(PRODUCTS_CSV, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in rows:
            r2 = {k: r.get(k, "") for k in fields}
            if not r2.get("brand"):
                r2["brand"] = "pokeca"
            w.writerow(r2)

def _extract_apparel_id(url: str) -> int | None:
    m = re.search(r"/apparels/(\d+)", url)
    return int(m.group(1)) if m else None

def _detect_type_from_snkr(apparel_id: int) -> str:
    """snkrdunk のオプション一覧から BOX か CARD かを推定する"""
    import requests
    H = {"User-Agent": "Mozilla/5.0 Chrome/120 Safari/537",
         "Accept": "application/json", "Referer": "https://snkrdunk.com/"}
    try:
        r = requests.get(
            f"https://snkrdunk.com/v1/apparels/{apparel_id}/sales-chart"
            f"?range=all&salesChartOptionId=0",
            headers=H, timeout=10,
        )
        opts = r.json().get("salesChartOption", []) or []
        for o in opts:
            name = o.get("localizedName") or ""
            if "個" in name:
                return "BOX"
        return "CARD"
    except Exception:
        return "CARD"

import time

_refresh_state = {"running": False, "started_at": None, "finished_at": None}
_refresh_lock = threading.Lock()


def _trigger_fetch_async(apparel_id: int) -> None:
    """単一商品のfetchを非同期で起動"""
    def run():
        try:
            subprocess.run(
                [sys.executable, str(ROOT / "fetch.py"), "--apparel", str(apparel_id)],
                cwd=str(ROOT),
                timeout=120,
                capture_output=True,
            )
        except Exception:
            pass
    threading.Thread(target=run, daemon=True).start()


def _trigger_fetch_all_async() -> bool:
    """全件 fetch を非同期で起動。既に動作中なら False を返す。"""
    with _refresh_lock:
        if _refresh_state["running"]:
            return False
        _refresh_state["running"] = True
        _refresh_state["started_at"] = time.time()
        _refresh_state["finished_at"] = None

    def run():
        try:
            subprocess.run(
                [sys.executable, str(ROOT / "fetch.py")],
                cwd=str(ROOT),
                timeout=3600,
                capture_output=True,
            )
        except Exception:
            pass
        finally:
            with _refresh_lock:
                _refresh_state["running"] = False
                _refresh_state["finished_at"] = time.time()

    threading.Thread(target=run, daemon=True).start()
    return True


@app.post("/api/refresh")
def api_refresh():
    """全商品の再取得を非同期で開始"""
    started = _trigger_fetch_all_async()
    if not started:
        raise HTTPException(409, "既に更新中です")
    return {"ok": True, "message": "更新を開始しました"}


@app.get("/api/refresh-status")
def api_refresh_status():
    """更新の進行状況を返す"""
    with _refresh_lock:
        state = dict(_refresh_state)

    # 最終更新時刻をDBから取得
    last_updated = None
    try:
        conn = _conn()
        row = conn.execute(
            "SELECT MAX(updated_at) FROM snkr_products"
        ).fetchone()
        if row and row[0]:
            last_updated = row[0]
        conn.close()
    except Exception:
        pass

    return {
        **state,
        "last_updated_at": last_updated,
    }

@app.post("/api/products")
def add_product(req: AddProductReq):
    apid = _extract_apparel_id(req.snkrdunk_url)
    if not apid:
        raise HTTPException(400, "snkrdunk URLから apparel_id を抽出できません。形式: https://snkrdunk.com/apparels/XXXXX")

    rows = _read_products_csv()
    if any(int(r.get("apparel_id", 0) or 0) == apid for r in rows):
        raise HTTPException(409, f"apparel_id={apid} は既に登録されています")

    ptype = _detect_type_from_snkr(apid)
    rows.append({
        "apparel_id": apid,
        "type":       ptype,
        "nickname":   (req.nickname or "").strip(),
        "pokeca_url": (req.pokeca_url or "").strip(),
        "brand":      (req.brand or "pokeca").strip().lower(),
    })
    _write_products_csv(rows)
    _trigger_fetch_async(apid)

    return {"ok": True, "apparel_id": apid, "type": ptype,
            "brand": req.brand or "pokeca",
            "message": "追加しました。データ取得中（30秒〜数分）..."}

@app.delete("/api/products/{apparel_id}")
def delete_product(apparel_id: int):
    rows = _read_products_csv()
    new_rows = [r for r in rows if int(r.get("apparel_id", 0) or 0) != apparel_id]
    if len(new_rows) == len(rows):
        raise HTTPException(404, f"apparel_id={apparel_id} が見つかりません")
    _write_products_csv(new_rows)

    # DBからも削除
    conn = _conn()
    conn.execute("DELETE FROM snkr_market_data WHERE apparel_id = ?", (apparel_id,))
    if _has_table(conn, "pokeca_stats"):
        conn.execute("DELETE FROM pokeca_stats WHERE apparel_id = ?", (apparel_id,))
    conn.execute("DELETE FROM snkr_products WHERE apparel_id = ?", (apparel_id,))
    conn.commit()
    conn.close()
    return {"ok": True, "deleted": apparel_id}


@app.get("/api/rankings")
def api_rankings():
    """各種ランキング"""
    if not DB_PATH.exists():
        return {"rankings": {}}

    data = api_products().get("products", [])

    # フラット化: シリーズ単位
    items = []
    cards = []   # CARD 専用（pokeca 統計あり）
    for p in data:
        if p["product_type"] == "CARD":
            cards.append({
                "apparel_id":   p["apparel_id"],
                "name":         p["display_name"],
                "img_url":      p["img_url"],
                "brand":        p.get("brand", "pokeca"),
                "product_type": p["product_type"],
                "psa10_pop":    p["pokeca"].get("psa10_pop"),
                "psa_total":    p["pokeca"].get("psa_total"),
                "psa10_rate":   p["pokeca"].get("psa10_rate"),
                "psa10_price":  p["series"].get("PSA10", {}).get("latest_price"),
                "raw_price":    p["series"].get("A", {}).get("latest_price"),
                "market_cap":   p["market_cap"],
                "supply_pressure": p["pokeca"].get("supply_pressure"),
                "pop_inc_7d":   p["pokeca"].get("psa10_pop_inc_7d"),
            })
        for series_name, s in (p.get("series") or {}).items():
            items.append({
                "apparel_id":   p["apparel_id"],
                "name":         p["display_name"],
                "img_url":      p["img_url"],
                "brand":        p.get("brand", "pokeca"),
                "product_type": p["product_type"],
                "series":       series_name,
                "latest_price": s.get("latest_price"),
                "latest_date":  s.get("latest_date"),
                "change":       s.get("change"),
                "change_pct":   s.get("change_pct"),
                "change_days":  s.get("change_days"),
            })

    has_chg   = [i for i in items if i.get("change") is not None]
    has_price = [i for i in items if i.get("latest_price") is not None]

    def _nz(items, key, desc=True):
        f = [x for x in items if x.get(key) is not None]
        return sorted(f, key=lambda x: x[key], reverse=desc)

    return {
        "rankings": {
            "rising":   sorted([i for i in has_chg if i["change"] > 0],
                               key=lambda x: -x["change"]),
            "falling":  sorted([i for i in has_chg if i["change"] < 0],
                               key=lambda x: x["change"]),
            "by_price": sorted(has_price, key=lambda x: -x["latest_price"]),
            "market_cap": _nz(cards, "market_cap"),
            "psa10_pop":  _nz(cards, "psa10_pop"),
            "psa_total":  _nz(cards, "psa_total"),
            "psa10_rate": _nz(cards, "psa10_rate"),
            "pop_inc_7d": _nz(cards, "pop_inc_7d"),
            "supply_pressure": _nz(cards, "supply_pressure"),
        }
    }


# ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True,
                app_dir=str(Path(__file__).parent))
