import asyncio
import json
import uuid
from collections import deque
import websockets

# --- Globale Datenstrukturen ---

# Warteschlange für Benutzer, die nach einem Match suchen
# Jeder Eintrag ist ein Dictionary: {'websocket': ws, 'profile': {...}, 'is_offering': bool}
MATCH_QUEUE = deque()

# Map zum Speichern aktiver Verbindungen und Zuweisen einer ID
ACTIVE_USERS = {} # {user_id: websocket}

# Map zur Speicherung der aktuellen Partner-Beziehungen
PARTNER_MAP = {} # {websocket: partner_websocket}

# --- Hilfsfunktionen für Matching-Logik ---

def check_match(user1_profile, user2_profile):
    """
    Überprüft, ob zwei Profile kompatibel sind, einschließlich der neuen Radius- und Länderfilter.
    """
    # 1. Geschlechts-Kompatibilität prüfen
    # User 1 sucht nach User 2 (s. Client-Logik: 'search' ist die Präferenz von User 1)
    
    # Prüfe die Präferenz von User 1 (wie User 1 User 2 sehen möchte)
    match_for_u1 = False
    if user1_profile['search'] == 'any':
        match_for_u1 = True
    elif user1_profile['search'] == 'same' and user1_profile['gender'] == user2_profile['gender']:
        match_for_u1 = True
    elif user1_profile['search'] == 'opposite' and user1_profile['gender'] != user2_profile['gender']:
        match_for_u1 = True

    # Prüfe die Präferenz von User 2 (wie User 2 User 1 sehen möchte)
    match_for_u2 = False
    if user2_profile['search'] == 'any':
        match_for_u2 = True
    elif user2_profile['search'] == 'same' and user2_profile['gender'] == user1_profile['gender']:
        match_for_u2 = True
    elif user2_profile['search'] == 'opposite' and user2_profile['gender'] != user1_profile['gender']:
        match_for_u2 = True
        
    if not (match_for_u1 and match_for_u2):
        print("    -> Geschlecht passt nicht.")
        return False
        
    # 2. Länder-Kompatibilität prüfen
    country1 = user1_profile.get('country', 'all')
    country2 = user2_profile.get('country', 'all')
    
    # Wenn einer der Nutzer "Global" sucht, ist das Land egal.
    # Ansonsten müssen beide Länder übereinstimmen.
    is_country_match = (country1 == 'all' or country2 == 'all' or country1 == country2)
    if not is_country_match:
        print("    -> Land passt nicht.")
        return False
        
    # 3. Radius-Kompatibilität prüfen (NEUE LOGIK)
    radius1 = user1_profile.get('radius', 'global')
    radius2 = user2_profile.get('radius', 'global')
    
    # Konzeptionelle Geolocation-Logik:
    # Da wir keine echten Geo-Koordinaten haben, simulieren wir die Übereinstimmung.
    # 'global' passt immer.
    # 'local'/'50km'/'100km' passen nur, wenn beide Seiten 'local'/'50km'/'100km' ODER 'global' gewählt haben.
    
    # Wenn mindestens einer 'global' wählt, ist der Radius irrelevant (solange das Land passt).
    if radius1 == 'global' or radius2 == 'global':
        is_radius_match = True
    else:
        # Wenn beide spezifische Radien gewählt haben, müssen sie übereinstimmen.
        # Dies ist eine vereinfachte Regel, da ein 50km-Nutzer auch einem 100km-Nutzer
        # entsprechen könnte. Aber zur Vereinfachung: Beide müssen gleich sein.
        is_radius_match = (radius1 == radius2)
        
    if not is_radius_match:
        print(f"    -> Radius passt nicht. U1: {radius1}, U2: {radius2}")
        return False

    return True # Alle Kriterien erfüllt

async def find_and_match(new_user_entry):
    """
    Sucht in der Warteschlange nach einem passenden Partner und stellt die Verbindung her.
    """
    
    # Durchlaufe die Warteschlange, um einen passenden Partner zu finden
    for i, waiting_user_entry in enumerate(MATCH_QUEUE):
        
        # Ein Benutzer kann nicht mit sich selbst matchen (sollte nie passieren, aber Sicherheitshalber)
        if waiting_user_entry['websocket'] == new_user_entry['websocket']:
            continue
        
        # Führe die Matching-Prüfung durch
        if check_match(new_user_entry['profile'], waiting_user_entry['profile']):
            
            # Match gefunden! Entferne den wartenden Benutzer aus der Queue
            MATCH_QUEUE.remove(waiting_user_entry)
            print(f"Match gefunden! Neue Warteschlange: {len(MATCH_QUEUE)}")

            # --- WebRTC Signaling einleiten ---
            # Der zuerst in die Queue gekommene Benutzer (waiting_user) ist der ANSWERER (should_offer=False)
            # Der neu hinzugekommene Benutzer (new_user) wird zum CALLER (should_offer=True)
            
            # 1. Sende "matched" an den neuen Benutzer (CALLER) und sage ihm, er soll das Offer erstellen
            await new_user_entry['websocket'].send(json.dumps({
                'type': 'matched',
                'should_offer': True
            }))
            
            # 2. Sende "matched" an den wartenden Benutzer (ANSWERER) und sage ihm, er soll auf Offer warten
            await waiting_user_entry['websocket'].send(json.dumps({
                'type': 'matched',
                'should_offer': False
            }))
            
            # 3. Speichere die Partnerschaft
            PARTNER_MAP[new_user_entry['websocket']] = waiting_user_entry['websocket']
            PARTNER_MAP[waiting_user_entry['websocket']] = new_user_entry['websocket']
            
            return True # Match erfolgreich
            
    # Kein Match gefunden: Füge den neuen Benutzer zur Queue hinzu und lasse ihn warten
    MATCH_QUEUE.append(new_user_entry)
    print(f"Kein Match gefunden. Benutzer wartet. Aktuelle Queue-Größe: {len(MATCH_QUEUE)}")
    
    # Sende ein "no-match"-Signal zurück, damit der Client weiß, dass er warten muss (optional)
    await new_user_entry['websocket'].send(json.dumps({'type': 'no-match'}))
    
    return False

