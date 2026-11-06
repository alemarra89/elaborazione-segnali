# Verifiche

## Logica

30 test automatici di logica, importazione e sincronizzazione. Controllati importazione da Google Sheets, stato dei capitoli incompleti, soluzioni mancanti o ambigue, stabilità degli identificativi, versionamento, campionamento, punteggi, timer assoluto, conservazione dei testi nei tentativi, ripasso degli errori, ricerca e gestione dell’ora italiana in estate e in inverno.

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

Nessun errore JavaScript rilevato nei flussi controllati. La disponibilità del service worker è stata confermata dal browser. Con il server dell’anteprima di prova completamente spento, ricaricamento, archivio, risultato completato e ripresa dell’altra bozza hanno continuato a funzionare dalla cache offline. L’installazione effettiva su iOS e Android resta da provare sui dispositivi.

## Dati e credenziali

Lettura autentica del foglio in sola lettura verificata con l’account tecnico. Il dataset iniziale contiene 190 domande complete nei capitoli 1–19; i restanti 26 capitoli rimangono nel catalogo. La chiave Google è fuori dal repository; i file di appoggio e gli strumenti di configurazione sono nella directory ignorata `.local/`. Il build controlla le risorse pubblicate per impedire l’inclusione di chiavi private e campi contenenti token.

## Pubblicazione

Prima esecuzione del [workflow GitHub Actions](https://github.com/alemarra89/elaborazione-segnali/actions/runs/41936607771) completata con successo: test, importazione autentica del foglio usando il segreto del repository, conservazione del dataset e pubblicazione Pages. La [PWA online](https://alemarra89.github.io/elaborazione-segnali/) è stata aperta e verificata nel browser.

Al momento della prima pubblicazione erano le 00:49 del 5 novembre 2026 in Italia: nessun quiz giornaliero reale è stato generato prima delle 11. Le due date usate nella prova dell’archivio sono rimaste soltanto nell’anteprima locale separata.

## Recupero del 5 novembre

Alle 17:47 italiane non risultava alcuna esecuzione programmata della mattina. Il workflow era attivo e GitHub Actions abilitato, ma l’archivio era vuoto. Non essendo presente un’esecuzione del trigger programmato, non sono disponibili log che ne determinino la causa. Il [lancio manuale di recupero](https://github.com/alemarra89/elaborazione-segnali/actions/runs/42068256106) è terminato con successo e ha generato il quiz del 5 novembre usando la data e l’ora effettive del recupero.

Alla programmazione delle 11 sono stati aggiunti controlli al minuto 17 di ogni ora dalle 11 alle 23. Quattro nuovi test verificano il recupero di un quiz mancante, l’assenza di ricompilazioni se è già online, il recupero di una pubblicazione fallita e il rispetto dell’orario minimo delle 11. I tentativi restano soggetti alla disponibilità della pianificazione GitHub; non costituiscono una garanzia di puntualità.

## Sincronizzazione

Dieci test del modello verificano modifiche di due dispositivi a domande diverse, cancellazione di una risposta, rimozione dei preferiti, importazione senza duplicati, chiusura di una sessione già consegnata altrove, importazione di una consegna locale ancora da inviare, ripresa del quiz condiviso, conservazione dei risultati giornalieri oltre i cento tentativi, compattazione delle modifiche e diario locale separato per account.

La suite con emulatore Firestore verifica effettivamente l’accesso del proprietario e il rifiuto di utenti anonimi, account diversi, email non verificate e percorsi appartenenti a un altro utente. Verificati anche aggiornamenti indipendenti delle risposte, cancellazione di una risposta, impossibilità di riaprire una sessione chiusa e immutabilità dei risultati. Gli errori PERMISSION_DENIED prodotti dalle prove negative sono intenzionali.

Prova nel browser con due origini locali separate, con autenticazione e database fittizi: preferito e prima risposta inseriti sul dispositivo A ritrovati sul dispositivo B; seconda risposta di B comparsa su A; consegna su B e risultato da 2 corrette, 0 sbagliate e 8 non risposte ritrovato su A e dopo ricaricamento di B. Nessun dato fittizio è inviato al progetto reale.

Firebase è stato aggiunto a `esami-universita` sul piano Spark, senza collegare fatturazione o metodi di pagamento. Firestore Standard creato a Milano (`europe-west8`) con accesso inizialmente chiuso, poi sostituito dalle regole private verificate. Abilitato soltanto il provider Google e autorizzato il dominio `alemarra89.github.io`. Non attivati Analytics, Storage, Functions o backup a pagamento.

Le versioni interne di Firebase sono allineate a quelle dello SDK 12.19.0 per evitare registri duplicati dei componenti. Un override di `@grpc/grpc-js` alla versione corretta 1.14.7 risolve le segnalazioni alte della dipendenza Node. Gli SDK browser sono inclusi nel bundle generato.

## Notifiche Web Push — 6 novembre 2026

La suite comprende ora 40 test: dieci nuovi controlli verificano invio per data e dispositivo, assenza di invii prima delle 11 o senza quiz pubblicato, recupero degli errori temporanei, eliminazione delle iscrizioni scadute, recupero delle ricevute interrotte, filtro delle destinazioni push, paginazione Firestore, requisiti iOS, consenso dal tocco e apertura sicura dell’archivio dal service worker. I servizi esterni sono simulati in questi test; non vengono inviati messaggi a dispositivi reali.

Le regole sono state verificate con Java 21 e l’emulatore Firestore: il proprietario può registrare, leggere e cancellare il proprio dispositivo; account diversi, utenti anonimi ed email non verificate non possono farlo. Sono rifiutati endpoint estranei ai servizi push previsti, chiavi malformate, cambio di proprietario e campi aggiuntivi. Le ricevute di invio sono completamente inaccessibili dai client, anche dal proprietario.

Il build riesce e controlla anche i campi di chiavi private VAPID. L’anteprima della pagina Account è stata aperta nel browser: la sezione notifiche chiede correttamente l’accesso prima dell’attivazione e non produce errori JavaScript. La prova di consegna reale, in particolare su iPhone dalla schermata Home, richiede il dispositivo dell’utente e la configurazione amministrativa descritta nel README.
