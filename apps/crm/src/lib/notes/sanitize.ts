import sanitizeHtml from "sanitize-html";

/**
 * Allowlist sanitizer for tenant-note rich text. Runs on write (store clean)
 * and again on read (defensive) before dangerouslySetInnerHTML.
 */
export function sanitizeNoteHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "b",
      "strong",
      "i",
      "em",
      "u",
      "a",
      "ul",
      "ol",
      "li",
      "p",
      "br",
      "span",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      span: ["class", "data-mention"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          target: "_blank",
          rel: "noopener nofollow",
        },
      }),
    },
  });
}

/** Parse mention chips (`data-mention="7"` / `"everyone"`) from note HTML. */
export function extractMentions(html: string): {
  userIds: number[];
  everyone: boolean;
} {
  const ids = new Set<number>();
  let everyone = false;
  const re = /data-mention="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const value = match[1];
    if (value === "everyone") {
      everyone = true;
      continue;
    }
    const n = Number(value);
    if (Number.isInteger(n) && n > 0) ids.add(n);
  }
  return { userIds: [...ids], everyone };
}
