/* eslint-disable no-console */
import {
  AnnouncementCategory,
  AnnouncementPriority,
  BillStatus,
  DayOfWeek,
  Gender,
  PaymentType,
  PrismaClient,
  QueueStatus,
  Role,
  TargetRole,
} from "@prisma/client";
import bcrypt from "bcrypt";
import { seedDemoData } from "./seed-demo";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  const passwordHash = await bcrypt.hash("password123", 10);

  // Departments (poliklinik)
  const deptData = [
    {
      code: "UMUM",
      name: "Poli Umum",
      description: "Pemeriksaan umum",
      building: "Gedung A Lantai 2",
      waitingRoomName: "Ruang Tunggu Poli Umum",
      examinationRoom: "Ruang 201–203",
      adminCounter: "Kasir Administrasi Gedung A Lantai 1",
      pharmacyLocation: "Apotek RS Gedung A Lantai 1",
    },
    {
      code: "ANAK",
      name: "Poli Anak",
      description: "Pemeriksaan anak",
      building: "Gedung A Lantai 2",
      waitingRoomName: "Ruang Tunggu Poli Anak",
      examinationRoom: "Ruang 205",
      adminCounter: "Kasir Administrasi Gedung A Lantai 1",
      pharmacyLocation: "Apotek RS Gedung A Lantai 1",
    },
    {
      code: "GIGI",
      name: "Poli Gigi",
      description: "Pemeriksaan gigi",
      building: "Gedung B Lantai 1",
      waitingRoomName: "Ruang Tunggu Poli Gigi",
      examinationRoom: "Ruang Gigi 101",
      adminCounter: "Kasir Administrasi Gedung B Lantai 1",
      pharmacyLocation: "Apotek RS Gedung A Lantai 1",
    },
    {
      code: "INTERNA",
      name: "Poli Penyakit Dalam",
      description: "Spesialis penyakit dalam",
      building: "Gedung A Lantai 3",
      waitingRoomName: "Ruang Tunggu Poli Penyakit Dalam",
      examinationRoom: "Ruang 301",
      adminCounter: "Kasir Administrasi Gedung A Lantai 1",
      pharmacyLocation: "Apotek RS Gedung A Lantai 1",
    },
  ];
  const departments = await Promise.all(
    deptData.map((d) =>
      prisma.department.upsert({ where: { code: d.code }, update: d, create: d }),
    ),
  );
  const deptMap = Object.fromEntries(departments.map((d) => [d.code, d]));

  // Admin
  await prisma.user.upsert({
    where: { email: "admin@hospital.test" },
    update: {},
    create: {
      email: "admin@hospital.test",
      name: "Admin Utama",
      role: Role.ADMIN,
      passwordHash,
    },
  });

  // Doctors
  const doctorsSeed = [
    {
      email: "dr.budi@hospital.test",
      name: "dr. Budi Santoso",
      spec: "Dokter Umum",
      dept: "UMUM",
      avg: 8,
    },
    {
      email: "dr.sari@hospital.test",
      name: "dr. Sari Wulandari",
      spec: "Dokter Anak",
      dept: "ANAK",
      avg: 12,
    },
    {
      email: "dr.andi@hospital.test",
      name: "drg. Andi Pratama",
      spec: "Dokter Gigi",
      dept: "GIGI",
      avg: 20,
    },
    {
      email: "dr.maya@hospital.test",
      name: "dr. Maya Kusuma, SpPD",
      spec: "Penyakit Dalam",
      dept: "INTERNA",
      avg: 15,
    },
  ];

  const doctors = [] as Awaited<ReturnType<typeof prisma.doctor.create>>[];
  for (const d of doctorsSeed) {
    const user = await prisma.user.upsert({
      where: { email: d.email },
      update: {},
      create: { email: d.email, name: d.name, role: Role.DOCTOR, passwordHash },
    });
    const doctor = await prisma.doctor.upsert({
      where: { userId: user.id },
      update: { avgServiceMin: d.avg },
      create: {
        userId: user.id,
        specialization: d.spec,
        departmentId: deptMap[d.dept]!.id,
        avgServiceMin: d.avg,
      },
    });
    doctors.push(doctor);
  }

  // Patients
  const patientsSeed = [
    {
      email: "pasien1@test.com",
      name: "Andi Wijaya",
      nik: "3201010101010001",
      gender: Gender.MALE,
      birthDate: new Date("1990-03-15"),
      bloodType: "O",
      allergies: "Penisilin",
    },
    {
      email: "pasien2@test.com",
      name: "Siti Rahma",
      nik: "3201010202020002",
      gender: Gender.FEMALE,
      birthDate: new Date("1985-07-22"),
      bloodType: "A",
      allergies: null,
    },
    {
      email: "pasien3@test.com",
      name: "Rudi Hermawan",
      nik: "3201010303030003",
      gender: Gender.MALE,
      birthDate: new Date("1978-11-08"),
      bloodType: "B",
      allergies: "Udang, sulfa",
    },
  ];
  const patients = [] as Awaited<ReturnType<typeof prisma.patient.create>>[];
  for (const p of patientsSeed) {
    const user = await prisma.user.upsert({
      where: { email: p.email },
      update: {},
      create: { email: p.email, name: p.name, role: Role.PATIENT, passwordHash },
    });
    const patient = await prisma.patient.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        nik: p.nik,
        gender: p.gender,
        birthDate: p.birthDate,
        bloodType: p.bloodType,
        allergies: p.allergies,
        bpjsNumber: `000${Math.floor(1000000 + Math.random() * 9000000)}`,
        phone: `0812${Math.floor(10000000 + Math.random() * 89999999)}`,
      },
    });
    patients.push(patient);
  }

  // Schedules (Senin-Jumat 08:00-14:00)
  const weekdays: DayOfWeek[] = [
    DayOfWeek.MONDAY,
    DayOfWeek.TUESDAY,
    DayOfWeek.WEDNESDAY,
    DayOfWeek.THURSDAY,
    DayOfWeek.FRIDAY,
  ];
  for (const doctor of doctors) {
    for (const day of weekdays) {
      await prisma.schedule.upsert({
        where: {
          // composite unique tidak di-define, kita pakai findFirst + conditional create
          id: `${doctor.id}_${day}`,
        },
        update: {},
        create: {
          id: `${doctor.id}_${day}`,
          doctorId: doctor.id,
          departmentId: doctor.departmentId!,
          dayOfWeek: day,
          startTime: "08:00",
          endTime: "14:00",
          capacity: 30,
        },
      });
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const umumDoctor = doctors.find((d) => d.departmentId === deptMap.UMUM!.id)!;

  // Sample completed visit + bills for demo (outside May 24–27 window)
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const doneQueue = await prisma.queue.findFirst({
    where: { patientId: patients[0]!.id, status: QueueStatus.DONE },
  });

  if (!doneQueue) {
    const completedQueue = await prisma.queue.create({
      data: {
        patientId: patients[0]!.id,
        departmentId: deptMap.UMUM!.id,
        doctorId: umumDoctor.id,
        queueNumber: 99,
        queueDate: yesterday,
        status: QueueStatus.DONE,
        finishedAt: yesterday,
        doctorDiagnosis: "Demam ringan, istirahat cukup",
      },
    });

    const consultationFee = 50_000;
    const adminFee = 10_000;
    const totalAmount = consultationFee + adminFee;

    await prisma.bill.create({
      data: {
        patientId: patients[0]!.id,
        queueId: completedQueue.id,
        paymentType: PaymentType.BPJS,
        status: BillStatus.BPJS_PENDING,
        totalAmount,
        patientShare: 0,
        bpjsNumber: patients[0]!.bpjsNumber,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        notes:
          "Tagihan ini diverifikasi oleh administrasi. Peserta BPJS biasanya tidak membayar penuh di kasir.",
        lineItems: {
          create: [
            {
              description: "Konsultasi Poli Umum (Ditanggung BPJS)",
              quantity: 1,
              unitPrice: consultationFee,
              amount: consultationFee,
            },
            {
              description: "Biaya administrasi",
              quantity: 1,
              unitPrice: adminFee,
              amount: adminFee,
            },
          ],
        },
      },
    });

    const umumPatient = patients[1]!;
    const umumQueue = await prisma.queue.create({
      data: {
        patientId: umumPatient.id,
        departmentId: deptMap.ANAK!.id,
        doctorId: doctors.find((d) => d.departmentId === deptMap.ANAK!.id)!.id,
        queueNumber: 98,
        queueDate: yesterday,
        status: QueueStatus.DONE,
        finishedAt: yesterday,
      },
    });

    await prisma.bill.create({
      data: {
        patientId: umumPatient.id,
        queueId: umumQueue.id,
        paymentType: PaymentType.UMUM,
        status: BillStatus.PENDING,
        totalAmount,
        patientShare: totalAmount,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        notes: "Silakan lakukan pembayaran di loket kasir sebelum batas jatuh tempo.",
        lineItems: {
          create: [
            {
              description: "Konsultasi Poli Anak",
              quantity: 1,
              unitPrice: consultationFee,
              amount: consultationFee,
            },
            {
              description: "Biaya administrasi",
              quantity: 1,
              unitPrice: adminFee,
              amount: adminFee,
            },
          ],
        },
      },
    });
  }

  // Symptoms master data
  const symptomsSeed = [
    { code: "fever", label: "Demam" },
    { code: "cough", label: "Batuk" },
    { code: "sore_throat", label: "Nyeri tenggorokan" },
    { code: "runny_nose", label: "Pilek" },
    { code: "headache", label: "Sakit kepala" },
    { code: "nausea", label: "Mual" },
    { code: "diarrhea", label: "Diare" },
    { code: "chest_pain", label: "Nyeri dada" },
    { code: "shortness_of_breath", label: "Sesak napas" },
    { code: "fatigue", label: "Lelah" },
    { code: "rash", label: "Ruam kulit" },
    { code: "abdominal_pain", label: "Nyeri perut" },
  ];
  for (const s of symptomsSeed) {
    await prisma.symptom.upsert({
      where: { code: s.code },
      update: {},
      create: s,
    });
  }

  // Sample announcements
  const announcementsSeed = [
    {
      title: "Jam operasional hari libur nasional",
      body: "Pada tanggal merah, layanan poliklinik non-gawat darurat beroperasi hingga pukul 12.00 WIB. IGD tetap buka 24 jam.",
      category: AnnouncementCategory.INFO,
      priority: AnnouncementPriority.NORMAL,
      targetRole: TargetRole.ALL,
    },
    {
      title: "Pemeliharaan sistem antrean",
      body: "Sistem antrean online dapat lambat pada 22.00–23.00 WIB karena pemeliharaan rutin. Silakan datang lebih awal jika memungkinkan.",
      category: AnnouncementCategory.SERVICE,
      priority: AnnouncementPriority.NORMAL,
      targetRole: TargetRole.PATIENT,
    },
    {
      title: "Wajib check-in reservasi",
      body: "Reservasi yang tidak di-check-in hingga 30 menit setelah jadwal dapat dibatalkan otomatis dan nomor antrean tidak diterbitkan.",
      category: AnnouncementCategory.WARNING,
      priority: AnnouncementPriority.HIGH,
      targetRole: TargetRole.PATIENT,
    },
  ];

  for (const a of announcementsSeed) {
    const existing = await prisma.announcement.findFirst({ where: { title: a.title } });
    if (!existing) {
      await prisma.announcement.create({ data: a });
    }
  }

  const schedules = await prisma.schedule.findMany({
    select: { id: true, doctorId: true, departmentId: true, dayOfWeek: true },
  });

  await seedDemoData(prisma, {
    patients,
    doctors,
    departments: departments.map((d) => ({ id: d.id, code: d.code })),
    schedules,
  });

  console.log("\nSeed selesai:");
  console.log(`- Admin login: admin@hospital.test / password123`);
  console.log(`- Dokter: dr.budi@hospital.test / password123`);
  console.log(`- Pasien: pasien1@test.com / password123`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
