// Where pages of the web build live. Shared by the web builder and by PDF/DOCX (QR codes under clips).

/** File name of a chapter page in the web build. */
export const pageFile = (id: string) => `${id}.html`

/** URL of a page when the site's base is known: `<base>/<book>/<lang>/<file>`. */
export function webUrl(base: string | undefined, book: string, lang: string, file = 'index.html'): string | undefined {
  if (!base) return undefined
  return `${base.replace(/\/?$/, '/')}${book}/${lang}/${file}`
}

/** Only a full http(s) URL can go into a QR code on paper. */
export const isAbsoluteHttp = (u: string | undefined): u is string => !!u && /^https?:\/\//.test(u)
