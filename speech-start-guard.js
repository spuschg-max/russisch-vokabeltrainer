(() => {
'use strict';
// Deaktiviert. Auf iOS/Safari werden soundstart/speechstart bei einer
// weiterlaufenden Erkennung nicht zuverlässig für jede neue Äußerung geliefert.
// Ein vorgeschalteter Ereignis-Filter konnte deshalb gültige Antworten komplett
// verschlucken und den Sprachmodus scheinbar einfrieren. Stille wird stattdessen
// im voice-controller neutral behandelt; sie löst keine Bewertung aus.
})();
