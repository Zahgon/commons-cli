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
 * Java's primitive wrappers: parsing (Integer.parseInt, Long.parseLong, Double.parseDouble, ...) with their exact
 * grammar and messages, Double.toString and Float.toString, and the boxed values themselves.
 *
 * @module java/primitives
 */

import { digit as charDigit, MAX_RADIX, MIN_RADIX } from './character.js';
import { NumberFormatException } from './errors.js';
import { hashCode as stringHashCode } from './string.js';
import { Types } from './types.js';

// ------------------------------------------------------------------ integers

function forInputString(s, radix) {
  return new NumberFormatException(`For input string: "${s}"${radix === 10 ? '' : ` under radix ${radix}`}`);
}

/**
 * Integer.parseInt and Long.parseLong, accumulating negatively; min is the minimum of the type, and failures throw
 * NumberFormatException.
 */
function parseIntegral(s, radix, min) {
  if (s == null) {
    throw new NumberFormatException('Cannot parse null string');
  }
  if (radix < MIN_RADIX) {
    throw new NumberFormatException(`radix ${radix} less than Character.MIN_RADIX`);
  }
  if (radix > MAX_RADIX) {
    throw new NumberFormatException(`radix ${radix} greater than Character.MAX_RADIX`);
  }
  const len = s.length;
  if (len === 0) {
    throw forInputString('', radix);
  }
  const r = BigInt(radix);
  let digit = ~0xff;
  let i = 0;
  const firstChar = s.charCodeAt(i++);
  if (firstChar !== 0x2d && firstChar !== 0x2b) {
    digit = charDigit(firstChar, radix);
  }
  if (digit >= 0 || (digit === ~0xff && len > 1)) {
    const limit = firstChar !== 0x2d ? min + 1n : min;
    const multmin = limit / r;
    let result = -BigInt(digit & 0xff);
    let inRange = true;
    while (i < len && (digit = charDigit(s.charCodeAt(i++), radix)) >= 0
        && (inRange = result > multmin || (result === multmin && BigInt(digit) <= r * multmin - limit))) {
      result = r * result - BigInt(digit);
    }
    if (inRange && i === len && digit >= 0) {
      return firstChar !== 0x2d ? -result : result;
    }
  }
  throw forInputString(s, radix);
}

/** Long.parseLong(s, radix) as a bigint. */
export function parseLong(s, radix = 10) {
  return parseIntegral(s, radix, -(2n ** 63n));
}

/** Integer.parseInt(s, radix). */
export function parseInt(s, radix = 10) {
  return Number(parseIntegral(s, radix, -(2n ** 31n)));
}

function parseNarrow(s, radix, min, max) {
  const i = parseInt(s, radix);
  if (i < min || i > max) {
    throw new NumberFormatException(`Value out of range. Value:"${s}" Radix:${radix}`);
  }
  return i;
}

/** Short.parseShort(s, radix). */
export function parseShort(s, radix = 10) {
  return parseNarrow(s, radix, -32768, 32767);
}

/** Byte.parseByte(s, radix). */
export function parseByte(s, radix = 10) {
  return parseNarrow(s, radix, -128, 127);
}

/** Long.toHexString, toOctalString: the unsigned 64-bit representation. */
export function longToUnsignedString(value, radix) {
  return BigInt.asUintN(64, value).toString(radix);
}

/** Integer.toHexString(int). */
export function intToHexString(value) {
  return (value >>> 0).toString(16);
}

// ------------------------------------------------------------------ exact values of doubles

/** The bits of a double as a bigint (Double.doubleToRawLongBits). */
export function doubleBits(v) {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, v);
  return view.getBigUint64(0);
}

/** Float.floatToRawIntBits(f). */
export function floatBits(f) {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, f);
  return view.getUint32(0);
}

/** A finite double v as m * 2^k with an integer m. */
function exactBinary(v) {
  const bits = doubleBits(v);
  const exp = Number((bits >> 52n) & 0x7ffn);
  let m = bits & ((1n << 52n) - 1n);
  if (exp !== 0) {
    m |= 1n << 52n;
  }
  const k = (exp === 0 ? 1 : exp) - 1075;
  return { m: bits >> 63n ? -m : m, k };
}

