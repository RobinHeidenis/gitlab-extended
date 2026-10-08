/**
##################################################
#                                                #
#        Test vs. code breakdown adapted from    #
#        a script by Julien (JulienZD)           #
#                                                #
##################################################
*/

interface FileStat {
  path: string;
  additions: number;
  deletions: number;
}

interface StatsSummary {
  files: number;
  additions: number;
  deletions: number;
}

interface StatsBreakdown {
  code: StatsSummary;
  tests: StatsSummary;
  lockfiles: StatsSummary;
  total: StatsSummary;
}

const POPOVER_ID = "gitlab-extended-diff-stats-popover";

// Both diffs UIs render the MR-wide stats in a `.diff-stats` element; the old
// Vue UI reuses the same component in every file header, so skip those
const TRIGGER_SELECTOR = ".diff-stats";
const FILE_SELECTOR = '.diff-file, [data-testid="rd-diff-file"]';

const TEST_DIRECTORIES = [
  "test",
  "tests",
  "spec",
  "__tests__",
  "__mocks__",
  "__snapshots__",
  "e2e",
];

const isTestOrStory = (filePath: string) =>
  /(?:[._](?:test|spec)|\.stories)\./.test(filePath) ||
  filePath
    .split("/")
    .slice(0, -1)
    .some((segment) => TEST_DIRECTORIES.includes(segment));

const LOCKFILES = [
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
  "deno.lock",
  "Gemfile.lock",
  "Cargo.lock",
  "composer.lock",
  "poetry.lock",
  "Pipfile.lock",
  "uv.lock",
  "go.sum",
  "flake.lock",
  "Podfile.lock",
  "pubspec.lock",
  "mix.lock",
  "packages.lock.json",
  "gradle.lockfile",
];

const isLockfile = (filePath: string) =>
  LOCKFILES.includes(filePath.split("/").at(-1) ?? "");

const sum = (files: FileStat[]): StatsSummary => ({
  files: files.length,
  additions: files.reduce((n, f) => n + f.additions, 0),
  deletions: files.reduce((n, f) => n + f.deletions, 0),
});

const getMergeRequestFromLocation = () => {
  const match = location.pathname.match(/^\/(.+?)\/-\/merge_requests\/(\d+)/);
  if (!match) {
    return null;
  }
  const [, path, iid] = match;
  return path && iid ? { path, iid } : null;
};

const breakdownCache = new Map<string, Promise<StatsBreakdown>>();

const fetchBreakdown = async (
  path: string,
  iid: string,
): Promise<StatsBreakdown> => {
  const response = await fetch("/api/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-CSRF-Token":
        document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
          ?.content ?? "",
    },
    body: JSON.stringify({
      query: `query($path: ID!, $iid: String!) {
        project(fullPath: $path) {
          mergeRequest(iid: $iid) {
            diffStatsSummary { additions deletions fileCount }
            diffStats { path additions deletions }
          }
        }
      }`,
      variables: { path, iid },
    }),
  });

  const json = await response.json();
  const mr = json.data?.project?.mergeRequest;
  if (!response.ok || !mr) {
    throw new Error(`Failed to load diff stats (${response.status})`);
  }

  const allFiles: FileStat[] = mr.diffStats ?? [];
  const files = allFiles.filter((f) => !isLockfile(f.path));
  return {
    code: sum(files.filter((f) => !isTestOrStory(f.path))),
    tests: sum(files.filter((f) => isTestOrStory(f.path))),
    lockfiles: sum(allFiles.filter((f) => isLockfile(f.path))),
    total: {
      files: mr.diffStatsSummary.fileCount,
      additions: mr.diffStatsSummary.additions,
      deletions: mr.diffStatsSummary.deletions,
    },
  };
};

const getBreakdown = (path: string, iid: string) => {
  const key = `${path}!${iid}`;
  let breakdown = breakdownCache.get(key);
  if (!breakdown) {
    breakdown = fetchBreakdown(path, iid);
    // Don't cache failures, so the next hover retries
    breakdown.catch(() => breakdownCache.delete(key));
    breakdownCache.set(key, breakdown);
  }
  return breakdown;
};

const getOrCreatePopover = () => {
  let popover = document.getElementById(POPOVER_ID);
  if (popover) {
    return popover;
  }

  popover = document.createElement("div");
  popover.id = POPOVER_ID;
  popover.setAttribute("role", "tooltip");
  Object.assign(popover.style, {
    position: "fixed",
    zIndex: "1100",
    display: "none",
    padding: "8px 12px",
    borderRadius: "8px",
    border: "1px solid var(--gl-border-color-default, #dcdcde)",
    background: "var(--gl-background-color-overlap, #fff)",
    color: "var(--gl-text-color-default, #3a383f)",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
    fontSize: "13px",
    pointerEvents: "none",
  });
  document.body.appendChild(popover);
  return popover;
};

