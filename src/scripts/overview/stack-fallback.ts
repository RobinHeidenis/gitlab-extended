import { createGitlabIcon } from "../icons/gitlab";
import { graphql, parseMRUrl } from "../shared/gitlab-api";

type StackMR = {
  id: string;
  iid: string;
  title: string;
  webPath: string;
  createdAt: string;
  sourceBranch: string;
  targetBranch: string;
  author: { username: string } | null;
  diffStatsSummary: {
    fileCount: number;
    additions: number;
    deletions: number;
  } | null;
};

// GitLab hides its own stack control past this size, so do the same
const MAX_STACK_SIZE = 20;

const MARKER = "data-gitlab-extended-stack-fallback";
const TREE_TITLE_MARKER = "data-gitlab-extended-stack-title";

const STACK_MR_FIELDS = `
  id
  iid
  title
  webPath
  createdAt
  sourceBranch
  targetBranch
  author { username }
  diffStatsSummary { fileCount additions deletions }
`;

const loadCurrentMR = async (projectPath: string, iid: string) => {
  const data = await graphql<{
    project: {
      repository: { rootRef: string | null } | null;
      mergeRequest: (StackMR & { stack: { id: string }[] | null }) | null;
    } | null;
  }>(
    `
      query GitlabExtendedStackCurrent($projectPath: ID!, $iid: String!) {
        project(fullPath: $projectPath) {
          repository { rootRef }
          mergeRequest(iid: $iid) {
            ${STACK_MR_FIELDS}
            stack { id }
          }
        }
      }
    `,
    { projectPath, iid },
  );

  const mergeRequest = data.project?.mergeRequest;
  const defaultBranch = data.project?.repository?.rootRef;
  if (!mergeRequest || !defaultBranch) {
    return null;
  }

  return {
    mergeRequest,
    defaultBranch,
    nativeStackIds: new Set((mergeRequest.stack ?? []).map(({ id }) => id)),
  };
};

const findOpenMRs = async (
  projectPath: string,
  filter:
    | { sourceBranches: readonly string[] }
    | { targetBranches: readonly string[] },
) => {
  const data = await graphql<{
    project: { mergeRequests: { nodes: StackMR[] } } | null;
  }>(
    `
      query GitlabExtendedStackLookup(
        $projectPath: ID!
        $sourceBranches: [String!]
        $targetBranches: [String!]
      ) {
        project(fullPath: $projectPath) {
          mergeRequests(
            state: opened
            sourceBranches: $sourceBranches
            targetBranches: $targetBranches
            first: ${MAX_STACK_SIZE + 1}
          ) {
            nodes { ${STACK_MR_FIELDS} }
          }
        }
      }
    `,
    { projectPath, ...filter },
  );

  return data.project?.mergeRequests.nodes ?? [];
};

type StackTree = {
  root: StackMR;
  childrenById: ReadonlyMap<string, readonly StackMR[]>;
  all: readonly StackMR[];
};

// The whole tree under the bottom MR, so siblings that fork off the same
// branch show up too. Null when it outgrows MAX_STACK_SIZE.
const loadStackTree = async (
  projectPath: string,
  current: StackMR,
  defaultBranch: string,
): Promise<StackTree | null> => {
  const seenIds = new Set([current.id]);

  let root = current;
  while (
    root.targetBranch !== defaultBranch &&
    seenIds.size <= MAX_STACK_SIZE
  ) {
    const [parent] = await findOpenMRs(projectPath, {
      sourceBranches: [root.targetBranch],
    });
    if (!parent || seenIds.has(parent.id)) {
      break;
    }
    seenIds.add(parent.id);
    root = parent;
  }

  const all: StackMR[] = [root];
  const childrenById = new Map<string, StackMR[]>();
  const visitedIds = new Set([root.id]);
  let level = [root];
  while (level.length && all.length <= MAX_STACK_SIZE) {
    const children = (
      await findOpenMRs(projectPath, {
        targetBranches: level.map(({ sourceBranch }) => sourceBranch),
      })
    )
      .filter(({ id }) => !visitedIds.has(id))
      .toSorted((a, b) => Number(a.iid) - Number(b.iid));

    for (const child of children) {
      visitedIds.add(child.id);
      const parent = level.find(
        ({ sourceBranch }) => sourceBranch === child.targetBranch,
      );
      if (parent) {
        childrenById.set(parent.id, [
          ...(childrenById.get(parent.id) ?? []),
          child,
        ]);
      }
    }
    all.push(...children);
    level = children;
  }

  return all.length > MAX_STACK_SIZE ? null : { root, childrenById, all };
};

