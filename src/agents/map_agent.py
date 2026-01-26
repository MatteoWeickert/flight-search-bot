import os
import json
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain.prompts import PromptTemplate
from langgraph.graph import StateGraph, END
from typing import TypedDict, List, Any

load_dotenv()

class MapState(TypedDict):
    cypher_results: list
    filters: List[str]
    map_output: str
    status_queue: Any

def create_map_agent():
    llm = ChatOpenAI(
        model=os.getenv("GWDG_MODEL"),
        api_key=os.getenv("GWDG_API_KEY"),
        base_url=os.getenv("GWDG_BASE_URL"),
        temperature=0
    )

    map_prompt = PromptTemplate.from_template("""
    You are the Map Output Agent in a FlightGPT environment.
    You receive Cypher query results from a Neo4j graph and must output ONLY a valid JSON object (GeoJSON FeatureCollection).

    Active user filters: {filters}
    Available filters: 'ap' (Airports), 'tj' (Trajectories), 'ot' (Other)

    DISPLAY RULES:
    1. IF 'ap' in filters OR filters is empty → Create Point features for Airports
    2. IF 'tj' in filters OR filters is empty → Create LineString features for Trajectories  
    3. IF 'ot' in filters → Display other relevant spatial data

    CRITICAL COORDINATE RULES:
    - Neo4j trajectory arrays are formatted as: [[Lat, Lon, Alt, Timestamp], ...]
    - GeoJSON requires: [Longitude, Latitude] (swap order!)
    - Remove altitude and timestamp from coordinates
    - Example Input: [50.86, 7.14, 123, "2024-01-01"]
    - GeoJSON Output: [7.14, 50.86]

    AIRPORT DETECTION:
    Look for properties containing latitude/longitude:
    - DEP_AP_LAT, DEP_AP_LON (Departure Airport)
    - ARR_AP_LAT, ARR_AP_LON (Arrival Airport)
    - Any property with "LAT"/"LON" in the name

    TRAJECTORY DETECTION:
    Look for properties containing "trajectory" in the key name.
    These contain arrays of coordinate points.

    OUTPUT FORMAT:
    {{
      "type": "FeatureCollection",
      "features": [
        {{
          "type": "Feature",
          "geometry": {{
            "type": "Point",
            "coordinates": [7.14, 50.86]
          }},
          "properties": {{
            "type": "Airport",
            "code": "EDDK"
          }}
        }},
        {{
          "type": "Feature",
          "geometry": {{
            "type": "LineString",
            "coordinates": [[7.14, 50.86], [7.20, 50.90]]
          }},
          "properties": {{
            "type": "Trajectory",
            "info": "Flight Path"
          }}
        }}
      ],
      "meta": {{
        "layer_id": "neo4j_results",
        "name": "Flight Data",
        "geom_type": "Mixed",
        "source": "neo4j_agent",
        "style": {{"marker": "circle", "size": 6}}
      }}
    }}

    IMPORTANT:
    - Output ONLY valid JSON (no markdown, no code fences, no explanations)
    - If no geometry found, return empty features array
    - Validate coordinates are valid numbers within ranges: Lat [-90, 90], Lon [-180, 180]

    Cypher Results:
    {results_json}

    Return ONLY the GeoJSON object:
    """)


    def generate_map_output(state: MapState) -> MapState:
        if state.get("status_queue"):
            state["status_queue"].put({"type": "status", "msg": "Processing Spatial Data..."})

        results = state.get("cypher_results", [])
        filters_list = state.get('filters', [])
        
        results_json = json.dumps(results, default=str, indent=2)
        
        prompt = map_prompt.format(results_json=results_json, filters=filters_list)
        map_output = llm.invoke(prompt).content.strip()
        
        if map_output.startswith("```"):
            lines = map_output.split("\n")
            map_output = "\n".join(lines[1:-1]) if len(lines) > 2 else map_output
        
        try:
            json.loads(map_output)
        except json.JSONDecodeError:
            map_output = json.dumps({"type": "FeatureCollection", "features": []})
        
        state["map_output"] = map_output
        return state

    workflow = StateGraph(MapState)
    workflow.add_node("generate_map_output", generate_map_output)
    workflow.set_entry_point("generate_map_output")
    workflow.add_edge("generate_map_output", END)

    return workflow.compile()

map_agent = create_map_agent()