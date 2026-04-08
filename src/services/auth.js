const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const dbModule = require("../db/sqlite");
const db = dbModule.db();

const JWT_SECRET = process.env.JWT_SECRET;
const PASSWORD_HASH_KEY = process.env.PASSWORD_HASH_KEY || "";

const getPasswordMaterial = (password) => `${password}${PASSWORD_HASH_KEY}`;

// Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

const login = (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  // Get user
  db.get("SELECT * FROM user WHERE username = ? AND active = 1", [username], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    try {
      const isPasswordValid = await comparePassword(password, user.password);

      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
    } catch (compareError) {
      return res.status(500).json({ error: 'Password verification failed' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        email: user.email 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token: token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  });
};

// Hash password function (for future use)
const hashPassword = async (password) => {
  return await bcrypt.hash(getPasswordMaterial(password), 10);
};

// Compare password function (for future use)
const comparePassword = async (password, hashedPassword) => {
  return await bcrypt.compare(getPasswordMaterial(password), hashedPassword);
};

module.exports = {
  authenticateToken,
  login,
  hashPassword,
  comparePassword
};