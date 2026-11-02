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
 * java.math.BigInteger and java.math.BigDecimal: their string constructors, toString() and hashCode(), and the
 * rounding (MathContext with HALF_UP) the formatter applies to them.
 *
 * @module java/big-numbers
 */

import { digit, isDigit } from './character.js';
import { NumberFormatException } from './errors.js';
import { parseInt } from './primitives.js';
import { Types } from './types.js';

const abs = (x) => (x < 0n ? -x : x);

function magnitudeHash(value) {
  let h = 0;
  const hex = abs(value).toString(16);
  const words = hex.padStart(Math.ceil(hex.length / 8) * 8, '0');
  for (let i = 0; i < words.length; i += 8) {
    h = (Math.imul(31, h) + Number.parseInt(words.slice(i, i + 8), 16)) | 0;
  }
  return value === 0n ? 0 : value < 0n ? -h | 0 : h;
}

/** java.math.BigInteger. */
export class JavaBigInteger {
  /** @param {bigint} value the value */
  constructor(value) {
    this.value = value;
  }

  /** new BigInteger(String). */
  static parse(val) {
    const len = val.length;
    if (len === 0) {
      throw new NumberFormatException('Zero length BigInteger');
    }
    let cursor = 0;
    let sign = 1n;
    const index1 = val.lastIndexOf('-');
    const index2 = val.lastIndexOf('+');
    if (index1 >= 0) {
      if (index1 !== 0 || index2 >= 0) {
        throw new NumberFormatException('Illegal embedded sign character');
      }
      sign = -1n;
      cursor = 1;
    } else if (index2 >= 0) {
      if (index2 !== 0) {
        throw new NumberFormatException('Illegal embedded sign character');
      }
      cursor = 1;
    }
    if (cursor === len) {
      throw new NumberFormatException('Zero length BigInteger');
    }
    while (cursor < len && digit(val.charCodeAt(cursor), 10) === 0) {
      cursor++;
    }
    if (cursor === len) {
      return new JavaBigInteger(0n);
    }
    const numDigits = len - cursor;
    let firstGroupLen = numDigits % 9;
    if (firstGroupLen === 0) {
      firstGroupLen = 9;
    }
    let magnitude = BigInt(parseInt(val.slice(cursor, cursor + firstGroupLen), 10));
    cursor += firstGroupLen;
    while (cursor < len) {
      magnitude = magnitude * 1000000000n + BigInt(parseInt(val.slice(cursor, cursor + 9), 10));
      cursor += 9;
    }
    return new JavaBigInteger(sign * magnitude);
  }

  getClass() {
    return Types.BIG_INTEGER;
  }

  toString() {
    return this.value.toString();
  }

  hashCode() {
    return magnitudeHash(this.value);
  }
}

function digitCount(u) {
  return u === 0n ? 1 : abs(u).toString().length;
}

/** |u| / 10^n rounded HALF_UP, keeping the sign. */
function divideHalfUp(u, n) {
  const d = 10n ** BigInt(n);
  const q = abs(u) / d;
  const r = abs(u) % d;
  const rounded = 2n * r >= d ? q + 1n : q;
  return u < 0n ? -rounded : rounded;
}

/** java.math.BigDecimal: an unscaled bigint and a scale. */
export class JavaBigDecimal {
  /**
   * @param {bigint} unscaled the unscaled value
   * @param {number} scale the scale
   */
  constructor(unscaled, scale) {
    this.unscaled = unscaled;
    this.scale = scale;
  }

  /** new BigDecimal(String). */
  static parse(s) {
    let offset = 0;
    let len = s.length;
    const at = (i) => {
      if (i >= s.length) {
        throw new NumberFormatException(null);
      }
      return s.charCodeAt(i);
    };
    let scl = 0;
    let isneg = false;
    if (at(offset) === 0x2d) {
      isneg = true;
      offset++;
      len--;
    } else if (at(offset) === 0x2b) {
      offset++;
      len--;
    }
    let dot = false;
    let digits = '';
    let sawDigit = false;
    const isCompact = len <= 18;
    for (; len > 0; offset++, len--) {
      const c = s.charCodeAt(offset);
      const value = c >= 0x30 && c <= 0x39 ? c - 0x30 : isDigit(c) ? digit(c, 10) : -1;
      if (value >= 0) {
        sawDigit = true;
        digits += String(value);
        if (dot) {
          ++scl;
        }
        continue;
      }
      if (c === 0x2e) {
        if (dot) {
          throw new NumberFormatException('Character array contains more than one decimal point.');
        }
        dot = true;
        continue;
      }
      if (c === 0x65 || c === 0x45) {
        scl -= parseExp(s, offset, len, at);
        break;
      }
      throw new NumberFormatException(isCompact
        ? `Character ${String.fromCharCode(c)} is neither a decimal digit number, decimal point, nor "e" notation exponential mark.`
        : 'Character array is missing "e" notation exponential mark.');
    }
    if (!sawDigit) {
      throw new NumberFormatException('No digits found.');
    }
    if (scl > 2147483647 || scl < -2147483648) {
      throw new NumberFormatException('Exponent overflow.');
    }
    const unscaled = BigInt(digits);
    return new JavaBigDecimal(isneg ? -unscaled : unscaled, scl);
  }

