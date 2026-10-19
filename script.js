/**
 * APLIKASI SISTEM PERSURATAN & ARSIP DIGITAL SDN 3 NOGORAJI
 * Versi 2.1 (Anti-Crash, Pelindung Galat, & Pemutus Cache)
 */

const GOOGLE_DRIVE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwzn9LMfUqPVvXN3w7gGcAubD_9_EPx18nolvv-QCyzOmJb3coCdFr-fi8sZNXX5K6c/exec";
const STORAGE_USERS_KEY = "sdn3_registered_users_db";

// =========================================================================
// 1. PENYIMPANAN LOCAL & INDEXEDDB DENGAN ERROR SHIELD
// =========================================================================
const AppStorage = {
  get(key, fallback = null) {
    try {
      const val = localStorage.getItem(key) || sessionStorage.getItem(key);
      if (val === null || val === "undefined") return fallback;
      return JSON.parse(val);
    } catch (e) {
      return fallback;
    }
  },
  set(key, value, persistent = true) {
    try {
      const dataStr = JSON.stringify(value);
      if (persistent) {
        localStorage.setItem(key, dataStr);
      } else {
        sessionStorage.setItem(key, dataStr);
      }
    } catch (e) {}
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch (e) {}
  }
};

const PdfStorage = {
  dbName: "SDN3_ArsipPDF_DB",
  storeName: "pdf_blobs",
  db: null,

  async init() {
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open(this.dbName, 1);
        req.onupgradeneeded = () => {
          const d = req.result;
          if (d && !d.objectStoreNames.contains(this.storeName)) {
            d.createObjectStore(this.storeName, { keyPath: "id" });
          }
        };
        req.onsuccess = () => {
          this.db = req.result;
          resolve(this.db);
        };
        req.onerror = () => resolve(null);
      } catch (err) {
        resolve(null);
      }
    });
  },

  async saveFile(id, fileBlob) {
    if (!this.db) await this.init();
    if (!this.db) return false;
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(this.storeName, "readwrite");
        tx.objectStore(this.storeName).put({ id: String(id), blob: fileBlob });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  },

  async getFile(id) {
    if (!this.db) await this.init();
    if (!this.db) return null;
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(this.storeName, "readonly");
        const req = tx.objectStore(this.storeName).get(String(id));
        req.onsuccess = () => resolve(req.result ? req.result.blob : null);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  },

  async deleteFile(id) {
    if (!this.db) await this.init();
    if (!this.db) return;
    try {
      const tx = this.db.transaction(this.storeName, "readwrite");
      tx.objectStore(this.storeName).delete(String(id));
    } catch (e) {}
  }
};

function getStoredUsers() {
  const users = AppStorage.get(STORAGE_USERS_KEY, null);
  if (Array.isArray(users) && users.length > 0) return users;

  const initial = [
    { username: "admin", password: "123", name: "Operator Sekolah", role: "Administrator", nip: "-" }
  ];
  AppStorage.set(STORAGE_USERS_KEY, initial, true);
  return initial;
}

function getDefaultState() {
  return {
    kop: {
      baris1: "PEMERINTAH KABUPATEN KEBUMEN",
      baris2: "DINAS PENDIDIKAN, KEPEMUDAAN DAN OLAHRAGA",
      namaSekolah: "SEKOLAH DASAR NEGERI 3 NOGORAJI",
      alamat: "Alamat: Jl. Raya Nogoraji, Kec. Buayan, Kabupaten Kebumen, Jawa Tengah 54474",
      kontak: "NPSN: 20305141 | Pos-el: sdn3nogoraji@gmail.com",
      logoUrl: "https://upload.wikimedia.org/wikipedia/commons/9/9c/Logo_Tut_Wuri_Handayani.png"
    },
    pegawai: [],
    arsip: []
  };
}

const defaultInit = getDefaultState();
const AppState = {
  currentUser: AppStorage.get("sdn3_active_user", null),
  kop: defaultInit.kop,
  pegawai: defaultInit.pegawai,
  arsip: [],
  judulSuratMap: {
    spt: "SURAT PERINTAH TUGAS",
    sk_aktif: "SURAT KETERANGAN AKTIF SISWA",
    undangan: "SURAT UNDANGAN RESMI"
  }
};

// =========================================================================
// 2. FUNGSI KLIK MASUK CEPAT (GLOBAL)
// =========================================================================
window.fillQuickLogin = function(username, password) {
  const inU = document.getElementById("loginUsername");
  const inP = document.getElementById("loginPassword");
  if (inU) inU.value = username;
  if (inP) inP.value = password;
  const btnSubmit = document.getElementById("btnLoginSubmit");
  if (btnSubmit) {
    btnSubmit.focus();
    showToast("Akun operator siap masuk, klik Masuk!", "info");
  }
};

function openModalConfirm(message, onConfirm) {
  const modal = document.getElementById("modalConfirm");
  const txt = document.getElementById("modalConfirmText");
  const btnSetuju = document.getElementById("btnSetujuConfirm");
  const btnBatal = document.getElementById("btnBatalConfirm");
  const btnClose = document.getElementById("btnBatalConfirmX");

  if (!modal) return;
  if (txt) txt.innerText = message;
  modal.classList.remove("hidden");

  const cleanup = () => {
    modal.classList.add("hidden");
    if (btnSetuju) btnSetuju.onclick = null;
    if (btnBatal) btnBatal.onclick = null;
    if (btnClose) btnClose.onclick = null;
  };

  if (btnSetuju) {
    btnSetuju.onclick = () => {
      cleanup();
      if (typeof onConfirm === "function") onConfirm();
    };
  }

  if (btnBatal) btnBatal.onclick = cleanup;
  if (btnClose) btnClose.onclick = cleanup;
}

