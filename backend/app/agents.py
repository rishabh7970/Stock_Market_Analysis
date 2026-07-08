"""
Multi-agent horizon analysis — built with LangGraph, using a free local LLM
via Ollama (no API costs, runs entirely on your machine).

Prerequisites:
  1. Install Ollama: https://ollama.com
  2. Pull a model:    ollama pull llama3.2
  3. pip install langgraph langchain-ollama

If Ollama isn't installed or running, this still produces the full numeric
analysis — it just skips the LLM-written narrative and says so clearly.

IMPORTANT: this does not tell you to buy or sell anything. It scores public
signals (technicals, sentiment, fundamentals) against a chosen time horizon
and explains the reasoning in plain language. Treat it as a research aid,
not a recommendation — verify everything independently.
"""

from typing import TypedDict, Literal, Optional
import os

from langgraph.graph import StateGraph, END
from langchain_ollama import ChatOllama

from app.insights import build_signal_card

Horizon = Literal["3mo", "6mo", "1y"]

# The LLM narrative step is OFF by default. A full-system crash means your
# machine ran out of resources loading/running the model — that's not safe
# to leave on by default. Set ENABLE_OLLAMA_NARRATIVE=true in your .env only
# after you've confirmed Ollama runs stably on its own (see troubleshooting
# notes below narrative_agent_node), ideally starting with a small model
# like llama3.2:1b.
ENABLE_OLLAMA_NARRATIVE = os.getenv("ENABLE_OLLAMA_NARRATIVE", "false").lower() == "true"

# How much weight each signal type gets, depending on how long you're
# planning to hold. Short horizons lean on momentum/sentiment; long
# horizons lean on fundamentals.
HORIZON_WEIGHTS = {
    "3mo": {"technical": 0.50, "sentiment": 0.30, "fundamental": 0.20},
    "6mo": {"technical": 0.35, "sentiment": 0.25, "fundamental": 0.40},
    "1y":  {"technical": 0.20, "sentiment": 0.15, "fundamental": 0.65},
}

OLLAMA_MODEL = "llama3.2"  # if this crashes/times out on your machine, try a lighter model:
# ollama pull llama3.2:1b   then change this to "llama3.2:1b"


class AgentState(TypedDict, total=False):
    symbol: str
    horizon: Horizon
    card: dict
    technical_score: float
    sentiment_score: float
    fundamental_score: float
    composite_score: float
    label: str
    narrative: Optional[str]
    narrative_available: bool


# ============================================================
# Agent nodes
# ============================================================

def fetch_data_node(state: AgentState) -> AgentState:
    """Reuses the same news/technicals/fundamentals pipeline as the Insights
    page — no duplicate data fetching logic to maintain."""
    card = build_signal_card(state["symbol"])
    return {**state, "card": card}


def technical_agent_node(state: AgentState) -> AgentState:
    tech = state["card"].get("technicals", {})
    score = 50.0

    if tech.get("available"):
        trend = tech.get("trend", "")
        momentum = tech.get("momentum", "")
        rsi = tech.get("rsi", 50)

        if "Bullish" in trend:
            score += 25
        elif "Bearish" in trend:
            score -= 25

        if "Positive" in momentum:
            score += 10
        elif "Negative" in momentum:
            score -= 10

        if rsi <= 30:
            score += 15  # oversold — often read as a potential value entry
        elif rsi >= 70:
            score -= 15  # overbought — often read as pullback risk

    return {**state, "technical_score": max(0.0, min(100.0, score))}


def sentiment_agent_node(state: AgentState) -> AgentState:
    raw = state["card"].get("sentiment_score", 0.0)
    score = (raw + 1) / 2 * 100  # map -1..1 to 0..100
    return {**state, "sentiment_score": max(0.0, min(100.0, score))}


def fundamental_agent_node(state: AgentState) -> AgentState:
    fund = state["card"].get("fundamentals", {})
    pe = fund.get("pe_ratio") if fund.get("available") else None

    if pe is None:
        score = 50.0
    elif pe <= 0:
        score = 30.0  # loss-making
    elif pe <= 15:
        score = 80.0
    elif pe <= 25:
        score = 60.0
    elif pe <= 40:
        score = 40.0
    else:
        score = 20.0

    return {**state, "fundamental_score": score}


