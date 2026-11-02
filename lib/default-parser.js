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
 * The default parser: short and long options, concatenated short options, values after "=" or attached, Java
 * properties ("-Dkey=value"), partial matching of long options and negative numbers as values.
 *
 * @module default-parser
 */

import { CommandLine } from './command-line.js';
import { AmbiguousOptionException, MissingArgumentException, MissingOptionException,
  UnrecognizedOptionException } from './exceptions.js';
import { NumberFormatException, requireNonNull } from './java/errors.js';
import { parseDouble } from './java/primitives.js';
import { equalsIgnoreCase } from './java/string.js';
import { Option } from './option.js';
import { DEFAULT_LONG_OPT_PREFIX, DEFAULT_OPT_PREFIX, stripLeadingAndTrailingQuotes, stripLeadingHyphens } from './util.js';

/** What the parser does with a token that is not an option. */
export const NonOptionAction = Object.freeze({
  /** Unrecognised options are ignored; other arguments are kept. */
  IGNORE: 'IGNORE',
  /** Unrecognised options and other arguments are kept. */
  SKIP: 'SKIP',
  /** Parsing stops: this token and the rest are arguments. */
  STOP: 'STOP',
  /** Unrecognised options throw an UnrecognizedOptionException. */
  THROW: 'THROW'
});

function indexOfEqual(token) {
  return token.indexOf('=');
}

/** The default command line parser. */
export class DefaultParser {
  /** Builds a DefaultParser. */
  static Builder = class Builder {
    constructor() {
      this.allowPartialMatching = true;
      this.deprecatedHandler = CommandLine.DEPRECATED_HANDLER;
      this.stripLeadingAndTrailingQuotes = null;
    }

    build() {
      return this.get();
    }

    get() {
      return new DefaultParser(this.allowPartialMatching, this.stripLeadingAndTrailingQuotes, this.deprecatedHandler);
    }

    setAllowPartialMatching(allowPartialMatching) {
      this.allowPartialMatching = allowPartialMatching;
      return this;
    }

    setDeprecatedHandler(deprecatedHandler) {
      this.deprecatedHandler = deprecatedHandler;
      return this;
    }

    /** true strips quotes from every value, false from none, null only from values given as separate tokens. */
    setStripLeadingAndTrailingQuotes(stripLeadingAndTrailingQuotes) {
      this.stripLeadingAndTrailingQuotes = stripLeadingAndTrailingQuotes;
      return this;
    }
  };

  static builder() {
    return new DefaultParser.Builder();
  }

  static NonOptionAction = NonOptionAction;

  /**
   * @param {boolean} [allowPartialMatching] whether a long option may be given by a unique prefix
   * @param {boolean|null} [stripLeadingAndTrailingQuotes] see Builder.setStripLeadingAndTrailingQuotes
   * @param {Function|null} [deprecatedHandler] called with each deprecated option that is used
   */
  constructor(allowPartialMatching = true, stripLeadingAndTrailingQuotes = null, deprecatedHandler = CommandLine.DEPRECATED_HANDLER) {
    this.allowPartialMatching = allowPartialMatching;
    this.stripLeadingAndTrailingQuotes = stripLeadingAndTrailingQuotes;
    this.deprecatedHandler = deprecatedHandler;
    this.cmd = null;
    this.options = null;
    this.nonOptionAction = null;
    this.currentToken = null;
    this.currentOption = null;
    this.skipParsing = false;
    this.expectedOpts = null;
  }

  addArg(token) {
    this.cmd.addArg(token);
  }

  checkRequiredArgs() {
    if (this.currentOption != null && this.currentOption.requiresArg()) {
      if (this.isJavaProperty(this.currentOption.getKey()) && this.currentOption.getValuesList().length === 1) {
        return;
      }
      throw new MissingArgumentException(this.currentOption);
    }
  }

  checkRequiredOptions() {
    if (this.expectedOpts.length > 0) {
      throw new MissingOptionException(this.expectedOpts);
    }
  }

  /**
   * The longest prefix of the hyphen-stripped token, 2 to length - 2 characters long, that is a long option, or null.
   */
  getLongPrefix(token) {
    const t = stripLeadingHyphens(token);
    for (let i = t.length - 2; i > 1; i--) {
      const prefix = t.slice(0, i);
      if (this.options.hasLongOption(prefix)) {
        return prefix;
      }
    }
    return null;
  }

