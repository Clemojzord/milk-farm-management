import { saveAs } from 'file-saver'

function normalizeValue(value) {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function escapeCell(value) {
  const normalized = normalizeValue(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const escaped = normalized.replace(/"/g, '""')
  return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped
}

function getColumns(rows) {
  const seen = new Set()
  const columns = []

  rows.forEach((row) => {
    Object.keys(row || {}).forEach((key) => {
      if (!seen.has(key)) {
        seen.add(key)
        columns.push(key)
      }
    })
  })

  return columns
}

export function toCSV(rows, columns) {
  const safeRows = Array.isArray(rows) ? rows : []
  const resolvedColumns = (columns && columns.length ? columns : getColumns(safeRows))

  if (!resolvedColumns.length) return ''

  const header = resolvedColumns.map(escapeCell).join(',')
  const body = safeRows.map((row) => resolvedColumns.map((col) => escapeCell(row?.[col])).join(','))
  return [header, ...body].join('\r\n')
}

export function downloadCSV(fileName, rows, columns) {
  const csv = toCSV(rows, columns)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const safeName = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`
  saveAs(blob, safeName)
}
