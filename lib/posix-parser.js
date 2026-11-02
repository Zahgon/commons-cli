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
 * The deprecated POSIX parser: bursts "-abc" into "-a -b -c" and resolves partial long options.
 *
 * @deprecated use DefaultParser
 * @module posix-parser
 */

import { AmbiguousOptionException } from './exceptions.js';
import { Parser } from './parser.js';
import { DEFAULT_LONG_OPT_PREFIX, DEFAULT_OPT_PREFIX } from './util.js';

/** Flattens arguments the POSIX way. */
export class PosixParser extends Parser {
  constructor() {
    super();
    this.tokens = [];
    this.eatTheRest = false;
    this.currentOption = null;
    this.posixOptions = null;
  }

  /** Breaks "-abc" into "-a", "-b", "-c"; the rest of the token after an option that takes a value is its value. */
  burstToken(token, stopAtNonOption) {
    for (let i = 1; i < token.length; i++) {
      const ch = token[i];
      if (!this.posixOptions.hasOption(ch)) {
        if (stopAtNonOption) {
          this.processNonOptionToken(token.slice(i), true);
        } else {
          this.tokens.push(token);
        }
        break;
      }
      this.tokens.push(DEFAULT_OPT_PREFIX + ch);
      this.currentOption = this.posixOptions.getOption(ch);
      if (this.currentOption.hasArg() && token.length !== i + 1) {
        this.tokens.push(token.slice(i + 1));
        break;
      }
    }
  }

  /**
   * Splits the arguments into tokens. A long option loses any "=value" to a token of its own and an abbreviation is
   * expanded; a one-hyphen token is an option or is burst; stopAtNonOption ends option parsing at the first non-option.
   */
  flatten(options, args, stopAtNonOption) {
    this.eatTheRest = false;
    this.tokens = [];
    this.posixOptions = options;
    for (let n = 0; n < args.length; n++) {
      const token = args[n];
      if (token != null) {
        if (token === DEFAULT_OPT_PREFIX || token === DEFAULT_LONG_OPT_PREFIX) {
          this.tokens.push(token);
        } else if (token.startsWith(DEFAULT_LONG_OPT_PREFIX)) {
          const pos = token.indexOf('=');
          const opt = pos === -1 ? token : token.slice(0, pos);
          const matchingOpts = options.getMatchingOptions(opt);
          if (matchingOpts.length === 0) {
            this.processNonOptionToken(token, stopAtNonOption);
          } else if (matchingOpts.length > 1) {
            throw new AmbiguousOptionException(opt, matchingOpts);
          } else {
            this.currentOption = options.getOption(matchingOpts[0]);
            this.tokens.push(DEFAULT_LONG_OPT_PREFIX + this.currentOption.getLongOpt());
            if (pos !== -1) {
              this.tokens.push(token.slice(pos + 1));
            }
          }
        } else if (token.startsWith(DEFAULT_OPT_PREFIX)) {
          if (token.length === 2 || options.hasOption(token)) {
            this.processOptionToken(token, stopAtNonOption);
          } else if (options.getMatchingOptions(token).length > 0) {
            const matchingOpts = options.getMatchingOptions(token);
            if (matchingOpts.length > 1) {
              throw new AmbiguousOptionException(token, matchingOpts);
            }
            const opt = options.getOption(matchingOpts[0]);
            this.processOptionToken(DEFAULT_OPT_PREFIX + opt.getLongOpt(), stopAtNonOption);
          } else {
            this.burstToken(token, stopAtNonOption);
          }
        } else {
          this.processNonOptionToken(token, stopAtNonOption);
        }
      }
      if (this.eatTheRest) {
        this.tokens.push(...args.slice(n + 1));
        break;
      }
    }
    return [...this.tokens];
  }

  processNonOptionToken(value, stopAtNonOption) {
    if (stopAtNonOption && (this.currentOption == null || !this.currentOption.hasArg())) {
      this.eatTheRest = true;
      this.tokens.push(DEFAULT_LONG_OPT_PREFIX);
    }
    this.tokens.push(value);
  }

  processOptionToken(token, stopAtNonOption) {
    if (stopAtNonOption && !this.posixOptions.hasOption(token)) {
      this.eatTheRest = true;
    }
    if (this.posixOptions.hasOption(token)) {
      this.currentOption = this.posixOptions.getOption(token);
    }
    this.tokens.push(token);
  }
}