function openModalGoogleAuth(onSuccess) {
  const modal = document.getElementById("modalPrompt");
  const inEmail = document.getElementById("inGoogleEmail");
  const inNama = document.getElementById("inGoogleNama");
  const btnSetuju = document.getElementById("btnSetujuPrompt");
  const btnBatal = document.getElementById("btnBatalPrompt");
  const btnClose = document.getElementById("btnBatalPromptX");

  if (!modal) return;
  if (inEmail) inEmail.value = "";
  if (inNama) inNama.value = "";
  modal.classList.remove("hidden");
  if (inEmail) inEmail.focus();

  const cleanup = () => {
    modal.classList.add("hidden");
    if (btnSetuju) btnSetuju.onclick = null;
    if (btnBatal) btnBatal.onclick = null;
    if (btnClose) btnClose.onclick = null;
  };

  if (btnSetuju) {
    btnSetuju.onclick = () => {
      const emailVal = inEmail ? inEmail.value.trim() : "";
      const namaVal = inNama ? inNama.value.trim() : "";

      if (!emailVal || !emailVal.includes("@")) {
        showToast("Masukkan alamat email Google yang valid!", "info");
        return;
      }
      if (!namaVal) {
        showToast("Nama lengkap wajib diisi!", "info");
        return;
      }

      cleanup();
      if (typeof onSuccess === "function") {
        onSuccess(emailVal, namaVal);
      }
    };
  }

  if (btnBatal) btnBatal.onclick = cleanup;
  if (btnClose) btnClose.onclick = cleanup;
}

async function syncDataToCloud() {
  AppStorage.set("sdn3_drive_kop", AppState.kop, true);
  AppStorage.set("sdn3_drive_pegawai", AppState.pegawai, true);
  AppStorage.set("sdn3_drive_arsip", AppState.arsip, true);

  const statusTxt = document.getElementById("cloudStatusText");

  if (GOOGLE_DRIVE_SCRIPT_URL && GOOGLE_DRIVE_SCRIPT_URL.startsWith("https://script.google.com")) {
    try {
      if (statusTxt) statusTxt.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan ke Google Drive...';

      const res = await fetch(GOOGLE_DRIVE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "sync_data",
          payload: {
            kop: AppState.kop,
            pegawai: AppState.pegawai,
            arsip: AppState.arsip,
            users: getStoredUsers()
          }
        })
      });

      const resData = await res.json();
      if (resData.status === "success" && statusTxt) {
        statusTxt.innerHTML = '<i class="fa-solid fa-cloud"></i> Tersambung ke Google Drive';
      }
    } catch (err) {
      if (statusTxt) statusTxt.innerHTML = '<i class="fa-solid fa-cloud"></i> Tersimpan Lokal (Akan Sinkron)';
    }
  }
}

async function loadDataFromCloud() {
  const statusTxt = document.getElementById("cloudStatusText");

  const localKop = AppStorage.get("sdn3_drive_kop", null);
  const localPeg = AppStorage.get("sdn3_drive_pegawai", null);
  const localArsip = AppStorage.get("sdn3_drive_arsip", []);

  if (localKop) AppState.kop = localKop;
  if (Array.isArray(localPeg)) AppState.pegawai = localPeg;
  if (Array.isArray(localArsip) && localArsip.length > 0) AppState.arsip = localArsip;

  renderKopSurat();
  refreshDropdownPegawai();
  renderTabelPegawai();
  renderTabelArsip();

  if (GOOGLE_DRIVE_SCRIPT_URL && GOOGLE_DRIVE_SCRIPT_URL.startsWith("https://script.google.com")) {
    try {
      if (statusTxt) statusTxt.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin"></i> Menyinkronkan Drive...';

      const requestUrl = `${GOOGLE_DRIVE_SCRIPT_URL}?action=load_data&_cb=${Date.now()}`;
      const res = await fetch(requestUrl, { method: "GET" });
      const cloudData = await res.json();

      if (cloudData && (cloudData.status === "success" || Array.isArray(cloudData.arsip))) {
        if (cloudData.kop && cloudData.kop.namaSekolah) {
          AppState.kop = cloudData.kop;
        }

        if (Array.isArray(cloudData.pegawai) && cloudData.pegawai.length > 0) {
          AppState.pegawai = cloudData.pegawai;
        }

        const driveArsip = Array.isArray(cloudData.arsip) ? cloudData.arsip : [];
        const mergedMap = new Map();

        driveArsip.forEach((item) => {
          if (item && item.id) mergedMap.set(String(item.id), item);
        });

        (AppState.arsip || []).forEach((item) => {
          if (item && item.id && !mergedMap.has(String(item.id))) {
            mergedMap.set(String(item.id), item);
          }
        });

        AppState.arsip = Array.from(mergedMap.values());

        if (Array.isArray(cloudData.users) && cloudData.users.length > 0) {
          const localUsers = getStoredUsers();
          const userMap = new Map();
          localUsers.forEach(u => {
            if (u && u.username) userMap.set(u.username.toLowerCase(), u);
          });
          cloudData.users.forEach(u => {
            if (u && u.username) userMap.set(u.username.toLowerCase(), u);
          });
          AppStorage.set(STORAGE_USERS_KEY, Array.from(userMap.values()), true);
        }

        AppStorage.set("sdn3_drive_kop", AppState.kop, true);
        AppStorage.set("sdn3_drive_pegawai", AppState.pegawai, true);
        AppStorage.set("sdn3_drive_arsip", AppState.arsip, true);

        renderKopSurat();
        refreshDropdownPegawai();
        renderTabelPegawai();
        renderTabelArsip();

        if (statusTxt) statusTxt.innerHTML = '<i class="fa-solid fa-cloud"></i> Tersambung ke Google Drive';
      }
    } catch (err) {
      if (statusTxt) statusTxt.innerHTML = '<i class="fa-solid fa-cloud"></i> Mode Offline (Tersimpan Lokal)';
    }
  }
}

function showDashboard(user) {
  const loginScreen = document.getElementById("loginScreen");
  const mainApp = document.getElementById("mainApp");
  if (loginScreen) loginScreen.style.display = "none";
  if (mainApp) mainApp.style.display = "flex";

  const nameEl = document.getElementById("sidebarUserName");
  const roleEl = document.getElementById("sidebarUserRole");
  const avatarIcon = document.getElementById("sidebarAvatarIcon");

  if (nameEl) nameEl.innerText = (user && user.name) ? user.name : "Operator";
  if (roleEl) roleEl.innerText = (user && user.role) ? user.role : "Administrator";

  if (avatarIcon) {
    if (user && user.isGoogleAuth) {
      avatarIcon.innerHTML = '<i class="fa-brands fa-google" style="color:#ea4335;"></i>';
    } else {
      avatarIcon.innerHTML = '<i class="fa-solid fa-user-check"></i>';
    }
  }
}

