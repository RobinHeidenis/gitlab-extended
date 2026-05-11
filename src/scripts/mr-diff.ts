/**
##################################################
#                                                #
#                 Adapted from                   #
# https://github.com/JulienZD/GitLab-MR-AutoNext #
#                                                #
################################################## 
*/

import { loadConstants, parseSpecialCharacters } from "./constants";
import { highlightSpecialCharacters } from "./diff/highlight-special-characters";

declare global {
  interface Window {
    observer?: MutationObserver;
    gleHighlightObserver?: MutationObserver;
  }
}

const getElementByQuerySelector = <TElement extends HTMLElement>(
  selector: string,
) => {
  const element = document.querySelector(selector) as TElement;
  return element;
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

  const findMarkAsViewedCheckbox = () => {
    return getElementByQuerySelector<HTMLInputElement>(
      '[data-testid="fileReviewCheckbox"]',
    );
  };

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

  window.addEventListener("keyup", (event) => {
    if (event.key !== "v") {
      return;
    }

    if (
      document.activeElement?.tagName === "INPUT" ||
      document.activeElement?.tagName === "TEXTAREA"
    ) {
      return;
    }

    const checkbox = findMarkAsViewedCheckbox();

    if (!checkbox) {
      return;
    }

    checkbox.setAttribute("checked", "checked");
    checkbox.dispatchEvent(new Event("change"));
  });
};

const setupSpecialCharacterHighlight = () => {
  const { SPECIAL_CHARACTERS } = loadConstants();
  const specialChars = parseSpecialCharacters(SPECIAL_CHARACTERS);

  if (window.gleHighlightObserver) {
    window.gleHighlightObserver.disconnect();
  }

  let scheduled = false;
  const scheduleHighlight = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      highlightSpecialCharacters(specialChars);
    });
  };

  window.gleHighlightObserver = new MutationObserver(scheduleHighlight);
  window.gleHighlightObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  highlightSpecialCharacters(specialChars);
};

export const setupMRDiff = () => {
  setupSpecialCharacterHighlight();

  if (
    getElementByQuerySelector<HTMLInputElement>('[data-testid="file-by-file"]')
      ?.checked
  ) {
    setupAutoNext();
  } else {
    window.observer?.disconnect();
  }

  getElementByQuerySelector<HTMLInputElement>(
    '[data-testid="file-by-file"]',
  )?.addEventListener("change", (event: Event) => {
    if (!(event.target as HTMLInputElement).checked) {
      setupAutoNext();
    } else {
      window.observer?.disconnect();
    }
  });
};
