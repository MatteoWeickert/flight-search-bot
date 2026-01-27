# This file creates a functionality that allows the user to input GeoJSON data and retrieve all flights within the specified area.

import os
from typing import List, Union
from dotenv import load_dotenv
from langchain_neo4j import Neo4jGraph
from shapely.geometry import shape, LineString, Polygon, MultiPolygon
import json

load_dotenv()

graph_db = Neo4jGraph(
        url=os.getenv("NEO4J_URI"),
        username=os.getenv("NEO4J_USER"),
        password=os.getenv("NEO4J_PASSWORD")
)


def retrieve_FIRs_as_geoJSON() -> dict:
    """
    Holt alle FIRs aus der Datenbank.
    Gibt eine Liste von Dictionaries zurück, z.B.:
    [{'id': 'KZLAFIR', 'geometry': 'POLYGON(...)'}, ...]
    """

    query = """
    MATCH (fir:FIR)
    RETURN fir.id AS id, fir.geometry AS geometry
    """

    results = graph_db.query(query)

    features = []

    for row in results:
        # Hier die Logik von oben anwenden
        content = row['geometry'].replace("POLYGON", "").replace("((", "").replace("))", "").strip()
        parts = content.split()
        coords = []
        for i in range(0, len(parts), 2):
            coords.append([float(parts[i]), float(parts[i+1])])
            
        features.append({
            "type": "Feature",
            "properties": {"id": row['id']},
            "geometry": {
                "type": "Polygon",
                "coordinates": [coords]
            }
    })
        
    return {
        "type": "FeatureCollection",
        "features": features
}

def calculate_matching_FIR_to_geojson(geojson_data: dict, fir_data: dict) -> List[str]:
    """
    Prüft, mit welchen FIRs das Eingabe-Polygon überlappt.
    
    Args:
        geojson_data: Das GeoJSON Dictionary des Such-Polygons (Feature oder Geometry).
        fir_data: Die FeatureCollection aller FIRs (aus deinem vorherigen Schritt).
        
    Returns:
        Eine Liste mit den IDs der passenden FIRs.
    """

    # 1. Das Eingabe-Polygon in ein Shapely-Objekt umwandeln
    # Wir müssen prüfen, ob 'geojson_data' ein Feature oder direkt eine Geometry ist
    if "geometry" in geojson_data:
        input_polygon = shape(geojson_data["geometry"])
    elif "features" in geojson_data:
        # Falls eine Collection übergeben wurde, nehmen wir das erste Feature
        input_polygon = shape(geojson_data["features"][0]["geometry"])
    else:
        # Falls es direkt das Geometry-Objekt ist
        input_polygon = shape(geojson_data)

    matching_ids = []

    # 2. Durch alle FIRs iterieren
    for feature in fir_data["features"]:
        fir_id = feature["properties"].get("id", "UNKNOWN")
        fir_geometry = shape(feature["geometry"])
        
        # 3. Prüfung: Gibt es eine Überschneidung?
        # intersects ist besser als contains, falls das Polygon über eine Grenze ragt.
        if input_polygon.intersects(fir_geometry):
            matching_ids.append(fir_id)

    return matching_ids

def retrieve_flights_passing_FIRs(fir_ids: List[str]) -> List[dict]:
    """
    Holt alle Flüge, die durch die angegebenen FIRs fliegen.
    
    Args:
        fir_ids: Liste der FIR-IDs (z.B. ['KZLAFIR', 'KZLAUIR']).
    Returns:
        Liste von Dictionaries mit Fluginformationen.
    """

    query = """
    //Alle Flüge, die durch die angegebenen FIRs fliegen
    MATCH (f:Flight)-[r:TRAVERSED]->(fir:FIR)
    WHERE fir.id IN $fir_ids
    // Sicherstellen, dass jeder Flug nur einmal zurückgegeben wird
    WITH DISTINCT f
    // Die Trajektorie des Fluges abrufen
    MATCH (f)-[:HAS_POINT]->(p:TrajectoryPoint)
    // Punkte nach Sequenz sortieren
    WITH f, p ORDER BY p.seq ASC

    RETURN f.id AS flight_id, 
        collect([p.lon, p.lat]) AS trajectory
    """
    
    # Parameter für die Query vorbereiten
    params = {"fir_ids": fir_ids}
    try:
        results = graph_db.query(query, params=params)
        return results
    except Exception as e:
        print(f"Fehler bei der Datenbankabfrage: {e}")
        return []
    
