# Kira-Kira OshareQuiz — Frontend 🎯

React + Vite + Tailwind CSS によるクイズ大会フロントエンドです。3つの画面（解答者・管理者・プロジェクタ表示）を単一の SPA で提供します。

## 構成

```
frontend/
├── index.html                 # エントリ HTML（Webフォント読み込み）
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── .env.example               # 環境変数テンプレート
├── deploy.sh                  # S3 デプロイスクリプト
└── src/
    ├── main.jsx               # React エントリポイント
    ├── App.jsx                # ルーティング (/, /control, /screen)
    ├── config.js              # 設定値 (WS_URL, localStorage キー, ルートパス)
    ├── index.css              # Tailwind + カスタムアニメーション
    ├── hooks/
    │   └── useWebSocket.js    # WebSocket 管理 (自動再接続・キープアライブ30秒)
    ├── contexts/
    │   └── GameContext.jsx    # ゲーム状態管理 (useReducer + エラーi18n翻訳)
    ├── components/
    │   └── UI.jsx             # 共通UI (Button, Card, formatElapsedMs)
    ├── i18n/
    │   ├── index.js           # t() ヘルパー関数
    │   └── ja.js              # 日本語ロケール (全文言 + エラーコード翻訳)
    └── pages/
        ├── player/
        │   └── PlayerApp.jsx  # 解答者画面 (スマホ・ピンク系)
        ├── admin/
        │   └── AdminApp.jsx   # 管理者画面 (PC・ダーク系)
        └── display/
            └── DisplayApp.jsx # プロジェクタ表示 (16:9・vwレスポンシブ)
```

## セットアップ

```powershell
cd frontend
npm install
cp .env.example .env.local
# .env.local の VITE_WS_URL にバックエンドの WebSocket URL を設定
npm run dev    # 開発サーバー → http://localhost:5173
npm run build  # 本番ビルド → dist/
```

## 画面一覧

### 解答者画面（`/`）— PlayerApp.jsx

スマホ向けピンク系テーマ。Zen Maru Gothic フォント。

#### 画面遷移

| ゲーム状態 | 未参加 | 参加済み |
|---|---|---|
| `init` | 準備中⏳ | — |
| `accepting` | 名前入力 | 参加できたよ🌸 |
| `answering`（未回答） | 受付終了🚫 | 回答入力 |
| `answering`（自動採点済） | — | 🎉正解！+10pt / 😢不正解 + ストリーク表示 |
| `judging`（採点待ち） | — | 採点中🔍 |
| `showing_answer` | — | 正解発表（模範解答+許容解答+ストリーク） |
| `showing_scores` | — | 最終成績ランキング |

#### 主な機能

- **即時フィードバック**: 選択肢タップ → 即座に正解/不正解 + ポイント表示
- **連続正解ストリーク**: 2問以上連続正解で「🔥N問連続正解！」がアニメーション表示
- **ヘッダー**: 名前・スコア・順位をセンター配置。接続ドットは左上固定
- **リロード耐性**: 3フェーズリカバリ（loading → recovering → ready）
- **セッション検証**: ロック解除時に sessionId 不一致を検知し自動ログアウト

### 管理者画面（`/control`）— AdminApp.jsx

PC 向けダークテーマ。パスワード認証（sessionStorage で F5 維持）。

#### レイアウト

```
┌────────────────────────────────────────────────────────┐
│ 🎛️ 管理画面 📋タイトル [受付中] 参加者:5名 3/7問 [接続中]│
├──────┬────────────────────┬────────────────────────────┤
│ 進行  │ 現在の問題         │ 成績一覧                   │
│ コント│ Q3: 日本の首都は？ │ リアルタイム順位 (通算pt)    │
│ ロール│ 模範: 東京 (とうきょう)│                         │
│      │                    ├────────────────────────────┤
│ 次:Q4│ 回答一覧 (5件)     │ クイズ一覧                  │
│ [出題]│ 1. たろう 東京 ○×  │ Q1 ✓ / Q2 ✓ / Q3 ...     │
│      │ (順次採点: 1個ずつ) │                            │
│[ﾘｾｯﾄ]│                    │                            │
└──────┴────────────────────┴────────────────────────────┘
```

