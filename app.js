/**
 * APLIKASI SISTEM PERSURATAN & ARSIP DIGITAL
 * SD NEGERI 3 NOGORAJI
 * File: script.js
 * Versi Stabil: Dual-Layer Persistence + Google Drive Integration
 */

// =========================================================================
// 1. KONFIGURASI GOOGLE FIREBASE MILIK ANDA
// =========================================================================
const firebaseConfig = {
  apiKey: "AIzaSyAdg6j0-1x9JKexTnD3fFG4UPGryCW8rDg",
  authDomain: "surat-sdn3nogoraju.firebaseapp.com",
  projectId: "surat-sdn3nogoraju",
  storageBucket: "surat-sdn3nogoraju.firebasestorage.app",
  messagingSenderId: "761011637070",
  appId: "1:761011637070:web:1124b2ecc42ca534e86c1f",
  measurementId: "G-ZZT7EQCERG"
};

// URL Google Apps Script Web App untuk upload langsung ke Google Drive email Anda
// (Ganti string di bawah ini dengan URL Web App milik Anda jika sudah membuat deployment baru)
const GOOGLE_DRIVE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwzn9LMfUqPVvXN3w7gGcAubD_9_EPx18nolvv-QCyzOmJb3coCdFr-fi8sZNXX5K6c/execC";
let auth = null;
let db = null;
let isFirebaseActive = false;

try {
  if (typeof firebase !== "undefined" && firebaseConfig.apiKey) {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    isFirebaseActive = true;
  }
} catch (e) {
  console.warn("Firebase gagal diinisialisasi:", e);
}

// =========================================================================
// 2. TEMPLATE DATA AWAL
// =========================================================================
function getDefaultState() {
  return {
    kop: {
      baris1: "PEMERINTAH KABUPATEN KEBUMEN",
      baris2: "DINAS PENDIDIKAN, KEPEMUDAAN DAN OLAHRAGA",
      namaSekolah: "SEKOLAH DASAR NEGERI 3 NOGORAJI",
      alamat: "Alamat: Desa Nogoraji, Kec. Buayan, Kabupaten Kebumen, Jawa Tengah 54474",
      kontak: "NPSN: 20304713 | Pos-el: nogoraji3@gmail.com",
      logoUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c2/LOGO_KABUPATEN_KEBUMEN.png/960px-LOGO_KABUPATEN_KEBUMEN.png?utm_source=gor.wikipedia.org&utm_campaign=index&utm_content=thumbnail"
    },
    pegawai: [
      { nama: "Kasmin, S.Pd., M.M.", nip: "19730624 200801 1 016", gol: "Penata Tingkat 1-III/D", jabatan: "Kepala Sekolah" },
      { nama: "Arif Prasetyo", nip: "-", gol: "-", jabatan: "Operator Sekolah" }
    ],
    arsip: []
  };
}

// =========================================================================
// 3. STORAGE & INDEXEDDB ENGINE
// =========================================================================
const PdfStorage = {
  dbName: "SDN3_ArsipPDF_DB",
  storeName: "pdf_blobs",
  db: null,

  async init() {
    return new Promise((resolve) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(this.storeName)) {
          d.createObjectStore(this.storeName, { keyPath: "id" });
        }
      };
      req.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };
      req.onerror = () => resolve(null);
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
        req.onsuccess = (e) => resolve(e.target.result ? e.target.result.blob : null);
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

const AppStorage = {
  memoryCache: {},
  get(key, fallback = null) {
    try {
      const val = localStorage.getItem(key);
      return val !== null ? JSON.parse(val) : fallback;
    } catch (e) {
      return this.memoryCache[key] !== undefined ? this.memoryCache[key] : fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      this.memoryCache[key] = value;
    }
  }
};

// =========================================================================
// 4. STATE APLIKASI
// =========================================================================
const defaultInit = getDefaultState();
const AppState = {
  currentUser: null,
  kop: defaultInit.kop,
  pegawai: defaultInit.pegawai,
  arsip: [],

  judulSuratMap: {
    spt: "SURAT PERINTAH TUGAS",
    sk_aktif: "SURAT KETERANGAN AKTIF SEKOLAH",
    undangan: "SURAT UNDANGAN",
    sk_pindah: "SURAT KETERANGAN PINDAH SEKOLAH",
    sk_kelakuan: "SURAT REKOMENDASI / KELAKUAN BAIK"
  }
};