def retrieve_flights_within_geojson(geojson_data: dict, flights: List[dict]) -> List[dict]:
    """
    Filtert Flüge, deren Trajektorie das gegebene GeoJSON schneidet, 
    und lädt deren Details aus der Datenbank.

    Args:
        geojson_data: Das Such-Polygon (GeoJSON).
        flights: Liste aus 'retrieve_flights_passing_FIRs' 
                 ([{'flight_id': '...', 'trajectory': [[lon, lat], ...]}, ...])
    
    Returns:
        Liste von Dictionaries mit den kompletten Fluginformationen.
    """

    # 1. Räumlicher Filter
    if "features" in geojson_data:
        # Falls Collection, nimm das erste Feature (oder iteriere über alle, hier vereinfacht)
        polygon_shape = shape(geojson_data["features"][0]["geometry"])
    elif "geometry" in geojson_data:
        polygon_shape = shape(geojson_data["geometry"])
    else:
        polygon_shape = shape(geojson_data)

    matching_ids = []

    for flight in flights:
        coords = flight.get('trajectory', [])
        
        # Ein LineString braucht mindestens 2 Punkte
        if len(coords) < 2:
            continue
            
        try:
            # Erstelle eine Linie aus den Koordinaten [[lon, lat], [lon, lat], ...]
            flight_line = LineString(coords)
            
            # Prüfen: Schneidet die Linie das Polygon?
            if polygon_shape.intersects(flight_line):
                matching_ids.append(flight['flight_id'])
                
        except Exception as e:
            print(f"Fehler bei Geometrie-Check für Flug {flight.get('flight_id')}: {e}")
            continue

    if not matching_ids:
        return []
    
    print(f"Treffer: {len(matching_ids)} Flüge schneiden das GeoJSON.")

    query = """
    MATCH (f:Flight)
    WHERE f.id IN $flight_ids
    
    // Wir holen uns auch Start- und Ziel-Flughafen Infos dazu
    OPTIONAL MATCH (f)-[:DEPARTED_FROM]->(dep:Airport)
    OPTIONAL MATCH (f)-[:ARRIVED_AT]->(arr:Airport)
    
    RETURN f.id AS flight_id,
           f.callsign AS callsign,
           f.ac_type AS ac_type,
           f.operator AS operator,
           dep.code AS origin,
           arr.code AS destination,
           dep.lat AS origin_lat,
           dep.lon AS origin_lon,
           arr.lat AS dest_lat,
           arr.lon AS dest_lon
    """
    
    params = {"flight_ids": matching_ids}
    
    try:
        full_flight_info = graph_db.query(query, params=params)
        return full_flight_info
    except Exception as e:
        print(f"Fehler beim Laden der Flugdetails: {e}")
        return []

def process_geojson_input(geojson_data: dict) -> List[str]:

    fir_data = retrieve_FIRs_as_geoJSON()
    matching_fir_ids = calculate_matching_FIR_to_geojson(geojson_data, fir_data)
    if not matching_fir_ids:
        print("Keine passenden FIRs gefunden.")
        return []
    flights_in_firs = retrieve_flights_passing_FIRs(matching_fir_ids)
    matching_flights = retrieve_flights_within_geojson(geojson_data, flights_in_firs)
    return matching_flights
  



if __name__ == "__main__":
    
    user_geojson = {"type":"FeatureCollection",
    "features":[{
    "type":"Feature",
    "properties":{},
    "geometry":
        {"coordinates":[[[7.27208601928433,50.87049645110096],[9.147992983963178,50.095151256459815],[11.128119323399915,51.10262956912629],[7.7851500621682135,51.76237796536631],[6.422259324139475,51.53854941032171],[6.109603606724164,51.14793906138044],[6.478398929435599,51.03211869804241],[7.27208601928433,50.87049645110096]]],
        "type":"Polygon"}}]}
    
    matching_flights = process_geojson_input(user_geojson)
    print(f"Gefundene Flüge: {json.dumps(matching_flights, indent=2, default=str)}")