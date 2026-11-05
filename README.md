# Elaborazione dei segnali · Quiz e ripasso

PWA per lo studio dell’esame, con interfaccia azzurra e blu, domande provenienti da Google Sheets e quiz giornalieri archiviati. HTML, CSS e JavaScript senza framework, con Firebase per l’accesso Google e la sincronizzazione facoltativa dei progressi.

## Stato attuale

Importazione iniziale verificata: 190 domande valide, capitoli 1–19 completi; capitoli 20–45 ancora vuoti. Il numero disponibile cresce con il foglio. Il catalogo completo mantiene visibili i capitoli non ancora pronti.

[Apri la PWA](https://alemarra89.github.io/elaborazione-segnali/) · [Repository](https://github.com/alemarra89/elaborazione-segnali)

## Avvio e verifiche

Richiede Node.js 24.12 o successivo. Le dipendenze sono bloccate in `package-lock.json`; il build include gli SDK Firebase nel sito, così non dipendono da una CDN esterna durante lo studio offline.

```powershell
npm ci
npm test
npm run build
npm run preview
```

L’anteprima è su `http://127.0.0.1:4173/elaborazione-segnali/`. La cartella `dist/` contiene soltanto le risorse pubbliche della PWA. Il build controlla che non contengano chiavi private o token. Le icone PNG sono già incluse nel repository; `node scripts/generate-icons.mjs` permette di rigenerarle.

I controlli automatici coprono importazione, capitoli incompleti, risposte ambigue, estrazione casuale senza duplicati, punteggi, scadenza assoluta del timer, ripasso degli errori, conservazione delle domande nei tentativi, ricerca, ora legale e solare di Roma, generazione giornaliera idempotente, archivio e stati giornalieri.

## Uso dell’app

Panoramica, capitoli con soluzioni e ricerca, quiz di capitolo senza timer, simulazioni da 30 domande in 30 minuti, preferiti, ripasso degli errori e storico degli ultimi 100 tentativi riprendono il funzionamento di Diritto Commerciale. I quiz usano solo i capitoli completi. Durante un quiz non vengono mostrate le soluzioni; prima della consegna le risposte sono modificabili e cancellabili.

I quiz giornalieri rimangono nell’archivio. Ogni quiz conserva dieci domande e soluzioni del giorno della generazione, senza modificarsi al ricaricamento o dopo successive correzioni al foglio. I quiz giornalieri in corso vengono conservati anche quando si passa a un altro quiz. Il risultato più recente e il migliore di ciascun quiz giornaliero sono mantenuti separatamente dai 100 tentativi dello storico. La serie conta le date consecutive dei quiz completati; recuperare un giorno precedente può colmare una lacuna nella serie.

I progressi sono conservati subito sul dispositivo. Senza accesso rimangono locali; con accesso Google vengono sincronizzati anche su Firestore, con permessi limitati all’account verificato `alemarra89@gmail.com`. Una copia delle domande è inclusa nelle sessioni e nei risultati per preservare i tentativi dopo aggiornamenti del foglio.

Al primo accesso vengono uniti i progressi locali e quelli online, senza duplicare i tentativi già presenti. Una copia dei dati precedenti all’attivazione del cloud rimane nel browser. Lo spazio locale dell’account è separato dallo spazio usato senza accesso: uscire dall’account non mostra i dati sincronizzati nella modalità ospite.

Una coda locale conserva le modifiche finché il server non ne conferma il salvataggio; Firestore mantiene anche la propria cache persistente. Le risposte sono aggiornate separatamente per domanda, i preferiti rimossi conservano una marcatura di rimozione e i risultati consegnati sono immutabili. Le modifiche concorrenti alla stessa risposta seguono l’ordine di ricezione del server; una vecchia sessione offline non può riaprire un quiz già consegnato. La pagina Account mostra lo stato della sincronizzazione e permette di riprendere altri quiz sospesi. Il timer delle simulazioni rimane una scadenza assoluta condivisa.

I permessi sono versionati in `firestore.rules` e verificati su un emulatore locale prima della pubblicazione. L’app Firebase usa soltanto Authentication con Google e Firestore Standard, piano Spark senza account di fatturazione. Nessun uso di Cloud Functions, Storage o backup a pagamento. Se una quota gratuita blocca la sincronizzazione, i progressi restano locali in attesa del ripristino; non viene attivata la fatturazione. La configurazione client in `public/firebase-config.json` è pubblica per progetto; la protezione dei dati dipende dalle regole e dall’identità verificata, non dalla riservatezza della chiave API client.

Cancellare i dati del sito elimina i progressi non ancora sincronizzati. Quelli già confermati dal server si ritrovano accedendo nuovamente. In caso di storage disabilitato o esaurito, l’app mostra un avviso e continua in memoria.

Per verificare i permessi con Java 21 installato:

```powershell
npm run test:rules
```

Il comando usa esclusivamente il progetto fittizio `demo-segnali` nell’emulatore. Per prove manuali, avviare gli emulatori Authentication e Firestore e aprire l’anteprima su loopback con `?emulator=1`: l’accesso usa un utente fittizio e il database demo; questa modalità è ignorata sul dominio pubblico.

L’app può essere installata dal browser. Dopo il primo caricamento completo, il service worker conserva interfaccia, icone, domande e archivio anche offline. Per ricevere nuovi contenuti occorre tornare online. Il pulsante di aggiornamento, il ritorno alla pagina e un controllo ogni cinque minuti quando la pagina è visibile verificano nuovi dati pubblicati. Per le modifiche dell’interfaccia compare “Aggiorna app”; l’aggiornamento conserva i progressi e la sessione. Il service worker è limitato al percorso dell’app e non modifica le cache di altri progetti sullo stesso dominio.

## Pubblicazione e aggiornamento giornaliero

Il workflow `.github/workflows/deploy-pages.yml` si avvia dopo un push del codice su `main`, manualmente e ogni giorno alle 11:00 nel fuso `Europe/Rome`, seguendo ora legale e solare. Sono previsti anche controlli di recupero alle 11:17 e poi al minuto 17 di ogni ora fino alle 23:17. Se il quiz della data corrente è già presente sia nel repository sia sul sito pubblico, i controlli programmati terminano senza importare dati o ricompilare il sito. Se la pubblicazione è fallita, riprovano anche quando il quiz è già stato salvato nel repository.

Quando l’aggiornamento è necessario, il workflow esegue i test, legge il foglio privato, genera il quiz giornaliero se non è già presente, conserva dataset e archivio in un commit e pubblica `dist/` su GitHub Pages. I lanci manuali e i push del codice aggiornano sempre i dati; non duplicano il quiz del giorno.

Le credenziali Google sono usate soltanto nel passaggio di importazione e non sono incluse nel sito. Il workflow non usa servizi Google dal browser e non richiede login Google agli utenti della PWA.

GitHub Actions può avviarsi in ritardo, quindi le 11:00 indicano l’orario programmato, non una garanzia di disponibilità immediata. Prima delle 11 non viene generato un quiz. Un rilancio nello stesso giorno conserva quello già esistente. Non vengono inventati quiz per le date precedenti alla prima attivazione o per esecuzioni saltate. Se un giorno non viene eseguito il workflow, l’archivio rimane intatto e la data mancante non viene mostrata come quiz completato o da fare. Si può rilanciare manualmente il workflow dopo le 11 per recuperare il quiz del giorno corrente.

Se la lettura del foglio fallisce, il workflow si interrompe e il sito già pubblicato rimane disponibile con l’ultimo dataset valido. Nei repository pubblici GitHub può disabilitare la pianificazione dopo 60 giorni senza attività; i commit giornalieri del workflow mantengono normalmente attivo il repository. Se la pianificazione viene disabilitata, riabilitarla in Actions.

Configurazione una tantum:

1. In **Settings → Secrets and variables → Actions**, impostare `GOOGLE_SERVICE_ACCOUNT_JSON` con il contenuto della chiave dell’account tecnico.
2. In **Settings → Pages → Source**, selezionare **GitHub Actions**.
3. In **Actions**, avviare **Aggiorna domande e pubblica PWA** se necessario.

Lo storico delle esecuzioni permette di verificare gli aggiornamenti; l’app mostra la data dell’ultima importazione del foglio.

## Fonte

[Esame di Elaborazione dei segnali](https://docs.google.com/spreadsheets/d/1XmlmuLpJLPI6fA3J1K5GrW1TvbCxM5N3w6Ijs2ekg90/edit?gid=0), scheda `Foglio1` (`gid=0`).

Account tecnico: `fogli-google@esami-universita.iam.gserviceaccount.com`. Accesso Google Sheets in sola lettura. La chiave rimane fuori dal progetto; non va aggiunta al repository o al codice della PWA. In GitHub Actions si userà il segreto `GOOGLE_SERVICE_ACCOUNT_JSON`.

## Importazione

Richiede Node.js con supporto a `fetch` e `node:test` (verificato con l’installazione locale).

```powershell
node scripts/import-questions.mjs 'C:\percorso\alla\chiave.json'
node --test tests/import-questions.test.mjs
```

L’importatore legge il foglio e genera `data/questions.json`, conservando testi, opzioni, soluzioni e note. Non modifica il foglio. Legge la chiave da `GOOGLE_SERVICE_ACCOUNT_JSON`, se presente, oppure dal percorso passato come argomento. Non stampa chiavi o token.

Il catalogo `data/chapters.json` conserva i 45 titoli forniti dall’utente, anche per i capitoli non ancora popolati. Un capitolo entra nel set dei quiz solo quando ha esattamente 10 domande complete e valide. Gli altri restano nel catalogo come `empty` o `incomplete`, con `available: false`. Le righe con soltanto il numero del capitolo sono segnaposti. La risposta esatta deve corrispondere, dopo la rimozione degli spazi esterni, a una sola delle quattro opzioni. Il controllo è strutturale e non corregge i contenuti didattici.

Intestazioni inattese, capitoli sconosciuti, più di 10 righe in un capitolo o problemi di accesso interrompono l’importazione prima della sostituzione del dataset. Un risultato completamente vuoto non sovrascrive il dataset precedente. Gli identificativi usano capitolo e posizione nel capitolo: preservare l’ordine delle righe quando si aggiungono contenuti. Se servirà riordinare le domande, introdurre prima un identificativo stabile nel foglio.

## Funzionalità

- Webapp PWA semplice, senza React Native, con installazione e disponibilità offline dei contenuti scaricati.
- Aggiornamento giornaliero dal foglio, attraverso GitHub Actions e pubblicazione del dataset aggiornato.
- Tutti i 45 capitoli visibili; quelli non completi disabilitati e attivati automaticamente dopo una sincronizzazione valida.
- Ogni giorno dalle 11, fuso Europe/Rome, un quiz da 10 domande casuali uniche nel singolo quiz, tratte dal set disponibile all’importazione. La pubblicazione segue i tempi di GitHub Actions.
- Archivio persistente dei quiz giornalieri, generati anche senza aprire l’app, con domande e soluzioni congelate per preservare i risultati dopo successive correzioni al foglio. Nessuna rigenerazione al ricaricamento o alla ripetizione dell’automazione per la stessa data.
- Stato personale di ogni quiz giornaliero: da fare, in corso, completato; possibilità di recuperare giorni saltati.
- Consultazione dei capitoli con soluzioni e ricerca nelle domande e opzioni.
- Quiz di capitolo da 10 domande senza timer, risposte modificabili fino alla consegna.
- Simulazioni da 30 domande casuali in 30 minuti, scadenza assoluta e consegna automatica, anche alla riapertura se il tempo è scaduto.
- Risultati con punteggio, durata, corrette, sbagliate e non risposte. Un punto per risposta corretta, zero per errore o risposta vuota.
- Preferiti, storico degli ultimi 100 tentativi, progressi per capitolo, ripasso degli errori con massimo 30 domande e ripresa del quiz interrotto. Una risposta successiva corretta risolve un errore precedente.
- Progressi locali e sincronizzazione facoltativa su più dispositivi con lo stesso account Google.

Le credenziali dell’account tecnico non saranno distribuite nel sito. Rendere pubblico il sito renderà leggibili le domande importate, anche con foglio sorgente privato.
