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
 * Java classes as values: an option's type is one of these, and converted values report theirs. JavaScript strings
 * stand for java.lang.String and JavaScript booleans for java.lang.Boolean; every other value is an object with a
 * getClass() method.
 *
 * @module java/types
 */

import { ClassCastException } from './errors.js';

const COMPARABLE = 'java.lang.Comparable';
const SERIALIZABLE = 'java.io.Serializable';
const CONSTABLE = ['java.lang.constant.Constable', 'java.lang.constant.ConstantDesc'];

/** A java.lang.Class: its binary name, whether it is an interface, and the names of the types it is assignable to. */
export class JavaClass {
  /**
   * @param {string} name the binary name
   * @param {object} [options] {interface: boolean, supertypes: string[]}
   */
  constructor(name, { isInterface = false, supertypes = [] } = {}) {
    this.name = name;
    this.isInterface = isInterface;
    this.supertypes = new Set([name, 'java.lang.Object', ...supertypes]);
  }

  /** Class.getName(). */
  getName() {
    return this.name;
  }

  /** A class is itself a java.lang.Class. */
  getClass() {
    return Types.CLASS;
  }

  /** Class.toString(): "class NAME" or "interface NAME". */
  toString() {
    return `${this.isInterface ? 'interface' : 'class'} ${this.name}`;
  }

  /** Class.isInstance(value). */
  isInstance(value) {
    return value != null && classOf(value).supertypes.has(this.name);
  }

  /** Class.cast(value). */
  cast(value) {
    if (value != null && !this.isInstance(value)) {
      throw new ClassCastException(`Cannot cast ${classOf(value).getName()} to ${this.name}`);
    }
    return value;
  }

  /** The class of arrays of this class (Array.newInstance(this, n).getClass()). */
  arrayClass() {
    const component = this.name.startsWith('[') ? this.name : `L${this.name};`;
    return new JavaClass(`[${component}`, { supertypes: ['java.lang.Cloneable', SERIALIZABLE] });
  }
}

const number = (name) => new JavaClass(name, { supertypes: ['java.lang.Number', COMPARABLE, SERIALIZABLE, ...CONSTABLE] });

/** The classes options and conversions refer to. */
export const Types = {
  OBJECT: new JavaClass('java.lang.Object'),
  STRING: new JavaClass('java.lang.String', { supertypes: [SERIALIZABLE, COMPARABLE, 'java.lang.CharSequence', ...CONSTABLE] }),
  CHAR_SEQUENCE: new JavaClass('java.lang.CharSequence', { isInterface: true }),
  STRING_BUILDER: new JavaClass('java.lang.StringBuilder', { supertypes: ['java.lang.CharSequence', SERIALIZABLE] }),
  NUMBER: new JavaClass('java.lang.Number', { supertypes: [SERIALIZABLE] }),
  CLASS: new JavaClass('java.lang.Class', { supertypes: [SERIALIZABLE] }),
  BOOLEAN: new JavaClass('java.lang.Boolean', { supertypes: [SERIALIZABLE, COMPARABLE, ...CONSTABLE] }),
  CHARACTER: new JavaClass('java.lang.Character', { supertypes: [SERIALIZABLE, COMPARABLE, CONSTABLE[0]] }),
  BYTE: number('java.lang.Byte'),
  SHORT: number('java.lang.Short'),
  INTEGER: number('java.lang.Integer'),
  LONG: number('java.lang.Long'),
  FLOAT: number('java.lang.Float'),
  DOUBLE: number('java.lang.Double'),
  BIG_INTEGER: new JavaClass('java.math.BigInteger', { supertypes: ['java.lang.Number', COMPARABLE, SERIALIZABLE] }),
  BIG_DECIMAL: new JavaClass('java.math.BigDecimal', { supertypes: ['java.lang.Number', COMPARABLE, SERIALIZABLE] }),
  DATE: new JavaClass('java.util.Date', { supertypes: [SERIALIZABLE, 'java.lang.Cloneable', COMPARABLE] }),
  FILE: new JavaClass('java.io.File', { supertypes: [SERIALIZABLE, COMPARABLE] }),
  FILE_INPUT_STREAM: new JavaClass('java.io.FileInputStream', { supertypes: ['java.io.InputStream', 'java.io.Closeable'] }),
  PATH: new JavaClass('java.nio.file.Path', { isInterface: true }),
  UNIX_PATH: new JavaClass('sun.nio.fs.UnixPath', { supertypes: ['java.nio.file.Path', COMPARABLE, 'java.lang.Iterable'] }),
  URL: new JavaClass('java.net.URL', { supertypes: [SERIALIZABLE] }),
  PROPERTIES: new JavaClass('java.util.Properties', { supertypes: ['java.util.Hashtable', 'java.util.Map'] })
};

/** File[].class. */
Types.FILE_ARRAY = Types.FILE.arrayClass();
Object.freeze(Types);

/** value.getClass() for any non-null Java value. */
export function classOf(value) {
  if (typeof value === 'string') {
    return Types.STRING;
  }
  if (typeof value === 'boolean') {
    return Types.BOOLEAN;
  }
  return value.getClass();
}

/** String.valueOf(value) for any Java value. */
export function javaString(value) {
  return value == null ? 'null' : String(value);
}

/** A Java array: its class and items. */
export class JavaArray {
  /**
   * @param {JavaClass} componentType the component type
   * @param {Array} items the elements
   */
  constructor(componentType, items) {
    this.componentType = componentType;
    this.items = items;
  }

  getClass() {
    return this.componentType.arrayClass();
  }
}
