import { graphql, mergeRequestApi, parseMRUrl } from "../shared/gitlab-api";

export interface ApprovalState {
  canApprove: boolean;
  approvedByMe: boolean;
  approvedByOthers: boolean;
}

let approvalState: ApprovalState | null = null;
let loading: Promise<void> | null = null;
let hasLoaded = false;

// The last loaded state, or null while it hasn't loaded (yet)
export const getApprovalState = () => approvalState;

// Loads once; pass `refresh` to load again, e.g. after approving
export const loadApprovalState = (onLoaded: () => void, refresh = false) => {
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
      currentUser: { username: string } | null;
      project: {
        mergeRequest: {
          approvedBy: { nodes: { username: string }[] } | null;
          userPermissions: { canApprove: boolean };
        } | null;
      } | null;
    }>(
      `
        query GitlabExtendedApprovalState($projectPath: ID!, $iid: String!) {
          currentUser {
            username
          }
          project(fullPath: $projectPath) {
            mergeRequest(iid: $iid) {
              approvedBy {
                nodes {
                  username
                }
              }
              userPermissions {
                canApprove
              }
            }
          }
        }
      `,
      mr,
    );

    const mergeRequest = data.project?.mergeRequest;
    const me = data.currentUser?.username;
    if (!mergeRequest || !me) {
      return;
    }

    const approvers = (mergeRequest.approvedBy?.nodes ?? []).map(
      (user) => user.username,
    );
    approvalState = {
      canApprove: mergeRequest.userPermissions.canApprove,
      approvedByMe: approvers.includes(me),
      approvedByOthers: approvers.some((username) => username !== me),
    };
    onLoaded();
  })()
    .catch((error) => {
      console.error(
        "[Gitlab Extended] Could not load the approval state",
        error,
      );
    })
    .finally(() => {
      loading = null;
    });

  return loading;
};

export const approve = () => mergeRequestApi("/approve", { method: "POST" });

export const unapprove = () =>
  mergeRequestApi("/unapprove", { method: "POST" });
