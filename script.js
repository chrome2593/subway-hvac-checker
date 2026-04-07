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
    
    // [수정] 2호선 환기실 데이터 추출 추가
    const ventData = (currentLine === 'line1') ? getL1Vent(hvacSheet) : getL2Vent(hvacSheet);

    renderAll(hvacData, airData, ventData);
}

// 환기실 전용 판정
function analyzeVent(val, isRight) {
    const h = parseH(val);
    let target = (ventSeason === '중간기') ? 3 : (ventSeason === '하절기' ? (isRight ? 10.8 : 9.8) : 2);
    const diff = Math.abs(h - target);
    if (h === 0 || diff >= 2) return { s: 'critical', c: 'critical-val' };
    if (h !== target) return { s: 'warning', c: 'bad-val' };
    return { s: 'ok', c: '' };
}

// 2호선 환기실 추출 로직 (J열/O열 검색)
function getL2Vent(sheet) {
    const data = [];
    const range = XLSX.utils.decode_range(sheet['!ref']);
    
    CONFIG.LINE2_STATIONS.forEach(stName => {
        let foundRow = -1;
        // 역사 시작 행 찾기
        for (let r = 0; r <= range.e.r; r++) {
            if (cleanText(getCV(sheet, r, 0) + getCV(sheet, r, 1)).includes(stName)) { foundRow = r; break; }
        }

        if (foundRow !== -1) {
            // 해당 역사 블록(30행 이내)에서 환기실 키워드 찾기
            let vData = { ls: null, le: null, rs: null, re: null };
            for (let r = foundRow; r < foundRow + 30 && r <= range.e.r; r++) {
                // J열(9)과 O열(14) 주변의 키워드 확인
                [1, 6, 11].forEach(colIdx => { // 명칭이 있는 열들
                    let txt = cleanText(getCV(sheet, r, colIdx));
                    let valCol = colIdx + 3; // 가동시간(일적산)은 보통 이름 옆 3번째 칸
                    if (txt.includes("환기실")) {
                        let val = getCV(sheet, r, valCol);
                        if (txt.includes("급기") && (txt.includes("좌") || txt.includes("시점"))) vData.ls = val;
                        else if (txt.includes("배기") && (txt.includes("좌") || txt.includes("시점"))) vData.le = val;
                        else if (txt.includes("급기") && (txt.includes("우") || txt.includes("종점"))) vData.rs = val;
                        else if (txt.includes("배기") && (txt.includes("우") || txt.includes("종점"))) vData.re = val;
                    }
                });
            }
            const raw = [vData.ls, vData.le, vData.rs, vData.re];
            const res = [analyzeVent(raw[0], false), analyzeVent(raw[1], false), analyzeVent(raw[2], true), analyzeVent(raw[3], true)];
            data.push({ name: stName, raw, res, isCri: res.some(r => r.s === 'critical'), isAb: res.some(r => r.s !== 'ok') });
        }
    });
    return data;
}

