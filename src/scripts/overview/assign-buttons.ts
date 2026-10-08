interface MRContext {
  projectPath: string;
  iid: string;
  authorUsername: string;
  currentUsername: string;
}

const BUTTON_MARKER = "data-gitlab-extended-assign-button";

// The sidebar is rendered by Vue, so match on both the legacy classes and the
// test ids in case one of them changes
const ASSIGNEE_BLOCK_SELECTOR =
  '.block.assignee, [data-testid="assignee-block-container"], .block:has([data-testid="assignees-edit-button"])';
const REVIEWER_BLOCK_SELECTOR =
  '.block.reviewer, [data-testid="reviewers-block-container"]';

// Give GitLab's realtime sidebar updates a moment before falling back to a reload
const SIDEBAR_UPDATE_TIMEOUT_MS = 2000;

const getCsrfToken = () =>
  document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ??
  null;

const parseMRUrl = () => {
  const match = window.location.pathname.match(
    /^\/(.+?)\/-\/merge_requests\/(\d+)/,
  );
  if (!match) {
    return null;
  }

  return { projectPath: match[1]!, iid: match[2]! };
};

const graphql = async <T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> => {
  const csrfToken = getCsrfToken();
  if (!csrfToken) {
    throw new Error("No CSRF token found");
  }

  const response = await fetch("/api/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await response.json();
  if (!response.ok || json.errors?.length) {
    throw new Error(
      `GraphQL request failed: ${JSON.stringify(json.errors ?? json)}`,
    );
  }

  return json.data;
};

let mrContextPromise: Promise<MRContext | null> | null = null;

const loadMRContext = () => {
  mrContextPromise ??= (async () => {
    const urlInfo = parseMRUrl();
    if (!urlInfo) {
      return null;
    }

    const data = await graphql<{
      currentUser: { username: string } | null;
      project: {
        mergeRequest: { author: { username: string } | null } | null;
      } | null;
    }>(
      `
        query GitlabExtendedMRContext($projectPath: ID!, $iid: String!) {
          currentUser {
            username
          }
          project(fullPath: $projectPath) {
            mergeRequest(iid: $iid) {
              author {
                username
              }
            }
          }
        }
      `,
      urlInfo,
    );

    const currentUsername = data.currentUser?.username;
    const authorUsername = data.project?.mergeRequest?.author?.username;
    if (!currentUsername || !authorUsername) {
      return null;
    }

    return { ...urlInfo, currentUsername, authorUsername };
  })().catch((error) => {
    console.error("[Gitlab Extended] Could not load MR info", error);
    mrContextPromise = null;
    return null;
  });

  return mrContextPromise;
};

const throwOnMutationErrors = (errors: string[]) => {
  if (errors.length) {
    throw new Error(errors.join(", "));
  }
};

const setAssignees = async (context: MRContext, usernames: string[]) => {
  const data = await graphql<{
    mergeRequestSetAssignees: { errors: string[] };
  }>(
    `
      mutation GitlabExtendedSetAssignees(
        $projectPath: ID!
        $iid: String!
        $usernames: [String!]!
      ) {
        mergeRequestSetAssignees(
          input: {
            projectPath: $projectPath
            iid: $iid
            assigneeUsernames: $usernames
            operationMode: REPLACE
          }
        ) {
          errors
        }
      }
    `,
    { projectPath: context.projectPath, iid: context.iid, usernames },
  );
  throwOnMutationErrors(data.mergeRequestSetAssignees.errors);
};

const setReviewers = async (
  context: MRContext,
  usernames: string[],
  operationMode: "APPEND" | "REMOVE",
) => {
  const data = await graphql<{
    mergeRequestSetReviewers: { errors: string[] };
  }>(
    `
      mutation GitlabExtendedSetReviewers(
        $projectPath: ID!
        $iid: String!
        $usernames: [String!]!
        $operationMode: MutationOperationMode!
      ) {
        mergeRequestSetReviewers(
          input: {
            projectPath: $projectPath
            iid: $iid
            reviewerUsernames: $usernames
            operationMode: $operationMode
          }
        ) {
          errors
        }
      }
    `,
    {
      projectPath: context.projectPath,
      iid: context.iid,
      usernames,
      operationMode,
    },
  );
  throwOnMutationErrors(data.mergeRequestSetReviewers.errors);
};

const NO_VALUE_SELECTOR = '[data-testid="no-value"]';

const blockShowsUser = (block: Element, username: string) =>
  [...block.querySelectorAll<HTMLAnchorElement>("a[href]")].some(
    (link) => new URL(link.href).pathname === `/${username}`,
  );

const waitForSidebarOrReload = (
  blockSelector: string,
  username: string,
  { expectShown = true } = {},
) => {
  setTimeout(() => {
    const block = document.querySelector(blockSelector);
    const isShown = !!block && blockShowsUser(block, username);
    if (isShown !== expectShown) {
      window.location.reload();
    }
  }, SIDEBAR_UPDATE_TIMEOUT_MS);
};

// Mirrors GitLab's own "assign yourself" link button
const createLinkButton = (label: string, onClick: () => Promise<void>) => {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute(BUTTON_MARKER, "true");
  button.classList.add(
    "!gl-text-inherit",
    "hover:!gl-text-link",
    "btn",
    "gl-button",
    "btn-link",
    "btn-md",
  );

  const buttonText = document.createElement("span");
  buttonText.classList.add("gl-button-text");
  buttonText.textContent = label;
  button.appendChild(buttonText);

  button.onclick = async () => {
    button.disabled = true;
    try {
      await onClick();
    } catch (error) {
      console.error(`[Gitlab Extended] "${label}" failed`, error);
    } finally {
      button.disabled = false;
    }
  };

  return button;
};

// Turns "None - assign yourself" into "None - assign yourself or assign creator"
const addAssignCreatorButton = (context: MRContext) => {
  // The empty assignee state isn't always marked as "no-value", so anchor on
  // GitLab's own "assign yourself" button instead
  const assignYourself = document
    .querySelector(ASSIGNEE_BLOCK_SELECTOR)
    ?.querySelector('[data-testid="assign-yourself"]');
  if (
    !assignYourself ||
    assignYourself.parentElement?.querySelector(`[${BUTTON_MARKER}]`)
  ) {
    return;
  }

  const separator = document.createElement("span");
  separator.classList.add("gl-ml-2");
  separator.setAttribute(BUTTON_MARKER, "true");
  separator.textContent = "or";

  const button = createLinkButton("assign creator", async () => {
    await setAssignees(context, [context.authorUsername]);
    waitForSidebarOrReload(ASSIGNEE_BLOCK_SELECTOR, context.authorUsername);
  });
  button.classList.add("gl-ml-2");

  assignYourself.after(separator, button);
};

// With no reviewers GitLab already offers "assign yourself", so only add one
// when someone else is reviewing
const addAssignMeAsReviewerButton = (context: MRContext) => {
  const block = document.querySelector(REVIEWER_BLOCK_SELECTOR);
  if (!block) {
    return;
  }

  const existing = block.querySelector(`:scope > [${BUTTON_MARKER}]`);
  const shouldShow =
    !block.querySelector(NO_VALUE_SELECTOR) &&
    !blockShowsUser(block, context.currentUsername);

  if (!shouldShow) {
    existing?.remove();
    return;
  }

  if (existing) {
    return;
  }

  const row = document.createElement("span");
  row.setAttribute(BUTTON_MARKER, "true");
  row.classList.add(
    "gl-flex",
    "gl-text-base",
    "gl-leading-normal",
    "!gl-text-subtle",
    "gl-mt-2",
  );
  row.appendChild(
    createLinkButton("assign yourself", async () => {
      await setReviewers(context, [context.currentUsername], "APPEND");
      waitForSidebarOrReload(REVIEWER_BLOCK_SELECTOR, context.currentUsername);
    }),
  );

  block.appendChild(row);
};

const SVG_NS = "http://www.w3.org/2000/svg";

// Reuse GitLab's icon sprite so the icon matches the rest of the sidebar,
// falling back to a hand-drawn X if the sprite can't be found
const createCloseIcon = () => {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.classList.add("gl-button-icon", "gl-icon", "s16", "gl-fill-current");
  // The close glyph looks small next to GitLab's circular reviewer icons, and
  // GitLab's button styles pin the icon's width and height, so scale it instead
  svg.style.transform = "scale(1.35)";

  const spriteHref = document
    .querySelector("svg.gl-icon use[href*='.svg#']")
    ?.getAttribute("href");

  if (spriteHref) {
    const use = document.createElementNS(SVG_NS, "use");
    use.setAttribute("href", `${spriteHref.split("#")[0]}#close`);
    svg.appendChild(use);
    return svg;
  }

  svg.setAttribute("viewBox", "0 0 16 16");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", "M4 4l8 8M12 4l-8 8");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.5");
  path.setAttribute("stroke-linecap", "round");
  svg.appendChild(path);
  return svg;
};

