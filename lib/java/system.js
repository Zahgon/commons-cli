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
 * The text sinks the library writes to: System.out and System.err (replaceable, as System.setOut and setErr allow),
 * PrintWriter, StringWriter and StringBuilder. Each is an Appendable: append(text), append(text, start, end).
 *
 * @module java/system
 */

import { IndexOutOfBoundsException } from './errors.js';

/** System.lineSeparator() on Unix. */
export const LINE_SEPARATOR = '\n';

/** The text of a CharSequence argument, "null" for null (as Appendable.append does). */
function text(value) {
  return value == null ? 'null' : String(value);
}

/** Appendable.append(csq, start, end) bounds, as AbstractStringBuilder checks them. */
function range(value, start, end) {
  const s = text(value);
  if (start < 0 || start > end || end > s.length) {
    throw new IndexOutOfBoundsException(`Range [${start}, ${end}) out of bounds for length ${s.length}`);
  }
  return s.slice(start, end);
}

/** java.lang.StringBuilder (and StringBuffer). */
export class StringBuilder {
  constructor(initial = '') {
    this.value = initial;
  }

  append(value, start, end) {
    this.value += start === undefined ? text(value) : range(value, start, end);
    return this;
  }

  get length() {
    return this.value.length;
  }

  toString() {
    return this.value;
  }
}

/** java.io.StringWriter. */
export class StringWriter extends StringBuilder {
  write(s) {
    this.value += s;
  }
}

/** A PrintStream: text goes to a write function. */
export class PrintStream {
  /** @param {function(string): void} write receives the printed text */
  constructor(write) {
    this.write = write;
  }

  print(value) {
    this.write(text(value));
  }

  println(value = '') {
    this.write(`${text(value)}${LINE_SEPARATOR}`);
  }

  append(value, start, end) {
    this.write(start === undefined ? text(value) : range(value, start, end));
    return this;
  }
}

/** java.io.PrintWriter over a writer (a StringWriter, a PrintStream or another PrintWriter). */
export class PrintWriter {
  constructor(out) {
    this.out = out;
  }

  write(s) {
    this.out.write(s);
  }

  print(value) {
    this.write(text(value));
  }

  println(value = '') {
    this.write(`${text(value)}${LINE_SEPARATOR}`);
  }

  append(value, start, end) {
    this.write(start === undefined ? text(value) : range(value, start, end));
    return this;
  }

  flush() {}
}

/** System.out and System.err, which System.setOut and System.setErr replace. */
export const System = {
  out: new PrintStream((s) => process.stdout.write(s)),
  err: new PrintStream((s) => process.stderr.write(s)),

  setOut(stream) {
    System.out = stream;
  },

  setErr(stream) {
    System.err = stream;
  }
};
