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
 * new java.net.URL(spec) as Java 25 parses it: the protocol and its built-in handler (file, ftp, http, https, jar,
 * jmod, jrt, mailto), URLStreamHandler.parseURL, the jar and mailto handlers, the host, user-info and authority checks
 * of sun.net.util.IPAddressUtil, and toExternalForm(). Nothing is resolved or connected.
 *
 * @module java/url
 */

import { digit, isLetter, isLetterOrDigit, isWhitespace, toLowerCaseChar } from './character.js';
import { IllegalArgumentException, JavaThrowable, MalformedURLException, NullPointerException,
  NumberFormatException } from './errors.js';
import { regionMatchesIgnoreCase } from './string.js';
import { Types } from './types.js';

const HANDLERS = new Set(['file', 'ftp', 'http', 'https', 'jar', 'jmod', 'jrt', 'mailto']);

const bit = (...chars) => chars.reduce((m, c) => m | (1n << BigInt(c.charCodeAt(0) & 63)), 0n);
const L_NON_PRINTABLE = 0xffffffffn;
const H_NON_PRINTABLE = 0x8000000000000000n;
const L_EXCLUDE = 0x84008008ffffffffn;
const H_EXCLUDE = 0x8000000038000001n;
const L_SLASH = bit('/');
const H_UNWISE = 0x3800000178000000n;
const L_EXCLUDED_DELIMS = 0x5000000500000000n;
const L_COLON = bit(':');
const H_AUTH_DELIMS = 0x28000001n;
const H_IPV6_DELIMS = 0x28000000n;
const H_BACKSLASH = 0x10000000n;
const L_FRAGMENT = bit('#');
const L_QUERY = bit('?');
const L_HOSTNAME_MASK = L_NON_PRINTABLE | L_SLASH | L_EXCLUDED_DELIMS;
const H_HOSTNAME_MASK = H_NON_PRINTABLE | H_UNWISE;
const L_SCOPE_MASK = L_NON_PRINTABLE | L_SLASH | L_FRAGMENT | L_QUERY;
const H_SCOPE_MASK = H_NON_PRINTABLE | H_IPV6_DELIMS | H_BACKSLASH;
const OTHERS = [8263, 8264, 8265, 8448, 8449, 8453, 8454, 10868, 65109, 65110, 65119, 65131, 65283, 65295, 65306, 65311,
  65312];

/** IPAddressUtil.parseAsciiDigit, or Character.digit when unicode is true. */
function charDigitParse(c, radix, unicode = false) {
  const code = c.charCodeAt(0);
  if (unicode) {
    return digit(code, radix);
  }
  const lower = code | 0x20;
  if (code >= 0x30 && code <= 0x39) {
    return code - 0x30 < radix ? code - 0x30 : -1;
  }
  return radix === 16 && lower >= 0x61 && lower <= 0x66 ? lower - 0x61 + 10 : -1;
}

function match(c, low, high) {
  if (c < 64) {
    return ((1n << BigInt(c)) & low) !== 0n;
  }
  if (c < 128) {
    return ((1n << BigInt(c - 64)) & high) !== 0n;
  }
  return false;
}

function scan(s, low, high, others = []) {
  if (s == null) {
    return -1;
  }
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (match(c, low, high) || others.includes(c)) {
      return i;
    }
  }
  return -1;
}

function describeChar(c) {
  const code = c.charCodeAt(0);
  if (code < 32 || code === 127) {
    if (c === '\n') {
      return 'LF';
    }
    if (c === '\r') {
      return 'CR';
    }
    return `control char (code=${code})`;
  }
  return `'${c}'`;
}

/** IPAddressUtil.textToNumericFormatV4 (as a validity test). */
function isIPv4Literal(src) {
  const len = src.length;
  if (len === 0 || len > 15) {
    return false;
  }
  let value = 0;
  let currByte = 0;
  let newOctet = true;
  for (const c of src) {
    if (c === '.') {
      if (newOctet || value > 0xff || currByte === 3) {
        return false;
      }
      currByte++;
      value = 0;
      newOctet = true;
    } else {
      const d = charDigitParse(c, 10);
      if (d < 0) {
        return false;
      }
      value = value * 10 + d;
      newOctet = false;
    }
  }
  return !(newOctet || value >= 2 ** ((4 - currByte) * 8));
}

