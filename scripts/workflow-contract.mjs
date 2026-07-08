const DEFAULT_DONE_STATES = ["done", "closed", "complete", "completed"];
const DEFAULT_READY_STATES = ["todo"];
const DEFAULT_READINESS_LABELS = ["ready-for-agent", "ready-for-human"];
const DEFAULT_HUMAN_MERGE_PR_LABEL = "needs-human-merge";
const DEFAULT_READY_PROMOTION_SOURCE_STATES = ["triage", "intake"];
const TERMINAL_PR_STATES = ["closed", "merged"];
const INACTIVE_PREVIEW_STATES = ["inactive", "deleted", "closed", "failed"];
const CLEAN_REVIEW_VERDICTS = [
  "approve",
  "approved",
  "ready for pr",
  "ready to merge",
  "ready_to_merge",
];

const TRUSTED_POLICY_SOURCES = new Set([
  "agent_adapter",
  "repo_config",
  "system",
  "user_request",
  "workflow_skill",
]);

const UNTRUSTED_OVERRIDE_PATTERNS = [
  /\bignore\b.*\b(instruction|policy|workflow|system|developer)\b/i,
  /\b(skip|bypass|disable)\b.*\b(test|check|review|hook|secret scan|gitleaks)\b/i,
  /\b(push|commit|merge|deploy)\b.*\b(main|master|production)\b/i,
  /\b(print|exfiltrate|upload|send)\b.*\b(secret|token|key|credential)\b/i,
];

const toArray = (value) => {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
};

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const labelName = (label) => normalize(typeof label === "string" ? label : label?.name);

const shaEquals = (left, right) => Boolean(left && right && normalize(left) === normalize(right));

const valueSet = (values) => new Set(toArray(values).map(normalize).filter(Boolean));

export const workflowDecisionActions = Object.freeze({
  applyHumanMergePrLabel: "APPLY_HUMAN_MERGE_PR_LABEL",
  applyReviewEvidence: "APPLY_REVIEW_EVIDENCE",
  clearHumanMergePrLabel: "CLEAR_HUMAN_MERGE_PR_LABEL",
  clearReviewEvidence: "CLEAR_REVIEW_EVIDENCE",
  deferForFileContention: "DEFER_FOR_FILE_CONTENTION",
  dispatchStartableWork: "DISPATCH_STARTABLE_WORK",
  drainActiveWork: "DRAIN_ACTIVE_WORK",
  deferUntilPrReady: "DEFER_UNTIL_PR_READY",
  hostedReviewComplete: "RECORD_HOSTED_REVIEW_COMPLETE",
  hostedReviewPending: "RECORD_HOSTED_REVIEW_PENDING",
  ignoreUntrustedOverride: "IGNORE_AND_RECORD_SECURITY_FINDING",
  leaveUnchanged: "LEAVE_UNCHANGED",
  promoteToReadyState: "PROMOTE_TO_READY_STATE",
  requestFileFootprint: "REQUEST_FILE_FOOTPRINT",
  requestPrReview: "REQUEST_PR_REVIEW",
  resolveAutoReviewState: "RESOLVE_AUTO_REVIEW_STATE",
  runLocalCli: "RUN_LOCAL_CLI",
  stopBlocked: "STOP_COMPLETELY_BLOCKED",
  treatAsWorkContext: "TREAT_AS_WORK_CONTEXT",
  waitForSignal: "WAIT_FOR_EXTERNAL_SIGNAL",
});

export function isDoneTicket(ticket, config = {}) {
  const doneStates = valueSet([
    ...DEFAULT_DONE_STATES,
    ...toArray(config.doneStates),
    config.doneState,
  ]);
  return doneStates.has(normalize(ticket?.state ?? ticket?.status ?? ticket?.workflowState));
}

