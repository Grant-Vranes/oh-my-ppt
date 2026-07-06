import { ChevronDown, Eye, LayoutTemplate, PencilLine, Plus, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '../ui/DropdownMenu'
import type { TemplateListItem } from '@renderer/lib/ipc'
import { useT } from '@renderer/i18n'
import dayjs from 'dayjs'
import { resolveSlideSize } from '@shared/slide-size'

export function TemplateCard({
  template,
  directCreating,
  onUseDirect,
  onUseGenerate,
  onEdit,
  onDelete,
  onPreview
}: {
  template: TemplateListItem
  directCreating?: boolean
  onUseDirect: (template: TemplateListItem) => void
  onUseGenerate: (template: TemplateListItem) => void
  onEdit: (template: TemplateListItem) => void
  onDelete: (template: TemplateListItem) => void
  onPreview: (template: TemplateListItem) => void
}): React.JSX.Element {
  const t = useT()
  const thumbnailUrl = template.thumbnailPath
    ? `local-asset://${encodeURI(template.thumbnailPath.replace(/\\/g, '/'))}`
    : ''
  const slideSize = resolveSlideSize({
    id: template.slideSizeId,
    width: template.slideWidth,
    height: template.slideHeight
  })

  return (
    <Card
      data-template-card-id={template.id}
      className="group overflow-hidden !rounded-lg transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_16px_30px_rgba(88,75,56,0.18)]"
    >
      <button
        type="button"
        className="relative block w-full overflow-hidden bg-[#f3ecdf] text-left"
        style={{ aspectRatio: `${slideSize.width}/${slideSize.height}` }}
        onClick={() => onPreview(template)}
        disabled={!template.previewHtmlPath}
        aria-label={t('common.preview')}
      >
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            loading="lazy"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.015]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_top_left,_#fffaf0,_#eee4d2)] text-[#8a7e6c]">
            <div className="flex items-center gap-2 rounded-lg border border-white/70 bg-white/55 px-3 py-2 text-xs shadow-sm backdrop-blur-sm">
              <LayoutTemplate className="h-4 w-4" />
              <span>{t('templates.thumbnailGenerating')}</span>
            </div>
          </div>
        )}
      </button>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-start justify-between gap-3 text-base">
          <span className="min-w-0 truncate text-[#3e4a32]">{template.name}</span>
          <span className="shrink-0 rounded-md border border-[#d6c08d]/80 bg-[#fff7e8] px-2 py-1 text-[11px] font-medium text-[#7c6a4c]">
            {t('templates.pageCount', { count: template.pageCount })}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="line-clamp-2 min-h-[40px] text-xs leading-5 text-muted-foreground">
          {template.description || t('templates.noDescription')}
        </p>
        {template.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {template.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="rounded-md border border-[#d6c08d]/80 bg-[#fff7e8] px-1.5 py-0.5 text-[11px] text-[#7c6a4c]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#e5dccd]/58 pt-3">
          <span className="min-w-0 truncate text-[11px] text-muted-foreground">
            {dayjs(template.updatedAt).format('YYYY/MM/DD')}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <div className="flex items-center gap-1 rounded-md bg-[#f4ecdf]/52 p-0.5">
              {template.previewHtmlPath ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 rounded-[6px] p-0 text-[#5f6b50]"
                  onClick={() => onPreview(template)}
                  title={t('common.preview')}
                  aria-label={t('common.preview')}
                >
                  <Eye className="h-3.5 w-3.5" />
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 rounded-[6px] p-0 text-[#5f6b50]"
                onClick={() => onEdit(template)}
                title={t('common.edit')}
                aria-label={t('common.edit')}
              >
                <PencilLine className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 rounded-[6px] p-0 text-[#8a514b] hover:text-[#7a332d]"
                onClick={() => onDelete(template)}
                title={t('common.delete')}
                aria-label={t('common.delete')}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  className="h-8 rounded-md bg-[#5d6b4d] px-3 text-white shadow-none hover:bg-[#4f613f]"
                  disabled={directCreating}
                >
                  <LayoutTemplate className="mr-1.5 h-3.5 w-3.5" />
                  {directCreating ? t('templates.creatingEditable') : t('templates.use')}
                  <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  className="text-xs"
                  onSelect={() => onUseDirect(template)}
                  disabled={directCreating}
                >
                  <PencilLine className="h-3.5 w-3.5" />
                  {t('templates.createEditable')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-xs"
                  onSelect={() => onUseGenerate(template)}
                  disabled={directCreating}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {t('templates.createAndGenerate')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function TemplateEmptyState(): React.JSX.Element {
  const t = useT()

  return (
    <div className="flex min-h-[360px] items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-[680px] flex-col items-center rounded-xl border border-[#ded2bd]/45 bg-[#fffdf8]/54 px-10 py-10 text-center shadow-[0_8px_20px_rgba(74,59,42,0.045)]">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-[#ede4d4]/82 text-[#6f7d62]">
          <LayoutTemplate className="h-7 w-7" />
        </div>
        <h3 className="text-lg font-semibold text-[#34402c]">{t('templates.emptyTitle')}</h3>
        <p className="mt-2 max-w-[520px] text-sm leading-6 text-[#756855]">
          {t('templates.emptyDescription')}
        </p>
        <div className="mt-5 flex items-center gap-2 rounded-md bg-[#f3ecdf]/78 px-3 py-2 text-xs text-[#7c6a4c]">
          <Plus className="h-3.5 w-3.5 text-[#5d6b4d]" />
          {t('templates.emptyHint')}
        </div>
      </div>
    </div>
  )
}
