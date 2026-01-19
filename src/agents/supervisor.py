import os
import re
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain.prompts import PromptTemplate
from langgraph.graph import StateGraph, END
from typing import TypedDict, List
import json
from agents.qa_agent import qa_agent
from agents.map_agent import map_agent
from agents.table_agent import table_agent

load_dotenv()

class SupervisorState(TypedDict):
    query: str
    filters: dict
    reasoning: bool
    agents_to_call: List[str]
    reasoning_summary: str
    cypher_query: str
    cypher_results: list
    text_answer: str
    map_output: str
    table_output: str
    messages: list

def create_supervisor():
    llm = ChatOpenAI(
        model=os.getenv("OPENAI_MODEL"),
        api_key=os.getenv("OPENAI_KEY"),
        base_url=os.getenv("OPENAI_API_BASE"),
        temperature=0
    )

    # --- New Prompt for Query Refinement ---
    refine_prompt = PromptTemplate.from_template("""
    You are an expert at rephrasing follow-up questions to be standalone queries.
    Focus only on the user questions. The bot responses should not be part of the context.
    
    Current conversation history: {messages}
    User's new query: {query}
    
    Rewrite the user's new query to be a standalone sentence that includes all necessary context from the history. 
    Make it specific and complete so it can be understood without the history.
    
    Standalone query:
    """)

    routing_prompt = PromptTemplate.from_template("""
    You are a routing agent in a FlightGPT system that decides which specialized agents to call.
    
    Available agents:
    - qa_agent: ALWAYS called - generates text chat answer from Neo4j graph data
    - map_agent: ALWAYS called - Visualizes geospatial data on a map (airports, routes, trajectories)
    - table_agent: Generates HTML tables for complex data that needs detailed inspection
    
    RULES:
    1. ALWAYS include "qa" in your response (text answer is mandatory)
    2. By DEFAULT, also include "map" to visualize spatial data (unless query is purely statistical/textual)
    3. ONLY include "table" when:
       - Query asks for detailed comparison of multiple entities
       - Query involves complex data that needs verification
       - Query explicitly asks for tabular format ("show table", "list all details")
       - Query is about raw data inspection
    4. The User can decide for every query on which filter he wants to focus on. Possible filters are Airport (ap), Trajectories (tj) and others (ot). ap, tj and ot can be switched on alone while ap and tj can be combined.
    This information will be given to all other agents to adapt their behavior accordingly. The User chose: {filters}
    
    Conversation history (most recent last) as array: {messages}
    User query: {query}
    
    Respond with ONLY a JSON array of agent names to call, e.g.: ["qa", "map"] or ["qa", "map", "table"]
    """)

    reasoning_prompt = PromptTemplate.from_template("""
    You are explaining the reasoning behind the agent selection in a FlightGPT system.
    Respond in the same language as the user's query.
    
    User query: {query}
    Selected agents: {agents}
    User filters: {filters}
    
    Create a SHORT summary (2-3 sentences maximum) explaining:
    1. Why each agent was selected
    2. What output is expected from each agent based on the user's query
    
    Agent descriptions:
    - qa_agent: Queries Neo4j graph database and generates a text answer
    - map_agent: Creates geographic visualization with points/routes on a map
    - table_agent: Generates structured HTML table with detailed data
    
    Keep it concise and user-friendly. Use terms like "to answer your question", "to visualize", "to show details".
    Do NOT add ** or any other markdown formatting.
    """)

    def refine_query(state: SupervisorState) -> SupervisorState:
        messages = state.get("messages", [])
        if messages and len(messages) > 0:
            print("DEBUG: Refining query with history...")
            prompt = refine_prompt.format(
                query=state["query"],
                messages=json.dumps(messages, ensure_ascii=False)
            )
            refined_query = llm.invoke(prompt).content.strip()
            print(f"DEBUG: Refined query: {refined_query}")
            state["query"] = refined_query
        else:
            print("DEBUG: No history found, skipping refinement.")
            
        return state

    def route_query(state: SupervisorState) -> SupervisorState:
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
            
        state["agents_to_call"] = agents
        return state

    def generate_reasoning(state: SupervisorState) -> SupervisorState:
        if state["reasoning"]:
            prompt = reasoning_prompt.format(
                query=state["query"],
                agents=", ".join(state["agents_to_call"]),
                filters=state["filters"]
            )
            reasoning_summary = llm.invoke(prompt).content.strip()
            state["reasoning_summary"] = reasoning_summary
        else:
            state["reasoning_summary"] = ""
        return state

    def call_qa_agent(state: SupervisorState) -> SupervisorState:
        print("DEBUG: call_qa_agent — filters:", state.get("filters"))
        result = qa_agent.invoke({"query": state["query"], "filters": state["filters"]})
        state["text_answer"] = result["text_answer"]
        state["cypher_query"] = result["cypher_query"]
        state["cypher_results"] = result["cypher_results"]
        return state

    def call_map_agent(state: SupervisorState) -> SupervisorState:
        print("DEBUG: call_map_agent — cypher_results length:", len(state.get("cypher_results", [])))
        print("DEBUG: call_map_agent — filters:", state.get("filters"))
        result = map_agent.invoke({
            "cypher_results": state["cypher_results"], 
            "filters": state["filters"]
        })
        print("DEBUG: map_agent output (first 400 chars):", (result.get("map_output") or "")[:400])
        state["map_output"] = result["map_output"]
        return state

    def call_table_agent(state: SupervisorState) -> SupervisorState:
        print("DEBUG: call_table_agent — cypher_results length:", len(state.get("cypher_results", [])))
        print("DEBUG: call_table_agent — filters:", state.get("filters"))
        result = table_agent.invoke({
            "cypher_results": state["cypher_results"],
            "filters": state["filters"],
            "query": state["query"]
        })
        print("DEBUG: table_agent output length:", len(result.get("table_output", "")))
        state["table_output"] = result["table_output"]
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

    workflow.add_conditional_edges(
        "qa_agent",
        should_call_map,
        {
            "map_agent": "map_agent",
            "check_table": "check_table"
        }
    )

    workflow.add_conditional_edges(
        "map_agent",
        should_call_table,
        {
            "table_agent": "table_agent",
            END: END
        }
    )

    workflow.add_conditional_edges(
        "check_table",
        should_call_table,
        {
            "table_agent": "table_agent",
            END: END
        }
    )

    workflow.add_edge("table_agent", END)

    return workflow.compile()

supervisor = create_supervisor()

def process_query(query: str, filters: dict = None, reasoning: bool = False, messages: list = None) -> dict:
    if filters is None:
        filters = {}
    if messages is None:
        messages = []

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
        "messages": messages
    }

    try:
        result = supervisor.invoke(initial_state)
    except Exception as e:
        import traceback
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
        "reasoning_summary": result.get("reasoning_summary", "")
    }

    return response
