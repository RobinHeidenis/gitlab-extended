import { createGitlabIcon } from "../icons/gitlab";
import {
  approve,
  getApprovalState,
  loadApprovalState,
  unapprove,
} from "./approval-state";
import { sendCodeRabbitApprove } from "./coderabbit";

const MARKER = "data-gitlab-extended-approve";
const MAIN_BUTTON_MARKER = "data-gitlab-extended-approve-main";

const APPROVALS_SELECTOR = ".js-mr-approvals";
const NATIVE_APPROVE_SELECTOR = `${APPROVALS_SELECTOR} [data-testid="approve-button"]`;
// The right-hand side of the approvals bar, which holds "Assign reviewers"
const APPROVALS_ACTIONS_SELECTOR = `${APPROVALS_SELECTOR} .mr-widget-body .media-body + div`;

const STATUS_RESET_MS = 3000;

const CODERABBIT_COMMAND_KEY = "__gitlab-extended-coderabbit_approve_comment";
const DEFAULT_CODERABBIT_COMMAND = "@coderabbitai approve";
// Earlier versions stored this default; replace it so the new default applies
const OLD_DEFAULT_CODERABBIT_COMMAND = "@coderabbit approve";

type Variant = "confirm" | "default";

const createButton = (
  label: string,
  classes: string[],
  size: "sm" | "md" = "sm",
) => {
  const button = document.createElement("button");
  button.type = "button";
  button.classList.add("btn", `btn-${size}`, "gl-button", ...classes);

  const text = document.createElement("span");
  text.classList.add("gl-button-text");
  text.textContent = label;
  button.appendChild(text);

  return button;
};

const setButtonText = (button: HTMLButtonElement, label: string) => {
  const text = button.querySelector(".gl-button-text");
  if (text && text.textContent !== label) {
    text.textContent = label;
  }
};

const setVariant = (button: HTMLButtonElement, variant: Variant) => {
  const other: Variant = variant === "confirm" ? "default" : "confirm";
  if (button.classList.contains(`btn-${other}`)) {
    button.classList.replace(`btn-${other}`, `btn-${variant}`);
  }
};

// Shows a short status (sending, sent, failed) through `show`, then clears it
const runCodeRabbitCommand = async (
  command: string,
  show: (status: string | null) => void,
) => {
  show("Sending…");
  try {
    await sendCodeRabbitApprove(command);
    show("Sent to CodeRabbit");
  } catch (error) {
    console.error(
      "[Gitlab Extended] Sending the CodeRabbit command failed",
      error,
    );
    show("Sending failed");
  }

  setTimeout(() => show(null), STATUS_RESET_MS);
};

const addCodeRabbitButtonToApprovalsBar = (command: string) => {
  const actions = document.querySelector(APPROVALS_ACTIONS_SELECTOR);
  if (!actions || actions.querySelector(`[${MARKER}]`)) {
    return;
  }

  const label = "CodeRabbit approve";
  const button = createButton(label, ["btn-confirm", "btn-confirm-tertiary"]);
  button.setAttribute(MARKER, "true");
  button.title = `Comment "${command}"`;

  button.onclick = () =>
    runCodeRabbitCommand(command, (status) => {
      button.disabled = status === "Sending…";
      setButtonText(button, status ?? label);
    });

  actions.prepend(button);
};

