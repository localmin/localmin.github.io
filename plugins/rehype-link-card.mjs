/**
 * Renders a paragraph that holds nothing but a bare URL as a link card: the
 * linked page's title, description, host and image, read from its Open Graph
 * metadata at build time.
 *
 * Only a link whose text is the URL itself qualifies, so `[title](url)` on its
 * own line stays a plain link. When the metadata cannot be fetched, the
 * paragraph is left untouched and the build carries on.
 *
 * Run this after rehype-add-classes. The card replaces the whole paragraph, so
 * the article styles for <a> and <img> never reach the card's elements.
 */
import { fromHtml } from 'hast-util-from-html'

const CONCURRENCY = 8
const TIMEOUT_MS = 10_000
const USER_AGENT = 'Mozilla/5.0 (compatible; localmin.github.io link card)'

const CLASS = {
  card: 'my-6 flex h-32 overflow-hidden rounded-xl border border-slate-300 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800',
  body: 'flex min-w-0 flex-1 flex-col justify-center gap-1 overflow-hidden p-3 sm:p-4',
  title: 'line-clamp-2 font-bold',
  description: 'line-clamp-1 text-sm sm:line-clamp-2 text-slate-500 dark:text-zinc-400',
  host: 'truncate text-xs text-slate-500 dark:text-zinc-400',
  image: 'h-full w-28 shrink-0 object-cover sm:w-60'
}

const walk = (node, visit) => {
  if (node.type === 'element') visit(node)
  for (const child of node.children ?? []) walk(child, visit)
}

const textOf = node =>
  node.type === 'text' ? node.value : (node.children ?? []).map(textOf).join('')

export function parseOgp(html, baseUrl) {
  const meta = {}
  let documentTitle
  walk(fromHtml(html), node => {
    if (node.tagName === 'title' && documentTitle === undefined) {
      documentTitle = textOf(node).trim()
    }
    if (node.tagName !== 'meta') return
    const key = node.properties.property ?? node.properties.name
    const content = node.properties.content
    if (typeof key === 'string' && typeof content === 'string') {
      meta[key.toLowerCase()] ??= content.trim()
    }
  })

  const title = meta['og:title'] || documentTitle
  if (!title) return null

  return {
    title,
    description: meta['og:description'] || meta.description || undefined,
    image: httpsUrl(meta['og:image'], baseUrl)
  }
}

// Resolves `value` against `baseUrl`, keeping it only when it is https. The
// site is served over HTTPS, and browsers upgrade an http image to https, which
// breaks on a host without TLS, so a card without an image is safer.
const httpsUrl = (value, baseUrl) => {
  if (!value) return undefined
  try {
    const url = new URL(value, baseUrl)
    return url.protocol === 'https:' ? url.href : undefined
  } catch {
    return undefined
  }
}

const decoderFor = label => {
  try {
    return label ? new TextDecoder(label) : undefined
  } catch {
    // An unknown label throws a RangeError.
    return undefined
  }
}

export function decodeBody(bytes, contentType) {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType ?? '')?.[1]
  // A charset declaration has to sit in the first 1024 bytes, and is ASCII.
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024))
  const fromDocument = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1]
  const decoder =
    decoderFor(fromHeader) ?? decoderFor(fromDocument) ?? new TextDecoder()
  return decoder.decode(bytes)
}

async function fetchOgpOnce(url) {
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    const contentType = response.headers.get('content-type') ?? ''
    if (!response.ok || !contentType.includes('html')) return null
    const bytes = new Uint8Array(await response.arrayBuffer())
    return parseOgp(decodeBody(bytes, contentType), response.url || url)
  } catch {
    return null
  }
}

// Memoizes `fetchOgp` per URL, except for failures, so a URL that was down or
// timed out is fetched again on the next render instead of staying plain until
// the dev server restarts.
export function cacheSuccesses(fetchOgp) {
  const cache = new Map()
  return url => {
    if (!cache.has(url)) {
      const pending = fetchOgp(url)
      cache.set(url, pending)
      pending.then(
        ogp => ogp || cache.delete(url),
        () => cache.delete(url)
      )
    }
    return cache.get(url)
  }
}

// Shared across documents, so the dev server does not refetch on every edit.
const fetchOgpCached = cacheSuccesses(fetchOgpOnce)

// Returns the URL when `node` is a paragraph holding nothing but that URL.
const bareUrlOf = node => {
  if (node.tagName !== 'p') return undefined
  const children = node.children.filter(
    child => !(child.type === 'text' && child.value.trim() === '')
  )
  if (children.length !== 1) return undefined
  const [link] = children
  if (link.type !== 'element' || link.tagName !== 'a') return undefined
  const href = link.properties.href
  const isBareUrl =
    typeof href === 'string' &&
    /^https?:\/\//.test(href) &&
    isSameUrl(textOf(link).trim(), href)
  return isBareUrl ? href : undefined
}

// The Markdown pipeline percent-encodes non-ASCII characters in href but keeps
// the link text as written, so compare both in their normalized form. A host is
// percent-encoded in href but punycoded by URL, so href is normalized too.
const isSameUrl = (text, href) => {
  try {
    return new URL(text).href === new URL(href).href
  } catch {
    return false
  }
}

const element = (tagName, className, properties, children = []) => ({
  type: 'element',
  tagName,
  properties: { className: className.split(' '), ...properties },
  children
})

const textElement = (className, value) =>
  element('div', className, {}, [{ type: 'text', value }])

const card = (href, ogp) => {
  const body = element('div', CLASS.body, {}, [
    textElement(CLASS.title, ogp.title),
    ...(ogp.description ? [textElement(CLASS.description, ogp.description)] : []),
    textElement(CLASS.host, new URL(href).hostname)
  ])
  const image = ogp.image
    ? [element('img', CLASS.image, { src: ogp.image, alt: '', loading: 'lazy' })]
    : []
  return element('a', CLASS.card, { href }, [body, ...image])
}

// Runs `task` over `items` with at most `limit` in flight.
async function eachLimited(items, limit, task) {
  let next = 0
  const worker = async () => {
    while (next < items.length) await task(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

export default function rehypeLinkCard({ fetchOgp = fetchOgpCached } = {}) {
  return async tree => {
    const targets = []
    const visit = parent => {
      for (const [index, child] of (parent.children ?? []).entries()) {
        if (child.type !== 'element') continue
        const href = bareUrlOf(child)
        if (href) targets.push({ parent, index, href })
        else visit(child)
      }
    }
    visit(tree)

    await eachLimited(targets, CONCURRENCY, async ({ parent, index, href }) => {
      let ogp
      try {
        ogp = await fetchOgp(href)
      } catch {
        ogp = null
      }
      // Each replacement is one node for one node, so the indices stay valid.
      if (ogp) parent.children[index] = card(href, ogp)
    })
  }
}
