import { createEmojiSvg, createFallbackEmojiSvg } from "./icons/emoji";
import { createSparkleIcon } from "./icons/sparkle";
import {
  collectOpenDiscussions,
  copyToClipboard,
  extractSingleDiscussion,
  formatDiscussionsAsMarkdown,
  formatSingleDiscussionAsPrompt,
} from "./overview/copy-open-comments";
import { addViewInJiraButton } from "./overview/view-in-jira-button";

const {
  EMOJI,
  EMOJI_BG_COLOR,
  EMOJI_EMOJI,
  EMOJI_PLURAL,
  EMOJI_SVG,
  JIRA_PREFIX,
  JIRA_URL,
} = loadConstants();

const GITLAB_EMOJI_ELEMENT = (classes = "", title = EMOJI) =>
  `<gl-emoji data-name='${EMOJI}' data-unicode-version='6.0' title='${title}' class='${classes}'>${EMOJI_EMOJI}</gl-emoji>`;

const COLLAPSED_BY_MARKER = "data-collapsed-by";

const collapseIssuesWithEmoji = () => {
  for (const node of document.querySelectorAll(
    `button[data-testid="award-button"][data-emoji-name="${EMOJI}"]`,
  )) {
    const issue = node.closest("div[data-discussion-id]");
    if (!issue || issue.hasAttribute(COLLAPSED_BY_MARKER)) {
      continue;
    }

    const collapseButton = issue!.querySelector(
      'button[data-testid="collapse-replies-button"]',
    ) as HTMLButtonElement | null;

    if (!collapseButton) {
      continue;
    }

    collapseButton.click();
    issue.setAttribute(COLLAPSED_BY_MARKER, "gitlab-extended");
  }
};

const addCollapseAllEmojisButtonToPage = () => {
  const containerDiv = document.querySelector("#notes > div > div");

  const collapseButton = document.createElement("button");
  collapseButton.classList.add(
    "btn",
    "ml-sm-2",
    "gl-w-full",
    "sm:gl-w-auto",
    "btn-default",
    "btn-md",
    "gl-button",
  );
  collapseButton.type = "button";
  collapseButton.innerHTML = `<span class='gl-button-text'>Collapse all ${EMOJI_PLURAL} ${GITLAB_EMOJI_ELEMENT("gl-ml-2")}</span>`;
  collapseButton.onclick = collapseIssuesWithEmoji;

  containerDiv?.prepend(collapseButton);
};

const addCopyOpenCommentsButtonToPage = () => {
  const containerDiv = document.querySelector("#notes > div > div");
  if (!containerDiv) return;

  const copyButton = document.createElement("button");
  copyButton.classList.add(
    "btn",
    "ml-sm-2",
    "gl-w-full",
    "sm:gl-w-auto",
    "btn-default",
    "btn-md",
    "gl-button",
  );
  copyButton.type = "button";
  copyButton.innerHTML = `<span class='gl-button-text'>📋 Copy open comments</span>`;

  copyButton.onclick = async () => {
    const discussions = collectOpenDiscussions(EMOJI);
    const markdown = formatDiscussionsAsMarkdown(discussions);
    const success = await copyToClipboard(markdown);

    if (success) {
      const originalText = copyButton.innerHTML;
      copyButton.innerHTML = `<span class='gl-button-text'>✅ Copied ${discussions.length} discussion(s)!</span>`;
      setTimeout(() => {
        copyButton.innerHTML = originalText;
      }, 2000);
    } else {
      copyButton.innerHTML = `<span class='gl-button-text'>❌ Failed to copy</span>`;
      setTimeout(() => {
        copyButton.innerHTML = `<span class='gl-button-text'>📋 Copy open comments</span>`;
      }, 2000);
    }
  };

  containerDiv.prepend(copyButton);
};

