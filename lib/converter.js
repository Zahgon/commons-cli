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
 * Converters turn an option's string value into a value of its type: a converter is a function of one string that
 * returns a Java value or throws.
 *
 * @module converter
 */

import { parseDate } from './java/date.js';
import { JavaException } from './java/errors.js';
import { JavaFile, UnixPath } from './java/io.js';
import { JavaDouble, JavaLong, parseDouble, parseLong } from './java/primitives.js';
import { Types } from './java/types.js';
import { JavaURL } from './java/url.js';

/** java.lang.ClassNotFoundException. */
export class ClassNotFoundException extends JavaException {
  static javaName = 'java.lang.ClassNotFoundException';
}

/** java.lang.NoSuchMethodException. */
export class NoSuchMethodException extends JavaException {
  static javaName = 'java.lang.NoSuchMethodException';
}

const CLASSES = new Map(Object.values(Types).map((type) => [type.getName(), type]));

/** The standard converters. */
export const Converter = Object.freeze({
  /** Returns the string itself. */
  DEFAULT: (s) => s,
  /** Class.forName: the classes this library knows by name. */
  CLASS: (s) => {
    const type = CLASSES.get(s);
    if (type === undefined) {
      throw new ClassNotFoundException(s);
    }
    return type;
  },
  /** new File(s). */
  FILE: (s) => new JavaFile(s),
  /** Paths.get(s). */
  PATH: (s) => new UnixPath(s),
  /** A Double when the string has a '.', else a Long. */
  NUMBER: (s) => (s.indexOf('.') !== -1 ? new JavaDouble(parseDouble(s)) : new JavaLong(parseLong(s))),
  /** An instance of the class the string names, made by its public no-argument constructor. */
  OBJECT: (s) => {
    const type = Converter.CLASS(s);
    if (type === Types.STRING) {
      return '';
    }
    throw new NoSuchMethodException(`${type.getName()}.<init>()`);
  },
  /** new URL(s). */
  URL: (s) => new JavaURL(s),
  /** new SimpleDateFormat("EEE MMM dd HH:mm:ss zzz yyyy").parse(s). */
  DATE: (s) => parseDate(s)
});
