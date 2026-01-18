import { describe, it, expect, beforeEach } from 'vitest'
import {
  getSlackTokens,
  setSlackTokens,
  isSetupComplete,
  getRecentThreads,
  addRecentThread,
  clearConfig,
  _setStoreForTesting,
  _resetStoreForTesting,
  _setSafeStorageForTesting,
  _resetSafeStorageForTesting,
  StoreInstance,
  DEFAULT_STORE_CONFIG,
} from './store'

// Create a mock store implementation for testing
function createMockStore(): StoreInstance & { _data: Record<string, unknown> } {
  let data: Record<string, unknown> = { ...DEFAULT_STORE_CONFIG.defaults }

  return {
    get<K extends keyof typeof DEFAULT_STORE_CONFIG.defaults>(key: K) {
      return data[key] as (typeof DEFAULT_STORE_CONFIG.defaults)[K]
    },
    set<K extends keyof typeof DEFAULT_STORE_CONFIG.defaults>(
      key: K,
      value: (typeof DEFAULT_STORE_CONFIG.defaults)[K]
    ) {
      data[key] = value
    },
    clear() {
      data = { ...DEFAULT_STORE_CONFIG.defaults }
    },
    get _data() {
      return data
    },
  }
}

// Create a mock safeStorage implementation
function createMockSafeStorage(available: boolean = true) {
  const encryptedData = new Map<string, string>()

  return {
    isEncryptionAvailable: () => available,
    encryptString: (plainText: string): Buffer => {
      // Simple mock: prefix with 'encrypted:' and convert to buffer
      const encrypted = `encrypted:${plainText}`
      encryptedData.set(encrypted, plainText)
      return Buffer.from(encrypted)
    },
    decryptString: (encrypted: Buffer): string => {
      const encryptedStr = encrypted.toString()
      if (!encryptedStr.startsWith('encrypted:')) {
        throw new Error('Invalid encrypted data')
      }
      return encryptedStr.substring('encrypted:'.length)
    },
  }
}

