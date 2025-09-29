import { setupMRDiff } from "./mr-diff";
import { setupMROverview } from "./mr-overview";

let MROVerviewSetup = false;

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
    let oldPushState = history.pushState;
    history.pushState = function pushState() {
      console.log(arguments);
      let ret = oldPushState.apply(this, arguments as any);
      window.dispatchEvent(new Event("locationchange"));
      return ret;
    };

    let oldReplaceState = history.replaceState;
    history.replaceState = function replaceState() {
      console.log(arguments);
      let ret = oldReplaceState.apply(this, arguments as any);
      window.dispatchEvent(new Event("locationchange"));
      return ret;
    };

    window.addEventListener("popstate", () => {
      window.dispatchEvent(new Event("locationchange"));
    });
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