function renderAll(hvac, air, vent) {
    const hLabels = currentLine === 'line1' ? ["시급", "시배", "종급", "종배"] : ["시급", "시상", "시하", "종급", "종상", "종하"];
    const vLabels = ["시점급기", "시점배기", "종점급기", "종점배기"];
    const b = CONFIG.BRANCHES[currentLine];

    // 요약 섹션
    const hCri = hvac.filter(d => d.isCri), aCri = air.filter(d => d.isCri), vCri = vent.filter(d => d.isCri);
    const buildSum = (br) => {
        const cH = hCri.filter(d => br.stations.includes(d.name)), cA = aCri.filter(d => br.stations.includes(d.name)), cV = vCri.filter(d => br.stations.includes(d.name));
        const isOk = (cH.length === 0 && cA.length === 0 && cV.length === 0);
        let h = `<div class="summary-card ${isOk?'ok':''}"> <div class="summary-title">📍 ${br.name}</div>`;
        if (isOk) h += `<div style="color:var(--success); font-weight:700;">✅ 모든 관할 장비 정상</div>`;
        else {
            if (cH.length > 0) {
                h += `<span class="summary-group-label">[승강장 공조기]</span><div class="summary-badge-container">`;
                cH.forEach(d => { d.res.forEach((r, i) => { if (r.s === 'critical') h += `<span class="badge badge-danger">${d.name} ${hLabels[i]} (${formatToHMS(d.raw[i])})</span> `; }); });
                h += `</div>`;
            }
            if (cV.length > 0) {
                h += `<span class="summary-group-label">[환기실 송풍기]</span><div class="summary-badge-container">`;
                cV.forEach(d => { d.res.forEach((r, i) => { if (r.s === 'critical') h += `<span class="badge badge-danger">${d.name} ${vLabels[i]} (${formatToHMS(d.raw[i])})</span> `; }); });
                h += `</div>`;
            }
            if (cA.length > 0) {
                h += `<span class="summary-group-label">[공기청정기]</span><div class="summary-badge-container">`;
                cA.forEach(d => { d.units.forEach(u => { if (u.res.s === 'critical') h += `<span class="badge badge-danger">${d.name} ${u.label} (${formatToHMS(u.val)})</span> `; }); });
                h += `</div>`;
            }
        }
        return h + `</div>`;
    };
    document.getElementById('summary-area').innerHTML = `<h2 class="summary-section-main-title">⚠️ 통합 이상 내역 요약</h2><div class="summary-area-grid">${buildSum(b.left)}${buildSum(b.right)}</div>`;

    // 상세 분석 (좌우 배치)
    const lH = hvac.filter(d => b.left.stations.includes(d.name)), rH = hvac.filter(d => b.right.stations.includes(d.name));
    const lV = vent.filter(d => b.left.stations.includes(d.name)), rV = vent.filter(d => b.right.stations.includes(d.name));
    const lA = air.filter(d => b.left.stations.includes(d.name)), rA = air.filter(d => b.right.stations.includes(d.name));

    document.getElementById('full-list-area').innerHTML = `
        <h2 class="section-title">📊 승강장 공조기 상세 분석</h2>
        <div class="equipment-row">
            <div class="branch-column">
                <div class="branch-name-header">${b.left.name}</div>
                <button class="toggle-detail-btn" onclick="toggleDetail(this, 'left-hvac', '승강장공조기')">[승강장공조기] 상세보기 ▾</button>
                <div id="left-hvac" class="detail-content">${buildHVACTable(lH)}</div>
            </div>
            <div class="branch-column">
                <div class="branch-name-header">${b.right.name}</div>
                <button class="toggle-detail-btn" onclick="toggleDetail(this, 'right-hvac', '승강장공조기')">[승강장공조기] 상세보기 ▾</button>
                <div id="right-hvac" class="detail-content">${buildHVACTable(rH)}</div>
            </div>
        </div>

        <h2 class="section-title">🌪️ 환기실 송풍기 상세 분석</h2>
        <div class="equipment-row">
            <div class="branch-column">
                <button class="toggle-detail-btn" onclick="toggleDetail(this, 'left-vent', '환기실송풍기')">[환기실송풍기] 상세보기 ▾</button>
                <div id="left-vent" class="detail-content">${buildVentTable(lV)}</div>
            </div>
            <div class="branch-column">
                <button class="toggle-detail-btn" onclick="toggleDetail(this, 'right-vent', '환기실송풍기')">[환기실송풍기] 상세보기 ▾</button>
                <div id="right-vent" class="detail-content">${buildVentTable(rV)}</div>
            </div>
        </div>

        <h2 class="section-title">🌬️ 공기청정기 상세 분석</h2>
        <div class="equipment-row">
            <div class="branch-column">
                <button class="toggle-detail-btn" onclick="toggleDetail(this, 'left-air', '공기청정기')">[공기청정기] 상세보기 ▾</button>
                <div id="left-air" class="detail-content">${buildAirTable(lA)}</div>
            </div>
            <div class="branch-column">
                <button class="toggle-detail-btn" onclick="toggleDetail(this, 'right-air', '공기청정기')">[공기청정기] 상세보기 ▾</button>
                <div id="right-air" class="detail-content">${buildAirTable(rA)}</div>
            </div>
        </div>`;
}

