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
const ALL_ROLES = ['super_admin', 'admin', ...LOWER_LEVEL_ROLES];
const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  dark_kitchen: 'Dark Kitchen',
  supervisor: 'Supervisor',
  control_tower: 'Control Tower',
};

// Employees can now hold more than one role at once (e.g. Supervisor + Control Tower).
// The lower-tier roles (dark_kitchen/supervisor/control_tower) are siblings, not a
// ladder relative to each other, so hierarchy decisions can't collapse a person's
// roles into one "primary" role in general — EXCEPT for the super_admin/admin tier,
// which genuinely does outrank everything else regardless of what else is in the set.
// That's the one case primaryRole() is safe to use for.
const ROLE_RANK = { super_admin: 3, admin: 2, dark_kitchen: 1, supervisor: 1, control_tower: 1 };
function primaryRole(roles) {
  if (!roles || roles.length === 0) return null;
  return [...roles].sort((a, b) => (ROLE_RANK[b] || 0) - (ROLE_RANK[a] || 0))[0];
}

// Which roles can an actor of this (primary) role grant to a new/existing employee?
function grantableRoles(actorRole) {
  if (actorRole === 'super_admin') return ['admin', ...LOWER_LEVEL_ROLES];
  if (actorRole === 'admin') return [...LOWER_LEVEL_ROLES];
  return [];
}

// Can this actor take management action (lock/delete/reset-password/role-edit) on a
// user holding targetRoles? Judged on the target's highest-ranked role — an Admin must
// never be able to touch someone who holds super_admin among their roles, even if that
// person also holds a lower role.
function canManageTarget(actorRole, targetRoles) {
  if (actorRole === 'super_admin') return true;
  if (actorRole === 'admin') return LOWER_LEVEL_ROLES.includes(primaryRole(targetRoles));
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
    const { rows } = await pool.query('SELECT is_locked, role, roles FROM authorized_users WHERE id = $1', [decoded.id]);
    if (rows.length === 0 || rows[0].is_locked) {
      return res.status(403).json({ success: false, error: 'Account has been locked by admin' });
    }

    const roles = rows[0].roles && rows[0].roles.length ? rows[0].roles : [rows[0].role];
    // role stays the highest-ranked of the current set — safe for admin-tier gating
    // (adminMiddleware, grantableRoles). Anything that cares about a specific
    // lower-tier role (e.g. control_tower store access) must check `roles`, not `role`.
    req.user = { ...decoded, role: primaryRole(roles), roles }; // { id, email, role, roles } — always current, not the JWT's stale claim
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
    // Case-insensitive lookup — emails are stored lowercase going forward (see
    // POST /users below), but this also protects against any existing rows that
    // predate that normalization, or a login attempt typed with different casing.
    const { rows } = await pool.query('SELECT * FROM authorized_users WHERE LOWER(email) = LOWER($1)', [email]);
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

    const roles = user.roles && user.roles.length ? user.roles : [user.role];
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' } // Token valid for 7 days
    );

    res.json({ success: true, token, user: { email: user.email, role: user.role, roles } });
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
    const { rows } = await pool.query('SELECT * FROM authorized_users WHERE LOWER(email) = LOWER($1)', [email]);
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
  res.json({ success: true, user: { id: req.user.id, email: req.user.email, role: req.user.role, roles: req.user.roles } });
});

