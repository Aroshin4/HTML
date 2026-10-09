# Wa-lterna（レシピ投稿サイト）

各国の料理レシピを投稿・閲覧・評価できる Web アプリです。

- フロントエンド: HTML（`index.html` / `browse.html` / `post.html` / `recipe.html`）
- バックエンド: Node.js + Express（`server.js`）
- データベース: MySQL 8.0（Docker で起動）

## 必要なもの

- [Node.js](https://nodejs.org/)（LTS 版を推奨）
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

## 初回セットアップ（最初の1回だけ）

プロジェクトのフォルダ（`server.js` があるフォルダ）で依存パッケージをインストールします。

```sh
npm install
```

## 起動方法（毎回）

### 1. Docker Desktop を起動する

### 2. データベースを起動する

```sh
cd docker
docker compose up -d
cd ..
```

初回はイメージのダウンロードと DB の初期化に少し時間がかかります。
`docker compose ps` で `jpfood_db` が `healthy` になれば準備完了です。

### 3. サーバーを起動する

```sh
node server.js
```

`Server is running on http://localhost:3000` と表示されれば起動成功です。
起動時に `db/migrations` 内の SQL が自動で実行されます（実行済みのものはスキップ）。

### 4. ブラウザで開く

| ページ | URL |
| --- | --- |
| トップ | http://localhost:3000 |
| レシピ一覧 | http://localhost:3000/browse |
| レシピ投稿 | http://localhost:3000/post |
| レシピ詳細 | http://localhost:3000/recipe/:id |
| DB 管理画面（Adminer） | http://localhost:8080 |

Adminer のログイン情報: サーバー `db` / ユーザー `jpuser` / パスワード `jppw` / データベース `jpfood`

## 停止方法

- サーバー: ターミナルで `Ctrl + C`
- データベース:

  ```sh
  cd docker
  docker compose down
  ```

  データは Docker ボリューム（`db_data`）に残ります。データも消して初期化したい場合は `docker compose down -v` を実行します。

## 構成

```
.
├── server.js            # Express サーバー（API・ページ配信）
├── index.html           # トップページ
├── browse.html          # レシピ一覧・検索
├── post.html            # レシピ投稿
├── recipe.html          # レシピ詳細・いいね・レビュー
├── images/              # サイトで使う画像
├── uploads/             # 投稿された写真の保存先
├── db/migrations/       # テーブル作成用 SQL
└── docker/
    └── docker-compose.yml  # MySQL と Adminer の定義
```

## 接続設定

| 項目 | 値 |
| --- | --- |
| Web サーバーのポート | 3000 |
| MySQL のポート（ホスト側） | 3307 |
| DB 名 / ユーザー / パスワード | `jpfood` / `jpuser` / `jppw` |

DB の接続先は環境変数 `DB_HOST`（既定 `localhost`）と `DB_PORT`（既定 `3307`）で変更できます。

## うまく動かないとき

- **`ECONNREFUSED` などで DB に接続できない**
  Docker Desktop と DB コンテナが起動しているか確認してください（`docker compose ps`）。起動直後は DB の準備ができるまで数十秒待ってから `node server.js` を実行します。
- **`Cannot find module 'express'`**
  `npm install` を実行していません。プロジェクトのフォルダで実行してください。
- **ポート 3000 / 3307 / 8080 が使用中**
  他のアプリを止めるか、`server.js` や `docker-compose.yml` のポート番号を変更してください。
- **起動時に `V3_init._recipe.sql の実行に失敗しました` と表示される**
  Docker の初回起動時にテーブルがすでに作成されているためで、動作には影響ありません。
