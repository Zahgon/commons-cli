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
 * The Java exception types the library throws or wraps. Each class records the Java binary name of the type it stands
 * for (javaName), because the library's messages embed Throwable.toString() of wrapped exceptions.
 *
 * @module java/errors
 */

/** java.lang.Throwable: a message that may be null and an optional cause. */
export class JavaThrowable extends Error {
  static javaName = 'java.lang.Throwable';

  /**
   * @param {string|null} [message] the detail message, null for none
   * @param {Error} [cause] the cause
   */
  constructor(message = null, cause = undefined) {
    super(message ?? '', cause === undefined ? undefined : { cause });
    this.name = this.constructor.name;
    this.javaMessage = message;
  }

  /** The Java binary name of this exception's class. */
  get javaName() {
    return this.constructor.javaName;
  }

  /** Throwable.getMessage(). */
  getMessage() {
    return this.javaMessage;
  }

  /** Throwable.toString(): the class name, then ": " and the message when there is one. */
  toString() {
    const message = this.getMessage();
    return message != null ? `${this.javaName}: ${message}` : this.javaName;
  }

  /** The Throwable(Throwable cause) constructors: the message is the cause's toString(). */
  static wrapping(cause) {
    return new this(cause == null ? null : javaToString(cause), cause);
  }
}

/** Throwable.toString() of any error, Java or not. */
export function javaToString(error) {
  if (error instanceof JavaThrowable) {
    return error.toString();
  }
  return error instanceof TypeError ? 'java.lang.NullPointerException' : String(error);
}

/** The Java binary name of any error: JavaScript TypeErrors from null dereferences count as NullPointerException. */
export function javaNameOf(error) {
  if (error instanceof JavaThrowable) {
    return error.javaName;
  }
  return error instanceof TypeError ? 'java.lang.NullPointerException' : 'java.lang.Error';
}

/** The Java message of any error (null for a dereferenced null, whose JVM message is not kept). */
export function javaMessageOf(error) {
  if (error instanceof JavaThrowable) {
    return error.getMessage();
  }
  return error instanceof TypeError ? null : String(error.message);
}

function define(javaName, Base) {
  const simple = javaName.slice(javaName.lastIndexOf('.') + 1).replace(/^.*\$/, '');
  const cls = { [simple]: class extends Base {} }[simple];
  cls.javaName = javaName;
  return cls;
}

export const JavaException = define('java.lang.Exception', JavaThrowable);
export const RuntimeException = define('java.lang.RuntimeException', JavaException);
export const IllegalArgumentException = define('java.lang.IllegalArgumentException', RuntimeException);
export const IllegalStateException = define('java.lang.IllegalStateException', RuntimeException);
export const UnsupportedOperationException = define('java.lang.UnsupportedOperationException', RuntimeException);
export const NullPointerException = define('java.lang.NullPointerException', RuntimeException);
export const ClassCastException = define('java.lang.ClassCastException', RuntimeException);
export const NumberFormatException = define('java.lang.NumberFormatException', IllegalArgumentException);
export const IndexOutOfBoundsException = define('java.lang.IndexOutOfBoundsException', RuntimeException);
export const StringIndexOutOfBoundsException = define('java.lang.StringIndexOutOfBoundsException', IndexOutOfBoundsException);
export const NegativeArraySizeException = define('java.lang.NegativeArraySizeException', RuntimeException);
export const IOException = define('java.io.IOException', JavaException);
export const MalformedURLException = define('java.net.MalformedURLException', IOException);
export const InvalidPathException = define('java.nio.file.InvalidPathException', IllegalArgumentException);
export const IllegalFormatException = define('java.util.IllegalFormatException', IllegalArgumentException);
export const UnknownFormatConversionException = define('java.util.UnknownFormatConversionException', IllegalFormatException);
export const MissingFormatArgumentException = define('java.util.MissingFormatArgumentException', IllegalFormatException);
export const MissingFormatWidthException = define('java.util.MissingFormatWidthException', IllegalFormatException);
export const IllegalFormatWidthException = define('java.util.IllegalFormatWidthException', IllegalFormatException);
export const IllegalFormatPrecisionException = define('java.util.IllegalFormatPrecisionException', IllegalFormatException);
export const IllegalFormatFlagsException = define('java.util.IllegalFormatFlagsException', IllegalFormatException);
export const DuplicateFormatFlagsException = define('java.util.DuplicateFormatFlagsException', IllegalFormatException);
export const UnknownFormatFlagsException = define('java.util.UnknownFormatFlagsException', IllegalFormatException);
export const FormatFlagsConversionMismatchException = define('java.util.FormatFlagsConversionMismatchException',
  IllegalFormatException);
export const IllegalFormatConversionException = define('java.util.IllegalFormatConversionException', IllegalFormatException);
export const IllegalFormatCodePointException = define('java.util.IllegalFormatCodePointException', IllegalFormatException);
export const IllegalFormatArgumentIndexException = define('java.util.IllegalFormatArgumentIndexException',
  IllegalFormatException);

/** java.text.ParseException, which also carries the offset where parsing failed. */
export class TextParseException extends JavaException {
  static javaName = 'java.text.ParseException';

  constructor(message, errorOffset) {
    super(message);
    this.errorOffset = errorOffset;
  }
}

/** Objects.requireNonNull(value, message). */
export function requireNonNull(value, message = null) {
  if (value == null) {
    throw new NullPointerException(message);
  }
  return value;
}
