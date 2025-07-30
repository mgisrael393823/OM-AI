import { Inter, Noto_Sans, Fira_Code } from 'next/font/google'

// Inter - for headings and UI elements
export const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  weight: ['400', '500', '600', '700'],
  preload: true,
})

// Noto Sans - for body text and content  
export const notoSans = Noto_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-noto-sans',
  weight: ['400', '500', '600', '700'],
  preload: true,
})

// Fira Code - for monospaced content (code, input)
export const firaCode = Fira_Code({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-fira-code',
  weight: ['400', '500', '600'],
  preload: true,
})

// Debug: Log font configuration in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  console.log('🔤 Typography system loaded with fonts:', {
    inter: '✅ Inter',
    notoSans: '✅ Noto Sans', 
    firaCode: '✅ Fira Code'
  })
}

// Combined font class names for easy application
export const fontVariables = `${inter.variable} ${notoSans.variable} ${firaCode.variable}`

// Utility classes for semantic usage
export const fontClasses = {
  // Headers and UI elements
  heading: 'font-inter font-semibold', // Inter 600
  nav: 'font-inter font-medium',       // Inter 500
  label: 'font-inter font-normal',     // Inter 400
  
  // Body text and content
  body: 'font-noto font-normal',       // Noto Sans 400
  bodyEmphasis: 'font-noto font-semibold', // Noto Sans 600
  
  // Monospaced content
  mono: 'font-fira font-normal',       // Fira Code 400
  input: 'font-fira font-normal',      // Fira Code 400
} as const

// Export individual font objects for direct usage
export { inter as interFont, notoSans as notoSansFont, firaCode as firaCodeFont }