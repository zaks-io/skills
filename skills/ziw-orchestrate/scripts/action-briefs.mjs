import { fileURLToPath } from "node:url";

const array = (value) => (value == null ? [] : [value].flat());
const quote = (value) =>
  /^[A-Za-z0-9_./:=+-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
const required = (value, label) => {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${label} is required to brief the worker`);
  return value;
};
function record(command, args, { repo, stateFile }) {
  const argv = [
    "node",
    fileURLToPath(new URL("./planner-state.mjs", import.meta.url)),
    command,
    "--repo",
    repo,
    "--state",
    required(stateFile, "stateFile"),
    ...args,
  ];
  return { argv, command: argv.map(quote).join(" ") };
}
export function enrichActions(plan, { snapshot, state, config, stateFile = config.stateFile }) {
  const issues = [
    ...array(snapshot.linear?.issues),
    ...array(snapshot.linear?.activeIssues),
    ...array(snapshot.linear?.issueMetadata),
    ...array(state.tickets ?? state.linearIssues),
    ...array(state.startableTickets),
  ];
  const prs = [...array(snapshot.prs), ...array(state.pullRequests)];
  const issueFor = (ref) =>
    issues.find((issue) => issue.issueKey === ref || issue.issueUuid === ref);
  const issueRef = (record) => record.issueKey ?? record.issueUuid;
  const linked = (record, issue) =>
    [record, ...array(record.linkedIssues)].some((reference) =>
      ["issueKey", "issueUuid"].some((name) => issue[name] && reference[name] === issue[name]),
    );
  const options = { repo: plan.repo, stateFile };
  return {
    ...plan,
    actions: plan.actions.map((action) => {
      if (action.kind === "dispatch") {
        const reference = action.target.slice("ticket:".length);
        const issue = issueFor(reference);
        const key = required(issue?.issueKey, `${action.target} issueKey`);
        const title = required(issue.title, `${key} title`);
        const ticketUrl = required(issue.url, `${key} URL`);
        const known = [
          ...array(state.dispatches),
          ...array(state.worktrees),
          ...array(snapshot.worktrees),
          ...prs,
        ].find(
          (record) =>
            (record.branch || record.headRefName) &&
            (linked(record, issue) ||
              (!record.issueKey &&
                new RegExp(`(?:^|[^a-z0-9])${key}(?:[^a-z0-9]|$)`, "i").test(
                  record.branch ?? record.headRefName ?? "",
                ))),
        );
        const prefix = config.branchPrefix?.replace(/\/+$/, "");
        const slug = title
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 40)
          .replace(/-$/, "");
        const branch =
          known?.branch ??
          known?.headRefName ??
          `${required(prefix, "branchPrefix")}/${key.toLowerCase()}-${required(slug, `${key} title slug`)}`;
        const scope = state.scopeIssues ?? snapshot.linear?.candidateIssues ?? issues;
        const outOfScope = [
          ...new Set(
            scope
              .map((ref) => issueFor(issueRef(ref))?.issueKey ?? ref.issueKey)
              .filter((other) => other && other !== key),
          ),
        ];
        const footprint = [...new Set(array(issue.footprint))];
        const brief = `Use ziw-implement on ${ticketUrl}. Branch ${branch}.\nScope: ${title}. Out of scope: ${outOfScope.join(", ") || "none"}. Report the PR URL and head when done.`;
        return {
          ...action,
          issueKey: key,
          ticketUrl,
          title,
          footprint,
          outOfScope,
          branch,
          brief,
          record: record(
            "worker",
            [
              "--issue",
              key,
              "--branch",
              branch,
              ...footprint.flatMap((file) => ["--footprint", file]),
              "--session",
              "<sessionId>",
              "--receipt",
              "<receiptId>",
              "--run",
              "<runId>",
              "--status",
              "running",
            ],
            options,
          ),
        };
      }
      if (action.kind === "request-review") {
        const number = Number(action.target.slice(3));
        const pr = [...prs].reverse().find((candidate) => candidate.number === number);
        const prUrl = required(pr?.url, `${action.target} URL`);
        const base = required(pr.baseRefName ?? snapshot.baseline?.branch, `${action.target} base`);
        const headSha = required(pr.headSha, `${action.target} headSha`);
        const fingerprint = required(
          action.reviewDiffFingerprint,
          `${action.target} reviewDiffFingerprint`,
        );
        const ticket = issueFor(
          pr.issueKey ?? pr.issueUuid ?? issueRef(pr.linkedIssues?.[0] ?? {}),
        );
        const prior = state.reviewEvidenceByPr?.[number];
        const previous = action.deltaFrom
          ? {
              ...(prior?.sessionId ? { previousReviewSessionId: prior.sessionId } : {}),
              ...(prior?.receiptId ? { previousReviewReceiptId: prior.receiptId } : {}),
            }
          : {};
        const brief =
          `Use ziw-code-review in independent mode on ${prUrl}. Base ${base}.\nFingerprint ${fingerprint}.` +
          (action.deltaFrom
            ? ` Review only changes since ${action.deltaFrom}. Paste the previous report's findings from ${previous.previousReviewSessionId ?? previous.previousReviewReceiptId ?? "the previous review report"} and confirm they are fixed.`
            : "") +
          (ticket ? ` Criteria: ${required(ticket.url, "linked ticket URL")}.` : "");
        return {
          ...action,
          prNumber: number,
          prUrl,
          base,
          headSha,
          reviewDiffFingerprint: fingerprint,
          ...(ticket ? { ticketUrl: ticket.url } : {}),
          ...previous,
          brief,
          record: record(
            "review-request",
            [
              "--pr",
              String(number),
              "--head",
              headSha,
              "--fingerprint",
              fingerprint,
              "--session",
              "<sessionId>",
              "--receipt",
              "<receiptId>",
            ],
            options,
          ),
        };
      }
      return action;
    }),
  };
}