export function hasReadinessLabel(ticket, config = {}) {
  const readinessLabels = valueSet([
    ...DEFAULT_READINESS_LABELS,
    ...toArray(config.readinessLabels),
    config.readinessLabel,
  ]);
  return toArray(ticket?.labels).some((label) => readinessLabels.has(labelName(label)));
}

export function shouldIncludeReadinessTicket(ticket, config = {}) {
  return hasReadinessLabel(ticket, config) && !isDoneTicket(ticket, config);
}

function isKindSlice(ticket) {
  const explicitKind = normalize(ticket?.kind ?? ticket?.kindLabel ?? ticket?.kindName);
  if (explicitKind === "kind-slice") return true;
  return toArray(ticket?.labels).some((label) => labelName(label) === "kind-slice");
}

export function readyStatePromotionDecision(ticket, config = {}, options = {}) {
  const readyState = config.readyState ?? "Todo";
  const readyStates = valueSet([readyState, ...toArray(config.readyStates)]);
  const linearBacklogStates = valueSet([
    "backlog",
    config.linearBacklogState,
    ...toArray(config.linearBacklogStates),
  ]);
  const sourceStates = valueSet([
    ...DEFAULT_READY_PROMOTION_SOURCE_STATES,
    ...toArray(config.readyPromotionSourceStates),
    ...toArray(config.intakeStates),
    config.intakeState,
  ]);
  const state = normalize(ticket?.state ?? ticket?.status ?? ticket?.workflowState);
  const requestedReadyStatePromotion = Boolean(
    options.requestedReadyStatePromotion ?? config.requestedReadyStatePromotion,
  );
  const requestedLinearBacklogReview = Boolean(
    options.requestedLinearBacklogReview ?? config.requestedLinearBacklogReview,
  );
  const implementationReady = Boolean(
    ticket?.implementationReady ??
    ticket?.readyForImplementation ??
    (isKindSlice(ticket) && hasReadinessLabel(ticket, config)),
  );

  if (!implementationReady) {
    return {
      action: workflowDecisionActions.leaveUnchanged,
      reason: "ticket is not implementation-ready",
    };
  }

  if (isDoneTicket(ticket, config)) {
    return {
      action: workflowDecisionActions.leaveUnchanged,
      reason: "done tickets are terminal, not ready-state candidates",
    };
  }

  if (readyStates.has(state)) {
    return {
      action: workflowDecisionActions.leaveUnchanged,
      reason: "ticket is already in the configured ready state",
    };
  }

  if (!sourceStates.has(state)) {
    return {
      action: workflowDecisionActions.leaveUnchanged,
      reason: "ticket is not in a configured ready-state promotion source state",
    };
  }

  if (!requestedReadyStatePromotion) {
    return {
      action: workflowDecisionActions.leaveUnchanged,
      reason: "ready-state promotion was not requested",
    };
  }

  if (linearBacklogStates.has(state) && !requestedLinearBacklogReview) {
    return {
      action: workflowDecisionActions.leaveUnchanged,
      reason: "Linear Backlog promotion requires requested Linear Backlog review",
    };
  }

  return {
    action: workflowDecisionActions.promoteToReadyState,
    targetState: readyState,
    reason:
      "implementation-ready work belongs in the ready state; dependency blockers are encoded separately",
  };
}

export function reviewEvidenceDecision(evidence = {}) {
  const hasEvidence = Boolean(evidence.hasReviewEvidence ?? evidence.evidenceLabel);
  const cleanVerdict = valueSet(CLEAN_REVIEW_VERDICTS).has(normalize(evidence.reviewVerdict));

  if (!hasEvidence) {
    if (cleanVerdict && shaEquals(evidence.reviewedHeadSha, evidence.currentPrHeadSha)) {
      return {
        action: workflowDecisionActions.applyReviewEvidence,
        reason: "clean review covers the current PR head",
      };
    }

    return {
      action: workflowDecisionActions.leaveUnchanged,
      reason: "no current review evidence to apply or clear",
    };
  }

  if (evidence.blockingFindings) {
    return {
      action: workflowDecisionActions.clearReviewEvidence,
      reason: "blocking findings invalidate review evidence",
    };
  }

  if (evidence.linkedPrChanged || evidence.evidenceMissing) {
    return {
      action: workflowDecisionActions.clearReviewEvidence,
      reason: "linked PR or review evidence no longer matches the ticket",
    };
  }

  if (!shaEquals(evidence.reviewedHeadSha, evidence.currentPrHeadSha)) {
    return {
      action: workflowDecisionActions.clearReviewEvidence,
      reason: "reviewed head SHA does not match current PR head",
    };
  }

  return {
    action: workflowDecisionActions.leaveUnchanged,
    reason: "review evidence is current",
  };
}

