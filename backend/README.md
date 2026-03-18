# Kira-Kira OshareQuiz — Backend 🎯

AWS SAM によるサーバーレスバックエンドです。API Gateway WebSocket + Lambda + DynamoDB + S3 で構成されています。

## 構成

```
backend/
├── template.yaml              # SAM テンプレート（API GW + Lambda + DynamoDB + S3）
├── samconfig.toml.example     # デプロイ設定テンプレート
├── package.json
├── src/
│   ├── package.json           # Lambda 依存関係
│   ├── index.mjs              # WebSocket ルーター（13アクション + ping）
│   ├── handlers/
│   │   ├── connect.mjs        # $connect — 接続時の初期化
│   │   ├── disconnect.mjs     # $disconnect — 切断時のクリーンアップ
│   │   ├── register.mjs       # register — プレイヤー登録・再接続
│   │   ├── connectRole.mjs    # connect_role — 管理者/表示画面の認証
│   │   ├── loadQuizzes.mjs    # load_quizzes — クイズ読込 + sessionId + quizTitle
│   │   ├── startQuestion.mjs  # start_question — 出題開始（参加受付終了）
│   │   ├── submitAnswer.mjs   # submit_answer — 回答送信（選択問題は即時自動採点+ポイント）
│   │   ├── closeAnswers.mjs   # close_answers — 回答締切（全員採点済みなら即正解発表）
│   │   ├── judge.mjs          # judge — テキスト問題の手動○×判定（順次・ポイント即時確定）
│   │   ├── revealAnswer.mjs   # reveal_answer — 正解発表（recalculate + 正解率 + ストリーク）
│   │   ├── showScores.mjs     # show_scores — 最終成績発表 + S3レポート出力
│   │   ├── resetAll.mjs       # reset_all — 全データリセット
│   │   └── getState.mjs       # get_state — 現在状態取得（リロード復帰用）
│   └── lib/
│       ├── db.mjs             # DynamoDB 操作ユーティリティ
│       └── broadcast.mjs      # WebSocket 配信ユーティリティ
├── sample-data/
│   └── quizzes.csv            # サンプルクイズデータ（#title メタデータ付き）
└── scripts/
    └── load-quizzes.mjs       # CLI からクイズを投入するスクリプト
```

## セットアップ

### 前提条件

- AWS CLI v2（設定済み）
- AWS SAM CLI
- Node.js 20 以上

### デプロイ手順

```powershell
cd backend/src && npm install && cd ..
cp samconfig.toml.example samconfig.toml
# samconfig.toml の AdminSecret を変更
sam build
sam deploy
```

## インフラリソース（template.yaml）

| リソース | 種類 | 用途 |
|---|---|---|
| `QuizTable` | DynamoDB | メインデータ（シングルテーブル + GSI1） |
| `ConnectionsTable` | DynamoDB | WebSocket 接続管理（TTL 付き） |
| `ResultsBucket` | S3 | 結果レポート出力（365日で自動期限切れ） |
| `QuizWebSocketApi` | API Gateway v2 | WebSocket エンドポイント |
| `QuizHandlerFunction` | Lambda | 全アクションを処理する単一ハンドラー |

### IAM 権限（最小権限）

| 対象 | 許可アクション |
|---|---|
| DynamoDB | `GetItem`, `PutItem`, `UpdateItem`, `DeleteItem`, `Query`, `BatchWriteItem` |
| API Gateway | `execute-api:ManageConnections` |
| S3 | `s3:PutObject`（ResultsBucket のみ） |

## DynamoDB テーブル設計

### メインテーブル: `quiz-app-{stage}`

| PK | SK | 用途 |
|---|---|---|
| `GAME` | `STATE` | ゲーム状態（status, sessionId, quizTitle, questionHistory 等） |
| `QUIZ#{quizId}` | `META` | クイズ問題データ |
| `QUIZ#{quizId}` | `ANSWER#{playerId}` | 回答データ（isCorrect, pointsAwarded） |
| `PLAYER#{playerId}` | `META` | プレイヤーデータ（totalScore, correctStreak 等） |

### 接続テーブル: `quiz-app-connections-{stage}`

| connectionId | role | playerId |
|---|---|---|
| WebSocket接続ID | player/admin/display/unknown | プレイヤーID（playerのみ） |

## スコアリングの仕組み

### セッション管理

ゲーム状態の `sessionId` フィールドでクイズセッションのライフサイクルを管理します。

- **`loadQuizzes`**: `randomUUID()` で新しい `sessionId` を生成。全クライアントにブロードキャスト。
- **`resetAll`**: `sessionId` を `null` にリセット。全クライアントに `full_reset` をブロードキャスト。
- **`getState`** / **`register`**: レスポンスに `sessionId` を含む。

フロントエンドは `sessionId` を `localStorage` に保存し、サーバーから受信した値と比較することで、リセット後にスマホロック解除した端末が前のクイズの参加状態を引きずることを防ぎます。不一致時は `localStorage` を全クリアして初期画面に強制復帰します。

### 対数配点

