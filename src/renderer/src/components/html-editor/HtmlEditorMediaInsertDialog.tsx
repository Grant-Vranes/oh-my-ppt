import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ImagePlus, Link, Play, Upload, Video } from 'lucide-react'
import { useT } from '@renderer/i18n'
import { ipc } from '@renderer/lib/ipc'
import { useToastStore } from '@renderer/store'
import { localAssetUrl } from '@shared/local-asset'
import { cn } from '@renderer/lib/utils'
import { useHtmlEditorStore } from '../../store/htmlEditorStore'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/Dialog'
import type { useHtmlElementInsertion } from './useHtmlElementInsertion'

type MediaType = 'image' | 'video'
type MediaSource = 'library' | 'external'
type Insertion = ReturnType<typeof useHtmlElementInsertion>
type MediaAsset = {
  fileName: string
  filePath: string
  relativePath: string
  url: string
}

function CheckIcon({ checked }: { checked: boolean }): ReactNode {
  return (
    <span
      className={cn(
        'flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all duration-200',
        checked
          ? 'border-[#6f8159] bg-[#6f8159] text-white'
          : 'border-[#e4e4e7]/80 bg-white/85 text-transparent group-hover:border-[#b5c9a0]'
      )}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path
          d="M2.5 6L5 8.5L9.5 3.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

function normalizeExternalMediaUrl(value: string): string | null {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

export function HtmlEditorMediaInsertDialog({
  mediaType,
  insertion,
  onClose
}: {
  mediaType: MediaType | null
  insertion: Insertion
  onClose: () => void
}): ReactNode {
  const t = useT()
  const docId = useHtmlEditorStore((state) => state.docId)
  const toastError = useToastStore((state) => state.error)
  const [source, setSource] = useState<MediaSource>('library')
  const [url, setUrl] = useState('')
  const [urlError, setUrlError] = useState(false)
  const [inserting, setInserting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [loadingAssets, setLoadingAssets] = useState(false)
  const [assets, setAssets] = useState<MediaAsset[]>([])
  const [selectedAssetPath, setSelectedAssetPath] = useState<string | null>(null)
  const [playingPath, setPlayingPath] = useState<string | null>(null)

  const loadAssets = useCallback(async (): Promise<MediaAsset[]> => {
    if (!docId || !mediaType) {
      setAssets([])
      return []
    }
    setLoadingAssets(true)
    try {
      const result = await ipc.listHtmlEditorMedia({ docId, mediaType })
      setAssets(result.assets)
      return result.assets
    } catch (error) {
      setAssets([])
      toastError(error instanceof Error ? error.message : t('common.retryLater'))
      return []
    } finally {
      setLoadingAssets(false)
    }
  }, [docId, mediaType, t, toastError])

  useEffect(() => {
    if (!mediaType) {
      setSource('library')
      setUrl('')
      setUrlError(false)
      setInserting(false)
      setUploading(false)
      setLoadingAssets(false)
      setAssets([])
      setSelectedAssetPath(null)
      setPlayingPath(null)
      return
    }
    if (source === 'library') void loadAssets()
  }, [loadAssets, mediaType, source])

  const addMedia = async (src: string): Promise<boolean> => {
    if (mediaType === 'image') return insertion.addImage(src)
    if (mediaType === 'video') return insertion.addVideo(src)
    return false
  }

  const chooseLocalFile = async (): Promise<void> => {
    if (!docId || !mediaType || uploading || inserting) return
    setUploading(true)
    try {
      const result = await ipc.chooseAndImportHtmlMedia({ docId, mediaType })
      if (result.cancelled) return
      const nextAssets = await loadAssets()
      setSelectedAssetPath(
        nextAssets.some((asset) => asset.relativePath === result.relativePath)
          ? result.relativePath
          : null
      )
    } catch (error) {
      toastError(error instanceof Error ? error.message : t('common.retryLater'))
    } finally {
      setUploading(false)
    }
  }

  const insertExternalUrl = async (): Promise<void> => {
    const normalizedUrl = normalizeExternalMediaUrl(url)
    if (!normalizedUrl) {
      setUrlError(true)
      return
    }
    setInserting(true)
    try {
      if (await addMedia(normalizedUrl)) onClose()
      else toastError(t('htmlEditor.insertMediaFailed'))
    } catch (error) {
      toastError(error instanceof Error ? error.message : t('htmlEditor.insertMediaFailed'))
    } finally {
      setInserting(false)
    }
  }

  const insertSelectedAsset = async (): Promise<void> => {
    const asset = assets.find((item) => item.relativePath === selectedAssetPath)
    if (!asset) return
    setInserting(true)
    try {
      if (await addMedia(asset.url)) onClose()
      else toastError(t('htmlEditor.insertMediaFailed'))
    } catch (error) {
      toastError(error instanceof Error ? error.message : t('htmlEditor.insertMediaFailed'))
    } finally {
      setInserting(false)
    }
  }

  const Icon = mediaType === 'video' ? Video : ImagePlus
  const title = mediaType === 'video' ? t('htmlEditor.insertVideo') : t('htmlEditor.insertImage')

  return (
    <Dialog open={mediaType !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t('htmlEditor.mediaSourceHint')}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 rounded-md bg-[#eee6d8] p-1">
          {(
            [
              ['library', ImagePlus, 'htmlEditor.mediaLibrary'],
              ['external', Link, 'htmlEditor.mediaSourceExternal']
            ] as const
          ).map(([value, SourceIcon, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setSource(value)
                setUrlError(false)
              }}
              className={`flex h-9 items-center justify-center gap-1.5 rounded text-sm transition-colors ${
                source === value
                  ? 'bg-white font-medium text-[#3e4a32] shadow-sm'
                  : 'text-[#766d5e] hover:bg-white/60'
              }`}
            >
              <SourceIcon className="h-3.5 w-3.5" />
              {t(label)}
            </button>
          ))}
        </div>

        {source === 'library' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm leading-5 text-[#6f6658]">{t('htmlEditor.localMediaHint')}</p>
              <button
                type="button"
                disabled={uploading || inserting || !docId}
                onClick={() => void chooseLocalFile()}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-[#5d6b4d] px-3 text-sm font-medium text-white hover:bg-[#4b593d] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Upload className="h-3.5 w-3.5" />
                {t('htmlEditor.chooseMediaFile')}
              </button>
            </div>

            {loadingAssets ? (
              <div className="flex h-48 items-center justify-center text-sm text-[#6f6658]">
                {t('common.loading')}
              </div>
            ) : assets.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-[#cfc2aa] bg-[#fffdf7] text-sm text-[#6f6658]">
                <Icon className="h-6 w-6 text-[#6f8159]" />
                {t('htmlEditor.mediaLibraryEmpty')}
              </div>
            ) : (
              <div className="grid max-h-[340px] grid-cols-3 gap-2 overflow-y-auto p-1">
                {assets.map((asset) => {
                  const selected = selectedAssetPath === asset.relativePath
                  return (
                    <div
                      key={asset.relativePath}
                      className={cn(
                        'group overflow-hidden rounded-lg border-2 transition-all duration-200',
                        selected
                          ? 'border-[#6f8159] ring-2 ring-[#6f8159]/40 shadow-md shadow-[#6f8159]/20'
                          : 'border-[#e4e4e7]/60 hover:border-[#b5c9a0] hover:shadow-md hover:shadow-[#c7d9b4]/40'
                      )}
                    >
                      <div className="relative aspect-[4/3]">
                        {mediaType === 'video' ? (
                          playingPath === asset.relativePath ? (
                            <video
                              src={localAssetUrl(asset.filePath)}
                              controls
                              autoPlay
                              playsInline
                              className="h-full w-full bg-black"
                            />
                          ) : (
                            <>
                              <video
                                src={localAssetUrl(asset.filePath)}
                                preload="metadata"
                                muted
                                playsInline
                                className="h-full w-full object-cover bg-black"
                              />
                              <button
                                type="button"
                                onClick={() => setPlayingPath(asset.relativePath)}
                                className="absolute inset-0 flex items-center justify-center bg-black/15 transition-colors hover:bg-black/25"
                              >
                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/80 shadow backdrop-blur-sm">
                                  <Play className="h-4 w-4 translate-x-px text-[#3e4a32]" />
                                </span>
                              </button>
                            </>
                          )
                        ) : (
                          <img
                            src={localAssetUrl(asset.filePath)}
                            alt={asset.fileName}
                            className={cn(
                              'h-full w-full object-cover transition-transform duration-200',
                              !selected && 'group-hover:scale-105'
                            )}
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedAssetPath(selected ? null : asset.relativePath)}
                          className="absolute right-1.5 top-1.5 z-10 cursor-pointer"
                          title={selected ? t('common.cancel') : t('htmlEditor.insertMedia')}
                        >
                          <CheckIcon checked={selected} />
                        </button>
                      </div>
                      <div className="truncate bg-[#faf6ef] px-1.5 py-1 text-[10px] text-[#6f6658]">
                        {asset.fileName}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <label className="sr-only" htmlFor="html-editor-media-url">
              {t('htmlEditor.mediaSourceExternal')}
            </label>
            <input
              id="html-editor-media-url"
              type="url"
              value={url}
              autoFocus
              onChange={(event) => {
                setUrl(event.target.value)
                setUrlError(false)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void insertExternalUrl()
              }}
              placeholder={t('htmlEditor.mediaUrlPlaceholder')}
              className={`h-10 w-full rounded-md border bg-white px-3 text-sm text-[#3e4a32] outline-none placeholder:text-[#9a907f] focus:ring-2 focus:ring-[#8fbc8f]/50 ${
                urlError ? 'border-[#b65c50]' : 'border-[#cfc2aa]'
              }`}
            />
            {urlError ? (
              <p className="text-xs text-[#a44c43]">{t('htmlEditor.invalidMediaUrl')}</p>
            ) : null}
          </div>
        )}

        {source === 'library' ? (
          <DialogFooter>
            <button
              type="button"
              disabled={!selectedAssetPath || inserting}
              onClick={() => void insertSelectedAsset()}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#5d6b4d] px-3 text-sm font-medium text-white hover:bg-[#4b593d] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon className="h-3.5 w-3.5" />
              {t('htmlEditor.insertMedia')}
            </button>
          </DialogFooter>
        ) : (
          <DialogFooter>
            <button
              type="button"
              disabled={inserting}
              onClick={() => void insertExternalUrl()}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#5d6b4d] px-3 text-sm font-medium text-white hover:bg-[#4b593d]"
            >
              <Icon className="h-3.5 w-3.5" />
              {t('htmlEditor.insertMedia')}
            </button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
