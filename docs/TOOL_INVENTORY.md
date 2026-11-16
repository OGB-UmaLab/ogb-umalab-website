# OGBデータ研究所｜既存ツール・ガイド棚卸し（確認済み範囲）

確認日：2026-11-17。GitHub main のファイルを個別取得して存在とタイトルを確認した。**リポジトリ全体の完全一覧ではない**。機能説明はツール一覧ページの表示内容に基づく。実ブラウザでの操作検証は別途必要。

| No. | 実在ファイル | 現在の用途 | 業務フロー上の役割 | 次に確認すべき点 |
|---|---|---|---|---|
| 1 | `tools/pdf-split-rename/index.html` | PDF分割・一括命名 | 書類整理 | 宛先とページの対応、保存形式 |
| 2 | `tools/image-batch/index.html` | 画像一括リサイズ・圧縮・形式変換 | 商品画像準備 | 枚数・容量上限、画質比較 |
| 3 | `tools/list-cleaner/index.html` | 重複行・差分整理 | 名簿・コード整理 | 日本語・空欄・表記揺れ |
| 4 | `tools/csv-merge/index.html` | 複数CSV結合・重複削除 | 複数期間・店舗のデータ統合 | 列名差・入力形式の適合 |
| 5 | `tools/csv-analyzer/index.html` | 売上・経費の自動診断、統計・グラフ | データ分析と可視化 | 業種別の解釈、出力例 |
| 6 | `tools/pricing-simulator/index.html` | 販売価格・利益率の逆算 | 販売価格の検討 | 原価・手数料の条件差 |
| 7 | `tools/order-line-aggregate/index.html` | 注文明細の注文単位集計 | 受注データの前処理 | EC各社CSVへの適合 |
| 8 | `tools/order-payment-reconcile/index.html` | 受注・決済CSVの照合 | 入金確認・差額発見 | 分割決済・返金・手数料 |
| 9 | `tools/index.html` | ツール案内、利益・統計・相関の簡易計算 | 入口と単発計算 | 課題別の導線整理 |

## 確認できた解説・研究の入口

- `research/index.html`：研究・開発事例
- `guides/csv-analysis-basics/index.html`：CSV分析の基本
- `guides/pricing-profit-basics/index.html`：販売価格の決め方
- `guides/order-payment-reconciliation/index.html`：受注・決済CSV照合の手順

## 既存機能から組み立てられる業務フロー（仮説）

1. **ネットショップ受注確認**：注文明細集計 → 受注・決済照合 → 不一致を確認
2. **複数店舗・月次集計**：CSV結合 → CSV分析 → 結果を読み解く
3. **販売計画**：販売価格逆算 → 利益・損益分岐計算 → 条件を比較
4. **事務資料整理**：PDF分割・命名、画像一括処理、リスト整理（独立した作業）

上記は**導線の候補**であり、実際の事業者の入力CSVと結果の整合性を確認したものではない。

## 次に必要な全体調査

- リポジトリの全ページ一覧、サイトマップ、公開ページの対応を確認する。
- 各ツールの入力・出力仕様、ブラウザ検証状況、実用例の有無を整理する。
- 課題別の入口がどこで分断されるかを調べる。
- 専門分野の比較を完了するまでは新しい大型ツールを作らない。

管理元：[`DEVELOPMENT_MASTER_PLAN.md`](DEVELOPMENT_MASTER_PLAN.md)
