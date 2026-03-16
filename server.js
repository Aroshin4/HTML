const express = require('express');
const mysql = require('mysql2/promise');  // mysql2を追加
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 3000;

// DB接続プールの作成
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',  // or '127.0.0.1'
  port: process.env.DB_PORT || 3307,
  user: 'jpuser',
  password: 'jppw',
  database: 'jpfood',
  waitForConnections: true,
  connectionLimit: 10,
});

// ===== マイグレーション機能 =====
// マイグレーション履歴テーブルを作成
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
    console.log('✓ migrations_applied テーブルが準備できました');
  } finally {
    connection.release();
  }
}

// マイグレーションを自動実行
async function runMigrations() {
  const migrationsDir = path.join(__dirname, 'db', 'migrations');
  
  if (!fs.existsSync(migrationsDir)) {
    console.log('⚠ db/migrations ディレクトリが見つかりません');
    return;
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  await initMigrationsTable();

  const connection = await pool.getConnection();
  try {
    for (const file of files) {
      const [existing] = await connection.execute(
        'SELECT * FROM migrations_applied WHERE filename = ?',
        [file]
      );

      if (existing.length > 0) {
        // console.log(`⊘ ${file} は既に実行済みです`); // ログが多い場合はコメントアウト
        continue;
      }

      const sqlPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(sqlPath, 'utf8');

      try {
        await connection.query(sql); // 複数ステートメントを含む可能性を考慮しqueryを使用
        await connection.execute(
          'INSERT INTO migrations_applied (filename) VALUES (?)',
          [file]
        );
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
    console.log('マイグレーションを実行中...');
    await runMigrations();
    console.log('✓ マイグレーション完了\n');
  } catch (err) {
    console.error('マイグレーション実行エラー:', err);
    process.exit(1);
  }
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

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

// 1. 全てのレシピを取得するAPI（検索・ソート・ページネーション対応）
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

        // ページネーション
        const offset = (page - 1) * limit;
        query += ` LIMIT ${limit} OFFSET ${offset}`;

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

// 2. 国の一覧を取得するAPI
app.get('/api/countries', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT DISTINCT country FROM recipes WHERE country IS NOT NULL');
        res.json(rows.map(r => r.country));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. 料理名一覧を取得するAPI
app.get('/api/dish-names', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT DISTINCT dishName FROM recipes WHERE dishName IS NOT NULL');
        res.json(rows.map(r => r.dishName));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. レシピを投稿するAPI
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
    console.error('Database error:', err);
    res.status(500).json({ error: err.message, stack: err.stack });
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
        
        // レビューも取得して紐付ける (HTML側に合わせて reviewer_name AS reviewerName に変換)
        const [reviews] = await pool.execute(
            'SELECT reviewer_name AS reviewerName, rating, comment, created_at FROM reviews WHERE recipe_id = ? ORDER BY created_at DESC', 
            [recipeId]
        );
        recipe.reviews = reviews;

        res.json(recipe);
    } catch (err) {
        console.error('Error fetching recipe details:', err);
        res.status(500).json({ error: err.message });
    }
});

// 6. レシピのいいねを増やすAPI
app.post('/api/recipes/:id/like', async (req, res) => {
    try {
        const recipeId = parseInt(req.params.id);
        
        // recipes テーブルの likes カラムを 1 増やす
        await pool.execute('UPDATE recipes SET likes = likes + 1 WHERE id = ?', [recipeId]);
        
        // 増やした後の数を取得してクライアントに返す
        const [rows] = await pool.execute('SELECT likes FROM recipes WHERE id = ?', [recipeId]);
        if (rows.length > 0) {
            res.json({ message: 'Liked!', likes: rows[0].likes });
        } else {
            res.status(404).json({ message: 'Recipe not found' });
        }
    } catch (err) {
        console.error('Error adding like:', err);
        res.status(500).json({ error: err.message });
    }
});

// 7. レビューを追加するAPI
app.post('/api/recipes/:id/review', async (req, res) => {
    try {
        const recipeId = parseInt(req.params.id);
        const { reviewerName, comment, rating } = req.body;
        
        await pool.execute(
            'INSERT INTO reviews (recipe_id, reviewer_name, rating, comment) VALUES (?, ?, ?, ?)',
            [recipeId, reviewerName, rating, comment]
        );
        res.json({ message: 'Review added successfully!' });
    } catch (err) {
        console.error('Error adding review:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- HTMLファイル用のルーティング ---
app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));
app.get('/post', (req, res) => res.sendFile(__dirname + '/post.html'));
app.get('/browse', (req, res) => res.sendFile(__dirname + '/browse.html'));
app.get('/recipe/:id', (req, res) => res.sendFile(__dirname + '/recipe.html'));

// マイグレーション実行後にサーバーを起動
startServer().then(() => {
  app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
});
