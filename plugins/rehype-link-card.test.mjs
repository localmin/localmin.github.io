/**
 * Tests for the link card plugin. Each test names the spec item it covers
 * (S1-S9 in the plan doc).
 *
 * Guaranteed:
 * - S1-S3, S8: which Markdown paragraphs become cards, and what a card shows,
 *   run through the real Astro Markdown pipeline with the fetch stubbed.
 * - S4-S6: how title, description and image are read from a page.
 * - S7: how the body of a page is decoded.
 * - S9: which results the shared fetcher reuses.
 *
 * Not guaranteed (checked by building and looking at the site):
 * - The network fetch itself: timeout, non-HTML responses, redirects.
 * - The card's appearance, and that it runs after rehype-add-classes so the
 *   article link and image styles stay off the card.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMarkdownProcessor } from '@astrojs/markdown-remark'
import { fromHtml } from 'hast-util-from-html'
import rehypeLinkCard, {
  cacheSuccesses,
  decodeBody,
  parseOgp
} from './rehype-link-card.mjs'

const PAGE = 'https://example.com/articles/1'

const OGP = {
  title: 'Card title',
  description: 'Card description',
  image: 'https://cdn.example.com/a.png'
}

// Astro unpacks `markdown.processor: unified({...})` into these options before
// creating the processor; the function itself takes the plugins directly.
const render = async (markdown, fetchOgp) => {
  const processor = await createMarkdownProcessor({
    rehypePlugins: [[rehypeLinkCard, { fetchOgp }]]
  })
  const { code } = await processor.render(markdown)
  return fromHtml(code, { fragment: true })
}

const elements = (node, tagName, found = []) => {
  if (node.type === 'element' && node.tagName === tagName) found.push(node)
  for (const child of node.children ?? []) elements(child, tagName, found)
  return found
}

const text = node =>
  node.type === 'text' ? node.value : (node.children ?? []).map(text).join('')

const isPlainLinkParagraph = tree => {
  const [paragraph] = elements(tree, 'p')
  return paragraph !== undefined && elements(paragraph, 'a').length === 1
}

test('S1: a paragraph holding only a URL becomes a card for that URL', async () => {
  const tree = await render(`${PAGE}\n`, async () => OGP)

  assert.equal(elements(tree, 'p').length, 0)
  const [card] = elements(tree, 'a')
  assert.equal(card.properties.href, PAGE)
  assert.match(text(card), /Card title/)
  assert.match(text(card), /Card description/)
  assert.match(text(card), /example\.com/)
  assert.equal(elements(card, 'img')[0]?.properties.src, OGP.image)
})

test('S5, S6: a page with only a title gets a card without description or image', async () => {
  const tree = await render(`${PAGE}\n`, async () => ({ title: 'Card title' }))

  const [card] = elements(tree, 'a')
  assert.equal(text(card), 'Card titleexample.com')
  assert.equal(elements(card, 'img').length, 0)
})

test('S2: a URL with non-ASCII characters becomes a card too', async () => {
  const tree = await render('https://ja.wikipedia.org/wiki/日本\n', async () => OGP)

  assert.equal(elements(tree, 'p').length, 0)
  assert.equal(
    elements(tree, 'a')[0].properties.href,
    'https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC'
  )
})

test('S2: a URL with a non-ASCII host becomes a card too', async () => {
  const tree = await render('https://日本語.jp/\n', async () => OGP)

  assert.equal(elements(tree, 'p').length, 0)
})

const plainLinks = [
  ['a titled link on its own line', `[Some title](${PAGE})\n`],
  ['a URL inside a sentence', `See ${PAGE} here\n`],
  ['a non-HTTP link', '<ftp://example.com/file>\n']
]

for (const [name, markdown] of plainLinks) {
  test(`S3: ${name} stays a plain link`, async () => {
    assert.ok(isPlainLinkParagraph(await render(markdown, async () => OGP)))
  })
}

const failures = [
  ['finds nothing', async () => null],
  ['throws', async () => { throw new Error('network down') }]
]

for (const [name, fetchOgp] of failures) {
  test(`S8: the URL stays a plain link when fetching ${name}`, async () => {
    assert.ok(isPlainLinkParagraph(await render(`${PAGE}\n`, fetchOgp)))
  })
}

test('S4: the title comes from og:title before <title>', () => {
  const html = `<title>Document title</title>
    <meta property="og:title" content="OG title">`
  assert.equal(parseOgp(html, PAGE).title, 'OG title')
})

test('S4: the title falls back to <title>', () => {
  assert.equal(parseOgp('<title> Document title </title>', PAGE)?.title, 'Document title')
})

test('S4: a page without any title gives no card data', () => {
  assert.equal(parseOgp('<p>no head</p>', PAGE), null)
})

test('S5: the description comes from og:description before the description meta', () => {
  const html = `<title>t</title>
    <meta name="description" content="Plain description">
    <meta property="og:description" content="OG description">`
  assert.equal(parseOgp(html, PAGE).description, 'OG description')
})

test('S5: the description falls back to the description meta', () => {
  const html = `<title>t</title><meta name="description" content="Plain description">`
  assert.equal(parseOgp(html, PAGE).description, 'Plain description')
})

test('S6: a relative image is resolved against the page URL', () => {
  const html = `<title>t</title><meta property="og:image" content="/img/a.png">`
  assert.equal(parseOgp(html, PAGE).image, 'https://example.com/img/a.png')
})

test('S6: an http image is dropped', () => {
  const html = `<title>t</title>
    <meta property="og:image" content="http://cdn.example.com/a.png">`
  assert.equal(parseOgp(html, PAGE).image, undefined)
})

// "あ" in Shift_JIS.
const SJIS_A = [0x82, 0xa0]

test('S7: the charset in Content-Type decides the encoding', () => {
  const bytes = new Uint8Array(SJIS_A)
  assert.equal(decodeBody(bytes, 'text/html; charset=Shift_JIS'), 'あ')
})

test('S7: without one in Content-Type, the charset in the document decides', () => {
  const head = new TextEncoder().encode('<meta charset="shift_jis">')
  const bytes = new Uint8Array([...head, ...SJIS_A])
  assert.match(decodeBody(bytes, 'text/html'), /あ$/)
})

test('S7: an unknown charset label falls back to UTF-8', () => {
  const bytes = new TextEncoder().encode('あ')
  assert.equal(decodeBody(bytes, 'text/html; charset=no-such-charset'), 'あ')
})

// Answers each call with the next of `results`.
const scripted = results => async () => results.shift()

test('S9: a successful result is reused', async () => {
  const fetchOgp = cacheSuccesses(scripted([OGP, null]))
  await fetchOgp(PAGE)
  assert.equal(await fetchOgp(PAGE), OGP)
})

test('S9: a URL whose fetch failed is fetched again', async () => {
  const fetchOgp = cacheSuccesses(scripted([null, OGP]))
  await fetchOgp(PAGE)
  assert.equal(await fetchOgp(PAGE), OGP)
})
