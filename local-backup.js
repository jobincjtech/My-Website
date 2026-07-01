(function () {
  "use strict";

  var PANEL_ID = "siteBackupTools";
  var IMPORT_ID = "siteBackupImport";
  var PASSWORD_HASH = window.PORTAL_BACKUP_PASSWORD_HASH || "175e9c8bf6d7cff85146f0d2b91d5eac19e1f0a1446f1c97a6a8b9827dcdcaad";

  function collectStorage(storage) {
    var data = {};
    for (var i = 0; i < storage.length; i++) {
      var key = storage.key(i);
      data[key] = storage.getItem(key);
    }
    return data;
  }

  function download(filename, text) {
    var blob = new Blob([text], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function safeName(value) {
    return String(value || "website")
      .replace(/^https?:\/\//, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "website";
  }

  function exportData() {
    requestPassword().then(function (allowed) {
      if (!allowed) return;
      downloadBackup();
    });
  }

  function downloadBackup() {
    var payload = {
      type: "portal-all-pages-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      origin: location.origin,
      exportedFrom: location.pathname,
      note: "This file contains all localStorage data for this website origin, not only the current page.",
      localStorage: collectStorage(localStorage)
    };

    var date = new Date().toISOString().slice(0, 10);
    var filename = safeName(location.hostname || "local-site") + "-all-pages-backup-" + date + ".json";
    download(filename, JSON.stringify(payload, null, 2));
    showStatus("All page data downloaded");
  }

  function hashText(text) {
    if (window.crypto && crypto.subtle && window.TextEncoder) {
      return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (buffer) {
        return Array.from(new Uint8Array(buffer)).map(function (byte) {
          return byte.toString(16).padStart(2, "0");
        }).join("");
      });
    }
    return Promise.resolve("");
  }

  function requestPassword() {
    return new Promise(function (resolve) {
      var existing = document.getElementById("siteBackupPasswordModal");
      if (existing) existing.remove();

      var modal = document.createElement("div");
      modal.id = "siteBackupPasswordModal";
      modal.innerHTML = [
        '<div class="backup-auth-card">',
        '<div class="backup-auth-icon">LOCK</div>',
        '<h3>Confirm Export</h3>',
        '<p>Enter the portal password to download the all-pages backup file.</p>',
        '<input type="password" class="backup-auth-input" placeholder="Portal password" autocomplete="current-password">',
        '<div class="backup-auth-error"></div>',
        '<div class="backup-auth-actions">',
        '<button type="button" class="backup-auth-cancel">Cancel</button>',
        '<button type="button" class="backup-auth-confirm">Export</button>',
        '</div>',
        '</div>'
      ].join("");
      document.body.appendChild(modal);

      var input = modal.querySelector(".backup-auth-input");
      var error = modal.querySelector(".backup-auth-error");
      var cancel = modal.querySelector(".backup-auth-cancel");
      var confirm = modal.querySelector(".backup-auth-confirm");

      function close(value) {
        modal.remove();
        resolve(value);
      }

      function check() {
        var password = input.value.trim();
        if (!password) {
          error.textContent = "Password is required.";
          input.focus();
          return;
        }
        confirm.disabled = true;
        hashText(password).then(function (hash) {
          if (hash === PASSWORD_HASH) {
            close(true);
          } else {
            confirm.disabled = false;
            input.value = "";
            error.textContent = "Wrong password.";
            input.focus();
          }
        });
      }

      cancel.addEventListener("click", function () { close(false); });
      confirm.addEventListener("click", check);
      modal.addEventListener("click", function (event) {
        if (event.target === modal) close(false);
      });
      input.addEventListener("keydown", function (event) {
        if (event.key === "Enter") check();
        if (event.key === "Escape") close(false);
      });
      setTimeout(function () { input.focus(); }, 50);
    });
  }

  function importData(file) {
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function () {
      try {
        var payload = JSON.parse(reader.result);
        var data = payload.localStorage || payload.data || payload;
        if (!data || typeof data !== "object" || Array.isArray(data)) {
          throw new Error("Invalid backup file");
        }

        localStorage.clear();
        Object.keys(data).forEach(function (key) {
          if (data[key] === null || typeof data[key] === "undefined") {
            localStorage.removeItem(key);
          } else {
            localStorage.setItem(key, String(data[key]));
          }
        });

        resetKnownDatabases().then(function () {
          showStatus("All page data restored. Reloading...");
          setTimeout(function () { location.reload(); }, 700);
        });
      } catch (err) {
        alert("This backup file could not be imported. Please select a valid JSON backup.");
      }
    };
    reader.readAsText(file);
  }

  function resetKnownDatabases() {
    if (!window.indexedDB || !localStorage.getItem("ahm_noc_v6_backup")) {
      return Promise.resolve();
    }

    return new Promise(function (resolve) {
      var request = indexedDB.deleteDatabase("AHM_NOC_DB_v6");
      request.onsuccess = resolve;
      request.onerror = resolve;
      request.onblocked = resolve;
      setTimeout(resolve, 1000);
    });
  }

  function showStatus(message) {
    var status = document.querySelector("#" + PANEL_ID + " .backup-status");
    if (!status) return;
    status.textContent = message;
    status.style.opacity = "1";
    clearTimeout(showStatus.timer);
    showStatus.timer = setTimeout(function () { status.style.opacity = "0"; }, 2400);
  }

  function createButton(text, className, onClick) {
    var button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.className = className;
    button.addEventListener("click", onClick);
    return button;
  }

  function mount() {
    if (document.getElementById(PANEL_ID)) return;

    var style = document.createElement("style");
    style.textContent = [
      "#" + PANEL_ID + "{position:fixed;right:24px;top:18px;z-index:2147483647;display:flex;align-items:center;gap:8px;padding:7px;background:rgba(6,14,28,.86);border:1px solid rgba(120,180,255,.25);border-radius:14px;box-shadow:0 14px 34px rgba(0,0,0,.32);backdrop-filter:blur(16px);font-family:Arial,sans-serif}",
      "#" + PANEL_ID + " button{border:1px solid rgba(125,211,252,.36);border-radius:10px;padding:9px 12px;font-size:12px;font-weight:800;line-height:1;cursor:pointer;color:#eaf8ff;background:linear-gradient(135deg,rgba(14,165,233,.95),rgba(20,184,166,.9));box-shadow:inset 0 1px 0 rgba(255,255,255,.18);letter-spacing:.1px}",
      "#" + PANEL_ID + " button.import{border-color:rgba(167,243,208,.34);background:rgba(12,28,45,.78);color:#c9f7e2}",
      "#" + PANEL_ID + " button:hover{filter:brightness(1.08);transform:translateY(-1px)}",
      "#" + PANEL_ID + " .backup-status{font-size:11px;color:#dbeafe;white-space:nowrap;opacity:0;transition:opacity .2s}",
      "#siteBackupPasswordModal{position:fixed;inset:0;z-index:2147483647;background:rgba(1,7,18,.62);display:flex;align-items:center;justify-content:center;padding:18px;font-family:Arial,sans-serif;backdrop-filter:blur(10px)}",
      "#siteBackupPasswordModal .backup-auth-card{width:min(380px,100%);background:rgba(8,18,35,.96);border:1px solid rgba(125,211,252,.25);border-radius:18px;padding:22px;box-shadow:0 24px 70px rgba(0,0,0,.48);color:#edf7ff}",
      "#siteBackupPasswordModal .backup-auth-icon{width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:rgba(125,211,252,.16);margin-bottom:12px;font-size:10px;font-weight:900;letter-spacing:.7px;color:#7dd3fc}",
      "#siteBackupPasswordModal h3{margin:0 0 7px;font-size:18px}",
      "#siteBackupPasswordModal p{margin:0 0 14px;color:#a9bdd5;font-size:13px;line-height:1.45}",
      "#siteBackupPasswordModal input{width:100%;border:1px solid rgba(125,211,252,.25);border-radius:10px;background:rgba(2,8,18,.86);color:#edf7ff;padding:11px 12px;outline:none}",
      "#siteBackupPasswordModal input:focus{border-color:rgba(125,211,252,.72);box-shadow:0 0 0 3px rgba(125,211,252,.12)}",
      "#siteBackupPasswordModal .backup-auth-error{min-height:18px;margin-top:8px;color:#ff8aa1;font-size:12px}",
      "#siteBackupPasswordModal .backup-auth-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}",
      "#siteBackupPasswordModal button{border:0;border-radius:10px;padding:9px 13px;font-size:12px;font-weight:800;cursor:pointer}",
      "#siteBackupPasswordModal .backup-auth-cancel{background:rgba(148,163,184,.16);color:#dbeafe}",
      "#siteBackupPasswordModal .backup-auth-confirm{background:linear-gradient(135deg,#38bdf8,#2dd4bf);color:#03121f}",
      "@media(max-width:720px){#" + PANEL_ID + "{top:10px;left:10px;right:10px;justify-content:center;flex-wrap:wrap}#" + PANEL_ID + " .backup-status{width:100%;text-align:center}}"
    ].join("");
    document.head.appendChild(style);

    var panel = document.createElement("div");
    panel.id = PANEL_ID;

    var input = document.createElement("input");
    input.id = IMPORT_ID;
    input.type = "file";
    input.accept = "application/json,.json";
    input.style.display = "none";
    input.addEventListener("change", function () {
      importData(input.files && input.files[0]);
      input.value = "";
    });

    panel.appendChild(createButton("Export Backup", "export", exportData));
    panel.appendChild(createButton("Import Backup", "import", function () { input.click(); }));

    var status = document.createElement("span");
    status.className = "backup-status";
    panel.appendChild(status);

    document.body.appendChild(input);
    document.body.appendChild(panel);
  }

  window.siteBackupTools = {
    exportData: exportData,
    importData: importData
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
