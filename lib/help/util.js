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
 * String helpers of the help package.
 *
 * @module help/util
 */

import { isWhitespace as javaIsWhitespace, PARAGRAPH_SEPARATOR } from '../java/character.js';
import { NegativeArraySizeException } from '../java/errors.js';

/** The string, or the default when the string is null or empty. */
export function defaultValue(str, defaultStr) {
  return isEmpty(str) ? defaultStr : str;
}

/** The index of the first character at or after startPos that is not white space, or -1. */
export function indexOfNonWhitespace(text, startPos) {
  if (isEmpty(text)) {
    return -1;
  }
  let idx = startPos;
  while (idx < text.length && isWhitespace(text.charCodeAt(idx))) {
    idx++;
  }
  return idx < text.length ? idx : -1;
}

export function isEmpty(str) {
  return str == null || str.length === 0;
}

/** Character.isWhitespace(c), plus the code unit Character.PARAGRAPH_SEPARATOR (a category number) casts to. */
export function isWhitespace(c) {
  return javaIsWhitespace(c) || c === PARAGRAPH_SEPARATOR;
}

export function ltrim(s) {
  const pos = indexOfNonWhitespace(s, 0);
  return pos === -1 ? '' : s.slice(pos);
}

/** A string of len copies of a character. */
export function repeat(len, fillChar) {
  if (len < 0) {
    throw new NegativeArraySizeException(String(len));
  }
  return fillChar.repeat(len);
}

export function repeatSpace(len) {
  return repeat(len, ' ');
}

export function rtrim(s) {
  if (isEmpty(s)) {
    return s;
  }
  let pos = s.length;
  while (pos > 0 && isWhitespace(s.charCodeAt(pos - 1))) {
    --pos;
  }
  return s.slice(0, pos);
}
