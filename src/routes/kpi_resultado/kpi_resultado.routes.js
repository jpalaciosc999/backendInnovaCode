import { Router } from "express";
import {
  getKpiResultados,
  getKpiResultadoById,
  createKpiResultado,
  updateKpiResultado,
  deleteKpiResultado
} from "./kpi_resultado.controller.js"; // Verifica que la ruta al archivo sea correcta

const router = Router();

router.get("/", getKpiResultados);
router.get("/:id", getKpiResultadoById);
router.post("/", createKpiResultado);
router.put("/:id", updateKpiResultado);
router.delete("/:id", deleteKpiResultado);

export default router;