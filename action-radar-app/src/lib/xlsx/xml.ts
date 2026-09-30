/**
 * Tokenizer XML minimal untuk SpreadsheetML.
 *
 * Kenapa tidak pakai DOMParser: modul ini harus jalan identik di browser DAN di
 * Node (untuk script verifikasi), sementara Node tidak punya DOMParser global.
 * Kenapa tidak pakai parser XML umum: yang dibutuhkan hanya iterasi elemen
 * bernama + baca atribut, dan SpreadsheetML itu XML hasil generate mesin yang
 * sangat regular — jadi tokenizer sempit ini cukup dan bebas dependency.
 *
 * Batasan yang disengaja: tidak menangani namespace prefix pada nama elemen
 * (SpreadsheetML memakai default namespace), dan tidak menangani DTD/CDATA
 * (tidak dipakai oleh format xlsx).
 */

export interface XmlElement {
  attrs: Record<string, string>;
  /** Isi mentah di antara tag buka dan tutup. `null` kalau self-closing. */
  inner: string | null;
}

const ATTR_RE = /([A-Za-z_:][-.\w:]*)\s*=\s*"([^"]*)"|([A-Za-z_:][-.\w:]*)\s*=\s*'([^']*)'/g;

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(source)) !== null) {
    const name = m[1] ?? m[3];
    const value = m[2] ?? m[4];
    if (name !== undefined && value !== undefined) attrs[name] = decodeXmlText(value);
  }
  return attrs;
}

/**
 * Iterasi semua elemen `<name ...>` pada level mana pun.
 * Sadar nesting: `<a><a/></a>` menghasilkan elemen luar dengan inner `<a/>`.
 */
export function* iterElements(xml: string, name: string): Generator<XmlElement> {
  const openPrefix = `<${name}`;
  const closeTag = `</${name}>`;
  let cursor = 0;

  while (cursor < xml.length) {
    const start = xml.indexOf(openPrefix, cursor);
    if (start === -1) return;

    // Pastikan ini benar-benar tag <name> dan bukan prefix dari <nameLain>.
    const after = xml.charAt(start + openPrefix.length);
    if (after !== "" && after !== ">" && after !== "/" && !/\s/.test(after)) {
      cursor = start + openPrefix.length;
      continue;
    }

    const openEnd = xml.indexOf(">", start);
    if (openEnd === -1) return;

    const selfClosing = xml.charAt(openEnd - 1) === "/";
    const attrSource = xml.slice(
      start + openPrefix.length,
      selfClosing ? openEnd - 1 : openEnd,
    );
    const attrs = parseAttrs(attrSource);

    if (selfClosing) {
      yield { attrs, inner: null };
      cursor = openEnd + 1;
      continue;
    }

    // Cari tag penutup yang cocok, hitung nesting elemen bernama sama.
    let depth = 1;
    let scan = openEnd + 1;
    let innerEnd = -1;
    while (scan < xml.length) {
      const nextClose = xml.indexOf(closeTag, scan);
      if (nextClose === -1) break;
      let nextOpen = xml.indexOf(openPrefix, scan);
      // Abaikan "open" yang sebenarnya prefix nama lain.
      while (nextOpen !== -1 && nextOpen < nextClose) {
        const ch = xml.charAt(nextOpen + openPrefix.length);
        if (ch === ">" || ch === "/" || /\s/.test(ch)) break;
        nextOpen = xml.indexOf(openPrefix, nextOpen + openPrefix.length);
      }
      if (nextOpen !== -1 && nextOpen < nextClose) {
        const oe = xml.indexOf(">", nextOpen);
        if (oe === -1) break;
        if (xml.charAt(oe - 1) !== "/") depth += 1;
        scan = oe + 1;
        continue;
      }
      depth -= 1;
      if (depth === 0) {
        innerEnd = nextClose;
        break;
      }
      scan = nextClose + closeTag.length;
    }

    if (innerEnd === -1) return; // XML tidak seimbang: berhenti, jangan lempar
    yield { attrs, inner: xml.slice(openEnd + 1, innerEnd) };
    cursor = innerEnd + closeTag.length;
  }
}

/** Ambil elemen pertama dengan nama tertentu, atau null. */
export function firstElement(xml: string, name: string): XmlElement | null {
  for (const el of iterElements(xml, name)) return el;
  return null;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/** Decode entity XML. Menangani named entity dan numeric (desimal/hex). */
export function decodeXmlText(value: string): string {
  if (!value.includes("&")) return value;
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

/**
 * Gabungkan seluruh isi `<t>` di dalam sebuah fragment.
 * Dipakai untuk shared string dan inline string, termasuk yang terpecah jadi
 * beberapa rich-text run (`<r><t>..</t></r><r><t>..</t></r>`).
 */
export function collectTextNodes(fragment: string): string {
  let text = "";
  for (const t of iterElements(fragment, "t")) {
    if (t.inner !== null) text += decodeXmlText(t.inner);
  }
  return text;
}
