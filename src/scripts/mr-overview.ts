import { createEmojiSvg, createFallbackEmojiSvg } from "./icons/emoji";
import { createJiraIcon } from "./icons/jira";

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

const collapseIssuesWithEmoji = () => {
  for (const node of document.querySelectorAll(
    `button[data-testid="award-button"][data-emoji-name="${EMOJI}"]`,
  )) {
    const issue = node.closest("div[data-discussion-id]");

    if (!issue) {
      continue;
    }

    const collapseButton = issue!.querySelector(
      'button[data-testid="collapse-replies-button"]',
    ) as HTMLButtonElement | null;

    if (!collapseButton) {
      continue;
    }

    collapseButton.click();
    issue.setAttribute("data-collapsed-by", "gitlab-extended");
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

const setupClickEventListeners = () => {
  const container = document.getElementById("notes-list");
  if (!container) throw new Error("UHHHH NO NOTES CONTAINER??");

  const issueDivs = container.querySelectorAll("div[data-discussion-id]");

  issueDivs.forEach((div) =>
    div.addEventListener("click", async (event) => {
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

        issue.setAttribute("data-collapsed-by", "gitlab-extended");

        toggleResolvedBadge(issue as HTMLDivElement);

        showTotalWithoutEmojis();
      }
    }),
  );
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
    'div[data-collapsed-by="gitlab-extended"]',
  );

  for (const issue of allCollapsedIssues) {
    toggleResolvedBadge(issue as HTMLDivElement);
  }
};

const addButtonsToResolveIssues = (csrfToken: string) => {
  const issues = document.querySelectorAll<HTMLLIElement>(
    ".discussion-notes ul.notes li.note-comment:first-of-type",
  );

  for (const issue of issues) {
    const button = document.createElement("button");
    button.classList.add(
      "btn",
      "btn-default",
      "btn-sm",
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
      issue.setAttribute("data-collapsed-by", "gitlab-extended");

      toggleResolvedBadge(issue as unknown as HTMLDivElement);
      showTotalWithoutEmojis();
    };

    const firstActionButton = issue.querySelector(
      "div.note-actions button.note-action-button",
    );

    firstActionButton?.insertAdjacentElement("beforebegin", button);
  }
};

const toggleResolvedBadge = (issue: HTMLDivElement) => {
  const badge = document.createElement("span");
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
  const JIRA_URL = getFromStorage("jira_url");
  const JIRA_PREFIX = getFromStorage("jira_prefix");

  // Set everything in local storage
  setInStorage("emoji", EMOJI);
  setInStorage("emoji_plural", EMOJI_PLURAL);
  setInStorage("emoji_emoji", EMOJI_EMOJI);
  setInStorage("emoji_svg", EMOJI_SVG);
  setInStorage("emoji_bg_color", EMOJI_BG_COLOR);

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

const addViewInJiraButton = () => {
  if (!JIRA_URL || !JIRA_PREFIX) {
    console.info(
      "No Jira URL or prefix configured. If you want to be able to see the MRs issue in Jira, please configure the __gitlab-extended-jira_url and __gitlab-extended-jira_prefix in your local storage.",
    );
    return;
  }

  const title = document.getElementsByClassName("title")?.[0];

  if (!title) {
    return;
  }

  const mrTitle = title.textContent?.trim();
  // issue number is in this format: PREFIX-1234 or in some cases people forget the hyphen so PREFIX 1234
  const issueNumber =
    mrTitle?.match(new RegExp(`${JIRA_PREFIX}-\\d+`)) ||
    mrTitle?.match(new RegExp(`${JIRA_PREFIX} \\d+`)) ||
    mrTitle?.match(new RegExp(`${JIRA_PREFIX.toLowerCase()}-\\d+`)) ||
    mrTitle?.match(new RegExp(`${JIRA_PREFIX.toLowerCase()} \\d+`));

  if (!issueNumber) {
    return;
  }

  const jiraButton = document.createElement("a");
  jiraButton.href = `${JIRA_URL}/browse/${issueNumber[0].replace(/\s/g, "-")}`;
  jiraButton.target = "_blank";
  jiraButton.classList.add(
    "btn",
    "btn-default",
    "btn-sm",
    "btn-block",
    "btn-icon",
  );
  jiraButton.style.marginTop = "10px";
  jiraButton.style.display = "flex";
  jiraButton.style.alignItems = "center";
  jiraButton.style.justifyContent = "center";
  jiraButton.style.gap = "8px";

  // Create and add the Jira icon
  const jiraIcon = createJiraIcon();
  jiraIcon.style.flexShrink = "0";
  jiraButton.appendChild(jiraIcon);

  // Create text span
  const buttonText = document.createElement("span");
  buttonText.textContent = "View in Jira";
  jiraButton.appendChild(buttonText);

  const issueSidebar = document.getElementsByClassName(
    "issuable-context-form",
  )?.[0];

  if (!issueSidebar) {
    throw new Error("Could not find issue sidebar");
  }

  issueSidebar.appendChild(jiraButton);
};

export const setupMROverview = () => {
  addCollapseAllEmojisButtonToPage();
  addViewInJiraButton();

  setTimeout(() => {
    setupClickEventListeners();
    collapseIssuesWithEmoji();
    addBadgeToEmojiCollapsedIssues();

    const csrfToken = extractCsrfToken();
    if (csrfToken) {
      addButtonsToResolveIssues(csrfToken);
    } else {
      console.error(
        "No CSRF token found, cannot add buttons to resolve issues",
      );
    }
  }, 3000);

  setupDiscussionCounterListener();
};
