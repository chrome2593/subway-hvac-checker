let currentLine = '', isCooling = false, currentWorkbook = null, currentFileName = '';

function showApp() { document.getElementById('home-view').classList.add('hidden'); document.getElementById('app-view').classList.remove('hidden'); }
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
        const testSheet = wb.Sheets[wb.SheetNames[0]];
        const dv = testSheet['C2'] ? testSheet['C2'].v : null;
        if(dv instanceof Date) { m = dv.getMonth()+1; d = dv.getDate(); }
    }
    isCooling = (m === 7 || m === 8 || (m === 9 && d <= 20));
    
    document.getElementById('season-banner').style.display = 'block';
    document.getElementById('season-banner').innerHTML = `적용 기준: <strong>${isCooling ? '❄️ 냉방 시즌' : '☀️ 비냉방 시즌'}</strong> (${m || '?'}월 ${d || '?'}일 기준)`;

    const hvacSheet = wb.Sheets[wb.SheetNames.find(n => n.includes("장비")) || wb.SheetNames[0]];
    const hvacData = (currentLine === 'line1') ? getL1HVAC(hvacSheet) : getL2HVAC(hvacSheet);

    const airSheet = wb.Sheets[wb.SheetNames.find(n => n.includes("공기청정기")) || wb.SheetNames[0]];
    const airData = getAirPurifierData(airSheet);

    renderAll(hvacData, airData);
}

// --- [핵심: 이상 여부 판단 로직] ---
function analyze(val, target, station, type, isAir = false) {
    if (station === "문양") return { s: 'ok', c: '' };
    const h = parseH(val);
    const diff = Math.abs(h - target);

    // 1. 공기청정기 판정
    if (isAir) {
        if (diff >= 5) return { s: 'critical', c: 'critical-val' }; // 5시간 이상 차이 시 심각
        if (h >= 15 && h <= 18) return { s: 'ok', c: '' }; // 15~18시간 정상
        return { s: 'warning', c: 'bad-val' }; // 그 외 이상
    }

    // 2. 승강장 공조기 판정
    if (!isCooling) {
        // [비냉방 시즌]
        if (type === 'supply') {
            if (diff >= 5) return { s: 'critical', c: 'critical-val' };
            if (h >= 15 && h <= 18) return { s: 'ok', c: '' };
            return { s: 'warning', c: 'bad-val' };
        } else {
            // 배기: 0~10분 심각, 10~30분 이상
            if (h <= (10/60)) return { s: 'critical', c: 'critical-val' };
            if (h <= 0.5) return { s: 'warning', c: 'bad-val' };
            return { s: 'ok', c: '' };
        }
    } else {
        // [냉방 시즌]
        const stKey = currentLine === 'line1' ? station : station; // 유형 판별용
        const typeNum = getCoolingType(station);

        if (type === 'supply') {
            if (diff >= 4) return { s: 'critical', c: 'critical-val' }; // 4시간 이상 차이 시 심각
            if (typeNum === 1) { // 1번 유형: 10~13시간 정상
                return (h >= 10 && h <= 13) ? { s: 'ok', c: '' } : { s: 'warning', c: 'bad-val' };
            } else { // 2, 3번 유형: 7.5~10.5시간 정상
                return (h >= 7.5 && h <= 10.5) ? { s: 'ok', c: '' } : { s: 'warning', c: 'bad-val' };
            }
        } else {
            // 배기: 0~10분 가동한 경우에만 심각 표시
            return (h <= (10/60)) ? { s: 'critical', c: 'critical-val' } : { s: 'ok', c: '' };
        }
    }
}

function getCoolingType(st) {
    if (CONFIG.STATION_MAP_COOLING[st] === "type1") return 1;
    if (CONFIG.STATION_MAP_COOLING[st] === "type2") return 2;
    return 3;
}

