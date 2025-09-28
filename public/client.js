// ... Vorhandener Code ...

// --- Button Handling ---
document.querySelector(".btn-start").onclick = async () => {
    // 1. Kriterien sammeln
    const gender = document.getElementById("gender").value;
    const search = document.getElementById("search").value;
    const country = document.getElementById("country").value;

    // 2. Kamera starten
    await startCamera(); 

    // 3. Server um Match bitten und Kriterien senden
    ws.send(JSON.stringify({ 
        type: "join", 
        gender: gender, 
        search: search, 
        country: country 
    }));
    
    // Anmerkung: createPeerConnection() und offer-Erstellung 
    // sollten erst erfolgen, wenn der Server ein Match findet und dies 
    // dem Client mitteilt (z.B. mit einer "match-found" Nachricht).
    // ABER für den *simplen* Test lassen wir es hier, und senden nur die Kriterien.
    // In einer echten App würde der Server das "offer" an den gematchten 
    // Partner weiterleiten.
};

document.querySelector(".btn-next").onclick = () => {
    // 1. Aktuelle Verbindung beenden (falls vorhanden)
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
        remoteVideo.srcObject = null;
    }
    
    // 2. Server informieren und um einen neuen Partner bitten (inkl. Kriterien)
    const gender = document.getElementById("gender").value;
    const search = document.getElementById("search").value;
    const country = document.getElementById("country").value;

    ws.send(JSON.stringify({ 
        type: "next", // Neuer Typ für den Server
        gender: gender, 
        search: search, 
        country: country 
    }));
    
    // Chat leeren
    messagesDiv.innerHTML = "";
    addMessage("System", "Suche nach neuem Partner...");
};

document.querySelector(".btn-stop").onclick = () => {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
        remoteVideo.srcObject = null;
    }
    // Server informieren, dass man die Warteschlange verlässt/stoppt
    ws.send(JSON.stringify({ type: "stop" }));
    messagesDiv.innerHTML = "";
    addMessage("System", "Chat beendet.");
    // Ggf. Kamera stoppen
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localVideo.srcObject = null;
        localStream = null;
    }
};

// ... Anpassung in ws.onmessage ...
// Der Server muss jetzt auf "join", "next", "stop" reagieren 
// und die Signalisierung (offer/answer/candidate) nur zwischen 
// zwei gematchten Peers weiterleiten.
// Er müsste dem Client mitteilen, WANN er das createPeerConnection und Offer 
// starten soll, nachdem ein Match gefunden wurde.
