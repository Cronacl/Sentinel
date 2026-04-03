import { lines } from "@/lib/prompt";

export const listDescription = lines(
  "List files and directories using a concise tree view.",
  [
    "- Recursively lists directory contents with file and folder counts.",
    "- Returns a human-readable tree representation alongside structured entries.",
    "- Automatically ignores common noise directories (.git, node_modules, .next, etc.).",
    "- Accepts custom ignore patterns to further narrow results.",
    "- Truncates output when the entry count exceeds the internal limit (160 entries).",
    "- Use this tool for top-level discovery and getting a quick workspace overview.",
    "- Prefer glob when you already know the filename pattern you need.",
  ].join("\n"),
);

export const globDescription = lines(
  "Find files by glob pattern inside a directory.",
  [
    '- Recursively matches files against a glob pattern (e.g. "*.ts", "**/*.test.tsx").',
    "- Returns matched file paths sorted by modification time.",
    "- Respects the same default ignore patterns as list (.git, node_modules, etc.).",
    "- Truncates results when the match count exceeds the internal limit (100 files).",
    "- Use this tool when you know the filename pattern you need.",
    "- Prefer list for general directory discovery and read for file contents.",
  ].join("\n"),
);

export const readDescription = lines(
  "Read file contents or a bounded slice of a directory listing.",
  [
    "- Reads plain text and source-code files with line numbers for precise referencing.",
    "- Supports pagination via offset and limit parameters for large files.",
    "- Directories are returned as entry listings instead of raw content.",
    "- Binary files are rejected with a clear error.",
    "- Use this tool only for workspace or skill-root text/code inspection during coding tasks.",
    "- Never use this tool for message attachments, PDFs, office documents, spreadsheets, or presentations; use load_document instead.",
    "- Default read limit is 200 lines; maximum is 400 lines per call.",
    "- Long lines are truncated to 400 characters.",
    "- Use this tool when you need actual file contents or a bounded slice.",
    "- Prefer list or glob for directory discovery instead of reading directories.",
  ].join("\n"),
);

export const loadDocumentDescription = lines(
  "Load and normalize a document into markdown for model use.",
  [
    "- Supports workspace files and message attachments.",
    "- Normalizes office documents, spreadsheets, presentations, PDFs, and text/code files into markdown.",
    "- Returns extracted content plus metadata such as format, warnings, sheet names, and slide count when available.",
    "- Attachment lookup defaults to the current source message unless messageId is provided.",
    "- Duplicate attachment filenames require attachmentIndex to disambiguate.",
    "- Use this tool for attached files and for any PDF, office document, spreadsheet, presentation, or other document-style file.",
    "- Prefer this tool over read whenever the user refers to an attachment or the file might be binary.",
    "- Do not claim that you cannot read an attached document when this tool is available; call load_document first.",
    "- Do not use this tool for normal source-code or plain-text workspace inspection; use read for coding-oriented file reads.",
  ].join("\n"),
);

export const grepDescription = lines(
  "Fast content search that works with any workspace size.",
  [
    "- Searches file contents using regular expressions powered by ripgrep.",
    '- Supports full regex syntax (e.g. "log.*Error", "function\\s+\\w+").',
    '- Filter files by pattern with the include parameter (e.g. "*.js", "*.{ts,tsx}").',
    "- Returns file paths and matching lines with line numbers.",
    "- Truncates results when the match count exceeds the internal limit (100 matches).",
    "- Match preview lines are truncated to 280 characters.",
    "- Use this tool when you need to find files containing specific text or patterns.",
    "- Prefer glob when searching by filename and read when you know the exact file.",
  ].join("\n"),
);

export const diffDescription = lines(
  "Generate a unified diff between a file and another file or proposed content.",
  [
    "- Supports file-to-file comparison and file-to-proposed-content comparison.",
    "- Returns unified diff text plus addition/deletion counts.",
    "- Optional contextLines controls how many unchanged lines are included around changes.",
    "- Use this tool to inspect or preview changes before mutating files.",
    "- Prefer this tool over guessing what a patch or edit will do.",
  ].join("\n"),
);