const findPathFromRoot = (
  tree: StackTree,
  target: StackMR,
  node = tree.root,
): StackMR[] | null => {
  if (node.id === target.id) {
    return [node];
  }
  for (const child of tree.childrenById.get(node.id) ?? []) {
    const path = findPathFromRoot(tree, target, child);
    if (path) {
      return [node, ...path];
    }
  }
  return null;
};

const countLongestChainAbove = (tree: StackTree, node: StackMR): number =>
  Math.max(
    0,
    ...(tree.childrenById.get(node.id) ?? []).map(
      (child) => 1 + countLongestChainAbove(tree, child),
    ),
  );

const relativeTime = (isoDate: string) => {
  const formatter = new Intl.RelativeTimeFormat(undefined, {
    numeric: "always",
  });
  const seconds = (new Date(isoDate).getTime() - Date.now()) / 1000;

  const units: readonly [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["week", 60 * 60 * 24 * 7],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
  ];
  for (const [unit, unitSeconds] of units) {
    if (Math.abs(seconds) >= unitSeconds) {
      return formatter.format(Math.round(seconds / unitSeconds), unit);
    }
  }
  return formatter.format(0, "minute");
};

const withIcon = (name: string, size = 16) => {
  const icon = createGitlabIcon(name);
  if (icon && size !== 16) {
    icon.classList.replace("s16", `s${size}`);
  }
  return icon;
};

const StackLayout = {
  List: "list",
  Tree: "tree",
} as const;
type StackLayout = (typeof StackLayout)[keyof typeof StackLayout];

const TREE_INDENT = 18;
const TREE_ELBOW_INSET = 12;
const SVG_NS = "http://www.w3.org/2000/svg";

const createArrowSlot = (isCurrent: boolean) => {
  const arrow = withIcon("arrow-right");
  arrow?.classList.add("gl-shrink-0");
  arrow?.classList.toggle("gl-invisible", !isCurrent);
  return arrow;
};

const createTreeIndent = (depth: number) => {
  const indent = document.createElement("span");
  indent.classList.add("gl-shrink-0");
  // The bottom MR sits right after the arrow column; its line comes from the branch icon
  indent.style.width = `${Math.max(0, depth - 1) * TREE_INDENT}px`;
  return indent;
};

// Plain markup on purpose: GitLab's dropdown row classes add vertical padding here
const createDefaultBranchItem = (defaultBranch: string) => {
  const li = document.createElement("li");
  li.setAttribute("role", "none");
  li.style.padding = "0.25rem 0.75rem 0.125rem";

  const chip = createDefaultBranchChip(defaultBranch);
  chip.setAttribute(TREE_TITLE_MARKER, "true");
  li.appendChild(chip);
  return li;
};

const createStackItem = (
  mr: StackMR,
  isCurrent: boolean,
  layout: StackLayout,
  depth = 0,
) => {
  const li = document.createElement("li");
  li.classList.add("gl-new-dropdown-item");

  const link = document.createElement("a");
  link.classList.add("gl-new-dropdown-item-content", "!gl-no-underline");
  link.href = mr.webPath;

  const row = document.createElement("span");
  row.classList.add("gl-new-dropdown-item-text-wrapper", "gl-flex", "gl-gap-3");

  const arrow = createArrowSlot(isCurrent);
  if (arrow) {
    row.appendChild(arrow);
  }
  if (layout === StackLayout.Tree) {
    row.classList.replace("gl-gap-3", "gl-gap-2");
    row.appendChild(createTreeIndent(depth));
  }

  const text = document.createElement("span");
  text.classList.add("gl-flex", "gl-flex-col", "gl-gap-2");
  const title = document.createElement("span");
  title.setAttribute(TREE_TITLE_MARKER, "true");
  title.textContent = mr.title;
  if (isCurrent && layout === StackLayout.Tree) {
    title.classList.add("gl-font-bold");
  }
  const meta = document.createElement("span");
  meta.classList.add("gl-text-sm", "gl-text-subtle");
  meta.textContent = mr.author
    ? `Open ${relativeTime(mr.createdAt)} by @${mr.author.username}`
    : `Open ${relativeTime(mr.createdAt)}`;
  meta.title = new Date(mr.createdAt).toLocaleString();
  text.append(title, meta);
  row.appendChild(text);

  if (mr.diffStatsSummary) {
    const { fileCount, additions, deletions } = mr.diffStatsSummary;
    const stats = document.createElement("span");
    stats.classList.add(
      "gl-ml-auto",
      "gl-inline-flex",
      "gl-items-start",
      "gl-gap-2",
    );

    const files = document.createElement("span");
    files.classList.add(
      "gl-inline-flex",
      "gl-items-center",
      "gl-gap-1",
      "gl-whitespace-nowrap",
    );
    const fileIcon = withIcon("doc-new", 12);
    if (fileIcon) {
      fileIcon.classList.remove("gl-button-icon");
      files.appendChild(fileIcon);
    }
    files.append(`${fileCount}`);
    stats.appendChild(files);

    if (additions) {
      const added = document.createElement("span");
      added.classList.add("gl-text-success");
      added.textContent = `+${additions}`;
      stats.appendChild(added);
    }
    if (deletions) {
      const removed = document.createElement("span");
      removed.classList.add("gl-text-danger");
      removed.textContent = `-${deletions}`;
      stats.appendChild(removed);
    }
    row.appendChild(stats);
  }

  link.appendChild(row);
  li.appendChild(link);
  return li;
};