/** The sign of a * 10^ea - b * 2^kb, for bigints a, b. */
function compareDecimalBinary(a, ea, b, kb) {
  let left = a;
  let right = b;
  if (ea >= 0) {
    left *= 10n ** BigInt(ea);
  } else {
    right *= 10n ** BigInt(-ea);
  }
  if (kb >= 0) {
    right *= 1n << BigInt(kb);
  } else {
    left *= 1n << BigInt(-kb);
  }
  return left < right ? -1 : left > right ? 1 : 0;
}

/** |a * 10^ea - v| compared with |b * 10^eb - v|, exactly. */
function compareDistances(a, ea, b, eb, v) {
  const { m, k } = exactBinary(v);
  const e = Math.min(ea, eb);
  const scaleBin = k < 0 ? 1n << BigInt(-k) : 1n;
  const binScaled = k < 0 ? m : m << BigInt(k);
  const da = a * 10n ** BigInt(ea - e);
  const db = b * 10n ** BigInt(eb - e);
  const tens = e >= 0 ? 10n ** BigInt(e) : 1n;
  const inv = e < 0 ? 10n ** BigInt(-e) : 1n;
  const abs = (x) => (x < 0n ? -x : x);
  const distA = abs(da * tens * scaleBin - binScaled * inv);
  const distB = abs(db * tens * scaleBin - binScaled * inv);
  return distA < distB ? -1 : distA > distB ? 1 : 0;
}

// ------------------------------------------------------------------ Double.parseDouble and Float.parseFloat

/** The float nearest to x = digits * 10^exp, where approx is the double nearest to x. */
function roundDecimalToFloat(digits, exp, approx) {
  const f = Math.fround(approx);
  if (f === approx || !Number.isFinite(approx)) {
    return f;
  }
  const lower = approx > 0 ? (f < approx ? f : prevFloat(f)) : (f > approx ? f : nextFloat(f));
  const upper = approx > 0 ? (f < approx ? nextFloat(f) : f) : (f > approx ? prevFloat(f) : f);
  const mid = midpoint(lower, upper);
  if (mid !== approx) {
    return f;
  }
  const cmp = compareDecimalBinary(BigInt(digits), exp, exactBinary(Math.abs(mid)).m, exactBinary(Math.abs(mid)).k);
  const away = Math.abs(lower) > Math.abs(upper) ? lower : upper;
  const toward = away === lower ? upper : lower;
  if (cmp > 0) {
    return away;
  }
  if (cmp < 0) {
    return toward;
  }
  return (floatBits(lower) & 1) === 0 ? lower : upper;
}

const MAX_FLOAT = 3.4028234663852886e38;

function nextFloat(f) {
  if (f === MAX_FLOAT) {
    return Infinity;
  }
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, f);
  const b = view.getUint32(0);
  view.setUint32(0, f >= 0 ? b + 1 : b - 1);
  return view.getFloat32(0);
}

function prevFloat(f) {
  return -nextFloat(-f);
}

function midpoint(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    const finite = Number.isFinite(a) ? a : b;
    return finite + Math.sign(finite) * 2 ** 103;
  }
  return (a + b) / 2;
}

const HEX_COUNT = { 32: 8, 64: 15 };
const P = { 32: 24, 64: 53 };
const Q_MIN = { 32: -149, 64: -1074 };
const E_MIN = { 32: -126, 64: -1022 };
const E_MAX = { 32: 127, 64: 1023 };

function isDigitFor(ch, isDec) {
  const lch = ch | 0x20;
  return (ch >= 0x30 && ch <= 0x39) || (!isDec && lch >= 0x61 && lch <= 0x66);
}

function skipWhitespaces(s, i) {
  while (i < s.length && s.charCodeAt(i) <= 0x20) {
    i++;
  }
  return i;
}

function check(s, expected) {
  if (!expected) {
    const shown = s.length > 1000 ? `${s.slice(0, 497)} ... ${s.slice(s.length - 498)}` : s;
    throw new NumberFormatException(`For input string: "${shown}"`);
  }
}

function checkMultiplePoints(pt, i) {
  if (pt !== 0) {
    throw new NumberFormatException('multiple points');
  }
  return i;
}

