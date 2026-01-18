import { createDecipheriv, pbkdf2Sync, randomBytes, createCipheriv } from 'crypto'

export interface DecryptResult {
  success: boolean
  botToken?: string
  appToken?: string
  error?: string
}

/**
 * Decrypt .env.encrypted content
 *
 * Expected format: OpenSSL encrypted with AES-256-CBC
 * - Prefix: "Salted__" (8 bytes)
 * - Salt: 8 bytes
 * - Ciphertext: remaining bytes
 *
 * Key derivation: PBKDF2 with SHA256, 10000 iterations
 */
export function decryptEnvContent(
  encryptedBase64: string,
  password: string
): DecryptResult {
  try {
    const encrypted = Buffer.from(encryptedBase64, 'base64')

    // OpenSSL format: "Salted__" + 8 bytes salt + encrypted data
    const salted = encrypted.subarray(0, 8).toString()
    if (salted !== 'Salted__') {
      return { success: false, error: 'Invalid encrypted file format' }
    }

    const salt = encrypted.subarray(8, 16)
    const ciphertext = encrypted.subarray(16)

    // Derive key and IV using PBKDF2 (matching OpenSSL's -pbkdf2 option)
    const keyIv = pbkdf2Sync(password, salt, 10000, 48, 'sha256')
    const key = keyIv.subarray(0, 32)
    const iv = keyIv.subarray(32, 48)

    const decipher = createDecipheriv('aes-256-cbc', key, iv)
    let decrypted = decipher.update(ciphertext)
    decrypted = Buffer.concat([decrypted, decipher.final()])

    const content = decrypted.toString('utf-8')

    // Parse .env content
    const lines = content.split('\n')
    let botToken = ''
    let appToken = ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('SLACK_BOT_TOKEN=')) {
        botToken = trimmed.substring('SLACK_BOT_TOKEN='.length).trim()
      } else if (trimmed.startsWith('SLACK_APP_TOKEN=')) {
        appToken = trimmed.substring('SLACK_APP_TOKEN='.length).trim()
      }
    }

    if (!botToken || !appToken) {
      return { success: false, error: 'Tokens not found in decrypted content' }
    }

    return { success: true, botToken, appToken }
  } catch (err) {
    // Log error for debugging but don't expose details to user
    console.error('Decryption error:', err)
    return { success: false, error: 'Decryption failed. Check your password.' }
  }
}

/**
 * Encrypt content in OpenSSL-compatible format (for testing only)
 * This is exported only for testing purposes
 */
export function encryptForTesting(content: string, password: string): string {
  const salt = randomBytes(8)
  const keyIv = pbkdf2Sync(password, salt, 10000, 48, 'sha256')
  const key = keyIv.subarray(0, 32)
  const iv = keyIv.subarray(32, 48)

  const cipher = createCipheriv('aes-256-cbc', key, iv)
  let encrypted = cipher.update(content, 'utf-8')
  encrypted = Buffer.concat([encrypted, cipher.final()])

  // OpenSSL format: "Salted__" + salt + ciphertext
  const result = Buffer.concat([
    Buffer.from('Salted__'),
    salt,
    encrypted,
  ])

  return result.toString('base64')
}