  /**
   * The long options the token can mean: Options.getMatchingOptions with partial matching on, else only an exact match.
   */
  getMatchingLongOptions(token) {
    if (this.allowPartialMatching) {
      return this.options.getMatchingOptions(token);
    }
    const matches = [];
    if (this.options.hasLongOption(token)) {
      matches.push(this.options.getOption(token).getLongOpt());
    }
    return matches;
  }

  /** Reads "-abc" as the options a, b and c; the rest of the token after an option that takes a value is its value. */
  handleConcatenatedOptions(token) {
    for (let i = 1; i < token.length; i++) {
      const ch = token[i];
      if (!this.options.hasOption(ch)) {
        this.handleUnknownToken(this.nonOptionAction === NonOptionAction.STOP && i > 1 ? token.slice(i) : token);
        break;
      }
      this.handleOption(this.options.getOption(ch));
      if (this.currentOption != null && token.length !== i + 1) {
        this.currentOption.processValue(this.stripQuotesDefaultOff(token.slice(i + 1)));
        break;
      }
    }
  }

  handleLongOption(token) {
    if (indexOfEqual(token) === -1) {
      this.handleLongOptionWithoutEqual(token);
    } else {
      this.handleLongOptionWithEqual(token);
    }
  }

  /** Handles "--name=value". The name may be an abbreviation; an option that takes no value makes the token unknown. */
  handleLongOptionWithEqual(token) {
    const pos = indexOfEqual(token);
    const value = token.slice(pos + 1);
    const opt = token.slice(0, pos);
    const matchingOpts = this.getMatchingLongOptions(opt);
    if (matchingOpts.length === 0) {
      this.handleUnknownToken(this.currentToken);
    } else if (matchingOpts.length > 1 && !this.options.hasLongOption(opt)) {
      throw new AmbiguousOptionException(opt, matchingOpts);
    } else {
      const key = this.options.hasLongOption(opt) ? opt : matchingOpts[0];
      const option = this.options.getOption(key);
      if (option.acceptsArg()) {
        this.handleOption(option);
        this.currentOption.processValue(this.stripQuotesDefaultOff(value));
        this.currentOption = null;
      } else {
        this.handleUnknownToken(this.currentToken);
      }
    }
  }

  /** Handles "--name". The name may be an abbreviation; several matches without an exact one are ambiguous. */
  handleLongOptionWithoutEqual(token) {
    const matchingOpts = this.getMatchingLongOptions(token);
    if (matchingOpts.length === 0) {
      this.handleUnknownToken(this.currentToken);
    } else if (matchingOpts.length > 1 && !this.options.hasLongOption(token)) {
      throw new AmbiguousOptionException(token, matchingOpts);
    } else {
      const key = this.options.hasLongOption(token) ? token : matchingOpts[0];
      this.handleOption(this.options.getOption(key));
    }
  }

  handleOption(option) {
    this.checkRequiredArgs();
    const copy = option.clone();
    this.updateRequiredOptions(copy);
    this.cmd.addOption(copy);
    this.currentOption = copy.hasArg() ? copy : null;
  }

  /** Adds the options given as properties that the command line did not set. */
  handleProperties(properties) {
    if (properties == null) {
      return;
    }
    for (const option of properties.propertyNames()) {
      const opt = this.options.getOption(option);
      if (opt == null) {
        throw new UnrecognizedOptionException("Default option wasn't defined", option);
      }
      const optionGroup = this.options.getOptionGroup(opt);
      const selected = optionGroup != null && optionGroup.isSelected();
      if (!this.cmd.hasOption(option) && !selected) {
        const value = properties.getProperty(option);
        if (opt.hasArg()) {
          if (opt.isValuesEmpty()) {
            opt.processValue(this.stripQuotesDefaultOff(value));
          }
        } else if (!(equalsIgnoreCase('yes', value) || equalsIgnoreCase('true', value) || equalsIgnoreCase('1', value))) {
          continue;
        }
        this.handleOption(opt);
        this.currentOption = null;
      }
    }
  }