// 헬퍼 함수 (이전과 동일)
function buildHVACTable(data) {
    const hds = currentLine === 'line1' ? ['역사', '시급', '시배', '종급', '종배', '판정'] : ['역사', '시급', '시상', '시하', '종급', '종상', '종하', '판정'];
    let h = `<div class="table-wrapper"><table><thead><tr>${hds.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>`;
    data.forEach(d => {
        h += `<tr><td class="st-name">${d.name}</td>`;
        d.raw.forEach((v, i) => { h += `<td class="${d.res[i].c}">${formatToHMS(v)}</td>`; });
        h += `<td><span class="badge badge-${d.isCri?'danger':(d.isAb?'warning':'success')}">${d.isCri?'심각':(d.isAb?'이상':'정상')}</span></td></tr>`;
    });
    return h + `</tbody></table></div>`;
}
function buildVentTable(data) {
    if (data.length === 0) return "<p style='padding:20px; text-align:center; color:#94a3b8;'>데이터 없음</p>";
    let h = `<div class="table-wrapper"><table><thead><tr><th>역사</th><th>시급</th><th>시배</th><th>종급</th><th>종배</th><th>판정</th></tr></thead><tbody>`;
    data.forEach(d => {
        h += `<tr><td class="st-name">${d.name}</td>`;
        d.raw.forEach((v, i) => { h += `<td class="${d.res[i].c}">${formatToHMS(v)}</td>`; });
        h += `<td><span class="badge badge-${d.isCri?'danger':(d.isAb?'warning':'success')}">${d.isCri?'심각':(d.isAb?'이상':'정상')}</span></td></tr>`;
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
function parseH(v) { if(!v) return 0; if(typeof v === 'number') return v * 24; const p = String(v).split(':'); return p.length < 2 ? parseFloat(v)||0 : parseInt(p[0]) + (parseInt(p[1])||0)/60 + (parseInt(p[2])||0)/3600; }
function formatToHMS(v) { if(!v||v==='0'||v===0||v==='-') return "0:00:00"; let ts; if(typeof v==='number') ts=Math.round(v*24*3600); else if(typeof v==='string'&&v.includes(':')){ const p=v.split(':'); ts=(parseInt(p[0])||0)*3600+(parseInt(p[1])||0)*60+(parseInt(p[2])||0); } else { const n=parseFloat(v); if(isNaN(n)) return "0:00:00"; ts=Math.round(n*3600); } const h=Math.floor(ts/3600), m=Math.floor((ts%3600)/60), s=ts%60; return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
function getCV(s, r, c) { const cell = s[XLSX.utils.encode_cell({r:r, c:c})]; return cell ? cell.w || cell.v : ""; }
function cleanText(s) { return String(s || "").replace(/\s+/g, ""); }
function getL1HVAC(sheet) { const data = []; const map = isCooling ? CONFIG.STATION_MAP_COOLING : CONFIG.STATION_MAP_NORMAL; const rules = isCooling ? CONFIG.COOLING_TARGETS : CONFIG.NORMAL_TARGETS; [4, 5].forEach(col => { let n = (col === 4) ? "설화명곡" : "화원"; data.push(getL1HVAC_Obj(sheet, n, col, 81, 82, 89, 90, map, rules)); }); const range = XLSX.utils.decode_range(sheet['!ref']); for (let c = 4; c <= range.e.c; c++) { let n = cleanText(getCV(sheet, 0, c)); if(!n || ["합계","명곡","화원"].includes(n)) continue; data.push(getL1HVAC_Obj(sheet, n, c, 5, 6, 13, 14, map, rules)); } return data; }
function getL1HVAC_Obj(sheet, n, c, ls, le, rs, re, map, rules) { let sk = (n === "반월당" && currentLine === 'line1') ? "반월당(1호선)" : n; const ty = map[sk] || "default"; const tg = rules[ty] || (isCooling ? rules["type3"] : rules["type4"]); const raw = [getCV(sheet, ls, c), getCV(sheet, le, c), getCV(sheet, rs, c), getCV(sheet, re, c)]; const res = [analyze(raw[0], tg.s, n, 'supply'), analyze(raw[1], tg.e, n, 'exhaust'), analyze(raw[2], tg.s, n, 'supply'), analyze(raw[3], tg.e, n, 'exhaust')]; return { name:n, raw, res, isAb: res.some(r => r.s !== 'ok'), isCri: res.some(r => r.s === 'critical') }; }
function getL2HVAC(sheet) { const range = XLSX.utils.decode_range(sheet['!ref']); const data = []; let cur = null; for (let r = 0; r <= range.e.r; r++) { let label = cleanText(getCV(sheet, r, 0) + getCV(sheet, r, 1) + getCV(sheet, r, 2)); let val = getCV(sheet, r, 4); const found = CONFIG.LINE2_STATIONS.find(st => label.includes(st) && (label.includes("가동") || label.length < 15)); if (found) { if (cur) data.push(formatL2HVAC(cur)); cur = { name: found, ls:null, lue:null, lle:null, rs:null, rue:null, rle:null }; continue; } if (cur && label.includes("승강")) { const isL = label.includes("좌") || label.includes("시점"); if (label.includes("급기")) { if(isL) cur.ls = val; else cur.rs = val; } else if (label.includes("배기")) { if (label.includes("상부") || (!label.includes("상부") && !label.includes("하부"))) { if(isL) cur.lue = val; else cur.rue = val; } else if (label.includes("하부")) { if(isL) cur.lle = val; else cur.rle = val; } } } } if (cur) data.push(formatL2HVAC(cur)); return data; }
function formatL2HVAC(d) { const ty = CONFIG.STATION_MAP_NORMAL[d.name] || "type4"; const tg = isCooling ? (CONFIG.COOLING_TARGETS[CONFIG.STATION_MAP_COOLING[d.name]] || CONFIG.COOLING_TARGETS["type3"]) : CONFIG.NORMAL_TARGETS[ty]; const res = [analyze(d.ls, tg.s, d.name, 'supply'), analyze(d.lue, tg.e, d.name, 'exhaust'), analyze(d.lle, tg.e, d.name, 'exhaust_ha'), analyze(d.rs, tg.s, d.name, 'supply'), analyze(d.rue, tg.e, d.name, 'exhaust'), analyze(d.rle, tg.e, d.name, 'exhaust_ha')]; return { name: d.name, raw: [d.ls, d.lue, d.lle, d.rs, d.rue, d.rle], res, isAb: res.some(r => r.s !== 'ok'), isCri: res.some(r => r.s === 'critical') }; }
function analyze(val, target, station, type, isAir = false) { if (station === "문양") return { s: 'ok', c: '' }; if (CONFIG.NO_EXHAUST_HA.includes(station) && type === 'exhaust_ha') return { s: 'ok', c: '' }; const h = parseH(val); const diff = Math.abs(h - target); if (isAir) { if (diff >= 5) return { s: 'critical', c: 'critical-val' }; if (h >= 15 && h <= 18) return { s: 'ok', c: '' }; return { s: 'warning', c: 'bad-val' }; } if (!isCooling) { if (type === 'supply') { if (diff >= 5) return { s: 'critical', c: 'critical-val' }; if (h >= 15 && h <= 18) return { s: 'ok', c: '' }; return { s: 'warning', c: 'bad-val' }; } else { if (h <= (10/60)) return { s: 'critical', c: 'critical-val' }; return (h <= 0.5) ? { s: 'warning', c: 'bad-val' } : { s: 'ok', c: '' }; } } else { const tNum = (CONFIG.STATION_MAP_COOLING[station] === "type1") ? 1 : 2; if (type === 'supply') { if (diff >= 4) return { s: 'critical', c: 'critical-val' }; const isNorm = (tNum === 1) ? (h >= 10 && h <= 13) : (h >= 7.5 && h <= 10.5); return isNorm ? { s: 'ok', c: '' } : { s: 'warning', c: 'bad-val' }; } else { return (h <= (10/60)) ? { s: 'critical', c: 'critical-val' } : { s: 'ok', c: '' }; } } }
function getAirPurifierData(sheet) { const data = []; const target = CONFIG.AIR_PURIFIER_STD; if (currentLine === 'line1') { const ext = [ {n: "화원", r: 179, c: 4}, {n: "설화명곡", r: 179, c: 5} ]; ext.forEach(st => { let v = getCV(sheet, st.r, st.c); let res = analyze(v, target, st.n, 'supply', true); data.push({ name: st.n, units: [{ label: "01호기", val: v || "0", res }], isAb: res.s !== 'ok', isCri: res.s === 'critical' }); }); CONFIG.L1_STATIONS_PURIFIER.forEach((name, idx) => { let v = getCV(sheet, 75, 4+idx); let res = analyze(v, target, name, 'supply', true); data.push({ name: name, units: [{ label: "01호기", val: v || "0", res }], isAb: res.s !== 'ok', isCri: res.s === 'critical' }); }); } else { const range = XLSX.utils.decode_range(sheet['!ref']); CONFIG.LINE2_STATIONS.forEach(stName => { let foundRow = -1; for (let r = 0; r <= range.e.r; r++) { if (cleanText(getCV(sheet, r, 0) + getCV(sheet, r, 1)).includes(stName)) { foundRow = r; break; } } if (foundRow !== -1) { const stObj = { name: stName, units: [], isAb: false, isCri: false }; for (let i = 5; i <= 30; i++) { [4, 9].forEach(colIdx => { let v = getCV(sheet, foundRow + i, colIdx); let uName = cleanText(getCV(sheet, foundRow + i, colIdx - 3)).replace(/\(.*\)/g, ""); if (v && v !== '0' && v !== '-') { let res = analyze(v, target, stName, 'supply', true); stObj.units.push({ label: (uName || (i-4)) + "호기", val:v, res }); if (res.s !== 'ok') stObj.isAb = true; if (res.s === 'critical') stObj.isCri = true; } }); } stObj.units.sort((a, b) => a.label.localeCompare(b.label, undefined, {numeric: true})); if (stObj.units.length > 0) data.push(stObj); } }); } return data; }
function getL1Vent(sheet) { const data = []; const range = XLSX.utils.decode_range(sheet['!ref']); for (let c = 4; c <= range.e.c; c++) { let n = cleanText(getCV(sheet, 0, c)); if(!n || ["합계","명곡","화원"].includes(n)) continue; const raw = [getCV(sheet, 20, c), getCV(sheet, 21, c), getCV(sheet, 22, c), getCV(sheet, 23, c)]; const res = [analyzeVent(raw[0], false), analyzeVent(raw[1], false), analyzeVent(raw[2], true), analyzeVent(raw[3], true)]; data.push({ name: n, raw, res, isCri: res.some(r => r.s === 'critical'), isAb: res.some(r => r.s !== 'ok') }); } [{n:"설화명곡", c:5}, {n:"화원", c:4}].forEach(s => { const raw = [getCV(sheet, 98, s.c), getCV(sheet, 99, s.c), getCV(sheet, 100, s.c), getCV(sheet, 101, s.c)]; const res = [analyzeVent(raw[0], false), analyzeVent(raw[1], false), analyzeVent(raw[2], true), analyzeVent(raw[3], true)]; data.push({ name: s.n, raw, res, isCri: res.some(r => r.s === 'critical'), isAb: res.some(r => r.s !== 'ok') }); }); return data; }