/** FloatingDecimal.readJavaFormatString: the shared grammar of Double.parseDouble and Float.parseFloat. */
function readJavaFormatString(s, bits) {
  if (s == null) {
    throw new TypeError('null');
  }
  const len = s.length;
  let i = skipWhitespaces(s, 0);
  if (i === len) {
    throw new NumberFormatException('empty String');
  }
  let ch;
  let ssign = 0x20;
  if ((ch = s.charCodeAt(i)) === 0x2d || ch === 0x2b) {
    ssign = ch;
    ++i;
  }
  const negative = ssign === 0x2d;
  const signed = (x) => (negative ? -x : x);
  let isDec = true;
  if (i < len) {
    ch = s.charCodeAt(i);
    if (ch === 0x49) {
      scanSymbolic(s, i, 'Infinity');
      return signed(Infinity);
    }
    if (ch === 0x4e) {
      scanSymbolic(s, i, 'NaN');
      return NaN;
    }
    if (ch === 0x30 && i < len - 1 && (s.charCodeAt(i + 1) | 0x20) === 0x78) {
      isDec = false;
      i += 2;
    }
  }
  let pt = 0;
  const start = i;
  while (i < len && ((ch = s.charCodeAt(i)) === 0x30 || ch === 0x2e)) {
    ++i;
    if (ch === 0x2e) {
      pt = checkMultiplePoints(pt, i);
    }
  }
  const lz = i;
  let tnz = 0;
  while (i < len && (isDigitFor((ch = s.charCodeAt(i)), isDec) || ch === 0x2e)) {
    i++;
    if (ch === 0x2e) {
      pt = checkMultiplePoints(pt, i);
    } else if (ch !== 0x30) {
      tnz = i;
    }
  }
  check(s, i - start > (pt !== 0 ? 1 : 0));
  const stop = i;
  let ep = 0;
  let hasExp = false;
  if (i < len && ((((ch = s.charCodeAt(i) | 0x20) === 0x65) && isDec) || (ch === 0x70 && !isDec))) {
    ++i;
    let esign = 0x20;
    if (i < len && ((ch = s.charCodeAt(i)) === 0x2d || ch === 0x2b)) {
      esign = ch;
      ++i;
    }
    while (i < len && isDigitFor((ch = s.charCodeAt(i)), true)) {
      ++i;
      ep = ep < 1e9 ? 10 * ep + (ch - 0x30) : 1e10;
    }
    check(s, i - stop >= 3 || (i - stop === 2 && esign === 0x20));
    if (esign === 0x2d) {
      ep = -ep;
    }
    hasExp = true;
  }
  check(s, isDec || hasExp);
  if (i < len && (((ch = s.charCodeAt(i) | 0x20)) === 0x66 || ch === 0x64)) {
    ++i;
  }
  check(s, skipWhitespaces(s, i) === len);
  if (tnz === 0) {
    return negative ? -0 : 0;
  }
  const emult = isDec ? 1 : 4;
  let n = tnz - lz;
  if (pt === 0) {
    ep += emult * (stop - tnz);
  } else {
    ep += emult * (pt - tnz);
    if (pt > tnz) {
      ep -= emult;
    } else if (lz < pt) {
      n -= 1;
    }
  }
  const significant = s.slice(lz, tnz).replace('.', '');
  return isDec ? decimalValue(significant, ep, bits, negative) : hexValue(significant, n, ep, bits, ssign);
}

function scanSymbolic(s, i, sub) {
  const high = i + sub.length;
  check(s, high <= s.length && s.startsWith(sub, i) && skipWhitespaces(s, high) === s.length);
}

function decimalValue(digits, ep, bits, negative) {
  const approx = Number(`${digits}e${ep}`);
  const value = bits === 64 ? approx : roundDecimalToFloat(digits, ep, approx);
  return negative ? -value : value;
}

/**
 * The value of a hexadecimal floating literal, rounded half to even to the precision of the type, with its overflow and
 * underflow limits.
 */
