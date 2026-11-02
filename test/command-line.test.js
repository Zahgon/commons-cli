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

// Ported from CommandLineTest, TypeHandlerTest and ConverterTests.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { CommandLine, Converter, DefaultParser, Option, OptionGroup, Options, ParseException, TypeHandler, Types } from '../lib/index.js';
import { PrintStream, System } from '../lib/java/system.js';

/** Runs fn with System.out and System.err captured; returns [result, out, err]. */
function capture(fn) {
  const saved = [System.out, System.err];
  let out = '';
  let err = '';
  System.setOut(new PrintStream((s) => {
    out += s;
  }));
  System.setErr(new PrintStream((s) => {
    err += s;
  }));
  try {
    return [fn(), out, err];
  } finally {
    System.setOut(saved[0]);
    System.setErr(saved[1]);
  }
}

describe('CommandLine', () => {
  test('builder', () => {
    const cmd = CommandLine.builder().addArg('foo').addArg('bar').addOption(Option.builder('T').get()).addArg(null).get();
    assert.deepEqual(cmd.getArgs(), ['foo', 'bar']);
    assert.equal(cmd.hasOption('T'), true);
  });

  test('option properties', () => {
    const options = new Options().addOption(Option.builder('D').valueSeparator().numberOfArgs(2).get());
    const cl = new DefaultParser().parse(options, ['-Dparam1=value1', '-Dparam2=value2', '-Dparam3', '-Dparam4=value4', '-D', '--property', 'foo=bar']);
    const props = cl.getOptionProperties('D');
    assert.equal(props.getProperty('param1'), 'value1');
    assert.equal(props.getProperty('param3'), 'true');
    assert.equal(props.getProperty('param4'), 'value4');
    assert.equal(cl.getOptionProperties(options.getOption('D')).getProperty('param2'), 'value2');
  });

  test('option values with defaults and suppliers', () => {
    const cl = new DefaultParser().parse(new Options().addOption('a', true, 'a'), ['-a', 'x']);
    assert.equal(cl.getOptionValue('a', 'dflt'), 'x');
    assert.equal(cl.getOptionValue('b', 'dflt'), 'dflt');
    assert.equal(cl.getOptionValue('b', () => 'supplied'), 'supplied');
    assert.equal(cl.getOptionValue('b', null), null);
    assert.equal(cl.getOptionCount('a'), 1);
  });

  test('option groups', () => {
    const group = new OptionGroup().addOption(new Option('a', true, 'a')).addOption(new Option('b', true, 'b'));
    const options = new Options().addOptionGroup(group);
    const cl = new DefaultParser().parse(options, ['-b', 'bee']);
    assert.equal(cl.hasOption(group), true);
    assert.equal(cl.getOptionValue(group), 'bee');
    assert.deepEqual(cl.getOptionValues(group), ['bee']);
    assert.equal(cl.getParsedOptionValue(group), 'bee');
    assert.equal(cl.getOptionValue(new OptionGroup(), 'none'), 'none');
  });

  test('parsed values of typed options', () => {
    const options = new Options()
      .addOption(Option.builder('i').hasArg().type(Types.INTEGER).get())
      .addOption(Option.builder('n').hasArgs().type(Types.NUMBER).get())
      .addOption(Option.builder('f').hasArg().type(Types.FILE).get());
    const cl = new DefaultParser().parse(options, ['-i', '1', '-n', '2', '-n', '3.5', '-f', 'a//b/']);
    const i = cl.getParsedOptionValue('i');
    assert.equal(i.getClass().getName(), 'java.lang.Integer');
    assert.equal(i.toString(), '1');
    const values = cl.getParsedOptionValues('n');
    assert.equal(values.getClass().getName(), '[Ljava.lang.Number;');
    assert.deepEqual(values.items.map((v) => [v.getClass().getName(), v.toString()]), [['java.lang.Long', '2'], ['java.lang.Double', '3.5']]);
    assert.equal(cl.getParsedOptionValue('f').toString(), 'a/b');
  });

  test('conversion failures become ParseExceptions', () => {
    const options = new Options().addOption(Option.builder('i').hasArg().type(Types.INTEGER).get());
    const cl = new DefaultParser().parse(options, ['-i', 'foo']);
    assert.throws(() => cl.getParsedOptionValue('i'), (e) => e instanceof ParseException
      && e.getMessage() === 'java.lang.NumberFormatException: For input string: "foo"');
    const [value, , err] = capture(() => cl.getOptionObject('i'));
    assert.equal(value, null);
    assert.equal(err, 'Exception found converting i to desired type: java.lang.NumberFormatException: For input string: "foo"\n');
  });

  test('deprecated options print a notice by default', () => {
    const options = new Options().addOption(Option.builder('d').longOpt('dep').deprecated().get());
    const [result, out] = capture(() => new DefaultParser().parse(options, ['-d']).hasOption('dep'));
    assert.equal(result, true);
    assert.equal(out, "Option 'd''dep': Deprecated\n");
  });
});

