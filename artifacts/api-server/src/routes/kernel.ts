import { Router } from "express";
import { gravelking_opt, verifyParity, generateSeedData } from "../kernel";

const kernelRouter = Router();

kernelRouter.post("/kernel/process", (req, res) => {
  try {
    const { input_data, multiplier, slice_size } = req.body;

    const data: number[] = Array.isArray(input_data) && input_data.length > 0
      ? input_data
      : generateSeedData(20);

    const result = gravelking_opt(data, multiplier, slice_size);
    const status = verifyParity(result.processed);

    res.status(200).json({
      success: true,
      status,
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export default kernelRouter;
