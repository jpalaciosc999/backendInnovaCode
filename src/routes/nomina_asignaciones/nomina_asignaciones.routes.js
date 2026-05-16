import { Router } from "express";
import {
  getNominaAsignaciones,
  getNominaAsignacionById,
  createNominaAsignacion,
  updateNominaAsignacion,
  deleteNominaAsignacion
} from "./nomina_asignaciones.controller.js";

const router = Router();

router.get("/", getNominaAsignaciones);
router.get("/:id", getNominaAsignacionById);
router.post("/", createNominaAsignacion);
router.put("/:id", updateNominaAsignacion);
router.delete("/:id", deleteNominaAsignacion);

export default router;
