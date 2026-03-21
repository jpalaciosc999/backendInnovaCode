import express from "express";
import {
  getKpiResultados,
  getKpiResultadoById,
  createKpiResultado,
  updateKpiResultado,
  deleteKpiResultado
} from "../controllers/kpiResultado.controller.js";

const router = express.Router();

router.get("/", getKpiResultados);
router.get("/:id", getKpiResultadoById);
router.post("/", createKpiResultado);
router.put("/:id", updateKpiResultado);
router.delete("/:id", deleteKpiResultado);

export default router;