let currentLine = '', isCooling = false, currentWorkbook = null, currentFileName = '';

function showApp() { 
    document.getElementById('home-view').classList.add('hidden'); 
    document.getElementById('app-view').classList.remove('hidden'); 
}

function goBack() { location.reload(); }

// [수정] 분소 섹션 토글 함수
function toggleBranch(id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('show-details');
}

document.getElementById('excelFile').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if(!file) return;
    currentFileName = file.name;
    currentLine = currentFileName.includes("일보") ? 'line2' : 'line1';
    const reader = new FileReader();
    reader.onload = (evt) => {
        currentWorkbook = XLSX.read(evt.target.result, { type: 'binary', cellDates: true });
        runIntegratedAnalysis(currentWorkbook);
        document.getElementById('upload-container').classList.add('minimized');
    };
    reader.readAsBinaryString(file);
});

function runIntegratedAnalysis(wb) {
    let dateKey = currentFileName.replace(/[^0-9]/g, "").substring(0, 8);
    let m = parseInt(dateKey.substring(4, 6)), d = parseInt(dateKey.substring(6, 8));
    if(isNaN(m) || m === 0) {
        const ts = wb.Sheets[wb.SheetNames[0]];
        const dv = ts['C2'] ? ts['C2'].v : null;
        if(dv instanceof Date) { m = dv.getMonth()+1; d = dv.getDate(); }
    }
    isCooling = (m === 7 || m === 8 || (m === 9 && d <= 20));
    
    const banner = document.getElementById('season-banner');
    banner.style.display = 'block';
    banner.innerHTML = `적용 기준: <strong>${isCooling ? '❄️ 냉방 시즌' : '☀️ 비냉방 시즌'}</strong> (${m || '?'}월 ${d || '?'}일 기준)`;

    const hvacSheet = wb.Sheets[wb.SheetNames.find(n => n.includes("장비")) || wb.SheetNames[0]];
    const hvacData = (currentLine === 'line1') ? getL1HVAC(hvacSheet) : getL2HVAC(hvacSheet);
    const airSheet = wb.Sheets[wb.SheetNames.find(n => n.includes("공기청정기")) || wb.SheetNames[0]];
    const airData = getAirPurifierData(airSheet);

    renderAll(hvacData, airData);
}

// 판정 로직 (기존 유지)
function analyze(val, target, station, type, isAir = false) {
    if (station === "문양") return { s: 'ok', c: '' };
    const h = parseH(val);
    const diff = Math.abs(h - target);
    if (isAir) {
        if (diff >= 5) return { s: 'critical', c: 'critical-val' };
        if (h >= 15 && h <= 18) return { s: 'ok', c: '' };
        return { s: 'warning', c: 'bad-val' };
    }
    if (!isCooling) {
        if (type === 'supply') {
            if (diff >= 5) return { s: 'critical', c: 'critical-val' };
            if (h >= 15 && h <= 18) return { s: 'ok', c: '' };
            return { s: 'warning', c: 'bad-val' };
        } else {
            if (h <= (10/60)) return { s: 'critical', c: 'critical-val' };
            return (h <= 0.5) ? { s: 'warning', c: 'bad-val' } : { s: 'ok', c: '' };
        }
    } else {
        const typeNum = CONFIG.STATION_MAP_COOLING[station] === "type1" ? 1 : 2;
        if (type === 'supply') {
            if (diff >= 4) return { s: 'critical', c: 'critical-val' };
            const isNorm = (typeNum === 1) ? (h >= 10 && h <= 13) : (h >= 7.5 && h <= 10.5);
            return isNorm ? { s: 'ok', c: '' } : { s: 'warning', c: 'bad-val' };
        } else { return (h <= (10/60)) ? { s: 'critical', c: 'critical-val' } : { s: 'ok', c: '' }; }
    }
}

