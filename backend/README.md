# Kira-Kira OshareQuiz 🎯

イベント向けリアルタイムクイズ大会運営Webアプリのバックエンドです。

## 概要

WebSocket によるリアルタイム通信で、解答者（スマホ）・管理者（PC）・プロジェクタ表示の3画面を連携させ、クイズ大会をスムーズに運営できます。

### 特徴

- **リアルタイム通信**: WebSocket による即座の状態同期
- **3つの画面**: 解答者 / 管理者 / プロジェクタ表示
- **低コスト**: AWS サーバーレス構成で数時間のイベントなら100円未満
- **簡単セットアップ**: SAM CLI で一発デプロイ

## アーキテクチャ

```
S3 + CloudFront (フロントエンド)
        │
API Gateway WebSocket API
        │
    Lambda (Node.js 20.x)
        │
    DynamoDB (2テーブル)
```

## 前提条件

- **AWS CLI v2** がインストール・設定済み
- **AWS SAM CLI** がインストール済み
- **Node.js 20.x** 以上
- **Git**

### インストール手順（Windows / Visual Studio 環境）

1. **AWS CLI**: https://aws.amazon.com/cli/ からインストーラをダウンロード
2. **SAM CLI**: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html
3. **Node.js**: https://nodejs.org/ から LTS 版をインストール

```powershell
# AWS CLI の設定（初回のみ）
aws configure
# → Access Key, Secret Key, Region (ap-northeast-1), Output format (json) を入力
```

## セットアップ

### 1. リポジトリのクローン

```powershell
git clone https://github.com/shotacure/KiraKiraOshareQuiz.git
cd KiraKiraOshareQuiz
```

### 2. 依存関係のインストール

```powershell
cd src
npm install
cd ..
```

### 3. 設定ファイルの作成

テンプレートからデプロイ設定ファイルをコピーし、パスワードを設定します:

```powershell
cp samconfig.toml.example samconfig.toml
```

`samconfig.toml` を開き、`AdminSecret` を変更してください:

```toml
parameter_overrides = "Stage=prod AdminSecret=あなたの管理者パスワード"
```

> ⚠️ `samconfig.toml` は `.gitignore` に含まれており、Git にコミットされません。秘密情報の漏洩を防ぐため、**絶対に `.gitignore` から除外しないでください**。

## デプロイ

### ビルド & デプロイ

```powershell
# ビルド
sam build

# デプロイ（初回は --guided を追加すると対話形式で設定可能）
sam deploy

# 初回のみ対話形式でデプロイする場合:
sam deploy --guided
```

デプロイ完了後、出力に **WebSocket API の URL** が表示されます:

```
WebSocketApiUrl = wss://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/prod
```

この URL をフロントエンドの設定に使用します。

### デプロイの確認

```powershell
# スタックの出力を確認
aws cloudformation describe-stacks --stack-name quiz-app --query "Stacks[0].Outputs"
```

## クイズデータの形式

`sample-data/quizzes.json` を参考に、以下の形式で作成します:

```json
{
  "quizzes": [
    {
      "quizId": "c1-q1",
      "cornerNumber": 1,
      "cornerTitle": "一般常識クイズ",
      "questionNumber": 1,
      "questionText": "日本で一番高い山は何でしょう？",
      "questionType": "text",
      "modelAnswer": "富士山",
      "acceptableAnswers": ["富士山", "ふじさん"],
      "points": 10,
      "order": 1
    },
    {
      "quizId": "c1-q2",
      "cornerNumber": 1,
      "cornerTitle": "一般常識クイズ",
      "questionNumber": 2,
      "questionText": "東京タワーの高さは？",
      "questionType": "choice",
      "choices": ["233m", "333m", "433m", "533m"],
      "correctChoiceIndex": 1,
      "points": 10,
      "order": 2
    }
  ]
}
```

### フィールド説明

| フィールド | 必須 | 説明 |
|---|---|---|
| `quizId` | ○ | 一意の問題ID（例: `c1-q1`） |
| `cornerNumber` | | コーナー番号 |
| `cornerTitle` | | コーナータイトル |
| `questionNumber` | | コーナー内の問題番号 |
| `questionText` | ○ | 問題文 |
| `questionType` | ○ | `"text"` または `"choice"` |
| `modelAnswer` | △ | テキスト問題の模範解答 |
| `acceptableAnswers` | | 正解として許容する別表記の配列 |
| `choices` | △ | 選択肢問題の選択肢配列 |
| `correctChoiceIndex` | △ | 正解の選択肢インデックス（0始まり） |
| `points` | | 獲得点数（デフォルト: 10） |
| `order` | | 出題順（ソート用） |