describe('TypeHandler', () => {
  const create = (s, type) => TypeHandler.createValue(s, type).toString();

  test('numbers', () => {
    assert.equal(TypeHandler.createNumber('5').getClass().getName(), 'java.lang.Long');
    assert.equal(create('1.5', Types.NUMBER), '1.5');
    assert.equal(create('1e10', Types.DOUBLE), '1.0E10');
    assert.equal(create('100', Types.DOUBLE), '100.0');
    assert.equal(create('0.001', Types.DOUBLE), '0.001');
    assert.equal(create('0.0001', Types.DOUBLE), '1.0E-4');
    assert.equal(create('1e-400', Types.DOUBLE), '0.0');
    assert.equal(create('4.9e-324', Types.DOUBLE), '4.9E-324');
    assert.equal(create('0.1', Types.FLOAT), '0.1');
    assert.equal(create('١٢', Types.INTEGER), '12');
    assert.equal(create('-0x1.8p1', Types.DOUBLE), '-3.0');
    assert.throws(() => create('1.2.3', Types.DOUBLE), { message: 'java.lang.NumberFormatException: multiple points' });
    assert.throws(() => create('40000', Types.SHORT), { message: 'java.lang.NumberFormatException: Value out of range. Value:"40000" Radix:10' });
  });

  test('big numbers', () => {
    assert.equal(create('-000123456789012345678901234567890', Types.BIG_INTEGER), '-123456789012345678901234567890');
    assert.equal(create('1E+3', Types.BIG_DECIMAL), '1E+3');
    assert.equal(create('0.0000001', Types.BIG_DECIMAL), '1E-7');
    assert.equal(create('-12.50', Types.BIG_DECIMAL), '-12.50');
    assert.throws(() => create('1-1', Types.BIG_INTEGER), { message: 'java.lang.NumberFormatException: Illegal embedded sign character' });
  });

  test('characters', () => {
    assert.equal(create('a', Types.CHARACTER), 'a');
    assert.equal(create('\\u0041', Types.CHARACTER), 'A');
    assert.throws(() => create('\\u110000', Types.CHARACTER), { message: 'java.lang.IllegalArgumentException: Not a valid Unicode code point: 0x110000' });
  });

  test('files, paths, URLs and dates', () => {
    assert.equal(create('a//b/', Types.FILE), 'a/b');
    assert.equal(TypeHandler.createValue('//a//', Types.PATH).getClass().getName(), 'sun.nio.fs.UnixPath');
    assert.equal(create('//a//', Types.PATH), '/a');
    assert.equal(create('HTTP://Host:80/p?q#r', Types.URL), 'http://Host:80/p?q#r');
    assert.throws(() => create('foo', Types.URL), { message: 'java.net.MalformedURLException: no protocol: foo' });
    assert.equal(create('Thu Jun 06 17:48:57 EDT 2002', Types.DATE), 'Thu Jun 06 21:48:57 UTC 2002');
    assert.throws(() => TypeHandler.createDate('x'), { message: 'org.apache.commons.cli.ParseException: java.text.ParseException: Unparseable date: "x"' });
  });

  test('openFile opens a file as new FileInputStream does', () => {
    const stream = TypeHandler.openFile(import.meta.filename);
    assert.equal(stream.getClass().getName(), 'java.io.FileInputStream');
    stream.close();
    const failure = (name, reason) => ({ message: `java.io.FileNotFoundException: ${name} (${reason})` });
    assert.throws(() => TypeHandler.openFile('no//such-file/'), failure('no/such-file', 'No such file or directory'));
    assert.throws(() => TypeHandler.openFile(import.meta.dirname), failure(import.meta.dirname, 'Is a directory'));
    assert.throws(() => TypeHandler.openFile(`${import.meta.filename}/x`), failure(`${import.meta.filename}/x`, 'Not a directory'));
    assert.throws(() => TypeHandler.openFile('a\u0000b'), { message: 'java.io.FileNotFoundException: Invalid file path' });
  });

  test('unknown classes use the default converter', () => {
    assert.equal(TypeHandler.createValue('x', Types.STRING_BUILDER), 'x');
    assert.throws(() => TypeHandler.createFiles('x'), { message: 'Not yet implemented' });
  });

  test('custom converter maps', () => {
    const handler = new TypeHandler(new Map([[Types.INTEGER, Converter.NUMBER]]));
    assert.equal(handler.getConverter(Types.INTEGER)('7').getClass().getName(), 'java.lang.Long');
    assert.equal(handler.getConverter(Types.LONG), Converter.DEFAULT);
  });
});
