# Kira-Kira OshareQuiz — Frontend 🎯

React + Vite + Tailwind CSS によるクイズ大会フロントエンドです。3つの画面（解答者・管理者・プロジェクタ表示）を単一の SPA で提供します。

## 構成

```
frontend/
├── index.html                 # エントリ HTML（Webフォント読み込み含む）
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── .env.example               # 環境変数テンプレート
├── deploy.sh                  # S3 デプロイスクリプト
└── src/
    ├── main.jsx               # React エントリポイント
    ├── App.jsx                # ルーティング定義（/, /control, /screen）
    ├── config.js              # 設定値（WS_URL, localStorage キー, ルートパス）
    ├── index.css              # Tailwind ディレクティブ + カスタムアニメーション
    ├── hooks/
    │   └── useWebSocket.js    # WebSocket 接続管理（自動再接続・キープアライブ）
    ├── contexts/
    │   └── GameContext.jsx    # ゲーム状態管理（useReducer + エラーコード翻訳）
    ├── components/
    │   └── UI.jsx             # 共通UIコンポーネント（Button, Card 等）
    ├── i18n/
    │   ├── index.js           # t() ヘルパー関数
    │   └── ja.js              # 日本語ロケール（全文言 + サーバーエラーコード翻訳）
    └── pages/
        ├── player/
        │   └── PlayerApp.jsx  # 解答者画面（スマホ向け・ピンク系テーマ）
        ├── admin/
        │   └── AdminApp.jsx   # 管理者画面（PC向け・ダーク系テーマ）
        └── display/
            └── DisplayApp.jsx # プロジェクタ表示画面（16:9・vw レスポンシブ）
```

## セットアップ

```powershell
cd frontend
npm install
cp .env.example .env.local
# .env.local の VITE_WS_URL にバックエンドの WebSocket URL を設定
```

### 開発サーバー

```powershell
npm run dev
# → http://localhost:5173
```

### 本番ビルド & デプロイ

```powershell
npm run build
aws s3 sync dist/ s3://your-bucket-name --delete
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

## 画面一覧

### 解答者画面（`/`）— PlayerApp.jsx

スマホ向けのピンク系かわいいテーマ。Zen Maru Gothic フォント使用。

#### 画面遷移

| ゲーム状態 | 未参加 | 参加済み |
|---|---|---|
| `init` | 準備中⏳ | — |
| `accepting` | 名前入力フォーム | 参加できたよ🌸 |
| `answering`（未回答） | 参加受付終了🚫 | 回答入力画面 |
| `answering`（回答済み、未採点） | — | 送信できたよ✅ |
| `answering`（回答済み、自動採点済み） | — | 正解🎉 or 不正解😢 |
| `judging` | — | 採点中🔍（または自動採点結果） |
| `showing_answer` | — | 正解発表（正解/不正解 + 模範解答） |
| `showing_scores` | — | 最終成績ランキング |

#### ヘッダー

名前・スコア・順位（n位/m人）をセンター配置。接続状態ドットは左上に固定配置で重複なし。

#### 選択問題の即時フィードバック

選択肢をタップした瞬間にサーバーが自動採点し、`judgment_result` が返ってきます。プレイヤーには即座に「正解🎉」or「不正解😢」が表示されます（`MiniResultScreen` コンポーネント）。正解発表を待たずに結果がわかります。

### 管理者画面（`/control`）— AdminApp.jsx

ダークテーマの PC 向けダッシュボード。パスワード認証（sessionStorage で F5 維持）。

#### レイアウト

```
┌─────────────────────────────────────────────────┐
│ [接続中] 🎛️ 管理画面  [参加受付中] 参加者:5名  │
├──────┬────────────────────┬──────────────────────┤
│ 進行  │ 現在の問題         │ 成績一覧             │
│ コント│ Q3: 日本の首都は？ │ 1. たろう  45pt      │
│ ロール│ 模範解答: 東京     │ 2. はなこ  38pt      │
│      │ (とうきょう)       │ 3. じろう  30pt      │
│ 次:Q4│                    ├──────────────────────┤
│ [出題]│ 回答一覧 (5件)     │ クイズ一覧           │
│      │ 1. たろう 東京 ○×  │ Q1: ... ✓           │
│ [締切]│ 2. はなこ 京都 ○×  │ Q2: ... ✓           │
│ [発表]│ ...                │ Q3: ...             │
│      │                    │ Q4: ...             │
│[ﾘｾｯﾄ]│                    │                      │
└──────┴────────────────────┴──────────────────────┘
```

#### 主な機能

- **CSV 読込**: フロントエンドで CSV をパースし、JSON に変換してサーバーに送信
- **進行コントロール**: 固定高さのプレビューエリアと位置が安定したアクションボタン
- **模範解答表示**: 出題中〜正解発表の間、問題文の下に**太字の模範解答** + (許容解答カッコ書き) を表示
- **回答一覧**: 回答時間順ソート。○×ボタンは採点済みで無効化（二重加算防止）
- **成績一覧**: 通算ポイント順（リアルタイム更新）

### プロジェクタ表示画面（`/screen`）— DisplayApp.jsx

16:9 対応のフルスクリーン向け。全サイズを `vw` 単位で指定し、ウィンドウサイズに追従。

#### 主な機能

- **参加受付**: QR コード（quiet zone 確保）+ 大きな URL 文字 + 参加者数
- **出題中**: 問題文 + 選択肢 + 正解者リアルタイムパネル（ポイント + 回答秒数付き）
- **正解発表**: 模範解答（大）+ 許容解答（70% サイズ・カッコ書き）+ 正解者一覧 + 回答秒数
- **成績発表**: バーグラフ付きランキング（最大15位まで表示）

## 状態管理

### GameContext.jsx

`useReducer` でゲーム状態を一元管理。サーバーからの WebSocket メッセージを `useMessageHandler()` フックで受信し、イベント名→リデューサーアクション型のマッピングで dispatch します。

#### 主なステートフィールド

| フィールド | 型 | 説明 |
|---|---|---|
| `status` | string | ゲーム状態（init, accepting, answering, judging, showing_answer, showing_scores） |
| `sessionId` | string\|null | 現在のクイズセッション ID。リセット判定に使用 |
| `playerId` | string\|null | プレイヤー ID（localStorage にも保存） |
| `currentQuiz` | object\|null | 現在の問題データ |
| `myAnswer` | object\|null | 自分の回答 |
| `myJudgment` | object\|null | 自分の採点結果（isCorrect, pointsAwarded） |
| `revealData` | object\|null | 正解発表データ（correctAnswer, correctPlayers 等） |
| `players` | array | プレイヤーリスト（順位計算に使用） |

#### エラーコード翻訳

サーバーはエラーコード（例: `name_taken`）を返し、`GameContext` 内の `translateError()` が `i18n/ja.js` の `error.*` キーを参照して翻訳します。

### セッション管理（sessionId）

```
[クイズA 読込] → sessionId="abc123" → localStorage に保存
  → プレイヤー参加・クイズ進行

