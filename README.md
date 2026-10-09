起動方法

最初の1回だけ
1. Node.js と Docker Desktop をインストールする
2. HTML-main フォルダで npm install を実行する

毎回
1. Docker Desktop を起動する
2. DB を起動する
cd docker
docker compose up -d
cd ..
3. サーバーを起動する
node server.js
4. ブラウザで http://localhost:3000 を開く

止めるときは Ctrl + C を押します。