const hasNamedLabel = (labels, name) =>
  Boolean(name) && toArray(labels).some((label) => labelName(label) === normalize(name));

function currentReviewEvidence(state = {}) {
  const currentHead = state.currentPrHeadSha ?? state.headSha;
  const reviewedHead = state.reviewedHeadSha ?? state.reviewHeadSha;
  const cleanVerdict = valueSet(CLEAN_REVIEW_VERDICTS).has(
    normalize(state.reviewVerdict ?? state.codeReviewVerdict),
  );
  const hasEvidence = Boolean(
    state.reviewEvidenceCurrent ??
    state.hasReviewEvidence ??
    state.reviewEvidenceLabel ??
    state.evidenceLabel,
  );

  return Boolean(
    state.reviewEvidenceCurrent === true ||
    (hasEvidence && cleanVerdict && shaEquals(reviewedHead, currentHead)),
  );
}

function countEvidence(value) {
  if (Array.isArray(value)) return value.length;
  if (typeof value === "number") return value;
  return value ? 1 : 0;
}

function requiredChecksPassed(state = {}) {
  return Boolean(
    state.requiredChecksPassed ??
    state.requiredChecksGreen ??
    state.checksPassing ??
    state.checksGreen ??
    state.ciGreen,
  );
}

function humanMergeRequired(state = {}, config = {}) {
  if (state.humanMergeRequired === false) return false;
  const authority = normalize(state.mergeAuthority ?? config.mergeAuthority);
  return !["agent", "auto", "automated", "orchestrator"].includes(authority);
}

export function humanMergePrLabelDecision(state = {}, config = {}) {
  const label =
    state.humanMergePrLabel ??
    state.humanReviewPrLabel ??
    config.humanMergePrLabel ??
    config.humanReviewPrLabel ??
    config.codeHostHumanMergePrLabel ??
    config.codeHostHumanMergeLabel ??
    config.codeHostHumanReviewPrLabel ??
    config.codeHostHumanReviewLabel ??
    config.codeHostPrAttentionLabel ??
    DEFAULT_HUMAN_MERGE_PR_LABEL;
  const prLabels = [
    ...toArray(state.prLabels),
    ...toArray(state.pullRequestLabels),
    ...toArray(state.labels),
  ];
  const labelApplied = Boolean(
    state.humanMergePrLabelApplied ??
    state.humanReviewPrLabelApplied ??
    state.hasHumanMergePrLabel ??
    state.hasHumanReviewPrLabel ??
    hasNamedLabel(prLabels, label),
  );
  const prState = normalize(state.prState ?? state.state ?? state.status);
  const terminal =
    state.merged === true || state.closed === true || TERMINAL_PR_STATES.includes(prState);
  const open = state.open ?? !terminal;
  const draft = Boolean(
    state.draft === true ||
    state.isDraft === true ||
    prState === "draft" ||
    normalize(state.draftState) === "draft",
  );
  const unresolvedReviewThreads = countEvidence(
    state.unresolvedReviewThreads ?? state.unresolvedThreads,
  );
  const blockingFindings = Boolean(state.blockingFindings ?? state.changesRequested);
  const hostedReviewBlocked = Boolean(
    state.hostedReviewPending ||
    state.codeRabbitPending ||
    (state.hostedReviewRequired && !state.hostedReviewComplete && !state.hostedReviewSkipped) ||
    (state.codeRabbitRequired && !state.codeRabbitComplete && !state.codeRabbitSkipped),
  );

  const invalidReason = !label
    ? "no human-merge PR label is configured"
    : !open || terminal
      ? "PR is not open"
      : draft
        ? "draft PRs are pre-review and cannot be marked ready for human merge"
        : !humanMergeRequired(state, config)
          ? "configured merge authority does not require human merge"
          : !currentReviewEvidence(state)
            ? "current PR head lacks clean code review evidence"
            : !requiredChecksPassed(state)
              ? "required checks are not confirmed passing"
              : blockingFindings
                ? "blocking findings or changes requested remain"
                : unresolvedReviewThreads > 0
                  ? "unresolved review threads remain"
                  : hostedReviewBlocked
                    ? "required hosted review is pending or incomplete"
                    : state.scopeMatches === false || state.diffMatchesScope === false
                      ? "diff does not match the linked issue scope"
                      : "";

  if (invalidReason) {
    return {
      action: labelApplied
        ? workflowDecisionActions.clearHumanMergePrLabel
        : workflowDecisionActions.leaveUnchanged,
      label,
      reason: invalidReason,
    };
  }

  if (!labelApplied) {
    return {
      action: workflowDecisionActions.applyHumanMergePrLabel,
      label,
      reason: "PR is merge-ready except for required human merge authority",
    };
  }

  return {
    action: workflowDecisionActions.leaveUnchanged,
    label,
    reason: "human-merge PR label is current",
  };
}

