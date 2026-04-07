let currentLine = '', isCooling = false, currentWorkbook = null, currentFileName = '', ventSeason = '';

function goBack() { location.reload(); }

function toggleDetail(btn, targetId, labelName) {
    const target = document.getElementById(targetId);
    if (!target) return;
    const isActive = target.classList.contains('active');
    target.classList.toggle('active');
    btn.classList.toggle('active');
    btn.innerHTML = isActive ? `[${labelName}] 상세보기 ▾` : `[${labelName}] 닫기 ▴`;
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
    if ([3, 4, 5, 10].includes(m)) ventSeason = '중간기';
    else if ([6, 7, 8, 9].includes(m)) ventSeason = '하절기';
    else ventSeason = '동절기';

    const banner = document.getElementById('season-banner');
    banner.style.display = 'block';
    banner.innerHTML = `공조: <strong>${isCooling ? '❄️ 냉방' : '☀️ 비냉방'}</strong> | 환기: <strong>${ventSeason}</strong> (${m}월 ${d}일)`;

    const hvacSheet = wb.Sheets[wb.SheetNames.find(n => n.includes("장비")) || wb.SheetNames[0]];
    const airSheet = wb.Sheets[wb.SheetNames.find(n => n.includes("공기청정기")) || wb.SheetNames[0]];
    
    const hvacData = (currentLine === 'line1') ? getL1HVAC(hvacSheet) : getL2HVAC(hvacSheet);
    const airData = getAirPurifierData(airSheet);
    const ventData = (currentLine === 'line1') ? getL1Vent(hvacSheet) : getL2Vent(hvacSheet);

    renderAll(hvacData, airData, ventData);
}

function analyze(val, target, station, type) {
    if (val === "N/A") return { s: 'none', c: '' };
    if (station === "문양") return { s: 'ok', c: '' };
    const h = parseH(val);
    const diff = Math.abs(h - target);

    if (!isCooling) {
        if (type === 'supply') {
            if (diff >= 5) return { s: 'critical', c: 'critical-val' };
            return (h >= 15 && h <= 18) ? { s: 'ok', c: '' } : { s: 'warning', c: 'bad-val' };
        } else {
            if (h <= (10/60)) return { s: 'critical', c: 'critical-val' };
            return (h <= 0.5) ? { s: 'warning', c: 'bad-val' } : { s: 'ok', c: '' };
        }
    } else {
        const map = CONFIG.STATION_MAP_COOLING;
        const typeNum = (map[station] === "type1") ? 1 : 2;
        if (type === 'supply') {
            if (diff >= 4) return { s: 'critical', c: 'critical-val' };
            const isNorm = (typeNum === 1) ? (h >= 10 && h <= 13) : (h >= 7.5 && h <= 10.5);
            return isNorm ? { s: 'ok', c: '' } : { s: 'warning', c: 'bad-val' };
        } else { return (h <= (10/60)) ? { s: 'critical', c: 'critical-val' } : { s: 'ok', c: '' }; }
    }
}

function analyzeVent(val, isRight) {
    if (val === "N/A") return { s: 'none', c: '' };
    const h = parseH(val);
    let target = (ventSeason === '중간기') ? 3 : (ventSeason === '하절기' ? (isRight ? 10.8 : 9.8) : 2);
    if (h === 0 || Math.abs(h - target) >= 2) return { s: 'critical', c: 'critical-val' };
    return (h === target) ? { s: 'ok', c: '' } : { s: 'warning', c: 'bad-val' };
}

