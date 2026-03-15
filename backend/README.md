# Kira-Kira OshareQuiz — Backend 🎯

AWS SAM によるサーバーレスバックエンドです。API Gateway WebSocket + Lambda + DynamoDB で構成されています。

## 構成

```
backend/
├── template.yaml              # SAM テンプレート（インフラ定義）
├── samconfig.toml.example     # デプロイ設定テンプレート
├── package.json
├── src/
│   ├── package.json           # Lambda 依存関係
│   ├── index.mjs              # WebSocket ルーター
│   ├── handlers/              # アクションハンドラー
│   │   ├── connect.mjs        # $connect — 接続時の初期化
│   │   ├── disconnect.mjs     # $disconnect — 切断時のクリーンアップ
│   │   ├── register.mjs       # register — プレイヤー登録・再接続
│   │   ├── connectRole.mjs    # connect_role — 管理者/表示画面の認証
│   │   ├── loadQuizzes.mjs    # load_quizzes — クイズ読込 + sessionId 生成
│   │   ├── startQuestion.mjs  # start_question — 出題開始（参加受付終了）
│   │   ├── submitAnswer.mjs   # submit_answer — 回答送信（選択問題は即時自動採点）
│   │   ├── closeAnswers.mjs   # close_answers — 回答締切（全員採点済みなら即正解発表）
│   │   ├── judge.mjs          # judge — テキスト問題の手動○×判定
│   │   ├── revealAnswer.mjs   # reveal_answer — 正解発表（未採点を自動不正解処理）
│   │   ├── showScores.mjs     # show_scores — 最終成績発表
│   │   ├── resetAll.mjs       # reset_all — 全データリセット + sessionId クリア
│   │   └── getState.mjs       # get_state — 現在状態取得（リロード復帰用）
│   └── lib/
│       ├── db.mjs             # DynamoDB 操作ユーティリティ
│       └── broadcast.mjs      # WebSocket 配信ユーティリティ
├── sample-data/
│   └── quizzes.csv            # サンプルクイズデータ
├── scripts/
│   └── load-quizzes.mjs       # CLI からクイズを投入するスクリプト
└── tests/
    └── events/                # テスト用 Lambda イベント
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

## DynamoDB テーブル設計

シングルテーブルデザインを採用し、GSI1 でクエリパターンを拡張しています。

### メインテーブル: `quiz-app-{stage}`

| PK | SK | 用途 |
|---|---|---|
| `GAME` | `STATE` | ゲーム状態（status, currentQuizId, questionHistory, sessionId 等） |
| `QUIZ#{quizId}` | `META` | クイズ問題データ |
| `QUIZ#{quizId}` | `ANSWER#{playerId}` | 回答データ（isCorrect, pointsAwarded 含む） |
| `PLAYER#{playerId}` | `META` | プレイヤーデータ（totalScore, correctCount 等） |

### 接続テーブル: `quiz-app-connections-{stage}`

| connectionId | role | playerId |
|---|---|---|
| WebSocket接続ID | player/admin/display/unknown | プレイヤーID（playerのみ） |

## セッション管理

ゲーム状態に `sessionId` フィールドを保持し、クイズセッションのライフサイクルを管理します。

- **`loadQuizzes`**: `randomUUID()` で新しい `sessionId` を生成し、`gameState.sessionId` に保存。全クライアントにブロードキャスト。
- **`resetAll`**: `sessionId` を `null` にリセット。全クライアントに `full_reset` をブロードキャスト。
- **`getState`**: `state_sync` レスポンスに `sessionId` を含む。
- **`register`**: `registered` レスポンスに `sessionId` を含む。

フロントエンドはこの `sessionId` を `localStorage` に保存し、サーバーから受信した値と比較することで、リセット後にスマホロック解除した端末が前のクイズの参加状態を引きずることを防ぎます。

## 自動採点の仕組み（選択問題）

`submitAnswer.mjs` で選択問題の回答を受信した際、`correctChoiceIndex` と照合して即座に正誤判定とポイント計算を行います。

```
1. 回答受信 → putAnswer (isCorrect=null)
2. correctChoiceIndex と照合 → 正解/不正解を判定
3. 正解の場合:
   a. updateAnswerJudgment(true, 0) で一時マーク
   b. 全正解回答を answeredAt でソート → rank を算出
   c. calcPoints(basePoints, rank) でポイント計算
   d. updateAnswerJudgment(true, pointsAwarded) で確定
   e. プレイヤーの totalScore を加算
4. judgment_result をプレイヤーに送信
5. judgment_updated を管理画面に送信（ScoreBoard リアルタイム更新）
6. live_correct_update を表示画面に送信
```

