import { Router } from "express";
import {
  getEmpleadoContratos,
  getEmpleadoContratoById,
  createEmpleadoContrato,
  updateEmpleadoContrato,
  deleteEmpleadoContrato
} from "./empleadoContrato.controller.js";

const router = Router();

router.get("/", getEmpleadoContratos);
router.get("/:id", getEmpleadoContratoById);
router.post("/", createEmpleadoContrato);
router.put("/:id", updateEmpleadoContrato);
router.delete("/:id", deleteEmpleadoContrato);

export default router;