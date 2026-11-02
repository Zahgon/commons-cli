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
 * java.io.File and java.nio.file.Path (sun.nio.fs.UnixPath) as values, with their path normalisation on Unix and the
 * errors Paths.get raises, neither touching the file system; and java.io.FileInputStream, which opens its file.
 *
 * @module java/io
 */

import { closeSync, fstatSync, openSync } from 'node:fs';

import { isHighSurrogate, isLowSurrogate } from './character.js';
import { InvalidPathException, IOException, requireNonNull } from './errors.js';
import { Types } from './types.js';

/** UnixFileSystem.normalize(pathname, off). */
function normalizeFrom(pathname, off) {
  let n = pathname.length;
  while (n > off && pathname[n - 1] === '/') {
    n--;
  }
  if (n === 0) {
    return '/';
  }
  if (n === off) {
    return pathname.slice(0, off);
  }
  let sb = pathname.slice(0, off);
  let prev = '';
  for (let i = off; i < n; i++) {
    const c = pathname[i];
    if (prev === '/' && c === '/') {
      continue;
    }
    sb += c;
    prev = c;
  }
  return sb;
}

/** java.io.File: a normalised path name. */
export class JavaFile {
  /** new File(pathname). */
  constructor(pathname) {
    requireNonNull(pathname);
    const doubleSlash = pathname.indexOf('//');
    if (doubleSlash >= 0) {
      this.path = normalizeFrom(pathname, doubleSlash);
    } else if (pathname.endsWith('/')) {
      this.path = normalizeFrom(pathname, pathname.length - 1);
    } else {
      this.path = pathname;
    }
  }

  getClass() {
    return Types.FILE;
  }

  toString() {
    return this.path;
  }
}

/** java.io.FileNotFoundException. */
export class FileNotFoundException extends IOException {
  static javaName = 'java.io.FileNotFoundException';
}

/** The strerror text Java quotes when a file cannot be opened, by Node.js error code. */
const OPEN_FAILURES = new Map([
  ['EACCES', 'Permission denied'],
  ['EISDIR', 'Is a directory'],
  ['ELOOP', 'Too many levels of symbolic links'],
  ['EMFILE', 'Too many open files'],
  ['ENAMETOOLONG', 'File name too long'],
  ['ENOENT', 'No such file or directory'],
  ['ENOTDIR', 'Not a directory'],
  ['EPERM', 'Operation not permitted']
]);

/** java.io.FileInputStream: a file opened for reading, until close(). */
export class JavaFileInputStream {
  /**
   * new FileInputStream(name). A name with a NUL character, or one that cannot be opened, throws
   * FileNotFoundException; Java also refuses a directory, which Node.js would open.
   */
  constructor(name) {
    const { path } = new JavaFile(name);
    if (path.includes('\u0000')) {
      throw new FileNotFoundException('Invalid file path');
    }
    this.fd = JavaFileInputStream.open(path);
    if (fstatSync(this.fd).isDirectory()) {
      this.close();
      throw JavaFileInputStream.failure(path, 'EISDIR');
    }
  }

  /** Opens the path and returns its descriptor; an error with no Java counterpart is rethrown. */
  static open(path) {
    try {
      return openSync(path, 'r');
    } catch (e) {
      if (OPEN_FAILURES.has(e.code)) {
        throw JavaFileInputStream.failure(path, e.code);
      }
      throw e;
    }
  }

  static failure(path, code) {
    return new FileNotFoundException(`${path} (${OPEN_FAILURES.get(code)})`);
  }

  close() {
    closeSync(this.fd);
  }

  getClass() {
    return Types.FILE_INPUT_STREAM;
  }

  /** Object.toString(); the open descriptor stands in for the identity hash code. */
  toString() {
    return `${Types.FILE_INPUT_STREAM.getName()}@${this.fd.toString(16)}`;
  }
}

function invalidPath(input, reason) {
  return new InvalidPathException(`${reason}: ${input}`);
}

function checkNotNul(input, c) {
  if (c === '\u0000') {
    throw invalidPath(input, 'Nul character not allowed');
  }
}

/** UnixPath.normalizeAndCheck. */
function normalizeAndCheck(input) {
  const n = input.length;
  let prev = '';
  for (let i = 0; i < n; i++) {
    const c = input[i];
    if (c === '/' && prev === '/') {
      return normalizeRest(input, n, i - 1);
    }
    checkNotNul(input, c);
    prev = c;
  }
  if (prev === '/' && n > 1) {
    return input.slice(0, n - 1);
  }
  return input;
}

/** Normalizes a path from off on: drops trailing slashes, collapses repeated ones and rejects NUL. */
function normalizeRest(input, len, off) {
  let n = len;
  while (n > 0 && input[n - 1] === '/') {
    n--;
  }
  if (n === 0) {
    return '/';
  }
  let sb = off > 0 ? input.slice(0, off) : '';
  let prev = '';
  for (let i = off; i < n; i++) {
    const c = input[i];
    if (c === '/' && prev === '/') {
      continue;
    }
    checkNotNul(input, c);
    sb += c;
    prev = c;
  }
  return sb;
}

/** Whether a string encodes to UTF-8 without replacement (no unpaired surrogates). */
function isWellFormed(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (isHighSurrogate(c) && i + 1 < s.length && isLowSurrogate(s.charCodeAt(i + 1))) {
      i++;
    } else if (c >= 0xd800 && c <= 0xdfff) {
      return false;
    }
  }
  return true;
}

/** sun.nio.fs.UnixPath, as Paths.get(first) builds it. */
export class UnixPath {
  /** Paths.get(first). */
  constructor(first) {
    requireNonNull(first);
    const normalized = normalizeAndCheck(first);
    if (!isWellFormed(normalized)) {
      throw invalidPath(normalized, 'Malformed input or input contains unmappable characters');
    }
    this.path = normalized;
  }

  getClass() {
    return Types.UNIX_PATH;
  }

  toString() {
    return this.path;
  }
}
