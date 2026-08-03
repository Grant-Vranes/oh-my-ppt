import { useEffect, useRef, useState } from 'react'
import { Chrome, ChromeInputType, type ColorResult } from '@uiw/react-color'
import { Popover, PopoverContent, PopoverTrigger } from './Popover'

interface ColorPickerProps {
  value: string | undefined
  onChange: (value: string) => void
  onCommit?: (value: string) => void
  className?: string
  allowAlpha?: boolean
  ariaLabel?: string
}

function parseColor(value: string | undefined): { hex: string; alpha: number } {
  if (!value) return { hex: '#000000', alpha: 1 }

  const rgbaMatch = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\)$/)
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1])
    const g = parseInt(rgbaMatch[2])
    const b = parseInt(rgbaMatch[3])
    const a = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1
    const hex = '#' + [r, g, b].map((color) => color.toString(16).padStart(2, '0')).join('')
    return { hex, alpha: Math.min(1, Math.max(0, Math.round(a * 100) / 100)) }
  }

  if (value.startsWith('#')) {
    if (value.length === 9) {
      const hex = value.slice(0, 7)
      const alpha = Math.round((parseInt(value.slice(7, 9), 16) / 255) * 100) / 100
      return { hex, alpha }
    }
    return { hex: value.slice(0, 7), alpha: 1 }
  }

  return { hex: '#000000', alpha: 1 }
}

function toRgbaString(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function formatColor(hex: string, alpha: number): string {
  if (alpha >= 1) return hex
  return toRgbaString(hex, alpha)
}

export function ColorPicker({
  value,
  onChange,
  onCommit,
  className,
  allowAlpha = true,
  ariaLabel
}: ColorPickerProps): React.JSX.Element {
  const { hex, alpha } = parseColor(value)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ hex, alpha: allowAlpha ? alpha : 1 })
  const latestColorRef = useRef(formatColor(hex, allowAlpha ? alpha : 1))

  useEffect(() => {
    const parsed = parseColor(value)
    const next = { hex: parsed.hex, alpha: allowAlpha ? parsed.alpha : 1 }
    setDraft(next)
    latestColorRef.current = formatColor(next.hex, next.alpha)
  }, [allowAlpha, value])

  const handleChange = (color: ColorResult): void => {
    const next = {
      hex: color.hex.toLowerCase(),
      alpha: allowAlpha ? Math.min(1, Math.max(0, Math.round(color.rgba.a * 100) / 100)) : 1
    }
    const nextColor = formatColor(next.hex, next.alpha)
    setDraft(next)
    latestColorRef.current = nextColor
    onChange(nextColor)
  }

  const displayColor = formatColor(hex, allowAlpha ? alpha : 1)

  return (
    <div className={className}>
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen)
          if (!nextOpen) onCommit?.(latestColorRef.current)
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={ariaLabel}
            title={value}
            className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-[#d7cbb7]/70 bg-[#fffdf8] p-1 transition-colors hover:border-[#879b71] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5d6b4d]"
          >
            <span
              className="block h-full w-full rounded-[3px] shadow-[inset_0_0_0_1px_rgba(30,38,25,0.12)]"
              style={{
                backgroundColor: displayColor,
                backgroundImage:
                  allowAlpha && alpha < 1
                    ? 'linear-gradient(45deg, #c9c9c9 25%, transparent 25%), linear-gradient(-45deg, #c9c9c9 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #c9c9c9 75%), linear-gradient(-45deg, transparent 75%, #c9c9c9 75%)'
                    : undefined,
                backgroundSize: allowAlpha && alpha < 1 ? '6px 6px' : undefined,
                backgroundPosition: allowAlpha && alpha < 1 ? '0 0, 0 3px, 3px -3px, -3px 0' : undefined
              }}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="color-picker-popover w-[244px] rounded-lg border border-[#d7cbb7]/70 bg-[#fffdf8] p-2 shadow-[0_14px_34px_-12px_rgba(66,53,36,0.3)]"
          align="start"
          sideOffset={8}
        >
          <Chrome
            color={allowAlpha ? toRgbaString(draft.hex, draft.alpha) : draft.hex}
            inputType={ChromeInputType.HEXA}
            showAlpha={allowAlpha}
            showEyeDropper
            className="color-picker-chrome"
            onChange={handleChange}
          />
          <style>{`
            .color-picker-popover .color-picker-chrome {
              width: 100% !important;
              border-radius: 6px !important;
              overflow: hidden;
              --github-background-color: #fffdf8;
              --github-border: 0;
              --github-box-shadow: none;
              --chrome-arrow-fill: #6f7d62;
              --chrome-arrow-background-color: #f2ece0;
              --editable-input-label-color: #7b735f;
              --editable-input-color: #3e4a32;
              --editable-input-box-shadow: #d7cbb7 0 0 0 1px inset;
            }
            .color-picker-popover .w-color-saturation {
              border-radius: 5px 5px 0 0;
              cursor: crosshair;
            }
            .color-picker-popover .w-color-hue,
            .color-picker-popover .w-color-alpha {
              cursor: ew-resize;
            }
            .color-picker-popover .w-color-chrome svg,
            .color-picker-popover .w-color-chrome button,
            .color-picker-popover .w-color-chrome input {
              cursor: pointer;
            }
            .color-picker-popover .w-color-chrome input {
              border-radius: 4px !important;
            }
          `}</style>
        </PopoverContent>
      </Popover>
    </div>
  )
}
