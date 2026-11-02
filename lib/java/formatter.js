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
 * String.format(format, args...) in the en_US locale, as java.util.Formatter does it: the specifier grammar, the
 * checks and their exceptions, and the conversions of strings, characters, integers, floating point numbers and
 * BigDecimals, and the date and time conversions (%t, %T) of a Long of milliseconds in the UTC time zone.
 *
 * @module java/formatter
 */

import { JavaBigDecimal, JavaBigInteger } from './big-numbers.js';
import { codePointString, isValidCodePoint, toUpperCaseString } from './character.js';
import {
  DuplicateFormatFlagsException,
  FormatFlagsConversionMismatchException,
  IllegalFormatArgumentIndexException,
  IllegalFormatCodePointException,
  IllegalFormatConversionException,
  IllegalFormatFlagsException,
  IllegalFormatPrecisionException,
  IllegalFormatWidthException,
  MissingFormatArgumentException,
  MissingFormatWidthException,
  UnknownFormatConversionException,
  UnknownFormatFlagsException
} from './errors.js';
import { LONG_DAYS, LONG_MONTHS, SHORT_DAYS, SHORT_MONTHS, utcFields } from './date.js';
import {
  doubleBits,
  doubleDecimal,
  doubleToHexString,
  hashCodeOf,
  intToHexString,
  JavaByte,
  JavaCharacter,
  JavaDouble,
  JavaFloat,
  JavaInteger,
  JavaLong,
  JavaShort,
  longToUnsignedString
} from './primitives.js';
import { classOf, javaString } from './types.js';

const LEFT_JUSTIFY = 1 << 0;
const UPPERCASE = 1 << 1;
const ALTERNATE = 1 << 2;
const PLUS = 1 << 3;
const LEADING_SPACE = 1 << 4;
const ZERO_PAD = 1 << 5;
const GROUP = 1 << 6;
const PARENTHESES = 1 << 7;
const PREVIOUS = 1 << 8;

const FLAG_CHARS = { '-': LEFT_JUSTIFY, '#': ALTERNATE, '+': PLUS, ' ': LEADING_SPACE, '0': ZERO_PAD, ',': GROUP,
  '(': PARENTHESES, '<': PREVIOUS };

const contains = (flags, f) => (flags & f) === f;
const containsAny = (flags, f) => (flags & f) !== 0;

function flagsToString(f) {
  let sb = '';
  for (const [c, v] of [['-', LEFT_JUSTIFY], ['^', UPPERCASE], ['#', ALTERNATE], ['+', PLUS], [' ', LEADING_SPACE],
    ['0', ZERO_PAD], [',', GROUP], ['(', PARENTHESES], ['<', PREVIOUS]]) {
    if (contains(f, v)) {
      sb += c;
    }
  }
  return sb;
}

function parseFlags(s) {
  let f = 0;
  for (const c of s) {
    const v = FLAG_CHARS[c];
    if (v === undefined) {
      throw new UnknownFormatFlagsException(`Flags = ${c}`);
    }
    if (contains(f, v)) {
      throw new DuplicateFormatFlagsException(`Flags = '${flagsToString(v)}'`);
    }
    f |= v;
  }
  return f;
}

const VALID = new Set('bBsShHcCdoxXeEgGfaAn%');
const isConversion = (c) => /^[a-zA-Z%]$/.test(c);
const isDigit = (c) => c >= '0' && c <= '9';
const DATE_TIME = new Set('HIklMNLQpsSTzZaAbBCdehjmyYrRcDF');

/** A parsed specifier int value, the way Integer.parseInt(s, start, end, 10) reads it (or null on overflow). */
function intValue(text) {
  const n = Number(text);
  return n > 2147483647 ? null : n;
}