  /**
   * Handles a token with one leading hyphen. Without "=" it is, in this order, a short option, a long option, a long
   * option with its value attached, a Java property (-Dkey) or concatenated short options. With "=" it is -S=V, the
   * Java property -Dkey=value, or a long option with one hyphen.
   */
  handleShortAndLongOption(hyphenToken) {
    const token = stripLeadingHyphens(hyphenToken);
    const pos = indexOfEqual(token);
    if (token.length === 1) {
      if (this.options.hasShortOption(token)) {
        this.handleOption(this.options.getOption(token));
      } else {
        this.handleUnknownToken(hyphenToken);
      }
    } else if (pos === -1) {
      if (this.options.hasShortOption(token)) {
        this.handleOption(this.options.getOption(token));
      } else if (this.getMatchingLongOptions(token).length > 0) {
        this.handleLongOptionWithoutEqual(hyphenToken);
      } else {
        const opt = this.getLongPrefix(token);
        if (opt != null && this.options.getOption(opt).acceptsArg()) {
          this.handleOption(this.options.getOption(opt));
          this.currentOption.processValue(this.stripQuotesDefaultOff(token.slice(opt.length)));
          this.currentOption = null;
        } else if (this.isJavaProperty(token)) {
          this.handleOption(this.options.getOption(token.slice(0, 1)));
          this.currentOption.processValue(this.stripQuotesDefaultOff(token.slice(1)));
          this.currentOption = null;
        } else {
          this.handleConcatenatedOptions(hyphenToken);
        }
      }
    } else {
      const opt = token.slice(0, pos);
      const value = token.slice(pos + 1);
      if (opt.length === 1) {
        const option = this.options.getOption(opt);
        if (option != null && option.acceptsArg()) {
          this.handleOption(option);
          this.currentOption.processValue(value);
          this.currentOption = null;
        } else {
          this.handleUnknownToken(hyphenToken);
        }
      } else if (this.isJavaProperty(opt)) {
        this.handleOption(this.options.getOption(opt.slice(0, 1)));
        this.currentOption.processValue(opt.slice(1));
        this.currentOption.processValue(value);
        this.currentOption = null;
      } else {
        this.handleLongOptionWithEqual(hyphenToken);
      }
    }
  }

  /**
   * Handles one token: an argument after "--", else a value of the current option, a long or short option, or unknown.
   */
  handleToken(token) {
    if (token == null) {
      return;
    }
    this.currentToken = token;
    if (this.skipParsing) {
      this.addArg(token);
    } else if (token === DEFAULT_LONG_OPT_PREFIX) {
      this.skipParsing = true;
    } else if (this.currentOption != null && this.currentOption.acceptsArg() && this.isArgument(token)) {
      this.currentOption.processValue(this.stripQuotesDefaultOn(token));
    } else if (token.startsWith(DEFAULT_LONG_OPT_PREFIX)) {
      this.handleLongOption(token);
    } else if (token.startsWith(DEFAULT_OPT_PREFIX) && token !== DEFAULT_OPT_PREFIX) {
      this.handleShortAndLongOption(token);
    } else {
      this.handleUnknownToken(token);
    }
    if (this.currentOption != null && !this.currentOption.acceptsArg()) {
      this.currentOption = null;
    }
  }

  /**
   * A token that is no option: throws or becomes an argument according to the NonOptionAction; STOP also ends parsing.
   */
  handleUnknownToken(token) {
    if (token.startsWith(DEFAULT_OPT_PREFIX) && token.length > 1 && this.nonOptionAction === NonOptionAction.THROW) {
      throw new UnrecognizedOptionException(`Unrecognized option: ${token}`, token);
    }
    if (!token.startsWith(DEFAULT_OPT_PREFIX) || token === DEFAULT_OPT_PREFIX
        || (token.length > 1 && this.nonOptionAction !== NonOptionAction.IGNORE)) {
      this.addArg(token);
    }
    if (this.nonOptionAction === NonOptionAction.STOP) {
      this.skipParsing = true;
    }
  }

  isArgument(token) {
    return !this.isOption(token) || this.isNegativeNumber(token);
  }

