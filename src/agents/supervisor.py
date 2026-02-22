import os
import re
import json
import traceback
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain.prompts import PromptTemplate
from langgraph.graph import StateGraph, END
from typing import TypedDict, List, Any

from agents.qa_agent import qa_agent
from agents.map_agent import map_agent
from agents.table_agent import table_agent

load_dotenv()

class SupervisorState(TypedDict):
    query: str
    filters: List[str]
    reasoning: bool
    geojson_input: Any
    agents_to_call: List[str]
    reasoning_summary: str
    cypher_query: str
    cypher_results: list
    text_answer: str
    map_output: str
    table_output: str
    kpi_output: str
    messages: list
    status_queue: Any
    persona: int

def create_supervisor():
    llm = ChatOpenAI(
        model=os.getenv("GWDG_MODEL"),
        api_key=os.getenv("GWDG_API_KEY"),
        base_url=os.getenv("GWDG_BASE_URL"),
        temperature=0
    )
    refine_prompt = PromptTemplate.from_template("""
        You are an expert at rephrasing follow-up questions to be standalone queries.
        Current conversation history: {messages}
        User's new query: {query}
        Rewrite the user's new query to be a standalone sentence that includes all necessary context from the history.
        Standalone query:
    """)

    routing_prompt = PromptTemplate.from_template("""
        You are a routing agent in a FlightGPT system that decides which specialized agents to call.
        
        Available agents:
        - qa_agent: ALWAYS called - generates text chat answer from Neo4j graph data
        - map_agent: Visualizes geospatial data on a map (airports, routes, trajectories)
        - table_agent: Generates HTML tables for detailed inspection
        
        User active filters: {filters}
        Possible filters: 'ap' (Airports), 'tj' (Trajectories), 'ot' (Other).
        
        User query: {query}
        
        MANDATORY RULES:
        1. ALWAYS include "qa" in your response (text answer is mandatory)
        
        2. ALWAYS include "map" when query involves:
        - Flights, routes, trajectories, airports
        - Words like "show", "display", "visualize", "map", "where"
        - Any spatial/geographic data
        - User has filters 'ap' or 'tj' active
        
        3. ALWAYS include "table" when query involves:
        - Words like "show", "list", "display", "all", "details"
        - Comparing multiple flights
        - User explicitly asks for tabular format
        - Inspection of detailed data
        
        4. For queries like "show flights from X", "display routes", "list departures":
        - Include ALL THREE: ["qa", "map", "table"]
        
        Respond with ONLY a JSON array of agent names.
        Examples:
        - "Show flights from Cologne" -> ["qa", "map", "table"]
        - "How many flights departed today?" -> ["qa"]
        - "Visualize routes to Paris" -> ["qa", "map"]
    """)

    reasoning_prompt = PromptTemplate.from_template("""
        Explain briefly why these agents were selected. Here are explanatory details:
        QA-Agent: Queries the Database with openCypher, provides the data to all other agents over the supervisior agent and gererates the text answer.
        Map-Agent: Visualizes geospatial data like airports, routes, trajectories on a map based on the filters.
        Table-Agent: Generates HTML tables and HTML KPI insights for detailed inspection of data based on the filters.
        Internal Knowledge:
        The Map Agent displays data based on the filters the user selected:
        1. IF 'ap' in filters OR filters is empty → Extract Airports as Points
        2. IF 'tj' in filters OR filters is empty → Extract Trajectories as Lines
        3. IF 'ot' in filters → Display other relevant spatial data
        User query: {query}
        Selected agents: {agents}
        User filters: {filters}
        Text answer the user will see: {text_answer}
        It is crucial to look at the text_answer to understand what the agents internally did. Explain that too.
        Keep it to 1-2 sentences. Remove any markdown ** or other formatting. Keep it plain text.
    """)


    def refine_query(state: SupervisorState) -> SupervisorState:
        if state.get("status_queue"):
            state["status_queue"].put({"type": "status", "msg": "Analyzing intent..."})
            
        messages = state.get("messages", [])
        if messages and len(messages) > 0:
            prompt = refine_prompt.format(
                query=state["query"],
                messages=json.dumps(messages, ensure_ascii=False)
            )
            refined_query = llm.invoke(prompt).content.strip()
            state["query"] = refined_query
        return state

    def route_query(state: SupervisorState) -> SupervisorState:
        if state.get("geojson_input"):
            state["agents_to_call"] = ["qa", "map", "table"]
            if not state["query"]:
                state["query"] = "Which flights are passing through the uploaded area?"
                return state
            
        prompt = routing_prompt.format(
            query=state["query"],
            filters=state["filters"],
            messages=json.dumps(state.get("messages", []), ensure_ascii=False)
        )
        response = llm.invoke(prompt).content.strip()
        
        json_match = re.search(r'\[.*?\]', response)
        if json_match:
            try:
                agents = json.loads(json_match.group())
            except:
                agents = ["qa", "map"]
        else:
            agents = ["qa", "map"]
        
        query_lower = state["query"].lower()
        spatial_keywords = ["show", "display", "visualize", "list", "flights", "routes", "departures", "arrivals"]
        
        if any(kw in query_lower for kw in spatial_keywords):
            if "map" not in agents: agents.append("map")
            if "table" not in agents and any(kw in query_lower for kw in ["show", "list", "display", "all"]):
                agents.append("table")
        
        if "qa" not in agents: agents.insert(0, "qa")

        state["agents_to_call"] = agents
        return state

    def generate_reasoning(state: SupervisorState) -> SupervisorState:
        if state["reasoning"]:
            prompt = reasoning_prompt.format(
                query=state["query"],
                agents=", ".join(state["agents_to_call"]),
                filters=state["filters"],
                text_answer=state.get("text_answer", "")
            )
            reasoning_summary = llm.invoke(prompt).content.strip()
            state["reasoning_summary"] = reasoning_summary
        else:
            state["reasoning_summary"] = ""
        return state

    def call_qa_agent(state: SupervisorState) -> SupervisorState:
        if state.get("status_queue"):
            state["status_queue"].put({"type": "status", "msg": "Consulting Flight Database..."})
            
        result = qa_agent.invoke({
            "query": state["query"], 
            "filters": state["filters"],
            "status_queue": state.get("status_queue"),
            "geojson_input": state.get("geojson_input", {}),
            "persona": state.get("persona", 3)
        })
        state["text_answer"] = result["text_answer"]
        state["cypher_query"] = result["cypher_query"]
        state["cypher_results"] = result["cypher_results"]
        return state

    def call_map_agent(state: SupervisorState) -> SupervisorState:
        if state.get("status_queue"):
            state["status_queue"].put({"type": "status", "msg": "Generating Map Data..."})
            
        result = map_agent.invoke({
            "cypher_results": state["cypher_results"],
            "filters": state["filters"],
            "status_queue": state.get("status_queue")
        })
        state["map_output"] = result["map_output"]
        return state

    def call_table_agent(state: SupervisorState) -> SupervisorState:
        if state.get("status_queue"):
             state["status_queue"].put({"type": "status", "msg": "Creating Tables & Statistics..."})

        result = table_agent.invoke({
            "cypher_results": state["cypher_results"],
            "filters": state["filters"],
            "query": state["query"],
            "status_queue": state.get("status_queue")
        })
        state["table_output"] = result["table_output"]
        state["kpi_output"] = result.get("kpi_output", "")
        return state

    def should_call_map(state: SupervisorState) -> str:
        if "map" in state["agents_to_call"]:
            return "map_agent"
        return "check_table"

    def should_call_table(state: SupervisorState) -> str:
        if "table" in state["agents_to_call"]:
            return "table_agent"
        return END

    workflow = StateGraph(SupervisorState)
    workflow.add_node("refine_query", refine_query)
    workflow.add_node("route_query", route_query)
    workflow.add_node("generate_reasoning", generate_reasoning)
    workflow.add_node("qa_agent", call_qa_agent)
    workflow.add_node("map_agent", call_map_agent)
    workflow.add_node("table_agent", call_table_agent)
    workflow.add_node("check_table", lambda state: state)

    workflow.set_entry_point("refine_query")
    workflow.add_edge("refine_query", "route_query")
    workflow.add_edge("route_query", "generate_reasoning")
    workflow.add_edge("generate_reasoning", "qa_agent")
    
    workflow.add_conditional_edges("qa_agent", should_call_map, {"map_agent": "map_agent", "check_table": "check_table"})
    workflow.add_conditional_edges("map_agent", should_call_table, {"table_agent": "table_agent", END: END})
    workflow.add_conditional_edges("check_table", should_call_table, {"table_agent": "table_agent", END: END})

    workflow.add_edge("table_agent", END)

    return workflow.compile()

supervisor = create_supervisor()

def process_query(query: str, filters: list = None, reasoning: bool = False, messages: list = None, status_queue = None, geojson_input = None, persona = None) -> dict:
    if filters is None: filters = []
    if messages is None: messages = []
    if geojson_input is None: geojson_input = {}
    if persona is None: persona = 3

    initial_state = {
        "query": query,
        "filters": filters,
        "reasoning": reasoning,
        "agents_to_call": [],
        "reasoning_summary": "",
        "cypher_query": "",
        "cypher_results": [],
        "text_answer": "",
        "map_output": "",
        "table_output": "",
        "kpi_output": "", 
        "messages": messages,
        "status_queue": status_queue,
        "geojson_input": geojson_input,
        "persona": persona
    }

    try:
        result = supervisor.invoke(initial_state)
    except Exception as e:
        traceback.print_exc()
        result = initial_state

    map_data = None
    if result.get("map_output"):
        try:
            map_data = json.loads(result["map_output"])
        except:
            map_data = None

    response = {
        "chat_text": result.get("text_answer", ""),
        "map": map_data,
        "table_html": result.get("table_output", ""),
        "kpi_html": result.get("kpi_output", ""),
        "reasoning_summary": result.get("reasoning_summary", "")
    }

    return response