class FormatSpecifier {
  constructor(source) {
    this.index = 0;
    this.flags = 0;
    this.width = -1;
    this.precision = -1;
    this.dt = false;
    if (source.simple !== undefined) {
      this.simple(source.simple);
      return;
    }
    const { arg, flags, width, precision, t, conversion } = source;
    if (arg) {
      const index = intValue(arg.slice(0, -1));
      if (index === null) {
        throw new IllegalFormatArgumentIndexException('Format argument index: (not representable as int)');
      }
      if (index <= 0) {
        throw new IllegalFormatArgumentIndexException(`Illegal format argument index = ${index}`);
      }
      this.index = index;
    }
    if (flags) {
      this.flags = parseFlags(flags);
      if (contains(this.flags, PREVIOUS)) {
        this.index = -1;
      }
    }
    if (width) {
      const w = intValue(width);
      if (w === null) {
        throw new IllegalFormatWidthException(String(-2147483648));
      }
      this.width = w;
    }
    if (precision) {
      const p = intValue(precision.slice(1));
      if (p === null) {
        throw new IllegalFormatPrecisionException(String(-2147483648));
      }
      this.precision = p;
    }
    if (t) {
      this.dt = true;
      if (t === 'T') {
        this.flags |= UPPERCASE;
      }
    }
    this.c = conversion;
    if (!this.dt) {
      if (!VALID.has(this.c)) {
        throw new UnknownFormatConversionException(`Conversion = '${this.c}'`);
      }
      if (this.c >= 'A' && this.c <= 'Z') {
        this.flags |= UPPERCASE;
        this.c = this.c.toLowerCase();
      }
      if (this.c === 'n' || this.c === '%') {
        this.index = -2;
      }
    }
    this.check();
  }

  simple(conv) {
    this.c = conv;
    if (conv >= 'A' && conv <= 'Z') {
      this.flags = UPPERCASE;
      this.c = conv.toLowerCase();
    }
    if (conv === 'n' || conv === '%') {
      this.index = -2;
    }
  }

  toString() {
    let sb = `%${flagsToString(this.flags & ~UPPERCASE)}`;
    if (this.index > 0) {
      sb += `${this.index}$`;
    }
    if (this.width !== -1) {
      sb += this.width;
    }
    if (this.precision !== -1) {
      sb += `.${this.precision}`;
    }
    if (this.dt) {
      sb += contains(this.flags, UPPERCASE) ? 'T' : 't';
    }
    return sb + (contains(this.flags, UPPERCASE) ? this.c.toUpperCase() : this.c);
  }

  failMismatch(f, c) {
    throw new FormatFlagsConversionMismatchException(`Conversion = ${c}, Flags = ${flagsToString(f)}`);
  }

  checkBadFlags(bad) {
    if ((this.flags & bad) !== 0) {
      this.failMismatch(this.flags & bad, this.c);
    }
  }

  check() {
    const c = this.c;
    if (this.dt) {
      this.checkDateTime();
    } else if ('bsh'.includes(c)) {
      if ((c === 'b' || c === 'h') && contains(this.flags, ALTERNATE)) {
        this.failMismatch(ALTERNATE, c);
      }
      if (this.width === -1 && contains(this.flags, LEFT_JUSTIFY)) {
        throw new MissingFormatWidthException(this.toString());
      }
      this.checkBadFlags(PLUS | LEADING_SPACE | ZERO_PAD | GROUP | PARENTHESES);
    } else if (c === 'c') {
      if (this.precision !== -1) {
        throw new IllegalFormatPrecisionException(String(this.precision));
      }
      this.checkBadFlags(ALTERNATE | PLUS | LEADING_SPACE | ZERO_PAD | GROUP | PARENTHESES);
      if (this.width === -1 && contains(this.flags, LEFT_JUSTIFY)) {
        throw new MissingFormatWidthException(this.toString());
      }
    } else if ('dox'.includes(c)) {
      this.checkNumeric();
      if (this.precision !== -1) {
        throw new IllegalFormatPrecisionException(String(this.precision));
      }
      this.checkBadFlags(c === 'd' ? ALTERNATE : GROUP);
    } else if ('egfa'.includes(c)) {
      this.checkNumeric();
      if (c === 'a') {
        this.checkBadFlags(PARENTHESES | GROUP);
      } else if (c === 'e') {
        this.checkBadFlags(GROUP);
      } else if (c === 'g') {
        this.checkBadFlags(ALTERNATE);
      }
    } else {
      this.checkText();
    }
  }

  checkDateTime() {
    if (this.precision !== -1) {
      throw new IllegalFormatPrecisionException(String(this.precision));
    }
    if (!DATE_TIME.has(this.c)) {
      throw new UnknownFormatConversionException(`Conversion = 't${this.c}'`);
    }
    this.checkBadFlags(ALTERNATE | PLUS | LEADING_SPACE | ZERO_PAD | GROUP | PARENTHESES);
    if (this.width === -1 && contains(this.flags, LEFT_JUSTIFY)) {
      throw new MissingFormatWidthException(this.toString());
    }
  }