// 2호선 환기실 상세 추출 (죽전 6개, 반월당 T열)
function getL2Vent(sheet) {
    const data = [];
    const range = XLSX.utils.decode_range(sheet['!ref']);
    CONFIG.LINE2_STATIONS.forEach(stName => {
        const matchName = CONFIG.L2_NAME_MAP[stName] || stName;
        
        if (stName === "반월당") {
            const raw = [getCV(sheet, 439, 19), getCV(sheet, 440, 19), getCV(sheet, 441, 19), getCV(sheet, 442, 19)];
            const res = [analyzeVent(raw[0], false), analyzeVent(raw[1], false), analyzeVent(raw[2], true), analyzeVent(raw[3], true)];
            data.push({ name: stName, units: [{l:"시급",v:raw[0],r:res[0]},{l:"시배",v:raw[1],r:res[1]},{l:"종급",v:raw[2],r:res[2]},{l:"종배",v:raw[3],r:res[3]}], isCri: res.some(r=>r.s==='critical'), isAb: res.some(r=>r.s!=='ok') });
            return;
        }

        let foundRow = -1;
        for (let r = 0; r <= range.e.r; r++) {
            let txt = cleanText(getCV(sheet, r, 0) + getCV(sheet, r, 1));
            if (txt.includes(matchName)) { foundRow = r; break; }
        }

        if (foundRow !== -1) {
            let units = [];
            for (let r = foundRow; r < foundRow + 40 && r <= range.e.r; r++) {
                [1, 6, 11].forEach(col => {
                    let name = cleanText(getCV(sheet, r, col));
                    if (name.includes("환기실")) {
                        let val = getCV(sheet, r, col + 3);
                        const noEquip = CONFIG.NO_EQUIPMENT[stName] || [];
                        if (noEquip.some(ex => name.includes(ex))) val = "N/A";
                        units.push({ l: name.replace("환기실", "").trim(), v: val, r: analyzeVent(val, (name.includes("우")||name.includes("종점"))) });
                    }
                });
            }
            if (units.length > 0) data.push({ name: stName, units, isCri: units.some(u=>u.r.s==='critical'), isAb: units.some(u=>u.r.s!=='ok') });
        }
    });
    return data;
}

