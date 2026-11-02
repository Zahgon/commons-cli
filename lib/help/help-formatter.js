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
 * Help formatters of the help package: AbstractHelpFormatter (usage lines, sorting, option syntax) and HelpFormatter
 * (the options as a table of names, versions and descriptions).
 *
 * @module help/help-formatter
 */

import { IllegalArgumentException, requireNonNull } from '../java/errors.js';
import { compareToIgnoreCase } from '../java/string.js';
import { Options } from '../options.js';
import { OptionFormatter } from './option-formatter.js';
import { TableDefinition } from './table-definition.js';
import { TextHelpAppendable } from './text-help-appendable.js';
import { Alignment, TextStyle } from './text-style.js';
import { defaultValue, isEmpty } from './util.js';

/** Orders options by key, ignoring case. */
export const DEFAULT_COMPARATOR = (opt1, opt2) => compareToIgnoreCase(opt1.getKey(), opt2.getKey());

/** The separator between the options of a group in a usage line. */
export const DEFAULT_OPTION_GROUP_SEPARATOR = ' | ';

/** The prefix of a usage line. */
export const DEFAULT_SYNTAX_PREFIX = 'usage: ';

/** The settings every help formatter shares. */
export class AbstractHelpFormatterBuilder {
  constructor() {
    this.comparator = DEFAULT_COMPARATOR;
    this.helpAppendable = TextHelpAppendable.systemOut();
    this.optionFormatBuilder = OptionFormatter.builder();
    this.optionGroupSeparator = DEFAULT_OPTION_GROUP_SEPARATOR;
  }

  setComparator(comparator) {
    this.comparator = comparator;
    return this;
  }

  /** Sets where help goes; null means System.out. */
  setHelpAppendable(helpAppendable) {
    this.helpAppendable = helpAppendable ?? TextHelpAppendable.systemOut();
    return this;
  }

  setOptionFormatBuilder(optionFormatBuilder) {
    this.optionFormatBuilder = optionFormatBuilder ?? OptionFormatter.builder();
    return this;
  }

  setOptionGroupSeparator(optionGroupSeparator) {
    this.optionGroupSeparator = defaultValue(optionGroupSeparator, '');
    return this;
  }
}

/** The common part of help formatters; subclasses define the table of options. */
export class AbstractHelpFormatter {
  static DEFAULT_COMPARATOR = DEFAULT_COMPARATOR;
  static DEFAULT_OPTION_GROUP_SEPARATOR = DEFAULT_OPTION_GROUP_SEPARATOR;
  static DEFAULT_SYNTAX_PREFIX = DEFAULT_SYNTAX_PREFIX;

  constructor(builder) {
    this.helpAppendable = requireNonNull(builder.helpAppendable, 'helpAppendable');
    this.optionFormatBuilder = requireNonNull(builder.optionFormatBuilder, 'optionFormatBuilder');
    this.comparator = requireNonNull(builder.comparator, 'comparator');
    this.optionGroupSeparator = defaultValue(builder.optionGroupSeparator, '');
    this.syntaxPrefix = DEFAULT_SYNTAX_PREFIX;
  }

  getOptionFormatter(option) {
    return this.optionFormatBuilder.build(option);
  }

  getSerializer() {
    return this.helpAppendable;
  }

  getSyntaxPrefix() {
    return this.syntaxPrefix;
  }

  /** The usage line, header, table of options and footer; options is an Options object or an array of options. */
  printHelp(cmdLineSyntax, header, options, footer, autoUsage) {
    if (!(options instanceof Options)) {
      const optionsObject = new Options();
      options.forEach((option) => optionsObject.addOption(option));
      this.printHelp(cmdLineSyntax, header, optionsObject, footer, autoUsage);
      return;
    }
    if (isEmpty(cmdLineSyntax)) {
      throw new IllegalArgumentException('cmdLineSyntax not provided');
    }
    if (autoUsage) {
      this.helpAppendable.appendParagraphFormat('%s %s %s', this.syntaxPrefix, cmdLineSyntax, this.toSyntaxOptions(options));
    } else {
      this.helpAppendable.appendParagraphFormat('%s %s', this.syntaxPrefix, cmdLineSyntax);
    }
    if (!isEmpty(header)) {
      this.helpAppendable.appendParagraph(header);
    }
    this.helpAppendable.appendTable(this.getTableDefinition(options.getOptions()));
    if (!isEmpty(footer)) {
      this.helpAppendable.appendParagraph(footer);
    }
  }

