import { Router } from "express";
import {
  getControles,
  getControlById,
  createControl,
  updateControl,
  deleteControl
} from "./control.controller.js";

const router = Router();

router.get("/", getControles);
router.get("/:id", getControlById);
router.post("/", createControl);
router.put("/:id", updateControl);
router.delete("/:id", deleteControl);

export default router;