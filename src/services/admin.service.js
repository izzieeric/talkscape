const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const knex = require('../db/knex');
const { signAdminToken } = require('../utils/auth');

function parsePermissions(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function sanitizeAdmin(adminRow) {
  if (!adminRow) return null;
  return {
    id: adminRow.id,
    username: adminRow.username,
    adminName: adminRow.admin_name,
    displayName: adminRow.admin_name,
    avatarText: adminRow.avatar_text || 'AD',
    roleCode: adminRow.role_code,
    permissions: parsePermissions(adminRow.permissions),
    status: adminRow.status,
    tokenVersion: Number(adminRow.token_version || 1),
    createdAt: adminRow.created_at,
    updatedAt: adminRow.updated_at,
    lastLoginAt: adminRow.last_login_at
  };
}

function normalizeAdminUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function validateAdminIdentity({ username, password }, { requirePassword = true } = {}) {
  const normalizedUsername = normalizeAdminUsername(username);
  const normalizedPassword = String(password || '');

  if (!/^[a-zA-Z0-9_]{4,32}$/.test(normalizedUsername)) {
    const error = new Error('Admin username must be 4-32 characters and contain only letters, numbers, or underscore');
    error.status = 400;
    throw error;
  }

  if (requirePassword && normalizedPassword.length < 6) {
    const error = new Error('Admin password must be at least 6 characters');
    error.status = 400;
    throw error;
  }

  return {
    username: normalizedUsername,
    password: normalizedPassword
  };
}

async function getAdminById(adminId) {
  return await knex('admin_users').where('id', adminId).first();
}

async function getAdminByUsername(username) {
  return await knex('admin_users').where('username', normalizeAdminUsername(username)).first();
}

async function getAdminCount() {
  const row = await knex('admin_users').count('* as count').first();
  return Number(row?.count || 0);
}

async function getActiveAdminById(adminId) {
  const admin = await getAdminById(adminId);
  if (!admin || admin.status !== 'active') return null;
  return admin;
}

async function getActiveAdminByUsername(username) {
  const admin = await getAdminByUsername(username);
  if (!admin || admin.status !== 'active') return null;
  return admin;
}

async function updateLastAdminLogin(adminId, loginIp = '') {
  await knex('admin_users').update({ last_login_at: knex.fn.now(), last_login_ip: loginIp || '', updated_at: knex.fn.now() }).where('id', adminId);
}

async function createAdmin({
  username,
  password,
  adminName = '',
  avatarText = '',
  roleCode = 'operator',
  permissions = ['*'],
  status = 'active',
  createdBy = null,
  remark = ''
}) {
  
  const credentials = validateAdminIdentity({ username, password });
  const existing = await getAdminByUsername(credentials.username);
  if (existing) {
    const error = new Error('Admin username already exists');
    error.status = 409;
    throw error;
  }

  const id = uuidv4();
  const passwordHash = await bcrypt.hash(credentials.password, 10);
  const resolvedAdminName = String(adminName || credentials.username).trim().slice(0, 30) || credentials.username;
  const resolvedAvatarText = String(avatarText || resolvedAdminName.slice(0, 2).toUpperCase() || 'AD')
    .trim()
    .slice(0, 2)
    .toUpperCase() || 'AD';
  const normalizedPermissions = JSON.stringify(Array.isArray(permissions) ? permissions : []);

  await knex('admin_users').insert({
    id, username: credentials.username, password_hash: passwordHash, admin_name: resolvedAdminName, avatar_text: resolvedAvatarText,
    role_code: roleCode, permissions: normalizedPermissions, status, remark, created_by: createdBy
  });

  return sanitizeAdmin(await getAdminById(id));
}

async function loginAdmin({ username, password, loginIp = '' } = {}) {
  const credentials = validateAdminIdentity({ username, password });
  const adminRow = await getAdminByUsername(credentials.username);

  if (!adminRow) {
    const error = new Error('Invalid username or password');
    error.status = 401;
    throw error;
  }

  const isMatch = await bcrypt.compare(credentials.password, adminRow.password_hash);
  if (!isMatch) {
    const error = new Error('Invalid username or password');
    error.status = 401;
    throw error;
  }

  if (adminRow.status !== 'active') {
    const error = new Error('Administrator account is disabled');
    error.status = 403;
    throw error;
  }

  await updateLastAdminLogin(adminRow.id, loginIp);
  const freshAdmin = await getAdminById(adminRow.id);

  return {
    token: signAdminToken({ admin: freshAdmin }),
    admin: sanitizeAdmin({
      ...freshAdmin,
      last_login_at: new Date().toISOString()
    })
  };
}

async function getAdminAuthContext(adminId) {
  const admin = await getActiveAdminById(adminId);
  if (!admin) return null;
  return {
    admin: sanitizeAdmin(admin)
  };
}

module.exports = {
  createAdmin,
  getAdminAuthContext,
  getActiveAdminById,
  getActiveAdminByUsername,
  getAdminById,
  getAdminByUsername,
  getAdminCount,
  loginAdmin,
  normalizeAdminUsername,
  sanitizeAdmin,
  updateLastAdminLogin,
  validateAdminIdentity
};
