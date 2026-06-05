// content.js — injected into supported reading sites
// Detects chapter number silently and syncs to ManhwaTrack

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
    // Asurascans, Flixscans, Luminous etc — handles /chapter/325 AND /chapter-325
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
      // Asurascans URL: /comics/title-name-hexid/chapter/325
      if (!title) {
        const urlM = location.pathname.match(/\/(?:comics|series)\/(.+?)-[a-f0-9]{6,8}(?:\/|$)/i)
        if (urlM) title = urlM[1].replace(/-/g, ' ')
      }
      // Chapter: handles /chapter/325 AND /chapter-325
      const raw = location.pathname.match(/\/chapter[\/\-]([\d.]+)/i)?.[1]
        ?? (document.querySelector('h1')?.textContent ?? '').match(/chapter\s*([\d.]+)/i)?.[1]
      return { title, chapter: raw ? parseFloat(raw) : null }
    }
  },
  {
    match: /comick\.(io|fun)/,
    parse() {
      const title = document.querySelector('h1')?.textContent?.trim() ?? null
      const m = location.pathname.match(/\/([\d.]+)-chapter/)
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

// ── Throttled sync ────────────────────────────────────────────────────────────

let lastSynced = null

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

  const { authToken } = await chrome.storage.local.get(['authToken'])
  if (!authToken) return

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
      chrome.runtime.sendMessage({
        type: 'CHAPTER_SYNCED',
        data: { title: page.title, chapter: page.chapter, site: page.site },
      })
    }
  } catch (e) {
    // Network error — silent
  }
}

// Run on page load
trySync()

// Watch for SPA navigation
let lastHref = location.href
const observer = new MutationObserver(() => {
  if (location.href !== lastHref) {
    lastHref = location.href
    setTimeout(trySync, 1500)
  }
})
observer.observe(document.body, { childList: true, subtree: true })

// Re-run after delay for slow pages
setTimeout(trySync, 2000)