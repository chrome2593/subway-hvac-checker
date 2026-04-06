let currentLine = '', isCooling = false, currentWorkbook = null, currentFileName = '';

function showApp() { 
    document.getElementById('home-view').classList.add('hidden'); 
    document.getElementById('app-view').classList.remove('hidden'); 
}

// [뒤로가기 로직 개선]
function goBack() {
    const mainContent = document.getElementById('main-content');
    const lineSelector = document.getElementById('line-selector');

    if (!mainContent.classList.contains('hidden')) {
        // 분석 화면 -> 호선 선택 화면으로
        mainContent.classList.add('hidden');
        lineSelector.classList.remove('hidden');
        document.getElementById('line-indicator').innerText = '노선을 선택하십시오';
        document.getElementById('summary-area').innerHTML = '';
        document.getElementById('full-list-area').innerHTML = '';
    } else {
        // 호선 선택 화면 -> 메인 첫 화면으로
        location.reload(); 
    }
}

function showHome() { location.reload(); }

function selectLine(line) {
    currentLine = line;
    document.getElementById('line-selector').classList.add('hidden');
    document.getElementById('main-content').classList.remove('hidden');
    document.getElementById('line-indicator').innerText = line === 'line1' ? '🔵 1호선 운영 점검' : '🟢 2호선 운영 점검';
}

document.getElementById('excelFile').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if(!file) return;
    currentFileName = file.name;
    const reader = new FileReader();
    reader.onload = (evt) => {
        currentWorkbook = XLSX.read(evt.target.result, { type: 'binary', cellDates: true });
        runIntegratedAnalysis(currentWorkbook);
    };
    reader.readAsBinaryString(file);
});

// [통합 분석 엔진]
function runIntegratedAnalysis(wb) {
    let dateKey = currentFileName.replace(/[^0-9]/g, "").substring(0, 8);
    let m = parseInt(dateKey.substring(4, 6)), d = parseInt(dateKey.substring(6, 8));
    isCooling = (m === 7 || m === 8 || (m === 9 && d <= 20));
    
    const banner = document.getElementById('season-banner');
    banner.style.display = 'block';
    banner.innerHTML = `현재 적용 기준: <strong>${isCooling ? '❄️ 냉방 시즌' : '☀️ 정상 시즌'}</strong> (${m || '?'}월 ${d || '?'}일 기준)`;

    // 1. 공조기 데이터 추출
    const hvacSheet = wb.Sheets[wb.SheetNames.find(n => n.includes("장비")) || wb.SheetNames[0]];
    const hvacData = (currentLine === 'line1') ? getL1HVAC(hvacSheet) : getL2HVAC(hvacSheet);

    // 2. 공기청정기 데이터 추출
    const airSheet = wb.Sheets[wb.SheetNames.find(n => n.includes("공기청정기")) || wb.SheetNames[0]];
    const airData = getAirPurifierData(airSheet);

    // 3. 통합 요약 및 결과 렌더링
    renderAll(hvacData, airData);
}

// --- [공용 분석 로직] ---
function analyze(val, target, station, type, isAir = false) {
    if (station === "문양") return { s: 'ok', c: '' };
    if (!val || val === '0' || val === '-' || val === '') return { s: 'critical', c: 'critical-val' };
    const h = parseH(val);
    if (isAir) {
        if (h <= target * 0.5) return { s: 'critical', c: 'critical-val' };
        if (h >= CONFIG.AIR_PURIFIER_LIMIT) return { s: 'ok', c: '' };
        return { s: 'warning', c: 'bad-val' };
    }
    if (type === 'exhaust') {
        if (h >= 0.5) return { s: 'ok', c: '' }; 
        if (h <= 0.25) return { s: 'critical', c: 'critical-val' }; 
        return { s: 'warning', c: 'bad-val' };
    }
    if (h <= target * 0.5) return { s: 'critical', c: 'critical-val' };
    return (h >= target - CONFIG.TOLERANCE && h <= target + CONFIG.TOLERANCE) ? { s: 'ok', c: '' } : { s: 'warning', c: 'bad-val' };
}