const getReviewerRows = (block: Element) => {
  const rows = new Map<Element, string>();

  for (const link of block.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    if (link.closest(`[${BUTTON_MARKER}]`)) {
      continue;
    }

    const username = new URL(link.href).pathname.match(/^\/([^/]+)$/)?.[1];
    const row = link.closest('[data-testid="reviewer"]') ?? link.parentElement;
    if (username && row && !rows.has(row)) {
      rows.set(row, username);
    }
  }

  return rows;
};

const addRemoveReviewerButtons = (context: MRContext) => {
  const block = document.querySelector(REVIEWER_BLOCK_SELECTOR);
  if (!block) {
    return;
  }

  for (const [row, username] of getReviewerRows(block)) {
    if (row.querySelector(`:scope > [${BUTTON_MARKER}]`)) {
      continue;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.title = `Remove ${username} as reviewer`;
    button.setAttribute("aria-label", button.title);
    button.setAttribute(BUTTON_MARKER, "true");
    button.classList.add(
      "!gl-text-subtle",
      "btn",
      "gl-button",
      "btn-default",
      "btn-sm",
      "btn-default-tertiary",
      "btn-icon",
      "gl-ml-2",
      "gl-shrink-0",
    );
    button.appendChild(createCloseIcon());

    button.onclick = async () => {
      button.disabled = true;
      try {
        await setReviewers(context, [username], "REMOVE");
        waitForSidebarOrReload(REVIEWER_BLOCK_SELECTOR, username, {
          expectShown: false,
        });
      } catch (error) {
        console.error(
          `[Gitlab Extended] Removing reviewer ${username} failed`,
          error,
        );
      } finally {
        button.disabled = false;
      }
    };

    row.appendChild(button);
  }
};

export const addAssignButtons = async () => {
  if (
    !document.querySelector(ASSIGNEE_BLOCK_SELECTOR) &&
    !document.querySelector(REVIEWER_BLOCK_SELECTOR)
  ) {
    return;
  }

  const context = await loadMRContext();
  if (!context) {
    return;
  }

  addAssignCreatorButton(context);
  addAssignMeAsReviewerButton(context);
  addRemoveReviewerButtons(context);
};
