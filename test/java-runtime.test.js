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

// Tests of the Java runtime behaviour the library relies on, as lib/java reproduces it.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { JavaBigDecimal } from '../lib/java/big-numbers.js';
import { digit, isJavaIdentifierPart, isWhitespace, toUpperCaseString } from '../lib/java/character.js';
import { parseDate } from '../lib/java/date.js';
import { format } from '../lib/java/formatter.js';
import { JavaFile, UnixPath } from '../lib/java/io.js';
import { doubleToString, floatToString, JavaCharacter, JavaDouble, JavaFloat, JavaInteger, JavaLong, parseDouble, parseFloat,
  parseInt, parseLong } from '../lib/java/primitives.js';
import { Properties } from '../lib/java/properties.js';
import { compareToIgnoreCase, equalsIgnoreCase, hashCode, trim } from '../lib/java/string.js';
import { JavaURL } from '../lib/java/url.js';

describe('numbers', () => {
  test('Double.toString', () => {
    const cases = [[1, '1.0'], [0.1, '0.1'], [1e7, '1.0E7'], [1234567.0, '1234567.0'], [0.001, '0.001'], [0.0001, '1.0E-4'], [-0, '-0.0'],
      [1e23, '1.0E23'], [5e-324, '4.9E-324'], [1e-323, '9.9E-324'], [NaN, 'NaN'], [-Infinity, '-Infinity'], [0.1 + 0.2, '0.30000000000000004']];
    for (const [v, s] of cases) {
      assert.equal(doubleToString(v), s, String(v));
    }
  });

  test('Float.toString', () => {
    assert.equal(floatToString(Math.fround(0.1)), '0.1');
    assert.equal(floatToString(Math.fround(1e10)), '1.0E10');
    assert.equal(floatToString(Math.fround(1.4e-45)), '1.4E-45');
    assert.equal(floatToString(Math.fround(3.4028235e38)), '3.4028235E38');
  });

  test('Double.parseDouble and Float.parseFloat', () => {
    assert.equal(parseDouble(' 1.5d '), 1.5);
    assert.equal(parseDouble('0x1.8p1'), 3);
    assert.equal(parseDouble('-Infinity'), -Infinity);
    assert.equal(Object.is(parseDouble('-0'), -0), true);
    assert.throws(() => parseDouble('1.2.3'), { message: 'multiple points' });
    assert.throws(() => parseDouble('   '), { message: 'empty String' });
    assert.throws(() => parseDouble(' 1e '), { message: 'For input string: " 1e "' });
    assert.equal(parseFloat('1.00000017881393432617187499'), Math.fround(1.0000001));
  });

  test('integers accept any Unicode decimal digits', () => {
    assert.equal(parseInt('١٢٣'), 123);
    assert.equal(parseLong('-９２２３３７２０３６８５４７７５８０８'), -9223372036854775808n);
    assert.throws(() => parseInt('2147483648'), { message: 'For input string: "2147483648"' });
    assert.throws(() => parseInt('+'), { message: 'For input string: "+"' });
  });

  test('BigDecimal', () => {
    assert.equal(JavaBigDecimal.parse('1E+3').toString(), '1E+3');
    assert.equal(JavaBigDecimal.parse('-0.000123').toString(), '-0.000123');
    assert.equal(JavaBigDecimal.parse('0.0000001').toString(), '1E-7');
    assert.throws(() => JavaBigDecimal.parse('1x'), { message: 'Character x is neither a decimal digit number, decimal point, nor "e" notation exponential mark.' });
    assert.throws(() => JavaBigDecimal.parse('1234567890123456789x'), { message: 'Character array is missing "e" notation exponential mark.' });
    assert.throws(() => JavaBigDecimal.parse(''), (e) => e.getMessage() === null);
  });
});