`closeAnswers.mjs` は回答締切時に全回答が採点済みかチェックし、全員採点済み（＝選択問題のみ）なら `judging` フェーズをスキップして直接 `showing_answer` に遷移します。

## WebSocket API リファレンス

### クライアント → サーバー

| action | 送信元 | パラメータ | 説明 |
|---|---|---|---|
| `register` | 解答者 | `name`, `playerId?` | プレイヤー登録・再接続。`accepting` 時のみ新規可 |
| `connect_role` | 管理者/表示 | `role`, `secret` | パスワード認証。`full_state` を返す |
| `load_quizzes` | 管理者 | `quizzes[]` | クイズデータ読込。`sessionId` を生成 |
| `start_question` | 管理者 | `quizId` | 出題開始。参加受付を終了 |
| `submit_answer` | 解答者 | `quizId`, `answerText?`, `choiceIndex?` | 回答送信。選択問題は即時自動採点 |
| `close_answers` | 管理者 | — | 回答締切。全員採点済みなら即正解発表 |
| `judge` | 管理者 | `quizId`, `playerId`, `isCorrect` | テキスト問題の手動採点。採点済みは無視 |
| `reveal_answer` | 管理者 | — | 正解発表。未採点を自動不正解処理 |
| `show_scores` | 管理者 | — | 最終成績発表。全問出題済みが条件 |
| `reset_all` | 管理者 | — | 全データリセット。`sessionId` を null に |
| `get_state` | 全員 | — | 現在状態取得。`sessionId` を含む |
| `ping` | 全員 | — | キープアライブ（30秒間隔） |

### サーバー → クライアント

| event | 配信先 | 主要フィールド | 説明 |
|---|---|---|---|
| `registered` | 解答者 | `playerId`, `sessionId`, `myAnswer`, `myJudgment` | 登録完了。リロード復帰に必要な全データを含む |
| `registration_rejected` | 解答者 | `reason`, `sessionId` | 登録拒否（init or 受付終了） |
| `full_state` | 管理者/表示 | `gameState{sessionId}`, `players`, `quizzes` | 認証後のフルステート |
| `state_sync` | 全員 | `sessionId`, `myAnswer`, `myJudgment`, `revealData` | 現在状態。リロード復帰の核 |
| `game_state_update` | 全員 | `status`, `sessionId`, `totalQuizCount` | CSV読込時のステータス変更 |
| `question_started` | 全員 | `quizId`, `questionNumber`, `questionText`, `choices?` | 出題開始 |
| `answer_submitted` | 解答者 | `answerText`, `answeredAt` | 回答受付確認 |
| `judgment_result` | 解答者 | `isCorrect`, `pointsAwarded`, `totalScore` | 正誤結果（自動/手動共通） |
| `new_answer` | 管理者 | `playerId`, `answerText`, `isCorrect?`, `pointsAwarded?` | 新回答（自動採点結果付きの場合あり） |
| `judgment_updated` | 管理者 | `playerId`, `isCorrect`, `pointsAwarded`, `totalScore` | 採点結果更新（ScoreBoard連動） |
| `live_correct_update` | 表示 | `correctPlayers[{rank, playerName, pointsAwarded, elapsedMs}]` | 正解者リアルタイム更新 |
| `answer_count_update` | 表示 | `count`, `total` | 回答済み人数 |
| `answers_closed` | 全員 | — | 回答締切 |
| `answer_revealed` | 全員 | `correctAnswer`, `acceptableAnswers`, `correctPlayers` | 正解発表 |
| `scores_revealed` | 全員 | `rankings` | 最終成績 |
| `full_reset` | 全員 | `sessionId: null` | リセット。全クライアントが初期状態に戻る |
| `error` | 送信者 | `code`, `message` | エラー（i18n 対応エラーコード） |

### エラーコード一覧

バックエンドは日本語メッセージを直接返さず、エラーコードを返します。フロントエンドが `i18n/ja.js` の `error.*` キーで翻訳して表示します。

| code | 意味 |
|---|---|
| `name_required` | 名前未入力 |
| `name_taken` | 名前が既に使用されている |
| `wrong_password` | パスワード不一致 |
| `invalid_role` | 無効なロール指定 |
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
