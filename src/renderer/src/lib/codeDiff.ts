/** A deterministic unified diff; common prefix/suffix stay context, the changed middle is explicit. */
export function unifiedCodeDiff(before: string, after: string): string {
  const previous = before ? before.split('\n') : []
  const next = after ? after.split('\n') : []
  let start = 0
  while (start < previous.length && start < next.length && previous[start] === next[start]) start++
  if (start === previous.length && start === next.length) return 'Sem alterações.'
  let end = 0
  while (
    end < previous.length - start &&
    end < next.length - start &&
    previous[previous.length - end - 1] === next[next.length - end - 1]
  )
    end++
  const contextStart = Math.max(0, start - 3)
  const suffixCount = Math.min(3, end)
  const oldCount = previous.length - end - contextStart + suffixCount
  const newCount = next.length - end - contextStart + suffixCount
  return [
    '--- original.abap',
    '+++ proposta.abap',
    `@@ -${oldCount ? contextStart + 1 : 0},${oldCount} +${newCount ? contextStart + 1 : 0},${newCount} @@`,
    ...previous.slice(contextStart, start).map((line) => ` ${line}`),
    ...previous.slice(start, previous.length - end).map((line) => `-${line}`),
    ...next.slice(start, next.length - end).map((line) => `+${line}`),
    ...previous
      .slice(previous.length - end, previous.length - end + suffixCount)
      .map((line) => ` ${line}`)
  ].join('\n')
}