export const batchReadDescription = lines(
  "Read multiple files or directories in one tool call.",
  [
    "- Applies the existing read behavior to each requested path and preserves the request order.",
    "- Supports optional shared offset and limit parameters for every requested path.",
    "- Returns one structured read result per path.",
    "- Use this tool when you need several files at once instead of repeated read calls.",
  ].join("\n"),
);

export const editDescription = lines(
  "Replace exact text inside an existing file.",
  [
    "- Performs precise string replacement: provide the exact old text and its replacement.",
    "- By default replaces exactly one occurrence; set replaceAll to replace every match.",
    "- Fails if the old text is not found or if multiple matches exist without replaceAll.",
    "- Preserves original line endings (CRLF or LF).",
    "- Requires a rationale explaining why the edit is needed.",
    "- Use this tool for targeted, single-location file changes.",
    "- Prefer multiedit when you need several replacements in the same file.",
  ].join("\n"),
);

export const multieditDescription = lines(
  "Apply multiple exact-text edits to the same file in one step.",
  [
    "- Applies an ordered list of exact-text replacements to a single file.",
    "- Each edit is applied in sequence so later edits see the result of earlier ones.",
    "- Supports up to 20 edits per call, each with optional replaceAll.",
    "- Requires a rationale explaining why these coordinated edits are needed.",
    "- Use this tool instead of repeated edit calls when you need several replacements in one file.",
    "- Prefer edit for a single replacement and create_file for writing a new file from scratch.",
  ].join("\n"),
);

export const createFileDescription = lines(
  "Create a new file with full contents.",
  [
    "- Writes a new file with the provided content at the specified path.",
    "- Automatically creates parent directories as needed.",
    "- Fails if a file already exists at the target path.",
    "- Requires a rationale explaining why the file should be created.",
    "- Use this tool for new files; prefer edit or multiedit for modifying existing files.",
  ].join("\n"),
);

export const deleteFileDescription = lines(
  "Delete an existing file or symlink.",
  [
    "- Removes a file or symbolic link from the filesystem.",
    "- Refuses to delete directories; only files and symlinks are accepted.",
    "- Returns the size of the deleted file in bytes.",
    "- Requires a rationale explaining why the file should be deleted.",
    "- Use this tool for explicit file removal; prefer edit to modify contents instead.",
  ].join("\n"),
);

export const moveFileDescription = lines(
  "Atomically rename or move a file within the workspace.",
  [
    "- Uses a filesystem rename instead of create-plus-delete.",
    "- Automatically creates destination parent directories when needed.",
    "- Fails if the source does not exist or the destination already exists.",
    "- Requires a rationale explaining why the move is needed.",
    "- Prefer this tool over manual copy/delete flows when renaming files.",
  ].join("\n"),
);

export const applyPatchDescription = lines(
  "Apply a structured multi-file patch using Sentinel's patch envelope format.",
  [
    "- Accepts Add, Delete, and Update file operations, with optional Move directives on updates.",
    "- Verifies patch structure before writing files.",
    "- Returns per-file diffs and change counts after applying the patch.",
    "- Requires a rationale explaining why the patch should be applied.",
    "- Prefer this tool for coordinated multi-file edits or file moves expressed as a patch.",
  ].join("\n"),
);

export const runTaskDescription = lines(
  "Run a standard project script such as test, lint, build, format, or typecheck.",
  [
    "- Resolves the nearest package.json and picks the matching script.",
    "- Automatically detects the package manager from lockfile or packageManager field.",
    "- Supported tasks: build, format, lint, test, typecheck.",
    "- Streams output so intermediate progress is visible before completion.",
    "- Returns exit code, stdout, stderr, and structured failure metadata on completion.",
    "- Requires a rationale explaining why the task should run.",
    "- Use this tool for standard project scripts instead of raw shell commands.",
    "- Prefer shell_command only when the task cannot be expressed as a standard script or when a missing command/toolchain requires remediation.",
  ].join("\n"),
);

