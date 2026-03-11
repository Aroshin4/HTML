const express = require('express');
const mysql = require('mysql2/promise'); // データベース接続用
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- DB接続設定 ---
const pool = mysql.createPool({
  host: process.env.DB_HOST || "db",
  user: process.env.DB_USER || "jpuser",
  password: process.env.DB_PASSWORD || "jppw",
  database: process.env.DB_NAME || "jpfood",
  waitForConnections: true,
  connectionLimit: 10,
});

if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// --- multerの設定 ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/') 
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname)
    }
});
const upload = multer({ storage: storage });

app.use('/uploads', express.static('uploads'));
app.use('/images', express.static('images'));

// --- API エンドポイント ---

// 1. レシピを投稿するAPI (データベースに保存)
app.post('/api/recipes', upload.single('photo'), async (req, res) => {
    try {
        const { author, country, dishName, method, ingredients, substitutes } = req.body;
        const photoUrl = req.file ? '/uploads/' + req.file.filename : ''; 
        const recipeAuthor = author || "名無し";

        const sql = `
          INSERT INTO recipe (
            author, country_text, dish_name, photo_url, method_text, ingredients_text, substitutes_text
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        const params = [recipeAuthor, country, dishName, photoUrl, method, ingredients, substitutes];
        
        const [result] = await pool.query(sql, params);
        res.status(201).json({ message: 'Recipe posted successfully!', id: result.insertId });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: "サーバーエラー" });
    }
});

// 2. 全てのレシピを取得するAPI (データベースから取得)
app.get('/api/recipes', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const { country, dishName } = req.query;

        let query = 'SELECT * FROM recipe WHERE 1=1';
        let params = [];

        // 検索フィルター
        if (country) {
            query += ' AND country_text = ?';
            params.push(country);
        }
        if (dishName) {
            query += ' AND dish_name LIKE ?';
            params.push(`%${dishName}%`);
        }

        // 全件数を取得
        const [countResult] = await pool.query(query.replace('SELECT *', 'SELECT COUNT(*) as total'), params);
        const totalRecipes = countResult[0].total;

        // ページネーションの設定
        const offset = (page - 1) * limit;
        query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const [rows] = await pool.query(query, params);

        // 画面側が扱いやすい形式に変換
        const formattedRecipes = rows.map(r => ({
            id: r.id,
            author: r.author,
            country: r.country_text,
            dishName: r.dish_name,
            photoUrl: r.photo_url,
            likes: 0 // ※いいね機能のDB保存は未実装のため0
        }));

        res.json({
            recipes: formattedRecipes,
            currentPage: page,
            totalPages: Math.ceil(totalRecipes / limit),
            totalRecipes: totalRecipes
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: "DB Error" });
    }
});

// 3. 国の一覧を取得するAPI
app.get('/api/countries', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT DISTINCT country_text FROM recipe WHERE country_text IS NOT NULL');
        res.json(rows.map(r => r.country_text));
    } catch (e) {
        res.status(500).json([]);
    }
});

// 4. 料理名の一覧を取得するAPI
app.get('/api/dish-names', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT DISTINCT dish_name FROM recipe WHERE dish_name IS NOT NULL');
        res.json(rows.map(r => r.dish_name));
    } catch (e) {
        res.status(500).json([]);
    }
});

// 5. 特定のレシピを取得するAPI
app.get('/api/recipes/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM recipe WHERE id = ?', [req.params.id]);
        if (rows.length > 0) {
            const r = rows[0];
            res.json({
                id: r.id,
                author: r.author,
                country: r.country_text,
                dishName: r.dish_name,
                photoUrl: r.photo_url,
                method: r.method_text,
                ingredients: r.ingredients_text,
                substitutes: r.substitutes_text,
                likes: 0,
                reviews: []
            });
        } else {
            res.status(404).json({ message: 'Recipe not found' });
        }
    } catch (e) {
        res.status(500).json({ message: "DB Error" });
    }
});

// (ダミー) いいねとレビューのAPI（エラー回避用）
app.post('/api/recipes/:id/like', (req, res) => res.json({ message: 'Liked!', likes: 1 }));
app.post('/api/recipes/:id/review', (req, res) => res.json({ message: 'Review added!', reviews: [] }));

// --- HTMLファイル用のルーティング ---
app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));
app.get('/post', (req, res) => res.sendFile(__dirname + '/post.html'));
app.get('/browse', (req, res) => res.sendFile(__dirname + '/browse.html'));
app.get('/recipe/:id', (req, res) => res.sendFile(__dirname + '/recipe.html'));

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});