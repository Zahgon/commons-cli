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
 * Help output as plain text: HelpAppendable (the operations every help output offers), FilterHelpAppendable (one that
 * writes to an Appendable) and TextHelpAppendable (wrapped paragraphs, lists, headings and tables).
 *
 * @module help/text-help-appendable
 */

import { IllegalArgumentException, StringIndexOutOfBoundsException } from '../java/errors.js';
import { format } from '../java/formatter.js';
import { JavaInteger } from '../java/primitives.js';
import { LINE_SEPARATOR, System } from '../java/system.js';
import { TableDefinition } from './table-definition.js';
import { Alignment, TextStyle } from './text-style.js';
import { defaultValue, indexOfNonWhitespace, isEmpty, isWhitespace, repeat, repeatSpace, rtrim } from './util.js';

/** The operations of help output; subclasses write paragraphs, headers, lists, tables and titles. */
export class HelpAppendable {
  /** Appends String.format(format, args...). */
  appendFormat(fmt, ...args) {
    this.append(format(fmt, ...args));
  }

  /** Appends String.format(format, args...) as a paragraph. */
  appendParagraphFormat(fmt, ...args) {
    this.appendParagraph(format(fmt, ...args));
  }
}

/** A HelpAppendable that writes to another Appendable. */
export class FilterHelpAppendable extends HelpAppendable {
  constructor(output) {
    super();
    this.output = output;
  }

  /** append(char), append(text) or append(text, start, end). */
  append(text, start, end) {
    if (start === undefined) {
      this.output.append(text);
    } else {
      this.output.append(text, start, end);
    }
    return this;
  }
}

/**
 * The characters TextHelpAppendable breaks lines at; the original builds the set with (char) casts of
 * Character.LINE_SEPARATOR and PARAGRAPH_SEPARATOR, which are category numbers, so it holds U+000D and U+000E.
 */
const BREAK_CHAR_SET = new Set([0x9, 0xa, 0xc, 0xd, 0xd, 0xe, 0xb, 0x1c, 0x1d, 0x1e, 0x1f]);

const BLANK_LINE = '';

/** Writes help as wrapped plain text. */
export class TextHelpAppendable extends FilterHelpAppendable {
  static DEFAULT_WIDTH = 74;
  static DEFAULT_LEFT_PAD = 1;
  static DEFAULT_INDENT = 3;
  static DEFAULT_LIST_INDENT = 7;

  /** The position to break text at, at most width characters after startPos. */
  static indexOfWrap(text, width, startPos) {
    if (width < 1) {
      throw new IllegalArgumentException('Width must be greater than 0');
    }
    const end = (startPos + width) | 0;
    let limit = Math.min(end, text.length);
    for (let idx = startPos; idx < limit; idx++) {
      if (BREAK_CHAR_SET.has(text.charCodeAt(idx))) {
        return idx;
      }
    }
    if (end >= text.length) {
      return text.length;
    }
    limit = Math.min(end, text.length - 1);
    let pos;
    for (pos = limit; pos >= startPos; --pos) {
      if (isWhitespace(text.charCodeAt(pos))) {
        break;
      }
    }
    return pos > startPos ? pos : (limit - 1) | 0;
  }

  /** A TextHelpAppendable that writes to System.out. */
  static systemOut() {
    return new TextHelpAppendable(System.out);
  }

  constructor(output) {
    super(output);
    this.textStyleBuilder = TextStyle.builder().setMaxWidth(TextHelpAppendable.DEFAULT_WIDTH)
      .setLeftPad(TextHelpAppendable.DEFAULT_LEFT_PAD).setIndent(TextHelpAppendable.DEFAULT_INDENT);
  }