  /** The table of options: from an Options object, an array of options, or a TableDefinition. */
  printOptions(options) {
    if (options instanceof TableDefinition) {
      this.helpAppendable.appendTable(options);
    } else {
      this.helpAppendable.appendTable(this.getTableDefinition(options instanceof Options ? options.getOptions() : options));
    }
  }

  setSyntaxPrefix(prefix) {
    this.syntaxPrefix = prefix;
  }

  /** The options (an Options object or an array) sorted by the comparator; [] for null. */
  sort(options) {
    if (options == null) {
      return [];
    }
    const result = [...(options instanceof Options ? options.getOptions() : options)];
    result.sort(this.comparator);
    return result;
  }

  toArgName(argName) {
    return this.optionFormatBuilder.toArgName(argName);
  }

  /** The options of an Options object (with its groups), of an array, or of one OptionGroup, as usage syntax. */
  toSyntaxOptions(options) {
    if (options instanceof Options) {
      return this.toSyntaxOptionsWith(options.getOptions(), (o) => options.getOptionGroup(o));
    }
    if (Array.isArray(options)) {
      return this.toSyntaxOptionsWith(options, () => null);
    }
    return this.toGroupSyntax(options);
  }

  /** The syntax of the options in sorted order, each group that lookup finds appearing once, at its first option. */
  toSyntaxOptionsWith(options, lookup) {
    const processedGroups = [];
    let buff = '';
    let prefix = '';
    for (const option of this.sort(options)) {
      const optionGroup = lookup(option);
      if (optionGroup != null) {
        if (!processedGroups.includes(optionGroup)) {
          processedGroups.push(optionGroup);
          buff += prefix + this.toGroupSyntax(optionGroup);
          prefix = ' ';
        }
      } else {
        buff += prefix + this.optionFormatBuilder.build(option).toSyntaxOption();
        prefix = ' ';
      }
    }
    return buff;
  }

  /** The syntax of a group: its sorted options joined by the group separator, optional unless the group is required. */
  toGroupSyntax(group) {
    const optList = this.sort(group.getOptions());
    let buff = '';
    let formatter = null;
    optList.forEach((option, i) => {
      formatter = this.optionFormatBuilder.build(option);
      buff += formatter.toSyntaxOption(true);
      if (i < optList.length - 1) {
        buff += this.optionGroupSeparator;
      }
    });
    if (formatter != null) {
      return group.isRequired() ? buff : formatter.toOptional(buff);
    }
    return '';
  }
}

/** The help formatter of the help package. */
export class HelpFormatter extends AbstractHelpFormatter {
  static DEFAULT_WIDTH = 74;
  static DEFAULT_LEFT_PAD = 1;
  static DEFAULT_COLUMN_SPACING = 5;

  /** Builds a HelpFormatter. */
  static Builder = class Builder extends AbstractHelpFormatterBuilder {
    constructor() {
      super();
      this.showSince = true;
    }

    get() {
      return new HelpFormatter(this);
    }

    setShowSince(showSince) {
      this.showSince = showSince;
      return this;
    }
  };

  static builder() {
    return new HelpFormatter.Builder();
  }

  constructor(builder) {
    super(builder);
    this.showSince = builder.showSince;
  }

  /** The table of options: names and argument, the version they appeared in (when shown), the description. */
  getTableDefinition(options) {
    const builder = TextStyle.builder().setAlignment(Alignment.LEFT).setIndent(HelpFormatter.DEFAULT_LEFT_PAD).setScalable(false);
    const styles = [builder.get()];
    builder.setScalable(true).setLeftPad(HelpFormatter.DEFAULT_COLUMN_SPACING);
    if (this.showSince) {
      builder.setAlignment(Alignment.CENTER);
      styles.push(builder.get());
    }
    builder.setAlignment(Alignment.LEFT);
    styles.push(builder.get());
    const rows = [];
    for (const option of options) {
      const formatter = this.optionFormatBuilder.build(option);
      let first = formatter.getBothOpt();
      if (option.hasArg()) {
        first += ` ${formatter.getArgName()}`;
      }
      const row = [first];
      if (this.showSince) {
        row.push(formatter.getSince());
      }
      row.push(formatter.getDescription());
      rows.push(row);
    }
    return TableDefinition.from('', styles, this.showSince ? ['Options', 'Since', 'Description'] : ['Options', 'Description'], rows);
  }
}
