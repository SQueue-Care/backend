import { BillStatus, QueueStatus, VisitStage } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildVisitFlow, resolveEffectiveVisitStage } from "../../src/modules/queues/visit-flow";

const dept = {
  name: "Poli Umum",
  building: "Gedung A Lantai 2",
  waitingRoomName: "Ruang Tunggu Poli Umum",
  examinationRoom: "Ruang 201",
  adminCounter: "Kasir Administrasi Lantai 1",
  pharmacyLocation: "Apotek RS Lantai 1",
};

describe("visit-flow", () => {
  it("maps WAITING queue to waiting stage with room hint", () => {
    const flow = buildVisitFlow(
      {
        status: QueueStatus.WAITING,
        currentVisitStage: VisitStage.WAITING,
        pharmacyRequired: false,
        pharmacyCompletedAt: null,
        visitCompletedAt: null,
        doctorMedicationInstructions: null,
        bill: null,
      },
      dept,
    );

    expect(flow.currentStage).toBe(VisitStage.WAITING);
    expect(flow.nextDestination?.instruction).toContain("Ruang Tunggu Poli Umum");
  });

  it("directs to admin after examination done", () => {
    const flow = buildVisitFlow(
      {
        status: QueueStatus.DONE,
        currentVisitStage: VisitStage.ADMIN,
        pharmacyRequired: false,
        pharmacyCompletedAt: null,
        visitCompletedAt: null,
        doctorMedicationInstructions: null,
        bill: { status: BillStatus.PENDING },
      },
      dept,
    );

    expect(flow.currentStage).toBe(VisitStage.ADMIN);
    expect(flow.nextDestination?.icon).toBe("cashier");
    expect(flow.nextDestination?.instruction).toContain("Kasir Administrasi Lantai 1");
  });

  it("advances to pharmacy after paid bill when medication required", () => {
    const stage = resolveEffectiveVisitStage({
      status: QueueStatus.DONE,
      currentVisitStage: VisitStage.ADMIN,
      pharmacyRequired: true,
      pharmacyCompletedAt: null,
      visitCompletedAt: null,
      doctorMedicationInstructions: "Paracetamol 3x1",
      bill: { status: BillStatus.PAID },
    });

    expect(stage).toBe(VisitStage.PHARMACY);
  });

  it("completes visit when paid and no pharmacy", () => {
    const stage = resolveEffectiveVisitStage({
      status: QueueStatus.DONE,
      currentVisitStage: VisitStage.ADMIN,
      pharmacyRequired: false,
      pharmacyCompletedAt: null,
      visitCompletedAt: null,
      doctorMedicationInstructions: null,
      bill: { status: BillStatus.PAID },
    });

    expect(stage).toBe(VisitStage.COMPLETE);
  });
});
