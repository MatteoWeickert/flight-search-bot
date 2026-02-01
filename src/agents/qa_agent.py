import os
from dotenv import load_dotenv
from langchain_neo4j import Neo4jGraph
from langchain_openai import ChatOpenAI
from langchain.prompts import PromptTemplate
from langgraph.graph import StateGraph, END
from typing import TypedDict, List, Any
import ast
import json
from utils.geojson_input import retrieve_FIRs_as_geoJSON, calculate_matching_FIR_to_geojson, retrieve_flights_passing_FIRs, retrieve_flights_within_geojson, process_geojson_input

load_dotenv()

class QAState(TypedDict):
    query: str
    cypher_query: str
    cypher_results: list
    text_answer: str
    schema: str
    filters: List[str]
    status_queue: Any
    geojson_input: Any
    persona: int

def create_qa_agent():
    llm = ChatOpenAI(
        model=os.getenv("GWDG_MODEL"),
        api_key=os.getenv("GWDG_API_KEY"),
        base_url=os.getenv("GWDG_BASE_URL"),
        temperature=0
    )

    graph_db = Neo4jGraph(
        url=os.getenv("NEO4J_URI"),
        username=os.getenv("NEO4J_USER"),
        password=os.getenv("NEO4J_PASSWORD")
    )

    schema_text = graph_db.schema

    cypher_prompt = PromptTemplate.from_template("""
        You are an expert in Cypher and create ONLY a valid Cypher query.
        SCHEMA / DATA MODEL CONTEXT:
            - **Airports**: (:Flight)-[:DEPARTED_FROM|ARRIVED_AT]->(:Airport)
            - **FIRs**: (:Flight)-[:TRAVERSED [entry_time, exit_time]]->(:FIR) -> Star Topology (sorted by relationship property)
            - **Trajectory**: (:Flight)-[:HAS_POINT]->(:TrajectoryPoint)-[:NEXT]->(:TrajectoryPoint)... -> Linked List Topology!
        * The Flight is connected ONLY to the first point via HAS_POINT.
        * All subsequent points are connected via NEXT.    
                                                 
        Use only labels/properties/relations from this schema:
        {schema}
                                                 
        NAMING CONVENTIONS:
        - Use ICAO Codes for Airports (e.g. 'EDDM').
        - Use ICAO Codes for Airlines (e.g. 'DLH').
        - Use ICAO Codes for Aircraft types (e.g. 'A320').
        
        
        MANDATORY METADATA RULE:
        Whenever you query a Flight (f:Flight), you MUST return the standard flight details including origin and destination codes:
        - f.id (as id)
        - f.callsign (as callsign)
        - f.ac_type (as aircraft)
        - f.operator (as operator)
        - dep.code (as origin)
        - arr.code (as destination)
        
        User filters: {filters}
        
        MANDATORY RULES FOR FILTERS:
        1. If filters list contains 'tj' (Trajectories):
        - **CRITICAL**: Do NOT just match (f)-[:HAS_POINT]->(p). This will only return the first point.
        - You MUST traverse the linked list using variable length paths.
        - PATTERN: `MATCH (f)-[:HAS_POINT]->(start:TrajectoryPoint)-[:NEXT*0..]->(p:TrajectoryPoint)`
        - You MUST return a collected list of maps containing lon and lat point data (lon, lat).
        - FEW SHOT EXAMPLE:
            MATCH (f:Flight ...)-[:HAS_POINT]->(start:TrajectoryPoint)-[:NEXT*0..]->(p:TrajectoryPoint)
            RETURN f.callsign, collect([p.lon, p.lat]) as trajectory_array
        - Implement ALL available data inside a point (height, timestamp) inside the trajectory array.
        
        2. If filters list contains 'ap' (Airports):
        - You MUST return latitude/longitude for both Departure and Arrival airports (DEP_AP_LAT, DEP_AP_LON, etc.)
        
        3. If filters list contains 'ot' (others):
        - Be creative in what to include on the map.
        
        4. If filters list is empty:
        - Anticipate spatial data if relevant (trajectories or airports).

        IMPORTANT RULES:
        - Only use existing Labels/Properties/Relations from the schema.
        - Return ONLY the Cypher query (no explanations, no markdown).
                                                 
        MANDATORY SPATIAL RULE:
        If the user wants to see flights, routes, or trajectories:
        1. You MUST match the Flight and its TrajectoryPoints: (f:Flight)-[:HAS_POINT]->(p:TrajectoryPoint)
        2. You MUST return ALL metadata AND the trajectory array in the same query.
        
        REQUIRED RETURN FORMAT:
        RETURN 
            f.id as id,
            f.callsign as callsign,
            f.ac_type as aircraft,
            f.operator as operator,
            dep.code as origin,
            arr.code as destination,
            // If 'tj' is active:
            collect([p.lon, p.lat]) as trajectory_array
            // If 'fir' is active:
            collect(DISTINCT fir.id) as firs
        
        Question: {query}
    """
)
    qa_prompt = PromptTemplate.from_template("""
        You are a helpful flightbot answer assistant. You want to provide concise and understandable answers based on the given context.
        Formulate a short, precise answer in English based on the results. Don't answer in key points, but in sentences. Only use the information given, do not speculate or make up answers. 
        Always include date, time and location information when referring to specific flights. 
                                             
        PERSONA LEVEL: {persona}
        Adjust your response style according to the persona level (1-5). 
        1: "Best Friends" answer as if the user and you are best friends having a casual chat about flights. Only use emojis in this persona.,
        2: "Aviation Enthusiast" answer with enthusiasm and detailed (no hallucination!) knowledge about aviation topics.,
        3: "Standard Persona" provide clear and informative answers suitable for general users.,
        4: "Commercial Airline Pilot" answer with professional terminology and insights relevant to commercial aviation.,
        5: "Military Flight Captain" answer with precision and discipline, using terminology common in military aviation.
                                             
        Refrain from table structures.
        Always resolve codes like ICAO Codes, Airline Codes if known (e.g. LAX is Los Angeles International Airport).
        Do not use any markdown formatting.
        
        Question: {question}
        Results: {context}
    """)


    def generate_cypher(state: QAState) -> QAState:
        if state.get("status_queue"):
            state["status_queue"].put({"type": "status", "msg": "Translating to Cypher Query..."})

        f = state.get("filters", [])
        prompt = cypher_prompt.format(schema=schema_text, query=state["query"], filters=f)
        cypher_query = llm.invoke(prompt).content
        
        state["cypher_query"] = cypher_query
        state["schema"] = schema_text
        return state

    def execute_cypher(state: QAState) -> QAState:
        if state.get("status_queue"):
            state["status_queue"].put({"type": "status", "msg": "Executing Database Query..."})

        try:
            results = graph_db.query(state["cypher_query"])
            
            clean_results = []
            for row in results:
                clean_row = {}
                for key, value in row.items():
                    if isinstance(value, dict):
                        for node_key, node_value in value.items():
                            clean_row[node_key] = node_value
                    elif "trajectory" in key.lower():
                        if isinstance(value, list):
                            clean_row[key] = value
                        elif isinstance(value, str) and value.strip().startswith("["):
                            try:
                                clean_row[key] = ast.literal_eval(value)
                            except:
                                clean_row[key] = value
                        else:
                            clean_row[key] = value
                    else:
                        clean_row[key] = value
                clean_results.append(clean_row)

            print(f"Cypher Results: {json.dumps(clean_results, indent=2, default=str)}")
            
            state["cypher_results"] = clean_results
            if state.get("status_queue"):
                 state["status_queue"].put({"type": "status", "msg": f"Found {len(clean_results)} records..."})
            
        except Exception as e:
            print(f"Error: {e}")
            state["cypher_results"] = []
            
        return state
    
    def execute_spatial_search(state: QAState) -> QAState:
        geojson = state.get("geojson_input", {})
        if state.get("status_queue"):
            state["status_queue"].put({"type": "status", "msg": "Performing spatial geometry analysis..."})
        try:
            flights = process_geojson_input(geojson)
            state["cypher_results"] = flights
            state["cypher_query"] = "Spatial GeoJSON Input Processed"
        except Exception as e:
            print(f"Error processing GeoJSON input: {e}")
            flights = []
            state["cypher_results"] = []
            state["text_answer"] = "There was an error processing the uploaded GeoJSON data."
        
        if not state["query"]:
            state["query"] = "Which flights are passing through the uploaded area?"
            
        return state

    def generate_answer(state: QAState) -> QAState:
        if state.get("status_queue"):
            state["status_queue"].put({"type": "status", "msg": "Formulating answer..."})

        persona = state.get("persona", 3)
        prompt = qa_prompt.format(
            question=state["query"],
            context=state["cypher_results"],
            persona=persona
        )
        answer = llm.invoke(prompt).content
        state["text_answer"] = answer
        return state
        
    def route_start(state: QAState) -> str:
        if state.get("geojson_input"):
            return "execute_spatial_search"
        return "generate_cypher"

    workflow = StateGraph(QAState)
    workflow.add_node("generate_cypher", generate_cypher)
    workflow.add_node("execute_cypher", execute_cypher)
    workflow.add_node("execute_spatial_search", execute_spatial_search)
    workflow.add_node("generate_answer", generate_answer)
    workflow.set_conditional_entry_point(
        route_start,
        {
            "execute_spatial_search": "execute_spatial_search",
            "generate_cypher": "generate_cypher"
        }
    )
    workflow.add_edge("generate_cypher", "execute_cypher")
    workflow.add_edge("execute_cypher", "generate_answer")
    workflow.add_edge("execute_spatial_search", "generate_answer")    
    workflow.add_edge("generate_answer", END)

    return workflow.compile()

qa_agent = create_qa_agent()