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
 * The deprecated help formatter: usage lines, wrapped text and the table of options.
 *
 * @deprecated use help/HelpFormatter
 * @module help-formatter
 */

import { IllegalArgumentException, NegativeArraySizeException, requireNonNull } from './java/errors.js';
import { isWhitespace } from './java/character.js';
import { compareToIgnoreCase, trim } from './java/string.js';
import { LINE_SEPARATOR, PrintWriter, StringBuilder, System } from './java/system.js';
import { DEFAULT_LONG_OPT_PREFIX, DEFAULT_OPT_PREFIX, isEmpty } from './util.js';

const HEADER_OPTIONS = 'Options';
const HEADER_SINCE = 'Since';
const HEADER_DESCRIPTION = 'Description';

/** The separator between the options of a group in a usage line. */
const OPTION_GROUP_SEPARATOR = ' | ';

/** Orders options by key, ignoring case. */
const OPTION_COMPARATOR = (opt1, opt2) => compareToIgnoreCase(opt1.getKey(), opt2.getKey());

function getDescription(option) {
  return option.getDescription() ?? '';
}

const DEFAULT_DEPRECATED_FORMAT = (o) => `[Deprecated] ${getDescription(o)}`;

/** BufferedReader.readLine over a string: lines end at "\n", "\r" or "\r\n". */
function readLines(text) {
  const lines = [];
  let i = 0;
  while (i < text.length) {
    let j = i;
    while (j < text.length && text[j] !== '\n' && text[j] !== '\r') {
      j++;
    }
    lines.push(text.slice(i, j));
    if (j < text.length && text[j] === '\r' && text[j + 1] === '\n') {
      j++;
    }
    i = j + 1;
  }
  return lines;
}

/** Formats help text for Options. */
export class HelpFormatter {
  static DEFAULT_WIDTH = 74;
  static DEFAULT_LEFT_PAD = 1;
  static DEFAULT_DESC_PAD = 3;
  static DEFAULT_SYNTAX_PREFIX = 'usage: ';
  static DEFAULT_OPT_PREFIX = DEFAULT_OPT_PREFIX;
  static DEFAULT_LONG_OPT_PREFIX = DEFAULT_LONG_OPT_PREFIX;
  static DEFAULT_LONG_OPT_SEPARATOR = ' ';
  static DEFAULT_ARG_NAME = 'arg';

  /** Builds a HelpFormatter; unlike new HelpFormatter(), it shows deprecated options by default. */
  static Builder = class Builder {
    constructor() {
      this.deprecatedFormatFunction = DEFAULT_DEPRECATED_FORMAT;
      this.printWriter = new PrintWriter(System.out);
      this.showSince = false;
    }

    get() {
      return new HelpFormatter(this.deprecatedFormatFunction, this.printWriter, this.showSince);
    }

    setPrintWriter(printWriter) {
      this.printWriter = requireNonNull(printWriter, 'printWriter');
      return this;
    }

    /** true for the default "[Deprecated] description" format, false for none, or a function of the option. */
    setShowDeprecated(format) {
      this.deprecatedFormatFunction = typeof format === 'boolean' ? (format ? DEFAULT_DEPRECATED_FORMAT : null) : format;
      return this;
    }

    setShowSince(showSince) {
      this.showSince = showSince;
      return this;
    }
  };

  static builder() {
    return new HelpFormatter.Builder();
  }

  /** The description of an option, "" when it has none. */
  static getDescription(option) {
    return getDescription(option);
  }

  /** Builds a formatter with the default layout settings. */
  constructor(deprecatedFormatFunction = null, printWriter = new PrintWriter(System.out), showSince = false) {
    this.defaultWidth = HelpFormatter.DEFAULT_WIDTH;
    this.defaultLeftPad = HelpFormatter.DEFAULT_LEFT_PAD;
    this.defaultDescPad = HelpFormatter.DEFAULT_DESC_PAD;
    this.defaultSyntaxPrefix = HelpFormatter.DEFAULT_SYNTAX_PREFIX;
    this.defaultNewLine = LINE_SEPARATOR;
    this.defaultOptPrefix = DEFAULT_OPT_PREFIX;
    this.defaultLongOptPrefix = DEFAULT_LONG_OPT_PREFIX;
    this.defaultArgName = HelpFormatter.DEFAULT_ARG_NAME;
    this.optionComparator = OPTION_COMPARATOR;
    this.deprecatedFormatFunction = deprecatedFormatFunction;
    this.printWriter = printWriter;
    this.showSince = showSince;
    this.longOptSeparator = HelpFormatter.DEFAULT_LONG_OPT_SEPARATOR;
  }

