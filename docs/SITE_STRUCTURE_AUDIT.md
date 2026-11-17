# OGBデータ研究所｜サイト全体構成の一次監査

調査日：2026-11-17。根拠はGitHub main の `sitemap.xml` と、個別取得した主要ページ。Search Consoleのインデックス登録数とは**別の集計**である。

## 1. サイトマップ内のURL構成

`sitemap.xml` の `<loc>` を集計した結果：**528 URL、重複0件**。

| 第1階層 | URL数 | 内容の位置づけ（暫定） |
|---|---:|---|
| `ogb-data/` | 198 | 競馬データ関連 |
| `global-news/` | 157 | 競馬ニュース関連 |
| `class-promotion/` | 94 | 昇級判定関連 |
| `knowledge/` | 57 | 知識コンテンツ |
| `tools/` | 10 | 無料ツール・入口 |
| `guides/` | 3 | データ分析・業務解説 |
| `data-lab/` | 3 | 研究所案内等 |
| `research/` | 2 | 研究・開発事例 |
| `about/` | 1 | サイト案内 |
| `privacy/` | 1 | プライバシー |
| `umalab/` | 1 | 競馬領域の入口 |
| サイトルート | 1 | トップページ |
| **合計** | **528** | |

※第1階層による機械的分類。ページ内容を528件すべて個別検証したわけではない。

## 2. 構造から読み取れる課題

- 競馬関連3分類（`ogb-data`、`global-news`、`class-promotion`）だけで449 URL（全体の約85.0%）。一般向けの実用ツールは`tools`配下10 URL、解説`guides`配下3 URLである。
- 研究所として何を主力にするか、競馬データ領域と一般向けデータ実務領域の関係を明確に設計する必要がある。
- `tools/x-richtext-test/` がサイトマップに含まれている。公開目的・インデックス対象として妥当かを調査する。現段階では削除・noindex設定は行わない。
- `robots.txt` はGitHubリポジトリ直下からの取得が404だった。**公開サイトでの有無は未確認**。ホスティング側の配信も含め別途調査する。
- サイトマップに含まれることは、Googleにインデックス登録されたことを意味しない。Search Console側の集計とは分けて管理する。

## 3. 仮の情報設計（まだサイトへは反映しない）

- **OGBデータ研究所**：データ整理・照合・分析・判断を支援する研究とツールの入口
- **実務向けツール**：対象業務・利用者別の導線、サンプルと検証結果
- **研究・解説**：計算根拠、実務での解釈、検証可能な事例
- **OGBうまラボ**：競馬データ・ニュース・昇級判定等の専門領域

一般向けと競馬向けをどうナビゲーションで接続するかは、分野選定・利用者調査後に決める。

## 4. 次に行う調査

1. `knowledge/` の57件がどの領域に属するか、代表ページと一覧構成を確認。
2. `data-lab/`、`research/`、`tools/x-richtext-test/` の目的と公開状態を確認。
3. トップページから主要な業務フローへ移動できるか、導線を図にする。
4. 実務分野候補を需要・競合・専門性・既存資産で比較する。
5. 完了した調査結果を `DEVELOPMENT_MASTER_PLAN.md` に反映し、P0の完了条件を満たす。

## 5. 追加確認：サイトの役割と導線の重複

- `knowledge/` の57 URLは、第一階層をさらに分類すると `world-racing/` 35、`rules/` 14、`other/` 7、`knowledge/` 入口1。実在する `knowledge/index.html` のタイトルは「競馬の知識・深掘り｜OGBうまラボ」。一般向け経営ノウハウと混同しない。
- `data-lab/about/`、`data-lab/approach/`、`data-lab/organization/` の3ページはGitHub上で実在を確認。
- **`data-lab/index.html` は実在するが、今回取得したサイトマップに `https://ogb-umalab.com/data-lab/` はない。** 追加確認ではルート `index.html` のcanonicalは `/`、`data-lab/index.html` のcanonicalは `/data-lab/` と別々で、タイトルと主見出しは似ている。両方が別の正規ページとして宣言されているため、役割分担とサイトマップ掲載方針の確認が必要。重複ページと断定して削除はしない。
- `tools/x-richtext-test/index.html` は「X太字貼り付け検証」という個別ツール。業務向けツールと対象者が異なるため、研究所トップでの見せ方とサイトマップ掲載方針を検討する。削除はしない。
- `about/index.html` は「OGBうまラボについて」、`data-lab/about/index.html` は「研究所について」。同じ「about」でも対象が違うため、サイト内の表記を区別する。

