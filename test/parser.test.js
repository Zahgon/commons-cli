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

// Ported from AbstractParserTestCase, DefaultParserTest, PosixParserTest, GnuParserTest, ArgumentIsOptionTest,
// ValueTest, ValuesTest and DisablePartialMatchingTest.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  AmbiguousOptionException,
  DefaultParser,
  GnuParser,
  MissingArgumentException,
  MissingOptionException,
  NonOptionAction,
  Option,
  OptionBuilder,
  OptionGroup,
  Options,
  PosixParser,
  UnrecognizedOptionException
} from '../lib/index.js';
import { Properties } from '../lib/java/properties.js';

function fixture() {
  return new Options()
    .addOption('a', 'enable-a', false, 'turn [a] on or off')
    .addOption('b', 'bfile', true, 'set the value of [b]')
    .addOption('c', 'copt', false, 'turn [c] on or off');
}

describe('DefaultParser (AbstractParserTestCase)', () => {
  let parser;
  let options;

  beforeEach(() => {
    parser = new DefaultParser();
    options = fixture();
  });

  test('ambiguous argument parsing', () => {
    assert.throws(() => parser.parse(new Options(), ['-=-']), UnrecognizedOptionException);
  });

  test('ambiguous long option without equal, single dash', () => {
    const opts = new Options();
    opts.addOption(OptionBuilder.withLongOpt('foo').hasOptionalArg().create('f'));
    opts.addOption(OptionBuilder.withLongOpt('bar').hasOptionalArg().create('b'));
    const cl = parser.parse(opts, ['-b', '-foobar']);
    assert.equal(cl.hasOption('b'), true);
    assert.equal(cl.hasOption('f'), true);
    assert.equal(cl.getOptionValue('foo'), 'bar');
  });

  for (const [args, partial] of [[['--ver'], '--ver'], [['-ver'], '-ver']]) {
    test(`ambiguous partial long option ${args[0]}`, () => {
      const opts = new Options();
      opts.addOption(OptionBuilder.withLongOpt('version').create());
      opts.addOption(OptionBuilder.withLongOpt('verbose').create());
      const e = assert.throws(() => parser.parse(opts, args), AmbiguousOptionException) ?? captured(() => parser.parse(opts, args));
      assert.equal(e.getOption(), partial);
      assert.deepEqual(e.getMatchingOptions(), ['version', 'verbose']);
      assert.equal(e.getMessage(), `Ambiguous option: '${partial}'  (could be: 'version', 'verbose')`);
    });
  }

  test('argument starting with a hyphen', () => {
    assert.equal(parser.parse(options, ['-b', '-foo']).getOptionValue('b'), '-foo');
  });

  test('bursting', () => {
    const cl = parser.parse(options, ['-acbtoast', 'foo', 'bar']);
    assert.equal(cl.hasOption('a'), true);
    assert.equal(cl.hasOption('b'), true);
    assert.equal(cl.hasOption('c'), true);
    assert.equal(cl.getOptionValue('b'), 'toast');
    assert.deepEqual(cl.getArgList(), ['foo', 'bar']);
  });

  test('double dash ends option parsing', () => {
    const cl = parser.parse(options, ['--copt', '--', '-b', 'toast']);
    assert.equal(cl.hasOption('c'), true);
    assert.equal(cl.hasOption('b'), false);
    assert.deepEqual(cl.getArgList(), ['-b', 'toast']);
  });

  test('double dash after an option that needs a value', () => {
    const opts = new Options();
    opts.addOption(OptionBuilder.hasArg().create('n'));
    opts.addOption(OptionBuilder.create('m'));
    const e = captured(() => parser.parse(opts, ['-n', '--', '-m']));
    assert.ok(e instanceof MissingArgumentException);
    assert.equal(e.getOption().getOpt(), 'n');
  });

  test('quotes are stripped from long option values', () => {
    assert.equal(parser.parse(options, ['--bfile', '"quoted string"']).getOptionValue('b'), 'quoted string');
    assert.equal(parser.parse(options, ['--bfile="quoted string"']).getOptionValue('b'), '"quoted string"');
  });

  test('long options with and without equal', () => {
    const opts = new Options();
    opts.addOption(OptionBuilder.withLongOpt('foo').hasArg().create('f'));
    assert.equal(parser.parse(opts, ['--foo=bar']).getOptionValue('foo'), 'bar');
    assert.equal(parser.parse(opts, ['-foo=bar']).getOptionValue('foo'), 'bar');
    assert.equal(parser.parse(opts, ['-foobar']).getOptionValue('foo'), 'bar');
    assert.equal(parser.parse(opts, ['--foobar'], true).hasOption('foo'), false);
  });

  test('long option with an unexpected argument', () => {
    const opts = new Options();
    opts.addOption(OptionBuilder.withLongOpt('foo').create('f'));
    assert.equal(captured(() => parser.parse(opts, ['--foo=bar'])).getOption(), '--foo=bar');
    assert.equal(captured(() => parser.parse(opts, ['-foobar'])).getOption(), '-foobar');
  });

  test('missing arguments', () => {
    assert.equal(captured(() => parser.parse(options, ['-b'])).getOption().getOpt(), 'b');
    assert.equal(captured(() => parser.parse(options, ['-acb'])).getOption().getOpt(), 'b');
  });

  test('missing required group', () => {
    const group = new OptionGroup();
    group.addOption(OptionBuilder.create('a'));
    group.addOption(OptionBuilder.create('b'));
    group.setRequired(true);
    const opts = new Options();
    opts.addOptionGroup(group);
    opts.addOption(OptionBuilder.isRequired().create('c'));
    const e = captured(() => parser.parse(opts, ['-c']));
    assert.ok(e instanceof MissingOptionException);
    assert.equal(e.getMissingOptions().length, 1);
    assert.ok(e.getMissingOptions()[0] instanceof OptionGroup);
    assert.equal(e.getMessage(), 'Missing required option: [-a, -b]');
  });

  test('missing required options', () => {
    const opts = new Options();
    opts.addOption('a', 'enable-a', false, null);
    opts.addOption(OptionBuilder.withLongOpt('bfile').hasArg().isRequired().create('b'));
    assert.equal(captured(() => parser.parse(opts, ['-a'])).getMessage(), 'Missing required option: b');
    opts.addOption(OptionBuilder.withLongOpt('cfile').hasArg().isRequired().create('c'));
    const e = captured(() => parser.parse(opts, ['-a']));
    assert.equal(e.getMessage(), 'Missing required options: b, c');
    assert.deepEqual(e.getMissingOptions(), ['b', 'c']);
  });

  test('stop at the first non-option, then parse the rest', () => {
    for (const args of [['-c', 'foobar', '-b', 'toast'], ['--copt', 'foobar', '--bfile', 'toast'],
      [null, '-c', null, 'foobar', null, '-b', null, 'toast', null]]) {
      let cl = parser.parse(options, args, true);
      assert.equal(cl.hasOption('c'), true);
      assert.equal(cl.getArgList().length, 3);
      cl = parser.parse(options, cl.getArgs());
      assert.equal(cl.hasOption('c'), false);
      assert.equal(cl.getOptionValue('b'), 'toast');
      assert.deepEqual(cl.getArgList(), ['foobar']);
    }
  });

  test('negative numbers are values', () => {
    assert.equal(parser.parse(options, ['-b', '-1']).getOptionValue('b'), '-1');
    options.addOption('1', false, null);
    assert.equal(parser.parse(options, ['-b', '-1']).getOptionValue('b'), '-1');
    assert.equal(parser.parse(options, ['-b', '-1e5']).getOptionValue('b'), '-1e5');
    assert.equal(parser.parse(options, ['-b', '-0x1p3']).getOptionValue('b'), '-0x1p3');
  });

  test('optional arguments with properties', () => {
    const opts = new Options();
    opts.addOption(OptionBuilder.hasOptionalArgs(2).create('i'));
    const properties = new Properties();
    let cmd = parser.parse(opts, ['-i'], properties);
    assert.equal(cmd.hasOption('i'), true);
    assert.equal(cmd.getOptionValues('i'), null);
    cmd = parser.parse(opts, ['-i', 'paper', 'scissors'], properties);
    assert.deepEqual(cmd.getOptionValues('i'), ['paper', 'scissors']);
    cmd = parser.parse(opts, ['-i', 'paper', 'scissors', 'rock'], properties);
    assert.deepEqual(cmd.getOptionValues('i'), ['paper', 'scissors']);
    assert.deepEqual(cmd.getArgs(), ['rock']);
  });

  test('options from properties', () => {
    const opts = new Options();
    opts.addOption('a', false, 'toggle -a');
    opts.addOption('c', 'c', false, 'toggle -c');
    opts.addOption(OptionBuilder.hasOptionalArg().create('e'));
    const properties = new Properties();
    properties.setProperty('a', 'true');
    properties.setProperty('c', 'yes');
    properties.setProperty('e', '1');
    const cmd = parser.parse(opts, null, properties);
    assert.equal(cmd.hasOption('a'), true);
    assert.equal(cmd.hasOption('c'), true);
    assert.equal(cmd.getOptionValue('e'), '1');
    properties.setProperty('a', 'false');
    properties.setProperty('c', 'no');
    assert.equal(parser.parse(opts, null, properties).hasOption('a'), false);
    const undefinedProps = new Properties();
    undefinedProps.setProperty('undefined', 'true');
    assert.equal(captured(() => parser.parse(opts, null, undefinedProps)).getMessage(), "Default option wasn't defined");
  });

  test('unrecognized options', () => {
    const e = captured(() => parser.parse(options, ['-a', '-d']));
    assert.ok(e instanceof UnrecognizedOptionException);
    assert.equal(e.getMessage(), 'Unrecognized option: -d');
    assert.equal(e.getOption(), '-d');
  });

  test('stop at an unexpected argument', () => {
    const cl = parser.parse(options, ['-c', 'foober', '-b', 'toast'], true);
    assert.equal(cl.hasOption('c'), true);
    assert.deepEqual(cl.getArgList(), ['foober', '-b', 'toast']);
    const cl2 = parser.parse(options, ['-z', '-a', '-btoast'], true);
    assert.deepEqual(cl2.getArgList(), ['-z', '-a', '-btoast']);
  });

  test('a single dash is an argument', () => {
    assert.deepEqual(parser.parse(options, ['--bfile', '-', '-']).getArgList(), ['-']);
    assert.equal(parser.parse(options, ['--bfile', '-', '-']).getOptionValue('b'), '-');
  });

  test('Java properties as options', () => {
    const opts = new Options();
    opts.addOption(Option.builder('D').numberOfArgs(2).valueSeparator().get());
    const cl = parser.parse(opts, ['-Dparam1=value1', '-Dparam2=value2', '-Dparam3']);
    assert.deepEqual(cl.getOptionValues('D'), ['param1', 'value1', 'param2', 'value2', 'param3']);
    const props = cl.getOptionProperties('D');
    assert.equal(props.getProperty('param1'), 'value1');
    assert.equal(props.getProperty('param3'), 'true');
    assert.equal(props.toString(), '{param3=true, param1=value1, param2=value2}');
  });
});

