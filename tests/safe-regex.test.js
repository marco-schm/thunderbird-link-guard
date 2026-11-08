const test = require("node:test");
const assert = require("node:assert/strict");
const regex = require("../safe-regex.js");

const unlimited = () => ({ steps: Number.MAX_SAFE_INTEGER });
const matches = (pattern, input) => regex.test(regex.compile(pattern), input, unlimited());

test("supported syntax matches like RegExp with the i flag", () => {
  for (const [pattern, input, expected] of [
    ["wp-admin", "https://x.org/WP-Admin/", true], ["^https://", "http://a", false],
    ["\\.zip$", "a.ZIP", true], ["[A-Z]{3}\\d+", "abc123", true], ["^(?:a|b)+$", "abab", true],
    ["^(?:a|b)+$", "abc", false], ["colou?r", "color", true], ["a{2,3}", "a", false],
    ["[^a-z]", "abc", false], ["[^a-z]", "abc1", true], ["^$", "", true], ["\\w+@\\w+", "a@b", true],
    ["pay\\s*now", "PAY  NOW", true], ["[\\d.]+", "x", false], ["a.c", "a\nc", true], ["x*?y", "y", true]
  ]) assert.equal(matches(pattern, input), expected, `${pattern} on ${input}`);
});

test("features that need backtracking or are ambiguous are rejected", () => {
  for (const [pattern, code] of [
    ["(a)\\1", "regexUnsupported"], ["(?=a)", "regexUnsupported"], ["(?!a)", "regexUnsupported"],
    ["(?<=a)b", "regexUnsupported"], ["(?<name>a)", "regexUnsupported"], ["\\bfoo", "regexUnsupported"],
    ["\\u0041", "regexUnsupported"], ["\\x41", "regexUnsupported"], ["\\p{L}", "regexUnsupported"],
    ["a**", "regexSyntax"], ["*a", "regexSyntax"], ["(", "regexSyntax"], ["a)", "regexSyntax"],
    ["[z-a]", "regexSyntax"], ["{1}", "regexSyntax"], ["a{2,1}", "regexSyntax"], ["", "regexSyntax"],
    ["^*", "regexSyntax"], ["a‮b", "regexSyntax"], ["a{51}", "regexTooComplex"],
    ["x".repeat(201), "regexTooLong"], ["(".repeat(17) + "a" + ")".repeat(17), "regexTooComplex"],
    ["(a{50}){50}", "regexTooComplex"], ["((((a{0}){50}){50}){50}){50}", "regexTooComplex"]
  ]) assert.throws(() => regex.compile(pattern), new RegExp(`^Error: ${code}$`), pattern);
});

test("catastrophic-backtracking patterns run in linear time", () => {
  const input = "a".repeat(20000) + "!";
  for (const pattern of ["(a+)+$", "(a|a)*b", "(a*)*b", "^(\\w+\\s?)*$", "(x+x+)+y", "(a|aa)+$", "(.*a){20}"]) {
    const program = regex.compile(pattern);
    const budget = unlimited();
    const start = process.hrtime.bigint();
    regex.test(program, input, budget);
    const millis = Number(process.hrtime.bigint() - start) / 1e6;
    const steps = Number.MAX_SAFE_INTEGER - budget.steps;
    assert.ok(steps <= (input.length + 1) * program.length * 2, `${pattern}: ${steps} steps`);
    assert.ok(millis < 1000, `${pattern}: ${millis} ms`);
  }
});

test("every step is charged to the budget", () => {
  const program = regex.compile("needle");
  assert.throws(() => regex.test(program, "x".repeat(1000), { steps: 50 }), /regexBudget/);
  const budget = { steps: 1e6 };
  assert.equal(regex.test(program, "haystack with a needle", budget), true);
  assert.ok(budget.steps < 1e6);
});

test("results agree with RegExp on random patterns in the supported subset", () => {
  let seed = 11;
  const random = n => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  const atoms = ["a", "b", "A", ".", "[ab]", "[^a]", "\\d", "\\w", "(a|b)", "(?:ab|ba)", "x", "[a-c]", "\\.", "^", "$", "(a*)", "(b|)"];
  const quantifiers = ["", "", "*", "+", "?", "{2}", "{1,3}", "{0,}", "*?"];
  for (let i = 0; i < 3000; i++) {
    let pattern = "";
    for (let j = 1 + random(5); j > 0; j--) {
      const atom = atoms[random(atoms.length)];
      pattern += atom + (atom === "^" || atom === "$" ? "" : quantifiers[random(quantifiers.length)]);
    }
    const program = regex.compile(pattern);
    const native = new RegExp(pattern, "i");
    for (let k = 0; k < 4; k++) {
      let input = "";
      for (let n = random(8); n > 0; n--) input += "abABx1.c"[random(8)];
      assert.equal(regex.test(program, input, unlimited()), native.test(input), `${pattern} on ${input}`);
    }
  }
});