export const shellCommandDescription = lines(
  "Run a single shell command in the linked workspace or discovered skill directory.",
  [
    "- Executes one shell command at a time in the current linked filesystem root.",
    "- Streams output so intermediate progress is visible before completion.",
    "- Returns exit code, stdout, stderr, working directory, and structured failure metadata on completion.",
    "- Requires a rationale explaining why the command is needed and what you expect to learn.",
    "- In default permissions mode, commands must stay inside the selected workspace root or discovered skill directories.",
    "- Running from an allowed workspace cwd does not prevent invoking host-installed executables or package managers such as brew, apt-get, npm, pnpm, yarn, bun, cargo, or pip when they exist on PATH.",
    "- Avoid full-screen or interactive TUI programs.",
    "- Prefer non-interactive flags for scaffolding, installs, and builds.",
    "- Use this tool for environment remediation, setup, and package-manager installs when the user asks for them or when a missing binary/toolchain blocks progress.",
    "- Prefer run_task for standard project scripts (test, lint, build, format, typecheck).",
    "- Prefer edit, create_file, and delete_file for direct file changes instead of shell commands.",
  ].join("\n"),
);

export const gitDescription = lines(
  "Run safe, structured git operations in the selected workspace root.",
  [
    "- Supports status, diff, log, branch_list, branch_create, checkout, add, and commit.",
    "- Returns structured JSON instead of raw shell output.",
    "- Enforces safe local operations only: no remotes, rebases, resets, force flags, or detached HEAD flows.",
    "- Branch creation and checkout require a clean worktree; commit requires staged changes.",
    "- Prefer this tool over shell_command for local git inspection and commits.",
  ].join("\n"),
);

export const diagnosticsDescription = lines(
  "Collect structured code diagnostics for the workspace or a specific path.",
  [
    "- Returns normalized diagnostics with file, line, column, severity, source, and message.",
    "- In auto mode, prefers ESLint when available, then falls back to TypeScript compiler diagnostics.",
    "- Supports path scoping when the underlying tool output can be filtered safely.",
    "- Use this tool instead of parsing raw lint or typecheck stdout.",
  ].join("\n"),
);

export const searchMemoryDescription = lines(
  "Search long-term memory for durable user or workspace context.",
  [
    "- Retrieves relevant memories by semantic search over the query.",
    "- Supports scoped search: global, workspace, or both.",
    "- Returns matching memories with content, kind, score, and summary.",
    "- Memory kinds include: preference, profile, workflow, project, fact.",
    "- Maximum 12 results per query.",
    "- Use this tool before asking the user to repeat stable preferences, habits, or constraints.",
    "- Prefer save_memory to store new durable context and forget_memory to remove outdated entries.",
  ].join("\n"),
);

export const saveMemoryDescription = lines(
  "Save durable user or workspace context for future conversations.",
  [
    "- Creates or updates a long-term memory record.",
    "- Supports scoped storage: global (across workspaces) or workspace-specific.",
    "- Memory kinds: preference, profile, workflow, project, fact.",
    "- Optional salience (0-1) controls how important the memory is for future recall.",
    "- Optional summary provides a compact representation for prompt injection.",
    "- Use this tool only for durable facts, preferences, workflows, and recurring context.",
    "- Never save secrets, API keys, access tokens, passwords, or one-off task state.",
  ].join("\n"),
);

export const forgetMemoryDescription = lines(
  "Delete a stored memory that is outdated or incorrect.",
  [
    "- Removes a long-term memory by its ID.",
    "- Returns the kind and summary of the deleted memory for confirmation.",
    "- Use this tool when the user explicitly says a previously stored fact is outdated or wrong.",
    "- Prefer search_memory first to find the memory ID before deleting.",
  ].join("\n"),
);

export const websearchDescription = lines(
  "Search the web for source discovery and summarized results.",
  [
    "- Queries the web via configured search providers (Exa, SearXNG).",
    "- Returns a digest summary alongside structured result entries.",
    "- Each result includes title, URL, summary, author, and published date when available.",
    "- Supports search type modes: auto, fast, deep.",
    "- Optional livecrawl setting controls freshness (never, preferred, always).",
    "- Maximum 25 results per query.",
    "- Use this tool to discover sources, articles, documentation, or references.",
    "- Prefer webfetch after websearch when you need to read one specific result in full.",
  ].join("\n"),
);

