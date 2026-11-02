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
 * java.util.Date and the one date pattern the library parses, "EEE MMM dd HH:mm:ss zzz yyyy", the way a lenient
 * SimpleDateFormat in the en_US locale and the UTC time zone reads it: names match case-insensitively (the longest
 * one wins), numbers are integers in any Unicode digits, and out-of-range fields roll over. Dates are proleptic
 * Gregorian. Time zone names are the fixed-offset names of Java's en_US zone strings, "GMT" with an optional
 * "+h:mm" offset, and RFC 822 offsets such as "+0530".
 *
 * @module java/date
 */

import { digit } from './character.js';
import { TextParseException } from './errors.js';
import { regionMatchesIgnoreCase } from './string.js';
import { Types } from './types.js';

export const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
  'November', 'December'];
export const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Zone names whose offset from UTC does not depend on the date, in minutes. */
const ZONE_OFFSETS = new Map(Object.entries({
  'Coordinated Universal Time': 0, UTC: 0, 'Greenwich Mean Time': 0, WET: 0, WEST: 0,
  EST: -300, EDT: -240, CST: -360, CDT: -300, MST: -420, MDT: -360, PST: -480, PDT: -420, AKST: -540, AKDT: -480,
  HST: -600, HDT: -600, AST: -240, ADT: -180, NST: -210, NDT: -150, SST: -660, ChST: 600,
  'Eastern Standard Time': -300, 'Eastern Daylight Time': -240, 'Central Standard Time': -360,
  'Central Daylight Time': -300, 'Mountain Standard Time': -420, 'Mountain Daylight Time': -360,
  'Pacific Standard Time': -480, 'Pacific Daylight Time': -420, 'Alaska Standard Time': -540,
  'Hawaii-Aleutian Standard Time': -600, 'Atlantic Standard Time': -240,
  CET: 60, CEST: 120, 'Central European Standard Time': 60, 'Central European Summer Time': 120, BST: 60,
  'British Summer Time': 60, WAT: 60, EET: 120, EEST: 180, IST: 120, SAST: 120,
  'Gulf Standard Time': 240, WIB: 420, HKT: 480, 'China Standard Time': 480,
  JST: 540, 'Japan Standard Time': 540, KST: 540,
  NZST: 720, NZDT: 780
}));

const SPACE_SEPARATORS = new Set([0x20, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008,
  0x2009, 0x200a, 0x202f, 0x205f, 0x3000]);

const MS_PER_DAY = 86400000n;

