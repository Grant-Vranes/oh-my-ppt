import { useEffect, useState } from 'react'
import { Button } from '@renderer/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/Card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/Dialog'
import { Input } from '@renderer/components/ui/Input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/Select'
import { ipc, type FontListItem, type FontRole, type FontScript } from '@renderer/lib/ipc'
import { useToastStore } from '@renderer/store'
import { useT } from '@renderer/i18n'
import { FolderOpen, Loader2, Trash2, Type, Upload, X } from 'lucide-react'

const roleClassName = (role: FontRole[]): string => {
  const hasTitle = role.includes('title')
  const hasBody = role.includes('body')
  if (hasTitle && hasBody) return 'border-[#bad8b7]/80 bg-[#eef9ec] text-[#4a7a46]'
  if (hasTitle) return 'border-[#d6c08d]/80 bg-[#ffffff] text-[#7c6a4c]'
  if (hasBody) return 'border-[#bdd2e6]/80 bg-[#eef6ff] text-[#3e6685]'
  return 'border-[#d5cfc5]/60 bg-[#f9f6f1] text-[#6b6560]'
}

const scriptsClassName = (scripts: FontScript[]): string => {
  const hasLatin = scripts.includes('latin')
  const hasCjk = scripts.includes('cjk')
  if (hasLatin && hasCjk) return 'border-[#c8b8d4]/80 bg-[#f4eff8] text-[#5e4a72]'
  if (hasCjk) return 'border-[#d6c08d]/80 bg-[#ffffff] text-[#7c6a4c]'
  if (hasLatin) return 'border-[#c5d4c0]/80 bg-[#f0f6ec] text-[#4a6940]'
  return 'border-[#d5cfc5]/60 bg-[#f9f6f1] text-[#6b6560]'
}

const roleFromValue = (value: string): FontRole[] => {
  if (value === 'title') return ['title']
  if (value === 'body') return ['body']
  return ['title', 'body']
}

const scriptsFromValue = (value: string): FontScript[] => {
  if (value === 'latin') return ['latin']
  if (value === 'cjk') return ['cjk']
  return ['latin', 'cjk']
}

const previewText = (scripts: FontScript[]): string => {
  const hasCjk = scripts.includes('cjk')
  if (hasCjk) return 'Aa 永远好奇'
  return 'Aa Always Curious'
}

const WEIGHT_FROM_NAME: Record<string, string> = {
  thin: '100',
  hairline: '100',
  extralight: '200',
  ultralight: '200',
  light: '300',
  regular: '400',
  normal: '400',
  medium: '500',
  semibold: '600',
  demibold: '600',
  bold: '700',
  extrabold: '800',
  ultrabold: '800',
  black: '900',
  heavy: '900'
}

const guessWeightAndStyle = (
  filePath: string
): { weight: string; style: 'normal' | 'italic' } => {
  const name = filePath.split(/[\\/]/).pop()?.replace(/\.woff2$/i, '') || ''
  const isItalic = /\bitalic\b/i.test(name)
  const weight = Object.entries(WEIGHT_FROM_NAME).find(([key]) => {
    const re = new RegExp(`(?:[-_]|\\b)${key}(?:[-_]|\\b|$)`, 'i')
    return re.test(name)
  })?.[1] || '400'
  return { weight, style: isItalic ? 'italic' : 'normal' }
}