function renderAll(hvac, air) {
    const hLabels = currentLine === 'line1' ? ["시급", "시배", "종급", "종배"] : ["시급", "시상", "시하", "종급", "종상", "종하"];
    const b = CONFIG.BRANCHES[currentLine];

    // 1. 요약 렌더링 (심각 항목 상세 현시 + 명칭 수정)
    const hCri = hvac.filter(d => d.isCri);
    const aCri = air.filter(d => d.isCri);
    const buildSum = (br) => {
        const cH = hCri.filter(d => br.stations.includes(d.name));
        const cA = aCri.filter(d => br.stations.includes(d.name));
        const isOk = (cH.length === 0 && cA.length === 0);
        let h = `<div class="summary-card ${isOk?'ok':''}"><h3 class="summary-title">📍 ${br.name}</h3>`;
        if (isOk) h += `<div style="color:var(--success); font-weight:700;">✅ 모든 장비 정상</div>`;
        else {
            if (cH.length > 0) {
                h += `<span class="summary-group-label">[승강장 공조기]</span><div class="summary-badge-container">`;
                cH.forEach(d => { d.res.forEach((r, i) => { if (r.s === 'critical') h += `<span class="badge badge-danger">${d.name} ${hLabels[i]} (${formatToHMS(d.raw[i])})</span>`; }); });
                h += `</div>`;
            }
            if (cA.length > 0) {
                h += `<span class="summary-group-label">[공기청정기]</span><div class="summary-badge-container">`;
                cA.forEach(d => { d.units.forEach(u => { if (u.res.s === 'critical') h += `<span class="badge badge-danger">${d.name} ${u.label} (${formatToHMS(u.val)})</span>`; }); });
                h += `</div>`;
            }
        }
        return h + `</div>`;
    };
    document.getElementById('summary-area').innerHTML = `<h2 class="summary-section-title">⚠️ 통합 이상 내역 요약</h2><div class="summary-area-grid">${buildSum(b.left)}${buildSum(b.right)}</div>`;

    // 2. 상세 결과 (수평 정렬 + 개별 토글)
    const lH = hvac.filter(d => b.left.stations.includes(d.name)), rH = hvac.filter(d => b.right.stations.includes(d.name));
    const lA = air.filter(d => b.left.stations.includes(d.name)), rA = air.filter(d => b.right.stations.includes(d.name));

    document.getElementById('full-list-area').innerHTML = `
        <h2 class="section-title">📊 승강장 공조기 분석 결과</h2>
        <div class="equipment-row">
            <div id="left-hvac-sec" class="branch-section">
                <div class="branch-label" onclick="toggleBranch('left-hvac-sec')">${b.left.name}</div>
                ${buildHVACTable(lH)}
            </div>
            <div id="right-hvac-sec" class="branch-section">
                <div class="branch-label" onclick="toggleBranch('right-hvac-sec')">${b.right.name}</div>
                ${buildHVACTable(rH)}
            </div>
        </div>
        <h2 class="section-title">🌬️ 공기청정기 분석 결과</h2>
        <div class="equipment-row">
            <div id="left-air-sec" class="branch-section">
                <div class="branch-label" onclick="toggleBranch('left-air-sec')">${b.left.name}</div>
                ${buildAirTable(lA)}
            </div>
            <div id="right-air-sec" class="branch-section">
                <div class="branch-label" onclick="toggleBranch('right-air-sec')">${b.right.name}</div>
                ${buildAirTable(rA)}
            </div>
        </div>`;
}

function buildHVACTable(data) {
    const hds = currentLine === 'line1' ? ['역사', '시급', '시배', '종급', '종배', '판정'] : ['역사', '시급', '시상', '시하', '종급', '종상', '종하', '판정'];
    let h = `<div class="table-wrapper"><table><thead><tr>${hds.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>`;
    data.forEach(d => {
        h += `<tr><td class="st-name">${d.name}</td>`;
        d.raw.forEach((v, i) => { 
            const st = d.res[i].s;
            h += `<td class="${d.res[i].c}"><span class="badge badge-${st==='ok'?'success':(st==='warning'?'warning':'danger')} badge-in-cell">${st==='ok'?'정상':'이상'}</span><div class="time-val">${formatToHMS(v)}</div></td>`; 
        });
        h += `<td><span class="badge badge-${d.isCri?'danger':(d.isAb?'warning':'success')}">${d.isCri?'심각':(d.isAb?'이상':'정상')}</span></td></tr>`;
    });
    return h + `</tbody></table></div>`;
}

function buildAirTable(data) {
    let h = `<div class="table-wrapper"><table><thead><tr><th style="width:90px;">역사</th><th>장비 상세 현황</th></tr></thead><tbody>`;
    data.forEach(d => {
        h += `<tr><td class="st-name">${d.name}</td><td><div class="units-grid">`;
        d.units.forEach(u => { h += `<div class="unit-box ${u.res.c}"><strong>${u.label}</strong><span class="unit-time">${formatToHMS(u.val)}</span><span class="badge-in-cell badge badge-${u.res.s==='ok'?'success':'danger'}" style="margin-top:4px; font-size:0.65rem; padding:2px 6px;">${u.res.s==='ok'?'정상':'이상'}</span></div>`; });
        h += `</div></td></tr>`;
    });
    return h + `</tbody></table></div>`;
}

