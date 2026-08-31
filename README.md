# Russisch-Vokabeltrainer

Persönlicher Russisch-Deutsch-Vokabeltrainer als statische Web-App.

## Bereits enthalten

- 80 Startvokabeln, darunter die geübten russischen Bewegungsverben
- Russisch → Deutsch, Deutsch → Russisch oder gemischt
- automatische Antwortprüfung mit akzeptierten Alternativen
- Wiederholsystem mit steigenden Abständen
- sichere Wörter bleiben erhalten und kommen später wieder
- schwierige und falsch beantwortete Wörter werden früher wiederholt
- Tageslimit für neue Vokabeln
- Lernserie und Tagesstatistik
- Liste schwieriger Vokabeln
- Vokabeln suchen, filtern, hinzufügen, bearbeiten und löschen
- russische Aussprache über die Browser-Sprachausgabe
- Spracheingabe, wenn der Browser Web Speech Recognition unterstützt
- Sicherung und Wiederherstellung des gesamten Lernstands als JSON
- CSV-Export des Vokabelbestands
- Hell-/Dunkelmodus
- Offline-Unterstützung über Service Worker
- automatische Qualitätsprüfung über GitHub Actions
- GitHub-Pages-Workflow vorbereitet

## Lernlogik

Neue Wörter starten auf Stufe 0. Je nach Bewertung steigt oder fällt die Stufe. Die Wiederholungsabstände wachsen von wenigen Minuten über Tage und Wochen bis zu mehreren Monaten. Sicher beherrschte Wörter verschwinden damit nicht dauerhaft.

Bei Verben ist die Einstellung „Bei Verben zuerst nur den Infinitiv lernen“ standardmäßig eingeschaltet. Die Datenstruktur enthält bei ausgewählten Bewegungsverben bereits Konjugationsformen, damit diese später als eigene Übungsstufe ausgebaut werden können.

## Speicherung

Der Lernstand liegt im `localStorage` des Browsers. Deshalb regelmäßig unter **Einstellungen → Sicherung exportieren** eine JSON-Sicherung anlegen. Beim Löschen der Browserdaten kann der lokale Lernstand sonst verloren gehen.

## Veröffentlichung

Die App benötigt keinen Server und keine Datenbank. Sie kann direkt über GitHub Pages bereitgestellt werden. Der Workflow `.github/workflows/pages.yml` ist bereits vorhanden. GitHub Pages muß im Repository einmalig für GitHub Actions freigeschaltet sein; danach übernimmt der Workflow die Veröffentlichung bei Änderungen auf `main`.

## Dateien

- `index.html` – Oberfläche
- `styles.css` – Gestaltung und mobile Ansicht
- `data.js` – Ausgangsvokabeln
- `app.js` – Lernlogik, Speicherung, Sprache, Import/Export
- `manifest.webmanifest` – installierbare Web-App
- `service-worker.js` – Offline-Cache
- `.github/workflows/quality.yml` – automatische Prüfung
- `.github/workflows/pages.yml` – Veröffentlichung