const setupClickEventListeners = () => {
  const MARKER = "data-gitlab-extended-click-listener";

  const container = document.getElementById("notes-list");
  if (!container) {
    throw new Error("No container found for notes-list");
  }

  const issueDivs = container.querySelectorAll("div[data-discussion-id]");

  for (const issueDiv of issueDivs) {
    if (issueDiv.hasAttribute(MARKER)) {
      continue;
    }

    issueDiv.setAttribute(MARKER, "true");

    issueDiv.addEventListener("click", async (event) => {
      const target = event.target;

      if (
        target &&
        "dataset" in target &&
        target.dataset instanceof DOMStringMap &&
        target.dataset.name === EMOJI
      ) {
        const issue = (event.currentTarget as HTMLElement).closest(
          "div[data-discussion-id]",
        );

        await new Promise((resolve) =>
          setTimeout(() => resolve("let's do this"), 1000),
        );

        if (!issue) {
          console.log("No issue found");
          return;
        }

        const header = issue.querySelector("div.note-header-info")!;
        if (header.children.length === 4) {
          header.removeChild(header.children[3]!);
          showTotalWithoutEmojis();
          return;
        }

        const collapseButton = issue.querySelector(
          'button[data-testid="collapse-replies-button"]',
        ) as HTMLButtonElement | null;

        if (!collapseButton) {
          console.log("No collapse button found");
          return;
        }

        collapseButton.click();

        issue.setAttribute(COLLAPSED_BY_MARKER, "gitlab-extended");

        toggleResolvedBadge(issue as unknown as HTMLDivElement, false);

        showTotalWithoutEmojis();
      }
    });
  }
};

const showTotalWithoutEmojis = () => {
  const totalUnEmojid = document.querySelectorAll(
    `div[data-discussion-id]:not([data-discussion-resolved]):not(:has(button[data-emoji-name="${EMOJI}"])):has(li[aria-expanded="true"])`,
  );

  const unresolvedIssuesContainers = document.querySelectorAll<HTMLDivElement>(
    'div[data-testid="discussions-counter-text"]',
  );
  if (!unresolvedIssuesContainers) {
    return;
  }

  const counter = unresolvedIssuesContainers[1];
  if (!counter) {
    return;
  }

  const totalUnresolvedIssues = counter.innerText.split(" ")[0];

  for (const container of unresolvedIssuesContainers) {
    (container.firstChild as HTMLElement).textContent =
      `${totalUnEmojid.length} unresolved threads (${totalUnresolvedIssues} total)`;
  }

  return true;
};

const addBadgeToEmojiCollapsedIssues = () => {
  const allCollapsedIssues = document.querySelectorAll(
    `div[${COLLAPSED_BY_MARKER}="gitlab-extended"]`,
  );

  for (const issue of allCollapsedIssues) {
    toggleResolvedBadge(issue as HTMLDivElement, false);
  }
};

const addButtonsToResolveIssues = (csrfToken: string) => {
  const issues = document.querySelectorAll<HTMLLIElement>(
    ".discussion-notes ul.notes li.note-comment:first-of-type",
  );

  const RESOLVE_BUTTON_MARKER = "data-gitlab-extended-resolve-button";

  for (const issue of issues) {
    if (issue.hasAttribute(RESOLVE_BUTTON_MARKER)) {
      continue;
    }

    const button = document.createElement("button");
    button.classList.add(
      "btn",
      "btn-default",
      "btn-md",
      "btn-default-tertiary",
      "btn-icon",
      "note-action-button",
      "gl-button",
    );

    const badgeIcon = createEmojiSvg(null, EMOJI_SVG);
    badgeIcon.classList.add(
      "gl-button-icon",
      "gl-icon",
      "s16",
      "gl-fill-current",
    );
    button.appendChild(badgeIcon);
    button.title = "Resolve (Gitlab Extended)";

    const toggleEmojiUrl = issue.dataset.awardUrl;
    if (!toggleEmojiUrl) {
      continue;
    }

    button.onclick = async () => {
      const shouldBadgeBeRemoved = !!issue.querySelector(
        `button[data-testid="award-button"][data-emoji-name="${EMOJI}"]`,
      );

      // Mark the issue as "resolved" by toggling the configured emoji
      await fetch(toggleEmojiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({
          name: EMOJI,
        }),
      });

      issue.setAttribute("data-discussion-resolved", "");
      issue.setAttribute(COLLAPSED_BY_MARKER, "gitlab-extended");

      toggleResolvedBadge(
        issue as unknown as HTMLDivElement,
        shouldBadgeBeRemoved,
      );
      showTotalWithoutEmojis();
    };

    const firstActionButton = issue.querySelector(
      "div.note-actions button.note-action-button",
    );

    firstActionButton?.insertAdjacentElement("beforebegin", button);

    issue.setAttribute(RESOLVE_BUTTON_MARKER, "true");
  }
};