/** IPAddressUtil.textToNumericFormatV6 (as a validity test). */
function isIPv6Literal(src) {
  if (src.length < 2) {
    return false;
  }
  let srcLength = src.length;
  const pc = src.indexOf('%');
  if (pc === srcLength - 1) {
    return false;
  }
  if (pc !== -1) {
    srcLength = pc;
  }
  let colonp = -1;
  let i = 0;
  let j = 0;
  if (src[i] === ':' && src[++i] !== ':') {
    return false;
  }
  let curtok = i;
  let sawXdigit = false;
  let val = 0;
  while (i < srcLength) {
    const ch = src[i++];
    const chval = charDigitParse(ch, 16);
    if (chval !== -1) {
      val = (val << 4) | chval;
      if (val > 0xffff) {
        return false;
      }
      sawXdigit = true;
      continue;
    }
    if (ch === ':') {
      curtok = i;
      if (!sawXdigit) {
        if (colonp !== -1) {
          return false;
        }
        colonp = j;
        continue;
      } else if (i === srcLength) {
        return false;
      }
      if (j + 2 > 16) {
        return false;
      }
      j += 2;
      sawXdigit = false;
      val = 0;
      continue;
    }
    if (ch === '.' && j + 4 <= 16) {
      const ia4 = src.slice(curtok, srcLength);
      if (ia4.split('.').length - 1 !== 3 || !isIPv4Literal(ia4)) {
        return false;
      }
      j += 4;
      sawXdigit = false;
      break;
    }
    return false;
  }
  if (sawXdigit) {
    if (j + 2 > 16) {
      return false;
    }
    j += 2;
  }
  if (colonp !== -1) {
    if (j === 16) {
      return false;
    }
    j = 16;
  }
  return j === 16;
}

/** IPAddressUtil.checkHost, with early URL parsing (the default). */
function checkHost(host) {
  if (host.startsWith('[') && host.endsWith(']')) {
    let str = host.slice(1, -1);
    if (isIPv6Literal(str)) {
      const index = str.indexOf('%');
      if (index >= 0) {
        str = str.slice(index);
        const bad = scan(str, L_SCOPE_MASK, H_SCOPE_MASK);
        if (bad >= 0) {
          return `Illegal character found in IPv6 scoped address: ${describeChar(str[bad])}`;
        }
      }
      return null;
    }
    return 'Unrecognized IPv6 address format';
  }
  const bad = scan(host, L_EXCLUDE | L_HOSTNAME_MASK, H_EXCLUDE | H_HOSTNAME_MASK, OTHERS);
  return bad >= 0 ? `Illegal character found in host: ${describeChar(host[bad])}` : null;
}

/** Integer.parseInt(s, begin, end, 10) with its "Error at index" messages. */
function parsePort(s, begin) {
  const end = s.length;
  if (begin === end) {
    throw new NumberFormatException('For input string: ""');
  }
  let digit = ~0xff;
  let i = begin;
  const first = s[i++];
  if (first !== '-' && first !== '+') {
    digit = charDigitParse(first, 10, true);
  }
  if (digit >= 0 || (digit === ~0xff && end - begin > 1)) {
    const limit = first !== '-' ? -2147483647 : -2147483648;
    const multmin = Math.trunc(limit / 10);
    let result = -(digit & 0xff);
    let inRange = true;
    while (i < end && (digit = charDigitParse(s[i++], 10, true)) >= 0
        && (inRange = result > multmin || (result === multmin && digit <= 10 * multmin - limit))) {
      result = 10 * result - digit;
    }
    if (inRange && i === end && digit >= 0) {
      return first !== '-' ? -result : result;
    }
  }
  const errorIndex = i - (digit < -1 ? 0 : 1);
  throw new NumberFormatException(`Error at index ${errorIndex - begin} in: "${s.slice(begin, end)}"`);
}

/** java.net.URL. */
export class JavaURL {
  /** new URL(spec). */
  constructor(spec) {
    if (spec == null) {
      throw new MalformedURLException(null);
    }
    try {
      this.parse(spec);
    } catch (e) {
      if (e instanceof MalformedURLException) {
        throw e;
      }
      throw new MalformedURLException(e instanceof JavaThrowable ? e.getMessage() : null, e);
    }
  }

