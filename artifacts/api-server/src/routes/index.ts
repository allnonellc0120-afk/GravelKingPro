import { Router, type IRouter } from "express";
import healthRouter from "./health";
import kernelRouter from "./kernel";
import audioRouter from "./audio";
import studioRouter from "./studio-mix";
import stripeRouter from "./stripe";
import authRouter from "./auth";
import historyRouter from "./history";

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
router.use(kernelRouter);
router.use(audioRouter);
router.use(studioRouter);
router.use(stripeRouter);
router.use(historyRouter);

export default router;
