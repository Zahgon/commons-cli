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
 * Internal string helpers of the parsers.
 *
 * @module util
 */

/** The short and long option prefixes. */
export const DEFAULT_OPT_PREFIX = '-';
export const DEFAULT_LONG_OPT_PREFIX = '--';

/** Whether a string (or array) is null or empty. */
export function isEmpty(value) {
  return value == null || value.length === 0;
}

/** Removes one pair of enclosing double quotes when the string holds no other double quote. */
export function stripLeadingAndTrailingQuotes(str) {
  if (isEmpty(str)) {
    return str;
  }
  const length = str.length;
  if (length > 1 && str.startsWith('"') && str.endsWith('"') && str.slice(1, length - 1).indexOf('"') === -1) {
    return str.slice(1, length - 1);
  }
  return str;
}

/** Removes the hyphens from the start of a string: "--" or else "-". */
export function stripLeadingHyphens(str) {
  if (isEmpty(str)) {
    return str;
  }
  if (str.startsWith(DEFAULT_LONG_OPT_PREFIX)) {
    return str.slice(2);
  }
  if (str.startsWith(DEFAULT_OPT_PREFIX)) {
    return str.slice(1);
  }
  return str;
}
