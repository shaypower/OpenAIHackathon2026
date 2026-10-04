"""Explicit server configuration; no key, model ID or price is guessed."""

import os

from pydantic import ValidationError

from backend.agents.model_compiler import ModelPolicy, StructuredObjectiveCompiler
from backend.agents.objectives import TemplateCompiler


def compiler_from_environment():
    mode = os.getenv("CIVIC_OBJECTIVE_COMPILER", "template")
    if mode == "template":
        return TemplateCompiler()
    if mode != "openai":
        raise ValueError("CIVIC_OBJECTIVE_COMPILER must be template or openai")
    required = ("OPENAI_API_KEY", "OPENAI_MODEL", "CIVIC_MODEL_MAX_COST_USD",
                "CIVIC_MODEL_INPUT_USD_PER_MILLION", "CIVIC_MODEL_OUTPUT_USD_PER_MILLION")
    missing = [name for name in required if not os.getenv(name, "").strip()]
    if missing:
        raise ValueError("OpenAI mode requires: " + ", ".join(missing))
    try:
        policy = ModelPolicy(
            max_cost_usd=os.environ["CIVIC_MODEL_MAX_COST_USD"],
            input_usd_per_million=os.environ["CIVIC_MODEL_INPUT_USD_PER_MILLION"],
            output_usd_per_million=os.environ["CIVIC_MODEL_OUTPUT_USD_PER_MILLION"],
        )
    except ValidationError:
        raise ValueError("Model prices and cost budget must be finite nonnegative values, with a positive budget") from None
    from backend.agents.openai_provider import OpenAIProvider
    return StructuredObjectiveCompiler(OpenAIProvider(os.environ["OPENAI_API_KEY"]), model=os.environ["OPENAI_MODEL"], policy=policy)
