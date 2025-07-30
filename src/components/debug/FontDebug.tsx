import React, { useEffect, useState } from 'react'

export function FontDebug() {
  const [cssVariables, setCssVariables] = useState<Record<string, string>>({})
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
    
    if (typeof window !== 'undefined' && typeof getComputedStyle !== 'undefined') {
      const computedStyle = getComputedStyle(document.documentElement)
      setCssVariables({
        inter: computedStyle.getPropertyValue('--font-inter') || 'NOT FOUND',
        notoSans: computedStyle.getPropertyValue('--font-noto-sans') || 'NOT FOUND',
        firaCode: computedStyle.getPropertyValue('--font-fira-code') || 'NOT FOUND',
      })
    }
  }, [])

  // Don't render on server or in production
  if (!isClient || process.env.NODE_ENV !== 'development') {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 bg-black/90 text-white p-4 rounded-lg text-xs max-w-sm z-50 max-h-96 overflow-y-auto">
      <h3 className="font-bold mb-2 sticky top-0 bg-black/90">Font Debug Panel</h3>
      
      <div className="space-y-3">
        <div className="space-y-1">
          <div className="text-yellow-300 font-semibold">Custom Font Classes:</div>
          <div>
            <p className="font-inter font-semibold">Inter Bold: The quick brown fox</p>
            <code className="text-xs opacity-75">font-inter font-semibold</code>
          </div>
          
          <div>
            <p className="font-noto font-normal">Noto Sans: The quick brown fox</p>
            <code className="text-xs opacity-75">font-noto font-normal</code>
          </div>
          
          <div>
            <p className="font-fira font-normal">Fira Code: const hello = 'world';</p>
            <code className="text-xs opacity-75">font-fira font-normal</code>
          </div>
        </div>
        
        <div className="space-y-1">
          <div className="text-yellow-300 font-semibold">Default Overrides:</div>
          <div>
            <p className="font-sans">Default Sans: The quick brown fox</p>
            <code className="text-xs opacity-75">font-sans (should be Noto Sans)</code>
          </div>
          
          <div>
            <p className="font-mono">Default Mono: const code = true;</p>
            <code className="text-xs opacity-75">font-mono (should be Fira Code)</code>
          </div>
        </div>
        
        <div className="space-y-1">
          <div className="text-yellow-300 font-semibold">Body Text (Global):</div>
          <div>
            <p>Body Text: Should be Noto Sans by default</p>
            <code className="text-xs opacity-75">No classes - inherits from body</code>
          </div>
        </div>
      </div>
      
      <details className="mt-2">
        <summary className="cursor-pointer">CSS Variables</summary>
        <div className="mt-1 text-xs opacity-75">
          <p>--font-inter: {cssVariables.inter}</p>
          <p>--font-noto-sans: {cssVariables.notoSans}</p>
          <p>--font-fira-code: {cssVariables.firaCode}</p>
        </div>
      </details>
    </div>
  )
}