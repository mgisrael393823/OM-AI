/**
 * Isomorphic useLayoutEffect hook
 * 
 * Uses useLayoutEffect on client-side for DOM manipulation before paint
 * Uses useEffect on server-side to avoid hydration warnings
 * 
 * This prevents hydration mismatches while maintaining performance benefits
 * of useLayoutEffect for preventing FOUC (Flash of Unstyled Content)
 */

import { useEffect, useLayoutEffect } from 'react'

// Check if we're in a browser environment
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

export { useIsomorphicLayoutEffect }
export default useIsomorphicLayoutEffect