function renderAll(hvac, air, vent) {
    const b = CONFIG.BRANCHES[currentLine];
    const hLabels = currentLine === 'line1' ? ["시급", "시배", "종급", "종배"] : ["시급", "시상", "시하", "종급", "종상", "종하"];

    const buildSummary = (br) => {
        const cH = hvac.filter(d => br.stations.includes(d.name) && d.isCri);
        const cA = air.filter(d => br.stations.includes(d.name) && d.isCri);
        const cV = vent.filter(d => br.stations.includes(d.name) && d.isCri);
        const isOk = (cH.length === 0 && cA.length === 0 && cV.length === 0);

        let h = `<div class="summary-card ${isOk?'ok':''}"> <div class="summary-title">📍 ${br.name}</div>`;
        if (isOk) return h + `<div style="color:var(--success); font-weight:700;">✅ 모든 장비 정상 가동 중</div></div>`;
        
        if (cH.length > 0) {
            h += `<span class="summary-group-label">[승강장 공조기]</span><div class="summary-badge-container">`;
            cH.forEach(d => { d.res.forEach((r, i) => { if (r.s === 'critical') h += `<span class="badge badge-danger">${d.name} ${hLabels[i]} (${formatToHMS(d.raw[i])})</span> `; }); });
            h += `</div>`;
        }
        if (cV.length > 0) {
            h += `<span class="summary-group-label">[환기실 송풍기]</span><div class="summary-badge-container">`;
            cV.forEach(d => {
                const targets = (currentLine === 'line1') ? d.res.map((r,i)=>({s:r.s, l:["시급","시배","종급","종배"][i], v:d.raw[i]})) : d.units.filter(u=>u.r.s==='critical').map(u=>({s:u.r.s, l:u.l, v:u.v}));
                targets.forEach(u => { if (u.s === 'critical') h += `<span class="badge badge-danger">${d.name} ${u.l} (${formatToHMS(u.v)})</span> `; });
            });
            h += `</div>`;
        }
        if (cA.length > 0) {
            h += `<span class="summary-group-label">[공기청정기]</span><div class="summary-badge-container">`;
            cA.forEach(d => { d.units.forEach(u => { if (u.res.s === 'critical') h += `<span class="badge badge-danger">${d.name} ${u.label} (${formatToHMS(u.val)})</span> `; }); });
            h += `</div>`;
        }
        return h + `</div>`;
    };

    document.getElementById('summary-area').innerHTML = `<h2 class="summary-section-main-title">⚠️ 통합 이상 내역 요약</h2><div class="summary-area-grid">${buildSummary(b.left)}${buildSummary(b.right)}</div>`;

    const lH = hvac.filter(d => b.left.stations.includes(d.name)), rH = hvac.filter(d => b.right.stations.includes(d.name));
    const lV = vent.filter(d => b.left.stations.includes(d.name)), rV = vent.filter(d => b.right.stations.includes(d.name));
    const lA = air.filter(d => b.left.stations.includes(d.name)), rA = air.filter(d => b.right.stations.includes(d.name));

    document.getElementById('full-list-area').innerHTML = `
        <h2 class="section-title">📊 승강장 공조기 상세 분석</h2>
        <div class="equipment-row">
            <div class="branch-column"><div class="branch-name-header">${b.left.name}</div><button class="toggle-detail-btn" onclick="toggleDetail(this, 'l-hvac', '승강장공조기')">[승강장공조기] 상세보기 ▾</button><div id="l-hvac" class="detail-content">${buildHVACTable(lH)}</div></div>
            <div class="branch-column"><div class="branch-name-header">${b.right.name}</div><button class="toggle-detail-btn" onclick="toggleDetail(this, 'r-hvac', '승강장공조기')">[승강장공조기] 상세보기 ▾</button><div id="r-hvac" class="detail-content">${buildHVACTable(rH)}</div></div>
        </div>
        <h2 class="section-title">🌪️ 환기실 송풍기 상세 분석</h2>
        <div class="equipment-row">
            <div class="branch-column"><button class="toggle-detail-btn" onclick="toggleDetail(this, 'l-vent', '환기실송풍기')">[환기실송풍기] 상세보기 ▾</button><div id="l-vent" class="detail-content">${buildFlexTable(lV)}</div></div>
            <div class="branch-column"><button class="toggle-detail-btn" onclick="toggleDetail(this, 'r-vent', '환기실송풍기')">[환기실송풍기] 상세보기 ▾</button><div id="r-vent" class="detail-content">${buildFlexTable(rV)}</div></div>
        </div>
        <h2 class="section-title">🌬️ 공기청정기 상세 분석</h2>
        <div class="equipment-row">
            <div class="branch-column"><button class="toggle-detail-btn" onclick="toggleDetail(this, 'l-air', '공기청정기')">[공기청정기] 상세보기 ▾</button><div id="l-air" class="detail-content">${buildAirTable(lA)}</div></div>
            <div class="branch-column"><button class="toggle-detail-btn" onclick="toggleDetail(this, 'r-air', '공기청정기')">[공기청정기] 상세보기 ▾</button><div id="r-air" class="detail-content">${buildAirTable(rA)}</div></div>
        </div>`;
}

function buildHVACTable(data) {
    const hds = currentLine === 'line1' ? ['역사', '시급', '시배', '종급', '종배', '판정'] : ['역사', '시급', '시상', '시하', '종급', '종상', '종하', '판정'];
    let h = `<div class="table-wrapper"><table><thead><tr>${hds.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>`;
    data.forEach(d => {
        h += `<tr><td class="st-name">${d.name}</td>`;
        d.raw.forEach((v, i) => {
            const label = (currentLine === 'line2' && (i===2 || i===5)) ? "exhaust_ha" : "supply";
            const res = analyze(v, 0, d.name, label);
            h += `<td class="${res.c}">${v==="N/A"?"-":formatToHMS(v)}</td>`;
        });
        h += `<td><span class="badge badge-${d.isCri?'danger':(d.isAb?'warning':'success')}">${d.isCri?'심각':(d.isAb?'이상':'정상')}</span></td></tr>`;
    });
    return h + `</tbody></table></div>`;
}

