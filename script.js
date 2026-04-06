let currentLine = '';
let isCooling = false;

function showApp() { document.getElementById('home-view').classList.add('hidden'); document.getElementById('app-view').classList.remove('hidden'); }
function showHome() { location.reload(); }

function selectLine(line) {
    currentLine = line;
    document.getElementById('line-selector').classList.add('hidden');
    document.getElementById('main-content').classList.remove('hidden');
    document.getElementById('line-indicator').innerText = line === 'line1' ? '1호선 점검 중' : '2호선 점검 중';
}

document.getElementById('excelFile').addEventListener('change', function(e) {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (evt) => {
        const workbook = XLSX.read(evt.target.result, { type: 'binary', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames.find(n => n.includes("장비")) || workbook.SheetNames[0]];
        
        let dateKey = file.name.replace(/[^0-9]/g, "").substring(0, 8);
        const month = parseInt(dateKey.substring(4, 6));
        const day = parseInt(dateKey.substring(6, 8));
        
        isCooling = (month === 7 || month === 8 || (month === 9 && day <= 20));
        updateBanner(month, day);

        currentLine === 'line1' ? processL1(sheet) : processL2(sheet);
    };
    reader.readAsBinaryString(file);
});

function updateBanner(m, d) {
    const b = document.getElementById('season-banner');
    b.style.display = 'block';
    b.className = isCooling ? "cooling-active" : "normal-active";
    b.innerHTML = `<strong>${isCooling ? '❄️ 냉방 시즌' : '☀️ 정상 시즌'}</strong> (${m}월 ${d}일 기준 적용)`;
}

function analyze(val, target, station, type) {
    if (station === "문양") return { s: 'ok', c: '' };
    if (!val || val === '0' || val === '-') return { s: 'critical', c: 'critical-val' };
    const h = (typeof val === 'number') ? val * 24 : (val.split(':').length < 2 ? parseFloat(val) : parseInt(val.split(':')[0]) + parseInt(val.split(':')[1])/60);

    if (type === 'exhaust') {
        if (h >= 0.5) return { s: 'ok', c: '' }; // 30분 이상 정상
        if (h <= 0.25) return { s: 'critical', c: 'critical-val' }; // 15분 이하 심각
        return { s: 'warning', c: 'bad-val' };
    }
    if (h <= target * 0.5) return { s: 'critical', c: 'critical-val' };
    return (h >= target - CONFIG.TOLERANCE) ? { s: 'ok', c: '' } : { s: 'warning', c: 'bad-val' };
}

// [1호선/2호선 데이터 처리 로직은 이전과 동일하게 유지하되 CONFIG 참조하도록 수정]
// ... (생략된 processL1, processL2 함수는 CONFIG.RULES_COOLING 등을 사용하도록 구현)
