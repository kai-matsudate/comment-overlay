import { describe, expect, it } from 'vitest'
import resolvePort from '../shared/resolvePort.cjs'

describe('resolvePort', () => {
  it.each([
    ['1', 1],
    ['8000', 8000],
    ['65535', 65535],
  ])('有効なポート番号 %s を返す', (value, expected) => {
    expect(resolvePort(value, 3000)).toBe(expected)
  })

  it.each([
    undefined,
    '',
    'invalid',
    '0',
    '-1',
    '1.5',
    '65536',
  ])('不正な値 %s ではフォールバックを返す', (value) => {
    expect(resolvePort(value, 3000)).toBe(3000)
  })
})
