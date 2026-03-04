const express = require('express');
const app = express();
const port = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// [NEW] Get a list of unique dish names for the search suggestions
app.get('/api/dish-names', (req, res) => {
    // Extract dish names and remove duplicates using Set
    const dishNames = [...new Set(recipes.map(r => r.dishName))];
    res.json(dishNames);
});

// Post a new recipe
app.post('/api/recipes', (req, res) => {
    const { country, dishName, photoUrl, method, ingredients, substitutes } = req.body;
    
    const newRecipe = {
        id: Date.now(),
        country,
        dishName,
        photoUrl,
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

app.get('/recipe/:id', (req, res) => {
    res.sendFile(__dirname + '/recipe.html');
});