function showLoginScreen() {
  const loginScreen = document.getElementById("loginScreen");
  const mainApp = document.getElementById("mainApp");
  if (mainApp) mainApp.style.display = "none";
  if (loginScreen) loginScreen.style.display = "flex";

  const inU = document.getElementById("loginUsername");
  const inP = document.getElementById("loginPassword");
  if (inU) inU.value = "";
  if (inP) inP.value = "";
  const loginAlert = document.getElementById("loginAlert");
  if (loginAlert) loginAlert.classList.add("hidden");
}

function initAuthGateway() {
  const formLogin = document.getElementById("formLogin");
  const formRegister = document.getElementById("formRegister");
  const tabModeLogin = document.getElementById("tabModeLogin");
  const tabModeRegister = document.getElementById("tabModeRegister");
  const dividerText = document.getElementById("dividerText");

  const loginAlert = document.getElementById("loginAlert");
  const loginAlertText = document.getElementById("loginAlertText");
  const btnToggleEye = document.getElementById("btnTogglePassword");
  const eyeIcon = document.getElementById("eyeIcon");
  const inPass = document.getElementById("loginPassword");
  const btnLogout = document.getElementById("btnLogoutApp");
  const btnGoogleAuth = document.getElementById("btnGoogleAuth");

  if (tabModeLogin && tabModeRegister) {
    tabModeLogin.addEventListener("click", () => {
      tabModeLogin.classList.add("active");
      tabModeRegister.classList.remove("active");
      if (formLogin) formLogin.classList.remove("hidden");
      if (formRegister) formRegister.classList.add("hidden");
      if (dividerText) dividerText.innerText = "atau masuk dengan akun lokal";
      if (loginAlert) loginAlert.classList.add("hidden");
    });

    tabModeRegister.addEventListener("click", () => {
      tabModeRegister.classList.add("active");
      tabModeLogin.classList.remove("active");
      if (formLogin) formLogin.classList.add("hidden");
      if (formRegister) formRegister.classList.remove("hidden");
      if (dividerText) dividerText.innerText = "atau daftarkan akun baru";
      if (loginAlert) loginAlert.classList.add("hidden");
    });
  }

  if (btnGoogleAuth) {
    btnGoogleAuth.addEventListener("click", () => {
      openModalGoogleAuth((email, nama) => {
        const googleUser = {
          username: email.split("@")[0],
          name: nama,
          email: email,
          role: "Guru / Pegawai",
          isGoogleAuth: true
        };

        AppState.currentUser = googleUser;
        AppStorage.set("sdn3_active_user", googleUser, true);

        const exists = AppState.pegawai.some((p) => p && p.nama && p.nama.toLowerCase() === nama.toLowerCase());
        if (!exists) {
          AppState.pegawai.push({
            nama: nama,
            nip: "-",
            gol: "-",
            jabatan: "Guru / Tenaga Pendidik"
          });
          refreshDropdownPegawai();
          renderTabelPegawai();
          syncDataToCloud();
        }

        showToast(`Selamat datang, ${nama}!`, "success");
        showDashboard(googleUser);
        loadDataFromCloud();
      });
    });
  }

  if (btnToggleEye && inPass) {
    btnToggleEye.addEventListener("click", () => {
      const isPassword = inPass.type === "password";
      inPass.type = isPassword ? "text" : "password";
      if (eyeIcon) {
        eyeIcon.className = isPassword ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
      }
    });
  }

  if (formLogin) {
    formLogin.addEventListener("submit", (e) => {
      e.preventDefault();
      const inU = document.getElementById("loginUsername");
      const inP = document.getElementById("loginPassword");
      const rememberBox = document.getElementById("checkRememberMe");

      const u = inU ? inU.value.trim().toLowerCase() : "";
      const p = inP ? inP.value.trim() : "";
      const remember = rememberBox ? rememberBox.checked : true;

      const registeredUsers = getStoredUsers();
      const foundUser = registeredUsers.find(
        (acc) => acc && acc.username && acc.username.toLowerCase() === u && acc.password === p
      );

      if (foundUser) {
        if (loginAlert) loginAlert.classList.add("hidden");
        AppState.currentUser = foundUser;
        AppStorage.set("sdn3_active_user", foundUser, remember);

        showToast(`Selamat datang, ${foundUser.name}!`, "success");
        showDashboard(foundUser);
        loadDataFromCloud();
      } else {
        if (loginAlert && loginAlertText) {
          loginAlertText.innerText = "Nama pengguna atau kata sandi tidak cocok!";
          loginAlert.className = "alert-box alert-danger";
          loginAlert.classList.remove("hidden");
        }
      }
    });
  }

  if (formRegister) {
    formRegister.addEventListener("submit", (e) => {
      e.preventDefault();
      const getVal = (id) => (document.getElementById(id) ? document.getElementById(id).value.trim() : "");

      const nama = getVal("regNamaLengkap");
      const jabatan = getVal("regJabatan") || "Guru / Pegawai";
      const nip = getVal("regNip") || "-";
      const username = getVal("regUsername").toLowerCase().replace(/\s+/g, "");
      const password = getVal("regPassword");

      if (username.length < 3 || password.length < 3) {
        if (loginAlert && loginAlertText) {
          loginAlertText.innerText = "Username dan kata sandi minimal 3 karakter!";
          loginAlert.className = "alert-box alert-danger";
          loginAlert.classList.remove("hidden");
        }
        return;
      }

      const users = getStoredUsers();
      const isExist = users.some((acc) => acc && acc.username && acc.username.toLowerCase() === username);

      if (isExist) {
        if (loginAlert && loginAlertText) {
          loginAlertText.innerText = `Username "${username}" sudah digunakan!`;
          loginAlert.className = "alert-box alert-danger";
          loginAlert.classList.remove("hidden");
        }
        return;
      }

      const newUser = { username, password, name: nama, role: jabatan, nip };
      users.push(newUser);
      AppStorage.set(STORAGE_USERS_KEY, users, true);

      AppState.pegawai.push({ nama, nip, gol: "-", jabatan });
      refreshDropdownPegawai();
      renderTabelPegawai();
      syncDataToCloud();

      AppState.currentUser = newUser;
      AppStorage.set("sdn3_active_user", newUser, true);

      showToast(`Pendaftaran berhasil! Selamat datang, ${nama}.`, "success");
      showDashboard(newUser);
      loadDataFromCloud();
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener("click", () => {
      openModalConfirm("Apakah Anda yakin ingin keluar dari sistem?", () => {
        AppState.currentUser = null;
        AppStorage.remove("sdn3_active_user");
        showLoginScreen();
        showToast("Berhasil keluar dari akun.", "info");
      });
    });
  }

  if (AppState.currentUser) {
    showDashboard(AppState.currentUser);
  } else {
    showLoginScreen();
  }
}

function renderKopSurat() {
  const k = AppState.kop || {};
  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val || "";
  };

  setTxt("viewKopBaris1", k.baris1);
  setTxt("viewKopBaris2", k.baris2);
  setTxt("viewKopNamaSekolah", k.namaSekolah);
  setTxt("viewKopAlamat", k.alamat);
  setTxt("viewKopKontak", k.kontak);

  const logoImg = document.getElementById("viewKopLogo");
  const sideLogo = document.getElementById("sideLogo");
  if (logoImg && k.logoUrl) logoImg.src = k.logoUrl;
  if (sideLogo && k.logoUrl) sideLogo.src = k.logoUrl;

  setTxt("sideSchoolName", k.namaSekolah);
  setTxt("stampTextSekolah", `★ ${k.namaSekolah || 'SEKOLAH'} ★`);
}

function initKopModule() {
  renderKopSurat();

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || "";
  };

  setVal("cfgKopBaris1", AppState.kop.baris1);
  setVal("cfgKopBaris2", AppState.kop.baris2);
  setVal("cfgKopNamaSekolah", AppState.kop.namaSekolah);
  setVal("cfgKopAlamat", AppState.kop.alamat);
  setVal("cfgKopKontak", AppState.kop.kontak);
  setVal("cfgKopLogoUrl", AppState.kop.logoUrl);

  const btnSimpan = document.getElementById("btnSimpanKop");
  if (btnSimpan) {
    btnSimpan.addEventListener("click", () => {
      const getVal = (id) => (document.getElementById(id) ? document.getElementById(id).value.trim() : "");
      AppState.kop.baris1 = getVal("cfgKopBaris1");
      AppState.kop.baris2 = getVal("cfgKopBaris2");
      AppState.kop.namaSekolah = getVal("cfgKopNamaSekolah");
      AppState.kop.alamat = getVal("cfgKopAlamat");
      AppState.kop.kontak = getVal("cfgKopKontak");
      AppState.kop.logoUrl = getVal("cfgKopLogoUrl");

      renderKopSurat();
      syncDataToCloud();
      showToast("Kop surat berhasil diperbarui ke Google Drive!");
    });
  }
}

