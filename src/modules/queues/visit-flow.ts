import { BillStatus, QueueStatus, VisitStage, type Department, type Queue } from "@prisma/client";

export type VisitFlowStepStatus = "pending" | "current" | "completed" | "skipped";

export type VisitFlowStep = {
  stage: VisitStage | "TERMINAL";
  code: string;
  label: string;
  description: string;
  status: VisitFlowStepStatus;
  locationName?: string | null;
  roomName?: string | null;
  building?: string | null;
};

export type VisitNextDestination = {
  stage: VisitStage | "TERMINAL";
  label: string;
  instruction: string;
  locationName?: string | null;
  roomName?: string | null;
  building?: string | null;
  icon: "waiting" | "doctor" | "cashier" | "pharmacy" | "exit" | "info";
} | null;

export type VisitFlowPayload = {
  currentStage: VisitStage | "TERMINAL";
  steps: VisitFlowStep[];
  nextDestination: VisitNextDestination;
  summary: string;
  pharmacyRequired: boolean;
  paymentStatus: BillStatus | null;
};

type DepartmentLocations = Pick<
  Department,
  "name" | "building" | "waitingRoomName" | "examinationRoom" | "adminCounter" | "pharmacyLocation"
>;

type QueueVisitContext = Pick<
  Queue,
  | "status"
  | "currentVisitStage"
  | "pharmacyRequired"
  | "pharmacyCompletedAt"
  | "visitCompletedAt"
  | "doctorMedicationInstructions"
> & {
  bill?: { status: BillStatus } | null;
};

const DEFAULT_BUILDING = "Gedung Utama";
const DEFAULT_ADMIN = "Loket Kasir Administrasi Lantai 1";
const DEFAULT_PHARMACY = "Apotek RS Lantai 1";

function hasMedicationInstructions(notes?: string | null): boolean {
  return Boolean(notes?.trim());
}

function isBillSettled(status?: BillStatus | null): boolean {
  return status === BillStatus.PAID || status === BillStatus.WAIVED;
}

export function resolvePharmacyRequired(queue: QueueVisitContext): boolean {
  if (queue.pharmacyRequired) return true;
  return hasMedicationInstructions(queue.doctorMedicationInstructions);
}

export function resolveEffectiveVisitStage(queue: QueueVisitContext): VisitStage | "TERMINAL" {
  if (queue.status === QueueStatus.CANCELLED || queue.status === QueueStatus.SKIPPED) {
    return "TERMINAL";
  }

  if (queue.visitCompletedAt || queue.currentVisitStage === VisitStage.COMPLETE) {
    return VisitStage.COMPLETE;
  }

  if (queue.status === QueueStatus.WAITING) {
    return VisitStage.WAITING;
  }

  if (queue.status === QueueStatus.CALLED || queue.status === QueueStatus.IN_PROGRESS) {
    return VisitStage.EXAMINATION;
  }

  if (queue.status === QueueStatus.DONE) {
    const pharmacyRequired = resolvePharmacyRequired(queue);
    const billSettled = isBillSettled(queue.bill?.status ?? null);

    if (queue.pharmacyCompletedAt) {
      return VisitStage.COMPLETE;
    }

    if (billSettled && pharmacyRequired) {
      return VisitStage.PHARMACY;
    }

    if (billSettled && !pharmacyRequired) {
      return VisitStage.COMPLETE;
    }

    return VisitStage.ADMIN;
  }

  return queue.currentVisitStage;
}

function deptLocations(dept: DepartmentLocations) {
  const building = dept.building ?? DEFAULT_BUILDING;
  return {
    building,
    waitingRoom: dept.waitingRoomName ?? `Ruang Tunggu ${dept.name}`,
    examinationRoom: dept.examinationRoom ?? `Ruang Pemeriksaan ${dept.name}`,
    adminCounter: dept.adminCounter ?? DEFAULT_ADMIN,
    pharmacyLocation: dept.pharmacyLocation ?? DEFAULT_PHARMACY,
  };
}

function stepStatus(
  stepStage: VisitStage | "TERMINAL",
  effectiveStage: VisitStage | "TERMINAL",
  orderedStages: Array<VisitStage | "TERMINAL">,
): VisitFlowStepStatus {
  const stepIndex = orderedStages.indexOf(stepStage);
  const currentIndex = orderedStages.indexOf(effectiveStage);

  if (effectiveStage === "TERMINAL") {
    if (stepStage === "TERMINAL") return "current";
    if (stepStage === VisitStage.REGISTRATION) return "completed";
    return "skipped";
  }

  if (stepIndex < currentIndex) return "completed";
  if (stepIndex === currentIndex) return "current";
  return "pending";
}

