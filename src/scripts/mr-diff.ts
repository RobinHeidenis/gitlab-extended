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
          '[data-testid="gl-pagination-next"]',
        )?.click();
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

export const setupMRDiff = () => {

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