export const generateImageDescription = lines(
  "Generate new images from a text prompt using configured image providers.",
  [
    "- Uses AI SDK image models exposed by your configured providers.",
    "- Supports single-provider generation and multi-model fan-out across enabled providers.",
    "- Returns structured per-provider results with image previews, warnings, and errors.",
    "- Accepts optional count, size, aspect ratio, and seed controls.",
    "- Requires at least one configured image-capable provider with a valid selected model in Settings > Images.",
    "- Use single mode when one provider/model is enough.",
    "- Use multi_model mode to compare outputs across providers.",
  ].join("\n"),
);

export const webfetchDescription = lines(
  "Fetch a web page or image and return its contents as markdown, text, or HTML.",
  [
    "- Fetches a URL and converts the response to the requested format.",
    "- Preferred format is markdown for documentation and article pages.",
    "- Supports batch fetching of multiple URLs when batch mode is enabled in settings.",
    "- Handles images by returning a data URL preview alongside metadata.",
    "- Response content is truncated to 120k characters; maximum response size is 5MB.",
    "- Optional timeout up to 120 seconds.",
    "- Use this tool when the answer depends on a known URL or a link from the conversation.",
    "- Prefer websearch first when you need to discover which URLs are relevant.",
    "- Use batch fetch only when comparing or gathering multiple pages is clearly useful.",
  ].join("\n"),
);

export const loadSkillDescription = lines(
  "Load a discovered skill to access specialized instructions and bundled resources.",
  [
    "- Loads the full SKILL.md body for one discovered skill by name.",
    "- Returns the skill base directory, source scope, source kind, and a sample of bundled files.",
    "- Use this tool when the user's request clearly matches a listed skill description.",
    "- Relative resource paths mentioned in the skill are relative to the returned directory.",
    "- Sentinel prepends runtime guidance so the returned directory takes priority over any stale home-directory examples embedded in the skill text.",
    "- This tool is always available when skills are discovered and does not require approval.",
  ].join("\n"),
);

export const createPlanDescription = lines(
  "Create the initial plan for this thread.",
  [
    "- Produces a substantial markdown planning document with audience, goal, summary, and task list.",
    "- Choose the plan audience: technical for detailed execution, general for broader stakeholders.",
    "- The document should follow a structured format: overview, current understanding, recommended approach, work breakdown, risks, and validation.",
    "- Supports an initial task list with up to 20 tasks.",
    "- Use this tool when the thread has no plan yet.",
    "- Use update_plan to revise an existing plan instead of recreating it.",
    "- IMPORTANT: Do NOT repeat the plan content in the chat after calling this tool. The plan is rendered automatically in a dedicated panel.",
  ].join("\n"),
);

export const updatePlanDescription = lines(
  "Update the existing plan title, goal, summary, audience, or markdown document.",
  [
    "- Revises specific fields of the current plan without recreating unrelated content.",
    "- All fields are optional: only provide the fields you want to change.",
    "- Preserves existing plan tasks; use manage_task for task changes.",
    "- Use this tool to refine or expand an existing plan.",
    "- Prefer create_plan when the thread has no plan yet.",
    "- IMPORTANT: Do NOT repeat the plan content in the chat after calling this tool. The plan is rendered automatically in a dedicated panel.",
  ].join("\n"),
);

export const manageTaskDescription = lines(
  "Create, update, or delete a task to track progress on the current request.",
  [
    "- Supports three actions: create, update, and delete.",
    "- Tasks have a title, optional description, and status (pending, in_progress, completed, blocked).",
    "- Always create tasks to track your progress on multi-step work, even when no formal plan exists.",
    "- The system auto-creates a task tracker when you create your first task in a thread.",
    "- Update task status as you work: pending -> in_progress -> completed (or blocked if stuck).",
    "- Do not mark a task completed until its result is validated.",
    "- Use this tool for all task lifecycle changes; it is always available in chat mode.",
  ].join("\n"),
);

export const askQuestionDescription = lines(
  "Ask structured clarification questions with multiple-choice options.",
  [
    "- Present 1 to 3 questions, each with 2 to 4 answer options.",
    "- Each option has a short label and a longer description.",
    "- Users can also provide a custom free-text answer for any question.",
    "- Set allowMultiple to true when the user should be able to pick more than one option.",
    "- If there are many possible answers, collapse them into the 2 to 4 most representative choices.",
    "- Use this tool when an ambiguity materially changes the plan.",
    "- Gather context from available tools first when they can answer the uncertainty instead.",
  ].join("\n"),
);
