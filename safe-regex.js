"use strict";

// A small regular-expression engine whose matching time is linear in the input.
//
// Warning rules come from the user or from imported lists and are matched against
// links in untrusted mail, so the JavaScript RegExp engine (which backtracks and can
// take exponential time on patterns such as `(a+)+$`) is never used for them.
// Instead a restricted syntax is compiled to an NFA and simulated breadth-first
// (Thompson/Pike). Every input character visits each program instruction at most
// once, so a match costs at most O(input length x program size), and every step is
// charged to a caller-supplied budget. Features that need backtracking
// (backreferences, lookaround, word boundaries) are rejected rather than emulated.
//
// Supported: literals, `.`, `[...]` and `[^...]` with ranges, `\d \D \w \W \s \S`,
// `\t \n \r`, escaped punctuation, `(...)`, `(?:...)`, `|`, `^`, `$`, and the
// quantifiers `* + ? {n} {n,} {n,m}` (a trailing lazy `?` is accepted and ignored).
// Matching is always case-insensitive and unanchored unless `^`/`$` are used.
(function (root) {
  const MAX_PATTERN = 200;
  const MAX_PROGRAM = 512;
  const MAX_REPEAT = 50;
  const MAX_DEPTH = 16;
  const MAX_COMPILE_WORK = 20000;

  function fail(code) { throw new Error(code); }

  const isDigit = c => c >= "0" && c <= "9";
  const isWord = c => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || isDigit(c) || c === "_";
  const isSpace = c => " \t\n\r\v\f\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff".includes(c);
  const classes = { d: isDigit, w: isWord, s: isSpace };

  // Inputs are lower-cased before matching. A class or range written in upper case
  // must still match, so a character also counts if its single-character upper case
  // form is in the set.
  function folded(test) {
    return c => {
      if (test(c)) return true;
      const upper = c.toUpperCase();
      return upper.length === 1 && upper !== c && test(upper);
    };
  }

  function lowerChar(c) {
    const lower = c.toLowerCase();
    return lower.length === 1 ? lower : c;
  }

  function parse(pattern) {
    if (typeof pattern !== "string" || !pattern.length) fail("regexSyntax");
    if (pattern.length > MAX_PATTERN) fail("regexTooLong");
    // Control, bidirectional and zero-width characters are refused: patterns are shown
    // in Settings and in list previews, where they could make a rule look harmless.
    if (/[\x00-\x1f\x7f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/.test(pattern)) fail("regexSyntax");
    let pos = 0;
    let depth = 0;
    const peek = () => pattern[pos];

    function escape() {
      if (pos >= pattern.length) fail("regexSyntax");
      const c = pattern[pos++];
      if (Object.hasOwn(classes, c.toLowerCase()) && "dDwWsS".includes(c)) {
        const base = classes[c.toLowerCase()];
        return { test: c === c.toLowerCase() ? base : x => !base(x) };
      }
      if (c === "t") return { char: "\t" };
      if (c === "n") return { char: "\n" };
      if (c === "r") return { char: "\r" };
      // \b, \B, \1-\9, \k, \u, \x, \p, \c and friends either need backtracking or
      // are easy to misread, so they are refused instead of guessed.
      if (/[A-Za-z0-9]/.test(c)) fail("regexUnsupported");
      return { char: c };
    }

    function characterClass() {
      let negate = false;
      if (peek() === "^") { negate = true; pos++; }
      const tests = [];
      while (true) {
        if (pos >= pattern.length) fail("regexSyntax");
        const c = pattern[pos++];
        if (c === "]") break;
        let low;
        if (c === "\\") {
          const item = escape();
          if (item.test) { tests.push(item.test); continue; }
          low = item.char;
        } else low = c;
        if (peek() === "-" && pos + 1 < pattern.length && pattern[pos + 1] !== "]") {
          pos++;
          let high = pattern[pos++];
          if (high === "\\") {
            const item = escape();
            if (item.test) fail("regexSyntax");
            high = item.char;
          }
          if (high < low) fail("regexSyntax");
          const from = low;
          const to = high;
          tests.push(x => x >= from && x <= to);
        } else {
          const only = low;
          tests.push(x => x === only);
        }
      }
      const inside = folded(x => tests.some(test => test(x)));
      return { type: "set", test: negate ? x => !inside(x) : inside };
    }

    function quantifier() {
      const c = peek();
      if (c === "*") { pos++; return { min: 0, max: Infinity }; }
      if (c === "+") { pos++; return { min: 1, max: Infinity }; }
      if (c === "?") { pos++; return { min: 0, max: 1 }; }
      if (c !== "{") return null;
      const match = /^\{(\d{1,3})(?:(,)(\d{0,3}))?\}/.exec(pattern.slice(pos, pos + 12));
      if (!match) fail("regexSyntax");
      pos += match[0].length;
      const min = Number(match[1]);
      const max = match[2] ? (match[3] === "" ? Infinity : Number(match[3])) : min;
      if (min > MAX_REPEAT || (max !== Infinity && max > MAX_REPEAT)) fail("regexTooComplex");
      if (max < min) fail("regexSyntax");
      return { min, max };
    }

    function atom() {
      const c = pattern[pos++];
      if (c === "(") {
        if (++depth > MAX_DEPTH) fail("regexTooComplex");
        if (peek() === "?") {
          if (pattern[pos + 1] !== ":") fail("regexUnsupported");
          pos += 2;
        }
        const node = alternation();
        if (pattern[pos++] !== ")") fail("regexSyntax");
        depth--;
        return node;
      }
      if (c === "[") return characterClass();
      if (c === ".") return { type: "set", test: () => true };
      if (c === "^") return { type: "bol" };
      if (c === "$") return { type: "eol" };
      if (c === "\\") {
        const item = escape();
        if (item.test) return { type: "set", test: folded(item.test) };
        const literal = lowerChar(item.char);
        return { type: "set", test: x => x === literal };
      }
      if ("*+?{".includes(c)) fail("regexSyntax");
      const literal = lowerChar(c);
      return { type: "set", test: x => x === literal };
    }

    function repeated() {
      const node = atom();
      const range = quantifier();
      if (!range) return node;
      if (node.type === "bol" || node.type === "eol") fail("regexSyntax");
      if (peek() === "?") pos++;
      if (pos < pattern.length && "*+?{".includes(peek())) fail("regexSyntax");
      return { type: "repeat", node, min: range.min, max: range.max };
    }

    function sequence() {
      const items = [];
      while (pos < pattern.length && peek() !== "|" && peek() !== ")") items.push(repeated());
      return { type: "sequence", items };
    }

    function alternation() {
      const options = [sequence()];
      while (peek() === "|") { pos++; options.push(sequence()); }
      return options.length === 1 ? options[0] : { type: "alternation", options };
    }

    const tree = alternation();
    if (pos !== pattern.length) fail("regexSyntax");
    return tree;
  }

  function compile(pattern) {
    const tree = parse(pattern);
    const program = [];
    let work = 0;
    const emit = instruction => {
      if (program.length >= MAX_PROGRAM) fail("regexTooComplex");
      program.push(instruction);
      return program.length - 1;
    };
    function generate(node) {
      // Nested empty repetitions emit nothing, so the work is bounded separately.
      if (++work > MAX_COMPILE_WORK) fail("regexTooComplex");
      if (node.type === "set") emit({ op: "set", test: node.test });
      else if (node.type === "bol" || node.type === "eol") emit({ op: node.type });
      else if (node.type === "sequence") for (const item of node.items) generate(item);
      else if (node.type === "alternation") {
        const exits = [];
        node.options.forEach((option, index) => {
          if (index === node.options.length - 1) { generate(option); return; }
          const split = emit({ op: "split", x: 0, y: 0 });
          program[split].x = program.length;
          generate(option);
          exits.push(emit({ op: "jmp", x: 0 }));
          program[split].y = program.length;
        });
        for (const exit of exits) program[exit].x = program.length;
      } else if (node.type === "repeat") {
        for (let i = 0; i < node.min; i++) generate(node.node);
        if (node.max === Infinity) {
          const split = emit({ op: "split", x: 0, y: 0 });
          program[split].x = program.length;
          generate(node.node);
          emit({ op: "jmp", x: split });
          program[split].y = program.length;
        } else {
          const splits = [];
          for (let i = node.min; i < node.max; i++) {
            const split = emit({ op: "split", x: 0, y: 0 });
            program[split].x = program.length;
            generate(node.node);
            splits.push(split);
          }
          for (const split of splits) program[split].y = program.length;
        }
      }
    }
    generate(tree);
    emit({ op: "match" });
    return Object.freeze(program);
  }

  // Returns whether `program` matches anywhere in `input`. Each visited instruction
  // costs one step from `budget.steps`; running out throws "regexBudget" so callers
  // can fail closed instead of silently skipping a rule.
  function test(program, input, budget) {
    const text = String(input).toLowerCase();
    const seen = new Int32Array(program.length).fill(-1);
    const stack = [];
    function add(list, start, position, generation) {
      stack.push(start);
      while (stack.length) {
        const pc = stack.pop();
        if (seen[pc] === generation) continue;
        seen[pc] = generation;
        if (--budget.steps < 0) throw new Error("regexBudget");
        const instruction = program[pc];
        if (instruction.op === "jmp") stack.push(instruction.x);
        else if (instruction.op === "split") stack.push(instruction.y, instruction.x);
        else if (instruction.op === "bol") { if (position === 0) stack.push(pc + 1); }
        else if (instruction.op === "eol") { if (position === text.length) stack.push(pc + 1); }
        else list.push(pc);
      }
    }
    let generation = 0;
    let current = [];
    add(current, 0, 0, generation);
    for (let position = 0; ; position++) {
      const next = [];
      const nextGeneration = generation + 1;
      const c = text[position];
      for (const pc of current) {
        if (--budget.steps < 0) throw new Error("regexBudget");
        const instruction = program[pc];
        if (instruction.op === "match") return true;
        if (position < text.length && instruction.test(c)) add(next, pc + 1, position + 1, nextGeneration);
      }
      if (position >= text.length) return false;
      current = next;
      generation = nextGeneration;
      // Unanchored search: a new attempt starts at every position.
      add(current, 0, position + 1, generation);
    }
  }

  const api = Object.freeze({ compile, test, MAX_PATTERN, MAX_PROGRAM, MAX_REPEAT });
  root.LinkGuardRegex = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
