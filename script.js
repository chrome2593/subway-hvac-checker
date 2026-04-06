:root {
    --primary: #0054a6; --danger: #ef4444; --warning: #f59e0b;
    --success: #10b981; --bg: #f4f7fa;
}
body { margin: 0; font-family: 'Pretendard', sans-serif; background: var(--bg); }
.hidden { display: none !important; }

/* Hero Page */
.hero-view { height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #002b5a 0%, #0054a6 100%); color: white; text-align: center; }
.hero-content h1 { font-size: 2.8rem; margin-bottom: 30px; }
.main-start-btn { padding: 15px 40px; font-size: 1.2rem; font-weight: bold; color: var(--primary); background: white; border: none; border-radius: 50px; cursor: pointer; transition: 0.3s; }

/* App UI */
.app-header { padding: 15px 20px; background: white; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e2e8f0; }
.container { max-width: 1200px; margin: 0 auto; padding: 20px; }
.selector-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 40px 0; }
.line-card { padding: 50px; text-align: center; border-radius: 15px; cursor: pointer; color: white; font-size: 1.5rem; font-weight: bold; }
.line-card.l1 { background: #d93d3d; }
.line-card.l2 { background: #00aa4c; }

.upload-section { background: white; padding: 30px; border-radius: 15px; margin-bottom: 20px; text-align: center; border: 2px dashed #cbd5e0; }
.season-info { padding: 15px; border-radius: 10px; margin-bottom: 15px; text-align: center; font-weight: bold; }
.cooling-active { background: #e0f2fe; color: #0077cc; }
.normal-active { background: #f1f5f9; color: #64748b; }

/* Table & Badges */
.summary-container { background: #fff1f2; border: 2px solid var(--danger); padding: 20px; border-radius: 15px; margin-bottom: 30px; }
.table-container { background: white; border-radius: 15px; overflow-x: auto; box-shadow: 0 4px 6px rgba(0,0,0,0.05); margin-bottom: 30px; }
table { width: 100%; border-collapse: collapse; min-width: 900px; }
th { background: #f8fafc; padding: 12px; font-size: 0.8rem; color: #64748b; }
td { padding: 12px; text-align: center; border-bottom: 1px solid #f1f5f9; }
.st-name { font-weight: bold; color: var(--primary); background: #f0f7ff; }
.badge { padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: bold; display: inline-block; }
.badge-success { background: #def7ec; color: #03543f; }
.badge-warning { background: #fef3c7; color: #92400e; }
.badge-danger { background: #fee2e2; color: #991b1b; }
.critical-val { background: #fee2e2 !important; color: #b91c1c !important; font-weight: bold; }
.bad-val { background: #fffbeb; color: #92400e; }
