import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeNoteHtml, extractMentions } from "./sanitize";

test("keeps allowed formatting tags", () => {
  const out = sanitizeNoteHtml("<p>hi <strong>there</strong> <em>ok</em></p>");
  assert.equal(out, "<p>hi <strong>there</strong> <em>ok</em></p>");
});

test("strips script and event handlers", () => {
  const out = sanitizeNoteHtml(
    '<p onclick="x()">a</p><script>alert(1)</script>',
  );
  assert.equal(out, "<p>a</p>");
});

test("forces safe link attributes", () => {
  const out = sanitizeNoteHtml('<a href="https://ex.com">x</a>');
  assert.match(out, /target="_blank"/);
  assert.match(out, /rel="noopener nofollow"/);
});

test("drops javascript: hrefs", () => {
  const out = sanitizeNoteHtml('<a href="javascript:alert(1)">x</a>');
  assert.doesNotMatch(out, /javascript:/);
});

test("keeps mention span with data-mention and class", () => {
  const html = '<span class="mention" data-mention="7">@Kim</span>';
  assert.equal(sanitizeNoteHtml(html), html);
});

test("extractMentions collects user ids, dedups, ignores malformed", () => {
  const html =
    '<span data-mention="7">@A</span><span data-mention="7">@A</span>' +
    '<span data-mention="9">@B</span><span data-mention="abc">@C</span>';
  const m = extractMentions(html);
  assert.deepEqual(
    m.userIds.sort((a, b) => a - b),
    [7, 9],
  );
  assert.equal(m.everyone, false);
});

test("extractMentions detects everyone", () => {
  const m = extractMentions('<span data-mention="everyone">@everyone</span>');
  assert.equal(m.everyone, true);
  assert.deepEqual(m.userIds, []);
});
