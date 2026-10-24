// manual-kit web: sidebar drawer, live search (top bar dropdown, results page), role picker and filter, "on this page"
// scroll-spy, print, clip players, step walkthrough zoom, FAQ filters, video gallery dialog. Plain DOM, no outside requests.
;(() => {
  const $ = (sel, root = document) => root.querySelector(sel)
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]
  const words = window.ManualKitWords || {}
  const store = {
    get: (k) => {
      try {
        return localStorage.getItem(k)
      } catch {
        return null
      }
    },
    set: (k, v) => {
      try {
        localStorage.setItem(k, v)
      } catch {
        // private mode: the choice only lasts for this page
      }
    },
  }
  const typing = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))

  // ---------- sidebar drawer (phones / narrow windows) ----------
  const toggle = $('.nav-toggle')
  const side = $('#site-nav')
  const scrim = $('.scrim')
  const setNav = (open) => {
    if (!toggle || !side) return
    toggle.setAttribute('aria-expanded', String(open))
    side.classList.toggle('open', open)
    if (scrim) scrim.hidden = !open
    document.body.classList.toggle('lock', open)
    if (open) ($('[aria-current="page"]', side) || $('a', side))?.focus({ preventScroll: true })
  }
  toggle?.addEventListener('click', () => setNav(toggle.getAttribute('aria-expanded') !== 'true'))
  scrim?.addEventListener('click', () => setNav(false))
  $('.side-close')?.addEventListener('click', () => {
    setNav(false)
    toggle?.focus()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && toggle?.getAttribute('aria-expanded') === 'true') {
      setNav(false)
      toggle.focus()
    }
  })
  $('[aria-current="page"]', side || document)?.scrollIntoView({ block: 'nearest' })

  // ---------- role ("I am a..."): sidebar chips, picker cards, filtered lists, the role's files ----------
  // The role is kept per book in localStorage; without it (private mode, no JS) every page shows.
  const roleKey = (book) => `manual-kit:aud:${book}`
  const listOf = (el, attr) => (el.dataset[attr] ? el.dataset[attr].split('|') : [])
  const aud = $('.aud')
  const markCards = (book, value) => {
    for (const a of $$(`.rpick[data-book="${CSS.escape(book)}"]`)) {
      const on = a.dataset.aud === value
      a.closest('.rcard')?.classList.toggle('is-on', on)
      if (on) a.setAttribute('aria-current', 'true')
      else a.removeAttribute('aria-current')
    }
  }
  const applyRole = (value) => {
    for (const b of $$('.chip', aud)) b.setAttribute('aria-pressed', String(b.dataset.aud === value))
    for (const li of $$('li[data-aud]')) {
      const list = listOf(li, 'aud')
      li.hidden = !!value && list.length > 0 && !list.includes(value)
    }
    for (const g of $$('.group', side)) {
      const n = $$('li', g).filter((li) => !li.hidden).length
      const small = $('summary small', g)
      if (small) small.textContent = String(n)
      g.hidden = n === 0
    }
    for (const sec of $$('.home section')) {
      const items = $$('li[data-aud]', sec)
      if (items.length) sec.hidden = items.every((li) => li.hidden)
    }
    for (const li of $$('.side-downloads li[data-for]')) li.classList.toggle('is-on', !!value && listOf(li, 'for').includes(value))
    markCards(aud.dataset.book, value)
    // previous / next skip the pages the role does not see
    const shown = $$('.group li', side).filter((li) => !li.hidden).map((li) => $('a', li))
    const at = shown.findIndex((x) => x.getAttribute('aria-current') === 'page')
    for (const [rel, step] of [['prev', -1], ['next', 1]]) {
      const link = $(`.pager a[rel="${rel}"]`)
      if (!link || at < 0) continue
      link.dataset.href ??= link.getAttribute('href')
      link.dataset.title ??= $('strong', link).textContent
      const to = value ? shown[at + step] : null
      link.hidden = !!value && !to
      link.href = to ? to.getAttribute('href') : link.dataset.href
      $('strong', link).textContent = to ? to.textContent : link.dataset.title
    }
  }
  if (aud) {
    aud.addEventListener('click', (e) => {
      const b = e.target.closest('.chip')
      if (!b) return
      store.set(roleKey(aud.dataset.book), b.dataset.aud)
      applyRole(b.dataset.aud)
    })
    // ?role=<id> (a link from the app for the signed-in user's role) picks the role and keeps it
    const asked = new URLSearchParams(location.search).get('role')
    const known = (v) => v !== null && $$('.chip', aud).some((b) => b.dataset.aud === v)
    if (known(asked)) store.set(roleKey(aud.dataset.book), asked)
    const saved = known(asked) ? asked : store.get(roleKey(aud.dataset.book))
    applyRole(known(saved) ? saved : '')
  }
  for (const book of new Set($$('.rpick').map((a) => a.dataset.book))) if (!aud || aud.dataset.book !== book) markCards(book, store.get(roleKey(book)) ?? '')
  for (const a of $$('.rpick')) {
    a.addEventListener('click', (e) => {
      store.set(roleKey(a.dataset.book), a.dataset.aud)
      if (aud && aud.dataset.book === a.dataset.book) {
        e.preventDefault()
        applyRole(a.dataset.aud)
        $('.chip[aria-pressed="true"]', aud)?.scrollIntoView({ block: 'nearest' })
      }
    })
  }

  // ---------- light / dark: the switch overrides the system setting and is kept per browser ----------
  for (const b of $$('.theme-toggle')) {
    b.addEventListener('click', () => {
      const root = document.documentElement
      const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
      root.dataset.theme = dark ? 'light' : 'dark'
      try { localStorage.setItem('mk-theme', root.dataset.theme) } catch {}
    })
  }

  // ---------- print ----------
  for (const b of $$('[data-print]')) {
    b.hidden = false
    b.addEventListener('click', () => window.print())
  }

  // ---------- "on this page" scroll-spy ----------
  const tocLinks = $$('.toc a')
  if (tocLinks.length && 'IntersectionObserver' in window) {
    const byId = new Map(tocLinks.map((a) => [decodeURIComponent(a.hash.slice(1)), a]))
    const heads = [...byId.keys()].map((id) => document.getElementById(id)).filter(Boolean)
    const visible = new Set()
    const mark = () => {
      let id = heads.find((h) => visible.has(h.id))?.id
      if (!id) {
        // between headings: the last one above the fold
        const above = heads.filter((h) => h.getBoundingClientRect().top < 120)
        id = above.at(-1)?.id ?? heads[0]?.id
      }
      for (const [k, a] of byId) a.classList.toggle('is-active', k === id)
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) (en.isIntersecting ? visible.add(en.target.id) : visible.delete(en.target.id))
        mark()
      },
      { rootMargin: '-72px 0px -60% 0px' },
    )
    for (const h of heads) io.observe(h)
    mark()
  }

  // ---------- clip players ----------
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const musicOn = store.get('manual-kit:music') !== 'off'
  for (const fig of $$('figure[data-clip]')) {
    const video = $('video', fig)
    const cover = $('.clip-cover', fig)
    const music = $('[data-music]', fig)
    const cc = $('[data-cc]', fig)
    if (!video) continue
    const img = $('img', cover || fig)
    if (reduced && img?.dataset.poster) img.src = img.dataset.poster
    video.muted = !musicOn
    music?.setAttribute('aria-pressed', String(musicOn))
    cover?.addEventListener('click', () => {
      fig.classList.add('is-playing')
      video.play().catch(() => {})
      video.focus()
    })
    video.addEventListener('play', () => fig.classList.add('is-playing'))
    music?.addEventListener('click', () => {
      const on = music.getAttribute('aria-pressed') !== 'true'
      music.setAttribute('aria-pressed', String(on))
      video.muted = !on
      store.set('manual-kit:music', on ? 'on' : 'off')
    })
    cc?.addEventListener('click', () => {
      const on = cc.getAttribute('aria-pressed') !== 'true'
      cc.setAttribute('aria-pressed', String(on))
      for (const t of video.textTracks) t.mode = on ? 'showing' : 'hidden'
    })
  }

  // ---------- step walkthrough: enlarge, previous / next, arrow keys ----------
  let dialog = null
  const openStep = (walk, index) => {
    const steps = $$('li.step', walk)
    const i = Math.max(0, Math.min(steps.length - 1, index))
    const step = steps[i]
    const img = $('img', step)
    if (!img) return
    if (!dialog) {
      dialog = document.createElement('dialog')
      dialog.className = 'lightbox'
      dialog.innerHTML = `<div class="lightbox-head"><p></p><button type="button" class="btn" data-close></button></div><img alt=""><div class="lightbox-nav"><button type="button" class="btn" data-prev></button><span></span><button type="button" class="btn" data-next></button></div>`
      $('[data-close]', dialog).textContent = words.close || 'Close'
      $('[data-prev]', dialog).textContent = `‹ ${words.prev || 'Previous'}`
      $('[data-next]', dialog).textContent = `${words.next || 'Next'} ›`
      $('[data-close]', dialog).addEventListener('click', () => dialog.close())
      dialog.addEventListener('click', (e) => e.target === dialog && dialog.close())
      document.body.append(dialog)
    }
    $('p', dialog).textContent = `${i + 1}. ${$('.step-text', step)?.textContent.replace(/^\s*\d+\s*/, '').trim() ?? ''}`
    const big = $('img', dialog)
    big.src = img.currentSrc || img.src
    big.alt = img.alt
    $('.lightbox-nav span', dialog).textContent = `${i + 1} / ${steps.length}`
    const prev = $('[data-prev]', dialog)
    const next = $('[data-next]', dialog)
    prev.disabled = i === 0
    next.disabled = i === steps.length - 1
    prev.onclick = () => openStep(walk, i - 1)
    next.onclick = () => openStep(walk, i + 1)
    dialog.onkeydown = (e) => {
      if (e.key === 'ArrowLeft' && i > 0) openStep(walk, i - 1)
      if (e.key === 'ArrowRight' && i < steps.length - 1) openStep(walk, i + 1)
    }
    if (!dialog.open) dialog.showModal()
  }
  for (const walk of $$('.walk')) {
    $$('li.step', walk).forEach((step, i) => {
      const img = $('figure img', step)
      if (!img) return
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'zoom'
      b.setAttribute('aria-label', `${walk.dataset.zoom || 'Enlarge'}: ${img.alt}`)
      img.replaceWith(b)
      b.append(img)
      b.insertAdjacentHTML('beforeend', '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M11 8v6M8 11h6"/></svg>')
      b.addEventListener('click', () => openStep(walk, i))
    })
  }

  // ---------- FAQ page: text, book and symptom-type filters; a card opens to show the fix; #faq-N opens one ----------
  const faq = $('.faq')
  if (faq) {
    const input = $('#faq-q', faq)
    const cards = $$('.faq-card', faq)
    const count = $('.faq-count', faq)
    const empty = $('.faq-empty', faq)
    const state = { book: '', type: '' }
    const tokens = (q) => (window.ManualKitSearch ? window.ManualKitSearch.tokenize(q) : q.toLowerCase().split(/\s+/).filter(Boolean))
    const open = (card, on) => {
      card.classList.toggle('open', on)
      const b = $('.faq-toggle', card)
      b.setAttribute('aria-expanded', String(on))
      $('span', b).textContent = on ? words.hideFix || 'Hide the fix' : words.showFix || 'Show the fix'
    }
    const apply = () => {
      const ws = tokens(input.value)
      let shown = 0
      for (const c of cards) {
        const text = $$('.faq-q, .faq-a p', c).map((e) => e.textContent).join(' ').toLowerCase()
        const ok = (!state.book || c.dataset.book === state.book) && (!state.type || c.dataset.type === state.type) && ws.every((w) => text.includes(w))
        c.hidden = !ok
        if (ok) shown += 1
      }
      count.textContent = count.dataset.count.replace('{n}', String(shown))
      empty.hidden = shown > 0
    }
    const pick = (sel, key, value) => {
      for (const b of $$(sel, faq)) b.setAttribute('aria-pressed', String(b.dataset[key] === value))
      state[key] = value
    }
    faq.addEventListener('click', (e) => {
      const t = e.target.closest('.faq-toggle, .faq-book, .faq-types .chip')
      if (!t) return
      if (t.matches('.faq-toggle')) return open(t.closest('.faq-card'), t.getAttribute('aria-expanded') !== 'true')
      if (t.matches('.faq-book')) pick('.faq-book', 'book', t.dataset.book)
      else pick('.faq-types .chip', 'type', t.dataset.type)
      apply()
    })
    input.addEventListener('input', apply)
    const fromHash = () => {
      const id = decodeURIComponent(location.hash.slice(1))
      const card = id && document.getElementById(id)
      if (!card || !card.classList.contains('faq-card')) return
      if (card.hidden) {
        input.value = ''
        pick('.faq-book', 'book', '')
        pick('.faq-types .chip', 'type', '')
        apply()
      }
      open(card, true)
      card.scrollIntoView({ block: 'start' })
      $('.faq-toggle', card).focus({ preventScroll: true })
    }
    addEventListener('hashchange', fromHash)
    fromHash()
  }

  // ---------- video gallery: the thumbnail plays the clip in a dialog with captions and a link to its page ----------
  let player = null
  for (const thumb of $$('.vthumb')) {
    thumb.addEventListener('click', () => {
      if (!player) {
        player = document.createElement('dialog')
        player.className = 'lightbox vplayer'
        player.innerHTML = `<div class="lightbox-head"><p></p><button type="button" class="btn" data-close></button></div><video controls playsinline></video><div class="lightbox-nav"><button type="button" class="btn" data-cc aria-pressed="false"></button><a class="btn" data-steps></a></div>`
        $('[data-close]', player).textContent = words.close || 'Close'
        $('[data-cc]', player).textContent = words.captions || 'Captions'
        $('[data-steps]', player).textContent = `${words.readSteps || 'Read the steps'} ›`
        const stop = () => {
          const v = $('video', player)
          v.pause()
          v.removeAttribute('src')
          v.replaceChildren()
          v.load()
        }
        $('[data-close]', player).addEventListener('click', () => player.close())
        player.addEventListener('click', (e) => e.target === player && player.close())
        player.addEventListener('close', stop)
        $('[data-cc]', player).addEventListener('click', (e) => {
          const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'
          e.currentTarget.setAttribute('aria-pressed', String(on))
          for (const t of $('video', player).textTracks) t.mode = on ? 'showing' : 'hidden'
        })
        document.body.append(player)
      }
      const video = $('video', player)
      const source = document.createElement('source')
      source.src = thumb.dataset.video
      source.type = 'video/mp4'
      video.replaceChildren(source)
      if (thumb.dataset.vtt) {
        const track = document.createElement('track')
        track.kind = 'captions'
        track.src = thumb.dataset.vtt
        track.srclang = document.documentElement.lang
        track.label = words.captions || 'Captions'
        video.append(track)
      }
      video.setAttribute('aria-label', thumb.dataset.title)
      video.load()
      $('[data-cc]', player).setAttribute('aria-pressed', 'false')
      $('p', player).textContent = thumb.dataset.title
      $('[data-steps]', player).href = thumb.dataset.href
      player.showModal()
      video.play().catch(() => {})
    })
  }

  // ---------- search ----------
  const core = window.ManualKitSearch
  const index = window.ManualKitIndex
  // the front page has no top-bar search: its hero search takes the shortcuts
  const box = $('#q') || $('#hq')
  const form = box?.form
  const list = $('#search-results')
  const status = $('#search-status')
  const onResultsPage = !!(list && status)

  // ⌘K / Ctrl+K and "/" jump to the search box
  document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase()
    const combo = k === 'k' && (e.metaKey || e.ctrlKey) && !e.altKey
    const slash = e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(document.activeElement)
    if (!box || !(combo || slash)) return
    e.preventDefault()
    form?.classList.add('open')
    box.focus()
    box.select()
  })
  const kbd = $('.kbd')
  if (kbd && !/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) kbd.textContent = 'Ctrl K'
  $('.search-open')?.addEventListener('click', () => {
    const open = !form?.classList.contains('open')
    form?.classList.toggle('open', open)
    if (open) box?.focus()
  })
  if (!core || !index || !box) return

  let terms = []
  /** Text with every query word wrapped in <mark>, built with DOM nodes (never innerHTML). */
  const marked = (text) => {
    const frag = document.createDocumentFragment()
    const low = text.toLowerCase()
    let i = 0
    let plain = ''
    while (i < text.length) {
      const w = terms.find((w) => w && low.startsWith(w, i))
      if (w) {
        if (plain) frag.append(plain)
        plain = ''
        const m = document.createElement('mark')
        m.textContent = text.slice(i, i + w.length)
        frag.append(m)
        i += w.length
      } else {
        plain += text[i]
        i += 1
      }
    }
    if (plain) frag.append(plain)
    return frag
  }
  const snippet = (text) => {
    const low = text.toLowerCase()
    let at = -1
    for (const w of terms) {
      const i = low.indexOf(w)
      if (i >= 0 && (at < 0 || i < at)) at = i
    }
    const start = Math.max(0, at - 60)
    const end = Math.min(text.length, Math.max(at, 0) + 160)
    return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`
  }
  /** The roles a result's page is for, as small tags. */
  const roleTags = (roles) => {
    const span = document.createElement('span')
    span.className = 'roles-of'
    for (const r of roles) {
      const tag = document.createElement('span')
      tag.className = 'tag tag--aud'
      tag.textContent = r
      span.append(tag)
    }
    return span
  }
  const find = (query) => {
    terms = core.tokenize(query).sort((a, b) => b.length - a.length)
    return query.trim() ? core.search(index, query) : []
  }

  // results page: the top bar box drives the list
  const baseTitle = document.title
  const renderPage = (query) => {
    list.replaceChildren()
    const hits = find(query).slice(0, 50)
    if (!query.trim()) {
      status.textContent = ''
      document.title = baseTitle
      return
    }
    for (const h of hits) {
      const d = index.docs[h.doc]
      const li = document.createElement('li')
      const a = document.createElement('a')
      a.href = d.u
      a.append(marked(d.t))
      li.append(a)
      if (d.t !== d.c) {
        const where = document.createElement('span')
        where.className = 'where'
        where.textContent = d.c
        li.append(where)
      }
      if (d.r) li.append(roleTags(d.r))
      if (d.x) {
        const p = document.createElement('p')
        p.append(marked(snippet(d.x)))
        li.append(p)
      }
      list.append(li)
    }
    status.textContent = hits.length ? status.dataset.results.replace('{n}', String(hits.length)) : status.dataset.none
    document.title = `${query} — ${baseTitle}`
  }

  // every other page: a dropdown under each search box (the top bar, and the hero of the front page)
  const dropdown = (input, pop) => {
    let sel = -1
    let timer = 0
    const links = () => $$('li a', pop)
    const select = (i) => {
      const all = links()
      sel = all.length ? (i + all.length) % all.length : -1
      $$('li', pop).forEach((li, k) => li.classList.toggle('is-sel', k === sel))
      all[sel]?.scrollIntoView({ block: 'nearest' })
    }
    const close = () => {
      pop.hidden = true
      sel = -1
    }
    const render = (query) => {
      pop.replaceChildren()
      if (!query.trim()) return close()
      const hits = find(query)
      if (!hits.length) {
        const p = document.createElement('p')
        p.className = 'none'
        p.textContent = words.none || ''
        pop.append(p)
      } else {
        const ul = document.createElement('ul')
        for (const h of hits.slice(0, 8)) {
          const d = index.docs[h.doc]
          const li = document.createElement('li')
          const a = document.createElement('a')
          a.href = d.u
          const t = document.createElement('strong')
          t.append(marked(d.t))
          a.append(t)
          if (d.t !== d.c) {
            const where = document.createElement('span')
            where.className = 'where'
            where.textContent = d.c
            a.append(where)
          }
          if (d.r) a.append(roleTags(d.r))
          if (d.x) {
            const sn = document.createElement('span')
            sn.className = 'snip'
            sn.append(marked(snippet(d.x)))
            a.append(sn)
          }
          li.append(a)
          ul.append(li)
        }
        pop.append(ul)
        const all = document.createElement('a')
        all.className = 'all'
        all.href = `${input.form?.getAttribute('action') || 'search.html'}?q=${encodeURIComponent(query)}`
        all.textContent = `${words.all || 'All results'} (${hits.length}) →`
        pop.append(all)
      }
      pop.hidden = false
      select(hits.length ? 0 : -1)
    }
    input.addEventListener('input', () => {
      clearTimeout(timer)
      timer = setTimeout(() => render(input.value), 150)
    })
    input.addEventListener('keydown', (e) => {
      if (pop.hidden) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        select(sel + (e.key === 'ArrowDown' ? 1 : -1))
      } else if (e.key === 'Escape') {
        close()
      } else if (e.key === 'Enter' && sel >= 0) {
        e.preventDefault()
        location.href = links()[sel].href
      }
    })
    document.addEventListener('click', (e) => {
      if (!pop.hidden && !input.form?.contains(e.target)) close()
    })
  }

  if (onResultsPage) {
    let timer = 0
    box.addEventListener('input', () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const q = box.value
        const url = new URL(location.href)
        if (q.trim()) url.searchParams.set('q', q)
        else url.searchParams.delete('q')
        history.replaceState(null, '', url)
        renderPage(q)
      }, 150)
    })
    form?.addEventListener('submit', (e) => {
      e.preventDefault()
      clearTimeout(timer)
      renderPage(box.value)
    })
  }
  for (const f of $$('form[role="search"]')) {
    const input = $('input[type="search"]', f)
    const p = $('.pop', f)
    if (input && p && !(onResultsPage && input === box)) dropdown(input, p)
  }
  // "try" hints under the front page search fill it
  for (const b of $$('.try button[data-hint]')) {
    b.addEventListener('click', () => {
      const input = $('input[type="search"]', b.closest('header, section') || document)
      if (!input) return
      input.value = b.dataset.hint
      input.focus()
      input.dispatchEvent(new Event('input'))
    })
  }
  if (onResultsPage) {
    const query = new URLSearchParams(location.search).get('q') || ''
    box.value = query
    renderPage(query)
  }
})()