  parse(spec) {
    const original = spec;
    let limit = spec.length;
    let start = 0;
    while (limit > 0 && spec.charCodeAt(limit - 1) <= 0x20) {
      limit--;
    }
    while (start < limit && spec.charCodeAt(start) <= 0x20) {
      start++;
    }
    if (regionMatchesIgnoreCase(spec, start, 'url:', 0, 4)) {
      start += 4;
    }
    const aRef = start < spec.length && spec[start] === '#';
    let protocol = null;
    for (let i = start; !aRef && i < limit && spec[i] !== '/'; i++) {
      if (spec[i] === ':') {
        const s = lowerCaseProtocol(spec.slice(start, i));
        if (isValidProtocol(s)) {
          protocol = s;
          start = i + 1;
        }
        break;
      }
    }
    if (protocol === null) {
      throw new MalformedURLException(`no protocol: ${original}`);
    }
    if (!HANDLERS.has(protocol)) {
      throw new MalformedURLException(`unknown protocol: ${protocol}`);
    }
    this.protocol = protocol;
    this.host = null;
    this.port = -1;
    this.authority = null;
    this.userInfo = null;
    this.path = null;
    this.query = null;
    this.ref = null;
    const hash = spec.indexOf('#', start);
    if (hash >= 0) {
      this.ref = spec.slice(hash + 1, limit);
      limit = hash;
    }
    if (protocol === 'jar') {
      this.parseJar(spec, start, limit);
    } else if (protocol === 'mailto') {
      const file = start < limit ? spec.slice(start, limit) : '';
      if ([...file].every((c) => isWhitespace(c.charCodeAt(0)))) {
        throw new IllegalArgumentException('No email address');
      }
      this.setFile('', -1, file, null);
    } else {
      this.parseGeneric(spec, start, limit);
    }
  }

  /** URLStreamHandler.parseURL for a URL without context. */
  parseGeneric(spec0, start0, limit0) {
    let spec = spec0;
    let start = start0;
    let limit = limit0;
    let { host, port, path, query } = this;
    let authority = null;
    let userInfo = null;
    let queryOnly = false;
    if (start < limit) {
      const queryStart = spec.indexOf('?');
      queryOnly = queryStart === start;
      if (queryStart !== -1 && queryStart < limit) {
        query = spec.slice(queryStart + 1, limit);
        limit = queryStart;
        spec = spec.slice(0, queryStart);
      }
    }
    const isUNCName = start <= limit - 4 && spec.startsWith('////', start);
    if (!isUNCName && start <= limit - 2 && spec.startsWith('//', start)) {
      start += 2;
      let i = spec.indexOf('/', start);
      if (i < 0 || i > limit) {
        i = spec.indexOf('?', start);
        if (i < 0 || i > limit) {
          i = limit;
        }
      }
      host = authority = spec.slice(start, i);
      let ind = authority.indexOf('@');
      if (ind !== -1) {
        if (ind !== authority.lastIndexOf('@')) {
          userInfo = null;
          host = null;
        } else {
          userInfo = authority.slice(0, ind);
          host = authority.slice(ind + 1);
        }
      } else {
        userInfo = null;
      }
      if (host !== null) {
        if (host.length > 0 && host[0] === '[') {
          if ((ind = host.indexOf(']')) > 2) {
            const nhost = host;
            host = nhost.slice(0, ind + 1);
            if (!isIPv6Literal(host.slice(1, ind))) {
              throw new IllegalArgumentException(`Invalid host: ${host}`);
            }
            port = -1;
            if (nhost.length > ind + 1) {
              if (nhost[ind + 1] === ':') {
                ++ind;
                if (nhost.length > ind + 1) {
                  port = parsePort(nhost, ind + 1);
                }
              } else {
                throw new IllegalArgumentException(`Invalid authority field: ${authority}`);
              }
            }
          } else {
            throw new IllegalArgumentException(`Invalid authority field: ${authority}`);
          }
        } else {
          ind = host.indexOf(':');
          port = -1;
          if (ind >= 0) {
            if (host.length > ind + 1) {
              port = parsePort(host, ind + 1);
            }
            host = host.slice(0, ind);
          }
        }
      } else {
        host = '';
      }
      if (port < -1) {
        throw new IllegalArgumentException(`Invalid port number :${port}`);
      }
      start = i;
      if (authority.length > 0) {
        path = '';
      }
    }
    if (host === null) {
      host = '';
    }
    if (start < limit) {
      const specStr = spec.slice(start, limit);
      if (spec[start] === '/') {
        path = specStr;
      } else if (path !== null && path.length > 0) {
        const ind = path.lastIndexOf('/');
        path = ind === -1 && authority !== null ? `/${specStr}` : path.slice(0, ind + 1) + specStr;
      } else {
        path = authority !== null ? `/${specStr}` : specStr;
      }
    } else if (queryOnly && path !== null) {
      const ind = path.lastIndexOf('/');
      path = ind < 0 ? '/' : path.slice(0, ind + 1);
    }
    this.set(host, port, authority, userInfo, path ?? '', query);
  }

