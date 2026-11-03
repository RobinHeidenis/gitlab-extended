import { setupDiffStatsPopover } from "./diff/stats-popover";
import { setupTestFileHeaders } from "./diff/test-file-headers";
import { setupMRDiff } from "./mr-diff";
import { setupMROverview } from "./mr-overview";

let MROVerviewSetup = false;

// Firefox only
let previousPathname = window.location.pathname;

const setupNavigationListener = () => {
  if ("navigation" in window) {
    (window.navigation as any).addEventListener("navigate", (event: Event) => {
      if (
        window.location.pathname !==
        new URL((event as any).destination.url).pathname
      ) {
        window.dispatchEvent(new Event("locationchange"));
      }
    });
  } else {
    setInterval(() => {
      if (window.location.pathname !== previousPathname) {
        window.dispatchEvent(new Event("locationchange"));
        previousPathname = window.location.pathname;
      }
    }, 1000);
  }

  window.addEventListener("locationchange", (event: Event) => {
    setTimeout(() => {
      if (window.location.pathname.endsWith("diffs")) {
        console.log("setting up MR diff");
        setupMRDiff();
        return;
      }

      if (!MROVerviewSetup) {
        setupMROverview();
        MROVerviewSetup = true;
      }
    }, 1000);
  });
};

const main = () => {
  console.log("✨ Gitlab extended is now running ✨");

  setupNavigationListener();
  setupDiffStatsPopover();
  setupTestFileHeaders();

  if (window.location.pathname.endsWith("diffs")) {
    setTimeout(() => {
      setupMRDiff();
    }, 2000);
    return;
  }

  if (!MROVerviewSetup) {
    setupMROverview();
    MROVerviewSetup = true;
  }
};

main();
