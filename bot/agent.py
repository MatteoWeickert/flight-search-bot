import json
import os
from dotenv import load_dotenv
from langchain_neo4j import Neo4jGraph, GraphCypherQAChain
from langchain_openai import ChatOpenAI
from langchain_core.prompts import PromptTemplate

load_dotenv()

llm = ChatOpenAI(
    model=os.getenv("GWDG_MODEL"),
    api_key=os.getenv("GWDG_API_KEY"),
    temperature=0,
)

graph = Neo4jGraph(
    url=os.getenv("NEO4J_URI"),
    username=os.getenv("NEO4J_USER"),
    password=os.getenv("NEO4J_PASSWORD"),
)

schema_text = graph.schema

cypher_prompt = PromptTemplate.from_template("""
You are an expert in Cypher and create ONLY a valid Cypher query. Use only labels/properties/relations from this schema:
{schema}
Be aware that f.e. DEP_AP etc use ICAO Codes and therefore need to be used in the query like that, no matter what the user writes.
Always use ICAO Codes when referring to Airports, no matter if in MATCH or WHERE.
Be aware to always look out for geodata to include in the results. The results will later be shipped to another agent to show them on a map.
Be aware that Airlines use their standard codes (e.g. DLH for Lufthansa) when referenced.
Be aware that Aircrafttypes use their standard codes (e.g. A388 for A380-800) when referenced and need to be converted accordingly.
!!IMPORTANT: Calculations and Counts must NOT be done in the Cypher-Query. A basic data retrieval is sufficient. Be aware that you rather give more data into the
subsequent QA step than too less. Calculations and Counts will be done in the next step.
In FIR_SEQ are the individual FIRs (triples of Type or Name/Abbreviation of the FIR, and times) separated by commas and with times.
IMPORTANT RULES:
- Only use existing Labels/Properties/Relations from the schema.
- Use no assumptions, invent no additional nodes/relations.
- Return ONLY the Cypher query (no explanations, no markdown).
Question {query}
""")

qa_prompt = PromptTemplate.from_template("""
You are the text answering agent in a FlightGPT environment. Your answer will be inserted as a text answer in a chat window without external
display options like markdown etc. Refrain from table structures.
Formulate from the following query results a short, precise answer in english!.
Always resolve codes like ICAO Codes, Airline Codes or Aircraft Types into readable names, if you know them exactly.
When asked about CO2 Emissions, take that info into account: (Calculate the CO2 emissions of any passenger flight by first determining the great-circle distance in kilometers and categorizing it as short-haul (<1500 km, 150 g CO2 per passenger-km), medium-haul (1500–2500 km, 130 g CO2 per passenger-km), or long-haul (>2500 km, 110 g CO2 per passenger-km), then multiplying the appropriate emission factor by the distance and the number of passengers (use 1 km = 0.6214 miles for conversion) and adjusting for cabin class with multipliers of 1.0 (economy), 1.5 (premium economy), 2.0 (business), and 3.0 (first). Finally, multiply the resulting CO2 by a radiative forcing factor of 2.0 to account for non-CO2 effects and output both per-passenger and total emissions in kilograms of CO2e for the entire itinerary (summing multiple flight legs where applicable).)
If the result set is empty, say: "No results for the query in the current graph."
If the user asks for a (temporal) calculation, perform it in your answer.
Dont use any markdown.
Question: {question}
Results: {context}
""")

map_prompt = PromptTemplate.from_template("""
You are the Map Output Agent in a FlightGPT environment.
You receive Cypher query results from a Neo4j graph and must output ONLY a valid JSON object
with this exact structure (GeoJSON FeatureCollection plus meta):

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
    "style": {{ "marker": "circle", "size": 6 }}
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
      "style": {{ "marker": "circle", "size": 6 }}
    }}
  }}

Cypher results as JSON (array of rows):
{results_json}

Return ONLY the JSON object described above, nothing else.
""")

table_prompt = PromptTemplate.from_template("""
    You are the Table Output Agent in a FlightGPT environment. You receive Cypher query results from a Neo4j graph and must output ONLY a valid HTML table to display in the frontend.
    Rules:
    - Output strictly valid HTML for a table. Do NOT output markdown, code fences, or explanations.
    - The table must include a header row with column names.
    - Base the table content on the Cypher results you receive; copy existing values, do not invent data.
    - If the result set is empty, output a table with a single row and cell stating "No results for the query in the current graph.".
    Be aware that IDs are not useful to show to the user, so omit them in the table. 
    Format the following table:
    {results_json}
    The following is an example of a valid HTML table with valid classes. Use these classes in your output to comply woth frontend design:
        <table class="data-table">
            <thead>
                <tr class="data-table-head-row">
                </tr>
            </thead>
            <tbody>
                <tr class="data-table-row">
                </tr>
                <tr class="data-table-row">
                </tr>
                <tr class="data-table-row">
                </tr>
            </tbody>
            </table>

""")

_chain = GraphCypherQAChain.from_llm(
    llm=llm,
    graph=graph,
    cypher_prompt=cypher_prompt,
    qa_prompt=qa_prompt,
    return_intermediate_steps=True,
    verbose=True,
    top_k=50,
    allow_dangerous_requests=True,
)

def _extract_json(text: str) -> str:
    if not text:
        return ""
    t = text.strip()
    if not t.startswith("{"):
        start = t.find("{")
        end = t.rfind("}")
        if start != -1 and end != -1 and end > start:
            t = t[start:end+1].strip()
    return t

def answer_question(message: str) -> dict:
    res = _chain.invoke({"query": message, "schema": schema_text})
    chat_text = res.get("result", "")
    intermediate = res.get("intermediate_steps", [])

    rows = []
    if intermediate:
        step0 = intermediate[0]
        if isinstance(step0, dict) and "context" in step0:
            rows = step0["context"]
        else:
            rows = intermediate

    results_json = json.dumps(rows, ensure_ascii=False)


    map_llm_input = map_prompt.format(results_json=results_json)
    map_llm_res = llm.invoke(map_llm_input)

    table_llm_input = table_prompt.format(results_json=results_json)
    table_llm_res = llm.invoke(table_llm_input)

    if hasattr(map_llm_res, "content"):
        raw_map_text = map_llm_res.content
    elif isinstance(map_llm_res, dict) and "content" in map_llm_res:
        raw_map_text = map_llm_res["content"]
    else:
        raw_map_text = str(map_llm_res)

    if hasattr(table_llm_res, "content"):
        table_html = table_llm_res.content
    else:
        table_html = str(table_llm_res)

    cleaned = _extract_json(raw_map_text)

    map_obj = json.loads(cleaned)

    final_obj = {
        "chat_text": chat_text,
        "map": map_obj,
        "table_html": table_html,
    }
    return final_obj