function buildSummary(
  queue: QueueVisitContext,
  effectiveStage: VisitStage | "TERMINAL",
  pharmacyRequired: boolean,
): string {
  if (queue.status === QueueStatus.SKIPPED) return "Kunjungan tidak dilanjutkan.";
  if (queue.status === QueueStatus.CANCELLED) return "Kunjungan dibatalkan.";
  if (effectiveStage === VisitStage.COMPLETE) return "Kunjungan selesai. Terima kasih.";
  if (effectiveStage === VisitStage.WAITING) {
    return "Anda terdaftar. Tunggu panggilan nomor antrean di ruang tunggu poliklinik.";
  }
  if (effectiveStage === VisitStage.EXAMINATION) {
    return "Giliran Anda. Silakan menuju ruang pemeriksaan dokter.";
  }
  if (effectiveStage === VisitStage.ADMIN) {
    return "Pemeriksaan selesai. Lanjutkan ke loket administrasi untuk pembayaran.";
  }
  if (effectiveStage === VisitStage.PHARMACY) {
    return pharmacyRequired
      ? "Pembayaran selesai. Ambil obat di apotek sesuai resep dokter."
      : "Lanjutkan ke apotek jika diperlukan.";
  }
  return "Lacak perjalanan kunjungan Anda dari antrean hingga selesai.";
}

function buildNextDestination(
  effectiveStage: VisitStage | "TERMINAL",
  loc: ReturnType<typeof deptLocations>,
  queue: QueueVisitContext,
): VisitNextDestination {
  if (effectiveStage === VisitStage.COMPLETE || effectiveStage === "TERMINAL") {
    return {
      stage: effectiveStage === "TERMINAL" ? "TERMINAL" : VisitStage.COMPLETE,
      label: effectiveStage === "TERMINAL" ? "Kunjungan berakhir" : "Kunjungan selesai",
      instruction:
        effectiveStage === "TERMINAL"
          ? queue.status === QueueStatus.SKIPPED
            ? "Antrean dilewati. Hubungi petugas jika perlu bantuan."
            : "Kunjungan dibatalkan."
          : "Anda dapat meninggalkan rumah sakit. Semoga lekas sembuh.",
      icon: effectiveStage === "TERMINAL" ? "info" : "exit",
    };
  }

  if (effectiveStage === VisitStage.WAITING) {
    return {
      stage: VisitStage.WAITING,
      label: "Ruang tunggu poliklinik",
      instruction: `Silakan menunggu di ${loc.waitingRoom}`,
      locationName: loc.waitingRoom,
      building: loc.building,
      icon: "waiting",
    };
  }

  if (effectiveStage === VisitStage.EXAMINATION) {
    return {
      stage: VisitStage.EXAMINATION,
      label: loc.examinationRoom,
      instruction: `Silakan masuk ke ${loc.examinationRoom}`,
      roomName: loc.examinationRoom,
      building: loc.building,
      icon: "doctor",
    };
  }

  if (effectiveStage === VisitStage.ADMIN) {
    const billPending = queue.bill?.status === BillStatus.BPJS_PENDING;
    return {
      stage: VisitStage.ADMIN,
      label: loc.adminCounter,
      instruction: billPending
        ? `Verifikasi administrasi/BPJS di ${loc.adminCounter}`
        : `Silakan ke ${loc.adminCounter} untuk pembayaran`,
      locationName: loc.adminCounter,
      building: loc.building,
      icon: "cashier",
    };
  }

  if (effectiveStage === VisitStage.PHARMACY) {
    return {
      stage: VisitStage.PHARMACY,
      label: loc.pharmacyLocation,
      instruction: `Silakan ke ${loc.pharmacyLocation} untuk mengambil obat`,
      locationName: loc.pharmacyLocation,
      building: loc.building,
      icon: "pharmacy",
    };
  }

  return null;
}