  checkNumeric() {
    if (this.width === -1 && containsAny(this.flags, LEFT_JUSTIFY | ZERO_PAD)) {
      throw new MissingFormatWidthException(this.toString());
    }
    if (contains(this.flags, PLUS | LEADING_SPACE) || contains(this.flags, LEFT_JUSTIFY | ZERO_PAD)) {
      throw new IllegalFormatFlagsException(`Flags = '${flagsToString(this.flags)}'`);
    }
  }

  checkText() {
    if (this.precision !== -1) {
      throw new IllegalFormatPrecisionException(String(this.precision));
    }
    if (this.c === '%') {
      if (this.flags !== LEFT_JUSTIFY && this.flags !== 0) {
        throw new IllegalFormatFlagsException(`Flags = '${flagsToString(this.flags)}'`);
      }
      if (this.width === -1 && contains(this.flags, LEFT_JUSTIFY)) {
        throw new MissingFormatWidthException(this.toString());
      }
    } else {
      if (this.width !== -1) {
        throw new IllegalFormatWidthException(String(this.width));
      }
      if (this.flags !== 0) {
        throw new IllegalFormatFlagsException(`Flags = '${flagsToString(this.flags)}'`);
      }
    }
  }

  failConversion(arg) {
    throw new IllegalFormatConversionException(`${this.c} != ${classOf(arg).getName()}`);
  }

  print(out, arg) {
    if (this.dt) {
      if (arg == null) {
        this.printString(out, 'null');
        return;
      }
      if (!(arg instanceof JavaLong)) {
        this.failConversion(arg);
      }
      const text = this.dateTime(utcFields(arg.value), arg.value, this.c);
      out.push(this.justify(contains(this.flags, UPPERCASE) ? toUpperCaseString(text) : text));
      return;
    }
    switch (this.c) {
      case 'd':
      case 'o':
      case 'x':
        this.printInteger(out, arg);
        break;
      case 'e':
      case 'g':
      case 'f':
      case 'a':
        this.printFloat(out, arg);
        break;
      case 'c':
        this.printCharacter(out, arg);
        break;
      case 'b':
        this.printString(out, arg == null ? 'false' : typeof arg === 'boolean' ? String(arg) : 'true');
        break;
      case 's':
        if (contains(this.flags, ALTERNATE)) {
          this.failMismatch(ALTERNATE, 's');
        }
        this.printString(out, javaString(arg));
        break;
      case 'h':
        this.printString(out, arg == null ? 'null' : intToHexString(hashCodeOf(arg)));
        break;
      case 'n':
        out.push('\n');
        break;
      default:
        this.printString(out, '%');
    }
  }

  /** A date/time conversion of an instant (a Long of milliseconds) in the UTC time zone, en_US names. */
  dateTime(f, millis, c) {
    const pad = (value, width) => {
      const s = String(value);
      return s.length < width ? '0'.repeat(width - s.length) + s : s;
    };
    switch (c) {
      case 'H':
        return pad(f.hour, 2);
      case 'I':
        return pad(f.hour === 0 || f.hour === 12 ? 12 : f.hour % 12, 2);
      case 'k':
        return String(f.hour);
      case 'l':
        return String(f.hour === 0 || f.hour === 12 ? 12 : f.hour % 12);
      case 'M':
        return pad(f.minute, 2);
      case 'N':
        return pad(f.millisecond * 1000000, 9);
      case 'L':
        return pad(f.millisecond, 3);
      case 'Q':
        return millis.toString();
      case 'p':
        return f.hour < 12 ? 'am' : 'pm';
      case 's':
        return (millis / 1000n).toString();
      case 'S':
        return pad(f.second, 2);
      case 'z':
        return '+0000';
      case 'Z':
        return 'UTC';
      case 'a':
        return SHORT_DAYS[f.dayOfWeek];
      case 'A':
        return LONG_DAYS[f.dayOfWeek];
      case 'b':
      case 'h':
        return SHORT_MONTHS[f.month - 1];
      case 'B':
        return LONG_MONTHS[f.month - 1];
      case 'C':
        return pad(Math.trunc(f.year / 100), 2);
      case 'y':
        return pad(f.year % 100, 2);
      case 'Y':
        return pad(f.year, 4);
      case 'd':
        return pad(f.day, 2);
      case 'e':
        return String(f.day);
      case 'j':
        return pad(f.dayOfYear, 3);
      case 'm':
        return pad(f.month, 2);
      case 'T':
        return `${this.dateTime(f, millis, 'H')}:${this.dateTime(f, millis, 'M')}:${this.dateTime(f, millis, 'S')}`;
      case 'R':
        return `${this.dateTime(f, millis, 'H')}:${this.dateTime(f, millis, 'M')}`;
      case 'r':
        return `${this.dateTime(f, millis, 'I')}:${this.dateTime(f, millis, 'M')}:${this.dateTime(f, millis, 'S')} `
          + this.dateTime(f, millis, 'p').toUpperCase();
      case 'c':
        return ['a', 'b', 'd', 'T', 'Z', 'Y'].map((x) => this.dateTime(f, millis, x)).join(' ');
      case 'D':
        return `${this.dateTime(f, millis, 'm')}/${this.dateTime(f, millis, 'd')}/${this.dateTime(f, millis, 'y')}`;
      default:
        return `${this.dateTime(f, millis, 'Y')}-${this.dateTime(f, millis, 'm')}-${this.dateTime(f, millis, 'd')}`;
    }
  }

