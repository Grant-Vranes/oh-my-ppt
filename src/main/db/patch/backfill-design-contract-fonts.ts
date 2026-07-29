import type { createClient } from '@libsql/client'
import type { DesignContract } from '@shared/generation'
import { createDefaultDesignContract } from '../../presentation/design-contract'

type LibSqlClient = ReturnType<typeof createClient>

const FALLBACK_TITLE_FONT = 'Inter'
const FALLBACK_BODY_FONT = 'Noto Sans SC'

const getRowValue = (row: unknown, key: string): unknown => {
  if (row && typeof row === 'object' && !Array.isArray(row) && key in row) {
    return (row as Record<string, unknown>)[key]
  }
  return undefined
}

const parseDesignContract = (value: unknown): DesignContract | null => {
  if (typeof value !== 'string' || value.trim().length === 0) return null
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as DesignContract
  } catch {
    return null
  }
}

const normalizeFont = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim()

const withFontFallback = (contract: DesignContract): DesignContract => {
  const titleFont = normalizeFont(contract.titleFont) || FALLBACK_TITLE_FONT
  const bodyFont = normalizeFont(contract.bodyFont) || FALLBACK_BODY_FONT
  if (titleFont === contract.titleFont && bodyFont === contract.bodyFont) return contract
  return { ...contract, titleFont, bodyFont }
}

export const patchDesignContractFonts = async (client: LibSqlClient): Promise<void> => {
  await client.execute({
    sql: `
      UPDATE sessions
      SET design_contract = ?, updated_at = ?
      WHERE provider = 'import'
        AND model IN ('session-file-import', 'pptx-import')
        AND (design_contract IS NULL OR TRIM(design_contract) = '')
    `,
    args: [JSON.stringify(createDefaultDesignContract()), Math.floor(Date.now() / 1000)]
  })

  const result = await client.execute(`
    SELECT id, design_contract
    FROM sessions
    WHERE design_contract IS NOT NULL
      AND TRIM(design_contract) <> ''
  `)

  for (const row of result.rows || []) {
    const sessionId = String(getRowValue(row, 'id') || '').trim()
    const rawContract = getRowValue(row, 'design_contract')
    if (!sessionId || typeof rawContract !== 'string') continue

    const contract = parseDesignContract(rawContract)
    if (!contract) continue

    const patched = withFontFallback(contract)
    if (patched.titleFont === contract.titleFont && patched.bodyFont === contract.bodyFont) {
      continue
    }

    await client.execute({
      sql: 'UPDATE sessions SET design_contract = ? WHERE id = ? AND design_contract = ?',
      args: [JSON.stringify(patched), sessionId, rawContract]
    })
  }
}
