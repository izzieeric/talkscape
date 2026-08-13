module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/__tests__/**/*.test.js'],
  clearMocks: true,
  modulePathIgnorePatterns: ['<rootDir>/frontend/', '<rootDir>/node_modules/']
};