// Rebuilds the markup of GitLab UI's GlDisclosureDropdown, so GitLab's own
// dropdown styles apply. Returns a `.gl-new-dropdown-container` wrapping the
// `.gl-new-dropdown` that holds the toggle and its menu.
const createDisclosureDropdown = (
  toggle: HTMLButtonElement,
  items: { label: string; description: string; onClick: () => void }[],
) => {
  const dropdown = document.createElement("div");
  dropdown.classList.add("gl-new-dropdown", "gl-disclosure-dropdown");

  const panel = document.createElement("div");
  panel.classList.add("gl-new-dropdown-panel", "!gl-w-31");
  // GitLab positions the panel with Floating UI, so place it by hand below the
  // toggle, aligned to its right edge
  Object.assign(panel.style, {
    display: "none",
    position: "absolute",
    top: "calc(100% + 4px)",
    left: "auto",
    right: "0",
  });

  const inner = document.createElement("div");
  inner.classList.add("gl-new-dropdown-inner");

  const list = document.createElement("ul");
  list.classList.add("gl-new-dropdown-contents");
  list.setAttribute("role", "menu");
  list.tabIndex = -1;

  const isOpen = () => panel.style.display !== "none";

  const close = () => {
    panel.style.display = "none";
    toggle.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", onOutsideClick, true);
  };

  const onOutsideClick = (event: MouseEvent) => {
    if (!dropdown.contains(event.target as Node)) {
      close();
    }
  };

  for (const item of items) {
    const li = document.createElement("li");
    li.classList.add("gl-new-dropdown-item");
    li.tabIndex = 0;

    const button = document.createElement("button");
    button.type = "button";
    button.tabIndex = -1;
    button.classList.add("gl-new-dropdown-item-content");

    const wrapper = document.createElement("span");
    wrapper.classList.add("gl-new-dropdown-item-text-wrapper");

    const label = document.createElement("span");
    label.classList.add("gl-block");
    label.textContent = item.label;

    const description = document.createElement("span");
    description.classList.add(
      "gl-block",
      "gl-truncate",
      "gl-text-sm",
      "gl-text-subtle",
    );
    description.textContent = item.description;
    description.title = item.description;

    wrapper.append(label, description);
    button.appendChild(wrapper);

    const select = () => {
      close();
      item.onClick();
    };
    button.onclick = select;
    li.onkeydown = (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select();
      }
    };

    li.appendChild(button);
    list.appendChild(li);
  }

  inner.appendChild(list);
  panel.appendChild(inner);

  toggle.classList.add(
    "gl-new-dropdown-toggle",
    "gl-new-dropdown-caret-only",
    "btn-icon",
  );
  toggle.setAttribute("aria-haspopup", "menu");
  toggle.setAttribute("aria-expanded", "false");
  toggle.onclick = () => {
    if (isOpen()) {
      close();
      return;
    }

    panel.style.display = "block";
    toggle.setAttribute("aria-expanded", "true");
    document.addEventListener("click", onOutsideClick, true);
  };

  dropdown.onkeydown = (event) => {
    if (event.key === "Escape" && isOpen()) {
      close();
      toggle.focus();
    }
  };

  dropdown.append(toggle, panel);
  const container = document.createElement("div");
  container.classList.add("gl-new-dropdown-container");
  container.style.position = "relative";
  container.appendChild(dropdown);

  return container;
};

const getNativeApproveButton = () =>
  document.querySelector<HTMLButtonElement>(NATIVE_APPROVE_SELECTOR);

const setGroupStatus = (group: HTMLElement, status: string | null) => {
  if (status) {
    group.dataset.status = status;
  } else {
    delete group.dataset.status;
  }
  syncApproveSplitButton(group);
};

// Without GitLab's approve button on the page (e.g. on the Changes tab),
// approve or revoke through the API instead
const approveThroughApi = async (group: HTMLElement) => {
  const revoke = !!getApprovalState()?.approvedByMe;

  setGroupStatus(group, revoke ? "Revoking…" : "Approving…");
  try {
    await (revoke ? unapprove() : approve());
    setGroupStatus(group, null);
  } catch (error) {
    console.error("[Gitlab Extended] Updating the approval failed", error);
    setGroupStatus(group, revoke ? "Revoking failed" : "Approving failed");
    setTimeout(() => setGroupStatus(group, null), STATUS_RESET_MS);
  }

  await loadApprovalState(syncAllApproveSplitButtons, true);
};

// "Approve" mirrors and clicks GitLab's own approve button in the approvals
// bar when it's on the page, so approval rules, password prompts and SAML keep
// working. Built like GitLab's own split buttons: a button group with a
// caret-only dropdown.
const createApproveSplitButton = (command: string) => {
  const group = document.createElement("div");
  group.setAttribute(MARKER, "true");
  group.setAttribute("role", "group");
  group.classList.add("btn-group", "gl-self-center");

  const main = createButton(
    "Approve",
    ["btn-confirm", "!gl-rounded-r-none"],
    "md",
  );
  main.setAttribute(MAIN_BUTTON_MARKER, "true");
  main.onclick = () => {
    const native = getNativeApproveButton();
    if (native) {
      native.click();
    } else {
      approveThroughApi(group);
    }
  };

  const toggle = createButton("", ["btn-confirm", "!gl-rounded-l-none"], "md");
  toggle.setAttribute("aria-label", "More approve options");
  // A semi-transparent line reads on both the light and dark theme's buttons
  toggle.style.borderLeft = "1px solid rgba(0, 0, 0, 0.25)";
  const chevron = createGitlabIcon("chevron-down");
  chevron?.classList.add("gl-new-dropdown-chevron");
  toggle.replaceChildren(chevron ?? document.createTextNode("▾"));

  const dropdown = createDisclosureDropdown(toggle, [
    {
      label: "CodeRabbit approve",
      description: `Comments "${command}"`,
      onClick: () =>
        runCodeRabbitCommand(command, (status) =>
          setGroupStatus(group, status),
        ),
    },
  ]);

  group.append(main, dropdown);
  return group;
};