function getUserKey(baseKey) {
  const uid = AppState.currentUser ? AppState.currentUser.uid : "offline_guest";
  return `${baseKey}_${uid}`;
}

// =========================================================================
// 5. SISTEM SINKRONISASI GANDA (LOCAL CACHE + FIRESTORE CLOUD)
// =========================================================================
async function syncDataToCloud() {
  if (!AppState.currentUser) return;

  // 1. Simpan ke Cache Lokal Khusus Akun Tersebut
  AppStorage.set(getUserKey("kopSekolah"), AppState.kop);
  AppStorage.set(getUserKey("listPegawai"), AppState.pegawai);
  AppStorage.set(getUserKey("listArsip"), AppState.arsip);

  // 2. Unggah ke Cloud Firestore
  if (isFirebaseActive && db) {
    try {
      const userDocRef = db.collection("sekolah_data").doc(AppState.currentUser.uid);
      await userDocRef.set({
        kop: AppState.kop,
        pegawai: AppState.pegawai,
        arsip: AppState.arsip,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      const statusTxt = document.getElementById("cloudStatusText");
      if (statusTxt) statusTxt.innerText = "Tersinkron ke Cloud";
    } catch (err) {
      console.warn("Gagal simpan ke Firestore (cek Rules):", err);
    }
  }
}

async function loadDataFromCloud(user) {
  const userKey = user.uid;
  const defaults = getDefaultState();

  // Layer 1: Muat instan dari Cache Lokal Perangkat jika ada
  const cachedKop = AppStorage.get(`kopSekolah_${userKey}`, null);
  const cachedPeg = AppStorage.get(`listPegawai_${userKey}`, null);
  const cachedArsip = AppStorage.get(`listArsip_${userKey}`, null);

  if (cachedKop) AppState.kop = cachedKop;
  if (cachedPeg) AppState.pegawai = cachedPeg;
  if (cachedArsip) AppState.arsip = cachedArsip;

  renderKopSurat();
  refreshDropdownPegawai();
  renderTabelPegawai();
  renderTabelArsip();

  // Layer 2: Tarik & Sinkronkan Data dari Cloud Firestore
  if (isFirebaseActive && db) {
    try {
      const doc = await db.collection("sekolah_data").doc(user.uid).get();

      if (doc.exists) {
        const cloudData = doc.data();
        AppState.kop = cloudData.kop || AppState.kop;
        AppState.pegawai = cloudData.pegawai || AppState.pegawai;
        AppState.arsip = cloudData.arsip || AppState.arsip;

        AppStorage.set(`kopSekolah_${userKey}`, AppState.kop);
        AppStorage.set(`listPegawai_${userKey}`, AppState.pegawai);
        AppStorage.set(`listArsip_${userKey}`, AppState.arsip);

        renderKopSurat();
        refreshDropdownPegawai();
        renderTabelPegawai();
        renderTabelArsip();
      } else {
        // Jika akun baru dan belum memiliki cache, gunakan data awal
        if (!cachedKop && !cachedPeg && !cachedArsip) {
          AppState.kop = defaults.kop;
          AppState.pegawai = defaults.pegawai;
          AppState.arsip = [];
        }
        await syncDataToCloud();
      }

      showToast(`Data akun ${user.displayName || user.email} berhasil dimuat!`);
    } catch (err) {
      console.warn("Menggunakan cache lokal perangkat:", err);
      showToast("Data akun dimuat dari cache perangkat.");
    }
  }
}

// Notifikasi Toast
function showToast(pesan, jenis = "success") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const item = document.createElement("div");
  item.className = `toast-item ${jenis}`;
  item.innerHTML = `<i class="fa-solid fa-circle-info"></i> <span>${pesan}</span>`;
  container.appendChild(item);

  setTimeout(() => {
    item.style.opacity = "0";
    item.style.transform = "translateY(10px)";
    setTimeout(() => item.remove(), 300);
  }, 3500);
}

function bindLiveSync(inputId, viewId) {
  const inputEl = document.getElementById(inputId);
  const viewEl = document.getElementById(viewId);
  if (inputEl && viewEl) {
    inputEl.addEventListener("input", () => {
      viewEl.innerText = inputEl.value;
    });
  }
}

// =========================================================================
// 6. MODUL AUTENTIKASI (LOGIN / REGISTER / LOGOUT)
// =========================================================================
function initAuthModule() {
  const modal = document.getElementById("modalAuth");
  const btnBuka = document.getElementById("btnBukaAuth");
  const btnTutup = document.getElementById("btnTutupAuthModal");
  const tabLogin = document.getElementById("tabAuthLogin");
  const tabRegister = document.getElementById("tabAuthRegister");
  const formAuth = document.getElementById("formAuthEmail");
  const groupName = document.getElementById("groupRegisterName");
  const textSubmit = document.getElementById("textBtnSubmitAuth");
  const errorMsg = document.getElementById("authErrorMessage");
  const btnGoogle = document.getElementById("btnGoogleAuth");
  const btnLogout = document.getElementById("btnLogout");

  let isRegisterMode = false;

  const openAuth = () => {
    if (!isFirebaseActive) {
      showToast("Firebase belum aktif. Aplikasi berjalan dalam mode lokal.", "info");
      return;
    }
    modal.classList.remove("hidden");
    errorMsg.classList.add("hidden");
  };

  const closeAuth = () => {
    modal.classList.add("hidden");
    formAuth.reset();
    errorMsg.classList.add("hidden");
  };

  if (btnBuka) btnBuka.addEventListener("click", openAuth);
  if (btnTutup) btnTutup.addEventListener("click", closeAuth);
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeAuth();
    });
  }

  if (tabLogin && tabRegister) {
    tabLogin.addEventListener("click", () => {
      isRegisterMode = false;
      tabLogin.classList.add("active");
      tabRegister.classList.remove("active");
      groupName.style.display = "none";
      textSubmit.innerText = "Masuk Sekarang";
      errorMsg.classList.add("hidden");
    });

    tabRegister.addEventListener("click", () => {
      isRegisterMode = true;
      tabRegister.classList.add("active");
      tabLogin.classList.remove("active");
      groupName.style.display = "block";
      textSubmit.innerText = "Buat Akun Baru";
      errorMsg.classList.add("hidden");
    });
  }

  if (formAuth) {
    formAuth.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!isFirebaseActive || !auth) {
        errorMsg.classList.remove("hidden");
        errorMsg.innerText = "Layanan autentikasi belum aktif.";
        return;
      }

      const email = document.getElementById("authInputEmail").value.trim();
      const password = document.getElementById("authInputPassword").value;
      const name = document.getElementById("authInputName").value.trim();

      errorMsg.classList.add("hidden");
      textSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Memproses...`;

      try {
        if (isRegisterMode) {
          const cred = await auth.createUserWithEmailAndPassword(email, password);
          if (name) await cred.user.updateProfile({ displayName: name });
          showToast("Akun baru berhasil didaftarkan!");
        } else {
          await auth.signInWithEmailAndPassword(email, password);
          showToast("Berhasil masuk ke akun Anda!");
        }
        closeAuth();
      } catch (err) {
        errorMsg.classList.remove("hidden");
        errorMsg.innerText = err.message || "Terjadi kesalahan saat autentikasi.";
      } finally {
        textSubmit.innerHTML = isRegisterMode ? "Buat Akun Baru" : "Masuk Sekarang";
      }
    });
  }

  if (btnGoogle) {
    btnGoogle.addEventListener("click", async () => {
      if (!isFirebaseActive || !auth) {
        errorMsg.classList.remove("hidden");
        errorMsg.innerText = "Layanan autentikasi belum aktif.";
        return;
      }

      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        await auth.signInWithPopup(provider);
        showToast("Berhasil masuk dengan Akun Google!");
        closeAuth();
      } catch (err) {
        errorMsg.classList.remove("hidden");
        errorMsg.innerText = err.message || "Gagal masuk menggunakan Google.";
      }
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
      if (auth) await auth.signOut();
      showToast("Anda telah keluar dari akun.", "info");
    });
  }

  if (isFirebaseActive && auth) {
    auth.onAuthStateChanged(async (user) => {
      const btnAuthTrigger = document.getElementById("btnBukaAuth");
      const chip = document.getElementById("userInfoChip");
      const userName = document.getElementById("userDisplayName");
      const avatar = document.getElementById("userAvatar");
      const cloudStatus = document.getElementById("cloudStatusText");

      if (user) {
        AppState.currentUser = user;
        if (btnAuthTrigger) btnAuthTrigger.classList.add("hidden");
        if (chip) chip.classList.remove("hidden");
        if (userName) userName.innerText = user.displayName || user.email.split("@")[0];
        if (avatar) avatar.src = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || user.email)}&background=15803d&color=fff`;
        if (cloudStatus) cloudStatus.innerText = "Tersambung ke Cloud";

        await loadDataFromCloud(user);
      } else {
        // SAAT LOGOUT: Reset tampilan agar tidak bocor ke sesi lain
        AppState.currentUser = null;
        const defaults = getDefaultState();
        AppState.kop = defaults.kop;
        AppState.pegawai = defaults.pegawai;
        AppState.arsip = [];

        renderKopSurat();
        refreshDropdownPegawai();
        renderTabelPegawai();
        renderTabelArsip();

        if (btnAuthTrigger) btnAuthTrigger.classList.remove("hidden");
        if (chip) chip.classList.add("hidden");
        if (cloudStatus) cloudStatus.innerText = "Mode Offline (Lokal)";
      }
    });
  }
}

