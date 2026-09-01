(() => {
'use strict';
function install(){
  if(document.getElementById('learningUiStyles'))return;
  const s=document.createElement('style');s.id='learningUiStyles';s.textContent=`
    .card-actions-wrap{flex-wrap:wrap;justify-content:flex-end;align-items:center}
    .repeat-prompt{white-space:nowrap}
    @media(max-width:650px){
      .card-toolbar{align-items:flex-start;gap:8px}
      .card-actions-wrap{max-width:76%;gap:6px}
      .card-actions-wrap .compact{padding:8px 9px;font-size:12px}
      .card-actions-wrap .icon-btn.small{width:34px;height:34px}
      #cardTag{max-width:24%;overflow-wrap:anywhere}
    }
  `;document.head.appendChild(s);
}
setTimeout(install,120);
})();