function syncPejabatPemberi() {
  const sel = document.getElementById("selectPenandatangan");
  const p = (sel && AppState.pegawai[sel.value]) ? AppState.pegawai[sel.value] : null;

  const setTxt = (id, val, fallback) => {
    const el = document.getElementById(id);
    if (el) {
      if (val && val !== "-") {
        el.innerText = val;
      } else {
        el.innerHTML = fallback;
      }
    }
  };

  setTxt("viewSptPemberiNama", p ? p.nama : "", '<span class="placeholder-dots">................................................</span>');
  setTxt("viewSptPemberiNip", p ? p.nip : "", '<span class="placeholder-dots">-</span>');
  setTxt("viewSptPemberiGol", p ? p.gol : "", '<span class="placeholder-dots">-</span>');
  setTxt("viewSptPemberiJabatan", p ? p.jabatan : "", '<span class="placeholder-dots">Kepala Sekolah</span>');

  setTxt("viewNamaTtd", p ? p.nama : "", '<span class="placeholder-dots">................................................</span>');
  setTxt("viewNipTtd", p ? `NIP. ${p.nip}` : "", "NIP. -");
  setTxt("viewJabatanTtd", p ? `${p.jabatan},` : "Kepala Sekolah,");
}

function syncPegawaiPenerima() {
  const sel = document.getElementById("selectPenerimaTugas");
  const p = (sel && AppState.pegawai[sel.value]) ? AppState.pegawai[sel.value] : null;

  const setTxt = (id, val, fallback) => {
    const el = document.getElementById(id);
    if (el) {
      if (val && val !== "-") {
        el.innerText = val;
      } else {
        el.innerHTML = fallback;
      }
    }
  };

  setTxt("viewSptPenerimaNama", p ? p.nama : "", '<span class="placeholder-dots">................................................</span>');
  setTxt("viewSptPenerimaNip", p ? p.nip : "", '<span class="placeholder-dots">-</span>');
  setTxt("viewSptPenerimaGol", p ? p.gol : "", '<span class="placeholder-dots">-</span>');
  setTxt("viewSptPenerimaJabatan", p ? p.jabatan : "", '<span class="placeholder-dots">Pegawai Penerima Tugas</span>');
}

function refreshDropdownPegawai() {
  const selPemberi = document.getElementById("selectPenandatangan");
  const selPenerima = document.getElementById("selectPenerimaTugas");

  const buildOpts = (selEl) => {
    if (!selEl) return;
    selEl.innerHTML = "";

    if (AppState.pegawai.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "-- Belum ada data pegawai (Tambah di tab Pegawai) --";
      selEl.appendChild(opt);
      return;
    }

    AppState.pegawai.forEach((p, idx) => {
      const opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = `${p.nama} (${p.jabatan || 'Pegawai'})`;
      selEl.appendChild(opt);
    });
  };

  buildOpts(selPemberi);
  buildOpts(selPenerima);

  if (selPemberi && AppState.pegawai.length > 0) selPemberi.selectedIndex = 0;
  if (selPenerima && AppState.pegawai.length > 1) selPenerima.selectedIndex = 1;

  syncPejabatPemberi();
  syncPegawaiPenerima();
}

