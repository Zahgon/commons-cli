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
 * Formats the parts of an Option for help output: names with prefixes, argument name, description, syntax.
 *
 * @module help/option-formatter
 */

import { javaString } from '../java/types.js';
import { defaultValue, isEmpty } from './util.js';

const DEFAULT_ARG_NAME = 'arg';
const DEFAULT_OPT_PREFIX = '-';
const DEFAULT_LONG_OPT_PREFIX = '--';
const DEFAULT_OPT_SEPARATOR = ', ';
const DEFAULT_OPT_ARG_SEPARATOR = ' ';

/** The deprecated description formats. */
const SIMPLE_DEPRECATED_FORMAT = (o) => `[Deprecated] ${defaultValue(o.getDescription(), '')}`;

const COMPLEX_DEPRECATED_FORMAT = (o) => {
  let sb = '[Deprecated';
  const attr = o.getDeprecated();
  if (attr.isForRemoval()) {
    sb += ' for removal';
  }
  if (!isEmpty(attr.getSince())) {
    sb += ` since ${attr.getSince()}`;
  }
  if (!isEmpty(attr.getDescription())) {
    sb += `. ${attr.getDescription()}`;
  }
  sb += ']';
  if (!isEmpty(o.getDescription())) {
    sb += ` ${o.getDescription()}`;
  }
  return sb;
};

const NO_DEPRECATED_FORMAT = (o) => defaultValue(o.getDescription(), '');

/** Formats one option. */
export class OptionFormatter {
  static DEFAULT_ARG_NAME = DEFAULT_ARG_NAME;
  static DEFAULT_SYNTAX_PREFIX = 'usage: ';
  static DEFAULT_OPT_PREFIX = DEFAULT_OPT_PREFIX;
  static DEFAULT_LONG_OPT_PREFIX = DEFAULT_LONG_OPT_PREFIX;
  static DEFAULT_OPT_SEPARATOR = DEFAULT_OPT_SEPARATOR;
  static DEFAULT_OPT_ARG_SEPARATOR = DEFAULT_OPT_ARG_SEPARATOR;
  static SIMPLE_DEPRECATED_FORMAT = SIMPLE_DEPRECATED_FORMAT;
  static COMPLEX_DEPRECATED_FORMAT = COMPLEX_DEPRECATED_FORMAT;
  static NO_DEPRECATED_FORMAT = NO_DEPRECATED_FORMAT;

  /**
   * Builds OptionFormatters. new Builder(formatter) copies a formatter's settings, except its option-to-argument
   * separator, which the copy leaves null (as the original does).
   */
  static Builder = class Builder {
    constructor(optionFormatter) {
      if (optionFormatter === undefined) {
        this.argNameDelimiters = ['<', '>'];
        this.defaultArgName = DEFAULT_ARG_NAME;
        this.deprecatedFormatFunction = NO_DEPRECATED_FORMAT;
        this.longOptPrefix = DEFAULT_LONG_OPT_PREFIX;
        this.optPrefix = DEFAULT_OPT_PREFIX;
        this.optSeparator = DEFAULT_OPT_SEPARATOR;
        this.optArgSeparator = DEFAULT_OPT_ARG_SEPARATOR;
        this.optionalDelimiters = ['[', ']'];
        this.syntaxFormatFunction = null;
        return;
      }
      this.optionalDelimiters = [...optionFormatter.optionalDelimiters];
      this.argNameDelimiters = [...optionFormatter.argNameDelimiters];
      this.defaultArgName = optionFormatter.defaultArgName;
      this.optPrefix = optionFormatter.optPrefix;
      this.longOptPrefix = optionFormatter.longOptPrefix;
      this.optSeparator = optionFormatter.optSeparator;
      this.optArgSeparator = null;
      this.deprecatedFormatFunction = optionFormatter.deprecatedFormatFunction;
      this.syntaxFormatFunction = optionFormatter.syntaxFormatFunction;
    }

    build(option) {
      return new OptionFormatter(option, this);
    }

    get() {
      return null;
    }

    setArgumentNameDelimiters(begin, end) {
      this.argNameDelimiters[0] = defaultValue(begin, '');
      this.argNameDelimiters[1] = defaultValue(end, '');
      return this;
    }

    setDefaultArgName(name) {
      this.defaultArgName = defaultValue(name, DEFAULT_ARG_NAME);
      return this;
    }

    setDeprecatedFormatFunction(deprecatedFormatFunction) {
      this.deprecatedFormatFunction = deprecatedFormatFunction;
      return this;
    }

    setLongOptPrefix(prefix) {
      this.longOptPrefix = defaultValue(prefix, '');
      return this;
    }

    setOptArgSeparator(optArgSeparator) {
      this.optArgSeparator = defaultValue(optArgSeparator, '');
      return this;
    }

    setOptionalDelimiters(begin, end) {
      this.optionalDelimiters[0] = defaultValue(begin, '');
      this.optionalDelimiters[1] = defaultValue(end, '');
      return this;
    }

    setOptPrefix(optPrefix) {
      this.optPrefix = defaultValue(optPrefix, '');
      return this;
    }

    setOptSeparator(optSeparator) {
      this.optSeparator = defaultValue(optSeparator, '');
      return this;
    }

    /** Sets the function (formatter, required) => syntax text, or null for the default. */
    setSyntaxFormatFunction(syntaxFormatFunction) {
      this.syntaxFormatFunction = syntaxFormatFunction;
      return this;
    }

    /** An argument name between the argument name delimiters. */
    toArgName(argName) {
      return this.argNameDelimiters[0] + defaultValue(argName, '') + this.argNameDelimiters[1];
    }
  };

