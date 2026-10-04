# Person C: agent implementation

## Available now

| Component | Implementation | Runtime status |
| --- | --- | --- |
| Template compiler | `backend/agents/objectives.py` | Default; no key/model required |
| Structured model compiler | `model_compiler.py`, `openai_provider.py`, `config.py` | Explicit OpenAI mode; injected-response/SDK transport checks pass; live model call unverified |
| Lifecycle/typed baseline tool | `backend/orchestration/` | Implemented; opt-in B synthetic adapter; default analysis returns 503 |
| Failure/evidence summary | `backend/agents/reporting.py` | Successful run readback copies recorded tool facts; null while active/failed/cancelled |
| Candidate evaluation/ranking/refinement | `backend/agents/workflow.py` | Implemented library with B synthetic tools and test-only mocks; candidate HTTP operations pending |

The UI remains on D's mock providers. A's ingestion and B's routing calculations
are separate dependencies.

## Objective compilation

`POST /api/objectives/validate` still accepts only `{"text":"..."}`. Its envelope
now permits `parser_mode="openai_structured"` as well as `"deterministic_template"`,
plus nullable `model_usage`. Both modes return `evaluable=false`: compilation does
not run routing or check available analytical datasets.

Model mode supports paraphrases within the same scope: primary healthcare for
age-65+/elderly residents without cars in Tipperary. Independent checks require
explicit Tipperary, cohort/car-access/service markers. Digit-based minutes/hours
and percent targets must match the extraction; contradictions require clarification.
Original text is retained and IDs are assigned by C. Omitted journey time defaults
to 45 with an assumption; omitted coverage target stays null. Model interpretation
still needs review; structural checks do not prove intent or factual accuracy.

The model schema contains decision, domain/service/geography, age/car access and
nullable journey limit/coverage target. It has no calculated population,
accessibility, impact, cost, ranking, evidence, IDs or tool commands. Source text
and tool outputs are never promoted to system instructions. Model errors do not
silently invoke the template parser.

## Enable the optional compiler

Default startup is unchanged:

```sh
source .venv/bin/activate
python -m uvicorn backend.main:app --reload
```

For OpenAI mode, install `backend/requirements-agent.txt` (verified with SDK
2.54.0) and set these **server environment variables** before starting:

| Variable | Value |
| --- | --- |
| `CIVIC_OBJECTIVE_COMPILER` | `openai` (default `template`) |
| `OPENAI_API_KEY` | Your server-side key |
| `OPENAI_MODEL` | Your approved model supporting strict Structured Outputs |
| `CIVIC_MODEL_MAX_COST_USD` | Positive maximum reserved generation cost per compilation, e.g. `0.05` |
| `CIVIC_MODEL_INPUT_USD_PER_MILLION` | Current uncached input rate for that model/account |
| `CIVIC_MODEL_OUTPUT_USD_PER_MILLION` | Current output rate for that model/account |