// GitLab's approve button when it's on the page, otherwise the label and
// availability the approval state from the API implies
const getApproveAction = () => {
  const native = getNativeApproveButton();
  if (native) {
    return {
      label: native.textContent?.trim() || "Approve",
      enabled: !native.disabled,
    };
  }

  const state = getApprovalState();
  if (!state) {
    loadApprovalState(syncAllApproveSplitButtons);
    return { label: "Approve", enabled: false };
  }

  if (state.approvedByMe) {
    return { label: "Revoke approval", enabled: true };
  }

  return {
    label: state.approvedByOthers ? "Approve additionally" : "Approve",
    enabled: state.canApprove,
  };
};

const syncApproveSplitButton = (group: HTMLElement) => {
  const main = group.querySelector<HTMLButtonElement>(
    `[${MAIN_BUTTON_MARKER}]`,
  );
  if (!main) {
    return;
  }

  const action = getApproveAction();
  const status = group.dataset.status;

  setButtonText(main, status ?? action.label);

  const disabled = !!status || !action.enabled;
  if (main.disabled !== disabled) {
    main.disabled = disabled;
  }

  const title = action.enabled ? "" : "You can't approve this merge request";
  if (main.title !== title) {
    main.title = title;
  }

  const variant: Variant = action.label.startsWith("Revoke")
    ? "default"
    : "confirm";
  for (const button of group.querySelectorAll<HTMLButtonElement>(
    "button.btn",
  )) {
    setVariant(button, variant);
  }
};

// The thread counter only renders when the MR has threads, so anchor on the
// header containers around it, which are always there
const HEADER_ACTIONS_SELECTOR = [
  ".merge-request-tabs-actions",
  ".merge-request-sticky-header .merge-request-tabs + div",
].join(", ");

const syncAllApproveSplitButtons = () => {
  // Find the groups through their own Approve button, so this can never
  // match (and restyle) GitLab's buttons in the same header
  for (const main of document.querySelectorAll(`[${MAIN_BUTTON_MARKER}]`)) {
    const group = main.closest<HTMLElement>(`[${MARKER}]`);
    if (group) {
      syncApproveSplitButton(group);
    }
  }
};

// The tab bar mounts the counter in #js-vue-discussion-counter, the sticky
// header renders it directly
const COUNTER_SELECTOR = ".discussions-counter, #js-vue-discussion-counter";

const findThreadCounter = (actions: Element) =>
  [...actions.children].find(
    (child) =>
      child.matches(COUNTER_SELECTOR) || child.querySelector(COUNTER_SELECTOR),
  );

// Sits right after the thread counter, before "Your review". Without a counter
// it goes first. Re-checked on every update, as GitLab can render the counter
// after the button was added.
const placeApproveSplitButton = (actions: Element, group: Element) => {
  const counter = findThreadCounter(actions);
  if (counter) {
    if (counter.nextElementSibling !== group) {
      counter.after(group);
    }
  } else if (actions.firstElementChild !== group) {
    actions.prepend(group);
  }
};

const addApproveSplitButtonsToHeaders = (command: string) => {
  for (const actions of document.querySelectorAll(HEADER_ACTIONS_SELECTOR)) {
    const group =
      actions.querySelector(`:scope > [${MARKER}]`) ??
      createApproveSplitButton(command);
    placeApproveSplitButton(actions, group);
  }

  syncAllApproveSplitButtons();
};

const getCodeRabbitCommand = () => {
  const stored = localStorage.getItem(CODERABBIT_COMMAND_KEY);
  const command =
    !stored || stored === OLD_DEFAULT_CODERABBIT_COMMAND
      ? DEFAULT_CODERABBIT_COMMAND
      : stored;
  localStorage.setItem(CODERABBIT_COMMAND_KEY, command);
  return command;
};

// Runs on every merge request tab (Overview, Commits, Pipelines, Changes), as
// the header is shared between them
export const setupApproveButtons = () => {
  const command = getCodeRabbitCommand();

  let scheduled = false;
  const update = () => {
    scheduled = false;
    addCodeRabbitButtonToApprovalsBar(command);
    addApproveSplitButtonsToHeaders(command);
  };

  new MutationObserver(() => {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(update);
    }
  }).observe(document.body, { childList: true, subtree: true });

  update();
};
