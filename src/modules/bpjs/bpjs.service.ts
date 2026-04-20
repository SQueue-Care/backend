import { NotFoundError } from "../../utils/errors";

/**
 * Mock layanan BPJS — sesuai batasan proyek (MVP + dummy data).
 * Siap diganti dengan integrasi nyata di kemudian hari tanpa ubah kontrak.
 */
export interface BpjsVerification {
  nik: string;
  bpjsNumber: string;
  name: string;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  tier: "I" | "II" | "III";
  lastPayment: string;
  facilityTk1: string;
}

const MOCK_DATA: Record<string, BpjsVerification> = {
  "3201010101010001": {
    nik: "3201010101010001",
    bpjsNumber: "0001234567890",
    name: "Andi Wijaya",
    status: "ACTIVE",
    tier: "II",
    lastPayment: "2026-03-28",
    facilityTk1: "Puskesmas Cibinong",
  },
  "3201010202020002": {
    nik: "3201010202020002",
    bpjsNumber: "0001234567891",
    name: "Siti Rahma",
    status: "ACTIVE",
    tier: "III",
    lastPayment: "2026-04-01",
    facilityTk1: "Puskesmas Bogor Tengah",
  },
  "3201010303030003": {
    nik: "3201010303030003",
    bpjsNumber: "0001234567892",
    name: "Rudi Hermawan",
    status: "INACTIVE",
    tier: "III",
    lastPayment: "2025-11-10",
    facilityTk1: "Puskesmas Depok",
  },
};

export function verifyByNik(nik: string): BpjsVerification {
  const record = MOCK_DATA[nik];
  if (!record) throw new NotFoundError(`BPJS record not found for NIK ${nik}`);
  return record;
}
