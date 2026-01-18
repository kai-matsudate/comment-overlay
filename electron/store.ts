// electron-store requires dynamic import in ESM context for CommonJS module
// Using require for CommonJS compatibility in Electron main process

interface StoreSchema {
  slackBotToken: string
  slackAppToken: string
  recentThreads: RecentThread[]
  isSetupComplete: boolean
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
  },
  encryptionKey: 'comment-overlay-secure-key-v1', // Basic obfuscation
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

export function getSlackTokens(): { botToken: string; appToken: string } {
  const s = getStore()
  return {
    botToken: s.get('slackBotToken'),
    appToken: s.get('slackAppToken'),
  }
}

export function setSlackTokens(botToken: string, appToken: string): void {
  const s = getStore()
  s.set('slackBotToken', botToken)
  s.set('slackAppToken', appToken)
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
