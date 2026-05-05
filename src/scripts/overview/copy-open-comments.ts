interface CommentInfo {
  isMe: boolean;
  content: string;
  suggestion?: string;
}

interface DiscussionInfo {
  comments: CommentInfo[];
  filePath?: string;
  lineRange?: string;
}

/**
 * Extracts the file path and line range from a discussion element.
 */
const extractFileInfo = (
  discussionElement: Element,
): { filePath?: string; lineRange?: string } => {
  let filePath: string | undefined;
  let lineRange: string | undefined;

  // Get file path from the file title in the diff card
  const fileNameElement = discussionElement.querySelector(
    '[data-testid="file-name-content"], .file-title-name',
  );
  if (fileNameElement) {
    filePath = fileNameElement.textContent?.trim();
  }

  // Get line range from multiline comment indicator
  // Format: "Comment on lines +26 to +28" or "Comment on line +26"
  const multilineComment = discussionElement.querySelector(
    '[data-testid="multiline-comment"]',
  );
  if (multilineComment) {
    const text = multilineComment.textContent?.trim() || "";
    // Match "lines +26 to +28" or "line +26"
    const rangeMatch = text.match(
      /lines?\s+\+?(\d+)(?:\s+to\s+\+?(\d+))?/i,
    );
    if (rangeMatch) {
      if (rangeMatch[2]) {
        lineRange = `${rangeMatch[1]}-${rangeMatch[2]}`;
      } else {
        lineRange = rangeMatch[1];
      }
    }
  } else {
    // For single-line comments, the line number is in the preceding tr.line_holder
    const notesHolder = discussionElement.closest("tr.notes_holder");
    if (notesHolder) {
      const lineHolder =
        notesHolder.previousElementSibling?.closest(".line_holder") ??
        notesHolder.previousElementSibling;
      if (lineHolder?.classList.contains("line_holder")) {
        const newLineCell = lineHolder.querySelector("td.new_line");
        const oldLineCell = lineHolder.querySelector("td.old_line");
        const lineNum =
          newLineCell?.textContent?.trim() || oldLineCell?.textContent?.trim();
        if (lineNum) {
          lineRange = lineNum;
        }
      }
    }
  }

  return { filePath, lineRange };
};

/**
 * Extracts suggestion diff from a note element if present
 */
const extractSuggestion = (noteElement: Element): string | undefined => {
  const suggestionDiff = noteElement.querySelector(".md-suggestion-diff");
  if (!suggestionDiff) {
    return undefined;
  }

  const diffLines: string[] = [];

  // Get all diff rows
  const rows = suggestionDiff.querySelectorAll("tr.line_holder");
  for (const row of rows) {
    const lineContent = row.querySelector("td.line_content span.line");
    const content = lineContent?.textContent || "";

    if (row.classList.contains("old")) {
      // For old/deleted lines, get the line number from td.old_line
      const lineNumEl = row.querySelector("td.old_line");
      const lineNum = lineNumEl?.textContent?.trim() || "?";
      diffLines.push(`- ${lineNum}: ${content}`);
    } else if (row.classList.contains("new")) {
      // For new/added lines, get the line number from td.new_line
      const lineNumEl = row.querySelector("td.new_line");
      const lineNum = lineNumEl?.textContent?.trim() || "?";
      diffLines.push(`+ ${lineNum}: ${content}`);
    }
  }

  if (diffLines.length === 0) {
    return undefined;
  }

  return diffLines.join("\n");
};

/**
 * Extracts comment info from a note element
 */
const extractCommentInfo = (noteElement: Element): CommentInfo | null => {
  // Check if this comment is from the current user (editable notes are the user's own)
  const isMe = noteElement.classList.contains("is-editable");

  // Check for suggestion first
  const suggestion = extractSuggestion(noteElement);

  // Get comment content - specifically from .note-text.md
  // We need to get the actual paragraph content, not the suggestion UI elements
  const noteTextElement = noteElement.querySelector(".note-text.md");

  // Get text from paragraph elements to avoid suggestion UI garbage
  let content = "";
  if (noteTextElement) {
    const paragraphs = noteTextElement.querySelectorAll(
      "p, ul, ol, pre, blockquote",
    );

    if (paragraphs.length > 0) {
      content = Array.from(paragraphs)
        .map((p) => p.textContent?.trim())
        .filter(Boolean)
        .join("\n\n");
    }
  }

  // If there's no content and no suggestion, skip this comment
  if (!content && !suggestion) {
    return null;
  }

  return { isMe, content, suggestion };
};

/**
 * Collects all open discussions (without the configured emoji reaction)
 */
