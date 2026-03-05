const express = require('express');
const multer = require('multer');
const fs = require('fs');
const app = express();
const port = 3000;

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
// --- API Endpoints ---

// Get all recipes (with optional search filters)
app.get('/api/recipes', (req, res) => {
    const { country, dishName } = req.query;
    let results = recipes;

    if (country) {
        results = results.filter(r => r.country.toLowerCase() === country.toLowerCase());
    }
    if (dishName) {
        results = results.filter(r => r.dishName.toLowerCase().includes(dishName.toLowerCase()));
    }

    res.json(results);
});

// [追加] 国の一覧を取得するAPI
app.get('/api/countries', (req, res) => {
    const countries = [...new Set(recipes.map(r => r.country))];
    res.json(countries);
});

app.get('/api/dish-names', (req, res) => {
    const dishNames = [...new Set(recipes.map(r => r.dishName))];
    res.json(dishNames);
});

app.post('/api/recipes', upload.single('photo'), (req, res) => {
    const { author, country, dishName, method, ingredients, substitutes } = req.body;
    
    // 画像がアップロードされていればそのパスを保存、なければ空文字
    const photoUrl = req.file ? '/uploads/' + req.file.filename : ''; 
    
    const newRecipe = {
        id: Date.now(),
        author,
        country,
        dishName,
        photoUrl, // 画像のパスを保存
        method,
        ingredients,
        substitutes,
        likes: 0,
        reviews: []
    };
    
    recipes.push(newRecipe);
    res.status(201).json({ message: 'Recipe posted successfully!', recipe: newRecipe });
});

// Like a recipe
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

// Add a review
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

// --- Routing for HTML files ---
app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));
app.get('/post', (req, res) => res.sendFile(__dirname + '/post.html'));
app.get('/browse', (req, res) => res.sendFile(__dirname + '/browse.html'));
app.get('/recipe/:id', (req, res) => res.sendFile(__dirname + '/recipe.html'));

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

// Get single recipe by ID
app.get('/api/recipes/:id', (req, res) => {
    const recipeId = parseInt(req.params.id);
    const recipe = recipes.find(r => r.id === recipeId);

    if (recipe) {
        res.json(recipe);
    } else {
        res.status(404).json({ message: 'Recipe not found' });
    }
});