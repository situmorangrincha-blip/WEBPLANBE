# Plan Omset & Plan SO

Web statis (tanpa build, tanpa database) untuk menyusun **Plan Omset** dan **Plan SO** per salesman, plus export Excel format template Plan BE.

## Deploy
1. Upload semua file di folder ini ke repo GitHub (root repo).
2. Vercel → *Add New Project* → pilih repo → Framework Preset **Other** → Deploy. Tidak perlu build command.

## Cara pakai
1. Tab **Data & Setting** → upload 3 file: omset bulan lalu, omset bulan ini, target (pilih tim tiap upload). Ganti file kapan saja untuk update harian.
2. Tab **Roster & Mapping** → atur status (Normal/Pengganti/Baru/Cuti/Resign), *Baseline dari* (siapa yang jadi acuan), Adj % / Adj Rp (toko pindah), dan kolom Depo/Type/NIK/SAC/LY untuk export.
3. Tab **Plan Omset** / **Plan SO** → klik sel untuk edit (`25jt`, `25000000`, `+10%`). Total plan & growth juga bisa diedit. Kosongkan sel = reset.
4. **Export Excel** → 2 sheet (Plan BE, Plan SO) dengan format template + formula (total & W1-W5).
5. **Simpan JSON / Muat JSON** → backup konfigurasi (mapping, edit, data). Data juga autosave di browser.

## Logika singkat
- Hari yang sudah ada aktual terkunci. Sisa plan = Total plan − aktual − (hari yang diedit manual), dibagi ke hari kerja tersisa mengikuti pola bulan lalu (kekuatan pola bisa diatur). Pasangan hari default: hari yang sama ke-N (Selasa ke-2 ↔ Selasa ke-2 bulan lalu); opsi lain: minggu kalender, hari kerja ke-N, tanggal sama.
- Total plan: ikut target (BTI/Milestone, toggle di atas), atau growth global, atau edit manual per salesman.
- Plan SO tgl X = plan omset tgl X+2 (jeda & cara hitung bisa diubah). Edit SO mengubah plan omset turunannya.
- Growth = plan vs baseline bulan lalu (setelah mapping & adjustment).

File: `index.html`, `style.css`, `core.js` (logika), `app.js` (UI), `sample-state.json` (contoh Arjuna Nov 2026), `vercel.json`.
