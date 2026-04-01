# Kira-Kira OshareQuiz 🎯

イベント向けリアルタイムクイズ大会運営 Web アプリケーションです。  
WebSocket による即時同期で、解答者（スマホ）・管理者（PC）・プロジェクタ表示の3画面を連携させ、クイズ大会をスムーズに運営できます。

## 特徴

- **リアルタイム同期**: WebSocket で全画面が即座に連動。出題・回答・採点・発表のすべてがリアルタイム
- **3画面連携**: 解答者（スマホ）/ 管理者（PC）/ プロジェクタ表示が独立して動作
- **対数スコアリング**: 早い回答ほど高得点。1位が満点、対数関数で傾斜配点。選択問題はリアルタイムでポイント確定
- **選択問題の即時自動採点**: 選択肢を選んだ瞬間にサーバーで正誤判定・ポイント加算。回答締切で即正解発表
- **テキスト問題の手動採点**: 管理者が○×を手動で判定。上から順に1つずつ
- **連続正解ストリーク**: 連続正解数をトラッキングし、プレイヤー画面に「🔥3問連続正解！」と表示
- **正解率表示**: 正解発表画面で問題ごとの正解率をパーセント表示
- **S3結果エクスポート**: 最終成績発表時に人間可読なテキストレポートをS3に自動出力
- **クイズタイトル**: CSVのメタデータ行 `#title,` でクイズ名を指定。表示画面に常時表示
- **全状態リロード耐性**: どの画面も F5 やスマホロック復帰で状態を完全に維持
- **セッション管理**: クイズごとに一意の sessionId を発行。リセット後にロック解除した端末が前のクイズの参加状態を引きずらない
- **IAM最小権限**: Lambda に必要最小限の DynamoDB/S3/API Gateway 権限のみ付与
- **低コスト**: AWS サーバーレス構成で数時間のイベントなら100円未満
- **i18n対応**: 全文言を外部化。日本語ロケール同梱
- **ワンコマンドデプロイ**: プロジェクトルートのデプロイスクリプトでバックエンド・フロントエンドを一括デプロイ

## アーキテクチャ

```
┌──────────┐  ┌──────────┐  ┌──────────┐
│  解答者   │  │  管理者   │  │ プロジェクタ│
│ (スマホ)  │  │  (PC)    │  │   (PC)    │
└────┬─────┘  └────┬─────┘  └────┬─────┘
     └──────┬──────┴──────┬──────┘
            │             │
     S3 + CloudFront    API Gateway
     (React SPA)        (WebSocket)
                          │
                       Lambda
                     (Node.js 22)
                       │     │
                  DynamoDB   S3
                  (データ)   (結果レポート)
```

## リポジトリ構成

```
KiraKiraOshareQuiz/
├── deploy.sh.example          # デプロイスクリプトテンプレート（Mac/Linux）
├── deploy.ps1.example         # デプロイスクリプトテンプレート（Windows PowerShell）
├── deploy-policy.json         # デプロイ用IAM最小権限ポリシー
├── backend/
│   ├── template.yaml          # SAM テンプレート（API GW + Lambda + DynamoDB + S3）
│   ├── samconfig.toml.example # デプロイ設定テンプレート
│   ├── package.json
│   ├── src/
│   │   ├── index.mjs          # WebSocket ルーター
│   │   ├── handlers/          # 各アクションのハンドラー (13個)
│   │   └── lib/               # DB操作・WebSocket配信ユーティリティ
│   ├── sample-data/           # サンプルクイズCSV（#title メタデータ付き）
│   └── scripts/               # CLIツール
├── frontend/
│   ├── src/
│   │   ├── App.jsx            # ルーティング (/, /control, /screen)
│   │   ├── config.js          # 設定値 (WS_URL, localStorage キー)
│   │   ├── hooks/             # WebSocket 接続管理
│   │   ├── contexts/          # ゲーム状態管理 (useReducer)
│   │   ├── components/        # 共通UIコンポーネント
│   │   ├── i18n/              # 国際化 (日本語ロケール)
│   │   └── pages/             # 3画面 (player / admin / display)
│   └── .env.example
├── .gitignore
├── LICENSE (MIT)
└── README.md
```

## 進行フロー

```
初期 ──[CSV読込]──▶ 参加受付 ──[出題]──▶ 回答受付中
     (sessionId      (名前入力)            │
      quizTitle       ↓               [回答締切]
      生成)      参加受付終了              │
                                  ┌───────┴───────┐
                                  │               │
                            選択問題のみ     テキスト問題あり
                            (全員自動採点済)  (手動採点が必要)
                                  │               │
                                  │          採点中(○×判定)
                                  │               │
                                  └───────┬───────┘
                                          │
  ◀──[次を出題]── 正解発表 ◀──────────────┘
                     │         正解率・ストリーク表示
             [全問終了後] ──▶ 最終成績発表
                                │      S3レポート自動出力
                         [リセット] → 初期に戻る
```

