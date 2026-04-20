# Intelligent Healthcare Queue & CDSS

Platform web untuk manajemen antrian rumah sakit real-time, prediksi waktu tunggu, optimasi distribusi pasien, dan dukungan keputusan klinis (CDSS) untuk dokter.

## Ringkasan Masalah

Layanan rumah sakit di Indonesia masih menghadapi:

- waktu tunggu panjang,
- proses pendaftaran kurang efisien,
- informasi antrian yang kurang transparan,
- belum adanya prediksi lonjakan pasien.

Akibatnya, beberapa poli overload, kualitas layanan turun, dan pengalaman pasien memburuk.

## Tujuan

Sistem ini dibangun untuk:

- mengelola antrian secara real-time,
- memprediksi estimasi waktu tunggu,
- menyeimbangkan distribusi pasien antar layanan,
- meningkatkan transparansi informasi ke pasien,
- memberi rekomendasi diagnosis awal berbasis gejala melalui CDSS (tetap sebagai alat bantu dokter).

## Research Questions

1. Bagaimana membuat estimasi waktu tunggu yang akurat?
2. Bagaimana mengurangi overload layanan melalui optimasi distribusi pasien?
3. Bagaimana meningkatkan transparansi informasi ke pasien?
4. Bagaimana merancang CDSS yang efektif tanpa menggantikan peran dokter?

## Cakupan MVP

1. **Data & Analisis**: cleaning data, EDA, identifikasi peak hour dan pola durasi layanan.
2. **Machine Learning**: prediksi waktu tunggu (regresi/ML sederhana) dan CDSS berbasis aturan/klasifikasi gejala.
3. **Backend API**: manajemen antrian, pengguna, jadwal, hasil prediksi, dan integrasi mock API (mis. BPJS).
4. **Frontend**:
   - Pasien: booking dan tracking antrian,
   - Admin: monitoring layanan,
   - Dokter: input gejala dan rekomendasi CDSS.
5. **Integrasi & Deployment**: pengujian unit/integrasi dan deployment ke cloud.

## Evaluasi Model

- Prediksi waktu tunggu: `MAE`, `RMSE`
- CDSS klasifikasi gejala: `Accuracy`

## Batasan Saat Ini

- Data masih simulasi (dummy)
- Integrasi BPJS masih mock API
- Fokus pada MVP, belum integrasi penuh HIS/EMR
- Model AI masih dasar (belum training real-time)

## Arah Pengembangan

- Integrasi sistem eksternal (BPJS, HIS/EMR)
- Peningkatan kualitas model AI
- Analitik operasional layanan kesehatan yang lebih mendalam

## Menjalankan Backend

Prasyarat: Node.js 20 LTS, `pnpm` (atau `npm`), dan instance PostgreSQL (Supabase direkomendasikan).

### 1. Install dependensi

```bash
pnpm install
```

### 2. Konfigurasi environment

Salin `.env.example` menjadi `.env` dan isi nilainya (khususnya `DATABASE_URL`, `DIRECT_URL`, dan secret JWT):

```bash
cp .env.example .env
```

Variabel penting:

- `DATABASE_URL` — koneksi pooled Supabase (port 6543) untuk runtime.
- `DIRECT_URL` — koneksi direct (port 5432) untuk `prisma migrate`.
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — minimal 16 karakter.
- `ML_SERVICE_URL` — opsional. Jika kosong, estimasi waktu tunggu pakai heuristik lokal.

### 3. Migrate & seed database

```bash
pnpm prisma:migrate   # membuat skema di database
pnpm prisma:seed      # mengisi data dummy (admin, dokter, pasien, poli, jadwal)
```

Akun seed default:

- Admin: `admin@hospital.test` / `password123`
- Dokter: `dr.budi@hospital.test` / `password123`
- Pasien: `pasien1@test.com` / `password123`

### 4. Jalankan server

```bash
pnpm dev         # mode watch (tsx)
# atau
pnpm build && pnpm start
```

Server default di `http://localhost:3000`. Base API: `http://localhost:3000/api/v1`. Health check: `GET /health`.

### 5. Testing & kualitas kode

```bash
pnpm test         # unit test (vitest)
pnpm lint
pnpm format
```

Ringkasan endpoint tersedia di [`docs/api.md`](./docs/api.md).

## Kontribusi

Panduan kontribusi tersedia di `CONTRIBUTING.md`.
