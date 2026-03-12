# Kira-Kira OshareQuiz - Frontend

クイズ大会運営アプリのフロントエンドです。React + Vite + Tailwind CSS で構築されています。

## 画面構成

| パス | 用途 | 想定デバイス |
|---|---|---|
| `/` | 画面選択トップ | 共通 |
| `/player` | 解答者画面 | スマホ |
| `/admin` | 管理者画面 | PC |
| `/display` | プロジェクタ表示 | PC (全画面) |

## セットアップ

### 1. 依存関係のインストール

```powershell
npm install
```

### 2. 環境変数の設定

```powershell
cp .env.example .env.local
```

`.env.local` を編集し、バックエンドの WebSocket URL を設定:

```
VITE_WS_URL=wss://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/prod
```

### 3. 開発サーバーの起動

```powershell
npm run dev
```

ブラウザで http://localhost:5173 が開きます。

## ビルド & デプロイ

### ビルド

```powershell
npm run build
```

`dist/` フォルダに静的ファイルが生成されます。

### S3 + CloudFront へデプロイ

```powershell
# S3 バケットにアップロード
aws s3 sync dist/ s3://your-quiz-app-bucket --delete

# CloudFront キャッシュ無効化
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

### CloudFront の設定ポイント

SPA のため、以下のエラーページ設定が必要です:

- **403/404 エラー** → `/index.html` を返す（レスポンスコード 200）

これにより `/player`, `/admin`, `/display` への直接アクセスが動作します。

## プロジェクト構成

```
src/
├── main.jsx              # エントリポイント
├── App.jsx               # ルーティング定義
├── config.js             # 設定値
├── index.css             # Tailwind + カスタムCSS
├── hooks/
│   └── useWebSocket.js   # WebSocket接続管理（自動再接続付き）
├── contexts/
│   └── GameContext.jsx    # ゲーム状態管理（useReducer）
├── components/
│   └── UI.jsx            # 共通UIコンポーネント
└── pages/
    ├── player/
    │   └── PlayerApp.jsx  # 解答者画面（ログイン〜回答〜結果）
    ├── admin/
    │   └── AdminApp.jsx   # 管理者画面（進行制御・判定・成績）
    └── display/
        └── DisplayApp.jsx # 表示用画面（待機・出題・正解・成績）
```

## 技術スタック

- React 18
- React Router v6
- Vite 5
- Tailwind CSS 3
- WebSocket (ネイティブAPI)
