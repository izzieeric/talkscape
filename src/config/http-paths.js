const HTTP_BASE_PATH = '/talkscape';
const TSADMIN_BASE_PATH = withHttpBasePath('/tsadmin');
const TSADMIN_ASSETS_PATH = `${TSADMIN_BASE_PATH}/assets`;

function withHttpBasePath(pathname = '') {
  const normalizedPath = String(pathname || '').trim();
  const basePath = String(HTTP_BASE_PATH || '').trim().replace(/\/+$/, '');

  if (!basePath) {
    return normalizedPath || '/';
  }

  if (!normalizedPath || normalizedPath === '/') {
    return basePath;
  }

  return `${basePath}${normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`}`;
}

module.exports = {
  HTTP_BASE_PATH,
  TSADMIN_ASSETS_PATH,
  TSADMIN_BASE_PATH,
  withHttpBasePath
};