describe('String.format', () => {
  test('conversions', () => {
    assert.equal(format('%.1f|%s|%,d|%08.3e|%x', new JavaDouble(0.15), new JavaLong(10000000000n), new JavaInteger(1234567),
      new JavaDouble(12345.678), new JavaInteger(255)), '0.2|10000000000|1,234,567|1.235e+04|ff');
    assert.equal(format('%-5s|%5s|%S', 'ab', 'cd', 'straße'), 'ab   |   cd|STRASSE');
    assert.equal(format('%c%c', new JavaCharacter(0x41), new JavaInteger(0x1f600)), 'A😀');
    assert.equal(format('%x %o', new JavaInteger(-1), new JavaLong(-8n)), 'ffffffff 1777777777777777777770');
    assert.equal(format('%.3g|%g|%a', new JavaDouble(0.0001234), new JavaDouble(123456789), new JavaDouble(1)), '0.000123|1.23457e+08|0x1.0p0');
    assert.equal(format('%h %b %n%%', 'hello', null), '5e918d2 false \n%');
    assert.equal(format('%2$s %1$s %<s', 'a', 'b'), 'b a a');
    assert.equal(format('%.2f', new JavaFloat(Math.fround(0.1))), '0.10');
  });

  test('errors', () => {
    assert.throws(() => format('%q'), { name: 'UnknownFormatConversionException', message: "Conversion = 'q'" });
    assert.throws(() => format('%s'), { name: 'MissingFormatArgumentException', message: "Format specifier '%s'" });
    assert.throws(() => format('%d', 'x'), { name: 'IllegalFormatConversionException', message: 'd != java.lang.String' });
    assert.throws(() => format('%#s', 'x'), { name: 'FormatFlagsConversionMismatchException', message: 'Conversion = s, Flags = #' });
    assert.throws(() => format('%-d', new JavaInteger(1)), { name: 'MissingFormatWidthException', message: '%-d' });
    assert.throws(() => format('%.2d', new JavaInteger(1)), { name: 'IllegalFormatPrecisionException', message: '2' });
  });
});

describe('strings and characters', () => {
  test('String methods', () => {
    assert.equal(hashCode('hello'), 99162322);
    assert.equal(trim('\u0000 x \u001f'), 'x');
    assert.equal(trim(' x'), ' x');
    assert.equal(equalsIgnoreCase('yes', 'YEſ'), true);
    assert.ok(compareToIgnoreCase('a', 'B') < 0);
    assert.equal(compareToIgnoreCase('ǅ', 'ǆ'), 0);
    assert.equal(toUpperCaseString('ǰﬁ'), 'J̌FI');
  });

  test('character tables', () => {
    assert.equal(isJavaIdentifierPart('$'.charCodeAt(0)), true);
    assert.equal(isJavaIdentifierPart('-'.charCodeAt(0)), false);
    assert.equal(isJavaIdentifierPart(0), true);
    assert.equal(isWhitespace(0x1c), true);
    assert.equal(isWhitespace(0xa0), false);
    assert.equal(digit(0x0663, 10), 3);
    assert.equal(digit('z'.charCodeAt(0), 36), 35);
  });
});

describe('Properties order', () => {
  test('toString and propertyNames follow Java hash tables', () => {
    const props = new Properties();
    for (const k of ['param1', 'param2', 'param3']) {
      props.setProperty(k, 'v');
    }
    assert.equal(props.toString(), '{param3=v, param1=v, param2=v}');
    const many = new Properties();
    for (let i = 0; i < 20; i++) {
      many.setProperty(`k${i}`, String(i));
    }
    assert.equal(many.propertyNames().length, 20);
    assert.equal(many.getProperty('k7'), '7');
  });
});

describe('files, URLs and dates', () => {
  test('File and Path normalisation', () => {
    assert.equal(new JavaFile('a//b///').toString(), 'a/b');
    assert.equal(new JavaFile('///').toString(), '/');
    assert.equal(new UnixPath('//a//b/').toString(), '/a/b');
    assert.throws(() => new UnixPath('a\u0000b'), { message: 'Nul character not allowed: a\u0000b' });
  });

  test('URL parsing', () => {
    assert.equal(new JavaURL('  url:HTTP://user@Host:8080/p?q#f  ').toString(), 'http://user@Host:8080/p?q#f');
    assert.equal(new JavaURL('file:///etc/passwd').toString(), 'file:/etc/passwd');
    assert.throws(() => new JavaURL('foo:bar'), { message: 'unknown protocol: foo' });
    assert.throws(() => new JavaURL('http://[zz]/'), { message: 'Invalid host: [zz]' });
    assert.throws(() => new JavaURL('jar:file:/a.jar'), { message: 'no !/ in spec' });
    assert.throws(() => new JavaURL('http://h:abc/'), { message: 'Error at index 0 in: "abc"' });
  });

  test('dates', () => {
    assert.equal(parseDate('Thu Jun 06 17:48:57 EDT 2002').toString(), 'Thu Jun 06 21:48:57 UTC 2002');
    assert.equal(parseDate('sun feb 30 25:61:61 GMT+01:30 2004').toString(), 'Tue Mar 02 00:32:01 UTC 2004');
    assert.throws(() => parseDate('Mon Jan 01 00:00:00 GMT+5 2024'), { message: 'Unparseable date: "Mon Jan 01 00:00:00 GMT+5 2024"' });
  });
});
