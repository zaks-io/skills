const string = { type: "string" };
const boolean = { type: "boolean" };
const nonNegativeInteger = { type: "integer", minimum: 0 };
const percentage = { type: "number", minimum: 0, maximum: 100 };

const fields = (names, schema) => Object.fromEntries(names.map((name) => [name, schema]));

const scalarOrArray = (item) => ({
  anyOf: [item, { type: "array", items: item }],
});

const strings = scalarOrArray(string);
const tier = { type: "string", enum: ["low", "medium", "high"] };
const tiers = scalarOrArray(tier);
const requiredReviewCounts = {
  oneOf: [
    { type: "integer", minimum: 1 },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        low: { type: "integer", minimum: 1 },
        medium: { type: "integer", minimum: 1 },
        high: { type: "integer", minimum: 1 },
      },
    },
  ],
};
const estimatePolicy = {
  type: "object",
  additionalProperties: false,
  properties: {
    requiredBeforeReady: boolean,
    requiredForReady: boolean,
    required: boolean,
  },
};

const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  additionalProperties: false,
  properties: {
    ...fields(
      [
        "doneStates",
        "readinessLabels",
        "implementationReadyLabels",
        "agentReadinessLabels",
        "readyStates",
        "linearBacklogStates",
        "readyPromotionSourceStates",
        "intakeStates",
        "highRiskLabels",
        "lowRiskLabels",
        "remoteWorkerPaths",
        "localWorkerPaths",
        "startableStates",
        "startableStateTypes",
        "readyStateTypes",
        "startableKindLabels",
      ],
      strings,
    ),
    ...fields(
      [
        "doneState",
        "readinessLabel",
        "implementationReadyLabel",
        "agentReadinessLabel",
        "readyState",
        "linearBacklogState",
        "intakeState",
        "inProgressState",
        "startableState",
        "startableStateType",
        "readyStateType",
        "startableKindLabel",
        "humanMergePrLabel",
        "humanReviewPrLabel",
        "codeHostHumanMergePrLabel",
        "codeHostHumanMergeLabel",
        "codeHostHumanReviewPrLabel",
        "codeHostHumanReviewLabel",
        "codeHostPrAttentionLabel",
        "mergeAuthority",
        "remoteWorkerPath",
        "localWorkerPath",
        "defaultWorkerPath",
        "hostedReviewProvider",
      ],
      string,
    ),
    deliveryMode: { type: "string", enum: ["production", "velocity"] },
    autoMergeRiskTiers: tiers,
    requiredIndependentReviews: requiredReviewCounts,
    ...fields(
      [
        "requestedReadyStatePromotion",
        "requestedLinearBacklogReview",
        "secondReviewOnUncertainty",
        "requireConformanceEvidence",
        "requireDispatchFootprint",
        "requiresAutoReviewResolution",
        "supportsLocalCli",
        "estimateRequired",
        "estimatesRequired",
        "requireEstimate",
        "requireEstimates",
        "requiresEstimate",
        "requiredEstimate",
        "requiredEstimates",
        "requiredEstimateBeforeReady",
        "estimateRequiredBeforeReady",
        "estimatesRequiredBeforeReady",
        "requireEstimateBeforeReady",
        "requireEstimatesBeforeReady",
      ],
      boolean,
    ),
    workerConcurrencyCap: nonNegativeInteger,
    cap: nonNegativeInteger,
    localStartsBelowSoftLimit: nonNegativeInteger,
    localBudgetSoftStopPercent: percentage,
    localBudgetHardStopPercent: percentage,
    estimate: estimatePolicy,
    estimates: estimatePolicy,
    estimatePolicy,
  },
};

export default schema;
