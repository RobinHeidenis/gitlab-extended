import { isTestOrStory } from "../shared/test-files";

const STYLE_ID = "gitlab-extended-test-file-headers";
const TEST_HEADER_ATTRIBUTE = "data-gle-test-file";

// Rapid diffs keep the path in the file's JSON data attribute, the old Vue UI
// puts it on the header container
const RAPID_FILE_SELECTOR = '[data-testid="rd-diff-file"]';
const RAPID_HEADER_SELECTOR = '[data-testid="rd-diff-file-header"]';
const OLD_HEADER_SELECTOR =
  '[data-testid="file-title-container"][data-qa-file-name]';

const injectStyles = () => {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  // GitLab's dark success token is teal-ish, so dark mode (picked explicitly
  // via `gl-dark`, or following the OS via `gl-system`) gets its own green
  const darkGreen = `background-color: #0c331d !important;`;
  style.textContent = `
    [${TEST_HEADER_ATTRIBUTE}] {
      background-color: var(--gl-status-success-background-color, #bee6d0) !important;
    }
    html.gl-dark [${TEST_HEADER_ATTRIBUTE}] {
      ${darkGreen}
    }
    @media (prefers-color-scheme: dark) {
      html.gl-system [${TEST_HEADER_ATTRIBUTE}] {
        ${darkGreen}
      }
    }
  `;
  document.head.appendChild(style);
};

const getRapidFilePath = (file: HTMLElement) => {
  try {
    const data = JSON.parse(file.dataset.fileData ?? "{}");
    return (data.new_path ?? data.old_path ?? null) as string | null;
  } catch {
    return null;
  }
};

const markHeader = (header: Element, filePath: string | null) => {
  header.toggleAttribute(
    TEST_HEADER_ATTRIBUTE,
    filePath !== null && isTestOrStory(filePath),
  );
};

const markTestFileHeaders = () => {
  for (const file of document.querySelectorAll<HTMLElement>(
    RAPID_FILE_SELECTOR,
  )) {
    const header = file.querySelector(RAPID_HEADER_SELECTOR);
    if (header) {
      markHeader(header, getRapidFilePath(file));
    }
  }

  for (const header of document.querySelectorAll(OLD_HEADER_SELECTOR)) {
    markHeader(header, header.getAttribute("data-qa-file-name"));
  }
};

let headersSetup = false;

// Both diffs UIs load files in batches and re-render headers at will, so
// re-mark on every DOM change (batched to once per frame)
export const setupTestFileHeaders = () => {
  if (headersSetup) {
    return;
  }
  headersSetup = true;

  injectStyles();

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) {
      return;
    }
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      markTestFileHeaders();
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });

  markTestFileHeaders();
};
