const baseConfig = require('./jest.config.js')

module.exports = {
  ...baseConfig,
  testMatch: ['**/__tests__/smoke.test.ts']
}