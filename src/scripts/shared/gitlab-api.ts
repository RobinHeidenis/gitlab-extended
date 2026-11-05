export const getCsrfToken = () =>
  document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ??
  null;

export const parseMRUrl = () => {
  const match = window.location.pathname.match(
    /^\/(.+?)\/-\/merge_requests\/(\d+)/,
  );
  if (!match) {
    return null;
  }

  return { projectPath: match[1]!, iid: match[2]! };
};

const csrfHeaders = () => {
  const csrfToken = getCsrfToken();
  if (!csrfToken) {
    throw new Error("No CSRF token found");
  }

  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-CSRF-Token": csrfToken,
  };
};

export const graphql = async <T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> => {
  const response = await fetch("/api/graphql", {
    method: "POST",
    headers: csrfHeaders(),
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

// Calls the REST API for the merge request in the current URL, e.g.
// mergeRequestApi("/notes") hits /api/v4/projects/:id/merge_requests/:iid/notes
export const mergeRequestApi = async (
  path: string,
  init: { method?: string; body?: unknown } = {},
) => {
  const mr = parseMRUrl();
  if (!mr) {
    throw new Error("Not on a merge request page");
  }

  const response = await fetch(
    `/api/v4/projects/${encodeURIComponent(mr.projectPath)}/merge_requests/${mr.iid}${path}`,
    {
      method: init.method ?? "GET",
      headers: csrfHeaders(),
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    },
  );

  if (!response.ok) {
    throw new Error(
      `${init.method ?? "GET"} ${path} failed with ${response.status}`,
    );
  }

  return response;
};
