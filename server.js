const express = require('express');
const mysql = require('mysql2/promise');  // mysql2を追加
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 3000;

// DB接続プールの作成
const pool = mysql.createPool({
  //host: 'db',  // Dockerコンテナ名
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
  
  // migrationsディレクトリが存在するか確認
  if (!fs.existsSync(migrationsDir)) {
    console.log('⚠ db/migrations ディレクトリが見つかりません');
    return;
  }

  // ファイルを読み込んでソート（V1, V2, V3... 順）
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  // マイグレーション履歴テーブルを準備
  await initMigrationsTable();

  const connection = await pool.getConnection();
  try {
    for (const file of files) {
      // 既に実行済みかチェック
      const [existing] = await connection.execute(
        'SELECT * FROM migrations_applied WHERE filename = ?',
        [file]
      );

      if (existing.length > 0) {
        console.log(`⊘ ${file} は既に実行済みです`);
        continue;
      }

      // SQLファイルを読み込む
      const sqlPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(sqlPath, 'utf8');

      try {
        // マイグレーションを実行
        await connection.execute(sql);
        
        // 実行履歴を記録
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

// サーバー起動時にマイグレーションを実行
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
// multerの設定
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/') // uploadsフォルダに保存
    },
    filename: function (req, file, cb) {
        // 名前が被らないように
        cb(null, Date.now() + '-' + file.originalname)
    }
});
const upload = multer({ storage: storage });

// ブラウザから「/uploads/画像名」で直接アクセスできるようにする設定
app.use('/uploads', express.static('uploads'));
app.use('/images', express.static('images'));

let recipes = [];
// --- API エンドポイント ---

// 全てのレシピを取得するAPI)
app.get('/api/recipes', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM recipes ORDER BY created_at DESC'
    );
    res.json({
      recipes: rows,
      currentPage: 1,
      totalPages: 1,
      totalRecipes: rows.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//app.get('/api/recipes', (req, res) => {
    // ページ番号と1ページあたりの件数（デフォルトは1ページ目、5件）を受け取る
    //const page = parseInt(req.query.page) || 1;
    //const limit = parseInt(req.query.limit) || 5;

    //const { country, dishName, sort } = req.query; //←sortの追加
    
    //let results = recipes;

    // 検索フィルター
    //if (country) {
        //results = results.filter(r => r.country.toLowerCase() === country.toLowerCase());
    //}
    //if (dishName) {
        //results = results.filter(r => r.dishName.toLowerCase().includes(dishName.toLowerCase()));
    //}

    // --- ここからソートを追加 ---
    //if (sort === "likes") {
        //results = [...results].sort((a, b) => b.likes - a.likes);
    //} else if (sort === "oldest") {
        //results = [...results].sort((a, b) => a.id - b.id);
    //} else if (sort === "newest") {
        //results = [...results].sort((a, b) => b.id - a.id);
    //}
    // --- ここまで追加 ---

    // ページネーション用の計算
    //const startIndex = (page - 1) * limit; // 切り取る開始位置
    //const endIndex = page * limit;         // 切り取る終了位置
    //const paginatedResults = results.slice(startIndex, endIndex);

    //res.json({
        //recipes: paginatedResults,
        //currentPage: page,
        //totalPages: Math.ceil(results.length / limit),
        //totalRecipes: results.length
    //});
//});

// 国の一覧を取得するAPI
app.get('/api/countries', (req, res) => {
    const countries = [...new Set(recipes.map(r => r.country))];
    res.json(countries);
});

app.get('/api/dish-names', (req, res) => {
    const dishNames = [...new Set(recipes.map(r => r.dishName))];
    res.json(dishNames);
});

//app.post('/api/recipes', upload.single('photo'), (req, res) => {
    //const { author, country, dishName, method, ingredients, substitutes } = req.body;
    
    // 画像がアップロードされていればそのパスを保存、なければ空文字
    //const photoUrl = req.file ? '/uploads/' + req.file.filename : ''; 
    
    //const newRecipe = {
        //id: Date.now(),
        //author,
        //country,
        //dishName,
        //photoUrl, // 画像のパスを保存
        //method,
        //ingredients,
        //substitutes,
        //likes: 0,
        //reviews: []
    //};
    
    //recipes.push(newRecipe);
    //res.status(201).json({ message: 'Recipe posted successfully!', recipe: newRecipe });
//});
// レシピのlikesを増やすAPI
app.post('/api/recipes/:id/like', (req, res) => {
    const recipeId = parseInt(req.params.id);
    const recipe = recipes.find(r => r.id === recipeId);
    
    if (recipe) {
        recipe.likes += 1;
        res.json({ message: 'Liked!', likes: recipe.likes });
    } else {
        res.status(404).json({ message: 'Recipe not found' });
    }
});

app.post('/api/recipes', upload.single('photo'), async (req, res) => {
  const { author, country, dishName, method, ingredients, substitutes } =
    req.body;
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

// レビューを追加するAPI
app.post('/api/recipes/:id/review', (req, res) => {
    const recipeId = parseInt(req.params.id);
    const { reviewerName, comment, rating } = req.body;
    const recipe = recipes.find(r => r.id === recipeId);
    
    if (recipe) {
        const newReview = { reviewerName, comment, rating, date: new Date() };
        recipe.reviews.push(newReview);
        res.json({ message: 'Review added!', reviews: recipe.reviews });
    } else {
        res.status(404).json({ message: 'Recipe not found' });
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

// 特定のレシピを取得するAPI
app.get('/api/recipes/:id', (req, res) => {
    const recipeId = parseInt(req.params.id);
    const recipe = recipes.find(r => r.id === recipeId);

    if (recipe) {
        res.json(recipe);
    } else {
        res.status(404).json({ message: 'Recipe not found' });
    }
});