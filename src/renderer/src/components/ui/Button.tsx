import { cn } from '@renderer/lib/utils'
import React from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
}

export function Button({
  className,
  variant = 'default',
  size = 'md',
  ...props
}: ButtonProps): React.JSX.Element {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-lg font-medium leading-none transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:pointer-events-none disabled:opacity-50 disabled:grayscale',
        '[&_svg]:shrink-0',
        'cursor-pointer',
        {
          'bg-[#ea580c] text-white shadow-sm hover:bg-[#c2410c]':
            variant === 'default',
          'bg-[#18181b] text-white shadow-sm hover:bg-[#27272a]':
            variant === 'secondary',
          'bg-[#dc2626] text-white shadow-sm hover:bg-[#b91c1c]':
            variant === 'destructive',
          'soft-btn text-foreground': variant === 'outline',
          'bg-transparent text-muted-foreground hover:bg-[#f4f4f5] hover:text-accent-foreground shadow-none':
            variant === 'ghost'
        },
        {
          'h-9 px-4 text-sm': size === 'sm',
          'h-11 px-5 text-sm': size === 'md',
          'h-12 px-7 text-base': size === 'lg'
        },
        className
      )}
      {...props}
    />
  )
}
