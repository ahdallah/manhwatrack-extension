// popup.js

const API_BASE = 'https://manhwatrack.com'

// ── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const { authToken, username, avatarUrl } = await chrome.storage.local.get([
    'authToken', 'username', 'avatarUrl'
  ])

  if (authToken) {
    showLoggedIn({ username, avatarUrl })
    detectCurrentTab()
  } else {
    showLoggedOut()
  }

  // Login button
  document.getElementById('login-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: `${API_BASE}/sign-in?redirect_url=${encodeURIComponent(API_BASE + '/api/extension/callback')}` })
    window.close()
  })

  // Logout
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await chrome.storage.local.remove(['authToken', 'username', 'userId', 'avatarUrl'])
    showLoggedOut()
  })
})

// ── Views ─────────────────────────────────────────────────────────────────────

function showLoggedOut() {
  document.getElementById('login-view').style.display = 'block'
  document.getElementById('user-view').style.display = 'none'
}

function showLoggedIn({ username, avatarUrl }) {
  document.getElementById('login-view').style.display = 'none'
  document.getElementById('user-view').style.display = 'block'

  // Avatar
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

// ── Current tab detection ──────────────────────────────────────────────────

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
        <div class="current-chapter">Chapter ${page.chapter} · ${escapeHtml(page.site)}</div>
      `
      showStatus('Tracking active — progress saved automatically', 'success')
    } else {
      container.innerHTML = '<div class="not-detected">Not a supported reading page</div>'
    }
  } catch (e) {
    // Can't inject into this tab (e.g. chrome:// pages)
  }
}

// This function runs inside the tab context
function detectPageInTab() {
  // Inline parsers (same as content.js)
  const PARSERS = [
    {
      match: /mangadex\.org\/chapter\//,
      parse() {
        const title = document.querySelector('h1')?.textContent?.trim() ?? null
        const m = document.title.match(/ch(?:apter)?\s*([\d.]+)/i)
        return { title, chapter: m ? parseFloat(m[1]) : null }
      }
    },
    {
      match: /webtoons\.com\/.+\/viewer/,
      parse() {
        const title = document.querySelector('.subj_info .subj, #subjectTitle')?.textContent?.trim() ?? null
        const m = location.href.match(/episode_no=(\d+)/)
        return { title, chapter: m ? parseInt(m[1]) : null }
      }
    },
    {
      match: /bato\.to\/chapter\//,
      parse() {
        const title = document.querySelector('h1 a, .series-name')?.textContent?.trim() ?? null
        const m = (document.querySelector('h2')?.textContent ?? document.title).match(/ch(?:apter)?\s*([\d.]+)/i)
        return { title, chapter: m ? parseFloat(m[1]) : null }
      }
    },
    {
      match: /(flixscans|reaperscans|asurascans|asuracomic|luminousscans|roliascan)\.(org|com|net|to)/,
      parse() {
        let title = null
        for (const c of document.querySelectorAll('.breadcrumb a')) {
          const t = c.textContent?.trim() ?? ''
          if (!title && t.length > 2 && !t.match(/home|chapter/i)) { title = t; break }
        }
        if (!title) { const m = document.title.match(/^(.+?)\s*[-–|]\s*chapter/i); if (m) title = m[1].trim() }
        const raw = (document.querySelector('h1')?.textContent ?? '').match(/chapter\s*([\d.]+)/i)?.[1]
          ?? location.pathname.match(/chapter-([\d.]+)/i)?.[1]
        return { title, chapter: raw ? parseFloat(raw) : null }
      }
    },
    {
      match: /comick\.(io|fun)/,
      parse() {
        const title = document.querySelector('h1')?.textContent?.trim() ?? null
        const m = location.pathname.match(/\/(\d+(?:\.\d+)?)-chapter/)
        return { title, chapter: m ? parseFloat(m[1]) : null }
      }
    },
    {
      match: /manhuaus\.com/,
      parse() {
        const title = document.querySelector('.breadcrumb a:nth-child(2)')?.textContent?.trim() ?? null
        const m = location.pathname.match(/chapter-([\d.]+)/i)
        return { title, chapter: m ? parseFloat(m[1]) : null }
      }
    },
    {
      match: /(manganato|chapmanganato)\.(com|to)/,
      parse() {
        const title = document.querySelector('.breadcrumb a:nth-child(2)')?.textContent?.trim() ?? null
        const m = document.querySelector('.panel-chapter-info-top h1')?.textContent?.match(/chapter\s*([\d.]+)/i)
        return { title, chapter: m ? parseFloat(m[1]) : null }
      }
    },
    {
      match: /tapas\.io\/episode/,
      parse() {
        const title = document.querySelector('.series-header__title, h1.title')?.textContent?.trim() ?? null
        const m = document.querySelector('.viewer__header-ep, .ep-num')?.textContent?.match(/([\d.]+)/)
        return { title, chapter: m ? parseFloat(m[1]) : null }
      }
    },
  ]

  for (const parser of PARSERS) {
    if (parser.match.test(location.href)) {
      try {
        const r = parser.parse()
        if (r.chapter && r.chapter > 0) {
          return { title: r.title, chapter: Math.floor(r.chapter), site: location.hostname.replace('www.', '') }
        }
      } catch(e) {}
    }
  }
  return null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function showStatus(msg, type) {
  const el = document.getElementById('status-msg')
  el.textContent = msg
  el.className = type
  if (type === 'success') {
    setTimeout(() => { el.className = ''; el.textContent = '' }, 4000)
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}