const addAiCopyButtonsToComments = () => {
  const AI_BUTTON_MARKER = "data-gitlab-extended-ai-button";

  // Get all first comments in discussion threads
  const comments = document.querySelectorAll<HTMLLIElement>(
    ".discussion-notes ul.notes li.note-comment:first-of-type",
  );

  for (const comment of comments) {
    if (comment.hasAttribute(AI_BUTTON_MARKER)) {
      continue;
    }

    const button = document.createElement("button");
    button.classList.add(
      "btn",
      "btn-default",
      "btn-md",
      "btn-default-tertiary",
      "btn-icon",
      "note-action-button",
      "gl-button",
    );

    const sparkleIcon = createSparkleIcon();
    sparkleIcon.classList.add(
      "gl-button-icon",
      "gl-icon",
      "s16",
      "gl-fill-current",
    );
    button.appendChild(sparkleIcon);

    const tooltipText = "Copy as AI prompt (Gitlab Extended)";
    button.title = tooltipText;
    button.setAttribute("aria-label", tooltipText);

    button.onclick = async () => {
      // Find the parent discussion element
      const discussionElement = comment.closest("div[data-discussion-id]");
      if (!discussionElement) {
        console.error("[Gitlab Extended] Could not find discussion element");
        return;
      }

      const discussion = extractSingleDiscussion(discussionElement);
      if (!discussion) {
        console.error("[Gitlab Extended] Could not extract discussion");
        return;
      }

      const prompt = formatSingleDiscussionAsPrompt(discussion);
      const success = await copyToClipboard(prompt);

      if (success) {
        button.title = "Copied!";
        button.style.color = "var(--yellow-500, #f5d547)";
        setTimeout(() => {
          button.title = "Copy as AI prompt (Gitlab Extended)";
          button.style.color = "";
        }, 2000);
      } else {
        button.title = "Failed to copy";
        button.style.color = "var(--red-500, #dd2b0e)";
        setTimeout(() => {
          button.title = "Copy as AI prompt (Gitlab Extended)";
          button.style.color = "";
        }, 2000);
      }
    };

    const firstActionButton = comment.querySelector(
      "div.note-actions button.note-action-button",
    );

    firstActionButton?.insertAdjacentElement("beforebegin", button);

    comment.setAttribute(AI_BUTTON_MARKER, "true");
  }
};

const toggleResolvedBadge = (
  issue: HTMLDivElement,
  removeIfPresent: boolean,
) => {
  const HAS_RESOLVED_BADGE_MARKER = "data-gitlab-extended-resolve";
  const BADGE_MARKER = "data-gitlab-extended-resolve-badge";

  if (removeIfPresent) {
    const badge = issue.querySelector(`span[${BADGE_MARKER}]`);
    badge?.remove();

    return;
  }

  if (issue.hasAttribute(HAS_RESOLVED_BADGE_MARKER)) {
    return;
  }

  issue.setAttribute(HAS_RESOLVED_BADGE_MARKER, "true");

  const badge = document.createElement("span");
  badge.setAttribute(BADGE_MARKER, "true");

  badge.classList.add(
    "badge",
    "gl-badge",
    "gl-shrink-0",
    "badge-success",
    "badge-pill",
    "gl-ml-auto",
  );

  const badgeIcon = createEmojiSvg(EMOJI_BG_COLOR, EMOJI_SVG);
  badgeIcon.classList.add("gl-badge-icon", "gl-icon");
  badgeIcon.style.width = "12px";
  badge.appendChild(badgeIcon);

  const badgeText = document.createElement("span");
  badgeText.classList.add("gl-badge-content");
  badgeText.textContent = "Resolved";
  badge.appendChild(badgeText);

  // div with class note-header-info
  const header = issue.querySelector("div.note-header-info")!;
  header.appendChild(badge);
  header.classList.add("gl-flex", "gl-gap-1");
};