// --- [추출 로직들] ---
function getL1HVAC(sheet) {
    const data = []; const rules = isCooling ? CONFIG.RULES_COOLING : CONFIG.RULES_NORMAL;
    [4, 5].forEach(col => {
        let name = (col === 4) ? "설화명곡" : "화원";
        data.push(getL1HVAC_Obj(sheet, name, col, 81, 82, 89, 90, rules));
    });
    const range = XLSX.utils.decode_range(sheet['!ref']);
    for (let c = 4; c <= range.e.c; c++) {
        let n = cleanText(getCV(sheet, 0, c));
        if(!n || ["합계","명곡","화원"].includes(n)) continue;
        data.push(getL1HVAC_Obj(sheet, n, c, 5, 6, 13, 14, rules));
    }
    return data;
}

function getL2HVAC(sheet) {
    const range = XLSX.utils.decode_range(sheet['!ref']); const data = []; let cur = null; 
    const rules = isCooling ? CONFIG.RULES_COOLING : CONFIG.RULES_NORMAL;
    for (let r = 0; r <= range.e.r; r++) {
        let label = cleanText(getCV(sheet, r, 0) + getCV(sheet, r, 1) + getCV(sheet, r, 2));
        let val = getCV(sheet, r, 4);
        const found = CONFIG.LINE2_STATIONS.find(st => label.includes(st) && (label.includes("가동") || label.length < 15));
        if (found) { if (cur) data.push(formatL2HVAC(cur, rules)); cur = { name: found, ls:null, lue:null, lle:null, rs:null, rue:null, rle:null }; continue; }
        if (cur && label.includes("승강")) {
            const isL = label.includes("좌") || label.includes("시점");
            if (label.includes("급기")) { if(isL) cur.ls = val; else cur.rs = val; }
            else if (label.includes("배기")) {
                if (label.includes("상부") || (!label.includes("상부") && !label.includes("하부"))) { if(isL) cur.lue = val; else cur.rue = val; }
                else if (label.includes("하부")) { if(isL) cur.lle = val; else cur.rle = val; }
            }
        }
    }
    if (cur) data.push(formatL2HVAC(cur, rules));
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

// --- [렌더링 엔진] ---
function renderAll(hvac, air) {
    const hvacAb = hvac.filter(d => d.isAb);
    const airAb = air.filter(d => d.isAb);

    // 1. 통합 요약 영역
    let sumHtml = `<div class="summary-container"><div class="summary-section-title">⚠️ 통합 이상 내역 요약</div>`;
    
    if (hvacAb.length === 0 && airAb.length === 0) {
        sumHtml = `<div class="summary-container" style="border-color:var(--success); border-left-color:var(--success); background:#f0fdf4;">
                    <div class="summary-section-title" style="color:var(--success); border-bottom-color:#dcfce7;">✅ 모든 장비가 정상입니다.</div>
                   </div>`;
    } else {
        // 공조기 요약
        if (hvacAb.length > 0) {
            sumHtml += `<div style="margin-bottom:20px;"><strong>[플랫폼 공조기]</strong><br>`;
            hvacAb.forEach(d => { sumHtml += `<span class="badge badge-danger" style="margin:4px;">${d.name}</span>`; });
            sumHtml += `</div>`;
        }
        // 공기청정기 요약
        if (airAb.length > 0) {
            sumHtml += `<div><strong>[공기청정기]</strong><br>`;
            airAb.forEach(d => {
                const badUnits = d.units.filter(u => u.res.s !== 'ok');
                badUnits.forEach(u => { sumHtml += `<span class="badge badge-warning" style="margin:4px;">${d.name} ${u.label}</span>`; });
            });
            sumHtml += `</div>`;
        }
        sumHtml += `</div>`;
    }
    document.getElementById('summary-area').innerHTML = sumHtml;

    // 2. 전체 리스트 영역
    let fullHtml = `<div class="section-title">📊 플랫폼 공조기 상세 결과</div>` + buildHVACTable(hvac);
    fullHtml += `<div class="section-title" style="margin-top:60px;">🌬️ 공기청정기 상세 결과</div>` + buildAirTable(air);
    document.getElementById('full-list-area').innerHTML = fullHtml;
}

function buildHVACTable(data) {
    const headers = currentLine === 'line1' ? ['역사명', '시점급기', '시점배기', '종점급기', '종점배기', '판정'] : ['역사명', '시점급기', '시점상부', '시점하부', '종점급기', '종점상부', '종점하부', '판정'];
    let h = `<div class="table-wrapper"><table><thead><tr>${headers.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>`;
    data.forEach(d => {
        h += `<tr><td class="st-name">${d.name}</td>`;
        d.raw.forEach((v, i) => { h += `<td class="${d.res[i].c}">${v || '0'}</td>`; });
        h += `<td><span class="badge badge-${d.isCri?'danger':(d.isAb?'warning':'success')}">${d.isCri?'심각':(d.isAb?'확인필요':'정상')}</span></td></tr>`;
    });
    return h + `</tbody></table></div>`;
}

function buildAirTable(data) {
    let h = `<div class="table-wrapper"><table><thead><tr><th style="width:140px;">역사명</th><th>장비 상세 현황</th><th style="width:100px;">판정</th></tr></thead><tbody>`;
    data.forEach(d => {
        h += `<tr><td class="st-name">${d.name}</td><td><div class="units-grid">`;
        d.units.forEach(u => { h += `<div class="unit-box ${u.res.c}"><strong>${u.label}</strong>${u.val}</div>`; });
        h += `</div></td><td><span class="badge badge-${d.isCri?'danger':(d.isAb?'warning':'success')}">${d.isAb?'이상':'정상'}</span></td></tr>`;
    });
    return h + `</tbody></table></div>`;
}

// [헬퍼]
function getL1HVAC_Obj(sheet, n, c, ls, le, rs, re, rules) {
    const type = CONFIG.STATION_MAP[n] || "default"; const target = rules[type] || rules["default"];
    const raw = [getCV(sheet, ls, c), getCV(sheet, le, c), getCV(sheet, rs, c), getCV(sheet, re, c)];
    const res = [analyze(raw[0], target.s, n, 'supply'), analyze(raw[1], target.ue, n, 'exhaust'), analyze(raw[2], target.s, n, 'supply'), analyze(raw[3], target.ue, n, 'exhaust')];
    return { name:n, raw, res, isAb: res.some(r => r.s !== 'ok'), isCri: res.some(r => r.s === 'critical') };
}
function formatL2HVAC(d, rules) {
    const target = rules["default"]; const raw = [d.ls, d.lue, d.lle, d.rs, d.rue, d.rle];
    const res = [analyze(raw[0], target.s, d.name, 'supply'), analyze(raw[1], target.ue, d.name, 'exhaust'), analyze(raw[2], target.le, d.name, 'exhaust'), analyze(raw[3], target.s, d.name, 'supply'), analyze(raw[4], target.ue, d.name, 'exhaust'), analyze(raw[5], target.le, d.name, 'exhaust')];
    return { name: d.name, raw, res, isAb: res.some(r => r.s !== 'ok'), isCri: res.some(r => r.s === 'critical') };
}
function getCV(s, r, c) { const cell = s[XLSX.utils.encode_cell({r:r, c:c})]; return cell ? cell.w || cell.v : ""; }
function parseH(v) { if(!v) return 0; if(typeof v === 'number') return v * 24; const p = String(v).split(':'); return p.length < 2 ? parseFloat(v)||0 : parseInt(p[0]) + parseInt(p[1])/60; }
function cleanText(s) { return String(s || "").replace(/\s+/g, ""); }
