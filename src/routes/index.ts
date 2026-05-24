import { Router } from "express";
import appointmentsRouter from "../modules/appointments/appointments.routes";
import authRouter from "../modules/auth/auth.routes";
import billsRouter from "../modules/bills/bills.routes";
import bpjsRouter from "../modules/bpjs/bpjs.routes";
import cdssRouter from "../modules/cdss/cdss.routes";
import departmentsRouter from "../modules/departments/departments.routes";
import doctorsRouter from "../modules/doctors/doctors.routes";
import patientsRouter from "../modules/patients/patients.routes";
import predictionsRouter from "../modules/predictions/predictions.routes";
import queuesRouter from "../modules/queues/queues.routes";
import schedulesRouter from "../modules/schedules/schedules.routes";
import usersRouter from "../modules/users/users.routes";
import notificationsRouter, {
  announcementsRouter,
} from "../modules/notifications/notifications.routes";

const router: Router = Router();

router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/patients", patientsRouter);
router.use("/doctors", doctorsRouter);
router.use("/departments", departmentsRouter);
router.use("/schedules", schedulesRouter);
router.use("/queues", queuesRouter);
router.use("/appointments", appointmentsRouter);
router.use("/predictions", predictionsRouter);
router.use("/cdss", cdssRouter);
router.use("/bpjs", bpjsRouter);
router.use("/bills", billsRouter);
router.use("/notifications", notificationsRouter);
router.use("/announcements", announcementsRouter);

export default router;
