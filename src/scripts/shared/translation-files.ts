const XLIFF_PATTERN = /\.(?:xlf|xliff)$/;

// Matches `locales/en.json`, `locales/en/content.json` and `messages/en.json`
const TRANSLATION_JSON_PATTERN =
  /(?:^|\/)(?:locales?|messages|i18n)\/(?:[^/]+\/)?[^/]+\.json$/;

export const isTranslation = (filePath: string) =>
  XLIFF_PATTERN.test(filePath) || TRANSLATION_JSON_PATTERN.test(filePath);