  /** The jar handler's parseURL for an absolute "jar:" spec. */
  parseJar(spec0, start, limit) {
    const absoluteSpec = spec0.length >= 4 && regionMatchesIgnoreCase(spec0, 0, 'jar:', 0, 4);
    const spec = spec0.slice(start, limit);
    if (regionMatchesIgnoreCase(spec, 0, 'jar:', 0, 4)) {
      throw new NullPointerException('Nested JAR URLs are not supported');
    }
    if (!absoluteSpec) {
      throw new NullPointerException(null);
    }
    const bang = indexOfBangSlash(spec);
    if (bang === -1) {
      throw new NullPointerException('no !/ in spec');
    }
    try {
      new JavaURL(spec.slice(0, bang - 1));
    } catch (e) {
      if (e instanceof MalformedURLException) {
        throw new NullPointerException('invalid url:');
      }
      throw e;
    }
    this.setFile('', -1, spec, this.ref);
  }

  /** URLStreamHandler.setURL(u, protocol, host, port, file, ref). */
  setFile(host, port, file, ref) {
    let path = null;
    let query = null;
    if (file != null) {
      const q = file.lastIndexOf('?');
      if (q !== -1) {
        query = file.slice(q + 1);
        path = file.slice(0, q);
      } else {
        path = file;
      }
    }
    this.ref = ref;
    this.set(host, port, null, null, path, query);
  }

  /** URLStreamHandler.setURL with the built-in handlers' checks. */
  set(host, port, authority, userInfo, path, query) {
    if (host != null) {
      const error = checkHost(host);
      if (error != null) {
        throw new IllegalArgumentException(error);
      }
    }
    let bad = scan(userInfo, L_EXCLUDE & ~L_COLON, H_EXCLUDE);
    if (bad >= 0) {
      throw new IllegalArgumentException(`Illegal character found in user-info: ${describeChar(userInfo[bad])}`);
    }
    bad = scan(authority, L_EXCLUDE & ~L_COLON, H_EXCLUDE & ~H_AUTH_DELIMS);
    if (bad >= 0) {
      throw new IllegalArgumentException(`Illegal character found in authority: ${describeChar(authority[bad])}`);
    }
    Object.assign(this, { host, port, authority, userInfo, path, query });
  }

  getClass() {
    return Types.URL;
  }

  /** URL.toExternalForm(). */
  toString() {
    return `${this.protocol}:${this.authority ? `//${this.authority}` : ''}${this.path ?? ''}`
      + `${this.query != null ? `?${this.query}` : ''}${this.ref != null ? `#${this.ref}` : ''}`;
  }
}

function indexOfBangSlash(spec) {
  let indexOfBang = spec.length;
  while ((indexOfBang = spec.lastIndexOf('!', indexOfBang)) !== -1) {
    if (indexOfBang !== spec.length - 1 && spec[indexOfBang + 1] === '/') {
      return indexOfBang + 1;
    }
    indexOfBang--;
  }
  return -1;
}

/** URL.lowerCaseProtocol: String.toLowerCase(Locale.ROOT). */
function lowerCaseProtocol(protocol) {
  let out = '';
  for (let i = 0; i < protocol.length; i++) {
    const c = protocol.charCodeAt(i);
    out += c === 0x130 ? 'i̇' : String.fromCharCode(toLowerCaseChar(c));
  }
  return out;
}

function isValidProtocol(protocol) {
  if (protocol.length < 1 || !isLetter(protocol.charCodeAt(0))) {
    return false;
  }
  for (let i = 1; i < protocol.length; i++) {
    const c = protocol.charCodeAt(i);
    if (!isLetterOrDigit(c) && c !== 0x2e && c !== 0x2b && c !== 0x2d) {
      return false;
    }
  }
  return true;
}
