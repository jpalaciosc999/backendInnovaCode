import express from "express";
import {
  getPeriodos,
  getPeriodoById,
  createPeriodo,
  updatePeriodo,
  deletePeriodo
} from "./periodo.controller.js";

const router = express.Router();

router.get("/", getPeriodos);
router.get("/:id", getPeriodoById);
router.post("/", createPeriodo);
router.put("/:id", updatePeriodo);
router.delete("/:id", deletePeriodo);

export default router;