describe('DefaultParser options', () => {
  test('quotes are stripped by default only from separate values', () => {
    const options = new Options().addOption(Option.builder('b').longOpt('bfile').hasArg().get());
    const strip = (value, args) => DefaultParser.builder().setStripLeadingAndTrailingQuotes(value).get().parse(options, args)
      .getOptionValue('b');
    assert.equal(strip(null, ['-b', '"quoted"']), 'quoted');
    assert.equal(strip(null, ['-b"quoted"']), '"quoted"');
    assert.equal(strip(true, ['--bfile="quoted"']), 'quoted');
    assert.equal(strip(false, ['-b', '"quoted"']), '"quoted"');
  });

  test('partial matching can be disabled', () => {
    const options = new Options()
      .addOption(new Option('d', 'extract', false, 'Turn on extraction.'))
      .addOption(new Option('e', 'extension', false, 'Turn on extension.'));
    const exact = DefaultParser.builder().setAllowPartialMatching(false).get();
    const cl = exact.parse(options, ['-de', '--option=foobar'], true);
    assert.equal(cl.hasOption('d'), true);
    assert.equal(cl.hasOption('e'), true);
    assert.deepEqual(cl.getArgList(), ['--option=foobar']);
    assert.throws(() => exact.parse(options, ['--option=foobar']), UnrecognizedOptionException);
    assert.throws(() => new DefaultParser(true).parse(options, ['--ext']), AmbiguousOptionException);
  });

  test('non-option actions', () => {
    const options = fixture();
    const parse = (action) => new DefaultParser().parseWithAction(options, null, action, ['-a', '-z', 'x', '-c']).getArgList();
    assert.deepEqual(parse(NonOptionAction.SKIP), ['-z', 'x']);
    assert.deepEqual(parse(NonOptionAction.IGNORE), ['x']);
    assert.deepEqual(parse(NonOptionAction.STOP), ['-z', 'x', '-c']);
    assert.throws(() => parse(NonOptionAction.THROW), UnrecognizedOptionException);
  });

  test('deprecated options call the handler', () => {
    const used = [];
    const options = new Options().addOption(Option.builder('d').deprecated().hasArg().get());
    const cl = DefaultParser.builder().setDeprecatedHandler((o) => used.push(o.getKey())).get().parse(options, ['-d', 'x']);
    assert.equal(cl.getOptionValue('d'), 'x');
    assert.equal(cl.hasOption('d'), true);
    assert.deepEqual(used, ['d', 'd']);
  });
});

