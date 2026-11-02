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

// Ported from OptionTest, OptionsTest, OptionGroupTest, OptionValidatorTest, OptionBuilderTest,
// PatternOptionBuilderTest, DeprecatedAttributesTest and AlreadySelectedExceptionTest.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  AlreadySelectedException,
  DefaultParser,
  DeprecatedAttributes,
  Option,
  OptionBuilder,
  OptionGroup,
  Options,
  PatternOptionBuilder,
  Types
} from '../lib/index.js';

describe('Option', () => {
  test('builder methods', () => {
    const option = Option.builder('a').longOpt('aaa').desc('desc').argName('file').hasArgs().optionalArg(true).required()
      .valueSeparator(',').type(Types.NUMBER).since('1.0').get();
    assert.equal(option.getOpt(), 'a');
    assert.equal(option.getLongOpt(), 'aaa');
    assert.equal(option.getDescription(), 'desc');
    assert.equal(option.getArgName(), 'file');
    assert.equal(option.getArgs(), Option.UNLIMITED_VALUES);
    assert.equal(option.hasOptionalArg(), true);
    assert.equal(option.isRequired(), true);
    assert.equal(option.getValueSeparator(), ',');
    assert.equal(option.getType(), Types.NUMBER);
    assert.equal(option.getSince(), '1.0');
    assert.equal(option.toString(), '[ Option a aaa[ARG...] :: desc :: class java.lang.Number ]');
  });

  test('either a short or a long name is needed', () => {
    assert.throws(() => Option.builder().get(), { name: 'IllegalStateException', message: 'Either opt or longOpt must be specified' });
    assert.equal(Option.builder().longOpt('long').get().getKey(), 'long');
  });

  test('optionalArg sets one argument when none is set', () => {
    assert.equal(Option.builder('a').optionalArg(true).get().getArgs(), 1);
    assert.equal(Option.builder('a').hasArgs().optionalArg(true).get().getArgs(), Option.UNLIMITED_VALUES);
    assert.equal(Option.builder('a').optionalArg(false).get().getArgs(), Option.UNINITIALIZED);
  });

  test('clone copies the values', () => {
    const a = Option.builder('a').hasArgs().get();
    const b = a.clone();
    b.processValue('x');
    assert.deepEqual(a.getValuesList(), []);
    assert.deepEqual(b.getValuesList(), ['x']);
    assert.equal(a.equals(b), true);
  });

  test('equals and hashCode use the short and long names', () => {
    assert.equal(new Option('f', null).equals(new Option('f', 'other')), true);
    assert.equal(new Option('f', 'file', false, null).equals(new Option('f', null)), false);
    assert.equal(new Option('f', 'file', false, null).hashCode(), Option.builder('f').longOpt('file').get().hashCode());
    assert.equal(Option.builder('f').longOpt('foo').get().hashCode(), 3149857);
  });

  test('addValue is not for clients', () => {
    assert.throws(() => new Option('a', null).addValue('x'), { name: 'UnsupportedOperationException' });
  });

  test('value separators split values into the remaining argument count', () => {
    const option = Option.builder('D').numberOfArgs(2).valueSeparator().get();
    option.processValue('k=v=w');
    assert.deepEqual(option.getValuesList(), ['k', 'v=w']);
  });

  test('deprecated attributes', () => {
    assert.equal(Option.builder('a').deprecated().get().getDeprecated().toString(), 'Deprecated');
    const attrs = DeprecatedAttributes.builder().setDescription('Use Bar').setSince('2.0').setForRemoval(true).get();
    assert.equal(attrs.toString(), 'Deprecated for removal since 2.0: Use Bar');
    const option = Option.builder('a').longOpt('aa').deprecated(attrs).get();
    assert.equal(option.toString(), '[ Option a aa Deprecated for removal since 2.0: Use Bar :: null :: class java.lang.String ]');
    assert.equal(option.toDeprecatedString(), "Option 'a''aa': Deprecated for removal since 2.0: Use Bar");
  });
});

describe('OptionValidator', () => {
  test('valid and invalid names', () => {
    for (const name of ['a', 'abc', '?', '@', '_', '$', 'é', 'a-b', 'a1', '\u0000', 'a­']) {
      assert.doesNotThrow(() => new Option(name, null), name);
    }
    assert.throws(() => new Option('', null), { message: 'Empty option name.' });
    assert.throws(() => new Option('-a', null), { message: "Illegal option name '-'." });
    assert.throws(() => new Option('a?', null), { message: "The option 'a?' contains an illegal character : '?'." });
    assert.throws(() => new Option('a b', null), { message: "The option 'a b' contains an illegal character : ' '." });
    assert.throws(() => new Option('😀', null), { message: "Illegal option name '\ud83d'." });
  });
});