// =========================================================================
// 7. MODUL KOP SURAT SEKOLAH
// =========================================================================
function renderKopSurat() {
  const k = AppState.kop;
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
  if (logoImg) logoImg.src = k.logoUrl;

  setTxt("sideSchoolName", k.namaSekolah);
  setTxt("stampTextSekolah", `★ ${k.namaSekolah} ★`);
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

  const fileLogoInput = document.getElementById("cfgKopLogoFile");
  if (fileLogoInput) {
    fileLogoInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          AppState.kop.logoUrl = evt.target.result;
          setVal("cfgKopLogoUrl", "Logo lokal terpilih");
          renderKopSurat();
          syncDataToCloud();
          showToast("Logo berhasil dimuat dari perangkat!");
        };
        reader.readAsDataURL(file);
      }
    });
  }

  const btnSimpan = document.getElementById("btnSimpanKop");
  if (btnSimpan) {
    btnSimpan.addEventListener("click", () => {
      const getVal = (id) => (document.getElementById(id) ? document.getElementById(id).value.trim() : "");
      AppState.kop.baris1 = getVal("cfgKopBaris1");
      AppState.kop.baris2 = getVal("cfgKopBaris2");
      AppState.kop.namaSekolah = getVal("cfgKopNamaSekolah");
      AppState.kop.alamat = getVal("cfgKopAlamat");
      AppState.kop.kontak = getVal("cfgKopKontak");

      const textUrl = getVal("cfgKopLogoUrl");
      if (textUrl && textUrl !== "Logo lokal terpilih") {
        AppState.kop.logoUrl = textUrl;
      }

      renderKopSurat();
      syncDataToCloud();
      showToast("Kop surat berhasil diperbarui dan disimpan!");
    });
  }
}

