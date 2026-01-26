import os
import json
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain.prompts import PromptTemplate
from langgraph.graph import StateGraph, END
from typing import TypedDict, Any

load_dotenv()

class TableState(TypedDict):
    cypher_results: list
    filters: dict
    query: str
    table_output: str
    kpi_output: str
    status_queue: Any

def create_table_agent():
    llm = ChatOpenAI(
        model=os.getenv("GWDG_MODEL"),
        api_key=os.getenv("GWDG_API_KEY"),
        base_url=os.getenv("GWDG_BASE_URL"),
        temperature=0
    )

    table_prompt = PromptTemplate.from_template("""
    You are the Table Output Agent.
    Generate a simple HTML table from the provided JSON data.
    
    Query: {query}
    
    Data (Flattened):
    {results_json}
    
    Rules:
    - Output ONLY valid HTML <table>...</table>.
    - Include meaningful headers.
    - Do not include technical IDs or long coordinate arrays.
    - If empty, return "No data available".
    - Use Bootstrap classes if possible (table table-striped).
    """)

    kpi_prompt = PromptTemplate.from_template("""
    You are the KPI Statistics Agent.
    Generate 4-6 key performance indicators (KPIs) from the flight data as HTML.
    
    Query: {query}
    Data: {results_json}
    
    EXAMPLES:
    
    Example 1 - Flight Query:
    Input: {{"FILED_ARRIVAL": "01.09.2023 01:35", "DIST_FLOWN": 413, "REQ_FLIGHT_LVL": 320}}
    Output:
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-value">413</div><div class="kpi-label">Avg Distance (km)</div></div>
      <div class="kpi-card"><div class="kpi-value">320</div><div class="kpi-label">Avg Flight Level</div></div>
      <div class="kpi-card"><div class="kpi-value">1h 27m</div><div class="kpi-label">Avg Duration</div></div>
      <div class="kpi-card"><div class="kpi-value">8</div><div class="kpi-label">Total Flights</div></div>
    </div>
    
    Example 2 - Airport Query:
    Input: {{"DEP_AP": "EDDK", "ARR_AP": "LFPG", "count": 5}}
    Output:
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-value">5</div><div class="kpi-label">Total Routes</div></div>
      <div class="kpi-card"><div class="kpi-value">EDDK</div><div class="kpi-label">Most Common Origin</div></div>
      <div class="kpi-card"><div class="kpi-value">LFPG</div><div class="kpi-label">Top Destination</div></div>
      <div class="kpi-card"><div class="kpi-value">100%</div><div class="kpi-label">On-Time Rate</div></div>
    </div>
    
    RULES:
    - Output ONLY HTML with class "kpi-grid" containing 4-6 "kpi-card" divs
    - Each card has: <div class="kpi-value">NUMBER/TEXT</div> and <div class="kpi-label">DESCRIPTION</div>
    - Calculate meaningful statistics: totals, averages, min/max, percentages
    - Be creative: derive insights like busiest route, average delay, peak times
    - Use short labels (max 3-4 words)
    - Format numbers nicely (e.g., "1,234" not "1234")
    - If no data, return: <div class="kpi-grid"><div class="kpi-card"><div class="kpi-value">N/A</div><div class="kpi-label">No Data Available</div></div></div>
    
    Generate KPIs now:
    """)


    def generate_table_output(state: TableState) -> TableState:
        if state.get("status_queue"):
            state["status_queue"].put({"type": "status", "msg": "Building Data Table..."})

        raw_results = state.get("cypher_results", [])
        
        # Simple flattening for preview
        flattened_results = []
        for row in raw_results:
            flat_row = {}
            for k, v in row.items():
                if isinstance(v, (dict, list)):
                    flat_row[k] = str(v)
                else:
                    flat_row[k] = v
            flattened_results.append(flat_row)
            
        preview_data = flattened_results[:20] 
        results_json = json.dumps(preview_data, default=str)
        
        if not preview_data:
            state["table_output"] = "<p>No data found.</p>"
            return state

        prompt = table_prompt.format(results_json=results_json, query=state["query"])
        state["table_output"] = llm.invoke(prompt).content
        return state
    
    def generate_kpi_output(state: TableState) -> TableState:
        if state.get("status_queue"):
            state["status_queue"].put({"type": "status", "msg": "Calculating KPIs..."})

        raw_results = state.get("cypher_results", [])
        preview_data = raw_results[:50]
        results_json = json.dumps(preview_data, default=str)
        
        if not preview_data:
            state["kpi_output"] = ""
            return state
        
        prompt = kpi_prompt.format(results_json=results_json, query=state["query"])
        state["kpi_output"] = llm.invoke(prompt).content
        return state

    workflow = StateGraph(TableState)
    workflow.add_node("generate_table_output", generate_table_output)
    workflow.add_node("generate_kpi_output", generate_kpi_output)
    workflow.set_entry_point("generate_table_output")
    workflow.add_edge("generate_table_output", "generate_kpi_output")
    workflow.add_edge("generate_kpi_output", END)

    return workflow.compile()

table_agent = create_table_agent()