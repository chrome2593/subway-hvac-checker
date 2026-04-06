// analyze 함수 내 공기청정기 판정 부분 수정
function analyze(val, target, station, type, isAirPurifier = false) {
    if (station === "문양") return { s: 'ok', c: '' };
    if (!val || val === '0' || val === '-' || val === '') return { s: 'critical', c: 'critical-val' };
    
    const h = parseH(val);

    // [수정] 공기청정기 판정 기준
    if (isAirPurifier) {
        if (h <= target * 0.5) return { s: 'critical', c: 'critical-val' }; // 8.5시간 미만 심각
        if (h >= CONFIG.AIR_PURIFIER_LIMIT) return { s: 'ok', c: '' };     // 14시간 이상은 정상 (요청 반영)
        return { s: 'warning', c: 'bad-val' };                           // 그 사이(8.5~14)는 확인필요
    }

    if (type === 'exhaust') {
        if (h >= 0.5) return { s: 'ok', c: '' }; 
        if (h <= 0.25) return { s: 'critical', c: 'critical-val' }; 
        return { s: 'warning', c: 'bad-val' };
    }
    
    if (h <= target * 0.5) return { s: 'critical', c: 'critical-val' };
    return (h >= target - CONFIG.TOLERANCE && h <= target + CONFIG.TOLERANCE) ? { s: 'ok', c: '' } : { s: 'warning', c: 'bad-val' };
}
