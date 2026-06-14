const INTERNAL_EDIT_CONFIRMATION_PATTERNS = [
  /(?:未修改|没有修改|不会修改)\s*index\.html(?:\s*(?:或|和|以及)\s*其他页面)?[。.!！]?/gi,
  /index\.html\s*(?:未被修改|没有被修改|不会被修改)(?:\s*(?:，|,)?\s*(?:其他页面也)?(?:未被修改|没有被修改))?[。.!！]?/gi,
  /(?:did not|didn't|will not|won't)\s+modify\s+index\.html(?:\s+(?:or|and)\s+other pages)?[.!]?/gi,
  /index\.html\s+(?:was not|wasn't|will not be|won't be)\s+modified[.!]?/gi
]

export function stripInternalEditConfirmations(value: string): string {
  let result = value
  for (const pattern of INTERNAL_EDIT_CONFIRMATION_PATTERNS) {
    result = result.replace(pattern, '')
  }
  return result
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^[\s·,，;；:：-]+|[\s·,，;；:：-]+$/g, '')
    .trim()
}
