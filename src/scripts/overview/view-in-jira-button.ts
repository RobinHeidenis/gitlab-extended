import { createJiraIcon } from "../icons/jira";

export const addViewInJiraButton = (
  JIRA_URL: string | null,
  JIRA_PREFIX: string | null,
) => {
  if (!JIRA_URL || !JIRA_PREFIX) {
    console.info(
      "[Gitlab Extended] No Jira URL or prefix configured. If you want to be able to see the MRs issue in Jira, please configure the __gitlab-extended-jira_url and __gitlab-extended-jira_prefix in your local storage.",
    );
    return;
  }

  // Get MR title
  const title = document.getElementsByClassName("title")?.[0];
  if (!title) {
    return;
  }
  const mrTitle = title.textContent?.trim();

  // Get source branch from ref-container
  const refContainers = document.getElementsByClassName("ref-container");
  if (!refContainers || refContainers.length === 0) {
    return;
  }
  // Use the first ref-container which should be the source branch
  const sourceBranch = refContainers[0]?.textContent?.trim();

  if (!sourceBranch || !mrTitle) {
    return;
  }

  // Helper function to extract all issue numbers from text
  const extractAllIssueNumbers = (text: string): string[] => {
    if (!text) return [];

    const patterns = [
      new RegExp(`${JIRA_PREFIX}-\\d+`, "gi"),
      new RegExp(`${JIRA_PREFIX} \\d+`, "gi"),
      new RegExp(`${JIRA_PREFIX.toLowerCase()}-\\d+`, "gi"),
      new RegExp(`${JIRA_PREFIX.toLowerCase()} \\d+`, "gi"),
    ];

    const allMatches: string[] = [];
    patterns.forEach((pattern) => {
      const matches = text.match(pattern);
      if (matches) {
        allMatches.push(...matches);
      }
    });

    return allMatches;
  };

  // Helper function to normalize issue number format (PREFIX-1234)
  const normalizeIssueNumber = (issueNumber: string): string => {
    return issueNumber.replace(/\s/g, "-").toUpperCase();
  };

  // Helper function to deduplicate issue numbers
  const deduplicateIssueNumbers = (issueNumbers: string[]): string[] => {
    const normalized = issueNumbers.map(normalizeIssueNumber);
    return [...new Set(normalized)];
  };

  // Extract all issue numbers from both sources
  const issueNumbersFromTitle = extractAllIssueNumbers(mrTitle);
  const issueNumbersFromBranch = extractAllIssueNumbers(sourceBranch);

  // Combine and deduplicate all issue numbers
  const allIssueNumbers = deduplicateIssueNumbers([
    ...issueNumbersFromTitle,
    ...issueNumbersFromBranch,
  ]);

  if (allIssueNumbers.length === 0) {
    return;
  }

  // Check for mismatches and log them
  const normalizedTitleIssues = issueNumbersFromTitle.map(normalizeIssueNumber);
  const normalizedBranchIssues =
    issueNumbersFromBranch.map(normalizeIssueNumber);

  const titleOnlyIssues = normalizedTitleIssues.filter(
    (issue) => !normalizedBranchIssues.includes(issue),
  );
  const branchOnlyIssues = normalizedBranchIssues.filter(
    (issue) => !normalizedTitleIssues.includes(issue),
  );

  if (titleOnlyIssues.length > 0 || branchOnlyIssues.length > 0) {
    console.error(
      `[Gitlab Extended] Issue number mismatch detected. Title: [${normalizedTitleIssues.join(", ")}], Branch: [${normalizedBranchIssues.join(", ")}]`,
    );
  }

  const issueSidebar = document.getElementsByClassName(
    "issuable-context-form",
  )?.[0];

  if (!issueSidebar) {
    throw new Error("Could not find issue sidebar");
  }

  // Create a button for each unique issue number
  allIssueNumbers.forEach((issueNumber, index) => {
    const normalizedIssue = normalizeIssueNumber(issueNumber);

    // Determine button text based on number of buttons
    let buttonText = "View in Jira";

    if (allIssueNumbers.length > 1) {
      // Multiple buttons - always include issue number
      buttonText = `View ${normalizedIssue} in Jira`;
    }
    // Single button - use standard text without issue number

    const jiraButton = document.createElement("a");
    jiraButton.href = `${JIRA_URL}/browse/${normalizedIssue}`;
    jiraButton.target = "_blank";
    jiraButton.classList.add(
      "btn",
      "gl-button",
      "btn-default",
      "btn-block",
      "btn-icon",
    );
    jiraButton.style.marginTop = index === 0 ? "10px" : "5px";
    jiraButton.style.display = "flex";
    jiraButton.style.alignItems = "center";
    jiraButton.style.justifyContent = "center";
    jiraButton.style.gap = "8px";

    // Create and add the Jira icon
    const jiraIcon = createJiraIcon();
    jiraIcon.style.flexShrink = "0";
    jiraButton.appendChild(jiraIcon);

    // Create text span
    const buttonTextSpan = document.createElement("span");
    buttonTextSpan.textContent = buttonText;
    jiraButton.appendChild(buttonTextSpan);

    issueSidebar.appendChild(jiraButton);
  });
};
