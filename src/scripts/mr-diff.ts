/**
##################################################
#                                                #
#                 Adapted from                   #
# https://github.com/JulienZD/GitLab-MR-AutoNext #
#                                                #
##################################################
*/

declare global {
  interface Window {
    observer?: MutationObserver;
  }
}

let viewedShortcutSetup = false;

const getElementByQuerySelector = <TElement extends HTMLElement>(
  selector: string,
) => {
  const element = document.querySelector(selector) as TElement;
  return element;
};

const isFileByFileMode = () =>
  getElementByQuerySelector<HTMLInputElement>('[data-testid="file-by-file"]')
    ?.checked;

// The old Vue diffs app uses data-testid="fileReviewCheckbox",
// the new rapid diffs UI uses data-viewed-checkbox
const VIEWED_CHECKBOX_SELECTOR =
  '[data-testid="fileReviewCheckbox"], [data-viewed-checkbox]';

const findMarkAsViewedCheckbox = () => {
  return getElementByQuerySelector<HTMLInputElement>(VIEWED_CHECKBOX_SELECTOR);
};

const findAllMarkAsViewedCheckboxes = () =>
  Array.from(
    document.querySelectorAll<HTMLInputElement>(VIEWED_CHECKBOX_SELECTOR),
  );

const isTypingContext = (element: Element | null) => {
  if (!element) {
    return false;
  }
  if (element.tagName === "TEXTAREA") {
    return true;
  }
  if (element.tagName === "INPUT") {
    return (element as HTMLInputElement).type !== "checkbox";
  }
  return (element as HTMLElement).isContentEditable;
};

const markViewedInSingleFileMode = () => {
  const checkbox = findMarkAsViewedCheckbox();

  if (!checkbox) {
    return;
  }

  checkbox.setAttribute("checked", "checked");
  checkbox.dispatchEvent(new Event("change"));
};

const getStickyHeaderHeight = () =>
  document.querySelector(".merge-request-sticky-header")?.getBoundingClientRect()
    .height ?? 0;

interface DiffUi {
  checkboxSelector: string;
  fileSelector: string;
  // null: rely on GitLab's own scroll-margin CSS (rapid diffs);
  // a number: set it as an inline scroll-margin-top (old Vue UI)
  stickyOffset: () => number | null;
}

const RAPID_DIFFS_UI: DiffUi = {
  checkboxSelector: "[data-viewed-checkbox]",
  fileSelector: '[data-testid="rd-diff-file"]',
  stickyOffset: () => null,
};

const OLD_DIFFS_UI: DiffUi = {
  checkboxSelector: '[data-testid="fileReviewCheckbox"]',
  fileSelector: ".diff-file",
  stickyOffset: getStickyHeaderHeight,
};

const findUnviewedFiles = (ui: DiffUi) =>
  Array.from(
    document.querySelectorAll<HTMLInputElement>(ui.checkboxSelector),
  )
    .filter((checkbox) => !checkbox.checked)
    .flatMap((checkbox) => {
      const file = checkbox.closest<HTMLElement>(ui.fileSelector);
      return file ? [{ checkbox, file }] : [];
    });

// Increments on every `v` press so pending scrolls from a previous press
// can detect they're stale (quick consecutive presses would otherwise
// ping-pong between targets)
let advanceGeneration = 0;

// Both diffs UIs load files in batches and re-render on changes, so we always
// look up the current state of the DOM instead of remembering positions, and
// never rely on focus (GitLab re-renders silently drop it).
const markViewedAndAdvance = (ui: DiffUi) => {
  const generation = ++advanceGeneration;
  const unviewedFiles = findUnviewedFiles(ui);

  // Always mark the first unviewed file on the page (canonical top-down
  // review order), regardless of the current scroll position
  const current = unviewedFiles[0];
  if (!current) {
    return;
  }

  // Decide where to scroll BEFORE clicking: collapsing the current file
  // shifts the whole layout up, so viewport positions measured afterwards
  // are unreliable. DOM order is stable.
  const next = unviewedFiles[1];

  // The next file's DOM node may get replaced when the current one collapses,
  // so remember its stable identity to re-resolve it at scroll time
  const nextFileId = next?.file.id;
  const nextFilePath = next?.file.getAttribute("data-path");

  const resolveNextFile = () => {
    if (next && next.file.isConnected) {
      return next.file;
    }
    if (nextFileId) {
      const byId = document.getElementById(nextFileId);
      if (byId) {
        return byId;
      }
    }
    if (nextFilePath) {
      return document.querySelector<HTMLElement>(
        `${ui.fileSelector}[data-path="${CSS.escape(nextFilePath)}"]`,
      );
    }
    return null;
  };

  const scrollFileToTop = (file: HTMLElement, behavior: ScrollBehavior) => {
    // scrollIntoView works regardless of which element is the scroll
    // container (the window, or an inner panel div); scroll-margin-top
    // keeps the file header out from under the sticky MR header
    const stickyOffset = ui.stickyOffset();
    if (stickyOffset !== null) {
      file.style.scrollMarginTop = `${stickyOffset}px`;
    }
    file.scrollIntoView({ behavior, block: "start" });
  };

  current.checkbox.click();

  if (!next) {
    return;
  }

  // If the user scrolls on their own (wheel, touch, scrollbar drag, or
  // keyboard), they've taken over — don't fight them with a corrective scroll
  let userTookOver = false;
  const scrollKeys = [
    "ArrowDown",
    "ArrowUp",
    "PageDown",
    "PageUp",
    "Home",
    "End",
    " ",
  ];
  const onUserInput = (event: Event) => {
    if (
      event instanceof KeyboardEvent &&
      !scrollKeys.includes(event.key)
    ) {
      return;
    }
    userTookOver = true;
  };
  const userInputEvents = ["wheel", "touchmove", "mousedown", "keydown"];
  for (const type of userInputEvents) {
    window.addEventListener(type, onUserInput, { capture: true, passive: true });
  }
  const stopWatchingUserInput = () => {
    for (const type of userInputEvents) {
      window.removeEventListener(type, onUserInput, { capture: true });
    }
  };

  // Marking a file as viewed collapses it, so wait for the layout to settle
  setTimeout(() => {
    const target = resolveNextFile();
    if (!target || generation !== advanceGeneration) {
      stopWatchingUserInput();
      return;
    }
    scrollFileToTop(target, "smooth");

    // The layout can keep shifting while the smooth scroll runs (collapse
    // animation, files loading in batches), which can strand the scroll
    // mid-way — correct the position once things have settled
    setTimeout(() => {
      stopWatchingUserInput();
      if (userTookOver || generation !== advanceGeneration) {
        return;
      }
      const settledTarget = resolveNextFile();
      if (!settledTarget) {
        return;
      }
      const expectedTop =
        parseFloat(getComputedStyle(settledTarget).scrollMarginTop) || 0;
      const offBy = Math.abs(
        settledTarget.getBoundingClientRect().top - expectedTop,
      );
      if (offBy > 40) {
        scrollFileToTop(settledTarget, "auto");
      }
    }, 800);
  }, 200);
};