export function buildVisitFlow(
  queue: QueueVisitContext,
  department: DepartmentLocations,
): VisitFlowPayload {
  const loc = deptLocations(department);
  const pharmacyRequired = resolvePharmacyRequired(queue);
  const effectiveStage = resolveEffectiveVisitStage(queue);
  const paymentStatus = queue.bill?.status ?? null;
  const isTerminal =
    queue.status === QueueStatus.CANCELLED || queue.status === QueueStatus.SKIPPED;

  const baseSteps: Array<Omit<VisitFlowStep, "status">> = [
    {
      stage: VisitStage.REGISTRATION,
      code: "registration",
      label: "Pendaftaran",
      description: "Tiket antrean telah diterbitkan.",
      locationName: loc.waitingRoom,
      building: loc.building,
    },
    {
      stage: VisitStage.WAITING,
      code: "waiting",
      label: "Menunggu antrean",
      description:
        effectiveStage === VisitStage.WAITING
          ? "Anda masih dalam antrean tunggu poliklinik."
          : "Tahap antrean tunggu telah dilewati.",
      locationName: loc.waitingRoom,
      building: loc.building,
    },
    {
      stage: VisitStage.EXAMINATION,
      code: "examination",
      label: "Pemeriksaan dokter",
      description:
        effectiveStage === VisitStage.EXAMINATION
          ? "Silakan masuk ke ruang pemeriksaan saat nomor Anda dipanggil."
          : effectiveStage === VisitStage.WAITING
            ? "Menunggu panggilan ke ruang dokter."
            : "Pemeriksaan dokter telah selesai.",
      roomName: loc.examinationRoom,
      building: loc.building,
    },
  ];

  if (isTerminal) {
    const terminalLabel =
      queue.status === QueueStatus.SKIPPED ? "Antrean dilewati" : "Kunjungan dibatalkan";
    const terminalDescription =
      queue.status === QueueStatus.SKIPPED
        ? "Antrean tidak dilanjutkan. Hubungi petugas jika perlu daftar ulang."
        : "Pendaftaran antrean ini telah dibatalkan.";

    const steps: VisitFlowStep[] = [
      ...baseSteps.map((step) => ({
        ...step,
        status: step.stage === VisitStage.REGISTRATION ? ("completed" as const) : ("skipped" as const),
      })),
      {
        stage: "TERMINAL",
        code: "terminal",
        label: terminalLabel,
        description: terminalDescription,
        status: "current",
      },
    ];

    return {
      currentStage: "TERMINAL",
      steps,
      nextDestination: buildNextDestination("TERMINAL", loc, queue),
      summary: buildSummary(queue, "TERMINAL", pharmacyRequired),
      pharmacyRequired,
      paymentStatus,
    };
  }

  const postExamSteps: Array<Omit<VisitFlowStep, "status">> = [
    {
      stage: VisitStage.ADMIN,
      code: "admin",
      label: "Administrasi & pembayaran",
      description:
        effectiveStage === VisitStage.ADMIN
          ? paymentStatus === BillStatus.BPJS_PENDING
            ? "Verifikasi tagihan BPJS di loket administrasi."
            : "Lakukan pembayaran di loket kasir administrasi."
          : effectiveStage === VisitStage.COMPLETE ||
              effectiveStage === VisitStage.PHARMACY
            ? "Administrasi dan pembayaran selesai."
            : "Dilakukan setelah pemeriksaan selesai.",
      locationName: loc.adminCounter,
      building: loc.building,
    },
  ];

  if (pharmacyRequired) {
    postExamSteps.push({
      stage: VisitStage.PHARMACY,
      code: "pharmacy",
      label: "Pengambilan obat (apotek)",
      description:
        effectiveStage === VisitStage.PHARMACY
          ? "Ambil obat sesuai petunjuk dokter."
          : effectiveStage === VisitStage.COMPLETE
            ? "Obat telah diambil."
            : "Dilakukan setelah pembayaran jika ada resep obat.",
      locationName: loc.pharmacyLocation,
      building: loc.building,
    });
  }

  postExamSteps.push({
    stage: VisitStage.COMPLETE,
    code: "complete",
    label: "Selesai / pulang",
    description:
      effectiveStage === VisitStage.COMPLETE
        ? "Semua tahap kunjungan telah selesai."
        : "Kunjungan selesai setelah administrasi" +
          (pharmacyRequired ? " dan pengambilan obat." : "."),
  });

  const allStepDefs = [...baseSteps, ...postExamSteps];
  const orderedStages = allStepDefs.map((s) => s.stage);

  const steps: VisitFlowStep[] = allStepDefs.map((step) => ({
    ...step,
    status: stepStatus(step.stage, effectiveStage, orderedStages),
  }));

  return {
    currentStage: effectiveStage,
    steps,
    nextDestination: buildNextDestination(effectiveStage, loc, queue),
    summary: buildSummary(queue, effectiveStage, pharmacyRequired),
    pharmacyRequired,
    paymentStatus,
  };
}

export function visitStageAfterPayment(
  queue: QueueVisitContext,
): VisitStage {
  const pharmacyRequired = resolvePharmacyRequired(queue);
  if (pharmacyRequired && !queue.pharmacyCompletedAt) {
    return VisitStage.PHARMACY;
  }
  return VisitStage.COMPLETE;
}