function extractCsrfToken() {
  const scripts = document.querySelectorAll("script");
  for (let script of scripts) {
    if (script.textContent?.includes("X-CSRF-Token")) {
      const match = script.textContent.match(/"X-CSRF-Token"\s*:\s*"([^"]+)"/);
      if (match) {
        return match[1];
      }
    }
  }
  return null;
}

// Utilities and whatnot to load dynamic from local storage

function loadConstants() {
  const EMOJI = getFromStorage("emoji") || "seedling";
  const EMOJI_PLURAL = getFromStorage("emoji_plural") || "seedlings";
  const EMOJI_EMOJI = getFromStorage("emoji_emoji") || "🌱";
  const EMOJI_SVG = getFromStorage("emoji_svg") || createFallbackEmojiSvg();
  const EMOJI_BG_COLOR = getFromStorage("emoji_bg_color") || "#072b15";
  const JIRA_URL = getFromStorage("jira_url") || "";
  const JIRA_PREFIX = getFromStorage("jira_prefix") || "";

  // Set everything in local storage
  setInStorage("emoji", EMOJI);
  setInStorage("emoji_plural", EMOJI_PLURAL);
  setInStorage("emoji_emoji", EMOJI_EMOJI);
  setInStorage("emoji_svg", EMOJI_SVG);
  setInStorage("emoji_bg_color", EMOJI_BG_COLOR);
  setInStorage("jira_url", JIRA_URL);
  setInStorage("jira_prefix", JIRA_PREFIX);

  return {
    EMOJI,
    EMOJI_BG_COLOR,
    EMOJI_EMOJI,
    EMOJI_PLURAL,
    EMOJI_SVG,
    JIRA_URL,
    JIRA_PREFIX,
  };
}

function getFromStorage(key: string) {
  return localStorage.getItem(`__gitlab-extended-${key}`);
}

function setInStorage(key: string, value: string) {
  localStorage.setItem(`__gitlab-extended-${key}`, value);
}

function setupDiscussionCounterListener() {
  const observer = new MutationObserver(() => {
    if (hasDiscussionTotalCounter()) {
      const success = showTotalWithoutEmojis();
      if (success) {
        observer.disconnect();
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  if (hasDiscussionTotalCounter()) {
    const success = showTotalWithoutEmojis();
    if (success) {
      observer.disconnect();
    }
  }
}

function hasDiscussionTotalCounter() {
  const counters = document.querySelectorAll(
    'div[data-testid="discussions-counter-text"]',
  );

  // Mobile and desktop views have different counters, wait for both
  return counters.length >= 1;
}

export const setupMROverview = () => {
  addCollapseAllEmojisButtonToPage();
  addCopyOpenCommentsButtonToPage();
  addViewInJiraButton(JIRA_URL, JIRA_PREFIX);

  setupDiscussionCounterListener();

  const observer = new MutationObserver(() => {
    setupClickEventListeners();
    collapseIssuesWithEmoji();
    addBadgeToEmojiCollapsedIssues();
    addAiCopyButtonsToComments();

    const csrfToken = extractCsrfToken();
    if (csrfToken) {
      addButtonsToResolveIssues(csrfToken);
    } else {
      console.error(
        "No CSRF token found, cannot add buttons to resolve issues",
      );
    }
  });

  // Start observing the body for changes
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
};
