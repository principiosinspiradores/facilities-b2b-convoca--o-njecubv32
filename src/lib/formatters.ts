export function formatCurrencyBRL(value?: number | null): string {
  if (value === undefined || value === null || isNaN(value)) {
    return 'R$ 0,00'
  }
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatDateBR(dateStr?: string | null): string {
  if (!dateStr) return '—'
  try {
    const clean = String(dateStr).trim().slice(0, 10)
    const parts = clean.split('-')
    if (
      parts.length === 3 &&
      parts[0].length === 4 &&
      parts[1].length === 2 &&
      parts[2].length === 2
    ) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`
    }
    const d = new Date(dateStr)
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('pt-BR')
    }
    return dateStr
  } catch {
    return dateStr
  }
}

export function formatDateTimeBR(dateTimeStr?: string | null): string {
  if (!dateTimeStr) return '—'
  try {
    const d = new Date(dateTimeStr)
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateTimeStr
  }
}