No key/model/price is guessed; setting a key alone does not enable OpenAI. The app
does not load `.env` files. Get actual rates from [official pricing](https://developers.openai.com/api/docs/pricing)
and keep them matched to the configured model. Configuration errors show variable
names, not secrets. The provider explicitly uses the official API origin.

Try this paraphrase in `/api/docs` after enabling model mode:

```json
{"text":"Help elderly residents without cars in rural Tipperary reach primary healthcare within 30 minutes."}
```

Validation performs model generation in OpenAI mode. Repeated validation requests
can incur additional charges; that route has no request-ID replay contract.
`/api/objectives/analyse` rejects before model use when no B adapter is registered.

## Limits and failures

- One compilation at a time; its ten-second deadline includes queue wait,
  token-count preflight and generation/retry.
- Count the same input/schema payload using the Responses input-token endpoint
  before generation. Input cap 4,096 tokens; output cap 768; total generation
  reservations 10,000 tokens per compilation.
- Generation gets at most one transient retry; token-count preflight separately
  gets one. SDK automatic retries are disabled. Refusal/invalid/incomplete/config
  responses are not retried.
- Reserve input + full output cap at configured prices before each generation.
  Unknown failed charges keep their full reservation. Usage over reservation is
  rejected. This is a local estimate at configured prices, not a billing guarantee.
- Success `model_usage` records model, generation attempts, final successful
  attempt's input/output tokens, total reserved tokens and decimal-string USD
  reservation. Final observed usage does not describe unknown failed charges.
- Analysis compilation and baseline execution share the 30-second deadline from
  submission processing after its acceptance lock. Standalone validation uses
  the separate ten-second compiler deadline.
- Missing simulator, unknown dataset/config and active-run capacity are rejected
  before paid compilation. Concurrent exact analysis replay does not compile
  twice. Pre-acceptance model results/public errors use a separate bounded local
  request-ID cache: 100 entries/one-hour TTL by default. Conflict gives 409; a
  retained failure replays as that failure. A deliberate new attempt needs a new
  request ID. Acceptance transfers replay protection to the run store. Both caches
  lose protection on restart, expiry or eviction.

Public codes include `clarification_required`, `unsupported_objective`,
`invalid_objective`, `model_refused`, `model_incomplete`, `model_timeout`,
`model_unavailable`, `model_configuration_error`, `invalid_model_result`,
`invalid_model_usage`, `model_budget_exhausted` and `execution_deadline`.
No provider exception text, credentials or invalid model JSON is returned.

## B adapter for the candidate workflow

The proposed `CandidateTools` protocol requires:

1. Truthful `supported_intervention_kinds`.
2. Pure/bounded `validate_candidate(baseline, candidate)` for actual graph IDs,
   dated support and change semantics.
3. Async `generate_candidates(...) -> CandidateBatch`, accepting a cap and prior
   evaluations for one optional refinement.
4. Async `simulate_candidate(...) -> CandidateEvaluation`: B's results plus
   unchanged baseline/objective/dataset/config/date/timezone/engine references.
5. Async `rank_candidates(...) -> CandidateRanking`: B's deterministic score/rank
   for each successful evaluation exactly once.

Use `AgentWorkflow(adapter).run(succeeded_baseline, execution_context,
allowed_kinds=(...), max_candidates=3, refine=False)`. Targets come from recorded
unmet cohorts; no failure cause is guessed. C validates typed changes, scope,
evidence/mode, unchanged cohort denominators and complete finite rankings. Adapter
inputs are copied. Proposals contain no uncomputed impact.

Actual generation/evaluation/ranking use `ExecutionContext`. `max_candidates`
is a total across both batches; outer 20-candidate/12-action/one-refinement/
30-second guards apply. Batch sizes fit remaining actions and record any reduction,
or fail before starting an impossible plan. Outcomes include proposals,
evaluations/ranking, selected evaluated ID, limitations and typed artifacts
resolving successful trace output refs. Empty proposals/no unmet cohort returns
no fabricated selection. Failure/timeout produces no successful workflow outcome.

`backend/orchestration/transport_adapter.py` now maps B's actual synthetic
facade to this seam. The app registers it for baseline only when
`CIVIC_ENABLE_SYNTHETIC_BASELINE=1`. It runs calculations in cancellable
subprocesses and verifies rebuilt candidate baselines against the pinned record.
Candidate methods are available to this library; they do not persist child runs
or mount candidate/simulation/stress endpoints. Stress execution and graph-level
failure inspection still need composition. B's ranking includes null operational
costs and bounded text explaining the policy; C preserves those components.

## Synthetic B integration

Start with `CIVIC_ENABLE_SYNTHETIC_BASELINE=1 python -m uvicorn backend.main:app --reload`.
Use the [README example](../../README.md) for both synthetic dataset IDs,
`synthetic-demand-v1` and dated Europe/Dublin departure. These IDs deliberately
map to B's miniature fixture, never A's real analytical snapshot.

The original B integration's dataclass demand-copy operation was incompatible
with the shared Pydantic model. C's worker uses `model_copy` and keeps calculations
in B's functions. 90-minute baseline: 30/130; 45-minute baseline: 10/130.
The actual candidate library, with nine candidates, preserves B's rank and chooses
+20 minutes, recomputing 130/130 for the 90-minute objective. Reserve one action
for baseline plus 11 for the library (or share the same execution context).
Each candidate subprocess also rebuilds the same deterministic fixture baseline;
that work is part of the named tool action and its deadline.

Candidate HTTP/persistence, stress/GeoJSON and full browser map integration are
still future work. The browser panel can validate objectives and inspect a supplied
run ID; its civic map still uses the separate mock provider. Real analysis remains
blocked on the unobserved joint cohort and missing validated transport/service inputs.

## D readback change

`GET /api/runs/{run_id}` adds nullable `agent_summary` and `model_usage`.
Summary fields: `run_id`, `generated_by="deterministic_tool_summary"`, `data_mode`,
text, findings (`community_id`, code, description, evidence IDs) and resolving
evidence IDs. It copies tool facts and mode labels without claiming an LLM
explanation or public verification. D must map additions and preserve nulls.
Baseline `after`/HTTP ranking remain null/empty until their contracted operations
exist; candidate library artifacts are not mounted run endpoints.

## Checks and references

Run orchestration and shared-domain discovery from the root. Optional SDK checks
skip without the agent extra; with it they exercise actual SDK serialization
through an HTTP mock transport. Model/simulator fixtures exist only in tests.
No paid model invocation was made in this task.

Official OpenAI documentation MCP/Context7 tools were unavailable. The fallback
used fetched official [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs),
[function calling](https://developers.openai.com/api/docs/guides/function-calling)
and [token counting](https://developers.openai.com/api/docs/guides/token-counting)
documentation and installed SDK signatures. Initial planning uses predictable
typed calls; dynamic model-selected tools are not enabled.