type TreeRow = { mr: StackMR; depth: number; parent: StackMR | null };

// The bottom MR first, every MR indented one step under the MR it targets
const layoutTree = (tree: StackTree) => {
  const rows: TreeRow[] = [];
  const visit = (mr: StackMR, depth: number, parent: StackMR | null) => {
    rows.push({ mr, depth, parent });
    for (const child of tree.childrenById.get(mr.id) ?? []) {
      visit(child, depth + 1, mr);
    }
  };
  visit(tree.root, 1, null);
  return rows;
};

const createDefaultBranchChip = (defaultBranch: string) => {
  const chip = document.createElement("span");
  chip.classList.add(
    "ref-container",
    "gl-relative",
    "gl-top-1",
    "gl-inline-flex",
    "gl-max-w-26",
    "gl-gap-2",
    "gl-truncate",
    "gl-rounded-base",
    "gl-px-2",
    "gl-font-monospace",
    "gl-text-sm",
  );
  const branchIcon = withIcon("branch", 12);
  if (branchIcon) {
    branchIcon.classList.remove("gl-button-icon");
    branchIcon.classList.add("gl-self-center");
    chip.appendChild(branchIcon);
  }
  chip.append(defaultBranch);
  return chip;
};

// Elbows need the rendered row positions, so they're drawn each time the panel opens
const drawTreeElbows = (
  list: HTMLElement,
  svg: SVGSVGElement,
  rows: readonly TreeRow[],
  itemById: ReadonlyMap<string, HTMLElement>,
  defaultBranchItem: HTMLElement,
  currentPathIds: ReadonlySet<string>,
  currentId: string,
) => {
  const listRect = list.getBoundingClientRect();
  const toListX = (x: number) => x - listRect.left + list.scrollLeft;
  const toListY = (y: number) => y - listRect.top + list.scrollTop;

  svg.setAttribute("height", `${list.scrollHeight}`);
  svg.replaceChildren();

  // Siblings share the line down from their parent, so draw the current path last to keep it on top
  const rowsCurrentPathLast = rows.toSorted(
    (a, b) =>
      Number(currentPathIds.has(a.mr.id)) - Number(currentPathIds.has(b.mr.id)),
  );

  for (const { mr, parent } of rowsCurrentPathLast) {
    const parentItem = parent ? itemById.get(parent.id) : defaultBranchItem;
    const childTitle = itemById
      .get(mr.id)
      ?.querySelector(`[${TREE_TITLE_MARKER}]`);
    if (!parentItem || !childTitle) {
      continue;
    }

    const titleRect = childTitle.getBoundingClientRect();
    const lineHeight =
      parseFloat(getComputedStyle(childTitle).lineHeight) || 20;
    const branchIconRect = parent
      ? null
      : defaultBranchItem.querySelector("svg")?.getBoundingClientRect();
    const x = branchIconRect
      ? toListX(branchIconRect.left + branchIconRect.width / 2)
      : toListX(titleRect.left) - TREE_ELBOW_INSET;
    const top = toListY(parentItem.getBoundingClientRect().bottom) - 2;
    const y = toListY(titleRect.top) + lineHeight / 2;
    const end = toListX(titleRect.left) - 4;
    // The arrow column sits under the branch icon, so stop the line above the arrow
    const endsAtArrow = !parent && mr.id === currentId;

    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute(
      "d",
      endsAtArrow
        ? `M ${x} ${top} V ${y - 9}`
        : `M ${x} ${top} V ${y - 5} Q ${x} ${y} ${x + 5} ${y} H ${end}`,
    );
    path.setAttribute("fill", "none");
    path.setAttribute("stroke-width", "1.5");
    path.setAttribute(
      "stroke",
      currentPathIds.has(mr.id)
        ? "var(--gl-text-color-default, #333238)"
        : "var(--gl-border-color-strong, #bfbfc3)",
    );
    svg.appendChild(path);
  }
};

