# Kira-Kira OshareQuiz 🎯

イベント向けリアルタイムクイズ大会運営 Web アプリです。  
WebSocket による即時同期で、解答者（スマホ）・管理者（PC）・プロジェクタ表示の3画面を連携させ、クイズ大会をスムーズに運営できます。

## デモイメージ

| 解答者 (スマホ) | 管理者 (PC) | プロジェクタ表示 |
|:---:|:---:|:---:|
| 名前入力→回答→結果 | 進行制御・判定・成績 | 問題・正解・ランキング |

## 特徴

- **リアルタイム**: WebSocket で全画面が即座に同期
- **3画面連携**: 解答者 / 管理者 / 表示用が独立して動作
- **低コスト**: AWS サーバーレスで数時間のイベントなら **100円未満**
- **簡単セットアップ**: SAM CLI 一発でインフラ構築、Vite で即座にフロント開発

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
│   ├── src/                   #   Lambda ソースコード
│   │   ├── index.mjs          #     ルーター
│   │   ├── handlers/          #     各アクションのハンドラー (13個)
│   │   └── lib/               #     DB操作・WebSocket配信ユーティリティ
│   ├── sample-data/           #   サンプルクイズデータ
│   ├── scripts/               #   CLIツール
│   └── tests/                 #   テストイベント
│
├── frontend/                  # React フロントエンド
│   ├── src/
│   │   ├── App.jsx            #   ルーティング定義
│   │   ├── hooks/             #   WebSocket接続管理
│   │   ├── contexts/          #   ゲーム状態管理
│   │   ├── components/        #   共通UIコンポーネント
│   │   └── pages/             #   3画面 (player / admin / display)
│   ├── .env.example           #   環境変数テンプレート
│   └── deploy.sh              #   S3デプロイスクリプト
│
├── LICENSE                    # MIT License
└── README.md                  # このファイル
```

## 前提条件

- [AWS CLI v2](https://aws.amazon.com/cli/) — インストール & `aws configure` 済み
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- [Node.js 20+](https://nodejs.org/)
- Git

## クイックスタート

### 1. クローン

```powershell
git clone https://github.com/shotacure/KiraKiraOshareQuiz.git
cd KiraKiraOshareQuiz
```

### 2. バックエンドのデプロイ

```powershell
cd backend

# 依存関係インストール
cd src && npm install && cd ..

# デプロイ設定を作成
cp samconfig.toml.example samconfig.toml
# samconfig.toml を開いて AdminSecret を変更

# ビルド & デプロイ
sam build
sam deploy
```

デプロイ完了後に **WebSocket URL** が表示されます:

```
WebSocketApiUrl = wss://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/prod
```

### 3. クイズデータの投入

```powershell
# ルートに戻る
cd ..

# ローダースクリプトの依存関係
cd backend && npm install --prefix .. ws && cd ..

# サンプルデータを投入
node backend/scripts/load-quizzes.mjs \
  wss://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/prod \
  あなたのAdminSecret \
  backend/sample-data/quizzes.json
```

### 4. フロントエンドの起動

```powershell
cd frontend

# 依存関係インストール
npm install

# 環境変数を設定
cp .env.example .env.local
# .env.local を開いて VITE_WS_URL にバックエンドの WebSocket URL を設定

# 開発サーバー起動
npm run dev
```

ブラウザで http://localhost:5173 が開きます。

### 5. フロントエンドのデプロイ (S3 + CloudFront)

```powershell
cd frontend

# ビルド
npm run build

# S3にアップロード
aws s3 sync dist/ s3://your-bucket-name --delete

# CloudFront キャッシュ無効化
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

> **CloudFront の設定**: SPA のため、カスタムエラーレスポンスで 403/404 → `/index.html` (200) を返すように設定してください。

## 使い方

### イベント前日

1. バックエンドをデプロイ
2. クイズデータ (JSON) を作成して投入
3. フロントエンドをビルド & S3にデプロイ
4. 動作確認（管理者画面から一通り操作テスト）

### イベント当日

1. プロジェクタ PC で `/display` を開いてフルスクリーン
2. 運営 PC で `/admin` を開いてログイン
3. 参加者に URL を案内し、スマホで `/player` にアクセスしてもらう

### クイズ進行の流れ

```
[管理者] 問題を選択 → [出題] ボタン
         ↓
全画面が出題モードに遷移、解答者が回答を入力
         ↓
[管理者] [回答締切] ボタン（任意、正解発表で自動締切も可）
         ↓
[管理者] 回答一覧で ○× を判定 or [自動判定] ボタン
         ↓
[管理者] [正解発表] ボタン → プロジェクタに正解と正解者一覧が表示
         ↓
[管理者] [成績発表] ボタン → プロジェクタにランキング表示
         ↓
[管理者] 次の問題を選択して [出題] → 繰り返し
```

## クイズデータの形式

`backend/sample-data/quizzes.json` を参照してください。テキスト回答問題と選択肢問題の両方に対応しています。

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
    }
  ]
}
```

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
# バックエンド削除
cd backend
sam delete --stack-name quiz-app

# S3バケット内のファイルを削除（必要に応じて）
aws s3 rm s3://your-bucket-name --recursive
```

## セキュリティに関する注意

- `backend/samconfig.toml` は AdminSecret を含むため **`.gitignore` に入っています**。リポジトリにはテンプレート (`samconfig.toml.example`) のみコミットされます。
- `frontend/.env.local` も同様に `.gitignore` 対象です。テンプレートは `.env.example` です。
- **これらのファイルを絶対に Git にコミットしないでください。**

## 詳細ドキュメント

- バックエンド API リファレンス → [`backend/README.md`](./backend/README.md)
- フロントエンド開発ガイド → [`frontend/README.md`](./frontend/README.md)

## ライセンス

MIT License — 詳細は [LICENSE](./LICENSE) を参照してください。
