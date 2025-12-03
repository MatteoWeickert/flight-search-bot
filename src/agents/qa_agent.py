import os
from dotenv import load_dotenv
from langchain_neo4j import Neo4jGraph
from langchain_openai import ChatOpenAI
from langchain.prompts import PromptTemplate
from langgraph.graph import StateGraph, END
from typing import TypedDict

load_dotenv()

class QAState(TypedDict):
    query: str
    cypher_query: str
    cypher_results: list
    text_answer: str
    schema: str

def create_qa_agent():
    llm = ChatOpenAI(
        model=os.getenv("GWDG_MODEL"),
        api_key=os.getenv("GWDG_API_KEY"),
        base_url=os.getenv("GWDG_BASE_URL"),
        temperature=0,
    )
    
    graph_db = Neo4jGraph(
        url=os.getenv("NEO4J_URI"),
        username=os.getenv("NEO4J_USER"),
        password=os.getenv("NEO4J_PASSWORD"),
    )
    
    schema_text = graph_db.schema
    
    cypher_prompt = PromptTemplate.from_template("""
        You are an expert in Cypher and create ONLY a valid Cypher query.
        Use only labels/properties/relations from this schema:
        {schema}
        
        Be aware that e.g. DEP_AP etc use ICAO Codes and therefore need to be used in the query like that, no matter what the user writes.
        Always use ICAO Codes when referring to Airports, no matter if in MATCH or WHERE.
        Be aware to always look out for geodata to include in the results. The results will later be shipped to another agent to show them on a map.
        Be aware that Airlines use their standard codes (e.g. DLH for Lufthansa) when referenced.
        Be aware that Aircrafttypes use their standard codes (e.g. A388 for A380-800) when referenced and need to be converted accordingly.
        
        !!IMPORTANT: Calculations and Counts must NOT be done in the Cypher-Query. A basic data retrieval is sufficient.
        Be aware that you rather give more data into the subsequent QA step than too less. Calculations and Counts will be done in the next step.
        In FIR_SEQ are the individual FIRs (triples of Type or Name/Abbreviation of the FIR, and times) separated by commas and with times.
        
        IMPORTANT RULES:
        - Only use existing Labels/Properties/Relations from the schema.
        - Use no assumptions, invent no additional nodes/relations.
        - Return ONLY the Cypher query (no explanations, no markdown).
        
        Question: {query}
    """)
    
    qa_prompt = PromptTemplate.from_template("""
        You are the text answering agent in a FlightGPT environment.
        Your answer will be inserted as a text answer in a chat window without external display options like markdown etc.
        Refrain from table structures.
        Formulate from the following query results a short, precise answer in english!.
        Always resolve codes like ICAO Codes, Airline Codes or Aircraft Types into readable names, if you know them exactly.
        
        When asked about CO2 Emissions, take that info into account:
        (Calculate the CO2 emissions of any passenger flight by first determining the great-circle distance in kilometers and categorizing it as short-haul (<1500 km, 150 g CO2 per passenger-km), medium-haul (1500–2500 km, 130 g CO2 per passenger-km), or long-haul (>2500 km, 110 g CO2 per passenger-km), then multiplying the appropriate emission factor by the distance and the number of passengers (use 1 km = 0.6214 miles for conversion) and adjusting for cabin class with multipliers of 1.0 (economy), 1.5 (premium economy), 2.0 (business), and 3.0 (first). Finally, multiply the resulting CO2 by a radiative forcing factor of 2.0 to account for non-CO2 effects and output both per-passenger and total emissions in kilograms of CO2e for the entire itinerary (summing multiple flight legs where applicable).)
        
        If the result set is empty, say: "No results for the query in the current graph."
        If the user asks for a (temporal) calculation, perform it in your answer.
        Dont use any markdown.
        
        Question: {question}
        Results: {context}
    """)
    
    def generate_cypher(state: QAState) -> QAState:
        prompt = cypher_prompt.format(schema=schema_text, query=state["query"])
        cypher_query = llm.invoke(prompt).content
        state["cypher_query"] = cypher_query
        state["schema"] = schema_text
        return state
    
    def execute_cypher(state: QAState) -> QAState:
        try:
            results = graph_db.query(state["cypher_query"])
            state["cypher_results"] = results
        except Exception as e:
            state["cypher_results"] = []
        return state
    
    def generate_answer(state: QAState) -> QAState:
        prompt = qa_prompt.format(
            question=state["query"],
            context=state["cypher_results"]
        )
        answer = llm.invoke(prompt).content
        state["text_answer"] = answer
        return state
    
    # Build graph
    workflow = StateGraph(QAState)
    workflow.add_node("generate_cypher", generate_cypher)
    workflow.add_node("execute_cypher", execute_cypher)
    workflow.add_node("generate_answer", generate_answer)
    
    workflow.set_entry_point("generate_cypher")
    workflow.add_edge("generate_cypher", "execute_cypher")
    workflow.add_edge("execute_cypher", "generate_answer")
    workflow.add_edge("generate_answer", END)
    
    return workflow.compile()

# Export for use by supervisor
qa_agent = create_qa_agent()
