/**
 * APLIKASI SISTEM PERSURATAN & ARSIP DIGITAL
 * SD NEGERI 3 NOGORAJI
 * Versi Stabil Lengkap - Tombol Garis 3 Aktif 100%
 */

// =========================================================================
// 1. SISTEM PENYIMPANAN FILE PDF DENGAN INDEXEDDB (ANTI MEMORI PENUH)
// =========================================================================
const PdfStorage = {
  dbName: "SDN3_ArsipPDF_DB",
  storeName: "pdf_blobs",
  db: null,

  async init() {
    return new Promise((resolve) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: "id" });
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
// 2. STATE APLIKASI
// =========================================================================
const AppState = {
  kop: AppStorage.get("kopSekolahSDN3", {
    baris1: "PEMERINTAH KABUPATEN KEBUMEN",
    baris2: "DINAS PENDIDIKAN, KEPEMUDAAN DAN OLAHRAGA",
    namaSekolah: "SEKOLAH DASAR NEGERI 3 NOGORAJI",
    alamat: "Alamat: Jl. Raya Nogoraji, Kec. Buayan, Kabupaten Kebumen, Jawa Tengah 54474",
    kontak: "NPSN: 20305141 | Pos-el: sdn3nogoraji@gmail.com",
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/9/9c/Logo_Tut_Wuri_Handayani.png"
  }),

  pegawai: AppStorage.get("listPegawaiSDN3", [
    { nama: "SUKIRNO, S.Pd., M.Pd.", nip: "19680415 199303 1 005", gol: "Pembina Tk. I, IV/b", jabatan: "Kepala Sekolah" },
    { nama: "Budi Santoso, S.Pd.SD", nip: "19870512 201101 1 008", gol: "Penata Muda Tk. I, III/b", jabatan: "Guru PJOK" },
    { nama: "Siti Aminah, S.Pd.", nip: "19890214 201402 2 003", gol: "Penata Muda, III/a", jabatan: "Guru Kelas / Operator" },
    { nama: "Sri Wahyuni, S.Pd.SD", nip: "19780820 200801 2 015", gol: "Penata, III/c", jabatan: "Guru Kelas 1" },
    { nama: "Ahmad Fauzi, S.Pd.I", nip: "19910411 201902 1 004", gol: "Penata Muda, III/a", jabatan: "Guru PAI" }
  ]),

  arsip: AppStorage.get("listArsipSDN3", [
    { id: "sample_1", tanggal: "12/10/2026", nomor: "66", judul: "Surat Perintah Tugas Pelatihan Kurikulum 2026.pdf", kategori: "Surat Tugas", status: "Tersimpan", isSample: true },
    { id: "sample_2", tanggal: "12/10/2026", nomor: "421.1/045/2026", judul: "Surat Keterangan Aktif Siswa M. Rizky.pdf", kategori: "Surat Keterangan", status: "Tersimpan", isSample: true }
  ]),

  judulSuratMap: {
    spt: "SURAT PERINTAH TUGAS",
    sk_aktif: "SURAT KETERANGAN AKTIF SEKOLAH",
    undangan: "SURAT UNDANGAN",
    sk_pindah: "SURAT KETERANGAN PINDAH SEKOLAH",
    sk_kelakuan: "SURAT REKOMENDASI / KELAKUAN BAIK"
  }
};

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
// 3. FUNGSI RESPONSIF MENU GARIS 3 (SIDEBAR TOGGLE) & LAYAR MIRING
// =========================================================================
function initResponsiveMenu() {
  const btnToggle = document.getElementById("btnToggleSidebar");
  const sidebar = document.querySelector(".sidebar");
  const backdrop = document.getElementById("sidebarBackdrop");
  const navBtns = document.querySelectorAll(".nav-btn");
  const btnLandscape = document.getElementById("btnLandscapeMobile");

  // Klik Garis 3 untuk Buka / Tutup Sidebar
  if (btnToggle && sidebar) {
    btnToggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (window.innerWidth <= 768) {
        // Layar HP: Munculkan geser samping
        sidebar.classList.toggle("open");
        if (backdrop) backdrop.classList.toggle("hidden");
      } else {
        // Layar Komputer / Laptop: Ciutkan menu ke samping
        sidebar.classList.toggle("collapsed");
      }
    });
  }

  // Tutup sidebar saat latar belakang gelap diklik (di HP)
  if (backdrop && sidebar) {
    backdrop.addEventListener("click", () => {
      sidebar.classList.remove("open");
      backdrop.classList.add("hidden");
    });
  }

  // Tutup sidebar otomatis saat menu diklik (di HP)
  navBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (window.innerWidth <= 768 && sidebar) {
        sidebar.classList.remove("open");
        if (backdrop) backdrop.classList.add("hidden");
      }
    });
  });

  // Tombol Kunci Layar Miring Android
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

// =========================================================================
// 4. MODUL KOP SURAT SEKOLAH
// =========================================================================
function renderKopSurat() {
  const k = AppState.kop;
  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
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
    if (el) el.value = val;
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
          showToast("Logo berhasil dimuat!");
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

      AppStorage.set("kopSekolahSDN3", AppState.kop);
      renderKopSurat();
      showToast("Kop surat berhasil diperbarui dan disimpan!");
    });
  }
}

// =========================================================================
// 5. MODUL PEGAWAI & PENANDATANGAN
// =========================================================================
function syncPejabatPemberi() {
  const sel = document.getElementById("selectPenandatangan");
  if (!sel || AppState.pegawai.length === 0) return;

  const p = AppState.pegawai[sel.value] || AppState.pegawai[0];
  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
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
  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
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

  tbody.querySelectorAll(".btn-delete-pegawai").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (AppState.pegawai.length <= 1) {
        showToast("Minimal harus ada 1 data pegawai di dalam sistem.", "info");
        return;
      }
      const idx = parseInt(btn.getAttribute("data-idx"), 10);
      const nama = AppState.pegawai[idx].nama;
      AppState.pegawai.splice(idx, 1);
      AppStorage.set("listPegawaiSDN3", AppState.pegawai);
      refreshDropdownPegawai();
      renderTabelPegawai();
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

      AppStorage.set("listPegawaiSDN3", AppState.pegawai);
      refreshDropdownPegawai();
      renderTabelPegawai();

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
// 6. MODUL TANDA TANGAN & STEMPEL (SPASI 70PX TIDAK DEMPET)
// =========================================================================
function initTtdModule() {
  const checkTtd = document.getElementById("checkTtd");
  const ttdBox = document.getElementById("ttdBoxVisual");

  if (checkTtd && ttdBox) {
    checkTtd.addEventListener("change", () => {
      const stamp = ttdBox.querySelector(".stamp-round");
      const sig = ttdBox.querySelector(".svg-ttd");
      // Hanya sembunyikan gambar, spasi 70px tetap tersedia
      if (stamp) stamp.style.display = checkTtd.checked ? "flex" : "none";
      if (sig) sig.style.display = checkTtd.checked ? "block" : "none";
    });
  }
}

// =========================================================================
// 7. MODUL MULTI-TEMPLATE SURAT
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

  // Live Binding Formulir
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

  const btnReset = document.getElementById("btnResetSurat");
  if (btnReset) {
    btnReset.addEventListener("click", () => {
      if (inNo) inNo.value 