function hexValue(digits, n, ep, bits, ssign) {
  const le = Math.min(n, HEX_COUNT[bits]);
  let c = BigInt(`0x${digits.slice(0, le)}`);
  let q0 = ep;
  if (n > le) {
    c |= 1n;
    q0 += 4 * (n - le);
  }
  const bl = c.toString(2).length;
  const negative = ssign === 0x2d;
  if (q0 < Q_MIN[bits] - bl) {
    return negative ? -0 : 0;
  }
  if (q0 > E_MAX[bits] - bl + 1) {
    return negative ? -Infinity : Infinity;
  }
  let q = q0;
  let shr;
  if (q > E_MIN[bits] - bl) {
    shr = bl - P[bits];
    q += shr;
  } else {
    shr = Q_MIN[bits] - q;
    q = Q_MIN[bits];
  }
  if (shr > 0) {
    const thr = 1n << BigInt(shr);
    const tail = (c & (thr - 1n)) << 1n;
    c >>= BigInt(shr);
    if (tail > thr || (tail === thr && (c & 1n) !== 0n)) {
      c += 1n;
      if (c >= 1n << BigInt(P[bits])) {
        c >>= 1n;
        q += 1;
      }
    }
  } else {
    c <<= BigInt(-shr);
  }
  const value = Number(c) * 2 ** q;
  return negative ? -value : value;
}

/** Double.parseDouble(s). */
export function parseDouble(s) {
  return readJavaFormatString(s, 64);
}

/** Float.parseFloat(s), as the JavaScript number of the float. */
export function parseFloat(s) {
  return readJavaFormatString(s, 32);
}

// ------------------------------------------------------------------ Double.toString and Float.toString

/** The digits of a decimal and its exponent: value = digits * 10^exp, digits without trailing zeros. */
function decimal(digits, exp) {
  let d = digits;
  let e = exp;
  while (d.length > 1 && d.endsWith('0')) {
    d = d.slice(0, -1);
    e++;
  }
  return { digits: d, exp: e };
}

function parseExponential(text) {
  const [mant, exp] = text.split('e');
  const digits = mant.replace('.', '').replace('-', '');
  return decimal(digits, Number(exp) - (digits.length - 1));
}

/**
 * Java's choice among the decimals that round to v (Double.toString's specification): the shortest; when the
 * shortest has one digit, the closest of those with one or two digits; ties go to the even digit.
 */
function chooseDecimal(v, shortest, roundsTo) {
  if (shortest.digits.length > 1) {
    return shortest;
  }
  let best = { digits: shortest.digits, exp: shortest.exp };
  for (let exp = shortest.exp - 2; exp <= shortest.exp; exp++) {
    for (let c = 10; c <= 99; c++) {
      if (!roundsTo(`${c}e${exp}`)) {
        continue;
      }
      const cmp = compareDistances(BigInt(c), exp, BigInt(best.digits), best.exp, v);
      if (cmp < 0 || (cmp === 0 && c % 2 === 0 && Number(best.digits.at(-1)) % 2 === 1)) {
        best = { digits: String(c), exp };
      }
    }
  }
  return decimal(best.digits, best.exp);
}

/** The decimal Java's Double.toString prints for a finite non-zero v (its absolute value). */
export function doubleDecimal(v) {
  const a = Math.abs(v);
  return chooseDecimal(a, parseExponential(a.toExponential()), (text) => Number(text) === a);
}

/** Whether the decimal digits * 10^exp rounds to the float f (positive). */
function roundsToFloat(digitsText, f) {
  const [digits, e] = digitsText.split('e');
  const approx = Number(`${digits}e${e}`);
  return roundDecimalToFloat(digits, Number(e), approx) === f;
}

/** The decimal Java's Float.toString prints for a finite non-zero float f. */
export function floatDecimal(f) {
  const a = Math.abs(f);
  for (let p = 1; p <= 9; p++) {
    const nearest = parseExponential(a.toExponential(p - 1));
    const unit = nearest.exp + nearest.digits.length - p;
    const scaled = BigInt(nearest.digits) * 10n ** BigInt(nearest.digits.length < p ? p - nearest.digits.length : 0);
    const base = nearest.digits.length < p ? scaled : BigInt(nearest.digits);
    let best = null;
    for (const delta of [0n, -1n, 1n]) {
      const c = base + delta;
      if (c <= 0n || !roundsToFloat(`${c}e${unit}`, a)) {
        continue;
      }
      if (best === null) {
        best = { c, unit };
        continue;
      }
      const cmp = compareDistances(c, unit, best.c, best.unit, a);
      if (cmp < 0 || (cmp === 0 && c % 2n === 0n)) {
        best = { c, unit };
      }
    }
    if (best !== null) {
      const shortest = decimal(String(best.c), best.unit);
      return chooseDecimal(a, shortest, (text) => roundsToFloat(text, a));
    }
  }
  return parseExponential(a.toExponential());
}

