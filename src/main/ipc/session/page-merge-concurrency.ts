import pLimit from 'p-limit'

export const PAGE_MERGE_PREPARE_CONCURRENCY = 4

export async function mapPageMergeConcurrent<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const limit = pLimit(PAGE_MERGE_PREPARE_CONCURRENCY)
  return Promise.all(items.map((item, index) => limit(() => worker(item, index))))
}
