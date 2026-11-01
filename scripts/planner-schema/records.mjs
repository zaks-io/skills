const fields = (names, schema) =>
  Object.fromEntries(
    names
      .split(/\s+/)
      .filter(Boolean)
      .map((name) => [name, schema]),
  );
const text = { type: "string" };
const nullableText = { type: ["string", "null"] };
const boolean = { type: "boolean" };
const count = { type: "integer", minimum: 0 };
const strings = { anyOf: [text, { type: "array", items: text }, { type: "null" }] };
const labels = {
  anyOf: [
    { type: "null" },
    { type: "string" },
    {
      type: "array",
      items: {
        anyOf: [
          text,
          {
            type: "object",
            required: ["name"],
            properties: { name: text },
          },
        ],
      },
    },
  ],
};
const evidenceCount = { anyOf: [count, boolean, { type: "array" }] };

export const evidenceProperties = {
  ...Object.fromEntries(
    "codeReviewVerdict currentReviewDiffFingerprint reviewRelevantDiffFingerprint reviewedReviewDiffFingerprint hostedReviewedDiffFingerprint reviewHeadSha conformanceHeadSha conformance conformanceVerdict codeRabbitRequired codeRabbitComplete codeRabbitSkipped autoReview reviewProvider provider independentReviews requiredChecksGreen checksPassing checksGreen ciGreen tier diffMatchesScope humanReviewPrLabel humanReviewPrLabelApplied hasHumanMergePrLabel hasHumanReviewPrLabel pullRequestLabels reviewEvidenceLabel evidenceLabel"
      .split(" ")
      .map((name) => [name, false]),
  ),
  ...fields("isDraft reviewThreadsTruncated", boolean),
  prState: nullableText,
  reviewVerdict: { enum: ["APPROVE", "NEEDS REVISION"] },
  ...fields("sessionId receiptId", { type: "string", pattern: "\\S" }),
  previousRequests: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      properties: fields("sessionId receiptId", { type: "string", pattern: "\\S" }),
      anyOf: [{ required: ["sessionId"] }, { required: ["receiptId"] }],
    },
  },
  ...fields(
    `hasReviewEvidence reviewEvidenceCurrent blockingFindings changesRequested
    linkedPrChanged evidenceMissing requiredChecksPassed
    scopeMatches hostedReviewRequired
    hostedReviewComplete hostedReviewSkipped
    hostedReviewPending hostedReviewCurrent recommended required skipped highRisk prExists
    explicitLocalCliRequest remoteWorker supportsLocalCli requiresAutoReviewResolution
    humanMergePrLabelApplied productionAction humanDecisionPending`,
    boolean,
  ),
  ...fields(
    `reviewedHeadSha currentPrHeadSha headSha
    reviewDiffFingerprint reviewedDiffFingerprint hostedReviewDiffFingerprint
    hostedReviewHeadSha hostedReviewProvider autoReviewMode prUrl status deltaFrom
    humanMergePrLabel reviewDecision`,
    nullableText,
  ),
  ...fields("labels issueLabels prLabels riskLabels", labels),
  ...fields("independentReviewCount unresolvedReviewThreads unresolvedThreads", evidenceCount),
  riskTier: { type: "string", enum: ["low", "medium", "high"] },
};

const issueKey = { type: "string", pattern: "^[A-Za-z][A-Za-z0-9]*-[0-9]+$" };
const issueUuid = {
  type: "string",
  pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
};
const opaqueId = { type: "string", pattern: "\\S" };
const issueFields = { issueKey, issueUuid };
const issueRequired = [{ required: ["issueKey"] }, { required: ["issueUuid"] }];
const retiredIdentityFields = Object.fromEntries(
  "id identifier issueId ticket key prId session issueRef".split(" ").map((name) => [name, false]),
);
const footprintFields = {
  footprint: strings,
  ...Object.fromEntries(
    "fileFootprint files paths packages".split(" ").map((name) => [name, false]),
  ),
};
const workerProperties = {
  ...retiredIdentityFields,
  ...issueFields,
  ...footprintFields,
  receiptId: opaqueId,
  sessionId: opaqueId,
  runId: opaqueId,
  previousRunIds: { type: "array", items: opaqueId, uniqueItems: true },
  prNumber: { type: "integer", minimum: 1 },
  ...fields("title url branch headSha path worktree state status source prUrl", nullableText),
  ...fields(
    `returned stopped occupiesWorkerSlot active open closed merged
    completedByMergedPr`,
    boolean,
  ),
  ...fields("worker workerType agent agentType executor executionPath", nullableText),
  ...fields("eligibleWorkers workerPaths allowedWorkers workers", strings),
  ...fields("unlockCount priority", { type: "number" }),
  hasPr: false,
  downstreamCount: false,
  objectiveRank: false,
  ...fields("labels issueLabels", labels),
  number: false,
};
const canonicalIssueProperties = {
  ...retiredIdentityFields,
  ...footprintFields,
  ...fields("title url workflowState stateType draftState source", nullableText),
  state: { anyOf: [nullableText, { type: "object", properties: fields("name type", text) }] },
  labels,
  ...fields("kind kindLabel kindName", text),
  ...fields("implementationReady readyForImplementation", boolean),
  ...fields("estimate estimatePoints points size effort bodyEstimate", {
    anyOf: [{ type: "number" }, { type: ["string", "null"] }],
  }),
  ...fields("activeClaim openPr hasOpenPr openPullRequest prOpen", boolean),
  ...issueFields,
  number: false,
  prNumber: false,
  sessionId: opaqueId,
  receiptId: opaqueId,
  claimed: false,
  delegated: false,
  blockers: false,
  dependsOn: false,
  dependencies: false,
  ...fields("blockedBy", {
    type: "array",
    items: { $ref: "#/definitions/dependency" },
  }),
};

