import { Router } from "express";
import {
  getPuestos,
  getPuestosConDepartamento,
  getPuestoById,
  createPuesto,
  updatePuesto,
  deletePuesto,
  deletePuestoLogico
} from "./puestos.controller.js";

const router = Router();

router.get("/", getPuestos);
router.get("/detalle", getPuestosConDepartamento);
router.get("/:id", getPuestoById);
router.post("/", createPuesto);
router.put("/:id", updatePuesto);
router.delete("/:id", deletePuesto);
router.put("/desactivar/:id", deletePuestoLogico);

export default router;