  static builder() {
    return new OptionFormatter.Builder();
  }

  static from(option) {
    return new OptionFormatter.Builder().build(option);
  }

  constructor(option, builder) {
    this.optionalDelimiters = builder.optionalDelimiters;
    this.argNameDelimiters = builder.argNameDelimiters;
    this.defaultArgName = builder.defaultArgName;
    this.optPrefix = builder.optPrefix;
    this.longOptPrefix = builder.longOptPrefix;
    this.optSeparator = builder.optSeparator;
    this.optArgSeparator = builder.optArgSeparator;
    this.deprecatedFormatFunction = builder.deprecatedFormatFunction;
    this.option = option;
    this.syntaxFormatFunction = builder.syntaxFormatFunction ?? ((o, required) => {
      let buff = javaString(defaultValue(o.getOpt(), o.getLongOpt()));
      const argName = o.getArgName();
      if (!isEmpty(argName)) {
        buff += javaString(this.optArgSeparator) + argName;
      }
      const requiredFlag = required ?? o.isRequired();
      return requiredFlag ? buff : o.toOptional(buff);
    });
  }

  getArgName() {
    return this.option.hasArg()
      ? this.argNameDelimiters[0] + defaultValue(this.option.getArgName(), this.defaultArgName) + this.argNameDelimiters[1] : '';
  }

  /** The short and long names with their prefixes, separated. */
  getBothOpt() {
    const lOpt = this.getLongOpt();
    let sb = this.getOpt();
    if (sb.length > 0 && !isEmpty(lOpt)) {
      sb += this.optSeparator;
    }
    return sb + this.getLongOpt();
  }

  getDescription() {
    return this.option.isDeprecated() ? this.deprecatedFormatFunction(this.option) : defaultValue(this.option.getDescription(), '');
  }

  getLongOpt() {
    return isEmpty(this.option.getLongOpt()) ? '' : this.longOptPrefix + this.option.getLongOpt();
  }

  getOpt() {
    return isEmpty(this.option.getOpt()) ? '' : this.optPrefix + this.option.getOpt();
  }

  getSince() {
    return defaultValue(this.option.getSince(), DEFAULT_LONG_OPT_PREFIX);
  }

  isRequired() {
    return this.option.isRequired();
  }

  /** The text between the optional delimiters, "" for empty text. */
  toOptional(text) {
    if (isEmpty(text)) {
      return '';
    }
    return this.optionalDelimiters[0] + text + this.optionalDelimiters[1];
  }

  /** The option as a usage line shows it; toSyntaxOption() uses the option's own required flag. */
  toSyntaxOption(isRequired = this.isRequired()) {
    return this.syntaxFormatFunction(this, isRequired);
  }
}
