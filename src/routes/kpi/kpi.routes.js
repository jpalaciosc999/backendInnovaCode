import express from "express";
import {
  getKpis,
  getKpiById,
  createKpi,
  updateKpi,
  deleteKpi
} from "./kpi.controller.js";

const router = express.Router();

router.get("/", getKpis);
router.get("/:id", getKpiById);
router.post("/", createKpi);
router.put("/:id", updateKpi);
router.delete("/:id", deleteKpi);

export default router;