// 2. Get all users (Admin / Super Admin only)
router.get('/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, email, role, roles, is_locked, created_at FROM authorized_users ORDER BY id ASC');
    // Tell the frontend what THIS actor is allowed to do, per row, so the UI can
    // hide/disable actions it knows the backend will reject anyway.
    const users = rows.map(u => {
      const roles = u.roles && u.roles.length ? u.roles : [u.role];
      return { ...u, roles, canManage: canManageTarget(req.user.role, roles) };
    });
    res.json({ success: true, users, actorRole: req.user.role, grantableRoles: grantableRoles(req.user.role) });
  } catch (err) {
    console.error('Fetch users error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// 3. Add new user (Admin / Super Admin only — scoped to roles they're allowed to grant).
// Accepts one or more roles at once (e.g. Supervisor + Control Tower for the same person).
router.post('/users', authMiddleware, adminMiddleware, async (req, res) => {
  const roles = [...new Set(Array.isArray(req.body.roles) ? req.body.roles : (req.body.role ? [req.body.role] : []))];
  const email = (req.body.email || '').trim().toLowerCase();
  if (!email || roles.length === 0) {
    return res.status(400).json({ success: false, error: 'Email and at least one role are required' });
  }
  if (!email.endsWith('@curefoods.in')) {
    return res.status(400).json({ success: false, error: 'Only @curefoods.in email addresses are allowed.' });
  }
  if (roles.some(r => !ALL_ROLES.includes(r))) {
    return res.status(400).json({ success: false, error: 'Unknown role in selection.' });
  }
  const allowed = grantableRoles(req.user.role);
  const disallowed = roles.filter(r => !allowed.includes(r));
  if (disallowed.length > 0) {
    return res.status(403).json({ success: false, error: `You aren't allowed to grant: ${disallowed.map(r => ROLE_LABELS[r] || r).join(', ')}.` });
  }

  const password = Math.random().toString(36).slice(-10);
  const primary = primaryRole(roles);

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO authorized_users (email, password_hash, role, roles) VALUES ($1, $2, $3, $4) RETURNING id, email, role, roles, created_at',
      [email, hashedPassword, primary, roles]
    );

    // Email the new user their credentials
    const roleLabels = roles.map(r => ROLE_LABELS[r] || r).join(', ');
    const subject = "Welcome to Curefoods Operations Dashboard";
    const body = `Hello,\n\nAn admin has created a new account for you on the Curefoods Operations Dashboard.\n\nLogin here: ${FRONTEND_URL}\nUsername: ${email}\nPassword: ${password}\nRole${roles.length > 1 ? 's' : ''}: ${roleLabels}\n\nPlease keep these credentials safe.`;
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
    const userRoles = user.roles && user.roles.length ? user.roles : [user.role];
    if (!canManageTarget(req.user.role, userRoles)) {
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

// 3.6 Update a user's roles (Admin / Super Admin, subject to hierarchy on both ends).
// Accepts an array so an employee can hold more than one role at once.
router.patch('/users/:id/role', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  const roles = [...new Set(Array.isArray(req.body.roles) ? req.body.roles : (req.body.role ? [req.body.role] : []))];

  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ success: false, error: 'Cannot change your own role' });
  }
  if (roles.length === 0) {
    return res.status(400).json({ success: false, error: 'At least one role is required' });
  }
  if (roles.some(r => !ALL_ROLES.includes(r))) {
    return res.status(400).json({ success: false, error: 'Unknown role in selection.' });
  }

  try {
    const targetRes = await pool.query('SELECT role, roles FROM authorized_users WHERE id = $1', [id]);
    if (targetRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    const currentRoles = targetRes.rows[0].roles && targetRes.rows[0].roles.length ? targetRes.rows[0].roles : [targetRes.rows[0].role];
    // Must be allowed to manage their CURRENT roles, and allowed to grant EVERY new one.
    if (!canManageTarget(req.user.role, currentRoles)) {
      return res.status(403).json({ success: false, error: `You don't have permission to manage a ${ROLE_LABELS[primaryRole(currentRoles)] || primaryRole(currentRoles)} account.` });
    }
    const allowed = grantableRoles(req.user.role);
    const disallowed = roles.filter(r => !allowed.includes(r));
    if (disallowed.length > 0) {
      return res.status(403).json({ success: false, error: `You aren't allowed to grant: ${disallowed.map(r => ROLE_LABELS[r] || r).join(', ')}.` });
    }

    await pool.query('UPDATE authorized_users SET role = $1, roles = $2 WHERE id = $3', [primaryRole(roles), roles, id]);
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
    const { rows } = await pool.query('SELECT role, roles FROM authorized_users WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    const targetRoles = rows[0].roles && rows[0].roles.length ? rows[0].roles : [rows[0].role];
    if (!canManageTarget(req.user.role, targetRoles)) {
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
    const targetRes = await pool.query('SELECT role, roles FROM authorized_users WHERE id = $1', [id]);
    if (targetRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    const targetRoles = targetRes.rows[0].roles && targetRes.rows[0].roles.length ? targetRes.rows[0].roles : [targetRes.rows[0].role];
    if (!canManageTarget(req.user.role, targetRoles)) {
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
