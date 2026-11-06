// Política de senha do servidor para criação/edição de usuários.
// O PocketBase valida o campo system "password" com mínimo de 8 caracteres;
// quando rejeita, devolve mensagem em inglês por campo (ex: "Must be at least 8 character(s)."),
// que vira toast ilegível. Aqui centralizamos o requisito real e a tradução pt-BR.

export const MIN_SENHA_INICIAL = 8

export const MSG_SENHA_CURTA = `A senha precisa ter no mínimo ${MIN_SENHA_INICIAL} caracteres.`

/**
 * Traduz erros de campo de senha (password/passwordConfirm) devolvidos pela API
 * para mensagens em pt-BR. Campos outros são devolvidos sem alteração.
 */
export function traduzirErroSenha(field: string, msg: string): string {
  const texto = (msg || '').trim()
  if (!texto) return texto

  const isCampoSenha = field === 'password' || field === 'passwordConfirm'
  if (!isCampoSenha) return texto

  // Ex.: "Must be at least 10 character(s)." / "cannot be less than 10 characters"
  const matchMin =
    /(?:must be at least|at least|no mínimo|minimum(?: length)?(?: of)?|cannot be less than|may not be shorter than)\s*(\d+)/i.exec(
      texto,
    )
  if (matchMin) {
    return `A senha precisa ter no mínimo ${matchMin[1]} caracteres.`
  }

  const lower = texto.toLowerCase()
  if (
    lower.includes("doesn't match") ||
    lower.includes('does not match') ||
    lower.includes("don't match") ||
    lower.includes('do not match') ||
    lower.includes('not match')
  ) {
    return 'A confirmação de senha não coincide com a senha.'
  }
  if (lower.includes('cannot be blank') || lower.includes('required') || lower.includes('empty')) {
    return 'A senha é obrigatória.'
  }
  return texto
}