  printString(out, text) {
    let s = text;
    if (this.precision !== -1 && this.precision < s.length) {
      s = s.slice(0, this.precision);
    }
    if (contains(this.flags, UPPERCASE)) {
      s = toUpperCaseString(s);
    }
    out.push(this.justify(s));
  }

  justify(s) {
    if (this.width === -1 || this.width <= s.length) {
      return s;
    }
    const pad = ' '.repeat(this.width - s.length);
    return contains(this.flags, LEFT_JUSTIFY) ? s + pad : pad + s;
  }

  printCharacter(out, arg) {
    if (arg == null) {
      this.printString(out, 'null');
      return;
    }
    let s;
    if (arg instanceof JavaCharacter) {
      s = arg.toString();
    } else if (arg instanceof JavaInteger) {
      if (!isValidCodePoint(arg.value)) {
        throw new IllegalFormatCodePointException(`Code point = 0x${intToHexString(arg.value)}`);
      }
      s = codePointString(arg.value);
    } else {
      this.failConversion(arg);
    }
    this.printString(out, s);
  }

  leadingSign(neg) {
    if (!neg) {
      return contains(this.flags, PLUS) ? '+' : contains(this.flags, LEADING_SPACE) ? ' ' : '';
    }
    return contains(this.flags, PARENTHESES) ? '(' : '-';
  }

  trailingSign(neg) {
    return neg && contains(this.flags, PARENTHESES) ? ')' : '';
  }

  adjustWidth(width, neg) {
    return width !== -1 && neg && contains(this.flags, PARENTHESES) ? width - 1 : width;
  }

  /** Formatter.localizedMagnitude for en_US: grouping by threes, zero padding to width. */
  localizedMagnitude(sb, value, flags, width) {
    const dot = value.indexOf('.');
    const intEnd = dot === -1 ? value.length : dot;
    let digits = '';
    for (let j = 0; j < value.length; j++) {
      if (j === dot) {
        digits += '.';
        continue;
      }
      digits += value[j];
      if (contains(flags, GROUP) && j < intEnd - 1 && (intEnd - j) % 3 === 1) {
        digits += ',';
      }
    }
    if (width > sb.length + digits.length && contains(flags, ZERO_PAD)) {
      return { sb, digits: '0'.repeat(width - sb.length - digits.length) + digits };
    }
    return { sb, digits };
  }

  magnitude(prefix, value, flags, width) {
    const { digits } = this.localizedMagnitude(prefix, value, flags, width);
    return prefix + digits;
  }

  printInteger(out, arg) {
    if (arg == null) {
      this.printString(out, 'null');
      return;
    }
    if (arg instanceof JavaBigInteger) {
      this.printBigInteger(out, arg.value);
      return;
    }
    if (!(arg instanceof JavaInteger || arg instanceof JavaLong)) {
      this.failConversion(arg);
    }
    let v = BigInt(arg.value);
    if (v < 0n && this.c !== 'd') {
      const bits = arg instanceof JavaByte ? 8n : arg instanceof JavaShort ? 16n : arg instanceof JavaLong ? 0n : 32n;
      if (bits !== 0n) {
        v += 1n << bits;
      }
    }
    let sb;
    if (this.c === 'd') {
      const neg = v < 0n;
      sb = this.magnitude(this.leadingSign(neg), (neg ? -v : v).toString(), this.flags, this.adjustWidth(this.width, neg));
      sb += this.trailingSign(neg);
    } else {
      this.checkBadFlags(PARENTHESES | LEADING_SPACE | PLUS);
      const radix = this.c === 'o' ? 8 : 16;
      let s = longToUnsignedString(v, radix);
      const prefix = contains(this.flags, ALTERNATE) ? (radix === 8 ? '0' : contains(this.flags, UPPERCASE) ? '0X' : '0x') : '';
      const zeros = contains(this.flags, ZERO_PAD) ? Math.max(0, this.width - s.length - prefix.length) : 0;
      if (contains(this.flags, UPPERCASE)) {
        s = s.toUpperCase();
      }
      sb = prefix + '0'.repeat(zeros) + s;
    }
    out.push(this.justify(sb));
  }