async def update_user_count():
    """ Sendet die aktuelle Anzahl aktiver Nutzer an alle verbundenen Clients. """
    count_message = json.dumps({'type': 'user-count', 'count': len(ACTIVE_USERS)})
    # Sende an alle aktiven Verbindungen
    websockets.broadcast(ACTIVE_USERS.values(), count_message)

async def disconnect_user(websocket):
    """ Entfernt den Benutzer aus allen globalen Strukturen und benachrichtigt den Partner. """
    print("Verbindung trennen...")
    
    # 1. Partner benachrichtigen, falls vorhanden
    partner_ws = PARTNER_MAP.pop(websocket, None)
    if partner_ws:
        PARTNER_MAP.pop(partner_ws, None) # Entferne den Reverse-Eintrag
        try:
            await partner_ws.send(json.dumps({'type': 'partner-left'}))
            print("Partner benachrichtigt, dass Verbindung getrennt wurde.")
        except:
            pass # Der Partner ist möglicherweise bereits offline
            
    # 2. Aus der Warteschlange entfernen, falls der Benutzer wartet
    global MATCH_QUEUE
    new_queue = deque([u for u in MATCH_QUEUE if u['websocket'] != websocket])
    if len(new_queue) < len(MATCH_QUEUE):
        print("Benutzer aus der Warteschlange entfernt.")
    MATCH_QUEUE = new_queue
    
    # 3. Aus den aktiven Benutzern entfernen
    user_id_to_remove = None
    for uid, ws in list(ACTIVE_USERS.items()):
        if ws == websocket:
            user_id_to_remove = uid
            break
    if user_id_to_remove:
        del ACTIVE_USERS[user_id_to_remove]
        
    # 4. User-Zähler aktualisieren
    await update_user_count()
    print(f"Benutzer getrennt. Aktive: {len(ACTIVE_USERS)}, Queue: {len(MATCH_QUEUE)}")

# --- Haupt-WebSocket-Handler ---

async def handler(websocket, path):
    """ Verarbeitet alle eingehenden WebSocket-Nachrichten. """
    user_id = str(uuid.uuid4())
    ACTIVE_USERS[user_id] = websocket
    print(f"Neuer Benutzer verbunden: {user_id}. Aktive: {len(ACTIVE_USERS)}")
    await update_user_count()
    
    try:
        async for message in websocket:
            data = json.loads(message)
            msg_type = data.get('type')
            
            print(f"Nachricht empfangen: {msg_type}")

            # 1. STARTE SUCHE
            if msg_type == 'start':
                # Der Client sendet sein Profil, um die Suche zu starten
                user_entry = {
                    'websocket': websocket,
                    'profile': data.get('profile', {}), # Enthält jetzt 'country' und 'radius'
                    'is_offering': False # Wird beim Match festgelegt
                }
                await find_and_match(user_entry)
                
            # 2. NEXT/WEITER-KNOPF
            elif msg_type == 'next':
                # Trenne die aktuelle Verbindung und starte eine neue Suche
                await disconnect_user(websocket)
                # Client sollte danach sofort ein "start"-Signal senden, um die neue Suche zu initiieren.
                
            # 3. STOP-KNOPF
            elif msg_type == 'stop':
                # Der Benutzer möchte die Suche/den Chat komplett beenden
                await disconnect_user(websocket)
                
            # 4. WEBRTC SIGNALING
            elif msg_type in ['offer', 'answer', 'candidate']:
                partner_ws = PARTNER_MAP.get(websocket)
                if partner_ws:
                    # Leite die Nachricht direkt an den Partner weiter
                    await partner_ws.send(message)
                else:
                    print(f"Fehler: {msg_type} empfangen, aber kein Partner gefunden.")

            else:
                print(f"Unbekannter Nachrichtentyp: {msg_type}")
                
    except websockets.exceptions.ConnectionClosedOK:
        print("Verbindung normal geschlossen.")
    except Exception as e:
        print(f"Ein unerwarteter Fehler ist aufgetreten: {e}")
    finally:
        await disconnect_user(websocket)


# --- Server starten ---

async def main():
    # ACHTUNG: Auf einem echten Server muss der Host '0.0.0.0' sein
    # Für lokale Tests können Sie 'localhost' oder '127.0.0.1' verwenden
    host = "0.0.0.0" 
    port = 8765 # Ein gängiger Port für WebSockets
    
    # Stellen Sie sicher, dass Sie im Frontend die URL anpassen, falls nötig
    # Beispiel: const WS_URL = "ws://localhost:8765";

    print(f"Starte WebSocket-Server auf ws://{host}:{port}")
    async with websockets.serve(handler, host, port):
        await asyncio.Future() # Lässt den Server unendlich laufen

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nServer gestoppt.")
    except Exception as e:
        print(f"Hauptfehler: {e}")