### 状態遷移の詳細

| 状態 | 管理者の操作 | 解答者の状態 | 備考 |
|---|---|---|---|
| `init` | CSV読込 | 準備中画面 | 参加不可 |
| `accepting` | 出題ボタン | 名前入力→参加 | 新規参加はここだけ |
| `answering` | 締切ボタン | 回答入力 | 選択問題は即時自動採点+ポイント確定 |
| `judging` | ○×判定→正解発表 | 採点待ち | テキスト問題のみ。選択問題はスキップ |
| `showing_answer` | 次を出題 or 成績発表 | 正解確認 | 正解率表示。未採点は自動不正解処理 |
| `showing_scores` | リセット | 最終順位確認 | S3にレポート自動出力 |

## クイズデータの形式（CSV）

`backend/sample-data/quizzes.csv` を参照してください。

```csv
#title,キラキラ おしゃれクイズ 2026春
questionNumber,questionText,questionType,modelAnswer,acceptableAnswers,choices,correctChoiceIndex,points
1,日本で一番高い山は？,text,富士山,"富士山|ふじさん|ふじ山",,,10
2,東京タワーの高さは？,choice,,,233m|333m|433m|533m,1,10
```

### メタデータ行

`#` で始まる行はコメント扱いです。`#title,クイズ名` と記載すると、表示画面のタイトルバーに常時表示されます。既存CSVとの後方互換性があり、メタデータ行がなくてもエラーにはなりません。

### フィールド定義

| フィールド | 必須 | 説明 |
|---|---|---|
| `questionNumber` | | 問題番号（省略時は行番号） |
| `questionText` | ○ | 問題文 |
| `questionType` | ○ | `text`（テキスト回答）または `choice`（選択肢） |
| `modelAnswer` | △ | テキスト問題の模範解答 |
| `acceptableAnswers` | | 正解として許容する別表記（パイプ `\|` 区切り） |
| `choices` | △ | 選択肢（パイプ `\|` 区切り） |
| `correctChoiceIndex` | △ | 正解の選択肢インデックス（0始まり） |
| `points` | | 満点（デフォルト: 10） |

### スコアリング

```
points = max(1, round(basePoints × ln(2) / ln(rank + 1)))

例（10点満点）: 1位→10pt, 2位→6pt, 3位→5pt, 5位→4pt, 10位→3pt
```

- **選択問題**: 回答時にサーバーで即時採点+ポイント確定（count-before-mark方式）。正解発表時にrecalculateで最終補正。
- **テキスト問題**: 管理者が順次○を押した時点でポイント確定。正解発表時に未採点は自動不正解。

### 連続正解ストリーク

プレイヤーの `correctStreak` をサーバーで管理。正解でインクリメント、不正解・無回答でリセット。2問以上連続正解でプレイヤー画面に「🔥N問連続正解！」と表示されます。

## クイックスタート

### 1. クローン

```powershell
git clone https://github.com/shotacure/KiraKiraOshareQuiz.git
cd KiraKiraOshareQuiz
```

### 2. バックエンドのデプロイ

```powershell
cd backend/src && npm install && cd ..
cp samconfig.toml.example samconfig.toml
# samconfig.toml の AdminSecret を任意のパスワードに変更
sam build
sam deploy
```

デプロイ完了後の出力:
```
WebSocketApiUrl = wss://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/prod
ResultsBucketName = quiz-results-prod-123456789012
```

### 3. フロントエンドのデプロイ

```powershell
cd frontend
npm install
cp .env.example .env.local
# .env.local の VITE_WS_URL にバックエンドの WebSocket URL を設定
npm run build
aws s3 sync dist/ s3://your-frontend-bucket --delete
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

> CloudFront: カスタムエラーレスポンスで 403/404 → `/index.html` (200) の設定が必要（SPA対応）。

### 4. デプロイスクリプトによる一括デプロイ（オプション）

初回セットアップ後は、プロジェクトルートのデプロイスクリプトで一括デプロイが可能です。スクリプト内に AWS プロファイル・S3 バケット名・CloudFront ID をまとめて設定するため、複数プロジェクトを切り替えながら運用する場合も安全です。

```powershell
# Mac/Linux
cp deploy.sh.example deploy.sh
chmod +x deploy.sh
# deploy.sh 内の AWS_PROFILE, FRONTEND_BUCKET, CF_DISTRIBUTION_ID を設定
./deploy.sh

