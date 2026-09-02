#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / 'voice-controller.js'


def replace_once(text, old, new, label):
    if text.count(old) != 1:
        raise RuntimeError(f'{label}: erwartet genau 1 Treffer, gefunden {text.count(old)}')
    return text.replace(old, new, 1)


def main():
    text = PATH.read_text(encoding='utf-8')

    text = replace_once(
        text,
        "let advanceTimer=null;\nlet cardSerial=0;",
        "let advanceTimer=null;\nlet cardCycleTimer=null;\nlet cardSerial=0;",
        'cardCycleTimer',
    )

    text = replace_once(
        text,
        "function appSpeaking(){return ownSpeech||!!window.__rvtAppSpeaking;}",
        "function appSpeaking(){return ownSpeech||!!window.__rvtAppSpeaking;}",
        'speech synthesis guard',
    )

    text = replace_once(
        text,
        "function markSpeechStart(){ownSpeech=true;window.__rvtAppSpeaking=true;clearSubmit();speechDetected=false;resultSegments.clear();cardTranscript='';}\nfunction markSpeechEnd(){ownSpeech=false;window.__rvtAppSpeaking=false;suppressUntil=Date.now()+380;resetAnswerCapture(true);if(answerReady()&&prefs.autoMic)setStatus(statusListening(),recognitionRunning||recognitionStarting);}",
        "function clearCardCycle(){clearTimeout(cardCycleTimer);cardCycleTimer=null;}\n"
        "function startListeningForCard(serial,delay=0){\n"
        "  clearCardCycle();\n"
        "  cardCycleTimer=setTimeout(()=>{\n"
        "    cardCycleTimer=null;\n"
        "    if(serial!==cardSerial||!prefs.autoMic||userStopped||document.visibilityState==='hidden'||!answerReady())return;\n"
        "    if(appSpeaking()||Date.now()<suppressUntil){startListeningForCard(serial,180);return;}\n"
        "    stopRecognition(false);userStopped=false;acceptingAnswer=true;resetAnswerCapture(true);\n"
        "    if(ensureRecognition(false))setStatus(statusListening(),true);\n"
        "  },delay);\n"
        "}\n"
        "function markSpeechStart(){\n"
        "  clearCardCycle();ownSpeech=true;window.__rvtAppSpeaking=true;clearSubmit();acceptingAnswer=false;speechDetected=false;resultSegments.clear();cardTranscript='';\n"
        "  if(recognitionRunning||recognitionStarting)stopRecognition(false);\n"
        "  setStatus('Vokabel wird vorgelesen …');\n"
        "}\n"
        "function markSpeechEnd(){\n"
        "  ownSpeech=false;window.__rvtAppSpeaking=false;suppressUntil=Date.now()+420;resetAnswerCapture(true);\n"
        "  if(answerReady()&&prefs.autoMic&&!userStopped)startListeningForCard(cardSerial,460);\n"
        "}",
        'speech lifecycle',
    )

    text = replace_once(
        text,
        "function setAutoMic(v){prefs.autoMic=!!v;savePrefs();updateToggle();if(!prefs.autoMic){stopRecognition(true);setStatus('Mikrofon-Automatik ausgeschaltet.');}else{userStopped=false;acceptingAnswer=answerReady();ensureRecognition(false);if(answerReady())setStatus(statusListening(),true);}}",
        "function setAutoMic(v){prefs.autoMic=!!v;savePrefs();updateToggle();if(!prefs.autoMic){clearCardCycle();stopRecognition(true);setStatus('Mikrofon-Automatik ausgeschaltet.');}else{userStopped=false;if(answerReady())startListeningForCard(cardSerial,100);}}",
        'setAutoMic',
    )

    text = replace_once(
        text,
        "const oldMic=$('#micButton');if(oldMic&&!oldMic.dataset.voiceController){const mic=oldMic.cloneNode(true);mic.dataset.voiceController='1';oldMic.replaceWith(mic);mic.addEventListener('click',()=>{if(!prefs.autoMic)setAutoMic(true);userStopped=false;acceptingAnswer=answerReady();if(recognitionRunning&&recognitionLang===answerLang())setStatus(statusListening(),true);else ensureRecognition(true);});}",
        "const oldMic=$('#micButton');if(oldMic&&!oldMic.dataset.voiceController){const mic=oldMic.cloneNode(true);mic.dataset.voiceController='1';oldMic.replaceWith(mic);mic.addEventListener('click',()=>{if(!prefs.autoMic){setAutoMic(true);return;}userStopped=false;clearCardCycle();stopRecognition(false);if(answerReady())startListeningForCard(cardSerial,80);});}",
        'manual mic restart',
    )

    text = replace_once(
        text,
        "submittedSerial=-1;handledResultSerial=-1;acceptingAnswer=!!prefs.autoMic;resetAnswerCapture(true);\n  setStatus('Erste Spracherkennung war unsicher – bitte noch einmal sprechen.',true);",
        "submittedSerial=-1;handledResultSerial=-1;stopRecognition(false);resetAnswerCapture(true);userStopped=false;\n  setStatus('Erste Spracherkennung war unsicher – bitte noch einmal sprechen.',true);\n  if(prefs.autoMic)startListeningForCard(cardSerial,180);",
        'startup retry',
    )

    old_start = """function startCard(read=true){
  clearTimeout(advanceTimer);hideFeedback();submittedSerial=-1;handledResultSerial=-1;acceptingAnswer=!!prefs.autoMic;resetAnswerCapture(true);
  if(!answerReady())return;const serial=cardSerial;
  if(prefs.autoMic){ensureRecognition(false);setStatus(statusListening(),true);}else setStatus('Mikrofon-Automatik ist aus.');
  if(read&&!muted())setTimeout(()=>{if(serial===cardSerial&&answerReady())speak($('#promptText')?.textContent?.trim()||'',promptLang());},20);
}"""
    new_start = """function startCard(read=true){
  clearTimeout(advanceTimer);clearCardCycle();hideFeedback();submittedSerial=-1;handledResultSerial=-1;
  stopRecognition(false);userStopped=false;acceptingAnswer=false;resetAnswerCapture(true);
  if(!answerReady())return;const serial=cardSerial;
  if(read&&!muted()){
    setStatus('Vokabel wird vorgelesen …');
    // iOS darf nach dem Abbruch der Erkennung kurz vollständig zur Ruhe kommen.
    // Keine automatischen cancel()/resume()-Aufrufe: genau diese können Safari
    // in einem Zustand lassen, in dem Scrollen noch geht, aber kein Klick mehr.
    setTimeout(()=>{
      if(serial!==cardSerial||!answerReady())return;
      speak($('#promptText')?.textContent?.trim()||'',promptLang());
      // Startet die Ausgabe auf iOS gar nicht, wird das Mikrofon trotzdem frei.
      // Startet sie verspätet doch noch, stoppt markSpeechStart das Mikrofon wieder
      // und markSpeechEnd startet es danach sauber neu.
      if(prefs.autoMic)startListeningForCard(serial,1200);
    },520);
  }else if(prefs.autoMic)startListeningForCard(serial,220);
  else setStatus('Mikrofon-Automatik ist aus.');
}"""
    text = replace_once(text, old_start, new_start, 'startCard')

    text = replace_once(
        text,
        "document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){acceptingAnswer=false;clearTimeout(advanceTimer);clearSubmit();stopRecognition(false);}else if(learnActive()){userStopped=false;if(prefs.autoMic)ensureRecognition(false);if(answerReady())setTimeout(()=>startCard(true),120);}});\n  document.addEventListener('rvt-app-speech-start',()=>{ownSpeech=true;clearSubmit();});\n  document.addEventListener('rvt-app-speech-end',()=>{ownSpeech=false;suppressUntil=Date.now()+380;resetAnswerCapture(true);if(answerReady()&&prefs.autoMic)setStatus(statusListening(),recognitionRunning||recognitionStarting);});",
        "document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){acceptingAnswer=false;clearCardCycle();clearTimeout(advanceTimer);clearSubmit();stopRecognition(false);}else if(learnActive()){userStopped=false;if(answerReady())setTimeout(()=>startCard(true),120);}});\n"
        "  document.addEventListener('rvt-app-speech-start',()=>{clearCardCycle();ownSpeech=true;acceptingAnswer=false;clearSubmit();if(recognitionRunning||recognitionStarting)stopRecognition(false);setStatus('Vokabel wird vorgelesen …');});\n"
        "  document.addEventListener('rvt-app-speech-end',()=>{ownSpeech=false;suppressUntil=Date.now()+420;resetAnswerCapture(true);if(answerReady()&&prefs.autoMic&&!userStopped)startListeningForCard(cardSerial,460);});",
        'speech events',
    )

    text = replace_once(
        text,
        "function install(){neutralizeLegacy();replaceControls();injectStyles();installObservers();cardSerial++;userStopped=false;if(prefs.autoMic)ensureRecognition(false);setTimeout(()=>startCard(true),420);}",
        "function install(){neutralizeLegacy();replaceControls();injectStyles();installObservers();cardSerial++;userStopped=false;setTimeout(()=>startCard(true),420);}",
        'install order',
    )

    marker = "// RVT_CARD_SCOPED_VOICE_CYCLE_V5_IOS_NONBLOCKING_HANDOFF"
    if marker not in text:
        text = text.replace("'use strict';", "'use strict';\n" + marker, 1)

    PATH.write_text(text, encoding='utf-8')
    print('voice-controller.js: Kartenzyklus V5 – iOS-Wechsel ohne automatische speechSynthesis cancel/resume-Aufrufe')


if __name__ == '__main__':
    main()
