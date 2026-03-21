import { Router } from "express"; //para manejar rutas
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

export default router;