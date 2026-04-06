const CONFIG = {
    SEASON: {
        COOLING_START: { month: 7, day: 1 },
        COOLING_END: { month: 9, day: 20 }
    },
    TOLERANCE: 40 / 60, // 급기 오차 40분

    // [비냉방 시즌 기준]
    RULES_NORMAL: {
        "type1": { s: 17, ue: 1, le: 0.5 },
        "type2": { s: 15, ue: 1, le: 0.5 },
        "type3": { s: 15.5, ue: 1, le: 0.5 },
        "default": { s: 16.5, ue: 1, le: 0.5 }
    },
    // [냉방 시즌 기준]
    RULES_COOLING: {
        "type1": { s: 12, ue: 0.5, le: 0.5 },
        "type2": { s: 9, ue: 0.5, le: 0.5 },
        "default": { s: 9, ue: 0.5, le: 0.5 }
    },

    // 역사별 유형 매핑 (시즌에 따라 유동적으로 할당됨)
    GET_STATION_TYPE: (name, isCooling) => {
        const n = name.replace(/\s+/g, '');
        if (isCooling) {
            if (["화원", "반야월", "각산"].includes(n)) return "type1";
            if (["대곡", "월촌", "송현", "교대", "명덕", "동구청", "방촌", "용계", "율하", "신기"].includes(n)) return "type2";
            return "default";
        } else {
            if (["명덕", "청라언덕", "반월당(2호선)", "반월당"].includes(n)) return "type1";
            if (["현충로", "중앙로", "안심", "다사", "두류", "담티", "영남대"].includes(n)) return "type2";
            if (["반월당(1호선)"].includes(n)) return "type3";
            return "default";
        }
    }
};
