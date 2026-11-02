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

// Ported from the tests of the help package: HelpFormatterTest, OptionFormatterTest, TextHelpAppendableTest,
// TextStyleTests and UtilTest.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { Option, OptionGroup, Options } from '../lib/index.js';
import { HelpFormatter, OptionFormatter, TableDefinition, TextHelpAppendable, TextStyle } from '../lib/help/index.js';
import { indexOfNonWhitespace, rtrim } from '../lib/help/util.js';
import { StringBuilder } from '../lib/java/system.js';

function sampleOptions() {
  const group = new OptionGroup().addOption(new Option('c', 'ccc', false, 'c')).addOption(new Option('d', null, false, 'd'));
  return new Options()
    .addOption(Option.builder('a').longOpt('aaa').desc('aaaa aaaa aaaa').since('1.3').get())
    .addOption(Option.builder('b').longOpt('bbb').hasArg().desc('bbbbb bbbb bbb bb b bbbbb bbb bbbbbbb bbbbbbbbbb bbbbbbb').get())
    .addOptionGroup(group);
}

function formatter(builder = HelpFormatter.builder(), appendable = {}) {
  const sb = new StringBuilder();
  const text = new TextHelpAppendable(sb);
  if (appendable.maxWidth !== undefined) {
    text.setMaxWidth(appendable.maxWidth);
  }
  return [builder.setHelpAppendable(text).get(), sb];
}

describe('help.HelpFormatter', () => {
  test('printHelp with automatic usage', () => {
    const [hf, sb] = formatter();
    hf.printHelp('commandSyntax', 'header', sampleOptions(), 'footer', true);
    assert.equal(sb.toString(), [
      ' usage:  commandSyntax [-a] [-b <arg>] [-c | -d]',
      '',
      ' header',
      '',
      '     Options         Since                     Description                 ',
      ' -a, --aaa            1.3      aaaa aaaa aaaa                              ',
      ' -b, --bbb <arg>      --       bbbbb bbbb bbb bb b bbbbb bbb bbbbbbb       ',
      '                                bbbbbbbbbb bbbbbbb                         ',
      ' -c, --ccc            --       c                                           ',
      ' -d                   --       d                                           ',
      '',
      ' footer',
      '',
      ''
    ].join('\n'));
  });

  test('printOptions without since, scaled to the width', () => {
    const [hf, sb] = formatter(HelpFormatter.builder().setShowSince(false), { maxWidth: 40 });
    const options = sampleOptions();
    hf.printOptions(options);
    assert.equal(hf.toSyntaxOptions(options), '[-a] [-b <arg>] [-c | -d]');
    assert.equal(sb.toString(), [
      '     Options             Description     ',
      ' -a, --aaa           aaaa aaaa aaaa      ',
      ' -b, --bbb <arg>     bbbbb bbbb bbb bb b ',
      '                      bbbbb bbb bbbbbbb  ',
      '                      bbbbbbbbbb bbbbbbb ',
      ' -c, --ccc           c                   ',
      ' -d                  d                   ',
      '',
      ''
    ].join('\n'));
  });

  test('sort and syntax prefix', () => {
    const [hf] = formatter();
    assert.deepEqual(hf.sort(sampleOptions()).map((o) => o.getKey()), ['a', 'b', 'c', 'd']);
    assert.deepEqual(hf.sort(null), []);
    hf.setSyntaxPrefix('Usage:');
    assert.equal(hf.getSyntaxPrefix(), 'Usage:');
    assert.throws(() => hf.printHelp('', null, new Options(), null, false), { message: 'cmdLineSyntax not provided' });
  });
});

