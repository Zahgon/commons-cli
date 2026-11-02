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
 * Builds Options from a pattern string: each option character may be followed by '!' (required) and by one type code.
 *
 * <pre>
 * a  no argument    :  String        %  Number        +  Class        #  Date
 * @  Object         <  existing file  >  File          *  File[]       /  URL
 * </pre>
 *
 * @module pattern-option-builder
 */

import { UnsupportedOperationException } from './java/errors.js';
import { Types } from './java/types.js';
import { Converter } from './converter.js';
import { Option } from './option.js';
import { Options } from './options.js';
import { TypeHandler } from './type-handler.js';

/** The type codes and their classes. */
export const PatternOptionBuilder = {
  STRING_VALUE: Types.STRING,
  OBJECT_VALUE: Types.OBJECT,
  NUMBER_VALUE: Types.NUMBER,
  DATE_VALUE: Types.DATE,
  CLASS_VALUE: Types.CLASS,
  EXISTING_FILE_VALUE: Types.FILE_INPUT_STREAM,
  FILE_VALUE: Types.FILE,
  FILES_VALUE: Types.FILE_ARRAY,
  URL_VALUE: Types.URL,

  /** Deprecated: getValueType. */
  getValueClass(ch) {
    return PatternOptionBuilder.getValueType(ch);
  },

  /** The class of a type code, or null. */
  getValueType(ch) {
    switch (ch) {
      case '@':
        return Types.OBJECT;
      case ':':
        return Types.STRING;
      case '%':
        return Types.NUMBER;
      case '+':
        return Types.CLASS;
      case '#':
        return Types.DATE;
      case '<':
        return Types.FILE_INPUT_STREAM;
      case '>':
        return Types.FILE;
      case '*':
        return Types.FILE_ARRAY;
      case '/':
        return Types.URL;
      default:
        return null;
    }
  },

  /** Whether a character is a type code or '!'. */
  isValueCode(ch) {
    return '@:%+#<>*/!'.includes(ch) && ch.length === 1;
  },

  /** The Options a pattern describes. */
  parsePattern(pattern) {
    let opt = ' ';
    let required = false;
    let type = null;
    let converter = Converter.DEFAULT;
    const options = new Options();
    for (const ch of pattern.split('')) {
      if (!PatternOptionBuilder.isValueCode(ch)) {
        if (opt !== ' ') {
          const option = Option.builder(opt).hasArg(type != null).required(required).type(type).converter(converter).get();
          options.addOption(option);
          required = false;
          type = null;
          converter = Converter.DEFAULT;
        }
        opt = ch;
      } else if (ch === '!') {
        required = true;
      } else {
        type = PatternOptionBuilder.getValueType(ch);
        const map = TypeHandler.createDefaultMap();
        map.set(Types.FILE_ARRAY, () => {
          throw new UnsupportedOperationException('Not yet implemented');
        });
        converter = new TypeHandler(map).getConverter(type);
      }
    }
    if (opt !== ' ') {
      options.addOption(Option.builder(opt).hasArg(type != null).required(required).type(type).get());
    }
    return options;
  }
};