  /** Fits the table's columns to the headers, the cells and the maximum width. */
  adjustTableFormat(table) {
    const styleBuilders = [];
    table.columnTextStyles().forEach((style, i) => {
      const builder = TextStyle.builder().setTextStyle(style);
      styleBuilders.push(builder);
      const header = table.headers()[i];
      if (style.getMaxWidth() < header.length || style.getMaxWidth() === TextStyle.UNSET_MAX_WIDTH) {
        builder.setMaxWidth(header.length);
      }
      if (style.getMinWidth() < header.length) {
        builder.setMinWidth(header.length);
      }
      for (const row of table.rows()) {
        const cell = row[i];
        if (cell.length > builder.getMaxWidth()) {
          builder.setMaxWidth(cell.length);
        }
      }
    });
    let calcWidth = 0;
    let adjustedMaxWidth = this.textStyleBuilder.getMaxWidth();
    for (const builder of styleBuilders) {
      adjustedMaxWidth -= builder.getLeftPad();
      if (builder.isScalable()) {
        calcWidth += builder.getMaxWidth();
      } else {
        adjustedMaxWidth -= builder.getMaxWidth();
      }
    }
    adjustedMaxWidth |= 0;
    calcWidth |= 0;
    if (calcWidth > adjustedMaxWidth) {
      const fraction = (adjustedMaxWidth * 1.0) / calcWidth;
      styleBuilders.forEach((builder, i) => {
        if (builder.isScalable()) {
          styleBuilders[i] = this.resize(builder, fraction);
        }
      });
    }
    return TableDefinition.from(table.caption(), styleBuilders.map((b) => b.get()), table.headers(), table.rows());
  }

  appendHeader(level, text) {
    if (!isEmpty(text)) {
      if (level < 1) {
        throw new IllegalArgumentException('level must be at least 1');
      }
      const fillChars = ['=', '%', '+', '_'];
      const idx = Math.min(level, fillChars.length) - 1;
      const style = this.textStyleBuilder.get();
      const queue = this.makeColumnQueue(text, style);
      queue.push(repeatSpace(style.getLeftPad()) + repeat(Math.min(text.length, style.getMaxWidth()), fillChars[idx]));
      queue.push(BLANK_LINE);
      this.printQueue(queue);
    }
  }

  appendList(ordered, list) {
    if (list != null && list.length > 0) {
      const builder = TextStyle.builder().setLeftPad(this.textStyleBuilder.getLeftPad()).setIndent(TextHelpAppendable.DEFAULT_LIST_INDENT);
      let i = 1;
      for (const line of list) {
        const entry = ordered ? format(' %s. %s', new JavaInteger(i++), defaultValue(line, BLANK_LINE))
          : format(' * %s', defaultValue(line, BLANK_LINE));
        builder.setMaxWidth(Math.min(this.textStyleBuilder.getMaxWidth(), entry.length));
        this.printQueue(this.makeColumnQueue(entry, builder.get()));
      }
      this.output.append(LINE_SEPARATOR);
    }
  }

  appendParagraph(paragraph) {
    if (!isEmpty(paragraph)) {
      const queue = this.makeColumnQueue(paragraph, this.textStyleBuilder.get());
      queue.push(BLANK_LINE);
      this.printQueue(queue);
    }
  }

  appendTable(rawTable) {
    const table = this.adjustTableFormat(rawTable);
    this.appendParagraph(table.caption());
    const headerStyles = table.columnTextStyles().map((style) => TextStyle.builder().setTextStyle(style).setAlignment(Alignment.CENTER).get());
    this.writeColumnQueues(this.makeColumnQueues(table.headers(), headerStyles), headerStyles);
    for (const row of table.rows()) {
      this.writeColumnQueues(this.makeColumnQueues(row, table.columnTextStyles()), table.columnTextStyles());
    }
    this.output.append(LINE_SEPARATOR);
  }

  appendTitle(title) {
    if (!isEmpty(title)) {
      const style = this.textStyleBuilder.get();
      const queue = this.makeColumnQueue(title, style);
      queue.push(repeatSpace(style.getLeftPad()) + repeat(Math.min(title.length, style.getMaxWidth()), '#'));
      queue.push(BLANK_LINE);
      this.printQueue(queue);
    }
  }

  getIndent() {
    return this.textStyleBuilder.getIndent();
  }

  getLeftPad() {
    return this.textStyleBuilder.getLeftPad();
  }