describe('OptionFormatter', () => {
  test('names, argument and syntax', () => {
    const option = Option.builder('o').longOpt('opt').hasArg().argName('value').get();
    const f = OptionFormatter.from(option);
    assert.equal(f.getBothOpt(), '-o, --opt');
    assert.equal(f.getArgName(), '<value>');
    assert.equal(f.toSyntaxOption(), '[-o <value>]');
    assert.equal(f.toSyntaxOption(true), '-o <value>');
    assert.equal(f.getSince(), '--');
  });

  test('builder settings and the copy constructor', () => {
    const builder = OptionFormatter.builder().setOptPrefix('/').setLongOptPrefix('-').setOptSeparator(' | ')
      .setArgumentNameDelimiters('{', '}').setOptionalDelimiters('(', ')');
    const option = Option.builder('o').longOpt('opt').hasArg().get();
    const f = builder.build(option);
    assert.equal(f.getBothOpt(), '/o | -opt');
    assert.equal(f.toSyntaxOption(), '(/o {arg})');
    assert.equal(builder.toArgName('x'), '{x}');
    // a copy keeps the original's syntax function; its own default one sees the null separator the copy leaves
    assert.equal(new OptionFormatter.Builder(f).build(option).toSyntaxOption(), '(/o {arg})');
    assert.equal(new OptionFormatter.Builder(f).setSyntaxFormatFunction(null).build(option).toSyntaxOption(), '(/onull{arg})');
  });

  test('deprecated descriptions', () => {
    const option = Option.builder('d').desc('old').deprecated().get();
    assert.equal(OptionFormatter.from(option).getDescription(), 'old');
    const builder = OptionFormatter.builder().setDeprecatedFormatFunction(OptionFormatter.COMPLEX_DEPRECATED_FORMAT);
    assert.equal(builder.build(option).getDescription(), '[Deprecated] old');
  });
});

describe('TextHelpAppendable', () => {
  test('paragraphs, lists, headers and titles', () => {
    const sb = new StringBuilder();
    const out = new TextHelpAppendable(sb);
    out.setMaxWidth(20);
    out.appendParagraph('The quick brown fox jumps over the lazy dog');
    out.appendList(true, ['one', 'two three four five six seven']);
    out.appendHeader(2, 'Head');
    out.appendTitle('Title');
    assert.equal(sb.toString(), ' The quick brown fox\n    jumps over the\n    lazy dog\n\n  1. one\n  2. two three four\n        five six\n'
      + '        seven\n\n Head\n %%%%\n\n Title\n #####\n\n');
    assert.throws(() => out.appendHeader(0, 'x'), { message: 'level must be at least 1' });
  });

  test('indexOfWrap', () => {
    assert.equal(TextHelpAppendable.indexOfWrap('Hello World', 5, 0), 5);
    assert.equal(TextHelpAppendable.indexOfWrap('Hello\tWorld', 8, 0), 5);
    assert.equal(TextHelpAppendable.indexOfWrap('Hello\u000eWorld', 8, 0), 5);
    assert.equal(TextHelpAppendable.indexOfWrap('Hello', 10, 0), 5);
    assert.throws(() => TextHelpAppendable.indexOfWrap('x', 0, 0), { message: 'Width must be greater than 0' });
  });

  test('tables', () => {
    const sb = new StringBuilder();
    const out = new TextHelpAppendable(sb);
    const style = TextStyle.builder().setMaxWidth(10).get();
    out.appendTable(TableDefinition.from('Caption', [style, style], ['Name', 'Value'], [['a', 'one two three four']]));
    assert.equal(sb.toString(), ' Caption\n\n    Name         Value       \n a         one two three four\n\n');
  });
});

describe('TextStyle and Util', () => {
  test('padding and toString', () => {
    const style = TextStyle.builder().setAlignment(TextStyle.Alignment.CENTER).setMaxWidth(10).setIndent(2).get();
    assert.equal(style.pad(false, 'abc'), '   abc    ');
    assert.equal(style.toString(), 'TextStyle{CENTER, l:0, i:2, true, min:0, max:10}');
    assert.equal(TextStyle.DEFAULT.toString(), 'TextStyle{LEFT, l:0, i:0, true, min:0, max:unset}');
  });

  test('white space helpers', () => {
    assert.equal(indexOfNonWhitespace('   x', 0), 3);
    assert.equal(indexOfNonWhitespace('   ', 0), -1);
    assert.equal(rtrim('x \u000e\t'), 'x');
  });
});
