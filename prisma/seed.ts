/* eslint-disable no-console */
import { DayOfWeek, Gender, PrismaClient, QueueStatus, Role } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  const passwordHash = await bcrypt.hash("password123", 10);

  // Departments (poliklinik)
  const deptData = [
    { code: "UMUM", name: "Poli Umum", description: "Pemeriksaan umum" },
    { code: "ANAK", name: "Poli Anak", description: "Pemeriksaan anak" },
    { code: "GIGI", name: "Poli Gigi", description: "Pemeriksaan gigi" },
    { code: "INTERNA", name: "Poli Penyakit Dalam", description: "Spesialis penyakit dalam" },
  ];
  const departments = await Promise.all(
    deptData.map((d) =>
      prisma.department.upsert({ where: { code: d.code }, update: {}, create: d }),
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
    },
    {
      email: "pasien2@test.com",
      name: "Siti Rahma",
      nik: "3201010202020002",
      gender: Gender.FEMALE,
    },
    {
      email: "pasien3@test.com",
      name: "Rudi Hermawan",
      nik: "3201010303030003",
      gender: Gender.MALE,
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

  // Sample queues untuk poli Umum hari ini
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const umumDoctor = doctors.find((d) => d.departmentId === deptMap.UMUM!.id)!;
  const existingCount = await prisma.queue.count({
    where: { departmentId: deptMap.UMUM!.id, queueDate: today },
  });

  if (existingCount === 0) {
    for (let i = 0; i < 3; i++) {
      await prisma.queue.create({
        data: {
          patientId: patients[i]!.id,
          departmentId: deptMap.UMUM!.id,
          doctorId: umumDoctor.id,
          queueNumber: i + 1,
          queueDate: today,
          status: i === 0 ? QueueStatus.IN_PROGRESS : QueueStatus.WAITING,
          estimatedWaitMinutes: (i + 1) * umumDoctor.avgServiceMin,
        },
      });
    }
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

  console.log("Seed selesai:");
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
