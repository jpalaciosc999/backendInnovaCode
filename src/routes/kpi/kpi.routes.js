import { Router } from "express";
import {
  getKpis,
  getKpiById,
  createKpi,
  updateKpi,
  deleteKpi
} from "./kpi.controller.js"; // El "./" significa "aquí mismo"

const router = Router();

router.get("/", getKpis);
router.get("/:id", getKpiById);
router.post("/", createKpi);
router.put("/:id", updateKpi);
router.delete("/:id", deleteKpi);

export default router;