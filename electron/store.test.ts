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
  StoreInstance,
  DEFAULT_STORE_CONFIG,
} from './store'

// Create a mock store implementation for testing
function createMockStore(): StoreInstance {
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
  }
}

describe('store', () => {
  beforeEach(() => {
    // Reset any existing store
    _resetStoreForTesting()
    // Inject mock store for testing
    _setStoreForTesting(createMockStore())
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
})
