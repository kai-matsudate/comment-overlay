// electron-store requires dynamic import in ESM context for CommonJS module
// Using require for CommonJS compatibility in Electron main process
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Store = require('electron-store')

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

interface StoreInstance {
  get<K extends keyof StoreSchema>(key: K): StoreSchema[K]
  set<K extends keyof StoreSchema>(key: K, value: StoreSchema[K]): void
  clear(): void
}

const store: StoreInstance = new Store({
  name: 'comment-overlay-config',
  defaults: {
    slackBotToken: '',
    slackAppToken: '',
    recentThreads: [],
    isSetupComplete: false,
  },
  encryptionKey: 'comment-overlay-secure-key-v1', // Basic obfuscation
})

export function getSlackTokens(): { botToken: string; appToken: string } {
  return {
    botToken: store.get('slackBotToken'),
    appToken: store.get('slackAppToken'),
  }
}

export function setSlackTokens(botToken: string, appToken: string): void {
  store.set('slackBotToken', botToken)
  store.set('slackAppToken', appToken)
  store.set('isSetupComplete', true)
}

export function isSetupComplete(): boolean {
  return store.get('isSetupComplete')
}

export function getRecentThreads(): RecentThread[] {
  return store.get('recentThreads')
}

export function addRecentThread(url: string, name: string): void {
  const threads = store.get('recentThreads')
  const now = new Date().toISOString()

  // Remove existing entry with same URL
  const filtered = threads.filter((t: RecentThread) => t.url !== url)

  // Add new entry at the beginning
  const updated = [{ url, name, lastUsed: now }, ...filtered].slice(0, 5) // Keep only 5 most recent

  store.set('recentThreads', updated)
}

export function clearConfig(): void {
  store.clear()
}

export { store }
