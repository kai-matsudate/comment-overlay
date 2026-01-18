// Setup page script for Comment Overlay
;(function () {
  'use strict'

  const dropZone = document.getElementById('dropZone')
  const fileInput = document.getElementById('fileInput')
  const fileName = document.getElementById('fileName')
  const password = document.getElementById('password')
  const setupBtn = document.getElementById('setupBtn')
  const feedback = document.getElementById('feedback')
  const manualSetup = document.getElementById('manualSetup')
  const botToken = document.getElementById('botToken')
  const appToken = document.getElementById('appToken')
  const manualSetupBtn = document.getElementById('manualSetupBtn')

  let encryptedContent = null

  // Drop zone events
  dropZone.addEventListener('click', () => fileInput.click())

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault()
    dropZone.classList.add('drag-over')
  })

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over')
  })

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault()
    dropZone.classList.remove('drag-over')
    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFile(files[0])
    }
  })

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFile(e.target.files[0])
    }
  })

  async function handleFile(file) {
    if (!file.name.endsWith('.encrypted')) {
      showFeedback('error', '.encrypted ファイルを選択してください')
      return
    }

    try {
      encryptedContent = await readFileAsBase64(file)
      fileName.textContent = file.name
      dropZone.classList.add('has-file')
      updateSetupButton()
      showFeedback('success', 'ファイルを読み込みました')
    } catch (err) {
      showFeedback('error', 'ファイルの読み込みに失敗しました')
    }
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        // Convert ArrayBuffer to base64
        const bytes = new Uint8Array(reader.result)
        let binary = ''
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i])
        }
        resolve(btoa(binary))
      }
      reader.onerror = reject
      reader.readAsArrayBuffer(file)
    })
  }

  password.addEventListener('input', updateSetupButton)

  function updateSetupButton() {
    setupBtn.disabled = !encryptedContent || !password.value.trim()
  }

  setupBtn.addEventListener('click', async () => {
    if (!encryptedContent || !password.value.trim()) return

    setupBtn.disabled = true
    setupBtn.textContent = '処理中...'

    try {
      const result = await window.electronAPI.decryptEnvFile(encryptedContent, password.value)

      if (result.success) {
        showFeedback('success', 'セットアップが完了しました。アプリを起動します...')
        setTimeout(() => {
          window.electronAPI.saveTokens(result.botToken, result.appToken)
        }, 1000)
      } else {
        showFeedback('error', result.error || '復号化に失敗しました。パスワードを確認してください。')
        setupBtn.disabled = false
        setupBtn.textContent = 'セットアップ完了'
      }
    } catch (err) {
      showFeedback('error', 'エラーが発生しました: ' + err.message)
      setupBtn.disabled = false
      setupBtn.textContent = 'セットアップ完了'
    }
  })

  // Manual setup
  window.toggleManualSetup = function () {
    manualSetup.classList.toggle('show')
  }

  botToken.addEventListener('input', updateManualSetupButton)
  appToken.addEventListener('input', updateManualSetupButton)

  function updateManualSetupButton() {
    const valid = botToken.value.startsWith('xoxb-') && appToken.value.startsWith('xapp-')
    manualSetupBtn.disabled = !valid
  }

  manualSetupBtn.addEventListener('click', async () => {
    if (!botToken.value.startsWith('xoxb-') || !appToken.value.startsWith('xapp-')) {
      showFeedback('error', 'トークンの形式が正しくありません')
      return
    }

    manualSetupBtn.disabled = true
    manualSetupBtn.textContent = '保存中...'

    try {
      await window.electronAPI.saveTokens(botToken.value, appToken.value)
      showFeedback('success', 'トークンを保存しました。アプリを起動します...')
    } catch (err) {
      showFeedback('error', 'エラーが発生しました: ' + err.message)
      manualSetupBtn.disabled = false
      manualSetupBtn.textContent = 'トークンを保存'
    }
  })

  function showFeedback(type, message) {
    feedback.className = 'feedback ' + type
    feedback.textContent = message
    feedback.style.display = 'block'
  }
})()