export function activeDeliveryFootprint(state = {}) {
  const openPrs = toArray(state.pullRequests).filter(
    (pr) => pr?.open !== false && !TERMINAL_PR_STATES.includes(normalize(pr?.state ?? pr?.status)),
  );
  const prKeys = new Set(
    openPrs
      .flatMap((pr) => [pr.id, pr.url, pr.number, pr.prId])
      .map(normalize)
      .filter(Boolean),
  );

  const activePreviews = toArray(state.previews).filter((preview) => {
    if (preview?.active === false) return false;
    return !INACTIVE_PREVIEW_STATES.includes(normalize(preview?.state ?? preview?.status));
  });
  const unlinkedPreviews = activePreviews.filter((preview) => {
    const previewPrKeys = [preview.prId, preview.prUrl, preview.prNumber]
      .map(normalize)
      .filter(Boolean);
    return previewPrKeys.length === 0 || previewPrKeys.every((key) => !prKeys.has(key));
  });

  const pendingDispatches = toArray(state.dispatches).filter(
    (dispatch) =>
      dispatch?.returned !== true &&
      dispatch?.stopped !== true &&
      dispatch?.hasPr !== true &&
      !["returned", "stopped", "failed"].includes(normalize(dispatch?.state ?? dispatch?.status)),
  );

  return {
    dispatches: pendingDispatches.length,
    previews: unlinkedPreviews.length,
    prs: openPrs.length,
    total: openPrs.length + unlinkedPreviews.length + pendingDispatches.length,
  };
}

export function capacityDecision(state = {}, config = {}) {
  const cap = Number(config.activePrPreviewCap ?? config.cap ?? 3);
  const footprint = activeDeliveryFootprint(state);
  const startableCount = toArray(state.startableTickets).length;
  const activeSignalExpected = Boolean(state.activeSignalExpected);

  if (footprint.total >= cap) {
    return {
      action: workflowDecisionActions.drainActiveWork,
      footprint,
      reason: "active PR, preview, or dispatch footprint is at capacity",
    };
  }

  if (startableCount > 0) {
    return {
      action: workflowDecisionActions.dispatchStartableWork,
      footprint,
      reason: "capacity exists and startable work is available",
    };
  }

  if (footprint.total > 0 || activeSignalExpected) {
    return {
      action: workflowDecisionActions.waitForSignal,
      footprint,
      reason: "external worker, check, preview, or review signal may still arrive",
    };
  }

  return {
    action: workflowDecisionActions.stopBlocked,
    footprint,
    reason: "no startable work, active work, or expected external signal remains",
  };
}

