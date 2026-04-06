// config.js
const CONFIG = {
    // 1. 시즌 설정
    SEASON: {
        COOLING_START: { month: 7, day: 1 },
        COOLING_END: { month: 9, day: 20 }
    },
    
    // 2. 오차 및 판정 기준
    TOLERANCE: 40 / 60, // 40분
    EXHAUST_OK: 0.5,    // 배기 30분 이상 정상
    EXHAUST_CRITICAL: 0.25, // 배기 15분 이하 심각
    
    // 3. 정상 시즌 기준 (s:급기, ue:상부배기/배기, le:하부배기)
    RULES_NORMAL: {
        "type1": { s: 17, ue: 1, le: 0.5 },
        "type2": { s: 15, ue: 1, le: 0.5 },
        "type3": { s: 15.5, ue: 1, le: 0.5 },
        "default": { s: 16.5, ue: 1, le: 0.5 }
    },

    // 4. 냉방 시즌 기준 (7/1 ~ 9/20)
    RULES_COOLING: {
        "type1": { s: 12, ue: 0.5, le: 0.5 },
        "type2": { s: 9, ue: 0.5, le: 0.5 },
        "default": { s: 9, ue: 0.5, le: 0.5 }
    },

    // 5. 역사별 유형 매핑 (1호선 위주)
    L1_TYPES: {
        "화원": "type1", "반야월": "type1", "각산": "type1",
        "대곡": "type2", "월촌": "type2", "송현": "type2", "교대": "type2", "명덕": "type2", "동구청": "type2", "방촌": "type2", "용계": "type2", "율하": "type2", "신기": "type2",
        "반월당": "type3"
    }
};
