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
 * java.lang.String operations whose results differ from their JavaScript namesakes. Strings are UTF-16 in both
 * languages, so indexes and lengths carry over unchanged.
 *
 * @module java/string
 */

import { isHighSurrogate, isLowSurrogate, toLowerCase, toLowerCaseChar, toUpperCase, toUpperCaseChar } from './character.js';

/** String.hashCode(). */
export function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

/** String.trim(): removes code units up to U+0020 from both ends. */
export function trim(s) {
  let start = 0;
  let end = s.length;
  while (start < end && s.charCodeAt(start) <= 0x20) {
    start++;
  }
  while (end > start && s.charCodeAt(end - 1) <= 0x20) {
    end--;
  }
  return s.slice(start, end);
}

/** Whether Java stores the string in its compact Latin-1 form (every code unit below U+0100). */
function isLatin1(s) {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 0xff) {
      return false;
    }
  }
  return true;
}

function compareCharsCI(c1, c2) {
  let u1 = toUpperCaseChar(c1);
  let u2 = toUpperCaseChar(c2);
  if (u1 !== u2) {
    u1 = toLowerCaseChar(u1);
    u2 = toLowerCaseChar(u2);
    if (u1 !== u2) {
      return u1 - u2;
    }
  }
  return 0;
}

function compareCodePointsCI(cp1, cp2) {
  let u1 = toUpperCase(cp1);
  let u2 = toUpperCase(cp2);
  if (u1 !== u2) {
    u1 = toLowerCase(u1);
    u2 = toLowerCase(u2);
    if (u1 !== u2) {
      return u1 - u2;
    }
  }
  return 0;
}

/** The code point at index of a UTF-16 string, negated when it is a pair that starts there (StringUTF16). */
function codePointIncluding(s, cp, index, start, end) {
  if (cp < 0xd800 || cp > 0xdfff) {
    return cp;
  }
  if (isLowSurrogate(cp)) {
    if (index > start) {
      const c = s.charCodeAt(index - 1);
      if (isHighSurrogate(c)) {
        return (c - 0xd800) * 0x400 + (cp - 0xdc00) + 0x10000;
      }
    }
  } else if (index + 1 < end) {
    const c = s.charCodeAt(index + 1);
    if (isLowSurrogate(c)) {
      return -((cp - 0xd800) * 0x400 + (c - 0xdc00) + 0x10000);
    }
  }
  return cp;
}

function compareUtf16CI(a, aStart, aLen, b, bStart, bLen) {
  const aLast = aStart + aLen;
  const bLast = bStart + bLen;
  for (let k1 = aStart, k2 = bStart; k1 < aLast && k2 < bLast; k1++, k2++) {
    let cp1 = a.charCodeAt(k1);
    let cp2 = b.charCodeAt(k2);
    if (cp1 === cp2 || compareCodePointsCI(cp1, cp2) === 0) {
      continue;
    }
    cp1 = codePointIncluding(a, cp1, k1, aStart, aLast);
    if (cp1 < 0) {
      k1++;
      cp1 = -cp1;
    }
    cp2 = codePointIncluding(b, cp2, k2, bStart, bLast);
    if (cp2 < 0) {
      k2++;
      cp2 = -cp2;
    }
    const diff = compareCodePointsCI(cp1, cp2);
    if (diff !== 0) {
      return diff;
    }
  }
  return aLen - bLen;
}

/**
 * String.compareToIgnoreCase(other). Java compares code unit by code unit unless both strings need UTF-16 storage, in
 * which case surrogate pairs are compared as code points.
 */
export function compareToIgnoreCase(a, b) {
  if (!isLatin1(a) && !isLatin1(b)) {
    return compareUtf16CI(a, 0, a.length, b, 0, b.length);
  }
  const lim = Math.min(a.length, b.length);
  for (let k = 0; k < lim; k++) {
    const c1 = a.charCodeAt(k);
    const c2 = b.charCodeAt(k);
    if (c1 !== c2) {
      const diff = compareCharsCI(c1, c2);
      if (diff !== 0) {
        return diff;
      }
    }
  }
  return a.length - b.length;
}

/** String.regionMatches(true, toffset, other, ooffset, len). */
export function regionMatchesIgnoreCase(s, toffset, other, ooffset, len) {
  if (ooffset < 0 || toffset < 0 || toffset > s.length - len || ooffset > other.length - len) {
    return false;
  }
  if (!isLatin1(s) && !isLatin1(other)) {
    return compareUtf16CI(s, toffset, len, other, ooffset, len) === 0;
  }
  for (let i = 0; i < len; i++) {
    const c1 = s.charCodeAt(toffset + i);
    const c2 = other.charCodeAt(ooffset + i);
    if (c1 !== c2 && compareCharsCI(c1, c2) !== 0) {
      return false;
    }
  }
  return true;
}

/** String.equalsIgnoreCase(other). */
export function equalsIgnoreCase(s, other) {
  return other != null && other.length === s.length && regionMatchesIgnoreCase(s, 0, other, 0, s.length);
}
