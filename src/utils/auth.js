const jwt = require('jsonwebtoken');

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const JWT_SECRET = process.env.JWT_SECRET || 'talkscape-dev-secret-change-me';

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      scope: 'user'
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function signAdminToken({ admin }) {
  const resolvedAdminId = admin.id || admin.adminId;
  const resolvedUsername = admin.username || '';
  const resolvedRoleCode = admin.role_code || admin.roleCode || 'operator';
  const resolvedPermissions = admin.permissions || '[]';
  const resolvedTokenVersion = Number(admin.token_version || admin.tokenVersion || 1);
  return jwt.sign(
    {
      sub: resolvedAdminId,
      username: resolvedUsername,
      scope: 'tsadmin',
      adminId: resolvedAdminId,
      roleCode: resolvedRoleCode,
      permissions: resolvedPermissions,
      tokenVersion: resolvedTokenVersion
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = {
  signAdminToken,
  signToken,
  verifyToken
};
