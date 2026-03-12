# Kira-Kira OshareQuiz 🎯

イベント向けリアルタイムクイズ大会運営 Web アプリです。
WebSocket による即時同期で、解答者（スマホ）・管理者（PC）・プロジェクタ表示の3画面を連携させ、クイズ大会をスムーズに運営できます。

## 特徴

- **リアルタイム**: WebSocket で全画面が即座に同期
- **3画面連携**: 解答者 / 管理者 / 表示用が独立して動作
- **低コスト**: AWS サーバーレスで数時間のイベントなら **100円未満**
- **簡単セットアップ**: SAM CLI 一発でインフラ構築、Vite で即座にフロント開発
- **対数スコアリング**: 早く回答するほど高得点（1位が満点、対数関数で傾斜）

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

## 進行フロー

```
初期 ──[CSV読込]──▶ 参加受付 ──[出題]──▶ 回答受付
                                           │
       ◀──[次を出題]── 正解発表 ◀──[正解発表]── 採点 ◀──[締切]──┘
                          │
                  [全問終了後] ──▶ 最終成績発表
```

## クイズデータの形式（CSV）

`backend/sample-data/quizzes.csv` を参照してください。

```csv
questionNumber,questionText,questionType,modelAnswer,acceptableAnswers,choices,correctChoiceIndex,points
1,日本で一番高い山は何でしょう？,text,富士山,"富士山|ふじさん|ふじ山",,,10
2,東京タワーの高さは次のうちどれ？,choice,,,233m|333m|433m|533m,1,10
```

### フィールド説明

| フィールド | 必須 | 説明 |
|---|---|---|
| `questionNumber` | | 問題番号（省略時は行番号） |
| `questionText` | ○ | 問題文 |
| `questionType` | ○ | `text` または `choice` |
| `modelAnswer` | △ | テキスト問題の模範解答 |
| `acceptableAnswers` | | 正解として許容する別表記（`\|` 区切り） |
| `choices` | △ | 選択肢問題の選択肢（`\|` 区切り） |
| `correctChoiceIndex` | △ | 正解の選択肢インデックス（0始まり） |
| `points` | | 満点（デフォルト: 10）。1位がこの点数を獲得 |

### スコアリング

管理者が「○」を押した回答者のみ正解扱い。回答速度（サーバー受信時刻）で順位が決まり、対数関数で傾斜配点されます。

```
1位 → 満点 (10pt)
2位 → 6pt
3位 → 5pt
5位 → 4pt
10位 → 3pt
```

## クイックスタート

### 1. クローン

```powershell
git clone https://github.com/shotacure/KiraKiraOshareQuiz.git
cd KiraKiraOshareQuiz
```

### 2. バックエンドのデプロイ

```powershell
cd backend
cd src && npm install && cd ..
cp samconfig.toml.example samconfig.toml
# samconfig.toml の AdminSecret を変更
sam build
sam deploy
```

### 3. フロントエンドのデプロイ

```powershell
cd frontend
npm install
cp .env.example .env.local
# .env.local の VITE_WS_URL を変更
npm run build
aws s3 sync dist/ s3://your-bucket-name --delete
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

## 使い方

### イベント当日

1. プロジェクタ PC で表示画面を開いてフルスクリーン
2. 運営 PC で管理画面を開いてログイン
3. 管理画面でクイズ CSV を読み込み → 参加受付開始
4. 参加者にスマホで URL にアクセスしてもらう
5. 準備ができたら最初の問題を出題（以降、参加受付終了）

### クイズ進行

```
[管理者] CSV読み込み → 参加受付開始
[管理者] [出題] → 参加受付終了、回答受付開始
[管理者] [回答締切]
[管理者] 回答一覧で ○× を手動判定（○を押した瞬間にポイント加算＆表示画面に反映）
[管理者] [正解発表] → 未採点は自動で不正解扱い
[管理者] 次の問題を [出題] → 繰り返し
[管理者] 全問終了後 [最終成績発表]
```

## セキュリティに関する注意

- `backend/samconfig.toml` は AdminSecret を含むため `.gitignore` に入っています
- `frontend/.env.local` も同様に `.gitignore` 対象です
- これらのファイルを絶対に Git にコミットしないでください

## コスト (50人参加・30問・3時間)

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
```

## ライセンス

MIT License
