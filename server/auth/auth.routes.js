import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../ratings/db.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'CurefoodsSuperSecret2026';

// Middleware to verify token and extract user
export const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Real-time block: Ensure user is not locked in the DB
    const { rows } = await pool.query('SELECT is_locked FROM authorized_users WHERE id = $1', [decoded.id]);
    if (rows.length === 0 || rows[0].is_locked) {
      return res.status(403).json({ success: false, error: 'Account has been locked by admin' });
    }
    
    req.user = decoded; // { id, email, role }
    next();
  } catch (err) {
    console.error("Auth Middleware Error:", err);
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(403).json({ success: false, error: 'Forbidden: Invalid or expired token', details: err.message });
    }
    return res.status(500).json({ success: false, error: 'Internal server error during authentication', details: err.message });
  }
};

// Middleware for admin routes
export const adminMiddleware = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Forbidden: Admin access required' });
  }
  next();
};

// 1. Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }

  try {
    const { rows } = await pool.query('SELECT * FROM authorized_users WHERE email = $1', [email]);
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    if (user.is_locked) {
      return res.status(403).json({ success: false, error: 'Account has been locked by admin' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' } // Token valid for 7 days
    );

    res.json({ success: true, token, user: { email: user.email, role: user.role } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// 2. Get all users (Admin only)
router.get('/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, email, role, is_locked, created_at FROM authorized_users ORDER BY id ASC');
    res.json({ success: true, users: rows });
  } catch (err) {
    console.error('Fetch users error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// 3. Add new user (Admin only)
router.post('/users', authMiddleware, adminMiddleware, async (req, res) => {
  const { email, password, role = 'user' } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO authorized_users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role, created_at',
      [email, hashedPassword, role]
    );
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    if (err.code === '23505') { // unique violation
      return res.status(400).json({ success: false, error: 'User with this email already exists' });
    }
    console.error('Add user error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// 4. Delete user (Admin only)
router.delete('/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  
  // Prevent deleting oneself
  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ success: false, error: 'Cannot delete your own admin account' });
  }

  try {
    const { rowCount } = await pool.query('DELETE FROM authorized_users WHERE id = $1', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// 5. Toggle Lock Status (Admin only)
router.patch('/users/:id/lock', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  const { is_locked } = req.body;
  
  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ success: false, error: 'Cannot lock your own admin account' });
  }

  try {
    const { rowCount } = await pool.query('UPDATE authorized_users SET is_locked = $1 WHERE id = $2', [is_locked, id]);
    if (rowCount === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, message: is_locked ? 'User locked successfully' : 'User unlocked successfully' });
  } catch (err) {
    console.error('Lock user error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