  printBigInteger(out, value) {
    const neg = value < 0n;
    const v = neg ? -value : value;
    let sb = this.leadingSign(neg);
    if (this.c === 'd') {
      sb = this.magnitude(sb, v.toString(), this.flags, this.adjustWidth(this.width, neg));
    } else {
      let s = v.toString(this.c === 'o' ? 8 : 16);
      let len = s.length + sb.length;
      if (neg && contains(this.flags, PARENTHESES)) {
        len++;
      }
      if (contains(this.flags, ALTERNATE)) {
        len += this.c === 'o' ? 1 : 2;
        sb += this.c === 'o' ? '0' : contains(this.flags, UPPERCASE) ? '0X' : '0x';
      }
      if (contains(this.flags, ZERO_PAD) && this.width - len > 0) {
        sb += '0'.repeat(this.width - len);
      }
      if (contains(this.flags, UPPERCASE)) {
        s = s.toUpperCase();
      }
      sb += s;
    }
    out.push(this.justify(sb + this.trailingSign(neg)));
  }

  printFloat(out, arg) {
    if (arg == null) {
      this.printString(out, 'null');
      return;
    }
    if (arg instanceof JavaDouble || arg instanceof JavaFloat) {
      this.printDouble(out, arg.value);
      return;
    }
    if (arg instanceof JavaBigDecimal) {
      if (this.c === 'a') {
        this.failConversion(arg);
      }
      const neg = arg.signum() === -1;
      const body = this.bigDecimalBody(this.leadingSign(neg), arg.abs(), this.c, this.precision, neg);
      out.push(this.justify(body + this.trailingSign(neg)));
      return;
    }
    this.failConversion(arg);
  }

  printDouble(out, value) {
    let sb;
    if (Number.isNaN(value)) {
      sb = contains(this.flags, UPPERCASE) ? 'NAN' : 'NaN';
    } else {
      const neg = value < 0 || Object.is(value, -0);
      const v = Math.abs(value);
      sb = this.leadingSign(neg);
      if (v === Infinity) {
        sb += contains(this.flags, UPPERCASE) ? 'INFINITY' : 'Infinity';
      } else {
        sb = this.doubleBody(sb, v, neg);
      }
      sb += this.trailingSign(neg);
    }
    out.push(this.justify(sb));
  }

  doubleBody(sign, value, neg) {
    const upper = contains(this.flags, UPPERCASE);
    if (this.c === 'e') {
      const prec = this.precision === -1 ? 6 : this.precision;
      const fd = FormattedDecimal.of(value).scientific(prec);
      let mant = addZeros(fd.mantissa, prec);
      if (contains(this.flags, ALTERNATE) && prec === 0) {
        mant += '.';
      }
      const exp = value === 0 ? '+00' : fd.exponent;
      const newW = this.width !== -1 ? this.adjustWidth(this.width - exp.length - 1, neg) : this.width;
      return `${this.magnitude(sign, mant, this.flags, newW)}${upper ? 'E' : 'e'}${exp}`;
    }
    if (this.c === 'f') {
      const prec = this.precision === -1 ? 6 : this.precision;
      let mant = addZeros(FormattedDecimal.of(value).plain(prec).mantissa, prec);
      if (contains(this.flags, ALTERNATE) && prec === 0) {
        mant += '.';
      }
      return this.magnitude(sign, mant, this.flags, this.adjustWidth(this.width, neg));
    }
    if (this.c === 'g') {
      let prec = this.precision === -1 ? 6 : this.precision === 0 ? 1 : this.precision;
      let exp = null;
      let mant;
      let expRounded = 0;
      if (value === 0) {
        mant = '0';
      } else {
        const fd = FormattedDecimal.of(value).general(prec);
        exp = fd.exponent;
        mant = fd.mantissa;
        expRounded = fd.exponentRounded();
      }
      prec -= exp !== null ? 1 : expRounded + 1;
      mant = addZeros(mant, prec);
      if (contains(this.flags, ALTERNATE) && prec === 0) {
        mant += '.';
      }
      let newW = this.width;
      if (this.width !== -1) {
        newW = this.adjustWidth(exp !== null ? this.width - exp.length - 1 : this.width, neg);
      }
      const body = this.magnitude(sign, mant, this.flags, newW);
      return exp !== null ? `${body}${upper ? 'E' : 'e'}${exp}` : body;
    }
    let prec = this.precision === -1 ? 0 : this.precision === 0 ? 1 : this.precision;
    const s = hexDouble(value, prec);
    let sb = sign + (upper ? '0X' : '0x');
    if (contains(this.flags, ZERO_PAD)) {
      const leading = contains(this.flags, LEADING_SPACE) || contains(this.flags, PLUS) || neg ? 3 : 2;
      sb += '0'.repeat(Math.max(0, this.width - s.length - leading));
    }
    const idx = s.indexOf('p');
    let va = upper ? s.slice(0, idx).toUpperCase() : s.slice(0, idx);
    if (prec !== 0) {
      va = addZeros(va, prec);
    }
    return `${sb}${va}${upper ? 'P' : 'p'}${s.slice(idx + 1)}`;
  }

