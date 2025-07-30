import { renderHook, act } from '@testing-library/react'
import { useSidebar } from '../useSidebar'

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  clear: jest.fn(),
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

describe('useSidebar', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorageMock.getItem.mockReturnValue(null)
  })

  it('initializes with default value', () => {
    const { result } = renderHook(() => useSidebar())
    expect(result.current.isOpen).toBe(true)
  })

  it('respects defaultOpen option', () => {
    const { result } = renderHook(() => useSidebar({ defaultOpen: false }))
    expect(result.current.isOpen).toBe(false)
  })

  it('toggles open state', () => {
    const { result } = renderHook(() => useSidebar())
    act(() => {
      result.current.toggle()
    })
    expect(result.current.isOpen).toBe(false)
  })

  it('persists to localStorage', () => {
    const { result } = renderHook(() => useSidebar())
    act(() => {
      result.current.setIsOpen(false)
    })
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'om-intel-sidebar-open',
      JSON.stringify(false)
    )
  })

  it('loads from localStorage', () => {
    localStorageMock.getItem.mockReturnValue(JSON.stringify(false))
    const { result } = renderHook(() => useSidebar())
    expect(result.current.isOpen).toBe(false)
  })
})