describe('Options', () => {
  test('long options, short options and matching', () => {
    const options = new Options().addOption('a', 'alpha', false, 'a').addOption('b', 'beta', true, 'b').addOption(null, 'alphabet', false, 'c');
    assert.equal(options.hasOption('-a'), true);
    assert.equal(options.hasOption('--beta'), true);
    assert.equal(options.hasShortOption('alpha'), false);
    assert.equal(options.hasLongOption('alpha'), true);
    assert.deepEqual(options.getMatchingOptions('alp'), ['alpha', 'alphabet']);
    assert.deepEqual(options.getMatchingOptions('alpha'), ['alpha']);
    assert.equal(options.getOption('beta').getOpt(), 'b');
    assert.equal(options.toString().startsWith('[ Options: [ short {a=[ Option a alpha :: a'), true);
  });

  test('required options are kept in order', () => {
    const options = new Options();
    options.addRequiredOption('a', null, false, 'a');
    options.addOption(Option.builder('b').required().get());
    options.addOption(Option.builder('a').required().get());
    assert.deepEqual(options.getRequiredOptions(), ['b', 'a']);
  });

  test('addOptions rejects duplicate keys', () => {
    const options = new Options().addOption('a', 'x');
    assert.throws(() => options.addOptions(new Options().addOption('a', 'y')), { message: 'Duplicate key: a' });
    options.addOptions(new Options().addOption('b', 'y'));
    assert.equal(options.hasOption('b'), true);
  });
});

describe('OptionGroup', () => {
  function groups() {
    const group1 = new OptionGroup().addOption(new Option('f', 'file', false, 'file to process'))
      .addOption(new Option('d', 'directory', false, 'directory to process'));
    const group2 = new OptionGroup().addOption(new Option('s', 'section', false, 'section to process'))
      .addOption(new Option('c', 'chapter', false, 'chapter to process'));
    return new Options().addOptionGroup(group1).addOptionGroup(group2).addOption('r', 'revision', false, 'revision number');
  }

  test('one option of each group', () => {
    const cl = new DefaultParser().parse(groups(), ['-f', '-s']);
    assert.equal(cl.hasOption('f'), true);
    assert.equal(cl.hasOption('s'), true);
  });

  test('two options of one group', () => {
    try {
      new DefaultParser().parse(groups(), ['-f', '-d']);
      assert.fail('expected AlreadySelectedException');
    } catch (e) {
      assert.ok(e instanceof AlreadySelectedException);
      assert.equal(e.getMessage(), "The option 'd' was specified but an option from this group has already been selected: 'f'");
      assert.equal(e.getOption().getOpt(), 'd');
      assert.equal(e.getOptionGroup().getSelected(), 'f');
    }
  });

  test('toString', () => {
    const group = new OptionGroup().addOption(new Option(null, 'foo', false, 'Foo')).addOption(new Option(null, 'bar', false, 'Bar'));
    assert.equal(group.toString(), '[--foo Foo, --bar Bar]');
    assert.equal(new OptionGroup().addOption(new Option('f', null)).addOption(new Option('b', 'Bar')).toString(), '[-f, -b Bar]');
  });
});

describe('OptionBuilder', () => {
  test('complete option', () => {
    const option = OptionBuilder.withLongOpt('simple option').hasArg().isRequired().hasArgs().withType(Types.FLOAT)
      .withDescription('this is a simple option').create('s');
    assert.equal(option.getLongOpt(), 'simple option');
    assert.equal(option.getType(), Types.FLOAT);
    assert.equal(option.hasArgs(), true);
    assert.equal(option.isRequired(), true);
  });

  test('state is reset after create', () => {
    OptionBuilder.withDescription('JUnit').create('a');
    assert.equal(OptionBuilder.create('x').getDescription(), null);
    assert.throws(() => OptionBuilder.create(), { message: 'longopt missing' });
  });
});

describe('PatternOptionBuilder', () => {
  test('pattern types', () => {
    const options = PatternOptionBuilder.parsePattern('a:b@cde>f+n%t/m*z#');
    assert.equal(options.getOption('a').getType(), Types.STRING);
    assert.equal(options.getOption('b').getType(), Types.OBJECT);
    assert.equal(options.getOption('c').hasArg(), false);
    assert.equal(options.getOption('e').getType(), Types.FILE);
    assert.equal(options.getOption('n').getType(), Types.NUMBER);
    assert.equal(options.getOption('t').getType(), Types.URL);
    assert.equal(options.getOption('m').getType().getName(), '[Ljava.io.File;');
    assert.equal(options.getOption('z').getType(), Types.DATE);
    const cl = new DefaultParser().parse(options, ['-n', '4.5', '-t', 'https://commons.apache.org', '-e', 'build.xml']);
    assert.equal(cl.getParsedOptionValue('n').toString(), '4.5');
    assert.equal(cl.getParsedOptionValue('t').toString(), 'https://commons.apache.org');
    assert.equal(cl.getParsedOptionValue('e').toString(), 'build.xml');
  });

  test('required options', () => {
    const options = PatternOptionBuilder.parsePattern('hc!<');
    assert.equal(options.getOption('c').isRequired(), true);
    assert.equal(options.getOption('h').isRequired(), false);
  });
});