# Windows PowerShell
Copy-Item deploy.ps1.example deploy.ps1
# deploy.ps1 内の $AWS_PROFILE, $FRONTEND_BUCKET, $CF_DISTRIBUTION_ID を設定
.\deploy.ps1
```

個別デプロイも可能です:

```powershell
./deploy.sh backend            # バックエンドのみ
./deploy.sh frontend           # フロントエンドのみ
.\deploy.ps1 -Target backend   # Windows: バックエンドのみ
.\deploy.ps1 -Target frontend  # Windows: フロントエンドのみ
```

## イベント当日の運営手順

1. プロジェクタ PC で表示画面（`/screen`）を開いてフルスクリーン
2. 運営 PC で管理画面（`/control`）を開いてパスワードでログイン
3. 管理画面でクイズ CSV を読み込み → タイトルが表示画面に表示、参加受付開始
4. 参加者にスマホで URL（`/`）にアクセスしてもらい、名前を入力して参加
5. 出題 → 回答締切 → 採点（テキスト問題のみ）→ 正解発表 → 次の問題…
6. 全問終了後、最終成績発表（結果レポートが自動でS3に出力）
7. 次のクイズを行う場合はリセット → CSV 読込

## S3結果レポート

最終成績発表時に Lambda が自動で S3 に人間可読なテキストレポートを出力します。

**S3パス**: `s3://quiz-results-{stage}-{accountId}/results/{sessionId}_{timestamp}.txt`

```
============================================================
キラキラ おしゃれクイズ 2026春 — 結果レポート
2026-03-18 15:30:00 (JST)
============================================================

■ 最終成績
──────────────────────────────────────────────────
 順位   名前             得点     正解数
──────────────────────────────────────────────────
 1位    たろう            45pt    6/7
 2位    はなこ            38pt    5/7
──────────────────────────────────────────────────

■ 問題別結果

Q1: 日本で一番高い山は？ (テキスト, 10pt)
  模範解答: 富士山
  正解率: 5/7 (71%)
  ...
```

## セキュリティ・IAM

- 管理者・表示画面はパスワード認証（`AdminSecret`）で保護
- `samconfig.toml`、`.env.local`、`deploy.sh`、`deploy.ps1` は `.gitignore` 対象
- Lambda IAM: DynamoDB 6アクション + `execute-api:ManageConnections` + `s3:PutObject`（結果バケットのみ）

## デプロイ用 IAM ポリシー

`deploy-policy.json` にデプロイ作業に必要な最小権限の IAM ポリシーを定義しています。デプロイ用 IAM ユーザー/ロールにアタッチして使用してください。

ポリシー内のプレースホルダーを自環境の値に置換します:

| プレースホルダー | 置換先 |
|---|---|
| `ACCOUNT_ID` | AWS アカウント ID |
| `REGION` | デプロイ先リージョン（例: `ap-northeast-1`） |
| `FRONTEND_BUCKET_NAME` | フロントエンド用 S3 バケット名 |
| `CLOUDFRONT_DISTRIBUTION_ID` | CloudFront ディストリビューション ID |

カバーする権限:

| 対象 | 用途 |
|---|---|
| CloudFormation | SAM スタックの作成・更新・削除 |
| S3（SAM アーティファクト） | SAM ビルド成果物のアップロード |
| S3（結果バケット） | `ResultsBucket` の作成・設定 |
| S3（フロントエンド） | `dist/` の sync |
| Lambda | 関数の作成・更新・削除 |
| API Gateway v2 | WebSocket API の管理 |
| DynamoDB | テーブルの作成・更新・削除 |
| IAM | Lambda 実行ロールの作成・管理 |
| CloudFront | キャッシュ無効化 |

## コスト（50人参加・30問・3時間）

| リソース | 概算 |
|---|---|
| API Gateway WebSocket | ~10円 |
| Lambda | 無料枠内 |
| DynamoDB | 無料枠内 |
| S3（結果レポート） | ほぼ0円 |
| S3 + CloudFront（フロント） | ほぼ0円 |
| **合計** | **100円未満** |

## クリーンアップ

```powershell
cd backend
sam delete --stack-name quiz-app
# フロントエンド用S3バケットも手動で削除
aws s3 rm s3://your-frontend-bucket --recursive
aws s3 rb s3://your-frontend-bucket
```

> `sam delete` で DynamoDB テーブル、Lambda、API Gateway、結果用 S3 バケット（`ResultsBucket`）がすべて削除されます。フロントエンド用の S3 バケットと CloudFront ディストリビューションは SAM 管理外のため手動削除が必要です。

## 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | React 18, Vite, Tailwind CSS |
| バックエンド | AWS Lambda (Node.js 22), API Gateway WebSocket |
| データベース | DynamoDB (シングルテーブルデザイン + GSI) |
| ストレージ | S3（結果レポート出力） |
| ホスティング | S3 + CloudFront |
| IaC | AWS SAM |

## ライセンス

MIT License — 詳細は [LICENSE](./LICENSE) を参照してください。
