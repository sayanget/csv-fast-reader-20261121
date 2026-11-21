// Fast drop-in for make.fun's csv-reader 1.0.0 readCsv: same {columns, rows, errors} for every input.
// Scans by char code and takes field values with slice instead of building them a character at a time.
// Pure: nothing is kept from one call to the next.

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  let needHeader = header;

  let pos = 0;
  let line = 1;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos++;
        line++;
      } else if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line++;
      } else break;
    }
    if (pos >= n) break;

    const recordLine = line;
    const recordRow = needHeader ? null : rows.length;
    const fields = [];
    let quoted = false;
    let more = true; // the record goes on after this field (it ended at a comma)

    while (more) {
      let value;
      let prefix = '';
      let unquoted = true; // read (the rest of) the field as unquoted
      let junk = false; // the unquoted part is junk after a closing quote

      if (pos < n && text.charCodeAt(pos) === 34) {
        quoted = true;
        const open = pos;
        const openLine = line;
        let i = pos + 1;
        let seg = i;
        let v = '';
        let closed = false;
        while (i < n) {
          const c = text.charCodeAt(i);
          if (c === 34) {
            if (i + 1 < n && text.charCodeAt(i + 1) === 34) {
              v += text.slice(seg, i + 1);
              i += 2;
              seg = i;
              continue;
            }
            v = seg === open + 1 ? text.slice(seg, i) : v + text.slice(seg, i);
            i++;
            closed = true;
            break;
          }
          if (c === 13) {
            v += text.slice(seg, i) + '\n';
            line++;
            i += i + 1 < n && text.charCodeAt(i + 1) === 10 ? 2 : 1;
            seg = i;
            continue;
          }
          if (c === 10) line++;
          i++;
        }
        if (!closed) {
          pos = open + 1;
          line = openLine;
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          prefix = '"';
        } else {
          pos = i;
          if (pos >= n) {
            value = v;
            more = false;
            unquoted = false;
          } else {
            const c = text.charCodeAt(pos);
            if (c === 44) {
              pos++;
              value = v;
              unquoted = false;
            } else if (c === 10) {
              pos++;
              line++;
              value = v;
              more = false;
              unquoted = false;
            } else if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
              pos += 2;
              line++;
              value = v;
              more = false;
              unquoted = false;
            } else {
              prefix = v;
              junk = true;
            }
          }
        }
      } else {
        quoted = false;
      }

      if (unquoted) {
        let i = pos;
        let seg = pos;
        let kept = false;
        let v = prefix;
        let c = 0;
        for (;;) {
          if (i >= n) {
            more = false;
            break;
          }
          c = text.charCodeAt(i);
          if (c === 44) break;
          if (c === 10) {
            more = false;
            break;
          }
          if (c === 13) {
            if (i + 1 < n && text.charCodeAt(i + 1) === 10) {
              more = false;
              break;
            }
            errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
            if (i > seg) {
              v += text.slice(seg, i);
              kept = true;
            }
            i++;
            seg = i;
            continue;
          }
          i++;
        }
        if (i > seg) {
          kept = true;
          v = v === '' ? text.slice(seg, i) : v + text.slice(seg, i);
        }
        value = v;
        if (i >= n) pos = n;
        else if (c === 44 || c === 10) pos = i + 1;
        else pos = i + 2; // CRLF
        if (c !== 44 && i < n) line++;
        if (junk && kept) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
      }
      fields.push(value);
    }

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (needHeader) {
      columns = fields;
      needHeader = false;
      continue;
    }
    const len = fields.length;
    if (len < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: len });
      for (let k = len; k < width; k++) fields.push('');
    } else if (len > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
