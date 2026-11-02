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
 * The command's JSON output: ASCII only, every code unit outside U+0020..U+007E escaped (lone surrogates too).
 *
 * @module cli/json
 */

const SHORT_ESCAPES = { '"': '\\"', '\\': '\\\\', '\b': '\\b', '\t': '\\t', '\n': '\\n', '\f': '\\f', '\r': '\\r' };

/** A JSON string literal. */
export function quote(s) {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const code = s.charCodeAt(i);
    if (SHORT_ESCAPES[c] !== undefined) {
      out += SHORT_ESCAPES[c];
    } else if (code < 0x20 || code >= 0x7f) {
      out += `\\u${code.toString(16).padStart(4, '0')}`;
    } else {
      out += c;
    }
  }
  return `${out}"`;
}

/** JSON text of null, booleans, integers, strings, arrays and plain objects (in insertion order). */
export function toJson(value) {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'string') {
    return quote(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(toJson).join(',')}]`;
  }
  return `{${Object.entries(value).map(([k, v]) => `${quote(k)}:${toJson(v)}`).join(',')}}`;
}