  getClass() {
    return Types.BIG_DECIMAL;
  }

  /** BigDecimal.precision(). */
  precision() {
    return digitCount(this.unscaled);
  }

  signum() {
    return this.unscaled === 0n ? 0 : this.unscaled < 0n ? -1 : 1;
  }

  abs() {
    return new JavaBigDecimal(abs(this.unscaled), this.scale);
  }

  /** new BigDecimal(unscaled, scale, new MathContext(precision)): rounds to precision digits, HALF_UP. */
  static rounded(unscaled, scale, precision) {
    let u = unscaled;
    let sc = scale;
    if (precision > 0) {
      let drop = digitCount(u) - precision;
      while (drop > 0) {
        sc -= drop;
        u = divideHalfUp(u, drop);
        drop = digitCount(u) - precision;
      }
    }
    return new JavaBigDecimal(u, sc);
  }

  /** BigDecimal.round(new MathContext(precision)). */
  round(precision) {
    return JavaBigDecimal.rounded(this.unscaled, this.scale, precision);
  }

  /** BigDecimal.setScale(newScale, RoundingMode.HALF_UP). */
  setScale(newScale) {
    if (newScale >= this.scale) {
      return new JavaBigDecimal(this.unscaled * 10n ** BigInt(newScale - this.scale), newScale);
    }
    return new JavaBigDecimal(divideHalfUp(this.unscaled, this.scale - newScale), newScale);
  }

  /** BigDecimal.compareTo(other): numeric comparison. */
  compareTo(other) {
    const s = Math.max(this.scale, other.scale);
    const a = this.unscaled * 10n ** BigInt(s - this.scale);
    const b = other.unscaled * 10n ** BigInt(s - other.scale);
    return a < b ? -1 : a > b ? 1 : 0;
  }

  /** BigDecimal.toString(): scientific notation when the exponent calls for it. */
  toString() {
    const coeff = abs(this.unscaled).toString();
    const sign = this.unscaled < 0n ? '-' : '';
    if (this.scale === 0) {
      return sign + coeff;
    }
    const adjusted = -this.scale + (coeff.length - 1);
    if (this.scale > 0 && adjusted >= -6) {
      const pad = this.scale - coeff.length;
      if (pad >= 0) {
        return `${sign}0.${'0'.repeat(pad)}${coeff}`;
      }
      return `${sign}${coeff.slice(0, -pad)}.${coeff.slice(-pad)}`;
    }
    let out = sign + coeff[0];
    if (coeff.length > 1) {
      out += `.${coeff.slice(1)}`;
    }
    if (adjusted !== 0) {
      out += `E${adjusted > 0 ? '+' : ''}${adjusted}`;
    }
    return out;
  }

  hashCode() {
    const u = this.unscaled;
    if (abs(u) < 2n ** 63n) {
      const val2 = abs(u);
      const hi = Number(BigInt.asIntN(32, val2 >> 32n));
      const lo = BigInt.asUintN(32, val2);
      const temp = Number(BigInt.asIntN(32, BigInt(Math.imul(hi, 31)) + lo));
      return (Math.imul(31, u < 0n ? -temp | 0 : temp) + this.scale) | 0;
    }
    return (Math.imul(31, magnitudeHash(u)) + this.scale) | 0;
  }
}

/** BigDecimal.parseExp: the exponent after the "e" at offset; len counts the characters left from there. */
function parseExp(s, offset, len, at) {
  let exp = 0;
  let i = offset + 1;
  let c = at(i);
  let left = len - 1;
  const negexp = c === 0x2d;
  if (negexp || c === 0x2b) {
    i++;
    c = at(i);
    left--;
  }
  if (left <= 0) {
    throw new NumberFormatException('No exponent digits.');
  }
  while (left > 10 && (c === 0x30 || digit(c, 10) === 0)) {
    i++;
    c = at(i);
    left--;
  }
  if (left > 10) {
    throw new NumberFormatException('Too many nonzero exponent digits.');
  }
  for (;; left--) {
    const v = c >= 0x30 && c <= 0x39 ? c - 0x30 : digit(c, 10);
    if (v < 0) {
      throw new NumberFormatException('Not a digit.');
    }
    exp = exp * 10 + v;
    if (left === 1) {
      break;
    }
    i++;
    c = at(i);
  }
  return negexp ? -exp : exp;
}
