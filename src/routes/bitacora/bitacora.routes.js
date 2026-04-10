import { Router } from "express";
import {
  getBitacora,
  getBitacoraById,
  createBitacora,
  updateBitacora,
  deleteBitacora
} from "./bitacora.controller.js";

const router = Router();

router.get("/", getBitacora);
router.get("/:id", getBitacoraById);
router.post("/", createBitacora);
router.put("/:id", updateBitacora);
router.delete("/:id", deleteBitacora);

export default router;