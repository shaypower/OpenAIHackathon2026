"""Version-one bootstrap responses; runtime capabilities are separate from data."""

from datetime import date
from pathlib import PurePosixPath
from typing import Literal
from urllib.parse import parse_qsl

from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AwareDatetime, Field, HttpUrl, JsonValue, StringConstraints, field_validator, model_validator

from backend.domain.models import CivicObjective, Contract, Count, DataMode, Id, SimulationRun, Text


class SourceRecord(Contract):
    id: Id
    name: Text
    dataset: Text
    category: Literal["civic", "fixture", "context"]
    priority: int | None = Field(ge=1, strict=True)
    status: Literal["PLANNED", "BUNDLED", "REMOTE_CONTEXT", "INGESTED", "FAILED"]
    data_mode: DataMode
    source_url: HttpUrl | None
    source_updated_at: AwareDatetime | date | None
    ingested_at: AwareDatetime | None
    licence: Text | None
    local_paths: list[str]
    notes: Text

    @field_validator("source_url")
    @classmethod
    def public_source_url(cls, value: HttpUrl | None) -> HttpUrl | None:
        # Inventory URLs are public citations, not authenticated download links.
        if value and (value.username or value.password):
            raise ValueError("Source URLs must not contain credentials")
        if value and value.query:
            private_keys = {"token", "access_token", "api_key", "apikey", "key", "secret", "signature"}
            for key, _ in parse_qsl(value.query):
                if key.lower() in private_keys or key.lower().startswith("x-amz-"):
                    raise ValueError("Source URLs must not contain download credentials")
        return value

    @field_validator("local_paths")
    @classmethod
    def public_local_paths(cls, values: list[str]) -> list[str]:
        private_parts = {".env", ".venv", "venv", ".aws", ".codex", ".agents", ".git", ".cache"}
        for value in values:
            path = PurePosixPath(value)
            if (
                not value
                or path.is_absolute()
                or ".." in path.parts
                or private_parts.intersection(path.parts)
                or "\\" in value
                or ":" in value
                or value.startswith("~")
            ):
                raise ValueError("Local paths must be public repository-relative paths")
        return values

    @model_validator(mode="after")
    def ingestion_metadata(self) -> "SourceRecord":
        if self.status == "INGESTED" and (self.ingested_at is None or self.source_url is None):
            raise ValueError("Ingested sources need acquisition time and source URL")
        return self


class SourceInventory(Contract):
    schema_version: Literal[1]
    inspected_on: date
    real_civic_datasets_ingested: Count
    sources: list[SourceRecord]

    @model_validator(mode="after")
    def consistent_inventory(self) -> "SourceInventory":
        ids = [source.id for source in self.sources]
        if len(ids) != len(set(ids)):
            raise ValueError("Source IDs must be unique")
        count = sum(
            source.category == "civic" and source.status == "INGESTED" and source.data_mode == "real"
            for source in self.sources
        )
        if count != self.real_civic_datasets_ingested:
            raise ValueError("Real civic ingestion count must match source records")
        return self


class SourcesResponse(Contract):
    schema_version: Literal[1] = 1
    data: SourceInventory


class Capability(Contract):
    name: Text
    status: Literal["IMPLEMENTED", "MOCKED", "PLANNED"]


class ExecutionLimits(Contract):
    # Values describe implemented guards, even while simulation is unavailable.
    max_active_runs_per_session: Count | None = None
    max_tool_actions: Count | None = None
    max_candidates: Count | None = None
    max_refinements: Count | None = None
    run_deadline_seconds: float | None = Field(default=None, gt=0)


class RunStoreStatus(Contract):
    storage: Literal["unavailable", "memory"] = "unavailable"
    durable: Literal[False] = False
    ttl_seconds: Count | None = None
    max_runs: Count | None = None
    restart_behavior: str = "No run store is implemented; runs cannot be created or retrieved."


