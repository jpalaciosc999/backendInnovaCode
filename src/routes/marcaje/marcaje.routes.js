import { Router } from "express";

import {
  getMarcajes,
  getMarcajeById,
  createMarcaje,
  registrarMarcaje,
  getHistorial,
  updateMarcaje,
  deleteMarcaje
} from "./marcaje.controller.js";

const router = Router();

router.post("/", createMarcaje);
router.post("/registrar", registrarMarcaje);

router.get("/", getMarcajes);
router.get("/historial", getHistorial);
router.get("/:id", getMarcajeById);

router.put("/:id", updateMarcaje);
router.delete("/:id", deleteMarcaje);

export default router;