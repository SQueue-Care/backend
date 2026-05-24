import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { authorize } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { ApiResponse } from "../../utils/api-response";
import { asyncHandler, getParam } from "../../utils/async-handler";
import { UnauthorizedError } from "../../utils/errors";
import { createPatientSchema, listPatientsQuerySchema, patientIdParamSchema, updatePatientSchema } from "./patients.schema";
import * as service from "./patients.service";
import * as billsService from "../bills/bills.service";

const router: Router = Router();

router.use(authenticate);

router.get(
  "/",
  authorize(Role.ADMIN, Role.DOCTOR),
  validate({ query: listPatientsQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = listPatientsQuerySchema.parse(req.query);
    const { items, pagination } = await service.listPatients(query);
    res.json(ApiResponse.paginated(items, pagination));
  }),
);

router.post(
  "/",
  authorize(Role.ADMIN),
  validate({ body: createPatientSchema }),
  asyncHandler(async (req, res) => {
    const patient = await service.createPatient(req.body);
    res.status(201).json(ApiResponse.success(patient));
  }),
);

router.get(
  "/:id/medical-profile",
  authorize(Role.DOCTOR, Role.ADMIN),
  validate({ params: patientIdParamSchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError();
    const profile = await service.getPatientMedicalProfile(getParam(req, "id"), req.user);
    res.json(ApiResponse.success(profile));
  }),
);

router.get(
  "/:id",
  validate({ params: patientIdParamSchema }),
  asyncHandler(async (req, res) => {
    const patient = await service.getPatient(getParam(req, "id"));
    res.json(ApiResponse.success(patient));
  }),
);

router.patch(
  "/:id",
  authorize(Role.ADMIN, Role.PATIENT),
  validate({ params: patientIdParamSchema, body: updatePatientSchema }),
  asyncHandler(async (req, res) => {
    const patient = await service.updatePatient(getParam(req, "id"), req.body);
    res.json(ApiResponse.success(patient));
  }),
);

router.delete(
  "/:id",
  authorize(Role.ADMIN),
  validate({ params: patientIdParamSchema }),
  asyncHandler(async (req, res) => {
    await service.deletePatient(getParam(req, "id"));
    res.status(204).send();
  }),
);

router.get(
  "/:id/queues",
  validate({ params: patientIdParamSchema }),
  asyncHandler(async (req, res) => {
    const queues = await service.getPatientQueues(getParam(req, "id"));
    res.json(ApiResponse.success(queues));
  }),
);

router.get(
  "/:id/appointments",
  validate({ params: patientIdParamSchema }),
  asyncHandler(async (req, res) => {
    const appointments = await service.getPatientAppointments(getParam(req, "id"));
    res.json(ApiResponse.success(appointments));
  }),
);

router.get(
  "/:id/bills",
  validate({ params: patientIdParamSchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError();
    const bills = await billsService.listPatientBills(getParam(req, "id"), req.user);
    res.json(ApiResponse.success(bills));
  }),
);

export default router;