/** Lays out a decimal as Double.toString and Float.toString do. */
function layout(negative, { digits, exp }) {
  const e = digits.length + exp;
  let out;
  if (e > 0 && e <= 7) {
    const intPart = digits.length >= e ? digits.slice(0, e) : digits + '0'.repeat(e - digits.length);
    const frac = digits.length > e ? digits.slice(e) : '0';
    out = `${intPart}.${frac}`;
  } else if (e > -3 && e <= 0) {
    out = `0.${'0'.repeat(-e)}${digits}`;
  } else {
    out = `${digits[0]}.${digits.length > 1 ? digits.slice(1) : '0'}E${e - 1}`;
  }
  return negative ? `-${out}` : out;
}

/** Double.toString of NaN, the infinities and the zeros. */
function special(v) {
  if (Number.isNaN(v)) {
    return 'NaN';
  }
  if (v === Infinity) {
    return 'Infinity';
  }
  if (v === -Infinity) {
    return '-Infinity';
  }
  return Object.is(v, -0) ? '-0.0' : '0.0';
}

/** Double.toString(v). */
export function doubleToString(v) {
  if (!Number.isFinite(v) || v === 0) {
    return special(v);
  }
  return layout(v < 0, doubleDecimal(v));
}

/** Float.toString(f). */
export function floatToString(f) {
  if (!Number.isFinite(f) || f === 0) {
    return special(f);
  }
  return layout(f < 0, floatDecimal(f));
}

/** Double.toHexString(v). */
export function doubleToHexString(v) {
  if (!Number.isFinite(v)) {
    return special(v);
  }
  const bits = doubleBits(v);
  const sign = bits >> 63n ? '-' : '';
  const exp = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & ((1n << 52n) - 1n);
  if (exp === 0 && fraction === 0n) {
    return `${sign}0x0.0p0`;
  }
  let hex = fraction.toString(16).padStart(13, '0').replace(/0+$/, '');
  if (hex === '') {
    hex = '0';
  }
  return exp === 0 ? `${sign}0x0.${hex}p-1022` : `${sign}0x1.${hex}p${exp - 1023}`;
}

// ------------------------------------------------------------------ boxed values

/** A boxed primitive: its value and Java class. */
class Box {
  constructor(value) {
    this.value = value;
  }

  getClass() {
    return this.constructor.javaClass;
  }
}

/** java.lang.Integer (a JavaScript number in the int range). */
export class JavaInteger extends Box {
  static javaClass = Types.INTEGER;

  toString() {
    return String(this.value);
  }

  hashCode() {
    return this.value;
  }
}

/** java.lang.Short. */
export class JavaShort extends JavaInteger {
  static javaClass = Types.SHORT;
}

/** java.lang.Byte. */
export class JavaByte extends JavaInteger {
  static javaClass = Types.BYTE;
}

/** java.lang.Long (a bigint). */
export class JavaLong extends Box {
  static javaClass = Types.LONG;

  toString() {
    return this.value.toString();
  }

  hashCode() {
    const u = BigInt.asUintN(64, this.value);
    return Number(BigInt.asIntN(32, u ^ (u >> 32n)));
  }
}

/** java.lang.Double. */
export class JavaDouble extends Box {
  static javaClass = Types.DOUBLE;

  toString() {
    return doubleToString(this.value);
  }

  hashCode() {
    const bits = Number.isNaN(this.value) ? 0x7ff8000000000000n : doubleBits(this.value);
    return Number(BigInt.asIntN(32, bits ^ (bits >> 32n)));
  }
}

/** java.lang.Float (the JavaScript number of the float). */
export class JavaFloat extends Box {
  static javaClass = Types.FLOAT;

  toString() {
    return floatToString(this.value);
  }

  hashCode() {
    return Number.isNaN(this.value) ? 0x7fc00000 : floatBits(this.value) | 0;
  }
}

/** java.lang.Character (a UTF-16 code unit). */
export class JavaCharacter extends Box {
  static javaClass = Types.CHARACTER;

  toString() {
    return String.fromCharCode(this.value);
  }

  hashCode() {
    return this.value;
  }
}

/** Object.hashCode() of the value types the library hands to the formatter. */
export function hashCodeOf(value) {
  if (typeof value === 'string') {
    return stringHashCode(value);
  }
  if (typeof value === 'boolean') {
    return value ? 1231 : 1237;
  }
  return value.hashCode();
}
