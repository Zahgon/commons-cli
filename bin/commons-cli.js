#!/usr/bin/env node
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
 * The commons-cli command: reads JSON-lines requests on standard input and writes one JSON response line per
 * request. See README.md for the protocol.
 */

import { readSync, writeSync } from 'node:fs';
import { exit } from 'node:process';
import { toJson } from '../lib/cli/json.js';
import { respond } from '../lib/cli/request.js';
import { PrintStream, System } from '../lib/java/system.js';

const USAGE = 'usage: commons-cli < requests.jsonl\n'
  + '\n'
  + 'Reads one JSON request per line on standard input and writes one JSON response per line.\n'
  + 'Operations: parse, commandLine, option, options, group, pattern, convert, helpFormatter, help,\n'
  + '            optionFormatter, textHelp, textStyle.\n';

/** All of standard input (a pipe may be non-blocking: wait for it rather than fail). */
function readInput() {
  const chunks = [];
  const buffer = Buffer.alloc(1 << 16);
  const pause = new Int32Array(new SharedArrayBuffer(4));
  for (;;) {
    let count;
    try {
      count = readSync(0, buffer, 0, buffer.length, null);
    } catch (error) {
      if (error.code === 'EAGAIN') {
        Atomics.wait(pause, 0, 0, 5);
        continue;
      }
      if (error.code === 'EOF') {
        break;
      }
      throw error;
    }
    if (count === 0) {
      break;
    }
    chunks.push(Buffer.from(buffer.subarray(0, count)));
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** What a UTF-8 PrintStream makes of text: each unpaired surrogate becomes "?". */
function printable(text) {
  return text.replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '?');
}

/** Writes all of the text (a pipe may be non-blocking: wait while it is full). */
function writeAll(fd, text) {
  const bytes = Buffer.from(text, 'utf8');
  const pause = new Int32Array(new SharedArrayBuffer(4));
  let offset = 0;
  while (offset < bytes.length) {
    try {
      offset += writeSync(fd, bytes, offset);
    } catch (error) {
      if (error.code !== 'EAGAIN') {
        throw error;
      }
      Atomics.wait(pause, 0, 0, 5);
    }
  }
}

/** Answers every request on standard input and returns the exit status; any argument is a usage error. */
function main(argv) {
  if (argv.length > 0) {
    writeAll(2, USAGE);
    return 2;
  }
  const output = [];
  let failed = false;
  for (const line of readInput().split('\n')) {
    if (line === '') {
      continue;
    }
    let out = '';
    let err = '';
    System.setOut(new PrintStream((s) => {
      out += s;
    }));
    System.setErr(new PrintStream((s) => {
      err += s;
    }));
    const { response, failed: lineFailed } = respond(line);
    if (out !== '') {
      response.stdout = printable(out);
    }
    if (err !== '') {
      response.stderr = printable(err);
    }
    failed ||= lineFailed;
    output.push(`${toJson(response)}\n`);
  }
  writeAll(1, output.join(''));
  return failed ? 1 : 0;
}

exit(main(process.argv.slice(2)));
