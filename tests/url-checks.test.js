const test = require("node:test");
const assert = require("node:assert/strict");
const { inspectLink, scriptInUrl, embeddedDestinations } = require("../policy.js");

const script = href => scriptInUrl(new URL(href));
const embedded = href => embeddedDestinations(new URL(href));

// Reflected XSS against an otherwise trusted host: the payload travels in the link.
// The forms follow the OWASP XSS filter evasion cheat sheet: tags, event handlers,
// script URIs, script calls, and the encodings used to hide them.
test("script or HTML code in a link is recognised through common encodings", () => {
  for (const href of [
    "https://bank.example/search?q=<script>alert(1)</script>",
    "https://bank.example/search?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E",
    "https://bank.example/search?q=%253Cscript%253Ealert(1)%253C%252Fscript%253E",
    "https://bank.example/search?q=%25253Csvg%25252Fonload%25253Dalert(1)%25253E",
    "https://bank.example/?q=%22%3E%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E",
    "https://bank.example/?q=\"><svg/onload=alert(1)>",
    "https://bank.example/?q=x%22%20onmouseover%3D%22alert(1)",
    "https://bank.example/login?next=javascript:alert(document.cookie)",
    "https://bank.example/login?next=java%09script:alert(1)",
    "https://bank.example/login?next=&%23106;avascript:alert(1)",
    "https://bank.example/login?next=%26%23x6A%3Bavascript%26colon%3Balert(1)",
    "https://bank.example/login?next=JaVaScRiPt:void(0)",
    "https://bank.example/?q=\\u003cscript\\u003ealert(1)",
    "https://bank.example/<script>alert(1)</script>",
    "https://bank.example/profile/%3Cimg%20src=x%20onerror=alert(1)%3E",
    "https://bank.example/#<img src=x onerror=alert(1)>",
    "https://bank.example/view?file=data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "https://bank.example/?cb=document.cookie",
    "https://bank.example/?q=';alert(String.fromCharCode(88))//",
    "https://bank.example/?q=%27-eval(atob(%22YWxlcnQoMSk%22))-%27",
    "https://bank.example/?q=<iframe srcdoc=x>",
    "https://bank.example/?q=<!--",
    "https://bank.example/?q=alert`1`"
  ]) assert.equal(script(href), true, href);
});

// Ordinary links that look a little like code must not warn.
test("ordinary links are not mistaken for code", () => {
  for (const href of [
    "https://example.com/onboarding?step=2",
    "https://example.com/docs?onload=true&x=1",
    "https://example.com/learn/javascript-basics",
    "https://example.com/search?q=a<b",
    "https://example.com/search?q=C%2B%2B%20templates%20%3Cvector%3E",
    "https://example.com/?q=fire+alert+(2024)",
    "https://example.com/?q=please+confirm+(today)",
    "https://u1234.ct.sendgrid.net/ls/click?upn=u001.abcDEF-2B-2FghIJ-3D-3D_xyZ123",
    "https://example.us1.list-manage.com/track/click?u=abc123&id=def456&e=ghi789",
    "https://example.com/reset?token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.SflKxwRJSMeKKF2QT4fwpM",
    "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit?usp=sharing",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
    "https://example.com/path/with%20space/and%2Fslash?x=%E2%9C%93",
    "https://example.com/a?b=1&amp;c=2",
    "https://shop.example.com/product/12345?utm_source=newsletter&utm_medium=email",
    "https://example.com/data/export.csv?format=text/html",
    "https://example.com/blog/2024/10/01/how-to-use-document-ready"
  ]) assert.equal(script(href), false, href);
});

// Redirectors pass the visitor on to an address carried in the link. Parameter names
// vary, so values are examined regardless of their name.
test("embedded destinations are found in parameters, paths and common wrappers", () => {
  for (const [href, host] of [
    ["https://www.google.com/url?q=https://evil.example/login", "evil.example"],
    ["https://eur01.safelinks.protection.outlook.com/?url=https%3A%2F%2Fevil.example%2Fx&data=05%7C02", "evil.example"],
    ["https://urldefense.com/v3/__https://evil.example/x__;!!AbC123$", "evil.example"],
    ["https://urldefense.proofpoint.com/v2/url?u=https-3A__evil.example_path&d=DwMF&c=x", "evil.example"],
    ["https://redirector.example/out?to=//evil.example/login", "evil.example"],
    ["https://redirector.example/out?next=%2F%2Fevil.example", "evil.example"],
    ["https://redirector.example/r?u=aHR0cHM6Ly9ldmlsLmV4YW1wbGUvbG9naW4", "evil.example"],
    ["https://redirector.example/r?n=aHR0cHM6Ly9ldmlsLmV4YW1wbGUv", "evil.example"],
    ["https://redirector.example/go?RelayState=https%253A%252F%252Fevil.example%252F", "evil.example"],
    ["https://redirector.example/go?dest=https:\\\\evil.example", "evil.example"],
    ["https://redirector.example/go?dest=https:/evil.example", "evil.example"],
    ["https://web.archive.org/web/2020/https://evil.example/", "evil.example"],
    ["https://r.us-east-1.awstrack.me/L0/https:%2F%2Fwww.evil.example%2Fx/1/0100abc", "www.evil.example"],
    ["https://redirector.example/r/aHR0cHM6Ly9ldmlsLmV4YW1wbGUv", "evil.example"],
    ["https://redirector.example/#next=https://evil.example/", "evil.example"],
    ["https://l.facebook.com/l.php?u=https%3A%2F%2Fevil.example%2F&h=AT0", "evil.example"],
    ["https://redirector.example/?x=https://user@evil.example/", "evil.example"]
  ]) assert.ok(embedded(href).includes(host), `${href} -> ${embedded(href)}`);
});

test("links without an embedded destination yield none", () => {
  for (const href of [
    "https://example.com/search?q=hello",
    "https://example.com/page?ref=newsletter",
    "https://example.com/login?next=/account",
    "https://example.com/login?next=%2Faccount%2Fsettings",
    "https://example.com/reset?token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abc",
    "https://example.com/?u=12345",
    "https://example.us1.list-manage.com/track/click?u=abc123&id=def456&e=ghi789",
    "https://u1234.ct.sendgrid.net/ls/click?upn=u001.abcDEF-2B-2FghIJ-3D-3D_xyZ123",
    "https://example.com/docs/http-headers",
    "https://example.com/?q=how+to+write+http+urls"
  ]) assert.deepEqual(embedded(href), [], href);
});

test("destinations are reported once, without the link's own host, and bounded", () => {
  assert.deepEqual(inspectLink("https://www.google.com/url?q=https://evil.example/&sa=D&source=https://evil.example/").destinations,
    ["evil.example"]);
  assert.equal(inspectLink("https://example.com/login?next=https://example.com/account").destinations, undefined);
  const many = "https://r.example/?" + Array.from({ length: 20 }, (_, i) => `a${i}=https://h${i}.example/`).join("&");
  assert.ok(embedded(many).length <= 5);
});

test("code in a link becomes a warning that needs exact approval", () => {
  const result = inspectLink("https://bank.example/search?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E");
  assert.equal(result.kind, "web");
  assert.ok(result.risks.includes("scriptInUrl"));
  assert.equal(inspectLink("https://bank.example/search?q=shoes").risks, undefined);
});
