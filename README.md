# PSAポケカ相場モニター

みんなのポケカ相場 GR の指定カードページから PSA 関連指標を週1回取得し、Streamlit ダッシュボードで推移・ランキング・アラートを表示するツールです。

## 構成

```
PSATOOL/
├── app.py            Streamlitダッシュボード
├── fetch.py          データ取得（スクレイピング）
├── analyze.py        指標計算・シグナル検出
├── cards.csv         監視対象カード一覧
├── requirements.txt
├── data/
│   └── market.db     蓄積データ（SQLite、自動生成）
└── .github/workflows/
    └── weekly.yml    GitHub Actions（毎週日曜9時JST）
```

## セットアップ

```bash
# 依存ライブラリのインストール
pip install -r requirements.txt

# 監視カードを登録（cards.csv を編集）
# card_name,card_url
# カード名,https://みんなのポケカ相場GRのカード個別URL

# 動作確認（DBに保存しない）
python fetch.py --dry-run

# データ取得（初回）
python fetch.py

# ダッシュボード起動
streamlit run app.py
```

## セレクタ調整（初回必須）

fetch.py は HTML 内のラベルを探して値を抽出しますが、**実際のサイト構造に合わせた調整が必要**です。

```bash
# HTMLをローカルに保存して構造確認
python fetch.py --dry-run --debug
# → debug_html/ 以下に HTML ファイルが保存されます

# 1件だけテスト
python fetch.py --dry-run --card "https://..."
```

`fetch.py` の `scrape_card()` 内の `label_patterns` を実際のサイトの表記に合わせてください。

## 取得指標

| 列名 | 説明 |
|------|------|
| raw_price | 美品価格（円） |
| psa10_price | PSA10価格（円） |
| psa10_pop | PSA10現存枚数 |
| psa10_rate | PSA10取得率（0〜1） |
| transaction_count | 取引件数 |
| difference | PSA10価格 − 美品価格 |
| premium_ratio | PSA10価格 ÷ 美品価格 |

## 計算指標

| 指標 | 計算式 |
|------|--------|
| PSA10時価総額 | psa10_pop × psa10_price |
| 取得率補正指数 | PSA10時価総額 ÷ psa10_rate |
| 鑑定期待値 | rate × psa10_price + (1−rate) × 失敗時価格 − 美品価格 − 鑑定費用 |
| 週間PSA10増加枚数 | 今週 psa10_pop − 先週 psa10_pop |
| 供給圧 | 週間増加枚数 ÷ 取引件数 |

## アラート判定ロジック

| シグナル | 条件 |
|---------|------|
| 需要強い | PSA10枚数増加 & PSA10価格維持または上昇 |
| 全体需要上昇 | 美品価格・PSA10価格ともに前週比上昇 |
| PSA10プレミアム拡大 | 美品横ばい（±5%）& PSA10価格上昇 |
| 供給過多警戒 | PSA10枚数増加 & PSA10価格下落 |
| 鑑定品需要低下 | PSA10価格のみ下落（美品は横ばい以上） |
| PSA10価格下落警戒 | 前週比でPSA10価格が下落 |

## GitHub Actions 自動実行

1. このリポジトリを GitHub に push する
2. `Settings → Actions → General → Workflow permissions` を **Read and write permissions** に設定
3. 毎週日曜 09:00 JST に fetch.py が自動実行され、更新された `data/market.db` がコミットされます
4. 手動実行: `Actions → Weekly PSA Market Data Fetch → Run workflow`

## 注意事項

- 対象カードは最大 20 件（`fetch.py` の `MAX_CARDS`）
- リクエスト間隔は 5 秒（`REQUEST_DELAY`）
- ログイン・CAPTCHA突破・広告ブロック回避等は行いません
- サイトの利用規約を確認してからご利用ください
