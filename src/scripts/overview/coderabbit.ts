import { mergeRequestApi } from "../shared/gitlab-api";

interface Note {
  id: number;
  body: string;
  system: boolean;
  resolvable: boolean;
  resolved?: boolean;
  author: { username: string };
}

interface Discussion {
  id: string;
  notes: Note[];
}

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;
const PER_PAGE = 100;

// CodeRabbit on GitLab posts through a group bot account (e.g.
// group_123_bot_abc), so recognise it by the marker it puts in every comment
const CODERABBIT_MARKER_PATTERN =
  /coderabbit-ai-generated|auto-generated (reply|comment) by coderabbit/i;

// CodeRabbit confirms with an "Actions performed" note
const CONFIRMATION_PATTERN = /actions performed|approv/i;

const log = (message: string, ...details: unknown[]) =>
  console.info(`[Gitlab Extended] CodeRabbit: ${message}`, ...details);

const getMentionedUsername = (command: string) =>
  command.match(/@([\w.-]+)/)?.[1]?.toLowerCase() ?? "coderabbitai";

const isCodeRabbitNote = (note: Note, mentionedUsername: string) => {
  if (note.system) {
    return false;
  }

  const username = note.author.username.toLowerCase();
  return (
    CODERABBIT_MARKER_PATTERN.test(note.body) ||
    username === mentionedUsername ||
    username.includes("coderabbit")
  );
};

const isUnresolved = (discussion: Discussion) =>
  discussion.notes.some((note) => note.resolvable && !note.resolved);

// Discussions are returned oldest first, so the reply ends up on the last page
const fetchLatestDiscussions = async () => {
  const firstPage = await mergeRequestApi(`/discussions?per_page=${PER_PAGE}`);
  const totalPages = Number(firstPage.headers.get("x-total-pages") ?? "1");

  if (totalPages <= 1) {
    return (await firstPage.json()) as Discussion[];
  }

  const pages = await Promise.all(
    [totalPages - 1, totalPages].map(async (page) => {
      const response = await mergeRequestApi(
        `/discussions?per_page=${PER_PAGE}&page=${page}`,
      );
      return (await response.json()) as Discussion[];
    }),
  );

  return pages.flat();
};

const resolveDiscussion = (discussion: Discussion) =>
  mergeRequestApi(`/discussions/${discussion.id}?resolved=true`, {
    method: "PUT",
  });

// Returns true once CodeRabbit has replied to the command
const resolveCodeRabbitReply = async (
  commandNoteId: number,
  mentionedUsername: string,
) => {
  const discussions = await fetchLatestDiscussions();

  const commandDiscussion = discussions.find((discussion) =>
    discussion.notes.some((note) => note.id === commandNoteId),
  );
  log(
    `checked ${discussions.length} threads, command thread ${commandDiscussion ? `${commandDiscussion.id} has ${commandDiscussion.notes.length} comment(s)` : "not found"}`,
  );

  const replies = discussions.filter((discussion) => {
    const codeRabbitNotes = discussion.notes.filter(
      (note) =>
        note.id > commandNoteId && isCodeRabbitNote(note, mentionedUsername),
    );
    if (!codeRabbitNotes.length) {
      return false;
    }

    return (
      discussion === commandDiscussion ||
      codeRabbitNotes.some((note) => CONFIRMATION_PATTERN.test(note.body))
    );
  });

  if (!replies.length) {
    log("no reply from CodeRabbit yet");
    return false;
  }

  for (const discussion of replies) {
    if (!isUnresolved(discussion)) {
      log(
        `reply thread ${discussion.id} is already resolved or not resolvable`,
      );
      continue;
    }

    log(`resolving reply thread ${discussion.id}`);
    await resolveDiscussion(discussion);
    log(`resolved thread ${discussion.id}`);
  }

  return true;
};

const watchForCodeRabbitReply = (
  commandNoteId: number,
  mentionedUsername: string,
) => {
  const startedAt = Date.now();
  log(`watching for a reply to comment ${commandNoteId}`);

  const poll = async () => {
    try {
      if (await resolveCodeRabbitReply(commandNoteId, mentionedUsername)) {
        log("done");
        return;
      }
    } catch (error) {
      console.error(
        "[Gitlab Extended] CodeRabbit: checking for the reply failed",
        error,
      );
    }

    if (Date.now() - startedAt < POLL_TIMEOUT_MS) {
      setTimeout(poll, POLL_INTERVAL_MS);
    } else {
      log(`gave up after ${POLL_TIMEOUT_MS / 60000} minutes without a reply`);
    }
  };

  setTimeout(poll, POLL_INTERVAL_MS);
};

export const sendCodeRabbitApprove = async (command: string) => {
  const response = await mergeRequestApi("/notes", {
    method: "POST",
    body: { body: command },
  });
  const note = (await response.json()) as Note;
  log(`posted "${command}" as comment ${note.id}`);

  watchForCodeRabbitReply(note.id, getMentionedUsername(command));
};
