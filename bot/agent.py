import os
from dotenv import load_dotenv
from langchain_neo4j import Neo4jGraph, GraphCypherQAChain
from langchain_openai import ChatOpenAI
from langchain.prompts import PromptTemplate

load_dotenv()

llm = ChatOpenAI(
    model=os.getenv("GWDG_MODEL"),
    api_key=os.getenv("GWDG_API_KEY"),
    base_url=os.getenv("GWDG_BASE_URL"),
    temperature=0,
)

graph = Neo4jGraph(
    url=os.getenv("NEO4J_URI"),
    username=os.getenv("NEO4J_USER"),
    password=os.getenv("NEO4J_PASSWORD"),
)

schema_text = graph.schema

cypher_prompt = PromptTemplate.from_template(
    """Du bist ein Experte für Cypher und erstellst NUR eine gültige Cypher-Query.
Benutze ausschließlich Labels/Properties/Relationen aus diesem Schema:
{schema}
Beachte dass DEP_AP usw in ICAO Codes geschrieben werden müssen, egal was der User schreibt. Teterboro = KTEB. Auch egal ob das in MATCH oder WHERE genutzt wird, immer ICAO Codes nutzen.
Beachte dass die Airlines mit ihren Codes (z.B. DLH für Lufthansa) referenziert werden.
Beachte dass Flugzeugtypen wie vom User zB A380 oder anders immer in die korrekten Bezeichnungen im Schema umgewandelt werden müssen, zB A388 oder A350 => A359.
Grundlegend!!: Berechnungen und Counts müssen nicht in der Cyper-Query gemacht werden. Eine grundlegende Datenabfrage reicht aus. Sei dir bewusst, dass du lieber mehr daten mit in den 
nachfolgenden QA Schritt gibst, als zu wenig. Berechnungen und Counts werden im nächsten Schritt gemacht.
In FIR_SEQ sind die einzelnen FIRs (Tripel aus Type bzw. Name/Kürzel des FIRs, und Uhrzeiten) durch Kommas getrennt und mit Uhrzeiten versehen.

WICHTIGE Regeln:
- Nutze nur existierende Labels/Properties aus dem Schema.
- Keine Annahmen, keine zusätzlichen Knoten/Relationen erfinden.
- Gib nur die Cypher-Query zurück (ohne Erklärungen, ohne Markdown).
Frage: {query}
"""
)

qa_prompt = PromptTemplate.from_template(
    """Du bist ein Agent in einem FlightGPT Umfeld. Deine Antwort wird als Textantwort in ein Chatfenster ohne externe
    Anzeigemlglichkeit wie Markdown etc. eingefügt. Verzichte auf Tabellenstrukturen. 
    Formuliere aus den folgenden Query-Ergebnissen eine kurze, präzise Antwort auf der Sprache der User Anfrage.
    Löse krypticshe Rückgaben wie ICAO Codes oder Airline Codes immer in lesbare Namen auf, solange du genau weißt welche das sind.
Wenn die Ergebnismenge leer ist, sage: "Keine Treffer für die Anfrage im aktuellen Graphen."
Wenn der Nutzer nach einer (zeitlichen) Berechnung fragt, führe diese in der Antwort durch. Die Cyper-Query liefert nur die Rohdaten.
Wandle außerdem Flugzeugtypen wie A388 in die richtigen Namen um zB A380-800

Frage: {question}
Ergebnisse: {context}"""
)

_chain = GraphCypherQAChain.from_llm(
    llm=llm,
    graph=graph,
    cypher_prompt=cypher_prompt,
    qa_prompt=qa_prompt,
    return_intermediate_steps=True,
    verbose=True,
    top_k=50,
    allow_dangerous_requests=True
)

def answer_question(message: str) -> str:
    res = _chain.invoke({"query": message, "schema": schema_text})
    return res.get("result", "Keine Antwort erzeugt.")
