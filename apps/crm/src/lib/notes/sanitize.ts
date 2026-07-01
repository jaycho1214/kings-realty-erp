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
      "img",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      span: ["class", "data-mention"],
      img: ["src", "alt"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    // Note images are same-origin proxy URLs (/api/documents/<id>). Disallowing
    // all schemes for <img> keeps relative srcs but strips external/tracking
    // images pasted into a note.
    allowedSchemesByTag: { img: [] },
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