## 6. トップページの本文比較と判断材料（2026-11-17）

GitHub上の `index.html` と `data-lab/index.html` の `<main>` 本文を確認した。両ページとも冒頭の「データを整理し、構造を読み解き、次の検証へ。」、研究所の説明、研究プロセス、研究上の問いが共通している。ツール紹介部分はルートがPDF・画像・CSV等を広く案内し、`data-lab/` がCSV分析・価格計算を中心に紹介する点で異なる。

| 確認項目 | `/` | `/data-lab/` |
|---|---|---|
| canonical | `https://ogb-umalab.com/` | `https://ogb-umalab.com/data-lab/` |
| 主見出し | 同一 | 同一 |
| 研究所の説明・研究プロセス | 共通 | 共通 |
| ツール紹介 | 幅広いツール | CSV分析・販売価格中心 |
| サイトマップ | 掲載あり | 掲載なし |

**結論：** 内容が近い2つの入口を、異なるcanonicalで公開している。これだけで検索エンジンの重複判定を断定することはできないが、役割の明確化が必要。Google公式のcanonicalガイドでは、類似ページの代表URLを明確にすることと、サイトマップ・内部リンクとの整合を推奨している。

- Google公式：https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- 選択肢A：`/` を唯一の研究所入口とし、`/data-lab/` は役割を統合またはcanonicalを整理する
- 選択肢B：`/data-lab/` を明確に異なる対象者・用途の入口として再設計し、独立した本文と内部導線を持たせる

**現時点ではA/Bを決定せず、公開HTML・canonical・リダイレクトは変更しない。** P1の専門分野選定とアクセス導線の調査を踏まえて決定する。

## 7. 変更管理

本監査は読み取りと文書作成のみ。競馬関連ページ、サイトマップ、robots設定、公開ツールの動作には変更を加えていない。

## 8. 主要公開ページの個別照合（2026-11-17）

サイトマップのうち `tools/` 10件、`guides/` 3件、`research/` 2件、`data-lab/` 3件、`about/` 1件、`privacy/` 1件、計**20件**をGitHubから個別取得し、ファイルの実在・title・h1・canonicalを確認した。

- 20件すべての `index.html` がGitHub上に実在し、titleとh1を持つ。
- 20件中**18件**は、canonicalがサイトマップ記載URLと一致。
- `tools/x-richtext-test/index.html` はcanonicalの記載がない。
- `about/index.html` はcanonicalの記載がない。
- サイトマップにない `data-lab/index.html` は実在し、`https://ogb-umalab.com/data-lab/` をcanonicalとして指定している。

**優先判断**：これらは構造整備の候補であるが、既存ページの役割を確認する前にcanonicalを一括変更しない。特に `tools/x-richtext-test/` は検証用ページのため、インデックス方針を先に決める。

この個別照合はサイトマップ528 URLすべての検証ではない。Googleによるインデックス状況やAdSense評価を示すものでもない。


## 2026-11-17 優先監査：公開URLと検証用ページ

- `sitemap.xml` をGitHubから直接取得して集計：変更前は532 URL、重複0、ホストはすべて `https://ogb-umalab.com/`。主な内訳：`ogb-data` 198、`global-news` 157、`class-promotion` 94、`knowledge` 57、`tools` 10、`guides` 7。
- `tools/x-richtext-test/` はXへの太字貼り付けを試す検証ページで、公開サイトマップに載り、noindexがなかった。実用ページと検証ページを区別するため、**ページ自体は残したまま** `noindex,follow` を追加し、サイトマップから除外した。変更後のサイトマップは531 URL。
- `about/` にcanonicalがなかったため `https://ogb-umalab.com/about/` を明記した。
- 4つの実践ガイド（注文照合、CSV結合、CSV分析、販売価格）はGitHub上で `index.html` の存在とcanonical一致を個別確認した。
- **残件**：531 URLの実ファイル全件照合と、実ブラウザ・GitHub Actionsの合否確認。リポジトリ上の再取得と実サイトの配信成功は別。PR向けに限定されたGitHub Actions照会では対象コミットの実行履歴を取得できなかった。
- `data-lab/` とトップ `/` の重複に近い位置づけは引き続き判断保留。URLの削除・転送は実施していない。
