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
 * Maps classes to the converters that create their values from strings.
 *
 * @module type-handler
 */

import { JavaBigDecimal, JavaBigInteger } from './java/big-numbers.js';
import { codePointString, isValidCodePoint } from './java/character.js';
import {
  IllegalArgumentException,
  StringIndexOutOfBoundsException,
  UnsupportedOperationException,
  requireNonNull
} from './java/errors.js';
import {
  JavaByte,
  JavaCharacter,
  JavaDouble,
  JavaFloat,
  JavaInteger,
  JavaLong,
  JavaShort,
  parseByte,
  parseDouble,
  parseFloat,
  parseInt,
  parseLong,
  parseShort
} from './java/primitives.js';
import { JavaFileInputStream } from './java/io.js';
import { Types } from './java/types.js';
import { Converter } from './converter.js';
import { ParseException } from './exceptions.js';

/** Character.toChars(cp)[0]: the code point's first UTF-16 code unit. */
function firstCharOf(cp) {
  if (!isValidCodePoint(cp)) {
    throw new IllegalArgumentException(`Not a valid Unicode code point: 0x${(cp >>> 0).toString(16).toUpperCase()}`);
  }
  return codePointString(cp).charCodeAt(0);
}

function toCharacter(s) {
  if (s.startsWith('\\u')) {
    return new JavaCharacter(firstCharOf(parseInt(s.slice(2), 16)));
  }
  if (s.length === 0) {
    throw new StringIndexOutOfBoundsException('Index 0 out of bounds for length 0');
  }
  return new JavaCharacter(s.charCodeAt(0));
}

/** Fills a map with the default converters. */
function putDefaultMap(map) {
  map.set(Types.OBJECT, Converter.OBJECT);
  map.set(Types.CLASS, Converter.CLASS);
  map.set(Types.DATE, Converter.DATE);
  map.set(Types.FILE, Converter.FILE);
  map.set(Types.PATH, Converter.PATH);
  map.set(Types.NUMBER, Converter.NUMBER);
  map.set(Types.URL, Converter.URL);
  map.set(Types.FILE_INPUT_STREAM, (s) => new JavaFileInputStream(s));
  map.set(Types.LONG, (s) => new JavaLong(parseLong(s)));
  map.set(Types.INTEGER, (s) => new JavaInteger(parseInt(s)));
  map.set(Types.SHORT, (s) => new JavaShort(parseShort(s)));
  map.set(Types.BYTE, (s) => new JavaByte(parseByte(s)));
  map.set(Types.CHARACTER, toCharacter);
  map.set(Types.DOUBLE, (s) => new JavaDouble(parseDouble(s)));
  map.set(Types.FLOAT, (s) => new JavaFloat(parseFloat(s)));
  map.set(Types.BIG_INTEGER, (s) => JavaBigInteger.parse(s));
  map.set(Types.BIG_DECIMAL, (s) => JavaBigDecimal.parse(s));
  return map;
}

/** Converts strings to the values of classes. */
export class TypeHandler {
  /** @param {Map} [converterMap] classes to converters (the default converters when absent) */
  constructor(converterMap = TypeHandler.createDefaultMap()) {
    this.converterMap = requireNonNull(converterMap, 'converterMap');
  }

  /** A new map of the default converters. */
  static createDefaultMap() {
    return putDefaultMap(new Map());
  }

  /** The shared default TypeHandler. */
  static getDefault() {
    return DEFAULT;
  }

  /** The converter for a class, Converter.DEFAULT when it has none. */
  getConverter(clazz) {
    return this.converterMap.get(clazz) ?? Converter.DEFAULT;
  }

  /** Converts a string with the default converter of a class; failures become ParseExceptions. */
  static createValue(string, clazz) {
    try {
      return DEFAULT.getConverter(clazz)(string);
    } catch (e) {
      throw ParseException.wrap(e);
    }
  }

  /** createValue for callers without a ParseException: the failure is thrown as an IllegalArgumentException. */
  static createValueUnchecked(string, clazz) {
    try {
      return TypeHandler.createValue(string, clazz);
    } catch (e) {
      if (e instanceof ParseException) {
        throw IllegalArgumentException.wrapping(e);
      }
      throw e;
    }
  }

  static createClass(className) {
    return TypeHandler.createValue(className, Types.CLASS);
  }

  static createDate(string) {
    return TypeHandler.createValueUnchecked(string, Types.DATE);
  }

  static createFile(string) {
    return TypeHandler.createValueUnchecked(string, Types.FILE);
  }

  static createFiles() {
    throw new UnsupportedOperationException('Not yet implemented');
  }

  static createNumber(string) {
    return TypeHandler.createValue(string, Types.NUMBER);
  }

  static createObject(className) {
    return TypeHandler.createValue(className, Types.OBJECT);
  }

  static createURL(string) {
    return TypeHandler.createValue(string, Types.URL);
  }

  static openFile(string) {
    return TypeHandler.createValue(string, Types.FILE_INPUT_STREAM);
  }
}

const DEFAULT = new TypeHandler();
