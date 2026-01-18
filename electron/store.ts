// electron-store requires dynamic import in ESM context for CommonJS module
// Using require for CommonJS compatibility in Electron main process

interface StoreSchema {
  slackBotToken: string
  slackAppToken: string
  recentThreads: RecentThread[]
  isSetupComplete: boolean
  usesSafeStorage: boolean
}

export interface RecentThread {
  url: string
  name: string
  lastUsed: string // ISO date string
}

export interface StoreInstance {
  get<K extends keyof StoreSchema>(key: K): StoreSchema[K]
  set<K extends keyof StoreSchema>(key: K, value: StoreSchema[K]): void
  clear(): void
}

export const DEFAULT_STORE_CONFIG = {
  name: 'comment-overlay-config',
  defaults: {
    slackBotToken: '',
    slackAppToken: '',
    recentThreads: [] as RecentThread[],
    isSetupComplete: false,
    usesSafeStorage: false,
  },
  encryptionKey: 'comment-overlay-secure-key-v1', // Fallback encryption for non-safeStorage
}

// Factory function for creating store - allows injection for testing
export function createStoreInstance(StoreClass: new (config: typeof DEFAULT_STORE_CONFIG) => StoreInstance): StoreInstance {
  return new StoreClass(DEFAULT_STORE_CONFIG)
}

// Lazy initialization to allow mocking in tests
let store: StoreInstance | null = null

function getStore(): StoreInstance {
  if (!store) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Store = require('electron-store')
    store = createStoreInstance(Store)
  }
  return store
}

// For testing: allows injecting a mock store
export function _setStoreForTesting(mockStore: StoreInstance): void {
  store = mockStore
}

// For testing: resets the store instance
export function _resetStoreForTesting(): void {
  store = null
}

// safeStorage interface for testing
interface SafeStorageInterface {
  isEncryptionAvailable: () => boolean
  encryptString: (plainText: string) => Buffer
  decryptString: (encrypted: Buffer) => string
}

// Default safeStorage implementation using Electron's safeStorage
let safeStorageImpl: SafeStorageInterface | null = null

function getSafeStorage(): SafeStorageInterface {
  if (!safeStorageImpl) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { safeStorage } = require('electron')
    safeStorageImpl = safeStorage
  }
  return safeStorageImpl
}

// For testing: allows injecting a mock safeStorage
export function _setSafeStorageForTesting(mockSafeStorage: SafeStorageInterface): void {
  safeStorageImpl = mockSafeStorage
}

// For testing: resets safeStorage to use real Electron implementation
export function _resetSafeStorageForTesting(): void {
  safeStorageImpl = null
}

/**
 * Get Slack tokens, decrypting if stored with safeStorage
 */
export function getSlackTokens(): { botToken: string; appToken: string } {
  const s = getStore()
  const usesSafeStorage = s.get('usesSafeStorage')

  if (usesSafeStorage) {
    const safeStorage = getSafeStorage()
    const encryptedBot = s.get('slackBotToken')
    const encryptedApp = s.get('slackAppToken')

    try {
      const botToken = encryptedBot
        ? safeStorage.decryptString(Buffer.from(encryptedBot, 'base64'))
        : ''
      const appToken = encryptedApp
        ? safeStorage.decryptString(Buffer.from(encryptedApp, 'base64'))
        : ''
      return { botToken, appToken }
    } catch (err) {
      console.error('Failed to decrypt tokens with safeStorage:', err)
      // Return empty tokens on decryption failure
      return { botToken: '', appToken: '' }
    }
  }

  // Fallback: tokens stored with electron-store's encryptionKey
  return {
    botToken: s.get('slackBotToken'),
    appToken: s.get('slackAppToken'),
  }
}

/**
 * Save Slack tokens, encrypting with safeStorage if available
 * Falls back to electron-store's encryptionKey if safeStorage is unavailable
 */
export function setSlackTokens(botToken: string, appToken: string): void {
  const s = getStore()
  const safeStorage = getSafeStorage()

  if (safeStorage.isEncryptionAvailable()) {
    // Use OS-native credential storage (Keychain on macOS, DPAPI on Windows)
    const encryptedBot = safeStorage.encryptString(botToken)
    const encryptedApp = safeStorage.encryptString(appToken)
    s.set('slackBotToken', encryptedBot.toString('base64') as string)
    s.set('slackAppToken', encryptedApp.toString('base64') as string)
    s.set('usesSafeStorage', true)
  } else {
    // Fallback: use electron-store's encryptionKey
    console.warn('safeStorage not available, using fallback encryption')
    s.set('slackBotToken', botToken)
    s.set('slackAppToken', appToken)
    s.set('usesSafeStorage', false)
  }

  s.set('isSetupComplete', true)
}

export function isSetupComplete(): boolean {
  return getStore().get('isSetupComplete')
}

export function getRecentThreads(): RecentThread[] {
  return getStore().get('recentThreads')
}

export function addRecentThread(url: string, name: string): void {
  const s = getStore()
  const threads = s.get('recentThreads')
  const now = new Date().toISOString()

  // Remove existing entry with same URL
  const filtered = threads.filter((t: RecentThread) => t.url !== url)

  // Add new entry at the beginning
  const updated = [{ url, name, lastUsed: now }, ...filtered].slice(0, 5) // Keep only 5 most recent

  s.set('recentThreads', updated)
}

export function clearConfig(): void {
  getStore().clear()
}