  appendOption(buff, option, required) {
    let s = required ? '' : '[';
    s += option.getOpt() != null ? DEFAULT_OPT_PREFIX + option.getOpt() : `${DEFAULT_LONG_OPT_PREFIX}${option.getLongOpt()}`;
    if (option.hasArg() && (option.getArgName() == null || option.getArgName().length > 0)) {
      s += option.getOpt() == null ? this.longOptSeparator : ' ';
      s += `<${option.getArgName() ?? this.getArgName()}>`;
    }
    return buff + s + (required ? '' : ']');
  }

  /** Appends the options of a group, in comparator order, in brackets unless the group is required. */
  appendOptionGroup(buff, optionGroup) {
    let s = optionGroup.isRequired() ? buff : `${buff}[`;
    const optList = [...optionGroup.getOptions()];
    if (this.getOptionComparator() != null) {
      optList.sort(this.getOptionComparator());
    }
    optList.forEach((option, i) => {
      s = this.appendOption(s, option, true);
      if (i < optList.length - 1) {
        s += OPTION_GROUP_SEPARATOR;
      }
    });
    return optionGroup.isRequired() ? s : `${s}]`;
  }

  /** The table of options, wrapped to width, appended to a buffer (a StringBuilder or anything with append). */
  appendOptions(sb, width, options, leftPad, descPad) {
    const lpad = this.createPadding(leftPad);
    const dpad = this.createPadding(descPad);
    let max = 0;
    const maxSince = this.showSince ? this.determineMaxSinceLength(options) + leftPad : 0;
    const prefixList = [];
    const optList = options.helpOptions();
    if (this.getOptionComparator() != null) {
      optList.sort(this.getOptionComparator());
    }
    for (const option of optList) {
      let optBuf;
      if (option.getOpt() == null) {
        optBuf = `${lpad}   ${this.getLongOptPrefix()}${option.getLongOpt()}`;
      } else {
        optBuf = `${lpad}${this.getOptPrefix()}${option.getOpt()}`;
        if (option.hasLongOpt()) {
          optBuf += `,${this.getLongOptPrefix()}${option.getLongOpt()}`;
        }
      }
      if (option.hasArg()) {
        const argName = option.getArgName();
        if (argName != null && argName.length === 0) {
          optBuf += ' ';
        } else {
          optBuf += option.hasLongOpt() ? this.longOptSeparator : ' ';
          optBuf += `<${argName != null ? option.getArgName() : this.getArgName()}>`;
        }
      }
      prefixList.push(optBuf);
      max = Math.max(optBuf.length + maxSince, max);
    }
    const nextLineTabStop = max + descPad;
    if (this.showSince) {
      let optHeader = HEADER_OPTIONS + this.createPadding(max - maxSince - HEADER_OPTIONS.length + leftPad) + HEADER_SINCE;
      optHeader += this.createPadding(max - optHeader.length) + lpad + HEADER_DESCRIPTION;
      this.appendWrappedText(sb, width, nextLineTabStop, optHeader);
      sb.append(this.getNewLine());
    }
    optList.forEach((option, x) => {
      let optBuf = prefixList[x];
      if (optBuf.length < max) {
        optBuf += this.createPadding(max - maxSince - optBuf.length);
        if (this.showSince) {
          optBuf += lpad + (option.getSince() ?? DEFAULT_OPT_PREFIX);
        }
        optBuf += this.createPadding(max - optBuf.length);
      }
      optBuf += dpad;
      if (this.deprecatedFormatFunction != null && option.isDeprecated()) {
        optBuf += trim(this.deprecatedFormatFunction(option));
      } else if (option.getDescription() != null) {
        optBuf += option.getDescription();
      }
      this.appendWrappedText(sb, width, nextLineTabStop, optBuf);
      if (x < optList.length - 1) {
        sb.append(this.getNewLine());
      }
    });
    return sb;
  }

