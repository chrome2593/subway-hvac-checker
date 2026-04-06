let currentLine = '';
let isCooling = false;

function showApp() { document.getElementById('home-view').classList.add('hidden'); document.getElementById('app-view').classList.remove('hidden'); }
function showHome() { location.reload(); }

function selectLine(line) {
    currentLine = line;
    document.getElementById('line-selector').classList.add('hidden');
    document.getElementById('main-content').classList.remove('hidden');
    document.getElementById('line-indicator').innerText = line === 'line1' ? '🔵 1호선 점검 중' : '🟢 2호선 점검 중';
}

document.getElementById('excelFile').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
        const workbook = XLSX.read(evt.target.result, { type: 'binary', cellDates: true });
        const sheetName = workbook.SheetNames.find(n => n.includes("장비")) || workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        let dateKey = file.name.replace(/[^0-9]/g, "").substring(0, 8);
        let m = parseInt(dateKey.substring(4, 6)), d = parseInt(dateKey.substring(6, 8));
        if(isNaN(m)) {
            let dv = sheet['C2'] ? sheet['C2'].v : null;
            if(dv instanceof Date) { m = dv.getMonth()+1; d = dv.getDate(); }
        }
        
        isCooling = (m === 7 || m === 8 || (m === 9 && d <= 20));
        const banner = document.getElementById('season-banner');
        banner.style.display = 'block';
        banner.className = `season-info ${isCooling ? 'cooling-active' : 'normal-active'}`;
        banner.innerHTML = `<strong>${isCooling ? '❄️ 냉방 시즌' : '☀️ 정상 시즌'}</strong> 기준 적용 (${m || '?'}월 ${d || '?'}일 기준)`;

        currentLine === 'line1' ? processL1(sheet) : processL2(sheet);
    };
    reader.readAsBinaryString(file);
});

function analyze(val, target, station, type) {
    if (station === "문양") return { s: 'ok', c: '' };
    if (!val || val === '0' || val === '-') return { s: 'critical', c: 'critical-val' };
    
    const h = (typeof val === 'number') ? val * 24 : (String(val).split(':').length < 2 ? parseFloat(val) : parseInt(String(val).split(':')[0]) + parseInt(String(val).split(':')[1])/60);

    if (type === 'exhaust') {
        if (h >= 0.5) return { s: 'ok', c: '' }; 
        if (h <= 0.25) return { s: 'critical', c: 'critical-val' }; 
        return { s: 'warning', c: 'bad-val' };
    }
    if (h <= target * 0.5) return { s: 'critical', c: 'critical-val' };
    return (h >= target - CONFIG.TOLERANCE && h <= target + CONFIG.TOLERANCE) ? { s: 'ok', c: '' } : { s: 'warning', c: 'bad-val' };
}

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
    render(data, 'L1');
}

function getL1Obj(sheet, name, col, ls, le, rs, re, rules) {
    const type = CONFIG.STATION_MAP[name] || "default";
    const target = rules[type] || rules["default"];
    const getV = (r) => sheet[XLSX.utils.encode_cell({r:r, c:col})] ? (sheet[XLSX.utils.encode_cell({r:r, c:col})].w || sheet[XLSX.utils.encode_cell({r:r, c:col})].v) : "0";
    const raw = [getV(ls), getV(le), getV(rs), getV(re)];
    const res = [analyze(raw[0], target.s, name, 'supply'), analyze(raw[1], target.ue, name, 'exhaust'), analyze(raw[2], target.s, name, 'supply'), analyze(raw[3], target.ue, name, 'exhaust')];
    return { name, target, raw, res, isAb: res.some(r => r.s !== 'ok'), isCri: res.some(r => r.s === 'critical') };
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
    render(data, 'L2');
}

function formatL2(d, rules) {
    const target = rules["default"];
    const raw = [d.ls, d.lue, d.lle, d.rs, d.rue, d.rle];
    const res = [analyze(raw[0], target.s, d.name, 'supply'), analyze(raw[1], target.ue, d.name, 'exhaust'), analyze(raw[2], target.le, d.name, 'exhaust'), analyze(raw[3], target.s, d.name, 'supply'), analyze(raw[4], target.ue, d.name, 'exhaust'), analyze(raw[5], target.le, d.name, 'exhaust')];
    return { name: d.name, target, raw, res, isAb: res.some(r => r.s !== 'ok'), isCri: res.some(r => r.s === 'critical') };
}

function render(data, type) {
    const abnormal = data.filter(d => d.isAb);
    const headers = type === 'L1' ? ['역사명', '기준', '시점급기', '시점배기', '종점급기', '종점배기', '판정'] : ['역사명', '기준', '시점급기', '시점상부', '시점하부', '종점급기', '종점상부', '종점하부', '판정'];
    
    const build = (list, isSum) => {
        if(list.length === 0 && isSum) return `<div class="summary-container" style="border-color:var(--success);"><div class="section-title" style="color:var(--success)">✅ 모든 역사가 정상 가동 중입니다.</div></div>`;
        let h = `<div class="${isSum?'summary-container':'full-list-container'}">`;
        h += `<div class="section-title" style="color:${isSum?'var(--danger)':'var(--primary)'}">${isSum?'⚠️ 이상 발생 요약':'📋 전체 점검 결과'}</div>`;
        h += `<div class="table-container"><table><thead><tr>${headers.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>`;
        list.forEach(d => {
            const tStr = type === 'L1' ? `급${d.target.s}/배${d.target.ue}` : `급${d.target.s}/상${d.target.ue}/하${d.target.le}`;
            h += `<tr><td class="st-name">${d.name}</td><td style="font-size:0.7rem; color:#888">${tStr}</td>`;
            d.raw.forEach((v, i) => { h += `<td class="${d.res[i].c}">${v || '0'}</td>`; });
            h += `<td><span class="badge badge-${d.isCri?'danger':(d.isAb?'warning':'success')}">${d.isCri?'심각':(d.isAb?'확인필요':'정상')}</span></td></tr>`;
        });
        return h + `</tbody></table></div></div>`;
    };
    document.getElementById('summary-area').innerHTML = build(abnormal, true);
    document.getElementById('full-list-area').innerHTML = build(data, false);
}

function getCV(s, r, c) { const cell = s[XLSX.utils.encode_cell({r:r, c:c})]; return cell ? (cell.w || cell.v) : ""; }
