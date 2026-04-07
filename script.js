// ... (analyze, formatToHMS, getL1HVAC 등 기존 함수 유지) ...

function renderAll(hvac, air) {
    const hvacCri = hvac.filter(d => d.isCri);
    const airCri = air.filter(d => d.isCri);
    const hvacLabels = currentLine === 'line1' ? ["시점급기", "시점배기", "종점급기", "종점배기"] : ["시점급기", "시점상부", "시점하부", "종점급기", "종점상부", "종점하부"];

    // 1. 통합 요약 영역 (기존 유지)
    let sumHtml = `<div class="summary-container"><div class="summary-section-title">⚠️ 통합 이상 내역 요약 (즉시 확인 대상)</div>`;
    if (hvacCri.length === 0 && airCri.length === 0) {
        sumHtml = `<div class="summary-container" style="border-color:var(--success); border-left-color:var(--success); background:#f0fdf4;"><div class="summary-section-title" style="color:var(--success); border-bottom-color:#dcfce7;">✅ 모든 장비 가동 상태가 정상 범위 내에 있습니다.</div></div>`;
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

    // 2. 분소별 상세 결과 (좌우 분할)
    const branchConfig = CONFIG.BRANCHES[currentLine];
    
    // 왼쪽 분소 데이터 필터링
    const leftHvac = hvac.filter(d => branchConfig.left.stations.includes(d.name));
    const leftAir = air.filter(d => branchConfig.left.stations.includes(d.name));
    
    // 오른쪽 분소 데이터 필터링
    const rightHvac = hvac.filter(d => branchConfig.right.stations.includes(d.name));
    const rightAir = air.filter(d => branchConfig.right.stations.includes(d.name));

    let fullHtml = `<div class="split-layout">`;
    
    // --- [좌측 열: 분소 1] ---
    fullHtml += `<div>
                    <div class="branch-title">${branchConfig.left.name}</div>
                    <div class="section-title" style="margin-top:0;">📊 승강장 공조기</div>${buildHVACTable(leftHvac)}
                    <div class="section-title" style="margin-top:40px;">🌬️ 공기청정기</div>${buildAirTable(leftAir)}
                 </div>`;
                 
    // --- [우측 열: 분소 2] ---
    fullHtml += `<div>
                    <div class="branch-title">${branchConfig.right.name}</div>
                    <div class="section-title" style="margin-top:0;">📊 승강장 공조기</div>${buildHVACTable(rightHvac)}
                    <div class="section-title" style="margin-top:40px;">🌬️ 공기청정기</div>${buildAirTable(rightAir)}
                 </div>`;

    fullHtml += `</div>`;
    document.getElementById('full-list-area').innerHTML = fullHtml;
}

// buildHVACTable, buildAirTable 등 나머지 유틸리티 함수는 동일하게 유지
