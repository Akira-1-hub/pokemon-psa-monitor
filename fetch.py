"""
fetch.py — snkrdunk + pokeca-chart 両方から相場データ取得（統合版）

snkrdunk:    BOX 1個 価格 / CARD PSA10 価格 / CARD 状態A 価格
pokeca-chart: PSA10枚数 / PSA合計枚数 / 取得率 / 取引件数（CARD のみ）

使い方:
    python fetch.py                       # 全件取得
    python fetch.py --apparel 806644      # 特定の apparel_id だけ
    python fetch.py --skip-pokeca         # snkrdunk のみ
    python fetch.py --skip-snkrdunk       # pokeca-chart のみ
"""
from __future__ import annotations

import argparse
import csv
import logging
import re
import sqlite3
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests

# ─── 設定 ─────────────────────────────────────────────────────────
DB_PATH       = Path("data/market.db")
PRODUCTS_CSV  = Path("products.csv")
REQUEST_DELAY = 3
TIMEOUT       = 20
JST           = timezone(timedelta(hours=9))

SNKR_HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) "
                   "Chrome/120.0.0.0 Safari/537.36"),
    "Accept": "application/json",
    "Accept-Language": "ja-JP,ja;q=0.9",
    "Referer": "https://snkrdunk.com/",
}

POKECA_API_BASE = "https://v1.pokeca-chart.com/ch/php/"
POKECA_HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) "
                   "Chrome/120.0.0.0 Safari/537.36"),
    "Referer": "https://grading.pokeca-chart.com/",
    "Accept-Language": "ja-JP,ja;q=0.9",
}

BOX_TARGET_SERIES   = ["1個"]
CARD_TARGET_SERIES  = ["PSA10", "A"]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)


