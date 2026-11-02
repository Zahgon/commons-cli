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
 * The definition of a table: caption, column styles, headers and rows.
 *
 * @module help/table-definition
 */

/** A table to print: a caption, one TextStyle and header per column, and rows of cells. */
export class TableDefinition {
  /**
   * @param {string|null} caption the caption
   * @param {TextStyle[]} columnStyle the column styles
   * @param {string[]} headers the column headers
   * @param {Iterable<string[]>} rows the rows
   */
  static from(caption, columnStyle, headers, rows) {
    return new TableDefinition(caption, columnStyle, headers, rows);
  }

  constructor(caption, columnStyle, headers, rows) {
    this.captionValue = caption;
    this.columnStyle = columnStyle;
    this.headerList = headers;
    this.rowList = rows;
  }

  caption() {
    return this.captionValue;
  }

  columnTextStyles() {
    return this.columnStyle;
  }

  headers() {
    return this.headerList;
  }

  rows() {
    return this.rowList;
  }
}
