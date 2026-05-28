import { Router } from "express";
import { verificarToken, requiereRolVigente } from "../../middlewares/auth.middleware.js";

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

router.use(verificarToken);
router.use(requiereRolVigente());

router.post("/", createMarcaje);
router.post("/registrar", registrarMarcaje);

router.get("/", getMarcajes);
router.get("/historial", getHistorial);
router.get("/:id", getMarcajeById);

router.put("/:id", updateMarcaje);
router.delete("/:id", deleteMarcaje);

export default router;
