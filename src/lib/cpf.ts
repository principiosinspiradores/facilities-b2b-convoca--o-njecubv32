export function formatarCPF(cpf: string | undefined | null): string {
  if (!cpf) return ''
  const limpo = String(cpf).replace(/\D/g, '').slice(0, 11)
  if (limpo.length <= 3) return limpo
  if (limpo.length <= 6) return `${limpo.slice(0, 3)}.${limpo.slice(3)}`
  if (limpo.length <= 9) return `${limpo.slice(0, 3)}.${limpo.slice(3, 6)}.${limpo.slice(6)}`
  return `${limpo.slice(0, 3)}.${limpo.slice(3, 6)}.${limpo.slice(6, 9)}-${limpo.slice(9, 11)}`
}

export function mascararCPF(cpf: string | undefined | null): string {
  if (!cpf) return '—'
  const limpo = String(cpf).replace(/\D/g, '')
  if (limpo.length !== 11) return cpf
  return `***.***.${limpo.slice(6, 9)}-${limpo.slice(9, 11)}`
}

export function validarCPF(cpf: string | undefined | null): boolean {
  if (!cpf) return false
  const limpo = String(cpf).replace(/\D/g, '')
  if (limpo.length !== 11) return false
  if (/^(\d)\1{10}$/.test(limpo)) return false

  let soma = 0
  let resto

  for (let i = 1; i <= 9; i++) {
    soma += parseInt(limpo.substring(i - 1, i), 10) * (11 - i)
  }
  resto = (soma * 10) % 11
  if (resto === 10 || resto === 11) resto = 0
  if (resto !== parseInt(limpo.substring(9, 10), 10)) return false

  soma = 0
  for (let j = 1; j <= 10; j++) {
    soma += parseInt(limpo.substring(j - 1, j), 10) * (12 - j)
  }
  resto = (soma * 10) % 11
  if (resto === 10 || resto === 11) resto = 0
  if (resto !== parseInt(limpo.substring(10, 11), 10)) return false

  return true
}
