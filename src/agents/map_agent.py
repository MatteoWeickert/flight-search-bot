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
    You receive Cypher query results from a Neo4j graph and must output a JSON object suitable for ArcGIS FeatureLayers.

    Active user filters: {filters}
    Available filters: 'ap' (Airports), 'tj' (Trajectories), 'ot' (Other)

    DISPLAY RULES:
    1. IF 'ap' in filters OR filters is empty → Extract Airports as Points
    2. IF 'tj' in filters OR filters is empty → Extract Trajectories as Lines
    3. IF 'ot' in filters → Display other relevant spatial data

    CRITICAL COORDINATE RULES:
    - Neo4j trajectory_array: [[Lon, Lat, Flight Level, Timestamp], ...]
    - REQUIRED Output: [Longitude, Latitude]
    - Remove altitude and timestamp.
    - Example Input: [7.14, 50.86, 123, "2024-01-01"]
    - Output: [7.14, 50.86]

    OUTPUT STRUCTURE:
    Return a JSON object with two keys: "points" and "lines".
    Each item must have "geometry" and "attributes".
    
    Standardize Attributes keys for Popups (CRITICAL):
    - 'id': Flight callsign or ID
    - 'type': Set to "Flight" or "Airport"
    - 'origin': ICAO code of departure
    - 'destination': ICAO code of arrival
    - 'aircraft': Aircraft type code
    - 'operator': Full airline name
    - 'callsign': callsign
    Ensure every flight in "lines" has these attributes filled if data is available in Cypher Results.

    OUTPUT FORMAT (Few-Shot Example):
    {{
      "points": [
        {{
          "geometry": {{
            "type": "point",
            "longitude": 7.14,
            "latitude": 50.86
          }},
          "attributes": {{
            "name": "Cologne Bonn Airport",
            "type": "Airport",
            "id": "EDDK"
          }}
        }}
      ],
      "lines": [
        {{
          "geometry": {{
            "type": "polyline",
            "paths": [[[7.14, 50.86], [8.5, 50.0], [9.2, 48.8]]]
          }},
          "attributes": {{
            "type": "Flight",
            "origin": "EDDK",
            "destination": "EKCH",
            "aircraft": "A320",
            "operator": "Lufthansa",
            "callsign": "DLH456",
            "id": "f_12345"
          }}
        }}
      ]
    }}

    IMPORTANT:
    - Output ONLY valid JSON (no markdown, no code fences).
    - If no geometry is found for a category, return an empty array [].
    - Ensure coordinates are numbers, not strings.
    - Keep attributes minimal and structured for clean popups.
    - Use ICAO codes for airports, not full names in origin/destination.

    Cypher Results:
    {results_json}

    Return ONLY the JSON object:
    """)


    def generate_map_output(state: MapState) -> MapState:
        if state.get("status_queue"):
            state["status_queue"].put({"type": "status", "msg": "Processing Spatial Data..."})

        results = state.get("cypher_results", [])
        filters_list = state.get('filters', [])
        
        results_json = json.dumps(results, default=str, indent=2)
        
        prompt = map_prompt.format(results_json=results_json, filters=filters_list)
        map_output = llm.invoke(prompt).content.strip()

        print(f"Map Agent Output: {map_output}")
        
        if map_output.startswith("```"):
            lines = map_output.split("\n")
            map_output = "\n".join(lines[1:-1]) if len(lines) > 2 else map_output
        
        try:
            json.loads(map_output)
        except json.JSONDecodeError:
            map_output = json.dumps({"points": [], "lines": []})
        
        state["map_output"] = map_output
        return state

    workflow = StateGraph(MapState)
    workflow.add_node("generate_map_output", generate_map_output)
    workflow.set_entry_point("generate_map_output")
    workflow.add_edge("generate_map_output", END)

    return workflow.compile()

map_agent = create_map_agent()