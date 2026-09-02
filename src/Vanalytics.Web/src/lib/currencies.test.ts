import { describe, it, expect } from 'vitest'
import { CURRENCIES, CURRENCY_CATEGORY_LABELS, listCurrencies, lookupCurrency, type CurrencyCategory } from './currencies'

const VALID_CATEGORIES: CurrencyCategory[] = ['nation', 'seals', 'battle', 'zone', 'dynamis', 'records', 'crafting', 'other']

describe('currency catalog integrity', () => {
    it('has entries', () => {
        expect(CURRENCIES.length).toBeGreaterThan(0)
    })

    it('every entry has a non-empty name and valid category', () => {
        for (const c of CURRENCIES) {
            expect(c.name.length).toBeGreaterThan(0)
            expect(VALID_CATEGORIES).toContain(c.category)
        }
    })

    it('every entry has an explicit cap (number or null, never undefined)', () => {
        for (const c of CURRENCIES) {
            expect(c.cap === null || typeof c.cap === 'number').toBe(true)
        }
    })

    it('keys are unique', () => {
        const keys = CURRENCIES.map(c => c.key)
        expect(new Set(keys).size).toBe(keys.length)
    })

    it('every category has a display label', () => {
        for (const cat of VALID_CATEGORIES) {
            expect(CURRENCY_CATEGORY_LABELS[cat].length).toBeGreaterThan(0)
        }
    })
})

describe('listCurrencies', () => {
    it('returns one row per catalog entry in catalog order when no extras', () => {
        const rows = listCurrencies({})
        expect(rows).toHaveLength(CURRENCIES.length)
        expect(rows[0].entry.key).toBe(CURRENCIES[0].key)
    })

    it('defaults missing values to 0', () => {
        const rows = listCurrencies({})
        expect(rows.every(r => r.value === 0)).toBe(true)
    })

    it('computes pctOfCap for capped entries and null for uncapped', () => {
        const capped = CURRENCIES.find(c => c.cap != null && c.cap > 0)!
        const uncapped = CURRENCIES.find(c => c.cap === null)
        const rows = listCurrencies({ [capped.key]: capped.cap! / 2 })
        expect(rows.find(r => r.entry.key === capped.key)!.pctOfCap).toBeCloseTo(50)
        if (uncapped) {
            expect(rows.find(r => r.entry.key === uncapped.key)!.pctOfCap).toBeNull()
        }
    })

    it('appends synced keys with no catalog entry as trailing rows with null pctOfCap', () => {
        const rows = listCurrencies({ someUnknownKey: 42 })
        expect(rows).toHaveLength(CURRENCIES.length + 1)
        const last = rows[rows.length - 1]
        expect(last.entry.key).toBe('someUnknownKey')
        expect(last.entry.name).toBe('someUnknownKey')
        expect(last.value).toBe(42)
        expect(last.pctOfCap).toBeNull()
    })
})

describe('lookupCurrency', () => {
    it('returns the catalog entry when the key exists', () => {
        const first = CURRENCIES[0]
        expect(lookupCurrency(first.key)).toEqual(first)
    })

    it('falls back to a raw-key entry for unknown keys', () => {
        const e = lookupCurrency('nope')
        expect(e).toEqual({ key: 'nope', name: 'nope', category: 'other', cap: null })
    })
})
