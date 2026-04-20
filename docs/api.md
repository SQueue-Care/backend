# API Reference (ringkas)

Base URL: `/api/v1`  
Format respons seragam: `{ status: "success" | "error", data?, error?, meta? }`.  
Auth: `Authorization: Bearer <accessToken>` untuk endpoint yang ditandai 🔒.

## Auth

| Method | Path             | Auth | Deskripsi                                         |
| ------ | ---------------- | ---- | ------------------------------------------------- |
| POST   | `/auth/register` |      | Registrasi user baru (default role `PATIENT`).    |
| POST   | `/auth/login`    |      | Login dengan email + password → access & refresh. |
| POST   | `/auth/refresh`  |      | Tukar refresh token → access token baru.          |
| POST   | `/auth/logout`   |      | Revoke refresh token.                             |
| GET    | `/auth/me`       | 🔒   | Profil user yang login (+ profil pasien/dokter).  |

## Users (admin)

| Method | Path         | Auth     | Deskripsi             |
| ------ | ------------ | -------- | --------------------- |
| GET    | `/users`     | 🔒 admin | List user paginated.  |
| GET    | `/users/:id` | 🔒 admin | Detail user.          |
| PATCH  | `/users/:id` | 🔒 admin | Update role/active.   |
| DELETE | `/users/:id` | 🔒 admin | Hapus user (cascade). |

## Patients

| Method | Path                   | Auth             | Deskripsi                      |
| ------ | ---------------------- | ---------------- | ------------------------------ |
| GET    | `/patients`            | 🔒 admin/doctor  | List pasien.                   |
| POST   | `/patients`            | 🔒 admin         | Buat pasien beserta akun user. |
| GET    | `/patients/:id`        | 🔒               | Detail pasien.                 |
| PATCH  | `/patients/:id`        | 🔒 admin/patient | Update profil pasien.          |
| DELETE | `/patients/:id`        | 🔒 admin         | Hapus pasien.                  |
| GET    | `/patients/:id/queues` | 🔒               | Riwayat antrian pasien.        |

## Doctors

| Method | Path                     | Auth            | Deskripsi                |
| ------ | ------------------------ | --------------- | ------------------------ |
| GET    | `/doctors`               |                 | List dokter.             |
| GET    | `/doctors/:id`           |                 | Detail dokter.           |
| GET    | `/doctors/:id/schedules` |                 | Jadwal praktik dokter.   |
| POST   | `/doctors`               | 🔒 admin        | Buat dokter + akun user. |
| PATCH  | `/doctors/:id`           | 🔒 admin/doctor | Update profil dokter.    |
| DELETE | `/doctors/:id`           | 🔒 admin        | Hapus dokter.            |

## Departments (poliklinik)

| Method | Path               | Auth     | Deskripsi                |
| ------ | ------------------ | -------- | ------------------------ |
| GET    | `/departments`     |          | List poliklinik.         |
| GET    | `/departments/:id` |          | Detail poli + dokternya. |
| POST   | `/departments`     | 🔒 admin | Buat poliklinik.         |
| PATCH  | `/departments/:id` | 🔒 admin | Update info poliklinik.  |
| DELETE | `/departments/:id` | 🔒 admin | Hapus poliklinik.        |

## Schedules (jadwal praktik)

| Method | Path             | Auth            | Deskripsi                                        |
| ------ | ---------------- | --------------- | ------------------------------------------------ |
| GET    | `/schedules`     |                 | Filter: `doctorId`, `departmentId`, `dayOfWeek`. |
| GET    | `/schedules/:id` |                 | Detail jadwal.                                   |
| POST   | `/schedules`     | 🔒 admin/doctor | Buat jadwal (validasi `startTime < endTime`).    |
| PATCH  | `/schedules/:id` | 🔒 admin/doctor | Update jadwal.                                   |
| DELETE | `/schedules/:id` | 🔒 admin        | Hapus jadwal.                                    |

## Queues (antrian)