describe('store', () => {
  beforeEach(() => {
    // Reset any existing store and safeStorage
    _resetStoreForTesting()
    _resetSafeStorageForTesting()
    // Inject mock store for testing
    _setStoreForTesting(createMockStore())
    // Default to safeStorage available
    _setSafeStorageForTesting(createMockSafeStorage(true))
  })

  describe('getSlackTokens', () => {
    it('should return empty tokens initially', () => {
      const tokens = getSlackTokens()
      expect(tokens.botToken).toBe('')
      expect(tokens.appToken).toBe('')
    })

    it('should return saved tokens after setSlackTokens', () => {
      setSlackTokens('xoxb-test-bot-token', 'xapp-test-app-token')

      const tokens = getSlackTokens()
      expect(tokens.botToken).toBe('xoxb-test-bot-token')
      expect(tokens.appToken).toBe('xapp-test-app-token')
    })
  })

  describe('setSlackTokens', () => {
    it('should save bot and app tokens', () => {
      setSlackTokens('xoxb-my-bot', 'xapp-my-app')

      const tokens = getSlackTokens()
      expect(tokens.botToken).toBe('xoxb-my-bot')
      expect(tokens.appToken).toBe('xapp-my-app')
    })

    it('should mark setup as complete', () => {
      expect(isSetupComplete()).toBe(false)

      setSlackTokens('xoxb-token', 'xapp-token')

      expect(isSetupComplete()).toBe(true)
    })

    it('should use safeStorage when available', () => {
      const mockStore = createMockStore()
      _setStoreForTesting(mockStore)
      _setSafeStorageForTesting(createMockSafeStorage(true))

      setSlackTokens('xoxb-test', 'xapp-test')

      // Tokens should be encrypted (base64 of 'encrypted:...')
      const storedBot = mockStore._data['slackBotToken'] as string
      expect(storedBot).not.toBe('xoxb-test')
      expect(mockStore._data['usesSafeStorage']).toBe(true)
    })

    it('should fallback to plain storage when safeStorage unavailable', () => {
      const mockStore = createMockStore()
      _setStoreForTesting(mockStore)
      _setSafeStorageForTesting(createMockSafeStorage(false))

      setSlackTokens('xoxb-fallback', 'xapp-fallback')

      // Tokens should be stored directly (not encrypted)
      expect(mockStore._data['slackBotToken']).toBe('xoxb-fallback')
      expect(mockStore._data['slackAppToken']).toBe('xapp-fallback')
      expect(mockStore._data['usesSafeStorage']).toBe(false)
    })
  })

  describe('isSetupComplete', () => {
    it('should return false initially', () => {
      expect(isSetupComplete()).toBe(false)
    })

    it('should return true after tokens are saved', () => {
      setSlackTokens('xoxb-token', 'xapp-token')
      expect(isSetupComplete()).toBe(true)
    })
  })

  describe('getRecentThreads', () => {
    it('should return empty array initially', () => {
      const threads = getRecentThreads()
      expect(threads).toEqual([])
    })
  })

  describe('addRecentThread', () => {
    it('should add thread to the beginning', () => {
      addRecentThread('https://test.slack.com/archives/C123/p1234', 'Thread 1')

      const threads = getRecentThreads()
      expect(threads).toHaveLength(1)
      expect(threads[0].url).toBe('https://test.slack.com/archives/C123/p1234')
      expect(threads[0].name).toBe('Thread 1')
      expect(threads[0].lastUsed).toBeDefined()
    })

    it('should limit to 5 recent threads', () => {
      // Add 6 threads
      for (let i = 1; i <= 6; i++) {
        addRecentThread(`https://test.slack.com/archives/C${i}/p${i}`, `Thread ${i}`)
      }

      const threads = getRecentThreads()
      expect(threads).toHaveLength(5)
      // Most recent should be first (Thread 6)
      expect(threads[0].name).toBe('Thread 6')
      // Thread 1 should be removed (oldest)
      expect(threads.find((t) => t.name === 'Thread 1')).toBeUndefined()
    })

    it('should update existing thread to move it to beginning', () => {
      // Add 3 threads
      addRecentThread('https://test.slack.com/archives/C1/p1', 'Thread 1')
      addRecentThread('https://test.slack.com/archives/C2/p2', 'Thread 2')
      addRecentThread('https://test.slack.com/archives/C3/p3', 'Thread 3')

      // Access Thread 1 again
      addRecentThread('https://test.slack.com/archives/C1/p1', 'Thread 1 Updated')

      const threads = getRecentThreads()
      expect(threads).toHaveLength(3)
      // Thread 1 should now be first with updated name
      expect(threads[0].url).toBe('https://test.slack.com/archives/C1/p1')
      expect(threads[0].name).toBe('Thread 1 Updated')
    })

    it('should include ISO date string in lastUsed', () => {
      const beforeAdd = new Date().toISOString()

      addRecentThread('https://test.slack.com/archives/C123/p1234', 'Thread')

      const threads = getRecentThreads()
      const afterAdd = new Date().toISOString()

      expect(threads[0].lastUsed >= beforeAdd).toBe(true)
      expect(threads[0].lastUsed <= afterAdd).toBe(true)
    })
  })

  describe('clearConfig', () => {
    it('should clear all configuration', () => {
      // Set some data
      setSlackTokens('xoxb-token', 'xapp-token')
      addRecentThread('https://test.slack.com/archives/C123/p1234', 'Thread')

      // Clear config
      clearConfig()

      // Verify everything is reset
      const tokens = getSlackTokens()
      expect(tokens.botToken).toBe('')
      expect(tokens.appToken).toBe('')
      expect(isSetupComplete()).toBe(false)
      expect(getRecentThreads()).toEqual([])
    })
  })

  describe('safeStorage integration', () => {
    it('should encrypt and decrypt tokens correctly with safeStorage', () => {
      const mockStore = createMockStore()
      _setStoreForTesting(mockStore)
      _setSafeStorageForTesting(createMockSafeStorage(true))

      // Save tokens
      setSlackTokens('xoxb-secret-bot', 'xapp-secret-app')

      // The stored values should be encrypted (base64)
      const storedBot = mockStore._data['slackBotToken'] as string
      const storedApp = mockStore._data['slackAppToken'] as string
      expect(storedBot).toContain('ZW5jcnlwdGVk') // 'encrypted' in base64
      expect(storedApp).toContain('ZW5jcnlwdGVk')

      // But getSlackTokens should return decrypted values
      const tokens = getSlackTokens()
      expect(tokens.botToken).toBe('xoxb-secret-bot')
      expect(tokens.appToken).toBe('xapp-secret-app')
    })

    it('should return empty tokens if decryption fails', () => {
      const mockStore = createMockStore()
      _setStoreForTesting(mockStore)

      // Manually set invalid encrypted data
      mockStore._data['slackBotToken'] = Buffer.from('invalid-data').toString('base64')
      mockStore._data['slackAppToken'] = Buffer.from('invalid-data').toString('base64')
      mockStore._data['usesSafeStorage'] = true

      _setSafeStorageForTesting(createMockSafeStorage(true))

      const tokens = getSlackTokens()
      expect(tokens.botToken).toBe('')
      expect(tokens.appToken).toBe('')
    })
  })
})
