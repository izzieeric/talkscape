const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const config = require('../config');
const { signToken } = require('../utils/auth');
const userService = require('./user.service');

function buildAuthResponse(userRow) {
  const user = userService.sanitizeUser(userRow);
  return {
    token: signToken(user),
    user
  };
}

function validateCredentials({ username, password }) {
  const normalizedUsername = String(username || '').trim().toLowerCase();
  const normalizedPassword = String(password || '');

  if (!/^[a-zA-Z0-9_]{4,20}$/.test(normalizedUsername)) {
    const error = new Error('Username must be 4-20 characters and contain only letters, numbers, or underscore');
    error.status = 400;
    throw error;
  }

  if (normalizedPassword.length < 6) {
    const error = new Error('Password must be at least 6 characters');
    error.status = 400;
    throw error;
  }

  return {
    username: normalizedUsername,
    password: normalizedPassword
  };
}

async function register(payload) {
  if (config.auth?.allowRegister === false) {
    const error = new Error('暂未开放注册');
    error.status = 403;
    throw error;
  }

  const { username, password } = validateCredentials(payload);
  const knex = db.getDb();

  const existingUser = await userService.getUserByUsername(username);
  if (existingUser) {
    const error = new Error('Username already exists');
    error.status = 409;
    throw error;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const displayName = String(payload.displayName || username).trim().slice(0, 20) || username;
  const avatarText = displayName.slice(0, 2).toUpperCase();
  const id = uuidv4();

  await knex('users').insert({
    id,
    username,
    password_hash: passwordHash,
    display_name: displayName,
    bio: '',
    avatar_text: avatarText || 'T'
  });

  const userRow = await userService.getUserById(id);
  await userService.updateLastLogin(id);

  return buildAuthResponse({ ...userRow, last_login_at: new Date().toISOString() });
}

async function login(payload) {
  const { username, password } = validateCredentials(payload);
  const userRow = await userService.getUserByUsername(username);

  if (!userRow) {
    const error = new Error('Invalid username or password');
    error.status = 401;
    throw error;
  }

  const isMatch = await bcrypt.compare(password, userRow.password_hash);
  if (!isMatch) {
    const error = new Error('Invalid username or password');
    error.status = 401;
    throw error;
  }

  await userService.updateLastLogin(userRow.id);
  return buildAuthResponse({ ...userRow, last_login_at: new Date().toISOString() });
}

async function getAuthUser(userId) {
  const userRow = await userService.getUserById(userId);
  if (!userRow) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }

  return buildAuthResponse(userRow);
}

module.exports = {
  getAuthUser,
  login,
  register
};
