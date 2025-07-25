import { renderHook, act } from '@testing-library/react'
import { useSidebar } from '../useSidebar'

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  clear: jest.fn(),
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Mock window.innerWidth
Object.defineProperty(window, 'innerWidth', {
  writable: true,
  configurable: true,
  value: 1024,
})

describe('useSidebar', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorageMock.getItem.mockReturnValue(null)
    // Reset window width to desktop
    window.innerWidth = 1024
  })

  it('initializes with default values', () => {
    const { result } = renderHook(() => useSidebar())

    expect(result.current.sidebarState).toBe('normal')
    expect(result.current.sidebarOpen).toBe(true) // Desktop default
    expect(result.current.deviceType).toBe('desktop')
    expect(result.current.sidebarWidth).toBe(256)
    expect(result.current.isDesktop).toBe(true)
    expect(result.current.isMobile).toBe(false)
    expect(result.current.isTablet).toBe(false)
  })

  it('detects mobile device correctly', () => {
    window.innerWidth = 600
    const { result } = renderHook(() => useSidebar())

    expect(result.current.deviceType).toBe('mobile')
    expect(result.current.isMobile).toBe(true)
    expect(result.current.isDesktop).toBe(false)
    expect(result.current.sidebarOpen).toBe(false) // Mobile default
  })

  it('detects tablet device correctly', () => {
    window.innerWidth = 800
    const { result } = renderHook(() => useSidebar())

    expect(result.current.deviceType).toBe('tablet')
    expect(result.current.isTablet).toBe(true)
    expect(result.current.isDesktop).toBe(false)
  })

  it('changes sidebar state correctly', () => {
    const { result } = renderHook(() => useSidebar())

    act(() => {
      result.current.setSidebarState('collapsed')
    })

    expect(result.current.sidebarState).toBe('collapsed')
    expect(result.current.sidebarWidth).toBe(64)
  })

  it('toggles sidebar correctly on desktop', () => {
    const { result } = renderHook(() => useSidebar())

    // Initially normal state
    expect(result.current.sidebarState).toBe('normal')

    act(() => {
      result.current.toggleSidebar()
    })

    expect(result.current.sidebarState).toBe('collapsed')

    act(() => {
      result.current.toggleSidebar()
    })

    expect(result.current.sidebarState).toBe('normal')
  })

  it('toggles sidebar open/close on mobile', () => {
    window.innerWidth = 600
    const { result } = renderHook(() => useSidebar())

    // Initially closed on mobile
    expect(result.current.sidebarOpen).toBe(false)

    act(() => {
      result.current.toggleSidebar()
    })

    expect(result.current.sidebarOpen).toBe(true)

    act(() => {
      result.current.toggleSidebar()
    })

    expect(result.current.sidebarOpen).toBe(false)
  })

  it('expands sidebar correctly', () => {
    const { result } = renderHook(() => useSidebar())

    act(() => {
      result.current.expandSidebar()
    })

    expect(result.current.sidebarState).toBe('expanded')
    expect(result.current.sidebarWidth).toBe(320)
  })

  it('collapses sidebar correctly', () => {
    const { result } = renderHook(() => useSidebar())

    act(() => {
      result.current.collapseSidebar()
    })

    expect(result.current.sidebarState).toBe('collapsed')
    expect(result.current.sidebarWidth).toBe(64)
  })

  it('saves state to localStorage', () => {
    const { result } = renderHook(() => useSidebar())

    act(() => {
      result.current.setSidebarState('expanded')
    })

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'om-intel-sidebar-state',
      expect.stringContaining('expanded')
    )
  })

  it('loads state from localStorage', () => {
    localStorageMock.getItem.mockReturnValue(
      JSON.stringify({
        sidebarState: 'collapsed',
        sidebarOpen: true,
      })
    )

    const { result } = renderHook(() => useSidebar())

    expect(result.current.sidebarState).toBe('collapsed')
  })

  it('handles invalid localStorage data gracefully', () => {
    localStorageMock.getItem.mockReturnValue('invalid-json')

    const { result } = renderHook(() => useSidebar())

    // Should fall back to default values
    expect(result.current.sidebarState).toBe('normal')
  })
})