// 유틸리티 (기존 유지)
function getCV(s, r, c) { const cell = s[XLSX.utils.encode_cell({r:r, c:c})]; return cell ? cell.w || cell.v : ""; }
function parseH(v) { if(!v) return 0; if(typeof v === 'number') return v * 24; const p = String(v).split(':'); return p.length < 2 ? parseFloat(v)||0 : parseInt(p[0]) + parseInt(p[1])/60; }
function cleanText(s) { return String(s || "").replace(/\s+/g, ""); }
function formatToHMS(v) { if(!v||v==='0'||v===0||v==='-') return "0:00:00"; let ts; if(typeof v==='number') ts=Math.round(v*24*3600); else if(typeof v==='string'&&v.includes(':')){ const p=v.split(':'); ts=(parseInt(p[0])||0)*3600+(parseInt(p[1])||0)*60+(parseInt(p[2])||0); } else { const n=parseFloat(v); if(isNaN(n)) return "0:00:00"; ts=Math.round(n*3600); } const h=Math.floor(ts/3600), m=Math.floor((ts%3600)/60), s=ts%60; return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
function getL1HVAC(sheet) { const data = []; const map = isCooling ? CONFIG.STATION_MAP_COOLING : CONFIG.STATION_MAP_NORMAL; const rules = isCooling ? CONFIG.COOLING_TARGETS : CONFIG.NORMAL_TARGETS; [4, 5].forEach(col => { let n = (col === 4) ? "설화명곡" : "화원"; data.push(getL1HVAC_Obj(sheet, n, col, 81, 82, 89, 90, map, rules)); }); const range = XLSX.utils.decode_range(sheet['!ref']); for (let c = 4; c <= range.e.c; c++) { let n = cleanText(getCV(sheet, 0, c)); if(!n || ["합계","명곡","화원"].includes(n)) continue; data.push(getL1HVAC_Obj(sheet, n, c, 5, 6, 13, 14, map, rules)); } return data; }
function getL2HVAC(sheet) { const range = XLSX.utils.decode_range(sheet['!ref']); const data = []; let cur = null; const map = isCooling ? CONFIG.STATION_MAP_COOLING : CONFIG.STATION_MAP_NORMAL; const rules = isCooling ? CONFIG.COOLING_TARGETS : CONFIG.NORMAL_TARGETS; for (let r = 0; r <= range.e.r; r++) { let label = cleanText(getCV(sheet, r, 0) + getCV(sheet, r, 1) + getCV(sheet, r, 2)); let val = getCV(sheet, r, 4); const found = CONFIG.LINE2_STATIONS.find(st => label.includes(st) && (label.includes("가동") || label.length < 15)); if (found) { if (cur) data.push(formatL2HVAC(cur, map, rules)); cur = { name: found, ls:null, lue:null, lle:null, rs:null, rue:null, rle:null }; continue; } if (cur && label.includes("승강")) { const isL = label.includes("좌") || label.includes("시점"); if (label.includes("급기")) { if(isL) cur.ls = val; else cur.rs = val; } else if (label.includes("배기")) { if (label.includes("상부") || (!label.includes("상부") && !label.includes("하부"))) { if(isL) cur.lue = val; else cur.rue = val; } else if (label.includes("하부")) { if(isL) cur.lle = val; else cur.rle = val; } } } } if (cur) data.push(formatL2HVAC(cur, map, rules)); return data; }
function getAirPurifierData(sheet) { const data = []; const target = CONFIG.AIR_PURIFIER_STD; if (currentLine === 'line1') { const ext = [ {n: "화원", r: 179, c: 4}, {n: "설화명곡", r: 179, c: 5} ]; ext.forEach(st => { let v = getCV(sheet, st.r, st.c); let res = analyze(v, target, st.n, 'supply', true); data.push({ name: st.n, units: [{ label: "01호기", val: v || "0", res }], isAb: res.s !== 'ok', isCri: res.s === 'critical' }); }); CONFIG.L1_STATIONS_PURIFIER.forEach((name, idx) => { let v = getCV(sheet, 75, 4+idx); let res = analyze(v, target, name, 'supply', true); data.push({ name: name, units: [{ label: "01호기", val: v || "0", res }], isAb: res.s !== 'ok', isCri: res.s === 'critical' }); }); } else { const range = XLSX.utils.decode_range(sheet['!ref']); CONFIG.LINE2_STATIONS.forEach(stName => { let foundRow = -1; for (let r = 0; r <= range.e.r; r++) { if (cleanText(getCV(sheet, r, 0) + getCV(sheet, r, 1)).includes(stName)) { foundRow = r; break; } } if (foundRow !== -1) { const stObj = { name: stName, units: [], isAb: false, isCri: false }; for (let i = 5; i <= 30; i++) { [4, 9].forEach(colIdx => { let v = getCV(sheet, foundRow + i, colIdx); let uName = cleanText(getCV(sheet, foundRow + i, colIdx - 3)).replace(/\(.*\)/g, ""); if (v && v !== '0' && v !== '-') { let res = analyze(v, target, stName, 'supply', true); stObj.units.push({ label: (uName || (i-4)) + "호기", val:v, res }); if (res.s !== 'ok') stObj.isAb = true; if (res.s === 'critical') stObj.isCri = true; } }); } stObj.units.sort((a, b) => a.label.localeCompare(b.label, undefined, {numeric: true})); if (stObj.units.length > 0) data.push(stObj); } }); } return data; }
function getL1HVAC_Obj(sheet, n, c, ls, le, rs, re, map, rules) { let sk = (n === "반월당" && currentLine === 'line1') ? "반월당(1호선)" : n; const ty = map[sk] || "default"; const tg = rules[ty] || (isCooling ? rules["type3"] : rules["type4"]); const raw = [getCV(sheet, ls, c), getCV(sheet, le, c), getCV(sheet, rs, c), getCV(sheet, re, c)]; const res = [analyze(raw[0], tg.s, n, 'supply'), analyze(raw[1], tg.e, n, 'exhaust'), analyze(raw[2], tg.s, n, 'supply'), analyze(raw[3], tg.e, n, 'exhaust')]; return { name:n, raw, res, isAb: res.some(r => r
