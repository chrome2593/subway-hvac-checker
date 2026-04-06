let currentLine = '', currentTab = 'hvac', isCooling = false, currentWorkbook = null, currentFileName = '';

function showApp() { document.getElementById('home-view').classList.add('hidden'); document.getElementById('app-view').classList.remove('hidden'); }
function showHome() { location.reload(); }

function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    event.currentTarget.classList.add('active');
    if (currentWorkbook) runAnalysis(currentWorkbook);
}

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
        runAnalysis(currentWorkbook);
    };
    reader.readAsBinaryString(file);
});

function runAnalysis(wb) {
    // 날짜 감지 및 배너 업데이트
    let dateKey = currentFileName.replace(/[^0-9]/g, "").substring(0, 8);
    let m = parseInt(dateKey.substring(4, 6)), d = parseInt(dateKey.substring(6, 8));
    isCooling = (m === 7 || m === 8 || (m === 9 && d <= 20));
    
    const banner = document.getElementById('season-banner');
    banner.style.display = 'block';
    banner.className = `season-info ${isCooling ? 'cooling-active' : 'normal-active'}`;
    banner.innerHTML = `<strong>${isCooling ? '❄️ 냉방 시즌' : '☀️ 정상 시즌'}</strong> 기준 적용 (${m || '?'}월 ${d || '?'}일 기준)`;

    if (currentTab === 'hvac') {
        const sheet = wb.Sheets[wb.SheetNames.find(n => n.includes("장비")) || wb.SheetNames[0]];
        currentLine === 'line1' ? processL1(sheet) : processL2(sheet);
    } else {
        const sheet = wb.Sheets[wb.SheetNames.find(n => n.includes("공기청정기")) || wb.SheetNames[0]];
        processAirPurifier(sheet);
    }
}

// --- [공용 판정 도우미] ---
function analyze(val, target, station, type) {
    if (station === "문양") return { s: 'ok', c: '' };
    if (!val || val === '0' || val === '-') return { s: 'critical', c: 'critical-val' };
    const h = parseH(val);

    if (type === 'exhaust') {
        if (h >= 0.5) return { s: 'ok', c: '' }; // 30분 이상 OK
        if (h <= 0.25) return { s: 'critical', c: 'critical-val' }; // 15분 이하 심각
        return { s: 'warning', c: 'bad-val' };
    }
    // 공기청정기 및 공조기 급기
    if (h <= target * 0.5) return { s: 'critical', c: 'critical-val' };
    return (h >= target - CONFIG.TOLERANCE && h <= target + CONFIG.TOLERANCE) ? { s: 'ok', c: '' } : { s: 'warning', c: 'bad-val' };
}

// --- [공기청정기 추출 및 판정] ---
function processAirPurifier(sheet) {
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const data = [];
    let curStation = "";

    for (let r = 0; r <= range.e.r; r++) {
        let label = getCV(sheet, r, 1) || getCV(sheet, r, 0);
        let cleanLabel = String(label).replace(/\s+/g, '');
        let val = getCV(sheet, r, 4);

        if (cleanLabel.includes("가동자료_")) {
            curStation = cleanLabel.split("_")[1];
            continue;
        }

        // 호기(숫자) 감지 및 17시간 기준 판정
        if (curStation && /^\d+$/.test(cleanLabel)) {
            const res = analyze(val, CONFIG.AIR_PURIFIER_STD, curStation, 'supply');
            let stObj = data.find(x => x.name === curStation);
            if (!stObj) {
                stObj = { name: curStation, units: [], isAb: false, isCri: false };
                data.push(stObj);
            }
            stObj.units.push({ label: cleanLabel + "호기", val: val || "0", res });
            if (res.s !== 'ok') stObj.isAb = true;
            if (res.s === 'critical') stObj.isCri = true;
        }
    }
    renderAir(data);
}

function renderAir(data) {
    const abnormal = data.filter(d => d.isAb);
    const build = (list, isSum) => {
        if (list.length === 0 && isSum) return `<div class="summary-container" style="border-color:var(--success); color:var(--success); font-weight:bold;">✅ 모든 공기청정기가 17시간 기준에 맞춰 정상 가동 중입니다.</div>`;
        let h = `<div class="section-title" style="color:${isSum?'var(--danger)':'var(--primary)'}">${isSum?'⚠️ 가동 이상 공기청정기 요약':'📋 전체 공기청정기 현황'}</div><div class="table-wrapper"><table><thead><tr><th style="width:140px;">역사명</th><th>장비 상세 (호기: 가동시간)</th><th style="width:120px;">판정</th></tr></thead><tbody>`;
        list.forEach(d => {
            h += `<tr><td class="st-name">${d.name}</td><td style="text-align:left; padding-left:20px;">`;
            d.units.forEach(u => {
                h += `<span class="badge ${u.res.c || (u.res.s==='warning'?'badge-warning':'badge-success')}" style="margin-right:8px; margin-bottom:4px; border:1px solid #ddd;">${u.label}: ${u.val}</span>`;
            });
            h += `</td><td><span class="badge badge-${d.isCri?'danger':'warning'}">${d.isCri?'심각':'확인필요'}</span></td></tr>`;
        });
        return h + `</tbody></table></div><br>`;
    };
    document.getElementById('summary-area').innerHTML = build(abnormal, true);
    document.getElementById('full-list-area').innerHTML = build(data, false);
}