function renderTabelPegawai() {
  const tbody = document.getElementById("tbodyPegawaiList");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (AppState.pegawai.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 20px; color: #52796f;">
          Belum ada data pegawai atau guru. Silakan tambahkan pada formulir di atas.
        </td>
      </tr>
    `;
    return;
  }

  AppState.pegawai.forEach((p, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td><strong>${p.nama}</strong></td>
      <td>${p.nip || "-"}</td>
      <td>${p.gol || "-"}</td>
      <td>${p.jabatan || "-"}</td>
      <td>
        <button type="button" class="btn btn-secondary btn-sm btn-delete-pegawai" data-idx="${idx}" style="color:var(--danger);" title="Hapus Pegawai">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".btn-delete-pegawai").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.getAttribute("data-idx") || "0", 10);
      const targetPeg = AppState.pegawai[idx];
      if (!targetPeg) return;

      openModalConfirm(`Apakah Anda yakin ingin menghapus data pegawai "${targetPeg.nama}"?`, () => {
        AppState.pegawai.splice(idx, 1);
        refreshDropdownPegawai();
        renderTabelPegawai();
        syncDataToCloud();
        showToast(`Data pegawai ${targetPeg.nama} berhasil dihapus.`);
      });
    });
  });
}

function initPegawaiModule() {
  refreshDropdownPegawai();
  renderTabelPegawai();

  const selPemberi = document.getElementById("selectPenandatangan");
  const selPenerima = document.getElementById("selectPenerimaTugas");
  if (selPemberi) selPemberi.addEventListener("change", syncPejabatPemberi);
  if (selPenerima) selPenerima.addEventListener("change", syncPegawaiPenerima);

  const btnSimpan = document.getElementById("btnSimpanPegawai");
  if (btnSimpan) {
    btnSimpan.addEventListener("click", () => {
      const getVal = (id) => (document.getElementById(id) ? document.getElementById(id).value.trim() : "");
      const nama = getVal("newPegNama");
      const nip = getVal("newPegNip");
      const gol = getVal("newPegGol");
      const jabatan = getVal("newPegJabatan");

      if (!nama) {
        showToast("Nama lengkap pegawai wajib diisi!", "info");
        return;
      }

      AppState.pegawai.push({
        nama,
        nip: nip || "-",
        gol: gol || "-",
        jabatan: jabatan || "-"
      });

      refreshDropdownPegawai();
      renderTabelPegawai();
      syncDataToCloud();

      const clearVal = (id) => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      };
      clearVal("newPegNama");
      clearVal("newPegNip");
      clearVal("newPegGol");
      clearVal("newPegJabatan");

      showToast(`Pegawai ${nama} berhasil disimpan ke Google Drive!`);
    });
  }
}

function getUrutInput() {
  return document.getElementById("inNoUrut") || document.getElementById("inputNoSurat");
}

function getFormattedNomorSurat() {
  const getVal = (id, def) => {
    const el = document.getElementById(id);
    return el && el.value.trim() ? el.value.trim() : def;
  };

  const urutEl = getUrutInput();
  const urut = urutEl && urutEl.value.trim() ? urutEl.value.trim() : "100";

  const kode = getVal("inNoKode", "400.3.5");
  const instansi = getVal("inNoInstansi", "SDN.068");
  const bulan = getVal("inNoBulan", "X");
  const tahun = getVal("inNoTahun", "2026");

  return `${kode} / ${urut} / ${instansi} / ${bulan} / ${tahun}`;
}

function updateNomorSuratDisplay() {
  const fullNomor = getFormattedNomorSurat();
  const urutEl = getUrutInput();
  const curUrut = urutEl && urutEl.value.trim() ? urutEl.value.trim() : "100";

  const inUrut = document.getElementById("inNoUrut");
  const inputNo = document.getElementById("inputNoSurat");
  if (inUrut && inUrut.value !== curUrut) inUrut.value = curUrut;
  if (inputNo && inputNo.value !== curUrut) inputNo.value = curUrut;

  const viewEl = document.getElementById("viewNoSurat");
  const badgeEl = document.getElementById("badgeFullNoSurat");
  const inDocEl = document.getElementById("inDocNomor");
  const syncViewNoList = document.querySelectorAll(".sync-view-no");

  if (viewEl) viewEl.innerText = fullNomor;
  if (badgeEl) badgeEl.innerText = fullNomor;
  if (inDocEl) inDocEl.value = fullNomor;
  syncViewNoList.forEach((el) => { el.innerText = fullNomor; });
}

function bindLiveSync(inputId, viewId, fallbackPlaceholder = '<span class="placeholder-dots">................................</span>') {
  const inEl = document.getElementById(inputId);
  const viewEl = document.getElementById(viewId);
  if (inEl && viewEl) {
    inEl.addEventListener("input", () => {
      const val = inEl.value.trim();
      if (val) {
        viewEl.innerText = inEl.value;
      } else {
        viewEl.innerHTML = fallbackPlaceholder;
      }
    });
  }
}

function updateJenisSurat(jenis) {
  const judul = AppState.judulSuratMap[jenis] || "SURAT RESMI";
  const viewJudul = document.getElementById("viewJudulSurat");
  if (viewJudul) viewJudul.innerText = judul;

  const formSections = ["formSectionSPT", "formSectionSkAktif", "formSectionUndangan"];
  formSections.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  });

  const previewBodies = ["previewBodySPT", "previewBodySkAktif", "previewBodyUndangan"];
  previewBodies.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  });

  const previewTitleSec = document.getElementById("previewTitleSection");

  if (jenis === "spt") {
    const f = document.getElementById("formSectionSPT");
    const p = document.getElementById("previewBodySPT");
    if (f) f.classList.remove("hidden");
    if (p) p.classList.remove("hidden");
    if (previewTitleSec) previewTitleSec.classList.remove("hidden");
  } else if (jenis === "sk_aktif") {
    const f = document.getElementById("formSectionSkAktif");
    const p = document.getElementById("previewBodySkAktif");
    if (f) f.classList.remove("hidden");
    if (p) p.classList.remove("hidden");
    if (previewTitleSec) previewTitleSec.classList.remove("hidden");
  } else if (jenis === "undangan") {
    const f = document.getElementById("formSectionUndangan");
    const p = document.getElementById("previewBodyUndangan");
    if (f) f.classList.remove("hidden");
    if (p) p.classList.remove("hidden");
    if (previewTitleSec) previewTitleSec.classList.add("hidden");
  }

  updateNomorSuratDisplay();
}

function initSuratBinding() {
  const selJenis = document.getElementById("selectJenisSurat");
  if (selJenis) {
    selJenis.addEventListener("change", (e) => {
      const target = e.target;
      updateJenisSurat(target ? target.value : "spt");
    });
    updateJenisSurat(selJenis.value || "spt");
  }

  const inKode = document.getElementById("inNoKode");
  const inUrut = document.getElementById("inNoUrut");
  const inputNo = document.getElementById("inputNoSurat");
  const inInstansi = document.getElementById("inNoInstansi");
  const inBulan = document.getElementById("inNoBulan");
  const inTahun = document.getElementById("inNoTahun");

  const btnPlus = document.getElementById("btnTambahNomor");
  const btnMinus = document.getElementById("btnKurangNomor");

  [inKode, inUrut, inputNo, inInstansi, inBulan, inTahun].forEach((el) => {
    if (el) {
      el.addEventListener("input", updateNomorSuratDisplay);
      el.addEventListener("change", updateNomorSuratDisplay);
    }
  });

  if (btnPlus) {
    btnPlus.addEventListener("click", () => {
      const urutEl = getUrutInput();
      let cur = urutEl ? parseInt(urutEl.value, 10) : 100;
      if (isNaN(cur)) cur = 100;
      cur++;

      if (inUrut) inUrut.value = String(cur);
      if (inputNo) inputNo.value = String(cur);
      if (urutEl) urutEl.value = String(cur);

      updateNomorSuratDisplay();
      showToast(`Nomor urut dinaikkan: ${cur}`);
    });
  }

  if (btnMinus) {
    btnMinus.addEventListener("click", () => {
      const urutEl = getUrutInput();
      let cur = urutEl ? parseInt(urutEl.value, 10) : 100;
      if (isNaN(cur)) cur = 100;
      if (cur > 1) {
        cur--;
        if (inUrut) inUrut.value = String(cur);
        if (inputNo) inputNo.value = String(cur);
        if (urutEl) urutEl.value = String(cur);

        updateNomorSuratDisplay();
        showToast(`Nomor urut dikurangi: ${cur}`);
      }
    });
  }

  bindLiveSync("inSptUntuk", "viewSptUntuk");
  bindLiveSync("inSptTglBerangkat", "viewSptTglBerangkat");
  bindLiveSync("inSptTglKembali", "viewSptTglKembali");
  bindLiveSync("inSptTujuan", "viewSptTujuan");

  bindLiveSync("inAktifNama", "viewAktifNama");
  bindLiveSync("inAktifNisn", "viewAktifNisn");
  bindLiveSync("inAktifTtl", "viewAktifTtl");
  bindLiveSync("inAktifKelas", "viewAktifKelas");
  bindLiveSync("inAktifOrtu", "viewAktifOrtu");
  bindLiveSync("inAktifKeperluan", "viewAktifKeperluan");

  bindLiveSync("inUndanganPerihal", "viewUndanganPerihal");
  bindLiveSync("inUndanganKepada", "viewUndanganKepada");
  bindLiveSync("inUndanganHariTgl", "viewUndanganHariTgl");
  bindLiveSync("inUndanganWaktu", "viewUndanganWaktu");
  bindLiveSync("inUndanganTempat", "viewUndanganTempat");
  bindLiveSync("inUndanganAcara", "viewUndanganAcara");

  bindLiveSync("inDikeluarkanDi", "viewDikeluarkanDi");
  bindLiveSync("inPadaTanggal", "viewPadaTanggal");

  const inTempat = document.getElementById("inDikeluarkanDi");
  const inTgl = document.getElementById("inPadaTanggal");
  const syncTempatTglKanan = () => {
    const el = document.getElementById("viewUndanganTempatTglKanan");
    if (el) el.innerText = `${inTempat ? inTempat.value : "Nogoraji"}, ${inTgl ? inTgl.value : "19 Oktober 2026"}`;
  };
  if (inTempat) inTempat.addEventListener("input", syncTempatTglKanan);
  if (inTgl) inTgl.addEventListener("input", syncTempatTglKanan);

  const checkTtd = document.getElementById("checkTtd");
  const ttdBox = document.getElementById("ttdBoxVisual");
  if (checkTtd && ttdBox) {
    checkTtd.addEventListener("change", () => {
      ttdBox.style.visibility = checkTtd.checked ? "visible" : "hidden";
    });
  }

  const btnPrint = document.getElementById("btnPrintSurat");
  if (btnPrint) {
    btnPrint.addEventListener("click", () => window.print());
  }

  const btnReset = document.getElementById("btnResetSurat");
  if (btnReset) {
    btnReset.addEventListener("click", () => {
      openModalConfirm("Apakah Anda yakin ingin mengosongkan formulir surat ini?", () => {
        const clearVal = (id) => {
          const el = document.getElementById(id);
          if (el) {
            el.value = "";
            el.dispatchEvent(new Event("input"));
          }
        };

        clearVal("inSptUntuk");
        clearVal("inSptTglBerangkat");
        clearVal("inSptTglKembali");
        clearVal("inSptTujuan");

        clearVal("inAktifNama");
        clearVal("inAktifNisn");
        clearVal("inAktifTtl");
        clearVal("inAktifKelas");
        clearVal("inAktifOrtu");
        clearVal("inAktifKeperluan");

        clearVal("inUndanganPerihal");
        clearVal("inUndanganKepada");
        clearVal("inUndanganHariTgl");
        clearVal("inUndanganWaktu");
        clearVal("inUndanganTempat");
        clearVal("inUndanganAcara");

        showToast("Formulir surat berhasil dibersihkan.", "info");
      });
    });
  }

  updateNomorSuratDisplay();
}

async function bukaDokumenModal(idx) {
  const item = AppState.arsip[idx];
  if (!item) return;

  if (item.driveUrl && item.driveUrl.startsWith("http") && !item.driveUrl.includes("#")) {
    window.open(item.driveUrl, "_blank");
    return;
  }

  const modal = document.getElementById("modalPdfViewer");
  const frame = document.getElementById("modalPdfFrame");
  const title = document.getElementById("modalPdfTitle");
  const btnDownload = document.getElementById("modalPdfDownload");

  if (title) title.innerText = item.judul || "Dokumen PDF";

  let blob = await PdfStorage.getFile(item.id);

  if (!blob) {
    const infoHtml = `
      <html>
        <body style="font-family:sans-serif; display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; margin:0; background:#f5faf7; color:#0f291e; text-align:center; padding:20px;">
          <h2 style="color:#15803d; margin-bottom:8px;">${item.judul}</h2>
          <p style="color:#52796f; font-size:13px;">Nomor Surat: <strong>${item.nomor}</strong> | Kategori: <strong>${item.kategori}</strong></p>
          <div style="background:#dcfce7; color:#166534; padding:12px 18px; border-radius:8px; margin-top:16px; max-width:480px; font-size:12.5px; border:1px solid #bbf7d0;">
            Berkas fisik tersimpan di Google Drive resmi sekolah.
          </div>
        </body>
      </html>
    `;
    blob = new Blob([infoHtml], { type: "text/html" });
  }

  const blobUrl = URL.createObjectURL(blob);
  if (frame) frame.src = blobUrl;
  if (btnDownload) {
    btnDownload.href = blobUrl;
    btnDownload.download = item.judul || "dokumen.pdf";
  }

  if (modal) modal.classList.remove("hidden");
}

function tutupModalPdf() {
  const modal = document.getElementById("modalPdfViewer");
  const frame = document.getElementById("modalPdfFrame");
  if (modal) modal.classList.add("hidden");
  if (frame) frame.src = "about:blank";
}

function renderTabelArsip(filterQuery = "") {
  const tbody = document.getElementById("tbodyArsipList");
  if (!tbody) return;

  const query = filterQuery.toLowerCase().trim();

  const filteredList = (AppState.arsip || []).filter((item) => {
    if (!query) return true;
    const matchNomor = (item.nomor || "").toLowerCase().includes(query);
    const matchJudul = (item.judul || "").toLowerCase().includes(query);
    const matchKategori = (item.kategori || "").toLowerCase().includes(query);
    return matchNomor || matchJudul || matchKategori;
  });

  tbody.innerHTML = "";

  if (filteredList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 24px; color: #52796f;">
          <i class="fa-solid fa-folder-open" style="font-size: 24px; margin-bottom: 6px; display: block; color: #b7cebe;"></i>
          ${query ? `Tidak ada dokumen yang cocok dengan "<strong>${filterQuery}</strong>".` : 'Belum ada arsip dokumen tersimpan.'}
        </td>
      </tr>
    `;
    return;
  }

  filteredList.forEach((item) => {
    const isDrive = item.status === "Google Drive" || (item.driveUrl && item.driveUrl.startsWith("http") && !item.driveUrl.includes("#"));
    const statusColor = isDrive ? "color:var(--primary); font-weight:700;" : "color:#0284c7; font-weight:600;";
    const statusIcon = isDrive ? "fa-cloud" : "fa-laptop";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.tanggal}</td>
      <td><span class="badge-nomor">${item.nomor || "-"}</span></td>
      <td><strong>${item.judul}</strong></td>
      <td>${item.kategori || "Surat Resmi"}</td>
      <td><span style="${statusColor}"><i class="fa-solid ${statusIcon}"></i> ${item.status || "Google Drive"}</span></td>
      <td>
        <button type="button" class="btn btn-secondary btn-sm btn-buka-arsip" data-id="${item.id}">
          <i class="fa-solid fa-arrow-up-right-from-square"></i> Buka
        </button>
        <button type="button" class="btn btn-secondary btn-sm btn-hapus-arsip" data-id="${item.id}" style="color:var(--danger); margin-left:4px;" title="Hapus Arsip">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".btn-buka-arsip").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const id = btn.getAttribute("data-id");
      const realIndex = AppState.arsip.findIndex((a) => a.id === id);
      if (realIndex !== -1) bukaDokumenModal(realIndex);
    });
  });

  tbody.querySelectorAll(".btn-hapus-arsip").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const id = btn.getAttribute("data-id");
      const realIndex = AppState.arsip.findIndex((a) => a.id === id);

      if (realIndex !== -1) {
        const item = AppState.arsip[realIndex];
        openModalConfirm(`Apakah Anda yakin ingin menghapus dokumen "${item.judul}"?`, async () => {
          if (item && item.id) {
            await PdfStorage.deleteFile(item.id);
          }
          AppState.arsip.splice(realIndex, 1);
          const inCari = document.getElementById("inCariArsip");
          renderTabelArsip(inCari ? inCari.value : "");
          syncDataToCloud();
          showToast("Arsip dokumen berhasil dihapus.");
        });
      }
    });
  });
}

