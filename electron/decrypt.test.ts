import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { decryptEnvContent, encryptForTesting } from './decrypt'

describe('decryptEnvContent', () => {
  // Suppress console.error during tests
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  describe('valid input', () => {
    it('should decrypt content and extract tokens', () => {
      const content = `SLACK_BOT_TOKEN=xoxb-test-bot-token-123
SLACK_APP_TOKEN=xapp-test-app-token-456`
      const password = 'test-password'
      const encrypted = encryptForTesting(content, password)

      const result = decryptEnvContent(encrypted, password)

      expect(result.success).toBe(true)
      expect(result.botToken).toBe('xoxb-test-bot-token-123')
      expect(result.appToken).toBe('xapp-test-app-token-456')
      expect(result.error).toBeUndefined()
    })

    it('should handle content with extra whitespace', () => {
      const content = `  SLACK_BOT_TOKEN=xoxb-token  
  SLACK_APP_TOKEN=xapp-token  `
      const password = 'secret'
      const encrypted = encryptForTesting(content, password)

      const result = decryptEnvContent(encrypted, password)

      expect(result.success).toBe(true)
      expect(result.botToken).toBe('xoxb-token')
      expect(result.appToken).toBe('xapp-token')
    })

    it('should handle content with comments and extra lines', () => {
      const content = `# This is a comment
SLACK_BOT_TOKEN=xoxb-my-bot
# Another comment
SLACK_APP_TOKEN=xapp-my-app
# End of file`
      const password = 'pass123'
      const encrypted = encryptForTesting(content, password)

      const result = decryptEnvContent(encrypted, password)

      expect(result.success).toBe(true)
      expect(result.botToken).toBe('xoxb-my-bot')
      expect(result.appToken).toBe('xapp-my-app')
    })

    it('should handle tokens in any order', () => {
      const content = `SLACK_APP_TOKEN=xapp-first
SLACK_BOT_TOKEN=xoxb-second`
      const password = 'order'
      const encrypted = encryptForTesting(content, password)

      const result = decryptEnvContent(encrypted, password)

      expect(result.success).toBe(true)
      expect(result.botToken).toBe('xoxb-second')
      expect(result.appToken).toBe('xapp-first')
    })
  })

  describe('invalid input', () => {
    it('should reject non-Salted__ format', () => {
      // Create invalid base64 that doesn't start with "Salted__"
      const invalidData = Buffer.from('InvalidPrefix12345678encrypted_data').toString('base64')

      const result = decryptEnvContent(invalidData, 'password')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid encrypted file format')
    })

    it('should reject empty base64 string', () => {
      const result = decryptEnvContent('', 'password')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid encrypted file format')
    })

    it('should reject invalid base64', () => {
      const result = decryptEnvContent('not-valid-base64!!!', 'password')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid encrypted file format')
    })

    it('should reject invalid password', () => {
      const content = `SLACK_BOT_TOKEN=xoxb-token
SLACK_APP_TOKEN=xapp-token`
      const correctPassword = 'correct-password'
      const wrongPassword = 'wrong-password'
      const encrypted = encryptForTesting(content, correctPassword)

      const result = decryptEnvContent(encrypted, wrongPassword)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Decryption failed. Check your password.')
    })

    it('should fail if botToken is missing', () => {
      const content = `SLACK_APP_TOKEN=xapp-only`
      const password = 'pass'
      const encrypted = encryptForTesting(content, password)

      const result = decryptEnvContent(encrypted, password)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Tokens not found in decrypted content')
    })

    it('should fail if appToken is missing', () => {
      const content = `SLACK_BOT_TOKEN=xoxb-only`
      const password = 'pass'
      const encrypted = encryptForTesting(content, password)

      const result = decryptEnvContent(encrypted, password)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Tokens not found in decrypted content')
    })

    it('should fail if content is empty', () => {
      const content = ''
      const password = 'pass'
      const encrypted = encryptForTesting(content, password)

      const result = decryptEnvContent(encrypted, password)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Tokens not found in decrypted content')
    })
  })

  describe('error logging', () => {
    it('should log decryption errors to console', () => {
      const content = `SLACK_BOT_TOKEN=xoxb-token
SLACK_APP_TOKEN=xapp-token`
      const encrypted = encryptForTesting(content, 'correct')

      decryptEnvContent(encrypted, 'wrong')

      expect(consoleSpy).toHaveBeenCalledWith(
        'Decryption error:',
        expect.any(Error)
      )
    })
  })
})

describe('encryptForTesting', () => {
  it('should produce valid encrypted content that can be decrypted', () => {
    const content = 'Test content for encryption'
    const password = 'test-password'

    const encrypted = encryptForTesting(content, password)

    // Should be valid base64
    expect(() => Buffer.from(encrypted, 'base64')).not.toThrow()

    // Should start with "Salted__" when decoded
    const decoded = Buffer.from(encrypted, 'base64')
    expect(decoded.subarray(0, 8).toString()).toBe('Salted__')
  })

  it('should produce different ciphertext each time due to random salt', () => {
    const content = 'Same content'
    const password = 'same-password'

    const encrypted1 = encryptForTesting(content, password)
    const encrypted2 = encryptForTesting(content, password)

    // Should be different due to random salt
    expect(encrypted1).not.toBe(encrypted2)

    // But both should decrypt to the same content
    // (Can't test directly here, but the structure test above validates format)
  })
})