// Mirrors the markup of GitLab's own stack dropdown, so its styles apply
const createStackDropdown = (
  tree: StackTree,
  current: StackMR,
  defaultBranch: string,
) => {
  const pathFromRoot = findPathFromRoot(tree, current) ?? [current];
  const position = pathFromRoot.length;
  const chainLength = position + countLongestChainAbove(tree, current);
  const forks = [...tree.childrenById.values()].some(
    (children) => children.length > 1,
  );
  const label = `${position} of ${chainLength}`;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.classList.add("btn", "btn-default", "btn-sm", "gl-button");
  toggle.title = forks
    ? `Stacked merge requests: ${tree.all.length} in a tree (Gitlab Extended)`
    : "Stacked merge requests (Gitlab Extended)";
  toggle.setAttribute("aria-label", `Merge request ${label} in stack`);
  toggle.setAttribute("aria-haspopup", "menu");
  toggle.setAttribute("aria-expanded", "false");

  const toggleText = document.createElement("span");
  toggleText.classList.add(
    "gl-button-text",
    "gl-flex",
    "gl-items-center",
    "gl-gap-2",
  );
  const stackIcon = withIcon("container-image");
  const chevron = withIcon("chevron-down");
  if (stackIcon) {
    toggleText.appendChild(stackIcon);
  }
  toggleText.append(label);
  const forkIcon = forks ? withIcon("fork") : null;
  if (forkIcon) {
    toggleText.appendChild(forkIcon);
  }
  if (chevron) {
    toggleText.appendChild(chevron);
  }
  toggle.appendChild(toggleText);

  const panel = document.createElement("div");
  panel.classList.add("gl-new-dropdown-panel");
  Object.assign(panel.style, {
    display: "none",
    position: "absolute",
    top: "calc(100% + 4px)",
    left: "0",
    width: "28rem",
    maxWidth: "90vw",
    zIndex: "1000",
    backgroundColor:
      "var(--gl-dropdown-background-color, var(--gl-background-color-overlap, #fff))",
    border:
      "1px solid var(--gl-dropdown-border-color, var(--gl-border-color-strong, #dcdcde))",
    borderRadius: "var(--gl-dropdown-border-radius, 0.5rem)",
    boxShadow: "var(--gl-dropdown-shadow, 0 4px 12px rgb(0 0 0 / 0.16))",
  });

  const inner = document.createElement("div");
  inner.classList.add("gl-new-dropdown-inner");

  const header = document.createElement("div");
  header.classList.add(
    "gl-border-b-1",
    "gl-border-b-solid",
    "gl-border-b-dropdown-divider",
    "gl-p-3",
    "gl-text-sm",
    "gl-font-bold",
    "gl-text-strong",
  );
  header.textContent = "Stacked merge requests";

  const list = document.createElement("ul");
  list.classList.add(
    "gl-new-dropdown-contents",
    "gl-list-none",
    "gl-m-0",
    "gl-p-2",
  );
  list.setAttribute("role", "menu");
  const currentPathIds = new Set(pathFromRoot.map(({ id }) => id));
  const layout = forks ? StackLayout.Tree : StackLayout.List;

  const treeRows = layoutTree(tree);
  const itemById = new Map<string, HTMLElement>();
  const defaultBranchItem = createDefaultBranchItem(defaultBranch);

  const treeSvg = document.createElementNS(SVG_NS, "svg");
  treeSvg.setAttribute("width", "100%");
  Object.assign(treeSvg.style, {
    position: "absolute",
    top: "0",
    left: "0",
    pointerEvents: "none",
    overflow: "visible",
  });

  if (layout === StackLayout.Tree) {
    list.style.position = "relative";
    list.appendChild(defaultBranchItem);
    for (const { mr, depth } of treeRows) {
      const item = createStackItem(mr, mr.id === current.id, layout, depth);
      itemById.set(mr.id, item);
      list.appendChild(item);
    }
    list.appendChild(treeSvg);
  } else {
    list.append(
      ...treeRows
        .toReversed()
        .map(({ mr }) => createStackItem(mr, mr.id === current.id, layout)),
    );
  }

  const footer = document.createElement("div");
  footer.classList.add(
    "gl-border-t-1",
    "gl-border-t-solid",
    "gl-border-t-dropdown-divider",
    "gl-p-3",
    "gl-text-sm",
  );
  if (layout === StackLayout.Tree) {
    footer.textContent = "Merge from the top down.";
  } else {
    footer.append(
      "Bottom of stack merges into ",
      createDefaultBranchChip(defaultBranch),
      " first.",
    );
  }

  inner.append(header, list, footer);
  panel.appendChild(inner);

  const container = document.createElement("span");
  container.setAttribute(MARKER, "true");
  container.classList.add(
    "gl-new-dropdown-container",
    "gl-relative",
    "gl-ml-2",
    "gl-mr-2",
    "gl-inline-block",
    "gl-align-middle",
  );

  const close = () => {
    panel.style.display = "none";
    toggle.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", onOutsideClick, true);
  };
  const onOutsideClick = (event: MouseEvent) => {
    if (!container.contains(event.target as Node)) {
      close();
    }
  };

  toggle.onclick = () => {
    if (panel.style.display !== "none") {
      close();
      return;
    }
    panel.style.display = "block";
    toggle.setAttribute("aria-expanded", "true");
    if (layout === StackLayout.Tree) {
      drawTreeElbows(
        list,
        treeSvg,
        treeRows,
        itemById,
        defaultBranchItem,
        currentPathIds,
        current.id,
      );
    }
    document.addEventListener("click", onOutsideClick, true);
  };
  container.onkeydown = (event) => {
    if (event.key === "Escape") {
      close();
      toggle.focus();
    }
  };

  // GitLab scopes its dropdown styles to these wrapper classes
  const dropdown = document.createElement("span");
  dropdown.classList.add("gl-new-dropdown", "gl-disclosure-dropdown");
  dropdown.append(toggle, panel);
  container.appendChild(dropdown);
  return container;
};

