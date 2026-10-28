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

export function formatTimeSP(dateTimeStr?: string | null): string {
  if (!dateTimeStr) return ''
  try {
    const d = new Date(dateTimeStr)
    if (isNaN(d.getTime())) return ''
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d)
  } catch {
    return ''
  }
}

export function formatDateTimeSP(dateTimeStr?: string | null): string {
  if (!dateTimeStr) return ''
  try {
    const d = new Date(dateTimeStr)
    if (isNaN(d.getTime())) return String(dateTimeStr)
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d)
  } catch {
    return String(dateTimeStr)
  }
}

/**
 * Retorna a data de HOJE em formato YYYY-MM-DD no fuso America/Sao_Paulo
 */
export function getDataHojeSP(): string {
  const nowSP = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
  const d = new Date(nowSP)
  const ano = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}
