const express = require('express');
const mysql = require('mysql2/promise');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 3000;

// DB接続プールの作成
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3307,
  user: 'jpuser',
  password: 'jppw',
  database: 'jpfood',
  waitForConnections: true,
  connectionLimit: 10,
});

// ===== マイグレーション機能 =====
async function initMigrationsTable() {
  const connection = await pool.getConnection();
  try {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS migrations_applied (
        id INT AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // レビュー機能用のテーブルも念のためここで作成・確認しておきます
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS reviews (
        id INT AUTO_INCREMENT PRIMARY KEY,
        recipe_id INT NOT NULL,
        reviewerName VARCHAR(255),
        rating INT,
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ データベースのテーブル準備が完了しました');
  } finally {
    connection.release();
  }
}

async function runMigrations() {
  const migrationsDir = path.join(__dirname, 'db', 'migrations');
  if (!fs.existsSync(migrationsDir)) return;

  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  await initMigrationsTable();

  const connection = await pool.getConnection();
  try {
    for (const file of files) {
      const [existing] = await connection.execute('SELECT * FROM migrations_applied WHERE filename = ?', [file]);
      if (existing.length > 0) continue;

      const sqlPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(sqlPath, 'utf8');

      try {
        await connection.query(sql); // 複数ステートメントを含む可能性を考慮しqueryを使用
        await connection.execute('INSERT INTO migrations_applied (filename) VALUES (?)', [file]);
        console.log(`✓ ${file} を実行しました`);
      } catch (err) {
        console.error(`✗ ${file} の実行に失敗しました:`, err.message);
      }
    }
  } finally {
    connection.release();
  }
}

async function startServer() {
  try {
    await runMigrations();
  } catch (err) {
    console.error('マイグレーション実行エラー:', err);
  }
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, 'uploads/') },
    filename: function (req, file, cb) { cb(null, Date.now() + '-' + file.originalname) }
});
const upload = multer({ storage: storage });

app.use('/uploads', express.static('uploads'));
app.use('/images', express.static('images'));

// --- API エンドポイント ---

// 1. レシピ一覧の取得（検索・ソート・ページネーション対応）
app.get('/api/recipes', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const { country, dishName, sort } = req.query;

        let query = 'SELECT * FROM recipes WHERE 1=1';
        let countQuery = 'SELECT COUNT(*) as total FROM recipes WHERE 1=1';
        const queryParams = [];
        const countParams = [];

        // 検索フィルター
        if (country) {
            query += ' AND country = ?';
            countQuery += ' AND country = ?';
            queryParams.push(country);
            countParams.push(country);
        }
        if (dishName) {
            query += ' AND dishName LIKE ?';
            countQuery += ' AND dishName LIKE ?';
            queryParams.push(`%${dishName}%`);
            countParams.push(`%${dishName}%`);
        }

        // ソート順
        if (sort === "likes") {
            query += ' ORDER BY likes DESC, created_at DESC';
        } else if (sort === "oldest") {
            query += ' ORDER BY created_at ASC';
        } else {
            query += ' ORDER BY created_at DESC'; // default: newest
        }

        // ページネーション (LIMIT OFFSET)
        const offset = (page - 1) * limit;
        query += ` LIMIT ${limit} OFFSET ${offset}`; // プレースホルダーを使わず直接埋め込み(数値なので安全)

        const [rows] = await pool.query(query, queryParams);
        const [countResult] = await pool.query(countQuery, countParams);
        const totalRecipes = countResult[0].total;

        res.json({
            recipes: rows,
            currentPage: page,
            totalPages: Math.ceil(totalRecipes / limit),
            totalRecipes: totalRecipes
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. 国の一覧を取得する
app.get('/api/countries', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT DISTINCT country FROM recipes WHERE country IS NOT NULL');
        res.json(rows.map(r => r.country));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. 料理名一覧を取得する
app.get('/api/dish-names', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT DISTINCT dishName FROM recipes WHERE dishName IS NOT NULL');
        res.json(rows.map(r => r.dishName));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. 新規レシピの投稿
app.post('/api/recipes', upload.single('photo'), async (req, res) => {
  const { author, country, dishName, method, ingredients, substitutes } = req.body;
  const photo = req.file ? req.file.filename : null;
  
  try {
    await pool.execute(
      'INSERT INTO recipes (author, country, dishName, photo, method, ingredients, substitutes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [author, country, dishName, photo, method, ingredients, substitutes]
    );
    res.status(201).json({ message: 'Recipe posted successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. 単一レシピの詳細取得（レビューも含めて取得）
app.get('/api/recipes/:id', async (req, res) => {
    try {
        const recipeId = parseInt(req.params.id);
        const [recipes] = await pool.execute('SELECT * FROM recipes WHERE id = ?', [recipeId]);
        
        if (recipes.length === 0) {
            return res.status(404).json({ message: 'Recipe not found' });
        }
        
        const recipe = recipes[0];
        
        // レビューも取得して紐付ける
        const [reviews] = await pool.execute('SELECT * FROM reviews WHERE recipe_id = ? ORDER BY created_at DESC', [recipeId]);
        recipe.reviews = reviews;

        res.json(recipe);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. レシピのいいねを増やす
app.post('/api/recipes/:id/like', async (req, res) => {
    try {
        const recipeId = parseInt(req.params.id);
        await pool.execute('UPDATE recipes SET likes = likes + 1 WHERE id = ?', [recipeId]);
        
        const [rows] = await pool.execute('SELECT likes FROM recipes WHERE id = ?', [recipeId]);
        if (rows.length > 0) {
            res.json({ message: 'Liked!', likes: rows[0].likes });
        } else {
            res.status(404).json({ message: 'Recipe not found' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7. レビューを追加する
app.post('/api/recipes/:id/review', async (req, res) => {
    try {
        const recipeId = parseInt(req.params.id);
        const { reviewerName, comment, rating } = req.body;
        
        await pool.execute(
            'INSERT INTO reviews (recipe_id, reviewerName, rating, comment) VALUES (?, ?, ?, ?)',
            [recipeId, reviewerName, rating, comment]
        );
        res.json({ message: 'Review added successfully!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- HTMLファイル用のルーティング ---
app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));
app.get('/post', (req, res) => res.sendFile(__dirname + '/post.html'));
app.get('/browse', (req, res) => res.sendFile(__dirname + '/browse.html'));
app.get('/recipe/:id', (req, res) => res.sendFile(__dirname + '/recipe.html'));

// サーバー起動
startServer().then(() => {
  app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
});