// =========================================================================
// 8. MODUL PEGAWAI & PENANDATANGAN
// =========================================================================
function syncPejabatPemberi() {
  const sel = document.getElementById("selectPenandatangan");
  if (!sel || AppState.pegawai.length === 0) return;

  const p = AppState.pegawai[sel.value] || AppState.pegawai[0];
  if (!p) return;

  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val || "";
  };

  setTxt("viewSptPemberiNama", p.nama);
  setTxt("viewSptPemberiNip", p.nip);
  setTxt("viewSptPemberiGol", p.gol);
  setTxt("viewSptPemberiJabatan", p.jabatan);

  setTxt("viewNamaTtd", p.nama);
  setTxt("viewNipTtd", `NIP. ${p.nip}`);
  setTxt("viewJabatanTtd", `${p.jabatan},`);
}

function syncPegawaiPenerima() {
  const sel = document.getElementById("selectPenerimaTugas");
  if (!sel || AppState.pegawai.length === 0) return;

  const p = AppState.pegawai[sel.value] || AppState.pegawai[0];
  if (!p) return;

  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val || "";
  };

  setTxt("viewSptPenerimaNama", p.nama);
  setTxt("viewSptPenerimaNip", p.nip);
  setTxt("viewSptPenerimaGol", p.gol);
  setTxt("viewSptPenerimaJabatan", p.jabatan);
}

