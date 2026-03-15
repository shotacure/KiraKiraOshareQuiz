# Kira-Kira OshareQuiz 🎯

イベント向けリアルタイムクイズ大会運営 Web アプリケーションです。  
WebSocket による即時同期で、解答者（スマホ）・管理者（PC）・プロジェクタ表示の3画面を連携させ、クイズ大会をスムーズに運営できます。

## 特徴

- **リアルタイム同期**: WebSocket で全画面が即座に連動。出題・回答・採点・発表のすべてがリアルタイム
- **3画面連携**: 解答者（スマホ）/ 管理者（PC）/ プロジェクタ表示が独立して動作
- **対数スコアリング**: 早い回答ほど高得点。1位が満点、対数関数で傾斜配点
- **選択問題の即時自動採点**: 選択肢を選んだ瞬間にサーバーで正誤判定・ポイント加算。回答締切で即正解発表
- **手動採点**: テキスト問題は管理者が○×を手動で判定
- **全状態リロード耐性**: どの画面も F5 やスマホロック復帰で状態を完全に維持
- **セッション管理**: クイズごとに一意の sessionId を発行。リセット後にロック解除した端末が前のクイズの参加状態を引きずらない
- **低コスト**: AWS サーバーレス構成で数時間のイベントなら100円未満
- **i18n 対応**: 全文言を外部化。日本語ロケール同梱。多言語対応は `en.js` 等を追加するだけ

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
                     (Node.js 20)
                          │
                       DynamoDB
```

## リポジトリ構成

```
KiraKiraOshareQuiz/
├── backend/                   # AWS SAM バックエンド
│   ├── template.yaml          #   インフラ定義 (API GW + Lambda + DynamoDB)
│   ├── samconfig.toml.example #   デプロイ設定テンプレート
│   ├── package.json
│   ├── src/
│   │   ├── index.mjs          #   WebSocket ルーター
│   │   ├── handlers/          #   各アクションのハンドラー (13個)
│   │   └── lib/               #   DB操作・WebSocket配信ユーティリティ
│   ├── sample-data/           #   サンプルクイズCSV
│   ├── scripts/               #   CLIツール
│   └── tests/                 #   テストイベント
│
├── frontend/                  # React フロントエンド
│   ├── src/
│   │   ├── App.jsx            #   ルーティング (/, /control, /screen)
│   │   ├── config.js          #   設定値 (WS_URL, localStorage キー等)
│   │   ├── hooks/             #   WebSocket 接続管理
│   │   ├── contexts/          #   ゲーム状態管理 (useReducer)
│   │   ├── components/        #   共通UIコンポーネント
│   │   ├── i18n/              #   国際化 (日本語ロケール)
│   │   └── pages/             #   3画面 (player / admin / display)
│   ├── .env.example
│   └── deploy.sh
│
├── .gitignore
├── LICENSE (MIT)
└── README.md
```

## 進行フロー

```
初期 ──[CSV読込]──▶ 参加受付 ──[出題]──▶ 回答受付中
     (sessionId     (名前入力)  (受付終了)    │
      生成)                              [回答締切]
                                            │
                                    ┌───────┴───────┐
                                    │               │
                              選択問題のみ     テキスト問題あり
                              (全員自動採点済)  (手動採点が必要)
                                    │               │
                                    │          採点中(○×判定)
                                    │               │
                                    └───────┬───────┘
                                            │
  ◀──[次を出題]── 正解発表 ◀────────────────┘
                     │
             [全問終了後] ──▶ 最終成績発表
                                │
                         [リセット] → sessionId クリア → 初期に戻る