/** Days from 1970-01-01 to the first of a month of the proleptic Gregorian calendar (month 1 to 12). */
function daysFromCivil(y, m) {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const mp = (m + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5);
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function civilFromDays(z0) {
  const z = z0 + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { year: yoe + era * 400 + (m <= 2 ? 1 : 0), month: m, day: d };
}

/**
 * The calendar fields of an instant in UTC (proleptic Gregorian): year, month (1-12), day, dayOfWeek (0 is Sunday),
 * dayOfYear, hour, minute, second and millisecond.
 *
 * @param {bigint} time milliseconds since the epoch
 */
export function utcFields(time) {
  let days = time / MS_PER_DAY;
  let rest = time % MS_PER_DAY;
  if (rest < 0n) {
    rest += MS_PER_DAY;
    days -= 1n;
  }
  const d = Number(days);
  const { year, month, day } = civilFromDays(d);
  const ms = Number(rest);
  return {
    year,
    month,
    day,
    dayOfWeek: ((d % 7) + 11) % 7,
    dayOfYear: d - daysFromCivil(year, 1) + 1,
    hour: Math.floor(ms / 3600000),
    minute: Math.floor(ms / 60000) % 60,
    second: Math.floor(ms / 1000) % 60,
    millisecond: ms % 1000
  };
}

/** java.util.Date: milliseconds since the epoch (a bigint). */
export class JavaDate {
  constructor(time) {
    this.time = time;
  }

  getClass() {
    return Types.DATE;
  }

  /** Date.toString() in the UTC time zone. */
  toString() {
    const f = utcFields(this.time);
    const two = (n) => String(n).padStart(2, '0');
    return `${SHORT_DAYS[f.dayOfWeek]} ${SHORT_MONTHS[f.month - 1]} ${two(f.day)} ${two(f.hour)}:${two(f.minute)}:${two(f.second)} UTC ${f.year}`;
  }
}

/** The text parsed so far; position -1 marks a failure. */
class Cursor {
  constructor(text) {
    this.text = text;
    this.pos = 0;
  }
}

/** SimpleDateFormat.matchString over a map of names: the longest name that matches at start. */
function matchNames(text, start, names) {
  let best = -1;
  for (let i = 0; i < names.length; i++) {
    if ((best < 0 || names[i].length > names[best].length) && regionMatchesIgnoreCase(text, start, names[i], 0, names[i].length)) {
      best = i;
    }
  }
  return best;
}

/** The integer DecimalFormat.parse reads at pos (a sign, then digits), as Number.intValue(); null if none. */
function parseInteger(text, cursor) {
  let i = cursor.pos;
  let negative = false;
  if (text[i] === '-') {
    negative = true;
    i++;
  }
  let value = 0n;
  const begin = i;
  while (i < text.length) {
    const d = digit(text.charCodeAt(i), 10);
    if (d < 0) {
      break;
    }
    value = value * 10n + BigInt(d);
    i++;
  }
  if (i === begin) {
    return null;
  }
  cursor.pos = i;
  const signed = negative ? -value : value;
  if (signed >= -(2n ** 63n) && signed < 2n ** 63n) {
    return Number(BigInt.asIntN(32, signed));
  }
  return negative ? -2147483648 : 2147483647;
}

/** SimpleDateFormat.subParseNumericZone: minutes east of UTC, or null. */
function numericZone(text, cursor, sign, colon) {
  const isDigit = (c) => c >= '0' && c <= '9';
  let index = cursor.pos;
  let c = text[index++];
  if (c === undefined || !isDigit(c)) {
    return null;
  }
  let hours = c.charCodeAt(0) - 48;
  c = text[index++];
  if (c === undefined) {
    return null;
  }
  if (isDigit(c)) {
    hours = hours * 10 + (c.charCodeAt(0) - 48);
  } else {
    if (!colon) {
      return null;
    }
    --index;
  }
  if (hours > 23) {
    return null;
  }
  c = text[index++];
  if (colon) {
    if (c !== ':') {
      return null;
    }
    c = text[index++];
  }
  if (c === undefined || !isDigit(c)) {
    return null;
  }
  let minutes = c.charCodeAt(0) - 48;
  c = text[index++];
  if (c === undefined || !isDigit(c)) {
    return null;
  }
  minutes = minutes * 10 + (c.charCodeAt(0) - 48);
  if (minutes > 59) {
    return null;
  }
  cursor.pos = index;
  return sign * (minutes + hours * 60);
}

/** The time zone field: its offset in minutes, or null. */
function parseZone(text, start, cursor) {
  const c = text[cursor.pos];
  if (c === '+' || c === '-') {
    cursor.pos++;
    return numericZone(text, cursor, c === '+' ? 1 : -1, false);
  }
  if ((c === 'G' || c === 'g') && text.length - start >= 3 && regionMatchesIgnoreCase(text, start, 'GMT', 0, 3)) {
    cursor.pos = start + 3;
    const s = text[cursor.pos];
    if (s !== '+' && s !== '-') {
      return 0;
    }
    cursor.pos++;
    return numericZone(text, cursor, s === '+' ? 1 : -1, true);
  }
  let best = null;
  for (const name of ZONE_OFFSETS.keys()) {
    if (regionMatchesIgnoreCase(text, cursor.pos, name, 0, name.length) && (best === null || name.length > best.length)) {
      best = name;
    }
  }
  if (best === null) {
    return null;
  }
  cursor.pos += best.length;
  return ZONE_OFFSETS.get(best);
}

/**
 * new SimpleDateFormat("EEE MMM dd HH:mm:ss zzz yyyy").parse(text).
 *
 * @param {string} text the date text
 * @returns {JavaDate} the date
 * @throws {TextParseException} when the text does not match the pattern
 */
export function parseDate(text) {
  const fail = () => new TextParseException(`Unparseable date: "${text}"`, 0);
  const cursor = new Cursor(text);
  const fields = {};
  const literal = (ch) => {
    const c = text.charCodeAt(cursor.pos);
    if (cursor.pos >= text.length || !(c === ch.charCodeAt(0) || (SPACE_SEPARATORS.has(c) && SPACE_SEPARATORS.has(ch.charCodeAt(0))))) {
      throw fail();
    }
    cursor.pos++;
  };
  const field = (parse) => {
    const start = cursor.pos;
    while (cursor.pos < text.length && (text[cursor.pos] === ' ' || text[cursor.pos] === '\t')) {
      cursor.pos++;
    }
    if (cursor.pos >= text.length) {
      throw fail();
    }
    const value = parse(start);
    if (value === null) {
      throw fail();
    }
    return value;
  };
  const names = (lists) => (start) => {
    for (const list of lists) {
      const i = matchNames(text, start, list);
      if (i >= 0) {
        cursor.pos = start + list[i].length;
        return i;
      }
    }
    return null;
  };
  const number = () => parseInteger(text, cursor);
  field(names([LONG_DAYS, SHORT_DAYS]));
  literal(' ');
  fields.month = field(names([[...LONG_MONTHS, ...SHORT_MONTHS]])) % 12;
  literal(' ');
  fields.day = field(number);
  literal(' ');
  fields.hour = field(number);
  literal(':');
  fields.minute = field(number);
  literal(':');
  fields.second = field(number);
  literal(' ');
  fields.zone = field((start) => parseZone(text, start, cursor));
  literal(' ');
  fields.year = field(number);
  const time = (BigInt(daysFromCivil(fields.year, fields.month + 1)) + BigInt(fields.day) - 1n) * MS_PER_DAY
    + ((BigInt(fields.hour) * 60n + BigInt(fields.minute)) * 60n + BigInt(fields.second)) * 1000n
    - BigInt(fields.zone) * 60000n;
  return new JavaDate(time);
}
