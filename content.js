// content.js — injected into supported reading sites
// Detects chapter number silently and syncs to ManhwaTrack

// ── Site-specific parsers (high accuracy) ────────────────────────────────────
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
    match: /(asurascans|asuracomic|flixscans|reaperscans|luminousscans|roliascan)\.(com|net|org|to)/,
    parse() {
      let title = null
      for (const c of document.querySelectorAll('.breadcrumb a, nav a, .series-title, h2 a')) {
        const t = c.textContent?.trim() ?? ''
        if (t.length > 2 && !t.match(/home|chapter|prev|next/i)) { title = t; break }
      }
      if (!title) { const m = document.title.match(/^(.+?)\s*[-–|]\s*chapter/i); if (m) title = m[1].trim() }
      if (!title) {
        const urlM = location.pathname.match(/\/(?:comics|series)\/(.+?)-[a-f0-9]{6,8}(?:\/|$)/i)
        if (urlM) title = urlM[1].replace(/-/g, ' ')
      }
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

// ── Generic parser — works on ANY site ───────────────────────────────────────
// Runs when no specific parser matches, as long as URL has chapter/episode pattern
function genericParse() {
  const path = location.pathname + location.href

  // Extract chapter from URL — supports all common patterns:
  // /chapter/196, /chapter-196, /ch-196, /ch.196, ?chapter=196, /196/ (after series name)
  const chapterPatterns = [
    /\/chapter[\/\-\.]([\d.]+)/i,
    /\/ch[\/\-\.]([\d.]+)/i,
    /[?&]chapter=([\d.]+)/i,
    /\/episode[\/\-]([\d.]+)/i,
    /\/ep[\/\-]([\d.]+)/i,
    /-chapter-([\d.]+)/i,
    // Matches "title-name-chapter-125" at end of path segment
    /[a-z]+-chapter-([\d.]+)\/?$/i,
    // Matches "title-125" where 125 is at very end (risky but useful)
    // Only if preceded by known keywords
    /(?:vol|volume|chap|ch)[.\-_]?([\d.]+)/i,
  ]

  let chapter = null
  for (const pattern of chapterPatterns) {
    const m = path.match(pattern)
    if (m) { chapter = parseFloat(m[1]); break }
  }

  if (!chapter) return null

  // Extract title — try multiple sources
  let title = null

  // 1. Breadcrumb (most reliable)
  const crumbs = document.querySelectorAll('.breadcrumb a, nav.breadcrumb a, [class*="breadcrumb"] a')
  for (const c of crumbs) {
    const t = c.textContent?.trim() ?? ''
    if (t.length > 2 && !t.match(/home|chapter|episode|read|manga|manhwa/i)) { title = t; break }
  }

  // 2. Page title — strip "Chapter X" and site name
  if (!title) {
    let pageTitle = document.title
      .replace(/[-|–|·].*chapter.*/i, '')
      .replace(/\s*[-|–|·]\s*[^-|–|·]+$/, '') // remove site name suffix
      .trim()
    if (pageTitle.length > 2 && pageTitle.length < 100) title = pageTitle
  }

  // 3. First h1 on page
  if (!title) {
    const h1 = document.querySelector('h1')?.textContent
      ?.replace(/chapter\s*[\d.]+.*/i, '')
      ?.trim()
    if (h1 && h1.length > 2 && h1.length < 100) title = h1
  }

  // Clean title — remove chapter suffix if present
  if (title) title = title.replace(/\s*[-–]\s*chapter\s*[\d.]+.*/i, '').trim()

  return { title, chapter }
}

// ── Main detection ────────────────────────────────────────────────────────────
function detectCurrentPage() {
  const href = location.href

  // Try specific parsers first
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

  // Generic fallback — works on ANY site with chapter in URL
  const generic = genericParse()
  if (generic && generic.chapter > 0) {
    return {
      site: location.hostname.replace('www.', ''),
      title: generic.title,
      chapter: Math.floor(generic.chapter),
      url: href,
    }
  }

  return null
}

// ── Sync ──────────────────────────────────────────────────────────────────────
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
      }),
    })

    if (res.ok) {
      lastSynced = { chapter: page.chapter, title: page.title }
      chrome.runtime.sendMessage({
        type: 'CHAPTER_SYNCED',
        data: { title: page.title, chapter: page.chapter, site: page.site },
      })
    }
  } catch (e) {}
}

trySync()

let lastHref = location.href
const observer = new MutationObserver(() => {
  if (location.href !== lastHref) {
    lastHref = location.href
    setTimeout(trySync, 1500)
  }
})
observer.observe(document.body, { childList: true, subtree: true })
setTimeout(trySync, 2000)