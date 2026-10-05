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
const identifier = { anyOf: [{ type: "string", pattern: "\\S" }, count] };
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
  ...fields(
    `hasReviewEvidence reviewEvidenceCurrent blockingFindings changesRequested
    linkedPrChanged evidenceMissing requiredChecksPassed requiredChecksGreen checksPassing
    checksGreen ciGreen scopeMatches diffMatchesScope hostedReviewRequired codeRabbitRequired
    hostedReviewComplete codeRabbitComplete hostedReviewSkipped codeRabbitSkipped
    hostedReviewPending hostedReviewCurrent recommended required highRisk prExists
    explicitLocalCliRequest remoteWorker supportsLocalCli requiresAutoReviewResolution
    humanMergePrLabelApplied humanReviewPrLabelApplied hasHumanMergePrLabel
    hasHumanReviewPrLabel productionAction humanDecisionPending`,
    boolean,
  ),
  ...fields(
    `reviewVerdict codeReviewVerdict reviewedHeadSha currentPrHeadSha headSha
    reviewDiffFingerprint currentReviewDiffFingerprint reviewRelevantDiffFingerprint
    reviewedDiffFingerprint reviewedReviewDiffFingerprint hostedReviewDiffFingerprint
    hostedReviewedDiffFingerprint hostedReviewHeadSha hostedReviewProvider reviewProvider
    provider autoReviewMode autoReview prUrl reviewHeadSha status
    conformanceHeadSha humanMergePrLabel humanReviewPrLabel reviewDecision`,
    nullableText,
  ),
  ...fields("reviewEvidenceLabel evidenceLabel", { anyOf: [text, boolean] }),
  ...fields("labels issueLabels prLabels pullRequestLabels riskLabels", labels),
  ...fields(
    "independentReviewCount independentReviews unresolvedReviewThreads unresolvedThreads",
    evidenceCount,
  ),
  ...fields("riskTier tier", { type: "string", enum: ["low", "medium", "high"] }),
  ...fields("conformance conformanceVerdict", {
    type: "string",
    pattern:
      "^(?:[Pp][Aa][Ss][Ss]|[Ff][Aa][Ii][Ll](?:[Ee][Dd])?|[Uu][Nn][Vv][Ee][Rr][Ii][Ff][Ii][Aa][Bb][Ll][Ee])$",
  }),
};

const identityProperties = {
  ...fields("id identifier issueId ticket key number prId prNumber", identifier),
  ...fields(
    `title url branch headRefName headSha headRefOid path worktree session sessionId
    state status workflowState stateType draftState source prUrl`,
    nullableText,
  ),
  ...fields("footprint fileFootprint files paths packages", strings),
};
const identity = (names) =>
  names.split(" ").map((name) => ({
    required: [name],
    properties: { [name]: identifier },
  }));

export const legacyDefinitions = {
  evidence: { type: "object", additionalProperties: false, properties: evidenceProperties },
  reviewEvidenceCheck: {
    type: "object",
    additionalProperties: false,
    properties: {
      ...evidenceProperties,
      pr: identifier,
      ticket: identifier,
    },
    anyOf: identity("pr ticket"),
  },
  checks: {
    type: "object",
    properties: {
      state: text,
      ...fields("failed pending", { type: "array" }),
    },
  },
  pullRequest: {
    type: "object",
    anyOf: identity("number id url headSha headRefName headRefOid currentPrHeadSha"),
    properties: {
      ...identityProperties,
      ...evidenceProperties,
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
          properties: { state: text, ...fields("headSha commitSha", nullableText) },
        },
      },
    },
  },
  issue: {
    type: "object",
    anyOf: identity("identifier key id url"),
    properties: {
      ...identityProperties,
      labels,
      state: { anyOf: [nullableText, { type: "object", properties: fields("name type", text) }] },
      ...fields("kind kindLabel kindName", text),
      ...fields("implementationReady readyForImplementation", boolean),
      ...fields("estimate estimatePoints points size effort bodyEstimate", {
        anyOf: [{ type: "number" }, { type: ["string", "null"] }],
      }),
      ...fields("blockedBy blockers dependsOn dependencies", {
        anyOf: [
          text,
          { type: "object" },
          { type: "array", items: { anyOf: [text, { type: "object" }] } },
        ],
      }),
      ...fields("activeClaim claimed delegated openPr hasOpenPr openPullRequest prOpen", boolean),
    },
  },
  work: {
    type: "object",
    properties: {
      ...identityProperties,
      ...fields(
        `returned stopped hasPr occupiesWorkerSlot active open closed merged
        completedByMergedPr prunable detached locked`,
        boolean,
      ),
      ...fields("dirty mergedIntoBaseline", { type: ["boolean", "null"] }),
      ...fields("worker workerType agent agentType executor executionPath", nullableText),
      ...fields("eligibleWorkers workerPaths allowedWorkers workers", strings),
      ...fields("unlockCount priority", { type: "number" }),
      ...fields("labels issueLabels", labels),
    },
  },
  startableTicket: {
    allOf: [{ $ref: "#/definitions/work" }],
    type: "object",
    properties: fields("id identifier", identifier),
    anyOf: identity("id identifier"),
  },
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
const footprintFields = fields("footprint fileFootprint files paths packages", strings);
const workerProperties = {
  ...retiredIdentityFields,
  ...issueFields,
  ...footprintFields,
  receiptId: opaqueId,
  sessionId: opaqueId,
  prNumber: { type: "integer", minimum: 1 },
  ...fields("title url branch headSha path worktree state status source prUrl", nullableText),
  ...fields(
    `returned stopped hasPr occupiesWorkerSlot active open closed merged
    completedByMergedPr`,
    boolean,
  ),
  ...fields("worker workerType agent agentType executor executionPath", nullableText),
  ...fields("eligibleWorkers workerPaths allowedWorkers workers", strings),
  ...fields("unlockCount priority", { type: "number" }),
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
  ...fields("activeClaim claimed delegated openPr hasOpenPr openPullRequest prOpen", boolean),
  ...issueFields,
  number: false,
  prNumber: false,
  sessionId: opaqueId,
  receiptId: opaqueId,
  blockers: false,
  dependsOn: false,
  dependencies: false,
  ...fields("blockedBy", {
    type: "array",
    items: { $ref: "#/definitions/dependency" },
  }),
};

export const canonicalDefinitions = {
  evidence: legacyDefinitions.evidence,
  checks: legacyDefinitions.checks,
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
          properties: { state: text, ...fields("headSha commitSha", nullableText) },
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

export const definitions = legacyDefinitions;