  bigDecimalBody(sign, value, c, precision, neg) {
    if (c === 'e') {
      const prec = precision === -1 ? 6 : precision;
      const origPrec = value.precision();
      let nzeros = 0;
      let compPrec;
      if (prec > origPrec - 1) {
        compPrec = origPrec;
        nzeros = prec - (origPrec - 1);
      } else {
        compPrec = prec + 1;
      }
      const v = JavaBigDecimal.rounded(value.unscaled, value.scale, compPrec);
      const bdl = layoutBigDecimal(v.unscaled, v.scale, 'e');
      let mant = bdl.mant;
      if ((origPrec === 1 || !bdl.dot) && (nzeros > 0 || contains(this.flags, ALTERNATE))) {
        mant += '.';
      }
      mant += '0'.repeat(Math.max(0, nzeros));
      const newW = this.width !== -1 ? this.adjustWidth(this.width - bdl.exp.length - 1, neg) : this.width;
      const body = this.magnitude(sign, mant, this.flags, newW);
      return `${body}${contains(this.flags, UPPERCASE) ? 'E' : 'e'}${bdl.exp}`;
    }
    if (c === 'f') {
      const prec = precision === -1 ? 6 : precision;
      let v = value;
      if (v.scale > prec) {
        const compPrec = v.precision();
        v = compPrec <= v.scale ? v.setScale(prec) : JavaBigDecimal.rounded(v.unscaled, v.scale, compPrec - (v.scale - prec));
      }
      const bdl = layoutBigDecimal(v.unscaled, v.scale, 'f');
      let mant = bdl.mant;
      const nzeros = bdl.scale < prec ? prec - bdl.scale : 0;
      if (bdl.scale === 0 && (contains(this.flags, ALTERNATE) || nzeros > 0)) {
        mant += '.';
      }
      mant += '0'.repeat(nzeros);
      return this.magnitude(sign, mant, this.flags, this.adjustWidth(this.width, neg));
    }
    let prec = precision === -1 ? 6 : precision === 0 ? 1 : precision;
    const v = value.round(prec);
    const isZero = v.unscaled === 0n && v.scale === 0;
    if (isZero || (v.compareTo(new JavaBigDecimal(1n, 4)) !== -1 && v.compareTo(new JavaBigDecimal(1n, -prec)) === -1)) {
      const e = -v.scale + (v.unscaled.toString().length - 1);
      prec = prec - e - 1;
      return this.bigDecimalBody(sign, v, 'f', prec, neg);
    }
    return this.bigDecimalBody(sign, v, 'e', prec - 1, neg);
  }
}

/** Formatter.addZeros: pads the fraction of a mantissa with zeros up to prec digits. */
function addZeros(mant, prec) {
  const i = mant.indexOf('.');
  const needDot = i === -1;
  const outPrec = needDot ? 0 : mant.length - i - 1;
  if (outPrec >= prec) {
    return mant;
  }
  return (needDot ? `${mant}.` : mant) + '0'.repeat(prec - outPrec);
}

