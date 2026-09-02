const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

export function decodeHtmlEntities(str) {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m)
}