const renderMessage = (popover: HTMLElement, message: string) => {
  popover.replaceChildren(message);
};

const renderBreakdown = (popover: HTMLElement, breakdown: StatsBreakdown) => {
  const table = document.createElement("table");
  table.style.borderCollapse = "collapse";

  const rows: [string, StatsSummary][] = [
    ["Code", breakdown.code],
    ["Tests & stories", breakdown.tests],
    // Shown so the rows still add up to GitLab's total
    ...(breakdown.lockfiles.files > 0
      ? [["Lockfiles (ignored)", breakdown.lockfiles] as [string, StatsSummary]]
      : []),
    ["Total", breakdown.total],
  ];

  for (const [label, stats] of rows) {
    const row = table.insertRow();
    if (stats === breakdown.lockfiles) {
      row.style.opacity = "0.6";
    }
    if (label === "Total") {
      row.style.borderTop = "1px solid var(--gl-border-color-default, #dcdcde)";
      row.style.fontWeight = "bold";
    }

    const cells: [string, string?][] = [
      [label],
      [`${stats.files} ${stats.files === 1 ? "file" : "files"}`],
      [`+${stats.additions}`, "gl-text-success"],
      [`−${stats.deletions}`, "gl-text-danger"],
    ];

    cells.forEach(([text, className], index) => {
      const cell = row.insertCell();
      cell.textContent = text;
      cell.style.padding = "2px 6px";
      cell.style.whiteSpace = "nowrap";
      cell.style.textAlign = index === 0 ? "left" : "right";
      if (className) {
        cell.className = className;
      }
    });
  }

  popover.replaceChildren(table);
};

const positionPopover = (popover: HTMLElement, trigger: HTMLElement) => {
  const rect = trigger.getBoundingClientRect();
  const popoverRect = popover.getBoundingClientRect();
  const left = Math.max(
    8,
    Math.min(
      rect.right - popoverRect.width,
      window.innerWidth - popoverRect.width - 8,
    ),
  );
  popover.style.top = `${rect.bottom + 6}px`;
  popover.style.left = `${left}px`;
};

let activeTrigger: HTMLElement | null = null;

const hidePopover = () => {
  activeTrigger = null;
  const popover = document.getElementById(POPOVER_ID);
  if (popover) {
    popover.style.display = "none";
  }
};

const showPopover = async (trigger: HTMLElement) => {
  const mergeRequest = getMergeRequestFromLocation();
  if (!mergeRequest) {
    return;
  }

  activeTrigger = trigger;
  const popover = getOrCreatePopover();
  renderMessage(popover, "Loading test breakdown…");
  popover.style.display = "block";
  positionPopover(popover, trigger);

  try {
    const breakdown = await getBreakdown(mergeRequest.path, mergeRequest.iid);
    if (activeTrigger !== trigger) {
      return;
    }
    renderBreakdown(popover, breakdown);
  } catch (error) {
    console.error("Gitlab Extended: could not load diff stats", error);
    if (activeTrigger !== trigger) {
      return;
    }
    renderMessage(popover, "Couldn't load test breakdown");
  }
  positionPopover(popover, trigger);
};

const findTrigger = (target: EventTarget | null) => {
  if (!(target instanceof Element)) {
    return null;
  }
  const trigger = target.closest<HTMLElement>(TRIGGER_SELECTOR);
  if (!trigger || trigger.closest(FILE_SELECTOR)) {
    return null;
  }
  return trigger;
};

let popoverSetup = false;

// Delegated listeners, since GitLab re-renders the stats element at will
export const setupDiffStatsPopover = () => {
  if (popoverSetup) {
    return;
  }
  popoverSetup = true;

  document.addEventListener("mouseover", (event) => {
    const trigger = findTrigger(event.target);
    if (trigger && trigger !== activeTrigger) {
      showPopover(trigger);
    }
  });

  document.addEventListener("mouseout", (event) => {
    if (!activeTrigger) {
      return;
    }
    const next = event.relatedTarget;
    if (next instanceof Node && activeTrigger.contains(next)) {
      return;
    }
    hidePopover();
  });

  window.addEventListener("scroll", hidePopover, {
    capture: true,
    passive: true,
  });
};
