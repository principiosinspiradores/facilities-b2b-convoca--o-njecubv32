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
    const clean = dateStr.split('T')[0] || dateStr.slice(0, 10)
    const parts = clean.split('-')
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`
    }
    const d = new Date(dateStr)
    return d.toLocaleDateString('pt-BR')
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