function normalizeFootprintPath(value) {
  return normalize(value)
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+$/, "");
}

function footprintEntries(item = {}) {
  return [
    ...toArray(item.footprint),
    ...toArray(item.fileFootprint),
    ...toArray(item.files),
    ...toArray(item.paths),
    ...toArray(item.packages),
    ...toArray(item.changedFiles),
  ]
    .map(normalizeFootprintPath)
    .filter(Boolean);
}

function footprintsConflict(leftEntries, rightEntries) {
  return leftEntries.some((left) =>
    rightEntries.some(
      (right) => left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`),
    ),
  );
}

function activeFootprintItems(state = {}) {
  const activePrs = toArray(state.pullRequests).filter(
    (pr) => pr?.open !== false && !TERMINAL_PR_STATES.includes(normalize(pr?.state ?? pr?.status)),
  );
  const activeDispatches = toArray(state.dispatches).filter(
    (dispatch) =>
      dispatch?.returned !== true &&
      dispatch?.stopped !== true &&
      dispatch?.hasPr !== true &&
      !["returned", "stopped", "failed"].includes(normalize(dispatch?.state ?? dispatch?.status)),
  );

  return [...toArray(state.activeWork), ...activePrs, ...activeDispatches];
}

export function dispatchSelectionDecision(state = {}, config = {}) {
  const cap = Number(config.activePrPreviewCap ?? config.cap ?? 3);
  const footprint = activeDeliveryFootprint(state);
  const headroom = Math.max(0, cap - footprint.total);
  const candidates = toArray(state.startableTickets);
  const requireFootprint = config.requireDispatchFootprint !== false;

  if (headroom <= 0) {
    return {
      action: workflowDecisionActions.drainActiveWork,
      deferred: candidates.map((ticket) => ({
        id: ticket?.id,
        reason: "active delivery cap has no headroom",
      })),
      footprint,
      selected: [],
    };
  }

  const activeItems = activeFootprintItems(state).map((item) => ({
    id: item?.id ?? item?.number ?? item?.url,
    footprint: footprintEntries(item),
  }));
  const selected = [];
  const deferred = [];

  for (const ticket of candidates) {
    if (selected.length >= headroom) {
      deferred.push({
        id: ticket?.id,
        reason: "active delivery cap headroom is already allocated",
      });
      continue;
    }

    const ticketFootprint = footprintEntries(ticket);
    if (requireFootprint && ticketFootprint.length === 0) {
      deferred.push({ id: ticket?.id, reason: "missing predicted file footprint" });
      continue;
    }

    const conflict = [...activeItems, ...selected].find((item) =>
      footprintsConflict(ticketFootprint, item.footprint),
    );

    if (conflict) {
      deferred.push({
        id: ticket?.id,
        conflictsWith: conflict.id,
        reason: "predicted file footprint collides with active or selected work",
      });
      continue;
    }

    selected.push({ id: ticket?.id, footprint: ticketFootprint });
  }

  if (selected.length > 0) {
    return {
      action: workflowDecisionActions.dispatchStartableWork,
      deferred,
      footprint,
      selected,
    };
  }

  const missingFootprintOnly =
    deferred.length > 0 &&
    deferred.every((item) => item.reason === "missing predicted file footprint");

  return {
    action: missingFootprintOnly
      ? workflowDecisionActions.requestFileFootprint
      : workflowDecisionActions.deferForFileContention,
    deferred,
    footprint,
    selected,
  };
}

function hostedReviewProviderName(state = {}, config = {}) {
  return String(
    state.hostedReviewProvider ??
      state.reviewProvider ??
      state.provider ??
      config.hostedReviewProvider ??
      "CodeRabbit",
  );
}

export function hostedReviewEscalationDecision(state = {}, config = {}) {
  const provider = hostedReviewProviderName(state, config);
  const providerKey = normalize(provider);
  const recommended = Boolean(state.recommended || state.required || state.highRisk);
  const hasPr = Boolean(state.prExists || state.prUrl);
  const currentHead = state.currentPrHeadSha;
  const hostedHead = state.hostedReviewHeadSha;
  const hostedCoversHead = shaEquals(hostedHead, currentHead);
  const autoReviewMode = normalize(state.autoReviewMode ?? state.autoReview);
  const requiresAutoReviewResolution =
    state.requiresAutoReviewResolution ??
    config.requiresAutoReviewResolution ??
    providerKey === "coderabbit";
  const supportsLocalCli =
    state.supportsLocalCli ?? config.supportsLocalCli ?? providerKey === "coderabbit";
  const autoReviewKnown = ["enabled", "disabled", "opt-in", "label", "description"].includes(
    autoReviewMode,
  );

  if (!recommended) {
    return {
      action: workflowDecisionActions.leaveUnchanged,
      reason: `${provider} hosted review is not required for this diff`,
    };
  }

  if (hasPr && requiresAutoReviewResolution && !autoReviewKnown) {
    return {
      action: workflowDecisionActions.resolveAutoReviewState,
      reason: `resolve ${provider} auto-review mode before posting review commands`,
    };
  }

  if (state.hostedReviewComplete && hostedCoversHead) {
    return {
      action: workflowDecisionActions.hostedReviewComplete,
      reason: "hosted review already covers the current PR head",
    };
  }

  if (state.hostedReviewPending && hostedCoversHead) {
    return {
      action: workflowDecisionActions.hostedReviewPending,
      reason: "hosted review is already pending for the current PR head",
    };
  }

  if (hasPr && autoReviewMode === "enabled") {
    return {
      action: workflowDecisionActions.hostedReviewPending,
      reason: "auto-review is enabled; wait for hosted review state",
    };
  }

  if (hasPr) {
    if (state.draft === true || normalize(state.prState) === "draft") {
      return {
        action: workflowDecisionActions.deferUntilPrReady,
        reason: "request hosted review only after the PR is ready for review",
      };
    }

    return {
      action: workflowDecisionActions.requestPrReview,
      reason: `request ${provider} hosted PR review with the configured PR command`,
    };
  }

  if (state.explicitLocalCliRequest && state.remoteWorker !== true && supportsLocalCli) {
    return {
      action: workflowDecisionActions.runLocalCli,
      reason: `local ${provider} CLI was explicitly requested before a PR exists`,
    };
  }

  return {
    action: workflowDecisionActions.leaveUnchanged,
    reason: "no PR-hosted review path exists yet",
  };
}

export function codeRabbitEscalationDecision(state = {}) {
  return hostedReviewEscalationDecision(
    { ...state, hostedReviewProvider: state.hostedReviewProvider ?? "CodeRabbit" },
    { requiresAutoReviewResolution: true, supportsLocalCli: true },
  );
}

export function classifyInstructionSource(instruction = {}) {
  const source = normalize(instruction.source);
  const text = String(instruction.text ?? "");
  const trusted = TRUSTED_POLICY_SOURCES.has(source);
  const overrideAttempt = UNTRUSTED_OVERRIDE_PATTERNS.some((pattern) => pattern.test(text));

  if (!trusted && overrideAttempt) {
    return {
      action: workflowDecisionActions.ignoreUntrustedOverride,
      trusted: false,
      reason: "untrusted source attempted to override workflow policy",
    };
  }

  return {
    action: trusted ? "MAY_APPLY_AS_POLICY" : workflowDecisionActions.treatAsWorkContext,
    trusted,
    reason: trusted ? "trusted policy source" : "untrusted source may describe work but not policy",
  };
}
