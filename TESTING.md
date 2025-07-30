# Testing Guide

## Running Tests

This project uses Jest for testing with the following setup:

### Prerequisites
- **Package Manager**: Use `pnpm` (preferred) or `npm`
- **Jest Version**: 29.7.0
- **Node.js**: Compatible with current LTS

### Installation
```bash
# Install dependencies (ensures Jest is available)
pnpm install

# Or with npm
npm install
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test src/lib/utils/__tests__/intent-detection.test.ts

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage
```

### Test Structure

Tests are located in `__tests__/` directories next to the source files:
- `/src/lib/utils/__tests__/` - Utility function tests
- `/src/lib/validation/__tests__/` - Validation system tests
- `/src/lib/constants/__tests__/` - Error handling tests
- `/src/lib/prompts/__tests__/` - Prompt system tests
- `/src/hooks/__tests__/` - React hook tests
- `/src/components/app/__tests__/` - Component tests

### Test Configuration

- **Config File**: `jest.config.js`
- **Setup File**: `jest.setup.js`
- **Test Environment**: jsdom (for React components)
- **TypeScript**: Configured with ts-jest

### Common Issues

1. **"Environment may be missing jest"**
   - Solution: Reinstall dependencies with `pnpm install`
   - Restart your IDE/editor

2. **OpenAI API Tests Failing**
   - Expected in browser-like test environment
   - API tests require server environment or mocking

3. **Module Resolution Issues**
   - Ensure `@` alias is properly configured in jest.config.js
   - Check that import paths match the moduleNameMapper

### Lockfile Management

This project uses `pnpm-lock.yaml` for dependency locking. The `package-lock.json` file is gitignored in favor of pnpm's lockfile.

Jest dependencies are tracked in `package.json` devDependencies and locked in `pnpm-lock.yaml`.