[リセット] → sessionId=null → full_reset ブロードキャスト
  → 受信した端末: localStorage クリア、初期画面に復帰
  → ロック中の端末: full_reset を受信できない

[クイズB 読込] → sessionId="xyz789"

[ロック解除] → visibilitychange → get_state
  → state_sync: sessionId="xyz789"
  → localStorage: sessionId="abc123"
  → 不一致検知 → localStorage 完全クリア → dispatch('RESET')
  → 準備中画面 or 名前入力画面に強制復帰
```

### リロード復帰の仕組み

| 画面 | 方式 | 保存先 |
|---|---|---|
| 解答者 | `get_state` → `register` の3フェーズ | localStorage（playerId, playerName, sessionId） |
| 管理者 | `connect_role` の自動再送 | sessionStorage（password） |
| 表示 | `connect_role` の自動再送 | sessionStorage（password） |

#### プレイヤーの3フェーズリカバリ

```
phase='loading'    → WS接続完了 → get_state 送信 → サーバー応答待ち
phase='recovering' → サーバーからステータス受信 → localStorage にIDあり → register 送信
phase='ready'      → registered 受信 → 通常画面表示
```

`state_sync` レスポンスに `myAnswer`, `myJudgment`, `revealData`, `sessionId` が含まれるため、どの状態からリロードしても正しい画面が復元されます。

### スマホロック復帰

すべての画面で `visibilitychange` イベントを監視しています。

- **プレイヤー**: `get_state` を再送信 → 最新の状態に同期
- **管理者**: `connect_role` を再送信 → `full_state` で全データ再取得
- **表示**: `connect_role` を再送信 → `full_state` で全データ再取得

WebSocket 接続が切れている場合は自動再接続（指数バックオフ、最大8秒）が先に走り、接続完了後に上記の処理が実行されます。

## カスタマイズ

### テーマ色の変更

- **管理画面**: `tailwind.config.js` の `theme.extend.colors.quiz-*` セクション
- **解答者・表示画面**: 各コンポーネント内のインラインスタイル（ピンク系グラデーション）

### ルートパスの変更

`config.js` の `ROUTES` と `App.jsx` のルーティング定義を変更してください。

### フォントの変更

`index.html` の Google Fonts 読み込みと、各コンポーネントの `fontFamily` スタイルを変更してください。現在は Zen Maru Gothic（解答者・表示）と Quicksand（英数字）を使用しています。

### 多言語対応

`src/i18n/en.js` 等を作成し、`src/i18n/index.js` のインポートを切り替えてください。キー構造は `ja.js` と同一です。サーバーエラーコードの翻訳（`error.*` セクション）も忘れずに含めてください。

## ライセンス

MIT License
