import { useState, useEffect, useCallback } from 'react'

interface UseSidebarOptions {
  defaultOpen?: boolean
  storageKey?: string
}

interface UseSidebarReturn {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  toggle: () => void
}

const STORAGE_KEY = 'om-intel-sidebar-open'

export function useSidebar(options: UseSidebarOptions = {}): UseSidebarReturn {
  const { defaultOpen = true, storageKey = STORAGE_KEY } = options
  
  const [isOpen, setIsOpenInternal] = useState(defaultOpen)

  // Load saved state from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved !== null) {
        setIsOpenInternal(JSON.parse(saved))
      }
    } catch (error) {
      console.warn('Failed to load sidebar state from localStorage:', error)
    }
  }, [storageKey])

  // Save state to localStorage when it changes
  const setIsOpen = useCallback((open: boolean) => {
    setIsOpenInternal(open)
    
    try {
      localStorage.setItem(storageKey, JSON.stringify(open))
    } catch (error) {
      console.warn('Failed to save sidebar state to localStorage:', error)
    }
  }, [storageKey])

  const toggle = useCallback(() => {
    setIsOpen(!isOpen)
  }, [isOpen, setIsOpen])

  return {
    isOpen,
    setIsOpen,
    toggle
  }
}