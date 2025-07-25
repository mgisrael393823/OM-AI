import { useState, useEffect, useCallback } from 'react'

export type SidebarState = 'collapsed' | 'normal' | 'expanded'
export type DeviceType = 'mobile' | 'tablet' | 'desktop'

interface UseSidebarOptions {
  defaultState?: SidebarState
  storageKey?: string
}

interface UseSidebarReturn {
  sidebarState: SidebarState
  sidebarOpen: boolean
  deviceType: DeviceType
  setSidebarState: (state: SidebarState) => void
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  collapseSidebar: () => void
  expandSidebar: () => void
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
  sidebarWidth: number
}

const STORAGE_KEY = 'om-intel-sidebar-state'
const BREAKPOINTS = {
  mobile: 768,
  tablet: 1024
}

const SIDEBAR_WIDTHS = {
  collapsed: 64,
  normal: 256,
  expanded: 320
}

export function useSidebar(options: UseSidebarOptions = {}): UseSidebarReturn {
  const { defaultState = 'normal', storageKey = STORAGE_KEY } = options
  
  const [sidebarState, setSidebarStateInternal] = useState<SidebarState>(defaultState)
  const [sidebarOpen, setSidebarOpenInternal] = useState(false)
  const [deviceType, setDeviceType] = useState<DeviceType>('desktop')

  // Determine device type based on window width
  const updateDeviceType = useCallback(() => {
    if (typeof window === 'undefined') return
    
    const width = window.innerWidth
    if (width < BREAKPOINTS.mobile) {
      setDeviceType('mobile')
    } else if (width < BREAKPOINTS.tablet) {
      setDeviceType('tablet')
    } else {
      setDeviceType('desktop')
    }
  }, [])

  // Load saved state from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsedState = JSON.parse(saved)
        if (['collapsed', 'normal', 'expanded'].includes(parsedState.sidebarState)) {
          setSidebarStateInternal(parsedState.sidebarState)
        }
        if (typeof parsedState.sidebarOpen === 'boolean') {
          setSidebarOpenInternal(parsedState.sidebarOpen)
        }
      }
    } catch (error) {
      console.warn('Failed to load sidebar state from localStorage:', error)
    }
  }, [storageKey])

  // Set up window resize listener
  useEffect(() => {
    updateDeviceType()
    
    const handleResize = () => {
      updateDeviceType()
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [updateDeviceType])

  // Auto-adjust sidebar behavior based on device type
  useEffect(() => {
    if (deviceType === 'mobile' || deviceType === 'tablet') {
      // Mobile & Tablet: Always start closed (overlay behavior)
      setSidebarOpenInternal(false)
    } else if (deviceType === 'desktop') {
      // Desktop: Default to open unless user specifically closed it
      setSidebarOpenInternal(true)
    }
  }, [deviceType])

  // Save state to localStorage when it changes
  const setSidebarState = useCallback((state: SidebarState) => {
    setSidebarStateInternal(state)
    
    try {
      const currentData = localStorage.getItem(storageKey)
      const data = currentData ? JSON.parse(currentData) : {}
      data.sidebarState = state
      localStorage.setItem(storageKey, JSON.stringify(data))
    } catch (error) {
      console.warn('Failed to save sidebar state to localStorage:', error)
    }
  }, [storageKey])

  const setSidebarOpen = useCallback((open: boolean) => {
    setSidebarOpenInternal(open)
    
    try {
      const currentData = localStorage.getItem(storageKey)
      const data = currentData ? JSON.parse(currentData) : {}
      data.sidebarOpen = open
      localStorage.setItem(storageKey, JSON.stringify(data))
    } catch (error) {
      console.warn('Failed to save sidebar open state to localStorage:', error)
    }
  }, [storageKey])

  const toggleSidebar = useCallback(() => {
    if (deviceType === 'mobile' || deviceType === 'tablet') {
      // Mobile & Tablet: Toggle overlay
      setSidebarOpen(!sidebarOpen)
    } else {
      // Desktop: Toggle between collapsed and normal
      if (sidebarState === 'collapsed') {
        setSidebarState('normal')
      } else {
        setSidebarState('collapsed')
      }
    }
  }, [deviceType, sidebarOpen, sidebarState, setSidebarOpen, setSidebarState])

  const collapseSidebar = useCallback(() => {
    if (deviceType === 'mobile' || deviceType === 'tablet') {
      setSidebarOpen(false)
    } else {
      setSidebarState('collapsed')
    }
  }, [deviceType, setSidebarOpen, setSidebarState])

  const expandSidebar = useCallback(() => {
    if (deviceType === 'mobile' || deviceType === 'tablet') {
      setSidebarOpen(true)
    } else {
      setSidebarState('expanded')
    }
  }, [deviceType, setSidebarOpen, setSidebarState])

  // Computed values
  const isMobile = deviceType === 'mobile'
  const isTablet = deviceType === 'tablet'
  const isDesktop = deviceType === 'desktop'
  const sidebarWidth = SIDEBAR_WIDTHS[sidebarState]

  return {
    sidebarState,
    sidebarOpen,
    deviceType,
    setSidebarState,
    setSidebarOpen,
    toggleSidebar,
    collapseSidebar,
    expandSidebar,
    isMobile,
    isTablet,
    isDesktop,
    sidebarWidth
  }
}