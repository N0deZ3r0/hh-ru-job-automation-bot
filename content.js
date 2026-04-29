// ===== HH АВТО-ОТКЛИК v1.5.0 (WASM MAX PROTECTION) =====
(async function() {
    'use strict';
    
    (function() {
        const oe=console.error,ow=console.warn,ol=console.log;
        const sp=['ERR_BLOCKED_BY_CLIENT','anatskytics','fingerprint','TargetAds','weborama','skcrtxr','Canvas2D','willReadFrequently'];
        console.error=function(...a){const m=(a[0]||'').toString();for(const p of sp)if(m.includes(p))return;return oe.apply(this,a)};
        console.warn=function(...a){const m=(a[0]||'').toString();for(const p of sp)if(m.includes(p))return;return ow.apply(this,a)};
        console.log=function(...a){return ol.apply(this,a)};
        window.addEventListener('unhandledrejection',e=>{const m=e.reason?.toString()||'';for(const p of sp)if(m.includes(p)){e.preventDefault();return false}});
    })();
    
    // ===== ЗАГРУЗКА WASM =====
    let WASM=null;
    try{
        if(typeof ProtectModule==='function'){
            console.log('🛡️ Загрузка WASM...');
            const M=await ProtectModule({locateFile:p=>chrome.runtime.getURL(p)});
            M._seed_random(Date.now());
            WASM={
                shouldBlockUrl(url){const b=new TextEncoder().encode(url);const p=M._malloc(b.length+1);for(let i=0;i<b.length;i++)M.setValue(p+i,b[i],'i8');M.setValue(p+b.length,0,'i8');const r=M._should_block_url(p,b.length);M._free(p);return r===1},
                addCanvasNoise(d){const px=d.data;const p=M._malloc(px.length);for(let i=0;i<px.length;i++)M.setValue(p+i,px[i],'i8');M._add_canvas_noise(p,d.width,d.height,d.width*4);for(let i=0;i<px.length;i++)px[i]=M.getValue(p+i,'i8');M._free(p)},
                addAudioNoise(s,l){const p=M._malloc(s.length*4);for(let i=0;i<s.length;i++)M.setValue(p+i*4,s[i],'float');M._add_audio_noise(p,s.length,l);for(let i=0;i<s.length;i++)s[i]=M.getValue(p+i*4,'float');M._free(p)},
                getFakeBatteryLevel(r){return M._get_fake_battery_level(r||-1)},
                getFakeWebGLVendor(){return M.UTF8ToString(M._get_fake_webgl_vendor())},
                getFakeWebGLRenderer(){return M.UTF8ToString(M._get_fake_webgl_renderer())},
                getFakeWebGLParam(p){return M._get_fake_webgl_param(p)},
                getFakeShaderPrecision(){const rm=M._malloc(8),rM=M._malloc(8),pr=M._malloc(8);M._get_fake_shader_precision(rm,rM,pr);const r={rangeMin:[M.getValue(rm,'i32'),M.getValue(rm+4,'i32')],rangeMax:[M.getValue(rM,'i32'),M.getValue(rM+4,'i32')],precision:[M.getValue(pr,'i32'),M.getValue(pr+4,'i32')]};M._free(rm);M._free(rM);M._free(pr);return r},
                checkCanvasIntegrity(){return M._check_canvas_integrity()!==0},
                getRandomMode(){return M._get_random_mode()},
                getRandomInt(max){return M._get_random_int(max)}
            };
            window.__HH_WASM__=WASM;window.__HH_WASM_READY__=true;
            console.log('✅ WASM активирован:',Object.keys(WASM).join(', '));
        }
    }catch(e){console.warn('⚠️ WASM не загружен:',e.message);window.__HH_WASM_READY__=false}
    
    // ===== TECH GUARD: ПОРТЫ =====
    try{(()=>{
        const bh=['127.0.0.1','localhost','::1','0.0.0.0'];
        const bp=['192.168.','10.','172.16.','172.17.','172.18.','172.19.','172.20.','172.21.','172.22.','172.23.','172.24.','172.25.','172.26.','172.27.','172.28.','172.29.','172.30.','172.31.'];
        const isB=url=>{if(WASM&&typeof url==='string'){try{return WASM.shouldBlockUrl(url)}catch(e){}}try{const u=new URL(String(url),location.href);const h=u.hostname.toLowerCase();if(bh.includes(h))return true;if(bp.some(p=>h.startsWith(p)))return true;return false}catch{return false}};
        const oF=globalThis.fetch;globalThis.fetch=function(u,...a){if(typeof u==='string'&&u.includes('protect.wasm'))return oF.call(globalThis,u,...a);if(isB(u))return Promise.reject(new TypeError("blocked"));return oF.call(globalThis,u,...a)};
        const oO=XMLHttpRequest.prototype.open,oS=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.open=function(m,u,...a){this.__url=u;return oO.call(this,m,u,...a)};XMLHttpRequest.prototype.send=function(...a){if(isB(this.__url))return;return oS.apply(this,a)};
        globalThis.WebSocket=class extends globalThis.WebSocket{constructor(u,p){if(isB(u))throw new Error("blocked");super(u,p)}};
        globalThis.EventSource=class extends globalThis.EventSource{constructor(u,o){if(isB(u))throw new Error("blocked");super(u,o)}};
        if(navigator.sendBeacon){const o=navigator.sendBeacon;navigator.sendBeacon=function(u,d){if(isB(u))return false;return o.call(this,u,d)}}
    })();}catch(e){}
    
    // ===== TECH GUARD: FINGERPRINT =====
    try{(()=>{
        // Canvas
        const oTD=HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL=function(...a){
            if(this.width<300&&this.height<300){const c=this.getContext('2d',{willReadFrequently:true});if(c&&WASM){try{const d=c.getImageData(0,0,this.width,this.height);WASM.addCanvasNoise(d);c.putImageData(d,0,0)}catch(e){}}}
            return oTD.apply(this,a)};
        const oTB=HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob=function(cb,...a){if(this.width<300&&this.height<300){const c=this.getContext('2d',{willReadFrequently:true});if(c&&WASM){try{const d=c.getImageData(0,0,this.width,this.height);WASM.addCanvasNoise(d);c.putImageData(d,0,0)}catch(e){}}}return oTB.call(this,cb,...a)};
        const oGI=CanvasRenderingContext2D.prototype.getImageData;
        CanvasRenderingContext2D.prototype.getImageData=function(...a){const d=oGI.apply(this,a);if(this.canvas&&this.canvas.width<300&&this.canvas.height<300&&WASM){try{WASM.addCanvasNoise(d)}catch(e){}}return d};
        
        // Fonts Fingerprint (через fillText)
        const oFT=CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText=function(...a){const r=oFT.apply(this,a);if(WASM&&this.canvas.width<300&&this.canvas.height<300){try{const d=this.getImageData(0,0,this.canvas.width,this.canvas.height);WASM.addCanvasNoise(d);this.putImageData(d,0,0)}catch(e){}}return r};
        
        // WebGL
        if(typeof WebGLRenderingContext!=='undefined'){
            const oGP=WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter=function(p){
                if(p===0x1F00)return WASM?WASM.getFakeWebGLVendor():'Google Inc.';
                if(p===0x1F01)return WASM?WASM.getFakeWebGLRenderer():'ANGLE (Generic)';
                if(p===0x0D33||p===0x0D2A)return WASM?WASM.getFakeWebGLParam(p):4096+Math.floor(Math.random()*4096);
                return oGP.call(this,p)};
            const oGE=WebGLRenderingContext.prototype.getExtension;
            WebGLRenderingContext.prototype.getExtension=function(n){
                if(n==='WEBGL_debug_renderer_info')return null;
                const e=oGE.call(this,n);
                if(n==='EXT_texture_filter_anisotropic'&&e&&WASM){return new Proxy(e,{get(t,p){if(p==='MAX_TEXTURE_ANISOTROPY_EXT')return WASM.getFakeWebGLParam(0);return Reflect.get(t,p)}})}
                return e};
            // Shader Precision
            const oSP=WebGLRenderingContext.prototype.getShaderPrecisionFormat;
            WebGLRenderingContext.prototype.getShaderPrecisionFormat=function(s,p){if(WASM){try{return WASM.getFakeShaderPrecision()}catch(e){}}return oSP.call(this,s,p)};
        }
        if(typeof WebGL2RenderingContext!=='undefined'){
            const oGP2=WebGL2RenderingContext.prototype.getParameter;
            WebGL2RenderingContext.prototype.getParameter=function(p){
                if(p===0x1F00)return WASM?WASM.getFakeWebGLVendor():'Google Inc.';
                if(p===0x1F01)return WASM?WASM.getFakeWebGLRenderer():'ANGLE (Generic)';
                if(p===0x0D33||p===0x0D2A)return WASM?WASM.getFakeWebGLParam(p):4096+Math.floor(Math.random()*4096);
                return oGP2.call(this,p)};
        }
        
        // Audio
        if(typeof AudioContext!=='undefined'){
            const OA=window.AudioContext||window.webkitAudioContext;
            if(OA){const oCO=OA.prototype.createOscillator;OA.prototype.createOscillator=function(...a){const o=oCO.apply(this,a);const oC=o.connect.bind(o);o.connect=function(d){if(WASM&&d){try{const pr=this.context.createScriptProcessor(256,1,1);pr.onaudioprocess=e=>{const o=e.outputBuffer.getChannelData(0);o.set(e.inputBuffer.getChannelData(0));WASM.addAudioNoise(o,0.0005)};oC(pr);pr.connect(d);return o}catch(e){}}return oC(d)};return o}}
            const oCA=AudioContext.prototype.createAnalyser;AudioContext.prototype.createAnalyser=function(){const a=oCA.call(this);const oGF=a.getFloatFrequencyData;a.getFloatFrequencyData=function(arr){oGF.call(this,arr);if(WASM){try{WASM.addAudioNoise(arr,0.001);return}catch(e){}}for(let i=0;i<arr.length;i++)arr[i]+=(Math.random()-0.5)*0.1};return a}
        }
        
        // Battery
        if(navigator.getBattery){const oGB=navigator.getBattery.bind(navigator);navigator.getBattery=async function(){const r=await oGB();if(WASM){try{const fl=WASM.getFakeBatteryLevel(r.level);return new Proxy(r,{get(t,p){if(p==='level')return fl;if(p==='charging'&&fl===1.0)return true;return Reflect.get(t,p)}})}catch(e){}}return r}}
        
        // Media Devices
        if(navigator.mediaDevices?.enumerateDevices){const oED=navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);navigator.mediaDevices.enumerateDevices=async function(){const d=await oED();if(!WASM)return d;return d.map((d,i)=>({deviceId:d.deviceId.split('').reverse().join(''),groupId:d.groupId.split('').reverse().join(''),kind:d.kind,label:'Device '+(i+1)}))}}
        
        // Navigator Properties
        if(WASM){const hc=Object.getOwnPropertyDescriptor(Navigator.prototype,'hardwareConcurrency');if(hc?.get){const orig=hc.get;Object.defineProperty(Navigator.prototype,'hardwareConcurrency',{get:()=>WASM.getRandomInt(8)+4,configurable:true})}}
        
        // Performance Timing
        if(performance.timing&&WASM){const offset=Math.floor(WASM.getFakeBatteryLevel(0.5)*2000);for(const k of Object.keys(performance.timing)){if(typeof performance.timing[k]==='number'){const orig=performance.timing[k];Object.defineProperty(performance.timing,k,{get:()=>orig+offset,configurable:true})}}}
        
        // Блокировка трекинга
        const oSB=navigator.sendBeacon;if(oSB)navigator.sendBeacon=function(u,d){if(typeof u==='string'&&(u.includes('/fingerprint')||u.includes('/anatskytics')))return false;return oSB.call(this,u,d)};
        const oF2=window.fetch;window.fetch=function(u,...a){if(typeof u==='string'){if(u.includes('protect.wasm'))return oF2.call(this,u,...a);if(u.includes('/fingerprint')||u.includes('/anatskytics'))return Promise.reject(new TypeError('blocked'))}return oF2.call(this,u,...a)};
    })();}catch(e){}
    
    console.log('=== HH Авто-отклик v1.5.0 | WASM: '+(WASM?'✅':'⚠️ JS')+' ===');
    if(!window.location.href.includes('hh.ru'))return;
    
    // ===== ОСНОВНОЙ КЛАСС (полный оригинальный функционал) =====
    class HHAutoResponder{
        constructor(){
            this.coverLetter="Добрый день! Заинтересовала ваша вакансия. Мой опыт соответствует требованиям. Готов(а) к собеседованию. С уважением, [Ваше Имя]";
            this.isRunning=false;this.processedVacancies=new Set();this.stats={success:0,failed:0,skipped:0,total:0};
            this.settings={autoNextPage:true,skipResponded:true,delay:0.5,filterOrganizations:true,autoRememberOrganizations:true,skipCoverLetter:false,autoSelectResume:true,resumeTitleMatching:70};
            this.filteredOrganizations=[];this.autoFilteredOrganizations=[];this.theme='dark';this.resumeSelectedFlag=false;this.settingsCollapsed=true;
            window.hhAutoResponder=this;window.__HH_RESPONDER__=this;this.init()}
        init(){console.log('🎯 Инициализация...');this.loadSettings();this.createInterface();this.setupEventListeners();if(this.settings.resumeTitleMatching>80){this.settings.resumeTitleMatching=70;this.saveSettings()}console.log('✅ Готов!');this.updateStatus('✅ Готов к работе'+(WASM?' [WASM]':' [JS]'))}
        loadSettings(){try{const s=localStorage.getItem('hh-auto-settings');if(s){const p=JSON.parse(s);if(p.coverLetter)this.coverLetter=p.coverLetter;if(p.settings)this.settings={...this.settings,...p.settings};if(p.stats)this.stats={...this.stats,...p.stats};if(p.theme)this.theme=p.theme;if(p.filteredOrganizations)this.filteredOrganizations=p.filteredOrganizations;if(p.autoFilteredOrganizations)this.autoFilteredOrganizations=p.autoFilteredOrganizations}}catch(e){}}
        saveSettings(){try{localStorage.setItem('hh-auto-settings',JSON.stringify({coverLetter:this.coverLetter,settings:this.settings,stats:this.stats,theme:this.theme,filteredOrganizations:this.filteredOrganizations,autoFilteredOrganizations:this.autoFilteredOrganizations}))}catch(e){}}
        wait(ms){return new Promise(r=>setTimeout(r,ms))}
        
        // ===== ИНТЕРФЕЙС =====
        createInterface(){
            document.getElementById('hh-auto-panel')?.remove();document.getElementById('hh-toggle-btn')?.remove();
            const d=this.theme==='dark';const bg=d?'#1e1e1e':'white';const tc=d?'#fff':'#333';const bc=d?'#444':'#4CAF50';const st=d?'#aaa':'#666';const ib=d?'#555':'#ddd';const ig=d?'#2d2d2d':'white';
            // Toggle
            const tb=document.createElement('button');tb.id='hh-toggle-btn';tb.innerHTML='🚀';
            Object.assign(tb.style,{position:'fixed',top:'50px',right:'20px',zIndex:'9999',background:d?'linear-gradient(135deg,#333,#555)':'linear-gradient(135deg,#2196F3,#1976D2)',color:'white',border:'none',borderRadius:'50%',width:'50px',height:'50px',fontSize:'24px',cursor:'pointer',boxShadow:'0 4px 12px rgba(0,0,0,0.2)',display:'flex',alignItems:'center',justifyContent:'center'});
            document.body.appendChild(tb);this.toggleButton=tb;
            // Panel
            const pn=document.createElement('div');pn.id='hh-auto-panel';const ar=this.settingsCollapsed?'▶':'▼';
            Object.assign(pn.style,{position:'fixed',top:'110px',right:'20px',zIndex:'10000',background:bg,color:tc,border:'2px solid '+bc,borderRadius:'10px',padding:'15px',width:'340px',boxShadow:'0 4px 20px rgba(0,0,0,0.15)',fontFamily:'Arial,sans-serif',maxHeight:'80vh',overflowY:'auto'});
            pn.innerHTML=`
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                    <h3 style="margin:0;color:#2196F3;font-size:16px;">HH Авто-отклик v1.5.0 ${WASM?'️':''}</h3>
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span style="font-size:10px;color:${WASM?'#4CAF50':'#FF9800'};">${WASM?'WASM':'JS'}</span>
                        <span id="hh-moon-icon" style="font-size:14px;color:${d?'#4CAF50':'#666'};">☀️</span>
                        <div id="hh-theme-slider" style="position:relative;width:44px;height:20px;cursor:pointer;border-radius:12px;background:${d?'#2d2d2d':'#e0e0e0'};overflow:hidden;"><div id="hh-theme-slider-handle" style="position:absolute;top:2px;left:2px;width:16px;height:16px;background:${d?'#4CAF50':'#FF9800'};border-radius:50%;transition:all 0.3s;transform:${d?'translateX(22px)':'translateX(2px)'};"></div></div>
                        <span id="hh-sun-icon" style="font-size:14px;color:${d?'#aaa':'#FF9800'};">🌙</span>
                        <button id="hh-close-btn" style="background:none;border:none;font-size:20px;cursor:pointer;color:${st};">×</button>
                    </div>
                </div>
                <div id="hh-status" style="background:${d?'#2d2d2d':'#f0f8ff'};color:${tc};padding:10px;border-radius:6px;font-size:13px;min-height:50px;margin-bottom:10px;border:1px solid ${ib};">✅ Готов к работе</div>
                <div style="display:flex;justify-content:space-between;margin-bottom:10px;"><span style="font-size:12px;color:${st};">🔍 Найдено: <b id="hh-count">0</b></span><span id="hh-stats">✅0 ❌0 ⏭️0</span></div>
                <div style="margin-bottom:10px;">
                    <div style="font-weight:bold;font-size:13px;margin-bottom:5px;display:flex;justify-content:space-between;"><span>📝 Сопроводительное письмо:</span><label style="font-size:12px;cursor:pointer;"><input type="checkbox" id="hh-skip-cover-letter" ${this.settings.skipCoverLetter?'checked':''}> 🚫 Не отправлять</label></div>
                    <textarea id="hh-letter" style="width:100%;height:100px;padding:8px;border:1px solid ${ib};border-radius:4px;font-size:13px;resize:vertical;background:${ig};color:${tc};${this.settings.skipCoverLetter?'opacity:0.5;pointer-events:none;':''}">${this.coverLetter}</textarea>
                    <div style="font-size:11px;color:${st};margin-top:3px;display:flex;justify-content:space-between;"><span>* Укажите своё настоящее имя</span><span id="hh-char-count">${this.coverLetter.length}/2000</span></div>
                </div>
                <div style="margin-bottom:10px;">
                    <div id="hh-settings-header" style="font-weight:bold;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:8px;user-select:none;"><span id="hh-settings-arrow">${ar}</span> ⚙️ Настройки</div>
                    <div id="hh-settings-content" style="margin-left:20px;${this.settingsCollapsed?'display:none;':''}">
                        <label style="display:flex;font-size:13px;margin:4px 0;cursor:pointer;"><input type="checkbox" id="hh-auto-next" ${this.settings.autoNextPage?'checked':''} style="margin-right:8px;">Автопереход на следующую страницу</label>
                        <label style="display:flex;font-size:13px;margin:4px 0;cursor:pointer;"><input type="checkbox" id="hh-skip-responded" ${this.settings.skipResponded?'checked':''} style="margin-right:8px;">Пропускать уже откликнутые</label>
                        <label style="display:flex;font-size:13px;margin:4px 0;cursor:pointer;"><input type="checkbox" id="hh-filter-organizations" ${this.settings.filterOrganizations?'checked':''} style="margin-right:8px;">Фильтровать организации</label>
                        <label style="display:flex;font-size:13px;margin:4px 0;cursor:pointer;"><input type="checkbox" id="hh-auto-remember" ${this.settings.autoRememberOrganizations?'checked':''} style="margin-right:8px;"><strong>Автодобавление в фильтр</strong></label>
                        <label style="display:flex;font-size:13px;margin:4px 0;cursor:pointer;"><input type="checkbox" id="hh-auto-select-resume" ${this.settings.autoSelectResume?'checked':''} style="margin-right:8px;"><strong>🎯 Автовыбор резюме</strong></label>
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:5px;"><span>Порог совпадения:</span><input type="range" id="hh-resume-matching" min="0" max="100" step="5" value="${this.settings.resumeTitleMatching}" style="width:100px;"><span id="hh-matching-value">${this.settings.resumeTitleMatching}%</span></div>
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;"><span>Задержка (сек):</span><input type="number" id="hh-delay" min="0.3" max="5" step="0.1" value="${this.settings.delay}" style="width:50px;padding:4px;border:1px solid ${ib};border-radius:4px;background:${ig};color:${tc};text-align:center;"></div>
                    </div>
                </div>
                <div style="margin-bottom:10px;">
                    <div style="font-weight:bold;font-size:13px;margin-bottom:5px;">🚫 Фильтр организаций (ручной):</div>
                    <textarea id="hh-filter-text" placeholder="Введите названия организаций через запятую&#10;Пример: Яндекс, Google" style="width:100%;height:80px;padding:8px;border:1px solid ${ib};border-radius:4px;font-size:13px;resize:vertical;background:${ig};color:${tc};">${this.filteredOrganizations.join(', ')}</textarea>
                </div>
                <div style="display:flex;flex-direction:column;gap:8px;margin:15px 0 10px;">
                    <button id="hh-start" style="padding:12px;background:#4CAF50;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:bold;">▶️ НАЧАТЬ АВТО-ОТКЛИК</button>
                    <button id="hh-test" style="padding:10px;background:#FF9800;color:white;border:none;border-radius:6px;cursor:pointer;">🧪 Тест на 1 вакансию</button>
                    <button id="hh-stop" style="padding:12px;background:#f44336;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:bold;display:none;">⏹️ ОСТАНОВИТЬ</button>
                </div>
                <div style="display:flex;gap:8px;margin-bottom:10px;">
                    <button id="hh-analyze" style="flex:1;padding:8px;background:#2196F3;color:white;border:none;border-radius:6px;cursor:pointer;">📊 Анализ</button>
                    <button id="hh-test-filter" style="flex:1;padding:8px;background:#9C27B0;color:white;border:none;border-radius:6px;cursor:pointer;">🔍 Тест фильтра</button>
                    <button id="hh-show-auto-filter" style="flex:1;padding:8px;background:#00BCD4;color:white;border:none;border-radius:6px;cursor:pointer;">🤖 Автофильтр</button>
                </div>
                <div style="display:flex;gap:8px;margin-bottom:10px;">
                    <button id="hh-clear" style="flex:1;padding:8px;background:#607D8B;color:white;border:none;border-radius:6px;cursor:pointer;">🗑️ Очистить статистику</button>
                    <button id="hh-clear-auto-filter" style="flex:1;padding:8px;background:#f44336;color:white;border:none;border-radius:6px;cursor:pointer;">🧹 Очистить автофильтр</button>
                </div>
                <div style="text-align:center;font-size:10px;color:${st};border-top:1px solid ${ib};padding-top:10px;margin-top:15px;">By ALEX 🛡️ Tech Guard | WASM ${WASM?'✅':'⚠️'} | MAX PROTECTION</div>`;
            document.body.appendChild(pn);this.panel=pn}
        
        setupEventListeners(){
            this.toggleButton.addEventListener('click',()=>{this.panel.style.display=this.panel.style.display==='none'?'block':'none'});
            document.getElementById('hh-close-btn').addEventListener('click',()=>{this.panel.style.display='none'});
            document.getElementById('hh-settings-header')?.addEventListener('click',()=>this.toggleSettings());
            document.getElementById('hh-theme-slider')?.addEventListener('click',()=>{this.toggleTheme();this.createInterface()});
            document.getElementById('hh-start').addEventListener('click',()=>this.startAutoProcess());
            document.getElementById('hh-test').addEventListener('click',()=>this.testProcess());
            document.getElementById('hh-stop').addEventListener('click',()=>this.stopAutoProcess());
            document.getElementById('hh-analyze').addEventListener('click',()=>this.analyzePage());
            document.getElementById('hh-test-filter').addEventListener('click',()=>this.testFilter());
            document.getElementById('hh-show-auto-filter').addEventListener('click',()=>this.showAutoFilter());
            document.getElementById('hh-clear').addEventListener('click',()=>this.clearHistory());
            document.getElementById('hh-clear-auto-filter').addEventListener('click',()=>this.clearAutoFilter());
            document.getElementById('hh-skip-cover-letter').addEventListener('change',e=>{this.settings.skipCoverLetter=e.target.checked;this.saveSettings();const ta=document.getElementById('hh-letter');if(ta){ta.style.opacity=e.target.checked?'0.5':'1';ta.style.pointerEvents=e.target.checked?'none':'auto'}this.updateStatus(e.target.checked?'📝 Письмо ОТКЛЮЧЕНО':'📝 Письмо ВКЛЮЧЕНО')});
            document.getElementById('hh-auto-select-resume').addEventListener('change',e=>{this.settings.autoSelectResume=e.target.checked;this.saveSettings();this.updateStatus(e.target.checked?'🎯 Автовыбор ВКЛЮЧЕН':'🎯 Автовыбор ВЫКЛЮЧЕН')});
            document.getElementById('hh-resume-matching').addEventListener('input',e=>{this.settings.resumeTitleMatching=parseInt(e.target.value);document.getElementById('hh-matching-value').textContent=this.settings.resumeTitleMatching+'%';this.saveSettings()});
            document.getElementById('hh-auto-remember').addEventListener('change',e=>{this.settings.autoRememberOrganizations=e.target.checked;this.saveSettings();this.updateStatus(e.target.checked?'✅ АВТОфильтр ВКЛЮЧЕН':'⭕ АВТОфильтр выключен')});
            document.getElementById('hh-letter').addEventListener('input',e=>{this.coverLetter=e.target.value;document.getElementById('hh-char-count').textContent=e.target.value.length+'/2000';this.saveSettings()});
            document.getElementById('hh-auto-next').addEventListener('change',e=>{this.settings.autoNextPage=e.target.checked;this.saveSettings()});
            document.getElementById('hh-skip-responded').addEventListener('change',e=>{this.settings.skipResponded=e.target.checked;this.saveSettings()});
            document.getElementById('hh-filter-organizations').addEventListener('change',e=>{this.settings.filterOrganizations=e.target.checked;this.saveSettings()});
            document.getElementById('hh-delay').addEventListener('change',e=>{this.settings.delay=parseFloat(e.target.value)||0.5;this.saveSettings()});
            document.getElementById('hh-filter-text').addEventListener('input',e=>{this.filteredOrganizations=e.target.value.split(',').map(o=>o.trim()).filter(o=>o);this.saveSettings()});
            setInterval(()=>this.updateCount(),5000)}
        
        toggleSettings(){this.settingsCollapsed=!this.settingsCollapsed;const c=document.getElementById('hh-settings-content'),a=document.getElementById('hh-settings-arrow');if(c)c.style.display=this.settingsCollapsed?'none':'block';if(a)a.textContent=this.settingsCollapsed?'▶':'▼'}
        toggleTheme(){this.theme=this.theme==='dark'?'light':'dark';this.saveSettings();this.updateStatus('✅ Тема изменена на '+(this.theme==='dark'?'тёмную':'светлую'))}
        getOrganizationNameFromCard(b){const c=b.closest('[data-qa="vacancy-serp__vacancy"]')||b.closest('.vacancy-serp-item')||b.closest('[role="button"]');if(!c)return null;const e=c.querySelector('[data-qa="vacancy-serp__vacancy-employer"]')||c.querySelector('[data-qa="vacancy-serp__vacancy-employer-text"]')||c.querySelector('a[href*="/employer/"]');return e?(e.textContent||'').replace(/\u00A0/g,' ').replace(/\s+/g,' ').trim():null}
        isFilteredOrganization(b){if(!this.settings.filterOrganizations)return false;const o=this.getOrganizationNameFromCard(b);if(!o)return false;const ol=o.toLowerCase();for(const f of this.filteredOrganizations){if(f&&f.trim()&&(ol.includes(f.toLowerCase())||f.toLowerCase().includes(ol))){console.log('🚫 РУЧНОЙ ФИЛЬТР: "'+o+'" заблокирована');return true}}if(this.settings.autoRememberOrganizations){for(const f of this.autoFilteredOrganizations){if(f&&f.trim()&&(ol.includes(f.toLowerCase())||f.toLowerCase().includes(ol))){console.log('🚫 АВТОФИЛЬТР: "'+o+'" заблокирована');return true}}}return false}
        addToAutoFilter(o){if(!o||!this.settings.autoRememberOrganizations)return false;const ot=o.trim();if(!ot)return false;if(this.autoFilteredOrganizations.some(x=>x.toLowerCase()===ot.toLowerCase()))return false;this.autoFilteredOrganizations.push(ot);this.saveSettings();console.log('🤖 ДОБАВЛЕНО В АВТОФИЛЬТР: "'+ot+'" (всего: '+this.autoFilteredOrganizations.length+')');return true}
        showAutoFilter(){if(!this.autoFilteredOrganizations.length){this.updateStatus('🤖 Автофильтр пуст');return}this.updateStatus('🤖 АВТОФИЛЬТР ('+this.autoFilteredOrganizations.length+'):\n'+this.autoFilteredOrganizations.map((o,i)=>(i+1)+'. '+o).join('\n'))}
        clearAutoFilter(){if(!this.autoFilteredOrganizations.length)return;if(confirm('Очистить автофильтр ('+this.autoFilteredOrganizations.length+')?')){this.autoFilteredOrganizations=[];this.saveSettings();this.updateStatus('🧹 Автофильтр очищен')}}
        clearHistory(){this.processedVacancies.clear();this.stats={success:0,failed:0,skipped:0,total:0};this.updateStatsDisplay();this.updateStatus('🗑️ Статистика очищена')}
        analyzePage(){const a=document.querySelectorAll('[data-qa="vacancy-serp__vacancy_response"]').length;this.updateStatus('📊 АНАЛИЗ:\nВсего: '+a+'\nДоступно: '+this.getAvailableButtons().length+'\nУспешно: '+this.stats.success+'\nОшибок: '+this.stats.failed+'\nПропущено: '+this.stats.skipped)}
        testFilter(){const bt=document.querySelectorAll('[data-qa="vacancy-serp__vacancy_response"]');let r='🔍 ТЕСТ ФИЛЬТРА:\n\n',f=0;bt.forEach((b,i)=>{const o=this.getOrganizationNameFromCard(b);if(this.isFilteredOrganization(b))f++;r+=(i+1)+'. '+(o||'???')+' - '+(this.isFilteredOrganization(b)?'🚫':'✅')+'\n'});r+='\n📊 '+f+'/'+bt.length;this.updateStatus(r)}
        updateStatus(m){const e=document.getElementById('hh-status');if(e)e.textContent=m;console.log('Статус:',m)}
        updateStatsDisplay(){const e=document.getElementById('hh-stats');if(e)e.textContent='✅'+this.stats.success+' ❌'+this.stats.failed+' ⏭️'+this.stats.skipped;this.saveSettings()}
        updateCount(){const e=document.getElementById('hh-count');if(e)e.textContent=this.getAvailableButtons().length}
        updateControlButtons(){const s=document.getElementById('hh-start'),t=document.getElementById('hh-test'),p=document.getElementById('hh-stop');if(this.isRunning){if(s)s.style.display='none';if(t)t.style.display='none';if(p)p.style.display='block';this.toggleButton.style.background='linear-gradient(135deg,#f44336,#d32f2f)';this.toggleButton.textContent='⏹️'}else{const d=this.theme==='dark';if(s)s.style.display='block';if(t)t.style.display='block';if(p)p.style.display='none';this.toggleButton.style.background=d?'linear-gradient(135deg,#333,#555)':'linear-gradient(135deg,#2196F3,#1976D2)';this.toggleButton.textContent='🚀'}}
        getAvailableButtons(){return Array.from(document.querySelectorAll('[data-qa="vacancy-serp__vacancy_response"]')).filter(b=>{if(!b.offsetParent||b.style.display==='none')return false;if(this.isFilteredOrganization(b)){console.log('⏭️ Пропущена (фильтр)');return false}if(this.settings.skipResponded){const p=b.closest('.vacancy-serp-item');if(p&&((p.innerText||'').includes('Вы откликнулись')||p.querySelector('[data-qa="vacancy-serp__vacancy_responded"]')))return false}return true})}
        async safeClick(b){try{b.scrollIntoView({behavior:'smooth',block:'center'});await this.wait(300);b.click();await this.wait(500);return true}catch(e){return false}}
        async closeChatIfOpened(){try{const b=document.querySelector('[data-qa="chatik-close-chatik"]');if(b?.offsetParent){b.click();await this.wait(500);return true}}catch(e){}return false}
        async checkAndCloseDirectResponseModal(o){let d=false;const m1=document.querySelector('[role="alertdialog"][aria-modal="true"]');if(m1){const t=m1.querySelector('[data-qa="title"]');if(t&&t.textContent.includes('прямым откликом'))d=true}if(!d){const m2=document.querySelector('[data-qa="magritte-alert-title"]');if(m2&&m2.textContent.includes('прямым откликом'))d=true}if(d){console.log('🚫 Прямой отклик для "'+o+'" - пропускаем');if(o&&this.settings.autoRememberOrganizations)this.addToAutoFilter(o);this.stats.skipped++;this.updateStatsDisplay();const cb=document.querySelector('[data-qa="vacancy-response-link-advertising-cancel"]')||document.querySelector('[aria-label="Закрыть"]');if(cb){cb.click();await this.wait(500);return true}document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',keyCode:27,bubbles:true}));await this.wait(500);return true}return false}
        getVacancyTitleFromModal(){for(const s of['[data-qa="title-description"] .magritte-text_style-secondary','[data-qa="title-description"] .magritte-text','.magritte-modal-content [data-qa="title-description"]','[role="dialog"] [data-qa="title-description"]']){const e=document.querySelector(s);if(e){const t=e.textContent.trim();if(t&&t.length>2&&t.length<200&&!t.includes('Отклик'))return t}}return null}
        async selectBestResume(vt){if(!this.settings.autoSelectResume||!vt)return false;const rc=document.querySelector('[data-qa="resume-title"]');if(!rc)return false;const cl=rc.closest('[role="button"],[tabindex="0"]');if(!cl)return false;cl.click();await this.wait(600);const dd=document.querySelector('[role="listbox"]');if(!dd||!dd.offsetParent){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return false}await this.wait(500);const it=document.querySelectorAll('label[role="option"][data-interactive="true"]');if(it.length<=1){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return false}let best=null,bs=0;const vl=vt.toLowerCase();for(const i of it){const te=i.querySelector('[data-qa="cell-text-content"]');if(!te)continue;const t=te.textContent.trim().toLowerCase();let s=0;if(t===vl)s=100;else if(vl.includes(t))s=95;else if(t.includes(vl))s=90;else{const sw=['прием','отправка','тмц','работа','сотрудник','специалист','помощник','и','с','по','на','в','для'];const vw=vl.split(/[\s,()\-/]+/).filter(w=>w.length>2&&!sw.includes(w));const rw=t.split(/[\s,()\-/]+/).filter(w=>w.length>2&&!sw.includes(w));let m=0;for(const v of vw){for(const r of rw){if(v===r||r.includes(v)||v.includes(r)){m++;break}}}if(vw.length>0)s=(m/vw.length)*100}if(s>bs){bs=s;best=i}}if(best&&bs>=this.settings.resumeTitleMatching){best.click();await this.wait(500)}document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await this.wait(300);return best&&bs>=this.settings.resumeTitleMatching}
        async submitResponse(){const b=document.querySelector('[data-qa="vacancy-response-submit-popup"]');if(!b)return false;if(b.hasAttribute('disabled'))await this.wait(1000);b.click();await this.wait(1200);return true}
        async closeModal(){const b=document.querySelector('[data-qa="vacancy-response-popup-close"]')||document.querySelector('[aria-label="Закрыть"]');if(b){b.click();await this.wait(300)}}
        async processResponse(o){console.log('🔄 Обработка отклика...');if(await this.checkAndCloseDirectResponseModal(o))return false;for(let i=0;i<3;i++){await this.closeChatIfOpened();await this.wait(300)}await this.wait(500);if(this.settings.autoSelectResume&&!this.resumeSelectedFlag){const vt=this.getVacancyTitleFromModal();if(vt){await this.selectBestResume(vt);this.resumeSelectedFlag=true;await this.wait(500)}}const ta=document.querySelector('[data-qa="vacancy-response-popup-form-letter-input"]');if(ta){if(!this.settings.skipCoverLetter){const ns=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')?.set;if(ns){ns.call(ta,this.coverLetter);ta.dispatchEvent(new Event('input',{bubbles:true}))}else{ta.value=this.coverLetter;ta.dispatchEvent(new Event('input',{bubbles:true}))}await this.wait(500)}return await this.submitResponse()}const al=document.querySelector('[data-qa="add-cover-letter"]');if(al&&!this.settings.skipCoverLetter){al.click();await this.wait(800);return await this.processResponse(o)}const rl=document.querySelector('[data-qa="relocation-warning-confirm"]')||Array.from(document.querySelectorAll('button')).find(b=>b.textContent?.includes('Все равно откликнуться'));if(rl){rl.click();await this.wait(800);return await this.processResponse(o)}return await this.submitResponse()}
        async processSingleVacancy(b,i,t){if(!this.isRunning)return false;this.resumeSelectedFlag=false;const o=this.getOrganizationNameFromCard(b);this.updateStatus('🎯 '+(i+1)+'/'+t+': '+(o||'Обработка...'));if(!(await this.safeClick(b))){this.stats.failed++;this.updateStatsDisplay();return false}const ok=await this.processResponse(o);if(ok){if(o&&this.settings.autoRememberOrganizations)this.addToAutoFilter(o);this.stats.success++;this.updateStatus('✅ '+(i+1)+'/'+t+': отправлено!')}else{this.stats.failed++}this.updateStatsDisplay();await this.closeModal();return ok}
        async startAutoProcess(){if(this.isRunning)return;this.isRunning=true;this.updateControlButtons();this.updateStatus('🚀 Запуск...');try{while(this.isRunning){const bt=this.getAvailableButtons();if(!bt.length){this.updateStatus('✅ Все обработаны');if(this.settings.autoNextPage){const n=document.querySelector('[data-qa="pager-next"]');if(n){this.updateStatus('➡️ След. страница...');n.click();await this.wait(2000);continue}}this.updateStatus('🎉 Завершено! ✅'+this.stats.success+' ❌'+this.stats.failed+' ⏭️'+this.stats.skipped);break}for(let i=0;i<bt.length&&this.isRunning;i++){await this.processSingleVacancy(bt[i],i,bt.length);if(i<bt.length-1&&this.isRunning)await this.wait(this.settings.delay*1000)}await this.wait(800)}}catch(e){console.error(e)}this.stopAutoProcess()}
        stopAutoProcess(){this.isRunning=false;this.updateControlButtons();this.updateStatus('⏹️ Остановлено')}
        async testProcess(){const bt=this.getAvailableButtons();if(!bt.length){this.updateStatus('❌ Нет вакансий');return}this.updateStatus('🧪 Тест...');this.isRunning=true;await this.processSingleVacancy(bt[0],0,1);this.isRunning=false;this.updateControlButtons();this.updateStatus('✅ Тест завершён')}
    }
    
    try{chrome.runtime.onMessage.addListener((r,s,res)=>{if(r.action==='checkConnection')res({connected:!!window.hhAutoResponder});return true})}catch(e){}
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>new HHAutoResponder(),800));
    else setTimeout(()=>new HHAutoResponder(),800);
})();