export const collectOpenDiscussions = (emoji: string): DiscussionInfo[] => {
  const discussions: DiscussionInfo[] = [];

  // Find all discussion containers that don't have the emoji reaction and aren't resolved
  const openDiscussions = document.querySelectorAll(
    `div[data-discussion-id]:not([data-discussion-resolved]):not(:has(button[data-emoji-name="${emoji}"]))`,
  );

  for (const discussion of openDiscussions) {
    const { filePath, lineRange } = extractFileInfo(discussion);
    const comments: CommentInfo[] = [];

    // Get all notes/comments in this discussion
    const noteElements = discussion.querySelectorAll("li.note");

    for (const noteElement of noteElements) {
      const commentInfo = extractCommentInfo(noteElement);
      if (commentInfo) {
        comments.push(commentInfo);
      }
    }

    if (comments.length > 0) {
      discussions.push({ comments, filePath, lineRange });
    }
  }

  return discussions;
};

/**
 * Formats discussions as markdown
 */
export const formatDiscussionsAsMarkdown = (
  discussions: DiscussionInfo[],
): string => {
  if (discussions.length === 0) {
    return "No open comments found.";
  }

  const lines: string[] = [
    "# Open Review Comments",
    "",
    `Found ${discussions.length} open discussion(s).`,
    "",
  ];

  discussions.forEach((discussion, index) => {
    // Add file location if available
    if (discussion.filePath) {
      let locationStr = `**File:** \`${discussion.filePath}\``;
      if (discussion.lineRange) {
        locationStr += ` (line${discussion.lineRange.includes("-") ? "s" : ""} ${discussion.lineRange})`;
      }
      lines.push(locationStr);
      lines.push("");
    }

    discussion.comments.forEach((comment) => {
      // Only show "Me:" header for current user's comments
      if (comment.isMe) {
        lines.push("**Me:**");
      }

      // Add comment content as blockquote if present
      if (comment.content) {
        lines.push(
          comment.content
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n"),
        );
        lines.push("");
      }

      // Add suggestion as code block if present
      if (comment.suggestion) {
        lines.push("**Suggested change:**");
        lines.push("");
        lines.push("```diff");
        lines.push(comment.suggestion);
        lines.push("```");
        lines.push("");
      }
    });

    // Add separator between discussions (but not after the last one)
    if (index < discussions.length - 1) {
      lines.push("---");
      lines.push("");
    }
  });

  return lines.join("\n");
};

/**
 * Extracts a single discussion from a discussion element
 */
export const extractSingleDiscussion = (
  discussionElement: Element,
): DiscussionInfo | null => {
  const { filePath, lineRange } = extractFileInfo(discussionElement);
  const comments: CommentInfo[] = [];

  const noteElements = discussionElement.querySelectorAll("li.note");

  for (const noteElement of noteElements) {
    const commentInfo = extractCommentInfo(noteElement);
    if (commentInfo) {
      comments.push(commentInfo);
    }
  }

  if (comments.length === 0) {
    return null;
  }

  return { comments, filePath, lineRange };
};

/**
 * Formats a single discussion as a prompt for AI tools
 */
export const formatSingleDiscussionAsPrompt = (
  discussion: DiscussionInfo,
): string => {
  const lines: string[] = [
    "The following comment was left on a merge request for this branch.",
    "Please review the feedback and either:",
    "1. Implement the suggested fix/change",
    "2. Explain why the current implementation is correct or preferable",
    "3. Propose an alternative solution if applicable",
    "",
    "---",
    "",
  ];

  // Add file location if available
  if (discussion.filePath) {
    let locationStr = `**File:** \`${discussion.filePath}\``;
    if (discussion.lineRange) {
      locationStr += ` (line${discussion.lineRange.includes("-") ? "s" : ""} ${discussion.lineRange})`;
    }
    lines.push(locationStr);
    lines.push("");
  }

  discussion.comments.forEach((comment) => {
    // Only show "Me:" header for current user's comments
    if (comment.isMe) {
      lines.push("**Me:**");
    }

    if (comment.content) {
      lines.push(
        comment.content
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n"),
      );
      lines.push("");
    }

    if (comment.suggestion) {
      lines.push("**Suggested change:**");
      lines.push("");
      lines.push("```diff");
      lines.push(comment.suggestion);
      lines.push("```");
      lines.push("");
    }
  });

  return lines.join("\n");
};

/**
 * Copies the markdown to clipboard and returns success status
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error("[Gitlab Extended] Failed to copy to clipboard:", err);
    return false;
  }
};

