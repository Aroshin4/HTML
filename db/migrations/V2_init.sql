
CREATE TABLE app_user (
  id SERIAL PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  default_country_id INT REFERENCES country(id),
  role TEXT DEFAULT 'user',              -- 'user' | 'moderator' | 'admin'
  created_at TIMESTAMP DEFAULT NOW()
);
