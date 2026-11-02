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
 * The attributes of a deprecated option.
 *
 * @module deprecated-attributes
 */

/** Describes why and since when an option is deprecated. */
export class DeprecatedAttributes {
  /** Builds DeprecatedAttributes. */
  static Builder = class Builder {
    constructor() {
      this.description = null;
      this.forRemoval = false;
      this.since = null;
    }

    get() {
      return new DeprecatedAttributes(this.description, this.since, this.forRemoval);
    }

    setDescription(description) {
      this.description = description;
      return this;
    }

    setForRemoval(forRemoval) {
      this.forRemoval = forRemoval;
      return this;
    }

    setSince(since) {
      this.since = since;
      return this;
    }
  };

  static builder() {
    return new DeprecatedAttributes.Builder();
  }

  constructor(description, since, forRemoval) {
    this.description = description ?? '';
    this.since = since ?? '';
    this.forRemoval = forRemoval;
  }

  getDescription() {
    return this.description;
  }

  getSince() {
    return this.since;
  }

  isForRemoval() {
    return this.forRemoval;
  }

  toString() {
    let s = 'Deprecated';
    if (this.forRemoval) {
      s += ' for removal';
    }
    if (this.since.length > 0) {
      s += ` since ${this.since}`;
    }
    if (this.description.length > 0) {
      s += `: ${this.description}`;
    }
    return s;
  }
}

/** The attributes of Option.Builder.deprecated(): no description, no version, not for removal. */
DeprecatedAttributes.DEFAULT = new DeprecatedAttributes('', '', false);