// GitLab's control only knows the same-author part of the stack; ours replaces it
const hideNativeStackControl = () => {
  const style = document.createElement("style");
  style.textContent = `.gl-new-dropdown:has(button[aria-label$=" in stack"]):not([${MARKER}] *) { display: none !important; }`;
  document.head.appendChild(style);
};

// The sticky header has its own copy button, hidden until you scroll
const findSourceBranchLink = () => {
  const copyButtons = [...document.querySelectorAll(".js-source-branch-copy")];
  const visibleButton = copyButtons.find((button) =>
    button.checkVisibility({ visibilityProperty: true, opacityProperty: true }),
  );
  return (visibleButton ?? copyButtons[0])?.previousElementSibling ?? null;
};

export const setupStackFallback = async () => {
  const mrUrl = parseMRUrl();
  if (!mrUrl || document.querySelector(`[${MARKER}]`)) {
    return;
  }

  try {
    const loaded = await loadCurrentMR(mrUrl.projectPath, mrUrl.iid);
    if (!loaded) {
      return;
    }
    const { mergeRequest, defaultBranch, nativeStackIds } = loaded;

    const tree = await loadStackTree(
      mrUrl.projectPath,
      mergeRequest,
      defaultBranch,
    );
    if (!tree || tree.all.length < 2) {
      return;
    }
    const gitlabShowsWholeStack = tree.all.every(({ id }) =>
      nativeStackIds.has(id),
    );
    if (gitlabShowsWholeStack) {
      return;
    }

    const sourceBranchLink = findSourceBranchLink();
    if (!sourceBranchLink) {
      console.warn(
        "[Gitlab Extended] Found a stack but not the source branch in the header",
        tree.all.map(({ iid }) => iid),
      );
      return;
    }
    if (document.querySelector(`[${MARKER}]`)) {
      return;
    }
    if (nativeStackIds.size) {
      hideNativeStackControl();
    }
    sourceBranchLink.before(
      createStackDropdown(tree, mergeRequest, defaultBranch),
    );
  } catch (error) {
    console.error(
      "[Gitlab Extended] Could not load the merge request stack",
      error,
    );
  }
};
