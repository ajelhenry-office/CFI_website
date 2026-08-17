import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../ratings/db.js';
import { sendEmail } from './emailService.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://cfi-website-five.vercel.app';

// ─── ROLE HIERARCHY ─────────────────────────────────────────
// Super Admin can manage everyone, including other admins. Admin can manage only
// the three lower-level roles — never other admins, never super_admin. Super Admin
// is intentionally never assignable through the UI (grantableRoles below) — it can
// only ever be set directly in the database, on purpose.
const LOWER_LEVEL_ROLES = ['dark_kitchen', 'supervisor', 'control_tower'];
const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  dark_kitchen: 'Dark Kitchen',
  supervisor: 'Supervisor',
  control_tower: 'Control Tower',
};

// Which roles can an actor of this role grant to a new/existing employee?
function grantableRoles(actorRole) {
  if (actorRole === 'super_admin') return ['admin', ...LOWER_LEVEL_ROLES];
  if (actorRole === 'admin') return [...LOWER_LEVEL_ROLES];
  return [];
}

// Can this actor take management action (lock/delete/reset-password) on a user with targetRole?
function canManageTarget(actorRole, targetRole) {
  if (actorRole === 'super_admin') return true;
  if (actorRole === 'admin') return LOWER_LEVEL_ROLES.includes(targetRole);
  return false;
}

// Middleware to verify token and extract user
export const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Real-time block + fresh role: the JWT's role claim is fixed at login and lasts
    // 7 days — if it were trusted directly, a demoted admin would keep admin-level API
    // access for up to a week after being downgraded. Re-reading the role here on every
    // request (same query we already do for the lock check, no extra round trip) means
    // a role change takes effect on the very next request, not at next login.
    const { rows } = await pool.query('SELECT is_locked, role FROM authorized_users WHERE id = $1', [decoded.id]);
    if (rows.length === 0 || rows[0].is_locked) {
      return res.status(403).json({ success: false, error: 'Account has been locked by admin' });
    }

    req.user = { ...decoded, role: rows[0].role }; // { id, email, role } — role always current, not the JWT's stale claim
    next();
  } catch (err) {
    console.error("Auth Middleware Error:", err);
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(403).json({ success: false, error: 'Forbidden: Invalid or expired token', details: err.message });
    }
    return res.status(500).json({ success: false, error: 'Internal server error during authentication', details: err.message });
  }
};

