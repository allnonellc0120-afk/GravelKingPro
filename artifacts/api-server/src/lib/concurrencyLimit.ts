import { Request, Response, NextFunction } from "express";

export function concurrencyLimit(max: number, message = "Server is busy. Please try again in a moment.") {
  let active = 0;
  return (_req: Request, res: Response, next: NextFunction): void => {
    if (active >= max) {
      res.status(503).json({ success: false, error: message });
      return;
    }
    active++;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        active--;
      }
    };
    res.on("finish", release);
    res.on("close", release);
    next();
  };
}
