const API_BASE = 'https://manhwatrack.com'

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

    // Verify token with API
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
      // Save token
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

  // Enter key in token input
  document.getElementById('token-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('connect-btn').click()
  })

  // Disconnect
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
  if (avatarUrl) {
    avatarEl.innerHTML = `<img src="${avatarUrl}" alt="${username}">`
  } else {
    avatarEl.textContent = (username?.[0] ?? 'U').toUpperCase()
  }
  document.getElementById('username-display').textContent = username ?? 'User'
}

async function detectCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: detectPageInTab,
    })
    const page = results?.[0]?.result
    const container = document.getElementById('page-content')
    if (page?.chapter) {
      container.innerHTML = `
        <div class="current-title">${escapeHtml(page.title ?? 'Unknown title')}</div>
        <div class="current-ch">Chapter ${page.chapter} · ${escapeHtml(page.site)}</div>
      `
    } else {
      container.innerHTML = '<div class="not-detected">Not a supported reading page</div>'
    }
  } catch (e) {}
}

function detectPageInTab() {
  const PARSERS = [
    { match: /mangadex\.org\/chapter\//, parse() { const m = document.title.match(/ch(?:apter)?\s*([\d.]+)/i); return { title: document.querySelector('h1')?.textContent?.trim() ?? null, chapter: m ? parseFloat(m[1]) : null } } },
    { match: /webtoons\.com\/.+\/viewer/, parse() { const m = location.href.match(/episode_no=(\d+)/); return { title: document.querySelector('.subj_info .subj, #subjectTitle')?.textContent?.trim() ?? null, chapter: m ? parseInt(m[1]) : null } } },
    { match: /bato\.to\/chapter\//, parse() { const m = (document.querySelector('h2')?.textContent ?? document.title).match(/ch(?:apter)?\s*([\d.]+)/i); return { title: document.querySelector('h1 a')?.textContent?.trim() ?? null, chapter: m ? parseFloat(m[1]) : null } } },
    { match: /(flixscans|reaperscans|asurascans|asuracomic|luminousscans|roliascan)\.(org|com|net|to)/, parse() { let title = null; for (const c of document.querySelectorAll('.breadcrumb a')) { const t = c.textContent?.trim() ?? ''; if (!title && t.length > 2 && !t.match(/home|chapter/i)) { title = t; break } } if (!title) { const m = document.title.match(/^(.+?)\s*[-–|]\s*chapter/i); if (m) title = m[1].trim() } const raw = (document.querySelector('h1')?.textContent ?? '').match(/chapter\s*([\d.]+)/i)?.[1] ?? location.pathname.match(/chapter-([\d.]+)/i)?.[1]; return { title, chapter: raw ? parseFloat(raw) : null } } },
    { match: /comick\.(io|fun)/, parse() { const m = location.pathname.match(/\/(\d+(?:\.\d+)?)-chapter/); return { title: document.querySelector('h1')?.textContent?.trim() ?? null, chapter: m ? parseFloat(m[1]) : null } } },
    { match: /manhuaus\.com/, parse() { const m = location.pathname.match(/chapter-([\d.]+)/i); return { title: document.querySelector('.breadcrumb a:nth-child(2)')?.textContent?.trim() ?? null, chapter: m ? parseFloat(m[1]) : null } } },
    { match: /(manganato|chapmanganato)\.(com|to)/, parse() { const m = document.querySelector('.panel-chapter-info-top h1')?.textContent?.match(/chapter\s*([\d.]+)/i); return { title: document.querySelector('.breadcrumb a:nth-child(2)')?.textContent?.trim() ?? null, chapter: m ? parseFloat(m[1]) : null } } },
    { match: /tapas\.io\/episode/, parse() { const m = document.querySelector('.viewer__header-ep, .ep-num')?.textContent?.match(/([\d.]+)/); return { title: document.querySelector('.series-header__title')?.textContent?.trim() ?? null, chapter: m ? parseFloat(m[1]) : null } } },
  ]
  for (const p of PARSERS) {
    if (p.match.test(location.href)) {
      try { const r = p.parse(); if (r.chapter > 0) return { title: r.title, chapter: Math.floor(r.chapter), site: location.hostname.replace('www.', '') } } catch(e) {}
    }
  }
  return null
}

function showStatus(msg, type) {
  const el = document.getElementById('status-msg')
  el.textContent = msg
  el.className = type
  if (type === 'success') setTimeout(() => { el.className = ''; el.textContent = '' }, 3000)
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}