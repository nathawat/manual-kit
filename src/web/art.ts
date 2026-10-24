// The theme's own illustrations (DESIGN.md "Illustrations"): line drawings that fit any product, as SVG symbols in
// one hidden sprite. Colours come only from currentColor and --art-bg / --art-accent / --art-on-accent, so every brand
// recolours them; a page draws one with <svg class="..."><use href="#a-hero"/></svg>.

/** The front page / cover drawing (viewBox 0 0 520 360). */
const HERO_BODY = `<rect class="sh" x="318" y="20" width="164" height="214" rx="6"/><path class="ln" d="M340 56h96M340 78h118M340 100h80M340 136h118M340 158h92M340 180h108"/>
<rect class="sh" x="28" y="70" width="384" height="262" rx="8"/><path class="ln" d="M28 100h384M122 100v232"/>
<circle class="dot" cx="48" cy="85" r="4"/><circle class="dot" cx="62" cy="85" r="4"/><circle class="dot" cx="76" cy="85" r="4"/>
<path class="ln" d="M46 124h56M46 172h56M46 196h56M46 220h38"/><rect class="ac" x="40" y="138" width="72" height="22" rx="4"/>
<path class="ln b" d="M146 132h118"/><path class="ln" d="M146 158h240M146 178h200"/>
<rect class="sh" x="146" y="200" width="114" height="62" rx="5"/><rect class="sh" x="272" y="200" width="116" height="62" rx="5"/>
<path class="ln" d="M160 222h56M160 240h80M286 222h60M286 240h76"/>
<rect class="ac" x="298" y="284" width="90" height="30" rx="5"/>
<path class="ln dash" d="M52 168C70 260 190 300 284 298"/>
<circle class="mk" cx="40" cy="149" r="14"/><text class="mkt" x="40" y="154.5">1</text>
<circle class="mk" cx="298" cy="284" r="14"/><text class="mkt" x="298" y="289.5">2</text>
<path class="sh" d="M368 300v38l10-9 8 17 8-4-8-16h14z"/>`
const HERO = `<symbol id="a-hero" viewBox="0 0 520 360">${HERO_BODY}</symbol>`

/** The drawing as a stand-alone SVG (the PDF cover), styled by its own classes. */
export const heroSvg = (cls: string) => `<svg class="${cls}" viewBox="0 0 520 360" aria-hidden="true">${HERO_BODY}</svg>`

const USER = `<symbol id="a-user" viewBox="0 0 120 96">
<rect class="sh" x="36" y="8" width="78" height="56" rx="5"/><path class="ln" d="M36 20h78M46 32h40M46 44h56"/><rect class="ac" x="84" y="49" width="22" height="9" rx="2"/>
<circle class="sh" cx="30" cy="52" r="13"/><path class="sh" d="M6 92c0-15 10-24 24-24s24 9 24 24z"/>
</symbol>`

const ADMIN = `<symbol id="a-admin" viewBox="0 0 120 96">
<rect class="sh" x="48" y="8" width="66" height="80" rx="5"/><path class="ln" d="M60 28h42M60 48h42M60 68h42"/>
<circle class="ac" cx="88" cy="28" r="6"/><circle class="ac" cx="70" cy="48" r="6"/><circle class="ac" cx="94" cy="68" r="6"/>
<path class="ln b" d="M28 40v6M28 74v6M11 60h6M39 60h6M16 48l4 4M36 68l4 4M16 72l4-4M36 52l4-4"/><circle class="sh" cx="28" cy="60" r="12"/><circle class="sh" cx="28" cy="60" r="4"/>
</symbol>`

/** Symbol ids for the guide cards of the front page, used in turn. */
export const GUIDE_ART = ['a-user', 'a-admin'] as const

/** The hidden sprite; `hero` adds the front page's drawing. */
export const artSymbols = (hero: boolean) =>
  `<svg class="art-sym" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">${hero ? HERO : ''}${USER}${ADMIN}</svg>`
