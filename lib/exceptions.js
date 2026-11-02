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
 * The exceptions of the command line parsers: ParseException and its subclasses.
 *
 * @module exceptions
 */

import { JavaException, UnsupportedOperationException, javaToString } from './java/errors.js';
import { javaString } from './java/types.js';

/** Base for exceptions thrown when parsing a command line, and for wrapped conversion failures. */
export class ParseException extends JavaException {
  static javaName = 'org.apache.commons.cli.ParseException';

  /**
   * Rethrows an UnsupportedOperationException, returns a ParseException as it is, and wraps anything else.
   *
   * @param {Error} e the exception
   * @returns {ParseException} the ParseException to throw
   */
  static wrap(e) {
    if (e instanceof UnsupportedOperationException) {
      throw e;
    }
    if (e instanceof ParseException) {
      return e;
    }
    return new ParseException(javaToString(e), e);
  }
}

/** Thrown when more than one option of an option group has been given. */
export class AlreadySelectedException extends ParseException {
  static javaName = 'org.apache.commons.cli.AlreadySelectedException';

  /**
   * @param {OptionGroup|string} optionGroupOrMessage the group, or the message
   * @param {Option} [option] the option that was added to the group while another was selected
   */
  constructor(optionGroupOrMessage, option) {
    if (typeof optionGroupOrMessage === 'string' || option === undefined) {
      super(optionGroupOrMessage);
      this.optionGroup = null;
      this.option = null;
      return;
    }
    super(`The option '${javaString(option.getKey())}' was specified but an option from this group has already been `
      + `selected: '${javaString(optionGroupOrMessage.getSelected())}'`);
    this.optionGroup = optionGroupOrMessage;
    this.option = option;
  }

  getOption() {
    return this.option;
  }

  getOptionGroup() {
    return this.optionGroup;
  }
}

/** Thrown when an option is not defined. */
export class UnrecognizedOptionException extends ParseException {
  static javaName = 'org.apache.commons.cli.UnrecognizedOptionException';

  constructor(message, option = null) {
    super(message);
    this.option = option;
  }

  getOption() {
    return this.option;
  }
}

/** Thrown when a partial long option matches several long options. */
export class AmbiguousOptionException extends UnrecognizedOptionException {
  static javaName = 'org.apache.commons.cli.AmbiguousOptionException';

  /**
   * @param {string} option the partial option
   * @param {string[]} matchingOptions the long options it matches
   */
  constructor(option, matchingOptions) {
    super(`Ambiguous option: '${option}'  (could be: ${matchingOptions.map((o) => `'${o}'`).join(', ')})`, option);
    this.matchingOptions = matchingOptions;
  }

  getMatchingOptions() {
    return this.matchingOptions;
  }
}

/** Thrown when an option that requires an argument has none. */
export class MissingArgumentException extends ParseException {
  static javaName = 'org.apache.commons.cli.MissingArgumentException';

  /** @param {Option|string} optionOrMessage the option, or the message */
  constructor(optionOrMessage) {
    if (typeof optionOrMessage === 'string') {
      super(optionOrMessage);
      this.option = null;
    } else {
      super(`Missing argument for option: ${javaString(optionOrMessage.getKey())}`);
      this.option = optionOrMessage;
    }
  }

  getOption() {
    return this.option;
  }
}

/** Thrown when required options are missing. */
export class MissingOptionException extends ParseException {
  static javaName = 'org.apache.commons.cli.MissingOptionException';

  /** @param {Array|string} missingOrMessage the missing option keys and groups, or the message */
  constructor(missingOrMessage) {
    if (typeof missingOrMessage === 'string') {
      super(missingOrMessage);
      this.missingOptions = null;
    } else {
      super(`Missing required option${missingOrMessage.length === 1 ? '' : 's'}: ${missingOrMessage.map(javaString).join(', ')}`);
      this.missingOptions = missingOrMessage;
    }
  }

  getMissingOptions() {
    return this.missingOptions;
  }
}
