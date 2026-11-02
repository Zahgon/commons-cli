/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * The parts of java.lang.Character the library relies on. Characters ("char") are UTF-16 code units, code points are
 * integers; both follow Java 25's Unicode 16.0 tables in character-data.js.
 *
 * @module java/character
 */

import { DIGITS, ID_PART, LETTER, LOWER, SPECIAL_UPPER, UPPER, WHITESPACE } from './character-data.js';

/** Character.MIN_RADIX and Character.MAX_RADIX. */
export const MIN_RADIX = 2;
export const MAX_RADIX = 36;

/** Character.LINE_SEPARATOR and PARAGRAPH_SEPARATOR as general category values, which Java casts to chars. */
export const LINE_SEPARATOR = 13;
export const PARAGRAPH_SEPARATOR = 14;

function decodeRanges(table) {
  const starts = [];
  const ends = [];
  for (const item of table.trim().split(' ')) {
    const [a, b] = item.split('-');
    starts.push(parseInt(a, 36));
    ends.push(parseInt(b ?? a, 36));
  }
  return { starts: Int32Array.from(starts), ends: Int32Array.from(ends) };
}

function inRanges(ranges, c) {
  const { starts, ends } = ranges;
  let lo = 0;
  let hi = starts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (c < starts[mid]) {
      hi = mid - 1;
    } else if (c > ends[mid]) {
      lo = mid + 1;
    } else {
      return true;
    }
  }
  return false;
}

function decodeRuns(table, width) {
  return table.trim().split(' ').map((item) => item.split(',').slice(0, width).map((n, i) => (i === 3 ? Number(n) : parseInt(n, 36))));
}

function decodeMapping(table) {
  const runs = decodeRuns(table, 4);
  const map = new Map();
  for (const [start, count, delta, stride] of runs) {
    for (let i = 0; i < count; i++) {
      map.set(start + i * stride, start + i * stride + delta);
    }
  }
  return map;
}

const ID_PART_RANGES = decodeRanges(ID_PART);
const LETTER_RANGES = decodeRanges(LETTER);
const WHITESPACE_RANGES = decodeRanges(WHITESPACE);
const DIGIT_RUNS = decodeRuns(DIGITS, 3);
const UPPER_MAP = decodeMapping(UPPER);
const LOWER_MAP = decodeMapping(LOWER);
const SPECIAL_UPPER_MAP = new Map(
  SPECIAL_UPPER.trim().split(' ').map((item) => {
    const [cp, units] = item.split(':');
    return [parseInt(cp, 36), String.fromCharCode(...units.split('.').map((u) => parseInt(u, 36)))];
  })
);

/** Character.isJavaIdentifierPart(char). */
export function isJavaIdentifierPart(c) {
  return inRanges(ID_PART_RANGES, c);
}

/** Character.isLetter(char). */
export function isLetter(c) {
  return inRanges(LETTER_RANGES, c);
}

/** Character.isWhitespace(char). */
export function isWhitespace(c) {
  return inRanges(WHITESPACE_RANGES, c);
}

/** Character.digit(char, radix): the digit's value, or -1. */
export function digit(c, radix) {
  if (radix < MIN_RADIX || radix > MAX_RADIX) {
    return -1;
  }
  let lo = 0;
  let hi = DIGIT_RUNS.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const [start, length, value] = DIGIT_RUNS[mid];
    if (c < start) {
      hi = mid - 1;
    } else if (c >= start + length) {
      lo = mid + 1;
    } else {
      const v = value + (c - start);
      return v < radix ? v : -1;
    }
  }
  return -1;
}

/** Character.isDigit(char). */
export function isDigit(c) {
  return digit(c, 10) >= 0;
}

/** Character.isLetterOrDigit(char). */
export function isLetterOrDigit(c) {
  return isLetter(c) || isDigit(c);
}

/** Character.toUpperCase(int). */
export function toUpperCase(cp) {
  return UPPER_MAP.get(cp) ?? cp;
}

/** Character.toLowerCase(int). */
export function toLowerCase(cp) {
  return LOWER_MAP.get(cp) ?? cp;
}

/** Character.toUpperCase(char): the int mapping narrowed to a char. */
export function toUpperCaseChar(c) {
  return toUpperCase(c) & 0xffff;
}

/** Character.toLowerCase(char). */
export function toLowerCaseChar(c) {
  return toLowerCase(c) & 0xffff;
}

/** Character.isHighSurrogate and isLowSurrogate. */
export function isHighSurrogate(c) {
  return c >= 0xd800 && c <= 0xdbff;
}

export function isLowSurrogate(c) {
  return c >= 0xdc00 && c <= 0xdfff;
}

/** Character.isValidCodePoint(int). */
export function isValidCodePoint(cp) {
  return cp >= 0 && cp <= 0x10ffff;
}

/** new String(Character.toChars(cp)) for a valid code point. */
export function codePointString(cp) {
  return String.fromCodePoint(cp);
}

/** String.toUpperCase(Locale.US): the full case mapping, code point by code point; lone surrogates stay. */
export function toUpperCaseString(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    let cp = s.charCodeAt(i);
    if (isHighSurrogate(cp) && i + 1 < s.length && isLowSurrogate(s.charCodeAt(i + 1))) {
      cp = (cp - 0xd800) * 0x400 + (s.charCodeAt(i + 1) - 0xdc00) + 0x10000;
      i++;
    }
    const special = SPECIAL_UPPER_MAP.get(cp);
    out += special ?? String.fromCodePoint(toUpperCase(cp));
  }
  return out;
}