/** Formatter.BigDecimalLayout. */
function layoutBigDecimal(intVal, scale, form) {
  const coeff = intVal.toString();
  const len = coeff.length;
  let mant;
  let exp = null;
  let dot = false;
  let outScale = scale;
  if (scale === 0) {
    if (len > 1) {
      if (form === 'e') {
        mant = `${coeff[0]}.${coeff.slice(1)}`;
        dot = true;
        exp = `+${len < 10 ? '0' : ''}${len - 1}`;
      } else {
        mant = coeff;
      }
    } else {
      mant = coeff;
      if (form === 'e') {
        exp = '+00';
      }
    }
  } else if (form === 'f') {
    if (scale >= len) {
      mant = `0.${'0'.repeat(scale - len)}${coeff}`;
      dot = true;
    } else if (scale > 0) {
      mant = `${coeff.slice(0, len - scale)}.${coeff.slice(len - scale)}`;
      dot = true;
    } else {
      mant = intVal !== 0n ? coeff + '0'.repeat(-scale) : coeff;
      outScale = 0;
    }
  } else {
    mant = len > 1 ? `${coeff[0]}.${coeff.slice(1)}` : coeff;
    dot = len > 1;
    const adjusted = -scale + (len - 1);
    if (adjusted !== 0) {
      const a = Math.abs(adjusted);
      exp = `${adjusted < 0 ? '-' : '+'}${a < 10 ? '0' : ''}${a}`;
    } else {
      exp = '+00';
    }
  }
  return { mant, exp, dot, scale: outScale };
}

/** jdk.internal.math.FormattedFPDecimal: the shortest decimal of a double, rounded half up to a precision. */
class FormattedDecimal {
  constructor(f, e, n) {
    this.f = f;
    this.e = e;
    this.n = n;
  }

  static of(value) {
    if (value === 0) {
      return new FormattedDecimal(0n, 0, 0);
    }
    const { digits, exp } = doubleDecimal(value);
    return new FormattedDecimal(BigInt(digits), exp, digits.length);
  }

  exponentRounded() {
    return this.n + this.e - 1;
  }

  round(pp) {
    if (this.n === 0 || pp < 0) {
      this.f = 0n;
      this.e = 0;
      this.n = 1;
      return;
    }
    if (pp >= this.n) {
      return;
    }
    const p = pp;
    this.e += this.n - p;
    const pow10 = 10n ** BigInt(this.n - p);
    this.f = (this.f + pow10 / 2n) / pow10;
    if (p === 0) {
      this.n = 1;
      if (this.f === 0n) {
        this.e = 0;
      }
      return;
    }
    this.n = p;
    if (this.f === 10n ** BigInt(p)) {
      this.f /= 10n;
      this.e += 1;
    }
  }

  plain(prec) {
    this.round(this.n + this.e + prec);
    return this.plainChars();
  }

  plainChars() {
    const digits = this.f.toString().padStart(this.n, '0');
    if (this.e >= 0) {
      this.mantissa = digits + '0'.repeat(this.e);
    } else if (this.n + this.e > 0) {
      this.mantissa = `${digits.slice(0, this.n + this.e)}.${digits.slice(this.n + this.e)}`;
    } else {
      this.mantissa = `0.${'0'.repeat(-this.e - this.n)}${digits}`;
    }
    return this;
  }

  scientific(prec) {
    this.round(prec + 1);
    return this.scientificChars(prec);
  }

  scientificChars(prec) {
    const digits = this.f.toString().padStart(this.n, '0');
    this.mantissa = prec !== 0 ? `${digits[0]}.${digits.slice(1)}` : digits[0];
    const er = this.exponentRounded();
    const aer = Math.abs(er);
    this.exponent = `${er >= 0 ? '+' : '-'}${String(aer).padStart(2, '0')}`;
    return this;
  }

  general(prec) {
    this.round(prec);
    const er = this.exponentRounded();
    if (er >= -4 && er < prec) {
      this.exponent = null;
      return this.plainChars();
    }
    return this.scientificChars(prec - 1);
  }
}