#### CSV パーサー

`#title,クイズ名` 形式のメタデータ行を自動検出し、`load_quizzes` アクションに `quizTitle` を付与。`#` で始まる行はすべてコメントとしてスキップ。既存CSVとの後方互換性あり。

#### 順次採点

テキスト問題の○×ボタンは `firstUnjudgedIdx` で上から1つずつしか有効化されません。選択問題は submitAnswer で全回答が自動採点済みのため全行が採点済み表示になります。

### プロジェクタ表示画面（`/screen`）— DisplayApp.jsx

16:9 フルスクリーン向け。全サイズを `vw` 単位で指定。

#### タイトルバー

クイズ読込後〜リセットまで、画面上部に `✨ クイズタイトル ✨` を常時表示。`state.quizTitle` が null（init 状態）では非表示。

#### 画面遷移

- **参加受付**: QR コード（縦積みセンタリング）+ URL + 参加者数。タイトルは `✨💖 タイトル 💖✨` の横並び
- **出題中**: 問題文 + 選択肢 + 正解者リアルタイムパネル（ポイント + 回答秒数）
- **採点中**: 採点中アイコン + 正解者リスト（回答秒数付き）
- **正解発表**: 模範解答（大）+ 許容解答（70%サイズ）+ 正解率（%表示）+ 正解者ランキング
- **成績発表**: バーグラフ付き最終ランキング

## 状態管理

### GameContext.jsx

`useReducer` でゲーム状態を一元管理。主なフィールド:

| フィールド | 型 | 説明 |
|---|---|---|
| `status` | string | ゲーム状態 |
| `sessionId` | string\|null | クイズセッション ID |
| `quizTitle` | string\|null | CSV の `#title` から取得したクイズ名 |
| `streak` | number | 連続正解数（`judgment_result` の `streak` から更新） |
| `syncCounter` | number | `STATE_SYNC` ごとにインクリメント（deferred reconnect 用） |
| `myJudgment` | object\|null | 自分の採点結果 |
| `revealData` | object\|null | 正解発表データ（correctRate 含む） |

### セッション管理（sessionId）

```
[クイズA] CSV読込 → sessionId="abc123" → localStorage 保存
[リセット] → sessionId=null → full_reset
[クイズB] CSV読込 → sessionId="xyz789"
[ロック解除] → get_state → sessionId="xyz789" ≠ localStorage "abc123"
  → localStorage クリア → RESET → get_state 再送 → 名前入力画面
```

### リロード復帰

| 画面 | 方式 | 保存先 |
|---|---|---|
| 解答者 | `get_state` → `register` 3フェーズ | localStorage (playerId, playerName, sessionId) |
| 管理者 | `connect_role` 自動再送 | sessionStorage (password) |
| 表示 | `connect_role` 自動再送 | sessionStorage (password) |

### Deferred Reconnect

WebSocket 再接続時に即座に `register` を送らず、`get_state` の応答（`syncCounter` インクリメント）を待ってから sessionId を検証し、有効な場合のみ `register` を送信。localStorage を source of truth として使用することで、同一レンダーサイクル内の React state 遅延を回避。

### スマホロック復帰

3画面すべてで `visibilitychange` イベントを監視:
- プレイヤー: `get_state` 再送 → 最新状態に同期
- 管理者/表示: `connect_role` 再送 → `full_state` で全データ再取得

## カスタマイズ

- **テーマ色**: 管理画面は `tailwind.config.js`、解答者/表示はインラインスタイル
- **ルートパス**: `config.js` の `ROUTES` + `App.jsx` を変更
- **フォント**: `index.html` の Google Fonts + コンポーネントの `fontFamily`
- **多言語**: `src/i18n/en.js` 等を追加し `index.js` のインポートを切替

## ライセンス

MIT License