function refreshDropdownPegawai() {
  const selPemberi = document.getElementById("selectPenandatangan");
  const selPenerima = document.getElementById("selectPenerimaTugas");

  const buildOpts = (selEl) => {
    if (!selEl) return;
    selEl.innerHTML = "";
    AppState.pegawai.forEach((p, idx) => {
      const opt = document.createElement("option");
      opt.value = idx;
      opt.textContent = `${p.nama} (${p.jabatan})`;
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
  AppState.pegawai.forEach((p, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td><strong>${p.nama}</strong></td>
      <td>${p.nip || "-"}</td>
      <td>${p.gol || "-"}</td>
      <td>${p.jabatan || "-"}</td>
      <td>
        <button type="button" class="btn btn-secondary btn-sm btn-delete-pegawai" data-idx="${idx}" style="color:var(--danger);">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Hapus Pegawai dengan Konfirmasi Dialog
  tbody.querySelectorAll(".btn-delete-pegawai").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (AppState.pegawai.length <= 1) {
        showToast("Minimal harus ada 1 data pegawai di dalam sistem.", "info");
        return;
      }
      const idx = parseInt(btn.getAttribute("data-idx"), 10);
      const nama = AppState.pegawai[idx].nama;

      const setuju = confirm(`Apakah Anda yakin ingin menghapus data pegawai "${nama}"?`);
      if (!setuju) return;

      AppState.pegawai.splice(idx, 1);
      refreshDropdownPegawai();
      renderTabelPegawai();
      syncDataToCloud();
      showToast(`Data pegawai ${nama} berhasil dihapus.`);
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

      showToast(`Pegawai ${nama} berhasil ditambahkan!`);
    });
  }
}

// =========================================================================
// 9. MODUL TANDA TANGAN & STEMPEL
// =========================================================================
function initTtdModule() {
  const checkTtd = document.getElementById("checkTtd");
  const ttdBox = document.getElementById("ttdBoxVisual");

  if (checkTtd && ttdBox) {
    checkTtd.addEventListener("change", () => {
      const stamp = ttdBox.querySelector(".stamp-round");
      const sig = ttdBox.querySelector(".svg-ttd");
      if (stamp) stamp.style.display = checkTtd.checked ? "flex" : "none";
      if (sig) sig.style.display = checkTtd.checked ? "block" : "none";
    });
  }
}

// =========================================================================
// 10. MODUL MULTI-TEMPLATE SURAT
// =========================================================================
function updateJenisSurat(jenis) {
  const judul = AppState.judulSuratMap[jenis] || "SURAT RESMI";
  const viewJudul = document.getElementById("viewJudulSurat");
  if (viewJudul) viewJudul.innerText = judul;

  const formMap = {
    spt: "formSectionSPT",
    sk_aktif: "formSectionSkAktif",
    undangan: "formSectionUndangan",
    sk_pindah: "formSectionSkPindah",
    sk_kelakuan: "formSectionSkKelakuan"
  };

  Object.values(formMap).forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  });

  const activeForm = document.getElementById(formMap[jenis]);
  if (activeForm) activeForm.classList.remove("hidden");

  const previewMap = {
    spt: "previewBodySPT",
    sk_aktif: "previewBodySkAktif",
    undangan: "previewBodyUndangan",
    sk_pindah: "previewBodySkPindah",
    sk_kelakuan: "previewBodySkKelakuan"
  };

  Object.values(previewMap).forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  });

  const activePreview = document.getElementById(previewMap[jenis]);
  if (activePreview) activePreview.classList.remove("hidden");

  const inNo = document.getElementById("inputNoSurat");
  const inDocNomor = document.getElementById("inDocNomor");
  if (inNo && inDocNomor) {
    inDocNomor.value = inNo.value;
  }
}

