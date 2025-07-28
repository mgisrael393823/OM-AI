const nextJest = require('next/jest');
const createJestConfig = nextJest({ dir: './' });

const customConfig = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.node.js'],
  moduleNameMapper: { 
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(micro|@uploadthing)/)'
  ],
  testMatch: ['<rootDir>/src/pages/api/__tests__/**/*.test.ts']
};

module.exports = createJestConfig(customConfig);