function buildFlexTable(data) {
    if (data.length === 0) return "<p style='padding:20px; text-align:center; color:#94a3b8;'>데이터 없음</p>";
    if (currentLine === 'line1') {
        let h = `<div class="table-wrapper"><table><thead><tr><th>역사</th><th>시급</th><th>시배</th><th>종급</th><th>종배</th><th>판정</th></tr></thead><tbody>`;
        data.forEach(d => {
            h += `<tr><td class="st-name">${d.name}</td>`;
            d.raw.forEach((v, i) => { h += `<td class="${d.res[i].c}">${v==="N/A"?"-":formatToHMS(v)}</td>`; });
            h += `<td><span class="badge badge-${d.isCri?'danger':(d.isAb?'warning':'success')}">${d.isCri?'심각':(d.isAb?'이상':'정상')}</span></td></tr>`;
        });
        return h + `</tbody></table></div>`;
    }
    let h = `<div class="table-wrapper"><table><thead><tr><th style="width:95px;">역사</th><th>장비 상세 현황</th></tr></thead><tbody>`;
    data.forEach(d => {
        h += `<tr><td class="st-name">${d.name}</td><td><div class="units-grid">`;
        d.units.forEach(u => { h += `<div class="unit-box ${u.r.c}"><strong>${u.l}</strong><div class="unit-time">${u.v==="N/A"?"-":formatToHMS(u.v)}</div></div>`; });
        h += `</div></td></tr>`;
    });
    return h + `</tbody></table></div>`;
}

function buildAirTable(data) {
    let h = `<div class="table-wrapper"><table><thead><tr><th style="width:95px;">역사</th><th>장비 상세 현황</th></tr></thead><tbody>`;
    data.forEach(d => {
        h += `<tr><td class="st-name">${d.name}</td><td><div class="units-grid">`;
        d.units.forEach(u => { h += `<div class="unit-box ${u.res.c}"><strong>${u.label}</strong><div class="unit-time">${formatToHMS(u.val)}</div></div>`; });
        h += `</div></td></tr>`;
    });
    return h + `</tbody></table></div>`;
}