function initSuratBinding() {
  const selJenis = document.getElementById("selectJenisSurat");
  if (selJenis) {
    selJenis.addEventListener("change", (e) => {
      updateJenisSurat(e.target.value);
      showToast(`Format surat dialihkan ke: ${AppState.judulSuratMap[e.target.value]}`);
    });
    updateJenisSurat(selJenis.value || "spt");
  }

  const inNo = document.getElementById("inputNoSurat");
  const viewNo = document.getElementById("viewNoSurat");
  const btnTambahNo = document.getElementById("btnTambahNomor");

  if (inNo && viewNo) {
    inNo.addEventListener("input", () => {
      viewNo.innerText = inNo.value;
      const inDocNomor = document.getElementById("inDocNomor");
      if (inDocNomor) inDocNomor.value = inNo.value;
    });
  }

  if (btnTambahNo && inNo && viewNo) {
    btnTambahNo.addEventListener("click", () => {
      let cur = parseInt(inNo.value, 10);
      if (isNaN(cur)) cur = 66;
      cur++;
      inNo.value = cur;
      viewNo.innerText = cur;

      const inDocNomor = document.getElementById("inDocNomor");
      if (inDocNomor) inDocNomor.value = cur;

      showToast(`Nomor surat dinaikkan menjadi: ${cur}`);
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

  bindLiveSync("inPindahNama", "viewPindahNama");
  bindLiveSync("inPindahNisn", "viewPindahNisn");
  bindLiveSync("inPindahKelas", "viewPindahKelas");
  bindLiveSync("inPindahTujuanSekolah", "viewPindahTujuanSekolah");
  bindLiveSync("inPindahAlasan", "viewPindahAlasan");

  bindLiveSync("inKelakuanNama", "viewKelakuanNama");
  bindLiveSync("inKelakuanNisn", "viewKelakuanNisn");
  bindLiveSync("inKelakuanKelas", "viewKelakuanKelas");
  bindLiveSync("inKelakuanKet", "viewKelakuanKet");

  bindLiveSync("inDikeluarkanDi", "viewDikeluarkanDi");
  bindLiveSync("inPadaTanggal", "viewPadaTanggal");

  const btnPrint = document.getElementById("btnPrintSurat");
  if (btnPrint) {
    btnPrint.addEventListener("click", () => {
      window.print();
    });
  }

  // Reset Form dengan Konfirmasi Dialog
  const btnReset = document.getElementById("btnResetSurat");
  if (btnReset) {
    btnReset.addEventListener("click", () => {
      const setuju = confirm("Apakah Anda yakin ingin mengosongkan/mereset isian formulir surat ini?");
      if (!setuju) return;

      if (inNo) inNo.value = "";
      if (viewNo) viewNo.innerText = "";
      showToast("Formulir surat berhasil direset.", "info");
    });
  }
}

// =========================================================================
// 11. MODUL ARSIP & PRATINJAU MODAL PDF / GOOGLE DRIVE
// =========================================================================
async function bukaDokumenModal(idx) {
  const item = AppState.arsip[idx];
  if (!item) return;

  // Jika dokumen tersimpan di Google Drive, buka langsung tautan resminya
  if (item.driveUrl && item.driveUrl.startsWith("http")) {
    window.open(item.driveUrl, "_blank");
    return;
  }

  const modal = document.getElementById("modalPdfViewer");
  const frame = document.getElementById("modalPdfFrame");
  const title = document.getElementById("modalPdfTitle");
  const btnDownload = document.getElementById("modalPdfDownload");

  title.innerText = item.judul || "Dokumen PDF";

  let blob = await PdfStorage.getFile(item.id);

  if (!blob) {
    const infoHtml = `
      <html>
        <body style="font-family:sans-serif; display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; margin:0; background:#f8fafc; color:#1e293b; text-align:center; padding:20px;">
          <h2 style="color:#15803d; margin-bottom:8px;">${item.judul}</h2>
          <p style="color:#64748b; font-size:14px;">Nomor Surat: <strong>${item.nomor}</strong> | Kategori: <strong>${item.kategori}</strong></p>
          <div style="background:#dcfce7; color:#166534; padding:12px 18px; border-radius:8px; margin-top:16px; max-width:480px; font-size:13px; border:1px solid #bbf7d0;">
            Berkas fisik PDF tersimpan di penyimpanan perangkat saat diunggah.
          </div>
        </body>
      </html>
    `;
    blob = new Blob([infoHtml], { type: "text/html" });
  }

  const blobUrl = URL.createObjectURL(blob);
  frame.src = blobUrl;
  btnDownload.href = blobUrl;
  btnDownload.download = item.judul || "dokumen.pdf";

  modal.classList.remove("hidden");
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

  const filteredList = AppState.arsip.filter((item) => {
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
        <td colspan="6" style="text-align: center; padding: 24px; color: #64748b;">
          <i class="fa-solid fa-folder-open" style="font-size: 24px; margin-bottom: 8px; display: block; color: #cbd5e1;"></i>
          ${query ? `Tidak ada dokumen yang cocok dengan kata kunci "<strong>${filterQuery}</strong>".` : 'Belum ada arsip dokumen untuk akun ini.'}
        </td>
      </tr>
    `;
    return;
  }

  filteredList.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.tanggal}</td>
      <td><span class="badge-nomor">${item.nomor || "-"}</span></td>
      <td><strong>${item.judul}</strong></td>
      <td>${item.kategori || "Surat Resmi"}</td>
      <td><span style="color:var(--success); font-weight:700;"><i class="fa-solid fa-circle-check"></i> ${item.status || "Tersimpan"}</span></td>
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

  // Hapus Arsip dengan Konfirmasi Dialog
  tbody.querySelectorAll(".btn-hapus-arsip").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const id = btn.getAttribute("data-id");
      const realIndex = AppState.arsip.findIndex((a) => a.id === id);
      
      if (realIndex !== -1) {
        const item = AppState.arsip[realIndex];

        const setuju = confirm(`Apakah Anda yakin ingin menghapus dokumen "${item.judul}"?\n\nFile yang sudah dihapus tidak dapat dikembalikan.`);
        if (!setuju) return;

        if (item && item.id) {
          await PdfStorage.deleteFile(item.id);
        }
        AppState.arsip.splice(realIndex, 1);
        
        const inCari = document.getElementById("inCariArsip");
        renderTabelArsip(inCari ? inCari.value : "");
        syncDataToCloud();
        showToast("Arsip dokumen berhasil dihapus.");
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
      renderTabelArsip(e.target.value);
      if (btnResetCari) {
        btnResetCari.classList.toggle("hidden", e.target.value.length === 0);
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

  // PROSES UPLOAD OTOMATIS KE GOOGLE DRIVE & CLOUD
  if (btnUpload) {
    btnUpload.addEventListener("click", async (e) => {
      e.preventDefault();
      const getVal = (el) => (el ? el.value.trim() : "");
      const inNoSurat = document.getElementById("inputNoSurat");
      const nomor = getVal(inNomor) || (inNoSurat ? inNoSurat.value.trim() : "-");
      const title = getVal(inTitle);
      const category = inCategory ? inCategory.value : "Surat Resmi";
      const file = inFile && inFile.files ? inFile.files[0] : null;

      if (!title || !file) {
        showToast("Lengkapi judul dokumen dan pilih file PDF terlebih dahulu!", "info");
        return;
      }

      btnUpload.disabled = true;
      btnUpload.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Mengunggah ke Google Drive...`;

      const fileId = "pdf_" + Date.now();
      const today = new Date().toLocaleDateString("id-ID");
      let driveUrl = "#";
      let statusUpload = "Tersimpan Lokal";

      // 1. Simpan salinan lokal di memori IndexedDB
      await PdfStorage.saveFile(fileId, file);

      // 2. Kirim fisik file ke Google Drive Anda jika script URL tersedia
      if (typeof GOOGLE_DRIVE_SCRIPT_URL !== "undefined" && GOOGLE_DRIVE_SCRIPT_URL.startsWith("https://script.google.com")) {
        try {
          const reader = new FileReader();
          const base64Promise = new Promise((resolve) => {
            reader.onload = (evt) => resolve(evt.target.result.split(",")[1]);
            reader.readAsDataURL(file);
          });

          const base64Data = await base64Promise;
          const cleanFileName = `${nomor.replace(/[/\\?%*:|"<>]/g, "-")}_${title}.pdf`;

          const response = await fetch(GOOGLE_DRIVE_SCRIPT_URL, {
            method: "POST",
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
          console.warn("Gagal upload Google Drive, disimpan di perangkat:", err);
        }
      }

      // 3. Simpan data riwayat ke Firestore & Cache
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

      syncDataToCloud();

      if (inCari) inCari.value = "";
      if (btnResetCari) btnResetCari.classList.add("hidden");
      renderTabelArsip("");

      if (inNomor) inNomor.value = "";
      if (inTitle) inTitle.value = "";
      if (inFile) inFile.value = "";

      btnUpload.disabled = false;
      btnUpload.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Simpan ke Google Drive & Arsip`;

      if (driveUrl !== "#") {
        showToast(`Dokumen No. ${nomor} berhasil masuk ke Google Drive email Anda!`);
      } else {
        showToast(`Dokumen No. ${nomor} berhasil diarsipkan ke akun ini!`);
      }
    });
  }
}

// =========================================================================
// 12. NAVIGASI TAB MENU & RESPONSIVE TOGGLE
// =========================================================================
function initResponsiveMenu() {
  const btnToggle = document.getElementById("btnToggleSidebar");
  const sidebar = document.querySelector(".sidebar");
  const backdrop = document.getElementById("sidebarBackdrop");
  const navBtns = document.querySelectorAll(".nav-btn");
  const btnLandscape = document.getElementById("btnLandscapeMobile");

  if (btnToggle && sidebar) {
    btnToggle.addEventListener("click", (e) => {
      e.preventDefault();
      if (window.innerWidth <= 768) {
        sidebar.classList.toggle("open");
        if (backdrop) backdrop.classList.toggle("hidden");
      } else {
        sidebar.classList.toggle("collapsed");
      }
    });
  }

  if (backdrop && sidebar) {
    backdrop.addEventListener("click", () => {
      sidebar.classList.remove("open");
      backdrop.classList.add("hidden");
    });
  }

  navBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (window.innerWidth <= 768 && sidebar) {
        sidebar.classList.remove("open");
        if (backdrop) backdrop.classList.add("hidden");
      }
    });
  });

  if (btnLandscape) {
    btnLandscape.addEventListener("click", async () => {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        }
        if (screen.orientation && screen.orientation.lock) {
          await screen.orientation.lock("landscape");
          showToast("Layar berhasil dikunci ke mode miring (Landscape)!");
        }
      } catch (err) {
        showToast("Aktifkan fitur 'Putar Otomatis' di panel HP Anda.", "info");
      }
    });
  }
}

function initTabNavigation() {
  const btns = document.querySelectorAll(".nav-btn");
  const panels = document.querySelectorAll(".tab-panel");
  const titleDisplay = document.getElementById("headerTitle");

  const titles = {
    "tab-surat": "Buat Surat Sekolah",
    "tab-kop": "Pengaturan Kop Sekolah Mandiri",
    "tab-pegawai": "Kelola Data Pegawai & Guru",
    "tab-arsip": "Arsip Dokumen PDF"
  };

  btns.forEach((btn) => {
    btn.addEventListener("click", () => {
      btns.forEach((b) => b.classList.remove("active"));
      panels.forEach((p) => p.classList.remove("active"));

      btn.classList.add("active");
      const targetId = btn.getAttribute("data-tab");
      const targetPanel = document.getElementById(targetId);

      if (targetPanel) {
        targetPanel.classList.add("active");
        if (titleDisplay) titleDisplay.innerText = titles[targetId] || "Sistem Surat";

        if (targetId === "tab-arsip") {
          const inNo = document.getElementById("inputNoSurat");
          const inDocNomor = document.getElementById("inDocNomor");
          if (inNo && inDocNomor) {
            inDocNomor.value = inNo.value;
          }
        }
      }
    });
  });
}

// Inisialisasi Utama Saat Dokumen Siap
document.addEventListener("DOMContentLoaded", () => {
  initResponsiveMenu();
  initTabNavigation();
  initKopModule();
  initPegawaiModule();
  initTtdModule();
  initSuratBinding();
  initArsipModule();
  initAuthModule();
});
