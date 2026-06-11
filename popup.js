// popup.js
const API_BASE = 'https://www.manhwatrack.com'

document.addEventListener('DOMContentLoaded', async () => {
  const { authToken, username, avatarUrl } = await chrome.storage.local.get([
    'authToken', 'username', 'avatarUrl'
  ])

  if (authToken && username) {
    showConnected({ username, avatarUrl })
    detectCurrentTab()
  } else {
    showTokenInput()
  }

  // Connect button
  document.getElementById('connect-btn').addEventListener('click', async () => {
    const token = document.getElementById('token-input').value.trim()
    if (!token || token.length < 32) {
      showStatus('Please paste a valid token', 'error')
      return
    }
    document.getElementById('connect-btn').textContent = 'Connecting...'
    try {
      const res = await fetch(`${API_BASE}/api/extension/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (!res.ok || !data.username) {
        showStatus('Invalid token — get a new one at manhwatrack.com/settings', 'error')
        document.getElementById('connect-btn').textContent = 'Connect'
        return
      }
      await chrome.storage.local.set({
        authToken: token,
        username: data.username,
        avatarUrl: data.avatarUrl ?? null,
      })
      showConnected({ username: data.username, avatarUrl: data.avatarUrl })
      detectCurrentTab()
    } catch (e) {
      showStatus('Connection failed — check your internet', 'error')
      document.getElementById('connect-btn').textContent = 'Connect'
    }
  })

  document.getElementById('token-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('connect-btn').click()
  })

  document.getElementById('disconnect-btn').addEventListener('click', async () => {
    await chrome.storage.local.remove(['authToken', 'username', 'avatarUrl'])
    showTokenInput()
  })
})

function showTokenInput() {
  document.getElementById('token-view').style.display = 'block'
  document.getElementById('user-view').style.display = 'none'
}

function showConnected({ username, avatarUrl }) {
  document.getElementById('token-view').style.display = 'none'
  document.getElementById('user-view').style.display = 'block'
  const avatarEl = document.getElementById('user-avatar')
  avatarEl.textContent = ''
  if (avatarUrl) {
    const img = document.createElement('img')
    img.src = avatarUrl
    img.alt = username ?? 'User'
    avatarEl.appendChild(img)
  } else {
    avatarEl.textContent = (username?.[0] ?? 'U').toUpperCase()
  }
  document.getElementById('username-display').textContent = username ?? 'User'
}

// ── Supported site patterns ───────────────────────────────────────────────────
// Generic: any URL with chapter/episode pattern
function isChapterUrl(url) {
  return /\/chapter[\/-](\d+)/i.test(url) ||
    /[a-z]+-chapter-(\d+)/i.test(url) ||
    /\/episode[\/-](\d+)/i.test(url) ||
    /\/ch[\/-](\d+)/i.test(url) ||
    /webtoons\.com\/.+\/viewer/.test(url) ||
    /tapas\.io\/episode/.test(url)
}

async function detectCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return

  const container = document.getElementById('page-content')
  const url = tab.url ?? ''

  // Check URL first without injecting
  const isSupported = isChapterUrl(url)

  if (!isSupported) {
    container.innerHTML = '<div class="not-detected">Not a supported reading page</div>'
    return
  }

  // It's a supported site — try to extract chapter info
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: detectPageInTab,
    })
    const page = results?.[0]?.result
    if (page?.chapter) {
      const titleEl = document.createElement('div')
      titleEl.className = 'current-title'
      titleEl.textContent = page.title ?? 'Unknown title'
      const chEl = document.createElement('div')
      chEl.className = 'current-ch'
      chEl.textContent = 'Chapter ' + page.chapter + ' · ' + page.site
      container.textContent = ''
      container.appendChild(titleEl)
      container.appendChild(chEl)
      // Sync directly from popup — don't rely on content.js
      syncFromPopup(page)
    } else {
      container.innerHTML = '<div class="not-detected">Supported site — navigate to a chapter page</div>'
    }
  } catch (e) {
    // Try URL parsing as last resort
    const chMatch = url.match(/\/chapter[\/\-]([\d.]+)/i)
    if (chMatch) {
      const chEl = document.createElement('div')
      chEl.className = 'current-ch'
      chEl.textContent = 'Chapter ' + Math.floor(parseFloat(chMatch[1])) + ' · ' + new URL(url).hostname
      container.textContent = ''
      container.appendChild(chEl)
    } else {
      container.innerHTML = '<div class="not-detected">Reload tab and try again</div>'
    }
  }
}

function detectPageInTab() {
  const PARSERS = [
    {
      match: /mangadex\.org\/chapter\//,
      parse() {
        const m = document.title.match(/ch(?:apter)?\s*([\d.]+)/i)
        return { title: document.querySelector('h1')?.textContent?.trim() ?? null, chapter: m ? parseFloat(m[1]) : null }
      }
    },
    {
      match: /webtoons\.com\/.+\/viewer/,
      parse() {
        const m = location.href.match(/episode_no=(\d+)/)
        return { title: document.querySelector('.subj_info .subj, #subjectTitle')?.textContent?.trim() ?? null, chapter: m ? parseInt(m[1]) : null }
      }
    },
    {
      match: /bato\.to\/chapter\//,
      parse() {
        const m = (document.querySelector('h2')?.textContent ?? document.title).match(/ch(?:apter)?\s*([\d.]+)/i)
        return { title: document.querySelector('h1 a')?.textContent?.trim() ?? null, chapter: m ? parseFloat(m[1]) : null }
      }
    },
    {
      // Asurascans, Flixscans, Luminous etc — handles both /chapter/325 and /chapter-325
      match: /(asurascans|asuracomic|flixscans|reaperscans|luminousscans|roliascan)\.(com|net|org|to)/,
      parse() {
        let title = null
        // Try breadcrumb
        for (const c of document.querySelectorAll('.breadcrumb a, nav a, .series-title, h2 a')) {
          const t = c.textContent?.trim() ?? ''
          if (t.length > 2 && !t.match(/home|chapter|prev|next/i)) { title = t; break }
        }
        // Try page title
        if (!title) {
          const m = document.title.match(/^(.+?)\s*[-–|]\s*chapter/i)
          if (m) title = m[1].trim()
        }
        // Try URL slug for Asurascans: /comics/title-name-hexid/chapter/325
        if (!title) {
          const urlM = location.pathname.match(/\/(?:comics|series)\/(.+?)-[a-f0-9]{6,8}(?:\/|$)/i)
          if (urlM) title = urlM[1].replace(/-/g, ' ')
        }
        // Chapter from URL — handles /chapter/325 AND /chapter-325
        const raw = location.pathname.match(/\/chapter[\/\-]([\d.]+)/i)?.[1]
          ?? (document.querySelector('h1')?.textContent ?? '').match(/chapter\s*([\d.]+)/i)?.[1]
        return { title, chapter: raw ? parseFloat(raw) : null }
      }
    },
    {
      match: /comick\.(io|fun)/,
      parse() {
        const m = location.pathname.match(/\/([\d.]+)-chapter/)
        return { title: document.querySelector('h1')?.textContent?.trim() ?? null, chapter: m ? parseFloat(m[1]) : null }
      }
    },
    {
      match: /manhuaus\.com/,
      parse() {
        const m = location.pathname.match(/chapter-([\d.]+)/i)
        return { title: document.querySelector('.breadcrumb a:nth-child(2)')?.textContent?.trim() ?? null, chapter: m ? parseFloat(m[1]) : null }
      }
    },
    {
      match: /(manganato|chapmanganato)\.(com|to)/,
      parse() {
        const m = document.querySelector('.panel-chapter-info-top h1')?.textContent?.match(/chapter\s*([\d.]+)/i)
        return { title: document.querySelector('.breadcrumb a:nth-child(2)')?.textContent?.trim() ?? null, chapter: m ? parseFloat(m[1]) : null }
      }
    },
    {
      match: /tapas\.io\/episode/,
      parse() {
        const m = document.querySelector('.viewer__header-ep, .ep-num')?.textContent?.match(/([\d.]+)/)
        return { title: document.querySelector('.series-header__title')?.textContent?.trim() ?? null, chapter: m ? parseFloat(m[1]) : null }
      }
    },
    {
      // Generic — matches ANY URL with chapter pattern
      match: /chapter[\/-]\d+|[a-z]+-chapter-\d+/i,
      parse() {
        const raw = location.pathname.match(/chapter[\/-]([\d.]+)/i)?.[1]
          ?? location.pathname.match(/[a-z]+-chapter-([\d.]+)/i)?.[1]
        let title = null
        for (const c of document.querySelectorAll('.breadcrumb a, nav a, h2 a')) {
          const t = c.textContent?.trim() ?? ''
          if (t.length > 2 && !t.match(/home|chapter|prev|next/i)) { title = t; break }
        }
        if (!title) {
          const m = document.title.match(/^(.+?)\s*[-–|]/)
          if (m) title = m[1].trim()
        }
        return { title, chapter: raw ? parseFloat(raw) : null }
      }
    },
  ]

  for (const p of PARSERS) {
    if (p.match.test(location.href)) {
      try {
        const r = p.parse()
        if (r.chapter && r.chapter > 0) {
          return { title: r.title, chapter: Math.floor(r.chapter), site: location.hostname.replace('www.', ''), url: location.href }
        }
      } catch(e) {}
    }
  }
  return null
}

async function syncFromPopup(page) {
  const { authToken } = await chrome.storage.local.get(['authToken'])
  if (!authToken) return
  try {
    const res = await fetch('https://www.manhwatrack.com/api/extension/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        title: page.title,
        chapter: page.chapter,
        site: page.site,
        url: page.url,
        force: true, // popup sync always updates regardless of chapter direction
      }),
    })
    const data = await res.json()
    if (res.ok && data.matched) {
      showStatus('✓ Progress saved — ' + data.title, 'success')
    } else if (res.ok && !data.matched) {
      showStatus('Tracked but title not in database', 'success')
    } else {
      showStatus('Could not save — try reconnecting', 'error')
    }
  } catch(e) {
    showStatus('Network error', 'error')
  }
}

function showStatus(msg, type) {
  const el = document.getElementById('status-msg')
  el.textContent = msg
  el.className = type
  if (type === 'success') setTimeout(() => { el.className = ''; el.textContent = '' }, 3000)
}