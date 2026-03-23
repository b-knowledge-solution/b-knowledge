const fs = require('fs')
const path = require('path')

const localeDir = path.join(__dirname, 'fe', 'src', 'i18n', 'locales')

const en = JSON.parse(fs.readFileSync(path.join(localeDir, 'en.json'), 'utf8'))
const vi = JSON.parse(fs.readFileSync(path.join(localeDir, 'vi.json'), 'utf8'))
const ja = JSON.parse(fs.readFileSync(path.join(localeDir, 'ja.json'), 'utf8'))

function flatten(obj, prefix = '') {
  const result = {}
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flatten(value, fullKey))
    } else {
      result[fullKey] = value
    }
  }
  return result
}

const enFlat = flatten(en)
const viFlat = flatten(vi)
const jaFlat = flatten(ja)

const allEnKeys = Object.keys(enFlat)

const missingVi = allEnKeys.filter(k => !(k in viFlat))
const missingJa = allEnKeys.filter(k => !(k in jaFlat))

function isLikelyUntranslated(key, enVal, localeVal) {
  if (typeof enVal !== 'string' || typeof localeVal !== 'string') return false
  if (localeVal === enVal && /[a-zA-Z]{2,}/.test(enVal)) return true
  return false
}

const untranslatedVi = allEnKeys.filter(k => k in viFlat && isLikelyUntranslated(k, enFlat[k], viFlat[k]))
const untranslatedJa = allEnKeys.filter(k => k in jaFlat && isLikelyUntranslated(k, enFlat[k], jaFlat[k]))

const allViKeys = Object.keys(viFlat)
const allJaKeys = Object.keys(jaFlat)
const extraVi = allViKeys.filter(k => !(k in enFlat))
const extraJa = allJaKeys.filter(k => !(k in enFlat))

console.log(`\n=== EN total keys: ${allEnKeys.length} ===`)
console.log(`=== VI total keys: ${allViKeys.length} ===`)
console.log(`=== JA total keys: ${allJaKeys.length} ===\n`)

console.log(`\n--- MISSING from VI (${missingVi.length}) ---`)
missingVi.forEach(k => console.log(`  ${k}`))

console.log(`\n--- MISSING from JA (${missingJa.length}) ---`)
missingJa.forEach(k => console.log(`  ${k}`))

console.log(`\n--- UNTRANSLATED in VI (value = EN value) (${untranslatedVi.length}) ---`)
untranslatedVi.forEach(k => console.log(`  ${k}: "${viFlat[k]}"`))

console.log(`\n--- UNTRANSLATED in JA (value = EN value) (${untranslatedJa.length}) ---`)
untranslatedJa.forEach(k => console.log(`  ${k}: "${jaFlat[k]}"`))

console.log(`\n--- EXTRA in VI not in EN (${extraVi.length}) ---`)
extraVi.forEach(k => console.log(`  ${k}: "${viFlat[k]}"`))

console.log(`\n--- EXTRA in JA not in EN (${extraJa.length}) ---`)
extraJa.forEach(k => console.log(`  ${k}: "${jaFlat[k]}"`))