## WebSocket API リファレンス

### クライアント → サーバー

接続後、JSON メッセージの `action` フィールドでルーティングされます。

| action | 送信元 | 主なパラメータ |
|---|---|---|
| `register` | 解答者 | `name`, `playerId?` |
| `connect_role` | 管理者/表示 | `role`, `secret` |
| `submit_answer` | 解答者 | `quizId`, `answerText?`, `choiceIndex?` |
| `start_question` | 管理者 | `quizId` |
| `close_answers` | 管理者 | — |
| `judge` | 管理者 | `quizId`, `playerId`, `isCorrect` |
| `judge_bulk` | 管理者 | `quizId`, `judgments[]` |
| `reveal_answer` | 管理者 | — |
| `show_scores` | 管理者 | — |
| `reset_to_waiting` | 管理者 | — |
| `load_quizzes` | 管理者 | `quizzes[]` |
| `get_state` | 全員 | — |

### サーバー → クライアント（主なイベント）

| event | 配信先 | 説明 |
|---|---|---|
| `registered` | 解答者 | 登録完了・playerId発行 |
| `full_state` | 管理者/表示 | 接続時のフルステート |
| `question_started` | 全員 | 出題開始 |
| `answer_submitted` | 解答者 | 回答受付確認 |
| `new_answer` | 管理者 | 新しい回答の通知 |
| `answer_count_update` | 表示 | 回答済み人数 |
| `answers_closed` | 全員 | 回答締切 |
| `judgment_result` | 解答者 | 正誤結果 |
| `answer_revealed` | 全員 | 正解発表 |
| `scores_revealed` | 全員 | 成績発表 |
| `game_state_update` | 全員 | 状態遷移通知 |

## プロジェクト構成

```
KiraKiraOshareQuiz/
├── template.yaml          # SAM テンプレート（インフラ定義）
├── samconfig.toml.example # SAM デプロイ設定（テンプレート）
├── src/
│   ├── package.json
│   ├── index.mjs          # Lambda エントリポイント（ルーター）
│   ├── handlers/
│   │   ├── connect.mjs        # WebSocket $connect
│   │   ├── disconnect.mjs     # WebSocket $disconnect
│   │   ├── register.mjs       # 解答者登録
│   │   ├── connectRole.mjs    # 管理者/表示ログイン
│   │   ├── submitAnswer.mjs   # 回答送信
│   │   ├── startQuestion.mjs  # 出題開始
│   │   ├── closeAnswers.mjs   # 回答締切
│   │   ├── judge.mjs          # 個別正誤判定
│   │   ├── judgeBulk.mjs      # 一括正誤判定
│   │   ├── revealAnswer.mjs   # 正解発表
│   │   ├── showScores.mjs     # 成績発表
│   │   ├── resetToWaiting.mjs # 待機状態に戻す
│   │   ├── loadQuizzes.mjs    # クイズデータ投入
│   │   └── getState.mjs       # 状態取得（再接続用）
│   └── lib/
│       ├── db.mjs             # DynamoDB 操作
│       └── broadcast.mjs      # WebSocket 配信
├── sample-data/
│   └── quizzes.json       # サンプルクイズデータ
├── LICENSE
└── README.md
```

## 運用コスト

50人参加・30問・3時間のイベントを想定した場合:

| リソース | 概算コスト |
|---|---|
| API Gateway WebSocket | ~10円 |
| Lambda | 無料枠内 |
| DynamoDB | 無料枠内 |
| S3 + CloudFront | ほぼ0円 |
| **合計** | **100円未満** |

## クリーンアップ

イベント終了後、不要であればリソースを削除できます:

```powershell
sam delete --stack-name quiz-app
```

## ローカル開発（オプション）

SAM CLI でローカルテストも可能です:

```powershell
# Lambda をローカルで起動（HTTP のみ、WebSocket は非対応）
sam local start-api

# 個別の Lambda 関数をテスト
sam local invoke QuizHandlerFunction -e tests/events/connect.json
```

> ⚠️ WebSocket API のローカルテストは SAM CLI では直接サポートされていないため、
> `wscat` 等のツールでデプロイ済みの API に接続してテストすることを推奨します。

```powershell
# wscat でテスト接続
npx wscat -c wss://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/prod
> {"action": "register", "name": "テスト太郎"}
```

## ライセンス

MIT License — 詳細は [LICENSE](./LICENSE) を参照してください。
