import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { NATIVE_BLOCK_PALETTE_SCRIPT, nativeBlockPalette } from '../src/block-palette'

const userAgents = [
  ['Chrome', 'Mozilla/5.0 Chrome/153.0.0.0 Safari/537.36', '#fff', '#202124'],
  ['Edge', 'Mozilla/5.0 AppleWebKit/537.36 Chrome/153.0.0.0 Edg/153.0.0.0', '#f6f6f6', '#2d2d2d'],
  ['Firefox', 'Mozilla/5.0 Gecko/20100101 Firefox/145.0', '#f9f9fb', '#2b2a33'],
  ['WebKit', 'Mozilla/5.0 AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', '#f6f6f6', 'rgb(30,30,30)'],
  ['Opera', 'Mozilla/5.0 AppleWebKit/537.36 Chrome/153.0.0.0 OPR/120.0.0.0', '#eef3f7', '#101214'],
] as const

describe('native browser palette for block pages', () => {
  it.each(userAgents)('%s uses its native light and dark canvas colors', (_name, ua, light, dark) => {
    expect(nativeBlockPalette(ua)).toEqual({ light, dark })

    const browserPalette = runInNewContext(`${NATIVE_BLOCK_PALETTE_SCRIPT};_sgNativeBlockPalette(ua)`, { ua })
    expect(browserPalette).toEqual({ light, dark })
  })
})