# ─── DB ─────────────────────────────────────────────────────────────
def init_db() -> None:
    DB_PATH.parent.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB_PATH)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS snkr_products (
            apparel_id   INTEGER PRIMARY KEY,
            product_type TEXT    NOT NULL,
            name         TEXT    NOT NULL,
            nickname     TEXT,
            img_url      TEXT,
            snkrdunk_url TEXT,
            pokeca_url   TEXT,
            brand        TEXT    DEFAULT 'pokeca',
            updated_at   TEXT
        )
    """)
    # 既存テーブルへの後方互換カラム追加
    for col_sql in [
        "ALTER TABLE snkr_products ADD COLUMN pokeca_url TEXT",
        "ALTER TABLE snkr_products ADD COLUMN brand TEXT DEFAULT 'pokeca'",
    ]:
        try:
            conn.execute(col_sql)
        except sqlite3.OperationalError:
            pass

    conn.execute("""
        CREATE TABLE IF NOT EXISTS snkr_market_data (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            date        TEXT    NOT NULL,
            apparel_id  INTEGER NOT NULL,
            series      TEXT    NOT NULL,
            price       REAL    NOT NULL,
            UNIQUE(date, apparel_id, series)
        )
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_snkr_md_lookup
        ON snkr_market_data(apparel_id, series, date)
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS pokeca_stats (
            id                 INTEGER PRIMARY KEY AUTOINCREMENT,
            date               TEXT    NOT NULL,
            apparel_id         INTEGER NOT NULL,
            psa10_pop          INTEGER,
            psa_total          INTEGER,
            psa10_rate         REAL,
            transaction_count  INTEGER,
            UNIQUE(date, apparel_id)
        )
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_pokeca_lookup
        ON pokeca_stats(apparel_id, date)
    """)
    conn.commit()
    conn.close()


# ═════════════════════════════════════════════════════════════════════
#  snkrdunk
# ═════════════════════════════════════════════════════════════════════
def snkr_fetch_product_info(apparel_id: int) -> dict:
    url = f"https://snkrdunk.com/v2/products/{apparel_id}?type=apparel"
    r = requests.get(url, headers=SNKR_HEADERS, timeout=TIMEOUT)
    r.raise_for_status()
    d = r.json()
    img = d.get("eyeCatchImageUrl") or (d.get("imageUrls") or [None])[0]

    # brand 自動検出: productNumber が "pkmn-tcg-*" ならポケカ、それ以外はワンピ
    brand = None
    try:
        rr = requests.get(f"https://snkrdunk.com/v1/apparels/{apparel_id}",
                          headers=SNKR_HEADERS, timeout=8)
        if rr.status_code == 200:
            pn = (rr.json().get("productNumber") or "").lower()
            if pn:
                brand = "pokeca" if "pkmn" in pn else "onepiece"
    except Exception:
        pass

    return {
        "name":    d.get("nameJP") or d.get("namePrimary") or f"apparel_{apparel_id}",
        "img_url": img,
        "brand":   brand,
    }


def snkr_fetch_chart_options(apparel_id: int, used: bool = False) -> list[dict]:
    """
    salesChartOption リストを取得。
    used=True  → /sales-chart/used  (CARD の状態別: A, PSA10, ...)
    used=False → /sales-chart        (BOX のサイズ別: 1個, 2個, ...)
    """
    path = "sales-chart/used" if used else "sales-chart"
    opt0 = -1 if used else 0
    url = (f"https://snkrdunk.com/v1/apparels/{apparel_id}/{path}"
           f"?range=all&salesChartOptionId={opt0}")
    r = requests.get(url, headers=SNKR_HEADERS, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json().get("salesChartOption") or []


def snkr_fetch_chart(apparel_id: int, option_id: int,
                     used: bool = False) -> list[tuple[int, float]]:
    """価格データを取得"""
    path = "sales-chart/used" if used else "sales-chart"
    url = (f"https://snkrdunk.com/v1/apparels/{apparel_id}/{path}"
           f"?range=all&salesChartOptionId={option_id}")
    r = requests.get(url, headers=SNKR_HEADERS, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json().get("points") or []


def snkr_fetch_sales_history(apparel_id: int, max_pages: int = 200) -> list[dict]:
    """売買履歴を全ページ取得（条件別の価格集計用）"""
    out = []
    for page in range(1, max_pages + 1):
        url = (f"https://snkrdunk.com/v1/apparels/{apparel_id}/sales-history"
               f"?size_id=0&page={page}&per_page=50")
        r = requests.get(url, headers=SNKR_HEADERS, timeout=TIMEOUT)
        if r.status_code != 200:
            break
        h = r.json().get("history") or []
        if not h:
            break
        out.extend(h)
        if len(h) < 50:
            break
        time.sleep(0.3)
    return out


def _parse_relative_date(rel: str) -> str | None:
    """'8分前', '2時間前', '3日前' → JSTで本日からの推定日付（YYYY-MM-DD）"""
    from datetime import datetime, timedelta
    if not rel:
        return None
    now = datetime.now(JST)
    m = re.match(r"(\d+)\s*(秒|分|時間|日|か月|年)前", rel)
    if not m:
        # 数字なし or 形式不明 → 今日とみなす
        return now.strftime("%Y-%m-%d")
    n = int(m.group(1))
    unit = m.group(2)
    if unit in ("秒", "分", "時間"):
        return now.strftime("%Y-%m-%d")
    if unit == "日":
        return (now - timedelta(days=n)).strftime("%Y-%m-%d")
    if unit == "か月":
        return (now - timedelta(days=n * 30)).strftime("%Y-%m-%d")
    if unit == "年":
        return (now - timedelta(days=n * 365)).strftime("%Y-%m-%d")
    return now.strftime("%Y-%m-%d")


def _resolve_option_ids(options: list[dict], target_series: list[str]) -> dict[str, int]:
    result: dict[str, int] = {}
    for t in target_series:
        for opt in options:
            name = opt.get("localizedName") or opt.get("name") or ""
            if name == t:
                result[t] = opt.get("id")
                break
    return result


def _upsert_product(conn, apparel_id, product_type, name, nickname,
                    img_url, pokeca_url, brand="pokeca") -> None:
    url = f"https://snkrdunk.com/apparels/{apparel_id}"
    now = datetime.now(JST).isoformat()
    conn.execute("""
        INSERT INTO snkr_products
          (apparel_id, product_type, name, nickname, img_url,
           snkrdunk_url, pokeca_url, brand, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(apparel_id) DO UPDATE SET
            product_type=excluded.product_type,
            name=excluded.name,
            nickname=excluded.nickname,
            img_url=excluded.img_url,
            snkrdunk_url=excluded.snkrdunk_url,
            pokeca_url=excluded.pokeca_url,
            brand=excluded.brand,
            updated_at=excluded.updated_at
    """, (apparel_id, product_type, name, nickname, img_url, url, pokeca_url, brand, now))


def _save_snkr_series(conn, apparel_id: int, series: str,
                      points: list[tuple[int, float]]) -> int:
    inserted = 0
    for ts_ms, price in points:
        date_str = datetime.fromtimestamp(ts_ms / 1000, tz=JST).strftime("%Y-%m-%d")
        cur = conn.execute("""
            INSERT OR REPLACE INTO snkr_market_data
              (date, apparel_id, series, price)
            VALUES (?, ?, ?, ?)
        """, (date_str, apparel_id, series, price))
        inserted += cur.rowcount
    return inserted


# ═════════════════════════════════════════════════════════════════════
#  pokeca-chart
# ═════════════════════════════════════════════════════════════════════
def _slug_from_url(url: str) -> str | None:
    m = re.search(r"pokeca-chart\.com/([^/?#]+)", url)
    return m.group(1) if m else None


def _pokeca_api(endpoint: str, params: dict):
    url = POKECA_API_BASE + endpoint
    r = requests.get(url, params=params, headers=POKECA_HEADERS, timeout=TIMEOUT)
    r.raise_for_status()
    try:
        return r.json()
    except Exception:
        return r.text.strip()


def pokeca_get_item_id(slug: str) -> str | None:
    res = _pokeca_api("get-item-id.php", {"slug": slug})
    if res is None:
        return None
    item_id = str(res).strip()
    return item_id if item_id != "-1" else None


def pokeca_fetch_grd_history(item_id: str) -> list[dict]:
    """PSA10枚数 / PSA合計枚数 の日次履歴"""
    data = _pokeca_api("get.php",
                       {"function": "get_chart_grd_data", "item_id": item_id})
    if not isinstance(data, list):
        return []
    out = []
    for entry in data:
        d = entry.get("date")
        pop10 = entry.get("grd_status_10")
        if not d or pop10 is None:
            continue
        pop8 = int(entry.get("grd_status_8") or 0)
        pop9 = int(entry.get("grd_status_9") or 0)
        pop10i = int(pop10)
        total = pop8 + pop9 + pop10i
        rate = pop10i / total if total > 0 else None
        out.append({
            "date":       d,
            "psa10_pop":  pop10i,
            "psa_total":  total,
            "psa10_rate": rate,
        })
    return out


def pokeca_fetch_tx_history(item_id: str) -> dict[str, int]:
    """取引件数の日次マップ"""
    data = _pokeca_api("get-chart-data.php", {"item_id": item_id})
    if not isinstance(data, list):
        return {}
    out = {}
    for entry in data:
        d = entry.get("date")
        v = entry.get("volume")
        if d and v is not None:
            try:
                out[d] = int(v)
            except (ValueError, TypeError):
                pass
    return out


def _save_pokeca_stats(conn, apparel_id: int, grd_history: list[dict],
                       tx_history: dict[str, int]) -> int:
    inserted = 0
    # 全日付（PSA pop or tx いずれかある）を統合
    all_dates: set[str] = set(tx_history.keys())
    all_dates.update(e["date"] for e in grd_history)

    grd_by_date = {e["date"]: e for e in grd_history}

    for d in all_dates:
        grd = grd_by_date.get(d, {})
        tx = tx_history.get(d)
        cur = conn.execute("""
            INSERT OR REPLACE INTO pokeca_stats
              (date, apparel_id, psa10_pop, psa_total, psa10_rate, transaction_count)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            d, apparel_id,
            grd.get("psa10_pop"),
            grd.get("psa_total"),
            grd.get("psa10_rate"),
            tx,
        ))
        inserted += cur.rowcount
    return inserted


