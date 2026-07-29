import type { PPTDatabase } from '../db/database'

export type AppLocale = 'zh' | 'en'

export const uiText = (locale: AppLocale, zh: string, en: string): string =>
  locale === 'en' ? en : zh

export async function readAppLocale(ctx: { db: Pick<PPTDatabase, 'getSetting'> }): Promise<AppLocale> {
  const locale = await ctx.db.getSetting<string>('locale').catch(() => 'zh')
  return locale === 'en' ? 'en' : 'zh'
}
