// background.js — service worker

const API_BASE = 'https://manhwatrack.com/api'

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CHAPTER_SYNCED') {
    const { title, chapter, site } = message.data
    // Show brief badge
    chrome.action.setBadgeText({ text: '✓' })
    chrome.action.setBadgeBackgroundColor({ color: '#E85D3C' })
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000)
  }

  if (message.type === 'GET_AUTH') {
    chrome.storage.local.get(['authToken', 'userId', 'username'], sendResponse)
    return true // async
  }

  if (message.type === 'SAVE_AUTH') {
    chrome.storage.local.set(message.data, () => sendResponse({ ok: true }))
    return true
  }

  if (message.type === 'LOGOUT') {
    chrome.storage.local.remove(['authToken', 'userId', 'username'], () => {
      chrome.action.setBadgeText({ text: '' })
      sendResponse({ ok: true })
    })
    return true
  }
})

// On install — set up
chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({ text: '' })
  console.log('[ManhwaTrack] Extension installed')
})