# ═════════════════════════════════════════════════════════════════════
#  CSV
# ═════════════════════════════════════════════════════════════════════
def load_products() -> list[dict]:
    if not PRODUCTS_CSV.exists():
        log.error("%s が見つかりません", PRODUCTS_CSV)
        sys.exit(1)
    for enc in ("utf-8-sig", "utf-8", "cp932", "shift_jis"):
        try:
            with open(PRODUCTS_CSV, encoding=enc) as f:
                return list(csv.DictReader(f))
        except UnicodeDecodeError:
            continue
    log.error("products.csv の文字コード判定失敗")
    sys.exit(1)


# ═════════════════════════════════════════════════════════════════════
#  処理単位
# ═════════════════════════════════════════════════════════════════════
def process_snkrdunk(conn, apparel_id: int, product_type: str,
                     nickname: str, pokeca_url: str | None,
                     brand: str = "pokeca") -> None:
    info = snkr_fetch_product_info(apparel_id)
    # 自動検出された brand が CSV と異なる場合は自動検出を優先
    detected = info.get("brand")
    final_brand = detected or brand or "pokeca"
    log.info("  [snkrdunk] %s [brand=%s]", info["name"], final_brand)

    _upsert_product(conn, apparel_id, product_type, info["name"],
                    nickname, info["img_url"], pokeca_url, final_brand)

    if product_type == "BOX":
        # BOX: /sales-chart からサイズ別(1個)を取得
        time.sleep(1)
        options = snkr_fetch_chart_options(apparel_id, used=False)
        option_map = _resolve_option_ids(options, BOX_TARGET_SERIES)
        if not option_map:
            log.warning("  [snkrdunk] BOX: 対象シリーズが見つかりません %s",
                        BOX_TARGET_SERIES)
            return
        for series_name, opt_id in option_map.items():
            time.sleep(1)
            points = snkr_fetch_chart(apparel_id, opt_id, used=False)
            n = _save_snkr_series(conn, apparel_id, series_name, points)
            log.info("  [snkrdunk %s] optId=%d → %d 件", series_name, opt_id, n)

    else:
        # CARD: /sales-chart/used から状態別(PSA10, A)を取得
        time.sleep(1)
        options = snkr_fetch_chart_options(apparel_id, used=True)
        option_map = _resolve_option_ids(options, CARD_TARGET_SERIES)
        if not option_map:
            log.warning("  [snkrdunk] CARD: 対象シリーズが見つかりません %s "
                        "(取れたオプション: %s)",
                        CARD_TARGET_SERIES,
                        [o.get("localizedName") for o in options])
            return
        for series_name, opt_id in option_map.items():
            time.sleep(1)
            points = snkr_fetch_chart(apparel_id, opt_id, used=True)
            n = _save_snkr_series(conn, apparel_id, series_name, points)
            log.info("  [snkrdunk %s] optId=%d → %d 件", series_name, opt_id, n)


