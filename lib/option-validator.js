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
 * Validates option names: every UTF-16 code unit must be a Java identifier part; the first may also be '?' or '@',
 * the others '-'.
 *
 * @module option-validator
 */

import { isJavaIdentifierPart } from './java/character.js';
import { IllegalArgumentException } from './java/errors.js';

const ADDITIONAL_OPTION_CHARS = ['?', '@'];
const ADDITIONAL_LONG_CHARS = ['-'];

function isValidOpt(c) {
  return isJavaIdentifierPart(c.charCodeAt(0)) || ADDITIONAL_OPTION_CHARS.includes(c);
}

function isValidChar(c) {
  return isJavaIdentifierPart(c.charCodeAt(0)) || ADDITIONAL_LONG_CHARS.includes(c);
}

/**
 * Returns the option name when it is valid (or null).
 *
 * @param {string|null} option the option name
 * @returns {string|null} the option name
 * @throws {IllegalArgumentException} when the name is empty or holds an illegal character
 */
export function validate(option) {
  if (option == null) {
    return null;
  }
  if (option.length === 0) {
    throw new IllegalArgumentException('Empty option name.');
  }
  const ch0 = option[0];
  if (!isValidOpt(ch0)) {
    throw new IllegalArgumentException(`Illegal option name '${ch0}'.`);
  }
  for (let i = 1; i < option.length; i++) {
    const ch = option[i];
    if (!isValidChar(ch)) {
      throw new IllegalArgumentException(`The option '${option}' contains an illegal character : '${ch}'.`);
    }
  }
  return option;
}
