import pandas as pd

# --- KONFIGURATION ---
# Passen Sie diese Dateipfade bei Bedarf an
TRAJECTORIES_FILE = r"C:\Users\maweo\OneDrive - Universität Münster\Dokumente\Master\Semester 1\Spatial Information Search\flight-search-bot\trajectories_first_100.csv"
OUTPUT_FILE = 'trajectories_aggregated.csv'

# Legen Sie hier die exakten Namen der Spalten fest, die Sie benötigen.
# WICHTIG: Achten Sie genau auf Leerzeichen und Groß-/Kleinschreibung!
ID_COLUMN = 'ECTRL ID'
SEQUENCE_COLUMN = 'Sequence Number' # SEQ
LAT_COLUMN = 'Latitude'
LON_COLUMN = 'Longitude'
LEVEL_COLUMN = 'Flight Level'
TIME_COLUMN = 'Time Over'
FIR_ID = 'FIR_ID'
ENTRY_TIME = 'ENTRY'
EXIT_TIME = 'EXIT'

# --- SKRIPT-LOGIK ---

def aggregate_trajectories():
    """
    Liest eine Trajektorien-Datei und aggregiert die Punkte für jeden Flug
    in eine einzige Zeile mit einer Array-ähnlichen Spalte.
    """
    try:
        print(f"Lade Trajektoriendaten aus '{TRAJECTORIES_FILE}'...")
        df = pd.read_csv(
            TRAJECTORIES_FILE,
            low_memory=False,
            encoding='utf-8',
            sep=";", # oder ;
            encoding_errors='ignore'
        )
        print("Datei erfolgreich geladen.")
        print(f"Anzahl der Trajektorienpunkte insgesamt: {len(df):,}")

        # Bereinige mögliche Leerzeichen in Spaltennamen
        df.columns = df.columns.str.strip()

        # Überprüfe, ob alle benötigten Spalten existieren
        required_columns = [ID_COLUMN, SEQUENCE_COLUMN, LAT_COLUMN, LON_COLUMN, LEVEL_COLUMN, TIME_COLUMN] # FIR_ID, ENTRY_TIME, EXIT_TIME
        if not all(col in df.columns for col in required_columns):
            print("\nFEHLER: Nicht alle benötigten Spalten wurden in der CSV gefunden.")
            print(f"Benötigt werden: {required_columns}")
            print(f"Gefunden wurden: {list(df.columns)}")
            return

    except FileNotFoundError:
        print(f"FEHLER: Datei nicht gefunden unter '{TRAJECTORIES_FILE}'")
        return
    except Exception as e:
        print(f"Ein Fehler ist beim Laden der Datei aufgetreten: {e}")
        return

    # 1. Sortieren (wichtig!)
    # Stelle sicher, dass die Punkte für jeden Flug nach ihrer Sequenznummer geordnet sind.
    print(f"Sortiere Daten nach '{ID_COLUMN}' und '{SEQUENCE_COLUMN}'...")
    df_sorted = df.sort_values(by=[ID_COLUMN, SEQUENCE_COLUMN])
    
    # 2. Gruppieren und Aggregieren
    # Dies ist der Kern des Skripts.
    print(f"Gruppiere nach '{ID_COLUMN}' und aggregiere die Trajektorienpunkte...")
    
    # Erstelle eine neue Spalte, die die gewünschten Werte als Tupel enthält
    df_sorted['trajectory_point'] = df_sorted.apply(
        lambda row: (row[LAT_COLUMN], row[LON_COLUMN], row[LEVEL_COLUMN], row[TIME_COLUMN]), # lambda row: (row[LAT_COLUMN], row[LON_COLUMN], row[LEVEL_COLUMN], row[TIME_COLUMN]) für Trajektorien
        axis=1
    )
    
    # Gruppiere nach der ID und fasse die Tupel in einer Liste zusammen
    aggregated = df_sorted.groupby(ID_COLUMN)['trajectory_point'].apply(list)
    
    # 3. Ergebnis in einen sauberen DataFrame umwandeln
    result_df = aggregated.reset_index(name='trajectory_array')
    
    print("\nAggregation abgeschlossen.")
    print(f"Anzahl der einzigartigen Flüge (und somit Zeilen): {len(result_df):,}")
    
    # Zeige ein Beispiel
    print("\n--- Beispiel für eine aggregierte Zeile ---")
    print(result_df.head(1).to_string())
    
    # 4. Speichern des Ergebnisses in einer neuen CSV-Datei
    print(f"\nSpeichere das Ergebnis in '{OUTPUT_FILE}'...")
    result_df.to_csv(OUTPUT_FILE, index=False)
    
    print("\n" + "="*60)
    print("Skript erfolgreich abgeschlossen!")
    print(f"Die neue Datei '{OUTPUT_FILE}' wurde erstellt.")


if __name__ == '__main__':
    aggregate_trajectories()