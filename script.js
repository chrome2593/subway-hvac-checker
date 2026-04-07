// renderAll 함수만 이 내용으로 교체하세요. 나머지 코드는 그대로 유지하시면 됩니다.

function renderAll(hvac, air) {
    const hvacCri = hvac.filter(d => d.isCri);
    const airCri = air.filter(d => d.isCri);
    const hLabels = currentLine === 'line1' ? ["시점급기", "시점배기", "종점급기", "종점배기"] : ["시점급기", "시점상부", "시점하부", "종점급기", "종점상부", "종점하부"];

    const b = CONFIG.BRANCHES[currentLine];
    const summaryArea = document.getElementById('summary-area');

    // 1. 이상 내역이 아예 없는 경우
    if (hvacCri.length === 0 && airCri.length === 0) {
        summaryArea.innerHTML = `
            <div class="summary-container" style="border-color:var(--success); border-left-color:var(--success); background:#f0fdf4;">
                <div class="summary-section-title" style="color:var(--success); border-bottom:none; margin-bottom:0;">
                    ✅ 모든 관할 구역 장비가 정상 가동 중입니다.
                </div>
            </div>`;
    } else {
        // 2. 이상 내역을 분소별로 나눔
        const getBranchSum = (branchStations) => {
            let html = "";
            const criH = hvacCri.filter(d => branchStations.includes(d.name));
            const criA = airCri.filter(d => branchStations.includes(d.name));

            if (criH.length === 0 && criA.length === 0) {
                return `<div style="color:#94a3b8; font-weight:600; padding:10px;">이상 항목 없음</div>`;
            }

            if (criH.length > 0) {
                html += `<div style="margin-bottom:15px;"><strong>[승강장 공조기]</strong><div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:6px;">`;
                criH.forEach(d => {
                    d.res.forEach((r, i) => {
                        if (r.s === 'critical') html += `<span class="badge badge-danger">${d.name} ${hLabels[i]} (${formatToHMS(d.raw[i])})</span>`;
                    });
                });
                html += `</div></div>`;
            }
            if (criA.length > 0) {
                html += `<div><strong>[공기청정기]</strong><div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:6px;">`;
                criA.forEach(d => {
                    d.units.forEach(u => {
                        if (u.res.s === 'critical') html += `<span class="badge badge-danger">${d.name} ${u.label} (${formatToHMS(u.val)})</span>`;
                    });
                });
                html += `</div></div>`;
            }
            return html;
        };

        summaryArea.innerHTML = `
            <div class="summary-container">
                <div class="summary-section-title">⚠️ 통합 이상 내역 요약 (심각 항목)</div>
                <div class="summary-grid">
                    <div class="summary-branch-section">
                        <div class="summary-branch-name">📍 ${b.left.name}</div>
                        ${getBranchSum(b.left.stations)}
                    </div>
                    <div class="summary-branch-section">
                        <div class="summary-branch-name">📍 ${b.right.name}</div>
                        ${getBranchSum(b.right.stations)}
                    </div>
                </div>
            </div>`;
    }

    // 하단 상세 결과 렌더링 (기존 유지)
    const leftH = hvac.filter(d => b.left.stations.includes(d.name));
    const leftA = air.filter(d => b.left.stations.includes(d.name));
    const rightH = hvac.filter(d => b.right.stations.includes(d.name));
    const rightA = air.filter(d => b.right.stations.includes(d.name));

    let fHtml = `<div class="split-layout">`;
    fHtml += `<div class="branch-column"><div class="branch-title">${b.left.name}</div><div class="section-title">승강장 공조기</div>${buildHVACTable(leftH)}<div class="section-title">공기청정기</div>${buildAirTable(leftA)}</div>`;
    fHtml += `<div class="branch-column"><div class="branch-title">${b.right.name}</div><div class="section-title">승강장 공조기</div>${buildHVACTable(rightH)}<div class="section-title">공기청정기</div>${buildAirTable(rightA)}</div>`;
    fHtml += `</div>`;
    document.getElementById('full-list-area').innerHTML = fHtml;
}