```
points = max(1, round(basePoints × ln(2) / ln(rank + 1)))
```

1位が満点、2位以降が対数で逓減。10点満点の場合: 1位→10pt, 2位→6pt, 3位→5pt, 5位→4pt

### ポイント計算のタイミング

**選択問題 — submitAnswer.mjs（即時確定）**
1. 回答受信 → `correctChoiceIndex` と照合して正誤判定
2. count-before-mark: 自分を除いた既存の正解数を数える → rank 算出
3. `calcPoints(basePoints, rank)` → pointsAwarded 即時確定
4. `judgment_result`（本人）+ `judgment_updated`（全員）を即時送信

**テキスト問題 — judge.mjs（管理者が○×をクリック）**
1. 管理者が上から順に○×を判定（フロントエンドで強制）
2. ○の場合: count-before-mark で rank 算出 → ポイント確定
3. 同上の通知を送信

**正解発表時 — revealAnswer.mjs / closeAnswers.mjs（最終補正）**
1. 未採点回答を自動で不正解処理
2. `recalculateCorrectPoints()`: 全正解回答を answeredAt 順にソートし、rank を再算出して差分補正
3. 無回答者のストリークをリセット

### 連続正解ストリーク

プレイヤーレコードの `correctStreak` フィールドで管理:
- 正解: +1
- 不正解: 0 にリセット
- 無回答（正解発表時に検知）: 0 にリセット

`judgment_result` イベントに `streak` フィールドを含み、フロントエンドで表示。

## S3 結果レポート

`showScores` ハンドラーが最終成績発表時に自動で S3 にテキストレポートを出力します。

**パス**: `results/{sessionId先頭8文字}_{ISO8601タイムスタンプ}.txt`

**内容**:
- クイズタイトル + 日時
- 最終成績表（順位・名前・得点・正解数）
- 問題別の詳細結果（模範解答・許容解答・正解率・全回答一覧）

S3 出力が失敗してもクイズの進行には影響しません（非致命エラー扱い）。

## WebSocket API リファレンス

### クライアント → サーバー

| action | 送信元 | 主要パラメータ | 説明 |
|---|---|---|---|
| `register` | 解答者 | `name`, `playerId?` | プレイヤー登録・再接続 |
| `connect_role` | 管理者/表示 | `role`, `secret` | パスワード認証 |
| `load_quizzes` | 管理者 | `quizzes[]`, `quizTitle?` | クイズ読込。sessionId 生成 |
| `start_question` | 管理者 | `quizId` | 出題開始 |
| `submit_answer` | 解答者 | `quizId`, `answerText?`, `choiceIndex?` | 回答送信 |
| `close_answers` | 管理者 | — | 回答締切 |
| `judge` | 管理者 | `quizId`, `playerId`, `isCorrect` | 手動採点 |
| `reveal_answer` | 管理者 | — | 正解発表 |
| `show_scores` | 管理者 | — | 最終成績発表 + S3出力 |
| `reset_all` | 管理者 | — | 全データリセット |
| `get_state` | 全員 | — | 現在状態取得 |
| `ping` | 全員 | — | キープアライブ |

### サーバー → クライアント

| event | 配信先 | 主要フィールド |
|---|---|---|
| `registered` | 解答者 | `playerId`, `sessionId`, `quizTitle`, `myAnswer`, `myJudgment` |
| `full_state` | 管理者/表示 | `gameState{sessionId, quizTitle}`, `players`, `quizzes` |
| `state_sync` | 全員 | `sessionId`, `quizTitle`, `myAnswer`, `myJudgment`, `revealData` |
| `game_state_update` | 全員 | `status`, `sessionId`, `quizTitle`, `totalQuizCount` |
| `question_started` | 全員 | `quizId`, `questionNumber`, `questionText`, `choices?` |
| `answer_submitted` | 解答者 | `answerText`, `answeredAt` |
| `judgment_result` | 解答者 | `isCorrect`, `pointsAwarded`, `totalScore`, `streak` |
| `judgment_updated` | 全員 | `playerId`, `isCorrect`, `pointsAwarded`, `totalScore` |
| `answer_revealed` | 全員 | `correctAnswer`, `acceptableAnswers`, `correctRate`, `correctPlayers` |
| `scores_revealed` | 全員 | `rankings` |
| `full_reset` | 全員 | `sessionId: null` |
| `error` | 送信者 | `code`, `message` |

### エラーコード

| code | 意味 |
|---|---|
| `name_required` | 名前未入力 |
| `name_taken` | 名前重複 |
| `wrong_password` | パスワード不一致 |
| `invalid_role` | 無効なロール |
| `not_init_state` | init 以外でのクイズ読込 |
| `empty_quizzes` | クイズデータが空 |
| `invalid_quiz` | 必須フィールド不足 |
| `invalid_state` | 現在の状態では実行不可 |
| `not_accepting_answers` | 回答受付中でない |
| `quiz_id_mismatch` | 問題IDが一致しない |
| `already_answered` | 既に回答済み |
| `not_all_questions` | 全問出題されていない |

## ライセンス

MIT License
