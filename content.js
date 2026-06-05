// content.js — injected into supported reading sites
// Detects chapter number silently and syncs to ManhwaTrack

// Paste sites.js parsers inline (content scripts can't import modules)

const PARSERS = [
  {
    match: /mangadex\.org\/chapter\//,
    parse() {
      const title = document.querySelector('h1')?.textContent?.trim() ?? null
      let chapter = null
      const titleMatch = document.title.match(/ch(?:apter)?\s*([\d.]+)/i)
      if (titleMatch) chapter = parseFloat(titleMatch[1])
      return { title, chapter }
    }
  },
  {
    match: /webtoons\.com\/.+\/viewer/,
    parse() {
      const title = document.querySelector('.subj_info .subj, #subjectTitle')?.textContent?.trim() ?? null
      const urlMatch = location.href.match(/episode_no=(\d+)/)
      return { title, chapter: urlMatch ? parseInt(urlMatch[1]) : null }
    }
  },
  {
    match: /bato\.to\/chapter\//,
    parse() {
      const title = document.querySelector('h1 a, .series-name')?.textContent?.trim() ?? null
      const match = (document.querySelector('h2, .chap-name')?.textContent ?? document.title).match(/ch(?:apter)?\s*([\d.]+)/i)
      return { title, chapter: match ? parseFloat(match[1]) : null }
    }
  },
  {
    match: /(flixscans|reaperscans|asurascans|asuracomic|luminousscans|roliascan)\.(org|com|net|to)/,
    parse() {
      let title = null
      const crumbs = document.querySelectorAll('.breadcrumb a')
      for (const c of crumbs) {
        const t = c.textContent?.trim() ?? ''
        if (!title && t.length > 2 && !t.match(/home|chapter/i)) title = t
      }
      if (!title) {
        const m = document.title.match(/^(.+?)\s*[-–|]\s*chapter/i)
        if (m) title = m[1].trim()
      }
      const raw = (document.querySelector('h1')?.textContent ?? '').match(/chapter\s*([\d.]+)/i)?.[1]
        ?? location.pathname.match(/chapter-([\d.]+)/i)?.[1]
      return { title, chapter: raw ? parseFloat(raw) : null }
    }
  },
  {
    match: /comick\.(io|fun)/,
    parse() {
      const title = document.querySelector('h1')?.textContent?.trim() ?? null
      const urlMatch = location.pathname.match(/\/(\d+(?:\.\d+)?)-chapter/)
      return { title, chapter: urlMatch ? parseFloat(urlMatch[1]) : null }
    }
  },
  {
    match: /manhuaus\.com/,
    parse() {
      const title = document.querySelector('.breadcrumb a:nth-child(2)')?.textContent?.trim() ?? null
      const urlMatch = location.pathname.match(/chapter-([\d.]+)/i)
      return { title, chapter: urlMatch ? parseFloat(urlMatch[1]) : null }
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

function detectCurrentPage() {
  const href = location.href
  for (const parser of PARSERS) {
    if (parser.match.test(href)) {
      try {
        const result = parser.parse()
        if (result.chapter && result.chapter > 0) {
          return {
            site: location.hostname.replace('www.', ''),
            title: result.title,
            chapter: Math.floor(result.chapter),
            url: href,
          }
        }
      } catch (e) {}
    }
  }
  return null
}

// ── Throttled sync ──────────────────────────────────────────────────────────

let lastSynced = null  // { chapter, title }

function shouldSync(detected) {
  if (!lastSynced) return true
  if (lastSynced.chapter !== detected.chapter) return true
  if (lastSynced.title !== detected.title) return true
  return false
}

async function trySync() {
  const page = detectCurrentPage()
  if (!page) return
  if (!shouldSync(page)) return

  // Get auth token from storage
  const { authToken, userId } = await chrome.storage.local.get(['authToken', 'userId'])
  if (!authToken) return  // Not logged in — silent, do nothing

  try {
    const res = await fetch('https://manhwatrack.com/api/extension/track', {
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
      }),
    })

    if (res.ok) {
      lastSynced = { chapter: page.chapter, title: page.title }
      // Update badge in background
      chrome.runtime.sendMessage({
        type: 'CHAPTER_SYNCED',
        data: { title: page.title, chapter: page.chapter, site: page.site },
      })
    }
  } catch (e) {
    // Network error — silent
  }
}

// Run on page load, then watch for URL changes (SPA navigation)
trySync()

// Watch for SPA navigation (MangaDex, Webtoon etc. navigate without full reload)
let lastHref = location.href
const observer = new MutationObserver(() => {
  if (location.href !== lastHref) {
    lastHref = location.href
    // Small delay to let page content render
    setTimeout(trySync, 1500)
  }
})
observer.observe(document.body, { childList: true, subtree: true })

// Also re-run after a short delay for slow-loading pages
setTimeout(trySync, 2000)
