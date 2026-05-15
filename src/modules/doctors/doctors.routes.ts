import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { authorize } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { ApiResponse } from "../../utils/api-response";
import { asyncHandler, getParam } from "../../utils/async-handler";
import { paginationQuerySchema } from "../../utils/pagination";
import { createDoctorSchema, doctorIdParamSchema, updateDoctorSchema } from "./doctors.schema";
import * as service from "./doctors.service";

const router: Router = Router();

router.get(
  "/",
  validate({ query: paginationQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = paginationQuerySchema.parse(req.query);
    const { items, pagination } = await service.listDoctors(query);
    res.json(ApiResponse.paginated(items, pagination));
  }),
);

router.get(
  "/:id",
  validate({ params: doctorIdParamSchema }),
  asyncHandler(async (req, res) => {
    const doctor = await service.getDoctor(getParam(req, "id"));
    res.json(ApiResponse.success(doctor));
  }),
);

router.get(
  "/:id/schedules",
  validate({ params: doctorIdParamSchema }),
  asyncHandler(async (req, res) => {
    const schedules = await service.getDoctorSchedules(getParam(req, "id"));
    res.json(ApiResponse.success(schedules));
  }),
);

router.get(
  "/:id/appointments",
  authenticate,
  validate({ params: doctorIdParamSchema }),
  asyncHandler(async (req, res) => {
    const appointments = await service.getDoctorAppointments(getParam(req, "id"));
    res.json(ApiResponse.success(appointments));
  }),
);

router.post(
  "/",
  authenticate,
  authorize(Role.ADMIN),
  validate({ body: createDoctorSchema }),
  asyncHandler(async (req, res) => {
    const doctor = await service.createDoctor(req.body);
    res.status(201).json(ApiResponse.success(doctor));
  }),
);

router.patch(
  "/:id",
  authenticate,
  authorize(Role.ADMIN, Role.DOCTOR),
  validate({ params: doctorIdParamSchema, body: updateDoctorSchema }),
  asyncHandler(async (req, res) => {
    const doctor = await service.updateDoctor(getParam(req, "id"), req.body);
    res.json(ApiResponse.success(doctor));
  }),
);

router.delete(
  "/:id",
  authenticate,
  authorize(Role.ADMIN),
  validate({ params: doctorIdParamSchema }),
  asyncHandler(async (req, res) => {
    await service.deleteDoctor(getParam(req, "id"));
    res.status(204).send();
  }),
);

export default router;
