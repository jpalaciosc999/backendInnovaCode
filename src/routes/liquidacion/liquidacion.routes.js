import express from "express";
import {
  getLiquidaciones,
  getLiquidacionById,
  createLiquidacion,
  updateLiquidacion,
  deleteLiquidacion
} from "../controllers/liquidacion.controller.js";

const router = express.Router();

router.get("/", getLiquidaciones);
router.get("/:id", getLiquidacionById);
router.post("/", createLiquidacion);
router.put("/:id", updateLiquidacion);
router.delete("/:id", deleteLiquidacion);

export default router;