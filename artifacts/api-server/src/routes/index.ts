import { Router, type IRouter } from "express";
import healthRouter from "./health";
import kernelRouter from "./kernel";
import audioRouter from "./audio";
import stripeRouter from "./stripe";

const router: IRouter = Router();

router.use(healthRouter);
router.use(kernelRouter);
router.use(audioRouter);
router.use(stripeRouter);

export default router;