  isJavaProperty(token) {
    const opt = token.length === 0 ? null : token.slice(0, 1);
    const option = this.options.getOption(opt);
    return option != null && (option.getArgs() >= 2 || option.getArgs() === Option.UNLIMITED_VALUES);
  }

  /** Whether the token can be a long option, by its name before any "=" or, after one hyphen, with a value attached. */
  isLongOption(token) {
    if (token == null || !token.startsWith(DEFAULT_OPT_PREFIX) || token.length === 1) {
      return false;
    }
    const pos = indexOfEqual(token);
    const t = pos === -1 ? token : token.slice(0, pos);
    if (this.getMatchingLongOptions(t).length > 0) {
      return true;
    }
    return this.getLongPrefix(token) != null && !token.startsWith(DEFAULT_LONG_OPT_PREFIX);
  }

  /** Whether Double.parseDouble accepts the token. */
  isNegativeNumber(token) {
    try {
      parseDouble(token);
      return true;
    } catch (e) {
      if (e instanceof NumberFormatException) {
        return false;
      }
      throw e;
    }
  }

  isOption(token) {
    return this.isLongOption(token) || this.isShortOption(token);
  }

  /** Whether the text after the hyphen, up to any "=", or its first character is a short option. */
  isShortOption(token) {
    if (token == null || !token.startsWith(DEFAULT_OPT_PREFIX) || token.length === 1) {
      return false;
    }
    const pos = indexOfEqual(token);
    const optName = pos === -1 ? token.slice(1) : token.slice(1, pos);
    if (this.options.hasShortOption(optName)) {
      return true;
    }
    return optName.length > 0 && this.options.hasShortOption(optName[0]);
  }

  /**
   * Parses arguments against options.
   *
   * parse(options, args), parse(options, args, stopAtNonOption), parse(options, args, properties),
   * parse(options, args, properties, stopAtNonOption) as the overloads take them; parseWithAction for an explicit
   * NonOptionAction.
   *
   * @returns {CommandLine} the parsed command line
   */
  parse(options, args, propertiesOrStop, stopAtNonOption) {
    if (typeof propertiesOrStop === 'boolean') {
      return this.parseWithAction(options, null, propertiesOrStop ? NonOptionAction.STOP : NonOptionAction.THROW, args);
    }
    return this.parseWithAction(options, propertiesOrStop ?? null, stopAtNonOption ? NonOptionAction.STOP : NonOptionAction.THROW,
      args);
  }

  /** parse(Options, Properties, NonOptionAction, String...). */
  parseWithAction(options, properties, nonOptionAction, args) {
    this.options = requireNonNull(options, 'options');
    this.nonOptionAction = nonOptionAction;
    this.skipParsing = false;
    this.currentOption = null;
    this.expectedOpts = [...options.getRequiredOptions()];
    for (const optionGroup of options.getOptionGroups()) {
      optionGroup.setSelected(null);
    }
    this.cmd = CommandLine.builder().setDeprecatedHandler(this.deprecatedHandler).get();
    if (args != null) {
      for (const argument of args) {
        this.handleToken(argument);
      }
    }
    this.checkRequiredArgs();
    this.handleProperties(properties);
    this.checkRequiredOptions();
    return this.cmd;
  }

  stripQuotesDefaultOff(token) {
    return this.stripLeadingAndTrailingQuotes === true ? stripLeadingAndTrailingQuotes(token) : token;
  }

  stripQuotesDefaultOn(token) {
    return this.stripLeadingAndTrailingQuotes == null || this.stripLeadingAndTrailingQuotes
      ? stripLeadingAndTrailingQuotes(token) : token;
  }

  /** Marks an option as seen: it no longer counts as missing, and it becomes the selected option of its group. */
  updateRequiredOptions(option) {
    if (option.isRequired()) {
      removeFirst(this.expectedOpts, option.getKey());
    }
    const optionGroup = this.options.getOptionGroup(option);
    if (optionGroup != null) {
      if (optionGroup.isRequired()) {
        removeFirst(this.expectedOpts, optionGroup);
      }
      optionGroup.setSelected(option);
    }
  }
}

/** List.remove(Object): removes the first occurrence. */
export function removeFirst(list, item) {
  const index = list.indexOf(item);
  if (index !== -1) {
    list.splice(index, 1);
  }
}