  getMaxWidth() {
    return this.textStyleBuilder.getMaxWidth();
  }

  getTextStyleBuilder() {
    return this.textStyleBuilder;
  }

  /** The lines of a column: the text wrapped to the style's width, padded and indented. */
  makeColumnQueue(columnData, style) {
    const lpad = repeatSpace(style.getLeftPad());
    const indent = repeatSpace(style.getIndent());
    const result = [];
    let wrapPos = 0;
    const wrappedMaxWidth = (style.getMaxWidth() - indent.length) | 0;
    while (wrapPos < columnData.length) {
      const workingWidth = wrapPos === 0 ? style.getMaxWidth() : wrappedMaxWidth;
      const lastPos = TextHelpAppendable.indexOfWrap(columnData, workingWidth, wrapPos);
      const working = subSequence(columnData, wrapPos, lastPos);
      result.push(lpad + style.pad(wrapPos > 0, working));
      wrapPos = indexOfNonWhitespace(columnData, lastPos);
      wrapPos = wrapPos === -1 ? lastPos + 1 : wrapPos;
    }
    return result;
  }

  makeColumnQueues(columnData, styles) {
    return columnData.map((data, i) => this.makeColumnQueue(data, styles[i]));
  }

  printQueue(queue) {
    for (const s of queue) {
      this.appendFormat('%s%n', rtrim(s));
    }
  }

  /** printWrapped(text) in the appendable's style, or printWrapped(text, style). */
  printWrapped(text, style = this.textStyleBuilder.get()) {
    this.printQueue(this.makeColumnQueue(text, style));
  }

  /** Scales a style builder's width by fraction (not below its minimum), adjusting the indent. */
  resize(builder, fraction) {
    const indentFrac = (builder.getIndent() * 1.0) / builder.getMaxWidth();
    builder.setMaxWidth(Math.max(toInt(builder.getMaxWidth() * fraction), builder.getMinWidth()));
    const maxAdjust = Math.trunc(builder.getMaxWidth() / 3);
    let newIndent = builder.getMaxWidth() === 1 ? 0 : builder.getIndent();
    if (newIndent > maxAdjust) {
      newIndent = Math.min(toInt(builder.getIndent() * indentFrac), maxAdjust);
    }
    builder.setIndent(newIndent);
    return builder;
  }

  setIndent(indent) {
    this.textStyleBuilder.setIndent(indent);
  }

  setLeftPad(leftPad) {
    this.textStyleBuilder.setLeftPad(leftPad);
  }

  setMaxWidth(maxWidth) {
    this.textStyleBuilder.setMaxWidth(maxWidth);
  }

  /** Writes the columns side by side, line by line, until every queue is empty. */
  writeColumnQueues(columnQueues, styles) {
    let moreData = true;
    const lPad = repeatSpace(this.textStyleBuilder.get().getLeftPad());
    while (moreData) {
      this.output.append(lPad);
      moreData = false;
      columnQueues.forEach((columnQueue, i) => {
        const style = styles[i];
        const line = columnQueue.length > 0 ? columnQueue.shift() : null;
        if (isEmpty(line)) {
          this.output.append(repeatSpace((style.getMaxWidth() + style.getLeftPad()) | 0));
        } else {
          this.output.append(line);
        }
        moreData ||= columnQueue.length > 0;
      });
      this.output.append(LINE_SEPARATOR);
    }
  }
}

/** CharSequence.subSequence(begin, end) with String's bounds check. */
function subSequence(text, begin, end) {
  if (begin < 0 || begin > end || end > text.length) {
    throw new StringIndexOutOfBoundsException(`Range [${begin}, ${end}) out of bounds for length ${text.length}`);
  }
  return text.slice(begin, end);
}

/** A Java (int) cast of a double: truncation, with NaN as 0 and saturation at the int range. */
function toInt(d) {
  if (Number.isNaN(d)) {
    return 0;
  }
  return Math.max(-2147483648, Math.min(2147483647, Math.trunc(d)));
}
