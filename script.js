// renderAll 함수 내의 buildSummary 부분만 확인 및 교체하세요.
const buildSummary = (br) => {
    const cH = hvac.filter(d => br.stations.includes(d.name) && d.isCri);
    const cA = air.filter(d => br.stations.includes(d.name) && d.isCri);
    const cV = vent.filter(d => br.stations.includes(d.name) && d.isCri);
    
    // 이상이 하나라도 있는지 체크
    const isOk = (cH.length === 0 && cA.length === 0 && cV.length === 0);

    // 카드 시작 (isOk일 때 'ok' 클래스 추가)
    let h = `<div class="summary-card ${isOk ? 'ok' : ''}"> <div class="summary-title">📍 ${br.name}</div>`;
    
    if (isOk) {
        return h + `<div style="color:var(--success); font-weight:700; font-size:1.1rem;">✅ 모든 관할 장비 정상 가동 중</div></div>`;
    }

    // 승강장 공조기 이상 내역
    if (cH.length > 0) {
        h += `<span class="summary-group-label">[승강장 공조기]</span><div class="summary-badge-container">`;
        cH.forEach(d => { 
            d.res.forEach((r, i) => { 
                if (r.s === 'critical') {
                    const label = (currentLine === 'line1') ? ["시급", "시배", "종급", "종배"][i] : ["시급", "시상", "시하", "종급", "종상", "종하"][i];
                    h += `<span class="badge badge-danger">${d.name} ${label} (${formatToHMS(d.raw[i])})</span> `; 
                }
            }); 
        });
        h += `</div>`;
    }

    // 환기실 송풍기 이상 내역
    if (cV.length > 0) {
        h += `<span class="summary-group-label">[환기실 송풍기]</span><div class="summary-badge-container">`;
        cV.forEach(d => { 
            d.res.forEach((r, i) => { 
                if (r.s === 'critical') {
                    // 1호선은 고정 라벨, 2호선은 데이터에서 라벨 추출
                    const label = (currentLine === 'line1') ? ["시급", "시배", "종급", "종배"][i] : (d.unitLabels ? d.unitLabels[i] : '장비');
                    h += `<span class="badge badge-danger">${d.name} ${label} (${formatToHMS(d.raw[i])})</span> `; 
                }
            }); 
        });
        h += `</div>`;
    }

    // 공기청정기 이상 내역
    if (cA.length > 0) {
        h += `<span class="summary-group-label">[공기청정기]</span><div class="summary-badge-container">`;
        cA.forEach(d => { 
            d.units.forEach(u => { 
                if (u.res.s === 'critical') h += `<span class="badge badge-danger">${d.name} ${u.label} (${formatToHMS(u.val)})</span> `; 
            }); 
        });
        h += `</div>`;
    }
    
    return h + `</div>`;
};