// --- [렌더링 및 요약] ---
function renderAll(hvac, air) {
    const hvacCri = hvac.filter(d => d.isCri);
    const airCri = air.filter(d => d.isCri);
    const hvacLabels = currentLine === 'line1' ? ["시점급기", "시점배기", "종점급기", "종점배기"] : ["시점급기", "시점상부", "시점하부", "종점급기", "종점상부", "종점하부"];

    let sumHtml = `<div class="summary-container"><div class="summary-section-title">⚠️ 통합 이상 내역 요약 (즉시 확인 대상)</div>`;
    
    if (hvacCri.length === 0 && airCri.length === 0) {
        sumHtml = `<div class="summary-container" style="border-color:var(--success); border-left-color:var(--success); background:#f0fdf4;">
                    <div class="summary-section-title" style="color:var(--success); border-bottom-color:#dcfce7;">✅ 모든 장비 가동 상태가 정상 범위 내에 있습니다.</div>
                   </div>`;
    } else {
        if (hvacCri.length > 0) {
            sumHtml += `<div style="margin-bottom:25px;"><strong>[승강장 공조기 - 심각]</strong><div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:8px;">`;
            hvacCri.forEach(d => { d.res.forEach((r, idx) => { if (r.s === 'critical') sumHtml += `<span class="badge badge-danger">${d.name} ${hvacLabels[idx]} (${formatToHMS(d.raw[idx])})</span>`; }); });
            sumHtml += `</div></div>`;
        }
        if (airCri.length > 0) {
            sumHtml += `<div><strong>[공기청정기 - 심각]</strong><div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:8px;">`;
            airCri.forEach(d => { d.units.forEach(u => { if (u.res.s === 'critical') sumHtml += `<span class="badge badge-danger">${d.name} ${u.label} (${formatToHMS(u.val)})</span>`; }); });
            sumHtml += `</div></div>`;
        }
        sumHtml += `</div>`;
    }
    document.getElementById('summary-area').innerHTML = sumHtml;

    document.getElementById('full-list-area').innerHTML = `<div class="section-title">승강장 공조기 분석 결과</div>` + buildHVACTable(hvac) + 
                                                          `<div class="section-title">공기청정기 분석 결과</div>` + buildAirTable(air);
}

