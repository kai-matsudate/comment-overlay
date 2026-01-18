// Control page script for Comment Overlay
;(function () {
  'use strict'

  const versionEl = document.getElementById('version')
  const updateBanner = document.getElementById('updateBanner')
  const threadUrl = document.getElementById('threadUrl')
  const startBtn = document.getElementById('startBtn')
  const stopBtn = document.getElementById('stopBtn')
  const feedback = document.getElementById('feedback')
  const statusIndicator = document.getElementById('statusIndicator')
  const statusText = document.getElementById('statusText')
  const recentList = document.getElementById('recentList')

  let isRunning = false

  // Initialize
  async function init() {
    // Get app version
    try {
      const version = await window.electronAPI.getAppVersion()
      versionEl.textContent = 'v' + version
    } catch {
      versionEl.textContent = ''
    }

    // Load recent threads
    await loadRecentThreads()

    // Check for updates
    try {
      await window.electronAPI.checkForUpdates()
    } catch {
      // Ignore update check errors
    }

    // Listen for status changes
    window.electronAPI.onStatusChange((status) => {
      updateStatus(status)
    })

    // Listen for update availability
    window.electronAPI.onUpdateAvailable(() => {
      updateBanner.classList.add('show')
    })
  }

  async function loadRecentThreads() {
    try {
      const threads = await window.electronAPI.getRecentThreads()

      if (threads.length === 0) {
        recentList.innerHTML = '<li class="empty-state">履歴はありません</li>'
        return
      }

      recentList.innerHTML = threads
        .map(
          (thread) => `
        <li class="recent-item" data-url="${escapeHtml(thread.url)}">
          <div class="recent-item-info">
            <div class="recent-item-name">${escapeHtml(thread.name)}</div>
            <div class="recent-item-date">${formatDate(thread.lastUsed)}</div>
          </div>
          <span class="recent-item-arrow">→</span>
        </li>
      `
        )
        .join('')

      // Add click handlers
      recentList.querySelectorAll('.recent-item').forEach((item) => {
        item.addEventListener('click', () => {
          const url = item.getAttribute('data-url')
          threadUrl.value = url
          updateStartButton()
        })
      })
    } catch (err) {
      console.error('Failed to load recent threads:', err)
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  function formatDate(isoString) {
    const date = new Date(isoString)
    const now = new Date()
    const diffMs = now - date
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return '今日'
    if (diffDays === 1) return '昨日'
    if (diffDays < 7) return `${diffDays}日前`

    return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
  }

  // Thread URL validation
  function isValidSlackThreadUrl(url) {
    // https://xxx.slack.com/archives/CHANNEL_ID/pTIMESTAMP
    const pattern = /^https:\/\/[a-zA-Z0-9-]+\.slack\.com\/archives\/[A-Z0-9]+\/p\d+/
    return pattern.test(url)
  }

  threadUrl.addEventListener('input', updateStartButton)

  function updateStartButton() {
    startBtn.disabled = !isValidSlackThreadUrl(threadUrl.value.trim())
  }

  // Start overlay
  startBtn.addEventListener('click', async () => {
    const url = threadUrl.value.trim()
    if (!isValidSlackThreadUrl(url)) {
      showFeedback('error', '有効なSlackスレッドURLを入力してください')
      return
    }

    startBtn.disabled = true
    updateStatus('connecting')
    hideFeedback()

    try {
      const result = await window.electronAPI.startOverlay(url)

      if (result.success) {
        isRunning = true
        startBtn.style.display = 'none'
        stopBtn.style.display = 'block'
        await loadRecentThreads() // Refresh recent list
      } else {
        showFeedback('error', result.error || 'オーバーレイの開始に失敗しました')
        updateStatus('error')
        startBtn.disabled = false
      }
    } catch (err) {
      showFeedback('error', 'エラーが発生しました: ' + err.message)
      updateStatus('error')
      startBtn.disabled = false
    }
  })

  // Stop overlay
  stopBtn.addEventListener('click', async () => {
    stopBtn.disabled = true

    try {
      await window.electronAPI.stopOverlay()
      isRunning = false
      stopBtn.style.display = 'none'
      startBtn.style.display = 'block'
      startBtn.disabled = false
      updateStatus('waiting')
    } catch (err) {
      showFeedback('error', '停止に失敗しました: ' + err.message)
      stopBtn.disabled = false
    }
  })

  function updateStatus(status) {
    statusIndicator.className = 'status-indicator ' + status

    const statusMessages = {
      waiting: '待機中',
      connecting: '接続中...',
      connected: '監視中',
      error: 'エラー',
    }

    statusText.textContent = statusMessages[status] || status
  }

  function showFeedback(type, message) {
    feedback.className = 'feedback ' + type
    feedback.textContent = message
    feedback.style.display = 'block'
  }

  function hideFeedback() {
    feedback.style.display = 'none'
  }

  // Update banner click
  updateBanner.addEventListener('click', () => {
    window.electronAPI.checkForUpdates()
  })

  // Initialize on load
  init()
})()