| Method | Path                     | Auth            | Deskripsi                                                     |
| ------ | ------------------------ | --------------- | ------------------------------------------------------------- |
| POST   | `/queues`                | 🔒              | Ambil antrian (auto `queueNumber` + estimasi waktu tunggu).   |
| GET    | `/queues`                | 🔒 admin/doctor | List antrian (filter `departmentId`, `date`, `status`, dll.). |
| GET    | `/queues/stats/overview` | 🔒 admin/doctor | Statistik beban per poli per tanggal.                         |
| GET    | `/queues/:id`            | 🔒              | Tracking status & ETA.                                        |
| PATCH  | `/queues/:id/status`     | 🔒 admin/doctor | Update status (WAITING → CALLED → IN_PROGRESS → DONE, dsb).   |
| POST   | `/queues/:id/cancel`     | 🔒              | Batalkan antrian (patient hanya untuk miliknya).              |

Transisi status yang diizinkan (state machine):

- `WAITING` → `CALLED`, `SKIPPED`, `CANCELLED`
- `CALLED` → `IN_PROGRESS`, `SKIPPED`, `CANCELLED`, `WAITING`
- `IN_PROGRESS` → `DONE`, `SKIPPED`
- `SKIPPED` → `WAITING`
- `DONE` / `CANCELLED` → final

## Appointments

| Method | Path                | Auth            | Deskripsi             |
| ------ | ------------------- | --------------- | --------------------- |
| GET    | `/appointments`     | 🔒 admin/doctor | List appointment.     |
| GET    | `/appointments/:id` | 🔒              | Detail appointment.   |
| POST   | `/appointments`     | 🔒              | Buat appointment.     |
| PATCH  | `/appointments/:id` | 🔒 admin/doctor | Update status/jadwal. |
| DELETE | `/appointments/:id` | 🔒 admin        | Hapus appointment.    |

## Predictions

| Method | Path                     | Auth | Deskripsi                                                |
| ------ | ------------------------ | ---- | -------------------------------------------------------- |
| GET    | `/predictions/wait-time` | 🔒   | Query `departmentId`, optional `doctorId`, `scheduleId`. |

Fallback heuristik dipakai otomatis ketika `ML_SERVICE_URL` kosong atau ML service error. Respons menyertakan `source: "ml" \| "heuristic"`.

## CDSS (rule-based, MVP)

| Method | Path                       | Auth            | Deskripsi                                                                |
| ------ | -------------------------- | --------------- | ------------------------------------------------------------------------ |
| GET    | `/cdss/symptoms`           | 🔒              | Master data gejala.                                                      |
| POST   | `/cdss/recommend`          | 🔒 doctor/admin | Input `{ symptoms: string[], patientId?, doctorId? }` → top-N diagnosis. |
| GET    | `/cdss/history/:patientId` | 🔒 doctor/admin | Riwayat rekomendasi CDSS untuk pasien.                                   |

Catatan: Hasil CDSS adalah **rekomendasi awal**, bukan diagnosis final. Keputusan medis tetap pada dokter.

## BPJS (mock)

| Method | Path                | Auth | Deskripsi                          |
| ------ | ------------------- | ---- | ---------------------------------- |
| GET    | `/bpjs/verify/:nik` | 🔒   | Verifikasi NIK → data statis mock. |

## Health

| Method | Path      | Auth | Deskripsi  |
| ------ | --------- | ---- | ---------- |
| GET    | `/health` |      | Liveness.  |
| GET    | `/ready`  |      | Readiness. |

## Error codes

| HTTP | `error.code`       | Keterangan                        |
| ---- | ------------------ | --------------------------------- |
| 400  | `VALIDATION_ERROR` | Body/query/params tidak valid.    |
| 400  | `BAD_REQUEST`      | Permintaan tidak dapat diproses.  |
| 401  | `UNAUTHORIZED`     | Token tidak ada/invalid/expired.  |
| 403  | `FORBIDDEN`        | Role tidak mencukupi.             |
| 404  | `NOT_FOUND`        | Resource tidak ditemukan.         |
| 409  | `CONFLICT`         | Bentrok data (mis. email unik).   |
| 409  | `UNIQUE_VIOLATION` | Prisma P2002 — unique constraint. |
| 429  | `RATE_LIMIT`       | Rate limit tercapai.              |
| 500  | `INTERNAL_ERROR`   | Error tak terduga.                |
