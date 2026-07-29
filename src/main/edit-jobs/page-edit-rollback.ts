import fs from 'fs'

export type PageEditFileSnapshot = {
  path: string
  exists: boolean
  content: string
}

export async function restorePageEditSnapshots(
  snapshots: readonly PageEditFileSnapshot[]
): Promise<Array<{ path: string; error: unknown }>> {
  const results = await Promise.allSettled(
    snapshots.map((snapshot) =>
      snapshot.exists
        ? fs.promises.writeFile(snapshot.path, snapshot.content, 'utf-8')
        : fs.promises.rm(snapshot.path, { force: true })
    )
  )

  return results.flatMap((result, index) =>
    result.status === 'rejected'
      ? [{ path: snapshots[index]?.path || '', error: result.reason }]
      : []
  )
}
