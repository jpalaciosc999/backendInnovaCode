import { Router } from "express";
import {
  getSuspensionesIgss,
  getSuspensionIgssById,
  createSuspensionIgss,
  updateSuspensionIgss,
  deleteSuspensionIgss
} from "./suspensionIgss.controller.js";

const router = Router();

router.get("/", getSuspensionesIgss);
router.get("/:id", getSuspensionIgssById);
router.post("/", createSuspensionIgss);
router.put("/:id", updateSuspensionIgss);
router.delete("/:id", deleteSuspensionIgss);

export default router;
