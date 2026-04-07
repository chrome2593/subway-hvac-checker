let currentLine = '', isCooling = false, currentWorkbook = null, currentFileName = '';

// [메인 버튼 함수]
function showApp() { 
    document.getElementById('home-view').classList.add('hidden'); 
    document.getElementById('app-view').classList.remove('hidden'); 
}

function goBack() { location.reload(); }

document.getElementById('excelFile').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if(!file) return;
    currentFileName = file.name;
    currentLine = currentFileName.includes("일보") ? 'line2' : 'line1';
    document.getElementById('line-indicator').innerText = (currentLine === 'line1' ? '🔵 1호선' : '🟢 2호선') + ' 가동일보 분석';

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

// [핵심 판정 로직]
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
        const map = CONFIG.STATION_MAP_COOLING;
        const typeNum = (map[station] === "type1") ? 1 : 2;
        if (type === 'supply') {
            if (diff >= 4) return { s: 'critical', c: 'critical-val' };
            const isNorm = (typeNum === 1) ? (h >= 10 && h <= 13) : (h >= 7.5 && h <= 10.5);
            return isNorm ? { s: 'ok', c: '' } : { s: 'warning', c: 'bad-val' };
        } else {
            return (h <= (10/60)) ? { s: 'critical', c: 'critical-val' } : { s: 'ok', c: '' };
        }
    }
}

// [렌더링 - 요약 및 하단 좌우 분리]
function renderAll(hvac, air) {
    const hvacCri = hvac.filter(d => d.isCri);
    const airCri = air.filter(d => d.isCri);
    const hLabels = currentLine === 'line1' ? ["시점급기", "시점배기", "종점급기", "종점배기"] : ["시점급기", "시점상부", "시점하부", "종점급기", "종점상부", "종점하부"];
    const b = CONFIG.BRANCHES[currentLine];

    // 1. 요약 섹션 분리
    const getSumHtml = (stations) => {
        let h = "";
        const cHi = hvacCri.filter(d => stations.includes(d.name));
        const cAi = airCri.filter(d => stations.includes(d.name));
        if (cHi.length === 0 && cAi.length === 0) return `<div style="color:#94a3b8; font-weight:600; padding:10px;">이상 항목 없음</div>`;
        if (cHi.length > 0) {
            h += `<div style="margin-bottom:15px;"><strong>[승강장 공조기]</strong><div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:6px;">`;
            cHi.forEach(d => { d.res.forEach((r, i) => { if (r.s === 'critical') h += `<span class="badge badge-danger">${d.name} ${hLabels[i]} (${formatToHMS(d.raw[i])})</span>`; }); });
            h += `</div></div>`;
        }
        if (cAi.length > 0) {
            h += `<div><strong>[공기청정기]</strong><div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:6px;">`;
            cAi.forEach(d => { d.units.forEach(u => { if (u.res.s === 'critical') h += `<span class="badge badge-danger">${d.name} ${u.label} (${formatToHMS(u.val)})</span>`; }); });
            h += `</div></div>`;
        }
        return h;
    };

    let sHtml = `<div class="summary-container"><div class="summary-section-title">⚠️ 통합 이상 내역 요약 (심각 항목)</div><div class="summary-grid">`;
    sHtml += `<div class="branch-summary"><div class="summary-branch-name">📍 ${b.left.name}</div>${getSumHtml(b.left.stations)}</div>`;
    sHtml += `<div class="branch-summary"><div class="summary-branch-name">📍 ${b.right.name}</div>${getSumHtml(b.right.stations)}</div>`;
    sHtml += `</div></div>`;
    document.getElementById('summary-area').innerHTML = sHtml;

    // 2. 하단 상세 섹션 분리
    const lH = hvac.filter(d => b.left.stations.includes(d.name));
    const lA = air.filter(d => b.left.stations.includes(d.name));
    const rH = hvac.filter(d => b.right.stations.includes(d.name));
    const rA = air.filter(d => b.right.stations.includes(d.name));

    let fHtml = `<div class="split-layout">`;
    fHtml += `<div class="branch-column"><div class="branch-title">${b.left.name}</div><div class="section-title">승강장 공조기</div>${buildHVACTable(lH)}<div class="section-title">공기청정기</div>${buildAirTable(lA)}</div>`;
    fHtml += `<div class="branch-column"><div class="branch-title">${b.right.name}</div><div class="section-title">승강장 공조기</div>${buildHVACTable(rH)}<div class="section-title">공기청정기</div>${buildAirTable(rA)}</div>`;
    fHtml += `</div>`;
    document.getElementById('full-list-area').innerHTML = fHtml;
}

