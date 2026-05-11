import { createFallbackEmojiSvg } from "./icons/emoji";

// Invisible whitespace characters are always detected by the highlighter,
// so they're intentionally left out of this list.
const DEFAULT_SPECIAL_CHARACTERS = [
  // Dashes: em, en, minus, figure, horizontal bar
  "—",
  "–",
  "−",
  "‒",
  "―",
  // Ellipsis and smart quotes
  "…",
  "“",
  "”",
  "‘",
  "’",
  // Bullet, asterisk operator
  "•",
  "∗",
  // Multiplication sign
  "×",
  // Arrows
  "→",
  "←",
  "↔",
  "⇒",
  "⇐",
  "⇔",
  "⟶",
  "⟵",
  "⟷",
  // Comparison operators
  "≠",
  "≤",
  "≥",
].join(",");

export function loadConstants() {
  const EMOJI = getFromStorage("emoji") || "seedling";
  const EMOJI_PLURAL = getFromStorage("emoji_plural") || "seedlings";
  const EMOJI_EMOJI = getFromStorage("emoji_emoji") || "🌱";
  const EMOJI_SVG = getFromStorage("emoji_svg") || createFallbackEmojiSvg();
  const EMOJI_BG_COLOR = getFromStorage("emoji_bg_color") || "#072b15";
  const JIRA_URL = getFromStorage("jira_url") || "";
  const JIRA_PREFIX = getFromStorage("jira_prefix") || "";
  const SPECIAL_CHARACTERS =
    getFromStorage("special_characters") || DEFAULT_SPECIAL_CHARACTERS;

  setInStorage("emoji", EMOJI);
  setInStorage("emoji_plural", EMOJI_PLURAL);
  setInStorage("emoji_emoji", EMOJI_EMOJI);
  setInStorage("emoji_svg", EMOJI_SVG);
  setInStorage("emoji_bg_color", EMOJI_BG_COLOR);
  setInStorage("jira_url", JIRA_URL);
  setInStorage("jira_prefix", JIRA_PREFIX);
  setInStorage("special_characters", SPECIAL_CHARACTERS);

  return {
    EMOJI,
    EMOJI_BG_COLOR,
    EMOJI_EMOJI,
    EMOJI_PLURAL,
    EMOJI_SVG,
    JIRA_URL,
    JIRA_PREFIX,
    SPECIAL_CHARACTERS,
  };
}

export function getFromStorage(key: string) {
  return localStorage.getItem(`__gitlab-extended-${key}`);
}

export function setInStorage(key: string, value: string) {
  localStorage.setItem(`__gitlab-extended-${key}`, value);
}

// Parses a stored, comma-separated list of literal characters.
export function parseSpecialCharacters(raw: string): string[] {
  if (!raw) return [];

  const out: string[] = [];

  for (const rawEntry of raw.split(",")) {
    const entry = rawEntry.trim();
    if (!entry) continue;

    // Split into individual code points so multi-char entries still produce a flat character list.
    for (const ch of entry) {
      out.push(ch);
    }
  }

  return out;
}