```

### 状態遷移の詳細

| 状態 | 管理者の操作 | 解答者の状態 | 備考 |
|---|---|---|---|
| `init` | CSV読込 | 準備中画面 | 参加不可。sessionId なし |
| `accepting` | 出題ボタン | 名前入力→参加 | 新規参加はここだけ。sessionId 発行済み |
| `answering` | 締切ボタン | 回答入力 | 選択問題は即時自動採点 |
| `judging` | ○×判定→正解発表 | 採点待ち | テキスト問題の手動採点。選択のみの問題はスキップ |
| `showing_answer` | 次を出題 or 成績発表 | 正解確認 | 未採点は自動で不正解処理 |
| `showing_scores` | リセット | 最終順位確認 | — |

### セッション管理の仕組み

クイズデータ読込時にサーバーが一意の `sessionId`（UUID v4）を生成し、全イベントに含めてブロードキャストします。プレイヤー端末は `sessionId` を `localStorage` に保存し、以降のリロードやスマホロック復帰時にサーバーから受信した `sessionId` と比較します。

- **一致**: 同じクイズセッション → 通常のリカバリ処理（状態復元）
- **不一致**: 別のクイズセッション → `localStorage` を完全クリアし、初期画面に強制復帰
- **null**: リセット後（セッションなし） → `localStorage` を完全クリア

これにより、「リセット→新しいクイズを読込」の間にスマホがロックされていた端末が、ロック解除後に前のクイズの参加状態を引きずることがなくなります。

## クイズデータの形式（CSV）

`backend/sample-data/quizzes.csv` を参照してください。

```csv
questionNumber,questionText,questionType,modelAnswer,acceptableAnswers,choices,correctChoiceIndex,points
1,日本で一番高い山は？,text,富士山,"富士山|ふじさん|ふじ山",,,10
2,東京タワーの高さは？,choice,,,233m|333m|433m|533m,1,10
```

| フィールド | 必須 | 説明 |
|---|---|---|
| `questionNumber` | | 問題番号（省略時は行番号） |
| `questionText` | ○ | 問題文 |
| `questionType` | ○ | `text`（テキスト回答）または `choice`（選択肢） |
| `modelAnswer` | △ | テキスト問題の模範解答。管理画面と正解発表画面で表示される |
| `acceptableAnswers` | | 正解として許容する別表記（パイプ `\|` 区切り）。管理画面の参考用 |
| `choices` | △ | 選択肢（パイプ `\|` 区切り） |
| `correctChoiceIndex` | △ | 正解の選択肢インデックス（0始まり）。自動採点に使用 |
| `points` | | 満点（デフォルト: 10）。1位がこの点数を獲得 |

### スコアリング

回答速度（サーバー受信時刻）で順位が決まり、対数関数で傾斜配点されます。

```
points = max(1, round(basePoints × ln(2) / ln(rank + 1)))

例（10点満点）: 1位→10pt, 2位→6pt, 3位→5pt, 5位→4pt, 10位→3pt
```

- **選択問題**: 選択肢タップ時にサーバーで即時自動採点。正誤とポイントが即座に確定。回答締切時に全員が採点済みなので judging をスキップして即正解発表。
- **テキスト問題**: 管理者が回答一覧で○を押した時点で正解確定・ポイント加算。○を押されなかった回答は正解発表時に自動で不正解処理。

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

デプロイ完了後に WebSocket URL が出力されます:
```
WebSocketApiUrl = wss://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/prod
```

### 3. フロントエンドのデプロイ

```powershell
cd frontend
npm install
cp .env.example .env.local
# .env.local の VITE_WS_URL にバックエンドの WebSocket URL を設定
npm run build
aws s3 sync dist/ s3://your-bucket-name --delete
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

> **CloudFront の設定**: SPA のため、カスタムエラーレスポンスで 403/404 → `/index.html` (200) を返す設定が必要です。

## イベント当日の運営手順

1. プロジェクタ PC で表示画面（`/screen`）を開いてフルスクリーン
2. 運営 PC で管理画面（`/control`）を開いてパスワードでログイン
3. 管理画面でクイズ CSV を読み込み → **sessionId が発行され、参加受付が開始**
4. 参加者にスマホで URL（`/`）にアクセスしてもらい、名前を入力して参加
5. 準備ができたら最初の問題を出題（**この瞬間に参加受付が終了**）
6. 回答締切 → ○×判定（テキスト問題の場合）→ 正解発表 → 次の問題…を繰り返す
7. 全問終了後、最終成績発表
8. 次のクイズを行う場合はリセット → CSV 読込（**新しい sessionId が発行される**）

## セキュリティ

- 管理者・表示画面はパスワード認証（`AdminSecret`）で保護
- `backend/samconfig.toml` は `AdminSecret` を含むため `.gitignore` 対象
- `frontend/.env.local` も `.gitignore` 対象
- 管理画面・表示画面の URL パスは推測困難な文字列を使用可能（ただしセキュリティ担保はパスワード認証）

## コスト（50人参加・30問・3時間）

| リソース | 概算 |
|---|---|
| API Gateway WebSocket | ~10円 |
| Lambda | 無料枠内 |
| DynamoDB | 無料枠内 |
| S3 + CloudFront | ほぼ0円 |
| **合計** | **100円未満** |

## クリーンアップ

```powershell
cd backend
sam delete --stack-name quiz-app
aws s3 rm s3://your-bucket-name --recursive
```

## 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | React 18, Vite, Tailwind CSS |
| バックエンド | AWS Lambda (Node.js 20), API Gateway WebSocket |
| データベース | DynamoDB (シングルテーブルデザイン + GSI) |
| ホスティング | S3 + CloudFront |
| IaC | AWS SAM |

## ライセンス

MIT License — 詳細は [LICENSE](./LICENSE) を参照してください。