// --- [추출 헬퍼 로직] ---
function getL1HVAC(sheet) {
    const data = [];
    const map = isCooling ? CONFIG.STATION_MAP_COOLING : CONFIG.STATION_MAP_NORMAL;
    const rules = isCooling ? CONFIG.COOLING_TARGETS : CONFIG.NORMAL_TARGETS;

    [4, 5].forEach(col => {
        let name = (col === 4) ? "설화명곡" : "화원";
        data.push(getL1HVAC_Obj(sheet, name, col, 81, 82, 89, 90, map, rules));
    });
    const range = XLSX.utils.decode_range(sheet['!ref']);
    for (let c = 4; c <= range.e.c; c++) {
        let n = cleanText(getCV(sheet, 0, c));
        if(!n || ["합계","명곡","화원"].includes(n)) continue;
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
        ext.forEach(st => {
            const val = getCV(sheet, st.r, st.c); const res = analyze(val, target, st.n, 'supply', true);
            data.push({ name: st.n, units: [{ label: "01호기", val: val || "0", res }], isAb: res.s !== 'ok', isCri: res.s === 'critical' });
        });
        CONFIG.L1_STATIONS_PURIFIER.forEach((name, idx) => {
            const col = 4 + idx; const val = getCV(sheet, 75, col); const res = analyze(val, target, name, 'supply', true);
            data.push({ name: name, units: [{ label: "01호기", val: val || "0", res }], isAb: res.s !== 'ok', isCri: res.s === 'critical' });
        });
    } else {
        const range = XLSX.utils.decode_range(sheet['!ref']);
        CONFIG.LINE2_STATIONS.forEach(stName => {
            let foundRow = -1;
            for (let r = 0; r <= range.e.r; r++) { if (cleanText(getCV(sheet, r, 0) + getCV(sheet, r, 1)).includes(stName)) { foundRow = r; break; } }
            if (foundRow !== -1) {
                const stObj = { name: stName, units: [], isAb: false, isCri: false };
                for (let i = 5; i <= 30; i++) {
                    [4, 9].forEach(colIdx => {
                        const val = getCV(sheet, foundRow + i, colIdx);
                        let unitName = cleanText(getCV(sheet, foundRow + i, colIdx - 3)).replace(/\(.*\)/g, "");
                        if (val && val !== '0' && val !== '-') {
                            const res = analyze(val, target, stName, 'supply', true);
                            stObj.units.push({ label: (unitName || (i-4)) + "호기", val, res });
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
    let stKey = n; if(n === "반월당" && currentLine === 'line1') stKey = "반월당(1호선)";
    const type = map[stKey] || "default";
    const target = rules[type] || (isCooling ? rules["type3"] : rules["type4"]);
    const raw = [getCV(sheet, ls, c), getCV(sheet, le, c), getCV(sheet, rs, c), getCV(sheet, re, c)];
    const res = [analyze(raw[0], target.s, n, 'supply'), analyze(raw[1], target.e, n, 'exhaust'), analyze(raw[2], target.s, n, 'supply'), analyze(raw[3], target.e, n, 'exhaust')];
    return { name:n, raw, res, isAb: res.some(r => r.s !== 'ok'), isCri: res.some(r => r.s === 'critical') };
}

function formatL2HVAC(d, map, rules) {
    let stKey = d.name; if(d.name === "반월당") stKey = "반월당(2호선)";
    const type = map[stKey] || "default";
    const target = rules[type] || (isCooling ? rules["type3"] : rules["type4"]);
    const raw = [d.ls, d.lue, d.lle, d.rs, d.rue, d.rle];
    const res = [analyze(raw[0], target.s, d.name, 'supply'), analyze(raw[1], target.e, d.name, 'exhaust'), analyze(raw[2], target.e, d.name, 'exhaust'), analyze(raw[3], target.s, d.name, 'supply'), analyze(raw[4], target.e, d.name, 'exhaust'), analyze(raw[5], target.e, d.name, 'exhaust')];
    return { name: d.name, raw, res, isAb: res.some(r => r.s !== 'ok'), isCri: res.some(r => r.s === 'critical') };
}

function formatToHMS(val) {
    if (!val || val === '0' || val === 0 || val === '-') return "0:00:00";
    let totalSeconds;
    if (typeof val === 'number') totalSeconds = Math.round(val * 24 * 3600);
    else if (typeof val === 'string' && val.includes(':')) {
        const parts = val.split(':');
        totalSeconds = (parseInt(parts[0])||0)*3600 + (parseInt(parts[1])||0)*60 + (parseInt(parts[2])||0);
    } else {
        const num = parseFloat(val); if (isNaN(num)) return "0:00:00";
        totalSeconds = Math.round(num * 3600);
    }
    const h = Math.floor(totalSeconds / 3600), m = Math.floor((totalSeconds % 3600) / 60), s = totalSeconds % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function buildHVACTable(data) {
    const headers = currentLine === 'line1' ? ['역사명', '시점급기', '시점배기', '종점급기', '종점배기', '판정'] : ['역사명', '시점급기', '시점상부', '시점하부', '종점급기', '종점상부', '종점하부', '판정'];
    let h = `<div class="table-wrapper"><table><thead><tr>${headers.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>`;
    data.forEach(d => {
        h += `<tr><td class="st-name">${d.name}</td>`;
        d.raw.forEach((v, i) => { h += `<td class="${d.res[i].c}">${formatToHMS(v)}</td>`; });
        h += `<td><span class="badge badge-${d.isCri?'danger':(d.isAb?'warning':'success')}">${d.isCri?'심각':(d.isAb?'확인필요':'정상')}</span></td></tr>`;
    });
    return h + `</tbody></table></div>`;
}

function buildAirTable(data) {
    let h = `<div class="table-wrapper"><table><thead><tr><th style="width:160px;">역사명</th><th>상세 가동 현황</th><th style="width:100px;">판정</th></tr></thead><tbody>`;
    data.forEach(d => {
        h += `<tr><td class="st-name">${d.name}</td><td><div class="units-grid">`;
        d.units.forEach(u => { h += `<div class="unit-box ${u.res.c}"><strong>${u.label}</strong>${formatToHMS(u.val)}</div>`; });
        h += `</div></td><td><span class="badge badge-${d.isCri?'danger':(d.isAb?'warning':'success')}">${d.isAb?'이상':'정상'}</span></td></tr>`;
    });
    return h + `</tbody></table></div>`;
}

function getCV(s, r, c) { const cell = s[XLSX.utils.encode_cell({r:r, c:c})]; return cell ? cell.w || cell.v : ""; }
function parseH(v) { if(!v) return 0; if(typeof v === 'number') return v * 24; const p = String(v).split(':'); return p.length < 2 ? parseFloat(v)||0 : parseInt(p[0]) + parseInt(p[1])/60; }
function cleanText(s) { return String(s || "").replace(/\s+/g, ""); }