def risk_manager_node(state: AgentState) -> AgentState:
    """Combines the three agents' scores using horizon-specific weights —
    this is the one node that knows about the horizon at all."""
    weights = HORIZON_WEIGHTS[state["horizon"]]
    composite = (
        state["technical_score"] * weights["technical"]
        + state["sentiment_score"] * weights["sentiment"]
        + state["fundamental_score"] * weights["fundamental"]
    )

    if composite >= 70:
        label = "Strong candidate for this horizon"
    elif composite >= 55:
        label = "Moderate candidate"
    elif composite >= 40:
        label = "Mixed signals"
    else:
        label = "Weak candidate for this horizon"

    return {**state, "composite_score": round(composite, 1), "label": label}


def narrative_agent_node(state: AgentState) -> AgentState:
    """Asks a local Ollama model to explain the score in plain language.

    Disabled by default (see ENABLE_OLLAMA_NARRATIVE above). If you re-enable
    it and hit crashes or the model process dying mid-generation:
      1. Test Ollama completely on its own first: `ollama run llama3.2` in a
         terminal, unrelated to this app. If IT crashes, this is a system
         resource issue, not a bug here.
      2. Close other memory-heavy apps (browser tabs, etc.) before testing —
         a 3B model wants several GB of free RAM to itself.
      3. Try a much smaller model: `ollama pull llama3.2:1b`, then change
         OLLAMA_MODEL above to "llama3.2:1b". 1B models need a fraction of
         the memory and are far less likely to destabilize a laptop.
      4. Watch Task Manager while it runs — if RAM hits 100% right before
         the crash, that confirms it's a memory ceiling, not a bug.
    Fails gracefully either way — no Ollama running (or disabled here) just
    means no narrative, not a broken screener."""
    if not ENABLE_OLLAMA_NARRATIVE:
        return {
            **state,
            "narrative": "LLM narrative disabled (ENABLE_OLLAMA_NARRATIVE=false). Scores above are still fully computed without it.",
            "narrative_available": False,
        }

    try:
        llm = ChatOllama(model=OLLAMA_MODEL, temperature=0.3, num_predict=180, timeout=30)

        prompt = f"""You are a financial research assistant. You are NOT a financial \
advisor and must never tell the user to buy or sell — only describe the \
signals objectively and neutrally.

Symbol: {state['symbol']}
Investment horizon being evaluated: {state['horizon']}
Technical score (0-100): {state['technical_score']}
Sentiment score (0-100): {state['sentiment_score']}
Fundamental score (0-100): {state['fundamental_score']}
Composite score: {state['composite_score']} — {state['label']}
Key facts: {state['card'].get('bullets', [])}

Write a neutral, 3-sentence explanation of what these scores suggest for \
someone considering this horizon. Do not say "buy" or "sell" or give a \
recommendation. End by noting this is informational only, not financial advice."""

        response = llm.invoke(prompt)
        return {**state, "narrative": response.content, "narrative_available": True}

    except Exception as e:
        print(f"⚠️ Ollama unavailable, skipping narrative for {state['symbol']}: {e}")
        return {
            **state,
            "narrative": "LLM narrative unavailable — install and start Ollama locally to enable this (see backend README).",
            "narrative_available": False,
        }


# ============================================================
# Graph assembly
# ============================================================

def _build_graph():
    graph = StateGraph(AgentState)
    graph.add_node("fetch_data", fetch_data_node)
    graph.add_node("technical_agent", technical_agent_node)
    graph.add_node("sentiment_agent", sentiment_agent_node)
    graph.add_node("fundamental_agent", fundamental_agent_node)
    graph.add_node("risk_manager", risk_manager_node)
    graph.add_node("narrative_agent", narrative_agent_node)

    graph.set_entry_point("fetch_data")
    graph.add_edge("fetch_data", "technical_agent")
    graph.add_edge("technical_agent", "sentiment_agent")
    graph.add_edge("sentiment_agent", "fundamental_agent")
    graph.add_edge("fundamental_agent", "risk_manager")
    graph.add_edge("risk_manager", "narrative_agent")
    graph.add_edge("narrative_agent", END)

    return graph.compile()


_compiled_graph = _build_graph()


def run_horizon_analysis(symbol: str, horizon: Horizon) -> dict:
    """Blocking call — always invoke via asyncio.to_thread."""
    result = _compiled_graph.invoke({"symbol": symbol, "horizon": horizon})
    return {
        "symbol": symbol,
        "horizon": horizon,
        "technical_score": result["technical_score"],
        "sentiment_score": result["sentiment_score"],
        "fundamental_score": result["fundamental_score"],
        "composite_score": result["composite_score"],
        "label": result["label"],
        "narrative": result.get("narrative"),
        "narrative_available": result.get("narrative_available", False),
        "bullets": result["card"].get("bullets", []),
        "disclaimer": "Informational research output, not financial advice. Not a recommendation to buy or sell.",
    }