function initArsipModule() {
  renderTabelArsip();

  const btnUpload = document.getElementById("btnUploadDrive");
  const inNomor = document.getElementById("inDocNomor");
  const inTitle = document.getElementById("inDocTitle");
  const inCategory = document.getElementById("inDocCategory");
  const inFile = document.getElementById("inDocFile");

  const inCari = document.getElementById("inCariArsip");
  const btnResetCari = document.getElementById("btnResetCari");

  if (inCari) {
    inCari.addEventListener("input", (e) => {
      const target = e.target;
      const val = target ? target.value : "";
      renderTabelArsip(val);
      if (btnResetCari) {
        btnResetCari.classList.toggle("hidden", val.length === 0);
      }
    });
  }

  if (btnResetCari) {
    btnResetCari.addEventListener("click", () => {
      if (inCari) {
        inCari.value = "";
        inCari.focus();
      }
      btnResetCari.classList.add("hidden");
      renderTabelArsip("");
    });
  }

  const btnTutup = document.getElementById("btnTutupModalPdf");
  if (btnTutup) btnTutup.addEventListener("click", tutupModalPdf);

  const modal = document.getElementById("modalPdfViewer");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) tutupModalPdf();
    });
  }

  if (btnUpload) {
    btnUpload.addEventListener("click", async (e) => {
      e.preventDefault();
      const getVal = (el) => (el ? el.value.trim() : "");
      const nomor = getVal(inNomor) || getFormattedNomorSurat();
      const title = getVal(inTitle);
      const category = inCategory ? inCategory.value : "Surat Resmi";
      const file = inFile && inFile.files ? inFile.files[0] : null;

      if (!title || !file) {
        showToast("Lengkapi judul dokumen dan pilih file PDF terlebih dahulu!", "info");
        return;
      }

      btnUpload.disabled = true;
      btnUpload.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mengunggah ke Google Drive...';

      const fileId = "pdf_" + Date.now();
      const today = new Date().toLocaleDateString("id-ID");
      let driveUrl = "#";
      let statusUpload = "Tersimpan Lokal";

      await PdfStorage.saveFile(fileId, file);

      try {
        const reader = new FileReader();
        const base64Promise = new Promise((resolve, reject) => {
          reader.onload = () => {
            const raw = typeof reader.result === "string" ? reader.result : "";
            resolve(raw.includes(",") ? raw.split(",")[1] : raw);
          };
          reader.onerror = () => reject(new Error("Gagal membaca file"));
          reader.readAsDataURL(file);
        });

        const base64Data = await base64Promise;
        const cleanFileName = `${nomor.replace(/[/\\?%*:|"<>]/g, "-")}_${title}.pdf`;

        const response = await fetch(GOOGLE_DRIVE_SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "upload_pdf",
            fileName: cleanFileName,
            base64: base64Data
          })
        });

        const result = await response.json();
        if (result.status === "success") {
          driveUrl = result.fileUrl;
          statusUpload = "Google Drive";
        }
      } catch (err) {
        console.warn("Gagal simpan ke cloud Google Drive:", err);
      }

      AppState.arsip.unshift({
        id: fileId,
        tanggal: today,
        nomor: nomor,
        judul: `${title}.pdf`,
        kategori: category,
        status: statusUpload,
        driveUrl: driveUrl,
        isSample: false
      });

      await syncDataToCloud();

      if (inCari) inCari.value = "";
      if (btnResetCari) btnResetCari.classList.add("hidden");
      renderTabelArsip("");

      if (inTitle) inTitle.value = "";
      if (inFile) inFile.value = "";

      btnUpload.disabled = false;
      btnUpload.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Simpan ke Google Drive & Riwayat';

      showToast(`Dokumen No. ${nomor} berhasil masuk ke Google Drive & Riwayat!`);
    });
  }
}

