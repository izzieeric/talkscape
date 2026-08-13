const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const projectRoot = path.resolve(__dirname, '../..');
let cachedReport = null;

function loadEnvFile(filePath, override = true) {
  if (!fs.existsSync(filePath)) {
    return { filePath, loaded: false, missing: true };
  }

  const result = dotenv.config({ path: filePath, override });

  return {
    filePath,
    loaded: !result.error,
    missing: false,
    error: result.error || null
  };
}

function loadEnvFiles() {
  if (cachedReport) {
    return cachedReport;
  }

  const baseEnvPath = path.join(projectRoot, '.env');
  const baseResult = loadEnvFile(baseEnvPath, false);
  const mode = process.env.NODE_ENV || 'development';

  const extraResults = [
    loadEnvFile(path.join(projectRoot, `.env.${mode}`)),
    loadEnvFile(path.join(projectRoot, '.env.local')),
    loadEnvFile(path.join(projectRoot, `.env.${mode}.local`))
  ];

  const results = [baseResult, ...extraResults];

  cachedReport = {
    mode,
    projectRoot,
    loadedFiles: results.filter((item) => item.loaded).map((item) => item.filePath),
    missingFiles: results.filter((item) => item.missing).map((item) => item.filePath),
    errors: results.filter((item) => item.error).map((item) => ({
      filePath: item.filePath,
      message: item.error.message
    }))
  };

  return cachedReport;
}

module.exports = {
  loadEnvFiles
};
