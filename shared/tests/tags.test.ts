import { describe, it, expect } from 'vitest';
import { parseTagInput, splitTagInput } from '../src/index';

describe('parseTagInput', () => {
  it('splits, trims, lowercases, de-duplicates', () => {
    expect(parseTagInput(' Founders , berlin , FOUNDERS ')).toEqual(['founders', 'berlin']);
  });
  it('drops empties', () => {
    expect(parseTagInput('a,,  ,b,')).toEqual(['a', 'b']);
  });
  it('empty string yields nothing', () => {
    expect(parseTagInput('   ')).toEqual([]);
  });
});

describe('splitTagInput', () => {
  it('holds text with no comma', () => {
    expect(splitTagInput('foun')).toEqual({ tags: [], rest: 'foun' });
  });
  it('commits before the last comma, keeps the remainder', () => {
    expect(splitTagInput('founders, ber')).toEqual({ tags: ['founders'], rest: ' ber' });
  });
  it('commits several from a paste', () => {
    expect(splitTagInput('a, b, c,')).toEqual({ tags: ['a', 'b', 'c'], rest: '' });
  });
  it('swallows a lone comma', () => {
    expect(splitTagInput(',')).toEqual({ tags: [], rest: '' });
  });
});
