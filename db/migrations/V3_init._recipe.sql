CREATE TABLE recipes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  author VARCHAR(255),
  country VARCHAR(255),
  dishName VARCHAR(255),
  photo VARCHAR(255),
  method TEXT,
  ingredients TEXT,
  substitutes TEXT,
  likes INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);