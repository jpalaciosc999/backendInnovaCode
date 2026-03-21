import { Router } from "express";
import {
  getUsuarioBitacoras,
  getUsuarioBitacoraById,
  createUsuarioBitacora,
  updateUsuarioBitacora,
  deleteUsuarioBitacora
} from "./usuarioBitacora.controller.js";

const router = Router();

router.get("/", getUsuarioBitacoras);
router.get("/:id", getUsuarioBitacoraById);
router.post("/", createUsuarioBitacora);
router.put("/:id", updateUsuarioBitacora);
router.delete("/:id", deleteUsuarioBitacora);

export default router;