function initTabNavigation() {
  const btns = document.querySelectorAll(".nav-btn");
  const panels = document.querySelectorAll(".tab-panel");
  const titleDisplay = document.getElementById("headerTitle");
  const btnToggleSidebar = document.getElementById("btnToggleSidebar");
  const sidebar = document.getElementById("sidebar");
  const btnRefreshDrive = document.getElementById("btnRefreshDrive");

  const titles = {
    "tab-surat": "Buat Surat Sekolah",
    "tab-arsip": "Arsip Dokumen PDF",
    "tab-pegawai": "Data Pegawai & Guru",
    "tab-kop": "Pengaturan Kop Sekolah"
  };

  btns.forEach((btn) => {
    btn.addEventListener("click", () => {
      btns.forEach((b) => b.classList.remove("active"));
      panels.forEach((p) => p.classList.remove("active"));

      btn.classList.add("active");
      const targetId = btn.getAttribute("data-tab");
      const targetPanel = targetId ? document.getElementById(targetId) : null;

      if (targetPanel) {
        targetPanel.classList.add("active");
        if (titleDisplay) titleDisplay.innerText = titles[targetId] || "Sistem Surat";

        if (targetId === "tab-arsip") {
          const inDocNomor = document.getElementById("inDocNomor");
          if (inDocNomor) inDocNomor.value = getFormattedNomorSurat();
        }
      }

      if (window.innerWidth <= 992 && sidebar) {
        sidebar.classList.remove("open");
      }
    });
  });

  if (btnToggleSidebar && sidebar) {
    btnToggleSidebar.addEventListener("click", () => {
      sidebar.classList.toggle("open");
    });
  }

  if (btnRefreshDrive) {
    btnRefreshDrive.addEventListener("click", async () => {
      showToast("Memuat ulang data terbaru dari Google Drive...", "info");
      await loadDataFromCloud();
    });
  }
}

function showToast(pesan, jenis = "success") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const item = document.createElement("div");
  item.className = `toast-item ${jenis}`;
  item.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span>${pesan}</span>`;
  container.appendChild(item);

  setTimeout(() => {
    item.style.opacity = "0";
    item.style.transform = "translateX(40px)";
    setTimeout(() => item.remove(), 300);
  }, 3500);
}

// Inisialisasi Aman dengan Pelindung Galat (Try-Catch Isolated)
document.addEventListener("DOMContentLoaded", () => {
  const runSafe = (fn, name) => {
    try {
      fn();
    } catch (err) {
      console.warn(`[Module Warning] ${name}:`, err);
    }
  };

  runSafe(loadDataFromCloud, "CloudLoader");
  runSafe(initAuthGateway, "AuthGateway");
  runSafe(initTabNavigation, "TabNavigation");
  runSafe(initKopModule, "KopModule");
  runSafe(initPegawaiModule, "PegawaiModule");
  runSafe(initSuratBinding, "SuratBinding");
  runSafe(initArsipModule, "ArsipModule");
});
