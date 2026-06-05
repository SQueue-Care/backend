import { describe, it, expect } from "vitest";
import { mapDepartmentName } from "../../src/modules/predictions/department-name-mapper";

describe("mapDepartmentName", () => {
  it("maps departments to SmartQueue API v5 nama_poli values", () => {
    expect(mapDepartmentName("Poli Anak")).toBe("anak");
    expect(mapDepartmentName("Gigi dan Mulut")).toBe("gigi");
    expect(mapDepartmentName("Kardiologi")).toBe("jantung");
    expect(mapDepartmentName("Kebidanan")).toBe("kandungan");
    expect(mapDepartmentName("Penyakit Dalam")).toBe("penyakit dalam");
    expect(mapDepartmentName("Poli Umum")).toBe("umum");
  });

  it("falls back to umum for unknown or unsupported specialties", () => {
    expect(mapDepartmentName("Oftalmologi")).toBe("umum");
    expect(mapDepartmentName("Unknown Dept")).toBe("umum");
  });
});
