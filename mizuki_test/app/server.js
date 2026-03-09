// app/server.js
const express = require("express");
const mysql = require("mysql2/promise");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// 受信設定
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ★ 静的配信：app/public を http://localhost:3000 直下で配信
app.use(express.static(path.join(__dirname, "public")));

// DB接続（Dockerのdbサービスへ）
const pool = mysql.createPool({
  host: process.env.DB_HOST || "db",
  user: process.env.DB_USER || "jpuser",
  password: process.env.DB_PASSWORD || "jppw",
  database: process.env.DB_NAME || "jpfood",
  waitForConnections: true,
  connectionLimit: 10,
});

// ヘルスチェック
app.get("/health", async (_req, res) => {
  try {
    const conn = await pool.getConnection();
    await conn.query("SELECT 1");
    conn.release();
    res.send("OK");
  } catch (e) {
    console.error(e);
    res.status(500).send("NG");
  }
});

// ▼ 投稿API：post.html の fetch('/api/recipes') から呼ばれる
app.post("/api/recipes", async (req, res) => {
  try {
    const { country, dishName, photoUrl, method, ingredients, substitutes } = req.body;

    if (!country || !dishName || !method || !ingredients || !substitutes) {
      return res.status(400).json({ message: "必須項目が不足しています" });
    }

    const sql = `
      INSERT INTO recipe (
        country_text, dish_name, photo_url, method_text, ingredients_text, substitutes_text
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;
    const params = [country, dishName, photoUrl || null, method, ingredients, substitutes];

    const [result] = await pool.query(sql, params);
    res.status(201).json({ message: "OK", id: result.insertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "サーバーエラー" });
  }
});

// （任意）一覧ページをサーバ側で簡易生成
app.get("/browse", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, country_text, dish_name, photo_url FROM recipe ORDER BY id DESC LIMIT 50"
    );
    const items = rows
      .map(
        (r) => `<li><strong>${escapeHtml(r.dish_name)}</strong> (${escapeHtml(r.country_text)})</li>`
      )
      .join("");
    res.send(`<!doctype html><meta charset="utf-8"><title>Recipes</title>
<style>body{font-family:sans-serif;padding:20px;max-width:800px;margin:auto}</style>
/post.html＋ 新規投稿</a>
<h2>投稿済みレシピ</h2>
<ul>${items || "<li>まだありません</li>"}</ul>`);
  } catch (e) {
    console.error(e);
    res.status(500).send("サーバーエラー");
  }
});

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (s) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[s]));
}

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});