const setupViewedShortcut = () => {
  if (viewedShortcutSetup) {
    return;
  }
  viewedShortcutSetup = true;

  // Both diffs UIs natively bind `v` (MR_TOGGLE_REVIEW), which toggles the
  // "viewed" state of whatever GitLab considers the current file — that
  // fights with our own toggling and advancing (mark + immediate unmark).
  // Capture the event before GitLab's document-level Mousetrap handler sees
  // it and handle it ourselves. Mousetrap listens for both keydown and
  // keypress, so suppress both.
  const handleAllFilesShortcut = (event: KeyboardEvent) => {
    if (event.key !== "v") {
      return;
    }

    if (isTypingContext(document.activeElement)) {
      return;
    }

    if (isFileByFileMode()) {
      // handled by the legacy keyup listener below
      return;
    }

    const ui = document.querySelector("[data-viewed-checkbox]")
      ? RAPID_DIFFS_UI
      : document.querySelector('[data-testid="fileReviewCheckbox"]')
        ? OLD_DIFFS_UI
        : null;

    if (!ui) {
      return;
    }

    event.stopPropagation();

    if (event.type === "keydown") {
      markViewedAndAdvance(ui);
    }
  };

  window.addEventListener("keydown", handleAllFilesShortcut, true);
  window.addEventListener("keypress", handleAllFilesShortcut, true);

  window.addEventListener("keyup", (event) => {
    if (event.key !== "v") {
      return;
    }

    if (isTypingContext(document.activeElement)) {
      return;
    }

    if (isFileByFileMode()) {
      markViewedInSingleFileMode();
    }
  });
};

const setupAutoNext = () => {
  if (typeof window.observer !== "undefined") {
    window.observer.disconnect();
  }

  const attachedCheckboxes = new Set();

  const addListenerToViewedCheckbox = (checkbox: HTMLInputElement) => {
    if (attachedCheckboxes.has(checkbox)) {
      return;
    }
    attachedCheckboxes.add(checkbox);
    checkbox.addEventListener("change", (event: Event) => {
      if ((event.target as HTMLInputElement).checked) {
        getElementByQuerySelector<HTMLInputElement>(
          '[data-testid="nextButton"]',
        )?.click();
        setTimeout(() => {
          const scrollableMRDiv = document.getElementsByClassName(
            "panel-content-inner",
          )?.[0] as HTMLDivElement | null;

          if (scrollableMRDiv) {
            scrollableMRDiv.scrollTo({ top: 70, behavior: "smooth" });
          }
        }, 200);
      }
    });
  };

  window.observer = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
      if (mutation.type === "childList") {
        setupCheckboxListener();
      }
    }
  });

  const setupCheckboxListener = () => {
    const checkbox = findMarkAsViewedCheckbox();
    if (!checkbox) {
      return;
    }
    addListenerToViewedCheckbox(checkbox);
  };

  window.observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  setupCheckboxListener();
};

export const setupMRDiff = () => {
  setupViewedShortcut();

  if (isFileByFileMode()) {
    setupAutoNext();
  } else {
    window.observer?.disconnect();
  }

  getElementByQuerySelector<HTMLInputElement>(
    '[data-testid="file-by-file"]',
  )?.addEventListener("change", (event: Event) => {
    if ((event.target as HTMLInputElement).checked) {
      setupAutoNext();
    } else {
      window.observer?.disconnect();
    }
  });
};
