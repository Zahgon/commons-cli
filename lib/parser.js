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
 * The deprecated parsers' common algorithm: a subclass flattens the arguments into tokens, which are then processed.
 *
 * @deprecated use DefaultParser
 * @module parser
 */

import { CommandLine } from './command-line.js';
import { MissingArgumentException, MissingOptionException, UnrecognizedOptionException } from './exceptions.js';
import { RuntimeException } from './java/errors.js';
import { equalsIgnoreCase } from './java/string.js';
import { DEFAULT_LONG_OPT_PREFIX, DEFAULT_OPT_PREFIX, stripLeadingAndTrailingQuotes } from './util.js';
import { removeFirst } from './default-parser.js';

/** Whether an error is a Java RuntimeException (or a JavaScript null dereference). */
function isRuntimeException(e) {
  return e instanceof RuntimeException || e instanceof TypeError;
}

/** Base of PosixParser, GnuParser and BasicParser. */
export class Parser {
  constructor() {
    this.cmd = null;
    this.options = null;
    this.requiredOptions = null;
  }

  checkRequiredOptions() {
    if (this.getRequiredOptions().length > 0) {
      throw new MissingOptionException(this.getRequiredOptions());
    }
  }

  /** Turns the arguments into the tokens to process. */
  flatten() {
    throw new Error('Parser subclasses implement flatten');
  }

  getOptions() {
    return this.options;
  }

  getRequiredOptions() {
    return this.requiredOptions;
  }

  /**
   * parse(options, args), parse(options, args, stopAtNonOption), parse(options, args, properties) or
   * parse(options, args, properties, stopAtNonOption).
   */
  parse(options, args, propertiesOrStop, stopAtNonOption = false) {
    if (typeof propertiesOrStop === 'boolean') {
      return this.parseAll(options, args, null, propertiesOrStop);
    }
    return this.parseAll(options, args, propertiesOrStop ?? null, stopAtNonOption);
  }

  parseAll(options, args, properties, stopAtNonOption) {
    options.helpOptions().forEach((option) => option.clearValues());
    for (const optionGroup of options.getOptionGroups()) {
      optionGroup.setSelected(null);
    }
    this.setOptions(options);
    this.cmd = CommandLine.builder().get();
    let eatTheRest = false;
    const tokens = this.flatten(this.getOptions(), args ?? [], stopAtNonOption);
    const iterator = { tokens, index: 0 };
    while (iterator.index < tokens.length) {
      const token = tokens[iterator.index++];
      if (token == null) {
        continue;
      }
      if (token === DEFAULT_LONG_OPT_PREFIX) {
        eatTheRest = true;
      } else if (token === DEFAULT_OPT_PREFIX) {
        if (stopAtNonOption) {
          eatTheRest = true;
        } else {
          this.cmd.addArg(token);
        }
      } else if (token.startsWith(DEFAULT_OPT_PREFIX)) {
        if (stopAtNonOption && !this.getOptions().hasOption(token)) {
          eatTheRest = true;
          this.cmd.addArg(token);
        } else {
          this.processOption(token, iterator);
        }
      } else {
        this.cmd.addArg(token);
        if (stopAtNonOption) {
          eatTheRest = true;
        }
      }
      if (eatTheRest) {
        while (iterator.index < tokens.length) {
          const str = tokens[iterator.index++];
          if (str !== DEFAULT_LONG_OPT_PREFIX) {
            this.cmd.addArg(str);
          }
        }
      }
    }
    this.processProperties(properties);
    this.checkRequiredOptions();
    return this.cmd;
  }

  /** Takes the option's values from the tokens that follow, up to the next option. */
  processArgs(opt, iterator) {
    while (iterator.index < iterator.tokens.length) {
      const str = iterator.tokens[iterator.index++];
      if (this.getOptions().hasOption(str) && str.startsWith(DEFAULT_OPT_PREFIX)) {
        iterator.index--;
        break;
      }
      try {
        opt.processValue(stripLeadingAndTrailingQuotes(str));
      } catch (e) {
        if (!isRuntimeException(e)) {
          throw e;
        }
        iterator.index--;
        break;
      }
    }
    if (opt.isValuesEmpty() && !opt.hasOptionalArg()) {
      throw new MissingArgumentException(opt);
    }
  }

  processOption(arg, iterator) {
    if (!this.getOptions().hasOption(arg)) {
      throw new UnrecognizedOptionException(`Unrecognized option: ${arg}`, arg);
    }
    const opt = this.getOptions().getOption(arg).clone();
    this.updateRequiredOptions(opt);
    if (opt.hasArg()) {
      this.processArgs(opt, iterator);
    }
    this.cmd.addOption(opt);
  }

  processProperties(properties) {
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
            try {
              opt.processValue(value);
            } catch (e) {
              if (!isRuntimeException(e)) {
                throw e;
              }
            }
          }
        } else if (!(equalsIgnoreCase('yes', value) || equalsIgnoreCase('true', value) || equalsIgnoreCase('1', value))) {
          continue;
        }
        this.cmd.addOption(opt);
        this.updateRequiredOptions(opt);
      }
    }
  }

  setOptions(options) {
    this.options = options;
    this.requiredOptions = [...options.getRequiredOptions()];
  }

  updateRequiredOptions(opt) {
    if (opt.isRequired()) {
      removeFirst(this.getRequiredOptions(), opt.getKey());
    }
    const optionGroup = this.getOptions().getOptionGroup(opt);
    if (optionGroup != null) {
      if (optionGroup.isRequired()) {
        removeFirst(this.getRequiredOptions(), optionGroup);
      }
      optionGroup.setSelected(opt);
    }
  }
}

/** Passes the arguments through unchanged. */
export class BasicParser extends Parser {
  flatten(options, args) {
    return args;
  }
}

/** Splits "--opt=value" and "-ovalue" when the option exists, and passes everything else through. */
export class GnuParser extends Parser {
  flatten(options, args, stopAtNonOption) {
    const tokens = [];
    let eatTheRest = false;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg == null) {
        continue;
      }
      if (arg === DEFAULT_LONG_OPT_PREFIX) {
        eatTheRest = true;
        tokens.push(DEFAULT_LONG_OPT_PREFIX);
      } else if (arg === DEFAULT_OPT_PREFIX) {
        tokens.push(DEFAULT_OPT_PREFIX);
      } else if (arg.startsWith(DEFAULT_OPT_PREFIX)) {
        const opt = arg.startsWith(DEFAULT_LONG_OPT_PREFIX) ? arg.slice(2) : arg.slice(1);
        if (options.hasOption(opt)) {
          tokens.push(arg);
        } else {
          const equalPos = opt.indexOf('=');
          if (equalPos !== -1 && options.hasOption(opt.slice(0, equalPos))) {
            tokens.push(arg.slice(0, arg.indexOf('=')));
            tokens.push(arg.slice(arg.indexOf('=') + 1));
          } else if (options.hasOption(arg.slice(0, 2))) {
            tokens.push(arg.slice(0, 2));
            tokens.push(arg.slice(2));
          } else {
            eatTheRest = stopAtNonOption;
            tokens.push(arg);
          }
        }
      } else {
        tokens.push(arg);
      }
      if (eatTheRest) {
        for (i++; i < args.length; i++) {
          tokens.push(args[i]);
        }
      }
    }
    return tokens;
  }
}
