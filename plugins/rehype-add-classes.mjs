/**
 * Adds a fixed set of class names to elements, keyed by tag name.
 *
 * This replaces the `rehype-add-classes` package. That package is unmaintained
 * and depends on hast-util-select 1.x, which pins nth-check 1.x — a chain with
 * an open advisory and no fix inside the declared range. Every selector this
 * site configures is a bare tag name, so a plain tree walk is equivalent.
 *
 * Shiki emits a <code> element inside each highlighted block. It is an inline
 * element, so the boxed style intended for inline code would be painted once per
 * wrapped line of the block. Those elements are skipped.
 */
export default function rehypeAddClasses(classNamesByTagName) {
  const addTo = (node, className) => {
    const properties = (node.properties ??= {})
    const existing = properties.className
    if (Array.isArray(existing)) {
      properties.className = [...existing, ...className.split(' ')]
    } else if (existing) {
      properties.className = `${existing} ${className}`
    } else {
      properties.className = className
    }
  }

  const walk = (node, parent) => {
    if (node.type === 'element') {
      const className = classNamesByTagName[node.tagName]
      const isShikiCodeBlock =
        node.tagName === 'code' && parent && parent.tagName === 'pre'
      if (className && !isShikiCodeBlock) addTo(node, className)
    }
    if (node.children) for (const child of node.children) walk(child, node)
  }

  return tree => walk(tree, undefined)
}
