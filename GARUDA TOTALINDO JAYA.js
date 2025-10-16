// ==UserScript==
// @name         Auto Download Faktur Pajak v1.3
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Tambah tombol Download All/Selected dengan safety caps.
// @author       Antoni
// @match        https://coretaxdjp.pajak.go.id/*
// @match        https://*.pajak.go.id/*
// @run-at       document-idle
// @grant        none
// @inject-into  page
// @noframes     false
// ==/UserScript==

(function() {
    'use strict';

    // ========= CONFIG =========
    // Isi dengan teks user yang muncul di UI jika ingin batasi operasi.
    // Untuk testing cepat, biarkan kosong => script aktif untuk semua user.
    const DOWNLOAD_DELAY_MS = 1500; // jeda antar-download (ms)
    const MAX_DOWNLOADS_PER_RUN = 500; // safety cap
    const INITIAL_INJECT_DELAY_MS = 5000; // tunggu awal untuk SPA load
    const ENABLE_LOG = true; // set false untuk matikan debug console
    const POLL_INTERVAL_MS = 1200; // polling fallback interval
    const POLL_TIMEOUT_MS = 60000; // polling timeout (stop setelah ini)

    function log(...args) { if (ENABLE_LOG) console.log("[AutoDL v1.3-fix]", ...args); }

    // ========= HELPERS =========
    function wait(ms) { return new Promise(res => setTimeout(res, ms)); }

function isUserAllowed() {
  const txt = document.body?.innerText || "";
  const allowed = txt.toUpperCase().includes("GARUDA TOTALINDO JAYA");
  console.log("Detected user:", txt.slice(0, 200)); // tampilkan sebagian isi halaman untuk debug
  console.log("Allowed:", allowed);
  return allowed;
}


    function normalizeRows() {
        let rows = Array.from(document.querySelectorAll('table tbody tr'));
        if (rows.length) return rows;
        rows = Array.from(document.querySelectorAll('.list-group-item, .item-row, .row-item'));
        return rows;
    }

    function findDownloadTrigger(row) {
        if (!row) return null;
        const candidates = [
            'button[title*="Unduh"]',
            'button[title*="unduh"]',
            'button[title*="Download"]',
            'a[download]',
            'a[href*="/download/"]',
            '.btn-download',
            '.download-link',
            'button.btn.btn-default',
            'a.btn'
        ];
        for (const sel of candidates) {
            const el = row.querySelector(sel);
            if (el) return el;
        }
        const textMatch = Array.from(row.querySelectorAll('button, a, span')).find(el => {
            const t = (el.innerText || el.title || "").toLowerCase();
            return /pdf|download|unduh|xml|file/.test(t);
        });
        return textMatch || null;
    }

    async function safeClickDownload(row) {
        const trigger = findDownloadTrigger(row);
        if (!trigger) return false;
        try {
            if (trigger.tagName && trigger.tagName.toLowerCase() === 'a' && trigger.href) {
                const u = new URL(trigger.href, location.href);
                if (u.origin !== location.origin) {
                    log('Blocked external download URL:', u.href);
                    return false;
                }
                trigger.click();
                return true;
            } else {
                trigger.click();
                return true;
            }
        } catch (e) {
            log("Error clicking trigger:", e);
            return false;
        }
    }

    async function downloadRowsWithDelay(rows) {
        if (!rows || rows.length === 0) {
            alert("Tidak ditemukan baris faktur untuk diunduh (cek filter/tampilan).");
            return 0;
        }
        const count = Math.min(rows.length, MAX_DOWNLOADS_PER_RUN);
        if (!confirm(`Akan mengunduh ${count} file (max ${MAX_DOWNLOADS_PER_RUN}). Lanjutkan?`)) return 0;
        let done = 0;
        for (let i = 0; i < count; i++) {
            try {
                const ok = await safeClickDownload(rows[i]);
                if (ok) done++;
            } catch (e) {
                log('Download error for row', i, e);
            }
            if (i < count - 1) await wait(DOWNLOAD_DELAY_MS);
        }
        alert(`Selesai: ${done} file di-trigger untuk diunduh.`);
        return done;
    }

    // ========= ACTIONS =========
async function actionDownloadAll() {
    if (!isUserAllowed()) {
        alert('Akses ditolak: user login tidak sesuai.');
        return;
    }

    const rows = normalizeRows();
    const delay = 5000; // jeda antar klik (ms)
    let index = 0;
    let selectedCount = 0;

    // Hitung dulu total baris yang punya tombol PDF
    rows.forEach((row) => {
        const pdfButton = row.querySelector('button span.pi-file-pdf')?.closest('button');
        if (pdfButton) selectedCount++;
    });

    if (selectedCount === 0) {
        alert('Tidak ada faktur dengan tombol PDF yang ditemukan.');
        return;
    }

    // Konfirmasi sebelum mulai
    const proceed = confirm(`Akan mengunduh ${selectedCount} faktur (interval ${delay / 1000} detik). Lanjutkan?`);
    if (!proceed) {
        console.log('❌ Download dibatalkan oleh pengguna.');
        return;
    }

    // Jalankan download satu per satu
    rows.forEach((row) => {
        const pdfButton = row.querySelector('button span.pi-file-pdf')?.closest('button');
        if (pdfButton) {
            setTimeout(() => {
                pdfButton.click();
                console.log(`✅ PDF diklik di baris ke-${index + 1}`);
            }, delay * index);
            index+1;
        }
    });
}


 async function actionDownloadSelected() {
    if (!isUserAllowed()) {
        alert('Akses ditolak: user login tidak sesuai.');
        return;
    }

    const rows = normalizeRows();
    const delay = 5000; // jeda antar klik (ms)
    let index = 0;
    let selectedCount = 0;

    // Hitung dulu total yang dicentang & punya tombol PDF
    rows.forEach((row) => {
        const checkbox = row.querySelector('input[type="checkbox"]');
        const pdfButton = row.querySelector('button span.pi-file-pdf')?.closest('button');
        if (checkbox && checkbox.checked && pdfButton) {
            selectedCount++;
        }
    });

    if (selectedCount === 0) {
        alert("Tidak ada baris yang dicentang.");
        return;
    }

    // Konfirmasi sebelum mulai
    const proceed = confirm(`Akan mengunduh ${selectedCount} faktur (interval ${delay / 1000} detik). Lanjutkan?`);
    if (!proceed) {
        console.log('❌ Download dibatalkan oleh pengguna.');
        return;
    }

    // Jalankan download satu per satu
    rows.forEach((row) => {
        const checkbox = row.querySelector('input[type="checkbox"]');
        const pdfButton = row.querySelector('button span.pi-file-pdf')?.closest('button');
        if (checkbox && checkbox.checked && pdfButton) {
            setTimeout(() => {
                pdfButton.click();
                console.log(`✅ PDF diklik di baris ke-${index + 1}`);
            }, delay * index);
            index+1;
        }
    });

}


    function parseDateSafe(str) {
        if (!str) return null;
        str = str.trim();
        const r1 = /^\d{4}-\d{2}-\d{2}$/;
        const r2 = /^\d{2}[-\/]\d{2}[-\/]\d{4}$/;
        if (r1.test(str)) {
            const [y,m,d] = str.split('-').map(Number);
            return new Date(y, m-1, d);
        } else if (r2.test(str)) {
            const [d,m,y] = str.split(/[-\/]/).map(Number);
            return new Date(y, m-1, d);
        } else {
            const d = new Date(str);
            return isNaN(d.getTime()) ? null : d;
        }
    }

    // ========= UI INJECTION =========
    function findInsertionAnchor() {
        const patterns = [/XML\s*Monitoring/i, /Unduh\s*XML/i, /XML/i, /Export/i, /Unduh/i, /Download/i, /Faktur/i, /Pajak/i];
        const candidates = Array.from(document.querySelectorAll('button, a, div, span')).filter(el => {
            const txt = (el.innerText || el.title || el.getAttribute('aria-label') || "").trim();
            if (!txt) return false;
            return patterns.some(rx => rx.test(txt));
        });
        if (candidates.length) {
            const btn = candidates.find(c => /btn|button|toolbar/i.test(c.className || "")) || candidates[0];
            return btn;
        }
        const fallbacks = ['.toolbar', '.page-header', '.header', '.actions', '.page-actions', '.top-actions', '.widget-toolbar'];
        for (const sel of fallbacks) {
            const el = document.querySelector(sel);
            if (el) return el;
        }
        return document.body;
    }

    function injectButtons(anchor) {
        try {
            if (document.getElementById('btnAutoDLAll')) return;
            const cont = document.createElement('span');
            cont.id = 'autoDownloadContainer';
            cont.style.marginLeft = '8px';
            cont.style.display = 'inline-flex';
            cont.style.gap = '6px';
            cont.style.alignItems = 'center';

            const createBtn = (id, text, cls, onclick) => {
                const b = document.createElement('button');
                b.id = id;
                b.innerText = text;
                b.className = cls || 'btn';
                b.style.cursor = 'pointer';
                b.onclick = onclick;
                return b;
            };

            const bAll = createBtn('btnAutoDLAll', 'Download All', 'btn btn-success', actionDownloadAll);
            const bSel = createBtn('btnAutoDLSelected', 'Download Selected', 'btn btn-warning', actionDownloadSelected);

            cont.appendChild(bAll);
            cont.appendChild(bSel);

            if (anchor && anchor.parentNode) {
                anchor.parentNode.insertBefore(cont, anchor.nextSibling);
                log("Injected buttons next to anchor:", anchor);
            } else {
                document.body.insertBefore(cont, document.body.firstChild);
                log("Injected buttons at body top as fallback.");
            }
        } catch (e) {
            log("injectButtons error:", e);
        }
    }

    // ========= OBSERVER + POLLING FALLBACK =========
    let injectTimeout = null;
    const observer = new MutationObserver(() => {
        if (injectTimeout) clearTimeout(injectTimeout);
        injectTimeout = setTimeout(() => {
            try {
                if (!isUserAllowed()) return;
                const anchor = findInsertionAnchor();
                if (anchor) injectButtons(anchor);
            } catch (e) { log("Observer error:", e); }
        }, 600);
    });

    function startObserver() {
        try {
            observer.observe(document.body, { childList: true, subtree: true });
            log("MutationObserver attached.");
        } catch (e) {
            log("Observer attach failed:", e);
        }
    }

    // Polling fallback: kalau observer/SPA gagal, polling akan mencoba find+inject berkali2 sampai timeout
    let pollTimer = null;
    function startPollingFallback(timeoutMs = POLL_TIMEOUT_MS) {
        const start = Date.now();
        if (pollTimer) return;
        pollTimer = setInterval(() => {
            try {
                if (Date.now() - start > timeoutMs) {
                    clearInterval(pollTimer);
                    pollTimer = null;
                    log("Polling fallback timed out.");
                    return;
                }
                if (!isUserAllowed()) return;
                const anchor = findInsertionAnchor();
                if (anchor) {
                    injectButtons(anchor);
                    // keep running to handle SPA updates, but if injection done once we can clear timer to reduce churn
                    clearInterval(pollTimer);
                    pollTimer = null;
                    log("Polling found anchor and injected buttons.");
                } else {
                    log("Polling: anchor not found yet.");
                }
            } catch (e) {
                log("Polling error:", e);
            }
        }, POLL_INTERVAL_MS);
        log("Started polling fallback.");
    }

    // ========= INITIALIZE =========
    setTimeout(() => {
        try {
            log("Initial injection attempt (v1.3-fix)...");
            if (!isUserAllowed()) {
                log("User check failed or disabled - continuing (if allowed).");
            }
            startObserver();
            const anchor = findInsertionAnchor();
            injectButtons(anchor);
            startPollingFallback();
        } catch (e) {
            log("Initial injection error:", e);
        }
    }, INITIAL_INJECT_DELAY_MS);

    // small UI badge
    setTimeout(() => {
        try {
            if (document.getElementById('autoDLStatusBadge')) return;
            const badge = document.createElement('div');
            badge.id = 'autoDLStatusBadge';
            badge.style.position = 'fixed';
            badge.style.right = '12px';
            badge.style.bottom = '12px';
            badge.style.padding = '6px 10px';
            badge.style.background = 'rgba(0,0,0,0.6)';
            badge.style.color = '#fff';
            badge.style.fontSize = '12px';
            badge.style.borderRadius = '6px';
            badge.style.zIndex = 99999;
            badge.innerText = 'AutoDL v1.3-fix';
            document.body.appendChild(badge);
        } catch (e) {}
    }, INITIAL_INJECT_DELAY_MS + 4000);

})();
