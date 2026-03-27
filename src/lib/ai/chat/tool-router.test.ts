/*
TODO: restore tool router coverage.

Spec:
- resolves the tool selection model for routing.
- falls back to deterministic baseline when no provider is set.
- strips mutation exposure when there is no mutation root.
- rejects unrelated integration and MCP namespaces.
- builds a minimal next-step routing prompt with explicit narrowing rules.
- uses the model router to activate a specialized integration namespace.
- records remediation as model-driven when evidence exists and the router selects execution.
- keeps local and web baseline tools active even when the router only asks for integrations.
- surfaces connected integration metadata in the routing manifest without precomputed intent matches.
- keeps mutation routing specific when mutation is not baseline-managed.
- falls back to baseline tools only when all model routing attempts error.
- falls back to the main model when the dedicated router model errors.
*/

export {};
