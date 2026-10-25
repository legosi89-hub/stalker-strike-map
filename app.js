'use strict';
(async () => {
  const $ = id => document.getElementById(id), NS='http://www.w3.org/2000/svg';
  const W=1457,H=1080,viewport=$('map-viewport'),plane=$('map-plane'),popover=$('map-popover'),preview=$('map-preview');
  // Document cards must sit above the map's isolated stacking context and every control.
  document.body.append(popover);
  viewport.append($('map-controls'));
  async function loadPlacements(url,api=false) {
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),2500);
    try {const response=await fetch(url,{cache:'no-store',signal:controller.signal});if(!response.ok)return null;const result=await response.json();if(api&&result?.exists!==true)return null;return window.createPlacementStore({initial:api?result.data:result}).serialize();}
    catch{return null;}finally{clearTimeout(timeout);}
  }
  // This is the approved, fixed layout. The public viewer never reads editor drafts.
  const data=await loadPlacements('./map-data.json');
  const places=data?[...data.points.map(p=>({...p,type:'location',description:p.note||''})),...data.anomalies.map(p=>({...p,type:'anomaly'}))]:window.MAP_PLACES||[];
  const state={mode:'color',scale:1,fit:1,x:0,y:0,selected:null,hovered:null,pointer:null,moved:false,pinned:false};
  const markerNodes=new Map(),mapById=new Map(places.map(p=>[p.id,p]));
  let hoverTimer,suppressClickUntil=0,scannerSignal,focusBeforeCard=null,suppressPreviewFocus=false,photoFrames=[];
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),paper=()=>state.mode==='color';
  const code=p=>p.type==='anomaly'&&!paper()?window.SCANNER_NOTES?.[p.id]?.code||'Н/Д':(p.type==='anomaly'?'А':'')+(p.number??'');
  const ink=p=>p.type==='anomaly'?'anomaly':p.kind==='known'?'known':'rumor';
  const visible=p=>!!p&&(paper()||p.id!=='point-6');
  const announce=text=>{$('announcement').textContent=text;};
  const buildingAreas={'anomaly-6':[13,14],'anomaly-7':[10,14],'anomaly-8':[18,14]};
  const areaFor=p=>buildingAreas[p.id]||(paper()&&p.id==='point-6'?[6.5,11]:null);
  const mapAnchor=p=>({x:p.x,y:p.y});
  const sketchOrder=['anomaly-glass','anomaly-ember','anomaly-silence','anomaly-echo','anomaly-red-thread','anomaly-6','anomaly-7','anomaly-8'];
  const paperIcon=p=>p.type==='anomaly'?'anomaly':p.id==='point-1'?'bar':p.id==='point-2'?'base':p.id==='point-3'?'return':p.icon==='skull'?'skull':p.id==='point-8'?'fire':p.id==='point-9'?'boot':['point-6','point-7'].includes(p.id)?'ruins':'warning';
  function icon(name){const svg=document.createElementNS(NS,'svg'),use=document.createElementNS(NS,'use');if(name&&document.getElementById('i-'+name)){use.setAttribute('href','#i-'+name);svg.append(use);}svg.setAttribute('aria-hidden','true');return svg;}
  function entry(p){
    if(paper())return{title:window.FIELD_NOTES?.[p.id]?.title||p.title||'Пометка',description:window.FIELD_NOTES?.[p.id]?.description||p.description||p.note||'',subtitle:p.type==='anomaly'?'Запись на полях':p.kind==='known'?'Знакомое место':'Слух на полях',status:areaFor(p)?'Где-то в этой области':'Личная пометка'};
    if(p.type==='anomaly')return window.SCANNER_NOTES?.[p.id]||{title:p.title||`Очаг ${code(p)}`,subtitle:'Аномальное явление',description:'Данные отсутствуют. Требуется обследование.',status:'Нужно разведать'};
    if(window.SCANNER_PLACES?.[p.id])return window.SCANNER_PLACES[p.id];
    if(p.kind==='known')return{title:p.title,subtitle:'Опознанный объект',status:'Расположение установлено',description:({'point-1':'Бар. Место сбора сталкеров и обмена сведениями. Расположение установлено.','point-2':'Поселение вольных сталкеров. Жилой участок и место сбора общины. Расположение установлено.','point-3':'Мертвяк. Пункт возвращения сталкеров. Расположение установлено.'})[p.id]||'Расположение объекта установлено.'};
    return{title:'Неизвестно',subtitle:`Неопознанный объект ${String(p.number).padStart(2,'0')}`,status:'Нужно разведать',description:'На полевой схеме отмечен участок, о котором нет проверенных сведений. Назначение объекта неизвестно.\n\nТребуется разведка на месте.'};
  }
  const toScreen=(x,y)=>({x:state.x+x/100*W*state.scale,y:state.y+y/100*H*state.scale});
  function viewBounds(){
    const vw=viewport.clientWidth,vh=viewport.clientHeight;
    if(paper()){
      if(vw<=1000){const landscape=vw>vh&&vh<500,top=landscape?64:150;return{x:16,y:top,width:Math.max(1,vw-32),height:Math.max(1,vh-top-(landscape?30:50))};}
      return{x:210,y:24,width:Math.max(1,vw-440),height:Math.max(1,vh-69)};
    }
    const r=$('tablet-display').getBoundingClientRect(),v=viewport.getBoundingClientRect();
    return{x:r.left-v.left,y:r.top-v.top,width:Math.max(1,r.width),height:Math.max(1,r.height)};
  }
  function screenInsets(){const b=viewBounds();for(const[key,value]of Object.entries({left:b.x,top:b.y,right:viewport.clientWidth-b.x-b.width,bottom:viewport.clientHeight-b.y-b.height}))viewport.style.setProperty('--screen-'+key,value+'px');}
  function clampPosition(){const b=viewBounds(),mw=W*state.scale,mh=H*state.scale;state.x=mw<b.width?b.x+(b.width-mw)/2:clamp(state.x,b.x+b.width-mw-60,b.x+60);state.y=mh<b.height?b.y+(b.height-mh)/2:clamp(state.y,b.y+b.height-mh-60,b.y+60);}
  function transform(){
    clampPosition();plane.style.transform=`translate(${state.x}px,${state.y}px) scale(${state.scale})`;plane.style.setProperty('--signal-scale',1/state.scale);
    markerNodes.forEach(el=>{const area=el.classList.contains('uncertain-area');el.style.transform=`translate(-50%,-50%)${area?'':` scale(${1/state.scale})`}`;if(area)el.querySelectorAll('.marker-number,.area-glyph').forEach(child=>{child.style.transform=`${child.classList.contains('area-glyph')?'translate(-50%,-50%) ':''}scale(${1/state.scale})`;child.style.transformOrigin='center';});});
    $('zoom-indicator').textContent=Math.round(state.scale/state.fit*100)+'%';positionPopover();positionPreview();layoutAnnotations();
  }
  function fitMap(){
    const b=viewBounds();screenInsets();
    // Leave the desk headings outside the paper and keep the scanner inside its physical screen.
    const width=paper()?b.width:b.width-24;
    const height=paper()?b.height:b.height-24;
    state.fit=Math.max(.08,Math.min(width/W,height/H));state.scale=state.fit;
    state.x=b.x+(b.width-W*state.scale)/2;state.y=b.y+(b.height-H*state.scale)/2;
    transform();
  }
  function zoom(factor,cx=viewport.clientWidth/2,cy=viewport.clientHeight/2){const next=clamp(state.scale*factor,state.fit,state.fit*5),ratio=next/state.scale;state.x=cx-(cx-state.x)*ratio;state.y=cy-(cy-state.y)*ratio;state.scale=next;transform();}
  function renderMarkers(){
    $('map-markers').replaceChildren();markerNodes.clear();
    for(const[index,p]of places.entries()){
      const el=document.createElement('button'),info=entry(p),area=areaFor(p),anchor=mapAnchor(p);el.className=`map-marker ${p.type} ${ink(p)}${area?' uncertain-area':''}`;el.dataset.id=p.id;el.style.left=anchor.x+'%';el.style.top=anchor.y+'%';el.style.setProperty('--delay',-index*.41+'s');
      el.setAttribute('aria-label',`${paper()?'':code(p)+' · '}${info.title}${area?' · примерная область':''}`);el.setAttribute('aria-pressed',String(state.selected===p.id));
      if(area){
        el.style.width=area[0]/100*W+'px';el.style.height=area[1]/100*H+'px';
        const svg=document.createElementNS(NS,'svg'),path=document.createElementNS(NS,'path');svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');svg.classList.add('area-outline');
        path.setAttribute('d','M7,47 C2,22 19,7 48,8 C78,3 96,20 93,49 C99,76 77,91 51,93 C22,96 5,78 7,47 M12,47 C6,23 24,11 48,12 C73,7 92,25 89,50 C94,73 74,88 50,88');
        svg.append(path);el.append(svg);
        if(paper()){const glyph=document.createElement('span');glyph.className='area-glyph';glyph.setAttribute('aria-hidden','true');if(p.id==='point-6')glyph.append(icon('ruins'));else glyph.textContent='×';el.append(glyph);}
      }else if(p.type==='anomaly'){
        for(const cls of['anomaly-ring','anomaly-ring second','anomaly-core']){const span=document.createElement('span');span.className=cls;span.setAttribute('aria-hidden','true');if(paper()&&cls==='anomaly-core')span.textContent='×';el.append(span);}
      }else{const symbol=document.createElement('span');symbol.className='marker-symbol marker-numeric';
        if(!paper()&&p.kind==='rumor'){symbol.classList.add('marker-cross');symbol.textContent='×';}
        else if(!paper())symbol.textContent=String(p.number??'').padStart(2,'0');
        else if(p.kind==='known')symbol.append(icon(p.id==='point-1'?'bar':p.id==='point-2'?'base':'return'));
        else symbol.append(icon(p.icon==='skull'?'skull':p.id==='point-5'?'warning':p.id==='point-7'?'ruins':p.id==='point-8'?'fire':p.id==='point-9'?'boot':'warning'));el.append(symbol);}
      if(!paper()&&(p.type==='anomaly'||p.kind==='rumor')){const n=document.createElement('span');n.className='marker-number';n.textContent=code(p);el.append(n);}
      el.addEventListener('pointerenter',e=>{if(e.pointerType==='touch'||state.pointer)return;clearTimeout(hoverTimer);state.hovered=p.id;showPreview(p);});
      el.addEventListener('pointerleave',()=>{hoverTimer=setTimeout(()=>{state.hovered=null;hidePreview();},120);});
      el.addEventListener('focus',()=>{if(!suppressPreviewFocus){state.hovered=p.id;showPreview(p);}});el.addEventListener('blur',()=>{state.hovered=null;hidePreview();});
      el.addEventListener('click',e=>{e.stopPropagation();if(Date.now()>=suppressClickUntil)selectPlace(p,false,true);});$('map-markers').append(el);markerNodes.set(p.id,el);
    }
  }
  function renderAnnotations(){
    $('map-annotations').replaceChildren();layoutAnnotations();
  }
  function layoutAnnotations(){
    const svg=$('map-threads');svg.replaceChildren();
    svg.setAttribute('viewBox',`0 0 ${viewport.clientWidth} ${viewport.clientHeight}`);
    if(preview.hidden||!popover.hidden)return;
    const p=mapById.get(preview.dataset.id);if(!p)return;
    const a=mapAnchor(p),anchor=toScreen(a.x,a.y);
    const w=preview.offsetWidth,h=preview.offsetHeight;
    const x=parseFloat(preview.style.left)+w/2,y=parseFloat(preview.style.top)+h/2;
    const dx=x-anchor.x,dy=y-anchor.y;
    const ratio=1/Math.max(Math.abs(dx)/(w/2+3),Math.abs(dy)/(h/2+3),1);
    const end={x:x-dx*ratio,y:y-dy*ratio};
    const path=document.createElementNS(NS,'path');
    path.setAttribute('class',`map-thread ${ink(p)} selected`);
    path.setAttribute('d',paper()?`M${anchor.x},${anchor.y} Q${anchor.x+dx*.48+dy*.07},${anchor.y+dy*.48-dx*.07} ${end.x},${end.y}`:`M${anchor.x},${anchor.y} L${anchor.x+dx*.35},${end.y} L${end.x},${end.y}`);
    svg.append(path);
  }
  function renderList(){
    const query=$('search').value.trim().toLocaleLowerCase('ru');$('place-list').replaceChildren();let count=0;
    for(const p of places){if(!paper()&&p.id==='point-6')continue;const info=entry(p);if(!`${paper()?'':code(p)} ${info.title} ${info.subtitle} ${info.description}`.toLocaleLowerCase('ru').includes(query))continue;count++;
      const row=document.createElement('button');row.className=`place-row ${ink(p)}${state.selected===p.id?' selected':''}`;row.dataset.id=p.id;row.setAttribute('aria-label',`Показать ${code(p)}: ${info.title}`);row.setAttribute('aria-pressed',String(state.selected===p.id));
      const number=document.createElement('span');number.className='place-row-icon';if(paper())number.append(icon(paperIcon(p)));else number.textContent=code(p);const text=document.createElement('span'),title=document.createElement('span'),sub=document.createElement('span');title.className='place-row-title';title.textContent=info.title;sub.className='place-row-subtitle';sub.textContent=paper()?info.subtitle:info.status;text.append(title,sub);row.append(number,text);row.addEventListener('click',()=>selectPlace(p,true,true));$('place-list').append(row);
    }
    if(!count){const p=document.createElement('p');p.className='empty-search';p.textContent='Такой записи нет.';$('place-list').append(p);}
    $('location-count').textContent=String(count).padStart(2,'0');$('catalog-number').textContent=String(places.filter(visible).length).padStart(2,'0');
  }
  function positionPopover(){
    if(popover.hidden)return;popover.style.left=viewport.clientWidth/2+'px';popover.style.top=viewport.clientHeight/2+'px';
  }
  function positionPreview(){
    if(preview.hidden)return;const p=mapById.get(preview.dataset.id);if(!p)return;const b=viewBounds(),a=mapAnchor(p),anchor=toScreen(a.x,a.y);preview.style.maxWidth=Math.max(100,b.width-16)+'px';const w=preview.offsetWidth,h=preview.offsetHeight;
    let left=anchor.x+25;if(left+w>b.x+b.width-8)left=anchor.x-w-25;preview.style.left=clamp(left,b.x+8,Math.max(b.x+8,b.x+b.width-w-8))+'px';preview.style.top=clamp(anchor.y-h/2,b.y+8,Math.max(b.y+8,b.y+b.height-h-8))+'px';
  }
  function showPreview(p){if(!visible(p)||!popover.hidden)return;preview.dataset.id=p.id;preview.hidden=false;$('preview-title').textContent=entry(p).title;positionPreview();layoutAnnotations();}
  function hidePreview(){preview.hidden=true;delete preview.dataset.id;layoutAnnotations();}
  function atlasPosition(frame){return `${frame.columns>1?frame.index%frame.columns/(frame.columns-1)*100:0}% ${frame.rows>1?Math.floor(frame.index/frame.columns)/(frame.rows-1)*100:0}%`;}
  function setAtlas(el,frame){el.style.backgroundImage=`url('${frame.atlas}')`;el.style.backgroundSize=`${frame.columns*100}% ${frame.rows*100}%`;el.style.backgroundPosition=atlasPosition(frame);}
  function selectPhoto(index){
    const frame=photoFrames[index];if(!frame)return;const atlas=!!frame.atlas,container=$('anomaly-photo-frame'),damage=frame.damage||'none',damaged=['mild','heavy','lost'].includes(damage);container.hidden=false;container.dataset.damage=damage;container.dataset.warning=frame.warning||'';container.dataset.intensity=frame.intensity||'';
    $('anomaly-photo').hidden=atlas;$('anomaly-atlas').hidden=!atlas;$('anomaly-atlas').setAttribute('aria-hidden',String(!atlas));$('anomaly-atlas').setAttribute('aria-label',`Полевой кадр ${index+1}: ${frame.code}${damaged?' · файл повреждён':''}`);
    if(atlas)setAtlas($('anomaly-atlas'),frame);else if($('anomaly-photo').getAttribute('src')!==frame.src)$('anomaly-photo').src=frame.src;
    $('photo-damage').hidden=!damaged;$('damage-detail').textContent=damage==='lost'?'ДАННЫЕ КАДРА УТРАЧЕНЫ':damage==='heavy'?'ОШИБКА ЧТЕНИЯ / ФРАГМЕНТЫ ДАННЫХ':'НАРУШЕНИЕ ЦЕЛОСТНОСТИ КАДРА';
    $('photo-gallery-thumbs').querySelectorAll('button').forEach((el,i)=>{el.classList.toggle('active',i===index);el.setAttribute('aria-pressed',String(i===index));});
    $('media-caption').textContent=`${frame.code} / КАДР ${String(index+1).padStart(2,'0')} ИЗ ${photoFrames.length}${damaged?' / ПОВРЕЖДЁН':damage==='medium'?' / ЧАСТИЧНАЯ ВИДИМОСТЬ':''}`;
  }
  function photoGallery(p,info){
    const i=sketchOrder.indexOf(p.id),fallback=i>=0&&info.photo?[{src:info.photo},{atlas:'./assets/anomalies/field-contact-sheet.png',index:i*2,columns:4,rows:4},{atlas:'./assets/anomalies/field-contact-sheet.png',index:i*2+1,columns:4,rows:4}]:[];
    photoFrames=(window.MAP_MEDIA?.galleries[p.id]||fallback).map(frame=>({...frame,code:info.code||code(p)}));
    $('photo-gallery-thumbs').replaceChildren();
    photoFrames.forEach((frame,index)=>{const b=document.createElement('button'),image=document.createElement('span');b.className='photo-thumb'+(frame.atlas?' atlas-thumb':'');b.dataset.damage=frame.damage||'none';b.dataset.warning=frame.warning||'';b.setAttribute('aria-label',`Открыть кадр ${index+1} из ${photoFrames.length}${['mild','heavy','lost'].includes(frame.damage)?' · файл повреждён':''}`);image.className='thumb-image';image.setAttribute('aria-hidden','true');if(frame.atlas)setAtlas(image,frame);else image.style.backgroundImage=`url('${frame.src}')`;b.append(image);b.addEventListener('click',()=>selectPhoto(index));$('photo-gallery-thumbs').append(b);});
    selectPhoto(0);
  }
  function showPlace(p){
    if(!visible(p))return;const info=entry(p);focusBeforeCard=document.activeElement;hidePreview();popover.dataset.id=p.id;popover.dataset.restriction=paper()?'':info.restriction||'';popover.hidden=false;$('card-scrim').hidden=false;document.body.classList.add('card-open');popover.classList.toggle('is-anomaly',p.type==='anomaly');$('popover-category').textContent=paper()?info.subtitle:`${code(p)} / ${info.subtitle}`;$('popover-title').textContent=info.title;$('popover-description').textContent=info.description;$('popover-tag').textContent=info.status;$('popover-code').textContent=paper()?'':code(p);
    $('popover-symbol').hidden=!p.icon||!paper();$('popover-symbol').replaceChildren(...(p.icon?[icon(p.icon)]:[]));
    const sketch=window.MAP_MEDIA?.sketches[p.id],hasMedia=paper()?!!sketch:!!(window.MAP_MEDIA?.galleries[p.id]?.length||info.photo);
    $('anomaly-media').hidden=!hasMedia;popover.classList.toggle('has-media',hasMedia);$('anomaly-sketch').hidden=!hasMedia||!paper();$('anomaly-photo-frame').hidden=!hasMedia||paper();
    $('photo-gallery-thumbs').hidden=paper();
    if(hasMedia&&paper()){setAtlas($('anomaly-sketch'),sketch);$('anomaly-sketch').setAttribute('aria-label','Карандашная зарисовка: '+info.title);$('media-caption').textContent='';}
    else if(hasMedia){$('anomaly-photo').alt='Полевой кадр: '+info.title;photoGallery(p,info);}
    popover.scrollTop=0;$('popover-description').scrollTop=0;positionPopover();layoutAnnotations();$('close-popover').focus({preventScroll:true});
  }
  function hidePopover(){popover.hidden=true;$('card-scrim').hidden=true;document.body.classList.remove('card-open');delete popover.dataset.id;}
  function closeSelection(){const restore=focusBeforeCard;focusBeforeCard=null;state.selected=null;state.hovered=null;state.pinned=false;clearTimeout(hoverTimer);hidePreview();hidePopover();markerNodes.forEach(el=>{el.classList.remove('selected');el.setAttribute('aria-pressed','false');});renderAnnotations();renderList();if(restore?.isConnected){suppressPreviewFocus=true;restore.focus({preventScroll:true});suppressPreviewFocus=false;}}
  function selectPlace(p,focusMap=false,pin=false){
    clearTimeout(hoverTimer);state.selected=p.id;state.hovered=null;state.pinned=pin;
    if(focusMap){state.scale=Math.max(state.scale,state.fit*1.25);state.x=viewport.clientWidth*.44-p.x/100*W*state.scale;state.y=viewport.clientHeight*.46-p.y/100*H*state.scale;closeMenu();}
    markerNodes.forEach((el,id)=>{el.classList.toggle('selected',id===p.id);el.setAttribute('aria-pressed',String(id===p.id));});updateLayers();showPlace(p);transform();renderList();announce(entry(p).title);
  }
  function updateLayers(){
    let count=0;
    for(const p of places){markerNodes.get(p.id).hidden=!visible(p);if(visible(p))count++;}if(state.selected&&!visible(mapById.get(state.selected)))closeSelection();if(!popover.hidden&&!visible(mapById.get(popover.dataset.id)))hidePopover();$('visible-count').textContent=`${count} ${paper()?'ПОМЕТОК':'ОБЪЕКТОВ'}`;renderAnnotations();
  }
  function setMode(mode){
    clearTimeout(hoverTimer);state.selected=null;state.hovered=null;state.pinned=false;hidePreview();hidePopover();state.mode=mode==='scanner'?'scanner':'color';document.body.classList.toggle('color-mode',paper());$('mode-color').setAttribute('aria-pressed',String(paper()));$('mode-scanner').setAttribute('aria-pressed',String(!paper()));$('map-image').setAttribute('aria-hidden',String(paper()));$('map-image-color').setAttribute('aria-hidden',String(!paper()));
    $('desk-eyebrow').textContent=paper()?'КАРТА ИЗ ЧУЖОГО РЮКЗАКА':'ПОЛЕВОЙ ТЕРМИНАЛ / АРХИВ ДАННЫХ';$('desk-title').textContent=paper()?'Забытая\nистория':'Полевой\nсканер';$('desk-subtitle').textContent=paper()?'Что видел. Что слышал.\nЧто лучше забыть.':'Классификация явлений.\nЖурнал наблюдений.';
    $('catalog-label').textContent=paper()?'Записи':'Реестр';$('catalog-caption').textContent=paper()?'НА ОБОРОТЕ КАРТЫ':'ПОЛЕВОЕ ОБСЛЕДОВАНИЕ';$('catalog-heading').textContent=paper()?'Полевые записи':'Реестр объектов';$('catalog-footnote').textContent=paper()?'Что видел сам, что слышал у костра.':'Классифицированные очаги и участки, требующие разведки.';$('search').placeholder=paper()?'Найти пометку…':'Код или название объекта';$('search').value='';
    renderMarkers();renderList();updateLayers();fitMap();scannerSignal?.refresh();announce(paper()?'Бумажная карта сталкера':'Научная карта: аномалии и участки для разведки');
  }
  function openMenu(){$('sidebar').classList.add('open');$('sidebar').inert=false;$('mobile-scrim').hidden=false;$('menu-toggle').setAttribute('aria-expanded','true');}
  function closeMenu(){const focus=$('sidebar').contains(document.activeElement);$('sidebar').classList.remove('open');$('sidebar').inert=true;$('mobile-scrim').hidden=true;$('menu-toggle').setAttribute('aria-expanded','false');if(focus)$('menu-toggle').focus({preventScroll:true});}
  setMode('color');fitMap();if(window.createScannerSignal){scannerSignal=window.createScannerSignal({element:$('scanner-signal'),isActive:()=>!paper()});scannerSignal.start();}
  $('mode-color').addEventListener('click',()=>setMode('color'));$('mode-scanner').addEventListener('click',()=>setMode('scanner'));
  $('search').addEventListener('input',renderList);
  $('zoom-in').addEventListener('click',()=>zoom(1.25));$('zoom-out').addEventListener('click',()=>zoom(.8));function reset(){closeSelection();fitMap();announce('Карта целиком');}$('reset-view').addEventListener('click',reset);$('overview').addEventListener('click',()=>{reset();closeMenu();});
  $('close-popover').addEventListener('click',closeSelection);$('card-scrim').addEventListener('click',closeSelection);
  $('menu-toggle').addEventListener('click',()=>{$('sidebar').classList.contains('open')?closeMenu():openMenu();});$('close-catalog').addEventListener('click',closeMenu);$('mobile-scrim').addEventListener('click',closeMenu);closeMenu();
  const insideMap=e=>{const r=viewport.getBoundingClientRect(),b=viewBounds(),x=e.clientX-r.left,y=e.clientY-r.top;return x>=b.x&&x<=b.x+b.width&&y>=b.y&&y<=b.y+b.height;};
  viewport.addEventListener('wheel',e=>{if(e.target.closest('.map-popover')||!insideMap(e))return;e.preventDefault();const r=viewport.getBoundingClientRect();zoom(e.deltaY<0?1.13:1/1.13,e.clientX-r.left,e.clientY-r.top);},{passive:false});
  const touches=new Map();let pinch=null;
  viewport.addEventListener('pointerdown',e=>{
    if(e.target.closest('.map-popover,.map-controls,.map-annotation')||!insideMap(e)||e.pointerType==='mouse'&&e.button!==0)return;touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(touches.size===2){const[a,b]=[...touches.values()];pinch={distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),scale:state.scale};state.pointer=null;state.moved=true;return;}
    state.pointer={id:e.pointerId,x:e.clientX,y:e.clientY,originX:state.x,originY:state.y};state.moved=false;
  });
  viewport.addEventListener('pointermove',e=>{
    const r=viewport.getBoundingClientRect(),x=(e.clientX-r.left-state.x)/state.scale/W*100,y=(e.clientY-r.top-state.y)/state.scale/H*100;if(x>=0&&x<=100&&y>=0&&y<=100)$('grid-position').textContent=`СЕТКА ${x.toFixed(1)} · ${y.toFixed(1)}`;
    if(touches.has(e.pointerId))touches.set(e.pointerId,{x:e.clientX,y:e.clientY});if(touches.size===2&&pinch){const[a,b]=[...touches.values()];zoom((pinch.scale*Math.hypot(a.x-b.x,a.y-b.y)/pinch.distance)/state.scale,(a.x+b.x)/2-r.left,(a.y+b.y)/2-r.top);state.moved=true;return;}
    const p=state.pointer;if(!p||p.id!==e.pointerId)return;const dx=e.clientX-p.x,dy=e.clientY-p.y;if(Math.hypot(dx,dy)>4){state.moved=true;viewport.setPointerCapture(e.pointerId);viewport.classList.add('dragging');clearTimeout(hoverTimer);if(!state.selected){state.hovered=null;hidePopover();}}if(state.moved){state.x=p.originX+dx;state.y=p.originY+dy;transform();}
  });
  function endPointer(e){touches.delete(e.pointerId);pinch=null;if(state.moved)suppressClickUntil=Date.now()+250;if(state.pointer?.id===e.pointerId)state.pointer=null;if(viewport.hasPointerCapture(e.pointerId))viewport.releasePointerCapture(e.pointerId);viewport.classList.remove('dragging');}
  viewport.addEventListener('pointerup',endPointer);viewport.addEventListener('pointercancel',endPointer);window.addEventListener('pointerup',endPointer);viewport.addEventListener('click',e=>{if(Date.now()<suppressClickUntil||e.target.closest('button,.map-popover'))return;closeSelection();});
  viewport.addEventListener('keydown',e=>{if(e.target.closest('.map-popover')&&e.key!=='Escape')return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','0'].includes(e.key)){e.preventDefault();if(e.key==='+'||e.key==='=')zoom(1.25);else if(e.key==='-')zoom(.8);else if(e.key==='0')reset();else{state.x+=e.key==='ArrowLeft'?50:e.key==='ArrowRight'?-50:0;state.y+=e.key==='ArrowUp'?50:e.key==='ArrowDown'?-50:0;transform();}}});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){closeSelection();closeMenu();}
    if(!popover.hidden&&e.key==='Tab'){const focusable=[...popover.querySelectorAll('button:not(:disabled),a[href],input,[tabindex="0"]')].filter(el=>el.getClientRects().length);const first=focusable[0],last=focusable.at(-1);if(first&&(e.shiftKey&&document.activeElement===first||!popover.contains(document.activeElement))){e.preventDefault();(e.shiftKey?last:first).focus();}else if(last&&!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
    if(popover.hidden&&e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();openMenu();$('search').focus();}
  });
  new ResizeObserver(fitMap).observe(viewport);document.fonts?.ready.then(()=>transform());$('map-image-color').addEventListener('error',()=>{$('empty-map').hidden=false;});$('map-image').addEventListener('error',()=>{if(!paper())$('empty-map').hidden=false;});window.addEventListener('pagehide',()=>scannerSignal?.stop());window.addEventListener('pageshow',()=>scannerSignal?.start());
  $('anomaly-photo').addEventListener('load',()=>{positionPopover();layoutAnnotations();});
  $('anomaly-photo').addEventListener('error',()=>{$('anomaly-photo-frame').hidden=true;$('media-caption').textContent='Фотоматериал не читается';positionPopover();layoutAnnotations();});
})();