/** Formatter.hexDouble: Double.toHexString without "0x", rounded to prec hex digits (1 to 12). */
function hexDouble(d, prec) {
  if (!Number.isFinite(d) || d === 0 || prec === 0 || prec >= 13) {
    return doubleToHexString(d).slice(2);
  }
  let v = d;
  const subnormal = v < 2 ** -1022;
  if (subnormal) {
    v *= 2 ** 54;
  }
  const shiftDistance = 53 - (1 + prec * 4);
  const doppel = doubleBits(v);
  let newSignif = (doppel & 0x7fffffffffffffffn) >> BigInt(shiftDistance);
  const roundingBits = doppel & ((1n << BigInt(shiftDistance)) - 1n);
  const leastZero = (newSignif & 1n) === 0n;
  const round = ((1n << BigInt(shiftDistance - 1)) & roundingBits) !== 0n;
  const sticky = shiftDistance > 1 && (~(1n << BigInt(shiftDistance - 1)) & roundingBits) !== 0n;
  if ((leastZero && round && sticky) || (!leastZero && round)) {
    newSignif++;
  }
  const result = new Float64Array(new BigUint64Array([newSignif << BigInt(shiftDistance)]).buffer)[0];
  if (result === Infinity) {
    return '1.0p1024';
  }
  const res = doubleToHexString(result).slice(2);
  if (!subnormal) {
    return res;
  }
  const idx = res.indexOf('p');
  return `${res.slice(0, idx)}p${Number(res.slice(idx + 1)) - 54}`;
}

/** Formatter.parse: fixed text and format specifiers, as descriptions for FormatSpecifier. */
function parse(s) {
  const list = [];
  let i = 0;
  const max = s.length;
  while (i < max) {
    const n = s.indexOf('%', i);
    if (n < 0) {
      list.push(s.slice(i));
      break;
    }
    if (i !== n) {
      list.push(s.slice(i, n));
    }
    i = n + 1;
    if (i >= max) {
      throw new UnknownFormatConversionException("Conversion = '%'");
    }
    const c = s[i];
    if (VALID.has(c)) {
      list.push(new FormatSpecifier({ simple: c }));
      i++;
      continue;
    }
    const off = parseSpecifier(s, i, list);
    if (off > 0) {
      i += off;
    } else {
      throw new UnknownFormatConversionException(`Conversion = '${c}'`);
    }
  }
  return list;
}

/** Formatter.FormatSpecifierParser.parse: the length of the specifier at start, or 0. */
function parseSpecifier(s, start, list) {
  const max = s.length;
  let off = start;
  let c = s[off];
  let arg = '';
  let i = off;
  while (i < max && isDigit((c = s[i]))) {
    ++i;
  }
  if (i !== off && c === '$') {
    i++;
    if (i < max) {
      c = s[i];
    }
    arg = s.slice(off, i);
    off = i;
  } else {
    c = s[start];
  }
  i = off;
  while (i < max && FLAG_CHARS[(c = s[i])] !== undefined) {
    ++i;
  }
  const flags = s.slice(off, i);
  off = i;
  while (i < max && isDigit((c = s[i]))) {
    ++i;
  }
  const width = s.slice(off, i);
  off = i;
  let precision = '';
  if (c === '.') {
    i = ++off;
    while (i < max && isDigit((c = s[i]))) {
      ++i;
    }
    if (i === off) {
      return 0;
    }
    precision = s.slice(off - 1, i);
    off = i;
  }
  let t = '';
  let conversion = '';
  if ((c === 't' || c === 'T') && off + 1 < max) {
    const c1 = s[off + 1];
    if (isConversion(c1)) {
      t = c;
      conversion = c1;
      off += 2;
    }
  } else if (isConversion(c)) {
    conversion = c;
    ++off;
  } else {
    return 0;
  }
  if (arg || flags || width || precision || t || conversion) {
    list.push(new FormatSpecifier({ arg, flags, width, precision, t, conversion }));
    return off - start;
  }
  return 0;
}

/**
 * String.format(Locale.US, format, args...).
 *
 * @param {string} format the format string
 * @param {Array} args Java values: strings, booleans, boxed numbers and characters, BigInteger, BigDecimal, null
 * @returns {string} the formatted text
 */
export function format(format, ...args) {
  const out = [];
  let last = -1;
  let lasto = -1;
  for (const fs of parse(format)) {
    if (typeof fs === 'string') {
      out.push(fs);
      continue;
    }
    switch (fs.index) {
      case -2:
        fs.print(out, null);
        break;
      case -1:
        if (last < 0 || last > args.length - 1) {
          throw new MissingFormatArgumentException(`Format specifier '${fs}'`);
        }
        fs.print(out, args[last]);
        break;
      case 0:
        lasto++;
        last = lasto;
        if (lasto > args.length - 1) {
          throw new MissingFormatArgumentException(`Format specifier '${fs}'`);
        }
        fs.print(out, args[lasto]);
        break;
      default:
        last = fs.index - 1;
        if (last > args.length - 1) {
          throw new MissingFormatArgumentException(`Format specifier '${fs}'`);
        }
        fs.print(out, args[last]);
    }
  }
  return out.join('');
}
