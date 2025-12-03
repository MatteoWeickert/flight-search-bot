import os
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain.prompts import PromptTemplate
from langgraph.graph import StateGraph, END
from typing import TypedDict
import json

load_dotenv()

class MapState(TypedDict):
    cypher_results: list
    filters: dict
    map_output: str

def create_map_agent():
    llm = ChatOpenAI(
        model=os.getenv("GWDG_MODEL"),
        api_key=os.getenv("GWDG_API_KEY"),
        base_url=os.getenv("GWDG_BASE_URL"),
        temperature=0,
    )

    map_prompt = PromptTemplate.from_template("""
      You are the Map Output Agent in a FlightGPT environment.
      You receive Cypher query results from a Neo4j graph and must output ONLY a valid JSON object with this exact structure (GeoJSON FeatureCollection plus meta). The user has the ability 
      to choose from filters. Airport (ap), Trajectories (tr) and others (ot). ap, tr and ot can be switched on alone while ap and tr can be combined. Choose which data to show the user according to the filters.
      If AP is choosen, display the airports that are resulting within the done query. If TR is choosen, display the trajectories that are resulting within the done query.If OT is choosen, think of something fitting that you want to display out of the data. 
      The user choosed: {filters}
      
      {{
        "type": "FeatureCollection",
        "features": [
          {{
            "type": "Feature",
            "geometry": {{
              "type": "Point",
              "coordinates": [0.0, 0.0]
            }},
            "properties": {{
              "example": "value"
            }}
          }}
        ],
        "meta": {{
          "layer_id": "neo4j_results",
          "name": "Query results",
          "geom_type": "Point",
          "source": "neo4j",
          "style": {{
            "marker": "circle",
            "size": 6
          }}
        }}
      }}
      
      Rules:
      - Output strictly valid JSON. Do NOT output markdown, code fences, or explanations.
      - Do NOT include comments in the JSON (no // or /* */), only keys and values.
      - Base the properties on the Cypher results you receive; copy existing values, do not invent data.
      - If you can derive geometry (e.g. from latitude/longitude, WKT, or trajectory) create Point/LineString/Polygon accordingly.
      - If you cannot derive any geometry, return:
      {{
        "type": "FeatureCollection",
        "features": [],
        "meta": {{
          "layer_id": "neo4j_results",
          "name": "Query results",
          "geom_type": "none",
          "source": "neo4j",
          "style": {{
            "marker": "circle",
            "size": 6
          }}
        }}
      }}
      
      Cypher results as JSON (array of rows):
      {results_json}
      
      Return ONLY the JSON object described above, nothing else.
    """)
    
    def generate_map_output(state: MapState) -> MapState:
        results_json = json.dumps(state["cypher_results"])
        prompt = map_prompt.format(results_json=results_json)
        map_output = llm.invoke(prompt).content
        state["map_output"] = map_output
        return state
    
    workflow = StateGraph(MapState)
    workflow.add_node("generate_map_output", generate_map_output)
    
    workflow.set_entry_point("generate_map_output")
    workflow.add_edge("generate_map_output", END)
    
    return workflow.compile()

map_agent = create_map_agent()
