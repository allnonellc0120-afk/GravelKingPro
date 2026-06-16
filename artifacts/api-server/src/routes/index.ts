import { Router, type IRouter } from "express";
import healthRouter from "./health";
import kernelRouter from "./kernel";
import audioRouter from "./audio";
import studioRouter from "./studio-mix";
import masterRouter from "./master";
import stripeRouter from "./stripe";
import authRouter from "./auth";
import historyRouter from "./history";
import downloadRouter from "./download";
import beatsRouter from "./beats";
import waitlistRouter from "./waitlist";
import analyticsRouter from "./analytics";
import mlkRouter from "./mlk";
import adminAuthRouter from "./adminAuth";

const router: IRouter = Router();

router.use(adminAuthRouter);
router.use(authRouter);
router.use(healthRouter);
router.use(kernelRouter);
router.use(audioRouter);
router.use(studioRouter);
router.use(masterRouter);
router.use(stripeRouter);
router.use(historyRouter);
router.use(downloadRouter);
router.use(beatsRouter);
router.use(waitlistRouter);
router.use(analyticsRouter);
router.use(mlkRouter);

export default router;
