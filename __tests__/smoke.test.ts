/**
 * Smoke test for CI - minimal passing test
 */

describe('Application Smoke Test', () => {
  it('should pass basic smoke test', () => {
    // Basic smoke test to verify CI can run tests
    expect(1 + 1).toBe(2)
    expect(true).toBe(true)
  })

  it('should have test environment available', () => {
    // Verify basic test globals are available
    expect(expect).toBeDefined()
    expect(describe).toBeDefined()
    expect(it).toBeDefined()
  })
})