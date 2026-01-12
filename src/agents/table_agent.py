import os
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain.prompts import PromptTemplate
from langgraph.graph import StateGraph, END
from typing import TypedDict
import json

load_dotenv()

class TableState(TypedDict):
    cypher_results: list
    filters: dict
    query: str
    table_output: str

def create_table_agent():
    llm = ChatOpenAI(
        model=os.getenv("GWDG_MODEL"),
        api_key=os.getenv("GWDG_API_KEY"),
        base_url=os.getenv("GWDG_BASE_URL"),
        temperature=0,
    )
    
    table_prompt = PromptTemplate.from_template("""
        You are the Table Output Agent in a FlightGPT environment.
        You receive Cypher query results from a Neo4j graph and must output ONLY a valid HTML table to display in the frontend.
        The user has the ability to choose from filters. Airport (ap), Trajectories (tr) and others (ot). ap, tr and ot can be switched on alone while ap and tr can be combined. Choose which data to show the user according to the filters.
        The user choosed: {filters}
        
        Rules:
        - Output strictly valid HTML for a table. Do NOT output markdown, code fences, or explanations.
        - The table must include a header row with column names.
        - Never add trajectory data in the table; its too long to display and therefore not useful
        - Base the table content on the Cypher results you receive; copy existing values, do not invent data.
        - If the result set is empty, output a table with a single row and cell stating "No results for the query in the current graph.".
        
        Be aware that IDs are not useful to show to the user, so omit them in the table.
        
        Format the following table:
        {results_json}
        
        The following is an example of a valid HTML table with valid classes. Use these classes in your output to comply with frontend design or choose on some lines other highlighting options to suggest the user 
        the most important data point according to the user query ({query}):
                                                
        <table class="table table-striped">
        <thead>
            <tr>
            <th>Column 1</th>
            <th>Column 2</th>
            </tr>
        </thead>
        <tbody>
            <tr>
            <td>Value 1</td>
            <td>Value 2</td>
            </tr>
        </tbody>
        </table>
    """)
    
    def generate_table_output(state: TableState) -> TableState:
        results_json = json.dumps(state["cypher_results"])
        # include filters and query in the prompt formatting to avoid KeyError
        f = state.get("filters", {}) if isinstance(state, dict) else state.get("filters", {})
        q = state.get("query", "")
        prompt = table_prompt.format(results_json=results_json, filters=f, query=q)
        table_output = llm.invoke(prompt).content
        state["table_output"] = table_output
        return state
    
    workflow = StateGraph(TableState)
    workflow.add_node("generate_table_output", generate_table_output)
    
    workflow.set_entry_point("generate_table_output")
    workflow.add_edge("generate_table_output", END)
    
    return workflow.compile()

table_agent = create_table_agent()
