const PROCESSED_MARKER = "data-gle-special-highlighted";
const HIGHLIGHT_CLASS = "gle-special-char";
const INVISIBLE_CLASS = "gle-special-char-invisible";
const STYLE_ELEMENT_ID = "gle-special-char-styles";

const INVISIBLE_CODE_POINTS = new Set([
  0x00a0, 0x2002, 0x2003, 0x2009, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff,
  0x00ad,
]);

let stylesInjected = false;

const injectStyles = () => {
  if (stylesInjected || document.getElementById(STYLE_ELEMENT_ID)) {
    stylesInjected = true;
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  // Hot-pink fallback; GitLab's diff theme has no obvious "warning" highlight
  // for inline content, so we go with a high-contrast colour that stands out
  // on both light and dark themes.
  style.textContent = `
    .${HIGHLIGHT_CLASS} {
      background-color: #ff1493;
      color: #fff;
      border-radius: 2px;
      padding: 0 1px;
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.15);
    }
    .${HIGHLIGHT_CLASS}.${INVISIBLE_CLASS} {
      display: inline-block;
      min-width: 0.5em;
      min-height: 1em;
      vertical-align: text-bottom;
    }
    .${HIGHLIGHT_CLASS}.${INVISIBLE_CLASS}::after {
      content: attr(data-codepoint);
      font-size: 0.65em;
      font-family: monospace;
      line-height: 1;
      padding: 0 2px;
    }
  `;
  document.head.appendChild(style);
  stylesInjected = true;
};

const codepointLabel = (ch: string): string => {
  const code = ch.codePointAt(0)!;
  return `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
};

const isMatch = (ch: string, charSet: Set<string>): boolean => {
  // Invisible characters are always flagged regardless of the user list,
  // since they can be easily missed and are often used for obfuscation.
  return charSet.has(ch) || INVISIBLE_CODE_POINTS.has(ch.codePointAt(0)!);
};

const highlightTextNode = (node: Text, charSet: Set<string>) => {
  const text = node.nodeValue;
  if (!text) return;

  let hasMatch = false;
  for (const ch of text) {
    if (isMatch(ch, charSet)) {
      hasMatch = true;
      break;
    }
  }
  if (!hasMatch) return;

  const parent = node.parentNode;
  if (!parent) return;

  const fragment = document.createDocumentFragment();
  let buffer = "";

  const flushBuffer = () => {
    if (buffer) {
      fragment.appendChild(document.createTextNode(buffer));
      buffer = "";
    }
  };

  for (const ch of text) {
    if (isMatch(ch, charSet)) {
      flushBuffer();
      const span = document.createElement("span");
      span.className = HIGHLIGHT_CLASS;
      const label = codepointLabel(ch);
      span.dataset.codepoint = label;
      span.title = `Non-standard character ${label}`;
      span.textContent = ch;
      if (INVISIBLE_CODE_POINTS.has(ch.codePointAt(0)!)) {
        span.classList.add(INVISIBLE_CLASS);
      }
      fragment.appendChild(span);
    } else {
      buffer += ch;
    }
  }
  flushBuffer();

  parent.replaceChild(fragment, node);
};

const collectTextNodes = (root: HTMLElement): Text[] => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let parent = node.parentElement;
      while (parent && parent !== root) {
        if (parent.classList.contains(HIGHLIGHT_CLASS)) {
          return NodeFilter.FILTER_REJECT;
        }
        parent = parent.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes: Text[] = [];
  let current: Node | null;
  while ((current = walker.nextNode())) {
    nodes.push(current as Text);
  }
  return nodes;
};

export const highlightSpecialCharacters = (chars: string[]) => {
  injectStyles();

  const charSet = new Set(chars);

  // .diff-td.line_content is the standard diff line cell
  // .rd-line-content is used by GitLab's beta diff viewer (Rapid Diffs)
  // .line_holder.new td.line_content covers suggestion blocks inside comments
  const lines = document.querySelectorAll<HTMLElement>(
    `.diff-td.line_content:not([${PROCESSED_MARKER}]), .rd-line-content:not([${PROCESSED_MARKER}]), .line_holder.new td.line_content:not([${PROCESSED_MARKER}])`,
  );

  if (!lines.length) {
    return;
  }

  for (const line of lines) {
    line.setAttribute(PROCESSED_MARKER, "true");
    const textNodes = collectTextNodes(line);

    for (const textNode of textNodes) {
      highlightTextNode(textNode, charSet);
    }
  }
};
