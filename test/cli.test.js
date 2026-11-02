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

// Tests of the commons-cli command: the JSON-lines protocol, its errors and exit statuses.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

const COMMAND = fileURLToPath(new URL('../bin/commons-cli.js', import.meta.url));

function run(input, args = []) {
  const result = spawnSync(process.execPath, [COMMAND, ...args], { input, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const line = (request) => `${JSON.stringify(request)}\n`;

describe('commons-cli command', () => {
  test('a parse request', () => {
    const { status, stdout, stderr } = run(line({
      op: 'parse',
      options: [['addOption(String,String,boolean,String)', 'f', 'file', true, 'the file'], ['addOption(String,String)', 'v', 'verbose']],
      parses: [{ args: ['-f', 'x.txt', '-v', 'rest', '--', '-z'], queries: [['getOptionValue(char)', 'f'], ['hasOption(String)', 'verbose'], ['getArgs()']] },
        { args: ['-q'] }]
    }));
    assert.equal(status, 1);
    assert.equal(stderr, '');
    assert.equal(stdout, '{"results":[{"args":["rest","-z"],"options":[{"opt":"f","longOpt":"file","values":["x.txt"]},'
      + '{"opt":"v","longOpt":null,"values":[]}],"queries":["x.txt",false,["rest","-z"]]},{"error":{"name":'
      + '"org.apache.commons.cli.UnrecognizedOptionException","message":"Unrecognized option: -q","option":"-q"}}]}\n');
  });

  test('library output is captured per request', () => {
    const { status, stdout } = run(line({
      op: 'parse', builder: { deprecatedHandler: 'default' },
      options: [['addOption(Option)', { builder: [['deprecated()']], of: 'd' }]],
      parses: [{ args: ['-d'], queries: [['hasOption(char)', 'd']] }]
    }));
    assert.equal(status, 0);
    assert.equal(stdout, '{"results":[{"args":[],"options":[{"opt":"d","longOpt":null,"values":[]}],"queries":[true]}],'
      + '"stdout":"Option \'d\': Deprecated\\n"}\n');
  });

  test('output is ASCII with escapes', () => {
    const { stdout } = run(line({ op: 'options', options: [['addOption(String,String)', 'é', '\ud800😀']], calls: [['getOption(String)', 'é']] }));
    assert.match(stdout, /"opt":"\\u00e9"/);
    assert.match(stdout, /"description":"\\ud800\\ud83d\\ude00"/);
  });

  test('front-end errors', () => {
    const { status, stdout } = run('not json\n{"op":"nope"}\n[]\n{"op":1}\n\n{"op":"options","calls":[["nope()"]]}\n');
    assert.equal(status, 1);
    assert.deepEqual(stdout.trimEnd().split('\n').map((l) => JSON.parse(l).error.message),
      ['malformed JSON', 'unknown op: "nope"', 'request must be an object', 'unknown op: 1.0', 'unknown method: nope()']);
  });

  test('success, and arguments are a usage error', () => {
    assert.equal(run(line({ op: 'textStyle', calls: [['toString()']] })).status, 0);
    const usage = run('', ['--help']);
    assert.equal(usage.status, 2);
    assert.equal(usage.stdout, '');
    assert.match(usage.stderr, /^usage: commons-cli < requests.jsonl\n/);
  });
});
