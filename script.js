/* script.js 중 renderAll 함수 부분 */

function toggleSection(id) {
    const el = document.getElementById(id);
    el.classList.toggle('show-details');
    const btn = event.target;
    btn.innerText = el.classList.contains('show-details') ? '시간 숨기기' : '상세 시간 보기';
}

function renderAll(hvac, air) {
    const hLabels = currentLine === 'line1' ? ["시급", "시배", "종급", "종배"] : ["시급", "시상", "시하", "종급", "종상", "종하"];
    const b = CONFIG.BRANCHES[currentLine];

    // 1. 요약 섹션 (기존 유지)
    renderSummary(hvac, air, hLabels, b);

    // 2. 통합 결과 렌더링 (HVAC row -> Air row 순서로 수평 일치)
    const leftH = hvac.filter(d => b.left.stations.includes(d.name));
    const rightH = hvac.filter(d => b.right.stations.includes(d.name));
    const leftA = air.filter(d => b.left.stations.includes(d.name));
    const rightA = air.filter(d => b.right.stations.includes(d.name));

    let html = `
        <div class="section-header">
            <h2 class="section-title">📊 승강장 공조기 분석 결과</h2>
            <button class="toggle-btn" onclick="toggleSection('hvac-master-row')">상세 시간 보기</button>
        </div>
        <div id="hvac-master-row" class="equipment-row">
            <div class="branch-section">
                <div class="branch-label">${b.left.name}</div>
                ${buildHVACTable(leftH)}
            </div>
            <div class="branch-section">
                <div class="branch-label">${b.right.name}</div>
                ${buildHVACTable(rightH)}
            </div>
        </div>

        <div class="section-header">
            <h2 class="section-title">🌬️ 공기청정기 분석 결과</h2>
            <button class="toggle-btn" onclick="toggleSection('air-master-row')">상세 시간 보기</button>
        </div>
        <div id="air-master-row" class="equipment-row">
            <div class="branch-section">
                <div class="branch-label">${b.left.name}</div>
                ${buildAirTable(leftA)}
            </div>
            <div class="branch-section">
                <div class="branch-label">${b.right.name}</div>
                ${buildAirTable(rightA)}
            </div>
        </div>
    `;
    document.getElementById('full-list-area').innerHTML = html;
}

function buildHVACTable(data) {
    const hds = currentLine === 'line1' ? ['역사', '시급', '시배', '종급', '종배', '판정'] : ['역사', '시급', '시상', '시하', '종급', '종상', '종하', '판정'];
    let h = `<div class="table-wrapper"><table><thead><tr>${hds.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>`;
    data.forEach(d => {
        h += `<tr><td class="st-name">${d.name}</td>`;
        d.raw.forEach((v, i) => { 
            h += `<td class="${d.res[i].c}"><span class="badge badge-${d.res[i].s === 'ok' ? 'success' : (d.res[i].s === 'warning' ? 'warning' : 'danger')}">${d.res[i].s === 'ok' ? '정상' : (d.res[i].s === 'warning' ? '이상' : '심각')}</span><div class="time-val">${formatToHMS(v)}</div></td>`; 
        });
        h += `<td><span class="badge badge-${d.isCri?'danger':(d.isAb?'warning':'success')}">${d.isCri?'심각':(d.isAb?'이상':'정상')}</span></td></tr>`;
    });
    return h + `</tbody></table></div>`;
}

function buildAirTable(data) {
    let h = `<div class="table-wrapper"><table><thead><tr><th style="width:85px;">역사</th><th>장비 현황 및 가동시간</th></tr></thead><tbody>`;
    data.forEach(d => {
        h += `<tr><td class="st-name">${d.name}</td><td><div class="units-grid">`;
        d.units.forEach(u => { 
            h += `<div class="unit-box ${u.res.c}"><strong>${u.label}</strong><span class="unit-time">${formatToHMS(u.val)}</span></div>`; 
        });
        h += `</div></td></tr>`;
    });
    return h + `</tbody></table></div>`;
}

/* 요약 렌더링 유틸리티 (기존 로직 기반) */
function renderSummary(hvac, air, hLabels, b) {
    const hvacCri = hvac.filter(d => d.isCri);
    const airCri = air.filter(d => d.isCri);
    const buildSummaryCard = (branch) => {
        const cHi = hvacCri.filter(d => branch.stations.includes(d.name));
        const cAi = airCri.filter(d => branch.stations.includes(d.name));
        const isOk = (cHi.length === 0 && cAi.length === 0);
        let h = `<div class="summary-card ${isOk ? 'ok' : ''}"><div class="summary-title">📍 ${branch.name}</div>`;
        if (isOk) h += `<div style="color:var(--success); font-weight:700;">✅ 이상 항목 없음</div>`;
        else {
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
        }
        return h + `</div>`;
    };
    document.getElementById('summary-area').innerHTML = `<div class="summary-section-title">⚠️ 통합 이상 내역 요약 (심각 항목)</div><div class="summary-area-grid">${buildSummaryCard(b.left)}${buildSummaryCard(b.right)}</div>`;
}

/* 헬퍼 함수들 (기존 유지) */
function getCV(s, r, c) { const cell = s[XLSX.utils.encode_cell({r:r, c:c})]; return cell ? cell.w || cell.v : ""; }
function parseH(v) { if(!v) return 0; if(typeof v === 'number') return v * 24; const p = String(v).split(':'); return p.length < 2 ? parseFloat(v)||0 : parseInt(p[0]) + parseInt(p[1])/60; }
function cleanText(s) { return String(s || "").replace(/\s+/g, ""); }
function formatToHMS(v) { if(!v||v==='0'||v===0||v==='-') return "0:00:00"; let ts; if(typeof v==='number') ts=Math.round(v*24*3600); else if(typeof v==='string'&&v.includes(':')){ const p=v.split(':'); ts=(parseInt(p[0])||0)*3600+(parseInt(p[1])||0)*60+(parseInt(p[2])||0); } else { const n=parseFloat(v); if(isNaN(n)) return "0:00:00"; ts=Math.round(n*3600); } const h=Math.floor(ts/3600), m=Math.floor((ts%3600)/60), s=ts%60; return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
// (getL1HVAC, getL2HVAC, getAirPurifierData 등 추출 로직은 이전 답변과 동일하게 유지됩니다.)
