/** 生成 8 位邀请码:大写字母 + 数字,剔除易混淆字符(0/O、1/I、L) */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function generateInviteCode(): string {
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return code
}
