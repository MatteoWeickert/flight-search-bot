# FlightGPT — Conversational Flight Search Bot

A conversational Q&A system that lets you search flight information and trajectories using natural language. It combines a Large Language Model with a Neo4j graph database to translate plain English questions into Cypher queries, returning answers through text, interactive maps, data tables, and KPI statistics.

---

## Features

- **Natural Language Queries** — Ask questions like "Show me all flights from Cologne to Paris" without writing any database queries
- **Interactive Map** — Flight trajectories and airports visualized on an ArcGIS satellite map
- **Streaming Responses** — Real-time status updates while queries are processing
- **Persona System** — Choose from 5 response styles, from casual to military-precise
- **GeoJSON Spatial Filter** — Upload a polygon to find flights passing through a custom area
- **Multi-Modal Output** — Answers come with a text response, map data, HTML tables, and KPI cards

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | HTML5, ArcGIS Maps SDK for JavaScript, Calcite Components |
| Backend | Flask |
| LLM Orchestration | LangGraph + LangChain |
| LLM Provider | GWDG OpenAI-compatible API |
| Database | Neo4j (Aura Cloud) |
| Geospatial | Shapely |

---

## Getting Started

### Prerequisites

- Python 3.10+
- Access to a Neo4j Aura instance with flight data loaded
- A GWDG API key (or compatible OpenAI endpoint)

### Installation

```bash
git clone https://github.com/MatteoWeickert/flight-search-bot.git
cd flight-search-bot
pip install -r requirements.txt
```

### Environment Configuration

Create a `.env` file in the project root:

```env
NEO4J_URI=neo4j+s://<instance>.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=<password>
NEO4J_DATABASE=neo4j

GWDG_API_KEY=<api_key>
GWDG_BASE_URL=https://chat-ai.academiccloud.de/v1
GWDG_MODEL=openai-gpt-oss-120b
```

### Run

```bash
cd src
python main.py
```

Then use the LiveServer Extension (index.html) within VSC for viewing the frontend.

---

## How It Works

1. **Query Refinement** — Follow-up questions are rewritten into standalone queries using conversation history
2. **Routing** — An LLM router decides which agents to invoke (text answer, map, table)
3. **Cypher Generation** — The QA agent translates the question into a Cypher query
4. **Execution** — The query runs against Neo4j and results are returned
5. **Output** — Results are formatted as a text answer, GeoJSON for the map, an HTML table, and KPI cards

The orchestration is built with **LangGraph**, giving the workflow a deterministic, auditable structure.

---

## Project Structure

```
flight-search-bot/
├── src/
│   ├── main.py                 # Flask server
│   ├── agents/
│   │   ├── supervisor.py       # LangGraph workflow
│   │   ├── qa_agent.py         # Text answers + Cypher generation
│   │   ├── map_agent.py        # GeoJSON map output
│   │   └── table_agent.py      # HTML tables + KPI cards
│   ├── utils/
│   │   └── geojson_input.py    # Spatial filtering with Shapely
│   └── application/
│       ├── index.html          # UI layout
│       ├── main.js             # Frontend logic
│       └── style.css           # Styling
├── data/                       # Sample CSV data (100 flights)
├── requirements.txt
```

---

## Data Model

Flight data is stored in Neo4j as a graph. Trajectories are modelled as a **linked list** of `TrajectoryPoint` nodes connected by `NEXT` relationships, with the `Flight` node pointing to the first point via `HAS_POINT`.

Key node types: `Flight`, `Airport`, `TrajectoryPoint`, `FIR` (Flight Information Region)

---

## Limitations

- Dataset is currently limited to 100 sample flights
- No user authentication
- LLM-generated Cypher queries may occasionally fail on edge cases
- Single LLM provider (GWDG/OpenAI-compatible API)