def process_pokeca(conn, apparel_id: int, pokeca_url: str) -> None:
    slug = _slug_from_url(pokeca_url)
    if not slug:
        log.warning("  [pokeca] URL からスラッグ取得失敗: %s", pokeca_url)
        return

    item_id = pokeca_get_item_id(slug)
    if not item_id:
        log.warning("  [pokeca] item_id 取得失敗: %s", slug)
        return
    log.info("  [pokeca] item_id=%s", item_id)

    time.sleep(1)
    grd_history = pokeca_fetch_grd_history(item_id)
    time.sleep(1)
    tx_history  = pokeca_fetch_tx_history(item_id)

    n = _save_pokeca_stats(conn, apparel_id, grd_history, tx_history)
    log.info("  [pokeca] PSA枚数履歴=%d件 / 取引件数履歴=%d件 / DB保存=%d件",
             len(grd_history), len(tx_history), n)


# ═════════════════════════════════════════════════════════════════════
#  メイン
# ═════════════════════════════════════════════════════════════════════
def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apparel", type=int, help="特定の apparel_id のみ")
    parser.add_argument("--skip-snkrdunk", action="store_true")
    parser.add_argument("--skip-pokeca",   action="store_true")
    args = parser.parse_args()

    init_db()
    products = load_products()

    if args.apparel:
        products = [p for p in products if int(p["apparel_id"]) == args.apparel]
        if not products:
            log.error("指定 apparel_id がありません: %s", args.apparel)
            return

    log.info("=== 取得開始: %d 件 ===", len(products))

    for i, prod in enumerate(products):
        apparel_id   = int(prod["apparel_id"])
        product_type = (prod.get("type") or "").strip().upper()
        nickname     = (prod.get("nickname") or "").strip()
        pokeca_url   = (prod.get("pokeca_url") or "").strip()
        brand        = (prod.get("brand") or "pokeca").strip().lower()

        log.info("[%d/%d] apparel_id=%d type=%s brand=%s",
                 i + 1, len(products), apparel_id, product_type, brand)

        conn = sqlite3.connect(DB_PATH)
        try:
            if not args.skip_snkrdunk:
                try:
                    process_snkrdunk(conn, apparel_id, product_type,
                                     nickname, pokeca_url or None, brand)
                except requests.RequestException as e:
                    log.error("  snkrdunk 通信エラー: %s", e)
                except Exception as e:
                    log.exception("  snkrdunk エラー: %s", e)

            if not args.skip_pokeca and pokeca_url and product_type == "CARD":
                try:
                    process_pokeca(conn, apparel_id, pokeca_url)
                except requests.RequestException as e:
                    log.error("  pokeca 通信エラー: %s", e)
                except Exception as e:
                    log.exception("  pokeca エラー: %s", e)

            conn.commit()
        finally:
            conn.close()

        if i < len(products) - 1:
            log.info("  %d 秒待機...", REQUEST_DELAY)
            time.sleep(REQUEST_DELAY)

    log.info("=== 完了 ===")


if __name__ == "__main__":
    main()
