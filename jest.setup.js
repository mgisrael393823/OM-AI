// Optional: configure or set up a testing framework before each test
// If you delete this file, remove `setupFilesAfterEnv` from `jest.config.js`

import '@testing-library/jest-dom'
import React from 'react'

// Mock Next.js router
jest.mock('next/router', () => ({
  useRouter() {
    return {
      route: '/',
      pathname: '/',
      query: '',
      asPath: '',
      push: jest.fn(),
      pop: jest.fn(),
      reload: jest.fn(),
      back: jest.fn(),
      prefetch: jest.fn(),
      beforePopState: jest.fn(),
      events: {
        on: jest.fn(),
        off: jest.fn(),
        emit: jest.fn(),
      },
    }
  },
}))

// Mock window.matchMedia (only in browser-like environments)
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(), // Deprecated
      removeListener: jest.fn(), // Deprecated
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  })
}

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}))

// Mock environment variables
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.OPENAI_API_KEY = 'test-openai-key'

// Mock OpenAI client to prevent browser environment error
jest.mock('@/lib/openai-client', () => ({
  openai: {
    chat: {
      completions: {
        create: jest.fn(async (params) => {
          if (params.stream) {
            return {
              [Symbol.asyncIterator]: async function* () {
                yield { choices: [{ delta: { content: 'Test' } }] }
                yield { choices: [{ delta: { content: ' response' } }] }
                yield { choices: [{ delta: {} }] }
              }
            }
          } else {
            return {
              id: 'test-id',
              model: 'gpt-4o',
              choices: [{ message: { content: 'Test response' } }],
              usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
            }
          }
        })
      }
    }
  },
  isOpenAIConfigured: jest.fn(() => true)
}))

// Mock Sentry
jest.mock('@sentry/nextjs', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  withSentry: jest.fn((handler) => handler),
  configureScope: jest.fn()
}))

// Mock error logger
jest.mock('@/lib/error-logger', () => ({
  logError: jest.fn(),
  logWarning: jest.fn()
}))

// Mock UI components that use complex dependencies
jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }) => children,
  DropdownMenuContent: ({ children }) => children,
  DropdownMenuItem: ({ children, onClick }) => 
    React.createElement('div', { onClick, 'data-testid': 'dropdown-item' }, children),
  DropdownMenuTrigger: ({ children }) => children
}))

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, className, ...props }) => 
    React.createElement('button', { onClick, className, ...props }, children)
}))

// Mock react-window
jest.mock('react-window', () => {
  const Actual = jest.requireActual('react-window');
  const MockList = ({ children, itemCount, itemSize, height, width }) =>
    React.createElement(
      'div',
      { 'data-testid': 'virtualized-list', style: { height, width } },
      Array.from({ length: Math.min(itemCount, 10) }, (_, index) =>
        children({ index, style: { height: itemSize } })
      )
    );
  return {
    ...Actual,
    FixedSizeList: MockList,
    List: MockList,            // alias if your code uses "List"
  };
})