export function FontsPage(): React.JSX.Element {
  const { success, error } = useToastStore()
  const t = useT()
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [previewReady, setPreviewReady] = useState(false)
  const [googleFonts, setGoogleFonts] = useState<FontListItem[]>([])
  const [userFonts, setUserFonts] = useState<FontListItem[]>([])
  const [family, setFamily] = useState('')
  const [category, setCategory] = useState('sans')
  const [role, setRole] = useState('both')
  const [scripts, setScripts] = useState('mixed')
  const [fileEntries, setFileEntries] = useState<
    Array<{ path: string; weight: string; style: 'normal' | 'italic' }>
  >([])
  const [uploadOpen, setUploadOpen] = useState(false)

  const roleToLabel = (r: FontRole[]): string => {
    const hasTitle = r.includes('title')
    const hasBody = r.includes('body')
    if (hasTitle && hasBody) return t('fonts.roleBoth')
    if (hasTitle) return t('fonts.roleTitle')
    if (hasBody) return t('fonts.roleBody')
    return t('fonts.roleNone')
  }

  const scriptsToLabel = (s: FontScript[]): string => {
    const hasLatin = s.includes('latin')
    const hasCjk = s.includes('cjk')
    if (hasLatin && hasCjk) return t('fonts.scriptsMixed')
    if (hasCjk) return t('fonts.scriptsCjk')
    if (hasLatin) return t('fonts.scriptsLatin')
    return t('fonts.scriptsNone')
  }

  const categoryLabels: Record<string, string> = {
    sans: t('fonts.categorySans'),
    serif: t('fonts.categorySerif'),
    display: t('fonts.categoryDisplay'),
    handwriting: t('fonts.categoryHandwriting'),
    monospace: t('fonts.categoryMonospace')
  }

  const loadFonts = async (): Promise<void> => {
    setLoading(true)
    try {
      const result = await ipc.listFonts()
      setGoogleFonts(result.googleFonts)
      setUserFonts(result.userFonts)
    } catch (err) {
      error(t('fonts.loadFailed'), {
        description: err instanceof Error ? err.message : t('common.retryLater')
      })
    } finally {
      setLoading(false)
    }
  }

  const loadPreviewCss = async (): Promise<void> => {
    try {
      const css = await ipc.loadFontPreviewCss()
      if (!css) return
      const id = 'font-preview-styles'
      let el = document.getElementById(id) as HTMLStyleElement | null
      if (!el) {
        el = document.createElement('style')
        el.id = id
        document.head.appendChild(el)
      }
      el.textContent = css
      setPreviewReady(true)
    } catch {
      // Preview is non-critical
    }
  }

  useEffect(() => {
    void loadFonts()
    void loadPreviewCss()
  }, [])

  const handleChooseFiles = async (): Promise<void> => {
    try {
      const result = await ipc.chooseFontFiles()
      if (!result.canceled) {
        setFileEntries(
          (result.filePaths || []).map((p) => ({ path: p, ...guessWeightAndStyle(p) }))
        )
      }
    } catch (err) {
      error(t('fonts.chooseFailed'), {
        description: err instanceof Error ? err.message : t('common.retryLater')
      })
    }
  }

  const updateFileEntry = (
    index: number,
    field: 'weight' | 'style',
    value: string
  ): void => {
    setFileEntries((prev) =>
      prev.map((e, i) =>
        i === index
          ? { ...e, [field]: field === 'style' ? (value as 'normal' | 'italic') : value }
          : e
      )
    )
  }

  const removeFileEntry = (index: number): void => {
    setFileEntries((prev) => prev.filter((_, i) => i !== index))
  }

  const handleUpload = async (): Promise<void> => {
    const familyText = family.trim()
    if (!familyText) {
      error(t('fonts.fillFamily'))
      return
    }
    if (fileEntries.length === 0) {
      error(t('fonts.selectFile'))
      return
    }
    if (!scripts) {
      error(t('fonts.selectScripts'))
      return
    }
    setUploading(true)
    try {
      await ipc.uploadFont({
        family: familyText,
        category,
        role: roleFromValue(role),
        scripts: scriptsFromValue(scripts),
        files: fileEntries.map((entry) => {
          const w = Number.parseInt(entry.weight, 10)
          return {
            path: entry.path,
            weight: Number.isFinite(w) ? w : 400,
            style: entry.style
          }
        })
      })
      success(t('fonts.uploaded'))
      setUploadOpen(false)
      setFamily('')
      setCategory('sans')
      setRole('both')
      setScripts('')
      setFileEntries([])
      await loadFonts()
      void loadPreviewCss()
    } catch (err) {
      error(t('fonts.uploadFailed'), {
        description: err instanceof Error ? err.message : t('common.retryLater')
      })
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (font: FontListItem): Promise<void> => {
    try {
      await ipc.deleteFont(font.id)
      success(t('fonts.deleted'))
      await loadFonts()
      void loadPreviewCss()
    } catch (err) {
      error(t('fonts.deleteFailed'), {
        description: err instanceof Error ? err.message : t('common.retryLater')
      })
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-6">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{t('fonts.eyebrow')}</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="organic-serif text-[32px] font-semibold leading-none text-[#3e4a32]">
            {t('fonts.title')}
          </h1>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void ipc.revealFontsFolder()}>
              <FolderOpen className="mr-2 h-4 w-4" />
              {t('fonts.openFolder')}
            </Button>
            <Button size="sm" className="border-[#7ea06f]/45" onClick={() => setUploadOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              {t('fonts.upload')}
            </Button>
          </div>
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">
          {t('fonts.description')}
        </p>
      </div>

      <div className="space-y-4">
        {/* Upload dialog */}
        <Dialog open={uploadOpen} onOpenChange={(open) => {
          setUploadOpen(open)
          if (!open) {
            setFamily('')
            setCategory('sans')
            setRole('both')
            setScripts('mixed')
            setFileEntries([])
          }
        }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t('fonts.uploadDialogTitle')}</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground/70">
                {t('fonts.uploadDialogDescription')}{' '}
                {t('fonts.uploadDialogDownloadPre')}{' '}
                <a
                  href="https://gwfh.mranftl.com/fonts"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#5a7a4e] underline underline-offset-2 hover:text-[#3e5a34]"
                >
                  {t('fonts.googleFontsHelperLink')}
                </a>{' '}
                {t('fonts.uploadDialogDownloadPost')}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-[1fr_160px_160px]">
              <div>
                <label className="mb-1 block text-sm font-medium">{t('fonts.familyName')}</label>
                <Input
                  placeholder={t('fonts.familyNamePlaceholder')}
                  value={family}
                  onChange={(e) => setFamily(e.target.value)}
                  className="h-9"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t('fonts.role')}</label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">{t('fonts.roleBoth')}</SelectItem>
                    <SelectItem value="title">{t('fonts.roleTitle')}</SelectItem>
                    <SelectItem value="body">{t('fonts.roleBody')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t('fonts.scripts')}</label>
                <Select value={scripts} onValueChange={setScripts}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder={t('fonts.scriptsPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="latin">{t('fonts.scriptsLatin')}</SelectItem>
                    <SelectItem value="cjk">{t('fonts.scriptsCjk')}</SelectItem>
                    <SelectItem value="mixed">{t('fonts.scriptsMixed')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-40">
                <label className="mb-1 block text-sm font-medium">{t('fonts.category')}</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(categoryLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 border-[#7ea06f]/45"
                onClick={() => void handleChooseFiles()}
              >
                <Type className="mr-1.5 h-3.5 w-3.5" />
                {t('fonts.chooseFiles')}
              </Button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e4e4e7]/60 text-xs text-muted-foreground">
                  <th className="pb-1.5 text-left font-medium">File</th>
                  <th className="pb-1.5 text-center font-medium" style={{ width: 72 }}>Font Weight</th>
                  <th className="pb-1.5 text-center font-medium" style={{ width: 110 }}>Style</th>
                  <th className="pb-1.5 font-medium" style={{ width: 32 }}></th>
                </tr>
              </thead>
              {fileEntries.length > 0 && (
                <tbody>
                  {fileEntries.map((entry, i) => (
                    <tr key={entry.path} className="border-b border-[#e4e4e7]/30 align-middle">
                      <td className="py-1.5 pr-2">
                        <span className="block truncate text-[#33402a]">
                          {entry.path.split(/[\\/]/).pop() || entry.path}
                        </span>
                      </td>
                      <td className="py-1.5">
                        <Input
                          value={entry.weight}
                          inputMode="numeric"
                          onChange={(e) => updateFileEntry(i, 'weight', e.target.value)}
                          className="h-7 w-[64px] text-center text-sm"
                        />
                      </td>
                      <td className="py-1.5 text-center">
                        <Select
                          value={entry.style}
                          onValueChange={(v) => updateFileEntry(i, 'style', v)}
                        >
                          <SelectTrigger className="h-7 w-[110px] text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="normal">Normal</SelectItem>
                            <SelectItem value="italic">Italic</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-1.5 text-center">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeFileEntry(i)}
                          aria-label={t('fonts.removeFile')}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
            <div className="flex justify-end pt-2">
              <Button
                type="button"
                size="sm"
                className="h-9 min-w-[120px]"
                onClick={() => void handleUpload()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                )}
                {t('fonts.uploadButton')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* User fonts */}
        <Card>
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base">{t('fonts.uploadedFonts')}</CardTitle>
            {userFonts.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t('fonts.fontCount', { count: userFonts.length })}
              </p>
            )}
          </CardHeader>
          <CardContent className="p-5 pt-0">
            {loading ? (
              <p className="py-4 text-center text-sm text-muted-foreground">{t('fonts.loading')}</p>
            ) : userFonts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#e4e4e7]/85 bg-[#ffffff]/70 py-6 text-center text-sm text-muted-foreground">
                {t('fonts.emptyUpload')}
              </div>
            ) : (
              <div className="space-y-2">
                {userFonts.map((font) => (
                  <div
                    key={font.id}
                    className="group flex items-center justify-between gap-3 rounded-lg border border-[#e4e4e7]/80 bg-[#ffffff]/78 p-3 transition-all hover:border-[#c4b89e]/90 hover:shadow-[0_8px_20px_rgba(90,72,52,0.1)]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[#33402a]">{font.family}</p>
                      {previewReady && (
                        <p
                          className="mt-1 truncate text-lg text-[#5a6650]/80"
                          style={{ fontFamily: `"${font.family}", sans-serif` }}
                        >
                          {previewText(font.scripts)}
                        </p>
                      )}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className={`rounded-md border px-1.5 py-0.5 font-medium ${roleClassName(font.role)}`}>
                          {roleToLabel(font.role)}
                        </span>
                        <span className={`rounded-md border px-1.5 py-0.5 font-medium ${scriptsClassName(font.scripts)}`}>
                          {scriptsToLabel(font.scripts)}
                        </span>
                        <span className="rounded-md border border-[#d5cfc5]/60 bg-[#f9f6f1] px-1.5 py-0.5 text-[#6b6560]">
                          {categoryLabels[font.category] || font.category}
                        </span>
                        <span className="text-muted-foreground">
                          {t('fonts.fileCount', { count: font.files?.length || 0 })}
                        </span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => void handleDelete(font)}
                      aria-label={t('fonts.deleteLabel', { family: font.family })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Google fonts */}
        <Card>
          <CardHeader className="p-5 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">{t('fonts.googleFontsTitle')}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('fonts.googleFontsDesc')}
                </p>
              </div>
              <span className="rounded-full bg-[#e9efde] px-2.5 py-0.5 text-[11px] font-medium text-[#506141]">
                {googleFonts.length}
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="max-h-[460px] overflow-auto pr-1">
              <div className="grid gap-2 sm:grid-cols-2">
                {googleFonts.map((font) => (
                  <div
                    key={font.id}
                    className="rounded-lg border border-[#e4e4e7]/60 bg-[#ffffff]/50 px-3 py-2.5 transition-colors hover:border-[#c4b89e]/80 hover:bg-[#ffffff]"
                  >
                    {previewReady && (
                      <p
                        className="truncate text-lg text-[#5a6650]/80"
                        style={{ fontFamily: `"${font.family}", sans-serif` }}
                      >
                        {previewText(font.scripts)}
                      </p>
                    )}
                    <p className="text-sm font-medium text-[#33402a]">{font.family}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className={`rounded-md border px-1.5 py-0.5 font-medium ${roleClassName(font.role)}`}>
                        {roleToLabel(font.role)}
                      </span>
                      <span className={`rounded-md border px-1.5 py-0.5 font-medium ${scriptsClassName(font.scripts)}`}>
                        {scriptsToLabel(font.scripts)}
                      </span>
                      <span className="text-muted-foreground">{font.category}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