  /** Text wrapped to width; lines after the first start at nextLineTabStop. */
  appendWrappedText(appendable, width, nextLineTabStop, text) {
    if (width <= 0) {
      return appendable;
    }
    let render = text;
    let nextLineTabStopPos = nextLineTabStop;
    let pos = this.findWrapPos(render, width, 0);
    if (pos === -1) {
      appendable.append(this.rtrim(render));
      return appendable;
    }
    appendable.append(this.rtrim(render.slice(0, pos))).append(this.getNewLine());
    if (nextLineTabStopPos >= width) {
      nextLineTabStopPos = 1;
    }
    const padding = this.createPadding(nextLineTabStopPos);
    for (;;) {
      render = padding + trim(render.slice(pos));
      pos = this.findWrapPos(render, width, 0);
      if (pos === -1) {
        appendable.append(render);
        return appendable;
      }
      if (render.length > width && pos === nextLineTabStopPos - 1) {
        pos = width;
      }
      appendable.append(this.rtrim(render.slice(0, pos))).append(this.getNewLine());
    }
  }

  /** A string of len spaces. */
  createPadding(len) {
    if (len < 0) {
      throw new NegativeArraySizeException(String(len));
    }
    return ' '.repeat(len);
  }

  determineMaxSinceLength(options) {
    const minLen = HEADER_SINCE.length;
    const lengths = options.getOptions().map((o) => (o.getSince() == null ? minLen : o.getSince().length));
    const len = lengths.length === 0 ? minLen : Math.max(...lengths);
    return len < minLen ? minLen : len;
  }

  /** The position to wrap text at, or -1 when the rest fits. */
  findWrapPos(text, width, startPos) {
    let pos = text.indexOf('\n', startPos);
    if (pos !== -1 && pos <= width) {
      return pos + 1;
    }
    pos = text.indexOf('\t', startPos);
    if (pos !== -1 && pos <= width) {
      return pos + 1;
    }
    if (startPos + width >= text.length) {
      return -1;
    }
    for (pos = startPos + width; pos >= startPos; --pos) {
      const c = text[pos];
      if (c === ' ' || c === '\n' || c === '\r') {
        break;
      }
    }
    if (pos > startPos) {
      return pos;
    }
    pos = startPos + width;
    return pos === text.length ? -1 : pos;
  }

  getArgName() {
    return this.defaultArgName;
  }

  getDescPadding() {
    return this.defaultDescPad;
  }

  getLeftPadding() {
    return this.defaultLeftPad;
  }

  getLongOptPrefix() {
    return this.defaultLongOptPrefix;
  }

  getLongOptSeparator() {
    return this.longOptSeparator;
  }

  getNewLine() {
    return this.defaultNewLine;
  }

  getOptionComparator() {
    return this.optionComparator;
  }

  getOptPrefix() {
    return this.defaultOptPrefix;
  }

  getSyntaxPrefix() {
    return this.defaultSyntaxPrefix;
  }

  getWidth() {
    return this.defaultWidth;
  }

  /**
   * Prints help to the formatter's print writer: printHelp(cmdLineSyntax, options[, autoUsage]),
   * printHelp(cmdLineSyntax, header, options, footer[, autoUsage]) or
   * printHelp(width, cmdLineSyntax, header, options, footer[, autoUsage]).
   */
  printHelp(...args) {
    let width = this.getWidth();
    let rest = args;
    if (typeof args[0] === 'number') {
      [width, ...rest] = args;
    }
    let [cmdLineSyntax, header, options, footer, autoUsage] = [rest[0], null, null, null, false];
    if (rest.length <= 2 || typeof rest[2] === 'boolean') {
      [cmdLineSyntax, options, autoUsage = false] = rest;
    } else {
      [cmdLineSyntax, header, options, footer, autoUsage = false] = rest;
    }
    const pw = new PrintWriter(this.printWriter);
    this.printHelpTo(pw, width, cmdLineSyntax, header, options, this.getLeftPadding(), this.getDescPadding(), footer, autoUsage);
    pw.flush();
  }

