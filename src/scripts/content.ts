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
    if (window.location.pathname.endsWith("diffs")) {
      setupMRDiff();
      return;
    }

    if (!MROVerviewSetup) {
      setupMROverview();
      MROVerviewSetup = true;
    }
  });
};

const main = () => {
  console.log("✨ Gitlab extended is now running ✨");

  setupNavigationListener();

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
