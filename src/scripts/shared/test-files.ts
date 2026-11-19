const TEST_DIRECTORIES = [
  "test",
  "tests",
  "spec",
  "__tests__",
  "__mocks__",
  "__snapshots__",
  "e2e",
];

const TEST_FILE_PATTERN =
  /(?:[._](?:test|spec)|\.stories)\.|\.test-helper\.tsx?$|(?:^|\/)routeTree\.gen\.ts$/;

export const isTestOrStory = (filePath: string) =>
  TEST_FILE_PATTERN.test(filePath) ||
  filePath
    .split("/")
    .slice(0, -1)
    .some((segment) => TEST_DIRECTORIES.includes(segment));
