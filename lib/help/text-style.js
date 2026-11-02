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
 * How a column of text is laid out: alignment, padding, indentation and width.
 *
 * @module help/text-style
 */

import { repeatSpace } from './util.js';

/** The alignments of text in a column. */
export const Alignment = Object.freeze({ LEFT: 'LEFT', CENTER: 'CENTER', RIGHT: 'RIGHT' });

/** The maximum width of a style that sets none. */
const UNSET_MAX_WIDTH = 2147483647;

/** The layout of a column of text. */
export class TextStyle {
  static Alignment = Alignment;

  static UNSET_MAX_WIDTH = UNSET_MAX_WIDTH;

  /** Builds a TextStyle. */
  static Builder = class Builder {
    constructor() {
      this.alignment = Alignment.LEFT;
      this.leftPad = 0;
      this.indent = 0;
      this.scalable = true;
      this.minWidth = 0;
      this.maxWidth = UNSET_MAX_WIDTH;
    }

    get() {
      return new TextStyle(this);
    }

    getIndent() {
      return this.indent;
    }

    getLeftPad() {
      return this.leftPad;
    }

    getMaxWidth() {
      return this.maxWidth;
    }

    getMinWidth() {
      return this.minWidth;
    }

    isScalable() {
      return this.scalable;
    }

    setAlignment(alignment) {
      this.alignment = alignment;
      return this;
    }

    setIndent(indent) {
      this.indent = indent;
      return this;
    }

    setLeftPad(leftPad) {
      this.leftPad = leftPad;
      return this;
    }

    setMaxWidth(maxWidth) {
      this.maxWidth = maxWidth;
      return this;
    }

    setMinWidth(minWidth) {
      this.minWidth = minWidth;
      return this;
    }

    setScalable(scalable) {
      this.scalable = scalable;
      return this;
    }

    /** Copies every property of a style. */
    setTextStyle(style) {
      this.alignment = style.alignment;
      this.leftPad = style.leftPad;
      this.indent = style.indent;
      this.scalable = style.scalable;
      this.minWidth = style.minWidth;
      this.maxWidth = style.maxWidth;
      return this;
    }
  };

  static builder() {
    return new TextStyle.Builder();
  }

  constructor(builder) {
    this.alignment = builder.alignment;
    this.leftPad = builder.leftPad;
    this.indent = builder.indent;
    this.scalable = builder.scalable;
    this.minWidth = builder.minWidth;
    this.maxWidth = builder.maxWidth;
  }

  getAlignment() {
    return this.alignment;
  }

  getIndent() {
    return this.indent;
  }

  getLeftPad() {
    return this.leftPad;
  }

  getMaxWidth() {
    return this.maxWidth;
  }

  getMinWidth() {
    return this.minWidth;
  }

  isScalable() {
    return this.scalable;
  }

  /** Pads text to the style's width (text at least as long as the width is returned as it is). */
  pad(addIndent, text) {
    if (text.length >= this.maxWidth) {
      return text;
    }
    if (this.alignment == null) {
      throw new TypeError('alignment');
    }
    if (this.alignment === Alignment.CENTER) {
      const padLen = this.maxWidth === UNSET_MAX_WIDTH ? (addIndent ? this.indent : 0) : this.maxWidth - text.length;
      const left = Math.trunc(padLen / 2);
      return repeatSpace(left) + text + repeatSpace(padLen - left);
    }
    let indentPad;
    let rest;
    if (this.maxWidth === UNSET_MAX_WIDTH) {
      indentPad = addIndent ? repeatSpace(this.indent) : '';
      rest = '';
    } else {
      let restLen = this.maxWidth - text.length;
      if (addIndent && restLen > this.indent) {
        indentPad = repeatSpace(this.indent);
        restLen -= this.indent;
      } else {
        indentPad = '';
      }
      rest = repeatSpace(restLen);
    }
    return this.alignment === Alignment.LEFT ? indentPad + text + rest : indentPad + rest + text;
  }

  toString() {
    return `TextStyle{${this.alignment}, l:${this.leftPad}, i:${this.indent}, ${this.scalable}, min:${this.minWidth}, `
      + `max:${this.maxWidth === UNSET_MAX_WIDTH ? 'unset' : this.maxWidth}}`;
  }
}

/** The style of a new TextStyle.Builder. */
TextStyle.DEFAULT = TextStyle.builder().get();
