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

// Ported from HelpFormatterTest (the deprecated org.apache.commons.cli.HelpFormatter) and BugCLI162Test.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { DeprecatedAttributes, HelpFormatter, Option, OptionGroup, Options } from '../lib/index.js';
import { format } from '../lib/java/formatter.js';
import { PrintWriter, StringBuilder, StringWriter } from '../lib/java/system.js';

const EOL = '\n';

function printed(fn) {
  const out = new StringWriter();
  fn(new PrintWriter(out));
  return out.toString();
}

describe('HelpFormatter', () => {
  test('accessors', () => {
    const formatter = new HelpFormatter();
    formatter.setArgName('argname');
    assert.equal(formatter.getArgName(), 'argname');
    formatter.setDescPadding(3);
    assert.equal(formatter.getDescPadding(), 3);
    formatter.setLeftPadding(7);
    assert.equal(formatter.getLeftPadding(), 7);
    formatter.setLongOptPrefix('~~');
    assert.equal(formatter.getLongOptPrefix(), '~~');
    formatter.setSyntaxPrefix('-> ');
    assert.equal(formatter.getSyntaxPrefix(), '-> ');
    formatter.setWidth(80);
    assert.equal(formatter.getWidth(), 80);
  });

  test('automatic usage', () => {
    const hf = new HelpFormatter();
    let options = new Options().addOption('a', false, 'aaaa aaaa aaaa aaaa aaaa');
    assert.equal(printed((pw) => hf.printUsage(pw, 60, 'app', options)).trim(), 'usage: app [-a]');
    options = new Options().addOption('a', false, 'aaaa aaaa aaaa aaaa aaaa').addOption('b', false, 'bbb');
    assert.equal(printed((pw) => hf.printUsage(pw, 60, 'app', options)).trim(), 'usage: app [-a] [-b]');
  });

  test('default argument name', () => {
    const options = new Options().addOption(Option.builder('f').hasArg().required(true).get());
    const formatter = new HelpFormatter();
    formatter.setArgName('argument');
    assert.equal(printed((pw) => formatter.printUsage(pw, 80, 'app', options)), `usage: app -f <argument>${EOL}`);
  });

  test('deprecated options in the options table', () => {
    const option = Option.builder('a').longOpt('aaa').desc('dddd dddd dddd')
      .deprecated(DeprecatedAttributes.builder().setForRemoval(true).setSince('now').setDescription('Why why why').get()).get();
    const cases = [
      [HelpFormatter.builder().get(), '[Deprecated] dddd dddd dddd'],
      [HelpFormatter.builder().setShowDeprecated(false).get(), 'dddd dddd dddd'],
      [HelpFormatter.builder().setShowDeprecated(true).get(), '[Deprecated] dddd dddd dddd'],
      [HelpFormatter.builder().setShowDeprecated((o) => format('%s [%s]', HelpFormatter.getDescription(o), o.getDeprecated())).get(),
        'dddd dddd dddd [Deprecated for removal since now: Why why why]']
    ];
    for (const [hf, expected] of cases) {
      const sb = new StringBuilder();
      hf.renderOptions(sb, 160, new Options().addOption(option), 0, 5);
      assert.equal(sb.toString(), `-a,--aaa     ${expected}`);
    }
  });

  test('find wrap position', () => {
    const hf = new HelpFormatter();
    assert.equal(hf.findWrapPos('This is a test.', 8, 0), 7);
    assert.equal(hf.findWrapPos('This is a test.', 8, 8), -1);
    assert.equal(hf.findWrapPos('aaaa aa', 3, 0), 3);
    assert.equal(hf.findWrapPos('aaaaaa aaaaaa', 6, 0), 6);
    assert.equal(hf.findWrapPos('aaaaaa aaaaaa', 6, 7), -1);
    assert.equal(hf.findWrapPos('aaaaaa\n aaaaaa', 6, 0), 7);
    assert.equal(hf.findWrapPos('aaaaaa\t aaaaaa', 6, 0), 7);
  });

  test('a header starting with a line separator', () => {
    const header = `${EOL}Header`;
    const formatter = new HelpFormatter();
    assert.equal(printed((pw) => formatter.printHelpTo(pw, 80, 'foobar', header, new Options(), 2, 2, 'Footer', true)),
      `usage: foobar${EOL}${EOL}Header${EOL}${EOL}Footer${EOL}`);
    const out = new StringWriter();
    HelpFormatter.builder().setPrintWriter(new PrintWriter(out)).get().printHelp('foobar', header, new Options(), 'Footer');
    assert.equal(out.toString(), `usage: foobar${EOL}${EOL}Header${EOL}${EOL}Footer${EOL}`);
  });

  test('long option separator', () => {
    const options = new Options();
    options.addOption('f', true, 'the file');
    options.addOption(Option.builder('s').longOpt('size').desc('the size').hasArg().argName('SIZE').get());
    options.addOption(Option.builder().longOpt('age').desc('the age').hasArg().get());
    const formatter = new HelpFormatter();
    assert.equal(formatter.getLongOptSeparator(), ' ');
    formatter.setLongOptSeparator('=');
    assert.equal(printed((pw) => formatter.printHelpTo(pw, 80, 'create', 'header', options, 2, 2, 'footer')),
      `usage: create${EOL}header${EOL}     --age=<arg>    the age${EOL}  -f <arg>          the file${EOL}`
      + `  -s,--size=<SIZE>  the size${EOL}footer${EOL}`);
    assert.equal(printed((pw) => formatter.printUsage(pw, 80, 'create', options)),
      `usage: create [--age=<arg>] [-f <arg>] [-s <SIZE>]${EOL}`);
  });

  test('option groups in usage', () => {
    const group = new OptionGroup();
    group.addOption(Option.builder('a').get());
    group.addOption(Option.builder('b').get());
    group.addOption(Option.builder('c').get());
    const options = new Options().addOptionGroup(group);
    assert.equal(printed((pw) => new HelpFormatter().printUsage(pw, 80, 'app', options)), `usage: app [-a | -b | -c]${EOL}`);
    group.setRequired(true);
    const required = new Options().addOptionGroup(group);
    assert.equal(printed((pw) => new HelpFormatter().printUsage(pw, 80, 'app', required)), `usage: app -a | -b | -c${EOL}`);
  });

  test('custom comparator orders the usage', () => {
    const options = new Options().addOption('a', false, 'a').addOption('b', false, 'b').addOption('c', false, 'c');
    const formatter = new HelpFormatter();
    formatter.setOptionComparator((opt1, opt2) => (opt2.getKey() < opt1.getKey() ? -1 : 1));
    assert.equal(printed((pw) => formatter.printUsage(pw, 80, 'app', options)), `usage: app [-c] [-b] [-a]${EOL}`);
  });

  test('render wrapped text', () => {
    const hf = new HelpFormatter();
    const render = (width, tab, text) => hf.renderWrappedText(new StringBuilder(), width, tab, text).toString();
    assert.equal(render(12, 0, 'This is a test.'), `This is a${EOL}test.`);
    assert.equal(render(12, 4, 'This is a test.'), `This is a${EOL}    test.`);
    assert.equal(render(16, 5, 'aaaa aaaa aaaa\naaaaaa\naaaaa'), `aaaa aaaa aaaa${EOL}     aaaaaa${EOL}     aaaaa`);
    assert.equal(render(10, 0, 'aaaaaaaaaaaaaaaaaaa'), `aaaaaaaaaa${EOL}aaaaaaaaa`);
  });

  test('long lines wrap without a word break (CLI-162)', () => {
    const options = new Options();
    options.addOption('x', 'extralongarg', false,
      'This description is Long.Long.Long.Long.Long.Long.Long.Long.Long.Long.Long.Long.Long.Long.Long.Long.Long.Long.Long.');
    const text = printed((pw) => new HelpFormatter().printHelpTo(pw, 60, 'app', null, options, 1, 3, null));
    assert.equal(text, `usage: app${EOL} -x,--extralongarg   This description is${EOL}`
      + `                     Long.Long.Long.Long.Long.Long.Long.Long${EOL}`
      + `                     .Long.Long.Long.Long.Long.Long.Long.Lon${EOL}`
      + `                     g.Long.Long.Long.${EOL}`);
  });

  test('rtrim uses Character.isWhitespace', () => {
    const hf = new HelpFormatter();
    assert.equal(hf.rtrim('  foo  bar  '), '  foo  bar');
    assert.equal(hf.rtrim('x\u001c  '), 'x');
    assert.equal(hf.rtrim('x '), 'x ');
  });

  test('empty syntax is rejected', () => {
    assert.throws(() => new HelpFormatter().printHelp(null, new Options()), { message: 'cmdLineSyntax not provided' });
    assert.throws(() => new HelpFormatter().printHelp('', new Options()), { message: 'cmdLineSyntax not provided' });
  });
});