class StatusData(Contract):
    status: Literal["ready", "degraded"]
    data_mode: DataMode
    capabilities: list[Capability]
    supported_regions: list[str]
    supported_intervention_kinds: list[str]
    limits: ExecutionLimits
    run_store: RunStoreStatus
    limitations: list[str]


class StatusResponse(Contract):
    schema_version: Literal[1] = 1
    data: StatusData


class ErrorDetail(Contract):
    code: Text
    message: Text
    request_id: Id
    retryable: bool
    details: dict[str, JsonValue] = Field(default_factory=dict)


class ErrorResponse(Contract):
    schema_version: Literal[1] = 1
    error: ErrorDetail


ObjectiveText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=12, max_length=500)]
RequestId = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]


class ObjectiveValidationRequest(Contract):
    text: ObjectiveText


class AnalyseObjectiveRequest(ObjectiveValidationRequest):
    departure_at: AwareDatetime
    timezone: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
    dataset_ids: Annotated[list[RequestId], Field(min_length=1)]
    demand_config_id: RequestId
    client_request_id: RequestId

    @model_validator(mode="after")
    def valid_context(self):
        try:
            zone = ZoneInfo(self.timezone)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("Timezone must be a known IANA timezone") from exc
        if self.departure_at.astimezone(zone).utcoffset() != self.departure_at.utcoffset():
            raise ValueError("Departure offset does not match the named timezone on that date")
        if len(self.dataset_ids) != len(set(self.dataset_ids)):
            raise ValueError("Dataset IDs must be unique")
        return self


class ObjectiveModelUsageDTO(Contract):
    model: Text
    generation_attempts: Annotated[int, Field(ge=1, le=2, strict=True)]
    input_tokens: Count
    output_tokens: Count
    reserved_tokens: Count
    reserved_cost_usd: Annotated[str, StringConstraints(pattern=r"^\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?$")]


class ObjectiveValidationData(Contract):
    objective: CivicObjective
    assumptions: list[str]
    parser_mode: Literal["deterministic_template", "openai_structured"] = "deterministic_template"
    evaluable: Literal[False] = False
    limitations: list[str]
    model_usage: ObjectiveModelUsageDTO | None = None


class ObjectiveValidationResponse(Contract):
    schema_version: Literal[1] = 1
    data: ObjectiveValidationData


class RunAcceptanceData(Contract):
    run_id: Id
    status: Literal["queued"]
    data_mode: DataMode
    objective: CivicObjective
    assumptions: list[str]
    poll_url: Text


class RunAcceptanceResponse(Contract):
    schema_version: Literal[1] = 1
    data: RunAcceptanceData


class ToolActionDTO(Contract):
    action_id: Id
    tool: Text
    status: Literal["running", "succeeded", "failed", "cancelled"]
    input_refs: list[Id]
    output_ref: Id | None
    started_at: AwareDatetime
    ended_at: AwareDatetime | None
    error_code: str | None


class RankingEntry(Contract):
    intervention_id: Id
    simulation_run_id: Id
    rank: Annotated[int, Field(ge=1, strict=True)]
    score_components: dict[str, float]


class FailureObservationDTO(Contract):
    community_id: Id
    code: Text
    description: Text
    evidence_ids: list[Id]


class AgentSummaryDTO(Contract):
    run_id: Id
    generated_by: Literal["deterministic_tool_summary"]
    data_mode: DataMode
    text: Text
    findings: list[FailureObservationDTO]
    evidence_ids: list[Id]


class RunReadbackData(Contract):
    run: SimulationRun
    assumptions: list[str]
    limitations: list[str]
    ranking: list[RankingEntry] = Field(default_factory=list)
    tool_trace: list[ToolActionDTO] = Field(default_factory=list)
    agent_summary: AgentSummaryDTO | None = None
    model_usage: ObjectiveModelUsageDTO | None = None


class RunReadbackResponse(Contract):
    schema_version: Literal[1] = 1
    data: RunReadbackData
