import { Router } from "express";
import {
  getBitacoras,
  getBitacoraById,
  createBitacora,
  updateBitacora,
  deleteBitacora
} from "./bitacoras.controller.js";

const router = Router();

router.get("/", getBitacoras);
router.get("/:id", getBitacoraById);
router.post("/", createBitacora);
router.put("/:id", updateBitacora);
router.delete("/:id", deleteBitacora);

export default router;