import type { Config } from "tailwindcss";

const config: Config = {
    darkMode: ["class"],
    content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  // Development optimizations
  ...(process.env.NODE_ENV === 'development' && {
    // Enable JIT compilation for faster builds
    mode: 'jit',
    // Watch additional files for changes
    safelist: [
      // Preserve commonly used dynamic classes
      'grid-cols-1', 'grid-cols-2', 'grid-cols-3',
      'gap-1', 'gap-2', 'gap-3', 'gap-4',
      'p-1', 'p-2', 'p-3', 'p-4',
      'm-1', 'm-2', 'm-3', 'm-4',
    ],
  }),
  theme: {
  	extend: {
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			},
  			// Chat-specific design tokens
  			chat: {
  				user: {
  					bg: 'hsl(var(--chat-user-bg))',
  					fg: 'hsl(var(--chat-user-fg))'
  				},
  				assistant: {
  					bg: 'hsl(var(--chat-assistant-bg))',
  					fg: 'hsl(var(--chat-assistant-fg))'
  				},
  				timestamp: 'hsl(var(--chat-timestamp))',
  				divider: 'hsl(var(--chat-divider))',
  				hover: 'hsl(var(--chat-hover-bg))'
  			},
  			avatar: {
  				user: {
  					bg: 'hsl(var(--avatar-user-bg))',
  					fg: 'hsl(var(--avatar-user-fg))'
  				},
  				assistant: {
  					bg: 'hsl(var(--avatar-assistant-bg))',
  					fg: 'hsl(var(--avatar-assistant-fg))'
  				}
  			},
  			status: {
  				success: 'hsl(var(--status-success))',
  				warning: 'hsl(var(--status-warning))',
  				error: 'hsl(var(--status-error))',
  				info: 'hsl(var(--status-info))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