  /** printHelp(pw, width, cmdLineSyntax, header, options, leftPad, descPad, footer[, autoUsage]). */
  printHelpTo(pw, width, cmdLineSyntax, header, options, leftPad, descPad, footer, autoUsage = false) {
    if (isEmpty(cmdLineSyntax)) {
      throw new IllegalArgumentException('cmdLineSyntax not provided');
    }
    if (autoUsage) {
      this.printUsage(pw, width, cmdLineSyntax, options);
    } else {
      this.printUsage(pw, width, cmdLineSyntax);
    }
    if (header != null && header.length > 0) {
      this.printWrapped(pw, width, header);
    }
    this.printOptions(pw, width, options, leftPad, descPad);
    if (footer != null && footer.length > 0) {
      this.printWrapped(pw, width, footer);
    }
  }

  printOptions(pw, width, options, leftPad, descPad) {
    pw.println(this.appendOptions(new StringBuilder(), width, options, leftPad, descPad));
  }

  /** printUsage(pw, width, cmdLineSyntax), or printUsage(pw, width, app, options) built from the options. */
  printUsage(pw, width, cmdLineSyntax, options) {
    if (arguments.length < 4) {
      const argPos = cmdLineSyntax.indexOf(' ') + 1;
      this.printWrapped(pw, width, this.getSyntaxPrefix().length + argPos, this.getSyntaxPrefix() + cmdLineSyntax);
      return;
    }
    let buff = `${this.getSyntaxPrefix()}${cmdLineSyntax} `;
    const processedGroups = [];
    const optList = [...options.getOptions()];
    if (this.getOptionComparator() != null) {
      optList.sort(this.getOptionComparator());
    }
    optList.forEach((option, i) => {
      const group = options.getOptionGroup(option);
      if (group != null) {
        if (!processedGroups.includes(group)) {
          processedGroups.push(group);
          buff = this.appendOptionGroup(buff, group);
        }
      } else {
        buff = this.appendOption(buff, option, option.isRequired());
      }
      if (i < optList.length - 1) {
        buff += ' ';
      }
    });
    this.printWrapped(pw, width, buff.indexOf(' ') + 1, buff);
  }

  /** printWrapped(pw, width, text) or printWrapped(pw, width, nextLineTabStop, text). */
  printWrapped(pw, width, nextLineTabStopOrText, text) {
    if (arguments.length < 4) {
      this.printWrapped(pw, width, 0, nextLineTabStopOrText);
      return;
    }
    pw.println(this.renderWrappedTextBlock(new StringBuilder(), width, nextLineTabStopOrText, text));
  }

  renderOptions(sb, width, options, leftPad, descPad) {
    return this.appendOptions(sb, width, options, leftPad, descPad);
  }

  renderWrappedText(sb, width, nextLineTabStop, text) {
    return this.appendWrappedText(sb, width, nextLineTabStop, text);
  }

  renderWrappedTextBlock(appendable, width, nextLineTabStop, text) {
    readLines(text).forEach((line, i) => {
      if (i > 0) {
        appendable.append(this.getNewLine());
      }
      this.appendWrappedText(appendable, width, nextLineTabStop, line);
    });
    return appendable;
  }

  /** Removes trailing white space (as Character.isWhitespace defines it). */
  rtrim(s) {
    if (isEmpty(s)) {
      return s;
    }
    let pos = s.length;
    while (pos > 0 && isWhitespace(s.charCodeAt(pos - 1))) {
      --pos;
    }
    return s.slice(0, pos);
  }

  setArgName(name) {
    this.defaultArgName = name;
  }

  setDescPadding(padding) {
    this.defaultDescPad = padding;
  }

  setLeftPadding(padding) {
    this.defaultLeftPad = padding;
  }

  setLongOptPrefix(prefix) {
    this.defaultLongOptPrefix = prefix;
  }

  setLongOptSeparator(longOptSeparator) {
    this.longOptSeparator = longOptSeparator;
  }

  setNewLine(newline) {
    this.defaultNewLine = newline;
  }

  setOptionComparator(comparator) {
    this.optionComparator = comparator;
  }

  setOptPrefix(prefix) {
    this.defaultOptPrefix = prefix;
  }

  setSyntaxPrefix(prefix) {
    this.defaultSyntaxPrefix = prefix;
  }

  setWidth(width) {
    this.defaultWidth = width;
  }
}
