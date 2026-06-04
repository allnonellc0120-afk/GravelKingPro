import { Router, type IRouter } from "express";
import healthRouter from "./health";
import kernelRouter from "./kernel";

const router: IRouter = Router();

router.use(healthRouter);
router.use(kernelRouter);

export default router;