export const definitions = {
  evidence: { type: "object", additionalProperties: false, properties: evidenceProperties },
  checks: {
    type: "object",
    properties: { state: text, ...fields("failed pending", { type: "array" }) },
  },
  issueReference: {
    type: "object",
    additionalProperties: false,
    properties: issueFields,
    anyOf: issueRequired,
  },
  dependency: {
    type: "object",
    additionalProperties: false,
    properties: { ...issueFields, stateType: nullableText },
    anyOf: issueRequired,
  },
  issue: {
    type: "object",
    properties: canonicalIssueProperties,
    anyOf: issueRequired,
  },
  pullRequest: {
    type: "object",
    required: ["number"],
    properties: {
      ...retiredIdentityFields,
      ...evidenceProperties,
      ...footprintFields,
      ...fields(
        "title url branch headRefName headSha headRefOid state draftState prUrl",
        nullableText,
      ),
      ...fields(
        `open closed merged isDraft draft isBot isDependencyBot dependencyBot
        autoMergeArmed reviewThreadsTruncated reviewsTruncated`,
        boolean,
      ),
      ...fields("baseRefName mergeable mergeStateStatus updatedAt prState", nullableText),
      changedFiles: count,
      checks: { $ref: "#/definitions/checks" },
      requiredChecks: { $ref: "#/definitions/checks" },
      latestReviews: {
        type: "object",
        additionalProperties: {
          type: "object",
          required: ["state"],
          properties: {
            state: text,
            authorType: { type: "string", enum: ["User", "Bot"] },
            ...fields("headSha commitSha reviewDiffFingerprint", nullableText),
          },
        },
      },
      ...issueFields,
      number: { type: "integer", minimum: 1 },
      linkedIssues: { type: "array", items: { $ref: "#/definitions/issueReference" } },
      legacyPrAliases: false,
      prNumber: false,
      receiptId: false,
      sessionId: false,
    },
  },
  worker: {
    type: "object",
    properties: workerProperties,
    anyOf: [
      { required: ["receiptId"] },
      { required: ["sessionId"] },
      { required: ["occupiesWorkerSlot"], properties: { occupiesWorkerSlot: { const: false } } },
      ...["returned", "stopped"].map((name) => ({
        required: [name],
        properties: { [name]: { const: true } },
      })),
      ...["state", "status"].map((name) => ({
        required: [name],
        properties: {
          [name]: {
            enum: [
              "completed",
              "failed",
              "stale",
              "stopped",
              "returned",
              "ended",
              "finished",
              "canceled",
              "done",
              "merged",
              "closed",
            ],
          },
        },
      })),
    ],
  },
  worktree: {
    type: "object",
    required: ["path"],
    properties: {
      ...retiredIdentityFields,
      ...footprintFields,
      path: opaqueId,
      ...fields("branch headSha", nullableText),
      ...fields("completedByMergedPr prunable detached locked", boolean),
      ...fields("dirty mergedIntoBaseline", { type: ["boolean", "null"] }),
      ...Object.fromEntries(
        "issueKey issueUuid receiptId sessionId number prNumber worktree"
          .split(" ")
          .map((name) => [name, false]),
      ),
    },
  },
  preview: {
    type: "object",
    required: ["previewId"],
    properties: {
      ...retiredIdentityFields,
      previewId: opaqueId,
      prNumber: { type: "integer", minimum: 1 },
      ...fields("path worktree url branch headSha state status", nullableText),
      ...fields("active open closed stopped", boolean),
    },
  },
  startableTicket: {
    type: "object",
    properties: { ...workerProperties, receiptId: false, sessionId: false },
    anyOf: issueRequired,
  },
  reviewEvidenceCheck: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...evidenceProperties,
      ...issueFields,
      prNumber: { type: "integer", minimum: 1 },
    },
    anyOf: [...issueRequired, { required: ["prNumber"] }],
  },
};
