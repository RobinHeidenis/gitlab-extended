import { graphql, mergeRequestApi, parseMRUrl } from "../shared/gitlab-api";

// GitLab's DetailedMergeStatus GraphQL enum
export const DetailedMergeStatus = {
  Mergeable: "MERGEABLE",
  CiStillRunning: "CI_STILL_RUNNING",
  CiMustPass: "CI_MUST_PASS",
  Conflict: "CONFLICT",
  NeedRebase: "NEED_REBASE",
  DraftStatus: "DRAFT_STATUS",
  DiscussionsNotResolved: "DISCUSSIONS_NOT_RESOLVED",
  NotApproved: "NOT_APPROVED",
  RequestedChanges: "REQUESTED_CHANGES",
  BlockedStatus: "BLOCKED_STATUS",
  NotOpen: "NOT_OPEN",
  Checking: "CHECKING",
  Unchecked: "UNCHECKED",
  Preparing: "PREPARING",
} as const;

export type DetailedMergeStatus =
  (typeof DetailedMergeStatus)[keyof typeof DetailedMergeStatus];

export type MergeState = {
  canMerge: boolean;
  conflicts: boolean;
  autoMergeEnabled: boolean;
  // Kept as a string, as GitLab adds new statuses over time
  detailedMergeStatus: string;
  diffHeadSha: string | null;
};

let mergeState: MergeState | null = null;
let loading: Promise<void> | null = null;
let hasLoaded = false;

// The last loaded state, or null while it hasn't loaded (yet)
export const getMergeState = () => mergeState;

// Loads once; pass `refresh` to load again, e.g. when opening the menu
export const loadMergeState = (onLoaded: () => void, refresh = false) => {
  if (hasLoaded && !refresh) {
    return loading;
  }
  hasLoaded = true;

  loading ??= (async () => {
    const mr = parseMRUrl();
    if (!mr) {
      return;
    }

    const data = await graphql<{
      project: {
        mergeRequest: {
          conflicts: boolean;
          autoMergeEnabled: boolean;
          detailedMergeStatus: string | null;
          diffHeadSha: string | null;
          userPermissions: { canMerge: boolean };
        } | null;
      } | null;
    }>(
      `
        query GitlabExtendedMergeState($projectPath: ID!, $iid: String!) {
          project(fullPath: $projectPath) {
            mergeRequest(iid: $iid) {
              conflicts
              autoMergeEnabled
              detailedMergeStatus
              diffHeadSha
              userPermissions {
                canMerge
              }
            }
          }
        }
      `,
      mr,
    );

    const mergeRequest = data.project?.mergeRequest;
    if (!mergeRequest) {
      return;
    }

    mergeState = {
      canMerge: mergeRequest.userPermissions.canMerge,
      conflicts: mergeRequest.conflicts,
      autoMergeEnabled: mergeRequest.autoMergeEnabled,
      detailedMergeStatus:
        mergeRequest.detailedMergeStatus ?? DetailedMergeStatus.Unchecked,
      diffHeadSha: mergeRequest.diffHeadSha,
    };
    onLoaded();
  })()
    .catch((error) => {
      console.error("[Gitlab Extended] Could not load the merge state", error);
    })
    .finally(() => {
      loading = null;
    });

  return loading;
};

// Leaves squash and source branch deletion out, so GitLab applies the MR's own
// settings, like its merge button does by default. `autoMerge` merges once the
// pipeline succeeds, like "Set to auto-merge".
export const merge = (sha: string | null, autoMerge: boolean) =>
  mergeRequestApi("/merge", {
    method: "PUT",
    body: {
      ...(sha ? { sha } : {}),
      ...(autoMerge
        ? // Newer GitLab versions read `auto_merge`, older ones the other
          { auto_merge: true, merge_when_pipeline_succeeds: true }
        : {}),
    },
  });