describe('PosixParser and GnuParser', () => {
  test('PosixParser bursts tokens and treats the remainder as a value', () => {
    const cl = new PosixParser().parse(fixture(), ['-acbtoast', 'foo']);
    assert.equal(cl.getOptionValue('b'), 'toast');
    assert.deepEqual(cl.getArgList(), ['foo']);
  });

  test('PosixParser: -attr is the burst -a -t -t -r when only p and attr exist', () => {
    const options = new Options().addOption('p', false, 'Option p').addOption('attr', true, 'Option accepts argument');
    const cl = new PosixParser().parse(options, ['-p', '-attr', 'p']);
    assert.equal(cl.hasOption('p'), true);
    assert.equal(cl.getOptionValue('attr'), 'p');
  });

  test('GnuParser splits -Dkey=value', () => {
    const options = new Options().addOption(Option.builder('D').hasArgs().valueSeparator().get());
    const cl = new GnuParser().parse(options, ['-Dk=v', 'arg']);
    assert.deepEqual(cl.getOptionValues('D'), ['k', 'v', 'arg']);
  });
});

describe('ValuesTest', () => {
  test('values of options with value separators and fixed counts', () => {
    const options = new Options();
    options.addOption('a', false, 'toggle -a');
    options.addOption('b', true, 'set -b');
    options.addOption(OptionBuilder.withLongOpt('e').hasArgs().withDescription('set -e ').create('e'));
    options.addOption(OptionBuilder.withLongOpt('g').hasArgs(2).withDescription('set -g').create('g'));
    options.addOption(OptionBuilder.withLongOpt('j').hasArgs().withValueSeparator('=').create('j'));
    options.addOption(OptionBuilder.withLongOpt('m').hasArgs().withValueSeparator().create('m'));
    const cl = new PosixParser().parse(options, ['-a', '-b', 'foo', '-e', 'one', 'two', '-g', 'val1', 'val2', 'arg3', '-j', 'key=value',
      '-m', 'key=value']);
    assert.equal(cl.hasOption('a'), true);
    assert.deepEqual(cl.getOptionValues('b'), ['foo']);
    assert.deepEqual(cl.getOptionValues('e'), ['one', 'two']);
    assert.deepEqual(cl.getOptionValues('g'), ['val1', 'val2']);
    assert.deepEqual(cl.getArgs(), ['arg3']);
    assert.deepEqual(cl.getOptionValues('j'), ['key', 'value']);
    assert.deepEqual(cl.getOptionValues('m'), ['key', 'value']);
  });
});

/** The exception a function throws. */
function captured(fn) {
  try {
    fn();
  } catch (e) {
    return e;
  }
  assert.fail('expected an exception');
}