function formatToHMS(v) { if(!v||v==='0'||v===0||v==='-'||v==="N/A") return "0:00:00"; let ts; if(typeof v==='number') ts=Math.round(v*24*3600); else if(typeof v==='string'&&v.includes(':')){ const p=v.split(':'); ts=(parseInt(p[0])||0)*3600+(parseInt(p[1])||0)*60+(parseInt(p[2])||0); } else { const n=parseFloat(v); if(isNaN(n)) return "0:00:00"; ts=Math.round(n*3600); } const h=Math.floor(ts/3600), m=Math.floor((ts%3600)/60), s=ts%60; return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
function getCV(s, r, c) { const cell = s[XLSX.utils.encode_cell({r:r, c:c})]; return cell ? cell.w || cell.v : ""; }
function parseH(v) { if(!v||v==="N/A") return 0; if(typeof v === 'number') return v * 24; const p = String(v).split(':'); if(p.length < 2) return parseFloat(v)||0; return parseInt(p[0]) + (parseInt(p[1])||0)/60 + (parseInt(p[2])||0)/3600; }
function cleanText(s) { return String(s || "").replace(/\s+/g, ""); }
function getL1HVAC(sheet) { const data = []; const map = isCooling ? CONFIG.STATION_MAP_COOLING : CONFIG.STATION_MAP_NORMAL; const rules = isCooling ? CONFIG.COOLING_TARGETS : CONFIG.NORMAL_TARGETS; [4, 5].forEach(col => { let n = (col === 4) ? "설화명곡" : "화원"; data.push(getL1HVAC_Obj(sheet, n, col, 81, 82, 89, 90, map, rules)); }); const range = XLSX.utils.decode_range(sheet['!ref']); for (let c = 4; c <= range.e.c; c++) { let n = cleanText(getCV(sheet, 0, c)); if(!n || ["합계","명곡","화원"].includes(n)) continue; data.push(getL1HVAC_Obj(sheet, n, c, 5, 6, 13, 14, map, rules)); } return data; }
function getL1HVAC_Obj(sheet, n, c, ls, le, rs, re, map, rules) { let sk = (n === "반월당" && currentLine === 'line1') ? "반월당(1호선)" : n; const ty = map[sk] || "default"; const tg = rules[ty] || (isCooling ? rules["type3"] : rules["type4"]); const raw = [getCV(sheet, ls, c), getCV(sheet, le, c), getCV(sheet, rs, c), getCV(sheet, re, c)]; const res = [analyze(raw[0], tg.s, n, 'supply'), analyze(raw[1], tg.e, n, 'exhaust'), analyze(raw[2], tg.s, n, 'supply'), analyze(raw[3], tg.e, n, 'exhaust')]; return { name:n, raw, res, isAb: res.some(r => r.s !== 'ok'), isCri: res.some(r => r.s === 'critical') }; }
function getAirPurifierData(sheet) { const data = []; const target = CONFIG.AIR_PURIFIER_STD; if (currentLine === 'line1') { const ext = [ {n: "화원", r: 179, c: 4}, {n: "설화명곡", r: 179, c: 5} ]; ext.forEach(st => { let v = getCV(sheet, st.r, st.c); let res = analyze(v, target, st.n, 'supply', true); data.push({ name: st.n, units: [{ label: "01호기", val: v || "0", res }], isAb: res.s !== 'ok', isCri: res.s === 'critical' }); }); CONFIG.L1_STATIONS_PURIFIER.forEach((name, idx) => { let v = getCV(sheet, 75, 4+idx); let res = analyze(v, target, name, 'supply', true); data.push({ name: name, units: [{ label: "01호기", val: v || "0", res }], isAb: res.s !== 'ok', isCri: res.s === 'critical' }); }); } else { const range = XLSX.utils.decode_range(sheet['!ref']); CONFIG.LINE2_STATIONS.forEach(stName => { let matchName = CONFIG.L2_NAME_MAP[stName] || stName; let foundRow = -1; for (let r = 0; r <= range.e.r; r++) { if (cleanText(getCV(sheet, r, 0) + getCV(sheet, r, 1)).includes(matchName)) { foundRow = r; break; } } if (foundRow !== -1) { const stObj = { name: stName, units: [], isAb: false, isCri: false }; for (let i = 5; i <= 30; i++) { [4, 9].forEach(colIdx => { let v = getCV(sheet, foundRow + i, colIdx); let uName = cleanText(getCV(sheet, foundRow + i, colIdx - 3)).replace(/\(.*\)/g, ""); if (v && v !== '0' && v !== '-') { let res = analyze(v, target, stName, 'supply', true); stObj.units.push({ label: (uName || (i-4)) + "호기", val:v, res }); if (res.s !== 'ok') stObj.isAb = true; if (res.s === 'critical') stObj.isCri = true; } }); } stObj.units.sort((a, b) => a.label.localeCompare(b.label, undefined, {numeric: true})); if (stObj.units.length > 0) data.push(stObj); } }); } return data; }
function getL1Vent(sheet) { const data = []; const range = XLSX.utils.decode_range(sheet['!ref']); for (let c = 4; c <= range.e.c; c++) { let n = cleanText(getCV(sheet, 0, c)); if(!n || ["합계","명곡","화원"].includes(n)) continue; const raw = [getCV(sheet, 20, c), getCV(sheet, 21, c), getCV(sheet, 22, c), getCV(sheet, 23, c)]; const res = [analyzeVent(raw[0], false), analyzeVent(raw[1], false), analyzeVent(raw[2], true), analyzeVent(raw[3], true)]; data.push({ name: n, raw, res, isCri: res.some(r => r.s === 'critical'), isAb: res.some(r => r.s !== 'ok') }); } [{n:"설화명곡", c:5}, {n:"화원", c:4}].forEach(s => { const raw = [getCV(sheet, 98, s.c), getCV(sheet, 99, s.c), getCV(sheet, 100, s.c), getCV(sheet, 101, s.c)]; const res = [analyzeVent(raw[0], false), analyzeVent(raw[1], false), analyzeVent(raw[2], true), analyzeVent(raw[3], true)]; data.push({ name: s.n, raw, res, isCri: res.some(r => r.s === 'critical'), isAb: res.some(r => r.s !== 'ok') }); }); return data; }