// --- [공조기(HVAC) 로직 - 기존 유지 및 정제] ---
function processL1(sheet) {
    const data = [];
    const rules = isCooling ? CONFIG.RULES_COOLING : CONFIG.RULES_NORMAL;
    const range = XLSX.utils.decode_range(sheet['!ref']);
    [4, 5].forEach(col => {
        let name = (col === 4) ? "설화명곡" : "화원";
        data.push(getL1Obj(sheet, name, col, 81, 82, 89, 90, rules));
    });
    for (let c = 4; c <= range.e.c; c++) {
        let n = String(sheet[XLSX.utils.encode_cell({r:0, c:c})]?.v || '').replace(/\s+/g, '');
        if(!n || ["합계","명곡","화원"].includes(n)) continue;
        data.push(getL1Obj(sheet, n, c, 5, 6, 13, 14, rules));
    }
    renderHVAC(data, 'L1');
}

function processL2(sheet) {
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const data = [];
    let cur = null;
    const rules = isCooling ? CONFIG.RULES_COOLING : CONFIG.RULES_NORMAL;
    for (let r = 0; r <= range.e.r; r++) {
        let label = String(getCV(sheet, r, 0) + getCV(sheet, r, 1) + getCV(sheet, r, 2)).replace(/\s+/g, '');
        let val = getCV(sheet, r, 4);
        const found = CONFIG.LINE2_STATIONS.find(st => label.includes(st) && (label.includes("가동") || label.length < 15));
        if (found) {
            if (cur) data.push(formatL2(cur, rules));
            cur = { name: found, ls:null, lue:null, lle:null, rs:null, rue:null, rle:null };
            continue;
        }
        if (cur && label.includes("승강")) {
            const isL = label.includes("좌") || label.includes("시점");
            if (label.includes("급기")) { if(isL) cur.ls = val; else cur.rs = val; }
            else if (label.includes("배기")) {
                if (label.includes("상부") || (!label.includes("상부") && !label.includes("하부"))) { if(isL) cur.lue = val; else cur.rue = val; }
                else if (label.includes("하부")) { if(isL) cur.lle = val; else cur.rle = val; }
            }
        }
    }
    if (cur) data.push(formatL2(cur, rules));
    renderHVAC(data, 'L2');
}

function getL1Obj(sheet, name, col, ls, le, rs, re, rules) {
    const type = CONFIG.STATION_MAP[name] || "default";
    const target = rules[type] || rules["default"];
    const getV = (r) => sheet[XLSX.utils.encode_cell({r:r, c:col})]?.w || sheet[XLSX.utils.encode_cell({r:r, c:col})]?.v;
    const raw = [getV(ls), getV(le), getV(rs), getV(re)];
    const res = [analyze(raw[0], target.s, name, 'supply'), analyze(raw[1], target.ue, name, 'exhaust'), analyze(raw[2], target.s, name, 'supply'), analyze(raw[3], target.ue, name, 'exhaust')];
    return { name, raw, res, isAb: res.some(r => r.s !== 'ok'), isCri: res.some(r => r.s === 'critical') };
}

function formatL2(d, rules) {
    const target = rules["default"];
    const raw = [d.ls, d.lue, d.lle, d.rs, d.rue, d.rle];
    const res = [analyze(raw[0], target.s, d.name, 'supply'), analyze(raw[1], target.ue, d.name, 'exhaust'), analyze(raw[2], target.le, d.name, 'exhaust'), analyze(raw[3], target.s, d.name, 'supply'), analyze(raw[4], target.ue, d.name, 'exhaust'), analyze(raw[5], target.le, d.name, 'exhaust')];
    return { name: d.name, raw, res, isAb: res.some(r => r.s !== 'ok'), isCri: res.some(r => r.s === 'critical') };
}

function renderHVAC(data, type) {
    const abnormal = data.filter(d => d.isAb);
    const headers = type === 'L1' ? ['역사명', '시점급기', '시점배기', '종점급기', '종점배기', '판정'] : ['역사명', '시점급기', '시점상부', '시점하부', '종점급기', '종점상부', '종점하부', '판정'];
    const build = (list, isSum) => {
        if (list.length === 0 && isSum) return `<div class="summary-container" style="border-color:var(--success); color:var(--success); font-weight:bold;">✅ 모든 승강장 공조기가 스케줄에 맞춰 정상 가동 중입니다.</div>`;
        let h = `<div class="section-title" style="color:${isSum?'var(--danger)':'var(--primary)'}">${isSum?'⚠️ 이상 발생 역사 요약':'📋 전체 점검 결과'}</div><div class="table-wrapper"><table><thead><tr>${headers.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>`;
        list.forEach(d => {
            h += `<tr><td class="st-name">${d.name}</td>`;
            d.raw.forEach((v, i) => { h += `<td class="${d.res[i].c}">${v || '0'}</td>`; });
            h += `<td><span class="badge badge-${d.isCri?'danger':(d.isAb?'warning':'success')}">${d.isCri?'심각':(d.isAb?'확인필요':'정상')}</span></td></tr>`;
        });
        return h + `</tbody></table></div><br>`;
    };
    document.getElementById('summary-area').innerHTML = build(abnormal, true);
    document.getElementById('full-list-area').innerHTML = build(data, false);
}

function getCV(s, r, c) { const cell = s[XLSX.utils.encode_cell({r:r, c:c})]; return cell ? cell.w || cell.v : ""; }
function parseH(v) { if(!v) return 0; if(typeof v === 'number') return v * 24; const p = String(v).split(':'); return p.length < 2 ? parseFloat(v)||0 : parseInt(p[0]) + parseInt(p[1])/60; }