// Middleware for employee-management routes — both Admin and Super Admin can manage
// employees; per-target hierarchy (can an Admin touch THIS particular user?) is
// checked individually inside each route via canManageTarget, since it depends on
// the target's role, not just the actor's.
export const adminMiddleware = (req, res, next) => {
  if (!['admin', 'super_admin'].includes(req.user?.role)) {
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

// 1.5 Forgot Password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, error: 'Email is required' });
  }

  try {
    const { rows } = await pool.query('SELECT * FROM authorized_users WHERE email = $1', [email]);
    const user = rows[0];

    if (!user) {
      // Return true anyway for security so we don't leak user existence
      return res.json({ success: true, message: 'If the email exists, a password reset has been sent.' });
    }

    if (user.is_locked) {
      return res.status(403).json({ success: false, error: 'Account has been locked by admin' });
    }

    // Generate random 8 character password
    const newPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update DB
    await pool.query('UPDATE authorized_users SET password_hash = $1 WHERE id = $2', [hashedPassword, user.id]);

    // Send email
    const subject = "Curefoods Dashboard - Password Reset";
    const body = `Hello,\n\nYour password has been reset.\n\nLogin here: ${FRONTEND_URL}\nYour Username: ${user.email}\nYour New Password: ${newPassword}\n\nPlease login and change your password if needed.`;

    const emailSent = await sendEmail(user.email, subject, body);
    if (!emailSent) console.error(`[AUTH] Password reset succeeded for ${user.email} but the email failed to send.`);

    res.json({ success: true, message: 'If the email exists, a password reset has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// 1.6 Get my own current profile — lets the frontend re-sync its cached role/lock
// status (authMiddleware already re-checks these on every request; this just gives
// the UI a cheap way to notice a change and update localStorage without needing a
// full logout/login).
router.get('/me', authMiddleware, (req, res) => {
  res.json({ success: true, user: { id: req.user.id, email: req.user.email, role: req.user.role } });
});

// 2. Get all users (Admin / Super Admin only)
router.get('/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, email, role, is_locked, created_at FROM authorized_users ORDER BY id ASC');
    // Tell the frontend what THIS actor is allowed to do, per row, so the UI can
    // hide/disable actions it knows the backend will reject anyway.
    const users = rows.map(u => ({ ...u, canManage: canManageTarget(req.user.role, u.role) }));
    res.json({ success: true, users, actorRole: req.user.role, grantableRoles: grantableRoles(req.user.role) });
  } catch (err) {
    console.error('Fetch users error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// 3. Add new user (Admin / Super Admin only — scoped to roles they're allowed to grant)
router.post('/users', authMiddleware, adminMiddleware, async (req, res) => {
  const { email, role } = req.body;
  if (!email || !role) {
    return res.status(400).json({ success: false, error: 'Email and role required' });
  }
  if (!email.toLowerCase().endsWith('@curefoods.in')) {
    return res.status(400).json({ success: false, error: 'Only @curefoods.in email addresses are allowed.' });
  }
  if (!grantableRoles(req.user.role).includes(role)) {
    return res.status(403).json({ success: false, error: `You aren't allowed to grant the "${ROLE_LABELS[role] || role}" role.` });
  }

  const password = Math.random().toString(36).slice(-10);

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO authorized_users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role, created_at',
      [email, hashedPassword, role]
    );

    // Email the new user their credentials
    const subject = "Welcome to Curefoods Operations Dashboard";
    const body = `Hello,\n\nAn admin has created a new account for you on the Curefoods Operations Dashboard.\n\nLogin here: ${FRONTEND_URL}\nUsername: ${email}\nPassword: ${password}\nRole: ${ROLE_LABELS[role] || role}\n\nPlease keep these credentials safe.`;
    const emailSent = await sendEmail(email, subject, body);

    res.json({
      success: true,
      user: rows[0],
      emailSent,
      message: emailSent ? 'Employee added and credentials emailed.' : 'Employee added, but the welcome email failed to send — share the credentials with them manually.',
    });
  } catch (err) {
    if (err.code === '23505') { // unique violation
      return res.status(400).json({ success: false, error: 'User with this email already exists' });
    }
    console.error('Add user error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// 3.5 Reset User Password (Admin / Super Admin, subject to hierarchy)
router.post('/users/:id/reset-password', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query('SELECT * FROM authorized_users WHERE id = $1', [id]);
    const user = rows[0];

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    if (!canManageTarget(req.user.role, user.role)) {
      return res.status(403).json({ success: false, error: `You don't have permission to manage a ${ROLE_LABELS[user.role] || user.role} account.` });
    }

    const newPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.query('UPDATE authorized_users SET password_hash = $1 WHERE id = $2', [hashedPassword, id]);

    const subject = "Curefoods Dashboard - Admin Password Reset";
    const body = `Hello,\n\nAn admin has manually reset your password.\n\nLogin here: ${FRONTEND_URL}\nYour Username: ${user.email}\nYour New Password: ${newPassword}\n\nPlease login with your new credentials.`;
    const emailSent = await sendEmail(user.email, subject, body);

    res.json({
      success: true,
      message: emailSent ? 'Password reset successfully and emailed to the user.' : 'Password reset, but the email failed to send — share it manually.',
      newPassword,
    });
  } catch (err) {
    console.error('Admin reset password error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// 3.6 Update a user's role (Admin / Super Admin, subject to hierarchy on both ends)
router.patch('/users/:id/role', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ success: false, error: 'Cannot change your own role' });
  }
  if (!role) {
    return res.status(400).json({ success: false, error: 'Role required' });
  }

  try {
    const targetRes = await pool.query('SELECT role FROM authorized_users WHERE id = $1', [id]);
    if (targetRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    // Must be allowed to manage their CURRENT role, and allowed to grant the NEW one.
    if (!canManageTarget(req.user.role, targetRes.rows[0].role)) {
      return res.status(403).json({ success: false, error: `You don't have permission to manage a ${ROLE_LABELS[targetRes.rows[0].role] || targetRes.rows[0].role} account.` });
    }
    if (!grantableRoles(req.user.role).includes(role)) {
      return res.status(403).json({ success: false, error: `You aren't allowed to grant the "${ROLE_LABELS[role] || role}" role.` });
    }

    await pool.query('UPDATE authorized_users SET role = $1 WHERE id = $2', [role, id]);
    res.json({ success: true, message: 'Role updated successfully' });
  } catch (err) {
    console.error('Update role error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// 4. Delete user (Admin / Super Admin, subject to hierarchy)
router.delete('/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;

  // Prevent deleting oneself
  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ success: false, error: 'Cannot delete your own account' });
  }

  try {
    const { rows } = await pool.query('SELECT role FROM authorized_users WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    if (!canManageTarget(req.user.role, rows[0].role)) {
      return res.status(403).json({ success: false, error: `You don't have permission to manage a ${ROLE_LABELS[rows[0].role] || rows[0].role} account.` });
    }

    await pool.query('DELETE FROM authorized_users WHERE id = $1', [id]);
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// 5. Toggle Lock Status (Admin / Super Admin, subject to hierarchy)
router.patch('/users/:id/lock', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  const { is_locked } = req.body;

  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ success: false, error: 'Cannot lock your own account' });
  }

  try {
    const targetRes = await pool.query('SELECT role FROM authorized_users WHERE id = $1', [id]);
    if (targetRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    if (!canManageTarget(req.user.role, targetRes.rows[0].role)) {
      return res.status(403).json({ success: false, error: `You don't have permission to manage a ${ROLE_LABELS[targetRes.rows[0].role] || targetRes.rows[0].role} account.` });
    }

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
