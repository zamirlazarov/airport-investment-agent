// Shared by the question evals. Judge checks call the Gateway-hosted judge model, so they
// run only when a Gateway key is present; everything else works with any provider key.
export const judgeAvailable = Boolean(process.env["AI_GATEWAY_API_KEY"]);

export const endsWithAssumptions = "The reply ends by stating its assumptions, data window and limits.";