// [헬퍼 함수들]
function formatToHMS(val) {
    if (!val || val === '0' || val === 0 || val === '-') return "0:00:00";
    let ts;
    if (typeof val === 'number') ts = Math.round(val * 24 * 3600);
    else if (typeof val === 'string' && val.includes(':')) {
        const p = val.split(':');
        ts = (parseInt(p[0])||0)*3600 + (parseInt(p[1])||0)*60 + (parseInt(p[2])||0);
    } else {
        const n = parseFloat(val); if (isNaN(n)) return "0:00:00";
        ts = Math.round(n * 3600);
    }
    const h = Math.floor(ts / 3600), m = Math.floor((ts % 3600) / 60), s = ts % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function buildHVACTable(data) {
    const headers = currentLine === 'line1' ? ['역사', '시급', '시배', '종급', '종배', '판정'] : ['역사', '시급', '시상', '시하', '종급', '종상', '종하', '판정'];
    let h = `<div class="table-wrapper"><table><thead><tr>${headers.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>`;
    data.forEach(d => {
        h += `<tr><td class="st-name">${d.name}</td>`;
        d.raw.forEach((v, i) => { h += `<td class="${d.res[i].c}">${formatToHMS(v)}</td>`; });
        h += `<td><span class="badge badge-${d.isCri?'danger':(d.isAb?'warning':'success')}">${d.isCri?'심각':(d.isAb?'이상':'정상')}</span></td></tr>`;
    });
    return h + `</tbody></table></div>`;
}
function buildAirTable(data) {
    let h = `<div class="table-wrapper"><table><thead><tr><th style="width:70px;">역사</th><th>상세 가동 현황</th></tr></thead><tbody>`;
    data.forEach(d => {
        h += `<tr><td class="st-name">${d.name}</td><td><div class="units-grid">`;
        d.units.forEach(u => { h += `<div class="unit-box ${u.res.c}"><strong>${u.label}</strong>${formatToHMS(u.val)}</div>`; });
        h += `</div></td></tr>`;
    });
    return h + `</tbody></table></div>`;
}
function getL1HVAC(sheet) {
    const data = []; const map = isCooling ? CONFIG.STATION_MAP_COOLING : CONFIG.STATION_MAP_NORMAL;
    const rules = isCooling ? CONFIG.COOLING_TARGETS : CONFIG.NORMAL_TARGETS;
    [4, 5].forEach(col => { let n = (col === 4) ? "설화명곡" : "화원"; data.push(getL1HVAC_Obj(sheet, n, col, 81, 82, 89, 90, map, rules)); });
    const range = XLSX.utils.decode_range(sheet['!ref']);
    for (let c = 4; c <= range.e.c; c++) {
        let n = cleanText(getCV(sheet, 0, c)); if(!n || ["합계","명곡","화원"].includes(n)) continue;
        data.push(getL1HVAC_Obj(sheet, n, c, 5, 6, 13, 14, map, rules));
    }
    return data;
}
function getL2HVAC(sheet) {
    const range = XLSX.utils.decode_range(sheet['!ref']); const data = []; let cur = null;
    const map = isCooling ? CONFIG.STATION_MAP_COOLING : CONFIG.STATION_MAP_NORMAL;
    const rules = isCooling ? CONFIG.COOLING_TARGETS : CONFIG.NORMAL_TARGETS;
    for (let r = 0; r <= range.e.r; r++) {
        let label = cleanText(getCV(sheet, r, 0) + getCV(sheet, r, 1) + getCV(sheet, r, 2));
        let val = getCV(sheet, r, 4);
        const found = CONFIG.LINE2_STATIONS.find(st => label.includes(st) && (label.includes("가동") || label.length < 15));
        if (found) { if (cur) data.push(formatL2HVAC(cur, map, rules)); cur = { name: found, ls:null, lue:null, lle:null, rs:null, rue:null, rle:null }; continue; }
        if (cur && label.includes("승강")) {
            const isL = label.includes("좌") || label.includes("시점");
            if (label.includes("급기")) { if(isL) cur.ls = val; else cur.rs = val; }
            else if (label.includes("배기")) {
                if (label.includes("상부") || (!label.includes("상부") && !label.includes("하부"))) { if(isL) cur.lue = val; else cur.rue = val; }
                else if (label.includes("하부")) { if(isL) cur.lle = val; else cur.rle = val; }
            }
        }
    }
    if (cur) data.push(formatL2HVAC(cur, map, rules));
    return data;
}
function getAirPurifierData(sheet) {
    const data = []; const target = CONFIG.AIR_PURIFIER_STD;
    if (currentLine === 'line1') {
        const ext = [ {n: "화원", r: 179, c: 4}, {n: "설화명곡", r: 179, c: 5} ];
        ext.forEach(st => { let v = getCV(sheet, st.r, st.c); let res = analyze(v, target, st.n, 'supply', true); data.push({ name: st.n, units: [{ label: "01호기", val: v || "0", res }], isAb: res.s !== 'ok', isCri: res.s === 'critical' }); });
        CONFIG.L1_STATIONS_PURIFIER.forEach((name, idx) => { let v = getCV(sheet, 75, 4+idx); let res = analyze(v, target, name, 'supply', true); data.push({ name: name, units: [{ label: "01호기", val: v || "0", res }], isAb: res.s !== 'ok', isCri: res.s === 'critical' }); });
    } else {
        const range = XLSX.utils.decode_range(sheet['!ref']);
        CONFIG.LINE2_STATIONS.forEach(stName => {
            let foundRow = -1;
            for (let r = 0; r <= range.e.r; r++) { if (cleanText(getCV(sheet, r, 0) + getCV(sheet, r, 1)).includes(stName)) { foundRow = r; break; } }
            if (foundRow !== -1) {
                const stObj = { name: stName, units: [], isAb: false, isCri: false };
                for (let i = 5; i <= 30; i++) {
                    [4, 9].forEach(colIdx => {
                        let v = getCV(sheet, foundRow + i, colIdx);
                        let uName = cleanText(getCV(sheet, foundRow + i, colIdx - 3)).replace(/\(.*\)/g, "");
                        if (v && v !== '0' && v !== '-') {
                            let res = analyze(v, target, stName, 'supply', true);
                            stObj.units.push({ label: (uName || (i-4)) + "호기", val:v, res });
                            if (res.s !== 'ok') stObj.isAb = true; if (res.s === 'critical') stObj.isCri = true;
                        }
                    });
                }
                stObj.units.sort((a, b) => a.label.localeCompare(b.label, undefined, {numeric: true}));
                if (stObj.units.length > 0) data.push(stObj);
            }
        });
    }
    return data;
}
function getL1HVAC_Obj(sheet, n, c, ls, le, rs, re, map, rules) {
    let sk = (n === "반월당" && currentLine === 'line1') ? "반월당(1호선)" : n;
    const ty = map[sk] || "default"; const tg = rules[ty] || (isCooling ? rules["type3"] : rules["type4"]);
    const raw = [getCV(sheet, ls, c), getCV(sheet, le, c), getCV(sheet, rs, c), getCV(sheet, re, c)];
    const res = [analyze(raw[0], tg.s, n, 'supply'), analyze(raw[1], tg.e, n, 'exhaust'), analyze(raw[2], tg.s, n, 'supply'), analyze(raw[3], tg.e, n, 'exhaust')];
    return { name:n, raw, res, isAb: res.some(r => r.s !== 'ok'), isCri: res.some(r => r.s === 'critical') };
}
function formatL2HVAC(d, map, rules) {
    const ty = map[d.name] || "default"; const tg = rules[ty] || (isCooling ? rules["type3"] : rules["type4"]);
    const raw = [d.ls, d.lue, d.lle, d.rs, d.rue, d.rle];
    const res = [analyze(raw[0], tg.s, d.name, 'supply'), analyze(raw[1], tg.e, d.name, 'exhaust'), analyze(raw[2], tg.e, d.name, 'exhaust'), analyze(raw[3], tg.s, d.name, 'supply'), analyze(raw[4], tg.e, d.name, 'exhaust'), analyze(raw[5], tg.e, d.name, 'exhaust')];
    return { name: d.name, raw, res, isAb: res.some(r => r.s !== 'ok'), isCri: res.some(r => r.s === 'critical') };
}
function getCV(s, r, c) { const cell = s[XLSX.utils.encode_cell({r:r, c:c})]; return cell ? cell.w || cell.v : ""; }
function parseH(v) { if(!v) return 0; if(typeof v === 'number') return v * 24; const p = String(v).split(':'); return p.length < 2 ? parseFloat(v)||0 : parseInt(p[0]) + parseInt(p[1])/60; }
function cleanText(s) { return String(s || "").replace(/\s+/g, ""); }
