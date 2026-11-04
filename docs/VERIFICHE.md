# Verifiche

## Logica

16 test automatici superati. Controllati importazione da Google Sheets, stato dei capitoli incompleti, soluzioni mancanti o ambigue, stabilità degli identificativi, versionamento, campionamento, punteggi, timer assoluto, conservazione dei testi nei tentativi, ripasso degli errori, ricerca e gestione dell’ora italiana in estate e in inverno.

La generazione giornaliera è stata provata prima e dopo le 11, ripetendo l’operazione nella stessa data e in una data successiva: non duplica o modifica i quiz già archiviati. Nessun quiz viene generato con meno di dieci domande.

## Interfaccia

Verificata nel browser l’interfaccia desktop e con viewport 390×844. Nessuno scorrimento orizzontale nel catalogo dei capitoli. Controllati:

- consultazione delle dieci domande e delle soluzioni del primo capitolo;
- ricerca nel capitolo;
- aggiunta ai preferiti;
- avvio del quiz, selezione e persistenza della risposta dopo ricaricamento;
- passaggio alla domanda successiva;
- consegna con risposte mancanti e riepilogo di una corretta, una sbagliata e otto non date;
- filtro delle risposte sbagliate;
- nove errori presenti nel ripasso e il preferito conservato;
- filtro dei 26 capitoli non ancora disponibili;
- archivio giornaliero su una copia locale separata con due quiz fittizi, non inclusi nel dataset pubblicato;
- passaggio tra i quiz giornalieri conservando le bozze, ripresa della risposta salvata, completamento e persistenza del risultato e dell’altra bozza dopo ricaricamento.

Nessun errore JavaScript rilevato nei flussi controllati. La disponibilità del service worker è stata confermata dal browser. L’installazione effettiva su iOS e Android resta da provare sui dispositivi.

## Dati e credenziali

Lettura autentica del foglio in sola lettura verificata con l’account tecnico. Il dataset iniziale contiene 190 domande complete nei capitoli 1–19; i restanti 26 capitoli rimangono nel catalogo. La chiave Google è fuori dal repository; i file di appoggio e gli strumenti di configurazione sono nella directory ignorata `.local/`. Il build controlla le risorse pubblicate per impedire l’inclusione di chiavi private e campi contenenti token.
