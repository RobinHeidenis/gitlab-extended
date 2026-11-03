const TEST_DIRECTORIES = [
  "test",
  "tests",
  "spec",
  "__tests__",
  "__mocks__",
  "__snapshots__",
  "e2e",
];

export const isTestOrStory = (filePath: string) =>
  /(?:[._](?:test|spec)|\.stories)\./.test(filePath) ||
  filePath
    .split("/")
    .slice(0, -1)
    .some((segment) => TEST_DIRECTORIES.includes(segment));
