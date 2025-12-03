import pandas as pd

# --- KONFIGURATION ---
FLIGHTS_FILE = r"C:\Users\maweo\OneDrive - Universität Münster\Dokumente\Master\Semester 1\Spatial Information Search\flight-search-bot\flights_first_100.csv"
TRAJECTORIES_FILE = r"C:\Users\maweo\OneDrive - Universität Münster\Dokumente\Master\Semester 1\Spatial Information Search\temp-1762610622844\Flight_FIRs_Actual_20230901_20230930.csv\Flight_FIRs_Actual_20230901_20230930.csv"

# NEU: Angepasste Ausgabedateinamen, um alte Dateien nicht zu überschreiben
OUTPUT_FLIGHTS_FILE = 'flights_first_100.csv'
OUTPUT_TRAJECTORIES_FILE = 'firs_first_100.csv'

# NEU: Variable für die gewünschte Anzahl an Flügen
NUMBER_OF_FLIGHTS_TO_KEEP = 100

# --- SKRIPT-LOGIK ---

def normalize_id(value):
    """Normalisiert eine ID zu einem einheitlichen Format."""
    if pd.isna(value):
        return None
    s = str(value).strip()
    try:
        num = float(s)
        return str(int(num))
    except (ValueError, OverflowError):
        return s

def filter_flight_data():
    try:
        print(f"Lade Flugdaten aus '{FLIGHTS_FILE}'...")
        flights_df = pd.read_csv(
            FLIGHTS_FILE, 
            sep=';',
            low_memory=False, 
            encoding='utf-8', 
            encoding_errors='ignore'
        )
        flight_id_column = flights_df.columns[0]
        print(f"ID-Spalte für Flüge: '{flight_id_column}'")
        print(f"Anzahl Flugeinträge insgesamt: {len(flights_df)}")
    except Exception as e:
        print(f"FEHLER beim Laden der Flugdatei: {e}")
        return

    print(f"\nNormalisiere Flug-IDs...")
    flights_df['normalized_id'] = flights_df[flight_id_column].apply(normalize_id)
    flights_df = flights_df.dropna(subset=['normalized_id'])

    # 3. Sortiere und wähle die ersten N Flüge aus
    print(f"\nSortiere Flüge...")
    unique_flights_df = flights_df.drop_duplicates(subset=['normalized_id'])
    sorted_unique_flights_df = unique_flights_df.sort_values(by='normalized_id')
    
    # --- ANPASSUNG HIER ---
    # Anstatt der Hälfte, nehmen wir die ersten N Flüge
    print(f"Wähle die ersten {NUMBER_OF_FLIGHTS_TO_KEEP} eindeutigen Flüge aus...")
    flights_to_keep_df = sorted_unique_flights_df.head(NUMBER_OF_FLIGHTS_TO_KEEP)
    # --- ENDE DER ANPASSUNG ---
    
    kept_flight_ids = set(flights_to_keep_df['normalized_id'])
    print(f"Anzahl eindeutiger Flüge zu behalten: {len(kept_flight_ids)}")
    
    example_ids = list(kept_flight_ids)[:5] # Zeige bis zu 5 Beispiele
    print(f"Beispiel-IDs die behalten werden: {example_ids}")

    # 4. Filtere Flugtabelle
    filtered_flights_df = flights_df[flights_df['normalized_id'].isin(kept_flight_ids)]
    filtered_flights_df = filtered_flights_df.drop(columns=['normalized_id'])
    print(f"Gefilterte Flugeinträge: {len(filtered_flights_df)}")

    # 5. Lade Trajektorien-Header (Diagnoseschritte bleiben unverändert)
    print(f"\n{'='*60}")
    print(f"Verarbeite Trajektorien aus '{TRAJECTORIES_FILE}'...")
    
    try:
        trajectory_id_column = pd.read_csv(TRAJECTORIES_FILE, nrows=0, encoding='utf-8', sep=";").columns[0]
        print(f"ID-Spalte für Trajektorien: '{trajectory_id_column}'")
    except Exception as e:
        print(f"FEHLER beim Lesen des Trajektorien-Headers: {e}")
        return

    # 6. Verarbeite Trajektorien in Chunks
    print(f"\n{'='*60}")
    print(f"Verarbeite Trajektorien-Datei in Chunks...")
    
    chunk_reader = pd.read_csv(
        TRAJECTORIES_FILE,
        chunksize=1_000_000,
        encoding='utf-8',
        sep=';',
        encoding_errors='ignore'
    )
    
    filtered_chunks = []
    total_processed = 0
    total_matched = 0
    
    for i, chunk in enumerate(chunk_reader):
        total_processed += len(chunk)
        chunk['normalized_id'] = chunk[trajectory_id_column].apply(normalize_id)
        chunk = chunk.dropna(subset=['normalized_id'])
        
        filtered_chunk = chunk[chunk['normalized_id'].isin(kept_flight_ids)]
        matched_in_chunk = len(filtered_chunk)
        total_matched += matched_in_chunk
        
        if matched_in_chunk > 0:
            filtered_chunk = filtered_chunk.drop(columns=['normalized_id'])
            filtered_chunks.append(filtered_chunk)
        
        print(f"  Chunk {i+1}: {len(chunk):,} Zeilen verarbeitet, {matched_in_chunk:,} Übereinstimmungen")

    print(f"\n{'='*60}")
    print(f"Gesamt verarbeitet: {total_processed:,} Trajektorien-Zeilen")
    print(f"Gesamt gefunden: {total_matched:,} Übereinstimmungen")

    # 7. Speichere Ergebnisse
    if filtered_chunks:
        filtered_trajectories_df = pd.concat(filtered_chunks, ignore_index=True)
        print(f"\nSpeichere {len(filtered_trajectories_df):,} Trajektorienpunkte in '{OUTPUT_TRAJECTORIES_FILE}'...")
        filtered_trajectories_df.to_csv(OUTPUT_TRAJECTORIES_FILE, index=False)
    else:
        print(f"\nWARNUNG: Keine Trajektorien gefunden!")

    #print(f"Speichere {len(filtered_flights_df):,} Flüge in '{OUTPUT_FLIGHTS_FILE}'...")
    #filtered_flights_df.to_csv(OUTPUT_FLIGHTS_FILE, sep=';', index=False)
    
    print("\n" + "="*60)
    print("Skript erfolgreich abgeschlossen!")

if __name__ == '__main__':
    filter_flight_data()